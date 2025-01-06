from typing import Dict, List, Any, Optional
from pydantic import SecretStr, Field, validator
from pydantic.dataclasses import dataclass
from shared.config.settings import Settings, get_database_url

# Authentication service constants
DEFAULT_SERVICE_NAME = "auth_service"
DEFAULT_JWT_ALGORITHM = "RS256"  # More secure than HS256
DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES = 30
DEFAULT_REFRESH_TOKEN_EXPIRE_DAYS = 30
DEFAULT_PASSWORD_MIN_LENGTH = 12
DEFAULT_MAX_LOGIN_ATTEMPTS = 5
DEFAULT_LOCKOUT_DURATION_MINUTES = 30

# Role-based access control configuration
ALLOWED_ROLES = ["anonymous", "free_user", "premium", "admin"]
ROLE_HIERARCHY = {
    "admin": ["premium", "free_user"],
    "premium": ["free_user"],
    "free_user": ["anonymous"]
}

@dataclass
class AuthServiceSettings(Settings):
    """
    Authentication service specific settings extending base Settings with
    comprehensive security features for the Art Knowledge Graph application.
    """
    # Service identification
    service_name: str = Field(DEFAULT_SERVICE_NAME, const=True)

    # JWT configuration
    jwt_secret_key: SecretStr = Field(..., env="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(DEFAULT_JWT_ALGORITHM, env="JWT_ALGORITHM")
    jwt_access_token_expire_minutes: int = Field(
        DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES,
        env="JWT_ACCESS_TOKEN_EXPIRE_MINUTES"
    )
    jwt_refresh_token_expire_days: int = Field(
        DEFAULT_REFRESH_TOKEN_EXPIRE_DAYS,
        env="JWT_REFRESH_TOKEN_EXPIRE_DAYS"
    )

    # OAuth configuration
    oauth_google_client_id: SecretStr = Field(..., env="OAUTH_GOOGLE_CLIENT_ID")
    oauth_google_client_secret: SecretStr = Field(..., env="OAUTH_GOOGLE_CLIENT_SECRET")
    oauth_apple_team_id: str = Field(..., env="OAUTH_APPLE_TEAM_ID")
    oauth_apple_key_id: str = Field(..., env="OAUTH_APPLE_KEY_ID")
    oauth_apple_private_key_path: str = Field(..., env="OAUTH_APPLE_PRIVATE_KEY_PATH")

    # Password policy
    password_min_length: int = Field(DEFAULT_PASSWORD_MIN_LENGTH, env="PASSWORD_MIN_LENGTH")
    password_require_uppercase: bool = Field(True, env="PASSWORD_REQUIRE_UPPERCASE")
    password_require_numbers: bool = Field(True, env="PASSWORD_REQUIRE_NUMBERS")
    password_require_special: bool = Field(True, env="PASSWORD_REQUIRE_SPECIAL")

    # Security measures
    max_login_attempts: int = Field(DEFAULT_MAX_LOGIN_ATTEMPTS, env="MAX_LOGIN_ATTEMPTS")
    lockout_duration_minutes: int = Field(
        DEFAULT_LOCKOUT_DURATION_MINUTES,
        env="LOCKOUT_DURATION_MINUTES"
    )

    # Role-based access control
    role_permissions: Dict[str, List[str]] = Field(
        default_factory=lambda: {
            "anonymous": ["view_basic"],
            "free_user": ["view_basic", "upload_art", "view_graphs_basic"],
            "premium": ["view_basic", "upload_art", "view_graphs_full", "export_full"],
            "admin": ["view_basic", "upload_art", "view_graphs_full", "export_full", "manage_users"]
        }
    )

    # Multi-factor authentication settings
    mfa_settings: Dict[str, Dict] = Field(
        default_factory=lambda: {
            "totp": {
                "enabled": True,
                "issuer": "ArtKnowledgeGraph",
                "digits": 6,
                "interval": 30
            },
            "sms": {
                "enabled": True,
                "provider": "twilio",
                "timeout_seconds": 300
            }
        }
    )

    # Biometric authentication settings
    biometric_settings: Dict[str, Dict] = Field(
        default_factory=lambda: {
            "enabled": True,
            "max_devices_per_user": 3,
            "allowed_types": ["fingerprint", "face_id", "touch_id"],
            "token_validity_days": 30
        }
    )

    # Encryption settings
    encryption_settings: Dict[str, str] = Field(
        default_factory=lambda: {
            "algorithm": "AES-256-GCM",
            "key_rotation_days": "30",
            "kms_key_id": "aws/kms"
        }
    )

    @validator("jwt_algorithm")
    def validate_jwt_algorithm(cls, v: str) -> str:
        """Validate JWT algorithm meets security requirements."""
        allowed_algorithms = ["RS256", "RS384", "RS512"]
        if v not in allowed_algorithms:
            raise ValueError(f"JWT algorithm must be one of {allowed_algorithms}")
        return v

    def get_jwt_settings(self) -> Dict[str, Any]:
        """
        Returns comprehensive JWT configuration with enhanced security settings.
        """
        return {
            "secret_key": self.jwt_secret_key.get_secret_value(),
            "algorithm": self.jwt_algorithm,
            "access_token_expire_minutes": self.jwt_access_token_expire_minutes,
            "refresh_token_expire_days": self.jwt_refresh_token_expire_days,
            "token_type": "Bearer",
            "blacklist_enabled": True,
            "blacklist_token_checks": ["access", "refresh"],
            "csrf_protection": True,
            "audience": self.app_name,
            "issuer": self.service_name
        }

    def get_oauth_settings(self, provider: str) -> Dict[str, Any]:
        """
        Returns OAuth provider configuration with enhanced security settings.
        """
        if provider == "google":
            return {
                "client_id": self.oauth_google_client_id.get_secret_value(),
                "client_secret": self.oauth_google_client_secret.get_secret_value(),
                "scope": ["openid", "email", "profile"],
                "state_ttl_seconds": 600,
                "allowed_domains": None,  # Allow all domains
                "verify_token": True
            }
        elif provider == "apple":
            return {
                "team_id": self.oauth_apple_team_id,
                "key_id": self.oauth_apple_key_id,
                "private_key_path": self.oauth_apple_private_key_path,
                "scope": ["name", "email"],
                "state_ttl_seconds": 600,
                "verify_token": True
            }
        raise ValueError(f"Unsupported OAuth provider: {provider}")

    def get_role_permissions(self, role: str) -> List[str]:
        """
        Returns role-based access control configuration with inheritance.
        """
        if role not in ALLOWED_ROLES:
            raise ValueError(f"Invalid role: {role}")

        permissions = set(self.role_permissions.get(role, []))
        
        # Add inherited permissions based on role hierarchy
        for parent_role, child_roles in ROLE_HIERARCHY.items():
            if role in child_roles:
                permissions.update(self.role_permissions.get(parent_role, []))

        return sorted(list(permissions))