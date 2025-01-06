/**
 * @fileoverview Enhanced React component for rendering interactive art knowledge graphs
 * with touch support, performance optimization, and progressive rendering
 * @version 1.0.0
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3'; // v7.0.0
import Hammer from 'hammerjs'; // v2.0.8
import { GraphData, Node, Relationship } from '../../types/graph';
import { GraphRenderer } from '../../services/graph/renderer';
import { GraphInteractionManager } from '../../services/graph/interaction';
import { GraphLayoutManager } from '../../services/graph/layout';

/**
 * Interface for touch interaction configuration
 */
interface TouchInteractionConfig {
  enablePinchZoom?: boolean;
  enablePan?: boolean;
  enableDoubleTap?: boolean;
  enableLongPress?: boolean;
  touchFeedback?: boolean;
}

/**
 * Interface for graph canvas component props
 */
interface GraphCanvasProps {
  graphData: GraphData;
  width: number;
  height: number;
  onNodeSelect?: (nodeId: string) => void;
  onEdgeSelect?: (edgeId: string) => void;
  className?: string;
  performanceMode?: boolean;
  accessibilityEnabled?: boolean;
  progressiveLoading?: boolean;
  touchConfig?: TouchInteractionConfig;
}

/**
 * Interface for graph canvas state
 */
interface GraphCanvasState {
  isLoading: boolean;
  error: Error | null;
  renderProgress: number;
  fps: number;
}

/**
 * Custom hook for managing graph renderer lifecycle
 */
const useGraphRenderer = (
  containerRef: React.RefObject<HTMLDivElement>,
  graphData: GraphData,
  options: {
    width: number;
    height: number;
    performanceMode?: boolean;
    progressiveLoading?: boolean;
  }
) => {
  const rendererRef = useRef<GraphRenderer | null>(null);
  const layoutManagerRef = useRef<GraphLayoutManager | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize layout manager
    const layout = {
      width: options.width,
      height: options.height,
      zoom: 1,
      scale: 1,
      translation: { x: 0, y: 0 },
      rotation: 0,
      touchEnabled: true,
      center: { x: options.width / 2, y: options.height / 2 }
    };

    layoutManagerRef.current = new GraphLayoutManager(graphData, layout);

    // Initialize renderer
    rendererRef.current = new GraphRenderer(
      containerRef.current,
      layoutManagerRef.current
    );

    if (options.performanceMode) {
      rendererRef.current.setPerformanceMode(true);
    }

    if (options.progressiveLoading) {
      rendererRef.current.enableProgressiveRendering();
    }

    // Initial graph render
    rendererRef.current.updateGraph(graphData);

    return () => {
      rendererRef.current?.destroy();
      layoutManagerRef.current?.destroy();
    };
  }, [containerRef, options.width, options.height]);

  // Update graph when data changes
  useEffect(() => {
    rendererRef.current?.updateGraph(graphData);
  }, [graphData]);

  return rendererRef.current;
};

/**
 * Enhanced graph visualization component with touch support and performance optimization
 */
export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  graphData,
  width,
  height,
  onNodeSelect,
  onEdgeSelect,
  className = '',
  performanceMode = false,
  accessibilityEnabled = true,
  progressiveLoading = true,
  touchConfig = {
    enablePinchZoom: true,
    enablePan: true,
    enableDoubleTap: true,
    enableLongPress: true,
    touchFeedback: true
  }
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<GraphCanvasState>({
    isLoading: true,
    error: null,
    renderProgress: 0,
    fps: 0
  });

  // Initialize graph renderer
  const renderer = useGraphRenderer(containerRef, graphData, {
    width,
    height,
    performanceMode,
    progressiveLoading
  });

  // Initialize interaction manager
  useEffect(() => {
    if (!containerRef.current || !renderer) return;

    const interactionManager = new GraphInteractionManager(
      containerRef.current,
      renderer['layoutManager'],
      {
        onNodeSelect: (node: Node) => onNodeSelect?.(node.id),
        onZoomChange: (scale: number) => {
          // Handle zoom changes
        },
        enableMultiSelect: false,
        touchFeedback: touchConfig.touchFeedback
      }
    );

    // Configure touch interactions
    if (touchConfig.enablePinchZoom || touchConfig.enablePan) {
      interactionManager.setupTouchHandlers();
    }

    // Configure accessibility
    if (accessibilityEnabled) {
      interactionManager.enableAccessibility();
    }

    return () => {
      interactionManager.destroy();
    };
  }, [renderer, touchConfig, accessibilityEnabled]);

  // Monitor performance
  useEffect(() => {
    let frameId: number;
    const measurePerformance = () => {
      if (renderer) {
        const metrics = renderer.getPerformanceMetrics();
        setState(prev => ({
          ...prev,
          fps: metrics.fps,
          renderProgress: metrics.renderProgress
        }));
      }
      frameId = requestAnimationFrame(measurePerformance);
    };

    frameId = requestAnimationFrame(measurePerformance);
    return () => cancelAnimationFrame(frameId);
  }, [renderer]);

  // Error boundary handler
  const handleError = useCallback((error: Error) => {
    setState(prev => ({ ...prev, error, isLoading: false }));
    console.error('Graph rendering error:', error);
  }, []);

  // Memoized container style
  const containerStyle = useMemo(() => ({
    width: `${width}px`,
    height: `${height}px`,
    position: 'relative' as const,
    overflow: 'hidden' as const
  }), [width, height]);

  // Render loading state
  if (state.isLoading && progressiveLoading) {
    return (
      <div
        ref={containerRef}
        className={`graph-canvas-loading ${className}`}
        style={containerStyle}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={state.renderProgress}
      >
        <div className="loading-indicator">
          Loading Graph ({Math.round(state.renderProgress)}%)
        </div>
      </div>
    );
  }

  // Render error state
  if (state.error) {
    return (
      <div
        className={`graph-canvas-error ${className}`}
        style={containerStyle}
        role="alert"
      >
        <div className="error-message">
          Failed to render graph: {state.error.message}
        </div>
      </div>
    );
  }

  // Render graph canvas
  return (
    <div
      ref={containerRef}
      className={`graph-canvas ${className}`}
      style={containerStyle}
      role="application"
      aria-label="Art Knowledge Graph Visualization"
      tabIndex={0}
    >
      {performanceMode && (
        <div className="performance-indicator" aria-hidden="true">
          {Math.round(state.fps)} FPS
        </div>
      )}
    </div>
  );
};

export type { GraphCanvasProps, TouchInteractionConfig };