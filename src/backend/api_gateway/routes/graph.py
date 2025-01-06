"""
FastAPI router module for graph-related API endpoints in the Art Knowledge Graph application.
Implements secure, high-performance graph operations with caching, rate limiting, and monitoring.
"""

import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Response, Depends, HTTPException
from prometheus_client import Counter, Histogram

from api_gateway.schemas.graph import GraphSchema, NodeSchema
from api_gateway.middleware.auth import AuthMiddleware
from graph_service.services.graph_generator import GraphGenerator
from shared.config.settings import Settings

# Configure metrics
GRAPH_REQUESTS = Counter('graph_requests_total', 'Total graph API requests')
GRAPH_GENERATION_TIME = Histogram('graph_generation_seconds', 'Graph generation time')
CACHE_HITS = Counter('graph_cache_hits_total', 'Cache hits for graph requests')

# Configure logger
logger = logging.getLogger(__name__)

# Initialize router with prefix and tags
router = APIRouter(
    prefix="/api/v1/graph",
    tags=["graph"]
)

# Initialize auth middleware
auth_middleware = AuthMiddleware

class RateLimitExceeded(HTTPException):
    """Custom exception for rate limit exceeded cases."""
    def __init__(self):
        super().__init__(
            status_code=429,
            detail="Rate limit exceeded. Please try again later."
        )

@router.get("/{artwork_id}", response_model=GraphSchema)
async def get_graph(
    artwork_id: str,
    request: Request,
    depth: Optional[int] = 2,
    settings: Settings = Depends(Settings),
    auth: AuthMiddleware = Depends(auth_middleware)
) -> GraphSchema:
    """
    Retrieve knowledge graph for an artwork with caching and rate limiting.

    Args:
        artwork_id: Unique identifier of the artwork
        request: FastAPI request object
        depth: Graph traversal depth (default: 2)
        settings: Application settings
        auth: Authentication middleware

    Returns:
        GraphSchema: Generated or cached knowledge graph
    """
    GRAPH_REQUESTS.inc()
    start_time = datetime.now(timezone.utc)

    try:
        # Authenticate request
        claims = await auth.authenticate_request(request)
        
        # Check rate limits
        if not auth.rate_limiter.check_rate_limit(claims["sub"], "graph_get"):
            raise RateLimitExceeded()

        # Initialize graph generator
        graph_generator = GraphGenerator(
            db=request.app.state.db,
            cache=request.app.state.cache,
            config=settings.dict()
        )

        # Generate or retrieve cached graph
        with GRAPH_GENERATION_TIME.time():
            graph_data = await graph_generator.generate_artwork_graph(
                artwork_id=artwork_id,
                depth=depth,
                options={
                    "user_role": claims.get("role", "anonymous"),
                    "security_level": claims.get("security_level", "public")
                }
            )

        # Validate graph structure
        graph = GraphSchema(**graph_data)
        graph.validate_structure()

        # Record metrics
        generation_time = (datetime.now(timezone.utc) - start_time).total_seconds()
        logger.info(
            "Graph retrieved successfully",
            extra={
                "artwork_id": artwork_id,
                "depth": depth,
                "generation_time": generation_time,
                "user_id": claims["sub"]
            }
        )

        return graph

    except Exception as e:
        logger.error(
            f"Failed to retrieve graph: {str(e)}",
            extra={
                "artwork_id": artwork_id,
                "error": str(e)
            }
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve graph"
        )

@router.post("/", response_model=GraphSchema)
async def generate_graph(
    artwork_metadata: Dict[str, Any],
    request: Request,
    settings: Settings = Depends(Settings),
    auth: AuthMiddleware = Depends(auth_middleware)
) -> GraphSchema:
    """
    Generate a new knowledge graph from artwork metadata with parallel processing.

    Args:
        artwork_metadata: Artwork metadata for graph generation
        request: FastAPI request object
        settings: Application settings
        auth: Authentication middleware

    Returns:
        GraphSchema: Generated knowledge graph
    """
    GRAPH_REQUESTS.inc()
    start_time = datetime.now(timezone.utc)

    try:
        # Authenticate request
        claims = await auth.authenticate_request(request)
        
        # Check rate limits for graph generation
        if not auth.rate_limiter.check_rate_limit(claims["sub"], "graph_generate"):
            raise RateLimitExceeded()

        # Initialize graph generator
        graph_generator = GraphGenerator(
            db=request.app.state.db,
            cache=request.app.state.cache,
            config=settings.dict()
        )

        # Generate graph with parallel processing
        with GRAPH_GENERATION_TIME.time():
            graph_data = await graph_generator.generate_artwork_graph(
                artwork_metadata=artwork_metadata,
                options={
                    "user_id": claims["sub"],
                    "user_role": claims.get("role", "anonymous"),
                    "parallel_processing": True,
                    "cache_result": True
                }
            )

        # Validate generated graph
        graph = GraphSchema(**graph_data)
        graph.validate_structure()

        # Record metrics
        generation_time = (datetime.now(timezone.utc) - start_time).total_seconds()
        logger.info(
            "Graph generated successfully",
            extra={
                "user_id": claims["sub"],
                "generation_time": generation_time,
                "nodes_count": len(graph.nodes),
                "relationships_count": len(graph.relationships)
            }
        )

        return graph

    except Exception as e:
        logger.error(
            f"Failed to generate graph: {str(e)}",
            extra={
                "error": str(e),
                "metadata": artwork_metadata
            }
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to generate graph"
        )

@router.put("/{graph_id}", response_model=GraphSchema)
async def update_graph(
    graph_id: str,
    updates: Dict[str, Any],
    request: Request,
    settings: Settings = Depends(Settings),
    auth: AuthMiddleware = Depends(auth_middleware)
) -> GraphSchema:
    """
    Update an existing knowledge graph with optimized cache invalidation.

    Args:
        graph_id: Unique identifier of the graph
        updates: Graph updates to apply
        request: FastAPI request object
        settings: Application settings
        auth: Authentication middleware

    Returns:
        GraphSchema: Updated knowledge graph
    """
    GRAPH_REQUESTS.inc()
    start_time = datetime.now(timezone.utc)

    try:
        # Authenticate request
        claims = await auth.authenticate_request(request)
        
        # Check rate limits
        if not auth.rate_limiter.check_rate_limit(claims["sub"], "graph_update"):
            raise RateLimitExceeded()

        # Initialize graph generator
        graph_generator = GraphGenerator(
            db=request.app.state.db,
            cache=request.app.state.cache,
            config=settings.dict()
        )

        # Update graph with cache invalidation
        with GRAPH_GENERATION_TIME.time():
            updated_graph = await graph_generator.update_graph(
                graph_id=graph_id,
                updates=updates,
                options={
                    "user_id": claims["sub"],
                    "user_role": claims.get("role", "anonymous"),
                    "invalidate_cache": True
                }
            )

        # Validate updated graph
        graph = GraphSchema(**updated_graph)
        graph.validate_structure()

        # Record metrics
        update_time = (datetime.now(timezone.utc) - start_time).total_seconds()
        logger.info(
            "Graph updated successfully",
            extra={
                "graph_id": graph_id,
                "user_id": claims["sub"],
                "update_time": update_time
            }
        )

        return graph

    except Exception as e:
        logger.error(
            f"Failed to update graph: {str(e)}",
            extra={
                "graph_id": graph_id,
                "error": str(e)
            }
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to update graph"
        )

@router.delete("/{graph_id}")
async def delete_graph(
    graph_id: str,
    request: Request,
    settings: Settings = Depends(Settings),
    auth: AuthMiddleware = Depends(auth_middleware)
) -> Dict[str, str]:
    """
    Delete a knowledge graph with cache cleanup.

    Args:
        graph_id: Unique identifier of the graph
        request: FastAPI request object
        settings: Application settings
        auth: Authentication middleware

    Returns:
        Dict[str, str]: Deletion confirmation
    """
    try:
        # Authenticate request with admin role required
        claims = await auth.authenticate_request(request)
        if not auth.check_permissions(claims, "admin"):
            raise HTTPException(
                status_code=403,
                detail="Admin privileges required"
            )

        # Initialize graph generator
        graph_generator = GraphGenerator(
            db=request.app.state.db,
            cache=request.app.state.cache,
            config=settings.dict()
        )

        # Delete graph and clean cache
        await graph_generator.delete_graph(
            graph_id=graph_id,
            options={
                "user_id": claims["sub"],
                "cleanup_cache": True
            }
        )

        logger.info(
            "Graph deleted successfully",
            extra={
                "graph_id": graph_id,
                "user_id": claims["sub"]
            }
        )

        return {"status": "Graph deleted successfully"}

    except Exception as e:
        logger.error(
            f"Failed to delete graph: {str(e)}",
            extra={
                "graph_id": graph_id,
                "error": str(e)
            }
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to delete graph"
        )