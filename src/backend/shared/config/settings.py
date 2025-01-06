import os
import json
import logging
from typing import Dict, List, Optional, Any, Pattern
from pathlib import Path
from functools import lru_cache

# pydantic v2.0+
from pydantic import (
    BaseSettings,
    SecretStr,
    Field,
    validator,
    root_validator
)
from pydantic.dataclasses import dataclass
from dotenv import load_dotenv  # python-dotenv v1.0+

# Constants for configuration management
DEFAULT_ENVIRONMENT = "development"
DEFAULT_API_VERSION = "v1"
DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES = 30
DEFAULT_ALGORITHM = "HS256"
DEFAULT_CONNECTION_RETRY_ATTEMPTS = 3
DEFAULT_CONNECTION_TIMEOUT = 30

REQUIRED_ENV_VARS = [
    "SECRET_KEY",
    "NEO4J_URI",
    "POSTGRES_URI",
    "REDIS_URI"
]

SENSITIVE_CONFIG_KEYS = [
    "secret_key",
    "*_password",
    "*_key"
]

@dataclass
class Settings(BaseSettings):
    """
    Enhanced core settings class managing all configuration with advanced security
    and validation features for the Art Knowledge Graph backend services.
    """
    # Basic application settings
    environment: str = Field(DEFAULT_ENVIRONMENT, env="ENVIRONMENT")
    app_name: str = Field("Art Knowledge Graph", env="APP_NAME")
    api_version: str = Field(DEFAULT_API_VERSION, env="API_VERSION")
    debug: bool = Field(False, env="DEBUG")

    # Security settings
    secret_key: SecretStr = Field(..., env="SECRET_KEY")
    access_token_expire_minutes: int = Field(
        DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES,
        env="ACCESS_TOKEN_EXPIRE_MINUTES"
    )
    algorithm: str = Field(DEFAULT_ALGORITHM, env="ALGORITHM")

    # Neo4j settings
    neo4j_uri: SecretStr = Field(..., env="NEO4J_URI")
    neo4j_user: SecretStr = Field(..., env="NEO4J_USER")
    neo4j_password: SecretStr = Field(..., env="NEO4J_PASSWORD")

    # PostgreSQL settings
    postgres_uri: SecretStr = Field(..., env="POSTGRES_URI")
    postgres_pool_size: int = Field(5, env="POSTGRES_POOL_SIZE")
    postgres_max_overflow: int = Field(10, env="POSTGRES_MAX_OVERFLOW")
    postgres_pool_timeout: int = Field(30, env="POSTGRES_POOL_TIMEOUT")

    # Redis settings
    redis_uri: SecretStr = Field(..., env="REDIS_URI")
    redis_pool_size: int = Field(10, env="REDIS_POOL_SIZE")
    redis_ttl: int = Field(3600, env="REDIS_TTL")
    redis_connection_timeout: int = Field(
        DEFAULT_CONNECTION_TIMEOUT,
        env="REDIS_CONNECTION_TIMEOUT"
    )

    # External API credentials
    getty_api_key: SecretStr = Field(..., env="GETTY_API_KEY")
    wikidata_endpoint: str = Field(
        "https://query.wikidata.org/sparql",
        env="WIKIDATA_ENDPOINT"
    )
    google_arts_api_key: SecretStr = Field(..., env="GOOGLE_ARTS_API_KEY")

    # CORS settings
    allowed_origins: List[str] = Field(default_factory=list, env="ALLOWED_ORIGINS")

    # Logging configuration
    log_level: str = Field("INFO", env="LOG_LEVEL")
    log_format: str = Field(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        env="LOG_FORMAT"
    )
    log_destination: str = Field("stdout", env="LOG_DESTINATION")

    # AWS configuration
    aws_region: str = Field("us-east-1", env="AWS_REGION")
    s3_bucket: str = Field(..., env="S3_BUCKET")
    cdn_domain: str = Field(..., env="CDN_DOMAIN")

    # Connection management
    connection_retry_attempts: int = Field(
        DEFAULT_CONNECTION_RETRY_ATTEMPTS,
        env="CONNECTION_RETRY_ATTEMPTS"
    )
    connection_retry_delay: int = Field(5, env="CONNECTION_RETRY_DELAY")

    # SSL configuration
    ssl_config: Dict[str, Any] = Field(
        default_factory=lambda: {
            "verify_mode": "CERT_REQUIRED",
            "ca_certs": None,
            "certfile": None,
            "keyfile": None
        }
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        validate_assignment = True
        extra = "forbid"

    def __init__(self, environment: str = DEFAULT_ENVIRONMENT, config_path: Optional[str] = None):
        """Initialize settings with enhanced validation and security measures."""
        super().__init__()
        self.environment = environment
        self._initialize_settings(config_path)
        self.validate_security_settings()

    def _initialize_settings(self, config_path: Optional[str]) -> None:
        """Initialize all settings with security checks and validation."""
        env_vars = self.load_env_vars(config_path)
        self._configure_logging()
        self._validate_database_settings()
        self._configure_ssl()
        self._setup_connection_pooling()

    @validator("environment")
    def validate_environment(cls, v: str) -> str:
        """Validate environment setting."""
        allowed_environments = {"development", "staging", "production"}
        if v.lower() not in allowed_environments:
            raise ValueError(f"Environment must be one of {allowed_environments}")
        return v.lower()

    @validator("allowed_origins")
    def validate_cors_origins(cls, v: List[str]) -> List[str]:
        """Validate CORS origins."""
        if not v and os.getenv("ENVIRONMENT") == "production":
            raise ValueError("CORS origins must be explicitly set in production")
        return v

    @root_validator
    def validate_ssl_config(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """Validate SSL configuration based on environment."""
        env = values.get("environment")
        if env == "production" and not values.get("ssl_config", {}).get("ca_certs"):
            raise ValueError("SSL CA certificate is required in production")
        return values

    def get_database_url(self, db_type: str, additional_params: Optional[Dict] = None) -> str:
        """Construct secure database connection URL with connection pooling."""
        if db_type not in {"neo4j", "postgres", "redis"}:
            raise ValueError(f"Unsupported database type: {db_type}")

        base_url = getattr(self, f"{db_type}_uri").get_secret_value()
        params = additional_params or {}

        if db_type == "postgres":
            params.update({
                "pool_size": self.postgres_pool_size,
                "max_overflow": self.postgres_max_overflow,
                "pool_timeout": self.postgres_pool_timeout
            })

        return self._build_connection_url(base_url, params)

    def load_env_vars(self, env_file: Optional[str] = None) -> Dict[str, Any]:
        """Securely load and validate environment variables."""
        env_file = env_file or self.Config.env_file
        if not os.path.exists(env_file):
            if self.environment == "production":
                raise FileNotFoundError(f"Environment file not found: {env_file}")
            logging.warning(f"Environment file not found: {env_file}")
            return {}

        load_dotenv(env_file)
        self._validate_required_env_vars()
        return dict(os.environ)

    def validate_security_settings(self) -> bool:
        """Validate security-related configuration."""
        if self.environment == "production":
            self._validate_production_security()
        self._validate_token_settings()
        self._validate_connection_security()
        return True

    def _validate_required_env_vars(self) -> None:
        """Validate presence of required environment variables."""
        missing_vars = [var for var in REQUIRED_ENV_VARS if not os.getenv(var)]
        if missing_vars:
            raise ValueError(f"Missing required environment variables: {missing_vars}")

    def _validate_production_security(self) -> None:
        """Validate production-specific security settings."""
        if not self.secret_key.get_secret_value():
            raise ValueError("Production environment requires a secure secret key")
        if self.debug:
            raise ValueError("Debug mode must be disabled in production")

    def _validate_token_settings(self) -> None:
        """Validate JWT token settings."""
        if self.access_token_expire_minutes < 15:
            raise ValueError("Token expiration time too short")
        if self.algorithm not in {"HS256", "HS384", "HS512", "RS256"}:
            raise ValueError(f"Unsupported algorithm: {self.algorithm}")

    def _validate_connection_security(self) -> None:
        """Validate connection security settings."""
        if self.environment == "production":
            if not self.ssl_config.get("verify_mode"):
                raise ValueError("SSL verification is required in production")

    def _configure_logging(self) -> None:
        """Configure logging settings."""
        logging.basicConfig(
            level=getattr(logging, self.log_level.upper()),
            format=self.log_format
        )

    def _build_connection_url(self, base_url: str, params: Dict[str, Any]) -> str:
        """Build connection URL with parameters."""
        if not params:
            return base_url
        param_str = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{base_url}?{param_str}"

    def _configure_ssl(self) -> None:
        """Configure SSL settings based on environment."""
        if self.environment == "production":
            self.ssl_config.update({
                "verify_mode": "CERT_REQUIRED",
                "ca_certs": os.getenv("SSL_CA_CERTS_PATH")
            })

    def _setup_connection_pooling(self) -> None:
        """Configure connection pooling settings."""
        if self.environment == "production":
            self.postgres_pool_size = max(self.postgres_pool_size, 10)
            self.redis_pool_size = max(self.redis_pool_size, 20)

@lru_cache()
def get_settings(environment: str = DEFAULT_ENVIRONMENT) -> Settings:
    """Get cached settings instance."""
    return Settings(environment=environment)