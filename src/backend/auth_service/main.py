import logging
from typing import Dict, Any

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware
import structlog
from structlog.stdlib import LoggerFactory

from auth_service.config import AuthServiceSettings

# Initialize FastAPI with security-focused configuration
app = FastAPI(
    title="Art Knowledge Graph Auth Service",
    version="1.0.0",
    docs_url=None,  # Disable Swagger UI in production
    redoc_url=None,  # Disable ReDoc in production
    openapi_url=None  # Disable OpenAPI schema in production
)

# Initialize settings with validation
settings = AuthServiceSettings()

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

class SecurityMiddleware(BaseHTTPMiddleware):
    """Custom security middleware for enhanced request/response processing."""
    
    async def dispatch(self, request: Request, call_next) -> Response:
        try:
            # Add security headers
            response = await call_next(request)
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            response.headers["Content-Security-Policy"] = "default-src 'self'"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            response.headers["Permissions-Policy"] = "geolocation=(), microphone=()"
            
            return response
        except Exception as e:
            logger.error("security_middleware_error", error=str(e))
            raise

class AuthService:
    """Enhanced authentication service with comprehensive security features."""
    
    def __init__(self, settings: AuthServiceSettings):
        self._settings = settings
        self._logger = structlog.get_logger()
        self._metrics = Instrumentator()
        self.setup_security()
        self.setup_monitoring()

    def setup_security(self) -> None:
        """Configure security features and middleware."""
        # CORS configuration with strict options
        app.add_middleware(
            CORSMiddleware,
            allow_origins=self._settings.allowed_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST"],
            allow_headers=["Authorization", "Content-Type"],
            max_age=3600
        )

        # Add security middleware
        app.add_middleware(SecurityMiddleware)
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])  # Configure in production
        app.add_middleware(GZipMiddleware, minimum_size=1000)
        app.add_middleware(
            SessionMiddleware,
            secret_key=self._settings.jwt_secret_key.get_secret_value(),
            max_age=1800,  # 30 minutes
            same_site="strict",
            https_only=True
        )

    def setup_monitoring(self) -> None:
        """Configure security monitoring and metrics collection."""
        self._metrics.instrument(app).add(
            metrics_prefix="auth_service",
            excluded_handlers=["/health"],
            round_latency_decimals=3
        ).add_middleware_handler(
            handler_name="security_metrics"
        ).expose(app, include_in_schema=False, tags=["monitoring"])

@app.on_event("startup")
async def startup() -> None:
    """Enhanced startup event handler with security initialization."""
    try:
        # Validate environment and configuration
        settings.validate_environment()
        
        # Initialize authentication service
        auth_service = AuthService(settings)
        
        # Configure logging
        logging.basicConfig(
            level=getattr(logging, settings.log_level.upper()),
            format=settings.log_format
        )
        
        logger.info(
            "auth_service_startup",
            environment=settings.environment,
            version="1.0.0"
        )
        
    except Exception as e:
        logger.error("startup_error", error=str(e))
        raise

@app.on_event("shutdown")
async def shutdown() -> None:
    """Enhanced shutdown event handler with secure cleanup."""
    try:
        logger.info("auth_service_shutdown")
        # Perform cleanup tasks
        # Note: Specific cleanup tasks will be implemented in route handlers
        
    except Exception as e:
        logger.error("shutdown_error", error=str(e))
        raise

# Health check endpoint
@app.get("/health", include_in_schema=False)
async def health_check() -> Dict[str, Any]:
    """Basic health check endpoint."""
    return {
        "status": "healthy",
        "service": "auth_service",
        "version": "1.0.0"
    }

# Export FastAPI instance
export_app = app