"""
FastAPI router module implementing artwork-related API endpoints for the Art Knowledge Graph API Gateway.
Provides secure, optimized, and cached endpoints for artwork upload and retrieval with comprehensive
validation, monitoring, and error handling.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Histogram  # version: 0.16+
import aiohttp  # version: 3.8+
import clamav  # version: 1.0+
from cachetools import TTLCache  # version: 5.0+

from api_gateway.schemas.artwork import (
    ArtworkMetadata,
    ArtworkResponse,
    ArtworkUploadRequest
)
from api_gateway.core.security import validate_request_signature, RateLimiter
from api_gateway.core.monitoring import log_request_metrics
from api_gateway.services.artwork_processor import ArtworkProcessor
from api_gateway.services.graph_generator import GraphGenerator
from api_gateway.core.caching import cache_response, get_cache_key
from api_gateway.core.config import settings

# Initialize router with prefix and tags
router = APIRouter(prefix="/api/v1/artwork", tags=["artwork"])

# Configure logging
logger = logging.getLogger(__name__)

# Initialize metrics
UPLOAD_LATENCY = Histogram(
    'artwork_upload_latency_seconds',
    'Artwork upload processing time',
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0]
)
UPLOAD_COUNTER = Counter('artwork_uploads_total', 'Total artwork uploads')
ERROR_COUNTER = Counter('artwork_errors_total', 'Total artwork processing errors')

# Initialize rate limiter
limiter = RateLimiter(rate_limit="10/minute")

# Initialize cache
artwork_cache = TTLCache(maxsize=1000, ttl=3600)  # 1-hour TTL

async def scan_file_security(file_data: bytes) -> bool:
    """
    Performs security scanning of uploaded files using ClamAV.
    
    Args:
        file_data: Raw file data to scan
        
    Returns:
        bool: True if file is safe, raises exception otherwise
    """
    try:
        scanner = clamav.Scanner()
        result = await scanner.scan_bytes(file_data)
        if result.infected:
            logger.warning(f"Security threat detected in upload: {result.viruses}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Security threat detected in upload"
            )
        return True
    except Exception as e:
        logger.error(f"Security scan failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Security scan failed"
        )

@router.post(
    "/",
    response_model=ArtworkResponse,
    status_code=status.HTTP_201_CREATED,
    response_description="Successfully processed artwork upload"
)
@limiter.limit("10/minute")
@validate_request_signature
@UPLOAD_LATENCY.time()
async def upload_artwork(
    request: ArtworkUploadRequest,
    background_tasks: BackgroundTasks
) -> ArtworkResponse:
    """
    Handles artwork upload with security scanning, parallel processing, and caching.
    
    Args:
        request: Validated artwork upload request
        background_tasks: FastAPI background tasks handler
        
    Returns:
        ArtworkResponse: Processed artwork data with graph
    """
    try:
        UPLOAD_COUNTER.inc()
        
        # Security scan
        await scan_file_security(request.image_data)
        
        # Initialize processors
        artwork_processor = ArtworkProcessor()
        graph_generator = GraphGenerator()
        
        # Parallel process image and metadata
        processing_tasks = [
            artwork_processor.process_image(request.image_data, request.image_type),
            artwork_processor.extract_metadata(request.metadata),
            artwork_processor.fetch_getty_data(request.metadata)
        ]
        
        results = await asyncio.gather(*processing_tasks, return_exceptions=True)
        
        # Check for processing errors
        for result in results:
            if isinstance(result, Exception):
                ERROR_COUNTER.inc()
                logger.error(f"Processing error: {str(result)}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Artwork processing failed"
                )
        
        processed_image, extracted_metadata, getty_data = results
        
        # Generate knowledge graph
        graph_node = await graph_generator.generate_artwork_node(
            metadata=extracted_metadata,
            getty_data=getty_data
        )
        
        # Prepare response
        response = ArtworkResponse(
            uuid=UUID(bytes=processed_image.uuid),
            metadata=request.metadata,
            image_url=processed_image.url,
            thumbnail_url=processed_image.thumbnail_url,
            graph_node=graph_node,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            processing_status="completed",
            version=1,
            access_rights={"view": True, "edit": True}
        )
        
        # Cache response
        cache_key = get_cache_key(response.uuid)
        artwork_cache[cache_key] = response
        
        # Schedule background tasks
        background_tasks.add_task(
            artwork_processor.process_additional_metadata,
            response.uuid
        )
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        ERROR_COUNTER.inc()
        logger.error(f"Unexpected error in upload_artwork: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@router.get(
    "/{artwork_id}",
    response_model=ArtworkResponse,
    response_description="Successfully retrieved artwork details"
)
@limiter.limit("100/minute")
@cache_response(ttl_seconds=3600)
async def get_artwork(
    artwork_id: UUID,
    if_none_match: Optional[str] = None
) -> ArtworkResponse:
    """
    Retrieves artwork details with caching and conditional responses.
    
    Args:
        artwork_id: UUID of artwork to retrieve
        if_none_match: Optional ETag for conditional request
        
    Returns:
        ArtworkResponse: Cached or fresh artwork details
    """
    try:
        # Check cache
        cache_key = get_cache_key(artwork_id)
        if cached_response := artwork_cache.get(cache_key):
            # Handle conditional request
            etag = f"W/\"{hash(str(cached_response.updated_at))}\"" 
            if if_none_match == etag:
                return JSONResponse(
                    status_code=status.HTTP_304_NOT_MODIFIED,
                    headers={"ETag": etag}
                )
            return cached_response
            
        # Fetch fresh data
        artwork_processor = ArtworkProcessor()
        graph_generator = GraphGenerator()
        
        # Parallel fetch artwork data and graph
        artwork_data, graph_node = await asyncio.gather(
            artwork_processor.get_artwork(artwork_id),
            graph_generator.get_artwork_node(artwork_id)
        )
        
        if not artwork_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Artwork not found"
            )
            
        # Prepare response
        response = ArtworkResponse(
            uuid=artwork_id,
            metadata=artwork_data.metadata,
            image_url=artwork_data.image_url,
            thumbnail_url=artwork_data.thumbnail_url,
            graph_node=graph_node,
            created_at=artwork_data.created_at,
            updated_at=artwork_data.updated_at,
            processing_status=artwork_data.processing_status,
            version=artwork_data.version,
            access_rights=artwork_data.access_rights
        )
        
        # Update cache
        artwork_cache[cache_key] = response
        
        # Set ETag for caching
        etag = f"W/\"{hash(str(response.updated_at))}\"" 
        
        return JSONResponse(
            content=response.dict(),
            headers={"ETag": etag}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving artwork {artwork_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )