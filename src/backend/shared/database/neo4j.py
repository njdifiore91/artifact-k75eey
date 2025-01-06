import neo4j  # neo4j-driver v5.0+
import logging
from typing import Dict, List, Any, Optional, ContextManager
from contextlib import contextmanager
from datetime import datetime
import ssl
import time
from neo4j.exceptions import (
    ServiceUnavailable,
    SessionExpired,
    TransientError,
    DatabaseError
)

from shared.config.settings import Settings

# Constants for connection management
DEFAULT_MAX_POOL_SIZE = 50
DEFAULT_MAX_RETRY_TIME = 30  # seconds
DEFAULT_QUERY_TIMEOUT = 30  # seconds
MAX_RETRY_COUNT = 3

# Configure logger with security context
logger = logging.getLogger(__name__)

class Neo4jConnection:
    """
    Enterprise-grade Neo4j database connection manager with enhanced security,
    connection pooling, and comprehensive error handling.
    """

    def __init__(
        self,
        settings: Settings,
        pool_size: Optional[int] = None,
        retry_time: Optional[int] = None
    ) -> None:
        """
        Initialize Neo4j connection with secure configuration and connection pooling.

        Args:
            settings: Application settings instance
            pool_size: Maximum connection pool size
            retry_time: Maximum transaction retry time in seconds
        """
        self._logger = logger
        self._driver = None
        self._encrypted_connection = True
        self._connection_metrics = {
            'created_at': datetime.utcnow(),
            'total_queries': 0,
            'failed_queries': 0,
            'active_sessions': 0,
            'pool_metrics': {}
        }

        # Initialize connection parameters
        self.max_connection_pool_size = pool_size or DEFAULT_MAX_POOL_SIZE
        self.max_transaction_retry_time = retry_time or DEFAULT_MAX_RETRY_TIME

        try:
            # Configure SSL context for secure connections
            ssl_context = ssl.create_default_context(
                purpose=ssl.Purpose.SERVER_AUTH,
                cafile=settings.ssl_config.get('ca_certs')
            )
            ssl_context.verify_mode = ssl.CERT_REQUIRED
            ssl_context.minimum_version = ssl.TLSVersion.TLSv1_3

            # Initialize Neo4j driver with security settings
            self._driver = neo4j.GraphDatabase.driver(
                settings.neo4j_uri.get_secret_value(),
                auth=(
                    settings.neo4j_user.get_secret_value(),
                    settings.neo4j_password.get_secret_value()
                ),
                max_connection_pool_size=self.max_connection_pool_size,
                max_transaction_retry_time=self.max_transaction_retry_time,
                encrypted=self._encrypted_connection,
                ssl_context=ssl_context,
                connection_timeout=DEFAULT_QUERY_TIMEOUT,
                keep_alive=True
            )

            # Verify connection and encryption
            self._verify_connectivity()
            self._logger.info(
                "Neo4j connection established successfully with encryption and pooling"
            )

        except Exception as e:
            self._logger.error(f"Failed to initialize Neo4j connection: {str(e)}")
            raise

    def _verify_connectivity(self) -> None:
        """Verify database connectivity and encryption status."""
        try:
            self._driver.verify_connectivity()
            if not self._encrypted_connection:
                self._logger.warning("Connection is not encrypted!")
                raise ValueError("Encrypted connection required")
        except Exception as e:
            self._logger.error(f"Connectivity verification failed: {str(e)}")
            raise

    @contextmanager
    def get_session(
        self,
        write_access: bool = False,
        timeout: Optional[int] = None
    ) -> ContextManager[neo4j.Session]:
        """
        Create and manage a Neo4j session with automatic resource cleanup.

        Args:
            write_access: Whether session needs write access
            timeout: Session timeout in seconds

        Yields:
            Neo4j session object
        """
        session = None
        session_start = time.time()
        
        try:
            # Create session with appropriate access mode
            session = self._driver.session(
                access_mode=neo4j.WRITE_ACCESS if write_access else neo4j.READ_ACCESS,
                database="neo4j",
                fetch_size=1000,
                max_transaction_retry_time=timeout or DEFAULT_QUERY_TIMEOUT
            )
            
            self._connection_metrics['active_sessions'] += 1
            self._logger.debug(f"Created new session (write_access={write_access})")
            
            yield session

        except (ServiceUnavailable, SessionExpired) as e:
            self._logger.error(f"Session error: {str(e)}")
            self._connection_metrics['failed_queries'] += 1
            raise
        
        finally:
            if session:
                session.close()
                self._connection_metrics['active_sessions'] -= 1
                session_duration = time.time() - session_start
                self._logger.debug(
                    f"Session closed (duration={session_duration:.2f}s)"
                )

    def execute_query(
        self,
        query: str,
        parameters: Dict[str, Any],
        write: bool = False,
        retry_count: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Execute a Cypher query with comprehensive error handling and monitoring.

        Args:
            query: Cypher query string
            parameters: Query parameters
            write: Whether query requires write access
            retry_count: Number of retry attempts

        Returns:
            List of query results
        """
        if not query or not isinstance(query, str):
            raise ValueError("Invalid query")

        retries = retry_count or MAX_RETRY_COUNT
        last_error = None
        query_start = time.time()

        for attempt in range(retries):
            try:
                with self.get_session(write_access=write) as session:
                    result = session.run(query, parameters)
                    data = [record.data() for record in result]
                    
                    # Update metrics
                    self._connection_metrics['total_queries'] += 1
                    query_duration = time.time() - query_start
                    
                    self._logger.debug(
                        f"Query executed successfully "
                        f"(duration={query_duration:.2f}s, "
                        f"rows={len(data)})"
                    )
                    
                    return data

            except TransientError as e:
                last_error = e
                retry_delay = min(2 ** attempt, DEFAULT_MAX_RETRY_TIME)
                self._logger.warning(
                    f"Transient error, retrying in {retry_delay}s "
                    f"(attempt {attempt + 1}/{retries}): {str(e)}"
                )
                time.sleep(retry_delay)
                
            except DatabaseError as e:
                self._connection_metrics['failed_queries'] += 1
                self._logger.error(f"Database error: {str(e)}")
                raise
                
            except Exception as e:
                self._connection_metrics['failed_queries'] += 1
                self._logger.error(f"Unexpected error: {str(e)}")
                raise

        self._connection_metrics['failed_queries'] += 1
        raise last_error or Exception("Query failed after all retry attempts")

    def close(self) -> None:
        """
        Safely close database connection and cleanup resources.
        """
        try:
            if self._driver:
                self._logger.info(
                    "Closing Neo4j connection. "
                    f"Metrics: {self._connection_metrics}"
                )
                self._driver.close()
                self._driver = None
                self._connection_metrics.clear()
        except Exception as e:
            self._logger.error(f"Error closing Neo4j connection: {str(e)}")
            raise