/**
 * @fileoverview Redux Toolkit slice for managing graph state in the Art Knowledge Graph application.
 * Implements comprehensive state management for graph operations with error handling and optimistic updates.
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'; // v1.9.0
import { GraphData, GraphLayout, Node, Relationship } from '../../types/graph';
import { APIResponse } from '../../types/api';

// Constants for graph operations
const GRAPH_OPERATION_TIMEOUT = 5000;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 1000;
const DEFAULT_LAYOUT: GraphLayout = {
  width: 1000,
  height: 800,
  zoom: 1.0,
  scale: 1.0,
  translation: { x: 0, y: 0 },
  rotation: 0,
  touchEnabled: true,
  center: { x: 500, y: 400 }
};

// State interface
interface GraphState {
  data: GraphData | null;
  layout: GraphLayout;
  loading: boolean;
  currentOperation: string | null;
  error: {
    code: string;
    message: string;
    details: Record<string, any>;
  } | null;
  optimisticUpdates: Map<string, any>;
  retryCount: number;
  lastUpdated: string;
}

// Initial state
const initialState: GraphState = {
  data: null,
  layout: DEFAULT_LAYOUT,
  loading: false,
  currentOperation: null,
  error: null,
  optimisticUpdates: new Map(),
  retryCount: 0,
  lastUpdated: new Date().toISOString()
};

// Async thunks
export const generateGraphThunk = createAsyncThunk<
  APIResponse<GraphData>,
  { artworkId: string; depth: number; options?: { timeout?: number; retryAttempts?: number } }
>(
  'graph/generate',
  async ({ artworkId, depth, options = {} }, { rejectWithValue }) => {
    const timeout = options.timeout || GRAPH_OPERATION_TIMEOUT;
    const maxRetries = options.retryAttempts || MAX_RETRY_ATTEMPTS;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(`/api/v1/graph/generate/${artworkId}?depth=${depth}`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: APIResponse<GraphData> = await response.json();
        return data;
      } catch (error) {
        attempt++;
        if (attempt === maxRetries) {
          return rejectWithValue({
            code: 'GRAPH_GENERATION_FAILED',
            message: 'Failed to generate graph after multiple attempts',
            details: { error: error.message, attempts: attempt }
          });
        }
        await new Promise(resolve => setTimeout(resolve, RETRY_BACKOFF_MS * attempt));
      }
    }
  }
);

export const updateNodePositionThunk = createAsyncThunk<
  APIResponse<void>,
  { nodeId: string; position: { x: number; y: number } }
>(
  'graph/updateNodePosition',
  async ({ nodeId, position }, { rejectWithValue, getState }) => {
    try {
      const response = await fetch(`/api/v1/graph/nodes/${nodeId}/position`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(position)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue({
        code: 'NODE_UPDATE_FAILED',
        message: 'Failed to update node position',
        details: { nodeId, error: error.message }
      });
    }
  }
);

// Slice definition
const graphSlice = createSlice({
  name: 'graph',
  initialState,
  reducers: {
    setLayout: (state, action: PayloadAction<Partial<GraphLayout>>) => {
      state.layout = { ...state.layout, ...action.payload };
    },
    clearError: (state) => {
      state.error = null;
    },
    resetGraph: (state) => {
      state.data = null;
      state.error = null;
      state.loading = false;
      state.currentOperation = null;
      state.optimisticUpdates.clear();
      state.retryCount = 0;
    },
    updateNodeLocal: (state, action: PayloadAction<{ nodeId: string; updates: Partial<Node> }>) => {
      if (!state.data?.nodes) return;
      const nodeIndex = state.data.nodes.findIndex(node => node.id === action.payload.nodeId);
      if (nodeIndex !== -1) {
        state.data.nodes[nodeIndex] = {
          ...state.data.nodes[nodeIndex],
          ...action.payload.updates
        };
        state.lastUpdated = new Date().toISOString();
      }
    }
  },
  extraReducers: (builder) => {
    builder
      // Generate Graph
      .addCase(generateGraphThunk.pending, (state) => {
        state.loading = true;
        state.currentOperation = 'generate';
        state.error = null;
      })
      .addCase(generateGraphThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.currentOperation = null;
        state.data = action.payload.data;
        state.retryCount = 0;
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(generateGraphThunk.rejected, (state, action) => {
        state.loading = false;
        state.currentOperation = null;
        state.error = action.payload as any;
        state.retryCount += 1;
      })
      // Update Node Position
      .addCase(updateNodePositionThunk.pending, (state, action) => {
        state.optimisticUpdates.set(action.meta.arg.nodeId, {
          type: 'position',
          data: action.meta.arg.position
        });
      })
      .addCase(updateNodePositionThunk.fulfilled, (state, action) => {
        state.optimisticUpdates.delete(action.meta.arg.nodeId);
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(updateNodePositionThunk.rejected, (state, action) => {
        state.optimisticUpdates.delete(action.meta.arg.nodeId);
        state.error = action.payload as any;
      });
  }
});

// Selectors
export const selectGraphWithError = (state: { graph: GraphState }) => ({
  graph: state.graph.data,
  error: state.graph.error
});

export const selectGraphLoadingState = (state: { graph: GraphState }) => ({
  loading: state.graph.loading,
  operation: state.graph.currentOperation
});

export const selectGraphLayout = (state: { graph: GraphState }) => state.graph.layout;

export const selectOptimisticUpdates = (state: { graph: GraphState }) => 
  state.graph.optimisticUpdates;

// Export actions and reducer
export const { setLayout, clearError, resetGraph, updateNodeLocal } = graphSlice.actions;
export default graphSlice.reducer;