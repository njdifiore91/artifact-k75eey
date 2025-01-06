"""
Error schema module providing standardized error response schemas and error handling utilities
with enhanced security controls for the Art Knowledge Graph backend services.
"""

from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from http import HTTPStatus
from fastapi.responses import JSONResponse
from pydantic import model_validator
import uuid

from shared.schemas.base import BaseSchema  # pydantic v2.0+

# Default error message with minimal information exposure
DEFAULT_ERROR_MESSAGE = "An unexpected error occurred. Please try again later."

# Comprehensive mapping of error codes to HTTP status codes
ERROR_CODES = {
    "validation_error": HTTPStatus.BAD_REQUEST,
    "authentication_error": HTTPStatus.UNAUTHORIZED,
    "authorization_error": HTTPStatus.FORBIDDEN,
    "not_found": HTTPStatus.NOT_FOUND,
    "conflict": HTTPStatus.CONFLICT,
    "rate_limit_exceeded": HTTPStatus.TOO_MANY_REQUESTS,
    "internal_error": HTTPStatus.INTERNAL_SERVER_ERROR,
    "service_unavailable": HTTPStatus.SERVICE_UNAVAILABLE
}

class ErrorResponse(BaseSchema):
    """
    Standardized error response schema with enhanced security controls
    and proper information exposure management.
    """
    
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None
    request_id: Optional[str] = None
    status_code: int
    timestamp: datetime

    model_config = {
        "arbitrary_types_allowed": True,
        "json_encoders": {
            datetime: lambda dt: dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        }
    }

    @model_validator(mode='before')
    def validate_error_code(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """Validates error code and sets appropriate status code."""
        code = values.get('code')
        if code not in ERROR_CODES:
            code = 'internal_error'
            values['code'] = code
        
        values['status_code'] = ERROR_CODES[code]
        return values

    def __init__(self, code: str, message: str, details: Optional[Dict[str, Any]] = None, 
                 request_id: Optional[str] = None) -> None:
        """
        Initialize error response with secure defaults and sanitized inputs.

        Args:
            code: Error code matching ERROR_CODES keys
            message: User-facing error message
            details: Optional error details (will be sanitized)
            request_id: Optional request tracking ID
        """
        # Sanitize inputs
        sanitized_message = self._sanitize_message(message)
        sanitized_details = self._sanitize_details(details) if details else None
        
        # Generate request ID if not provided
        request_id = request_id or str(uuid.uuid4())
        
        super().__init__(
            code=code,
            message=sanitized_message,
            details=sanitized_details,
            request_id=request_id,
            status_code=ERROR_CODES.get(code, HTTPStatus.INTERNAL_SERVER_ERROR),
            timestamp=datetime.now(timezone.utc)
        )

    @classmethod
    def from_exception(cls, exc: Exception, request_id: Optional[str] = None) -> 'ErrorResponse':
        """
        Creates a secure error response from an exception.

        Args:
            exc: Source exception
            request_id: Optional request tracking ID

        Returns:
            ErrorResponse: Secure error response instance
        """
        # Map exception type to error code
        error_code = cls._get_error_code_from_exception(exc)
        
        # Get sanitized message
        message = str(exc) if str(exc) else DEFAULT_ERROR_MESSAGE
        
        # Extract and sanitize details
        details = cls._extract_secure_details(exc)
        
        return cls(
            code=error_code,
            message=message,
            details=details,
            request_id=request_id
        )

    def to_response(self) -> JSONResponse:
        """
        Converts error response to secure FastAPI response.

        Returns:
            JSONResponse: Secure FastAPI JSON response
        """
        response_data = self.model_dump(exclude_none=True)
        
        # Create response with security headers
        response = JSONResponse(
            content=response_data,
            status_code=self.status_code
        )
        
        # Add security headers
        response.headers["X-Request-ID"] = self.request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        
        return response

    @staticmethod
    def _sanitize_message(message: str) -> str:
        """Sanitizes error message to prevent information disclosure."""
        if not message or len(message.strip()) == 0:
            return DEFAULT_ERROR_MESSAGE
        return message[:200]  # Limit message length

    @staticmethod
    def _sanitize_details(details: Dict[str, Any]) -> Dict[str, Any]:
        """Sanitizes error details to remove sensitive information."""
        if not details:
            return {}
            
        # Remove sensitive keys
        sensitive_keys = {'password', 'token', 'secret', 'key', 'auth'}
        return {
            k: v for k, v in details.items() 
            if not any(sensitive in k.lower() for sensitive in sensitive_keys)
        }

    @staticmethod
    def _get_error_code_from_exception(exc: Exception) -> str:
        """Maps exception types to error codes."""
        exception_map = {
            ValueError: "validation_error",
            PermissionError: "authorization_error",
            FileNotFoundError: "not_found",
            ConnectionError: "service_unavailable"
        }
        return exception_map.get(type(exc), "internal_error")

    @staticmethod
    def _extract_secure_details(exc: Exception) -> Optional[Dict[str, Any]]:
        """Extracts secure details from exception attributes."""
        if hasattr(exc, 'errors'):
            return {'errors': exc.errors}
        return None


class ValidationError(Exception):
    """Custom exception for validation errors with secure error details."""

    def __init__(self, message: str, errors: List[Dict[str, Any]], 
                 security_level: str = "public") -> None:
        """
        Initialize validation error with secure error details.

        Args:
            message: Error message
            errors: List of validation errors
            security_level: Security level for error exposure
        """
        super().__init__(message)
        self.errors = self._sanitize_errors(errors, security_level)
        self.security_level = security_level

    @staticmethod
    def _sanitize_errors(errors: List[Dict[str, Any]], security_level: str) -> List[Dict[str, Any]]:
        """Sanitizes validation errors based on security level."""
        if security_level == "public":
            return [{"field": error.get("field"), "message": error.get("message")} 
                   for error in errors]
        return errors