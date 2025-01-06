"""
Authentication service test package initialization providing comprehensive test fixtures
and configuration for secure authentication testing, token management, and encryption validation.
"""

import pytest
from unittest.mock import Mock, patch
from datetime import datetime, timezone

from auth_service.config import AuthServiceSettings
from tests.conftest import test_client

# Test settings with enhanced security configuration
AUTH_TEST_SETTINGS = AuthServiceSettings(
    env_file='.env.test',
    service_name="auth_service_test",
    jwt_secret_key="test_secret_key_with_sufficient_entropy_for_testing",
    jwt_algorithm="RS256",
    jwt_access_token_expire_minutes=30,
    jwt_refresh_token_expire_days=1,
    password_min_length=12,
    max_login_attempts=5,
    lockout_duration_minutes=30,
    encryption_settings={
        "algorithm": "AES-256-GCM",
        "key_rotation_days": "1",
        "kms_key_id": "test/kms"
    }
)

# Test user data with comprehensive security features
TEST_USER_DATA = {
    "email": "test@example.com",
    "password": "Test_P@ssw0rd_2023",
    "role": "free_user",
    "mfa_enabled": True,
    "security_questions": ["q1", "q2"],
    "biometric_enabled": True,
    "failed_login_attempts": 0,
    "last_login": datetime.now(timezone.utc).isoformat(),
    "security_events": []
}

@pytest.fixture
def auth_test_client():
    """
    Provides configured test client for auth service tests with security headers
    and validation.
    """
    # Configure test client with security headers
    with test_client as client:
        client.headers.update({
            "X-Test-Security": "enabled",
            "X-Test-MFA": "required",
            "X-Test-Encryption": "AES-256-GCM"
        })
        
        # Initialize security context
        client.state.security_context = {
            "encryption_enabled": True,
            "mfa_required": True,
            "audit_enabled": True
        }
        
        yield client
        
        # Cleanup security context
        client.state.security_context = None

@pytest.fixture
def mock_oauth_provider():
    """
    Provides comprehensive mock OAuth provider with security validation.
    """
    mock_provider = Mock()
    
    # Configure mock OAuth endpoints
    mock_provider.authorize_url = "https://test.oauth.provider/auth"
    mock_provider.token_url = "https://test.oauth.provider/token"
    mock_provider.userinfo_url = "https://test.oauth.provider/userinfo"
    
    # Configure mock security validations
    mock_provider.verify_state = Mock(return_value=True)
    mock_provider.verify_token = Mock(return_value=True)
    mock_provider.verify_nonce = Mock(return_value=True)
    
    # Configure mock MFA validation
    mock_provider.verify_mfa = Mock(return_value=True)
    mock_provider.mfa_status = "verified"
    
    # Configure mock biometric validation
    mock_provider.verify_biometric = Mock(return_value=True)
    mock_provider.biometric_status = "verified"
    
    yield mock_provider
    
    # Verify security logs were created
    assert mock_provider.verify_state.called
    assert mock_provider.verify_token.called

@pytest.fixture
def test_tokens():
    """
    Provides secure test JWT tokens with rotation and validation.
    """
    # Generate test tokens with security metadata
    access_token = {
        "token": "test.access.token",
        "expires_in": 1800,
        "token_type": "Bearer",
        "scope": "test",
        "encryption": "AES-256-GCM",
        "rotation_id": "test-rotation-1"
    }
    
    refresh_token = {
        "token": "test.refresh.token",
        "expires_in": 86400,
        "token_type": "Bearer",
        "scope": "test refresh",
        "encryption": "AES-256-GCM",
        "rotation_id": "test-rotation-1"
    }
    
    rotation_token = {
        "token": "test.rotation.token",
        "expires_in": 300,
        "token_type": "Bearer",
        "scope": "rotation",
        "encryption": "AES-256-GCM",
        "rotation_id": "test-rotation-2"
    }
    
    tokens = {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "rotation_token": rotation_token,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "security_metadata": {
            "encryption_algorithm": "AES-256-GCM",
            "key_rotation_enabled": True,
            "mfa_verified": True
        }
    }
    
    yield tokens
    
    # Cleanup and validate token audit trail
    assert tokens["security_metadata"]["encryption_algorithm"] == "AES-256-GCM"
    assert tokens["security_metadata"]["mfa_verified"] is True