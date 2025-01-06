"""
Database initialization module providing unified access to all database clients
(Neo4j, PostgreSQL, Redis) with enhanced security, monitoring, and error handling
capabilities for the Art Knowledge Graph backend services.
"""

import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import ssl
import asyncio
from dataclasses import dataclass, field

from shared.database.neo4j import Neo4jConnection
from shared.database.postgres import PostgresDatabase
from shared.database.redis import RedisClient
from shared.config.settings import Settings

# Configure module logger
logger = logging.getLogger(__name__)

# Default security configuration
SECURITY_DEFAULTS = {
    "ssl_verify_mode": ssl.CERT_REQUIRED,
    "min_tls_version": ssl.TLSVersion.TLSv1_3,
    "connection_timeout": 30,
    "max_retries": 3,
    "retry_delay": 5
}

# Default monitoring configuration
MONITORING_DEFAULTS = {
    "metrics_enabled": True,
    "health_check_interval": 60,
    "connection_threshold": 0.8,
    "performance_threshold": 1000
}

@dataclass
class CircuitBreaker:
    """Circuit breaker for database connections."""
    failure_threshold: int = 5
    reset_timeout: int = 60
    failures: int = 0
    is_open: bool = False
    last_failure: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def record_failure(self) -> None:
        """Record a failure and potentially open the circuit."""
        self.failures += 1
        self.last_failure = datetime.now(timezone.utc)
        if self.failures >= self.failure_threshold:
            self.is_open = True

    def record_success(self) -> None:
        """Record a success and reset the circuit."""
        self.failures = 0
        self.is_open = False

class DatabaseManager:
    """
    Enhanced singleton class managing all database connections with comprehensive
    security, monitoring, and error handling capabilities.
    """
    _instance = None
    _initialized = False

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, settings: Settings, 
                 security_config: Optional[Dict[str, Any]] = None,
                 monitoring_config: Optional[Dict[str, Any]] = None) -> None:
        """Initialize database connections with enhanced security and monitoring."""
        if self._initialized:
            return

        self._settings = settings
        self._logger = logger
        self._neo4j: Optional[Neo4jConnection] = None
        self._postgres: Optional[PostgresDatabase] = None
        self._redis: Optional[RedisClient] = None

        # Initialize configurations
        self._security_config = {**SECURITY_DEFAULTS, **(security_config or {})}
        self._monitoring_config = {**MONITORING_DEFAULTS, **(monitoring_config or {})}

        # Initialize monitoring and health check
        self._metrics: Dict[str, Any] = {
            "connections": {"neo4j": 0, "postgres": 0, "redis": 0},
            "operations": {"reads": 0, "writes": 0, "errors": 0},
            "performance": {"latency": [], "throughput": []},
            "last_health_check": None
        }
        
        self._health_status = {
            "neo4j": False,
            "postgres": False,
            "redis": False
        }

        # Initialize circuit breakers
        self._circuit_breakers = {
            "neo4j": CircuitBreaker(),
            "postgres": CircuitBreaker(),
            "redis": CircuitBreaker()
        }

        self._initialized = True

    async def initialize(self) -> bool:
        """Initialize all database connections with enhanced security and monitoring."""
        try:
            # Initialize Neo4j connection
            self._neo4j = Neo4jConnection(
                self._settings,
                pool_size=self._settings.postgres_pool_size
            )

            # Initialize PostgreSQL connection
            self._postgres = PostgresDatabase(self._settings)
            await self._postgres.initialize()

            # Initialize Redis connection
            self._redis = RedisClient(self._settings)

            # Start health monitoring
            asyncio.create_task(self._monitor_health())

            self._logger.info("All database connections initialized successfully")
            return True

        except Exception as e:
            self._logger.error(f"Database initialization failed: {str(e)}")
            return False

    async def close(self) -> None:
        """Gracefully close all database connections with cleanup."""
        try:
            # Close Neo4j connection
            if self._neo4j:
                self._neo4j.close()
                self._neo4j = None

            # Close PostgreSQL connection
            if self._postgres:
                await self._postgres.close()
                self._postgres = None

            # Close Redis connection
            if self._redis:
                await self._redis.close()
                self._redis = None

            self._logger.info("All database connections closed successfully")

        except Exception as e:
            self._logger.error(f"Error during database cleanup: {str(e)}")
            raise

    def get_neo4j(self) -> Neo4jConnection:
        """Get Neo4j connection with circuit breaker protection."""
        if not self._neo4j:
            raise RuntimeError("Neo4j connection not initialized")
        
        circuit_breaker = self._circuit_breakers["neo4j"]
        if circuit_breaker.is_open:
            raise ConnectionError("Neo4j circuit breaker is open")
        
        return self._neo4j

    def get_postgres(self) -> PostgresDatabase:
        """Get PostgreSQL connection with circuit breaker protection."""
        if not self._postgres:
            raise RuntimeError("PostgreSQL connection not initialized")
        
        circuit_breaker = self._circuit_breakers["postgres"]
        if circuit_breaker.is_open:
            raise ConnectionError("PostgreSQL circuit breaker is open")
        
        return self._postgres

    def get_redis(self) -> RedisClient:
        """Get Redis connection with circuit breaker protection."""
        if not self._redis:
            raise RuntimeError("Redis connection not initialized")
        
        circuit_breaker = self._circuit_breakers["redis"]
        if circuit_breaker.is_open:
            raise ConnectionError("Redis circuit breaker is open")
        
        return self._redis

    async def _monitor_health(self) -> None:
        """Periodic health monitoring of database connections."""
        while True:
            try:
                # Check Neo4j health
                self._health_status["neo4j"] = bool(self._neo4j and 
                    self._neo4j._driver.verify_connectivity())

                # Check PostgreSQL health
                self._health_status["postgres"] = bool(self._postgres and 
                    await self._postgres.check_connection())

                # Check Redis health
                self._health_status["redis"] = bool(self._redis and 
                    await self._redis.get("health_check"))

                self._metrics["last_health_check"] = datetime.now(timezone.utc)
                
                # Log health status
                self._logger.info(
                    "Database health check completed",
                    extra={"health_status": self._health_status}
                )

            except Exception as e:
                self._logger.error(f"Health check failed: {str(e)}")

            await asyncio.sleep(self._monitoring_config["health_check_interval"])

    def get_metrics(self) -> Dict[str, Any]:
        """Get comprehensive database metrics."""
        return {
            "metrics": self._metrics,
            "health_status": self._health_status,
            "circuit_breakers": {
                name: {
                    "failures": cb.failures,
                    "is_open": cb.is_open,
                    "last_failure": cb.last_failure
                }
                for name, cb in self._circuit_breakers.items()
            }
        }