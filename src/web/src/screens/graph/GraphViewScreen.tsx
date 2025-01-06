/**
 * @fileoverview Enhanced React screen component for art knowledge graph visualization
 * Implements touch-optimized interactions, progressive loading, and performance monitoring
 * @version 1.0.0
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { debounce } from 'lodash';
import { GraphCanvas } from '../../components/graph/GraphCanvas';
import GraphControls from '../../components/graph/GraphControls';
import Loading from '../../components/common/Loading';
import { useGraph } from '../../hooks/useGraph';
import { GRAPH_DIMENSIONS } from '../../constants/dimensions';
import { GRAPH_ANIMATION } from '../../constants/animations';

// Styled components with touch optimization and accessibility
const ScreenContainer = styled.div`
  position: relative;
  width: 100%;
  height: 100vh;
  background-color: ${({ theme }) => theme.colors.getColor('background')};
  touch-action: none;
  user-select: none;
  overflow: hidden;
  contain: layout size paint;

  @media (prefers-reduced-motion: reduce) {
    * {
      animation: none !important;
      transition: none !important;
    }
  }
`;

const GraphContainer = styled.div`
  position: relative;
  flex: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;
  transform-origin: center;
  will-change: transform;
  contain: layout size paint;

  @media (hover: none) {
    touch-action: none;
  }
`;

const ErrorMessage = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  background-color: ${({ theme }) => theme.colors.getColor('surface')};
  border-radius: 8px;
  box-shadow: 0 4px 12px ${({ theme }) => theme.colors.getColor('overlay')};
  color: ${({ theme }) => theme.colors.getColor('error')};
  text-align: center;
`;

interface GraphViewScreenProps {
  className?: string;
}

export const GraphViewScreen: React.FC<GraphViewScreenProps> = ({ className }) => {
  const { id: graphId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Initialize graph hook with performance monitoring
  const {
    graph,
    loading,
    error,
    metrics,
    updateNodePosition,
    exportGraph,
    handleTouchGesture,
    resetView,
    optimizeRendering
  } = useGraph(containerRef, graphId!, {
    enableTouchOptimization: true,
    enablePerformanceMonitoring: true,
    cacheEnabled: true,
    onError: (error) => console.error('Graph error:', error),
    onPerformanceData: (data) => console.debug('Performance metrics:', data)
  });

  // Handle container resize with debouncing
  const handleResize = useCallback(
    debounce(() => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
        optimizeRendering();
      }
    }, 100),
    []
  );

  // Initialize resize observer
  useEffect(() => {
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [handleResize]);

  // Handle node selection with haptic feedback
  const handleNodeSelect = useCallback((nodeId: string) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
    navigate(`/graph/${graphId}/node/${nodeId}`);
  }, [graphId, navigate]);

  // Handle graph export
  const handleExport = useCallback(async (format: 'PNG' | 'SVG' | 'JSON') => {
    try {
      const exportData = await exportGraph(format);
      if (exportData) {
        // Handle successful export
        if ('vibrate' in navigator) {
          navigator.vibrate([50, 50]);
        }
      }
    } catch (error) {
      console.error('Export error:', error);
    }
  }, [exportGraph]);

  // Memoized graph controls props
  const controlsProps = useMemo(() => ({
    onZoomIn: () => handleTouchGesture('zoomIn', null as any),
    onZoomOut: () => handleTouchGesture('zoomOut', null as any),
    onReset: resetView,
    onExport: handleExport,
    zoomLevel: metrics?.zoom || 1,
    minZoom: GRAPH_DIMENSIONS.MIN_ZOOM,
    maxZoom: GRAPH_DIMENSIONS.MAX_ZOOM,
    isLoading: loading,
    onError: (error: Error) => console.error('Controls error:', error)
  }), [handleTouchGesture, resetView, handleExport, metrics, loading]);

  if (error) {
    return (
      <ErrorMessage role="alert">
        Failed to load graph: {error.message}
      </ErrorMessage>
    );
  }

  return (
    <ScreenContainer 
      className={className}
      ref={containerRef}
      role="main"
      aria-label="Art knowledge graph visualization"
    >
      {loading ? (
        <Loading 
          size="large"
          label="Loading graph visualization..."
          timeout={10000}
        />
      ) : (
        <GraphContainer>
          <GraphCanvas
            graphData={graph!}
            width={dimensions.width}
            height={dimensions.height}
            onNodeSelect={handleNodeSelect}
            performanceMode={true}
            accessibilityEnabled={true}
            progressiveLoading={true}
            touchConfig={{
              enablePinchZoom: true,
              enablePan: true,
              enableDoubleTap: true,
              enableLongPress: true,
              touchFeedback: true
            }}
          />
          <GraphControls {...controlsProps} />
        </GraphContainer>
      )}
    </ScreenContainer>
  );
};

export default GraphViewScreen;