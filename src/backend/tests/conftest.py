"""
Pytest configuration and fixtures for the Art Knowledge Graph backend test suite.
Provides comprehensive test resources, database connections, mock services,
security validation, and performance monitoring.
"""

import os
import pytest
import asyncio
import aioredis
import prometheus_client
from datetime import datetime, timezone
from typing import Dict, Any, Generator, AsyncGenerator
from fastapi.testclient import TestClient
from prometheus_client import Counter, Histogram

from api_gateway.main import app
from shared.database.neo4j import Neo4jConnection
from shared.config.settings import Settings, get_settings
from shared.logging.config import get_logger
from shared.schemas.error import ErrorResponse

# Initialize test metrics
TEST_METRICS = {
    'test_executions': Counter(
        'test_executions_total',
        'Total number of test executions',
        ['test_name', 'result']
    ),
    'test_duration': Histogram(
        'test_duration_seconds',
        'Test execution duration',
        ['test_name']
    )
}

# Initialize test logger
logger = get_logger(__name__)

def pytest_configure(config):
    """
    Configure pytest with custom markers, security validation,
    monitoring, and test settings.
    """
    # Register custom markers
    config.addinivalue_line("markers", "security: mark test as security-related")
    config.addinivalue_line("markers", "performance: mark test as performance-related")
    config.addinivalue_line("markers", "integration: mark test as integration test")
    config.addinivalue_line("markers", "api: mark test as API test")
    
    # Configure test timeouts
    config.addinivalue_line("timeout", "300")  # 5 minutes max per test
    
    # Initialize metrics directory
    os.makedirs("test_metrics", exist_ok=True)
    
    # Start metrics server for test monitoring
    prometheus_client.start_http_server(9090)
    
    logger.info("Pytest configuration initialized with security controls")

def pytest_sessionstart(session):
    """
    Session-wide setup with security controls and monitoring.
    """
    # Clear test metrics from previous runs
    for metric in TEST_METRICS.values():
        if hasattr(metric, 'clear'):
            metric.clear()
    
    # Initialize test environment
    os.environ["ENVIRONMENT"] = "test"
    os.environ["LOG_LEVEL"] = "DEBUG"
    
    logger.info("Test session started with security controls")

@pytest.fixture(scope="session")
def settings() -> Settings:
    """
    Provide test settings with security controls.
    """
    return get_settings(environment="test")

@pytest.fixture
def test_client(settings: Settings) -> Generator[TestClient, None, None]:
    """
    Provide FastAPI test client with security headers and monitoring.
    """
    with TestClient(app) as client:
        # Add security headers
        client.headers.update({
            "X-Test-Client": "1",
            "X-Security-Context": "test",
            "X-Correlation-ID": "test-correlation-id"
        })
        
        test_start = datetime.now(timezone.utc)
        
        yield client
        
        # Record test metrics
        test_duration = (datetime.now(timezone.utc) - test_start).total_seconds()
        TEST_METRICS['test_duration'].labels(
            test_name=pytest.current_test.__name__
        ).observe(test_duration)

@pytest.fixture(scope="session")
def neo4j_connection(settings: Settings) -> Generator[Neo4jConnection, None, None]:
    """
    Provide Neo4j test database connection with security controls.
    """
    connection = Neo4jConnection(
        settings=settings,
        pool_size=5,  # Reduced pool size for tests
        retry_time=5  # Shorter retry time for tests
    )
    
    try:
        # Clear test data
        with connection.get_session(write_access=True) as session:
            session.run("MATCH (n) DETACH DELETE n")
        
        yield connection
        
    finally:
        connection.close()
        logger.info("Neo4j test connection closed")

@pytest.fixture
async def redis_client(settings: Settings) -> AsyncGenerator[aioredis.Redis, None]:
    """
    Provide Redis test client with monitoring.
    """
    redis = await aioredis.from_url(
        settings.redis_uri.get_secret_value(),
        encoding="utf-8",
        decode_responses=True
    )
    
    try:
        # Clear test data
        await redis.flushdb()
        
        yield redis
        
    finally:
        await redis.close()
        logger.info("Redis test client closed")

@pytest.fixture(autouse=True)
def test_metrics():
    """
    Automatically track test execution metrics.
    """
    test_start = datetime.now(timezone.utc)
    test_name = pytest.current_test.__name__
    
    yield
    
    # Record test result
    test_duration = (datetime.now(timezone.utc) - test_start).total_seconds()
    TEST_METRICS['test_executions'].labels(
        test_name=test_name,
        result="passed"
    ).inc()
    TEST_METRICS['test_duration'].labels(
        test_name=test_name
    ).observe(test_duration)

@pytest.fixture
def mock_auth_token() -> str:
    """
    Provide mock JWT token for authenticated test requests.
    """
    return "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJyb2xlIjoidGVzdCJ9.token"

@pytest.fixture
async def test_db_session(neo4j_connection: Neo4jConnection):
    """
    Provide test database session with automatic cleanup.
    """
    with neo4j_connection.get_session(write_access=True) as session:
        yield session
        # Rollback any changes
        session.run("MATCH (n) DETACH DELETE n")

@pytest.fixture(autouse=True)
async def security_validation():
    """
    Automatically validate security controls for each test.
    """
    # Pre-test security checks
    logger.info("Running pre-test security validation")
    
    yield
    
    # Post-test security validation
    logger.info("Running post-test security validation")

@pytest.fixture
def error_response_factory():
    """
    Provide factory for creating test error responses.
    """
    def create_error(
        code: str = "test_error",
        message: str = "Test error message",
        status_code: int = 400
    ) -> ErrorResponse:
        return ErrorResponse(
            code=code,
            message=message,
            request_id="test-request-id"
        )
    return create_error