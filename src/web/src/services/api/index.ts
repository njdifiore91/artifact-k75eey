/**
 * @fileoverview Central API service module that aggregates and exports all API-related functionality
 * for the Art Knowledge Graph frontend application. Implements comprehensive error handling,
 * request management, and performance optimizations.
 * @version 1.0.0
 */

import axios from 'axios'; // ^1.0.0
import CircuitBreaker from 'opossum'; // ^7.0.0
import QuickLRU from 'quick-lru'; // ^6.0.0
import * as authApi from './auth';
import * as artworkApi from './artwork';
import * as graphApi from './graph';
import * as searchApi from './search';
import { APIResponse, createDefaultHeaders } from '../../types/api';
import { handleApiError, handleRuntimeError } from '../../utils/errorHandling';

// API Configuration Constants
export const API_VERSION = '1.0.0';
export const DEFAULT_TIMEOUT = 30000;
export const MAX_RETRIES = 3;
export const CACHE_TTL = 300000; // 5 minutes

// Circuit Breaker Configuration
const BREAKER_OPTIONS = {
  timeout: 10000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
};

// Cache Configuration
const cache = new QuickLRU({
  maxSize: 1000,
  maxAge: CACHE_TTL
});

// API Configuration Interface
interface ApiConfig {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
  enableCircuitBreaker?: boolean;
  enableCache?: boolean;
}

/**
 * Initializes API configuration including circuit breakers, caching, and request interceptors
 */
export function initializeApi(config: ApiConfig = {}): void {
  // Configure axios defaults
  axios.defaults.baseURL = config.baseURL || process.env.REACT_APP_API_URL;
  axios.defaults.timeout = config.timeout || DEFAULT_TIMEOUT;
  axios.defaults.headers.common = {
    ...createDefaultHeaders(),
    ...config.headers
  };

  // Configure request interceptor
  axios.interceptors.request.use(
    (config) => {
      const correlationId = crypto.randomUUID();
      config.headers['X-Correlation-ID'] = correlationId;
      config.headers['X-Client-Version'] = API_VERSION;
      return config;
    },
    (error) => Promise.reject(handleApiError(error))
  );

  // Configure response interceptor
  axios.interceptors.response.use(
    (response) => response,
    (error) => Promise.reject(handleApiError(error))
  );

  // Initialize circuit breakers if enabled
  if (config.enableCircuitBreaker) {
    const authBreaker = new CircuitBreaker(authApi.login, BREAKER_OPTIONS);
    const artworkBreaker = new CircuitBreaker(artworkApi.uploadArtwork, BREAKER_OPTIONS);
    const graphBreaker = new CircuitBreaker(graphApi.generateGraph, BREAKER_OPTIONS);
    const searchBreaker = new CircuitBreaker(searchApi.searchArtwork, BREAKER_OPTIONS);

    // Configure circuit breaker event handlers
    [authBreaker, artworkBreaker, graphBreaker, searchBreaker].forEach(breaker => {
      breaker.on('open', () => console.warn('Circuit breaker opened'));
      breaker.on('halfOpen', () => console.info('Circuit breaker half-open'));
      breaker.on('close', () => console.info('Circuit breaker closed'));
    });
  }
}

// Export authentication API functions
export const auth = {
  login: authApi.login,
  register: authApi.register,
  logout: authApi.logout,
  refreshToken: authApi.refreshToken
};

// Export artwork management API functions
export const artwork = {
  uploadArtwork: artworkApi.uploadArtwork,
  getArtworkList: artworkApi.getArtworkList,
  getArtworkDetail: artworkApi.getArtworkDetail,
  updateArtworkMetadata: artworkApi.updateArtworkMetadata
};

// Export graph operations API functions
export const graph = {
  generateGraph: graphApi.generateGraph,
  expandGraph: graphApi.expandGraph,
  getNodeDetails: graphApi.getNodeDetails,
  exportGraph: graphApi.exportGraph
};

// Export search functionality API functions
export const search = {
  searchArtwork: searchApi.searchArtwork,
  searchArtists: searchApi.searchArtists,
  searchMovements: searchApi.searchMovements,
  searchPeriods: searchApi.searchPeriods
};

/**
 * Transforms and standardizes API errors for consistent error handling
 */
export function handleError(error: Error): APIResponse<any> {
  if (axios.isAxiosError(error)) {
    return handleApiError(error);
  }
  return handleRuntimeError(error);
}

/**
 * Clears all API caches
 */
export function clearApiCache(): void {
  cache.clear();
  searchApi.clearSearchCache();
}

/**
 * Creates a cancel token for request cancellation
 */
export function createCancelToken() {
  return axios.CancelToken.source();
}

// Export type definitions for external use
export type { ApiConfig };