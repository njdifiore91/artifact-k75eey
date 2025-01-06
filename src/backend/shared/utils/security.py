import bcrypt  # v4.0.1
import base64
import secrets
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Union
from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # v41.0.0
from cryptography.hazmat.primitives import hashes
from cryptography.exceptions import InvalidTag
from shared.config.settings import Settings

# Security constants
ENCRYPTION_ALGORITHM = "AES-256-GCM"
BCRYPT_ROUNDS = 12  # Work factor for password hashing
MIN_KEY_LENGTH = 32  # Minimum encryption key length in bytes
TOKEN_LENGTH = 32  # Length for secure token generation
KEY_ROTATION_DAYS = 30  # Days between key rotations
MAX_PASSWORD_ATTEMPTS = 5  # Maximum password verification attempts
RATE_LIMIT_WINDOW = 300  # Rate limiting window in seconds

class SecurityManager:
    """
    Enhanced security manager for the Art Knowledge Graph backend services.
    Provides cryptographic operations, password hashing, and key rotation support.
    """
    
    def __init__(self, settings: Settings):
        """
        Initialize SecurityManager with enhanced security settings.
        
        Args:
            settings (Settings): Application settings instance
        """
        self._logger = logging.getLogger(__name__)
        self._settings = settings
        self._encryption_key = base64.b64decode(settings.secret_key.get_secret_value())
        self._validate_encryption_key()
        
        # Initialize salt for password hashing
        self._salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
        self._algorithm = ENCRYPTION_ALGORITHM
        
        # Key rotation settings
        self._key_rotation_interval = timedelta(days=KEY_ROTATION_DAYS)
        self._last_key_rotation = datetime.now()
        
        # Rate limiting storage
        self._password_attempts: Dict[str, Dict] = {}
        
        self._logger.info("SecurityManager initialized with enhanced security measures")

    def _validate_encryption_key(self) -> None:
        """Validate encryption key strength and requirements."""
        if len(self._encryption_key) < MIN_KEY_LENGTH:
            raise ValueError(f"Encryption key must be at least {MIN_KEY_LENGTH} bytes")
        
        # Entropy validation
        entropy = sum(1 for byte in self._encryption_key if byte > 0) / len(self._encryption_key)
        if entropy < 0.7:  # Minimum entropy threshold
            raise ValueError("Encryption key has insufficient entropy")

    def hash_password(self, password: str) -> str:
        """
        Hash password using bcrypt with salt and work factor validation.
        
        Args:
            password (str): Plain text password to hash
            
        Returns:
            str: Base64 encoded password hash
        """
        if not password or len(password) < 8:
            raise ValueError("Password must be at least 8 characters long")
            
        try:
            password_bytes = password.encode('utf-8')
            hashed = bcrypt.hashpw(password_bytes, self._salt)
            self._logger.debug("Password hashed successfully")
            return base64.b64encode(hashed).decode('utf-8')
        except Exception as e:
            self._logger.error(f"Password hashing failed: {str(e)}")
            raise RuntimeError("Password hashing failed") from e

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """
        Verify password against hash with rate limiting.
        
        Args:
            plain_password (str): Plain text password to verify
            hashed_password (str): Base64 encoded hash to verify against
            
        Returns:
            bool: True if password matches, False otherwise
        """
        # Rate limiting check
        if not self._check_rate_limit(plain_password):
            self._logger.warning("Rate limit exceeded for password verification")
            return False
            
        try:
            hashed_bytes = base64.b64decode(hashed_password)
            password_bytes = plain_password.encode('utf-8')
            result = bcrypt.checkpw(password_bytes, hashed_bytes)
            
            # Update rate limiting counters
            self._update_password_attempts(plain_password, result)
            
            self._logger.debug("Password verification completed")
            return result
        except Exception as e:
            self._logger.error(f"Password verification failed: {str(e)}")
            return False

    def encrypt_data(self, data: str) -> str:
        """
        Encrypt data using AES-256-GCM with key rotation check.
        
        Args:
            data (str): Data to encrypt
            
        Returns:
            str: Base64 encoded encrypted data with IV
        """
        self._check_key_rotation()
        
        try:
            # Generate a random 96-bit IV
            iv = secrets.token_bytes(12)
            data_bytes = data.encode('utf-8')
            
            # Create AESGCM cipher
            aesgcm = AESGCM(self._encryption_key)
            
            # Encrypt data with authentication
            ciphertext = aesgcm.encrypt(iv, data_bytes, None)
            
            # Combine IV and ciphertext
            encrypted_data = base64.b64encode(iv + ciphertext).decode('utf-8')
            
            self._logger.debug("Data encrypted successfully")
            return encrypted_data
        except Exception as e:
            self._logger.error(f"Data encryption failed: {str(e)}")
            raise RuntimeError("Encryption failed") from e

    def decrypt_data(self, encrypted_data: str) -> str:
        """
        Decrypt AES-256-GCM encrypted data with integrity verification.
        
        Args:
            encrypted_data (str): Base64 encoded encrypted data with IV
            
        Returns:
            str: Decrypted data string
        """
        try:
            # Decode the combined IV and ciphertext
            combined = base64.b64decode(encrypted_data)
            if len(combined) < 13:  # IV(12) + min ciphertext(1)
                raise ValueError("Invalid encrypted data format")
                
            # Split IV and ciphertext
            iv = combined[:12]
            ciphertext = combined[12:]
            
            # Create AESGCM cipher
            aesgcm = AESGCM(self._encryption_key)
            
            # Decrypt and verify data
            plaintext = aesgcm.decrypt(iv, ciphertext, None)
            
            self._logger.debug("Data decrypted successfully")
            return plaintext.decode('utf-8')
        except InvalidTag:
            self._logger.error("Data integrity verification failed")
            raise ValueError("Data integrity check failed")
        except Exception as e:
            self._logger.error(f"Data decryption failed: {str(e)}")
            raise RuntimeError("Decryption failed") from e

    def generate_secure_token(self, length: int = TOKEN_LENGTH) -> str:
        """
        Generate a cryptographically secure random token.
        
        Args:
            length (int): Desired token length in bytes
            
        Returns:
            str: URL-safe base64 encoded token
        """
        if length < 16:
            raise ValueError("Token length must be at least 16 bytes")
            
        try:
            # Generate random bytes with high entropy
            token_bytes = secrets.token_bytes(length)
            
            # Encode as URL-safe base64
            token = base64.urlsafe_b64encode(token_bytes).decode('utf-8').rstrip('=')
            
            self._logger.debug("Secure token generated successfully")
            return token
        except Exception as e:
            self._logger.error(f"Token generation failed: {str(e)}")
            raise RuntimeError("Token generation failed") from e

    def rotate_encryption_key(self) -> bool:
        """
        Perform secure key rotation with backup.
        
        Returns:
            bool: True if rotation successful, False otherwise
        """
        try:
            # Generate new key
            new_key = secrets.token_bytes(MIN_KEY_LENGTH)
            
            # Validate new key
            old_key = self._encryption_key
            self._encryption_key = new_key
            self._validate_encryption_key()
            
            # Update rotation timestamp
            self._last_key_rotation = datetime.now()
            
            self._logger.info("Encryption key rotated successfully")
            return True
        except Exception as e:
            # Restore old key on failure
            self._encryption_key = old_key
            self._logger.error(f"Key rotation failed: {str(e)}")
            return False

    def _check_key_rotation(self) -> None:
        """Check if key rotation is needed and perform rotation if necessary."""
        if datetime.now() - self._last_key_rotation > self._key_rotation_interval:
            self.rotate_encryption_key()

    def _check_rate_limit(self, password_hash: str) -> bool:
        """
        Check if password verification attempts are within rate limits.
        
        Args:
            password_hash (str): Hash of the password to check
            
        Returns:
            bool: True if within limits, False otherwise
        """
        now = datetime.now()
        attempts = self._password_attempts.get(password_hash, {})
        
        # Clean up old attempts
        self._password_attempts = {
            k: v for k, v in self._password_attempts.items()
            if now - v['timestamp'] < timedelta(seconds=RATE_LIMIT_WINDOW)
        }
        
        if attempts and now - attempts['timestamp'] < timedelta(seconds=RATE_LIMIT_WINDOW):
            return attempts['count'] < MAX_PASSWORD_ATTEMPTS
        return True

    def _update_password_attempts(self, password_hash: str, success: bool) -> None:
        """Update rate limiting counters for password verification attempts."""
        now = datetime.now()
        if not success:
            attempts = self._password_attempts.get(password_hash, {'count': 0, 'timestamp': now})
            attempts['count'] += 1
            attempts['timestamp'] = now
            self._password_attempts[password_hash] = attempts
        else:
            self._password_attempts.pop(password_hash, None)