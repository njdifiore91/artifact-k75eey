"""
Node model class for representing vertices in the art knowledge graph with secure property validation,
enhanced error handling, and audit logging.
"""

import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
import bleach  # bleach v6.0+
import pydantic  # pydantic v2.0+

from shared.schemas.base import BaseSchema
from shared.database.neo4j import Neo4jConnection

# Configure secure logger
logger = logging.getLogger(__name__)

# Valid node types with their corresponding labels and required properties
NODE_TYPES = ['ARTWORK', 'ARTIST', 'MOVEMENT', 'TECHNIQUE', 'PERIOD', 'LOCATION', 'MATERIAL']

NODE_LABELS = {
    'ARTWORK': 'Artwork',
    'ARTIST': 'Artist',
    'MOVEMENT': 'Art Movement',
    'TECHNIQUE': 'Technique',
    'PERIOD': 'Time Period',
    'LOCATION': 'Location',
    'MATERIAL': 'Material'
}

REQUIRED_PROPERTIES = {
    'ARTWORK': ['title', 'year', 'medium'],
    'ARTIST': ['name', 'birth_year'],
    'MOVEMENT': ['name', 'period'],
    'TECHNIQUE': ['name', 'description']
}

@pydantic.model_config(arbitrary_types_allowed=True)
@pydantic.model_config(validate_assignment=True)
class Node(BaseSchema):
    """
    Represents a secure and validated node in the art knowledge graph with type-specific
    properties, audit logging, and enhanced error handling.
    """
    uuid: uuid.UUID
    type: str
    label: str
    properties: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    version: int
    last_modified_by: str

    def __init__(
        self,
        type: str,
        label: str,
        properties: Optional[Dict[str, Any]] = None,
        modified_by: str = "system"
    ) -> None:
        """
        Initialize a new node with enhanced validation and security checks.
        """
        if type not in NODE_TYPES:
            raise ValueError(f"Invalid node type. Must be one of: {NODE_TYPES}")

        # Generate secure UUID
        node_uuid = uuid.uuid4()
        
        # Set UTC timestamps
        current_time = datetime.now(timezone.utc)
        
        # Validate and sanitize properties
        validated_properties = self.validate_properties(properties or {})
        
        super().__init__(
            uuid=node_uuid,
            type=type,
            label=NODE_LABELS.get(type, type),
            properties=validated_properties,
            created_at=current_time,
            updated_at=current_time,
            version=1,
            last_modified_by=modified_by
        )
        
        logger.info(f"Created new {type} node with UUID: {node_uuid}")

    def validate_properties(self, properties: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates and sanitizes node properties with type-specific requirements.
        """
        # Check required properties
        required = REQUIRED_PROPERTIES.get(self.type, [])
        missing = [prop for prop in required if prop not in properties]
        if missing:
            raise ValueError(f"Missing required properties for {self.type}: {missing}")

        # Sanitize text properties
        sanitized = {}
        for key, value in properties.items():
            if isinstance(value, str):
                sanitized[key] = bleach.clean(value, strip=True)
            else:
                sanitized[key] = value

        return sanitized

    async def create(self, db: Neo4jConnection, retries: int = 3) -> 'Node':
        """
        Creates a new node in the Neo4j database with transaction retry logic.
        """
        query = """
        CREATE (n:Node {uuid: $uuid, type: $type, label: $label, properties: $properties,
               created_at: $created_at, updated_at: $updated_at, version: $version,
               last_modified_by: $last_modified_by})
        RETURN n
        """
        
        params = {
            'uuid': str(self.uuid),
            'type': self.type,
            'label': self.label,
            'properties': self.properties,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'version': self.version,
            'last_modified_by': self.last_modified_by
        }

        try:
            result = await db.execute_query(query, params, write=True, retry_count=retries)
            logger.info(f"Created node in database: {self.uuid}")
            return self
        except Exception as e:
            logger.error(f"Failed to create node: {str(e)}")
            raise

    async def update(
        self,
        db: Neo4jConnection,
        properties: Dict[str, Any],
        modified_by: str
    ) -> 'Node':
        """
        Updates node properties with validation and versioning.
        """
        # Validate and sanitize new properties
        validated_properties = self.validate_properties({**self.properties, **properties})
        
        query = """
        MATCH (n:Node {uuid: $uuid})
        WHERE n.version = $current_version
        SET n.properties = $properties,
            n.updated_at = $updated_at,
            n.version = $new_version,
            n.last_modified_by = $modified_by
        RETURN n
        """
        
        current_time = datetime.now(timezone.utc)
        params = {
            'uuid': str(self.uuid),
            'current_version': self.version,
            'properties': validated_properties,
            'updated_at': current_time.isoformat(),
            'new_version': self.version + 1,
            'modified_by': modified_by
        }

        try:
            result = await db.execute_query(query, params, write=True)
            if not result:
                raise ValueError("Node version conflict or node not found")
            
            self.properties = validated_properties
            self.updated_at = current_time
            self.version += 1
            self.last_modified_by = modified_by
            
            logger.info(f"Updated node {self.uuid} to version {self.version}")
            return self
        except Exception as e:
            logger.error(f"Failed to update node: {str(e)}")
            raise

    async def delete(self, db: Neo4jConnection, modified_by: str) -> bool:
        """
        Securely deletes node with audit logging.
        """
        # Check for dependent relationships first
        check_query = """
        MATCH (n:Node {uuid: $uuid})-[r]-()
        RETURN count(r) as rel_count
        """
        
        delete_query = """
        MATCH (n:Node {uuid: $uuid})
        DELETE n
        """
        
        params = {'uuid': str(self.uuid)}

        try:
            # Check for relationships
            result = await db.execute_query(check_query, params)
            if result[0]['rel_count'] > 0:
                raise ValueError("Cannot delete node with existing relationships")

            # Perform deletion
            await db.execute_query(delete_query, params, write=True)
            
            logger.info(f"Deleted node {self.uuid} by {modified_by}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete node: {str(e)}")
            raise