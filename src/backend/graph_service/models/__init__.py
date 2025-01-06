"""
Initializes the graph service models package and exports core model classes for nodes,
relationships, and artworks in the art knowledge graph. Provides centralized access to
all graph data models and their associated types and constants.

Version: 1.0.0
"""

import logging
from typing import List, Dict, Any, Optional

# Import core model classes and their associated types/constants
from .node import (
    Node,
    NODE_TYPES,
    NODE_LABELS,
    REQUIRED_PROPERTIES as NODE_REQUIRED_PROPERTIES
)
from .relationship import (
    Relationship,
    RELATIONSHIP_TYPES,
    RELATIONSHIP_PROPERTIES,
    REQUIRED_PROPERTIES as RELATIONSHIP_REQUIRED_PROPERTIES
)
from .artwork import (
    Artwork,
    ARTWORK_REQUIRED_PROPERTIES,
    ARTWORK_OPTIONAL_PROPERTIES,
    ARTWORK_CACHE_TTL
)

# Configure secure logger
logger = logging.getLogger(__name__)

# Package version
__version__ = '1.0.0'

# Export public interface
__all__ = [
    'Node',
    'Relationship', 
    'Artwork',
    'NODE_TYPES',
    'NODE_LABELS',
    'RELATIONSHIP_TYPES',
    'RELATIONSHIP_PROPERTIES',
    'ARTWORK_REQUIRED_PROPERTIES',
    'ARTWORK_OPTIONAL_PROPERTIES'
]

def _validate_imports() -> bool:
    """
    Validates that all required model components are properly imported and configured.
    Performs comprehensive validation of class interfaces and type definitions.
    
    Returns:
        bool: True if all validations pass, raises ImportError otherwise
    """
    try:
        # Validate Node class and types
        if not issubclass(Node, object):
            raise ImportError("Invalid Node class definition")
        if not isinstance(NODE_TYPES, list):
            raise ImportError("NODE_TYPES must be a list")
        if not isinstance(NODE_LABELS, dict):
            raise ImportError("NODE_LABELS must be a dict")
            
        # Validate Relationship class and types
        if not issubclass(Relationship, object):
            raise ImportError("Invalid Relationship class definition")
        if not isinstance(RELATIONSHIP_TYPES, list):
            raise ImportError("RELATIONSHIP_TYPES must be a list")
        if not isinstance(RELATIONSHIP_PROPERTIES, list):
            raise ImportError("RELATIONSHIP_PROPERTIES must be a list")
            
        # Validate Artwork class and properties
        if not issubclass(Artwork, Node):
            raise ImportError("Artwork must inherit from Node")
        if not isinstance(ARTWORK_REQUIRED_PROPERTIES, list):
            raise ImportError("ARTWORK_REQUIRED_PROPERTIES must be a list")
        if not isinstance(ARTWORK_OPTIONAL_PROPERTIES, list):
            raise ImportError("ARTWORK_OPTIONAL_PROPERTIES must be a list")
            
        # Validate relationship between Node and Artwork
        if 'ARTWORK' not in NODE_TYPES:
            raise ImportError("ARTWORK type must be defined in NODE_TYPES")
            
        logger.info("Successfully validated all model imports and type definitions")
        return True
        
    except Exception as e:
        logger.error(f"Model validation failed: {str(e)}")
        raise ImportError(f"Failed to validate model imports: {str(e)}")

# Validate imports on module initialization
_validate_imports()

# Initialize type hints for better IDE support
NodeType = str
RelationshipType = str
PropertyDict = Dict[str, Any]
NodeList = List[Node]
RelationshipList = List[Relationship]
ArtworkList = List[Artwork]

# Export type aliases
__all__ += [
    'NodeType',
    'RelationshipType', 
    'PropertyDict',
    'NodeList',
    'RelationshipList',
    'ArtworkList'
]