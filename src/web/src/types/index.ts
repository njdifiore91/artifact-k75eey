/**
 * @fileoverview Central type definition file for the Art Knowledge Graph frontend application.
 * Provides a comprehensive type system with enhanced type safety, validation support,
 * and cross-module compatibility.
 * @version 1.0.0
 */

// Import all type definitions from sub-modules
export * from './api';
export * from './artwork';
export * from './graph';
export * from './user';

// Re-export commonly used types with enhanced type safety
import { z } from 'zod'; // v3.0.0
import { UUID } from 'uuid'; // v9.0.0

/**
 * Enhanced response metadata interface with additional tracking capabilities
 */
export interface ResponseMetadata {
  timestamp: string;
  requestId: UUID;
  version: string;
  processingTime: number;
  cache: {
    hit: boolean;
    ttl?: number;
  };
}

/**
 * Enhanced error response with detailed debugging information
 */
export interface ErrorResponse {
  code: string;
  message: string;
  details: Record<string, unknown>;
  path?: string;
  timestamp: string;
  requestId: UUID;
  validationErrors?: Record<string, string[]>;
}

/**
 * Generic API response interface with enhanced error handling and metadata
 */
export interface APIResponse<T> {
  success: boolean;
  data: T;
  error: ErrorResponse | null;
  metadata: ResponseMetadata;
}

/**
 * Enhanced paginated response interface with additional metadata
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  metadata: ResponseMetadata;
}

/**
 * Data source enumeration for artwork metadata
 */
export enum DataSource {
  GETTY = 'GETTY',
  WIKIDATA = 'WIKIDATA',
  GOOGLE_ARTS = 'GOOGLE_ARTS',
  USER_SUBMITTED = 'USER_SUBMITTED'
}

/**
 * Enhanced position interface for graph nodes
 */
export interface Position {
  x: number;
  y: number;
  z?: number;
  scale?: number;
  rotation?: number;
}

/**
 * Enhanced node metadata interface
 */
export interface NodeMetadata {
  label: string;
  description?: string;
  source: DataSource;
  confidence: number;
  lastUpdated: string;
  version: number;
}

/**
 * Type guard to validate ArtworkType enum values
 */
export function isValidArtworkType(value: unknown): value is ArtworkType {
  return (
    typeof value === 'string' &&
    Object.values(ArtworkType).includes(value as ArtworkType)
  );
}

/**
 * Type guard for paginated responses
 */
export function isPaginatedResponse<T>(
  response: unknown
): response is PaginatedResponse<T> {
  return (
    typeof response === 'object' &&
    response !== null &&
    'items' in response &&
    'total' in response &&
    'page' in response &&
    'pageSize' in response &&
    'hasMore' in response
  );
}

/**
 * Type guard for error responses
 */
export function isErrorResponse(
  response: unknown
): response is { error: ErrorResponse } {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    response.error !== null
  );
}

/**
 * Zod schema for runtime validation of API responses
 */
export const apiResponseSchema = <T>(dataSchema: z.ZodType<T>) =>
  z.object({
    success: z.boolean(),
    data: dataSchema,
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.record(z.unknown()),
      timestamp: z.string(),
      requestId: z.string().uuid(),
      validationErrors: z.record(z.array(z.string())).optional()
    }).nullable(),
    metadata: z.object({
      timestamp: z.string(),
      requestId: z.string().uuid(),
      version: z.string(),
      processingTime: z.number(),
      cache: z.object({
        hit: z.boolean(),
        ttl: z.number().optional()
      })
    })
  });

/**
 * Zod schema for runtime validation of paginated responses
 */
export const paginatedResponseSchema = <T>(itemSchema: z.ZodType<T>) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
    hasMore: z.boolean(),
    metadata: z.object({
      timestamp: z.string(),
      requestId: z.string().uuid(),
      version: z.string(),
      processingTime: z.number(),
      cache: z.object({
        hit: z.boolean(),
        ttl: z.number().optional()
      })
    })
  });

// Type assertions for runtime validation
export type ValidatedAPIResponse<T> = z.infer<ReturnType<typeof apiResponseSchema<T>>>;
export type ValidatedPaginatedResponse<T> = z.infer<ReturnType<typeof paginatedResponseSchema<T>>>;