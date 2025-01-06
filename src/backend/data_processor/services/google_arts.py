"""
Enhanced Google Arts & Culture API service module providing secure integration,
monitoring, and reliable data fetching capabilities for artwork metadata and
cultural context.
"""

import logging
import json
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
import asyncio
from aiohttp import ClientSession, ClientTimeout, TCPConnector
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)
from pydantic import BaseModel, Field, validator
from prometheus_client import Counter, Histogram, Gauge
from circuit_breaker import CircuitBreaker

from data_processor.config import DataProcessorSettings
from shared.utils.cache import CacheManager
from shared.logging.config import get_logger

# Constants
DEFAULT_REQUEST_TIMEOUT = 30
DEFAULT_CACHE_TTL = 3600
MAX_SIMILAR_ARTWORKS = 50
API_VERSION = "v1"
CIRCUIT_BREAKER_THRESHOLD = 5
CIRCUIT_BREAKER_TIMEOUT = 60
RATE_LIMIT_REQUESTS = 100
RATE_LIMIT_PERIOD = 60
SSL_VERIFY_MODE = "CERT_REQUIRED"

# Prometheus metrics
GOOGLE_ARTS_REQUESTS = Counter(
    'google_arts_requests_total',
    'Total number of Google Arts & Culture API requests',
    ['endpoint', 'status']
)
GOOGLE_ARTS_REQUEST_DURATION = Histogram(
    'google_arts_request_duration_seconds',
    'Duration of Google Arts & Culture API requests',
    ['endpoint']
)
GOOGLE_ARTS_CIRCUIT_BREAKER = Gauge(
    'google_arts_circuit_breaker_state',
    'Circuit breaker state for Google Arts & Culture API'
)

# Initialize logger
logger = get_logger(__name__)

class ArtworkMetadata(BaseModel):
    """Validated artwork metadata schema."""
    artwork_id: str
    title: str
    artist: Optional[str]
    date_created: Optional[str]
    medium: Optional[str]
    dimensions: Optional[Dict[str, Any]]
    location: Optional[str]
    description: Optional[str]
    cultural_context: Optional[Dict[str, Any]]
    related_artworks: Optional[List[str]]
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @validator('artwork_id')
    def validate_artwork_id(cls, v: str) -> str:
        """Validate artwork ID format."""
        if not v or not isinstance(v, str):
            raise ValueError("Invalid artwork ID format")
        return v

class GoogleArtsClient:
    """
    Enhanced client for Google Arts & Culture API with advanced security,
    monitoring, and reliability features.
    """

    def __init__(
        self,
        settings: DataProcessorSettings,
        cache_manager: CacheManager,
        circuit_breaker: Optional[CircuitBreaker] = None
    ):
        """Initialize secure Google Arts & Culture API client."""
        api_config = settings.get_api_config("google_arts")
        
        self._api_key = api_config["credentials"]
        self._base_url = api_config["base_url"]
        self._request_timeout = api_config.get("timeout", DEFAULT_REQUEST_TIMEOUT)
        self._rate_limit_requests = RATE_LIMIT_REQUESTS
        self._rate_limit_period = RATE_LIMIT_PERIOD
        
        # Initialize secure HTTP session
        self._session = ClientSession(
            timeout=ClientTimeout(total=self._request_timeout),
            connector=TCPConnector(
                ssl=settings.enable_ssl_verification,
                verify_ssl=True,
                ssl_version=SSL_VERIFY_MODE
            )
        )
        
        # Initialize components
        self._cache_manager = cache_manager
        self._circuit_breaker = circuit_breaker or CircuitBreaker(
            failure_threshold=CIRCUIT_BREAKER_THRESHOLD,
            recovery_timeout=CIRCUIT_BREAKER_TIMEOUT
        )
        
        # Initialize correlation context
        self._correlation_context = {
            "service": "google_arts",
            "version": API_VERSION
        }

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit with cleanup."""
        await self.close()

    @CacheManager.cache_decorator(ttl=DEFAULT_CACHE_TTL)
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        retry=retry_if_exception_type((ConnectionError, TimeoutError))
    )
    async def get_artwork_metadata(self, artwork_id: str) -> Dict[str, Any]:
        """
        Fetch artwork metadata with enhanced security and monitoring.
        
        Args:
            artwork_id: Unique identifier for the artwork
            
        Returns:
            Dict containing validated artwork metadata
            
        Raises:
            ValueError: If artwork_id is invalid
            ConnectionError: If API is unavailable
            Exception: For other errors
        """
        if self._circuit_breaker.is_open:
            GOOGLE_ARTS_CIRCUIT_BREAKER.set(1)
            raise ConnectionError("Circuit breaker is open")

        endpoint = f"/artwork/{artwork_id}"
        
        try:
            # Prepare secure request
            headers = {
                "Authorization": f"Bearer {self._api_key}",
                "X-Request-ID": self._correlation_context.get("request_id"),
                "User-Agent": "ArtKnowledgeGraph/1.0"
            }
            
            # Execute request with monitoring
            with GOOGLE_ARTS_REQUEST_DURATION.labels(endpoint).time():
                async with self._session.get(
                    f"{self._base_url}{endpoint}",
                    headers=headers,
                    raise_for_status=True
                ) as response:
                    data = await response.json()
                    
            # Record successful request
            GOOGLE_ARTS_REQUESTS.labels(endpoint=endpoint, status="success").inc()
            self._circuit_breaker.record_success()
            GOOGLE_ARTS_CIRCUIT_BREAKER.set(0)
            
            # Validate and return metadata
            metadata = ArtworkMetadata(
                artwork_id=artwork_id,
                **self._process_artwork_data(data)
            )
            return metadata.dict()

        except Exception as e:
            # Record failure and handle error
            GOOGLE_ARTS_REQUESTS.labels(endpoint=endpoint, status="error").inc()
            self._circuit_breaker.record_failure()
            
            logger.error(
                "Failed to fetch artwork metadata",
                extra={
                    "artwork_id": artwork_id,
                    "error": str(e),
                    **self._correlation_context
                }
            )
            raise

    def _process_artwork_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Process and sanitize artwork data."""
        return {
            "title": data.get("title", "Unknown"),
            "artist": data.get("artist", {}).get("name"),
            "date_created": data.get("date", {}).get("created"),
            "medium": data.get("medium"),
            "dimensions": data.get("dimensions"),
            "location": data.get("location", {}).get("name"),
            "description": data.get("description"),
            "cultural_context": self._extract_cultural_context(data),
            "related_artworks": self._extract_related_artworks(data)
        }

    def _extract_cultural_context(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract and validate cultural context information."""
        context = data.get("culturalContext", {})
        return {
            "period": context.get("period"),
            "movement": context.get("movement"),
            "influences": context.get("influences", [])
        }

    def _extract_related_artworks(self, data: Dict[str, Any]) -> List[str]:
        """Extract and validate related artwork references."""
        related = data.get("relatedArtworks", [])
        return [
            artwork["id"] for artwork in related[:MAX_SIMILAR_ARTWORKS]
            if "id" in artwork
        ]

    async def close(self):
        """Safely close client connections."""
        if not self._session.closed:
            await self._session.close()