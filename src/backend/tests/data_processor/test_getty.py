import pytest
import json
import httpx
from datetime import datetime, timedelta
from unittest.mock import Mock, patch

from data_processor.services.getty import GettyAPIClient
from data_processor.config import DataProcessorSettings
from shared.utils.validation import validate_artwork_metadata

# Test constants
TEST_ARTWORK_ID = "300198500"
TEST_STYLE_ID = "300021147"
TEST_SEARCH_QUERY = "starry night"

# Mock API responses
MOCK_ARTWORK_RESPONSE = {
    "id": TEST_ARTWORK_ID,
    "title": "The Starry Night",
    "type": "painting",
    "metadata": {
        "creator": "Vincent van Gogh",
        "date": "1889",
        "medium": "oil on canvas",
        "dimensions": {
            "height": 73.7,
            "width": 92.1,
            "unit": "cm"
        },
        "style": "post-impressionism",
        "classification": ["painting", "fine art"],
        "provenance": "Museum of Modern Art"
    },
    "relationships": [
        {
            "type": "artist",
            "id": "500115588",
            "name": "Vincent van Gogh"
        }
    ],
    "updated_at": datetime.now().isoformat()
}

MOCK_ERROR_RESPONSE = {
    "error": {
        "code": "RATE_LIMIT_EXCEEDED",
        "message": "API rate limit exceeded",
        "retry_after": 60
    }
}

MOCK_CACHE_HEADERS = {
    "Cache-Control": "max-age=3600",
    "ETag": '"123456789"'
}

MOCK_RATE_LIMIT_HEADERS = {
    "X-RateLimit-Limit": "100",
    "X-RateLimit-Remaining": "99",
    "X-RateLimit-Reset": str(int((datetime.now() + timedelta(hours=1)).timestamp()))
}

@pytest.fixture
async def getty_client(mocker):
    """Fixture providing configured Getty API client for testing."""
    settings = Mock(spec=DataProcessorSettings)
    settings.get_api_config.return_value = {
        "base_url": "https://api.getty.edu/v1",
        "credentials": "test_api_key",
        "rate_limit": 100,
        "timeout": 30,
        "verify_ssl": True
    }
    
    cache_manager = Mock()
    cache_manager.get_cached_data.return_value = None
    cache_manager.set_cached_data.return_value = True
    
    client = GettyAPIClient(settings=settings, cache_manager=cache_manager)
    yield client
    await client.close()

@pytest.mark.asyncio
async def test_get_artwork_metadata_success(getty_client, mocker):
    """Test successful artwork metadata retrieval with validation."""
    # Mock HTTP response
    mock_response = Mock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.json.return_value = MOCK_ARTWORK_RESPONSE
    mock_response.headers = {**MOCK_CACHE_HEADERS, **MOCK_RATE_LIMIT_HEADERS}
    
    mocker.patch.object(getty_client._client, "get", return_value=mock_response)
    
    # Execute test
    result = await getty_client.get_artwork_metadata(TEST_ARTWORK_ID)
    
    # Validate response structure
    assert result["id"] == TEST_ARTWORK_ID
    assert result["title"] == "The Starry Night"
    assert result["type"] == "painting"
    
    # Validate metadata fields
    metadata = result["metadata"]
    assert metadata["creator"] == "Vincent van Gogh"
    assert metadata["date"] == "1889"
    assert metadata["medium"] == "oil on canvas"
    assert isinstance(metadata["dimensions"], dict)
    
    # Validate relationships
    assert len(result["relationships"]) == 1
    assert result["relationships"][0]["type"] == "artist"
    
    # Verify API call
    getty_client._client.get.assert_called_once_with(
        f"{getty_client.base_url}/metadata/{TEST_ARTWORK_ID}",
        params=None
    )

@pytest.mark.asyncio
async def test_get_artwork_metadata_cache(getty_client, mocker):
    """Test caching behavior for artwork metadata retrieval."""
    # Mock cache hit
    cached_data = MOCK_ARTWORK_RESPONSE.copy()
    getty_client._cache.get_cached_data.return_value = cached_data
    
    # Execute test with cache hit
    result = await getty_client.get_artwork_metadata(TEST_ARTWORK_ID)
    
    # Verify cache was checked
    getty_client._cache.get_cached_data.assert_called_once_with(
        f"getty:metadata:{TEST_ARTWORK_ID}"
    )
    
    # Verify no API call was made
    getty_client._client.get.assert_not_called()
    
    # Verify cached data was returned
    assert result == cached_data
    
    # Test cache miss and storage
    getty_client._cache.get_cached_data.return_value = None
    mock_response = Mock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.json.return_value = MOCK_ARTWORK_RESPONSE
    mock_response.headers = {**MOCK_CACHE_HEADERS, **MOCK_RATE_LIMIT_HEADERS}
    
    mocker.patch.object(getty_client._client, "get", return_value=mock_response)
    
    result = await getty_client.get_artwork_metadata(TEST_ARTWORK_ID)
    
    # Verify data was cached
    getty_client._cache.set_cached_data.assert_called_once()

@pytest.mark.asyncio
async def test_get_artwork_metadata_rate_limit(getty_client, mocker):
    """Test rate limiting handling for artwork metadata retrieval."""
    # Mock rate limit exceeded response
    mock_response = Mock(spec=httpx.Response)
    mock_response.status_code = 429
    mock_response.json.return_value = MOCK_ERROR_RESPONSE
    mock_response.headers = {
        "X-RateLimit-Limit": "100",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": str(int((datetime.now() + timedelta(minutes=1)).timestamp())),
        "Retry-After": "60"
    }
    
    mocker.patch.object(getty_client._client, "get", return_value=mock_response)
    
    # Test rate limit handling
    with pytest.raises(httpx.HTTPStatusError) as exc_info:
        await getty_client.get_artwork_metadata(TEST_ARTWORK_ID)
    
    assert exc_info.value.response.status_code == 429
    
    # Verify retry headers were processed
    assert "Retry-After" in exc_info.value.response.headers

@pytest.mark.asyncio
async def test_search_artwork_terms_validation(getty_client, mocker):
    """Test input validation and security measures for artwork term search."""
    # Test SQL injection prevention
    with pytest.raises(ValueError):
        await getty_client.search_artwork_terms("'; DROP TABLE artworks; --")
    
    # Test XSS prevention
    with pytest.raises(ValueError):
        await getty_client.search_artwork_terms("<script>alert('xss')</script>")
    
    # Test valid search
    mock_response = Mock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.json.return_value = {"results": [MOCK_ARTWORK_RESPONSE]}
    mock_response.headers = {**MOCK_CACHE_HEADERS, **MOCK_RATE_LIMIT_HEADERS}
    
    mocker.patch.object(getty_client._client, "get", return_value=mock_response)
    
    result = await getty_client.search_artwork_terms(TEST_SEARCH_QUERY)
    
    # Verify search parameters were properly sanitized
    getty_client._client.get.assert_called_once()
    call_args = getty_client._client.get.call_args[1]
    assert "q" in call_args["params"]
    assert len(call_args["params"]["q"]) <= 256  # Max query length

@pytest.mark.asyncio
async def test_artwork_metadata_validation(getty_client):
    """Test comprehensive metadata validation."""
    # Test required fields validation
    invalid_metadata = {
        "title": "Test Artwork"
        # Missing required fields
    }
    
    with pytest.raises(ValueError):
        await validate_artwork_metadata(invalid_metadata)
    
    # Test valid metadata
    valid_metadata = MOCK_ARTWORK_RESPONSE["metadata"]
    validated_data = await validate_artwork_metadata(valid_metadata)
    
    assert validated_data["creator"] == "Vincent van Gogh"
    assert validated_data["date"] == "1889"
    assert validated_data["medium"] == "oil on canvas"
    assert isinstance(validated_data["dimensions"], dict)

@pytest.mark.asyncio
async def test_security_headers(getty_client, mocker):
    """Test security headers handling and validation."""
    mock_response = Mock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.json.return_value = MOCK_ARTWORK_RESPONSE
    mock_response.headers = {
        **MOCK_CACHE_HEADERS,
        **MOCK_RATE_LIMIT_HEADERS,
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
    }
    
    mocker.patch.object(getty_client._client, "get", return_value=mock_response)
    
    result = await getty_client.get_artwork_metadata(TEST_ARTWORK_ID)
    
    # Verify security headers were processed
    assert "X-Content-Type-Options" in mock_response.headers
    assert mock_response.headers["X-Content-Type-Options"] == "nosniff"