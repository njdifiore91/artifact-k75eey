"""
User model class defining the core user entity for the Art Knowledge Graph authentication service.
Implements comprehensive security features, multi-factor authentication, and role-based access control.
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
import uuid
import pyotp  # pyotp v2.8+
from pydantic import BaseModel, model_config, Field, EmailStr
from shared.schemas.base import BaseSchema

# Security configuration constants
DEFAULT_ROLE = "free_user"
MAX_LOGIN_ATTEMPTS = 5
DEFAULT_LOCK_DURATION = 30  # minutes
PROGRESSIVE_LOCKOUT_MULTIPLIER = 2
MAX_FAILED_IPS = 3
MFA_SECRET_LENGTH = 32

# Valid user roles with hierarchical permissions
VALID_ROLES = ["anonymous", "free_user", "premium", "admin"]

@model_config(from_attributes=True)
class User(BaseSchema):
    """
    Enhanced user model with comprehensive security features and role-based access control.
    Implements multi-factor authentication, progressive lockout, and security event tracking.
    """
    
    # Core user fields
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    email: EmailStr
    password_hash: str
    full_name: str
    role: str = Field(default=DEFAULT_ROLE)
    
    # Account status flags
    is_active: bool = Field(default=True)
    is_verified: bool = Field(default=False)
    login_attempts: int = Field(default=0)
    locked_until: Optional[datetime] = None
    
    # Multi-factor authentication
    mfa_secret: Optional[str] = None
    mfa_enabled: bool = Field(default=False)
    
    # User preferences and settings
    preferences: Dict[str, Any] = Field(default_factory=dict)
    
    # OAuth integration
    oauth_provider: Optional[str] = None
    oauth_user_id: Optional[str] = None
    
    # Security tracking
    last_login: Optional[datetime] = None
    failed_login_ips: Dict[str, int] = Field(default_factory=dict)
    security_events: List[str] = Field(default_factory=list)
    session_data: Dict[str, Any] = Field(default_factory=dict)

    def __init__(self, email: str, password_hash: str, full_name: str, role: Optional[str] = DEFAULT_ROLE):
        """
        Initialize a new user instance with enhanced security features.
        
        Args:
            email: User's email address
            password_hash: Pre-hashed password
            full_name: User's full name
            role: User role (defaults to free_user)
        """
        super().__init__(
            id=uuid.uuid4(),
            email=email,
            password_hash=password_hash,
            full_name=full_name,
            role=role if role in VALID_ROLES else DEFAULT_ROLE,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )

    def check_password(self, password: str, ip_address: Optional[str] = None) -> bool:
        """
        Verify password with enhanced security checks including progressive lockout.
        
        Args:
            password: Password to verify
            ip_address: Optional IP address for tracking failed attempts
            
        Returns:
            bool: True if password matches and account is not locked
        """
        # Check if account is locked
        if self.locked_until and datetime.now(timezone.utc) < self.locked_until:
            self.security_events.append(f"Login attempt while locked: {datetime.now(timezone.utc)}")
            return False

        # Verify password (assuming password_hash is properly hashed)
        is_valid = self.password_hash == password  # Note: Replace with proper hash comparison

        if not is_valid:
            self.login_attempts += 1
            
            # Track failed IP attempts
            if ip_address:
                self.failed_login_ips[ip_address] = self.failed_login_ips.get(ip_address, 0) + 1
                
                # Implement IP-based blocking
                if self.failed_login_ips[ip_address] >= MAX_FAILED_IPS:
                    self.security_events.append(f"IP blocked due to multiple failures: {ip_address}")
                    return False

            # Implement progressive lockout
            if self.login_attempts >= MAX_LOGIN_ATTEMPTS:
                lockout_duration = DEFAULT_LOCK_DURATION * (
                    PROGRESSIVE_LOCKOUT_MULTIPLIER ** (self.login_attempts - MAX_LOGIN_ATTEMPTS)
                )
                self.locked_until = datetime.now(timezone.utc) + \
                                  datetime.timedelta(minutes=lockout_duration)
                self.security_events.append(f"Account locked for {lockout_duration} minutes")
                
            return False

        # Reset security counters on successful login
        self.login_attempts = 0
        self.last_login = datetime.now(timezone.utc)
        if ip_address:
            self.failed_login_ips.pop(ip_address, None)
            
        return True

    def validate_mfa(self, token: str) -> bool:
        """
        Validate MFA token using TOTP.
        
        Args:
            token: TOTP token to validate
            
        Returns:
            bool: True if MFA token is valid
        """
        if not self.mfa_enabled or not self.mfa_secret:
            return False

        totp = pyotp.TOTP(self.mfa_secret)
        is_valid = totp.verify(token)
        
        # Log validation attempt
        self.security_events.append(
            f"MFA validation {'successful' if is_valid else 'failed'}: {datetime.now(timezone.utc)}"
        )
        
        return is_valid

    def update_security_status(self, ip_address: str, event_type: str) -> None:
        """
        Update user security status and tracking information.
        
        Args:
            ip_address: IP address of the security event
            event_type: Type of security event to log
        """
        current_time = datetime.now(timezone.utc)
        
        # Update IP tracking
        if event_type == "failed_login":
            self.failed_login_ips[ip_address] = self.failed_login_ips.get(ip_address, 0) + 1
        elif event_type == "successful_login":
            self.failed_login_ips.pop(ip_address, None)
            
        # Log security event
        self.security_events.append(f"{event_type}: {current_time} from {ip_address}")
        
        # Update timestamp
        self.updated_at = current_time
        
        # Trim security events list if it gets too long
        if len(self.security_events) > 100:
            self.security_events = self.security_events[-100:]