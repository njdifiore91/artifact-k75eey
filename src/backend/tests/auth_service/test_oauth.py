"""
Comprehensive test suite for OAuth authentication service implementation.
Tests Google and Apple Sign In flows, token validation, rate limiting,
security controls, and audit logging.
"""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from freezegun import freeze_time
from datetime import datetime, timedelta, timezone

from auth_service.services.oauth import OAuthManager
from auth_service.services.jwt import JWTManager
from auth_service.models.user import User
from shared.config.settings import Settings

# Test constants
MOCK_GOOGLE_TOKEN = "mock.google.token.with.claims"
MOCK_APPLE_TOKEN = "mock.apple.token.with.claims"
MOCK_REFRESH_TOKEN = "mock.refresh.token"
MOCK_STATE = "secure_state_token"

MOCK_GOOGLE_PROFILE = {
    "id": "123456789",
    "email": "test@example.com",
    "name": "Test User",
    "email_verified": True,
    "picture": "https://example.com/photo.jpg"
}

MOCK_APPLE_PROFILE = {
    "sub": "987654321",
    "email": "test@example.com",
    "email_verified": True
}

RATE_LIMIT_CONFIG = {
    "window_seconds": 300,
    "max_requests": 100
}

SECURITY_HEADERS = {
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=31536000",
    "X-Content-Type-Options": "nosniff",
    "X-XSS-Protection": "1; mode=block"
}

@pytest.fixture
def settings():
    """Fixture for test settings with security configurations."""
    settings = Settings()
    settings.secret_key = "secure_test_key_with_sufficient_entropy_for_testing"
    settings.algorithm = "HS256"
    settings.access_token_expire_minutes = 30
    return settings

@pytest.fixture
def jwt_manager(settings):
    """Fixture for JWT manager with test configuration."""
    return JWTManager(settings)

@pytest.fixture
async def oauth_manager(settings, jwt_manager):
    """Fixture for OAuth manager with mocked dependencies."""
    manager = OAuthManager(settings, jwt_manager)
    manager._client = AsyncMock()
    return manager

class TestOAuthAuthentication:
    """Test suite for OAuth authentication flows and security measures."""

    @pytest.mark.asyncio
    @pytest.mark.security
    async def test_google_oauth_authentication(self, oauth_manager):
        """Test Google OAuth authentication with security validations."""
        # Mock Google token exchange response
        oauth_manager._exchange_google_code = AsyncMock(return_value={
            "id_token": MOCK_GOOGLE_TOKEN,
            "access_token": "mock_access_token"
        })

        # Mock token verification
        oauth_manager.verify_oauth_token = AsyncMock(return_value={
            "sub": MOCK_GOOGLE_PROFILE["id"],
            "email": MOCK_GOOGLE_PROFILE["email"],
            "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
            "iat": int(datetime.now(timezone.utc).timestamp())
        })

        # Mock profile fetch
        oauth_manager._fetch_google_profile = AsyncMock(return_value=MOCK_GOOGLE_PROFILE)

        # Test authentication flow
        user, token = await oauth_manager.authenticate_google(
            auth_code="mock_auth_code",
            code_verifier="mock_code_verifier",
            state=MOCK_STATE
        )

        assert user.email == MOCK_GOOGLE_PROFILE["email"]
        assert user.oauth_provider == "google"
        assert user.oauth_user_id == MOCK_GOOGLE_PROFILE["id"]
        assert token is not None

        # Verify security checks were performed
        oauth_manager.verify_oauth_token.assert_called_once()
        assert user.is_verified == True

    @pytest.mark.asyncio
    @pytest.mark.security
    async def test_apple_oauth_authentication(self, oauth_manager):
        """Test Apple Sign In authentication with security validations."""
        # Mock Apple token verification
        oauth_manager.verify_oauth_token = AsyncMock(return_value={
            "sub": MOCK_APPLE_PROFILE["sub"],
            "email": MOCK_APPLE_PROFILE["email"],
            "email_verified": True,
            "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
            "iat": int(datetime.now(timezone.utc).timestamp())
        })

        # Test authentication flow
        user, token = await oauth_manager.authenticate_apple(
            identity_token=MOCK_APPLE_TOKEN,
            state=MOCK_STATE
        )

        assert user.email == MOCK_APPLE_PROFILE["email"]
        assert user.oauth_provider == "apple"
        assert user.oauth_user_id == MOCK_APPLE_PROFILE["sub"]
        assert token is not None

        # Verify security checks
        oauth_manager.verify_oauth_token.assert_called_once()
        assert user.is_verified == True

    @pytest.mark.asyncio
    @pytest.mark.security
    async def test_token_verification(self, oauth_manager):
        """Test OAuth token verification with security controls."""
        # Mock token verification responses
        oauth_manager._verify_google_token = AsyncMock(return_value={
            "sub": "123456789",
            "email": "test@example.com",
            "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
            "iat": int(datetime.now(timezone.utc).timestamp()),
            "aud": oauth_manager._provider_configs["google"]["client_id"]
        })

        # Test Google token verification
        claims = await oauth_manager.verify_oauth_token("google", MOCK_GOOGLE_TOKEN)
        assert claims["sub"] == "123456789"
        assert claims["email"] == "test@example.com"

        # Test expired token
        with freeze_time(datetime.now(timezone.utc) + timedelta(hours=2)):
            with pytest.raises(ValueError, match="Token has expired"):
                await oauth_manager.verify_oauth_token("google", MOCK_GOOGLE_TOKEN)

    @pytest.mark.asyncio
    @pytest.mark.security
    async def test_rate_limiting(self, oauth_manager):
        """Test rate limiting implementation for OAuth endpoints."""
        # Mock rate limiter
        with patch("fastapi_limiter.depends.RateLimiter.__call__", AsyncMock()):
            # Test successful requests within limit
            for _ in range(5):
                await oauth_manager.verify_oauth_token("google", MOCK_GOOGLE_TOKEN)

            # Test rate limit exceeded
            with patch("fastapi_limiter.depends.RateLimiter.__call__",
                      AsyncMock(side_effect=Exception("Rate limit exceeded"))):
                with pytest.raises(ValueError, match="Token verification failed"):
                    await oauth_manager.verify_oauth_token("google", MOCK_GOOGLE_TOKEN)

    @pytest.mark.asyncio
    @pytest.mark.security
    async def test_token_refresh(self, oauth_manager):
        """Test OAuth token refresh mechanism with security validation."""
        # Mock token verification for refresh
        oauth_manager.verify_oauth_token = AsyncMock(return_value={
            "sub": "123456789",
            "email": "test@example.com",
            "exp": int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp()),
            "iat": int(datetime.now(timezone.utc).timestamp())
        })

        # Test successful token refresh
        new_token = await oauth_manager.refresh_token(MOCK_REFRESH_TOKEN)
        assert new_token is not None

        # Test refresh with invalid token
        oauth_manager.verify_oauth_token.side_effect = ValueError("Invalid token")
        with pytest.raises(ValueError, match="Token verification failed"):
            await oauth_manager.refresh_token("invalid_token")

    @pytest.mark.security
    async def test_security_headers(self, oauth_manager):
        """Test security headers implementation."""
        # Mock client response with security headers
        oauth_manager._client.get = AsyncMock(return_value=MagicMock(
            headers=SECURITY_HEADERS,
            status_code=200,
            json=AsyncMock(return_value=MOCK_GOOGLE_PROFILE)
        ))

        # Verify security headers in response
        response = await oauth_manager._fetch_google_profile("mock_token")
        assert response == MOCK_GOOGLE_PROFILE

        # Verify headers were checked
        oauth_manager._client.get.assert_called_once()
        assert oauth_manager._client.get.call_args[1]["headers"]["User-Agent"] == "ArtKnowledgeGraph/1.0"

    @pytest.mark.security
    async def test_token_revocation(self, oauth_manager):
        """Test OAuth token revocation functionality."""
        # Mock successful revocation
        oauth_manager._client.post = AsyncMock(return_value=MagicMock(status_code=200))
        assert await oauth_manager.revoke_oauth_token("google", "mock_token") == True

        # Mock failed revocation
        oauth_manager._client.post = AsyncMock(return_value=MagicMock(status_code=400))
        assert await oauth_manager.revoke_oauth_token("google", "mock_token") == False