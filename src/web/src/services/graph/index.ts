/**
 * @fileoverview Main entry point for the art knowledge graph visualization service
 * Coordinates rendering, layout management, and interaction handling with optimized
 * touch support and performance monitoring.
 * @version 1.0.0
 */

import { GraphRenderer } from './renderer';
import { GraphLayoutManager } from './layout';
import { GraphInteractionManager } from './interaction';
import { GraphData, GraphLayout, Node } from '../../types/graph';

/**
 * Constants for graph visualization configuration
 */
export const RENDER_CONSTANTS = {
  FRAME_RATE: 60,
  CACHE_SIZE: 1000,
  TOUCH_THRESHOLD: 10,
  DEBOUNCE_DELAY: 100,
  ANIMATION_DURATION: 300,
  PERFORMANCE_SAMPLE_RATE: 1000,
  ERROR_RETRY_ATTEMPTS: 3
};

/**
 * Constants for graph layout configuration
 */
export const LAYOUT_CONSTANTS = {
  MIN_NODE_DISTANCE: 100,
  FORCE_STRENGTH: -800,
  COLLISION_RADIUS: 50,
  ARTWORK_WEIGHT: 1.5,
  ARTIST_WEIGHT: 1.2,
  MOVEMENT_WEIGHT: 1.0
};

/**
 * Constants for interaction configuration
 */
export const INTERACTION_CONSTANTS = {
  ZOOM_MIN: 0.5,
  ZOOM_MAX: 3.0,
  DOUBLE_TAP_DELAY: 300,
  LONG_PRESS_DELAY: 500,
  TOUCH_FEEDBACK_DURATION: 150
};

/**
 * Interface for performance monitoring configuration
 */
interface PerformanceConfig {
  enableMonitoring: boolean;
  sampleRate: number;
  errorThreshold: number;
  onPerformanceData?: (metrics: any) => void;
}

/**
 * Main service class for managing art knowledge graph visualization
 */
export class GraphService {
  private container: HTMLElement;
  private renderer: GraphRenderer;
  private layoutManager: GraphLayoutManager;
  private interactionManager: GraphInteractionManager;
  private currentGraph: GraphData | null;
  private performanceMonitor: any;
  private touchStateManager: Map<number, TouchState>;
  private animationFrameId: number | null;
  private errorCount: number;

  constructor(
    container: HTMLElement,
    layout: GraphLayout,
    performanceConfig: PerformanceConfig
  ) {
    if (!container) {
      throw new Error('Container element is required');
    }

    this.container = container;
    this.currentGraph = null;
    this.touchStateManager = new Map();
    this.animationFrameId = null;
    this.errorCount = 0;

    // Initialize performance monitoring
    this.performanceMonitor = {
      startTime: Date.now(),
      frames: 0,
      errors: 0,
      lastSample: Date.now()
    };

    // Initialize core components
    this.layoutManager = new GraphLayoutManager(
      { nodes: [], relationships: [] },
      layout
    );

    this.renderer = new GraphRenderer(container, this.layoutManager);

    this.interactionManager = new GraphInteractionManager(
      container,
      this.layoutManager,
      {
        onNodeSelect: this.handleNodeSelect.bind(this),
        onZoomChange: this.handleZoomChange.bind(this),
        enableMultiSelect: true,
        touchFeedback: true
      }
    );

    // Setup error handling
    this.setupErrorHandling();
  }

  /**
   * Initializes the graph visualization with performance monitoring
   */
  public async initialize(graphData: GraphData): Promise<void> {
    try {
      this.performanceMonitor.startTime = Date.now();

      // Initialize layout
      await this.layoutManager.updateLayout(graphData, {
        width: this.container.clientWidth,
        height: this.container.clientHeight,
        zoom: 1,
        scale: 1,
        translation: { x: 0, y: 0 },
        rotation: 0,
        touchEnabled: true,
        center: {
          x: this.container.clientWidth / 2,
          y: this.container.clientHeight / 2
        }
      });

      // Initialize renderer with touch optimization
      this.renderer.enableTouchOptimization();

      // Initialize interaction manager with haptic feedback
      this.interactionManager.enableHapticFeedback();

      // Store current graph data
      this.currentGraph = graphData;

      // Start performance monitoring
      this.startPerformanceMonitoring();

      // Initial render
      await this.renderer.updateGraph(graphData);

    } catch (error) {
      this.handleError('initialization', error);
      throw error;
    }
  }

  /**
   * Updates the graph with new data and layout
   */
  public async updateGraph(
    newGraph: GraphData,
    newLayout?: Partial<GraphLayout>
  ): Promise<void> {
    try {
      const startTime = Date.now();

      // Update layout first
      if (newLayout) {
        await this.layoutManager.updateLayout(newGraph, {
          ...this.getCurrentLayout(),
          ...newLayout
        });
      }

      // Update renderer
      await this.renderer.updateGraph(newGraph);

      // Update current graph reference
      this.currentGraph = newGraph;

      // Log performance
      this.logPerformance('graphUpdate', Date.now() - startTime);

    } catch (error) {
      this.handleError('graphUpdate', error);
      throw error;
    }
  }

  /**
   * Handles node selection events
   */
  private handleNodeSelect(node: Node): void {
    if (!this.currentGraph) return;

    try {
      // Update layout for selected node
      this.layoutManager.optimizeForTouch();
      
      // Trigger haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate(INTERACTION_CONSTANTS.TOUCH_FEEDBACK_DURATION);
      }

      // Request frame update
      this.requestAnimationFrame();

    } catch (error) {
      this.handleError('nodeSelect', error);
    }
  }

  /**
   * Handles zoom change events
   */
  private handleZoomChange(scale: number): void {
    if (!this.currentGraph) return;

    try {
      // Update layout for new zoom level
      this.layoutManager.optimizeForTouch();
      
      // Request frame update
      this.requestAnimationFrame();

    } catch (error) {
      this.handleError('zoomChange', error);
    }
  }

  /**
   * Gets current layout configuration
   */
  private getCurrentLayout(): GraphLayout {
    return {
      width: this.container.clientWidth,
      height: this.container.clientHeight,
      zoom: 1,
      scale: 1,
      translation: { x: 0, y: 0 },
      rotation: 0,
      touchEnabled: true,
      center: {
        x: this.container.clientWidth / 2,
        y: this.container.clientHeight / 2
      }
    };
  }

  /**
   * Sets up error handling and recovery
   */
  private setupErrorHandling(): void {
    window.addEventListener('error', (event) => {
      this.handleError('global', event.error);
    });
  }

  /**
   * Handles errors with retry logic
   */
  private handleError(context: string, error: any): void {
    this.errorCount++;
    this.performanceMonitor.errors++;

    console.error(`Graph error in ${context}:`, error);

    if (this.errorCount < RENDER_CONSTANTS.ERROR_RETRY_ATTEMPTS) {
      // Attempt recovery
      setTimeout(() => {
        if (this.currentGraph) {
          this.updateGraph(this.currentGraph).catch(console.error);
        }
      }, 1000);
    }
  }

  /**
   * Starts performance monitoring
   */
  private startPerformanceMonitoring(): void {
    setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.performanceMonitor.lastSample;
      
      const metrics = {
        fps: (this.performanceMonitor.frames * 1000) / elapsed,
        errors: this.performanceMonitor.errors,
        latency: elapsed / this.performanceMonitor.frames
      };

      // Reset counters
      this.performanceMonitor.frames = 0;
      this.performanceMonitor.lastSample = now;

      // Report metrics
      this.logPerformance('monitor', metrics);
    }, RENDER_CONSTANTS.PERFORMANCE_SAMPLE_RATE);
  }

  /**
   * Logs performance metrics
   */
  private logPerformance(context: string, data: any): void {
    if (this.performanceMonitor.onPerformanceData) {
      this.performanceMonitor.onPerformanceData({
        context,
        timestamp: Date.now(),
        data
      });
    }
  }

  /**
   * Requests an animation frame for updates
   */
  private requestAnimationFrame(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.animationFrameId = requestAnimationFrame(() => {
      this.performanceMonitor.frames++;
      this.renderer.updateGraph(this.currentGraph!);
    });
  }

  /**
   * Cleans up service resources
   */
  public destroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.renderer.destroy();
    this.layoutManager.destroy();
    this.interactionManager.destroy();
    this.touchStateManager.clear();
    this.currentGraph = null;
  }
}

/**
 * Interface for touch state tracking
 */
interface TouchState {
  startX: number;
  startY: number;
  timestamp: number;
  isActive: boolean;
}