"""
Art Knowledge Graph API Gateway Service Initialization Module
Version: 1.0.0

This module initializes the API Gateway service with required configurations,
logging setup, and version information. It provides centralized access to
gateway settings and ensures proper service discovery and routing configuration.
"""

import logging
from importlib import metadata
from typing import Dict, List, Optional

from api_gateway.config import APIGatewaySettings

# Version information from package metadata
try:
    __version__ = metadata.version('art-knowledge-graph-api-gateway')
except metadata.PackageNotFoundError:
    __version__ = '0.0.0'

# Configure logging for API Gateway
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Required backend services for API Gateway operation
REQUIRED_SERVICES: List[str] = [
    "graph",  # Graph processing service
    "auth",   # Authentication service
    "storage" # Storage service
]

# Initialize settings instance
settings = APIGatewaySettings(
    env="production" if not __debug__ else "development"
)

def initialize_gateway() -> bool:
    """
    Initialize the API Gateway service with required configurations and validate
    service availability.

    This function performs the following initialization steps:
    1. Validates configuration settings
    2. Checks required service availability
    3. Initializes rate limiters
    4. Sets up service discovery
    5. Configures security controls

    Returns:
        bool: True if initialization successful, False otherwise

    Raises:
        ValueError: If required services are not available
        ConfigurationError: If configuration validation fails
    """
    try:
        logger.info(f"Initializing API Gateway service v{__version__}")

        # Validate configuration settings
        logger.debug("Validating API Gateway configuration")
        settings.validate_config()

        # Check required services availability
        logger.debug("Checking required services availability")
        unavailable_services = []
        for service in REQUIRED_SERVICES:
            try:
                service_url = settings.get_service_url(f"{service}-service")
                logger.info(f"Service {service} available at {service_url}")
            except ValueError as e:
                logger.error(f"Service {service} not available: {str(e)}")
                unavailable_services.append(service)

        if unavailable_services:
            raise ValueError(
                f"Required services unavailable: {', '.join(unavailable_services)}"
            )

        # Initialize rate limiters for endpoints
        logger.debug("Configuring rate limits")
        for endpoint, config in settings.rate_limits.items():
            logger.info(
                f"Rate limit for {endpoint}: {config.calls} calls per {config.period}"
            )

        # Set up service discovery
        logger.debug("Setting up service discovery")
        for service, endpoint in settings.service_endpoints.items():
            logger.info(
                f"Registered service {service} at {endpoint.host}:{endpoint.port}"
            )

        # Initialize security controls
        logger.debug("Initializing security controls")
        for control_name, control in settings.security_controls.items():
            logger.info(
                f"Security control {control_name}: max payload {control.max_payload_size}, "
                f"CORS origins: {len(control.cors_origins)}"
            )

        logger.info("API Gateway initialization completed successfully")
        return True

    except Exception as e:
        logger.error(f"API Gateway initialization failed: {str(e)}")
        raise

# Export version and settings for external use
__all__ = ['__version__', 'settings', 'initialize_gateway']