"""
High-level caching utility module providing abstracted caching operations with advanced features
including circuit breaker pattern, cache warming, and comprehensive monitoring for the
Art Knowledge Graph backend services.
"""

import json
import asyncio
from typing import Any, Dict, List, Optional, Callable, TypeVar, Union
from datetime import datetime, timezone
from functools import wraps
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)
from prometheus_client import Counter, Histogram, Gauge

from shared.database.redis import RedisClient
from shared.config.settings import Settings

# Type variables for generic cache operations
T = TypeVar('T')
CacheableFunction = Callable[..., T]

# Cache configuration constants
CACHE_KEY_PREFIX = "akg:cache:"
DEFAULT_CACHE_TTL = 3600  # 1 hour
MAX_KEY_LENGTH = 256
CIRCUIT_BREAKER_THRESHOLD = 0.5
CIRCUIT_BREAKER_INTERVAL = 30
MAX_RETRY_ATTEMPTS = 3
RETRY_BACKOFF_FACTOR = 2

# Prometheus metrics
CACHE_HITS = Counter('cache_hits_total', 'Total number of cache hits')
CACHE_MISSES = Counter('cache_misses_total', 'Total number of cache misses')
CACHE_ERRORS = Counter('cache_errors_total', 'Total number of cache operation errors')
CACHE_OPERATION_DURATION = Histogram(
    'cache_operation_duration_seconds',
    'Duration of cache operations',
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0]
)
CIRCUIT_BREAKER_STATE = Gauge(
    'cache_circuit_breaker_state',
    'Current state of the cache circuit breaker (0=closed, 1=open)'
)

class CircuitBreaker:
    """Circuit breaker implementation for cache operations."""
    
    def __init__(self, threshold: float = CIRCUIT_BREAKER_THRESHOLD,
                 interval: int = CIRCUIT_BREAKER_INTERVAL):
        self.threshold = threshold
        self.interval = interval
        self.failures = 0
        self.total_requests = 0
        self.last_failure_time = 0
        self._is_open = False

    @property
    def is_open(self) -> bool:
        """Check if circuit breaker is open."""
        if self._is_open:
            if (datetime.now(timezone.utc).timestamp() - self.last_failure_time) > self.interval:
                self._is_open = False
                CIRCUIT_BREAKER_STATE.set(0)
        return self._is_open

    def record_success(self) -> None:
        """Record successful operation."""
        self.total_requests += 1
        self._update_state()

    def record_failure(self) -> None:
        """Record failed operation."""
        self.failures += 1
        self.total_requests += 1
        self.last_failure_time = datetime.now(timezone.utc).timestamp()
        self._update_state()

    def _update_state(self) -> None:
        """Update circuit breaker state based on failure ratio."""
        if self.total_requests > 0:
            failure_ratio = self.failures / self.total_requests
            if failure_ratio > self.threshold:
                self._is_open = True
                CIRCUIT_BREAKER_STATE.set(1)

class CacheWarmer:
    """Cache warming utility for proactive cache population."""
    
    def __init__(self, cache_manager: 'CacheManager'):
        self.cache_manager = cache_manager
        self._warming_tasks: Dict[str, asyncio.Task] = {}

    async def warm_keys(self, keys: List[str], data_loader: Callable) -> None:
        """Warm cache for specified keys using data loader function."""
        for key in keys:
            if key not in self._warming_tasks or self._warming_tasks[key].done():
                self._warming_tasks[key] = asyncio.create_task(
                    self._warm_single_key(key, data_loader)
                )

    async def _warm_single_key(self, key: str, data_loader: Callable) -> None:
        """Warm single cache key with error handling."""
        try:
            data = await data_loader(key)
            if data is not None:
                await self.cache_manager.set_cached_data(key, data)
        except Exception as e:
            CACHE_ERRORS.inc()
            raise e

class CacheManager:
    """
    High-level cache management class providing abstracted caching operations
    with circuit breaker, monitoring, and cache warming capabilities.
    """

    def __init__(self, settings: Settings):
        """Initialize cache manager with Redis client and advanced features."""
        self._client = RedisClient(settings)
        self._settings = settings
        self._default_ttl = settings.redis_ttl
        self._circuit_breaker = CircuitBreaker()
        self._cache_stats: Dict[str, int] = {"hits": 0, "misses": 0, "errors": 0}
        self._warmer = CacheWarmer(self)

    @retry(
        stop=stop_after_attempt(MAX_RETRY_ATTEMPTS),
        wait=wait_exponential(multiplier=RETRY_BACKOFF_FACTOR),
        retry=retry_if_exception_type(Exception)
    )
    async def get_cached_data(self, key: str, use_circuit_breaker: bool = True) -> Optional[Any]:
        """Retrieve data from cache with circuit breaker and monitoring."""
        if use_circuit_breaker and self._circuit_breaker.is_open:
            CACHE_ERRORS.inc()
            raise Exception("Circuit breaker is open")

        try:
            with CACHE_OPERATION_DURATION.time():
                formatted_key = f"{CACHE_KEY_PREFIX}{key}"
                data = await self._client.get(formatted_key)

                if data:
                    CACHE_HITS.inc()
                    self._cache_stats["hits"] += 1
                    self._circuit_breaker.record_success()
                    return json.loads(data)
                
                CACHE_MISSES.inc()
                self._cache_stats["misses"] += 1
                return None

        except Exception as e:
            CACHE_ERRORS.inc()
            self._cache_stats["errors"] += 1
            self._circuit_breaker.record_failure()
            raise e

    async def set_cached_data(self, key: str, data: Any, ttl: Optional[int] = None,
                            use_circuit_breaker: bool = True) -> bool:
        """Store data in cache with monitoring and retry logic."""
        if use_circuit_breaker and self._circuit_breaker.is_open:
            CACHE_ERRORS.inc()
            raise Exception("Circuit breaker is open")

        try:
            formatted_key = f"{CACHE_KEY_PREFIX}{key}"
            if len(formatted_key) > MAX_KEY_LENGTH:
                raise ValueError(f"Cache key exceeds maximum length of {MAX_KEY_LENGTH}")

            with CACHE_OPERATION_DURATION.time():
                success = await self._client.set(
                    formatted_key,
                    json.dumps(data),
                    ttl or self._default_ttl
                )
                
                if success:
                    self._circuit_breaker.record_success()
                return success

        except Exception as e:
            CACHE_ERRORS.inc()
            self._circuit_breaker.record_failure()
            raise e

    def cache_decorator(self, ttl: Optional[int] = None,
                       use_circuit_breaker: bool = True,
                       key_prefix: Optional[str] = None) -> Callable:
        """Advanced decorator for automatic function result caching with monitoring."""
        def decorator(func: CacheableFunction) -> CacheableFunction:
            @wraps(func)
            async def wrapper(*args, **kwargs) -> Any:
                # Generate cache key
                cache_key = f"{key_prefix or func.__name__}:{hash(str(args) + str(kwargs))}"
                
                try:
                    # Try to get from cache
                    cached_result = await self.get_cached_data(
                        cache_key,
                        use_circuit_breaker=use_circuit_breaker
                    )
                    if cached_result is not None:
                        return cached_result

                    # Execute function and cache result
                    result = await func(*args, **kwargs)
                    if result is not None:
                        await self.set_cached_data(
                            cache_key,
                            result,
                            ttl=ttl,
                            use_circuit_breaker=use_circuit_breaker
                        )
                    return result

                except Exception as e:
                    CACHE_ERRORS.inc()
                    raise e

            return wrapper
        return decorator

    async def warm_cache(self, keys: List[str], data_loader: Callable) -> bool:
        """Proactively warm cache for frequently accessed data."""
        try:
            await self._warmer.warm_keys(keys, data_loader)
            return True
        except Exception as e:
            CACHE_ERRORS.inc()
            return False