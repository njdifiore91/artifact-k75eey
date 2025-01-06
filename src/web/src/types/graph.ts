/**
 * @fileoverview TypeScript type definitions for graph-related data structures
 * in the Art Knowledge Graph frontend application.
 * @version 1.0.0
 */

import { z } from 'zod'; // v3.0.0
import { UUID } from 'uuid'; // v9.0.0
import { APIResponse } from './api';

/**
 * Enumeration of valid node types in the graph
 */
export enum NodeType {
  ARTWORK = 'ARTWORK',
  ARTIST = 'ARTIST',
  MOVEMENT = 'MOVEMENT',
  TECHNIQUE = 'TECHNIQUE',
  PERIOD = 'PERIOD',
  LOCATION = 'LOCATION',
  MATERIAL = 'MATERIAL'
}

/**
 * Enumeration of valid relationship types in the graph
 */
export enum RelationshipType {
  CREATED_BY = 'CREATED_BY',
  BELONGS_TO = 'BELONGS_TO',
  INFLUENCED_BY = 'INFLUENCED_BY',
  LOCATED_IN = 'LOCATED_IN',
  USES_TECHNIQUE = 'USES_TECHNIQUE',
  MADE_WITH = 'MADE_WITH',
  CONTEMPORARY_OF = 'CONTEMPORARY_OF',
  STUDIED_UNDER = 'STUDIED_UNDER'
}

/**
 * Interface for graph nodes with their properties
 */
export interface Node {
  id: UUID;
  type: NodeType;
  label: string;
  properties: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * Interface for graph relationships between nodes
 */
export interface Relationship {
  id: UUID;
  type: RelationshipType;
  source_id: UUID;
  target_id: UUID;
  properties: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * Interface for complete graph data structure
 */
export interface GraphData {
  nodes: Node[];
  relationships: Relationship[];
}

/**
 * Interface for graph visualization layout properties
 */
export interface GraphLayout {
  width: number;
  height: number;
  zoom: number;
  scale: number;
  translation: {
    x: number;
    y: number;
  };
  rotation: number;
  touchEnabled: boolean;
  center: {
    x: number;
    y: number;
  };
}

/**
 * Interface for graph API responses including layout information
 */
export interface GraphResponse {
  data: GraphData;
  layout: GraphLayout;
  version: string;
  metadata: Record<string, any>;
  stats: {
    nodeCount: number;
    edgeCount: number;
  };
}

/**
 * Type definition for graph operation errors
 */
export type GraphError = {
  code: string;
  message: string;
  details: Record<string, any>;
};

/**
 * Zod schema for runtime validation of Node data
 */
export const nodeSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(NodeType),
  label: z.string(),
  properties: z.record(z.string(), z.any()),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

/**
 * Zod schema for runtime validation of Relationship data
 */
export const relationshipSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(RelationshipType),
  source_id: z.string().uuid(),
  target_id: z.string().uuid(),
  properties: z.record(z.string(), z.any()),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

/**
 * Type guard to check if a value is a valid Node
 */
export function isNode(value: unknown): value is Node {
  try {
    nodeSchema.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Type guard to check if a value is a valid Relationship
 */
export function isRelationship(value: unknown): value is Relationship {
  try {
    relationshipSchema.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Type assertion for runtime NodeType checking
 */
export function assertValidNodeType(type: string): asserts type is NodeType {
  if (!Object.values(NodeType).includes(type as NodeType)) {
    throw new Error(`Invalid node type: ${type}`);
  }
}

/**
 * Type assertion for runtime RelationshipType checking
 */
export function assertValidRelationshipType(type: string): asserts type is RelationshipType {
  if (!Object.values(RelationshipType).includes(type as RelationshipType)) {
    throw new Error(`Invalid relationship type: ${type}`);
  }
}

// Type aliases for API responses
export type GraphAPIResponse = APIResponse<GraphData>;
export type GraphLayoutResponse = APIResponse<GraphLayout>;
export type GraphStatsResponse = APIResponse<{ nodeCount: number; edgeCount: number }>;