"""
Main entry point for the shared utilities package, providing centralized access to caching,
security, and validation functionality used across the Art Knowledge Graph backend services.
Implements comprehensive security measures, caching strategies, and input validation with
proper monitoring and logging integration.
"""

from shared.utils.cache import CacheManager
from shared.utils.security import SecurityManager
from shared.utils.validation import (
    DataValidator,
    validate_artwork_metadata,
    validate_image
)

# Package version
__version__ = "1.0.0"

# Expose key functionality
__all__ = [
    "CacheManager",
    "SecurityManager", 
    "DataValidator",
    "encrypt_data",
    "decrypt_data",
    "validate_artwork_metadata",
    "validate_image"
]

# Re-export security functions for convenience
from shared.utils.security import (
    encrypt_data,
    decrypt_data
)

# Initialize logging
import logging
logger = logging.getLogger(__name__)

def get_cache_manager(settings) -> CacheManager:
    """
    Factory function to create a configured CacheManager instance.
    
    Args:
        settings: Application settings instance
        
    Returns:
        CacheManager: Configured cache manager instance
    """
    try:
        return CacheManager(settings)
    except Exception as e:
        logger.error(f"Failed to initialize CacheManager: {str(e)}")
        raise

def get_security_manager(settings) -> SecurityManager:
    """
    Factory function to create a configured SecurityManager instance.
    
    Args:
        settings: Application settings instance
        
    Returns:
        SecurityManager: Configured security manager instance
    """
    try:
        return SecurityManager(settings)
    except Exception as e:
        logger.error(f"Failed to initialize SecurityManager: {str(e)}")
        raise

def get_data_validator(custom_rules=None, cache_config=None) -> DataValidator:
    """
    Factory function to create a configured DataValidator instance.
    
    Args:
        custom_rules: Optional dictionary of custom validation rules
        cache_config: Optional cache configuration settings
        
    Returns:
        DataValidator: Configured data validator instance
    """
    try:
        return DataValidator(custom_rules, cache_config)
    except Exception as e:
        logger.error(f"Failed to initialize DataValidator: {str(e)}")
        raise

# Convenience function for validating artwork data
async def validate_artwork_data(metadata, image_data=None, content_type=None):
    """
    Comprehensive validation for artwork data including metadata and optional image.
    
    Args:
        metadata: Dictionary containing artwork metadata
        image_data: Optional bytes containing image data
        content_type: Optional content type of the image
        
    Returns:
        tuple: (validated_metadata, image_validation_result)
    """
    try:
        # Validate metadata
        validated_metadata = await validate_artwork_metadata(metadata)
        
        # Validate image if provided
        image_validation = None
        if image_data and content_type:
            image_validation = await validate_image(image_data, content_type)
            
        return validated_metadata, image_validation
        
    except Exception as e:
        logger.error(f"Artwork data validation failed: {str(e)}")
        raise

# Initialize monitoring
from prometheus_client import Counter, Histogram

# Monitoring metrics
VALIDATION_ERRORS = Counter(
    'validation_errors_total',
    'Total number of validation errors',
    ['validation_type']
)

SECURITY_OPERATIONS = Counter(
    'security_operations_total',
    'Total number of security operations',
    ['operation_type']
)

OPERATION_DURATION = Histogram(
    'operation_duration_seconds',
    'Duration of operations',
    ['operation_type'],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0]
)

def monitor_operation(operation_type):
    """
    Decorator for monitoring operation metrics.
    
    Args:
        operation_type: Type of operation being monitored
    """
    def decorator(func):
        async def wrapper(*args, **kwargs):
            with OPERATION_DURATION.labels(operation_type).time():
                try:
                    result = await func(*args, **kwargs)
                    return result
                except Exception as e:
                    if operation_type.startswith('validation'):
                        VALIDATION_ERRORS.labels(operation_type).inc()
                    elif operation_type.startswith('security'):
                        SECURITY_OPERATIONS.labels(operation_type).inc()
                    raise
        return wrapper
    return decorator