/**
 * API endpoint constants for the Art Knowledge Graph frontend application
 * Centralizes all endpoint URLs and implements RESTful conventions with versioning
 * @version 1.0.0
 */

// API version prefix for all endpoints
export const API_VERSION = '/api/v1';

/**
 * Authentication and authorization endpoints
 * Supports OAuth2 flow with JWT tokens and MFA capabilities
 */
export const AUTH_ENDPOINTS = {
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  LOGOUT: '/auth/logout',
  REFRESH: '/auth/refresh',
  VERIFY: '/auth/verify',
  RESET_PASSWORD: '/auth/reset-password',
  CHANGE_PASSWORD: '/auth/change-password',
  MFA_SETUP: '/auth/mfa/setup',
  MFA_VERIFY: '/auth/mfa/verify'
} as const;

/**
 * Artwork management endpoints
 * Handles artwork upload, metadata, versioning and lifecycle management
 */
export const ARTWORK_ENDPOINTS = {
  UPLOAD: '/artwork/upload',
  BATCH_UPLOAD: '/artwork/upload/batch',
  LIST: '/artwork/list',
  DETAIL: '/artwork/:id',
  METADATA: '/artwork/:id/metadata',
  STATUS: '/artwork/:id/status',
  UPDATE: '/artwork/:id/update',
  DELETE: '/artwork/:id/delete',
  VERSIONS: '/artwork/:id/versions',
  RESTORE: '/artwork/:id/restore'
} as const;

/**
 * Knowledge graph operation endpoints
 * Manages graph visualization, analysis and collaboration features
 */
export const GRAPH_ENDPOINTS = {
  VIEW: '/graph/:id',
  CREATE: '/graph/create',
  NODE_DETAIL: '/graph/node/:id',
  EDGE_DETAIL: '/graph/edge/:id',
  LAYOUT: '/graph/:id/layout',
  EXPORT: '/graph/:id/export',
  SHARE: '/graph/:id/share',
  PERMISSIONS: '/graph/:id/permissions',
  ANALYTICS: '/graph/:id/analytics',
  HISTORY: '/graph/:id/history',
  COMMENTS: '/graph/:id/comments',
  CACHE_INVALIDATE: '/graph/:id/cache/invalidate'
} as const;

/**
 * Search functionality endpoints
 * Provides comprehensive search capabilities across different art domains
 */
export const SEARCH_ENDPOINTS = {
  ARTWORK: '/search/artwork',
  ARTIST: '/search/artist',
  MOVEMENT: '/search/movement',
  PERIOD: '/search/period',
  STYLE: '/search/style',
  TECHNIQUE: '/search/technique',
  ADVANCED: '/search/advanced',
  SUGGESTIONS: '/search/suggestions',
  RECENT: '/search/recent',
  POPULAR: '/search/popular'
} as const;

/**
 * User management endpoints
 * Handles user profile, preferences, and account management
 */
export const USER_ENDPOINTS = {
  PROFILE: '/user/profile',
  PREFERENCES: '/user/preferences',
  HISTORY: '/user/history',
  SAVED_GRAPHS: '/user/saved-graphs',
  NOTIFICATIONS: '/user/notifications',
  ACTIVITY: '/user/activity',
  API_KEYS: '/user/api-keys',
  USAGE_STATS: '/user/usage-stats',
  BILLING: '/user/billing',
  SUBSCRIPTION: '/user/subscription'
} as const;

/**
 * System monitoring and maintenance endpoints
 * Provides system health checks and operational metrics
 */
export const SYSTEM_ENDPOINTS = {
  HEALTH: '/system/health',
  STATUS: '/system/status',
  METRICS: '/system/metrics',
  CONFIG: '/system/config',
  MAINTENANCE: '/system/maintenance'
} as const;

/**
 * Helper function to build full API URLs
 * @param endpoint - The endpoint path
 * @returns The complete API URL with version prefix
 */
export const buildApiUrl = (endpoint: string): string => {
  return `${API_VERSION}${endpoint}`;
};

/**
 * Helper function to replace URL parameters
 * @param endpoint - The endpoint path with parameters
 * @param params - Object containing parameter values
 * @returns The endpoint with replaced parameter values
 */
export const replaceUrlParams = (endpoint: string, params: Record<string, string>): string => {
  let url = endpoint;
  Object.entries(params).forEach(([key, value]) => {
    url = url.replace(`:${key}`, value);
  });
  return url;
};