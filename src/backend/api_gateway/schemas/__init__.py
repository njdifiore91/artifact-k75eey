"""
Schema initialization module for the Art Knowledge Graph API Gateway service.
Provides centralized access to all Pydantic schemas for data validation and serialization.
Version: 1.0.0
"""

# Version tracking for schema compatibility
SCHEMA_VERSION = '1.0.0'
SCHEMA_DEPRECATION_WARNING = 'Schema version {} is deprecated and will be removed in version {}'

# Import artwork-related schemas
from .artwork import (
    ArtworkMetadata,
    ArtworkUploadRequest,
    ArtworkResponse
)

# Import graph-related schemas
from .graph import (
    NodeSchema,
    RelationshipSchema,
    GraphSchema
)

# Import user-related schemas
from .user import (
    UserBase,
    UserCreate,
    UserUpdate,
    UserResponse
)

# Export all schemas with proper type hints for enhanced code safety
__all__ = [
    # Artwork schemas
    'ArtworkMetadata',
    'ArtworkUploadRequest',
    'ArtworkResponse',
    
    # Graph schemas
    'NodeSchema',
    'RelationshipSchema',
    'GraphSchema',
    
    # User schemas
    'UserBase',
    'UserCreate',
    'UserUpdate',
    'UserResponse',
]

# Schema version compatibility check
def check_schema_version(client_version: str) -> bool:
    """
    Validates client schema version compatibility.
    
    Args:
        client_version: Schema version used by client
        
    Returns:
        bool: True if compatible, False otherwise
    """
    major, minor, patch = [int(v) for v in SCHEMA_VERSION.split('.')]
    client_major, client_minor, client_patch = [int(v) for v in client_version.split('.')]
    
    # Major version must match exactly
    if major != client_major:
        return False
    
    # Client minor version must be less than or equal
    if client_minor > minor:
        return False
        
    return True

# Schema metadata for API documentation
schema_metadata = {
    'version': SCHEMA_VERSION,
    'supported_versions': ['1.0.0'],
    'deprecation_policy': {
        'min_supported_version': '1.0.0',
        'deprecation_warning_version': '0.9.0'
    }
}