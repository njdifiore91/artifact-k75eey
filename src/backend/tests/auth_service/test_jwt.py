"""
Comprehensive test suite for JWT (JSON Web Token) service functionality.
Tests token generation, verification, refresh operations, and security compliance
with performance benchmarks for the Art Knowledge Graph authentication system.
"""

import pytest
from datetime import datetime, timedelta, timezone
from freezegun import freeze_time
from uuid import UUID

from auth_service.services.jwt import JWTManager, TOKEN_TYPE_CLAIM, TOKEN_ISSUER
from auth_service.models.user import User
from shared.config.settings import Settings

# Test constants
TEST_USER_EMAIL = "test@example.com"
TEST_USER_NAME = "Test User"
TEST_USER_ROLE = "free_user"
TEST_TOKEN_EXPIRY = 30  # minutes
PERFORMANCE_THRESHOLD_MS = 100  # Maximum allowed time for token operations

@pytest.fixture
def test_settings():
    """Fixture providing test configuration settings."""
    return Settings(
        environment="test",
        secret_key="test_secret_key_with_minimum_length_for_security_compliance",
        algorithm="RS256",
        access_token_expire_minutes=TEST_TOKEN_EXPIRY
    )

@pytest.fixture
def test_user():
    """Fixture providing a test user instance with GDPR-compliant test data."""
    user = User(
        email=TEST_USER_EMAIL,
        password_hash="",  # Not needed for token tests
        full_name=TEST_USER_NAME,
        role=TEST_USER_ROLE
    )
    user.id = UUID('12345678-1234-5678-1234-567812345678')
    return user

@pytest.fixture
def jwt_manager(test_settings):
    """Fixture providing configured JWT manager instance."""
    return JWTManager(test_settings)

class TestJWTManager:
    """Test suite for JWT token management functionality."""

    @pytest.mark.asyncio
    @pytest.mark.benchmark
    async def test_create_access_token(self, jwt_manager, test_user, benchmark):
        """
        Test access token creation with security validations and performance benchmarks.
        """
        # Benchmark token creation
        def create_token():
            return jwt_manager.create_access_token(test_user)
        
        token = benchmark(create_token)

        # Verify token structure
        assert token and isinstance(token, str)
        
        # Decode token for validation (without verification)
        from jose import jwt
        claims = jwt.decode(
            token,
            options={"verify_signature": False}
        )

        # Validate required claims
        assert claims["sub"] == str(test_user.id)
        assert claims["email"] == test_user.email
        assert claims["role"] == test_user.role
        assert claims["type"] == TOKEN_TYPE_CLAIM
        assert claims["iss"] == TOKEN_ISSUER
        
        # Validate token expiration
        exp_time = datetime.fromtimestamp(claims["exp"], tz=timezone.utc)
        iat_time = datetime.fromtimestamp(claims["iat"], tz=timezone.utc)
        assert exp_time > iat_time
        assert exp_time - iat_time == timedelta(minutes=TEST_TOKEN_EXPIRY)

        # Validate token header
        header = jwt.get_unverified_header(token)
        assert header["alg"] == "RS256"
        assert header["typ"] == "JWT"
        assert "kid" in header

        # Verify benchmark performance
        assert benchmark.stats.stats.mean * 1000 < PERFORMANCE_THRESHOLD_MS

    @pytest.mark.asyncio
    async def test_verify_token(self, jwt_manager, test_user):
        """
        Test token verification with comprehensive security checks.
        """
        # Create a valid token
        token = jwt_manager.create_access_token(test_user)
        
        # Test successful verification
        claims = jwt_manager.verify_token(token)
        assert claims["sub"] == str(test_user.id)
        assert claims["email"] == test_user.email
        
        # Test expired token
        with freeze_time(datetime.now() + timedelta(minutes=TEST_TOKEN_EXPIRY + 1)):
            with pytest.raises(ValueError, match="Token has expired"):
                jwt_manager.verify_token(token)

        # Test invalid token format
        with pytest.raises(ValueError, match="Invalid token"):
            jwt_manager.verify_token("invalid.token.format")

        # Test tampered token
        tampered_token = token[:-5] + "tamper"
        with pytest.raises(ValueError):
            jwt_manager.verify_token(tampered_token)

    @pytest.mark.asyncio
    async def test_refresh_token(self, jwt_manager, test_user):
        """
        Test token refresh functionality with security validations.
        """
        # Create initial token near expiration
        with freeze_time(datetime.now() + timedelta(minutes=TEST_TOKEN_EXPIRY - 5)):
            original_token = jwt_manager.create_access_token(test_user)
            
            # Test successful refresh
            new_token = jwt_manager.refresh_token(original_token)
            assert new_token != original_token
            
            # Verify new token
            new_claims = jwt_manager.verify_token(new_token)
            assert new_claims["sub"] == str(test_user.id)
            assert new_claims["email"] == test_user.email
            
            # Verify original token is blacklisted
            with pytest.raises(ValueError, match="Token has been revoked"):
                jwt_manager.verify_token(original_token)

    @pytest.mark.asyncio
    async def test_token_security_features(self, jwt_manager, test_user):
        """
        Test advanced security features and compliance requirements.
        """
        token = jwt_manager.create_access_token(test_user)
        
        # Test unique token IDs (jti claim)
        claims1 = jwt_manager.verify_token(token)
        token2 = jwt_manager.create_access_token(test_user)
        claims2 = jwt_manager.verify_token(token2)
        assert claims1["jti"] != claims2["jti"]
        
        # Test scope validation
        claims = jwt_manager.verify_token(token)
        assert "access" in claims["scope"]
        
        # Test version claim
        assert claims["version"] == "1.0"

    @pytest.mark.asyncio
    @pytest.mark.benchmark
    async def test_token_performance(self, jwt_manager, test_user, benchmark):
        """
        Test token operations performance against SLA requirements.
        """
        # Benchmark token creation and verification cycle
        def token_cycle():
            token = jwt_manager.create_access_token(test_user)
            return jwt_manager.verify_token(token)
        
        result = benchmark(token_cycle)
        assert result["sub"] == str(test_user.id)
        
        # Verify performance meets SLA
        assert benchmark.stats.stats.mean * 1000 < PERFORMANCE_THRESHOLD_MS

    @pytest.mark.asyncio
    async def test_token_structure_validation(self, jwt_manager, test_user):
        """
        Test token structure and format compliance.
        """
        token = jwt_manager.create_access_token(test_user)
        
        # Verify token format (three dot-separated base64 strings)
        parts = token.split('.')
        assert len(parts) == 3
        
        # Verify each part is valid base64
        import base64
        for part in parts:
            try:
                # Add padding if necessary
                padded = part + '=' * (-len(part) % 4)
                base64.urlsafe_b64decode(padded)
            except Exception:
                pytest.fail(f"Invalid base64 in token part: {part}")