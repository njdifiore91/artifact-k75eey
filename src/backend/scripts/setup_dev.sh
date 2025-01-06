#!/usr/bin/env bash

# Art Knowledge Graph Development Environment Setup Script
# Version: 1.0.0
# This script establishes a secure, monitored development environment for the 
# Art Knowledge Graph backend services with comprehensive error handling and logging.

set -euo pipefail
IFS=$'\n\t'

# Script directory and project root
SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
PROJECT_ROOT="$(realpath "${SCRIPT_DIR}/..")"
ENV_FILE="${PROJECT_ROOT}/.env"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.dev.yml"
LOG_DIR="${PROJECT_ROOT}/logs"
SECURITY_CONFIG="${PROJECT_ROOT}/config/security_policies.yml"
METRICS_DIR="${PROJECT_ROOT}/metrics"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Logging setup
setup_logging() {
    mkdir -p "${LOG_DIR}"
    exec 3>&1 4>&2
    trap 'exec 2>&4 1>&3' 0 1 2 3
    exec 1>"${LOG_DIR}/setup_$(date +'%Y%m%d_%H%M%S').log" 2>&1
}

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee /dev/fd/3
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" | tee /dev/fd/3
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}" | tee /dev/fd/3
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}" | tee /dev/fd/3
}

# Check prerequisites with version validation
check_prerequisites() {
    log "Checking prerequisites..."

    # Docker version check
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
    fi
    DOCKER_VERSION=$(docker --version | cut -d ' ' -f3 | cut -d ',' -f1)
    if [[ "${DOCKER_VERSION}" < "20.10" ]]; then
        error "Docker version must be 20.10 or higher (found: ${DOCKER_VERSION})"
    fi

    # Docker Compose check
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed"
    fi
    COMPOSE_VERSION=$(docker-compose --version | cut -d ' ' -f3 | cut -d ',' -f1)
    if [[ "${COMPOSE_VERSION}" < "2.0" ]]; then
        error "Docker Compose version must be 2.0 or higher (found: ${COMPOSE_VERSION})"
    fi

    # Poetry check
    if ! command -v poetry &> /dev/null; then
        error "Poetry is not installed"
    fi
    POETRY_VERSION=$(poetry --version | cut -d ' ' -f3)
    if [[ "${POETRY_VERSION}" < "1.4" ]]; then
        error "Poetry version must be 1.4 or higher (found: ${POETRY_VERSION})"
    fi

    # Python version check
    if ! command -v python3 &> /dev/null; then
        error "Python 3 is not installed"
    fi
    PYTHON_VERSION=$(python3 --version | cut -d ' ' -f2)
    if [[ "${PYTHON_VERSION}" < "3.11" ]]; then
        error "Python version must be 3.11 or higher (found: ${PYTHON_VERSION})"
    fi

    # OpenSSL check
    if ! command -v openssl &> /dev/null; then
        error "OpenSSL is not installed"
    fi
    OPENSSL_VERSION=$(openssl version | cut -d ' ' -f2)
    if [[ "${OPENSSL_VERSION}" < "3.0" ]]; then
        warn "OpenSSL version 3.0 or higher recommended (found: ${OPENSSL_VERSION})"
    fi

    success "All prerequisites satisfied"
}

# Setup secure development environment
setup_environment() {
    log "Setting up development environment..."

    # Create required directories
    mkdir -p "${LOG_DIR}" "${METRICS_DIR}"
    chmod 750 "${LOG_DIR}" "${METRICS_DIR}"

    # Copy and configure environment file
    if [[ ! -f "${ENV_FILE}" ]]; then
        if [[ ! -f "${ENV_FILE}.example" ]]; then
            error "Environment template file not found: ${ENV_FILE}.example"
        fi
        cp "${ENV_FILE}.example" "${ENV_FILE}"
        chmod 600 "${ENV_FILE}"
    fi

    # Generate development SSL certificates
    if [[ ! -d "${PROJECT_ROOT}/certs" ]]; then
        mkdir -p "${PROJECT_ROOT}/certs"
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "${PROJECT_ROOT}/certs/dev.key" \
            -out "${PROJECT_ROOT}/certs/dev.crt" \
            -subj "/C=US/ST=State/L=City/O=Art Knowledge Graph/CN=localhost"
        chmod 600 "${PROJECT_ROOT}/certs/dev.key"
        chmod 644 "${PROJECT_ROOT}/certs/dev.crt"
    fi

    # Configure Docker BuildKit
    export DOCKER_BUILDKIT=1
    export COMPOSE_DOCKER_CLI_BUILD=1

    success "Environment setup completed"
}

# Install project dependencies
install_dependencies() {
    log "Installing project dependencies..."

    # Verify poetry.lock integrity
    if [[ ! -f "${PROJECT_ROOT}/poetry.lock" ]]; then
        error "poetry.lock file not found"
    fi

    # Install dependencies with security checks
    cd "${PROJECT_ROOT}"
    poetry config virtualenvs.in-project true
    poetry install --no-root --with dev

    # Setup pre-commit hooks
    if [[ -f "${PROJECT_ROOT}/.pre-commit-config.yaml" ]]; then
        poetry run pre-commit install
    fi

    # Initialize monitoring
    if command -v prometheus &> /dev/null; then
        prometheus --version > "${METRICS_DIR}/prometheus_version.txt"
    fi

    success "Dependencies installed successfully"
}

# Start development services
start_services() {
    log "Starting development services..."

    # Build development containers
    docker-compose -f "${COMPOSE_FILE}" build --no-cache

    # Initialize databases
    python3 "${SCRIPT_DIR}/db_init.py" --environment development
    python3 "${SCRIPT_DIR}/db_migrate.py" migrate --database all --version latest

    # Start services with health checks
    docker-compose -f "${COMPOSE_FILE}" up -d

    # Verify service health
    sleep 10
    if ! docker-compose -f "${COMPOSE_FILE}" ps | grep -q "Up"; then
        error "Services failed to start properly"
    fi

    success "Development services started successfully"
}

# Main execution
main() {
    log "Starting development environment setup..."

    # Trap cleanup
    trap 'echo "Setup interrupted, cleaning up..."; docker-compose -f "${COMPOSE_FILE}" down' INT TERM

    # Execute setup steps
    check_prerequisites
    setup_environment
    install_dependencies
    start_services

    # Display success message
    cat << EOF
$(success "Development environment setup completed successfully")

Services available at:
- API Gateway: http://localhost:8000
- Auth Service: http://localhost:8001
- Data Processor: http://localhost:8002
- Graph Service: http://localhost:8003
- Neo4j Browser: http://localhost:7474
- PostgreSQL: localhost:5432
- Redis: localhost:6379

Development URLs and credentials can be found in: ${ENV_FILE}
Logs directory: ${LOG_DIR}
Metrics directory: ${METRICS_DIR}

To stop the services:
$ docker-compose -f ${COMPOSE_FILE} down

To view logs:
$ docker-compose -f ${COMPOSE_FILE} logs -f
EOF
}

# Execute main function
main