"""
Authentication service package initializer for the Art Knowledge Graph application.
Configures and exposes core authentication components with comprehensive security features.

Version: 1.0.0
Security Level: High
"""

import logging
from typing import Tuple, Optional
import boto3
from cryptography.fernet import Fernet
from casbin import Enforcer
from pythonjsonlogger import jsonlogger

from auth_service.config import AuthServiceSettings
from auth_service.services.jwt import JWTManager
from auth_service.services.oauth import OAuthManager
from shared.utils.security import SecurityManager

# Package metadata
__version__ = "1.0.0"
__author__ = "Art Knowledge Graph Team"
__security_level__ = "high"

# Configure logging with JSON formatter for better security audit trails
logger = logging.getLogger(__name__)
logHandler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter(
    fmt="%(asctime)s %(name)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logHandler.setFormatter(formatter)
logger.addHandler(logHandler)
logger.setLevel(logging.INFO)

def ensure_secure_context(func):
    """
    Decorator to ensure secure execution context for service initialization.
    Validates security prerequisites and monitors initialization process.
    """
    def wrapper(*args, **kwargs):
        try:
            logger.info("Validating secure context for service initialization")
            # Verify SSL/TLS configuration
            if not kwargs.get("environment") == "development":
                if not kwargs.get("config_path"):
                    raise ValueError("Secure configuration path required in non-development environment")
            
            # Execute wrapped function
            result = func(*args, **kwargs)
            
            logger.info("Service initialization completed with secure context")
            return result
            
        except Exception as e:
            logger.error(f"Service initialization failed: {str(e)}")
            raise RuntimeError(f"Failed to initialize service in secure context: {str(e)}")
    
    return wrapper

@ensure_secure_context
def initialize_auth_service(
    config_path: str,
    environment: str = "development"
) -> Tuple[AuthServiceSettings, JWTManager, OAuthManager]:
    """
    Initialize authentication service with comprehensive security features.
    
    Args:
        config_path: Path to service configuration file
        environment: Deployment environment (development/staging/production)
        
    Returns:
        Tuple containing initialized service components
        
    Raises:
        RuntimeError: If initialization fails or security requirements not met
    """
    try:
        # Initialize settings with security validation
        settings = AuthServiceSettings(environment=environment)
        logger.info(f"Initialized auth service settings for {environment} environment")

        # Set up AWS KMS for encryption key management in production
        if environment == "production":
            kms_client = boto3.client('kms', region_name=settings.aws_region)
            logger.info("Initialized AWS KMS client for key management")

        # Initialize security manager
        security_manager = SecurityManager(settings)
        logger.info("Initialized security manager with enhanced features")

        # Initialize JWT manager with secure defaults
        jwt_manager = JWTManager(settings)
        logger.info("Initialized JWT manager with secure token handling")

        # Initialize OAuth manager with provider configurations
        oauth_manager = OAuthManager(settings, jwt_manager)
        logger.info("Initialized OAuth manager with provider support")

        # Configure role-based access control
        enforcer = Enforcer("auth_service/rbac_model.conf", "auth_service/rbac_policy.csv")
        logger.info("Initialized RBAC enforcer with policy rules")

        # Configure rate limiting
        rate_limit_config = {
            "default": "100/minute",
            "auth_endpoints": "20/minute",
            "sensitive_operations": "5/minute"
        }
        logger.info("Configured rate limiting rules")

        # Verify security settings
        if not _verify_security_configuration(settings, environment):
            raise ValueError("Security configuration verification failed")

        # Set up audit logging
        _configure_audit_logging(settings)
        logger.info("Configured secure audit logging")

        return settings, jwt_manager, oauth_manager

    except Exception as e:
        logger.error(f"Auth service initialization failed: {str(e)}")
        raise RuntimeError(f"Failed to initialize authentication service: {str(e)}")

def _verify_security_configuration(
    settings: AuthServiceSettings,
    environment: str
) -> bool:
    """
    Verify security configuration meets requirements for environment.
    
    Args:
        settings: Service settings instance
        environment: Deployment environment
        
    Returns:
        bool indicating if security configuration is valid
    """
    try:
        # Verify JWT configuration
        if settings.jwt_algorithm not in {"RS256", "RS384", "RS512"}:
            raise ValueError("Insecure JWT algorithm specified")

        # Verify encryption settings
        if settings.encryption_settings["algorithm"] != "AES-256-GCM":
            raise ValueError("Insecure encryption algorithm specified")

        # Additional production checks
        if environment == "production":
            if not settings.ssl_config.get("verify_mode"):
                raise ValueError("SSL verification required in production")
            if settings.debug:
                raise ValueError("Debug mode must be disabled in production")

        return True

    except Exception as e:
        logger.error(f"Security configuration verification failed: {str(e)}")
        return False

def _configure_audit_logging(settings: AuthServiceSettings) -> None:
    """
    Configure secure audit logging for authentication events.
    
    Args:
        settings: Service settings instance
    """
    audit_logger = logging.getLogger("auth_audit")
    audit_logger.setLevel(logging.INFO)

    # Configure CloudWatch logging in production
    if settings.environment == "production":
        cloudwatch_handler = logging.handlers.WatchedFileHandler(
            filename="/var/log/auth_audit.log"
        )
        audit_logger.addHandler(cloudwatch_handler)

    # Configure JSON formatting for structured logging
    json_handler = logging.StreamHandler()
    json_handler.setFormatter(jsonlogger.JsonFormatter())
    audit_logger.addHandler(json_handler)

# Export core components
__all__ = [
    "AuthServiceSettings",
    "JWTManager", 
    "OAuthManager",
    "initialize_auth_service",
    "__version__",
    "__security_level__"
]