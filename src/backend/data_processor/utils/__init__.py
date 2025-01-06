"""
Initialization module for the data processor utilities package, providing unified,
high-performance image processing and metadata management functionality with enhanced
validation, caching, and monitoring capabilities for the Art Knowledge Graph system.
"""

import asyncio
import functools
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone

from .image import ImageProcessor
from .metadata import MetadataProcessor

# Version information
VERSION = "1.0.0"

# Configure module-level logger
logger = logging.getLogger(__name__)

# Export public interfaces
__all__ = ["ImageProcessor", "MetadataProcessor", "process_artwork", "async_process_artwork"]

def performance_monitor(func):
    """Decorator for monitoring function performance and logging metrics."""
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        start_time = datetime.now(timezone.utc)
        try:
            result = await func(*args, **kwargs) if asyncio.iscoroutinefunction(func) else func(*args, **kwargs)
            duration = (datetime.now(timezone.utc) - start_time).total_seconds()
            logger.info(
                f"Operation completed successfully",
                extra={
                    "operation": func.__name__,
                    "duration": duration,
                    "timestamp": start_time.isoformat()
                }
            )
            return result
        except Exception as e:
            duration = (datetime.now(timezone.utc) - start_time).total_seconds()
            logger.error(
                f"Operation failed",
                extra={
                    "operation": func.__name__,
                    "duration": duration,
                    "error": str(e),
                    "timestamp": start_time.isoformat()
                }
            )
            raise
    return wrapper

@functools.lru_cache(maxsize=1000)
@performance_monitor
def process_artwork(
    image_data: bytes,
    content_type: str,
    metadata: Optional[Dict[str, Any]] = None,
    use_cache: Optional[bool] = True
) -> Dict[str, Any]:
    """
    Synchronous unified function to process both artwork image and metadata with validation
    and caching.

    Args:
        image_data: Raw image data bytes
        content_type: MIME type of the image
        metadata: Optional metadata dictionary
        use_cache: Whether to use caching (default: True)

    Returns:
        Dict[str, Any]: Combined processed image and metadata results with validation status
    """
    try:
        # Validate input parameters
        if not image_data:
            raise ValueError("Image data is required")
        if not content_type:
            raise ValueError("Content type is required")

        # Initialize processors
        image_processor = ImageProcessor()
        metadata_processor = MetadataProcessor()

        # Process image with validation
        image_result = image_processor.validate_image(image_data, content_type)
        processed_image = image_processor.process(image_data, content_type)

        # Extract and validate basic metadata
        extracted_metadata = metadata or {}
        validated_metadata = metadata_processor.validate(extracted_metadata)

        # Enrich metadata with additional information
        enriched_metadata = metadata_processor.enrich_metadata(validated_metadata)

        # Combine results
        result = {
            "image_data": processed_image,
            "metadata": enriched_metadata,
            "validation": {
                "status": "success",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        }

        return result

    except Exception as e:
        logger.error(f"Artwork processing failed: {str(e)}")
        raise

@performance_monitor
async def async_process_artwork(
    image_data: bytes,
    content_type: str,
    metadata: Optional[Dict[str, Any]] = None,
    use_cache: Optional[bool] = True
) -> Dict[str, Any]:
    """
    Asynchronous unified function for high-performance artwork processing.

    Args:
        image_data: Raw image data bytes
        content_type: MIME type of the image
        metadata: Optional metadata dictionary
        use_cache: Whether to use caching (default: True)

    Returns:
        Dict[str, Any]: Combined processed image and metadata results with validation status
    """
    try:
        # Validate input parameters
        if not image_data:
            raise ValueError("Image data is required")
        if not content_type:
            raise ValueError("Content type is required")

        # Initialize processors
        image_processor = ImageProcessor()
        metadata_processor = MetadataProcessor()

        # Process image and metadata concurrently
        image_task = asyncio.create_task(
            image_processor.validate_image(image_data, content_type)
        )
        metadata_task = asyncio.create_task(
            metadata_processor.async_process(metadata or {})
        )

        # Wait for both tasks to complete
        image_result, metadata_result = await asyncio.gather(image_task, metadata_task)

        # Process image after validation
        processed_image = await image_processor.process(image_data, content_type)

        # Combine results
        result = {
            "image_data": processed_image,
            "metadata": metadata_result,
            "validation": {
                "status": "success",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        }

        return result

    except Exception as e:
        logger.error(f"Async artwork processing failed: {str(e)}")
        raise