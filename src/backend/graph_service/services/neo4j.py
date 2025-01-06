"""
High-level Neo4j database service providing specialized graph operations and query execution
for the Art Knowledge Graph application with enhanced security, performance optimization,
and monitoring capabilities.
"""

import logging
import asyncio
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone
from functools import wraps

from shared.database.neo4j import Neo4jConnection
from graph_service.models.node import Node, NODE_TYPES, validate_node_type
from graph_service.models.relationship import Relationship, RELATIONSHIP_TYPES, validate_relationship_type

# Configure secure logger
logger = logging.getLogger(__name__)

# Service constants
MAX_DEPTH = 3
MAX_NODES = 1000
CACHE_TTL = 3600  # 1 hour
QUERY_TIMEOUT = 30  # seconds
MAX_BATCH_SIZE = 100

def performance_monitor(func):
    """Decorator for monitoring query performance and logging metrics."""
    @wraps(func)
    async def wrapper(self, *args, **kwargs):
        start_time = datetime.now(timezone.utc)
        try:
            result = await func(self, *args, **kwargs)
            execution_time = (datetime.now(timezone.utc) - start_time).total_seconds()
            
            # Update performance metrics
            self._performance_metrics[func.__name__] = {
                'last_execution_time': execution_time,
                'timestamp': datetime.now(timezone.utc)
            }
            
            if execution_time > QUERY_TIMEOUT:
                logger.warning(
                    f"Slow query detected in {func.__name__}: {execution_time}s"
                )
            
            return result
            
        except Exception as e:
            logger.error(f"Error in {func.__name__}: {str(e)}")
            raise
            
    return wrapper

class GraphDatabaseService:
    """
    Enhanced high-level service class providing secure and optimized graph database
    operations for the Art Knowledge Graph.
    """
    
    def __init__(
        self,
        db: Neo4jConnection,
        cache_size: Optional[int] = 1000,
        enable_monitoring: bool = True
    ) -> None:
        """
        Initialize the graph database service with enhanced security and monitoring.
        
        Args:
            db: Neo4j database connection instance
            cache_size: Maximum size of query cache
            enable_monitoring: Enable performance monitoring
        """
        self._db = db
        self._logger = logger
        self._query_cache = {}
        self._performance_metrics = {}
        
        # Initialize query optimization rules
        self._optimization_rules = {
            'max_depth': MAX_DEPTH,
            'max_nodes': MAX_NODES,
            'batch_size': MAX_BATCH_SIZE
        }
        
        self._logger.info("Initialized Graph Database Service with security and monitoring")

    @performance_monitor
    async def get_artwork_subgraph(
        self,
        artwork_id: str,
        depth: int = 2,
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """
        Retrieves a subgraph centered around an artwork node with enhanced security and caching.
        
        Args:
            artwork_id: UUID of the artwork node
            depth: Maximum traversal depth (default: 2)
            use_cache: Whether to use query cache
            
        Returns:
            Dict containing subgraph nodes and relationships
        """
        # Validate parameters
        if depth > MAX_DEPTH:
            raise ValueError(f"Maximum depth exceeded: {depth} > {MAX_DEPTH}")
            
        cache_key = f"artwork_subgraph:{artwork_id}:{depth}"
        
        # Check cache
        if use_cache and cache_key in self._query_cache:
            self._logger.debug(f"Cache hit for artwork subgraph: {artwork_id}")
            return self._query_cache[cache_key]
            
        # Prepare optimized query
        query = """
        MATCH path = (a:Node {uuid: $artwork_id})-[*0..$depth]-(related)
        WHERE a.type = 'ARTWORK'
        WITH COLLECT(path) as paths
        CALL apoc.graph.fromPaths(paths, '', {}) YIELD graph
        RETURN {
            nodes: [n IN graph.nodes | n {.*}],
            relationships: [r IN graph.relationships | r {.*}]
        } as subgraph
        """
        
        try:
            result = await self._db.execute_query(
                query=query,
                parameters={'artwork_id': artwork_id, 'depth': depth},
                timeout=QUERY_TIMEOUT
            )
            
            if not result:
                raise ValueError(f"Artwork not found: {artwork_id}")
                
            subgraph = result[0]['subgraph']
            
            # Cache result
            if use_cache:
                self._query_cache[cache_key] = subgraph
                
            return subgraph
            
        except Exception as e:
            self._logger.error(f"Failed to retrieve artwork subgraph: {str(e)}")
            raise

    @performance_monitor
    async def find_related_artworks(
        self,
        artwork_id: str,
        relationship_types: List[str] = None,
        min_similarity: float = 0.5,
        use_cache: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Finds artworks related to a given artwork with enhanced similarity matching.
        
        Args:
            artwork_id: UUID of the source artwork
            relationship_types: Types of relationships to consider
            min_similarity: Minimum similarity score (0-1)
            use_cache: Whether to use query cache
            
        Returns:
            List of related artworks with similarity scores
        """
        # Validate parameters
        if relationship_types:
            for rel_type in relationship_types:
                if rel_type not in RELATIONSHIP_TYPES:
                    raise ValueError(f"Invalid relationship type: {rel_type}")
                    
        if not 0 <= min_similarity <= 1:
            raise ValueError("Similarity score must be between 0 and 1")
            
        cache_key = f"related_artworks:{artwork_id}:{min_similarity}"
        
        # Check cache
        if use_cache and cache_key in self._query_cache:
            return self._query_cache[cache_key]
            
        # Prepare optimized query with relationship filtering
        query = """
        MATCH (a:Node {uuid: $artwork_id})-[r:BELONGS_TO|CREATED_BY|USES_TECHNIQUE]->(common)
        <-[r2:BELONGS_TO|CREATED_BY|USES_TECHNIQUE]-(related:Node)
        WHERE a.type = 'ARTWORK' 
        AND related.type = 'ARTWORK'
        AND related.uuid <> a.uuid
        AND ($rel_types IS NULL OR type(r) IN $rel_types)
        WITH related, count(common) as commonalities,
             collect(type(r) + ': ' + common.name) as connections
        WHERE 1.0 * commonalities / size(connections) >= $min_similarity
        RETURN {
            artwork: related {.*},
            similarity: 1.0 * commonalities / size(connections),
            connections: connections
        } as result
        ORDER BY result.similarity DESC
        LIMIT $max_nodes
        """
        
        try:
            result = await self._db.execute_query(
                query=query,
                parameters={
                    'artwork_id': artwork_id,
                    'rel_types': relationship_types,
                    'min_similarity': min_similarity,
                    'max_nodes': MAX_NODES
                },
                timeout=QUERY_TIMEOUT
            )
            
            related_artworks = [item['result'] for item in result]
            
            # Cache results
            if use_cache:
                self._query_cache[cache_key] = related_artworks
                
            return related_artworks
            
        except Exception as e:
            self._logger.error(f"Failed to find related artworks: {str(e)}")
            raise

    async def execute_graph_query(
        self,
        query: str,
        parameters: Dict[str, Any],
        timeout: Optional[int] = None
    ) -> List[Any]:
        """
        Executes a graph query with comprehensive security and performance features.
        
        Args:
            query: Cypher query string
            parameters: Query parameters
            timeout: Query timeout in seconds
            
        Returns:
            Query results
        """
        # Validate query for security
        if not query or not isinstance(query, str):
            raise ValueError("Invalid query")
            
        # Check query complexity
        if query.count("MATCH") > 5 or query.count("MERGE") > 3:
            self._logger.warning("Complex query detected - performance may be impacted")
            
        try:
            # Execute query with timeout
            result = await self._db.execute_query(
                query=query,
                parameters=parameters,
                timeout=timeout or QUERY_TIMEOUT
            )
            
            # Validate results
            if len(result) > MAX_NODES:
                self._logger.warning(f"Large result set: {len(result)} nodes")
                
            return result
            
        except Exception as e:
            self._logger.error(f"Query execution failed: {str(e)}")
            raise