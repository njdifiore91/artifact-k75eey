"""
Initialization module for the Graph Service microservice providing secure graph generation,
analysis, and visualization capabilities for the Art Knowledge Graph application.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from graph_service.config import GraphServiceSettings
from graph_service.services.neo4j import GraphDatabaseService

# Version information
__version__ = "1.0.0"

# Configure secure logging format with timestamp and service details
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# Initialize secure logger for the service
logger = logging.getLogger("graph_service")

def initialize_logging(log_level: str = "INFO") -> None:
    """
    Configure secure logging with appropriate levels and handlers.
    
    Args:
        log_level: Desired logging level (default: INFO)
    """
    try:
        # Set numeric logging level
        numeric_level = getattr(logging, log_level.upper(), logging.INFO)
        
        # Configure root logger with secure settings
        logging.basicConfig(
            level=numeric_level,
            format=LOG_FORMAT,
            datefmt=LOG_DATE_FORMAT
        )
        
        # Set service logger level
        logger.setLevel(numeric_level)
        
        # Add secure handling for sensitive data
        logger.info(
            f"Initialized Graph Service logging at {log_level} level "
            f"[version: {__version__}]"
        )
        
    except Exception as e:
        raise RuntimeError(f"Failed to initialize logging: {str(e)}")

def initialize_database(settings: GraphServiceSettings) -> GraphDatabaseService:
    """
    Establish secure database connection with connection pooling.
    
    Args:
        settings: Graph service configuration settings
        
    Returns:
        GraphDatabaseService: Initialized database service instance
    """
    try:
        # Get Neo4j configuration with security settings
        neo4j_config = settings.get_neo4j_config()
        
        # Initialize database service with connection pooling
        db_service = GraphDatabaseService(
            settings=settings,
            pool_size=settings.neo4j_pool_config["max_size"],
            retry_time=settings.neo4j_pool_config["max_retry_time"]
        )
        
        logger.info(
            "Initialized Neo4j database connection with secure configuration "
            f"[pool_size: {settings.neo4j_pool_config['max_size']}]"
        )
        
        return db_service
        
    except Exception as e:
        logger.error(f"Failed to initialize database connection: {str(e)}")
        raise

# Initialize service settings with secure defaults
try:
    settings = GraphServiceSettings()
    logger.info("Loaded Graph Service settings with secure configuration")
except Exception as e:
    logger.error(f"Failed to load service settings: {str(e)}")
    raise

# Initialize logging with configured level
initialize_logging(settings.log_level)

# Initialize database service with secure connection
try:
    db_service = initialize_database(settings)
except Exception as e:
    logger.error(f"Failed to initialize Graph Service: {str(e)}")
    raise

# Export essential service components
__all__ = [
    "settings",
    "db_service",
    "__version__",
    "logger"
]