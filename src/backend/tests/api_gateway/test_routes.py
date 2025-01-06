"""
Comprehensive test suite for the Art Knowledge Graph API Gateway routes.
Tests artwork operations, graph management, security validation, and performance monitoring.
"""

import pytest
import uuid
import time
from typing import Dict, Any
from datetime import datetime, timezone

from tests.conftest import TestClient, Neo4jConnection, Redis
from shared.schemas.error import ErrorResponse
from shared.utils.security import SecurityManager

# API endpoint constants
API_PREFIX = "/api/v1"
ARTWORK_ENDPOINT = f"{API_PREFIX}/artwork"
GRAPH_ENDPOINT = f"{API_PREFIX}/graph"
SEARCH_ENDPOINT = f"{API_PREFIX}/search"

# Performance thresholds
MAX_RESPONSE_TIME = 500  # milliseconds
RATE_LIMIT_WINDOW = 60  # seconds
MAX_REQUESTS = 100  # requests per window

class TestArtworkRoutes:
    """Test suite for artwork-related API endpoints with security and performance validation."""

    @pytest.fixture(autouse=True)
    def setup(self, test_client: TestClient, neo4j_connection: Neo4jConnection, 
              redis_client: Redis, mock_auth: Dict[str, Any]):
        """Set up test environment with security context and monitoring."""
        self.client = test_client
        self.neo4j = neo4j_connection
        self.redis = redis_client
        self.auth_token = mock_auth["token"]
        self.test_data = self._prepare_test_data()
        
        # Clear test data before each test
        self.redis.flushdb()
        with self.neo4j.get_session(write_access=True) as session:
            session.run("MATCH (n) DETACH DELETE n")

    def _prepare_test_data(self) -> Dict[str, Any]:
        """Prepare test data with proper security measures."""
        return {
            "artwork": {
                "title": "The Starry Night",
                "artist": "Vincent van Gogh",
                "year": 1889,
                "medium": "Oil on canvas",
                "dimensions": "73.7 cm × 92.1 cm",
                "location": "Museum of Modern Art",
                "image_data": "base64_encoded_image_data"
            },
            "metadata": {
                "style": "Post-Impressionism",
                "period": "Modern art",
                "tags": ["landscape", "night sky", "stars"]
            }
        }

    @pytest.mark.asyncio
    async def test_upload_artwork_success(self):
        """Test successful artwork upload with security validation."""
        # Prepare request
        headers = {
            "Authorization": f"Bearer {self.auth_token}",
            "X-Request-ID": str(uuid.uuid4())
        }
        
        # Measure response time
        start_time = time.time()
        
        response = await self.client.post(
            f"{ARTWORK_ENDPOINT}/upload",
            json=self.test_data["artwork"],
            headers=headers
        )
        
        response_time = (time.time() - start_time) * 1000
        
        # Validate response
        assert response.status_code == 201
        assert "artwork_id" in response.json()
        assert response_time < MAX_RESPONSE_TIME
        
        # Verify database entry
        artwork_id = response.json()["artwork_id"]
        with self.neo4j.get_session() as session:
            result = session.run(
                "MATCH (a:Artwork {id: $id}) RETURN a",
                {"id": artwork_id}
            )
            artwork = result.single()
            assert artwork is not None
            assert artwork["a"]["title"] == self.test_data["artwork"]["title"]

    @pytest.mark.asyncio
    async def test_upload_artwork_security(self):
        """Test artwork upload security controls."""
        # Test without authentication
        response = await self.client.post(
            f"{ARTWORK_ENDPOINT}/upload",
            json=self.test_data["artwork"]
        )
        assert response.status_code == 401
        
        # Test with invalid token
        headers = {"Authorization": "Bearer invalid_token"}
        response = await self.client.post(
            f"{ARTWORK_ENDPOINT}/upload",
            json=self.test_data["artwork"],
            headers=headers
        )
        assert response.status_code == 401
        
        # Test XSS payload
        malicious_data = self.test_data["artwork"].copy()
        malicious_data["title"] = "<script>alert('xss')</script>"
        response = await self.client.post(
            f"{ARTWORK_ENDPOINT}/upload",
            json=malicious_data,
            headers={"Authorization": f"Bearer {self.auth_token}"}
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_get_artwork_details(self):
        """Test artwork details retrieval with caching."""
        # Create test artwork
        artwork_id = str(uuid.uuid4())
        with self.neo4j.get_session(write_access=True) as session:
            session.run(
                """
                CREATE (a:Artwork {
                    id: $id,
                    title: $title,
                    artist: $artist,
                    year: $year
                })
                """,
                {
                    "id": artwork_id,
                    "title": self.test_data["artwork"]["title"],
                    "artist": self.test_data["artwork"]["artist"],
                    "year": self.test_data["artwork"]["year"]
                }
            )
        
        # First request - should hit database
        start_time = time.time()
        response = await self.client.get(
            f"{ARTWORK_ENDPOINT}/{artwork_id}",
            headers={"Authorization": f"Bearer {self.auth_token}"}
        )
        first_response_time = (time.time() - start_time) * 1000
        
        assert response.status_code == 200
        assert response.json()["id"] == artwork_id
        
        # Second request - should hit cache
        start_time = time.time()
        cached_response = await self.client.get(
            f"{ARTWORK_ENDPOINT}/{artwork_id}",
            headers={"Authorization": f"Bearer {self.auth_token}"}
        )
        cached_response_time = (time.time() - start_time) * 1000
        
        assert cached_response_time < first_response_time
        assert cached_response.json() == response.json()

    @pytest.mark.asyncio
    async def test_rate_limiting(self):
        """Test API rate limiting functionality."""
        headers = {"Authorization": f"Bearer {self.auth_token}"}
        
        # Send requests up to limit
        for _ in range(MAX_REQUESTS):
            response = await self.client.get(
                f"{ARTWORK_ENDPOINT}/search",
                headers=headers
            )
            assert response.status_code in (200, 429)
        
        # Next request should be rate limited
        response = await self.client.get(
            f"{ARTWORK_ENDPOINT}/search",
            headers=headers
        )
        assert response.status_code == 429
        assert "rate limit exceeded" in response.json()["message"].lower()
        
        # Wait for rate limit window to reset
        time.sleep(RATE_LIMIT_WINDOW)
        
        # Should be able to make requests again
        response = await self.client.get(
            f"{ARTWORK_ENDPOINT}/search",
            headers=headers
        )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_graph_generation(self):
        """Test knowledge graph generation from artwork."""
        # Upload artwork first
        artwork_response = await self.client.post(
            f"{ARTWORK_ENDPOINT}/upload",
            json=self.test_data["artwork"],
            headers={"Authorization": f"Bearer {self.auth_token}"}
        )
        artwork_id = artwork_response.json()["artwork_id"]
        
        # Generate graph
        response = await self.client.post(
            f"{GRAPH_ENDPOINT}/generate",
            json={"artwork_id": artwork_id},
            headers={"Authorization": f"Bearer {self.auth_token}"}
        )
        
        assert response.status_code == 200
        assert "graph_id" in response.json()
        
        # Verify graph structure
        graph_id = response.json()["graph_id"]
        with self.neo4j.get_session() as session:
            result = session.run(
                """
                MATCH (a:Artwork {id: $artwork_id})-[r]-(n)
                RETURN count(r) as relationships
                """,
                {"artwork_id": artwork_id}
            )
            relationships = result.single()["relationships"]
            assert relationships > 0

    @pytest.mark.asyncio
    async def test_search_functionality(self):
        """Test artwork search functionality with security controls."""
        # Add test artworks
        for i in range(3):
            artwork = self.test_data["artwork"].copy()
            artwork["title"] = f"Test Artwork {i}"
            await self.client.post(
                f"{ARTWORK_ENDPOINT}/upload",
                json=artwork,
                headers={"Authorization": f"Bearer {self.auth_token}"}
            )
        
        # Test search
        response = await self.client.get(
            f"{SEARCH_ENDPOINT}?q=Test+Artwork",
            headers={"Authorization": f"Bearer {self.auth_token}"}
        )
        
        assert response.status_code == 200
        results = response.json()["results"]
        assert len(results) == 3
        
        # Test search with SQL injection attempt
        response = await self.client.get(
            f"{SEARCH_ENDPOINT}?q=Test'+OR+'1'='1",
            headers={"Authorization": f"Bearer {self.auth_token}"}
        )
        
        assert response.status_code == 400
        assert "invalid search query" in response.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_error_handling(self):
        """Test error handling and response formatting."""
        # Test invalid artwork ID
        response = await self.client.get(
            f"{ARTWORK_ENDPOINT}/invalid_id",
            headers={"Authorization": f"Bearer {self.auth_token}"}
        )
        
        assert response.status_code == 404
        error_response = ErrorResponse(**response.json())
        assert error_response.code == "not_found"
        assert "artwork not found" in error_response.message.lower()
        
        # Test invalid request body
        response = await self.client.post(
            f"{ARTWORK_ENDPOINT}/upload",
            json={"invalid": "data"},
            headers={"Authorization": f"Bearer {self.auth_token}"}
        )
        
        assert response.status_code == 400
        error_response = ErrorResponse(**response.json())
        assert error_response.code == "validation_error"