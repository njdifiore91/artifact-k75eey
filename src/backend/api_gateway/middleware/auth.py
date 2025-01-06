"""
Authentication middleware for the API Gateway that handles JWT token validation,
role-based access control, request authentication, rate limiting, and comprehensive
security controls for the Art Knowledge Graph application.
"""

from typing import Dict, Any, Optional, Callable
from datetime import datetime, timezone
import logging
import redis

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from jose import JWTError

from auth_service.services.jwt import JWTManager
from shared.middleware.error_handler import ErrorHandlerMiddleware
from shared.config.settings import Settings
from shared.logging.config import get_logger

# Constants for authentication and security
PUBLIC_PATHS = ['/docs', '/redoc', '/openapi.json', '/health', '/metrics']
BEARER_FORMAT = "Bearer {}"
ROLE_HIERARCHY = {
    "admin": 3,
    "premium": 2,
    "free_user": 1,
    "anonymous": 0
}
MAX_AUTH_ATTEMPTS = 5
RATE_LIMIT_WINDOW = 300  # 5 minutes

logger = get_logger(__name__)

class AuthMiddleware(BaseHTTPMiddleware):
    """
    Enhanced middleware class that handles request authentication, authorization,
    rate limiting, and security controls.
    """

    def __init__(self, app: Any, settings: Settings):
        """
        Initialize auth middleware with enhanced security features.

        Args:
            app: FastAPI application instance
            settings: Application settings
        """
        super().__init__(app)
        self._jwt_manager = JWTManager(settings)
        self._settings = settings
        self._public_paths = set(PUBLIC_PATHS)
        
        # Initialize Redis for rate limiting and token blacklist
        self._rate_limiter = redis.Redis.from_url(
            settings.redis_uri.get_secret_value(),
            decode_responses=True
        )
        
        logger.info("Authentication middleware initialized with security controls")

    async def authenticate_request(self, request: Request) -> Dict[str, Any]:
        """
        Authenticates an incoming request with enhanced security checks.

        Args:
            request: FastAPI request object

        Returns:
            dict: Validated token claims

        Raises:
            ValueError: If authentication fails
        """
        # Check rate limit
        client_ip = request.client.host if request.client else "unknown"
        rate_key = f"auth_rate:{client_ip}"
        
        if int(self._rate_limiter.get(rate_key) or 0) >= MAX_AUTH_ATTEMPTS:
            logger.warning(f"Rate limit exceeded for IP: {client_ip}")
            raise ValueError("Too many authentication attempts")

        # Extract and validate token
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise ValueError("Invalid authorization header")

        token = auth_header.replace("Bearer ", "")

        try:
            # Verify token and claims
            claims = self._jwt_manager.verify_token(token)
            
            # Log successful authentication
            logger.info(
                "Request authenticated successfully",
                extra={
                    "user_id": claims.get("sub"),
                    "role": claims.get("role"),
                    "path": request.url.path
                }
            )

            return claims

        except JWTError as e:
            # Increment rate limit counter
            self._rate_limiter.incr(rate_key)
            self._rate_limiter.expire(rate_key, RATE_LIMIT_WINDOW)
            
            logger.warning(
                "Authentication failed",
                extra={
                    "error": str(e),
                    "ip": client_ip,
                    "path": request.url.path
                }
            )
            raise ValueError("Invalid authentication token")

    def check_permissions(self, claims: Dict[str, Any], required_role: str) -> bool:
        """
        Enhanced permission checking with role hierarchy.

        Args:
            claims: Validated token claims
            required_role: Required role for access

        Returns:
            bool: Permission check result
        """
        user_role = claims.get("role", "anonymous")
        
        if user_role not in ROLE_HIERARCHY or required_role not in ROLE_HIERARCHY:
            logger.warning(
                "Invalid role encountered",
                extra={
                    "user_role": user_role,
                    "required_role": required_role
                }
            )
            return False

        # Check role hierarchy
        has_permission = ROLE_HIERARCHY[user_role] >= ROLE_HIERARCHY[required_role]
        
        logger.debug(
            "Permission check completed",
            extra={
                "user_role": user_role,
                "required_role": required_role,
                "granted": has_permission
            }
        )

        return has_permission

    async def __call__(self, request: Request, call_next: Callable) -> Response:
        """
        Enhanced middleware entry point with security controls.

        Args:
            request: FastAPI request object
            call_next: Next middleware in chain

        Returns:
            Response: HTTP response
        """
        # Skip authentication for public paths
        if request.url.path in self._public_paths:
            return await call_next(request)

        try:
            # Authenticate request
            claims = await self.authenticate_request(request)
            
            # Get required role from path operation
            required_role = getattr(
                request.state, "required_role",
                "free_user"  # Default minimum role
            )

            # Check permissions
            if not self.check_permissions(claims, required_role):
                logger.warning(
                    "Permission denied",
                    extra={
                        "user_id": claims.get("sub"),
                        "role": claims.get("role"),
                        "required_role": required_role,
                        "path": request.url.path
                    }
                )
                raise ValueError("Insufficient permissions")

            # Add claims to request state
            request.state.user_claims = claims
            
            # Process request
            response = await call_next(request)

            # Add security headers
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            
            return response

        except Exception as e:
            # Handle errors through error middleware
            return await ErrorHandlerMiddleware.handle_auth_error(
                request=request,
                error=str(e),
                status_code=401 if "Invalid" in str(e) else 403
            )

def setup_auth_middleware(app: Any, settings: Settings) -> AuthMiddleware:
    """
    Enhanced factory function to create and configure auth middleware with security features.

    Args:
        app: FastAPI application instance
        settings: Application settings

    Returns:
        AuthMiddleware: Configured auth middleware instance
    """
    # Initialize middleware
    auth_middleware = AuthMiddleware(app, settings)
    
    # Add middleware to app
    app.add_middleware(AuthMiddleware)
    
    logger.info("Authentication middleware configured successfully")
    return auth_middleware