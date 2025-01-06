/**
 * @fileoverview React component for rendering interactive nodes in the art knowledge graph
 * with support for touch gestures, animations, and accessibility features.
 * @version 1.0.0
 */

import React from 'react'; // ^18.0.0
import styled from 'styled-components'; // ^5.3.0
import { motion } from 'framer-motion'; // ^6.0.0
import { Node } from '../../types/graph';
import { handleNodeSelection } from '../../services/graph/interaction';
import { RENDER_CONSTANTS } from '../../services/graph/renderer';

// Animation variants for node states
const NODE_ANIMATION_VARIANTS = {
  initial: { scale: 0, opacity: 0 },
  animate: { scale: 1, opacity: 1, transition: { duration: 0.3 } },
  selected: { scale: 1.2, opacity: 1, transition: { duration: 0.2 } },
  exit: { scale: 0, opacity: 0, transition: { duration: 0.2 } }
};

// Styled components for node elements
const NodeContainer = styled(motion.div)<{ $selected: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${RENDER_CONSTANTS.NODE_RADIUS * 2}px;
  height: ${RENDER_CONSTANTS.NODE_RADIUS * 2}px;
  cursor: pointer;
  user-select: none;
  touch-action: none;
`;

const NodeCircle = styled(motion.div)<{ $color: string; $selected: boolean }>`
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background-color: ${props => props.$color};
  border: 2px solid ${props => props.$selected ? '#FFFFFF' : 'rgba(255, 255, 255, 0.6)'};
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: border-color 0.2s ease;
`;

const NodeLabel = styled(motion.span)`
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  font-size: 12px;
  font-weight: 500;
  color: #FFFFFF;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
  pointer-events: none;
`;

interface GraphNodeProps {
  node: Node;
  selected: boolean;
  onSelect: (nodeId: string) => void;
  onDoubleClick: (nodeId: string) => void;
  onLongPress: (nodeId: string) => void;
  highContrast: boolean;
  isAnimating: boolean;
  ariaLabel?: string;
}

/**
 * Returns the appropriate color for a node based on its type
 */
const getNodeColor = (type: string, highContrast: boolean): string => {
  const color = RENDER_CONSTANTS.NODE_COLORS[type] || '#999999';
  return highContrast ? `${color}E6` : color; // Add opacity for non-high contrast
};

/**
 * GraphNode component for rendering interactive nodes in the knowledge graph
 */
export const GraphNode = React.memo<GraphNodeProps>(({
  node,
  selected,
  onSelect,
  onDoubleClick,
  onLongPress,
  highContrast,
  isAnimating,
  ariaLabel
}) => {
  // Touch interaction state
  const touchStartRef = React.useRef<number>(0);
  const touchTimerRef = React.useRef<NodeJS.Timeout>();
  const lastTapRef = React.useRef<number>(0);

  // Handle touch start event
  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    touchStartRef.current = Date.now();
    
    // Set up long press timer
    touchTimerRef.current = setTimeout(() => {
      onLongPress(node.id);
    }, 500);
  }, [node.id, onLongPress]);

  // Handle touch end event
  const handleTouchEnd = React.useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    
    // Clear long press timer
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
    }

    const touchDuration = Date.now() - touchStartRef.current;
    const timeSinceLastTap = Date.now() - lastTapRef.current;

    // Handle double tap
    if (timeSinceLastTap < 300) {
      onDoubleClick(node.id);
      lastTapRef.current = 0;
    }
    // Handle single tap
    else if (touchDuration < 500) {
      onSelect(node.id);
      lastTapRef.current = Date.now();
    }
  }, [node.id, onSelect, onDoubleClick]);

  // Handle touch cancel
  const handleTouchCancel = React.useCallback(() => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
    }
  }, []);

  // Clean up touch timer on unmount
  React.useEffect(() => {
    return () => {
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
      }
    };
  }, []);

  return (
    <NodeContainer
      $selected={selected}
      variants={NODE_ANIMATION_VARIANTS}
      initial="initial"
      animate={selected ? "selected" : "animate"}
      exit="exit"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      role="button"
      aria-label={ariaLabel || `${node.type} node: ${node.label}`}
      aria-pressed={selected}
      tabIndex={0}
    >
      <NodeCircle
        $color={getNodeColor(node.type, highContrast)}
        $selected={selected}
        layoutId={`node-${node.id}`}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 30,
          mass: 1
        }}
      />
      <NodeLabel
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.1 }}
      >
        {node.label}
      </NodeLabel>
    </NodeContainer>
  );
});

GraphNode.displayName = 'GraphNode';