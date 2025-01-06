"""
Password service module implementing comprehensive password management with enhanced security features.
Includes password strength validation, secure hashing, breach detection, and rate-limited password reset functionality.
"""

import re
import math
import logging
from datetime import datetime, timedelta
from typing import Tuple, Dict, Optional

from auth_service.models.user import User
from shared.utils.security import SecurityManager

# Password security constants
MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 128
RESET_TOKEN_EXPIRY_HOURS = 24
PASSWORD_HISTORY_SIZE = 10
MAX_RESET_ATTEMPTS = 3
MIN_PASSWORD_ENTROPY = 60.0

# Password complexity pattern requiring lowercase, uppercase, digit, and special character
PASSWORD_PATTERN = r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]'

class PasswordService:
    """
    Enhanced service class handling all password-related operations with advanced security features.
    Implements comprehensive password management including strength validation, secure hashing,
    breach detection, and rate-limited password reset functionality.
    """

    def __init__(self, security_manager: SecurityManager):
        """
        Initialize password service with security manager and enhanced logging.

        Args:
            security_manager: Instance of SecurityManager for cryptographic operations
        """
        self._security_manager = security_manager
        self._logger = logging.getLogger(__name__)
        
        # Rate limiting storage for reset attempts
        self._reset_attempts: Dict[str, Dict] = {}

    def validate_password_strength(self, password: str, user: User) -> Tuple[bool, str]:
        """
        Validate password strength with comprehensive checks including entropy calculation
        and breach detection.

        Args:
            password: Password to validate
            user: User context for history validation

        Returns:
            Tuple containing validation result and detailed message
        """
        # Length validation
        if len(password) < MIN_PASSWORD_LENGTH:
            return False, f"Password must be at least {MIN_PASSWORD_LENGTH} characters long"
        if len(password) > MAX_PASSWORD_LENGTH:
            return False, f"Password exceeds maximum length of {MAX_PASSWORD_LENGTH} characters"

        # Complexity validation
        if not re.match(PASSWORD_PATTERN, password):
            return False, "Password must contain lowercase, uppercase, number, and special character"

        # Calculate password entropy
        char_set_size = len(set(password))
        entropy = len(password) * math.log2(char_set_size)
        if entropy < MIN_PASSWORD_ENTROPY:
            return False, "Password is not complex enough"

        # Check for common patterns
        common_patterns = ['123', 'abc', 'qwerty', 'password', 'admin']
        if any(pattern in password.lower() for pattern in common_patterns):
            return False, "Password contains common patterns"

        # Check for password history
        if hasattr(user, 'password_history') and password in user.password_history:
            return False, "Password has been used recently"

        # Check for password breaches
        if self._security_manager.check_password_breach(password):
            return False, "Password has been found in known data breaches"

        return True, "Password meets security requirements"

    def hash_password(self, password: str, user: User) -> str:
        """
        Create secure hash of password with comprehensive validation and audit logging.

        Args:
            password: Plain text password to hash
            user: User context for validation

        Returns:
            Securely hashed password string
        """
        # Validate password strength
        is_valid, message = self.validate_password_strength(password, user)
        if not is_valid:
            self._logger.warning(f"Password validation failed: {message}")
            raise ValueError(message)

        try:
            # Generate secure hash
            hashed_password = self._security_manager.hash_password(password)
            
            # Add to password history
            if hasattr(user, 'add_password_history'):
                user.add_password_history(hashed_password)
            
            self._logger.info(f"Password hashed successfully for user {user.id}")
            return hashed_password
            
        except Exception as e:
            self._logger.error(f"Password hashing failed: {str(e)}")
            raise RuntimeError("Failed to hash password") from e

    def generate_reset_token(self, user: User, ip_address: str) -> Tuple[str, datetime]:
        """
        Generate secure password reset token with rate limiting and progressive delay.

        Args:
            user: User requesting password reset
            ip_address: IP address of request for rate limiting

        Returns:
            Tuple containing reset token and expiry timestamp
        """
        # Check rate limiting
        if not self._check_reset_rate_limit(ip_address):
            self._logger.warning(f"Reset rate limit exceeded for IP: {ip_address}")
            raise ValueError("Too many reset attempts. Please try again later.")

        try:
            # Generate secure token
            token = self._security_manager.generate_secure_token()
            expiry = datetime.now() + timedelta(hours=RESET_TOKEN_EXPIRY_HOURS)

            # Update rate limiting counters
            self._update_reset_attempts(ip_address)

            self._logger.info(f"Reset token generated for user {user.id}")
            return token, expiry

        except Exception as e:
            self._logger.error(f"Token generation failed: {str(e)}")
            raise RuntimeError("Failed to generate reset token") from e

    def reset_password(self, user: User, new_password: str, token: str, ip_address: str) -> bool:
        """
        Reset user password with comprehensive validation and security checks.

        Args:
            user: User whose password is being reset
            new_password: New password to set
            token: Reset token to verify
            ip_address: IP address for rate limiting

        Returns:
            Boolean indicating success of password reset
        """
        # Verify reset token
        if not self._verify_reset_token(token, user):
            self._logger.warning(f"Invalid reset token for user {user.id}")
            return False

        try:
            # Validate new password
            is_valid, message = self.validate_password_strength(new_password, user)
            if not is_valid:
                self._logger.warning(f"New password validation failed: {message}")
                return False

            # Hash and update password
            hashed_password = self.hash_password(new_password, user)
            user.update_password(hashed_password)

            # Clear reset token and attempts
            self._clear_reset_data(user, ip_address)

            self._logger.info(f"Password reset successful for user {user.id}")
            return True

        except Exception as e:
            self._logger.error(f"Password reset failed: {str(e)}")
            return False

    def _check_reset_rate_limit(self, ip_address: str) -> bool:
        """Check if reset attempts are within rate limits."""
        attempts = self._reset_attempts.get(ip_address, {"count": 0, "timestamp": datetime.now()})
        
        if attempts["count"] >= MAX_RESET_ATTEMPTS:
            time_diff = datetime.now() - attempts["timestamp"]
            if time_diff < timedelta(hours=1):
                return False
            
            # Reset counter after timeout
            self._reset_attempts[ip_address] = {"count": 0, "timestamp": datetime.now()}
            
        return True

    def _update_reset_attempts(self, ip_address: str) -> None:
        """Update rate limiting counters for reset attempts."""
        attempts = self._reset_attempts.get(ip_address, {"count": 0, "timestamp": datetime.now()})
        attempts["count"] += 1
        attempts["timestamp"] = datetime.now()
        self._reset_attempts[ip_address] = attempts

    def _verify_reset_token(self, token: str, user: User) -> bool:
        """Verify reset token validity."""
        # Implementation would verify token against stored value
        # and check expiration time
        return True  # Placeholder - actual implementation would verify token

    def _clear_reset_data(self, user: User, ip_address: str) -> None:
        """Clear reset token and attempt counters after successful reset."""
        self._reset_attempts.pop(ip_address, None)
        # Additional cleanup of stored tokens would be implemented here