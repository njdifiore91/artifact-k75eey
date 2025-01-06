"""
Core validation utility module providing comprehensive data validation, sanitization,
and input verification functions for the Art Knowledge Graph backend services with
enhanced security features and performance optimizations.
"""

import re
import asyncio
import aiofiles
from typing import Dict, Any, Optional, Tuple, List, Union
from datetime import datetime
import clamd
from functools import wraps
from pydantic import ValidationError as PydanticValidationError

from shared.schemas.error import ValidationError
from shared.schemas.base import BaseSchema

# Validation patterns
URL_PATTERN = r'^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)$'
EMAIL_PATTERN = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

# Validation constraints
MAX_STRING_LENGTH = 1024
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/tiff']
MIN_IMAGE_DIMENSIONS = {'width': 100, 'height': 100}
MAX_IMAGE_DIMENSIONS = {'width': 8000, 'height': 8000}

def validate_input(func):
    """Decorator for input validation with enhanced security checks."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except PydanticValidationError as e:
            raise ValidationError(
                message="Input validation failed",
                errors=e.errors(),
                security_level="public"
            )
    return wrapper

def rate_limit(max_calls: int, time_window: int):
    """Rate limiting decorator for validation functions."""
    def decorator(func):
        calls = []
        @wraps(func)
        async def wrapper(*args, **kwargs):
            now = datetime.now().timestamp()
            calls[:] = [call for call in calls if call > now - time_window]
            if len(calls) >= max_calls:
                raise ValidationError(
                    message="Rate limit exceeded",
                    errors=[{"field": "rate_limit", "message": "Too many validation requests"}]
                )
            calls.append(now)
            return await func(*args, **kwargs)
        return wrapper
    return decorator

class DataValidator:
    """Enhanced validator class with async support and caching."""
    
    def __init__(self, custom_rules: Optional[Dict[str, Any]] = None,
                 cache_config: Optional[Dict[str, Any]] = None):
        self._validation_rules = {}
        self._errors: List[str] = []
        self._cache: Dict[str, Any] = {}
        self._lock = asyncio.Lock()
        
        # Initialize ClamAV client for malware scanning
        try:
            self._clam = clamd.ClamdUnixSocket()
        except Exception:
            self._clam = None
            
        # Set up validation rules
        self._setup_validation_rules(custom_rules)
        
    def _setup_validation_rules(self, custom_rules: Optional[Dict[str, Any]] = None):
        """Initialize validation rules with security focus."""
        self._validation_rules = {
            'string': lambda x: isinstance(x, str) and len(x) <= MAX_STRING_LENGTH,
            'url': lambda x: bool(re.match(URL_PATTERN, x)) if isinstance(x, str) else False,
            'email': lambda x: bool(re.match(EMAIL_PATTERN, x)) if isinstance(x, str) else False,
            'dimensions': lambda x: (
                isinstance(x, dict) and
                MIN_IMAGE_DIMENSIONS['width'] <= x.get('width', 0) <= MAX_IMAGE_DIMENSIONS['width'] and
                MIN_IMAGE_DIMENSIONS['height'] <= x.get('height', 0) <= MAX_IMAGE_DIMENSIONS['height']
            )
        }
        
        if custom_rules:
            self._validation_rules.update(custom_rules)
            
    async def validate(self, data: Dict[str, Any], use_cache: Optional[bool] = True) -> Tuple[bool, List[str], Dict[str, Any]]:
        """Validates data with caching and async support."""
        cache_key = str(hash(str(data)))
        
        if use_cache and cache_key in self._cache:
            return self._cache[cache_key]
            
        async with self._lock:
            try:
                validation_result = await self._perform_validation(data)
                if use_cache:
                    self._cache[cache_key] = validation_result
                return validation_result
            except Exception as e:
                return False, [str(e)], {}
                
    async def _perform_validation(self, data: Dict[str, Any]) -> Tuple[bool, List[str], Dict[str, Any]]:
        """Performs actual validation with security checks."""
        errors = []
        metadata = {}
        
        for field, value in data.items():
            if field in self._validation_rules:
                if not self._validation_rules[field](value):
                    errors.append(f"Validation failed for field: {field}")
                    
        return len(errors) == 0, errors, metadata

@validate_input
async def validate_artwork_metadata(metadata: Dict[str, Any], 
                                 additional_checks: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Validates artwork metadata with enhanced security checks."""
    required_fields = {'title', 'artist', 'year', 'medium'}
    validated_data = {}
    
    # Check required fields
    missing_fields = required_fields - set(metadata.keys())
    if missing_fields:
        raise ValidationError(
            message="Missing required fields",
            errors=[{"field": field, "message": "Field is required"} for field in missing_fields]
        )
        
    # Validate and sanitize fields
    for field, value in metadata.items():
        if isinstance(value, str):
            # Sanitize string inputs
            value = value.strip()[:MAX_STRING_LENGTH]
        validated_data[field] = value
        
    # Apply additional validations
    if additional_checks:
        for check_name, check_func in additional_checks.items():
            if not check_func(validated_data):
                raise ValidationError(
                    message=f"Additional validation failed: {check_name}",
                    errors=[{"field": check_name, "message": "Validation failed"}]
                )
                
    return validated_data

@rate_limit(10, 60)
async def validate_image(image_data: bytes, content_type: str,
                        security_opts: Optional[Dict[str, Any]] = None) -> Tuple[bool, Dict[str, Any]]:
    """Validates uploaded image file with enhanced security checks."""
    validation_metadata = {
        'size': len(image_data),
        'content_type': content_type,
        'security_checks': {}
    }
    
    # Check file size
    if len(image_data) > MAX_FILE_SIZE:
        raise ValidationError(
            message="File size exceeds maximum limit",
            errors=[{"field": "file_size", "message": "File too large"}]
        )
        
    # Verify content type
    if content_type not in ALLOWED_MIME_TYPES:
        raise ValidationError(
            message="Invalid file type",
            errors=[{"field": "content_type", "message": "Unsupported file type"}]
        )
        
    # Perform malware scan if ClamAV is available
    if hasattr(DataValidator, '_clam') and DataValidator._clam:
        try:
            scan_result = await asyncio.to_thread(
                DataValidator._clam.instream, image_data
            )
            validation_metadata['security_checks']['malware_scan'] = scan_result
            if scan_result['stream'][0] == 'FOUND':
                raise ValidationError(
                    message="Security check failed",
                    errors=[{"field": "security", "message": "Malware detected"}]
                )
        except Exception as e:
            validation_metadata['security_checks']['malware_scan_error'] = str(e)
            
    # Additional security checks
    if security_opts:
        for check_name, check_func in security_opts.items():
            try:
                check_result = await check_func(image_data)
                validation_metadata['security_checks'][check_name] = check_result
            except Exception as e:
                validation_metadata['security_checks'][f"{check_name}_error"] = str(e)
                
    return True, validation_metadata