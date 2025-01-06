from typing import Dict, List, Optional
from pydantic import Field, validator
from pydantic.dataclasses import dataclass
from shared.config.settings import Settings

# Default configuration values
DEFAULT_MAX_NODES = 1000
DEFAULT_MAX_DEPTH = 5
DEFAULT_CACHE_TTL = 3600  # 1 hour
DEFAULT_BATCH_SIZE = 100
DEFAULT_SIMILARITY_THRESHOLD = 0.85
DEFAULT_MAX_CONCURRENT = 5
DEFAULT_LAYOUTS = ["force-directed", "hierarchical", "circular"]
DEFAULT_NODE_COLORS = {
    "artwork": "#4CAF50",
    "artist": "#2196F3",
    "movement": "#FFC107",
    "period": "#9C27B0"
}
DEFAULT_MAX_EXPORT_SIZE = 50  # MB
DEFAULT_POOL_SIZE = 20
DEFAULT_QUERY_TIMEOUT = 30000  # milliseconds

# Default cache strategy configuration
DEFAULT_CACHE_STRATEGY = {
    "type": "LRU",
    "max_size": 1000,
    "eviction_policy": "least-recently-used"
}

@dataclass
class GraphServiceSettings(Settings):
    """
    Configuration settings for the Graph Service microservice with performance
    optimization and visualization parameters.
    """
    # Service identification
    service_name: str = Field("graph-service", const=True)

    # Graph generation limits
    max_nodes_per_graph: int = Field(DEFAULT_MAX_NODES, gt=0)
    max_depth_level: int = Field(DEFAULT_MAX_DEPTH, gt=0)
    graph_cache_ttl: int = Field(DEFAULT_CACHE_TTL, gt=0)
    batch_size: int = Field(DEFAULT_BATCH_SIZE, gt=0)
    similarity_threshold: float = Field(DEFAULT_SIMILARITY_THRESHOLD, ge=0.0, le=1.0)
    max_concurrent_generations: int = Field(DEFAULT_MAX_CONCURRENT, gt=0)

    # Visualization settings
    supported_graph_layouts: List[str] = Field(DEFAULT_LAYOUTS)
    node_type_colors: Dict[str, str] = Field(DEFAULT_NODE_COLORS)
    max_export_size_mb: int = Field(DEFAULT_MAX_EXPORT_SIZE, gt=0)

    # Neo4j specific configuration
    neo4j_pool_config: Dict = Field(default_factory=lambda: {
        "max_size": DEFAULT_POOL_SIZE,
        "timeout": DEFAULT_QUERY_TIMEOUT,
        "max_retry_time": 15000,
        "acquire_timeout": 60000
    })

    # Query optimization settings
    query_optimization_settings: Dict = Field(default_factory=lambda: {
        "use_query_cache": True,
        "max_query_time": DEFAULT_QUERY_TIMEOUT,
        "parallel_threshold": 1000,
        "batch_size": DEFAULT_BATCH_SIZE,
        "index_hints": True
    })

    # Cache strategy configuration
    cache_strategy_config: Dict = Field(DEFAULT_CACHE_STRATEGY)

    def __init__(self):
        """Initialize graph service specific settings with performance-optimized defaults."""
        super().__init__()
        self._configure_neo4j_pool()
        self._configure_query_optimization()
        self._configure_cache_strategy()
        self._validate_graph_settings()

    @validator("supported_graph_layouts")
    def validate_layouts(cls, v: List[str]) -> List[str]:
        """Validate supported graph layout algorithms."""
        allowed_layouts = {"force-directed", "hierarchical", "circular", "radial", "grid"}
        invalid_layouts = set(v) - allowed_layouts
        if invalid_layouts:
            raise ValueError(f"Unsupported layout(s): {invalid_layouts}")
        return v

    @validator("node_type_colors")
    def validate_colors(cls, v: Dict[str, str]) -> Dict[str, str]:
        """Validate node color hex codes."""
        import re
        hex_pattern = re.compile(r'^#(?:[0-9a-fA-F]{3}){1,2}$')
        for node_type, color in v.items():
            if not hex_pattern.match(color):
                raise ValueError(f"Invalid color hex code for {node_type}: {color}")
        return v

    def get_neo4j_config(self) -> Dict:
        """
        Returns Neo4j specific configuration optimized for graph operations.
        """
        base_config = super().get_database_url("neo4j")
        return {
            "uri": base_config,
            "auth": (
                self.neo4j_user.get_secret_value(),
                self.neo4j_password.get_secret_value()
            ),
            "max_connection_pool_size": self.neo4j_pool_config["max_size"],
            "connection_timeout": self.neo4j_pool_config["timeout"],
            "max_retry_time": self.neo4j_pool_config["max_retry_time"],
            "connection_acquisition_timeout": self.neo4j_pool_config["acquire_timeout"]
        }

    def get_cache_config(self) -> Dict:
        """
        Returns optimized cache configuration for graph data.
        """
        return {
            "strategy": self.cache_strategy_config["type"],
            "max_size": self.cache_strategy_config["max_size"],
            "ttl": self.graph_cache_ttl,
            "eviction_policy": self.cache_strategy_config["eviction_policy"],
            "redis_config": {
                "url": super().get_database_url("redis"),
                "pool_size": self.redis_pool_size,
                "timeout": self.redis_connection_timeout
            }
        }

    def _configure_neo4j_pool(self) -> None:
        """Configure Neo4j connection pool based on environment."""
        if self.environment == "production":
            self.neo4j_pool_config.update({
                "max_size": max(DEFAULT_POOL_SIZE, self.neo4j_pool_config["max_size"]),
                "timeout": min(DEFAULT_QUERY_TIMEOUT, self.neo4j_pool_config["timeout"])
            })

    def _configure_query_optimization(self) -> None:
        """Configure query optimization settings based on environment."""
        if self.environment == "production":
            self.query_optimization_settings.update({
                "use_query_cache": True,
                "parallel_threshold": 500
            })

    def _configure_cache_strategy(self) -> None:
        """Configure cache strategy based on environment and load."""
        if self.environment == "production":
            self.cache_strategy_config.update({
                "max_size": max(1000, self.cache_strategy_config["max_size"]),
                "type": "LRU"
            })

    def _validate_graph_settings(self) -> None:
        """Validate graph-specific settings."""
        if self.environment == "production":
            if self.max_nodes_per_graph > 5000:
                raise ValueError("max_nodes_per_graph exceeds production limit of 5000")
            if self.max_depth_level > 7:
                raise ValueError("max_depth_level exceeds production limit of 7")