from typing import Dict, List, Any, Optional
from pydantic import Field, validator, root_validator
from pydantic.dataclasses import dataclass
from shared.config.settings import Settings

# Default configuration values
DEFAULT_MAX_IMAGE_SIZE_MB = 10
DEFAULT_MAX_BATCH_SIZE = 100
DEFAULT_PROCESSING_TIMEOUT = 300  # seconds
DEFAULT_SUPPORTED_FORMATS = ["jpg", "jpeg", "png", "tiff"]
DEFAULT_METADATA_CACHE_TTL = 3600  # 1 hour
DEFAULT_API_REQUEST_TIMEOUT = 30  # seconds
DEFAULT_MAX_RETRIES = 3
DEFAULT_LOG_LEVEL = "INFO"
DEFAULT_ENABLE_SSL = True

# API rate limits (requests per minute)
API_RATE_LIMITS = {
    "getty": 100,
    "wikidata": 200,
    "google_arts": 150
}

@dataclass
class DataProcessorSettings(Settings):
    """
    Configuration settings for the Art Knowledge Graph data processor service.
    Manages artwork analysis, metadata extraction, and external API integrations
    with comprehensive validation and security measures.
    """
    # Image processing settings
    max_image_size_mb: int = Field(DEFAULT_MAX_IMAGE_SIZE_MB, ge=1, le=50)
    max_batch_size: int = Field(DEFAULT_MAX_BATCH_SIZE, ge=1, le=500)
    processing_timeout: int = Field(DEFAULT_PROCESSING_TIMEOUT, ge=60, le=900)
    supported_image_formats: List[str] = Field(default_factory=lambda: DEFAULT_SUPPORTED_FORMATS)
    
    # Cache settings
    metadata_cache_ttl: int = Field(DEFAULT_METADATA_CACHE_TTL, ge=300, le=86400)
    
    # API integration settings
    api_request_timeout: int = Field(DEFAULT_API_REQUEST_TIMEOUT, ge=5, le=60)
    max_retries: int = Field(DEFAULT_MAX_RETRIES, ge=1, le=5)
    temp_storage_path: str = Field("/tmp/art_processor")
    api_configurations: Dict[str, Any] = Field(default_factory=dict)
    rate_limits: Dict[str, int] = Field(default_factory=lambda: API_RATE_LIMITS)
    api_credentials: Dict[str, str] = Field(default_factory=dict)
    enable_ssl_verification: bool = Field(DEFAULT_ENABLE_SSL)
    connection_timeouts: Dict[str, int] = Field(default_factory=dict)
    log_level: str = Field(DEFAULT_LOG_LEVEL)

    def __init__(self, settings: Settings):
        """Initialize data processor settings with validation and security checks."""
        super().__init__(environment=settings.environment)
        self._initialize_api_credentials(settings)
        self._configure_api_settings()
        self._validate_storage_settings()
        self._setup_security_settings()

    @validator("supported_image_formats")
    def validate_image_formats(cls, formats: List[str]) -> List[str]:
        """Validate supported image formats."""
        allowed_formats = {"jpg", "jpeg", "png", "tiff", "gif", "bmp"}
        invalid_formats = [fmt for fmt in formats if fmt.lower() not in allowed_formats]
        if invalid_formats:
            raise ValueError(f"Unsupported image formats: {invalid_formats}")
        return [fmt.lower() for fmt in formats]

    @validator("temp_storage_path")
    def validate_storage_path(cls, path: str) -> str:
        """Validate temporary storage path."""
        from pathlib import Path
        storage_path = Path(path)
        storage_path.mkdir(parents=True, exist_ok=True)
        if not storage_path.is_dir() or not os.access(path, os.W_OK):
            raise ValueError(f"Invalid or inaccessible storage path: {path}")
        return str(storage_path.resolve())

    @root_validator
    def validate_api_settings(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """Validate API integration settings."""
        if values.get("environment") == "production":
            if not values.get("enable_ssl_verification"):
                raise ValueError("SSL verification must be enabled in production")
            if not all(values.get("api_credentials", {}).values()):
                raise ValueError("API credentials must be configured in production")
        return values

    def get_api_config(self, api_name: str) -> Dict[str, Any]:
        """
        Returns secure configuration for specified external API with credentials
        and rate limits.
        """
        if api_name not in self.api_configurations:
            raise ValueError(f"Unknown API: {api_name}")

        config = self.api_configurations[api_name].copy()
        config.update({
            "credentials": self.api_credentials.get(api_name),
            "rate_limit": self.rate_limits.get(api_name),
            "timeout": self.connection_timeouts.get(api_name, self.api_request_timeout),
            "verify_ssl": self.enable_ssl_verification,
            "max_retries": self.max_retries
        })
        return config

    def validate_image_config(self, config: Dict[str, Any]) -> bool:
        """
        Validates image processing configuration against security and performance
        requirements.
        """
        try:
            # Validate image size
            if not 0 < config.get("size_mb", 0) <= self.max_image_size_mb:
                raise ValueError(f"Image size exceeds limit of {self.max_image_size_mb}MB")

            # Validate format
            image_format = config.get("format", "").lower()
            if image_format not in self.supported_image_formats:
                raise ValueError(f"Unsupported image format: {image_format}")

            # Validate processing parameters
            if config.get("batch_size", 1) > self.max_batch_size:
                raise ValueError(f"Batch size exceeds maximum of {self.max_batch_size}")

            return True
        except ValueError as e:
            logging.error(f"Image configuration validation failed: {str(e)}")
            return False

    def _initialize_api_credentials(self, settings: Settings) -> None:
        """Initialize API credentials from secure settings."""
        self.api_credentials = {
            "getty": settings.getty_api_key.get_secret_value(),
            "wikidata": settings.wikidata_endpoint,
            "google_arts": settings.google_arts_api_key.get_secret_value()
        }

    def _configure_api_settings(self) -> None:
        """Configure API integration settings."""
        self.api_configurations = {
            "getty": {
                "base_url": "https://api.getty.edu/v1",
                "endpoints": {
                    "search": "/search",
                    "metadata": "/metadata"
                }
            },
            "wikidata": {
                "base_url": self.api_credentials["wikidata"],
                "endpoints": {
                    "sparql": ""
                }
            },
            "google_arts": {
                "base_url": "https://www.googleapis.com/arts/v1",
                "endpoints": {
                    "artwork": "/artwork",
                    "collection": "/collection"
                }
            }
        }
        
        self.connection_timeouts = {
            "getty": 30,
            "wikidata": 45,
            "google_arts": 30
        }

    def _validate_storage_settings(self) -> None:
        """Validate storage settings and permissions."""
        import os
        if not os.path.exists(self.temp_storage_path):
            os.makedirs(self.temp_storage_path, mode=0o750, exist_ok=True)

    def _setup_security_settings(self) -> None:
        """Configure security settings based on environment."""
        if self.environment == "production":
            self.enable_ssl_verification = True
            self.max_retries = min(self.max_retries, 3)
            self.api_request_timeout = min(self.api_request_timeout, 30)