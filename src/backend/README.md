# Art Knowledge Graph Backend

Enterprise-grade backend system for art exploration and analysis through interactive knowledge graphs.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Python](https://img.shields.io/badge/python-3.11+-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Architecture Overview

The backend consists of four main microservices:

- **API Gateway** - Request routing, authentication, and rate limiting
- **Auth Service** - User management and JWT-based authentication
- **Data Processor** - Art analysis and metadata extraction
- **Graph Service** - Knowledge graph management and querying

### Technology Stack

- **Runtime**: Python 3.11+
- **Web Framework**: FastAPI 0.100+
- **ORM**: SQLAlchemy 2.0+
- **Graph Database**: Neo4j 5.0+
- **Cache**: Redis 7.0+
- **RDBMS**: PostgreSQL 15+
- **Container**: Docker 20.10+
- **Monitoring**: Prometheus/Grafana

## Getting Started

### Prerequisites

- Python 3.11 or higher
- Docker 20.10 or higher
- Docker Compose 2.0 or higher
- Poetry 1.4 or higher
- Git

### Installation

```bash
# Clone repository
git clone https://github.com/org/art-knowledge-graph.git
cd art-knowledge-graph/backend

# Install dependencies
poetry install

# Setup pre-commit hooks
poetry run pre-commit install

# Copy and configure environment
cp .env.example .env
editor .env
```

### Development Setup

```bash
# Start development services
docker-compose -f docker-compose.dev.yml up -d

# Start development server with hot-reload
poetry run start-dev

# Run tests with coverage
poetry run test

# Run linting and type checking
poetry run lint
poetry run type-check
```

## Development

### Code Style

We follow strict coding standards to maintain code quality:

- Black (line-length: 88)
- isort for import sorting
- flake8 for linting
- mypy for static type checking
- pre-commit hooks for automated checks

### Testing

- Minimum 90% test coverage required
- Unit tests with pytest
- Integration tests for API endpoints
- Performance tests for graph operations
- Run tests: `poetry run test`

### API Documentation

- OpenAPI/Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- API versioning through URL prefixing
- Comprehensive request/response examples

### Security

- JWT-based authentication
- Role-based access control (RBAC)
- Rate limiting per endpoint
- Input validation and sanitization
- Secrets management via AWS Secrets Manager
- Regular security audits and updates

## Deployment

### Docker Deployment

```bash
# Build and start production services
docker-compose up -d --build

# Scale services
docker-compose up -d --scale api=3 --scale worker=5

# View logs
docker-compose logs -f

# Monitor metrics
docker-compose exec prometheus curl localhost:9090/metrics
```

### Environment Variables

Required environment variables (see .env.example):

- `APP_ENV`: Environment (development/staging/production)
- `SECRET_KEY`: JWT signing key
- `DATABASE_URL`: PostgreSQL connection string
- `NEO4J_URI`: Neo4j connection URI
- `REDIS_URL`: Redis connection string
- `AWS_ACCESS_KEY_ID`: AWS credentials
- `AWS_SECRET_ACCESS_KEY`: AWS credentials
- `S3_BUCKET`: Artwork storage bucket

### Monitoring

- Prometheus metrics at /metrics
- Grafana dashboards for:
  - Service health
  - Request latency
  - Error rates
  - Resource usage
  - Graph performance
- Log aggregation with ELK stack
- Alert configuration via AlertManager

### Performance

Resource Requirements:

- API Service: 1 vCPU, 2GB RAM minimum per instance
- Graph Service: 2 vCPU, 4GB RAM minimum per instance
- Auth Service: 0.5 vCPU, 1GB RAM minimum per instance
- Worker: 1 vCPU, 2GB RAM minimum per instance

Scaling Guidelines:

- Horizontal scaling for API and worker services
- Vertical scaling for database services
- Cache warming for frequent queries
- Connection pooling for databases

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - see LICENSE file for details

## Support

For support, please contact the Art Knowledge Graph team or create an issue in the repository.