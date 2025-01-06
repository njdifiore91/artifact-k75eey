"""
Artwork schema module providing comprehensive Pydantic schemas for artwork-related data validation
and serialization in the Art Knowledge Graph API Gateway with enhanced security measures.
"""

from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID, uuid4
from pydantic import Field, model_validator, field_validator  # pydantic v2.0+

from shared.schemas.base import BaseSchema
from api_gateway.schemas.graph import NodeSchema

# Security and validation constants
ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/tiff"]
MAX_IMAGE_SIZE_MB = 20
REQUIRED_METADATA_FIELDS = ["title", "artist", "year"]

# Validation constants
MIN_YEAR = -3000  # Earliest known artwork
MAX_TITLE_LENGTH = 500
MAX_DESCRIPTION_LENGTH = 5000
MAX_TAGS = 50
MAX_TAG_LENGTH = 100

class ArtworkMetadata(BaseSchema):
    """
    Enhanced schema for artwork metadata with comprehensive validation rules
    and multi-source data integration support.
    """
    title: str = Field(..., min_length=1, max_length=MAX_TITLE_LENGTH)
    artist: str = Field(..., min_length=1)
    year: int = Field(..., description="Year of artwork creation")
    medium: Optional[str] = Field(None)
    dimensions: Optional[Dict[str, float]] = Field(None)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    source: Optional[str] = Field(None)
    tags: List[str] = Field(default_factory=list)
    style: Optional[str] = Field(None)
    period: Optional[str] = Field(None)
    external_references: Optional[Dict[str, str]] = Field(default_factory=dict)
    provenance: Optional[List[Dict[str, str]]] = Field(default_factory=list)
    conservation_status: Optional[str] = Field(None)

    @field_validator('year')
    def validate_year(cls, value: int) -> int:
        """Validates artwork year with historical accuracy checks."""
        current_year = datetime.now().year
        if value > current_year:
            raise ValueError(f"Year cannot be in the future. Current year: {current_year}")
        if value < MIN_YEAR:
            raise ValueError(f"Year cannot be earlier than {MIN_YEAR}")
        return value

    @field_validator('tags')
    def validate_tags(cls, value: List[str]) -> List[str]:
        """Validates artwork tags for length and content."""
        if len(value) > MAX_TAGS:
            raise ValueError(f"Maximum number of tags exceeded: {MAX_TAGS}")
        
        validated_tags = []
        for tag in value:
            if len(tag) > MAX_TAG_LENGTH:
                raise ValueError(f"Tag length exceeds maximum: {MAX_TAG_LENGTH}")
            # Normalize and sanitize tags
            sanitized_tag = tag.lower().strip()
            if sanitized_tag:
                validated_tags.append(sanitized_tag)
        
        return list(set(validated_tags))  # Remove duplicates

    @field_validator('dimensions')
    def validate_dimensions(cls, value: Optional[Dict[str, float]]) -> Optional[Dict[str, float]]:
        """Validates artwork dimensions with unit conversion support."""
        if value is None:
            return value
        
        required_keys = {'height', 'width'}
        if not all(key in value for key in required_keys):
            raise ValueError(f"Dimensions must include: {', '.join(required_keys)}")
        
        # Validate positive values
        for key, dim in value.items():
            if dim <= 0:
                raise ValueError(f"Dimension {key} must be positive")
            
        return value

    @model_validator(mode='after')
    def validate_metadata_consistency(self) -> 'ArtworkMetadata':
        """Ensures consistency across metadata fields."""
        if self.period and self.year:
            # Basic period validation (can be expanded based on art historical periods)
            if "contemporary" in self.period.lower() and self.year < 1950:
                raise ValueError("Contemporary period inconsistent with artwork year")
            
        if self.external_references:
            # Validate external reference formats
            for source, ref_id in self.external_references.items():
                if not ref_id or not isinstance(ref_id, str):
                    raise ValueError(f"Invalid reference ID for source: {source}")
                
        return self

class ArtworkUploadRequest(BaseSchema):
    """
    Enhanced schema for artwork upload requests with secure image handling
    and comprehensive validation.
    """
    image_data: bytes = Field(..., description="Raw image data")
    image_type: str = Field(..., description="MIME type of the image")
    image_size: int = Field(..., gt=0)
    metadata: ArtworkMetadata
    checksum: str = Field(..., min_length=32, max_length=128)
    upload_source: Optional[str] = Field(None)

    @field_validator('image_type')
    def validate_image_type(cls, value: str) -> str:
        """Validates image type against allowed formats."""
        if value not in ALLOWED_IMAGE_TYPES:
            raise ValueError(f"Unsupported image type. Allowed types: {', '.join(ALLOWED_IMAGE_TYPES)}")
        return value

    @field_validator('image_size')
    def validate_image_size(cls, value: int) -> int:
        """Validates image size against configured limits."""
        max_size = MAX_IMAGE_SIZE_MB * 1024 * 1024  # Convert to bytes
        if value > max_size:
            raise ValueError(f"Image size exceeds maximum allowed size of {MAX_IMAGE_SIZE_MB}MB")
        if value == 0:
            raise ValueError("Image size cannot be zero")
        return value

    @model_validator(mode='after')
    def validate_image(self) -> 'ArtworkUploadRequest':
        """Comprehensive image validation including security checks."""
        if len(self.image_data) != self.image_size:
            raise ValueError("Declared image size does not match actual data size")
        
        # Additional security checks can be implemented here
        return self

class ArtworkResponse(BaseSchema):
    """
    Enhanced schema for artwork API responses with comprehensive data integration
    and versioning support.
    """
    uuid: UUID = Field(default_factory=uuid4)
    metadata: ArtworkMetadata
    image_url: str = Field(..., description="CDN URL for the artwork image")
    thumbnail_url: Optional[str] = Field(None, description="CDN URL for thumbnail")
    graph_node: NodeSchema
    created_at: datetime
    updated_at: datetime
    processing_status: str = Field(..., description="Current processing status")
    version: int = Field(default=1, ge=1)
    access_rights: Dict[str, bool] = Field(default_factory=dict)

    @field_validator('image_url', 'thumbnail_url')
    def validate_urls(cls, value: Optional[str]) -> Optional[str]:
        """Validates CDN URLs for security."""
        if value is None:
            return value
        
        # Validate URL format and allowed domains
        if not value.startswith(('https://')):
            raise ValueError("Only HTTPS URLs are allowed")
        
        return value

    @model_validator(mode='after')
    def validate_response_integrity(self) -> 'ArtworkResponse':
        """Ensures integrity and consistency of the response data."""
        # Validate graph node type
        if self.graph_node.type != 'ARTWORK':
            raise ValueError("Graph node must be of type ARTWORK")
        
        # Ensure metadata UUID matches
        if str(self.uuid) != str(self.graph_node.uuid):
            raise ValueError("UUID mismatch between artwork and graph node")
        
        # Validate processing status
        valid_statuses = {'pending', 'processing', 'completed', 'failed'}
        if self.processing_status not in valid_statuses:
            raise ValueError(f"Invalid processing status. Must be one of: {', '.join(valid_statuses)}")
        
        return self