"""
Test package initialization module for the Art Knowledge Graph data processor service tests.
Provides comprehensive test configuration, fixtures, and utilities for testing artwork
analysis, metadata extraction, and external API integrations.

Version: 1.0.0
"""

import os
import pytest
from typing import Dict, Any
import logging
from datetime import datetime, timezone
from pytest_timeout import timeout_decorator
from logging_elk import ElkHandler  # python-logging-elk v1.0+

from data_processor import DataProcessor
from shared.config.settings import Settings

# Test configuration constants
__test_version__ = "1.0.0"
TEST_DATA_DIR = "tests/data_processor/test_data"
DEFAULT_TIMEOUT = 600  # 10 minutes

def pytest_configure(config):
    """
    Configures pytest with custom markers, timeouts, and logging for data processor tests.
    
    Args:
        config: Pytest config object
    """
    # Register custom markers
    config.addinivalue_line(
        "markers",
        "data_integration: mark test as data integration test"
    )
    config.addinivalue_line(
        "markers",
        "art_analysis: mark test as artwork analysis test"
    )
    config.addinivalue_line(
        "markers",
        "api_performance: mark test as API performance test"
    )

    # Configure test timeouts
    config.addinivalue_line("timeout", str(DEFAULT_TIMEOUT))
    
    # Configure test-specific timeouts
    timeout_decorator.timeout(DEFAULT_TIMEOUT)

    # Initialize ELK Stack logging for test monitoring
    logging.getLogger().addHandler(
        ElkHandler(
            host=os.getenv("ELK_HOST", "localhost"),
            port=int(os.getenv("ELK_PORT", 9200)),
            index="art-knowledge-graph-tests",
            extra={
                "environment": "test",
                "service": "data_processor",
                "version": __test_version__
            }
        )
    )

@pytest.fixture
def mock_getty_api():
    """
    Provides mock Getty API client fixture with response validation.
    
    Returns:
        MockGettyClient: Mock Getty API client instance
    """
    class MockGettyClient:
        def __init__(self):
            self.responses = {}
            self.calls = []

        async def get_artwork_metadata(self, artwork_id: str) -> Dict[str, Any]:
            self.calls.append(("get_artwork_metadata", artwork_id))
            if artwork_id not in self.responses:
                return {
                    "id": artwork_id,
                    "title": "Test Artwork",
                    "artist": "Test Artist",
                    "year": "2023",
                    "medium": "Test Medium"
                }
            return self.responses[artwork_id]

        def set_response(self, artwork_id: str, response: Dict[str, Any]):
            self.responses[artwork_id] = response

        def verify_calls(self):
            return self.calls

    mock_client = MockGettyClient()
    yield mock_client
    # Verify all mock interactions were valid
    assert all(call[0] in ["get_artwork_metadata"] for call in mock_client.calls)

@pytest.fixture
def mock_wikidata():
    """
    Provides mock Wikidata service fixture with response validation.
    
    Returns:
        MockWikidata: Mock Wikidata service instance
    """
    class MockWikidata:
        def __init__(self):
            self.responses = {}
            self.calls = []

        async def query_artwork(self, query: str) -> Dict[str, Any]:
            self.calls.append(("query_artwork", query))
            return self.responses.get(query, {"results": []})

        def set_response(self, query: str, response: Dict[str, Any]):
            self.responses[query] = response

        def verify_calls(self):
            return self.calls

    mock_service = MockWikidata()
    yield mock_service
    # Verify all mock interactions were valid
    assert all(call[0] in ["query_artwork"] for call in mock_service.calls)

@pytest.fixture
def test_image_data():
    """
    Provides test image data fixture with metadata.
    
    Returns:
        Dict[str, Any]: Test image data and metadata
    """
    import os
    from PIL import Image
    import io

    # Create test image
    img = Image.new('RGB', (100, 100), color='white')
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='JPEG')
    img_data = img_bytes.getvalue()

    # Generate test metadata
    metadata = {
        "filename": "test_image.jpg",
        "size": len(img_data),
        "content_type": "image/jpeg",
        "dimensions": {"width": 100, "height": 100},
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    yield {
        "image_data": img_data,
        "metadata": metadata
    }

    # Cleanup any temporary files
    if os.path.exists(metadata["filename"]):
        os.remove(metadata["filename"])