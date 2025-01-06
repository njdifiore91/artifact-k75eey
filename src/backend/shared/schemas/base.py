"""
Base schema module providing foundational schema validation and serialization capabilities
with enhanced security and performance features for the Art Knowledge Graph application.
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any
from pydantic import BaseModel, ConfigDict, model_validator  # pydantic v2.0+

# Global datetime format constants for consistent serialization
DATETIME_FORMAT = "%Y-%m-%d %H:%M:%S"
DATE_FORMAT = "%Y-%m-%d"

class TimestampMixin:
    """
    Mixin class providing secure timestamp functionality with UTC enforcement.
    Ensures all timestamps are stored and handled in UTC format.
    """
    created_at: datetime
    updated_at: datetime

    def update_timestamp(self) -> None:
        """
        Updates the updated_at timestamp with current UTC time.
        Ensures timezone awareness and proper validation.
        """
        try:
            self.updated_at = datetime.now(timezone.utc)
        except Exception as e:
            raise ValueError(f"Failed to update timestamp: {str(e)}")

class BaseSchema(BaseModel, TimestampMixin):
    """
    Enhanced base Pydantic model class providing common functionality for all schemas
    with improved security and performance features.
    """
    
    # Configure model with security-focused settings
    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        json_encoders={
            datetime: lambda dt: dt.strftime(DATETIME_FORMAT) if dt else None
        },
        validate_assignment=True,
        extra="forbid",  # Prevent arbitrary field injection
        strict=True,     # Enforce strict type checking
        frozen=True,     # Immutable instances for thread safety
    )

    # Optional timestamp fields with UTC enforcement
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @model_validator(mode='before')
    def validate_timestamps(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates and ensures UTC timezone for all timestamp fields.
        """
        now = datetime.now(timezone.utc)
        
        # Set default timestamps if not provided
        if not values.get('created_at'):
            values['created_at'] = now
        if not values.get('updated_at'):
            values['updated_at'] = now

        # Ensure timestamps are timezone aware
        for field in ['created_at', 'updated_at']:
            if timestamp := values.get(field):
                if not timestamp.tzinfo:
                    values[field] = timestamp.replace(tzinfo=timezone.utc)

        return values

    def dict(
        self,
        exclude_none: bool = True,
        exclude_defaults: bool = False,
        exclude_unset: bool = False,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Converts schema to dictionary with configured serialization and security measures.

        Args:
            exclude_none: Remove None values from output
            exclude_defaults: Remove default values from output
            exclude_unset: Remove unset values from output
            **kwargs: Additional keyword arguments for model.dict()

        Returns:
            Dict[str, Any]: Sanitized dictionary representation of schema
        """
        # Get base dictionary with security measures
        data = super().model_dump(
            exclude_none=exclude_none,
            exclude_defaults=exclude_defaults,
            exclude_unset=exclude_unset,
            **kwargs
        )

        # Additional security sanitization
        for key, value in data.items():
            if isinstance(value, datetime):
                data[key] = value.strftime(DATETIME_FORMAT)

        return data

    def json(
        self,
        exclude_none: bool = True,
        exclude_defaults: bool = False,
        ensure_ascii: bool = True,
        **kwargs
    ) -> str:
        """
        Converts schema to secure JSON string with proper encoding.

        Args:
            exclude_none: Remove None values from output
            exclude_defaults: Remove default values from output
            ensure_ascii: Ensure ASCII-only output for security
            **kwargs: Additional keyword arguments for model.json()

        Returns:
            str: Secure JSON string representation
        """
        return super().model_dump_json(
            exclude_none=exclude_none,
            exclude_defaults=exclude_defaults,
            exclude_unset=True,
            ensure_ascii=ensure_ascii,
            **kwargs
        )