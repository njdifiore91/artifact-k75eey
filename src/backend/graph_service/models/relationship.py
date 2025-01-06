"""
Relationship model for managing edges between nodes in the art knowledge graph with
enhanced security, validation, and performance optimizations.
"""

import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import logging
import bleach  # bleach v6.0+
from cachetools import TTLCache, cached  # cachetools v5.0+
from pydantic import BaseModel, Field, validator

from shared.schemas.base import BaseSchema
from shared.database.neo4j import Neo4jConnection

# Constants for relationship types and properties
RELATIONSHIP_TYPES = [
    'CREATED_BY',
    'BELONGS_TO',
    'INFLUENCED_BY',
    'LOCATED_IN',
    'USES_TECHNIQUE',
    'MADE_WITH',
    'CONTEMPORARY_OF',
    'STUDIED_UNDER'
]

RELATIONSHIP_PROPERTIES = [
    'strength',
    'confidence',
    'start_date',
    'end_date',
    'source',
    'metadata'
]

REQUIRED_PROPERTIES = {
    'CREATED_BY': ['start_date', 'confidence'],
    'BELONGS_TO': ['confidence'],
    'INFLUENCED_BY': ['strength', 'start_date', 'end_date']
}

# Cache configuration
CACHE_TTL = {
    'default': 3600,  # 1 hour
    'high_traffic': 300,  # 5 minutes
    'batch': 7200  # 2 hours
}

# Configure logger
logger = logging.getLogger(__name__)

class Relationship(BaseSchema):
    """
    Represents a relationship (edge) between nodes in the art knowledge graph with
    enhanced validation, security, and performance optimizations.
    """
    uuid: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str = Field(..., description="Type of relationship between nodes")
    source_node: str = Field(..., description="UUID of source node")
    target_node: str = Field(..., description="UUID of target node")
    properties: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    version: int = Field(default=1)
    last_accessed: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    audit_trail: List[Dict[str, Any]] = Field(default_factory=list)

    class Config:
        arbitrary_types_allowed = True
        validate_assignment = True

    @validator('type')
    def validate_relationship_type(cls, v: str) -> str:
        """Validate relationship type against allowed types."""
        if v not in RELATIONSHIP_TYPES:
            raise ValueError(f"Invalid relationship type. Must be one of: {RELATIONSHIP_TYPES}")
        return v

    def validate_properties(self, properties: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and sanitize relationship properties."""
        if not properties:
            return {}

        # Check required properties
        required = REQUIRED_PROPERTIES.get(self.type, [])
        missing = [prop for prop in required if prop not in properties]
        if missing:
            raise ValueError(f"Missing required properties for {self.type}: {missing}")

        # Sanitize property values
        sanitized = {}
        for key, value in properties.items():
            if key not in RELATIONSHIP_PROPERTIES:
                continue
            if isinstance(value, str):
                sanitized[key] = bleach.clean(value)
            else:
                sanitized[key] = value

        return sanitized

    @cached(cache=TTLCache(maxsize=1000, ttl=CACHE_TTL['default']))
    async def create(self, db: Neo4jConnection, batch_mode: bool = False) -> 'Relationship':
        """Create a new relationship in the Neo4j database."""
        try:
            # Validate properties before creation
            self.properties = self.validate_properties(self.properties)

            # Prepare creation query with performance optimization hints
            query = """
            MATCH (source), (target)
            WHERE source.uuid = $source_uuid AND target.uuid = $target_uuid
            CALL apoc.create.relationship(source, $type, $properties, target)
            YIELD rel
            RETURN rel
            """

            params = {
                "source_uuid": self.source_node,
                "target_uuid": self.target_node,
                "type": self.type,
                "properties": self.properties
            }

            # Execute query with appropriate batch mode settings
            result = await db.execute_query(
                query=query,
                parameters=params,
                write=True,
                retry_count=3 if not batch_mode else 1
            )

            # Update audit trail
            self.audit_trail.append({
                "action": "create",
                "timestamp": datetime.now(timezone.utc),
                "details": {"batch_mode": batch_mode}
            })

            return self

        except Exception as e:
            logger.error(f"Failed to create relationship: {str(e)}")
            raise

    async def update(self, db: Neo4jConnection, properties: Dict[str, Any], version: int) -> 'Relationship':
        """Update relationship properties with version control."""
        if version != self.version:
            raise ValueError("Concurrent modification detected")

        try:
            # Validate and sanitize new properties
            updated_properties = self.validate_properties(properties)

            # Prepare update query with optimizations
            query = """
            MATCH ()-[r]-()
            WHERE r.uuid = $uuid
            SET r += $properties, r.version = $new_version, r.updated_at = $updated_at
            RETURN r
            """

            params = {
                "uuid": self.uuid,
                "properties": updated_properties,
                "new_version": self.version + 1,
                "updated_at": datetime.now(timezone.utc)
            }

            result = await db.execute_query(query=query, parameters=params, write=True)

            # Update instance properties
            self.properties.update(updated_properties)
            self.version += 1
            self.updated_at = params["updated_at"]

            # Update audit trail
            self.audit_trail.append({
                "action": "update",
                "timestamp": self.updated_at,
                "details": {"previous_version": version}
            })

            return self

        except Exception as e:
            logger.error(f"Failed to update relationship: {str(e)}")
            raise

    async def delete(self, db: Neo4jConnection) -> bool:
        """Delete relationship with audit logging."""
        try:
            query = """
            MATCH ()-[r]-()
            WHERE r.uuid = $uuid
            DELETE r
            """

            await db.execute_query(
                query=query,
                parameters={"uuid": self.uuid},
                write=True
            )

            # Log deletion in audit trail
            self.audit_trail.append({
                "action": "delete",
                "timestamp": datetime.now(timezone.utc)
            })

            return True

        except Exception as e:
            logger.error(f"Failed to delete relationship: {str(e)}")
            raise