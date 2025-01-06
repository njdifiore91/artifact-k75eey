"""
Initialization module for the Art Knowledge Graph data processor service.
Provides secure initialization patterns, lazy loading, and controlled interface exposure
for artwork analysis, metadata extraction, and external API integrations.

Version: 1.0.0
Author: Art Knowledge Graph Team
"""

import logging
from typing import Dict, Any, Optional

# Internal imports with lazy loading pattern
from data_processor.main import DataProcessor
from data_processor.config import DataProcessorSettings
from data_processor.services.getty import GettyAPIClient

# Configure module-level logger
logger = logging.getLogger(__name__)

# Module version and metadata
__version__ = "1.0.0"
__author__ = "Art Knowledge Graph Team"
__description__ = "Data processor service for artwork analysis and metadata enrichment"

# Control public interface exposure
__all__ = [
    "DataProcessor",
    "DataProcessorSettings", 
    "GettyAPIClient",
    "process_artwork",
    "get_api_config"
]

# Lazy loading cache for initialized components
_component_cache: Dict[str, Any] = {}

async def process_artwork(
    image_data: bytes,
    content_type: str,
    correlation_id: Optional[str] = None,
    settings: Optional[DataProcessorSettings] = None
) -> Dict[str, Any]:
    """
    Process artwork data with secure initialization and error handling.
    
    Args:
        image_data: Raw image data bytes
        content_type: Image content type
        correlation_id: Optional request correlation ID
        settings: Optional custom settings
        
    Returns:
        Dict containing processed artwork metadata and analysis results
    """
    try:
        # Get or initialize processor with secure settings
        processor = await _get_processor(settings)
        
        # Process artwork with monitoring
        result = await processor.process_artwork(
            image_data=image_data,
            content_type=content_type,
            correlation_id=correlation_id
        )
        
        return result
        
    except Exception as e:
        logger.error(
            "Artwork processing failed",
            extra={
                "correlation_id": correlation_id,
                "error": str(e)
            }
        )
        raise

def get_api_config(api_name: str, settings: Optional[DataProcessorSettings] = None) -> Dict[str, Any]:
    """
    Retrieve secure API configuration with credential validation.
    
    Args:
        api_name: Name of the API to configure
        settings: Optional custom settings
        
    Returns:
        Dict containing validated API configuration
    """
    try:
        # Get or initialize settings with validation
        processor_settings = settings or _get_settings()
        
        # Get API config with security checks
        return processor_settings.get_api_config(api_name)
        
    except Exception as e:
        logger.error(f"Failed to get API config for {api_name}: {str(e)}")
        raise

async def _get_processor(settings: Optional[DataProcessorSettings] = None) -> DataProcessor:
    """
    Get or initialize DataProcessor instance with caching.
    
    Args:
        settings: Optional custom settings
        
    Returns:
        Initialized DataProcessor instance
    """
    cache_key = "processor"
    
    if cache_key not in _component_cache:
        processor_settings = settings or _get_settings()
        _component_cache[cache_key] = DataProcessor(processor_settings)
        
        logger.info(
            "Initialized data processor",
            extra={"environment": processor_settings.environment}
        )
        
    return _component_cache[cache_key]

def _get_settings(validate: bool = True) -> DataProcessorSettings:
    """
    Get or initialize settings with validation.
    
    Args:
        validate: Whether to validate settings
        
    Returns:
        Validated DataProcessorSettings instance
    """
    cache_key = "settings"
    
    if cache_key not in _component_cache:
        from shared.config.settings import Settings
        base_settings = Settings()
        _component_cache[cache_key] = DataProcessorSettings(base_settings)
        
        if validate:
            _component_cache[cache_key].validate_security_settings()
            
        logger.info(
            "Initialized data processor settings",
            extra={"environment": _component_cache[cache_key].environment}
        )
        
    return _component_cache[cache_key]

# Initialize logging on module load
logging.getLogger(__name__).addHandler(logging.NullHandler())