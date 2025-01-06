"""
Search route handlers for the Art Knowledge Graph API Gateway providing optimized
artwork search capabilities with caching and performance monitoring.
"""

from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Query, Depends, HTTPException, Header
from pydantic import BaseModel, Field, model_validator
import redis
import json

from api_gateway.schemas.artwork import ArtworkMetadata
from api_gateway.schemas.graph import NodeSchema
from shared.schemas.error import ErrorResponse
from shared.schemas.base import BaseSchema

# Router configuration
router = APIRouter(tags=["search"])

# Constants
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
CACHE_TTL_SECONDS = 3600
SEARCH_FIELDS = ["title", "artist", "period", "style", "tags"]

# Redis client configuration
redis_client = redis.Redis(
    host="localhost",  # Configure from environment
    port=6379,
    db=0,
    decode_responses=True
)

class SearchParams(BaseModel):
    """Enhanced search parameters model with validation."""
    query: str = Field(..., min_length=1, max_length=200)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE)
    filters: Optional[List[str]] = Field(default=None)
    sort_by: Optional[str] = Field(default=None)

    @model_validator(mode='after')
    def validate_search_params(self) -> 'SearchParams':
        """Validates search parameters for security and consistency."""
        # Sanitize query
        self.query = self.query.strip()
        
        # Validate sort field
        if self.sort_by and self.sort_by not in SEARCH_FIELDS:
            raise ValueError(f"Invalid sort field. Must be one of: {', '.join(SEARCH_FIELDS)}")
        
        # Validate filters
        if self.filters:
            valid_filters = set(SEARCH_FIELDS)
            invalid_filters = [f for f in self.filters if f not in valid_filters]
            if invalid_filters:
                raise ValueError(f"Invalid filters: {', '.join(invalid_filters)}")
        
        return self

class SearchResponse(BaseSchema):
    """Search response model with pagination metadata."""
    items: List[Dict[str, Any]]
    total: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_previous: bool
    execution_time_ms: float

@router.get("/api/v1/search", response_model=SearchResponse)
async def search_artwork(
    query: str = Query(..., min_length=1, max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    filters: Optional[List[str]] = Query(default=None),
    sort_by: Optional[str] = Query(default=None),
    if_none_match: Optional[str] = Header(None)
) -> SearchResponse:
    """
    Searches for artworks with caching and performance optimization.
    
    Args:
        query: Search query string
        page: Page number for pagination
        page_size: Number of items per page
        filters: Optional list of fields to filter by
        sort_by: Optional field to sort results by
        if_none_match: Optional ETag for cache validation
    
    Returns:
        SearchResponse: Paginated search results with metadata
    """
    try:
        # Validate search parameters
        search_params = SearchParams(
            query=query,
            page=page,
            page_size=page_size,
            filters=filters,
            sort_by=sort_by
        )

        # Generate cache key
        cache_key = f"search:{query}:{page}:{page_size}:{filters}:{sort_by}"
        
        # Check cache
        cached_response = redis_client.get(cache_key)
        if cached_response and if_none_match:
            cached_etag = redis_client.get(f"{cache_key}:etag")
            if cached_etag == if_none_match:
                return SearchResponse(**json.loads(cached_response))

        # Start timing
        start_time = datetime.now(timezone.utc)

        # Perform search
        results = await _perform_search(search_params)
        
        # Calculate pagination metadata
        total_items = len(results)
        total_pages = (total_items + page_size - 1) // page_size
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        
        # Prepare response
        response = SearchResponse(
            items=results[start_idx:end_idx],
            total=total_items,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_previous=page > 1,
            execution_time_ms=(datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        )

        # Cache response
        response_json = response.model_dump_json()
        etag = f"W/\"{hash(response_json)}\""
        redis_client.setex(cache_key, CACHE_TTL_SECONDS, response_json)
        redis_client.setex(f"{cache_key}:etag", CACHE_TTL_SECONDS, etag)

        return response

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        return ErrorResponse.from_exception(e).to_response()

@router.get("/api/v1/search/graph/{node_id}")
async def search_by_graph(
    node_id: UUID,
    depth: int = Query(default=1, ge=1, le=5),
    relationship_types: Optional[List[str]] = Query(default=None)
) -> Dict[str, Any]:
    """
    Performs graph-based search starting from a specific node.
    
    Args:
        node_id: UUID of the starting node
        depth: Depth of graph traversal
        relationship_types: Optional list of relationship types to include
    
    Returns:
        Dict containing graph nodes and relationships
    """
    try:
        # Generate cache key
        cache_key = f"graph_search:{node_id}:{depth}:{relationship_types}"
        
        # Check cache
        cached_result = redis_client.get(cache_key)
        if cached_result:
            return json.loads(cached_result)

        # Start timing
        start_time = datetime.now(timezone.utc)

        # Validate node exists
        node = await _get_node_by_id(node_id)
        if not node:
            raise HTTPException(status_code=404, detail="Node not found")

        # Perform graph traversal
        graph_results = await _traverse_graph(
            node_id=node_id,
            depth=depth,
            relationship_types=relationship_types
        )

        # Add performance metadata
        graph_results["metadata"] = {
            "execution_time_ms": (datetime.now(timezone.utc) - start_time).total_seconds() * 1000,
            "node_count": len(graph_results["nodes"]),
            "relationship_count": len(graph_results["relationships"])
        }

        # Cache results
        redis_client.setex(cache_key, CACHE_TTL_SECONDS, json.dumps(graph_results))

        return graph_results

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        return ErrorResponse.from_exception(e).to_response()

async def _perform_search(params: SearchParams) -> List[Dict[str, Any]]:
    """
    Performs the actual search operation with optimizations.
    
    Args:
        params: Validated search parameters
    
    Returns:
        List of search results
    """
    # Implementation would include:
    # 1. Query multiple data sources
    # 2. Aggregate and deduplicate results
    # 3. Apply filters and sorting
    # 4. Validate metadata accuracy
    pass

async def _get_node_by_id(node_id: UUID) -> Optional[Dict[str, Any]]:
    """
    Retrieves a node by its UUID.
    
    Args:
        node_id: Node UUID
    
    Returns:
        Optional node data
    """
    # Implementation would include:
    # 1. Query graph database
    # 2. Validate node exists
    # 3. Return node data
    pass

async def _traverse_graph(
    node_id: UUID,
    depth: int,
    relationship_types: Optional[List[str]]
) -> Dict[str, Any]:
    """
    Traverses the graph from a starting node.
    
    Args:
        node_id: Starting node UUID
        depth: Traversal depth
        relationship_types: Optional relationship type filters
    
    Returns:
        Dict containing nodes and relationships
    """
    # Implementation would include:
    # 1. Perform graph traversal
    # 2. Apply relationship filters
    # 3. Build response structure
    pass