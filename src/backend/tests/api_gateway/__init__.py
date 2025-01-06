"""
Initialization module for API Gateway test package that configures comprehensive test environment,
fixtures, security controls, and shared resources for API endpoint testing with performance
monitoring and SLA compliance.
"""

import pytest
from datetime import datetime, timedelta
from typing import Dict, Any, List
import logging
import os
from collections import defaultdict

# Import test configuration and fixtures
from ..conftest import (
    Settings,
    get_logger,
    TEST_METRICS
)

# Test environment constants
TEST_MARKERS = [
    "integration",  # Integration test marker
    "api",         # API endpoint test marker
    "artwork",     # Artwork-related test marker
    "graph",       # Graph-related test marker
    "security",    # Security test marker
    "performance"  # Performance test marker
]

# SLA compliance settings
TEST_TIMEOUT = 600  # 10 minutes maximum test execution time
PERFORMANCE_THRESHOLDS = {
    "api_response": 500,  # milliseconds
    "graph_generation": 5000,  # milliseconds
    "search_results": 1000  # milliseconds
}

# Test environment settings
TEST_ENV_SETTINGS = {
    "isolation": True,        # Test isolation flag
    "mock_services": True,    # Mock external services
    "security_validation": True  # Enable security validation
}

# Performance monitoring metrics
performance_metrics = defaultdict(list)

def pytest_configure(config: pytest.Config) -> None:
    """
    Configure pytest with comprehensive API Gateway test settings including markers,
    timeouts, security controls, and performance monitoring.

    Args:
        config: Pytest configuration object
    """
    # Register custom test markers
    for marker in TEST_MARKERS:
        config.addinivalue_line(
            "markers",
            f"{marker}: mark test as {marker} test"
        )

    # Configure test timeouts for SLA compliance
    config.addinivalue_line(
        "timeout",
        str(TEST_TIMEOUT)
    )

    # Configure test logging
    logger = get_logger(__name__)
    logger.setLevel(logging.DEBUG)

    # Initialize test metrics collection
    TEST_METRICS.update({
        "api_gateway_tests": {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "skipped": 0,
            "performance": defaultdict(list)
        }
    })

    # Configure test environment
    os.environ.update({
        "TEST_ENVIRONMENT": "true",
        "API_GATEWAY_TEST": "true",
        "MOCK_EXTERNAL_SERVICES": "true"
    })

    # Initialize security validation
    if TEST_ENV_SETTINGS["security_validation"]:
        config.addinivalue_line(
            "markers",
            "security_validation: enables comprehensive security validation"
        )

    # Configure test isolation
    if TEST_ENV_SETTINGS["isolation"]:
        config.addinivalue_line(
            "markers",
            "isolated: mark test as requiring isolation"
        )

    # Initialize performance monitoring
    config.addinivalue_line(
        "markers",
        "performance_threshold(threshold): set performance threshold in milliseconds"
    )

    # Register cleanup handlers
    config.add_cleanup(cleanup_test_environment)

    logger.info(
        "API Gateway test environment configured",
        extra={
            "markers": TEST_MARKERS,
            "timeout": TEST_TIMEOUT,
            "settings": TEST_ENV_SETTINGS
        }
    )

def cleanup_test_environment() -> None:
    """Cleanup test environment and resources after test execution."""
    logger = get_logger(__name__)
    
    try:
        # Clear test metrics
        performance_metrics.clear()
        
        # Reset environment variables
        test_env_vars = [
            "TEST_ENVIRONMENT",
            "API_GATEWAY_TEST",
            "MOCK_EXTERNAL_SERVICES"
        ]
        for var in test_env_vars:
            os.environ.pop(var, None)
            
        logger.info("Test environment cleanup completed successfully")
        
    except Exception as e:
        logger.error(f"Test environment cleanup failed: {str(e)}")
        raise

# Register pytest plugins
pytest_plugins = [
    "tests.conftest"  # Core test configuration and fixtures
]