"""
Enhanced metadata processing utility module providing standardization, validation,
and enrichment of artwork metadata from multiple sources with comprehensive error
handling and monitoring capabilities.
"""

import asyncio
import json
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Union
from functools import wraps
import logging

from pydantic import BaseModel, Field, validator
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)
from aiohttp import ClientSession, ClientTimeout
from prometheus_client import Counter, Histogram, Gauge

from data_processor.config import DataProcessorSettings
from shared.utils.cache import CacheManager
from shared.schemas.error import ValidationError

# Monitoring metrics
METADATA_PROCESSED = Counter('metadata_processed_total', 'Total metadata records processed')
METADATA_ERRORS = Counter('metadata_errors_total', 'Total metadata processing errors')
METADATA_PROCESSING_TIME = Histogram(
    'metadata_processing_seconds',
    'Time spent processing metadata'
)
METADATA_CONFIDENCE = Gauge(
    'metadata_confidence_score',
    'Confidence score of processed metadata'
)

# Constants
METADATA_CACHE_TTL = 3600  # 1 hour
REQUIRED_FIELDS = ["title", "artist", "date_created", "medium", "dimensions"]
METADATA_SOURCES = ["getty", "google_arts", "wikidata"]
SOURCE_CONFIDENCE_SCORES = {
    "getty": 0.9,
    "google_arts": 0.8,
    "wikidata": 0.7
}
API_RATE_LIMITS = {
    "getty": 100,
    "google_arts": 50,
    "wikidata": 200
}

class MetadataValidationSchema(BaseModel):
    """Schema for validating artwork metadata."""
    
    title: str = Field(..., min_length=1, max_length=500)
    artist: str = Field(..., min_length=1, max_length=200)
    date_created: str = Field(..., regex=r'^\d{4}(-\d{2}(-\d{2})?)?$')
    medium: str = Field(..., min_length=1, max_length=200)
    dimensions: Dict[str, Union[float, str]] = Field(...)
    source: str = Field(..., regex=f"^({'|'.join(METADATA_SOURCES)})$")
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    
    @validator('dimensions')
    def validate_dimensions(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        required_keys = {'height', 'width', 'units'}
        if not all(key in v for key in required_keys):
            raise ValueError(f"Dimensions must contain {required_keys}")
        return v

def validate_metadata(func):
    """Decorator for metadata validation with error handling."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            result = await func(*args, **kwargs)
            MetadataValidationSchema(**result)
            return result
        except Exception as e:
            METADATA_ERRORS.inc()
            raise ValidationError(
                message="Metadata validation failed",
                errors=[{"field": str(e), "message": str(e)}]
            )
    return wrapper

def retry_on_failure(func):
    """Decorator for retrying failed operations with exponential backoff."""
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        retry=retry_if_exception_type(Exception)
    )
    @wraps(func)
    async def wrapper(*args, **kwargs):
        return await func(*args, **kwargs)
    return wrapper

class MetadataProcessor:
    """
    Enhanced core class for processing and managing artwork metadata with
    async capabilities, caching, and comprehensive validation.
    """

    def __init__(self, settings: DataProcessorSettings, cache_manager: CacheManager):
        """Initialize metadata processor with enhanced configuration."""
        self._settings = settings
        self._cache_manager = cache_manager
        self._validation_rules = settings.metadata_validation_rules
        self._source_confidence_scores = SOURCE_CONFIDENCE_SCORES.copy()
        self._api_clients: Dict[str, ClientSession] = {}
        self._setup_api_clients()

    async def _setup_api_clients(self):
        """Initialize API clients with proper configuration."""
        timeout = ClientTimeout(total=30)
        for source in METADATA_SOURCES:
            self._api_clients[source] = ClientSession(
                timeout=timeout,
                headers=self._get_api_headers(source)
            )

    def _get_api_headers(self, source: str) -> Dict[str, str]:
        """Get API headers for specified source."""
        headers = {
            "Accept": "application/json",
            "User-Agent": f"ArtKnowledgeGraph/1.0 ({self._settings.environment})"
        }
        if api_key := self._settings.api_credentials.get(source):
            headers["Authorization"] = f"Bearer {api_key}"
        return headers

    @validate_metadata
    @retry_on_failure
    async def async_process_artwork_metadata(
        self,
        artwork_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Asynchronously process complete artwork metadata from all sources.
        
        Args:
            artwork_data: Raw artwork data to process
            
        Returns:
            Dict[str, Any]: Processed and enriched metadata
        """
        cache_key = f"metadata:{artwork_data.get('id', '')}"
        
        # Check cache first
        if cached_data := await self._cache_manager.get_cached_data(cache_key):
            return cached_data

        try:
            with METADATA_PROCESSING_TIME.time():
                # Collect metadata from all sources concurrently
                source_tasks = []
                for source in METADATA_SOURCES:
                    task = self._fetch_source_metadata(source, artwork_data)
                    source_tasks.append(task)
                
                source_results = await asyncio.gather(*source_tasks, return_exceptions=True)
                
                # Process and merge results
                merged_metadata = await self._merge_metadata_sources(
                    artwork_data,
                    source_results
                )
                
                # Validate and enrich final metadata
                enriched_metadata = await self._enrich_metadata(merged_metadata)
                
                # Cache processed results
                await self._cache_manager.set_cached_data(
                    cache_key,
                    enriched_metadata,
                    METADATA_CACHE_TTL
                )
                
                METADATA_PROCESSED.inc()
                METADATA_CONFIDENCE.set(enriched_metadata.get('confidence_score', 0))
                
                return enriched_metadata

        except Exception as e:
            METADATA_ERRORS.inc()
            logging.error(f"Metadata processing failed: {str(e)}")
            raise

    async def _fetch_source_metadata(
        self,
        source: str,
        artwork_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Fetch metadata from specified source with rate limiting."""
        try:
            client = self._api_clients[source]
            api_config = self._settings.get_api_config(source)
            
            async with client.get(
                api_config["endpoints"]["metadata"],
                params=self._build_query_params(source, artwork_data)
            ) as response:
                response.raise_for_status()
                metadata = await response.json()
                return await self.standardize_metadata(metadata, source)
                
        except Exception as e:
            logging.warning(f"Failed to fetch metadata from {source}: {str(e)}")
            return {}

    async def _merge_metadata_sources(
        self,
        base_data: Dict[str, Any],
        source_results: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Merge metadata from multiple sources with conflict resolution."""
        merged = base_data.copy()
        
        for source_data in source_results:
            if not source_data:
                continue
                
            source = source_data.get('source')
            confidence = self._source_confidence_scores.get(source, 0.5)
            
            for field, value in source_data.items():
                if field in merged:
                    # Keep value with higher confidence
                    if confidence > merged.get('confidence_score', 0):
                        merged[field] = value
                else:
                    merged[field] = value
        
        return merged

    async def _enrich_metadata(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Enrich metadata with additional context and validation."""
        enriched = metadata.copy()
        
        # Add processing metadata
        enriched.update({
            'processed_at': datetime.now(timezone.utc).isoformat(),
            'processing_version': '1.0',
            'validation_status': 'valid'
        })
        
        # Calculate overall confidence score
        confidence_scores = [
            self._source_confidence_scores.get(source, 0.5)
            for source in metadata.get('sources', [])
        ]
        if confidence_scores:
            enriched['confidence_score'] = sum(confidence_scores) / len(confidence_scores)
        
        return enriched

    def _build_query_params(
        self,
        source: str,
        artwork_data: Dict[str, Any]
    ) -> Dict[str, str]:
        """Build source-specific query parameters."""
        params = {
            'artwork_id': artwork_data.get('id', ''),
            'title': artwork_data.get('title', ''),
            'artist': artwork_data.get('artist', '')
        }
        
        if source == 'wikidata':
            params['format'] = 'json'
        elif source == 'getty':
            params['fields'] = 'all'
        
        return params

    async def close(self):
        """Cleanup resources."""
        for client in self._api_clients.values():
            await client.close()

@validate_metadata
@retry_on_failure
async def standardize_metadata(
    raw_metadata: Dict[str, Any],
    source: str
) -> Dict[str, Any]:
    """
    Standardize artwork metadata from different sources into a consistent format.
    
    Args:
        raw_metadata: Source-specific metadata
        source: Source identifier
        
    Returns:
        Dict[str, Any]: Standardized metadata
    """
    standardized = {
        'source': source,
        'confidence_score': SOURCE_CONFIDENCE_SCORES.get(source, 0.5)
    }
    
    # Map common fields
    field_mappings = {
        'title': ['title', 'artwork_title', 'name'],
        'artist': ['artist', 'creator', 'author'],
        'date_created': ['date', 'created', 'creation_date'],
        'medium': ['medium', 'technique', 'material'],
        'dimensions': ['dimensions', 'measurements', 'size']
    }
    
    for std_field, source_fields in field_mappings.items():
        for field in source_fields:
            if value := raw_metadata.get(field):
                standardized[std_field] = value
                break
    
    # Normalize dimensions
    if dims := standardized.get('dimensions'):
        standardized['dimensions'] = normalize_dimensions(dims)
    
    return standardized

def normalize_dimensions(dimensions: Union[Dict[str, Any], str]) -> Dict[str, Any]:
    """Normalize artwork dimensions to standard format."""
    if isinstance(dimensions, str):
        # Parse dimension string
        import re
        pattern = r'(\d+\.?\d*)\s*x\s*(\d+\.?\d*)\s*(\w+)'
        if match := re.match(pattern, dimensions):
            return {
                'height': float(match.group(1)),
                'width': float(match.group(2)),
                'units': match.group(3)
            }
    elif isinstance(dimensions, dict):
        return {
            'height': float(dimensions.get('height', 0)),
            'width': float(dimensions.get('width', 0)),
            'units': dimensions.get('units', 'cm')
        }
    
    return {'height': 0, 'width': 0, 'units': 'cm'}