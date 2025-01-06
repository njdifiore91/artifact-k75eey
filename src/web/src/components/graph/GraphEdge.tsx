/**
 * @fileoverview React component for rendering individual edges in the art knowledge graph visualization
 * Implements high-performance SVG paths with D3.js curve interpolation and interactive features
 * @version 1.0.0
 */

import React, { memo } from 'react'; // v18.0.0
import { line, curveBasis } from 'd3'; // v7.0.0
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.0
import { Relationship } from '../../types/graph';
import { RENDER_CONSTANTS } from '../../services/graph/renderer';

/**
 * Props interface for the GraphEdge component
 */
interface GraphEdgeProps {
  relationship: Relationship;
  sourcePosition: { x: number; y: number };
  targetPosition: { x: number; y: number };
  isHighlighted: boolean;
  onClick?: (relationshipId: string) => void;
  className?: string;
  ariaLabel?: string;
}

/**
 * Edge colors based on relationship type
 */
const EDGE_COLORS = {
  CREATED_BY: '#2196F3',
  BELONGS_TO: '#9C27B0',
  INFLUENCED_BY: '#FF9800',
  LOCATED_IN: '#607D8B',
  USES_TECHNIQUE: '#4CAF50',
  MADE_WITH: '#FF5722',
  CONTEMPORARY_OF: '#795548',
  STUDIED_UNDER: '#673AB7'
};

const EDGE_HIGHLIGHT_COLOR = '#FFC107';

/**
 * Calculates the SVG path for a curved edge between two nodes
 */
const calculateEdgePath = (
  sourcePosition: { x: number; y: number },
  targetPosition: { x: number; y: number }
): string => {
  // Create control points for the curve
  const dx = targetPosition.x - sourcePosition.x;
  const dy = targetPosition.y - sourcePosition.y;
  const controlPoint1 = {
    x: sourcePosition.x + dx / 3,
    y: sourcePosition.y + dy / 3
  };
  const controlPoint2 = {
    x: sourcePosition.x + (dx * 2) / 3,
    y: sourcePosition.y + (dy * 2) / 3
  };

  // Create D3 line generator with curve interpolation
  const lineGenerator = line<{ x: number; y: number }>()
    .x(d => d.x)
    .y(d => d.y)
    .curve(curveBasis);

  // Generate path points
  const points = [
    sourcePosition,
    controlPoint1,
    controlPoint2,
    targetPosition
  ];

  return lineGenerator(points) || '';
};

/**
 * Custom comparison function for React.memo optimization
 */
const arePropsEqual = (prevProps: GraphEdgeProps, nextProps: GraphEdgeProps): boolean => {
  return (
    prevProps.relationship.id === nextProps.relationship.id &&
    prevProps.sourcePosition.x === nextProps.sourcePosition.x &&
    prevProps.sourcePosition.y === nextProps.sourcePosition.y &&
    prevProps.targetPosition.x === nextProps.targetPosition.x &&
    prevProps.targetPosition.y === nextProps.targetPosition.y &&
    prevProps.isHighlighted === nextProps.isHighlighted &&
    prevProps.onClick === nextProps.onClick
  );
};

/**
 * Error fallback component for edge rendering failures
 */
const EdgeErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
  <path
    d="M0,0 L0,0"
    stroke="#FF0000"
    strokeWidth={1}
    strokeDasharray="4,4"
    opacity={0.5}
    data-error={error.message}
  />
);

/**
 * GraphEdge component for rendering relationship edges in the knowledge graph
 */
const GraphEdge: React.FC<GraphEdgeProps> = memo(({
  relationship,
  sourcePosition,
  targetPosition,
  isHighlighted,
  onClick,
  className = '',
  ariaLabel
}) => {
  // Calculate the edge path
  const pathData = calculateEdgePath(sourcePosition, targetPosition);

  // Determine edge color based on relationship type and highlight state
  const edgeColor = isHighlighted
    ? EDGE_HIGHLIGHT_COLOR
    : EDGE_COLORS[relationship.type] || '#999999';

  // Handle edge click events
  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    onClick?.(relationship.id);
  };

  return (
    <ErrorBoundary FallbackComponent={EdgeErrorFallback}>
      <g
        className={`graph-edge ${className}`}
        data-testid={`edge-${relationship.id}`}
        onClick={handleClick}
        role="presentation"
      >
        {/* Main edge path */}
        <path
          d={pathData}
          stroke={edgeColor}
          strokeWidth={RENDER_CONSTANTS.EDGE_STROKE_WIDTH}
          fill="none"
          strokeLinecap="round"
          strokeOpacity={isHighlighted ? 1 : 0.6}
          markerEnd="url(#arrow)"
          className="edge-path"
          aria-label={ariaLabel || `${relationship.type} relationship`}
          filter={isHighlighted ? 'url(#glow)' : undefined}
        />
        
        {/* Invisible wider path for easier touch interaction */}
        <path
          d={pathData}
          stroke="transparent"
          strokeWidth={RENDER_CONSTANTS.EDGE_STROKE_WIDTH * 3}
          fill="none"
          style={{ cursor: onClick ? 'pointer' : 'default' }}
          className="edge-touch-target"
        />
      </g>
    </ErrorBoundary>
  );
}, arePropsEqual);

// Display name for debugging
GraphEdge.displayName = 'GraphEdge';

export default GraphEdge;
export type { GraphEdgeProps };