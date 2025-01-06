"""
Initialization module for the shared configuration package that provides secure,
centralized configuration management with environment-specific settings for the
Art Knowledge Graph backend services.

Version: 1.0.0
"""

import os
import functools
from .settings import Settings, get_settings as _get_settings

# Default environment if not specified
DEFAULT_ENV = "development"

# Thread-safe singleton instance for settings
_settings_instance = None

@functools.lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Thread-safe factory function that creates and returns a validated settings
    instance for the current environment with caching support.
    
    Returns:
        Settings: Configured and validated settings instance for the current environment
        
    Raises:
        ValueError: If environment configuration is invalid
        FileNotFoundError: If required environment file is missing in production
    """
    # Get environment with fallback to default
    environment = os.getenv("ENVIRONMENT", DEFAULT_ENV).lower()
    
    # Use the implementation from settings module with caching
    return _get_settings(environment=environment)

# Export Settings class and get_settings function for use across services
__all__ = [
    "Settings",
    "get_settings"
]