"""
Graph service utilities package providing a unified interface for graph algorithms
and visualization functions with comprehensive type safety and documentation.

Version: 1.0.0
"""

from .graph_algorithms import (
    find_shortest_path,
    calculate_centrality,
    find_similar_artworks,
    detect_clusters
)

from .visualization import (
    generate_layout,
    generate_styles,
    render_graph,
    export_graph,
    highlight_path,
    LAYOUT_ALGORITHMS,
    EXPORT_FORMATS
)

# Define package-level exports with type safety
__all__ = [
    'find_shortest_path',      # Path finding between nodes
    'calculate_centrality',    # Node importance calculation
    'find_similar_artworks',   # Artwork similarity detection
    'detect_clusters',         # Community detection
    'generate_layout',         # Layout generation for visualization
    'generate_styles',         # Style generation for graph elements
    'render_graph',           # Graph rendering
    'export_graph',           # Graph export functionality
    'highlight_path',         # Visual path highlighting
    'LAYOUT_ALGORITHMS',      # Supported layout algorithms
    'EXPORT_FORMATS'          # Supported export formats
]

# Package metadata
__version__ = '1.0.0'
__author__ = 'Art Knowledge Graph Team'
__description__ = 'Enterprise-grade graph processing and visualization utilities'

# Performance monitoring and logging configuration
import logging
logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())

def get_package_info() -> dict:
    """
    Returns package information and capabilities.
    
    Returns:
        dict: Package metadata and supported features
    """
    return {
        'version': __version__,
        'description': __description__,
        'supported_algorithms': {
            'layout': LAYOUT_ALGORITHMS,
            'export': EXPORT_FORMATS,
            'analysis': [
                'shortest_path',
                'centrality',
                'similarity',
                'clustering'
            ]
        }
    }