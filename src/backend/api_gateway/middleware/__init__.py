"""
Middleware initialization module for the API Gateway service that configures and exports
all middleware components with enhanced monitoring capabilities, strict security controls,
and comprehensive logging integration with ELK Stack.
"""

from typing import Dict, Any
from fastapi import FastAPI
from shared.config.settings import Settings

# Import middleware components
from .auth import AuthMiddleware, setup_auth_middleware
from .cors import CORSConfig, setup_cors_middleware
from .logging import LoggingMiddleware, setup_logging_middleware

# Middleware execution order - critical for security and monitoring
MIDDLEWARE_ORDER = ["logging", "cors", "auth"]

def setup_middleware_stack(app: FastAPI, settings: Settings) -> FastAPI:
    """
    Configures and sets up the complete middleware stack with enhanced monitoring,
    security validation, and performance optimization.

    Args:
        app (FastAPI): FastAPI application instance
        settings (Settings): Application settings

    Returns:
        FastAPI: Configured FastAPI application with complete middleware stack
                and monitoring integration
    """
    # Initialize logging middleware first for complete request tracking
    logging_middleware = setup_logging_middleware(app, settings)

    # Configure CORS with security policies
    cors_middleware = setup_cors_middleware(app, settings)

    # Set up authentication middleware with JWT validation
    auth_middleware = setup_auth_middleware(app, settings)

    # Validate middleware configuration
    _validate_middleware_stack(
        logging_middleware=logging_middleware,
        cors_middleware=cors_middleware,
        auth_middleware=auth_middleware,
        settings=settings
    )

    # Configure middleware execution order
    _configure_middleware_order(app)

    return app

def _validate_middleware_stack(
    logging_middleware: LoggingMiddleware,
    cors_middleware: CORSConfig,
    auth_middleware: AuthMiddleware,
    settings: Settings
) -> None:
    """
    Validates the middleware stack configuration and security settings.

    Args:
        logging_middleware: Configured logging middleware
        cors_middleware: Configured CORS middleware
        auth_middleware: Configured authentication middleware
        settings: Application settings

    Raises:
        ValueError: If middleware configuration is invalid
    """
    # Validate logging middleware
    if not logging_middleware:
        raise ValueError("Logging middleware must be configured")

    # Validate CORS settings for production
    if settings.environment == "production":
        if "*" in cors_middleware._allowed_origins:
            raise ValueError("Wildcard CORS origins not allowed in production")

    # Validate authentication settings
    if not auth_middleware._jwt_manager:
        raise ValueError("JWT manager must be configured for authentication")

def _configure_middleware_order(app: FastAPI) -> None:
    """
    Configures middleware execution order based on security requirements.

    Args:
        app: FastAPI application instance
    """
    # Remove any existing middleware to prevent duplicates
    app.middleware_stack = None

    # Add middleware in specific order
    for middleware_type in MIDDLEWARE_ORDER:
        if middleware_type == "logging":
            app.middleware("http")(LoggingMiddleware)
        elif middleware_type == "cors":
            app.middleware("http")(CORSConfig)
        elif middleware_type == "auth":
            app.middleware("http")(AuthMiddleware)

# Export middleware components and setup function
__all__ = [
    "setup_middleware_stack",
    "AuthMiddleware",
    "CORSConfig",
    "LoggingMiddleware"
]