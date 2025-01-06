"""
Main entry point for the shared module of the Art Knowledge Graph backend services.
Provides centralized access to core functionality including configuration, database
connections, and common utilities with comprehensive security, monitoring, and error handling.

Version: 1.0.0
Author: Art Knowledge Graph Team
"""

from typing import Tuple, Optional
import logging
import asyncio
from datetime import datetime, timezone

# Internal imports with version comments
from shared.config.settings import Settings  # pydantic v2.0+
from shared.database.neo4j import Neo4jConnection  # neo4j-driver v5.0+
from shared.database.postgres import PostgresDatabase  # sqlalchemy v2.0+
from shared.database.redis import RedisClient  # redis v4.5+, aioredis v2.0+

# Module version and metadata
__version__ = "1.0.0"
__author__ = "Art Knowledge Graph Team"

# Configure module logger
logger = logging.getLogger(__name__)

async def init_shared_module(settings: Settings) -> Tuple[Neo4jConnection, PostgresDatabase, RedisClient]:
    """
    Initialize all shared module components with secure configuration and comprehensive
    error handling. Ensures proper initialization sequence and validation of all
    critical components.

    Args:
        settings: Application settings instance with validated configuration

    Returns:
        Tuple[Neo4jConnection, PostgresDatabase, RedisClient]: Initialized and validated
        database connections

    Raises:
        RuntimeError: If initialization fails or validation checks fail
        ConnectionError: If database connections cannot be established
        ValueError: If settings validation fails
    """
    initialization_start = datetime.now(timezone.utc)
    logger.info(
        "Starting shared module initialization",
        extra={
            "environment": settings.environment,
            "timestamp": initialization_start.isoformat()
        }
    )

    try:
        # Validate settings
        if not settings:
            raise ValueError("Settings object is required for initialization")

        # Initialize database connections with security measures
        neo4j_connection = Neo4jConnection(
            settings=settings,
            pool_size=settings.postgres_pool_size,
            retry_time=settings.connection_retry_attempts
        )
        logger.info("Neo4j connection initialized successfully")

        postgres_db = PostgresDatabase(settings=settings)
        await postgres_db.initialize()
        logger.info("PostgreSQL connection initialized successfully")

        redis_client = RedisClient(settings=settings)
        logger.info("Redis client initialized successfully")

        # Verify all connections
        await _verify_connections(neo4j_connection, postgres_db, redis_client)

        # Register cleanup handlers
        _register_cleanup_handlers(neo4j_connection, postgres_db, redis_client)

        initialization_time = (datetime.now(timezone.utc) - initialization_start).total_seconds()
        logger.info(
            "Shared module initialization completed successfully",
            extra={
                "initialization_time": initialization_time,
                "environment": settings.environment
            }
        )

        return neo4j_connection, postgres_db, redis_client

    except Exception as e:
        logger.error(
            f"Shared module initialization failed: {str(e)}",
            extra={
                "error_type": type(e).__name__,
                "environment": settings.environment
            },
            exc_info=True
        )
        await _cleanup_on_failure(neo4j_connection, postgres_db, redis_client)
        raise RuntimeError(f"Failed to initialize shared module: {str(e)}") from e

async def _verify_connections(
    neo4j: Optional[Neo4jConnection],
    postgres: Optional[PostgresDatabase],
    redis: Optional[RedisClient]
) -> None:
    """Verify all database connections are responsive and properly configured."""
    if neo4j:
        neo4j._verify_connectivity()
    
    if postgres:
        await postgres.check_connection(postgres)
    
    if redis and redis._async_client:
        try:
            await redis._async_client.ping()
        except Exception as e:
            logger.error(f"Redis connection verification failed: {str(e)}")
            raise

async def _cleanup_on_failure(
    neo4j: Optional[Neo4jConnection],
    postgres: Optional[PostgresDatabase],
    redis: Optional[RedisClient]
) -> None:
    """Clean up resources if initialization fails."""
    try:
        if neo4j:
            neo4j.close()
        if postgres:
            await postgres.close()
        if redis:
            await redis.close()
    except Exception as e:
        logger.error(f"Cleanup on failure encountered error: {str(e)}")

def _register_cleanup_handlers(
    neo4j: Neo4jConnection,
    postgres: PostgresDatabase,
    redis: RedisClient
) -> None:
    """Register cleanup handlers for graceful shutdown."""
    import atexit
    import signal

    async def cleanup():
        """Perform asynchronous cleanup of all connections."""
        try:
            await asyncio.gather(
                postgres.close(),
                redis.close()
            )
            neo4j.close()
            logger.info("All connections closed successfully during cleanup")
        except Exception as e:
            logger.error(f"Error during connection cleanup: {str(e)}")

    def sync_cleanup():
        """Synchronous cleanup handler for system signals."""
        asyncio.run(cleanup())

    # Register cleanup handlers
    atexit.register(sync_cleanup)
    signal.signal(signal.SIGTERM, lambda signo, frame: sync_cleanup())
    signal.signal(signal.SIGINT, lambda signo, frame: sync_cleanup())

# Export public interfaces
__all__ = [
    'Settings',
    'Neo4jConnection',
    'PostgresDatabase',
    'RedisClient',
    'init_shared_module'
]