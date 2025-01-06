/**
 * @fileoverview Graph API service module for interacting with the Graph Service backend.
 * Provides functions for generating, manipulating, and analyzing art knowledge graphs.
 * @version 1.0.0
 */

import axios, { AxiosError } from 'axios'; // v1.4.0
import { 
  GraphData, 
  GraphResponse, 
  Node, 
  NodeType,
  GraphError,
  isNode,
  isRelationship 
} from '../../types/graph';
import { createDefaultHeaders, APIErrorResponse } from '../../types/api';

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL + '/api/v1/graph';
const DEFAULT_GRAPH_DEPTH = 2;
const REQUEST_TIMEOUT = 5000;
const MAX_RETRIES = 3;
const CACHE_TTL = 300000; // 5 minutes

// Cache implementation
const graphCache = new Map<string, { data: GraphResponse; timestamp: number }>();

/**
 * Custom error class for graph operations
 */
class GraphServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'GraphServiceError';
  }
}

/**
 * Validates cache entry freshness
 */
function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_TTL;
}

/**
 * Generates a new knowledge graph centered around an artwork
 */
export async function generateGraph(
  artworkId: string,
  depth: number = DEFAULT_GRAPH_DEPTH,
  options: {
    timeout?: number;
    cache?: boolean;
    signal?: AbortSignal;
  } = {}
): Promise<GraphResponse> {
  const cacheKey = `graph:${artworkId}:${depth}`;
  
  // Check cache if enabled
  if (options.cache !== false) {
    const cached = graphCache.get(cacheKey);
    if (cached && isCacheValid(cached.timestamp)) {
      return cached.data;
    }
  }

  try {
    const response = await axios.post<GraphResponse>(
      `${API_BASE_URL}/generate`,
      {
        artworkId,
        depth,
      },
      {
        headers: createDefaultHeaders(),
        timeout: options.timeout || REQUEST_TIMEOUT,
        signal: options.signal,
        validateStatus: status => status === 200,
      }
    );

    // Validate response data
    if (!response.data.data.nodes.every(isNode) || 
        !response.data.data.relationships.every(isRelationship)) {
      throw new GraphServiceError(
        'Invalid graph data received',
        'INVALID_RESPONSE'
      );
    }

    // Cache the result if caching is enabled
    if (options.cache !== false) {
      graphCache.set(cacheKey, {
        data: response.data,
        timestamp: Date.now(),
      });
    }

    return response.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      throw new GraphServiceError(
        error.response?.data?.message || 'Failed to generate graph',
        error.response?.data?.code || 'NETWORK_ERROR',
        error.response?.data?.details
      );
    }
    throw error;
  }
}

/**
 * Expands an existing graph with additional nodes and relationships
 */
export async function expandGraph(
  graphId: string,
  expansionType: string,
  options: {
    timeout?: number;
    signal?: AbortSignal;
  } = {}
): Promise<GraphResponse> {
  let retries = 0;
  
  while (retries < MAX_RETRIES) {
    try {
      const response = await axios.post<GraphResponse>(
        `${API_BASE_URL}/${graphId}/expand`,
        { expansionType },
        {
          headers: createDefaultHeaders(),
          timeout: options.timeout || REQUEST_TIMEOUT,
          signal: options.signal,
        }
      );

      // Invalidate cache for this graph
      const cachePattern = new RegExp(`^graph:${graphId}`);
      for (const key of graphCache.keys()) {
        if (cachePattern.test(key)) {
          graphCache.delete(key);
        }
      }

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 429) {
        retries++;
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        continue;
      }
      throw new GraphServiceError(
        'Failed to expand graph',
        'EXPANSION_ERROR',
        { graphId, expansionType }
      );
    }
  }

  throw new GraphServiceError(
    'Max retries exceeded while expanding graph',
    'MAX_RETRIES_EXCEEDED'
  );
}

/**
 * Retrieves detailed information about a specific node
 */
export async function getNodeDetails(
  nodeId: string,
  options: { cache?: boolean } = {}
): Promise<Node> {
  const cacheKey = `node:${nodeId}`;

  if (options.cache !== false) {
    const cached = graphCache.get(cacheKey);
    if (cached && isCacheValid(cached.timestamp)) {
      return cached.data as unknown as Node;
    }
  }

  try {
    const response = await axios.get<Node>(
      `${API_BASE_URL}/nodes/${nodeId}`,
      {
        headers: createDefaultHeaders(),
        timeout: REQUEST_TIMEOUT,
      }
    );

    if (!isNode(response.data)) {
      throw new GraphServiceError(
        'Invalid node data received',
        'INVALID_NODE_DATA'
      );
    }

    if (options.cache !== false) {
      graphCache.set(cacheKey, {
        data: response.data,
        timestamp: Date.now(),
      });
    }

    return response.data;
  } catch (error) {
    throw new GraphServiceError(
      'Failed to fetch node details',
      'NODE_FETCH_ERROR',
      { nodeId }
    );
  }
}

/**
 * Updates the visual position of a node in the graph layout
 */
export async function updateNodePosition(
  nodeId: string,
  position: { x: number; y: number }
): Promise<void> {
  try {
    await axios.patch(
      `${API_BASE_URL}/nodes/${nodeId}/position`,
      position,
      {
        headers: createDefaultHeaders(),
        timeout: REQUEST_TIMEOUT,
      }
    );

    // Update position in cache if present
    const cacheKey = `node:${nodeId}`;
    const cached = graphCache.get(cacheKey);
    if (cached) {
      const updatedNode = {
        ...cached.data,
        properties: {
          ...cached.data.properties,
          position,
        },
      };
      graphCache.set(cacheKey, {
        data: updatedNode,
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    throw new GraphServiceError(
      'Failed to update node position',
      'POSITION_UPDATE_ERROR',
      { nodeId, position }
    );
  }
}

/**
 * Exports the current graph in specified format
 */
export async function exportGraph(
  graphId: string,
  format: 'png' | 'pdf' | 'json',
  options: {
    onProgress?: (progress: number) => void;
  } = {}
): Promise<string> {
  try {
    const response = await axios.post<{ exportUrl: string }>(
      `${API_BASE_URL}/${graphId}/export`,
      { format },
      {
        headers: createDefaultHeaders(),
        timeout: REQUEST_TIMEOUT * 2,
        onDownloadProgress: progressEvent => {
          if (options.onProgress && progressEvent.total) {
            const progress = (progressEvent.loaded / progressEvent.total) * 100;
            options.onProgress(progress);
          }
        },
      }
    );

    return response.data.exportUrl;
  } catch (error) {
    throw new GraphServiceError(
      'Failed to export graph',
      'EXPORT_ERROR',
      { graphId, format }
    );
  }
}