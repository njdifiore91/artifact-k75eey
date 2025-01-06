"""
Art Knowledge Graph Backend Logging System
Version: 1.0.0

A comprehensive logging system with enhanced security monitoring, observability features,
and ELK Stack integration for the Art Knowledge Graph backend services.
"""

import logging
from typing import Dict, Any, Optional

# Import internal components
from shared.logging.config import (
    setup_logging,
    JsonFormatter,
    get_logger as _get_logger
)
from shared.logging.handlers import (
    create_cloudwatch_handler,
    create_file_handler,
    CloudWatchHandler,
    RotatingJsonFileHandler
)
from shared.config.settings import get_settings

# Version and application identifiers
VERSION = '1.0.0'
LOGGER_NAME = 'art_knowledge_graph'

# Export core components
__all__ = [
    'setup_logging',
    'JsonFormatter',
    'CloudWatchHandler',
    'RotatingJsonFileHandler',
    'get_logger',
    'create_cloudwatch_handler',
    'create_file_handler'
]

def get_logger(
    name: str,
    correlation_id: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None
) -> logging.Logger:
    """
    Returns a configured logger instance with enhanced security monitoring and observability features.
    
    Args:
        name: The name for the logger instance
        correlation_id: Optional correlation ID for request tracing
        config: Optional additional configuration parameters
    
    Returns:
        logging.Logger: Configured logger instance with security and monitoring capabilities
    """
    # Get settings instance
    settings = get_settings()
    
    # Get base logger instance
    logger = _get_logger(f"{LOGGER_NAME}.{name}")
    
    # Apply additional configuration if provided
    if config:
        for handler in logger.handlers:
            if isinstance(handler.formatter, JsonFormatter):
                handler.formatter.default_fields.update(config)
    
    # Set correlation ID if provided
    if correlation_id:
        logger = logging.LoggerAdapter(logger, {'correlation_id': correlation_id})
    
    # Configure environment-specific handlers
    if settings.environment == 'production':
        # Add CloudWatch handler for production
        cloudwatch_handler = create_cloudwatch_handler(
            settings=settings,
            log_group=f"/art-knowledge-graph/{settings.environment}",
            log_stream=name
        )
        logger.addHandler(cloudwatch_handler)
        
        # Add secure file handler for local backup
        file_handler = create_file_handler(
            filename=f"logs/{name}.log",
            max_bytes=10485760,  # 10MB
            backup_count=5
        )
        logger.addHandler(file_handler)
    
    # Set log level from settings
    logger.setLevel(settings.log_level)
    
    return logger

# Initialize logging system on module import
settings = get_settings()
setup_logging(settings)

# Log initialization message
logger = get_logger('system')
logger.info(
    'Logging system initialized',
    extra={
        'version': VERSION,
        'environment': settings.environment,
        'log_level': settings.log_level
    }
)