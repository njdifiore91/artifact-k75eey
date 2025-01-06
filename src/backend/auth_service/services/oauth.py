"""
OAuth service implementation for handling third-party authentication providers
with enhanced security measures and compliance features for the Art Knowledge Graph application.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, Tuple, Optional

import httpx  # v0.24.0
import jwt  # python-jose[cryptography] v3.3.0
from fastapi_limiter.depends import RateLimiter  # v0.1.5

from auth_service.models.user import User
from auth_service.services.jwt import JWTManager
from shared.config.settings import Settings
from shared.utils.security import SecurityManager

# OAuth endpoints and configuration
GOOGLE_OAUTH_ENDPOINT = "https://oauth2.googleapis.com"
GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo"
APPLE_AUTH_ENDPOINT = "https://appleid.apple.com/auth"
APPLE_KEYS_ENDPOINT = f"{APPLE_AUTH_ENDPOINT}/keys"

# Security constants
TOKEN_EXPIRY_BUFFER = 300  # 5 minutes buffer for token expiry
MAX_AUTH_ATTEMPTS = 5
RATE_LIMIT_WINDOW = 3600  # 1 hour

class OAuthManager:
    """
    Manages OAuth authentication flows and user profile handling for multiple providers
    with enhanced security measures and compliance features.
    """

    def __init__(self, settings: Settings, jwt_manager: JWTManager):
        """
        Initialize OAuth manager with provider configurations and security components.

        Args:
            settings: Application settings instance
            jwt_manager: JWT token manager instance
        """
        self._logger = logging.getLogger(__name__)
        self._settings = settings
        self._jwt_manager = jwt_manager
        self._security_manager = SecurityManager(settings)
        
        # Initialize HTTP client with security headers
        self._client = httpx.AsyncClient(
            timeout=30.0,
            verify=True,
            headers={
                "User-Agent": "ArtKnowledgeGraph/1.0",
                "Accept": "application/json"
            }
        )

        # Configure provider settings
        self._provider_configs = {
            "google": {
                "client_id": settings.google_arts_api_key.get_secret_value(),
                "token_endpoint": f"{GOOGLE_OAUTH_ENDPOINT}/token",
                "userinfo_endpoint": GOOGLE_USERINFO_ENDPOINT
            },
            "apple": {
                "client_id": settings.apple_client_id.get_secret_value(),
                "token_endpoint": f"{APPLE_AUTH_ENDPOINT}/token",
                "keys_endpoint": APPLE_KEYS_ENDPOINT
            }
        }

        self._logger.info("OAuthManager initialized with enhanced security features")

    async def authenticate_google(
        self, auth_code: str, code_verifier: str, state: str
    ) -> Tuple[User, str]:
        """
        Handle Google OAuth authentication flow with enhanced security.

        Args:
            auth_code: Authorization code from Google
            code_verifier: PKCE code verifier
            state: State parameter for CSRF protection

        Returns:
            Tuple containing authenticated user and access token

        Raises:
            ValueError: If authentication fails or security checks fail
        """
        try:
            # Validate state parameter
            if not self._security_manager.verify_state_parameter(state):
                raise ValueError("Invalid state parameter")

            # Exchange auth code for tokens
            token_data = await self._exchange_google_code(auth_code, code_verifier)
            
            # Verify ID token
            id_token = token_data.get("id_token")
            if not id_token:
                raise ValueError("Missing ID token from Google")

            claims = await self.verify_oauth_token("google", id_token)

            # Fetch user profile with access token
            access_token = token_data.get("access_token")
            user_profile = await self._fetch_google_profile(access_token)

            # Create or update user
            user = await self._get_or_create_user(
                email=claims["email"],
                oauth_provider="google",
                oauth_user_id=claims["sub"],
                profile_data=user_profile
            )

            # Generate application access token
            app_token = self._jwt_manager.create_access_token(user)

            self._logger.info(f"Google authentication successful for user {user.id}")
            return user, app_token

        except Exception as e:
            self._logger.error(f"Google authentication failed: {str(e)}")
            raise ValueError(f"Authentication failed: {str(e)}")

    async def authenticate_apple(
        self, identity_token: str, state: str
    ) -> Tuple[User, str]:
        """
        Handle Apple Sign In authentication flow with enhanced security.

        Args:
            identity_token: Apple identity token
            state: State parameter for CSRF protection

        Returns:
            Tuple containing authenticated user and access token

        Raises:
            ValueError: If authentication fails or security checks fail
        """
        try:
            # Validate state parameter
            if not self._security_manager.verify_state_parameter(state):
                raise ValueError("Invalid state parameter")

            # Verify Apple identity token
            claims = await self.verify_oauth_token("apple", identity_token)

            # Create or update user
            user = await self._get_or_create_user(
                email=claims["email"],
                oauth_provider="apple",
                oauth_user_id=claims["sub"],
                profile_data={"email": claims["email"]}
            )

            # Generate application access token
            app_token = self._jwt_manager.create_access_token(user)

            self._logger.info(f"Apple authentication successful for user {user.id}")
            return user, app_token

        except Exception as e:
            self._logger.error(f"Apple authentication failed: {str(e)}")
            raise ValueError(f"Authentication failed: {str(e)}")

    async def verify_oauth_token(self, provider: str, token: str) -> Dict:
        """
        Verify OAuth provider token with enhanced validation.

        Args:
            provider: OAuth provider name
            token: Token to verify

        Returns:
            Dict containing validated token claims

        Raises:
            ValueError: If token verification fails
        """
        try:
            # Apply rate limiting
            await RateLimiter(times=MAX_AUTH_ATTEMPTS, seconds=RATE_LIMIT_WINDOW)

            if provider == "google":
                claims = await self._verify_google_token(token)
            elif provider == "apple":
                claims = await self._verify_apple_token(token)
            else:
                raise ValueError(f"Unsupported OAuth provider: {provider}")

            # Validate common claims
            now = datetime.now(timezone.utc).timestamp()
            if claims["exp"] - now < TOKEN_EXPIRY_BUFFER:
                raise ValueError("Token is about to expire")

            # Validate audience
            if provider == "google":
                if claims["aud"] != self._provider_configs["google"]["client_id"]:
                    raise ValueError("Invalid token audience")

            self._logger.debug(f"OAuth token verified for provider {provider}")
            return claims

        except Exception as e:
            self._logger.error(f"Token verification failed: {str(e)}")
            raise ValueError(f"Token verification failed: {str(e)}")

    async def revoke_oauth_token(self, provider: str, token: str) -> bool:
        """
        Revoke OAuth tokens for security purposes.

        Args:
            provider: OAuth provider name
            token: Token to revoke

        Returns:
            bool indicating revocation success
        """
        try:
            if provider == "google":
                revoke_endpoint = f"{GOOGLE_OAUTH_ENDPOINT}/revoke"
                response = await self._client.post(
                    revoke_endpoint,
                    data={"token": token}
                )
            elif provider == "apple":
                # Apple doesn't provide token revocation
                return True
            else:
                raise ValueError(f"Unsupported OAuth provider: {provider}")

            success = response.status_code == 200
            self._logger.info(f"Token revocation {'successful' if success else 'failed'} for {provider}")
            return success

        except Exception as e:
            self._logger.error(f"Token revocation failed: {str(e)}")
            return False

    async def _exchange_google_code(self, auth_code: str, code_verifier: str) -> Dict:
        """Exchange Google authorization code for tokens."""
        data = {
            "client_id": self._provider_configs["google"]["client_id"],
            "grant_type": "authorization_code",
            "code": auth_code,
            "code_verifier": code_verifier,
            "redirect_uri": self._settings.google_redirect_uri
        }
        
        response = await self._client.post(
            self._provider_configs["google"]["token_endpoint"],
            data=data
        )
        
        if response.status_code != 200:
            raise ValueError("Failed to exchange authorization code")
            
        return response.json()

    async def _fetch_google_profile(self, access_token: str) -> Dict:
        """Fetch Google user profile with access token."""
        response = await self._client.get(
            self._provider_configs["google"]["userinfo_endpoint"],
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        if response.status_code != 200:
            raise ValueError("Failed to fetch user profile")
            
        return response.json()

    async def _verify_google_token(self, token: str) -> Dict:
        """Verify Google ID token."""
        try:
            return jwt.decode(
                token,
                options={"verify_signature": True},
                audience=self._provider_configs["google"]["client_id"]
            )
        except jwt.JWTError as e:
            raise ValueError(f"Invalid Google token: {str(e)}")

    async def _verify_apple_token(self, token: str) -> Dict:
        """Verify Apple identity token."""
        try:
            # Fetch Apple's public keys
            response = await self._client.get(self._provider_configs["apple"]["keys_endpoint"])
            if response.status_code != 200:
                raise ValueError("Failed to fetch Apple public keys")
                
            keys = response.json()["keys"]
            return jwt.decode(
                token,
                keys,
                options={"verify_signature": True},
                audience=self._provider_configs["apple"]["client_id"]
            )
        except jwt.JWTError as e:
            raise ValueError(f"Invalid Apple token: {str(e)}")

    async def _get_or_create_user(
        self, email: str, oauth_provider: str, oauth_user_id: str, profile_data: Dict
    ) -> User:
        """Create or update user from OAuth profile data."""
        # Implementation would interact with your user database
        # This is a placeholder that creates a new user instance
        user = User(
            email=email,
            password_hash="",  # OAuth users don't have passwords
            full_name=profile_data.get("name", ""),
            role="free_user"
        )
        user.oauth_provider = oauth_provider
        user.oauth_user_id = oauth_user_id
        
        return user