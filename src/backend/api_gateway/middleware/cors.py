from typing import List, Dict, Optional, Callable, Any
from functools import cache
import logging
from fastapi.middleware.cors import CORSMiddleware as FastAPICORSMiddleware
from starlette.middleware.cors import CORSMiddleware as StarletteCORSMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send
from starlette.requests import Request
from starlette.responses import Response
from api_gateway.config import APIGatewaySettings

# Version comments for external imports
# fastapi.middleware.cors: v0.100+
# starlette.middleware.cors: v0.27+

# Default CORS configuration
DEFAULT_ALLOWED_METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
DEFAULT_ALLOWED_HEADERS = [
    "Authorization", 
    "Content-Type", 
    "Accept", 
    "Origin", 
    "X-Requested-With",
    "X-API-Key"
]
DEFAULT_MAX_AGE = 600  # 10 minutes
CORS_CACHE_TTL = 300  # 5 minutes

class CORSMiddleware:
    """
    Enhanced CORS middleware implementation with advanced security features
    and dynamic configuration support for the Art Knowledge Graph API Gateway.
    """

    def __init__(
        self,
        app: ASGIApp,
        settings: APIGatewaySettings
    ) -> None:
        """Initialize the enhanced CORS middleware with security-focused configuration."""
        self.app = app
        self._settings = settings
        self._logger = logging.getLogger("api_gateway.cors")
        
        # Initialize CORS settings from configuration
        security_controls = settings.security_controls.get("default", {})
        self._allowed_origins = security_controls.cors_origins
        self._allowed_methods = DEFAULT_ALLOWED_METHODS
        self._allowed_headers = DEFAULT_ALLOWED_HEADERS
        self._allow_credentials = False
        self._max_age = DEFAULT_MAX_AGE
        
        # Initialize origin validation cache
        self._origin_cache: Dict[str, bool] = {}
        
        # Configure logging
        self._logger.setLevel(logging.INFO if settings.environment == "production" else logging.DEBUG)

    @cache(maxsize=1000, ttl=CORS_CACHE_TTL)
    def is_origin_allowed(self, origin: str) -> bool:
        """
        Enhanced origin validation with caching and security checks.
        
        Args:
            origin: The origin to validate
            
        Returns:
            bool: Whether the origin is allowed
        """
        if not origin:
            return False

        # Check cache first
        if origin in self._origin_cache:
            return self._origin_cache[origin]

        # Validate origin format
        if not origin.startswith(("http://", "https://")):
            self._logger.warning(f"Invalid origin format: {origin}")
            return False

        # Production environment requires explicit origins
        if self._settings.environment == "production" and "*" in self._allowed_origins:
            self._logger.error("Wildcard origins not allowed in production")
            return False

        # Check against allowed origins
        is_allowed = False
        for allowed_origin in self._allowed_origins:
            if allowed_origin == "*" and self._settings.environment != "production":
                is_allowed = True
                break
            if origin == allowed_origin:
                is_allowed = True
                break
            # Handle wildcard subdomains if configured
            if allowed_origin.startswith("*."):
                domain_suffix = allowed_origin[1:]
                if origin.endswith(domain_suffix):
                    is_allowed = True
                    break

        # Cache the result
        self._origin_cache[origin] = is_allowed
        return is_allowed

    async def process_preflight(self, request: Request) -> Response:
        """
        Enhanced preflight request handler with security validations.
        
        Args:
            request: The preflight request
            
        Returns:
            Response: Secure preflight response
        """
        origin = request.headers.get("origin")
        if not self.is_origin_allowed(origin):
            self._logger.warning(f"Preflight blocked for origin: {origin}")
            return Response(status_code=400)

        # Validate requested method
        requested_method = request.headers.get("access-control-request-method")
        if requested_method and requested_method not in self._allowed_methods:
            self._logger.warning(f"Invalid method requested: {requested_method}")
            return Response(status_code=400)

        # Validate requested headers
        requested_headers = request.headers.get("access-control-request-headers")
        if requested_headers:
            headers = [h.strip().lower() for h in requested_headers.split(",")]
            allowed_headers = [h.lower() for h in self._allowed_headers]
            if not all(h in allowed_headers for h in headers):
                self._logger.warning(f"Invalid headers requested: {requested_headers}")
                return Response(status_code=400)

        response = Response(
            status_code=200,
            headers={
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": ",".join(self._allowed_methods),
                "Access-Control-Allow-Headers": ",".join(self._allowed_headers),
                "Access-Control-Max-Age": str(self._max_age),
                "Vary": "Origin"
            }
        )

        if self._allow_credentials:
            response.headers["Access-Control-Allow-Credentials"] = "true"

        return response

    async def __call__(
        self,
        scope: Scope,
        receive: Receive,
        send: Send
    ) -> None:
        """
        Main middleware handler with enhanced security and monitoring.
        
        Args:
            scope: ASGI scope
            receive: ASGI receive function
            send: ASGI send function
        """
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive=receive)
        
        # Log request details at debug level
        self._logger.debug(f"Processing CORS for request: {request.url.path}")

        # Handle preflight requests
        if request.method == "OPTIONS":
            response = await self.process_preflight(request)
            await response(scope, receive, send)
            return

        # Process actual request
        origin = request.headers.get("origin")
        
        async def send_wrapper(message: Dict[str, Any]) -> None:
            if message["type"] == "http.response.start":
                headers = dict(message.get("headers", []))
                
                if origin and self.is_origin_allowed(origin):
                    headers[b"access-control-allow-origin"] = origin.encode()
                    headers[b"vary"] = b"Origin"
                    
                    if self._allow_credentials:
                        headers[b"access-control-allow-credentials"] = b"true"
                
                message["headers"] = [(k, v) for k, v in headers.items()]
            
            await send(message)

        await self.app(scope, receive, send_wrapper)

def setup_cors_middleware(
    app: ASGIApp,
    settings: APIGatewaySettings
) -> CORSMiddleware:
    """
    Enhanced factory function for CORS middleware setup with security focus.
    
    Args:
        app: The ASGI application
        settings: API Gateway settings
        
    Returns:
        CORSMiddleware: Configured secure CORS middleware
    """
    return CORSMiddleware(app=app, settings=settings)