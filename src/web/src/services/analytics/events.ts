import { APIResponse } from '@segment/analytics-next'; // v1.55.0

/**
 * Main categories for analytics event classification
 */
export enum EventCategory {
  USER = 'user',
  ARTWORK = 'artwork',
  GRAPH = 'graph',
  SEARCH = 'search',
  ERROR = 'error'
}

/**
 * Specific event names for granular tracking of user interactions and system events
 */
export enum EventName {
  // User events
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  USER_REGISTER = 'user_register',
  
  // Artwork events
  ARTWORK_UPLOAD = 'artwork_upload',
  ARTWORK_VIEW = 'artwork_view',
  
  // Graph events
  GRAPH_GENERATE = 'graph_generate',
  GRAPH_INTERACT = 'graph_interact',
  GRAPH_EXPORT = 'graph_export',
  
  // Search events
  SEARCH_PERFORM = 'search_perform',
  
  // Error events
  ERROR_OCCUR = 'error_occur'
}

/**
 * Base properties required for all analytics events
 */
export interface EventProperties {
  category: EventCategory;
  timestamp: number;
  userId: string | null;
  sessionId: string;
  metadata: Record<string, any>;
}

/**
 * Metadata structure for user-related events
 */
export interface UserEventMetadata {
  userType: string;
  premiumStatus: boolean;
  lastLoginDate: string;
}

/**
 * Metadata structure for artwork-related events
 */
export interface ArtworkEventMetadata {
  artworkId: string;
  artworkType: string;
  uploadSize: number;
}

/**
 * Metadata structure for graph-related events
 */
export interface GraphEventMetadata {
  graphId: string;
  nodeCount: number;
  edgeCount: number;
  interactionType: string;
}

/**
 * Metadata structure for search-related events
 */
export interface SearchEventMetadata {
  searchTerm: string;
  filterCount: number;
  resultCount: number;
}

/**
 * Metadata structure for error-related events
 */
export interface ErrorEventMetadata {
  errorCode: string;
  errorMessage: string;
  stackTrace: string;
}