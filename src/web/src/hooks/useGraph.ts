/**
 * @fileoverview Custom React hook for managing art knowledge graph visualization
 * Provides unified interface for graph operations, real-time updates, and optimized performance
 * @version 1.0.0
 */

import { useRef, useEffect, useCallback, useState, useMemo } from 'react'; // v18.0.0
import { useDispatch, useSelector } from 'react-redux'; // v8.0.0
import { GraphService } from '../services/graph';
import {
  Graph,
  GraphNode,
  GraphLayoutType,
  GraphExportFormat,
  TouchGesture,
  PerformanceMetrics
} from '../types/graph';
import {
  graphActions,
  graphSelectors,
  graphCache
} from '../store/slices/graphSlice';

// Performance optimization constants
const PERFORMANCE_CONFIG = {
  enableMonitoring: true,
  sampleRate: 1000,
  errorThreshold: 100,
  frameRateTarget: 60
};

// Touch interaction constants
const TOUCH_CONFIG = {
  minZoom: 0.5,
  maxZoom: 3.0,
  doubleTapDelay: 300,
  longPressDelay: 500,
  touchFeedbackDuration: 150
};

// Cache configuration
const CACHE_CONFIG = {
  maxSize: 1000,
  ttl: 5 * 60 * 1000 // 5 minutes
};

interface UseGraphOptions {
  enableTouchOptimization?: boolean;
  enablePerformanceMonitoring?: boolean;
  cacheEnabled?: boolean;
  onError?: (error: Error) => void;
  onPerformanceData?: (metrics: PerformanceMetrics) => void;
}

/**
 * Custom hook for managing graph visualization with optimized performance
 */
export function useGraph(
  containerRef: React.RefObject<HTMLElement>,
  graphId: string,
  options: UseGraphOptions = {}
) {
  const dispatch = useDispatch();
  const graphService = useRef<GraphService | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    renderTime: 0,
    nodeCount: 0,
    edgeCount: 0,
    interactionLatency: 0
  });

  // Memoized selectors
  const graph = useSelector(graphSelectors.selectGraphWithError);
  const layout = useSelector(graphSelectors.selectGraphLayout);
  const optimisticUpdates = useSelector(graphSelectors.selectOptimisticUpdates);

  // Initialize graph service with performance monitoring
  useEffect(() => {
    if (!containerRef.current || !graphId) return;

    try {
      graphService.current = new GraphService(
        containerRef.current,
        {
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
          zoom: 1,
          scale: 1,
          translation: { x: 0, y: 0 },
          rotation: 0,
          touchEnabled: options.enableTouchOptimization ?? true,
          center: {
            x: containerRef.current.clientWidth / 2,
            y: containerRef.current.clientHeight / 2
          }
        },
        {
          enableMonitoring: options.enablePerformanceMonitoring ?? true,
          sampleRate: PERFORMANCE_CONFIG.sampleRate,
          errorThreshold: PERFORMANCE_CONFIG.errorThreshold,
          onPerformanceData: handlePerformanceData
        }
      );

      // Initialize graph with cached data if available
      const cachedData = options.cacheEnabled ? 
        graphCache.getCacheEntry(graphId) : null;

      if (cachedData) {
        graphService.current.initialize(cachedData);
      } else {
        loadGraph();
      }

      return () => {
        graphService.current?.destroy();
        graphService.current = null;
      };
    } catch (err) {
      handleError(err);
    }
  }, [containerRef, graphId]);

  // Handle graph loading
  const loadGraph = useCallback(async () => {
    if (!graphId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await dispatch(graphActions.generateGraphThunk({
        artworkId: graphId,
        depth: 2,
        options: {
          timeout: 5000,
          retryAttempts: 3
        }
      }));

      if (response.payload && graphService.current) {
        await graphService.current.initialize(response.payload.data);
        
        if (options.cacheEnabled) {
          graphCache.setCacheEntry(graphId, response.payload.data);
        }
      }
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }, [graphId, dispatch]);

  // Handle node position updates with optimistic updates
  const updateNodePosition = useCallback(async (
    nodeId: string,
    position: { x: number; y: number }
  ) => {
    try {
      if (!graphService.current) return;

      // Optimistic update
      dispatch(graphActions.updateNodeLocal({
        nodeId,
        updates: { position }
      }));

      // Persist update
      await dispatch(graphActions.updateNodePositionThunk({
        nodeId,
        position
      }));

      graphService.current.updateGraph(graph.graph!);
    } catch (err) {
      handleError(err);
    }
  }, [dispatch, graph]);

  // Handle touch gestures with haptic feedback
  const handleTouchGesture = useCallback((
    gesture: TouchGesture,
    event: TouchEvent
  ) => {
    try {
      if (!graphService.current) return;

      graphService.current.handleTouchGesture(gesture, event);

      // Trigger haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate(TOUCH_CONFIG.touchFeedbackDuration);
      }
    } catch (err) {
      handleError(err);
    }
  }, []);

  // Reset view to initial state
  const resetView = useCallback(() => {
    try {
      if (!graphService.current || !containerRef.current) return;

      graphService.current.updateGraph(graph.graph!, {
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
        zoom: 1,
        scale: 1,
        translation: { x: 0, y: 0 },
        rotation: 0
      });
    } catch (err) {
      handleError(err);
    }
  }, [graph]);

  // Optimize rendering performance
  const optimizeRendering = useCallback(() => {
    if (!graphService.current) return;

    graphService.current.optimizeRendering({
      frameRateTarget: PERFORMANCE_CONFIG.frameRateTarget,
      enableCulling: true,
      batchSize: 100
    });
  }, []);

  // Handle performance monitoring
  const handlePerformanceData = useCallback((data: PerformanceMetrics) => {
    setMetrics(data);
    options.onPerformanceData?.(data);
  }, [options]);

  // Handle errors
  const handleError = useCallback((err: any) => {
    const error = err instanceof Error ? err : new Error(String(err));
    setError(error);
    options.onError?.(error);
  }, [options]);

  // Export graph to various formats
  const exportGraph = useCallback(async (format: GraphExportFormat) => {
    try {
      if (!graphService.current) return;

      const exportData = await graphService.current.exportGraph(format);
      return exportData;
    } catch (err) {
      handleError(err);
      return null;
    }
  }, []);

  return {
    graph: graph.graph,
    loading,
    error,
    metrics,
    updateNodePosition,
    exportGraph,
    handleTouchGesture,
    resetView,
    optimizeRendering
  };
}