/**
 * @fileoverview API service for artwork search functionality with enhanced error handling,
 * caching, retries, and request cancellation support.
 * @version 1.0.0
 */

import axios, { AxiosError, CancelToken } from 'axios'; // ^1.4.0
import axiosRetry from 'axios-retry'; // ^3.5.0
import { setupCache } from 'axios-cache-adapter'; // ^2.7.3
import createHttpError from 'http-errors'; // ^2.0.1

import { 
  APIResponse, 
  PaginatedResponse, 
  PaginationParams,
  createDefaultHeaders 
} from '../../types/api';
import { 
  ArtworkResponse, 
  ArtworkType, 
  ArtworkPeriod 
} from '../../types/artwork';

// Constants for configuration
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_SORT_ORDER = 'desc';
const REQUEST_TIMEOUT = 5000; // 5 seconds
const MAX_RETRIES = 3;
const CACHE_TTL = 300000; // 5 minutes in milliseconds

// Configure axios cache adapter
const cache = setupCache({
  maxAge: CACHE_TTL,
  exclude: {
    query: false,
    methods: ['post', 'patch', 'put', 'delete']
  },
  key: (req) => {
    // Custom cache key including query params and filters
    return `${req.url}${JSON.stringify(req.params)}${JSON.stringify(req.data)}`;
  }
});

// Configure axios instance with cache and retries
const api = axios.create({
  adapter: cache.adapter,
  timeout: REQUEST_TIMEOUT
});

// Configure retry strategy
axiosRetry(api, {
  retries: MAX_RETRIES,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error: AxiosError) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || 
           (error.response?.status === 429); // Retry on rate limit
  }
});

/**
 * Search filter interface for type safety
 */
interface SearchFilters {
  type?: ArtworkType;
  period?: ArtworkPeriod;
  yearStart?: number;
  yearEnd?: number;
  artist?: string;
  style?: string[];
  [key: string]: any;
}

/**
 * Validates and sanitizes search parameters
 */
function validateSearchParams(
  query: string,
  pagination: PaginationParams,
  filters?: SearchFilters
): void {
  if (!query?.trim()) {
    throw createHttpError(400, 'Search query is required');
  }

  if (pagination.page < 1) {
    throw createHttpError(400, 'Page number must be greater than 0');
  }

  if (filters?.yearStart && filters?.yearEnd && filters.yearStart > filters.yearEnd) {
    throw createHttpError(400, 'Invalid year range');
  }
}

/**
 * Searches for artwork with comprehensive error handling, caching, and retry support
 * @param query - Search query string
 * @param paginationParams - Pagination parameters
 * @param filters - Optional search filters
 * @param cancelToken - Optional cancellation token
 * @returns Promise with paginated artwork results
 */
export async function searchArtwork(
  query: string,
  paginationParams: PaginationParams = { 
    page: 1, 
    page_size: DEFAULT_PAGE_SIZE,
    sort_order: DEFAULT_SORT_ORDER 
  },
  filters?: SearchFilters,
  cancelToken?: CancelToken
): Promise<APIResponse<PaginatedResponse<ArtworkResponse>>> {
  try {
    // Validate input parameters
    validateSearchParams(query, paginationParams, filters);

    // Construct search parameters
    const params = {
      q: query.trim(),
      page: paginationParams.page,
      page_size: paginationParams.page_size,
      sort_order: paginationParams.sort_order,
      ...filters
    };

    // Make API request with enhanced error handling
    const response = await api.get<APIResponse<PaginatedResponse<ArtworkResponse>>>(
      '/api/v1/search/artwork',
      {
        params,
        headers: createDefaultHeaders(),
        cancelToken,
      }
    );

    // Validate response structure
    if (!response.data.success) {
      throw createHttpError(response.data.error?.code || 500, response.data.error?.message);
    }

    return response.data;

  } catch (error) {
    if (axios.isCancel(error)) {
      throw createHttpError(499, 'Request cancelled');
    }

    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.error?.message || 'Search request failed';

      switch (status) {
        case 400:
          throw createHttpError(400, 'Invalid search parameters');
        case 401:
          throw createHttpError(401, 'Authentication required');
        case 403:
          throw createHttpError(403, 'Search access denied');
        case 429:
          throw createHttpError(429, 'Rate limit exceeded');
        default:
          throw createHttpError(status, message);
      }
    }

    // Handle unexpected errors
    throw createHttpError(500, 'An unexpected error occurred during search');
  }
}

/**
 * Clears the search cache
 * Useful when forcing a fresh search
 */
export function clearSearchCache(): void {
  cache.store.clear();
}

/**
 * Creates a cancellation token for search requests
 * @returns CancelToken source
 */
export function createSearchCancelToken(): CancelToken.Source {
  return axios.CancelToken.source();
}

export type { SearchFilters };