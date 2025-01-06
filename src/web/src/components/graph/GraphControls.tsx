import React, { useState, useCallback, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { debounce } from 'lodash'; // v4.17.21
import Button from '../common/Button';
import GraphFilter from './GraphFilter';
import { useGraph } from '../../hooks/useGraph';

// Styled components with enhanced accessibility and touch optimization
const ControlsContainer = styled.div`
  position: absolute;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: ${({ theme }) => theme.colors.getColor('surface', 0.9)};
  backdrop-filter: blur(8px);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 4px 12px ${({ theme }) => theme.colors.getColor('overlay')};
  transform: translateZ(0);
  will-change: transform;
  z-index: 100;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  @supports not (backdrop-filter: blur(8px)) {
    background: ${({ theme }) => theme.colors.getColor('surface')};
  }
`;

const ControlButton = styled(Button)`
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: manipulation;
  user-select: none;
  transition: transform 0.2s ease;

  @media (hover: hover) {
    &:hover:not(:disabled) {
      transform: scale(1.05);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

// Props interface with comprehensive type safety
interface GraphControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onExport: (format: ExportFormat) => Promise<void>;
  zoomLevel: number;
  minZoom: number;
  maxZoom: number;
  isLoading: boolean;
  onError: (error: Error) => void;
  enableHaptics?: boolean;
}

type ExportFormat = 'PNG' | 'SVG' | 'JSON';

export const GraphControls: React.FC<GraphControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onReset,
  onExport,
  zoomLevel,
  minZoom,
  maxZoom,
  isLoading,
  onError,
  enableHaptics = true
}) => {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const { performanceMetrics } = useGraph();

  // Debounced zoom handlers for performance
  const handleZoomIn = useCallback(
    debounce(() => {
      try {
        if (zoomLevel < maxZoom) {
          if (enableHaptics && 'vibrate' in navigator) {
            navigator.vibrate(50);
          }
          onZoomIn();
        }
      } catch (error) {
        onError(error as Error);
      }
    }, 100),
    [zoomLevel, maxZoom, onZoomIn, enableHaptics, onError]
  );

  const handleZoomOut = useCallback(
    debounce(() => {
      try {
        if (zoomLevel > minZoom) {
          if (enableHaptics && 'vibrate' in navigator) {
            navigator.vibrate(50);
          }
          onZoomOut();
        }
      } catch (error) {
        onError(error as Error);
      }
    }, 100),
    [zoomLevel, minZoom, onZoomOut, enableHaptics, onError]
  );

  const handleFilterToggle = useCallback(() => {
    setIsFilterOpen(prev => !prev);
    if (enableHaptics && 'vibrate' in navigator) {
      navigator.vibrate(50);
    }
  }, [enableHaptics]);

  const handleExport = useCallback(async (format: ExportFormat) => {
    try {
      if (enableHaptics && 'vibrate' in navigator) {
        navigator.vibrate([50, 50, 50]);
      }
      await onExport(format);
    } catch (error) {
      onError(error as Error);
    }
  }, [onExport, enableHaptics, onError]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;

      switch (event.key) {
        case '=':
        case '+':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            handleZoomIn();
          }
          break;
        case '-':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            handleZoomOut();
          }
          break;
        case '0':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            onReset();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleZoomIn, handleZoomOut, onReset]);

  return (
    <ControlsContainer ref={controlsRef} role="toolbar" aria-label="Graph controls">
      <ControlButton
        onClick={handleZoomIn}
        disabled={isLoading || zoomLevel >= maxZoom}
        aria-label="Zoom in"
        aria-disabled={zoomLevel >= maxZoom}
      >
        +
      </ControlButton>
      
      <ControlButton
        onClick={handleZoomOut}
        disabled={isLoading || zoomLevel <= minZoom}
        aria-label="Zoom out"
        aria-disabled={zoomLevel <= minZoom}
      >
        -
      </ControlButton>
      
      <ControlButton
        onClick={onReset}
        disabled={isLoading}
        aria-label="Reset view"
      >
        ↺
      </ControlButton>
      
      <ControlButton
        onClick={handleFilterToggle}
        disabled={isLoading}
        aria-label="Toggle filters"
        aria-expanded={isFilterOpen}
        aria-controls="graph-filter-panel"
      >
        ⚙
      </ControlButton>
      
      <ControlButton
        onClick={() => handleExport('PNG')}
        disabled={isLoading}
        aria-label="Export graph"
      >
        ↓
      </ControlButton>

      {isFilterOpen && (
        <GraphFilter
          isOpen={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
          onApply={() => {
            setIsFilterOpen(false);
            if (enableHaptics && 'vibrate' in navigator) {
              navigator.vibrate(100);
            }
          }}
          onError={onError}
        />
      )}
    </ControlsContainer>
  );
};

export default GraphControls;