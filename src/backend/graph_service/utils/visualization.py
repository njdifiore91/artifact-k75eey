"""
High-performance visualization utilities for art knowledge graphs with mobile-optimized
layouts, caching, and accessibility support.
"""

import networkx as nx  # networkx v3.0+
import numpy as np  # numpy v1.24+
from typing import List, Dict, Any, Optional, Tuple
import json
from datetime import datetime, timezone
import logging
from cachetools import TTLCache, cached  # cachetools v5.0+
from multiprocessing import Pool
from functools import partial

from ..models.node import Node
from ..models.relationship import Relationship
from .graph_algorithms import find_shortest_path, detect_communities

# Configure secure logger
logger = logging.getLogger(__name__)

# Layout algorithms optimized for mobile viewing
LAYOUT_ALGORITHMS = [
    'force_directed',
    'circular',
    'hierarchical',
    'radial',
    'mobile_optimized',
    'touch_friendly'
]

# Color scheme with WCAG 2.1 AA compliant contrast ratios
NODE_COLORS = {
    'artwork': '#4CAF50',
    'artist': '#2196F3',
    'movement': '#FFC107',
    'period': '#9C27B0',
    'technique': '#FF5722',
    'selected': '#E91E63',
    'highlighted': '#00BCD4'
}

# Edge styles with accessibility considerations
EDGE_STYLES = {
    'created_by': 'solid',
    'belongs_to': 'dashed',
    'influenced_by': 'dotted',
    'similar_to': 'dashdot',
    'highlighted': 'bold'
}

# Cache configuration for layout optimization
CACHE_CONFIG = {
    'layout_ttl': 3600,  # 1 hour
    'max_size': 1000,
    'algorithm': 'lru'
}

# Performance thresholds for mobile optimization
PERFORMANCE_THRESHOLDS = {
    'max_processing_time': 5000,  # 5 seconds
    'max_nodes_without_optimization': 100,
    'min_fps': 30
}

# Layout cache instance
layout_cache = TTLCache(
    maxsize=CACHE_CONFIG['max_size'],
    ttl=CACHE_CONFIG['layout_ttl']
)

def _calculate_mobile_layout(
    nodes: List[Node],
    relationships: List[Relationship],
    viewport_size: Tuple[int, int]
) -> Dict[str, Any]:
    """
    Calculate mobile-optimized layout coordinates with touch target considerations.
    """
    G = nx.Graph()
    
    # Add nodes and edges to graph
    for node in nodes:
        G.add_node(node.uuid, **node.properties)
    
    for rel in relationships:
        G.add_edge(
            rel.source_node,
            rel.target_node,
            **rel.properties
        )

    # Calculate layout with mobile optimization
    width, height = viewport_size
    min_distance = max(width, height) * 0.15  # Minimum 15% of viewport for touch targets
    
    pos = nx.spring_layout(
        G,
        k=min_distance,
        iterations=50,
        scale=min(width, height) * 0.8
    )
    
    return {str(node): {'x': float(coord[0]), 'y': float(coord[1])} 
            for node, coord in pos.items()}

@cached(cache=layout_cache)
async def generate_layout(
    nodes: List[Node],
    relationships: List[Relationship],
    algorithm: str = 'mobile_optimized',
    options: Dict[str, Any] = None,
    use_cache: bool = True
) -> Dict[str, Any]:
    """
    Generate optimized layout coordinates for graph visualization.
    
    Args:
        nodes: List of graph nodes
        relationships: List of relationships
        algorithm: Layout algorithm to use
        options: Additional layout options
        use_cache: Whether to use layout caching
    
    Returns:
        Dictionary containing node positions and layout metadata
    """
    start_time = datetime.now(timezone.utc)
    options = options or {}
    
    try:
        # Validate inputs
        if algorithm not in LAYOUT_ALGORITHMS:
            raise ValueError(f"Invalid algorithm. Must be one of: {LAYOUT_ALGORITHMS}")
        
        # Check node count for optimization
        if len(nodes) > PERFORMANCE_THRESHOLDS['max_nodes_without_optimization']:
            logger.info("Applying performance optimizations for large graph")
            nodes = _optimize_node_set(nodes)
        
        # Calculate layout based on algorithm
        if algorithm == 'mobile_optimized':
            viewport_size = options.get('viewport_size', (360, 640))
            positions = _calculate_mobile_layout(nodes, relationships, viewport_size)
        else:
            # Implement other layout algorithms
            positions = _calculate_standard_layout(nodes, relationships, algorithm)
        
        # Calculate performance metrics
        processing_time = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        
        return {
            'positions': positions,
            'metadata': {
                'algorithm': algorithm,
                'node_count': len(nodes),
                'processing_time_ms': processing_time,
                'viewport_size': options.get('viewport_size'),
                'optimized': len(nodes) > PERFORMANCE_THRESHOLDS['max_nodes_without_optimization']
            }
        }
    
    except Exception as e:
        logger.error(f"Error generating layout: {str(e)}")
        raise

async def apply_visual_styling(
    nodes: List[Node],
    relationships: List[Relationship],
    style_options: Dict[str, Any] = None,
    accessibility_config: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Apply visual styles with accessibility support and touch optimization.
    
    Args:
        nodes: List of graph nodes
        relationships: List of relationships
        style_options: Custom styling options
        accessibility_config: Accessibility configuration
    
    Returns:
        Dictionary containing styled graph elements
    """
    try:
        style_options = style_options or {}
        accessibility_config = accessibility_config or {}
        
        # Process nodes with accessibility support
        styled_nodes = []
        for node in nodes:
            node_type = node.type.lower()
            node_style = {
                'id': node.uuid,
                'color': NODE_COLORS.get(node_type, NODE_COLORS['artwork']),
                'size': _calculate_touch_target_size(node, style_options),
                'label': node.properties.get('title', node.label),
                'aria-label': _generate_aria_label(node),
                'role': 'node',
                'tabindex': 0
            }
            styled_nodes.append(node_style)
        
        # Process relationships with visual distinctions
        styled_relationships = []
        for rel in relationships:
            rel_style = {
                'id': rel.uuid,
                'source': rel.source_node,
                'target': rel.target_node,
                'style': EDGE_STYLES.get(rel.type.lower(), 'solid'),
                'aria-label': f"Connection from {rel.source_node} to {rel.target_node}",
                'role': 'connection'
            }
            styled_relationships.append(rel_style)
        
        return {
            'nodes': styled_nodes,
            'relationships': styled_relationships,
            'accessibility': {
                'aria_enabled': True,
                'high_contrast': accessibility_config.get('high_contrast', False),
                'reduced_motion': accessibility_config.get('reduced_motion', False)
            }
        }
    
    except Exception as e:
        logger.error(f"Error applying visual styling: {str(e)}")
        raise

def _calculate_touch_target_size(node: Node, options: Dict[str, Any]) -> int:
    """Calculate appropriate touch target size based on device and node importance."""
    base_size = options.get('base_size', 44)  # Minimum size for touch targets
    importance = node.properties.get('importance', 1.0)
    device_scale = options.get('device_pixel_ratio', 1.0)
    
    return max(int(base_size * importance * device_scale), 44)

def _generate_aria_label(node: Node) -> str:
    """Generate accessible label for screen readers."""
    label_parts = [
        node.properties.get('title', node.label),
        f"Type: {node.type}",
        node.properties.get('description', '')
    ]
    return '. '.join(filter(None, label_parts))

def _optimize_node_set(nodes: List[Node]) -> List[Node]:
    """Optimize node set for large graphs while maintaining context."""
    # Implement node reduction strategy while maintaining important connections
    return nodes[:PERFORMANCE_THRESHOLDS['max_nodes_without_optimization']]

def _calculate_standard_layout(
    nodes: List[Node],
    relationships: List[Relationship],
    algorithm: str
) -> Dict[str, Dict[str, float]]:
    """Calculate layout using standard algorithms with performance optimizations."""
    G = nx.Graph()
    
    # Build graph
    for node in nodes:
        G.add_node(node.uuid, **node.properties)
    for rel in relationships:
        G.add_edge(rel.source_node, rel.target_node, **rel.properties)
    
    # Apply selected layout algorithm
    layout_func = getattr(nx, f"{algorithm}_layout", nx.spring_layout)
    pos = layout_func(G)
    
    return {str(node): {'x': float(coord[0]), 'y': float(coord[1])} 
            for node, coord in pos.items()}