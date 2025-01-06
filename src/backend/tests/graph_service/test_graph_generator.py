"""
Enterprise-grade test suite for the GraphGenerator service with comprehensive testing
of graph generation, performance monitoring, and data integration validation.
"""

import uuid
import pytest
import asyncio
import networkx as nx
from datetime import datetime, timezone
from typing import Dict, Any, List
from freezegun import freeze_time
from prometheus_client import CollectorRegistry, Counter, Histogram

from graph_service.services.graph_generator import GraphGenerator
from graph_service.services.graph_analyzer import GraphAnalyzer
from graph_service.models.artwork import Artwork
from graph_service.models.node import Node
from graph_service.models.relationship import Relationship

# Test constants
TEST_ARTWORK_ID = uuid.UUID('test-artwork-id')
TEST_GRAPH_ID = uuid.UUID('test-graph-id')
TEST_DEPTH = 2
PERFORMANCE_THRESHOLD_MS = 5000  # 5 seconds max processing time
MAX_MEMORY_USAGE_MB = 512
PARALLEL_TEST_COUNT = 4

@pytest.mark.integration
@pytest.mark.asyncio
class TestGraphGenerator:
    """
    Comprehensive test suite for GraphGenerator service with performance monitoring,
    security validation, and integration testing.
    """

    async def setup_method(self, method):
        """Enhanced setup with resource management and test isolation."""
        # Initialize test metrics
        self._metrics = CollectorRegistry()
        self._generation_time = Histogram(
            'graph_generation_duration_seconds',
            'Time spent generating graphs',
            registry=self._metrics
        )
        self._memory_usage = Counter(
            'graph_generation_memory_mb',
            'Memory used during graph generation',
            registry=self._metrics
        )

        # Initialize test connections
        self._db = await self._setup_test_database()
        self._cache = await self._setup_test_cache()
        
        # Initialize services
        self._generator = GraphGenerator(self._db, self._cache, {
            'max_depth': TEST_DEPTH,
            'batch_size': 50,
            'timeout': 30
        })
        self._analyzer = GraphAnalyzer(self._db)

        # Set up test data
        await self._setup_test_data()

    async def teardown_method(self, method):
        """Enhanced cleanup with resource verification."""
        try:
            # Clean up test data
            await self._cleanup_test_data()
            
            # Close connections
            await self._db.close()
            await self._cache.close()
            
            # Store test metrics
            self._store_test_metrics()
            
            # Verify cleanup
            assert await self._verify_cleanup()
            
        except Exception as e:
            pytest.fail(f"Teardown failed: {str(e)}")

    @pytest.mark.asyncio
    @pytest.mark.performance
    async def test_generate_artwork_graph_performance(
        self,
        test_artwork: Artwork,
        performance_metrics: Dict[str, Any]
    ):
        """
        Tests artwork graph generation with comprehensive performance monitoring.
        """
        with self._generation_time.time():
            try:
                # Generate graph
                graph = await self._generator.generate_artwork_graph(
                    artwork_id=test_artwork.uuid,
                    depth=TEST_DEPTH
                )

                # Verify graph structure
                assert graph is not None
                assert 'nodes' in graph
                assert 'relationships' in graph
                assert len(graph['nodes']) > 0
                assert len(graph['relationships']) > 0

                # Validate graph integrity
                await self._validate_graph_integrity(graph)

                # Check performance metrics
                generation_time = performance_metrics['generation_time']
                assert generation_time < PERFORMANCE_THRESHOLD_MS

                # Verify memory usage
                memory_usage = performance_metrics['memory_usage']
                assert memory_usage < MAX_MEMORY_USAGE_MB

                # Validate data integration
                await self._validate_data_integration(graph)

            except Exception as e:
                pytest.fail(f"Graph generation failed: {str(e)}")

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_expand_graph_integration(
        self,
        test_graph: Dict[str, Any]
    ):
        """
        Tests graph expansion with integration validation.
        """
        try:
            # Expand graph
            expanded_graph = await self._generator.expand_graph(
                graph_id=test_graph['id'],
                expansion_type='ARTIST',
                options={'max_nodes': 10}
            )

            # Validate expansion
            assert expanded_graph is not None
            assert len(expanded_graph['nodes']) > len(test_graph['nodes'])
            
            # Verify relationships
            await self._verify_relationships(expanded_graph)

            # Check cache updates
            cache_key = f"graph:{test_graph['id']}"
            cached_data = await self._cache.get(cache_key)
            assert cached_data is not None

        except Exception as e:
            pytest.fail(f"Graph expansion failed: {str(e)}")

    @pytest.mark.asyncio
    @pytest.mark.security
    async def test_graph_security_validation(
        self,
        test_artwork: Artwork
    ):
        """
        Tests graph generation security constraints.
        """
        try:
            # Generate graph with security context
            graph = await self._generator.generate_artwork_graph(
                artwork_id=test_artwork.uuid,
                depth=TEST_DEPTH,
                options={'security_level': 'restricted'}
            )

            # Validate security constraints
            await self._validate_security_constraints(graph)

            # Check node permissions
            for node in graph['nodes']:
                assert 'security_level' in node
                assert node['security_level'] in ['public', 'restricted']

            # Verify relationship constraints
            for rel in graph['relationships']:
                assert 'created_by' in rel
                assert 'last_modified' in rel

        except Exception as e:
            pytest.fail(f"Security validation failed: {str(e)}")

    @pytest.mark.asyncio
    @pytest.mark.stress
    async def test_parallel_graph_generation(self):
        """
        Tests parallel graph generation with load testing.
        """
        try:
            # Create test artworks
            test_artworks = await self._create_test_artworks(PARALLEL_TEST_COUNT)

            # Generate graphs in parallel
            tasks = [
                self._generator.generate_artwork_graph(
                    artwork_id=artwork.uuid,
                    depth=TEST_DEPTH
                )
                for artwork in test_artworks
            ]

            # Execute parallel generation
            results = await asyncio.gather(*tasks)

            # Validate results
            for graph in results:
                assert graph is not None
                assert len(graph['nodes']) > 0
                assert len(graph['relationships']) > 0

            # Check resource usage
            await self._verify_resource_usage()

        except Exception as e:
            pytest.fail(f"Parallel generation failed: {str(e)}")

    async def _validate_graph_integrity(self, graph: Dict[str, Any]):
        """Validates graph structure integrity."""
        # Create NetworkX graph for validation
        G = nx.Graph()
        
        # Add nodes and edges
        for node in graph['nodes']:
            G.add_node(node['uuid'], **node)
        
        for rel in graph['relationships']:
            G.add_edge(
                rel['source_node'],
                rel['target_node'],
                **rel
            )

        # Verify connectivity
        assert nx.is_connected(G)
        
        # Validate node properties
        for node in G.nodes():
            node_data = G.nodes[node]
            assert 'type' in node_data
            assert 'properties' in node_data

    async def _validate_data_integration(self, graph: Dict[str, Any]):
        """Validates data integration from external sources."""
        for node in graph['nodes']:
            if 'external_refs' in node:
                for ref in node['external_refs']:
                    assert 'source' in ref
                    assert 'id' in ref
                    assert ref['source'] in ['getty', 'wikidata', 'google_arts']

    async def _verify_relationships(self, graph: Dict[str, Any]):
        """Verifies relationship integrity and constraints."""
        for rel in graph['relationships']:
            # Verify required fields
            assert 'type' in rel
            assert 'source_node' in rel
            assert 'target_node' in rel
            
            # Validate relationship type
            assert rel['type'] in Relationship.RELATIONSHIP_TYPES
            
            # Check property constraints
            if rel['type'] in Relationship.REQUIRED_PROPERTIES:
                required_props = Relationship.REQUIRED_PROPERTIES[rel['type']]
                for prop in required_props:
                    assert prop in rel['properties']

    async def _validate_security_constraints(self, graph: Dict[str, Any]):
        """Validates security constraints on graph data."""
        for node in graph['nodes']:
            # Check security level
            assert 'security_level' in node
            assert node['security_level'] in ['public', 'restricted', 'private']
            
            # Verify audit fields
            assert 'created_by' in node
            assert 'last_modified' in node
            assert 'version' in node

    async def _verify_resource_usage(self):
        """Verifies resource usage within limits."""
        # Check memory usage
        memory_usage = self._memory_usage.collect()[0].samples[0].value
        assert memory_usage < MAX_MEMORY_USAGE_MB

        # Verify connection pools
        assert self._db._connection_metrics['active_sessions'] <= 10
        assert self._cache.connection_pool.size <= 20

    async def _store_test_metrics(self):
        """Stores test metrics for analysis."""
        metrics = {
            'total_tests': len(self._metrics.collect()),
            'failed_tests': 0,
            'average_generation_time': 0,
            'peak_memory_usage': 0
        }
        
        for metric in self._metrics.collect():
            if metric.name == 'graph_generation_duration_seconds':
                metrics['average_generation_time'] = metric.samples[0].value
            elif metric.name == 'graph_generation_memory_mb':
                metrics['peak_memory_usage'] = metric.samples[0].value

        # Store metrics for analysis
        await self._cache.set('test_metrics', metrics)

    async def _verify_cleanup(self) -> bool:
        """Verifies complete cleanup of test resources."""
        try:
            # Check database cleanup
            assert await self._db.execute_query(
                "MATCH (n) WHERE n.test = true RETURN count(n)",
                {}
            )[0]['count'] == 0

            # Verify cache cleanup
            assert await self._cache.dbsize() == 0

            return True
        except Exception:
            return False