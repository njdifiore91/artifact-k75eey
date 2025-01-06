"""
High-performance graph algorithms for art knowledge graph analysis with optimized
caching, security measures, and parallel processing capabilities.
"""

import networkx as nx  # networkx v3.0+
import numpy as np  # numpy v1.24+
from typing import List, Dict, Any, Optional, Tuple, Set
import logging
from functools import lru_cache
from datetime import datetime, timezone
import asyncio
from concurrent.futures import ThreadPoolExecutor

from ..models.node import Node
from ..models.relationship import Relationship
from shared.database.neo4j import Neo4jConnection

# Configure secure logger
logger = logging.getLogger(__name__)

# Algorithm configuration constants
CENTRALITY_TYPES = ['degree', 'betweenness', 'eigenvector', 'pagerank']
COMMUNITY_ALGORITHMS = ['louvain', 'label_propagation', 'modularity_optimization']
SIMILARITY_METRICS = ['jaccard', 'cosine', 'euclidean']
MAX_PATH_LENGTH = 6
CACHE_TTL = 3600
BATCH_SIZE = 1000
MAX_RETRIES = 3

class GraphPerformanceMonitor:
    """Decorator for monitoring algorithm performance."""
    def __call__(self, func):
        async def wrapper(*args, **kwargs):
            start_time = datetime.now(timezone.utc)
            try:
                result = await func(*args, **kwargs)
                execution_time = (datetime.now(timezone.utc) - start_time).total_seconds()
                logger.info(f"{func.__name__} executed in {execution_time:.2f}s")
                return result
            except Exception as e:
                logger.error(f"Error in {func.__name__}: {str(e)}")
                raise
        return wrapper

@lru_cache(maxsize=1000, ttl=CACHE_TTL)
async def find_shortest_path(
    db: Neo4jConnection,
    source_id: str,
    target_id: str,
    filters: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Find shortest path between two nodes with optimized performance and security.
    
    Args:
        db: Database connection
        source_id: Source node UUID
        target_id: Target node UUID
        filters: Optional path filters
    
    Returns:
        List of nodes and relationships forming the shortest path
    """
    try:
        # Validate input parameters
        Node.validate_properties({"uuid": source_id})
        Node.validate_properties({"uuid": target_id})
        
        # Construct optimized Cypher query with hints
        query = """
        MATCH path = shortestPath((source:Node {uuid: $source_id})-[*..6]-(target:Node {uuid: $target_id}))
        WHERE ALL(r IN relationships(path) WHERE r.type IN $allowed_types)
        RETURN path
        """
        
        params = {
            "source_id": source_id,
            "target_id": target_id,
            "allowed_types": filters.get("relationship_types", RELATIONSHIP_TYPES) if filters else RELATIONSHIP_TYPES
        }
        
        result = await db.execute_query(query, params)
        return result[0] if result else []

    except Exception as e:
        logger.error(f"Error finding shortest path: {str(e)}")
        raise

@GraphPerformanceMonitor()
async def calculate_centrality(
    db: Neo4jConnection,
    centrality_type: str,
    node_type: Optional[str] = None
) -> Dict[str, float]:
    """
    Calculate node centrality measures with parallel processing.
    
    Args:
        db: Database connection
        centrality_type: Type of centrality measure
        node_type: Optional filter for node type
    
    Returns:
        Dictionary of node IDs and centrality scores
    """
    if centrality_type not in CENTRALITY_TYPES:
        raise ValueError(f"Invalid centrality type. Must be one of: {CENTRALITY_TYPES}")

    try:
        # Fetch graph data with optimized query
        query = """
        MATCH (n:Node)
        WHERE $node_type IS NULL OR n.type = $node_type
        WITH collect(n) as nodes
        MATCH (n)-[r]-(m)
        WHERE n IN nodes AND m IN nodes
        RETURN collect(distinct {source: n.uuid, target: m.uuid, weight: r.weight}) as relationships
        """
        
        result = await db.execute_query(query, {"node_type": node_type})
        
        # Process in parallel using ThreadPoolExecutor
        with ThreadPoolExecutor() as executor:
            G = nx.Graph()
            relationships = result[0]["relationships"]
            
            # Add edges in parallel
            futures = [
                executor.submit(G.add_edge, r["source"], r["target"], weight=r.get("weight", 1.0))
                for r in relationships
            ]
            await asyncio.gather(*[asyncio.to_thread(f.result) for f in futures])
            
            # Calculate centrality based on type
            centrality_func = getattr(nx, f"{centrality_type}_centrality")
            centrality = centrality_func(G)
            
            return centrality

    except Exception as e:
        logger.error(f"Error calculating centrality: {str(e)}")
        raise

@GraphPerformanceMonitor()
async def find_similar_artworks(
    db: Neo4jConnection,
    artwork_id: str,
    similarity_metric: str = 'jaccard',
    limit: int = 10
) -> List[Dict[str, Any]]:
    """
    Find similar artworks using specified similarity metric.
    
    Args:
        db: Database connection
        artwork_id: Source artwork UUID
        similarity_metric: Similarity measure to use
        limit: Maximum number of similar artworks to return
    
    Returns:
        List of similar artworks with similarity scores
    """
    if similarity_metric not in SIMILARITY_METRICS:
        raise ValueError(f"Invalid similarity metric. Must be one of: {SIMILARITY_METRICS}")

    try:
        # Fetch artwork features with optimized query
        query = """
        MATCH (a:Node {uuid: $artwork_id, type: 'ARTWORK'})
        MATCH (a)-[r]-(n)
        WITH a, collect(distinct n.type + ':' + n.uuid) as features
        MATCH (other:Node {type: 'ARTWORK'})
        WHERE other.uuid <> a.uuid
        MATCH (other)-[r2]-(n2)
        WITH a, other, features, collect(distinct n2.type + ':' + n2.uuid) as other_features
        RETURN other.uuid as artwork_id,
               other.properties as properties,
               features,
               other_features
        LIMIT 100
        """
        
        results = await db.execute_query(query, {"artwork_id": artwork_id})
        
        # Calculate similarities in parallel
        similarities = []
        with ThreadPoolExecutor() as executor:
            for result in results:
                if similarity_metric == 'jaccard':
                    score = await asyncio.to_thread(
                        lambda: len(set(result["features"]) & set(result["other_features"])) /
                               len(set(result["features"]) | set(result["other_features"]))
                    )
                else:
                    # Implement other similarity metrics
                    continue
                
                similarities.append({
                    "artwork_id": result["artwork_id"],
                    "properties": result["properties"],
                    "similarity_score": score
                })
        
        # Sort and return top similar artworks
        return sorted(similarities, key=lambda x: x["similarity_score"], reverse=True)[:limit]

    except Exception as e:
        logger.error(f"Error finding similar artworks: {str(e)}")
        raise

@GraphPerformanceMonitor()
async def detect_communities(
    db: Neo4jConnection,
    algorithm: str = 'louvain',
    min_community_size: int = 3
) -> Dict[str, List[str]]:
    """
    Detect communities in the art knowledge graph.
    
    Args:
        db: Database connection
        algorithm: Community detection algorithm to use
        min_community_size: Minimum nodes per community
    
    Returns:
        Dictionary of community IDs and their member nodes
    """
    if algorithm not in COMMUNITY_ALGORITHMS:
        raise ValueError(f"Invalid algorithm. Must be one of: {COMMUNITY_ALGORITHMS}")

    try:
        # Fetch graph structure with optimized query
        query = """
        MATCH (n:Node)
        WITH collect(n) as nodes
        MATCH (n)-[r]-(m)
        WHERE n IN nodes AND m IN nodes
        RETURN collect(distinct {source: n.uuid, target: m.uuid, weight: r.weight}) as relationships
        """
        
        result = await db.execute_query(query, {})
        
        # Build graph for community detection
        G = nx.Graph()
        for r in result[0]["relationships"]:
            G.add_edge(r["source"], r["target"], weight=r.get("weight", 1.0))
        
        # Detect communities using specified algorithm
        if algorithm == 'louvain':
            communities = nx.community.louvain_communities(G)
        elif algorithm == 'label_propagation':
            communities = nx.community.label_propagation_communities(G)
        else:
            communities = nx.community.greedy_modularity_communities(G)
        
        # Filter and format results
        community_dict = {}
        for idx, community in enumerate(communities):
            if len(community) >= min_community_size:
                community_dict[f"community_{idx}"] = list(community)
        
        return community_dict

    except Exception as e:
        logger.error(f"Error detecting communities: {str(e)}")
        raise

@GraphPerformanceMonitor()
async def calculate_graph_metrics(
    db: Neo4jConnection,
    metrics: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Calculate various graph metrics for analysis.
    
    Args:
        db: Database connection
        metrics: List of metrics to calculate
    
    Returns:
        Dictionary of calculated metrics
    """
    default_metrics = ['density', 'diameter', 'average_clustering']
    metrics = metrics or default_metrics

    try:
        # Fetch graph data efficiently
        query = """
        MATCH (n:Node)
        WITH collect(n) as nodes
        MATCH (n)-[r]-(m)
        WHERE n IN nodes AND m IN nodes
        RETURN count(distinct n) as node_count,
               count(distinct r) as edge_count,
               collect(distinct {source: n.uuid, target: m.uuid}) as relationships
        """
        
        result = await db.execute_query(query, {})
        data = result[0]
        
        # Build graph for metric calculation
        G = nx.Graph()
        for r in data["relationships"]:
            G.add_edge(r["source"], r["target"])
        
        # Calculate metrics in parallel
        metric_results = {}
        with ThreadPoolExecutor() as executor:
            futures = []
            
            if 'density' in metrics:
                futures.append(executor.submit(nx.density, G))
            if 'diameter' in metrics:
                futures.append(executor.submit(nx.diameter, G))
            if 'average_clustering' in metrics:
                futures.append(executor.submit(nx.average_clustering, G))
            
            # Collect results
            results = await asyncio.gather(*[asyncio.to_thread(f.result) for f in futures])
            
            for metric, value in zip(metrics, results):
                metric_results[metric] = value
        
        # Add basic statistics
        metric_results.update({
            'node_count': data['node_count'],
            'edge_count': data['edge_count'],
            'average_degree': 2 * data['edge_count'] / data['node_count']
        })
        
        return metric_results

    except Exception as e:
        logger.error(f"Error calculating graph metrics: {str(e)}")
        raise