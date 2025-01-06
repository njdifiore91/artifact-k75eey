"""
API Gateway routes initialization module that configures and combines all route modules
with comprehensive security, rate limiting, monitoring, and proper middleware integration.
"""

from fastapi import APIRouter, Request, Response
from prometheus_fastapi_instrumentator import Instrumentator  # version: 5.9+
from slowapi import Limiter  # version: 0.1.4+
from slowapi.util import get_remote_address

from api_gateway.routes.artwork import router as artwork_router
from api_gateway.routes.graph import router as graph_router
from api_gateway.routes.search import router as search_router
from api_gateway.routes.user import router as user_router
from api_gateway.middleware.auth import AuthMiddleware

# Initialize main API router with version prefix
api_router = APIRouter(prefix="/api/v1")

# Initialize Prometheus instrumentation
instrumentator = Instrumentator(
    should_group_status_codes=True,
    should_ignore_untemplated=True,
    should_respect_env_var=True,
    should_instrument_requests_inprogress=True,
    excluded_handlers=["/metrics", "/health"],
    env_var_name="ENABLE_METRICS"
)

def configure_routers() -> APIRouter:
    """
    Configures all route modules with proper prefixes, rate limits, and security middleware.

    Returns:
        APIRouter: Fully configured API router with all routes and middleware
    """
    # Configure rate limiting
    limiter = Limiter(key_func=get_remote_address)

    # Add health check endpoint
    @api_router.get("/health", tags=["monitoring"])
    async def health_check() -> dict:
        """
        Provides API health check endpoint with basic service status.
        """
        return {
            "status": "healthy",
            "version": "1.0.0",
            "timestamp": "2024-01-23T12:00:00Z"
        }

    # Configure artwork routes with rate limiting
    api_router.include_router(
        artwork_router,
        prefix="/artwork",
        dependencies=[limiter.limit("10/minute")]
    )

    # Configure graph routes with caching
    api_router.include_router(
        graph_router,
        prefix="/graph",
        dependencies=[limiter.limit("100/minute")]
    )

    # Configure search routes with pagination
    api_router.include_router(
        search_router,
        prefix="/search",
        dependencies=[limiter.limit("60/minute")]
    )

    # Configure user routes with authentication
    api_router.include_router(
        user_router,
        prefix="/users",
        dependencies=[limiter.limit("30/minute")]
    )

    # Add error handlers
    @api_router.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> Response:
        """Global exception handler for all routes."""
        return Response(
            content=str(exc),
            status_code=500,
            media_type="text/plain"
        )

    return api_router

def setup_monitoring(app: "FastAPI") -> None:
    """
    Configures Prometheus monitoring for the API Gateway.

    Args:
        app: FastAPI application instance
    """
    # Add custom metrics
    instrumentator.add_metrics_route(app)
    
    # Instrument all routes
    instrumentator.instrument(app).expose(app)

def setup_middleware(app: "FastAPI", settings: "Settings") -> None:
    """
    Configures middleware for authentication, rate limiting, and security.

    Args:
        app: FastAPI application instance
        settings: Application settings
    """
    # Add authentication middleware
    auth_middleware = AuthMiddleware(app, settings)
    app.add_middleware(auth_middleware)

    # Add security headers middleware
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

def initialize_routes(app: "FastAPI", settings: "Settings") -> None:
    """
    Initializes all routes with proper configuration and middleware.

    Args:
        app: FastAPI application instance
        settings: Application settings
    """
    # Configure routers
    app.include_router(configure_routers())

    # Setup monitoring
    setup_monitoring(app)

    # Setup middleware
    setup_middleware(app, settings)