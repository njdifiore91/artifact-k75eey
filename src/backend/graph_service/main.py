"""
Main entry point for the Art Knowledge Graph Service microservice providing secure,
performance-optimized graph operations with comprehensive monitoring and caching.
"""

import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Depends, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from prometheus_client import Counter, Histogram, generate_latest
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode
from circuit_breaker import circuit
from redis import Redis

from config import GraphServiceSettings
from services.neo4j import GraphDatabaseService
from shared.database.neo4j import Neo4jConnection

# Initialize FastAPI application with security headers
app = FastAPI(
    title="Art Knowledge Graph Service",
    version="1.0.0",
    docs_url=None,  # Disable docs in production
    redoc_url=None
)

# Initialize settings and services
settings = GraphServiceSettings()
logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)

# Initialize metrics
GRAPH_GENERATION_TIME = Histogram(
    'graph_generation_seconds',
    'Time spent generating knowledge graphs',
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0]
)
GRAPH_QUERY_COUNT = Counter(
    'graph_queries_total',
    'Total number of graph queries executed'
)
ERROR_COUNT = Counter(
    'graph_errors_total',
    'Total number of graph operation errors'
)

# Initialize circuit breaker
@circuit(failure_threshold=5, recovery_timeout=30)
async def protected_graph_operation(operation, *args, **kwargs):
    """Execute graph operations with circuit breaker protection."""
    try:
        return await operation(*args, **kwargs)
    except Exception as e:
        ERROR_COUNT.inc()
        raise

# Security middleware
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

@app.on_event("startup")
async def startup_event():
    """Initialize service with security and monitoring configurations."""
    try:
        # Initialize database connection
        app.state.db = Neo4jConnection(
            settings=settings,
            pool_size=settings.neo4j_pool_config["max_size"]
        )
        
        # Initialize graph service
        app.state.graph_service = GraphDatabaseService(
            db=app.state.db,
            cache_size=settings.cache_strategy_config["max_size"]
        )
        
        # Initialize Redis cache
        app.state.cache = Redis.from_url(
            settings.get_cache_config()["redis_config"]["url"],
            decode_responses=True
        )
        
        # Configure CORS
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.allowed_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"]
        )
        
        logger.info("Graph Service initialized successfully")
        
    except Exception as e:
        logger.error(f"Failed to initialize service: {str(e)}")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup resources on service shutdown."""
    try:
        await app.state.db.close()
        await app.state.cache.close()
        logger.info("Service shutdown completed")
    except Exception as e:
        logger.error(f"Error during shutdown: {str(e)}")

@app.post("/graph/generate/{artwork_id}")
async def generate_graph(
    artwork_id: str,
    depth: int = 2,
    options: Optional[Dict[str, Any]] = None,
    token: str = Security(oauth2_scheme)
):
    """
    Generate a knowledge graph for an artwork with performance optimization
    and security measures.
    """
    with tracer.start_as_current_span("generate_graph") as span:
        start_time = datetime.now(timezone.utc)
        
        try:
            # Validate parameters
            if depth > settings.max_depth_level:
                raise HTTPException(
                    status_code=400,
                    detail=f"Maximum depth exceeded: {depth} > {settings.max_depth_level}"
                )
            
            # Check cache
            cache_key = f"graph:{artwork_id}:{depth}"
            if cached_graph := await app.state.cache.get(cache_key):
                return cached_graph
            
            # Generate graph with circuit breaker protection
            graph = await protected_graph_operation(
                app.state.graph_service.get_artwork_subgraph,
                artwork_id=artwork_id,
                depth=depth,
                options=options
            )
            
            # Cache result
            await app.state.cache.setex(
                cache_key,
                settings.graph_cache_ttl,
                graph
            )
            
            # Record metrics
            generation_time = (datetime.now(timezone.utc) - start_time).total_seconds()
            GRAPH_GENERATION_TIME.observe(generation_time)
            GRAPH_QUERY_COUNT.inc()
            
            # Update span attributes
            span.set_attributes({
                "artwork.id": artwork_id,
                "graph.depth": depth,
                "generation.time": generation_time
            })
            span.set_status(Status(StatusCode.OK))
            
            return graph
            
        except Exception as e:
            ERROR_COUNT.inc()
            span.set_status(Status(StatusCode.ERROR, str(e)))
            logger.error(f"Graph generation failed: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint with database connectivity verification."""
    try:
        await app.state.db.verify_connectivity()
        return {"status": "healthy", "timestamp": datetime.now(timezone.utc)}
    except Exception as e:
        raise HTTPException(status_code=503, detail="Service unhealthy")

@app.get("/metrics")
async def metrics():
    """Expose Prometheus metrics."""
    return generate_latest()