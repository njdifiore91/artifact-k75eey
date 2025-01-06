import pytest
import base64
import secrets
from typing import Generator
from datetime import datetime, timedelta
from shared.utils.security import SecurityManager
from shared.config.settings import Settings, get_settings

# Test constants
TEST_PASSWORD = "TestPassword123!"
TEST_DATA = "Sensitive test data for encryption"
TOKEN_LENGTH = 32
MIN_KEY_LENGTH = 32
MAX_KEY_LENGTH = 64

@pytest.fixture
def security_manager() -> Generator[SecurityManager, None, None]:
    """Fixture providing a configured SecurityManager instance."""
    settings = get_settings("development")
    # Ensure we have a valid test secret key
    setattr(settings, 'secret_key', base64.b64encode(secrets.token_bytes(32)).decode('utf-8'))
    manager = SecurityManager(settings)
    yield manager

@pytest.mark.security
def test_password_hashing(security_manager: SecurityManager) -> None:
    """Test password hashing functionality with comprehensive validation."""
    # Test basic hashing
    hashed = security_manager.hash_password(TEST_PASSWORD)
    assert hashed is not None
    assert isinstance(hashed, str)
    assert hashed != TEST_PASSWORD
    assert len(base64.b64decode(hashed)) >= 60  # bcrypt hash length

    # Test salt uniqueness
    hash1 = security_manager.hash_password(TEST_PASSWORD)
    hash2 = security_manager.hash_password(TEST_PASSWORD)
    assert hash1 != hash2  # Different salts should produce different hashes

    # Test invalid inputs
    with pytest.raises(ValueError):
        security_manager.hash_password("")  # Empty password
    with pytest.raises(ValueError):
        security_manager.hash_password("short")  # Too short password

    # Test unicode password handling
    unicode_password = "TestПароль123!"
    unicode_hash = security_manager.hash_password(unicode_password)
    assert unicode_hash is not None
    assert isinstance(unicode_hash, str)

@pytest.mark.security
def test_password_verification(security_manager: SecurityManager) -> None:
    """Test password verification with rate limiting and security checks."""
    # Test successful verification
    hashed = security_manager.hash_password(TEST_PASSWORD)
    assert security_manager.verify_password(TEST_PASSWORD, hashed) is True

    # Test incorrect password
    assert security_manager.verify_password("WrongPassword123!", hashed) is False

    # Test rate limiting
    for _ in range(6):  # Exceed max attempts
        security_manager.verify_password("WrongPassword123!", hashed)
    assert security_manager.verify_password(TEST_PASSWORD, hashed) is False  # Should be rate limited

    # Test invalid hash format
    with pytest.raises(Exception):
        security_manager.verify_password(TEST_PASSWORD, "invalid_hash")

    # Test empty inputs
    assert security_manager.verify_password("", hashed) is False
    assert security_manager.verify_password(TEST_PASSWORD, "") is False

@pytest.mark.security
def test_data_encryption(security_manager: SecurityManager) -> None:
    """Test data encryption with IV uniqueness and integrity verification."""
    # Test basic encryption/decryption
    encrypted = security_manager.encrypt_data(TEST_DATA)
    assert encrypted != TEST_DATA
    decrypted = security_manager.decrypt_data(encrypted)
    assert decrypted == TEST_DATA

    # Test IV uniqueness
    encrypted1 = security_manager.encrypt_data(TEST_DATA)
    encrypted2 = security_manager.encrypt_data(TEST_DATA)
    assert encrypted1 != encrypted2  # Different IVs should produce different ciphertexts

    # Test data integrity
    with pytest.raises(ValueError):
        security_manager.decrypt_data(encrypted1[:-1])  # Tampered ciphertext

    # Test empty data handling
    with pytest.raises(ValueError):
        security_manager.encrypt_data("")

    # Test large data handling
    large_data = "A" * 1000000  # 1MB of data
    encrypted_large = security_manager.encrypt_data(large_data)
    decrypted_large = security_manager.decrypt_data(encrypted_large)
    assert decrypted_large == large_data

@pytest.mark.security
def test_secure_token_generation(security_manager: SecurityManager) -> None:
    """Test secure token generation with entropy and uniqueness validation."""
    # Test basic token generation
    token = security_manager.generate_secure_token()
    assert len(token) >= TOKEN_LENGTH
    assert all(c in '-_0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' 
              for c in token)  # URL-safe characters

    # Test token uniqueness
    tokens = [security_manager.generate_secure_token() for _ in range(100)]
    assert len(set(tokens)) == 100  # All tokens should be unique

    # Test custom length
    custom_token = security_manager.generate_secure_token(length=64)
    assert len(custom_token) >= 64

    # Test invalid length
    with pytest.raises(ValueError):
        security_manager.generate_secure_token(length=8)  # Too short

    # Test entropy
    token_bytes = base64.urlsafe_b64decode(token + '=' * (-len(token) % 4))
    entropy = len(set(token_bytes)) / len(token_bytes)
    assert entropy > 0.5  # Ensure high entropy

@pytest.mark.security
def test_encryption_key_validation(security_manager: SecurityManager) -> None:
    """Test encryption key validation and rotation functionality."""
    # Test key length validation
    assert len(security_manager._encryption_key) >= MIN_KEY_LENGTH

    # Test key rotation
    original_key = security_manager._encryption_key
    assert security_manager.rotate_encryption_key() is True
    assert security_manager._encryption_key != original_key
    assert len(security_manager._encryption_key) >= MIN_KEY_LENGTH

    # Test key rotation interval
    security_manager._last_key_rotation = datetime.now() - timedelta(days=31)
    test_data = security_manager.encrypt_data(TEST_DATA)  # Should trigger rotation
    assert security_manager._last_key_rotation > datetime.now() - timedelta(minutes=1)

    # Test failed rotation handling
    security_manager._encryption_key = b"invalid_key"
    with pytest.raises(ValueError):
        security_manager._validate_encryption_key()

@pytest.mark.security
def test_rate_limiting(security_manager: SecurityManager) -> None:
    """Test rate limiting functionality for password verification."""
    hashed = security_manager.hash_password(TEST_PASSWORD)
    
    # Test successful attempts don't count towards limit
    for _ in range(10):
        assert security_manager.verify_password(TEST_PASSWORD, hashed) is True

    # Test failed attempts trigger rate limiting
    for _ in range(5):
        security_manager.verify_password("WrongPassword123!", hashed)
    
    # Verify rate limit is enforced
    assert security_manager.verify_password("WrongPassword123!", hashed) is False
    assert security_manager.verify_password(TEST_PASSWORD, hashed) is False

    # Test rate limit reset after window
    security_manager._password_attempts = {}  # Simulate time window expiry
    assert security_manager.verify_password(TEST_PASSWORD, hashed) is True