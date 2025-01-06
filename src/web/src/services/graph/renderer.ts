/**
 * @fileoverview Enhanced graph renderer service for art knowledge graph visualization
 * Implements high-performance D3.js rendering with touch support and optimizations
 * @version 1.0.0
 */

import * as d3 from 'd3'; // v7.0.0
import { PerformanceMonitor } from 'performance-monitor'; // v2.0.0
import { GraphData, Node, Relationship, NodeType } from '../../types/graph';
import { GraphLayoutManager } from './layout';

/**
 * Constants for graph rendering configuration
 */
const RENDER_CONSTANTS = {
  NODE_RADIUS: 30,
  EDGE_STROKE_WIDTH: 2,
  ANIMATION_DURATION: 300,
  MIN_ZOOM: 0.5,
  MAX_ZOOM: 3.0,
  FONT_SIZE: 12,
  FONT_FAMILY: 'Arial, sans-serif',
  TOUCH_THRESHOLD: 10,
  CACHE_SIZE_LIMIT: 1000,
  FRAME_RATE_CAP: 60
};

/**
 * Node color mapping by type
 */
const NODE_COLORS = {
  ARTWORK: '#4CAF50',
  ARTIST: '#2196F3',
  MOVEMENT: '#9C27B0',
  TECHNIQUE: '#FF9800',
  PERIOD: '#795548',
  LOCATION: '#607D8B',
  MATERIAL: '#FF5722'
};

/**
 * Enhanced graph renderer with performance optimization and touch support
 */
export class GraphRenderer {
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private container: HTMLElement;
  private layoutManager: GraphLayoutManager;
  private currentGraph: GraphData | null;
  private renderCache: Map<string, any>;
  private perfMonitor: PerformanceMonitor;
  private animationFrameId: number | null;
  private zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private touchStartTime: number;
  private touchStartPos: { x: number; y: number };

  constructor(container: HTMLElement, layoutManager: GraphLayoutManager) {
    this.container = container;
    this.layoutManager = layoutManager;
    this.currentGraph = null;
    this.renderCache = new Map();
    this.perfMonitor = new PerformanceMonitor();
    this.animationFrameId = null;
    this.touchStartTime = 0;
    this.touchStartPos = { x: 0, y: 0 };

    // Initialize SVG container with touch support
    this.svg = d3.select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('touch-action', 'none')
      .on('touchstart', this.handleTouchStart.bind(this))
      .on('touchmove', this.handleTouchMove.bind(this))
      .on('touchend', this.handleTouchEnd.bind(this));

    // Initialize zoom behavior
    this.zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([RENDER_CONSTANTS.MIN_ZOOM, RENDER_CONSTANTS.MAX_ZOOM])
      .on('zoom', this.handleZoom.bind(this));

    this.svg.call(this.zoomBehavior);

    // Add gradient definitions
    this.initializeDefs();
  }

  /**
   * Initialize SVG definitions for gradients and markers
   */
  private initializeDefs(): void {
    const defs = this.svg.append('defs');

    // Add arrow marker
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', RENDER_CONSTANTS.NODE_RADIUS + 5)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#999');

    // Add node highlight gradient
    const gradient = defs.append('radialGradient')
      .attr('id', 'node-highlight')
      .attr('gradientUnits', 'objectBoundingBox');

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', 'white')
      .attr('stop-opacity', 0.3);

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', 'white')
      .attr('stop-opacity', 0);
  }

  /**
   * Updates the graph visualization with performance optimization
   */
  async updateGraph(newGraph: GraphData): Promise<void> {
    this.perfMonitor.start('graphUpdate');

    // Cancel any pending animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.currentGraph = newGraph;

    // Clear existing elements
    this.svg.selectAll('.node, .link').remove();

    // Create links
    const links = this.svg.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(newGraph.relationships)
      .enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke', '#999')
      .attr('stroke-width', RENDER_CONSTANTS.EDGE_STROKE_WIDTH)
      .attr('marker-end', 'url(#arrow)');

    // Create nodes
    const nodes = this.svg.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(newGraph.nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .call(d3.drag<SVGGElement, Node>()
        .on('start', this.dragStarted.bind(this))
        .on('drag', this.dragged.bind(this))
        .on('end', this.dragEnded.bind(this)));

    // Add node circles
    nodes.append('circle')
      .attr('r', RENDER_CONSTANTS.NODE_RADIUS)
      .attr('fill', d => NODE_COLORS[d.type as keyof typeof NODE_COLORS])
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Add node labels
    nodes.append('text')
      .attr('dy', RENDER_CONSTANTS.NODE_RADIUS + 15)
      .attr('text-anchor', 'middle')
      .attr('font-family', RENDER_CONSTANTS.FONT_FAMILY)
      .attr('font-size', RENDER_CONSTANTS.FONT_SIZE)
      .text(d => d.label);

    // Update node positions
    this.animationFrameId = requestAnimationFrame(() => this.updatePositions());

    this.perfMonitor.end('graphUpdate');
  }

  /**
   * Updates node and link positions based on layout
   */
  private updatePositions(): void {
    if (!this.currentGraph) return;

    this.svg.selectAll('.node')
      .attr('transform', (d: any) => {
        const pos = this.layoutManager.getNodePosition(d.id);
        return pos ? `translate(${pos.x},${pos.y})` : '';
      });

    this.svg.selectAll('.link')
      .attr('x1', (d: any) => {
        const pos = this.layoutManager.getNodePosition(d.source_id);
        return pos ? pos.x : 0;
      })
      .attr('y1', (d: any) => {
        const pos = this.layoutManager.getNodePosition(d.source_id);
        return pos ? pos.y : 0;
      })
      .attr('x2', (d: any) => {
        const pos = this.layoutManager.getNodePosition(d.target_id);
        return pos ? pos.x : 0;
      })
      .attr('y2', (d: any) => {
        const pos = this.layoutManager.getNodePosition(d.target_id);
        return pos ? pos.y : 0;
      });

    this.animationFrameId = requestAnimationFrame(() => this.updatePositions());
  }

  /**
   * Handles zoom events
   */
  private handleZoom(event: d3.D3ZoomEvent<SVGSVGElement, unknown>): void {
    this.svg.selectAll('.nodes, .links')
      .attr('transform', event.transform.toString());
  }

  /**
   * Handles touch start events
   */
  private handleTouchStart(event: TouchEvent): void {
    event.preventDefault();
    this.touchStartTime = Date.now();
    this.touchStartPos = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY
    };
  }

  /**
   * Handles touch move events
   */
  private handleTouchMove(event: TouchEvent): void {
    event.preventDefault();
    if (event.touches.length === 2) {
      // Handle pinch zoom
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      this.handlePinchZoom(dist);
    }
  }

  /**
   * Handles touch end events
   */
  private handleTouchEnd(event: TouchEvent): void {
    event.preventDefault();
    const touchEndTime = Date.now();
    const touchDuration = touchEndTime - this.touchStartTime;

    if (touchDuration < 300) {
      // Handle tap
      const element = document.elementFromPoint(
        this.touchStartPos.x,
        this.touchStartPos.y
      );
      if (element) {
        const node = d3.select(element).datum() as Node;
        if (node) {
          this.handleNodeSelect(node);
        }
      }
    }
  }

  /**
   * Handles pinch zoom gestures
   */
  private handlePinchZoom(distance: number): void {
    const scale = distance / RENDER_CONSTANTS.TOUCH_THRESHOLD;
    this.zoomBehavior.scaleBy(this.svg, scale);
  }

  /**
   * Handles node selection
   */
  private handleNodeSelect(node: Node): void {
    // Highlight selected node
    this.svg.selectAll('.node circle')
      .attr('stroke', d => (d as Node).id === node.id ? '#ff0' : '#fff')
      .attr('stroke-width', d => (d as Node).id === node.id ? 4 : 2);
  }

  /**
   * Handles drag start
   */
  private dragStarted(event: d3.D3DragEvent<SVGGElement, Node, unknown>): void {
    if (!event.active) this.layoutManager['simulation'].alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }

  /**
   * Handles drag
   */
  private dragged(event: d3.D3DragEvent<SVGGElement, Node, unknown>): void {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }

  /**
   * Handles drag end
   */
  private dragEnded(event: d3.D3DragEvent<SVGGElement, Node, unknown>): void {
    if (!event.active) this.layoutManager['simulation'].alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }

  /**
   * Returns current performance metrics
   */
  getPerformanceMetrics(): any {
    return this.perfMonitor.getMetrics();
  }

  /**
   * Cleans up renderer resources
   */
  destroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.svg.remove();
    this.renderCache.clear();
    this.layoutManager.destroy();
  }
}