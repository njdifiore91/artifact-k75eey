"""
Authentication service module providing centralized access to JWT, OAuth, and password management functionality.

This module serves as the main entry point for all authentication-related operations,
ensuring secure initialization and proper encapsulation of authentication services.

Exported Classes:
    - JWTManager: Handles JWT token operations
    - OAuthManager: Manages OAuth authentication flows
    - PasswordService: Provides password management functionality
"""

from .jwt import JWTManager
from .oauth import OAuthManager
from .password import PasswordService

# Define module version and metadata
__version__ = "1.0.0"
__author__ = "Art Knowledge Graph Team"

# Define public exports
__all__ = [
    "JWTManager",
    "OAuthManager",
    "PasswordService"
]

# Ensure all imported services are properly initialized
def __getattr__(name):
    """
    Lazy loading of authentication services to ensure proper initialization order
    and prevent circular dependencies.
    """
    if name in __all__:
        return globals()[name]
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")

def __dir__():
    """
    Return list of available attributes for proper code completion and inspection.
    """
    return __all__