"""
Initialization module for the backend scripts package that provides centralized access 
to database management utilities and script execution functions.

This module exposes key functionality from database initialization and migration scripts
for managing PostgreSQL, Neo4j and Redis databases in the Art Knowledge Graph application.
"""

import logging
from .db_init import setup_postgres, setup_neo4j, setup_redis
from .db_migrate import DatabaseMigrator

# Configure module logger
logger = logging.getLogger(__name__)

# Export key database management functions and classes
__all__ = [
    "setup_postgres",
    "setup_neo4j", 
    "setup_redis",
    "DatabaseMigrator"
]

# Log module initialization
logger.debug("Database management scripts initialized")