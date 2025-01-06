from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from pydantic import Field, validator
from pydantic.dataclasses import dataclass as pydantic_dataclass
from shared.config.settings import Settings, get_database_url, validate_settings

# API Gateway Configuration Constants
DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 8000
DEFAULT_REQUEST_TIMEOUT = 30  # seconds
DEFAULT_MAX_REQUEST_SIZE = 10 * 1024 * 1024  # 10MB
DEFAULT_HEALTH_CHECK_INTERVAL = 30  # seconds
DEFAULT_CACHE_TTL = 300  # seconds

# Default rate limits per endpoint
DEFAULT_RATE_LIMITS = {
    "artwork": {"calls": 100, "period": "1m", "burst": 1.5},
    "graph": {"calls": 60, "period": "1m", "burst": 1.2},
    "search": {"calls": 1000, "period": "1m", "burst": 1.3}
}

# Default security controls
DEFAULT_SECURITY_CONTROLS = {
    "max_payload_size": "10MB",
    "allowed_content_types": ["application/json", "multipart/form-data"],
    "cors_origins": ["*"],
    "ssl_verify": True
}

@dataclass
class RateLimitConfig:
    """Rate limiting configuration for API endpoints."""
    calls: int
    period: str
    burst: float
    client_specific: bool = False
    override_limits: Dict[str, Dict[str, Any]] = field(default_factory=dict)

@dataclass
class ServiceEndpoint:
    """Service endpoint configuration with health check parameters."""
    host: str
    port: int
    use_ssl: bool = True
    health_check_path: str = "/health"
    failover_endpoints: List[Dict[str, Any]] = field(default_factory=list)
    timeout: int = DEFAULT_REQUEST_TIMEOUT

@dataclass
class SecurityControl:
    """Security control configuration for API Gateway."""
    max_payload_size: int
    allowed_content_types: List[str]
    cors_origins: List[str]
    ssl_verify: bool
    trusted_proxies: List[str] = field(default_factory=list)

@dataclass
class HealthCheck:
    """Health check configuration for services."""
    path: str
    interval: int
    timeout: int
    healthy_threshold: int
    unhealthy_threshold: int

@dataclass
class CacheConfig:
    """Cache configuration for API responses."""
    ttl: int
    strategy: str
    max_size: int
    invalidation_patterns: List[str]

@pydantic_dataclass
class APIGatewaySettings:
    """Enhanced API Gateway specific settings with advanced security and configuration."""
    service_name: str = "api-gateway"
    host: str = DEFAULT_HOST
    port: int = DEFAULT_PORT
    rate_limits: Dict[str, RateLimitConfig] = field(default_factory=lambda: DEFAULT_RATE_LIMITS)
    trusted_proxies: List[str] = field(default_factory=list)
    service_endpoints: Dict[str, ServiceEndpoint] = field(default_factory=dict)
    request_timeout: int = DEFAULT_REQUEST_TIMEOUT
    max_request_size: int = DEFAULT_MAX_REQUEST_SIZE
    security_controls: Dict[str, SecurityControl] = field(default_factory=dict)
    health_checks: Dict[str, HealthCheck] = field(default_factory=dict)
    cache_settings: Dict[str, CacheConfig] = field(default_factory=dict)
    _base_settings: Settings = None

    def __init__(self, env: str, override_settings: Optional[Dict] = None):
        """Initialize API Gateway settings with enhanced security and validation."""
        self._base_settings = Settings(environment=env)
        self._initialize_rate_limits()
        self._initialize_service_endpoints()
        self._initialize_security_controls()
        self._initialize_health_checks()
        self._initialize_cache_settings()
        
        if override_settings:
            self._apply_override_settings(override_settings)
        
        self.validate_security_controls(self.security_controls)

    def _initialize_rate_limits(self) -> None:
        """Initialize rate limiting configuration."""
        self.rate_limits = {
            endpoint: RateLimitConfig(**config)
            for endpoint, config in DEFAULT_RATE_LIMITS.items()
        }

    def _initialize_service_endpoints(self) -> None:
        """Initialize service endpoint configuration."""
        self.service_endpoints = {
            "graph-service": ServiceEndpoint(
                host="graph-service",
                port=8001,
                health_check_path="/health"
            ),
            "auth-service": ServiceEndpoint(
                host="auth-service",
                port=8002,
                health_check_path="/health"
            )
        }

    def _initialize_security_controls(self) -> None:
        """Initialize security control configuration."""
        self.security_controls = {
            "default": SecurityControl(
                max_payload_size=DEFAULT_MAX_REQUEST_SIZE,
                allowed_content_types=DEFAULT_SECURITY_CONTROLS["allowed_content_types"],
                cors_origins=DEFAULT_SECURITY_CONTROLS["cors_origins"],
                ssl_verify=DEFAULT_SECURITY_CONTROLS["ssl_verify"]
            )
        }

    def _initialize_health_checks(self) -> None:
        """Initialize health check configuration."""
        self.health_checks = {
            service: HealthCheck(
                path="/health",
                interval=DEFAULT_HEALTH_CHECK_INTERVAL,
                timeout=5,
                healthy_threshold=2,
                unhealthy_threshold=3
            )
            for service in self.service_endpoints.keys()
        }

    def _initialize_cache_settings(self) -> None:
        """Initialize cache configuration."""
        self.cache_settings = {
            "default": CacheConfig(
                ttl=DEFAULT_CACHE_TTL,
                strategy="lru",
                max_size=1000,
                invalidation_patterns=[]
            )
        }

    def get_rate_limit(self, endpoint: str, client_id: Optional[str] = None) -> RateLimitConfig:
        """Get rate limit configuration for endpoint with client-specific adjustments."""
        base_config = self.rate_limits.get(endpoint)
        if not base_config:
            return self.rate_limits.get("default")

        if client_id and base_config.client_specific:
            client_override = base_config.override_limits.get(client_id)
            if client_override:
                return RateLimitConfig(**client_override)

        return base_config

    def get_service_url(self, service_name: str, use_ssl: Optional[bool] = None) -> str:
        """Get service URL with health check and failover support."""
        service = self.service_endpoints.get(service_name)
        if not service:
            raise ValueError(f"Unknown service: {service_name}")

        protocol = "https" if use_ssl or service.use_ssl else "http"
        return f"{protocol}://{service.host}:{service.port}"

    @validator("security_controls")
    def validate_security_controls(cls, controls: Dict[str, Any]) -> bool:
        """Validate security control configuration."""
        if not controls.get("default"):
            raise ValueError("Default security controls must be defined")

        for control in controls.values():
            if not isinstance(control, SecurityControl):
                raise ValueError("Invalid security control configuration")

            if control.max_payload_size > DEFAULT_MAX_REQUEST_SIZE:
                raise ValueError("Maximum payload size exceeds allowed limit")

            if not control.allowed_content_types:
                raise ValueError("Content types must be specified")

            if not control.cors_origins and cls._base_settings.environment == "production":
                raise ValueError("CORS origins must be explicitly defined in production")

        return controls

    def _apply_override_settings(self, overrides: Dict[str, Any]) -> None:
        """Apply override settings with validation."""
        for key, value in overrides.items():
            if hasattr(self, key):
                setattr(self, key, value)