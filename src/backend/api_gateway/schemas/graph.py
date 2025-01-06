"""
Graph schema module providing comprehensive Pydantic schemas for graph-related data validation
and serialization in the Art Knowledge Graph application with enhanced security measures.
"""

from datetime import datetime
from typing import Dict, List, Optional, Tuple
from uuid import UUID, uuid4
from pydantic import Field, model_validator, field_validator  # pydantic v2.0+
from shared.schemas.base import BaseSchema

# Valid node and relationship type enumerations
NODE_TYPES = ['ARTWORK', 'ARTIST', 'MOVEMENT', 'PERIOD', 'INFLUENCE', 'TECHNIQUE']
RELATIONSHIP_TYPES = ['CREATED_BY', 'BELONGS_TO', 'INFLUENCED_BY', 'PART_OF', 'USES_TECHNIQUE', 'CONTEMPORARY_OF']

# Configuration constants
MAX_PROPERTIES_SIZE = 1048576  # 1MB limit for properties
MAX_GRAPH_DEPTH = 50
COORDINATE_BOUNDS = (-1000, 1000)  # Reasonable bounds for graph visualization

class NodeSchema(BaseSchema):
    """
    Pydantic schema for graph nodes with comprehensive validation and security measures.
    """
    uuid: UUID = Field(default_factory=uuid4)
    type: str = Field(..., description="Node type from predefined types")
    label: str = Field(..., min_length=1, max_length=200)
    properties: Dict = Field(default_factory=dict)
    coordinates: Optional[Tuple[float, float]] = Field(None)
    version: int = Field(default=1, ge=1)

    @field_validator('type')
    def validate_type(cls, value: str) -> str:
        """Validates node type against allowed types."""
        if value not in NODE_TYPES:
            raise ValueError(f"Invalid node type. Must be one of: {', '.join(NODE_TYPES)}")
        return value

    @field_validator('properties')
    def validate_properties(cls, value: Dict) -> Dict:
        """Validates node properties size and content."""
        # Check properties size
        if len(str(value).encode('utf-8')) > MAX_PROPERTIES_SIZE:
            raise ValueError(f"Properties size exceeds maximum limit of {MAX_PROPERTIES_SIZE} bytes")

        # Validate property keys and values
        for key, val in value.items():
            if not isinstance(key, str):
                raise ValueError("Property keys must be strings")
            if not isinstance(val, (str, int, float, bool, list, dict)):
                raise ValueError("Invalid property value type")
            if isinstance(val, (list, dict)):
                if len(str(val).encode('utf-8')) > MAX_PROPERTIES_SIZE // 10:
                    raise ValueError("Nested property value too large")

        return value

    @field_validator('coordinates')
    def validate_coordinates(cls, value: Optional[Tuple[float, float]]) -> Optional[Tuple[float, float]]:
        """Validates coordinate bounds if provided."""
        if value is not None:
            x, y = value
            if not (COORDINATE_BOUNDS[0] <= x <= COORDINATE_BOUNDS[1] and 
                   COORDINATE_BOUNDS[0] <= y <= COORDINATE_BOUNDS[1]):
                raise ValueError(f"Coordinates must be within bounds: {COORDINATE_BOUNDS}")
        return value

class RelationshipSchema(BaseSchema):
    """
    Pydantic schema for graph relationships with bidirectional support and validation.
    """
    uuid: UUID = Field(default_factory=uuid4)
    type: str = Field(..., description="Relationship type from predefined types")
    source_id: UUID = Field(...)
    target_id: UUID = Field(...)
    metadata: Dict = Field(default_factory=dict)
    bidirectional: bool = Field(default=False)
    version: int = Field(default=1, ge=1)

    @field_validator('type')
    def validate_type(cls, value: str) -> str:
        """Validates relationship type against allowed types."""
        if value not in RELATIONSHIP_TYPES:
            raise ValueError(f"Invalid relationship type. Must be one of: {', '.join(RELATIONSHIP_TYPES)}")
        return value

    @model_validator(mode='after')
    def validate_endpoints(self) -> 'RelationshipSchema':
        """Validates relationship endpoints are not identical."""
        if self.source_id == self.target_id:
            raise ValueError("Self-referential relationships are not allowed")
        return self

    @field_validator('metadata')
    def validate_metadata(cls, value: Dict) -> Dict:
        """Validates relationship metadata size and content."""
        if len(str(value).encode('utf-8')) > MAX_PROPERTIES_SIZE // 4:
            raise ValueError(f"Metadata size exceeds maximum limit of {MAX_PROPERTIES_SIZE // 4} bytes")
        return value

class GraphSchema(BaseSchema):
    """
    Pydantic schema for complete graph structure with cycle detection and depth limitation.
    """
    nodes: List[NodeSchema] = Field(default_factory=list)
    relationships: List[RelationshipSchema] = Field(default_factory=list)
    metadata: Dict = Field(default_factory=dict)
    depth: int = Field(default=0)
    version: int = Field(default=1, ge=1)

    @model_validator(mode='after')
    def validate_structure(self) -> 'GraphSchema':
        """Validates overall graph structure including cycles and depth."""
        # Validate graph depth
        if self.depth > MAX_GRAPH_DEPTH:
            raise ValueError(f"Graph depth exceeds maximum limit of {MAX_GRAPH_DEPTH}")

        # Create node UUID set for quick lookup
        node_uuids = {node.uuid for node in self.nodes}

        # Validate relationship endpoints exist
        for rel in self.relationships:
            if rel.source_id not in node_uuids:
                raise ValueError(f"Source node {rel.source_id} not found in graph")
            if rel.target_id not in node_uuids:
                raise ValueError(f"Target node {rel.target_id} not found in graph")

        # Detect cycles (if not allowed for specific relationship types)
        visited = set()
        path = set()

        def detect_cycle(node_id: UUID) -> bool:
            if node_id in path:
                return True
            if node_id in visited:
                return False
            
            visited.add(node_id)
            path.add(node_id)

            for rel in self.relationships:
                if rel.source_id == node_id:
                    if detect_cycle(rel.target_id):
                        return True

            path.remove(node_id)
            return False

        # Check for cycles from each node
        for node in self.nodes:
            if detect_cycle(node.uuid):
                # Note: We might want to allow cycles for certain relationship types
                # For now, we'll just validate and log them
                self.metadata['has_cycles'] = True

        return self

    @field_validator('metadata')
    def validate_metadata(cls, value: Dict) -> Dict:
        """Validates graph metadata size and content."""
        if len(str(value).encode('utf-8')) > MAX_PROPERTIES_SIZE:
            raise ValueError(f"Metadata size exceeds maximum limit of {MAX_PROPERTIES_SIZE} bytes")
        return value