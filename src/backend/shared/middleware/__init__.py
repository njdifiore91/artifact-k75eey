"""
Initialization module for shared middleware components providing centralized middleware
configuration, security controls, and observability features for the Art Knowledge Graph
backend services.
"""

from typing import List, Dict, Any
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.gzip import GZipMiddleware

from shared.middleware.error_handler import ErrorHandlerMiddleware, setup_error_handler
from shared.middleware.request_id import RequestIdMiddleware, setup_request_id
from shared.config.settings import Settings

# Middleware execution order - critical for security and monitoring
MIDDLEWARE_ORDER: List[str] = [
    "trusted_host",     # Host validation first
    "cors",            # CORS checks
    "request_id",      # Request tracking
    "security_headers", # Security headers
    "gzip",           # Compression
    "error_handler"    # Error handling last
]

def setup_middleware(app: FastAPI, settings: Settings) -> FastAPI:
    """
    Configures and sets up all shared middleware components for a FastAPI application
    with proper ordering, security controls, and observability features.

    Args:
        app: FastAPI application instance
        settings: Application settings

    Returns:
        FastAPI: Configured FastAPI application with security and monitoring middleware
    """
    # Security middleware configuration
    if settings.environment == "production":
        # Trusted Host Middleware
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=settings.allowed_origins,
            www_redirect=True
        )

    # CORS middleware with environment-specific settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=[
            "Content-Type",
            "Authorization",
            "X-Request-ID",
            "X-Correlation-ID"
        ],
        expose_headers=[
            "X-Request-ID",
            "X-Correlation-ID"
        ],
        max_age=600  # 10 minutes
    )

    # Request ID middleware for request tracking
    app = setup_request_id(
        app=app,
        header_name="X-Request-ID",
        service_name=settings.app_name
    )

    # Security headers middleware
    @app.middleware("http")
    async def add_security_headers(request: Any, call_next: Any) -> Any:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "img-src 'self' data: https:; "
            "style-src 'self' 'unsafe-inline'; "
            "script-src 'self'"
        )
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
            "magnetometer=(), microphone=(), payment=(), usb=()"
        )
        return response

    # Compression middleware
    app.add_middleware(
        GZipMiddleware,
        minimum_size=1000  # Only compress responses larger than 1KB
    )

    # Error handling middleware with enhanced security
    app = setup_error_handler(
        app=app,
        cache_size=1000,  # Cache size for error responses
        rate_limit=100    # Maximum error requests per minute
    )

    # Audit logging middleware
    @app.middleware("http")
    async def audit_logging(request: Any, call_next: Any) -> Any:
        from shared.logging.config import get_logger
        logger = get_logger("audit")
        
        # Log request details
        logger.info(
            "Request received",
            extra={
                "correlation_id": getattr(request.state, "request_id", None),
                "method": request.method,
                "path": request.url.path,
                "client_ip": request.client.host if request.client else None,
                "user_agent": request.headers.get("user-agent"),
                "environment": settings.environment
            }
        )
        
        response = await call_next(request)
        
        # Log response details
        logger.info(
            "Response sent",
            extra={
                "correlation_id": getattr(request.state, "request_id", None),
                "status_code": response.status_code,
                "content_length": len(response.body) if hasattr(response, "body") else 0
            }
        )
        
        return response

    return app

# Re-export middleware components for direct imports
__all__ = [
    "setup_middleware",
    "ErrorHandlerMiddleware",
    "RequestIdMiddleware",
    "MIDDLEWARE_ORDER"
]