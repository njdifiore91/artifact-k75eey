"""
Artwork model class for representing artwork nodes in the art knowledge graph with
enhanced security, validation, caching, and performance optimizations.
"""

import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import logging
import asyncio
from cachetools import TTLCache, cached
import pydantic
from pydantic import Field, validator

from .node import Node
from .relationship import Relationship
from shared.schemas.base import BaseSchema

# Configure secure logger
logger = logging.getLogger(__name__)

# Constants for artwork validation and caching
ARTWORK_REQUIRED_PROPERTIES = [
    'title',
    'creation_date',
    'medium',
    'checksum',
    'version'
]

ARTWORK_OPTIONAL_PROPERTIES = [
    'dimensions',
    'location',
    'collection',
    'description',
    'image_url',
    'style',
    'period',
    'condition',
    'provenance',
    'metadata',
    'tags',
    'security_level'
]

ARTWORK_CACHE_TTL = 3600  # 1 hour
ARTWORK_BATCH_SIZE = 100

# Cache for artwork instances
artwork_cache = TTLCache(maxsize=1000, ttl=ARTWORK_CACHE_TTL)

@pydantic.model_config(arbitrary_types_allowed=True)
class Artwork(Node):
    """
    Enhanced and secure node class for representing artworks in the knowledge graph
    with comprehensive validation, caching, and audit logging.
    """
    # Required fields
    title: str = Field(..., description="Artwork title")
    creation_date: datetime = Field(..., description="Date of artwork creation")
    medium: str = Field(..., description="Artistic medium used")
    
    # Optional fields with validation
    dimensions: Optional[Dict[str, float]] = Field(None, description="Artwork dimensions")
    location: Optional[str] = Field(None, description="Current location")
    collection: Optional[str] = Field(None, description="Owning collection")
    description: Optional[str] = Field(None, description="Artwork description")
    image_url: Optional[str] = Field(None, description="URL to artwork image")
    style: Optional[str] = Field(None, description="Artistic style")
    period: Optional[str] = Field(None, description="Historical period")
    condition: Optional[str] = Field(None, description="Conservation condition")
    provenance: Optional[List[Dict[str, Any]]] = Field(None, description="Ownership history")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")
    tags: Optional[List[str]] = Field(None, description="Descriptive tags")
    security_level: str = Field("public", description="Access control level")

    # Audit fields
    last_modified: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str = Field(..., description="User who created the record")
    modified_by: str = Field(..., description="User who last modified the record")

    def __init__(
        self,
        title: str,
        creation_date: datetime,
        medium: str,
        properties: Optional[Dict[str, Any]] = None,
        security_level: str = "public",
        created_by: str = "system"
    ) -> None:
        """Initialize artwork node with enhanced security and validation."""
        # Initialize base Node with ARTWORK type
        super().__init__(
            type="ARTWORK",
            label=f"Artwork: {title}",
            properties=properties or {}
        )

        # Set required artwork properties
        self.title = title
        self.creation_date = creation_date
        self.medium = medium
        self.security_level = security_level
        self.created_by = created_by
        self.modified_by = created_by
        
        # Generate secure checksum for data integrity
        self.properties["checksum"] = self._generate_checksum()
        self.properties["version"] = 1

        logger.info(f"Created new artwork node: {self.title} ({self.uuid})")

    @validator("security_level")
    def validate_security_level(cls, v: str) -> str:
        """Validate security level against allowed values."""
        allowed_levels = {"public", "restricted", "private"}
        if v not in allowed_levels:
            raise ValueError(f"Security level must be one of: {allowed_levels}")
        return v

    @cached(cache=artwork_cache)
    async def add_artist(
        self,
        db: 'Neo4jConnection',
        artist_node: Node,
        audit_user: str
    ) -> Relationship:
        """Creates a secure CREATED_BY relationship to an artist node with validation."""
        try:
            # Validate artist node
            if artist_node.type != "ARTIST":
                raise ValueError("Node must be of type ARTIST")

            # Create relationship with properties
            relationship = Relationship(
                type="CREATED_BY",
                source_node=artist_node.uuid,
                target_node=self.uuid,
                properties={
                    "start_date": self.creation_date.isoformat(),
                    "confidence": 1.0,
                    "created_by": audit_user
                }
            )

            # Create relationship in database
            await relationship.create(db)
            
            logger.info(
                f"Added artist relationship: {artist_node.uuid} -> {self.uuid}"
            )
            return relationship

        except Exception as e:
            logger.error(f"Failed to add artist relationship: {str(e)}")
            raise

    async def update_metadata(
        self,
        db: 'Neo4jConnection',
        metadata: Dict[str, Any],
        audit_user: str
    ) -> 'Artwork':
        """Securely updates artwork metadata with validation and versioning."""
        try:
            # Validate metadata format
            if not isinstance(metadata, dict):
                raise ValueError("Metadata must be a dictionary")

            # Create new version
            self.properties["version"] += 1
            self.properties["metadata"] = {**self.properties.get("metadata", {}), **metadata}
            self.modified_by = audit_user
            self.last_modified = datetime.now(timezone.utc)
            
            # Update checksum
            self.properties["checksum"] = self._generate_checksum()

            # Update in database
            await self.update(
                db,
                self.properties,
                audit_user
            )

            # Clear cache entry
            artwork_cache.pop(self.uuid, None)

            logger.info(f"Updated artwork metadata: {self.uuid} (v{self.properties['version']})")
            return self

        except Exception as e:
            logger.error(f"Failed to update artwork metadata: {str(e)}")
            raise

    async def get_related_artworks(
        self,
        db: 'Neo4jConnection',
        relationship_types: Optional[List[str]] = None,
        limit: int = 10,
        security_level: str = "public"
    ) -> List['Artwork']:
        """Retrieves related artworks with caching and security filtering."""
        cache_key = f"{self.uuid}:{relationship_types}:{limit}:{security_level}"
        
        try:
            # Check cache first
            if cache_key in artwork_cache:
                return artwork_cache[cache_key]

            # Build relationship filter
            rel_filter = ""
            if relationship_types:
                rel_types = [f":{rel_type}" for rel_type in relationship_types]
                rel_filter = f"[r{' | '.join(rel_types)}]"
            else:
                rel_filter = "[r]"

            # Query with security filter
            query = f"""
            MATCH (a:Node {{uuid: $uuid}})-{rel_filter}-(related:Node)
            WHERE related.type = 'ARTWORK'
            AND related.properties.security_level <= $security_level
            RETURN related
            LIMIT $limit
            """

            params = {
                "uuid": str(self.uuid),
                "security_level": security_level,
                "limit": limit
            }

            results = await db.execute_query(query, params)
            
            # Convert results to Artwork instances
            artworks = []
            for result in results:
                node_data = result["related"]
                artwork = Artwork(
                    title=node_data["properties"]["title"],
                    creation_date=datetime.fromisoformat(
                        node_data["properties"]["creation_date"]
                    ),
                    medium=node_data["properties"]["medium"],
                    properties=node_data["properties"],
                    security_level=node_data["properties"]["security_level"],
                    created_by=node_data["properties"]["created_by"]
                )
                artworks.append(artwork)

            # Cache results
            artwork_cache[cache_key] = artworks
            
            return artworks

        except Exception as e:
            logger.error(f"Failed to get related artworks: {str(e)}")
            raise

    def _generate_checksum(self) -> str:
        """Generate secure checksum for artwork data integrity."""
        data = f"{self.title}{self.creation_date}{self.medium}"
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, data))