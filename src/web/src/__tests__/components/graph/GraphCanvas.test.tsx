import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mock, mockReset } from 'jest-mock-extended';
import { GraphCanvas, GraphCanvasProps } from '../../../components/graph/GraphCanvas';
import { GraphData, Node, NodeType, Relationship, RelationshipType } from '../../../types/graph';
import { GraphRenderer } from '../../../services/graph/renderer';
import { GraphLayoutManager } from '../../../services/graph/layout';
import { GraphInteractionManager } from '../../../services/graph/interaction';

// Mock the external services
jest.mock('../../../services/graph/renderer');
jest.mock('../../../services/graph/layout');
jest.mock('../../../services/graph/interaction');

// Mock requestAnimationFrame
const mockRAF = jest.fn();
window.requestAnimationFrame = mockRAF;
window.cancelAnimationFrame = jest.fn();

// Sample test data
const mockGraphData: GraphData = {
  nodes: [
    {
      id: '1',
      type: NodeType.ARTWORK,
      label: 'The Starry Night',
      properties: {
        title: 'The Starry Night',
        year: '1889'
      },
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z'
    },
    {
      id: '2',
      type: NodeType.ARTIST,
      label: 'Vincent van Gogh',
      properties: {
        name: 'Vincent van Gogh',
        period: 'Post-Impressionism'
      },
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z'
    }
  ],
  relationships: [
    {
      id: '1',
      type: RelationshipType.CREATED_BY,
      source_id: '1',
      target_id: '2',
      properties: {
        year: '1889'
      },
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z'
    }
  ]
};

// Helper function to render component with default props
const renderGraphCanvas = (props: Partial<GraphCanvasProps> = {}) => {
  const defaultProps: GraphCanvasProps = {
    graphData: mockGraphData,
    width: 800,
    height: 600,
    onNodeSelect: jest.fn(),
    onEdgeSelect: jest.fn(),
    className: 'test-canvas',
    performanceMode: false,
    accessibilityEnabled: true,
    progressiveLoading: true,
    touchConfig: {
      enablePinchZoom: true,
      enablePan: true,
      enableDoubleTap: true,
      enableLongPress: true,
      touchFeedback: true
    }
  };

  return render(<GraphCanvas {...defaultProps} {...props} />);
};

describe('GraphCanvas Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReset(GraphRenderer);
    mockReset(GraphLayoutManager);
    mockReset(GraphInteractionManager);
  });

  describe('Rendering Tests', () => {
    it('renders without crashing', () => {
      const { container } = renderGraphCanvas();
      expect(container).toBeInTheDocument();
    });

    it('applies correct container dimensions', () => {
      const { container } = renderGraphCanvas({ width: 1000, height: 800 });
      const canvas = container.querySelector('.graph-canvas');
      expect(canvas).toHaveStyle({ width: '1000px', height: '800px' });
    });

    it('displays loading state when progressive loading is enabled', () => {
      renderGraphCanvas({ progressiveLoading: true });
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('shows performance indicator when in performance mode', () => {
      renderGraphCanvas({ performanceMode: true });
      expect(screen.getByText(/FPS/)).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = renderGraphCanvas({ className: 'custom-canvas' });
      expect(container.querySelector('.custom-canvas')).toBeInTheDocument();
    });
  });

  describe('Accessibility Tests', () => {
    it('applies correct ARIA attributes', () => {
      renderGraphCanvas();
      const canvas = screen.getByRole('application');
      expect(canvas).toHaveAttribute('aria-label', 'Art Knowledge Graph Visualization');
      expect(canvas).toHaveAttribute('tabIndex', '0');
    });

    it('provides progress information during loading', () => {
      renderGraphCanvas({ progressiveLoading: true });
      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toHaveAttribute('aria-valuemin', '0');
      expect(progressbar).toHaveAttribute('aria-valuemax', '100');
    });

    it('announces error states properly', async () => {
      const mockError = new Error('Failed to load graph');
      renderGraphCanvas();
      act(() => {
        // Simulate error state
        const renderer = new GraphRenderer(null as any, null as any);
        renderer.emit('error', mockError);
      });
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Interaction Tests', () => {
    it('handles node selection', async () => {
      const onNodeSelect = jest.fn();
      renderGraphCanvas({ onNodeSelect });

      act(() => {
        // Simulate node selection
        const renderer = new GraphRenderer(null as any, null as any);
        renderer.emit('nodeSelect', mockGraphData.nodes[0]);
      });

      expect(onNodeSelect).toHaveBeenCalledWith(mockGraphData.nodes[0].id);
    });

    it('supports touch gestures', async () => {
      const { container } = renderGraphCanvas();
      const canvas = container.querySelector('.graph-canvas') as HTMLElement;

      // Simulate touch start
      fireEvent.touchStart(canvas, {
        touches: [{ clientX: 100, clientY: 100, identifier: 0 }]
      });

      // Simulate touch move
      fireEvent.touchMove(canvas, {
        touches: [{ clientX: 150, clientY: 150, identifier: 0 }]
      });

      // Simulate touch end
      fireEvent.touchEnd(canvas);

      expect(GraphInteractionManager.prototype.handleTouchMove).toHaveBeenCalled();
    });

    it('handles zoom interactions', async () => {
      const { container } = renderGraphCanvas();
      const canvas = container.querySelector('.graph-canvas') as HTMLElement;

      // Simulate wheel zoom
      fireEvent.wheel(canvas, { deltaY: -100 });

      expect(GraphRenderer.prototype.handleZoom).toHaveBeenCalled();
    });
  });

  describe('Lifecycle Tests', () => {
    it('initializes graph renderer on mount', () => {
      renderGraphCanvas();
      expect(GraphRenderer).toHaveBeenCalled();
    });

    it('updates on graph data changes', () => {
      const { rerender } = renderGraphCanvas();
      const newGraphData = { ...mockGraphData, nodes: [...mockGraphData.nodes] };

      rerender(<GraphCanvas graphData={newGraphData} width={800} height={600} />);
      expect(GraphRenderer.prototype.updateGraph).toHaveBeenCalledWith(newGraphData);
    });

    it('cleans up resources on unmount', () => {
      const { unmount } = renderGraphCanvas();
      unmount();
      expect(GraphRenderer.prototype.destroy).toHaveBeenCalled();
      expect(GraphInteractionManager.prototype.destroy).toHaveBeenCalled();
    });
  });

  describe('Performance Tests', () => {
    it('throttles render updates', async () => {
      renderGraphCanvas();
      
      // Simulate multiple rapid updates
      for (let i = 0; i < 5; i++) {
        act(() => {
          const renderer = new GraphRenderer(null as any, null as any);
          renderer.emit('update');
        });
      }

      expect(mockRAF).toHaveBeenCalledTimes(1);
    });

    it('optimizes for large graphs', () => {
      const largeGraphData: GraphData = {
        nodes: Array(1000).fill(null).map((_, i) => ({
          ...mockGraphData.nodes[0],
          id: `node-${i}`
        })),
        relationships: []
      };

      renderGraphCanvas({ graphData: largeGraphData, performanceMode: true });
      expect(GraphRenderer.prototype.setPerformanceMode).toHaveBeenCalledWith(true);
    });
  });
});