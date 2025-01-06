import pytest
import json
from datetime import datetime, timezone
from unittest.mock import Mock, patch

from data_processor.services.wikidata import WikidataClient
from data_processor.config import DataProcessorSettings
from shared.utils.cache import CacheManager
from shared.config.settings import Settings

# Test constants
TEST_ARTWORK_ID = "Q12345"
TEST_SEARCH_QUERY = "The Starry Night"
TEST_CACHE_TTL = 3600

# Mock SPARQL responses
MOCK_ARTWORK_RESPONSE = {
    "results": {
        "bindings": [{
            "item": {"value": "http://www.wikidata.org/entity/Q12345"},
            "itemLabel": {"value": "The Starry Night"},
            "creator": {"value": "http://www.wikidata.org/entity/Q5582"},
            "creatorLabel": {"value": "Vincent van Gogh"},
            "inception": {"value": "1889-06-01T00:00:00Z"},
            "movement": {"value": "http://www.wikidata.org/entity/Q34661"},
            "movementLabel": {"value": "Post-Impressionism"}
        }]
    }
}

MOCK_SEARCH_RESPONSE = {
    "results": {
        "bindings": [
            {
                "item": {"value": "http://www.wikidata.org/entity/Q12345"},
                "itemLabel": {"value": "The Starry Night"},
                "type": {"value": "painting"}
            }
        ]
    }
}

@pytest.fixture
async def wikidata_client():
    """Initialize WikidataClient with test configuration."""
    settings = Settings(environment="test")
    data_processor_settings = DataProcessorSettings(settings)
    cache_manager = CacheManager(settings)
    client = WikidataClient(data_processor_settings, cache_manager)
    return client

@pytest.fixture
async def mock_cache_manager():
    """Create mock cache manager for testing."""
    cache_manager = Mock(spec=CacheManager)
    cache_manager.get_cached_data = Mock(return_value=None)
    cache_manager.set_cached_data = Mock(return_value=True)
    return cache_manager

@pytest.mark.asyncio
async def test_get_artwork_data_success(wikidata_client, mock_cache_manager):
    """Test successful artwork data retrieval with validation."""
    with patch('aiohttp.ClientSession.post') as mock_post:
        # Configure mock response
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json = Mock(return_value=MOCK_ARTWORK_RESPONSE)
        mock_post.return_value.__aenter__.return_value = mock_response

        # Execute test
        result = await wikidata_client.get_artwork_data(TEST_ARTWORK_ID)

        # Validate response structure
        assert result is not None
        assert isinstance(result, dict)
        assert result["data"]["id"] == TEST_ARTWORK_ID
        assert result["data"]["label"] == "The Starry Night"
        assert result["data"]["creator"] == "Vincent van Gogh"
        assert result["data"]["movement"] == "Post-Impressionism"
        assert "timestamp" in result
        assert "source" in result

        # Verify API call
        mock_post.assert_called_once()
        mock_response.raise_for_status.assert_called_once()

@pytest.mark.asyncio
async def test_search_artworks(wikidata_client, mock_cache_manager):
    """Test artwork search functionality with filters."""
    search_criteria = {
        "query": TEST_SEARCH_QUERY,
        "type": "Q3305213",  # painting
        "limit": 10
    }

    with patch('aiohttp.ClientSession.post') as mock_post:
        # Configure mock response
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json = Mock(return_value=MOCK_SEARCH_RESPONSE)
        mock_post.return_value.__aenter__.return_value = mock_response

        # Execute test
        results = await wikidata_client.search_artworks(search_criteria)

        # Validate results
        assert isinstance(results, list)
        assert len(results) > 0
        assert all(isinstance(item, dict) for item in results)
        assert results[0]["id"] == TEST_ARTWORK_ID
        assert results[0]["label"] == "The Starry Night"
        assert "type" in results[0]
        assert "retrieved_at" in results[0]

        # Verify API call
        mock_post.assert_called_once()

@pytest.mark.asyncio
async def test_get_related_artworks(wikidata_client, mock_cache_manager):
    """Test retrieval of related artworks with relationship validation."""
    mock_relationship_response = {
        "results": {
            "bindings": [{
                "item": {"value": TEST_ARTWORK_ID},
                "relation": {"value": "influenced_by"},
                "target": {"value": "Q54321"},
                "targetLabel": {"value": "Related Artwork"}
            }]
        }
    }

    with patch('aiohttp.ClientSession.post') as mock_post:
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json = Mock(return_value=mock_relationship_response)
        mock_post.return_value.__aenter__.return_value = mock_response

        result = await wikidata_client.get_related_artworks(TEST_ARTWORK_ID)

        assert isinstance(result, list)
        assert len(result) > 0
        assert "relation" in result[0]
        assert "target" in result[0]
        assert "targetLabel" in result[0]

@pytest.mark.asyncio
async def test_error_handling(wikidata_client):
    """Test error handling and retry logic."""
    with patch('aiohttp.ClientSession.post') as mock_post:
        # Simulate API error
        mock_post.side_effect = Exception("API Error")

        with pytest.raises(Exception) as exc_info:
            await wikidata_client.get_artwork_data(TEST_ARTWORK_ID)

        assert str(exc_info.value) == "API Error"
        assert mock_post.call_count == 3  # Verify retry attempts

@pytest.mark.asyncio
async def test_cache_behavior(wikidata_client, mock_cache_manager):
    """Test caching functionality and TTL validation."""
    cached_data = {
        "data": {
            "id": TEST_ARTWORK_ID,
            "label": "Cached Artwork"
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "wikidata"
    }

    # Test cache hit
    mock_cache_manager.get_cached_data.return_value = cached_data
    result = await wikidata_client.get_artwork_data(TEST_ARTWORK_ID)
    assert result == cached_data
    mock_cache_manager.get_cached_data.assert_called_once()

    # Test cache miss and set
    mock_cache_manager.get_cached_data.return_value = None
    with patch('aiohttp.ClientSession.post') as mock_post:
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json = Mock(return_value=MOCK_ARTWORK_RESPONSE)
        mock_post.return_value.__aenter__.return_value = mock_response

        result = await wikidata_client.get_artwork_data(TEST_ARTWORK_ID)
        mock_cache_manager.set_cached_data.assert_called_once()

@pytest.mark.asyncio
async def test_invalid_artwork_id(wikidata_client):
    """Test validation of artwork ID format."""
    with pytest.raises(ValueError) as exc_info:
        await wikidata_client.get_artwork_data("invalid_id")
    assert "Invalid Wikidata entity ID format" in str(exc_info.value)

@pytest.mark.asyncio
async def test_empty_search_criteria(wikidata_client):
    """Test handling of empty search criteria."""
    with pytest.raises(ValueError) as exc_info:
        await wikidata_client.search_artworks({})
    assert "Search criteria required" in str(exc_info.value)

@pytest.mark.asyncio
async def test_malformed_response(wikidata_client):
    """Test handling of malformed API responses."""
    with patch('aiohttp.ClientSession.post') as mock_post:
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json = Mock(return_value={"invalid": "response"})
        mock_post.return_value.__aenter__.return_value = mock_response

        with pytest.raises(Exception) as exc_info:
            await wikidata_client.get_artwork_data(TEST_ARTWORK_ID)
        assert "Error processing artwork data" in str(exc_info.value)