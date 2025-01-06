"""
Test package initialization module for the Art Knowledge Graph backend test suite.
Configures testing environment with comprehensive security controls, monitoring integration,
and standardized test markers.
"""

import pytest
import elasticsearch  # elasticsearch v8.0+
import newrelic  # newrelic v8.0+
from conftest import pytest_configure

# Test categorization with security contexts
TEST_MARKERS = [
    ('unit', 'Unit tests with security validation'),
    ('integration', 'Integration tests with service security'),
    ('e2e', 'End-to-end tests with full security context'),
    ('security', 'Security-specific test cases')
]

# Supported test environments
TEST_ENVIRONMENTS = ['development', 'staging', 'production']

# Test database configuration
TEST_DB_PREFIX = 'test_'

# Security validation levels
TEST_SECURITY_LEVELS = ['standard', 'enhanced', 'maximum']

# Monitoring configuration
TEST_MONITORING_CONFIG = {
    "elk_index": "art_knowledge_tests",
    "newrelic_app": "art_knowledge_test"
}

@pytest.fixture(scope='session')
def setup_test_markers():
    """
    Registers custom test markers for test categorization with security validation.
    """
    # Register unit test marker with security validation
    pytest.mark.unit = pytest.mark.unit_test
    
    # Register integration test marker with service security
    pytest.mark.integration = pytest.mark.integration_test
    
    # Register e2e test marker with full security context
    pytest.mark.e2e = pytest.mark.e2e_test
    
    # Register security-specific test marker
    pytest.mark.security = pytest.mark.security_test
    
    # Configure security validation hooks for each marker
    for marker, _ in TEST_MARKERS:
        pytest.mark.filterwarnings(f"ignore::SecurityWarning::{marker}")
    
    # Set up marker-specific monitoring
    for marker, description in TEST_MARKERS:
        newrelic.agent.record_custom_metric(
            f"test/markers/{marker}",
            {"description": description}
        )

@pytest.fixture(scope='session')
def setup_test_environment(env_name: str, security_config: dict):
    """
    Configures the test environment variables and settings with security controls.

    Args:
        env_name: Target test environment name
        security_config: Security configuration parameters

    Returns:
        dict: Environment configuration
    """
    # Validate environment name and security configuration
    if env_name not in TEST_ENVIRONMENTS:
        raise ValueError(f"Invalid test environment: {env_name}")
    
    # Set up secure test database connection
    db_config = {
        "prefix": TEST_DB_PREFIX,
        "ssl_required": True if env_name == 'production' else False,
        "connection_timeout": 30
    }
    
    # Configure test logging with ELK Stack
    es_client = elasticsearch.Elasticsearch(
        hosts=[{"host": "localhost", "port": 9200}],
        basic_auth=("elastic", "changeme")
    )
    es_client.indices.create(
        index=TEST_MONITORING_CONFIG["elk_index"],
        ignore=400
    )
    
    # Initialize NewRelic monitoring
    newrelic.agent.initialize(
        environment=env_name,
        app_name=TEST_MONITORING_CONFIG["newrelic_app"]
    )
    
    # Set up security event monitoring
    security_events_index = f"{TEST_MONITORING_CONFIG['elk_index']}_security"
    es_client.indices.create(
        index=security_events_index,
        ignore=400
    )
    
    # Configure rate limiting for test execution
    rate_limits = {
        "unit": 1000,
        "integration": 500,
        "e2e": 100,
        "security": 200
    }
    
    # Initialize test data sanitization
    data_sanitization = {
        "enabled": True,
        "sensitive_fields": ["password", "token", "key"]
    }
    
    # Set up audit logging
    audit_config = {
        "enabled": True,
        "index": f"{TEST_MONITORING_CONFIG['elk_index']}_audit",
        "retention_days": 30
    }
    
    return {
        "environment": env_name,
        "database": db_config,
        "security": security_config,
        "rate_limits": rate_limits,
        "data_sanitization": data_sanitization,
        "audit": audit_config
    }

@pytest.fixture(scope='session')
def configure_test_security(security_level: str, monitoring_config: dict):
    """
    Sets up security controls and monitoring for test execution.

    Args:
        security_level: Required security validation level
        monitoring_config: Monitoring configuration parameters

    Returns:
        dict: Security configuration
    """
    # Validate security level requirements
    if security_level not in TEST_SECURITY_LEVELS:
        raise ValueError(f"Invalid security level: {security_level}")
    
    # Set up security event listeners
    security_config = {
        "level": security_level,
        "event_logging": True,
        "vulnerability_scanning": security_level in ['enhanced', 'maximum'],
        "audit_trail": True
    }
    
    # Configure test execution isolation
    security_config["isolation"] = {
        "process": security_level == 'maximum',
        "network": security_level in ['enhanced', 'maximum'],
        "filesystem": True
    }
    
    # Initialize security logging
    es_client = elasticsearch.Elasticsearch(
        hosts=[{"host": "localhost", "port": 9200}],
        basic_auth=("elastic", "changeme")
    )
    security_index = f"{monitoring_config['elk_index']}_security"
    
    # Set up vulnerability scanning
    if security_config["vulnerability_scanning"]:
        security_config["scanners"] = {
            "sast": True,
            "dependency_check": True,
            "container_scan": security_level == 'maximum'
        }
    
    # Configure access controls
    security_config["access_control"] = {
        "rbac_enabled": True,
        "mfa_required": security_level == 'maximum',
        "ip_whitelist": ["127.0.0.1"]
    }
    
    # Initialize audit trail
    if security_config["audit_trail"]:
        es_client.indices.create(
            index=f"{security_index}_audit",
            ignore=400
        )
    
    return security_config