"""
Shared schemas package initialization module for the Art Knowledge Graph application.
Provides centralized access to core schema components for data validation and error handling.

Version: 1.0.0
"""

from shared.schemas.base import BaseSchema, TimestampMixin  # pydantic v2.0+
from shared.schemas.error import ErrorDetail, ErrorResponse

# Export core schema components for application-wide use
__all__ = [
    "BaseSchema",      # Base schema class with enhanced validation and security
    "TimestampMixin",  # Timestamp functionality for schema models
    "ErrorDetail",     # Detailed error information schema
    "ErrorResponse",   # Standardized error response schema
]

# Package metadata
__version__ = "1.0.0"
__author__ = "Art Knowledge Graph Team"
__description__ = "Core schema components for the Art Knowledge Graph application"