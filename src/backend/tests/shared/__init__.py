"""
Test package initialization for shared module tests providing comprehensive test configuration,
fixtures and utilities for testing shared backend components with advanced test environment
management features.
"""

import pytest
from typing import Tuple, Optional, Dict, Any
from datetime import datetime, timezone

from shared.config.settings import Settings
from shared.database.neo4j import Neo4jConnection
from shared.database.postgres import PostgresDatabase
from shared.database.redis import RedisClient

# Initialize test settings with test environment configuration
TEST_SETTINGS = Settings(environment="development", config_path=".env.test")

# Mark this module as containing tests
__test__ = True

async def setup_test_environment(settings: Settings) -> Tuple[Neo4jConnection, PostgresDatabase, RedisClient]:
    """
    Sets up and validates test environment for shared module tests with comprehensive
    initialization, monitoring and cleanup.

    Args:
        settings: Application settings instance configured for testing

    Returns:
        Tuple containing initialized and validated test database connections
        (Neo4j, PostgreSQL, Redis)

    Raises:
        RuntimeError: If test environment setup fails
        ConnectionError: If database connections cannot be established
    """
    start_time = datetime.now(timezone.utc)
    test_metrics: Dict[str, Any] = {
        "start_time": start_time,
        "environment": settings.environment,
        "database_connections": {},
        "cache_status": {}
    }

    try:
        # Initialize Neo4j test connection with retry logic
        neo4j_connection = Neo4jConnection(
            settings=settings,
            pool_size=5,  # Reduced pool size for tests
            retry_time=10
        )
        
        # Verify Neo4j connection and schema
        test_query = "MATCH (n) RETURN count(n) as count"
        neo4j_connection.execute_query(test_query, {}, write=False)
        test_metrics["database_connections"]["neo4j"] = "connected"

        # Initialize PostgreSQL test database
        postgres_db = PostgresDatabase(settings)
        await postgres_db.initialize()
        
        # Verify PostgreSQL connection
        async with postgres_db.get_session() as session:
            await session.execute("SELECT 1")
        test_metrics["database_connections"]["postgres"] = "connected"

        # Initialize Redis test client
        redis_client = RedisClient(settings)
        
        # Verify Redis connection and clear test data
        await redis_client.flush()
        await redis_client.set("test_connection", "ok", ttl=60)
        test_metrics["cache_status"]["redis"] = "connected"

        # Set up test environment cleanup handlers
        @pytest.fixture(autouse=True)
        async def cleanup_test_environment():
            yield
            # Cleanup after each test
            await redis_client.flush()
            await postgres_db.close()
            neo4j_connection.close()

        # Record test environment setup completion
        test_metrics["setup_completed"] = datetime.now(timezone.utc)
        test_metrics["setup_duration"] = (test_metrics["setup_completed"] - start_time).total_seconds()

        return neo4j_connection, postgres_db, redis_client

    except Exception as e:
        test_metrics["setup_failed"] = True
        test_metrics["error"] = str(e)
        test_metrics["failure_time"] = datetime.now(timezone.utc)
        raise RuntimeError(f"Test environment setup failed: {str(e)}") from e

    finally:
        # Log test environment metrics
        print(f"Test environment metrics: {test_metrics}")