/**
 * @fileoverview Service module for managing user interactions with art knowledge graph visualization
 * Implements touch-optimized gestures and visual feedback for enhanced art exploration
 * @version 1.0.0
 */

import * as d3 from 'd3'; // v7.0.0
import Hammer from 'hammerjs'; // v2.0.8
import { Node, Relationship } from '../../types/graph';
import { GraphLayoutManager } from './layout';

/**
 * Constants for interaction configuration
 */
export const INTERACTION_CONSTANTS = {
  ZOOM_MIN: 0.5,
  ZOOM_MAX: 3.0,
  ZOOM_STEP: 0.1,
  DOUBLE_TAP_DELAY: 300,
  LONG_PRESS_DELAY: 500,
  PAN_THRESHOLD: 10,
  PINCH_THRESHOLD: 0.1,
  TOUCH_FEEDBACK_DURATION: 150,
  ANIMATION_DURATION: 250,
  MULTI_SELECT_THRESHOLD: 20
};

/**
 * Interface for touch state tracking
 */
interface TouchState {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  isActive: boolean;
  startTime: number;
}

/**
 * Interface for interaction configuration
 */
interface InteractionConfig {
  onNodeSelect?: (node: Node, mode: SelectionMode) => void;
  onNodeDeselect?: (node: Node) => void;
  onZoomChange?: (scale: number) => void;
  enableMultiSelect?: boolean;
  touchFeedback?: boolean;
}

/**
 * Enum for node selection modes
 */
enum SelectionMode {
  SINGLE = 'SINGLE',
  MULTI = 'MULTI',
  TOGGLE = 'TOGGLE'
}

/**
 * Manages user interactions with the graph visualization
 */
export class GraphInteractionManager {
  private container: HTMLElement;
  private layoutManager: GraphLayoutManager;
  private config: InteractionConfig;
  private zoomBehavior: d3.ZoomBehavior<HTMLElement, unknown>;
  private gestureManager: HammerManager;
  private selectedNodes: Set<string>;
  private highlightedEdges: Set<string>;
  private touchStates: Map<string, TouchState>;
  private animationFrame: number | null;

  constructor(
    container: HTMLElement,
    layoutManager: GraphLayoutManager,
    config: InteractionConfig
  ) {
    this.container = container;
    this.layoutManager = layoutManager;
    this.config = config;
    this.selectedNodes = new Set();
    this.highlightedEdges = new Set();
    this.touchStates = new Map();
    this.animationFrame = null;

    // Initialize interactions
    this.zoomBehavior = this.setupZoomBehavior();
    this.gestureManager = this.setupTouchGestures();
    this.initialize();
  }

  /**
   * Sets up D3 zoom behavior with art-optimized parameters
   */
  private setupZoomBehavior(): d3.ZoomBehavior<HTMLElement, unknown> {
    return d3.zoom()
      .scaleExtent([INTERACTION_CONSTANTS.ZOOM_MIN, INTERACTION_CONSTANTS.ZOOM_MAX])
      .on('zoom', (event: d3.D3ZoomEvent<HTMLElement, unknown>) => {
        this.handleZoom(event);
      });
  }

  /**
   * Sets up Hammer.js touch gesture recognizers
   */
  private setupTouchGestures(): HammerManager {
    const hammer = new Hammer(this.container);

    // Configure recognizers
    hammer.get('pinch').set({ enable: true });
    hammer.get('pan').set({ direction: Hammer.DIRECTION_ALL });
    hammer.get('press').set({ time: INTERACTION_CONSTANTS.LONG_PRESS_DELAY });

    // Add gesture handlers
    hammer.on('tap', (e: HammerInput) => this.handleTap(e));
    hammer.on('doubletap', (e: HammerInput) => this.handleDoubleTap(e));
    hammer.on('press', (e: HammerInput) => this.handlePress(e));
    hammer.on('pinch', (e: HammerInput) => this.handlePinch(e));
    hammer.on('pan', (e: HammerInput) => this.handlePan(e));

    return hammer;
  }

  /**
   * Initializes interaction handlers
   */
  private initialize(): void {
    // Apply zoom behavior to container
    d3.select(this.container)
      .call(this.zoomBehavior)
      .on('dblclick.zoom', null); // Disable default double-click zoom

    // Setup touch state tracking
    this.container.addEventListener('touchstart', (e: TouchEvent) => {
      Array.from(e.touches).forEach(touch => {
        this.touchStates.set(touch.identifier.toString(), {
          startX: touch.clientX,
          startY: touch.clientY,
          lastX: touch.clientX,
          lastY: touch.clientY,
          isActive: true,
          startTime: Date.now()
        });
      });
    });

    // Clean up touch states
    this.container.addEventListener('touchend', (e: TouchEvent) => {
      Array.from(e.changedTouches).forEach(touch => {
        this.touchStates.delete(touch.identifier.toString());
      });
    });
  }

  /**
   * Handles node selection with multi-select support
   */
  public handleNodeSelect(node: Node, mode: SelectionMode = SelectionMode.SINGLE): void {
    if (!this.config.enableMultiSelect && mode !== SelectionMode.SINGLE) {
      mode = SelectionMode.SINGLE;
    }

    switch (mode) {
      case SelectionMode.SINGLE:
        this.selectedNodes.clear();
        this.selectedNodes.add(node.id);
        break;
      case SelectionMode.MULTI:
        this.selectedNodes.add(node.id);
        break;
      case SelectionMode.TOGGLE:
        if (this.selectedNodes.has(node.id)) {
          this.selectedNodes.delete(node.id);
          this.config.onNodeDeselect?.(node);
        } else {
          this.selectedNodes.add(node.id);
        }
        break;
    }

    this.updateHighlightedEdges();
    this.config.onNodeSelect?.(node, mode);
    this.requestAnimationFrame();
  }

  /**
   * Handles zoom events with smooth transitions
   */
  public handleZoom(event: d3.D3ZoomEvent<HTMLElement, unknown>): void {
    const transform = event.transform;
    
    // Apply zoom transform with animation
    d3.select(this.container)
      .transition()
      .duration(INTERACTION_CONSTANTS.ANIMATION_DURATION)
      .call(this.zoomBehavior.transform, transform);

    this.config.onZoomChange?.(transform.k);
    this.requestAnimationFrame();
  }

  /**
   * Updates highlighted edges based on selected nodes
   */
  private updateHighlightedEdges(): void {
    this.highlightedEdges.clear();
    // Highlight edges connected to selected nodes
    this.selectedNodes.forEach(nodeId => {
      const position = this.layoutManager.getNodePosition(nodeId);
      if (position) {
        // Add connected edges to highlight set
        // Implementation depends on graph data structure
      }
    });
  }

  /**
   * Requests animation frame for smooth updates
   */
  private requestAnimationFrame(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    this.animationFrame = requestAnimationFrame(() => {
      this.render();
      this.animationFrame = null;
    });
  }

  /**
   * Renders current interaction state
   */
  private render(): void {
    // Implementation depends on rendering system
    // Update visual states, transitions, and feedback
  }

  /**
   * Cleans up interaction manager resources
   */
  public destroy(): void {
    this.gestureManager.destroy();
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    this.selectedNodes.clear();
    this.highlightedEdges.clear();
    this.touchStates.clear();
    d3.select(this.container).on('.zoom', null);
  }
}