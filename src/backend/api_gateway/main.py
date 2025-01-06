"""
Main entry point for the Art Knowledge Graph API Gateway service.
Implements comprehensive API routing, security controls, monitoring,
and error handling with production-grade features.
"""

import logging
import uvicorn
from typing import Dict, Any
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from secure import SecureHeaders
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from api_gateway.config import APIGatewaySettings
from api_gateway.middleware.auth import setup_auth_middleware
from shared.middleware.error_handler import setup_error_handler
from shared.logging.config import setup_logging, get_logger

# Initialize structured logger
logger = get_logger(__name__)

# Initialize secure headers
secure_headers = SecureHeaders(
    server=False,
    hsts=True,
    xfo="DENY",
    xxp=True,
    csp={
        'default-src': "'self'",
        'img-src': "'self' data: https:",
        'script-src': "'self'",
        'style-src': "'self' 'unsafe-inline'",
        'frame-ancestors': "'none'"
    }
)

def create_app() -> FastAPI:
    """
    Create and configure FastAPI application with comprehensive security and monitoring.
    
    Returns:
        FastAPI: Configured application instance
    """
    # Initialize FastAPI with OpenAPI configuration
    app = FastAPI(
        title="Art Knowledge Graph API",
        description="API Gateway for Art Knowledge Graph services",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json"
    )
    
    return app

def configure_middleware(app: FastAPI, settings: APIGatewaySettings) -> None:
    """
    Configure comprehensive middleware stack with security and monitoring features.
    
    Args:
        app: FastAPI application instance
        settings: API Gateway settings
    """
    # Security middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.security_controls["default"].cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-Correlation-ID"]
    )
    
    # Authentication middleware
    setup_auth_middleware(app, settings)
    
    # Error handling middleware
    setup_error_handler(app)
    
    # Compression middleware
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    
    # Request ID middleware
    class RequestIDMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            request.state.correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = request.state.correlation_id
            return response
    
    app.add_middleware(RequestIDMiddleware)
    
    # Security headers middleware
    @app.middleware("http")
    async def add_secure_headers(request: Request, call_next):
        response = await call_next(request)
        secure_headers.framework.fastapi(response)
        return response

def configure_monitoring(app: FastAPI) -> None:
    """
    Configure comprehensive monitoring and observability features.
    
    Args:
        app: FastAPI application instance
    """
    # Initialize Prometheus metrics
    Instrumentator().instrument(app).expose(app, include_in_schema=False)
    
    # Health check endpoint
    @app.get("/health")
    async def health_check():
        return {"status": "healthy", "timestamp": datetime.now(timezone.utc)}
    
    # Version endpoint
    @app.get("/version")
    async def version():
        return {"version": "1.0.0", "environment": settings.environment}

def configure_routes(app: FastAPI) -> None:
    """
    Configure API routes with versioning and documentation.
    
    Args:
        app: FastAPI application instance
    """
    # Import route modules
    from api_gateway.routes import artwork, graph, search, user
    
    # Include route modules with version prefix
    app.include_router(
        artwork.router,
        prefix="/api/v1/artwork",
        tags=["artwork"]
    )
    app.include_router(
        graph.router,
        prefix="/api/v1/graph",
        tags=["graph"]
    )
    app.include_router(
        search.router,
        prefix="/api/v1/search",
        tags=["search"]
    )
    app.include_router(
        user.router,
        prefix="/api/v1/user",
        tags=["user"]
    )

@logger.catch
def main() -> None:
    """
    Main entry point for the API Gateway service.
    Initializes and starts the service with all configurations.
    """
    try:
        # Load settings
        settings = APIGatewaySettings()
        
        # Configure logging
        setup_logging(settings)
        logger.info("Starting API Gateway service")
        
        # Create FastAPI application
        app = create_app()
        
        # Configure components
        configure_middleware(app, settings)
        configure_monitoring(app)
        configure_routes(app)
        
        # Start server
        uvicorn.run(
            app,
            host=settings.host,
            port=settings.port,
            log_level=settings.log_level.lower(),
            proxy_headers=True,
            forwarded_allow_ips="*",
            access_log=True,
            ssl_keyfile=settings.ssl_config.get("keyfile"),
            ssl_certfile=settings.ssl_config.get("certfile"),
            ssl_ca_certs=settings.ssl_config.get("ca_certs")
        )
        
    except Exception as e:
        logger.error(f"Failed to start API Gateway: {str(e)}")
        raise

if __name__ == "__main__":
    main()