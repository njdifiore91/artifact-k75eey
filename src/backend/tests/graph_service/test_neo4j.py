import pytest
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List

from graph_service.services.neo4j import GraphDatabaseService
from shared.database.neo4j import Neo4jConnection

# Test constants
TEST_ARTWORK_ID = "test-artwork-123"
TEST_DEPTH = 2
TEST_MIN_SIMILARITY = 0.7
TEST_TIMEOUT_MS = 500
TEST_BATCH_SIZE = 100

@pytest.fixture
async def neo4j_connection():
    """Fixture providing test database connection with isolation."""
    connection = Neo4jConnection(settings=None)  # Mock settings for testing
    yield connection
    await connection.close()

@pytest.fixture
async def test_artwork():
    """Fixture providing test artwork data."""
    return {
        "uuid": TEST_ARTWORK_ID,
        "type": "ARTWORK",
        "title": "Test Artwork",
        "artist": "Test Artist",
        "year": 2023,
        "medium": "oil on canvas",
        "properties": {
            "style": "contemporary",
            "dimensions": "100x100cm"
        }
    }

@pytest.fixture
async def test_graph():
    """Fixture providing test graph structure."""
    return {
        "nodes": [
            {
                "uuid": TEST_ARTWORK_ID,
                "type": "ARTWORK",
                "properties": {"title": "Test Artwork"}
            },
            {
                "uuid": "artist-123",
                "type": "ARTIST",
                "properties": {"name": "Test Artist"}
            },
            {
                "uuid": "movement-123",
                "type": "MOVEMENT",
                "properties": {"name": "Test Movement"}
            }
        ],
        "relationships": [
            {
                "source": TEST_ARTWORK_ID,
                "target": "artist-123",
                "type": "CREATED_BY",
                "properties": {
                    "year": 2023,
                    "confidence": 1.0
                }
            },
            {
                "source": TEST_ARTWORK_ID,
                "target": "movement-123",
                "type": "BELONGS_TO",
                "properties": {
                    "confidence": 0.9
                }
            }
        ]
    }

class TestGraphDatabaseService:
    """Test class for comprehensive GraphDatabaseService functionality validation."""

    async def setup_method(self, method):
        """Setup method run before each test to ensure clean state."""
        self._db = await neo4j_connection()
        self._service = GraphDatabaseService(db=self._db)
        self._test_data = {}
        self._cleanup_queries = []
        
        # Clear existing test data
        cleanup_query = """
        MATCH (n)
        WHERE n.uuid STARTS WITH 'test-'
        DETACH DELETE n
        """
        await self._db.execute_query(cleanup_query, {}, write=True)

    async def teardown_method(self, method):
        """Cleanup method run after each test to reset state."""
        # Execute all cleanup queries
        for query in self._cleanup_queries:
            try:
                await self._db.execute_query(query, {}, write=True)
            except Exception as e:
                print(f"Cleanup error: {str(e)}")
        
        # Close database connection
        await self._db.close()

    @pytest.mark.asyncio
    @pytest.mark.timeout(2)
    @pytest.mark.performance
    async def test_get_artwork_subgraph(self, neo4j_connection, test_artwork):
        """Tests retrieval of artwork subgraph with specified depth and validates performance."""
        # Create test artwork node
        create_query = """
        CREATE (a:Node {uuid: $uuid, type: $type, properties: $properties})
        RETURN a
        """
        await neo4j_connection.execute_query(
            create_query,
            parameters=test_artwork,
            write=True
        )
        self._cleanup_queries.append(
            f"MATCH (n {{uuid: '{test_artwork['uuid']}'}}) DETACH DELETE n"
        )

        # Test subgraph retrieval with performance monitoring
        start_time = datetime.now(timezone.utc)
        result = await self._service.get_artwork_subgraph(
            artwork_id=test_artwork['uuid'],
            depth=TEST_DEPTH
        )

        # Validate performance requirements
        execution_time = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        assert execution_time < TEST_TIMEOUT_MS, f"Query exceeded timeout: {execution_time}ms"

        # Validate subgraph structure
        assert result is not None
        assert 'nodes' in result
        assert 'relationships' in result
        assert any(n['uuid'] == test_artwork['uuid'] for n in result['nodes'])

    @pytest.mark.asyncio
    @pytest.mark.timeout(3)
    @pytest.mark.performance
    async def test_find_related_artworks(self, neo4j_connection, test_graph):
        """Tests finding artworks related to a given artwork with similarity scoring."""
        # Create test graph structure
        for node in test_graph['nodes']:
            create_node_query = """
            CREATE (n:Node {uuid: $uuid, type: $type, properties: $properties})
            """
            await neo4j_connection.execute_query(
                create_node_query,
                parameters=node,
                write=True
            )
            self._cleanup_queries.append(
                f"MATCH (n {{uuid: '{node['uuid']}'}}) DETACH DELETE n"
            )

        # Create relationships
        for rel in test_graph['relationships']:
            create_rel_query = """
            MATCH (source:Node {uuid: $source}), (target:Node {uuid: $target})
            CREATE (source)-[r:$type {properties: $properties}]->(target)
            """
            await neo4j_connection.execute_query(
                create_rel_query,
                parameters=rel,
                write=True
            )

        # Test related artwork search with performance monitoring
        start_time = datetime.now(timezone.utc)
        result = await self._service.find_related_artworks(
            artwork_id=TEST_ARTWORK_ID,
            min_similarity=TEST_MIN_SIMILARITY
        )

        # Validate performance requirements
        execution_time = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        assert execution_time < TEST_TIMEOUT_MS, f"Query exceeded timeout: {execution_time}ms"

        # Validate results
        assert result is not None
        assert isinstance(result, list)
        assert all(r['similarity'] >= TEST_MIN_SIMILARITY for r in result)

    @pytest.mark.asyncio
    @pytest.mark.timeout(1)
    async def test_get_graph_statistics(self, neo4j_connection):
        """Tests retrieval and validation of graph statistics with data integrity checks."""
        # Create test data for statistics
        test_stats_query = """
        CREATE (a:Node {uuid: 'test-stats-1', type: 'ARTWORK'})
        CREATE (b:Node {uuid: 'test-stats-2', type: 'ARTIST'})
        CREATE (a)-[:CREATED_BY]->(b)
        """
        await neo4j_connection.execute_query(test_stats_query, {}, write=True)
        self._cleanup_queries.append(
            "MATCH (n) WHERE n.uuid IN ['test-stats-1', 'test-stats-2'] DETACH DELETE n"
        )

        # Test statistics retrieval
        result = await self._service.get_graph_statistics()

        # Validate statistics
        assert result is not None
        assert 'node_count' in result
        assert 'relationship_count' in result
        assert 'node_types' in result
        assert result['node_count'] > 0
        assert result['relationship_count'] > 0

    @pytest.mark.asyncio
    @pytest.mark.timeout(5)
    @pytest.mark.transaction
    async def test_execute_graph_query(self, neo4j_connection):
        """Tests execution of custom graph queries with transaction management."""
        # Prepare test query
        test_query = """
        CREATE (n:Node {uuid: $uuid, type: $type, properties: $properties})
        RETURN n
        """
        test_params = {
            "uuid": "test-query-1",
            "type": "ARTWORK",
            "properties": {"title": "Test Query"}
        }
        self._cleanup_queries.append(
            "MATCH (n {uuid: 'test-query-1'}) DETACH DELETE n"
        )

        # Test query execution with transaction
        async with neo4j_connection.get_session(write_access=True) as session:
            start_time = datetime.now(timezone.utc)
            result = await self._service.execute_graph_query(
                query=test_query,
                parameters=test_params
            )
            execution_time = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000

            # Validate performance and results
            assert execution_time < TEST_TIMEOUT_MS * 2
            assert result is not None
            assert len(result) == 1
            assert result[0]['n']['uuid'] == test_params['uuid']