"""
User schema module providing comprehensive validation and security measures for user-related
API requests and responses in the Art Knowledge Graph API Gateway service.
"""

from datetime import datetime
from typing import Dict, Any, Optional
import re
from pydantic import model_validator, field_validator, EmailStr
from email_validator import validate_email, EmailNotValidError

from shared.schemas.base import BaseSchema
from shared.schemas.error import ValidationError

# Security-focused password requirements
PASSWORD_MIN_LENGTH = 12
PASSWORD_PATTERN = r'^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{12,}$'

class UserBase(BaseSchema):
    """
    Base schema for user data with enhanced validation and premium user support.
    Implements core user attributes with strict validation rules.
    """
    email: EmailStr
    name: str
    premium_status: bool = False
    preferences: Dict[str, Any] = {}

    model_config = {
        "from_attributes": True,
        "strict": True,
        "json_encoders": {
            datetime: lambda dt: dt.strftime("%Y-%m-%d %H:%M:%S")
        }
    }

    @field_validator('email')
    @classmethod
    def validate_email(cls, value: str) -> str:
        """
        Enhanced email validation with international support and security checks.
        
        Args:
            value: Email address to validate
            
        Returns:
            str: Normalized and validated email address
            
        Raises:
            ValidationError: If email is invalid or from a disposable provider
        """
        try:
            # Normalize and validate email
            email_info = validate_email(value, check_deliverability=True)
            normalized_email = email_info.normalized.lower()

            # Check for disposable email providers (example check)
            disposable_domains = {'tempmail.com', 'throwaway.com'}
            domain = normalized_email.split('@')[1]
            if domain in disposable_domains:
                raise ValidationError(
                    message="Disposable email providers are not allowed",
                    errors=[{"field": "email", "message": "Please use a permanent email address"}]
                )

            return normalized_email
        except EmailNotValidError as e:
            raise ValidationError(
                message="Invalid email address",
                errors=[{"field": "email", "message": str(e)}]
            )

class UserCreate(UserBase):
    """
    Schema for user registration with enhanced password validation and security measures.
    """
    password: str
    password_confirm: str

    @field_validator('password')
    @classmethod
    def validate_password(cls, value: str, values: Dict[str, Any]) -> str:
        """
        Enhanced password validation with comprehensive security requirements.
        
        Args:
            value: Password to validate
            values: Dict containing all field values
            
        Returns:
            str: Validated password
            
        Raises:
            ValidationError: If password doesn't meet security requirements
        """
        if len(value) < PASSWORD_MIN_LENGTH:
            raise ValidationError(
                message="Password too short",
                errors=[{
                    "field": "password",
                    "message": f"Password must be at least {PASSWORD_MIN_LENGTH} characters long"
                }]
            )

        if not re.match(PASSWORD_PATTERN, value):
            raise ValidationError(
                message="Password too weak",
                errors=[{
                    "field": "password",
                    "message": "Password must contain uppercase, lowercase, number and special character"
                }]
            )

        # Check for common passwords (example check)
        common_passwords = {'Password123!', 'Admin123!'}
        if value in common_passwords:
            raise ValidationError(
                message="Common password detected",
                errors=[{
                    "field": "password",
                    "message": "Please use a less common password"
                }]
            )

        # Verify password confirmation
        if 'password_confirm' in values and value != values['password_confirm']:
            raise ValidationError(
                message="Passwords do not match",
                errors=[{
                    "field": "password_confirm",
                    "message": "Password confirmation does not match"
                }]
            )

        return value

class UserUpdate(UserBase):
    """
    Schema for user profile updates with preference validation and sanitization.
    """
    name: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = None

    @field_validator('preferences')
    @classmethod
    def validate_preferences(cls, value: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Validates and sanitizes user preferences.
        
        Args:
            value: User preferences dictionary
            
        Returns:
            Optional[Dict[str, Any]]: Validated preferences
            
        Raises:
            ValidationError: If preferences are invalid
        """
        if value is None:
            return {}

        # Validate preference keys and values
        allowed_keys = {'theme', 'language', 'notifications', 'display_mode'}
        invalid_keys = set(value.keys()) - allowed_keys
        
        if invalid_keys:
            raise ValidationError(
                message="Invalid preference keys",
                errors=[{
                    "field": "preferences",
                    "message": f"Invalid preference keys: {', '.join(invalid_keys)}"
                }]
            )

        # Sanitize and validate values
        sanitized = {}
        for key, val in value.items():
            if key == 'theme' and val not in {'light', 'dark', 'system'}:
                raise ValidationError(
                    message="Invalid theme value",
                    errors=[{"field": "preferences.theme", "message": "Invalid theme selection"}]
                )
            if key == 'language' and not isinstance(val, str):
                raise ValidationError(
                    message="Invalid language value",
                    errors=[{"field": "preferences.language", "message": "Language must be a string"}]
                )
            sanitized[key] = val

        return sanitized

class UserResponse(UserBase):
    """
    Schema for user data in API responses with enhanced security measures.
    Excludes sensitive information and includes premium status tracking.
    """
    id: str
    email: EmailStr
    name: str
    premium_status: bool
    preferences: Dict[str, Any]
    created_at: datetime
    last_login: Optional[datetime] = None
    last_premium_check: Optional[datetime] = None

    model_config = {
        "from_attributes": True,
        "strict": True,
        "json_encoders": {
            datetime: lambda dt: dt.strftime("%Y-%m-%d %H:%M:%S") if dt else None
        }
    }