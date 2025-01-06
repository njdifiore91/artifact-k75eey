/**
 * @fileoverview Service module for managing art knowledge graph visualization layout
 * Implements force-directed graph layout with art-specific optimizations
 * @version 1.0.0
 */

import * as d3 from 'd3'; // v7.0.0
import { GraphData, GraphLayout, NodeType, Node, Relationship } from '../../types/graph';

/**
 * Constants for art-optimized graph layout configuration
 */
export const LAYOUT_CONSTANTS = {
  MIN_DISTANCE: 100, // Minimum distance between nodes
  CHARGE_STRENGTH: -800, // Node repulsion strength
  COLLISION_RADIUS: 50, // Node collision detection radius
  ALPHA_TARGET: 0.3, // Force simulation target alpha
  ALPHA_DECAY: 0.02, // Force simulation alpha decay rate
  VELOCITY_DECAY: 0.4, // Force simulation velocity decay
  ARTWORK_NODE_WEIGHT: 1.5, // Weight for artwork nodes
  ARTIST_NODE_WEIGHT: 1.2, // Weight for artist nodes
  MOVEMENT_NODE_WEIGHT: 1.0, // Weight for movement nodes
  TOUCH_AREA_MULTIPLIER: 1.5 // Touch interaction area multiplier
};

/**
 * Creates a D3 force simulation optimized for art knowledge graphs
 */
function createForceSimulation(graphData: GraphData, layout: GraphLayout): d3.Simulation<Node, Relationship> {
  const simulation = d3.forceSimulation<Node>(graphData.nodes)
    .force('link', d3.forceLink<Node, Relationship>(graphData.relationships)
      .id(d => d.id)
      .distance(LAYOUT_CONSTANTS.MIN_DISTANCE)
      .strength(link => {
        // Strengthen links between artworks and artists
        if (link.type === 'CREATED_BY') return 0.8;
        // Weaken links between movements
        if (link.type === 'BELONGS_TO') return 0.4;
        return 0.6;
      }))
    .force('charge', d3.forceManyBody()
      .strength(node => {
        // Adjust repulsion based on node type
        switch (node.type) {
          case NodeType.ARTWORK: return LAYOUT_CONSTANTS.CHARGE_STRENGTH * LAYOUT_CONSTANTS.ARTWORK_NODE_WEIGHT;
          case NodeType.ARTIST: return LAYOUT_CONSTANTS.CHARGE_STRENGTH * LAYOUT_CONSTANTS.ARTIST_NODE_WEIGHT;
          default: return LAYOUT_CONSTANTS.CHARGE_STRENGTH * LAYOUT_CONSTANTS.MOVEMENT_NODE_WEIGHT;
        }
      }))
    .force('collide', d3.forceCollide()
      .radius(LAYOUT_CONSTANTS.COLLISION_RADIUS * LAYOUT_CONSTANTS.TOUCH_AREA_MULTIPLIER))
    .force('center', d3.forceCenter(layout.width / 2, layout.height / 2))
    .alpha(LAYOUT_CONSTANTS.ALPHA_TARGET)
    .alphaDecay(LAYOUT_CONSTANTS.ALPHA_DECAY)
    .velocityDecay(LAYOUT_CONSTANTS.VELOCITY_DECAY);

  return simulation;
}

/**
 * Calculates optimal initial node positions based on art relationships
 */
function calculateInitialPositions(graphData: GraphData, layout: GraphLayout): Map<string, { x: number, y: number }> {
  const positions = new Map<string, { x: number, y: number }>();
  const centerX = layout.width / 2;
  const centerY = layout.height / 2;

  // Group nodes by type
  const artworkNodes = graphData.nodes.filter(n => n.type === NodeType.ARTWORK);
  const artistNodes = graphData.nodes.filter(n => n.type === NodeType.ARTIST);
  const movementNodes = graphData.nodes.filter(n => n.type === NodeType.MOVEMENT);

  // Position artwork nodes in a central cluster
  artworkNodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / artworkNodes.length;
    const radius = LAYOUT_CONSTANTS.MIN_DISTANCE * 2;
    positions.set(node.id, {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    });
  });

  // Position artist nodes around artworks
  artistNodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / artistNodes.length;
    const radius = LAYOUT_CONSTANTS.MIN_DISTANCE * 4;
    positions.set(node.id, {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    });
  });

  // Position movement nodes in outer ring
  movementNodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / movementNodes.length;
    const radius = LAYOUT_CONSTANTS.MIN_DISTANCE * 6;
    positions.set(node.id, {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    });
  });

  return positions;
}

/**
 * Manages the layout and positioning of art knowledge graph elements
 */
export class GraphLayoutManager {
  private simulation: d3.Simulation<Node, Relationship>;
  private currentGraph: GraphData;
  private currentLayout: GraphLayout;
  private nodePositions: Map<string, { x: number, y: number }>;
  private positionCache: Map<string, { x: number, y: number }>;

  constructor(graphData: GraphData, layout: GraphLayout) {
    this.currentGraph = graphData;
    this.currentLayout = layout;
    this.nodePositions = calculateInitialPositions(graphData, layout);
    this.positionCache = new Map();
    this.simulation = createForceSimulation(graphData, layout);

    // Initialize node positions
    this.simulation.nodes().forEach(node => {
      const pos = this.nodePositions.get(node.id);
      if (pos) {
        node.x = pos.x;
        node.y = pos.y;
      }
    });

    // Cache positions on simulation tick
    this.simulation.on('tick', () => {
      this.simulation.nodes().forEach(node => {
        this.positionCache.set(node.id, { x: node.x!, y: node.y! });
      });
    });
  }

  /**
   * Updates the graph layout with new data or configuration
   */
  async updateLayout(newGraph: GraphData, newLayout: GraphLayout): Promise<void> {
    this.currentGraph = newGraph;
    this.currentLayout = newLayout;

    // Stop current simulation
    this.simulation.stop();

    // Calculate new initial positions
    this.nodePositions = calculateInitialPositions(newGraph, newLayout);

    // Update simulation with new data
    this.simulation = createForceSimulation(newGraph, newLayout);
    this.simulation.nodes().forEach(node => {
      const pos = this.nodePositions.get(node.id);
      if (pos) {
        node.x = pos.x;
        node.y = pos.y;
      }
    });

    // Return promise that resolves when simulation stabilizes
    return new Promise(resolve => {
      this.simulation.on('end', resolve);
    });
  }

  /**
   * Retrieves cached position for a given node
   */
  getNodePosition(nodeId: string): { x: number, y: number } | null {
    return this.positionCache.get(nodeId) || null;
  }

  /**
   * Cleans up layout manager resources
   */
  destroy(): void {
    this.simulation.stop();
    this.nodePositions.clear();
    this.positionCache.clear();
  }
}