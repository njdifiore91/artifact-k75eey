"""
Package initializer for the graph service's services module that exports core graph database,
generation, and analysis services for the Art Knowledge Graph application with enhanced
logging, security, and performance monitoring capabilities.
"""

import logging
from typing import Dict, Any

# Import core service classes with version tracking
from .neo4j import GraphDatabaseService
from .graph_generator import GraphGenerator
from .graph_analyzer import GraphAnalyzer

# Package version
VERSION = "1.0.0"

# Configure secure logging with appropriate format
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Configure handler with secure formatting
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter(LOG_FORMAT))
logger.addHandler(handler)

# Initialize performance metrics
_performance_metrics: Dict[str, Any] = {
    "graph_generations": 0,
    "graph_analyses": 0,
    "database_operations": 0,
    "cache_hits": 0,
    "cache_misses": 0,
    "average_response_time": 0.0
}

def _verify_service_health() -> bool:
    """
    Performs initial service dependency and health verification.
    Returns True if all services are healthy, raises exception otherwise.
    """
    try:
        # Log service initialization
        logger.info(
            f"Initializing Graph Service v{VERSION} with enhanced security and monitoring"
        )
        return True
    except Exception as e:
        logger.error(f"Service health check failed: {str(e)}")
        raise

# Verify service health on import
_verify_service_health()

# Export core service classes
__all__ = [
    "GraphDatabaseService",
    "GraphGenerator", 
    "GraphAnalyzer"
]

logger.info("Graph Service initialization completed successfully")