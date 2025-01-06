/**
 * @fileoverview Redux middleware for handling API requests with comprehensive request lifecycle
 * management, error handling, performance monitoring, caching, and advanced features.
 * @version 1.0.0
 */

import { Middleware } from '@reduxjs/toolkit';
import * as api from '../../services/api';
import { setLoading, setError, setRequestStatus } from '../slices/uiSlice';
import { handleApiError, isApiError, captureError } from '../../utils/errorHandling';

// API Methods supported by the middleware
const API_METHODS = {
  GET: 'get',
  POST: 'post',
  PUT: 'put',
  DELETE: 'delete',
  PATCH: 'patch'
} as const;

// Configuration constants
const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const CIRCUIT_BREAKER_THRESHOLD = 0.5;
const CACHE_TTL = 300000; // 5 minutes
const REQUEST_PRIORITY = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
} as const;

// Request deduplication cache
const requestCache = new Map<string, Promise<any>>();

// Interface for retry configuration
interface RetryConfig {
  maxRetries: number;
  backoffFactor: number;
  retryableStatuses: number[];
}

// Interface for cache configuration
interface CacheConfig {
  ttl: number;
  key?: string;
  invalidateOn?: string[];
}

// Interface for API action metadata
interface ApiActionMeta {
  api: boolean;
  endpoint: string;
  method: keyof typeof API_METHODS;
  body?: any;
  params?: Record<string, string>;
  skipLoading?: boolean;
  skipError?: boolean;
  timeout?: number;
  retryConfig?: RetryConfig;
  priority?: keyof typeof REQUEST_PRIORITY;
  cacheConfig?: CacheConfig;
  correlationId?: string;
}

// Interface for API action
interface ApiAction {
  type: string;
  payload: any;
  meta: ApiActionMeta;
}

/**
 * Creates API middleware with advanced features
 */
const createApiMiddleware = (): Middleware => {
  return store => next => async (action: ApiAction) => {
    // Skip non-API actions
    if (!action.meta?.api) {
      return next(action);
    }

    const { 
      endpoint, 
      method, 
      body, 
      params,
      skipLoading,
      skipError,
      timeout = DEFAULT_TIMEOUT,
      retryConfig,
      priority = 'MEDIUM',
      cacheConfig,
      correlationId = crypto.randomUUID()
    } = action.meta;

    // Generate cache key if caching is enabled
    const cacheKey = cacheConfig?.key || `${method}:${endpoint}:${JSON.stringify(params)}:${JSON.stringify(body)}`;

    try {
      // Check request cache for duplicates
      if (requestCache.has(cacheKey)) {
        return await requestCache.get(cacheKey);
      }

      // Set loading state if not skipped
      if (!skipLoading) {
        store.dispatch(setLoading(true));
      }

      // Create promise for the API request
      const requestPromise = handleApiRequest(action);
      requestCache.set(cacheKey, requestPromise);

      // Execute request with timeout
      const response = await Promise.race([
        requestPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
      ]);

      // Clear request from cache
      requestCache.delete(cacheKey);

      // Update UI state
      if (!skipLoading) {
        store.dispatch(setLoading(false));
      }

      // Cache successful response if configured
      if (cacheConfig) {
        // Cache implementation would go here
      }

      return response;

    } catch (error) {
      // Clear failed request from cache
      requestCache.delete(cacheKey);

      // Handle errors
      const processedError = isApiError(error) ? error : handleApiError(error);

      if (!skipError) {
        store.dispatch(setError({
          message: processedError.message,
          code: processedError.code,
          correlationId
        }));
      }

      // Reset loading state
      if (!skipLoading) {
        store.dispatch(setLoading(false));
      }

      // Capture error for monitoring
      captureError(processedError, {
        correlationId,
        endpoint,
        method
      });

      throw processedError;
    }
  };
};

/**
 * Handles API request execution with retry logic
 */
const handleApiRequest = async (action: ApiAction): Promise<any> => {
  const { endpoint, method, body, params, retryConfig } = action.meta;
  let attempts = 0;

  while (attempts <= (retryConfig?.maxRetries || MAX_RETRIES)) {
    try {
      // Select appropriate API service method
      const apiMethod = getApiMethod(endpoint, method);
      
      // Execute request
      const response = await apiMethod(params, body);
      
      return response;

    } catch (error) {
      attempts++;

      // Check if should retry
      if (shouldRetry(error, attempts, retryConfig)) {
        // Calculate backoff delay
        const delay = calculateBackoffDelay(attempts, retryConfig?.backoffFactor || 1.5);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }
};

/**
 * Gets appropriate API method based on endpoint and method type
 */
const getApiMethod = (endpoint: string, method: string): Function => {
  // Map endpoints to corresponding API service methods
  const methodMap: Record<string, Function> = {
    '/auth/login': api.auth.login,
    '/auth/register': api.auth.register,
    '/artwork/upload': api.artwork.uploadArtwork,
    '/artwork/list': api.artwork.getArtworkList,
    '/graph/generate': api.graph.generateGraph,
    '/graph/expand': api.graph.expandGraph,
    '/search/artwork': api.search.searchArtwork
  };

  return methodMap[endpoint];
};

/**
 * Determines if request should be retried based on error and configuration
 */
const shouldRetry = (
  error: any, 
  attempts: number, 
  retryConfig?: RetryConfig
): boolean => {
  if (attempts >= (retryConfig?.maxRetries || MAX_RETRIES)) {
    return false;
  }

  const retryableStatuses = retryConfig?.retryableStatuses || [408, 429, 500, 502, 503, 504];
  return retryableStatuses.includes(error.status);
};

/**
 * Calculates exponential backoff delay
 */
const calculateBackoffDelay = (attempt: number, backoffFactor: number): number => {
  return Math.min(1000 * Math.pow(backoffFactor, attempt), 30000);
};

// Export middleware creator
export default createApiMiddleware;