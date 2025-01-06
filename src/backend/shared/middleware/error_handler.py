"""
FastAPI middleware for centralized error handling and standardized error response formatting
with enhanced security controls and monitoring integration for the Art Knowledge Graph application.
"""

from typing import Dict, Any, Callable, Optional
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
import traceback
from datetime import datetime, timezone
import uuid
from collections import OrderedDict

from shared.schemas.error import ErrorResponse
from shared.logging.config import get_logger

# Initialize configured logger with ELK Stack integration
logger = get_logger(__name__)

# Constants for error handling configuration
ERROR_CACHE_SIZE = 1000  # Maximum number of cached error responses
ERROR_RATE_LIMIT = 100   # Maximum error requests per minute

class RateLimiter:
    """Rate limiter for error endpoints to prevent abuse."""
    
    def __init__(self, limit: int, window: int = 60):
        self.limit = limit
        self.window = window
        self.requests = OrderedDict()

    def is_allowed(self, key: str) -> bool:
        """Check if request is within rate limits."""
        now = datetime.now(timezone.utc)
        self._cleanup(now)
        
        if key not in self.requests:
            self.requests[key] = []
        
        requests = self.requests[key]
        if len(requests) >= self.limit:
            return False
            
        requests.append(now)
        self.requests[key] = requests
        return True

    def _cleanup(self, now: datetime) -> None:
        """Remove expired entries."""
        cutoff = now.timestamp() - self.window
        for key, times in list(self.requests.items()):
            valid_times = [t for t in times if t.timestamp() > cutoff]
            if valid_times:
                self.requests[key] = valid_times
            else:
                del self.requests[key]

class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """
    Middleware providing centralized error handling with enhanced security controls,
    monitoring integration, and standardized error responses.
    """

    def __init__(self, app: Any, cache_size: int = ERROR_CACHE_SIZE, 
                 rate_limit: int = ERROR_RATE_LIMIT):
        super().__init__(app)
        self.logger = logger
        self.error_cache = OrderedDict()
        self.cache_size = cache_size
        self.rate_limiter = RateLimiter(rate_limit)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request with error handling and security controls."""
        correlation_id = str(uuid.uuid4())
        client_ip = request.client.host if request.client else "unknown"
        
        # Check rate limits
        if not self.rate_limiter.is_allowed(client_ip):
            return await self._handle_rate_limit(request, correlation_id)

        try:
            # Process request
            response = await call_next(request)
            return response

        except Exception as exc:
            return await self.handle_error(request, exc, correlation_id)

    async def handle_error(self, request: Request, exc: Exception, 
                          correlation_id: str) -> Response:
        """Handle exceptions with security controls and monitoring."""
        # Generate cache key
        cache_key = self._generate_cache_key(request, exc)

        try:
            # Check cache for similar errors
            if cache_key in self.error_cache:
                error_response = self.error_cache[cache_key]
                self._update_cache_order(cache_key)
            else:
                # Create new error response
                error_response = await self._create_error_response(
                    request, exc, correlation_id
                )
                self._cache_error_response(cache_key, error_response)

            # Log error with security context
            self._log_error(request, exc, correlation_id, error_response)

            # Return secured error response
            return error_response.to_response()

        except Exception as handler_exc:
            # Fallback error handling
            self.logger.error(
                "Error handler failed",
                extra={
                    "correlation_id": correlation_id,
                    "error": str(handler_exc),
                    "original_error": str(exc),
                    "traceback": traceback.format_exc()
                }
            )
            return ErrorResponse(
                code="internal_error",
                message="An unexpected error occurred",
                request_id=correlation_id
            ).to_response()

    async def _handle_rate_limit(self, request: Request, 
                                correlation_id: str) -> Response:
        """Handle rate limit exceeded cases."""
        error_response = ErrorResponse(
            code="rate_limit_exceeded",
            message="Too many error requests. Please try again later.",
            request_id=correlation_id
        )
        
        self.logger.warning(
            "Rate limit exceeded for error endpoints",
            extra={
                "correlation_id": correlation_id,
                "client_ip": request.client.host if request.client else "unknown",
                "path": request.url.path
            }
        )
        
        return error_response.to_response()

    async def _create_error_response(self, request: Request, exc: Exception, 
                                   correlation_id: str) -> ErrorResponse:
        """Create secure error response with proper information exposure."""
        return ErrorResponse.from_exception(
            exc=exc,
            request_id=correlation_id
        )

    def _cache_error_response(self, key: str, response: ErrorResponse) -> None:
        """Cache error response with LRU policy."""
        if len(self.error_cache) >= self.cache_size:
            self.error_cache.popitem(last=False)
        self.error_cache[key] = response

    def _update_cache_order(self, key: str) -> None:
        """Update LRU cache order."""
        self.error_cache.move_to_end(key)

    def _generate_cache_key(self, request: Request, exc: Exception) -> str:
        """Generate secure cache key for error responses."""
        return f"{request.url.path}:{type(exc).__name__}:{str(exc)}"

    def _log_error(self, request: Request, exc: Exception, correlation_id: str,
                   error_response: ErrorResponse) -> None:
        """Log error with security context and monitoring data."""
        log_data = {
            "correlation_id": correlation_id,
            "error_code": error_response.code,
            "path": request.url.path,
            "method": request.method,
            "client_ip": request.client.host if request.client else "unknown",
            "user_agent": request.headers.get("user-agent", "unknown"),
            "exception_type": type(exc).__name__,
            "exception_message": str(exc),
            "status_code": error_response.status_code,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        if error_response.status_code >= 500:
            log_data["traceback"] = traceback.format_exc()
            self.logger.error("Internal server error", extra=log_data)
        else:
            self.logger.warning("Request error", extra=log_data)

def setup_error_handler(app: Any, cache_size: int = ERROR_CACHE_SIZE,
                       rate_limit: int = ERROR_RATE_LIMIT) -> ErrorHandlerMiddleware:
    """Configure and add error handler middleware to FastAPI application."""
    handler = ErrorHandlerMiddleware(app, cache_size, rate_limit)
    return handler