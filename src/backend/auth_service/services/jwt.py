"""
JWT (JSON Web Token) service module that handles token generation, validation, and management
for the Art Knowledge Graph authentication system with enhanced security features and 
comprehensive token lifecycle management.
"""

from datetime import datetime, timedelta, timezone
from typing import Dict, Optional
import logging
import uuid

from jose import jwt, JWTError, ExpiredSignatureError  # python-jose[cryptography] v3.3.0
from auth_service.models.user import User
from shared.config.settings import Settings
from shared.utils.security import SecurityManager

# Token configuration constants
TOKEN_TYPE_CLAIM = "access"
TOKEN_ISSUER = "art_knowledge_graph"
REFRESH_GRACE_PERIOD_MINUTES = 60
MAX_TOKEN_AGE_MINUTES = 1440  # 24 hours
REQUIRED_CLAIMS = ["sub", "exp", "iat", "type", "iss", "jti"]

class JWTManager:
    """
    Manages JWT token operations including generation, validation, refresh, and blacklisting
    with enhanced security features.
    """

    def __init__(self, settings: Settings):
        """
        Initialize JWT manager with configuration settings and security features.

        Args:
            settings: Application settings instance
        """
        self._logger = logging.getLogger(__name__)
        self._secret_key = settings.secret_key.get_secret_value()
        self._algorithm = settings.algorithm
        self._token_expire_minutes = settings.access_token_expire_minutes
        self._token_blacklist = set()
        self._security_manager = SecurityManager(settings)

        # Validate JWT configuration
        if self._algorithm not in {"RS256", "HS256", "HS384", "HS512"}:
            raise ValueError(f"Unsupported JWT algorithm: {self._algorithm}")
        if self._token_expire_minutes < 15:
            raise ValueError("Token expiration time too short")

        self._logger.info("JWTManager initialized with enhanced security features")

    def create_access_token(self, user: User) -> str:
        """
        Creates a new JWT access token for a user with enhanced security claims.

        Args:
            user: User instance for token generation

        Returns:
            str: Encoded JWT token with security features
        """
        try:
            # Generate unique token ID
            token_id = str(uuid.uuid4())

            # Get current timestamp
            now = datetime.now(timezone.utc)
            expiration = now + timedelta(minutes=self._token_expire_minutes)

            # Create token claims with enhanced security
            claims = {
                "sub": str(user.id),
                "email": user.email,
                "role": user.role,
                "type": TOKEN_TYPE_CLAIM,
                "iss": TOKEN_ISSUER,
                "iat": now,
                "exp": expiration,
                "jti": token_id,
                # Additional security claims
                "scope": ["access"],
                "version": "1.0"
            }

            # Generate token with security features
            token = jwt.encode(
                claims=claims,
                key=self._secret_key,
                algorithm=self._algorithm,
                headers={
                    "kid": self._security_manager.generate_secure_token(16),
                    "typ": "JWT"
                }
            )

            self._logger.debug(f"Access token created for user {user.id}")
            return token

        except Exception as e:
            self._logger.error(f"Token generation failed: {str(e)}")
            raise RuntimeError("Failed to create access token") from e

    def verify_token(self, token: str) -> Dict:
        """
        Verifies and decodes a JWT token with comprehensive security checks.

        Args:
            token: JWT token string to verify

        Returns:
            dict: Decoded and validated token claims

        Raises:
            ValueError: If token is invalid or verification fails
        """
        try:
            # Check token blacklist
            if token in self._token_blacklist:
                raise ValueError("Token has been revoked")

            # Decode and verify token
            claims = jwt.decode(
                token=token,
                key=self._secret_key,
                algorithms=[self._algorithm],
                options={
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_iat": True,
                    "verify_iss": True,
                    "require": REQUIRED_CLAIMS
                }
            )

            # Validate required claims
            if claims.get("type") != TOKEN_TYPE_CLAIM:
                raise ValueError("Invalid token type")
            if claims.get("iss") != TOKEN_ISSUER:
                raise ValueError("Invalid token issuer")

            # Validate token age
            iat = datetime.fromtimestamp(claims["iat"], tz=timezone.utc)
            if (datetime.now(timezone.utc) - iat).total_seconds() > MAX_TOKEN_AGE_MINUTES * 60:
                raise ValueError("Token exceeds maximum age")

            self._logger.debug(f"Token verified successfully for user {claims.get('sub')}")
            return claims

        except ExpiredSignatureError:
            self._logger.warning("Token has expired")
            raise ValueError("Token has expired")
        except JWTError as e:
            self._logger.error(f"Token verification failed: {str(e)}")
            raise ValueError("Invalid token")
        except Exception as e:
            self._logger.error(f"Token verification error: {str(e)}")
            raise ValueError("Token verification failed")

    def refresh_token(self, token: str) -> str:
        """
        Creates a new access token from a valid existing token with security validation.

        Args:
            token: Existing valid JWT token

        Returns:
            str: New JWT token with updated expiration

        Raises:
            ValueError: If token refresh fails or is not eligible
        """
        try:
            # Verify existing token
            claims = self.verify_token(token)

            # Check refresh eligibility
            exp = datetime.fromtimestamp(claims["exp"], tz=timezone.utc)
            now = datetime.now(timezone.utc)
            
            if exp - now > timedelta(minutes=REFRESH_GRACE_PERIOD_MINUTES):
                raise ValueError("Token not eligible for refresh yet")

            # Create mock user for token generation
            user = User(
                email=claims["email"],
                password_hash="",  # Not needed for token refresh
                full_name="",      # Not needed for token refresh
                role=claims["role"]
            )
            user.id = uuid.UUID(claims["sub"])

            # Blacklist old token
            self._token_blacklist.add(token)

            # Generate new token
            new_token = self.create_access_token(user)

            self._logger.info(f"Token refreshed for user {claims['sub']}")
            return new_token

        except Exception as e:
            self._logger.error(f"Token refresh failed: {str(e)}")
            raise ValueError(f"Token refresh failed: {str(e)}")

    def get_token_expiration(self) -> datetime:
        """
        Calculates token expiration timestamp with grace period.

        Returns:
            datetime: Expiration timestamp with grace period
        """
        return datetime.now(timezone.utc) + timedelta(minutes=self._token_expire_minutes)