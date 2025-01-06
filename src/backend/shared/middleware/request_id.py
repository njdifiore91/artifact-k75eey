"""
Enhanced request ID middleware for tracking and correlating requests across microservices.
Provides comprehensive request tracking with security monitoring capabilities.
"""

import re
import time
import uuid
from typing import Optional, Dict, Callable
from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp, Message, Receive, Scope, Send
from shared.logging.config import get_logger

# Constants for request ID configuration
DEFAULT_REQUEST_ID_HEADER = "X-Request-ID"
LOGGER_NAME = "request_id_middleware"
REQUEST_ID_FORMAT = r"^[0-9]{14}-[a-zA-Z0-9]+-[a-f0-9]{32}$"
REQUEST_ID_CACHE_SIZE = 10000

class RequestIdMiddleware(BaseHTTPMiddleware):
    """
    Enhanced middleware for managing request IDs with improved logging and security features.
    Implements request tracing and correlation across microservices.
    """

    def __init__(
        self,
        app: ASGIApp,
        header_name: str = DEFAULT_REQUEST_ID_HEADER,
        service_name: str = "art_knowledge_graph"
    ) -> None:
        """
        Initialize the request ID middleware with enhanced configuration.

        Args:
            app: The ASGI application
            header_name: Custom header name for request ID
            service_name: Service identifier for request ID prefix
        """
        super().__init__(app)
        self.request_id_header = header_name
        self.logger = get_logger(LOGGER_NAME)
        self.service_name = service_name.lower().replace(" ", "_")
        self._request_id_pattern = re.compile(REQUEST_ID_FORMAT)
        self._request_id_cache = {}
        self._cache_timestamps = []

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint
    ) -> Response:
        """
        Process requests with enhanced logging and security monitoring.

        Args:
            request: The incoming request
            call_next: The next request handler

        Returns:
            Response with added request ID and tracking headers
        """
        # Extract or generate request ID
        request_id = request.headers.get(self.request_id_header)
        
        if request_id and not self._is_valid_request_id(request_id):
            self.logger.warning(
                "Invalid request ID format detected",
                extra={
                    "request_id": request_id,
                    "client_ip": request.client.host,
                    "path": request.url.path
                }
            )
            request_id = None

        if not request_id:
            request_id = self.generate_request_id()

        # Add request context
        request.state.request_id = request_id
        request.state.request_timestamp = time.time()
        
        # Enhanced logging with security context
        self.logger.info(
            "Processing request",
            extra={
                "correlation_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "client_ip": request.client.host,
                "user_agent": request.headers.get("user-agent"),
                "metrics": {
                    "timestamp": time.time(),
                    "request_size": len(request.headers)
                }
            }
        )

        # Process request
        response = await call_next(request)

        # Add response headers
        response.headers[self.request_id_header] = request_id
        response.headers["X-Correlation-ID"] = request_id
        
        # Calculate request duration
        duration = time.time() - request.state.request_timestamp
        
        # Log response with performance metrics
        self.logger.info(
            "Request completed",
            extra={
                "correlation_id": request_id,
                "status_code": response.status_code,
                "duration_ms": round(duration * 1000, 2),
                "response_size": len(response.headers),
                "metrics": {
                    "response_time": duration,
                    "status_category": str(response.status_code)[0]
                }
            }
        )

        return response

    def generate_request_id(self) -> str:
        """
        Generate a unique request ID with enhanced format.
        Format: timestamp-service-uuid

        Returns:
            Formatted request ID string
        """
        timestamp = time.strftime("%Y%m%d%H%M%S")
        unique_id = str(uuid.uuid4()).replace("-", "")
        request_id = f"{timestamp}-{self.service_name}-{unique_id}"

        # Cache management for duplicate detection
        self._cache_request_id(request_id)

        return request_id

    def _is_valid_request_id(self, request_id: str) -> bool:
        """
        Validate request ID format and uniqueness.

        Args:
            request_id: Request ID to validate

        Returns:
            Boolean indicating validity
        """
        if not self._request_id_pattern.match(request_id):
            return False

        # Check for duplicates in cache
        if request_id in self._request_id_cache:
            self.logger.warning(
                "Duplicate request ID detected",
                extra={"request_id": request_id}
            )
            return False

        return True

    def _cache_request_id(self, request_id: str) -> None:
        """
        Cache request ID with LRU eviction policy.

        Args:
            request_id: Request ID to cache
        """
        current_time = time.time()
        
        # Evict old entries
        while len(self._request_id_cache) >= REQUEST_ID_CACHE_SIZE:
            oldest_timestamp = self._cache_timestamps[0]
            oldest_id = self._request_id_cache[oldest_timestamp]
            del self._request_id_cache[oldest_timestamp]
            self._cache_timestamps.pop(0)
            
            self.logger.debug(
                "Evicted old request ID from cache",
                extra={"request_id": oldest_id}
            )

        self._request_id_cache[current_time] = request_id
        self._cache_timestamps.append(current_time)

def setup_request_id(
    app: FastAPI,
    header_name: str = DEFAULT_REQUEST_ID_HEADER,
    service_name: str = "art_knowledge_graph"
) -> FastAPI:
    """
    Configure request ID middleware for FastAPI application.

    Args:
        app: FastAPI application instance
        header_name: Custom header name for request ID
        service_name: Service identifier for request ID prefix

    Returns:
        Configured FastAPI application
    """
    middleware = RequestIdMiddleware(
        app=app,
        header_name=header_name,
        service_name=service_name
    )
    
    app.add_middleware(BaseHTTPMiddleware, dispatch=middleware.dispatch)
    
    return app