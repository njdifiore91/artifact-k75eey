#!/usr/bin/env python3

"""
Database initialization script for Art Knowledge Graph application.
Handles secure setup of PostgreSQL, Neo4j, and Redis databases with comprehensive
error handling, connection pooling, and monitoring capabilities.
"""

import asyncio
import logging
import argparse
import sys
from typing import Tuple, Optional
from datetime import datetime, timezone

from shared.config.settings import Settings, get_settings
from shared.database.postgres import PostgresDatabase, check_connection
from shared.database.neo4j import Neo4jConnection
from shared.database.redis import RedisClient
from shared.logging.config import setup_logging

# Initialize logger with security context
logger = logging.getLogger(__name__)

# Constants for initialization timeouts and retries
POSTGRES_INIT_TIMEOUT = 60  # seconds
NEO4J_INIT_TIMEOUT = 60    # seconds
REDIS_INIT_TIMEOUT = 30    # seconds
MAX_RETRY_ATTEMPTS = 3

async def init_postgres(settings: Settings) -> Tuple[bool, Optional[PostgresDatabase]]:
    """
    Initialize PostgreSQL database with secure configuration and schema setup.
    
    Args:
        settings: Application settings instance
    
    Returns:
        Tuple of (success status, database instance if successful)
    """
    try:
        # Initialize PostgreSQL database with secure configuration
        db = PostgresDatabase(settings)
        await db.initialize()
        
        # Verify database connection
        if not await check_connection(db):
            raise ConnectionError("Failed to verify PostgreSQL connection")
        
        # Create required schemas and tables
        async with db.get_session() as session:
            # Create art_metadata schema
            await session.execute("""
                CREATE SCHEMA IF NOT EXISTS art_metadata;
                
                -- Create artwork table
                CREATE TABLE IF NOT EXISTS art_metadata.artwork (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    title VARCHAR(255) NOT NULL,
                    artist VARCHAR(255),
                    year INTEGER,
                    medium VARCHAR(100),
                    dimensions JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                
                -- Create artwork_metadata table
                CREATE TABLE IF NOT EXISTS art_metadata.artwork_metadata (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    artwork_id UUID REFERENCES art_metadata.artwork(id),
                    source VARCHAR(50) NOT NULL,
                    metadata JSONB NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                
                -- Create indexes for performance
                CREATE INDEX IF NOT EXISTS idx_artwork_title ON art_metadata.artwork(title);
                CREATE INDEX IF NOT EXISTS idx_artwork_artist ON art_metadata.artwork(artist);
                CREATE INDEX IF NOT EXISTS idx_artwork_year ON art_metadata.artwork(year);
            """)
            
            logger.info("PostgreSQL schemas and tables created successfully")
        return True, db
        
    except Exception as e:
        logger.error(f"PostgreSQL initialization failed: {str(e)}")
        return False, None

async def init_neo4j(settings: Settings) -> Tuple[bool, Optional[Neo4jConnection]]:
    """
    Initialize Neo4j database with secure configuration and constraints.
    
    Args:
        settings: Application settings instance
    
    Returns:
        Tuple of (success status, connection instance if successful)
    """
    try:
        # Initialize Neo4j connection with security settings
        neo4j_conn = Neo4jConnection(settings)
        
        # Create constraints and indexes
        with neo4j_conn.get_session(write_access=True) as session:
            # Create constraints for uniqueness
            session.execute_query("""
                CREATE CONSTRAINT artwork_id IF NOT EXISTS
                FOR (a:Artwork) REQUIRE a.id IS UNIQUE
            """)
            
            session.execute_query("""
                CREATE CONSTRAINT artist_id IF NOT EXISTS
                FOR (a:Artist) REQUIRE a.id IS UNIQUE
            """)
            
            # Create indexes for performance
            session.execute_query("""
                CREATE INDEX artwork_title IF NOT EXISTS
                FOR (a:Artwork) ON (a.title)
            """)
            
            session.execute_query("""
                CREATE INDEX artist_name IF NOT EXISTS
                FOR (a:Artist) ON (a.name)
            """)
            
        logger.info("Neo4j constraints and indexes created successfully")
        return True, neo4j_conn
        
    except Exception as e:
        logger.error(f"Neo4j initialization failed: {str(e)}")
        return False, None

async def init_redis(settings: Settings) -> Tuple[bool, Optional[RedisClient]]:
    """
    Initialize Redis cache with secure configuration and monitoring.
    
    Args:
        settings: Application settings instance
    
    Returns:
        Tuple of (success status, client instance if successful)
    """
    try:
        # Initialize Redis client with security settings
        redis_client = RedisClient(settings)
        
        # Verify connection and clear existing data
        await redis_client.flush()
        
        # Set up cache warming
        await redis_client.set(
            "cache_info",
            {
                "initialized_at": datetime.now(timezone.utc).isoformat(),
                "environment": settings.environment
            },
            ttl=86400  # 24 hours
        )
        
        logger.info("Redis cache initialized successfully")
        return True, redis_client
        
    except Exception as e:
        logger.error(f"Redis initialization failed: {str(e)}")
        return False, None

async def main() -> int:
    """
    Main function to orchestrate database initialization with comprehensive error handling.
    
    Returns:
        Exit code (0 for success, 1 for failure)
    """
    parser = argparse.ArgumentParser(description="Initialize Art Knowledge Graph databases")
    parser.add_argument("--environment", default="development", help="Deployment environment")
    parser.add_argument("--skip-postgres", action="store_true", help="Skip PostgreSQL initialization")
    parser.add_argument("--skip-neo4j", action="store_true", help="Skip Neo4j initialization")
    parser.add_argument("--skip-redis", action="store_true", help="Skip Redis initialization")
    args = parser.parse_args()

    try:
        # Load settings and configure logging
        settings = get_settings(args.environment)
        setup_logging(settings)
        
        logger.info(f"Starting database initialization for environment: {settings.environment}")
        
        success = True
        
        # Initialize PostgreSQL
        if not args.skip_postgres:
            pg_success, pg_db = await init_postgres(settings)
            if not pg_success:
                logger.error("PostgreSQL initialization failed")
                success = False
            if pg_db:
                await pg_db.close()
        
        # Initialize Neo4j
        if not args.skip_neo4j:
            neo4j_success, neo4j_conn = await init_neo4j(settings)
            if not neo4j_success:
                logger.error("Neo4j initialization failed")
                success = False
            if neo4j_conn:
                neo4j_conn.close()
        
        # Initialize Redis
        if not args.skip_redis:
            redis_success, redis_client = await init_redis(settings)
            if not redis_success:
                logger.error("Redis initialization failed")
                success = False
            if redis_client:
                await redis_client.close()
        
        if success:
            logger.info("Database initialization completed successfully")
            return 0
        else:
            logger.error("Database initialization failed")
            return 1
            
    except Exception as e:
        logger.error(f"Unexpected error during initialization: {str(e)}")
        return 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)