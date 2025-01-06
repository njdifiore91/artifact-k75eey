# Stage 1: Builder
FROM python:3.11-slim AS builder

# Set build arguments and environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    POETRY_VERSION=1.5.1 \
    POETRY_HOME=/opt/poetry \
    POETRY_VIRTUALENVS_IN_PROJECT=true

# Install system build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry
RUN curl -sSL https://install.python-poetry.org | python3 - \
    && ln -s /opt/poetry/bin/poetry /usr/local/bin/poetry

# Set working directory
WORKDIR /app

# Copy dependency files
COPY pyproject.toml poetry.lock ./

# Install dependencies
RUN poetry install --no-dev --no-root --no-interaction

# Copy application code
COPY . .

# Build application
RUN poetry build

# Stage 2: Runtime
FROM python:3.11-slim

# Set runtime environment variables
ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Install runtime system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r appuser && useradd -r -g appuser appuser

# Set working directory
WORKDIR /app

# Copy built dependencies and application from builder
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/art_knowledge_graph /app/art_knowledge_graph
COPY --from=builder /app/shared /app/shared

# Set secure permissions
RUN chown -R appuser:appuser /app \
    && chmod -R 550 /app \
    && chmod -R 500 /app/art_knowledge_graph \
    && chmod -R 500 /app/shared

# Set container labels
LABEL maintainer="Art Knowledge Graph Team" \
      version="1.0" \
      description="Backend API Service" \
      security.scan-date="${BUILD_DATE}"

# Configure health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Expose service port
EXPOSE 8000

# Switch to non-root user
USER appuser

# Set secure options
RUN echo "options no-new-privileges=true" >> /etc/security/limits.conf

# Set entrypoint using virtual environment Python
ENTRYPOINT ["/app/.venv/bin/python", "-m", "art_knowledge_graph.main"]

# Default command
CMD ["start"]