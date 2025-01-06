#!/bin/bash

# Enhanced test execution script for Art Knowledge Graph backend services
# Version: 1.0.0
# Dependencies:
# - pytest v7.0+
# - coverage v7.0+
# - pytest-xdist v3.0+
# - pytest-timeout v2.0+

set -e  # Exit on error
set -u  # Exit on undefined variables

# Configuration
export PYTHONPATH="${PYTHONPATH}:${PWD}/src/backend"
export TEST_ENV="test"
export COVERAGE_MIN=90
export TEST_TIMEOUT=600  # 10 minutes SLA
export PARALLEL_WORKERS=4
export SECURITY_LEVEL="high"
export MONITORING_ENABLED="true"

# Logging setup
LOG_DIR="logs/tests"
mkdir -p "${LOG_DIR}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${LOG_DIR}/test_run_${TIMESTAMP}.log"

# Utility functions
log() {
    local level=$1
    local message=$2
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [${level}] ${message}" | tee -a "${LOG_FILE}"
}

setup_test_env() {
    log "INFO" "Setting up test environment..."
    
    # Create test directories
    mkdir -p "${LOG_DIR}/reports"
    mkdir -p "${LOG_DIR}/coverage"
    
    # Initialize test databases
    export NEO4J_TEST_URI="bolt://localhost:7687"
    export REDIS_TEST_URI="redis://localhost:6379/1"
    
    # Validate security configuration
    if [[ "${SECURITY_LEVEL}" == "high" ]]; then
        log "INFO" "Enabling enhanced security validation"
        export PYTEST_ADDOPTS="--strict-markers -v"
    fi
    
    # Initialize monitoring
    if [[ "${MONITORING_ENABLED}" == "true" ]]; then
        log "INFO" "Enabling test performance monitoring"
        mkdir -p "${LOG_DIR}/metrics"
    fi
}

run_unit_tests() {
    log "INFO" "Running unit tests with security validation..."
    
    pytest \
        --junitxml="${LOG_DIR}/reports/unit_tests.xml" \
        --cov=src/backend \
        --cov-report=html:"${LOG_DIR}/coverage" \
        --cov-report=term-missing \
        -n "${PARALLEL_WORKERS}" \
        --timeout="${TEST_TIMEOUT}" \
        --durations=10 \
        tests/unit || return 1
        
    log "INFO" "Unit tests completed"
}

run_integration_tests() {
    log "INFO" "Running integration tests..."
    
    # Start required services
    docker-compose -f tests/docker-compose.test.yml up -d
    
    pytest \
        --junitxml="${LOG_DIR}/reports/integration_tests.xml" \
        --cov=src/backend \
        --cov-append \
        -n "${PARALLEL_WORKERS}" \
        --timeout="${TEST_TIMEOUT}" \
        tests/integration || return 1
        
    # Cleanup services
    docker-compose -f tests/docker-compose.test.yml down
    
    log "INFO" "Integration tests completed"
}

run_api_tests() {
    log "INFO" "Running API tests..."
    
    pytest \
        --junitxml="${LOG_DIR}/reports/api_tests.xml" \
        --cov=src/backend \
        --cov-append \
        -n "${PARALLEL_WORKERS}" \
        --timeout="${TEST_TIMEOUT}" \
        tests/api || return 1
        
    log "INFO" "API tests completed"
}

check_coverage() {
    log "INFO" "Checking test coverage..."
    
    coverage report --fail-under="${COVERAGE_MIN}"
    coverage html -d "${LOG_DIR}/coverage"
    
    # Generate coverage badge
    coverage-badge -o "${LOG_DIR}/coverage/coverage.svg"
    
    log "INFO" "Coverage check completed"
}

cleanup_test_env() {
    log "INFO" "Cleaning up test environment..."
    
    # Archive test results
    tar -czf "${LOG_DIR}/test_results_${TIMESTAMP}.tar.gz" \
        "${LOG_DIR}/reports" \
        "${LOG_DIR}/coverage" \
        "${LOG_DIR}/metrics"
    
    # Cleanup temporary files
    find . -type f -name "*.pyc" -delete
    find . -type d -name "__pycache__" -exec rm -r {} +
    
    log "INFO" "Cleanup completed"
}

# Main execution
main() {
    local start_time=$(date +%s)
    local exit_code=0
    
    log "INFO" "Starting test execution..."
    
    # Setup phase
    setup_test_env || {
        log "ERROR" "Test environment setup failed"
        exit 1
    }
    
    # Test execution phase
    {
        run_unit_tests && \
        run_integration_tests && \
        run_api_tests && \
        check_coverage
    } || {
        exit_code=1
        log "ERROR" "Test execution failed"
    }
    
    # Cleanup phase
    cleanup_test_env
    
    # Report execution time
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    log "INFO" "Test execution completed in ${duration} seconds with exit code ${exit_code}"
    
    return ${exit_code}
}

# Execute main function
main "$@"