import time
import uuid
import logging
import re
from typing import Dict, List, Pattern, Callable, Optional
from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTleware, RequestResponseEndpoint
from starlette.responses import Response

from shared.logging.config import JsonFormatter
from shared.logging.handlers import CloudWatchHandler
from shared.config.settings import Settings

# Constants for logging configuration
EXCLUDED_PATHS = [
    '/health',
    '/metrics',
    '/docs',
    '/openapi.json',
    '/security/*',
    '/admin/*'
]

LOG_FORMAT = '''
{
    "timestamp": "%(asctime)s",
    "level": "%(levelname)s",
    "correlation_id": "%(correlation_id)s",
    "method": "%(method)s",
    "path": "%(path)s",
    "status": "%(status)s",
    "duration_ms": "%(duration_ms)s",
    "client_ip": "%(client_ip)s",
    "user_agent": "%(user_agent)s",
    "performance_metrics": %(performance_metrics)s
}
'''

SENSITIVE_PATTERNS = {
    'password': r'password[^\s]*',
    'token': r'token[^\s]*',
    'key': r'key[^\s]*',
    'secret': r'secret[^\s]*'
}

BATCH_SIZE = 100
SAMPLING_RATE = 1.0

class LoggingMiddleware(BaseHTleware):
    """Enhanced middleware for secure request/response logging with performance tracking."""

    def __init__(self, app: FastAPI, settings: Settings) -> None:
        """Initialize logging middleware with security and performance configurations."""
        super().__init__(app)
        
        # Initialize logger with JSON formatter
        self._logger = logging.getLogger("api_gateway")
        json_formatter = JsonFormatter()
        
        # Configure CloudWatch handler for production
        if settings.environment == "production":
            cloudwatch_handler = CloudWatchHandler(
                settings=settings,
                log_group="art-knowledge-graph",
                log_stream="api-gateway"
            )
            cloudwatch_handler.setFormatter(json_formatter)
            self._logger.addHandler(cloudwatch_handler)

        self._settings = settings
        self._exclude_paths = [re.compile(path.replace('*', '.*')) for path in EXCLUDED_PATHS]
        self._sensitive_patterns = {k: re.compile(v) for k, v in SENSITIVE_PATTERNS.items()}
        self._batch_size = BATCH_SIZE
        self._sampling_rate = SAMPLING_RATE

    def _mask_sensitive_data(self, data: Dict) -> Dict:
        """Mask sensitive information in request/response data."""
        masked_data = {}
        for key, value in data.items():
            if isinstance(value, dict):
                masked_data[key] = self._mask_sensitive_data(value)
            elif isinstance(value, str):
                masked_value = value
                for pattern in self._sensitive_patterns.values():
                    if pattern.search(key.lower()) or pattern.search(value.lower()):
                        masked_value = "****"
                        break
                masked_data[key] = masked_value
            else:
                masked_data[key] = value
        return masked_data

    async def log_request(self, request: Request, correlation_id: str) -> None:
        """Log incoming request details with sensitive data masking."""
        headers = dict(request.headers)
        masked_headers = self._mask_sensitive_data(headers)
        
        # Extract client information
        client_ip = request.client.host if request.client else "unknown"
        user_agent = headers.get("user-agent", "unknown")

        # Log request with correlation ID
        self._logger.info(
            "Incoming request",
            extra={
                "correlation_id": correlation_id,
                "method": request.method,
                "path": request.url.path,
                "client_ip": client_ip,
                "user_agent": user_agent,
                "headers": masked_headers,
                "query_params": dict(request.query_params),
                "performance_metrics": {}
            }
        )

    async def log_response(self, response: Response, duration_ms: float, correlation_id: str) -> None:
        """Log response details with performance metrics."""
        headers = dict(response.headers)
        masked_headers = self._mask_sensitive_data(headers)

        # Calculate performance metrics
        performance_metrics = {
            "response_time_ms": duration_ms,
            "status_code": response.status_code
        }

        # Log response with correlation ID and metrics
        self._logger.info(
            "Outgoing response",
            extra={
                "correlation_id": correlation_id,
                "status": response.status_code,
                "duration_ms": duration_ms,
                "headers": masked_headers,
                "performance_metrics": performance_metrics
            }
        )

    async def __call__(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Process request through middleware with logging and performance tracking."""
        # Skip excluded paths
        if any(pattern.match(request.url.path) for pattern in self._exclude_paths):
            return await call_next(request)

        # Generate correlation ID
        correlation_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
        
        # Apply sampling rate
        should_log = random.random() < self._sampling_rate

        if should_log:
            start_time = time.time()
            await self.log_request(request, correlation_id)

            try:
                response = await call_next(request)
                duration_ms = (time.time() - start_time) * 1000
                
                await self.log_response(response, duration_ms, correlation_id)
                
                # Add correlation ID to response headers
                response.headers["X-Correlation-ID"] = correlation_id
                
                return response
            except Exception as e:
                duration_ms = (time.time() - start_time) * 1000
                self._logger.error(
                    f"Request processing error: {str(e)}",
                    extra={
                        "correlation_id": correlation_id,
                        "duration_ms": duration_ms,
                        "error": str(e),
                        "performance_metrics": {"error_type": e.__class__.__name__}
                    }
                )
                raise
        else:
            return await call_next(request)

def setup_logging_middleware(app: FastAPI, settings: Settings) -> LoggingMiddleware:
    """Create and configure secure logging middleware."""
    middleware = LoggingMiddleware(app, settings)
    app.middleware("http")(middleware)
    return middleware