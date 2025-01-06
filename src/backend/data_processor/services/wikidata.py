"""
Enhanced Wikidata service module providing secure and optimized access to Wikidata's
SPARQL endpoint for art-related data retrieval with comprehensive caching,
monitoring, and resilience features.
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import aiohttp
from SPARQLWrapper import SPARQLWrapper, JSON
from pydantic import BaseModel, Field
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)
from prometheus_client import Counter, Histogram, Gauge

from data_processor.config import DataProcessorSettings
from shared.utils.cache import CacheManager
from shared.utils.validation import validate_url

# Prometheus metrics
WIKIDATA_REQUESTS = Counter('wikidata_requests_total', 'Total Wikidata API requests')
WIKIDATA_ERRORS = Counter('wikidata_errors_total', 'Total Wikidata API errors')
WIKIDATA_QUERY_DURATION = Histogram(
    'wikidata_query_duration_seconds',
    'Duration of Wikidata SPARQL queries',
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0]
)
WIKIDATA_CIRCUIT_BREAKER = Gauge(
    'wikidata_circuit_breaker_state',
    'Circuit breaker state for Wikidata API (0=closed, 1=open)'
)

# Constants
WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql"
ARTWORK_QUERY_TEMPLATE = """
SELECT ?item ?itemLabel ?creator ?creatorLabel ?inception ?movement ?movementLabel
WHERE {
  BIND(wd:%s AS ?item)
  OPTIONAL { ?item wdt:P170 ?creator. }
  OPTIONAL { ?item wdt:P571 ?inception. }
  OPTIONAL { ?item wdt:P135 ?movement. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
}
"""

RELATIONSHIP_QUERY_TEMPLATE = """
SELECT ?item ?relation ?target ?targetLabel
WHERE {
  BIND(wd:%s AS ?item)
  ?item ?relation ?target.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
}
"""

class WikidataResponse(BaseModel):
    """Validated Wikidata response schema."""
    data: Dict[str, Any] = Field(...)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source: str = Field(default="wikidata")

class WikidataClient:
    """
    Enhanced client for interacting with Wikidata's SPARQL endpoint with advanced
    security, caching, and monitoring features.
    """

    def __init__(self, settings: DataProcessorSettings, cache_manager: CacheManager):
        """Initialize Wikidata client with security and monitoring configuration."""
        self._settings = settings
        self._cache_manager = cache_manager
        
        # Configure SPARQL client with security settings
        self._sparql_client = SPARQLWrapper(WIKIDATA_ENDPOINT)
        self._sparql_client.setReturnFormat(JSON)
        self._sparql_client.setTimeout(settings.api_request_timeout)
        
        # Configure HTTP client with security and connection pooling
        self._connection_pool_config = {
            "limit": 100,
            "force_close": True,
            "enable_cleanup_closed": True
        }
        
        # Configure SSL context
        self._ssl_context = settings.get_ssl_context()
        
        # Initialize circuit breaker
        self._circuit_breaker = {
            "failures": 0,
            "threshold": 5,
            "reset_timeout": 300,
            "last_failure": 0
        }

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        retry=retry_if_exception_type(Exception)
    )
    async def get_artwork_data(
        self, 
        artwork_id: str,
        options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Securely retrieve artwork metadata from Wikidata with caching and monitoring.
        
        Args:
            artwork_id: Wikidata entity ID for the artwork
            options: Optional query parameters and settings
            
        Returns:
            Dict containing validated artwork metadata
        """
        WIKIDATA_REQUESTS.inc()
        
        try:
            # Validate artwork ID
            if not artwork_id.startswith('Q'):
                raise ValueError("Invalid Wikidata entity ID format")

            # Check cache first
            cache_key = f"wikidata:artwork:{artwork_id}"
            cached_data = await self._cache_manager.get_cached_data(cache_key)
            if cached_data:
                return cached_data

            # Prepare and execute query
            query = ARTWORK_QUERY_TEMPLATE % artwork_id
            with WIKIDATA_QUERY_DURATION.time():
                async with aiohttp.ClientSession(
                    connector=aiohttp.TCPConnector(ssl=self._ssl_context)
                ) as session:
                    async with session.post(
                        WIKIDATA_ENDPOINT,
                        headers={"Accept": "application/json"},
                        params={"query": query},
                        timeout=self._settings.api_request_timeout
                    ) as response:
                        response.raise_for_status()
                        data = await response.json()

            # Validate and process response
            processed_data = self._process_artwork_data(data)
            response = WikidataResponse(data=processed_data)

            # Cache the validated response
            await self._cache_manager.set_cached_data(
                cache_key,
                response.dict(),
                ttl=3600
            )

            return response.dict()

        except Exception as e:
            WIKIDATA_ERRORS.inc()
            self._update_circuit_breaker("failure")
            logging.error(f"Wikidata artwork data retrieval error: {str(e)}")
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        retry=retry_if_exception_type(Exception)
    )
    async def search_artworks(
        self,
        criteria: Dict[str, Any],
        options: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Perform secure artwork search with criteria validation and result filtering.
        
        Args:
            criteria: Search criteria and filters
            options: Optional search parameters and settings
            
        Returns:
            List of matching artwork records
        """
        WIKIDATA_REQUESTS.inc()
        
        try:
            # Validate search criteria
            if not criteria:
                raise ValueError("Search criteria required")

            # Check cache
            cache_key = f"wikidata:search:{hash(str(criteria))}"
            cached_results = await self._cache_manager.get_cached_data(cache_key)
            if cached_results:
                return cached_results

            # Construct search query
            query = self._build_search_query(criteria)
            
            # Execute search
            with WIKIDATA_QUERY_DURATION.time():
                async with aiohttp.ClientSession(
                    connector=aiohttp.TCPConnector(ssl=self._ssl_context)
                ) as session:
                    async with session.post(
                        WIKIDATA_ENDPOINT,
                        headers={"Accept": "application/json"},
                        params={"query": query},
                        timeout=self._settings.api_request_timeout
                    ) as response:
                        response.raise_for_status()
                        data = await response.json()

            # Process and validate results
            results = self._process_search_results(data)
            
            # Cache results
            await self._cache_manager.set_cached_data(
                cache_key,
                results,
                ttl=1800
            )

            return results

        except Exception as e:
            WIKIDATA_ERRORS.inc()
            self._update_circuit_breaker("failure")
            logging.error(f"Wikidata search error: {str(e)}")
            raise

    def _process_artwork_data(self, raw_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process and validate artwork data from Wikidata response."""
        try:
            bindings = raw_data.get('results', {}).get('bindings', [])
            if not bindings:
                return {}

            processed_data = {
                'id': bindings[0].get('item', {}).get('value', '').split('/')[-1],
                'label': bindings[0].get('itemLabel', {}).get('value'),
                'creator': bindings[0].get('creatorLabel', {}).get('value'),
                'inception': bindings[0].get('inception', {}).get('value'),
                'movement': bindings[0].get('movementLabel', {}).get('value'),
                'retrieved_at': datetime.now(timezone.utc).isoformat()
            }

            return processed_data

        except Exception as e:
            logging.error(f"Error processing artwork data: {str(e)}")
            raise

    def _process_search_results(self, raw_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Process and validate search results from Wikidata."""
        try:
            results = []
            bindings = raw_data.get('results', {}).get('bindings', [])
            
            for binding in bindings:
                result = {
                    'id': binding.get('item', {}).get('value', '').split('/')[-1],
                    'label': binding.get('itemLabel', {}).get('value'),
                    'type': binding.get('type', {}).get('value'),
                    'retrieved_at': datetime.now(timezone.utc).isoformat()
                }
                results.append(result)

            return results

        except Exception as e:
            logging.error(f"Error processing search results: {str(e)}")
            raise

    def _build_search_query(self, criteria: Dict[str, Any]) -> str:
        """Build secure SPARQL query from search criteria."""
        query_parts = ["SELECT ?item ?itemLabel WHERE {"]
        
        if 'type' in criteria:
            query_parts.append(f"?item wdt:P31 wd:{criteria['type']}.")
        
        if 'creator' in criteria:
            query_parts.append(f"?item wdt:P170 wd:{criteria['creator']}.")
            
        if 'movement' in criteria:
            query_parts.append(f"?item wdt:P135 wd:{criteria['movement']}.")

        query_parts.append(
            'SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }'
        )
        query_parts.append("}")
        
        if 'limit' in criteria:
            query_parts.append(f"LIMIT {min(int(criteria['limit']), 100)}")

        return " ".join(query_parts)

    def _update_circuit_breaker(self, event: str) -> None:
        """Update circuit breaker state based on events."""
        now = datetime.now(timezone.utc).timestamp()
        
        if event == "failure":
            self._circuit_breaker["failures"] += 1
            self._circuit_breaker["last_failure"] = now
            
            if self._circuit_breaker["failures"] >= self._circuit_breaker["threshold"]:
                WIKIDATA_CIRCUIT_BREAKER.set(1)
        
        elif event == "success":
            if (now - self._circuit_breaker["last_failure"]) > self._circuit_breaker["reset_timeout"]:
                self._circuit_breaker["failures"] = 0
                WIKIDATA_CIRCUIT_BREAKER.set(0)