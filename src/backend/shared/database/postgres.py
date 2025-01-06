import logging
import ssl
from typing import Dict, Optional, AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncEngine,
    AsyncSession,
    async_sessionmaker
)
from sqlalchemy import event, exc
from asyncpg.exceptions import PostgresError

from shared.config.settings import Settings

# Configure module logger
logger = logging.getLogger(__name__)

# Database configuration constants
DEFAULT_POOL_SIZE = 10
DEFAULT_MAX_OVERFLOW = 20
CONNECTION_TIMEOUT = 30
RETRY_ATTEMPTS = 3
SSL_VERIFY_MODE = ssl.CERT_REQUIRED

class PostgresDatabase:
    """
    Advanced PostgreSQL database management class with secure connection pooling,
    session handling, and comprehensive monitoring capabilities.
    """

    def __init__(self, settings: Settings) -> None:
        """Initialize PostgreSQL database with secure configuration."""
        self.settings = settings
        self.engine: Optional[AsyncEngine] = None
        self.session_factory: Optional[async_sessionmaker] = None
        self.ssl_context: Optional[ssl.SSLContext] = None
        
        # Initialize monitoring metrics
        self._pool_stats: Dict[str, int] = {
            "active_connections": 0,
            "total_connections": 0,
            "failed_connections": 0,
            "active_sessions": 0
        }

    async def initialize(self) -> None:
        """Initialize secure database engine and session factory with monitoring."""
        try:
            # Configure SSL context
            self.ssl_context = ssl.create_default_context(
                cafile=self.settings.ssl_config.get("ca_certs")
            )
            self.ssl_context.verify_mode = SSL_VERIFY_MODE
            if self.settings.ssl_config.get("certfile"):
                self.ssl_context.load_cert_chain(
                    certfile=self.settings.ssl_config["certfile"],
                    keyfile=self.settings.ssl_config["keyfile"]
                )

            # Create async engine with connection pooling
            self.engine = create_async_engine(
                self.settings.postgres_uri.get_secret_value(),
                pool_size=self.settings.postgres_pool_size or DEFAULT_POOL_SIZE,
                max_overflow=self.settings.postgres_max_overflow or DEFAULT_MAX_OVERFLOW,
                pool_timeout=CONNECTION_TIMEOUT,
                pool_pre_ping=True,
                ssl=self.ssl_context,
                echo=self.settings.debug
            )

            # Configure connection event listeners
            event.listen(self.engine.sync_engine, 'connect', self._on_connect)
            event.listen(self.engine.sync_engine, 'checkout', self._on_checkout)
            event.listen(self.engine.sync_engine, 'checkin', self._on_checkin)

            # Create session factory
            self.session_factory = async_sessionmaker(
                bind=self.engine,
                expire_on_commit=False,
                class_=AsyncSession
            )

            logger.info("PostgreSQL database initialization completed successfully")

        except Exception as e:
            logger.error(f"Failed to initialize database: {str(e)}")
            self._pool_stats["failed_connections"] += 1
            raise

    @asynccontextmanager
    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """
        Create and manage secure database session with monitoring.
        """
        if not self.session_factory:
            raise RuntimeError("Database not initialized. Call initialize() first.")

        session: AsyncSession = self.session_factory()
        self._pool_stats["active_sessions"] += 1

        try:
            yield session
            await session.commit()

        except exc.SQLAlchemyError as e:
            await session.rollback()
            logger.error(f"Database session error: {str(e)}")
            raise

        except Exception as e:
            await session.rollback()
            logger.error(f"Unexpected session error: {str(e)}")
            raise

        finally:
            self._pool_stats["active_sessions"] -= 1
            await session.close()

    async def close(self) -> None:
        """Securely close database connections and perform cleanup."""
        if self.engine:
            try:
                # Close all connections in the pool
                await self.engine.dispose()
                self.engine = None
                self.session_factory = None
                self.ssl_context = None
                self._pool_stats = {k: 0 for k in self._pool_stats}
                logger.info("Database connections closed successfully")

            except Exception as e:
                logger.error(f"Error during database cleanup: {str(e)}")
                raise

    def _on_connect(self, dbapi_connection, connection_record):
        """Monitor database connection creation."""
        self._pool_stats["total_connections"] += 1
        self._pool_stats["active_connections"] += 1

    def _on_checkout(self, dbapi_connection, connection_record, connection_proxy):
        """Monitor connection checkout from pool."""
        logger.debug("Database connection checked out from pool")

    def _on_checkin(self, dbapi_connection, connection_record):
        """Monitor connection checkin to pool."""
        self._pool_stats["active_connections"] -= 1

    @property
    def pool_stats(self) -> Dict[str, int]:
        """Get current connection pool statistics."""
        return self._pool_stats.copy()

async def init_database(settings: Settings) -> PostgresDatabase:
    """Initialize secure database connection with comprehensive checks."""
    try:
        db = PostgresDatabase(settings)
        await db.initialize()
        return db

    except Exception as e:
        logger.error(f"Database initialization failed: {str(e)}")
        raise

async def check_connection(db: PostgresDatabase) -> bool:
    """Comprehensive database connection health check."""
    try:
        async with db.get_session() as session:
            # Execute simple query to verify connection
            await session.execute("SELECT 1")
            return True

    except (PostgresError, exc.SQLAlchemyError) as e:
        logger.error(f"Database connection check failed: {str(e)}")
        return False

    except Exception as e:
        logger.error(f"Unexpected error during connection check: {str(e)}")
        return False