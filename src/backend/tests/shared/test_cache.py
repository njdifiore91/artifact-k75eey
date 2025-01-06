import pytest
import asyncio
from unittest.mock import Mock, patch
from datetime import datetime, timedelta
from freezegun import freeze_time
import json

from shared.utils.cache import CacheManager, CircuitBreaker, CacheWarmer
from shared.config.settings import Settings

# Test constants
TEST_KEY = "test:key"
TEST_VALUE = {"data": "test_value", "number": 42}
TEST_TTL = 300
CIRCUIT_BREAKER_THRESHOLD = 5
CIRCUIT_BREAKER_TIMEOUT = 30
MAX_CONCURRENT_OPERATIONS = 100
MAX_KEY_SIZE = 1024
MAX_VALUE_SIZE = 512000

class TestCacheManager:
    """Comprehensive test suite for CacheManager functionality."""

    @pytest.fixture
    async def cache_manager(self):
        """Fixture to create CacheManager instance with mocked Redis client."""
        settings = Settings(
            redis_uri="redis://localhost:6379",
            redis_pool_size=5,
            redis_ttl=3600,
            environment="test"
        )
        
        with patch('shared.utils.cache.RedisClient') as mock_redis:
            manager = CacheManager(settings)
            manager._client = mock_redis
            yield manager

    @pytest.fixture
    def mock_metrics(self):
        """Fixture to mock Prometheus metrics."""
        with patch('shared.utils.cache.CACHE_HITS') as mock_hits, \
             patch('shared.utils.cache.CACHE_MISSES') as mock_misses, \
             patch('shared.utils.cache.CACHE_ERRORS') as mock_errors, \
             patch('shared.utils.cache.CACHE_OPERATION_DURATION') as mock_duration:
            yield {
                'hits': mock_hits,
                'misses': mock_misses,
                'errors': mock_errors,
                'duration': mock_duration
            }

    async def test_cache_set_get_basic(self, cache_manager, mock_metrics):
        """Test basic cache set and get operations."""
        # Setup mock responses
        cache_manager._client.set.return_value = True
        cache_manager._client.get.return_value = json.dumps(TEST_VALUE)

        # Test set operation
        success = await cache_manager.set_cached_data(TEST_KEY, TEST_VALUE, TEST_TTL)
        assert success is True
        cache_manager._client.set.assert_called_once_with(
            f"akg:cache:{TEST_KEY}",
            json.dumps(TEST_VALUE),
            TEST_TTL
        )

        # Test get operation
        result = await cache_manager.get_cached_data(TEST_KEY)
        assert result == TEST_VALUE
        cache_manager._client.get.assert_called_once_with(f"akg:cache:{TEST_KEY}")
        mock_metrics['hits'].inc.assert_called_once()

    async def test_cache_miss(self, cache_manager, mock_metrics):
        """Test cache miss scenario."""
        cache_manager._client.get.return_value = None
        result = await cache_manager.get_cached_data(TEST_KEY)
        assert result is None
        mock_metrics['misses'].inc.assert_called_once()

    @pytest.mark.parametrize("error_type", [
        ConnectionError,
        TimeoutError,
        ValueError,
        json.JSONDecodeError("", "", 0)
    ])
    async def test_cache_error_handling(self, cache_manager, mock_metrics, error_type):
        """Test various cache error scenarios."""
        cache_manager._client.get.side_effect = error_type
        
        with pytest.raises(Exception):
            await cache_manager.get_cached_data(TEST_KEY)
        
        mock_metrics['errors'].inc.assert_called_once()
        assert cache_manager._circuit_breaker.failures > 0

    async def test_circuit_breaker_functionality(self, cache_manager):
        """Test circuit breaker pattern implementation."""
        # Trigger multiple failures
        cache_manager._client.get.side_effect = ConnectionError
        
        for _ in range(CIRCUIT_BREAKER_THRESHOLD):
            with pytest.raises(Exception):
                await cache_manager.get_cached_data(TEST_KEY)
        
        # Verify circuit breaker is open
        assert cache_manager._circuit_breaker.is_open is True
        
        # Attempt operation with open circuit
        with pytest.raises(Exception) as exc_info:
            await cache_manager.get_cached_data(TEST_KEY)
        assert "Circuit breaker is open" in str(exc_info.value)

    @freeze_time("2023-01-01 12:00:00")
    async def test_cache_ttl_handling(self, cache_manager):
        """Test cache TTL functionality."""
        await cache_manager.set_cached_data(TEST_KEY, TEST_VALUE, TEST_TTL)
        cache_manager._client.set.assert_called_with(
            f"akg:cache:{TEST_KEY}",
            json.dumps(TEST_VALUE),
            TEST_TTL
        )

        # Move time forward beyond TTL
        with freeze_time("2023-01-01 12:10:00"):
            cache_manager._client.get.return_value = None
            result = await cache_manager.get_cached_data(TEST_KEY)
            assert result is None

    async def test_cache_decorator(self, cache_manager):
        """Test cache decorator functionality."""
        test_data = {"result": "cached_value"}
        cache_manager._client.get.return_value = None
        cache_manager._client.set.return_value = True

        @cache_manager.cache_decorator(ttl=TEST_TTL)
        async def test_function(param):
            return test_data

        # First call - should cache
        result1 = await test_function("param1")
        assert result1 == test_data
        cache_manager._client.set.assert_called_once()

        # Second call - should use cache
        cache_manager._client.get.return_value = json.dumps(test_data)
        result2 = await test_function("param1")
        assert result2 == test_data

    async def test_concurrent_cache_access(self, cache_manager):
        """Test concurrent cache access patterns."""
        cache_manager._client.get.return_value = json.dumps(TEST_VALUE)
        cache_manager._client.set.return_value = True

        async def concurrent_operation(key):
            return await cache_manager.get_cached_data(key)

        # Create multiple concurrent operations
        tasks = [
            concurrent_operation(f"{TEST_KEY}_{i}")
            for i in range(MAX_CONCURRENT_OPERATIONS)
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        assert len(results) == MAX_CONCURRENT_OPERATIONS
        assert all(result == TEST_VALUE for result in results)

    async def test_cache_warming(self, cache_manager):
        """Test cache warming functionality."""
        test_keys = [f"{TEST_KEY}_{i}" for i in range(5)]
        cache_manager._client.set.return_value = True

        async def data_loader(key):
            return {f"data_{key}": "value"}

        # Test warm cache operation
        success = await cache_manager.warm_cache(test_keys, data_loader)
        assert success is True
        assert cache_manager._client.set.call_count == len(test_keys)

    async def test_large_value_handling(self, cache_manager):
        """Test handling of large cache values."""
        large_value = {"data": "x" * MAX_VALUE_SIZE}
        
        # Test setting large value
        with pytest.raises(ValueError):
            await cache_manager.set_cached_data(TEST_KEY, large_value)

    def test_metrics_collection(self, cache_manager, mock_metrics):
        """Test metrics collection and monitoring."""
        # Verify metrics are initialized
        assert cache_manager._cache_stats["hits"] == 0
        assert cache_manager._cache_stats["misses"] == 0
        assert cache_manager._cache_stats["errors"] == 0

        # Verify metrics are updated
        cache_manager._cache_stats["hits"] += 1
        assert cache_manager._cache_stats["hits"] == 1

    async def test_cache_key_validation(self, cache_manager):
        """Test cache key validation and formatting."""
        # Test invalid key
        with pytest.raises(ValueError):
            await cache_manager.set_cached_data("" * (MAX_KEY_SIZE + 1), TEST_VALUE)

        # Test valid key formatting
        await cache_manager.set_cached_data(TEST_KEY, TEST_VALUE)
        cache_manager._client.set.assert_called_with(
            f"akg:cache:{TEST_KEY}",
            json.dumps(TEST_VALUE),
            mock.ANY
        )