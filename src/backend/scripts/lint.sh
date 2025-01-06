#!/usr/bin/env bash

# Art Knowledge Graph Backend Linting Script
# Version: 1.0.0
# Executes code quality checks using multiple Python linting tools with parallel execution support

set -euo pipefail
IFS=$'\n\t'

# Script constants and environment setup
readonly SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
readonly PROJECT_ROOT="$(realpath "${SCRIPT_DIR}/..")"
readonly LINT_DIR="${PROJECT_ROOT}/.lint"
readonly TEMP_DIR="${LINT_DIR}/temp"
readonly LOG_FILE="${LINT_DIR}/lint.log"
readonly LOCK_FILE="${LINT_DIR}/.lint.lock"
readonly MIN_POETRY_VERSION="1.5.0"

# Default configuration
VERBOSE=false
PARALLEL=true
CI_MODE=$([ -n "${CI:-}" ] && echo true || echo false)
FAILED_CHECKS=()

# Utility functions
log() {
    local level=$1
    shift
    local message=$*
    local timestamp=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
    echo "[${timestamp}] [${level}] ${message}" | tee -a "${LOG_FILE}"
}

error() {
    log "ERROR" "$@"
    return 1
}

info() {
    log "INFO" "$@"
}

debug() {
    if [[ "${VERBOSE}" == "true" ]]; then
        log "DEBUG" "$@"
    fi
}

# Environment validation
check_poetry_installation() {
    if ! command -v poetry &> /dev/null; then
        error "Poetry is not installed. Please install Poetry >= ${MIN_POETRY_VERSION}"
        return 1
    fi

    local version
    version=$(poetry --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
    if ! printf '%s\n%s\n' "${MIN_POETRY_VERSION}" "${version}" | sort -V -C; then
        error "Poetry version ${version} is less than required version ${MIN_POETRY_VERSION}"
        return 1
    }

    if [[ ! -f "${PROJECT_ROOT}/pyproject.toml" ]]; then
        error "pyproject.toml not found in ${PROJECT_ROOT}"
        return 1
    }

    info "Poetry installation verified (version ${version})"
    return 0
}

setup_environment() {
    # Create necessary directories
    mkdir -p "${LINT_DIR}" "${TEMP_DIR}"
    
    # Initialize log file
    : > "${LOG_FILE}"
    
    # Set up lock file
    if [[ -f "${LOCK_FILE}" ]]; then
        error "Another lint process is running. If this is incorrect, remove ${LOCK_FILE}"
        return 1
    fi
    touch "${LOCK_FILE}"
    
    info "Environment setup completed"
    return 0
}

cleanup() {
    local exit_code=$?
    
    # Remove temporary files and lock file
    rm -rf "${TEMP_DIR}" "${LOCK_FILE}"
    
    # Archive logs if in CI mode
    if [[ "${CI_MODE}" == "true" ]]; then
        local archive_name="lint-$(date +%Y%m%d_%H%M%S).log"
        mv "${LOG_FILE}" "${LINT_DIR}/${archive_name}"
    fi
    
    info "Cleanup completed (exit code: ${exit_code})"
    exit "${exit_code}"
}

run_linter() {
    local name=$1
    local cmd=$2
    local output_file="${TEMP_DIR}/${name}.out"
    local start_time=$(date +%s)
    
    info "Starting ${name} check..."
    if ! eval "${cmd}" > "${output_file}" 2>&1; then
        FAILED_CHECKS+=("${name}")
        error "${name} check failed"
        cat "${output_file}"
        return 1
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    info "${name} check completed in ${duration}s"
    return 0
}

run_linters() {
    local exit_code=0
    
    # Define linting commands
    declare -A linters=(
        ["black"]="poetry run black --check ${PROJECT_ROOT}/art_knowledge_graph"
        ["isort"]="poetry run isort --check-only ${PROJECT_ROOT}/art_knowledge_graph"
        ["flake8"]="poetry run flake8 ${PROJECT_ROOT}/art_knowledge_graph"
        ["mypy"]="poetry run mypy ${PROJECT_ROOT}/art_knowledge_graph"
    )
    
    if [[ "${PARALLEL}" == "true" ]]; then
        # Run linters in parallel
        for name in "${!linters[@]}"; do
            run_linter "${name}" "${linters[${name}]}" &
        done
        wait
    else
        # Run linters sequentially
        for name in "${!linters[@]}"; do
            run_linter "${name}" "${linters[${name}]}" || exit_code=1
        done
    fi
    
    # Generate summary
    if [[ ${#FAILED_CHECKS[@]} -gt 0 ]]; then
        error "The following checks failed: ${FAILED_CHECKS[*]}"
        exit_code=1
    else
        info "All checks passed successfully"
    fi
    
    return "${exit_code}"
}

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --verbose)
                VERBOSE=true
                shift
                ;;
            --no-parallel)
                PARALLEL=false
                shift
                ;;
            --help)
                echo "Usage: $0 [--verbose] [--no-parallel]"
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Set up trap for cleanup
    trap cleanup EXIT
    
    # Initialize environment
    info "Starting lint checks..."
    check_poetry_installation || exit 1
    setup_environment || exit 1
    
    # Run linting checks
    if ! run_linters; then
        error "Lint checks failed"
        exit 1
    fi
    
    info "All lint checks completed successfully"
    exit 0
}

# Execute main function
main "$@"