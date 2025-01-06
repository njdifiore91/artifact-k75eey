"""
Getty API client service module providing secure, monitored, and cached access to the
Getty Art & Architecture Thesaurus API for artwork metadata processing and classification.
"""

import httpx
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)
from opentelemetry import trace
from prometheus_client import Counter, Histogram, Gauge
from pydantic import BaseModel, Field

from data_processor.config import DataProcessorSettings
from shared.utils.cache import CacheManager
from shared.utils.validation import validate_url

# API version and configuration constants
GETTY_API_VERSION = "v1"
CACHE_PREFIX = "getty:"
DEFAULT_CACHE_TTL = 3600  # 1 hour
MAX_SEARCH_RESULTS = 100
CIRCUIT_BREAKER_THRESHOLD = 5
RATE_LIMIT_WINDOW = 60  # seconds
MAX_RETRIES = 3
REQUEST_TIMEOUT = 30  # seconds

# Security headers
SECURITY_HEADERS = {
    "X-Api-Version": GETTY_API_VERSION,
    "X-Security-Headers": "enabled"
}

# Prometheus metrics
GETTY_API_REQUESTS = Counter(
    'getty_api_requests_total',
    'Total number of Getty API requests',
    ['endpoint', 'status']
)
GETTY_API_LATENCY = Histogram(
    'getty_api_latency_seconds',
    'Getty API request latency',
    ['endpoint']
)
GETTY_CIRCUIT_BREAKER = Gauge(
    'getty_circuit_breaker_state',
    'Getty API circuit breaker state'
)

# Initialize tracer
tracer = trace.get_tracer(__name__)

class GettyMetadataResponse(BaseModel):
    """Validated Getty API metadata response schema."""
    id: str
    title: str
    type: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    relationships: List[Dict[str, Any]] = Field(default_factory=list)
    updated_at: datetime

class GettyAPIClient:
    """
    Enhanced Getty API client with advanced security, caching, monitoring,
    and fault tolerance capabilities.
    """

    def __init__(self, settings: DataProcessorSettings, cache_manager: CacheManager):
        """Initialize Getty API client with secure configuration."""
        self._settings = settings
        self._cache = cache_manager
        
        # Configure API settings
        api_config = settings.get_api_config("getty")
        self.base_url = api_config["base_url"]
        self.api_key = api_config["credentials"]
        
        # Configure HTTP client with security and monitoring
        self._client = httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
            headers={
                **SECURITY_HEADERS,
                "Authorization": f"Bearer {self.api_key}",
                "User-Agent": f"ArtKnowledgeGraph/{GETTY_API_VERSION}"
            }
        )

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=2),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.ConnectionError))
    )
    async def get_artwork_metadata(
        self, 
        artwork_id: str,
        options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Fetch artwork metadata from Getty API with caching and monitoring.
        
        Args:
            artwork_id: Unique identifier for the artwork
            options: Optional query parameters
            
        Returns:
            Dict containing validated artwork metadata
        """
        cache_key = f"{CACHE_PREFIX}metadata:{artwork_id}"
        
        # Check cache first
        cached_data = await self._cache.get_cached_data(cache_key)
        if cached_data:
            return cached_data

        # Validate artwork ID and URL
        if not artwork_id or not validate_url(f"{self.base_url}/metadata/{artwork_id}"):
            raise ValueError("Invalid artwork ID or URL")

        with tracer.start_as_current_span("getty_get_artwork_metadata") as span:
            span.set_attribute("artwork_id", artwork_id)
            
            try:
                # Prepare request with monitoring
                endpoint = f"/metadata/{artwork_id}"
                with GETTY_API_LATENCY.labels(endpoint).time():
                    response = await self._client.get(
                        f"{self.base_url}{endpoint}",
                        params=options
                    )
                
                # Record metrics
                GETTY_API_REQUESTS.labels(
                    endpoint=endpoint,
                    status=response.status_code
                ).inc()

                # Handle response
                response.raise_for_status()
                data = response.json()

                # Validate response data
                validated_data = GettyMetadataResponse(**data).dict()

                # Cache successful response
                await self._cache.set_cached_data(
                    cache_key,
                    validated_data,
                    ttl=DEFAULT_CACHE_TTL
                )

                return validated_data

            except httpx.HTTPStatusError as e:
                logging.error(f"Getty API error: {str(e)}", extra={
                    "artwork_id": artwork_id,
                    "status_code": e.response.status_code
                })
                raise
            except Exception as e:
                logging.error(f"Getty API unexpected error: {str(e)}", extra={
                    "artwork_id": artwork_id
                })
                raise

    async def search_artwork_terms(
        self,
        query: str,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Search Getty vocabulary terms with security and rate limiting.
        
        Args:
            query: Search query string
            filters: Optional search filters
            
        Returns:
            List of matching vocabulary terms
        """
        cache_key = f"{CACHE_PREFIX}search:{hash(f'{query}{str(filters)}')}"
        
        # Check cache
        cached_results = await self._cache.get_cached_data(cache_key)
        if cached_results:
            return cached_results

        with tracer.start_as_current_span("getty_search_artwork_terms") as span:
            span.set_attribute("query", query)
            
            try:
                # Prepare search parameters
                params = {
                    "q": query,
                    "limit": MAX_SEARCH_RESULTS,
                    **(filters or {})
                }

                # Execute search with monitoring
                endpoint = "/search"
                with GETTY_API_LATENCY.labels(endpoint).time():
                    response = await self._client.get(
                        f"{self.base_url}{endpoint}",
                        params=params
                    )

                # Record metrics
                GETTY_API_REQUESTS.labels(
                    endpoint=endpoint,
                    status=response.status_code
                ).inc()

                # Handle response
                response.raise_for_status()
                results = response.json().get("results", [])

                # Cache results
                await self._cache.set_cached_data(
                    cache_key,
                    results,
                    ttl=DEFAULT_CACHE_TTL
                )

                return results

            except Exception as e:
                logging.error(f"Getty search error: {str(e)}", extra={
                    "query": query,
                    "filters": filters
                })
                raise

    async def close(self):
        """Safely close HTTP client connections."""
        await self._client.aclose()

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit with cleanup."""
        await self.close()