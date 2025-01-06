/**
 * @fileoverview Core API type definitions for the Art Knowledge Graph frontend application.
 * Implements comprehensive type safety for API communication with security-first approach.
 * @version 1.0.0
 */

import { ArtworkAPIResponse } from './artwork';
import { UserAPIResponse } from './user';

/**
 * Supported HTTP methods for API requests
 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Supported API versions
 */
export type APIVersion = 'v1';

/**
 * Default pagination size for list endpoints
 */
const DEFAULT_PAGE_SIZE = 20;

/**
 * Enhanced API response wrapper with comprehensive error handling
 * and request tracking capabilities
 */
export interface APIResponse<T> {
  /** Indicates if the request was successful */
  success: boolean;
  /** Response payload */
  data: T;
  /** Error information if request failed */
  error: APIErrorResponse | null;
  /** HTTP status code */
  status: number;
  /** ISO timestamp of response */
  timestamp: string;
  /** Unique request identifier for tracing */
  requestId: string;
  /** API version used */
  version: APIVersion;
}

/**
 * Comprehensive error response interface with debugging information
 */
export interface APIErrorResponse {
  /** Machine-readable error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional error context */
  details: Record<string, any> | null;
  /** Error stack trace (development only) */
  stack?: string;
  /** Request path that generated the error */
  path: string;
  /** Error timestamp */
  timestamp: string;
}

/**
 * Enhanced interface for paginated API responses
 */
export interface PaginatedResponse<T> {
  /** Array of items for current page */
  items: T[];
  /** Total number of items across all pages */
  total: number;
  /** Current page number (1-based) */
  page: number;
  /** Number of items per page */
  page_size: number;
  /** Total number of pages */
  total_pages: number;
  /** Indicates if there is a next page */
  has_next: boolean;
  /** Indicates if there is a previous page */
  has_previous: boolean;
}

/**
 * Security-focused API request headers interface
 */
export interface APIHeaders {
  /** JWT Bearer token */
  Authorization: string;
  /** Request content type */
  'Content-Type': string;
  /** Accepted response type */
  Accept: string;
  /** Preferred response language */
  'Accept-Language': string;
  /** Unique request identifier */
  'X-Request-ID': string;
  /** API version being used */
  'X-API-Version': APIVersion;
  /** Client application version */
  'X-Client-Version': string;
}

/**
 * Enhanced pagination parameters interface with sorting and filtering
 */
export interface PaginationParams {
  /** Page number (1-based) */
  page: number;
  /** Items per page */
  page_size: number;
  /** Field to sort by */
  sort_by?: string;
  /** Sort direction */
  sort_order?: 'asc' | 'desc';
  /** Additional filtering criteria */
  filter?: Record<string, any>;
}

/**
 * Type guard to check if response is paginated
 */
export function isPaginatedResponse<T>(
  response: any
): response is PaginatedResponse<T> {
  return (
    'items' in response &&
    'total' in response &&
    'page' in response &&
    'page_size' in response
  );
}

/**
 * Type guard to check if response contains an error
 */
export function isErrorResponse(
  response: any
): response is { error: APIErrorResponse } {
  return 'error' in response && response.error !== null;
}

/**
 * Default API headers factory with security best practices
 */
export function createDefaultHeaders(
  token?: string,
  version: APIVersion = 'v1'
): APIHeaders {
  return {
    Authorization: token ? `Bearer ${token}` : '',
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Language': 'en',
    'X-Request-ID': crypto.randomUUID(),
    'X-API-Version': version,
    'X-Client-Version': process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  };
}

/**
 * Default pagination parameters factory
 */
export function createDefaultPaginationParams(
  page: number = 1,
  pageSize: number = DEFAULT_PAGE_SIZE
): PaginationParams {
  return {
    page,
    page_size: pageSize,
    sort_order: 'desc',
  };
}

/**
 * Type assertion for runtime API version checking
 */
export function assertValidAPIVersion(version: string): asserts version is APIVersion {
  if (!['v1'].includes(version)) {
    throw new Error(`Invalid API version: ${version}`);
  }
}

/**
 * Type assertion for runtime HTTP method checking
 */
export function assertValidHTTPMethod(method: string): asserts method is HTTPMethod {
  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    throw new Error(`Invalid HTTP method: ${method}`);
  }
}