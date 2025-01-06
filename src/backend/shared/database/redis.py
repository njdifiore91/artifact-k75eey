"""
Redis database client module providing secure connection management, caching operations,
and session handling with enhanced monitoring and performance optimizations for the
Art Knowledge Graph backend services.
"""

import redis
import aioredis
from typing import Any, Dict, Optional, Union
import json
import time
import asyncio
from datetime import datetime, timezone
import logging
from functools import wraps

from shared.config.settings import Settings
from shared.middleware.error_handler import ErrorHandlerMiddleware

# Constants for Redis configuration
DEFAULT_TTL = 86400  # 24 hours
DEFAULT_POOL_SIZE = 10
REDIS_KEY_PREFIX = "akg:"  # Art Knowledge Graph prefix
MAX_RETRIES = 3
RETRY_BACKOFF = 2
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX_REQUESTS = 1000

# Initialize logger
logger = logging.getLogger(__name__)

def circuit_breaker(func):
    """Circuit breaker decorator for Redis operations."""
    @wraps(func)
    async def wrapper(self, *args, **kwargs):
        if self._circuit_breaker.is_open:
            if time.time() - self._circuit_breaker.last_failure > self._circuit_breaker.reset_timeout:
                self._circuit_breaker.half_open()
            else:
                raise redis.ConnectionError("Circuit breaker is open")

        try:
            result = await func(self, *args, **kwargs)
            self._circuit_breaker.success()
            return result
        except Exception as e:
            self._circuit_breaker.failure()
            raise e
    return wrapper

def rate_limit(func):
    """Rate limiting decorator for Redis operations."""
    @wraps(func)
    async def wrapper(self, *args, **kwargs):
        request_id = kwargs.get('request_id', 'default')
        if not self._check_rate_limit(request_id):
            raise redis.ConnectionError("Rate limit exceeded")
        return await func(self, *args, **kwargs)
    return wrapper

def monitor(func):
    """Monitoring decorator for Redis operations."""
    @wraps(func)
    async def wrapper(self, *args, **kwargs):
        start_time = time.time()
        request_id = kwargs.get('request_id', 'default')
        
        try:
            result = await func(self, *args, **kwargs)
            self._record_metrics(func.__name__, time.time() - start_time, True, request_id)
            return result
        except Exception as e:
            self._record_metrics(func.__name__, time.time() - start_time, False, request_id)
            raise e
    return wrapper

class CircuitBreaker:
    """Circuit breaker implementation for Redis operations."""
    
    def __init__(self, failure_threshold: int = 5, reset_timeout: int = 60):
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.failures = 0
        self.is_open = False
        self.last_failure = 0

    def failure(self):
        self.failures += 1
        self.last_failure = time.time()
        if self.failures >= self.failure_threshold:
            self.is_open = True

    def success(self):
        self.failures = 0
        self.is_open = False

    def half_open(self):
        self.is_open = False

class RedisClient:
    """
    Enhanced Redis client class managing secure connections, caching operations,
    and monitoring for the Art Knowledge Graph application.
    """

    def __init__(self, settings: Settings):
        """Initialize Redis client with secure configuration and monitoring setup."""
        self._settings = settings
        self._pool_size = settings.redis_pool_size
        self._ttl = settings.redis_ttl
        self._ssl_enabled = settings.environment == "production"
        
        # Initialize circuit breaker
        self._circuit_breaker = CircuitBreaker()
        
        # Initialize monitoring
        self._monitoring_config = {
            "metrics": {},
            "rate_limits": {}
        }

        # Configure Redis connection
        self._sync_client = self._create_sync_client()
        self._async_client = self._create_async_client()

    def _create_sync_client(self) -> redis.Redis:
        """Create secure synchronous Redis client."""
        return redis.Redis.from_url(
            self._settings.redis_uri.get_secret_value(),
            decode_responses=True,
            encoding="utf-8",
            socket_timeout=self._settings.redis_connection_timeout,
            socket_connect_timeout=self._settings.redis_connection_timeout,
            retry_on_timeout=True,
            ssl=self._ssl_enabled,
            ssl_cert_reqs="required" if self._ssl_enabled else None,
            max_connections=self._pool_size
        )

    def _create_async_client(self) -> aioredis.Redis:
        """Create secure asynchronous Redis client."""
        return aioredis.from_url(
            self._settings.redis_uri.get_secret_value(),
            decode_responses=True,
            encoding="utf-8",
            socket_timeout=self._settings.redis_connection_timeout,
            socket_connect_timeout=self._settings.redis_connection_timeout,
            retry_on_timeout=True,
            ssl=self._ssl_enabled,
            ssl_cert_reqs="required" if self._ssl_enabled else None,
            max_connections=self._pool_size
        )

    def _format_key(self, key: str) -> str:
        """Format Redis key with prefix and security validation."""
        if not isinstance(key, str):
            raise ValueError("Key must be a string")
        return f"{REDIS_KEY_PREFIX}{key}"

    def _check_rate_limit(self, request_id: str) -> bool:
        """Check if request is within rate limits."""
        now = time.time()
        window_start = now - RATE_LIMIT_WINDOW
        
        # Clean up old requests
        self._monitoring_config["rate_limits"] = {
            rid: timestamps for rid, timestamps in 
            self._monitoring_config["rate_limits"].items()
            if timestamps[-1] > window_start
        }
        
        # Check current request
        requests = self._monitoring_config["rate_limits"].get(request_id, [])
        requests = [ts for ts in requests if ts > window_start]
        
        if len(requests) >= RATE_LIMIT_MAX_REQUESTS:
            return False
            
        requests.append(now)
        self._monitoring_config["rate_limits"][request_id] = requests
        return True

    def _record_metrics(self, operation: str, duration: float, success: bool, request_id: str):
        """Record operation metrics for monitoring."""
        metrics = self._monitoring_config["metrics"].setdefault(operation, {
            "total_calls": 0,
            "successful_calls": 0,
            "failed_calls": 0,
            "total_duration": 0,
            "last_request_id": None
        })
        
        metrics["total_calls"] += 1
        metrics["successful_calls" if success else "failed_calls"] += 1
        metrics["total_duration"] += duration
        metrics["last_request_id"] = request_id

    @circuit_breaker
    @rate_limit
    @monitor
    async def get(self, key: str, request_id: Optional[str] = None) -> Any:
        """Securely retrieve value from Redis by key with monitoring."""
        try:
            formatted_key = self._format_key(key)
            value = await self._async_client.get(formatted_key)
            return json.loads(value) if value else None
        except json.JSONDecodeError:
            logger.error(f"Failed to decode Redis value for key: {key}")
            return None
        except Exception as e:
            logger.error(f"Redis get error: {str(e)}", extra={"request_id": request_id})
            raise

    @circuit_breaker
    @rate_limit
    @monitor
    async def set(self, key: str, value: Any, ttl: Optional[int] = None, 
                  request_id: Optional[str] = None) -> bool:
        """Securely set key-value pair in Redis with monitoring."""
        try:
            formatted_key = self._format_key(key)
            serialized_value = json.dumps(value)
            return await self._async_client.set(
                formatted_key,
                serialized_value,
                ex=ttl or self._ttl
            )
        except Exception as e:
            logger.error(f"Redis set error: {str(e)}", extra={"request_id": request_id})
            raise

    @circuit_breaker
    @rate_limit
    @monitor
    async def delete(self, key: str, request_id: Optional[str] = None) -> bool:
        """Securely remove key from Redis with monitoring."""
        try:
            formatted_key = self._format_key(key)
            return bool(await self._async_client.delete(formatted_key))
        except Exception as e:
            logger.error(f"Redis delete error: {str(e)}", extra={"request_id": request_id})
            raise

    @circuit_breaker
    @rate_limit
    @monitor
    async def flush(self, request_id: Optional[str] = None) -> bool:
        """Securely clear all keys with monitoring."""
        try:
            return await self._async_client.flushdb()
        except Exception as e:
            logger.error(f"Redis flush error: {str(e)}", extra={"request_id": request_id})
            raise

    async def close(self):
        """Safely close Redis connections."""
        await self._async_client.close()
        await self._sync_client.close()

    def get_metrics(self) -> Dict[str, Any]:
        """Get current monitoring metrics."""
        return {
            "operations": self._monitoring_config["metrics"],
            "circuit_breaker": {
                "failures": self._circuit_breaker.failures,
                "is_open": self._circuit_breaker.is_open,
                "last_failure": self._circuit_breaker.last_failure
            },
            "rate_limits": {
                rid: len(timestamps) 
                for rid, timestamps in self._monitoring_config["rate_limits"].items()
            }
        }