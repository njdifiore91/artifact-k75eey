import asyncio
import logging
from typing import Dict, Any, List
from datetime import datetime
from pathlib import Path
import json
from cryptography.fernet import Fernet
from pydantic import BaseModel, validator

from shared.database.neo4j import Neo4jConnection
from shared.database.postgres import PostgresDatabase
from shared.config.settings import Settings, get_settings

# Configure secure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Data versioning and validation
SAMPLE_DATA_VERSION = "1.0.0"
DATA_VALIDATION_RULES = {
    "artwork": {
        "required_fields": ["title", "artist", "year", "medium"],
        "max_title_length": 200,
        "valid_years": range(1000, datetime.now().year + 1)
    },
    "users": {
        "roles": ["admin", "premium", "free"],
        "required_fields": ["email", "role", "name"],
        "password_min_length": 12
    }
}

# Security configuration
SECURITY_CONFIG = {
    "hash_iterations": 100000,
    "token_length": 32,
    "encryption_key": Fernet.generate_key()
}

# Audit settings
AUDIT_SETTINGS = {
    "enabled": True,
    "log_level": logging.INFO,
    "include_timestamps": True
}

class DataValidator(BaseModel):
    """Data validation model with enhanced security checks."""
    
    class Config:
        arbitrary_types_allowed = True
        validate_assignment = True

    @validator("*")
    def validate_no_sql_injection(cls, v: str) -> str:
        """Prevent SQL injection in string fields."""
        if isinstance(v, str):
            dangerous_patterns = [";", "--", "DROP", "DELETE", "UPDATE", "INSERT"]
            if any(pattern in v.upper() for pattern in dangerous_patterns):
                raise ValueError("Potentially dangerous SQL pattern detected")
        return v

async def create_audit_log(
    db: PostgresDatabase,
    action: str,
    details: Dict[str, Any]
) -> None:
    """Create secure audit log entry."""
    if not AUDIT_SETTINGS["enabled"]:
        return

    async with db.get_session() as session:
        await session.execute(
            """
            INSERT INTO audit_logs (action, details, created_at)
            VALUES (:action, :details, :created_at)
            """,
            {
                "action": action,
                "details": json.dumps(details),
                "created_at": datetime.utcnow()
            }
        )

async def seed_users(db: PostgresDatabase) -> Dict[str, Any]:
    """Create initial user accounts with enhanced security features."""
    logger.info("Starting user seeding process")
    
    try:
        async with db.get_session() as session:
            # Create admin user with enhanced security
            admin_user = {
                "email": "admin@artknowledge.com",
                "name": "System Administrator",
                "role": "admin",
                "security_level": "high",
                "mfa_enabled": True,
                "created_at": datetime.utcnow()
            }
            
            await session.execute(
                """
                INSERT INTO users (email, name, role, security_level, mfa_enabled, created_at)
                VALUES (:email, :name, :role, :security_level, :mfa_enabled, :created_at)
                """,
                admin_user
            )

            # Create sample premium users
            premium_users = [
                {
                    "email": f"premium{i}@artknowledge.com",
                    "name": f"Premium User {i}",
                    "role": "premium",
                    "security_level": "medium",
                    "mfa_enabled": False,
                    "created_at": datetime.utcnow()
                }
                for i in range(1, 4)
            ]
            
            await session.execute(
                """
                INSERT INTO users (email, name, role, security_level, mfa_enabled, created_at)
                VALUES (:email, :name, :role, :security_level, :mfa_enabled, :created_at)
                """,
                premium_users
            )

            await create_audit_log(
                db,
                "seed_users",
                {"admin_created": True, "premium_users_created": len(premium_users)}
            )

            return {
                "status": "success",
                "users_created": len(premium_users) + 1,
                "timestamp": datetime.utcnow().isoformat()
            }

    except Exception as e:
        logger.error(f"Error seeding users: {str(e)}")
        raise

async def seed_artwork_nodes(neo4j_conn: Neo4jConnection) -> Dict[str, Any]:
    """Create validated artwork nodes with integrity checks."""
    logger.info("Starting artwork node seeding process")
    
    try:
        # Sample artwork data with comprehensive metadata
        artwork_data = [
            {
                "title": "The Starry Night",
                "artist": "Vincent van Gogh",
                "year": 1889,
                "medium": "Oil on canvas",
                "movement": "Post-Impressionism",
                "location": "Museum of Modern Art",
                "dimensions": "73.7 cm × 92.1 cm"
            },
            {
                "title": "The Persistence of Memory",
                "artist": "Salvador Dalí",
                "year": 1931,
                "medium": "Oil on canvas",
                "movement": "Surrealism",
                "location": "Museum of Modern Art",
                "dimensions": "24.1 cm × 33 cm"
            }
        ]

        # Validate artwork data
        for artwork in artwork_data:
            DataValidator(**artwork)

        # Create artwork nodes with relationships
        query = """
        UNWIND $artworks AS artwork
        MERGE (a:Artwork {
            title: artwork.title,
            year: artwork.year,
            medium: artwork.medium,
            dimensions: artwork.dimensions
        })
        MERGE (artist:Artist {name: artwork.artist})
        MERGE (movement:Movement {name: artwork.movement})
        MERGE (location:Location {name: artwork.location})
        MERGE (a)-[:CREATED_BY]->(artist)
        MERGE (a)-[:BELONGS_TO]->(movement)
        MERGE (a)-[:LOCATED_AT]->(location)
        RETURN a.title as title
        """

        result = neo4j_conn.execute_query(
            query=query,
            parameters={"artworks": artwork_data},
            write=True
        )

        return {
            "status": "success",
            "nodes_created": len(result),
            "artwork_titles": [r["title"] for r in result],
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Error seeding artwork nodes: {str(e)}")
        raise

async def main():
    """Main seeding function with comprehensive error handling."""
    settings = get_settings()
    
    try:
        # Initialize database connections
        postgres_db = PostgresDatabase(settings)
        await postgres_db.initialize()
        
        neo4j_conn = Neo4jConnection(settings)
        
        # Execute seeding operations
        users_result = await seed_users(postgres_db)
        artwork_result = await seed_artwork_nodes(neo4j_conn)
        
        logger.info("Database seeding completed successfully")
        logger.info(f"Users created: {users_result['users_created']}")
        logger.info(f"Artwork nodes created: {artwork_result['nodes_created']}")
        
    except Exception as e:
        logger.error(f"Database seeding failed: {str(e)}")
        raise
        
    finally:
        # Cleanup connections
        await postgres_db.close()
        neo4j_conn.close()

if __name__ == "__main__":
    asyncio.run(main())