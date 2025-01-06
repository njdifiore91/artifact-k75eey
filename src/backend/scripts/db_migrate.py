import alembic  # v1.11+
import click  # v8.0+
import logging
import pathlib
from typing import Dict, List, Optional, Union
from datetime import datetime
from cryptography.fernet import Fernet  # v41.0+
from threading import Lock
from pathlib import Path

from shared.database.postgres import PostgresDatabase
from shared.database.neo4j import Neo4jConnection
from shared.config.settings import Settings

# Configure logging
logger = logging.getLogger(__name__)

# Constants
MIGRATION_DIRECTORY = Path('migrations')
SUPPORTED_DATABASES = ["postgres", "neo4j", "all"]
MIGRATION_LOCK_TIMEOUT = 3600
MAX_BATCH_SIZE = 5000

class MetricsCollector:
    """Collects and manages migration metrics."""
    
    def __init__(self):
        self.metrics = {
            'start_time': None,
            'end_time': None,
            'total_migrations': 0,
            'successful_migrations': 0,
            'failed_migrations': 0,
            'rollbacks': 0,
            'duration_seconds': 0,
            'errors': []
        }

    def start_migration(self):
        self.metrics['start_time'] = datetime.utcnow()

    def end_migration(self, success: bool):
        self.metrics['end_time'] = datetime.utcnow()
        self.metrics['duration_seconds'] = (
            self.metrics['end_time'] - self.metrics['start_time']
        ).total_seconds()
        if success:
            self.metrics['successful_migrations'] += 1
        else:
            self.metrics['failed_migrations'] += 1

    def record_error(self, error: str):
        self.metrics['errors'].append({
            'timestamp': datetime.utcnow(),
            'error': error
        })

class DatabaseMigrator:
    """Manages secure database migrations for PostgreSQL and Neo4j databases."""

    def __init__(self, settings: Settings, dry_run: bool = False):
        self.settings = settings
        self.dry_run = dry_run
        self.postgres_db = PostgresDatabase(settings)
        self.neo4j_conn = Neo4jConnection(settings)
        self.logger = logger
        self.migration_lock = Lock()
        self.metrics_collector = MetricsCollector()
        
        # Initialize encryption for sensitive data
        self.fernet = Fernet(settings.migration_key.get_secret_value().encode())
        
        # Validate migration directory structure
        self._init_migration_directories()

    def _init_migration_directories(self):
        """Initialize and validate migration directory structure."""
        for db in ['postgres', 'neo4j']:
            db_path = MIGRATION_DIRECTORY / db
            versions_path = db_path / 'versions'
            rollback_path = db_path / 'rollback'
            
            for path in [db_path, versions_path, rollback_path]:
                path.mkdir(parents=True, exist_ok=True)

    async def migrate_postgres(self, version: str, batch_size: int = 1000) -> bool:
        """Execute PostgreSQL schema migrations with transaction safety."""
        if not self.migration_lock.acquire(timeout=MIGRATION_LOCK_TIMEOUT):
            raise TimeoutError("Could not acquire migration lock")
        
        try:
            self.metrics_collector.start_migration()
            
            # Validate migration version and scripts
            migration_path = MIGRATION_DIRECTORY / 'postgres' / 'versions' / f"{version}.sql"
            if not migration_path.exists():
                raise FileNotFoundError(f"Migration file not found: {migration_path}")
            
            # Initialize Alembic for migration tracking
            alembic_cfg = self._get_alembic_config()
            
            # Create backup checkpoint
            await self._create_postgres_backup(version)
            
            async with self.postgres_db.get_session() as session:
                # Begin transaction
                async with session.begin():
                    # Execute migration in batches
                    migration_sql = migration_path.read_text()
                    statements = self._split_sql_statements(migration_sql)
                    
                    for stmt in statements:
                        if len(stmt.strip()) > 0:
                            await session.execute(stmt)
                    
                    # Update migration history with encryption
                    migration_metadata = {
                        'version': version,
                        'timestamp': datetime.utcnow().isoformat(),
                        'checksum': self._calculate_checksum(migration_sql)
                    }
                    encrypted_metadata = self.fernet.encrypt(
                        str(migration_metadata).encode()
                    )
                    await self._update_migration_history('postgres', encrypted_metadata)
                    
                    # Verify database health
                    if not await self._verify_postgres_health():
                        raise Exception("Database health check failed")
                    
                    if not self.dry_run:
                        await session.commit()
                        self.metrics_collector.end_migration(success=True)
                        self.logger.info(f"Successfully migrated PostgreSQL to version {version}")
                        return True
                    else:
                        await session.rollback()
                        return True
                        
        except Exception as e:
            self.metrics_collector.record_error(str(e))
            self.logger.error(f"Migration failed: {str(e)}")
            await self._handle_migration_failure('postgres', version)
            return False
            
        finally:
            self.migration_lock.release()

    async def migrate_neo4j(self, version: str, timeout_seconds: int = 3600) -> bool:
        """Execute Neo4j schema migrations with safety checks."""
        if not self.migration_lock.acquire(timeout=MIGRATION_LOCK_TIMEOUT):
            raise TimeoutError("Could not acquire migration lock")
        
        try:
            self.metrics_collector.start_migration()
            
            # Validate Cypher scripts
            migration_path = MIGRATION_DIRECTORY / 'neo4j' / 'versions' / f"{version}.cypher"
            if not migration_path.exists():
                raise FileNotFoundError(f"Migration file not found: {migration_path}")
            
            # Create graph backup
            await self._create_neo4j_backup(version)
            
            # Execute migration
            cypher_script = migration_path.read_text()
            statements = self._split_cypher_statements(cypher_script)
            
            with self.neo4j_conn.get_session(write_access=True, timeout=timeout_seconds) as session:
                for stmt in statements:
                    if len(stmt.strip()) > 0:
                        session.run(stmt)
                
                # Update constraints and indexes
                await self._update_neo4j_schema_objects(version)
                
                # Verify graph consistency
                if not await self._verify_neo4j_health():
                    raise Exception("Graph health check failed")
                
                # Update encrypted migration metadata
                migration_metadata = {
                    'version': version,
                    'timestamp': datetime.utcnow().isoformat(),
                    'checksum': self._calculate_checksum(cypher_script)
                }
                encrypted_metadata = self.fernet.encrypt(str(migration_metadata).encode())
                await self._update_migration_history('neo4j', encrypted_metadata)
                
                if not self.dry_run:
                    self.metrics_collector.end_migration(success=True)
                    self.logger.info(f"Successfully migrated Neo4j to version {version}")
                    return True
                return True
                
        except Exception as e:
            self.metrics_collector.record_error(str(e))
            self.logger.error(f"Migration failed: {str(e)}")
            await self._handle_migration_failure('neo4j', version)
            return False
            
        finally:
            self.migration_lock.release()

    async def validate_migration(self, version: str, database_type: str) -> bool:
        """Performs comprehensive migration validation."""
        try:
            # Check version format and sequence
            if not self._is_valid_version_format(version):
                raise ValueError(f"Invalid version format: {version}")
            
            # Validate migration script syntax
            if database_type == 'postgres':
                await self._validate_postgres_script(version)
            elif database_type == 'neo4j':
                await self._validate_neo4j_script(version)
            
            # Check for breaking changes
            if await self._has_breaking_changes(version, database_type):
                self.logger.warning(f"Migration {version} contains breaking changes")
            
            # Verify dependencies
            if not await self._verify_dependencies(version, database_type):
                raise ValueError(f"Migration dependencies not satisfied for version {version}")
            
            # Validate rollback scripts
            if not await self._validate_rollback_script(version, database_type):
                raise ValueError(f"Invalid rollback script for version {version}")
            
            return True
            
        except Exception as e:
            self.logger.error(f"Migration validation failed: {str(e)}")
            return False

    # Helper methods
    def _get_alembic_config(self) -> alembic.config.Config:
        """Get Alembic configuration for PostgreSQL migrations."""
        config = alembic.config.Config()
        config.set_main_option("script_location", str(MIGRATION_DIRECTORY / 'postgres'))
        config.set_main_option("sqlalchemy.url", self.settings.postgres_uri.get_secret_value())
        return config

    def _calculate_checksum(self, content: str) -> str:
        """Calculate secure checksum for migration content."""
        import hashlib
        return hashlib.sha256(content.encode()).hexdigest()

    async def _handle_migration_failure(self, database_type: str, version: str):
        """Handle migration failure with rollback."""
        self.logger.error(f"Initiating rollback for failed migration {version}")
        if database_type == 'postgres':
            await self._rollback_postgres(version)
        else:
            await self._rollback_neo4j(version)

@click.group()
def main():
    """Database migration CLI for Art Knowledge Graph application."""
    pass

@main.command()
@click.option('--database', type=click.Choice(SUPPORTED_DATABASES), required=True)
@click.option('--version', required=True, help='Target migration version')
@click.option('--dry-run', is_flag=True, help='Validate without executing')
def migrate(database: str, version: str, dry_run: bool):
    """Execute database migrations."""
    try:
        settings = Settings()
        migrator = DatabaseMigrator(settings, dry_run)
        
        if database in ['postgres', 'all']:
            if not migrator.migrate_postgres(version):
                raise click.ClickException("PostgreSQL migration failed")
                
        if database in ['neo4j', 'all']:
            if not migrator.migrate_neo4j(version):
                raise click.ClickException("Neo4j migration failed")
                
        click.echo(f"Migration to version {version} completed successfully")
        
    except Exception as e:
        logger.error(f"Migration failed: {str(e)}")
        raise click.ClickException(str(e))

if __name__ == '__main__':
    main()