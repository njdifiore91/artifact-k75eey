/**
 * Analytics Service Entry Point
 * Exports analytics tracking functionality and types for the Art Knowledge Graph application.
 * Implements comprehensive event tracking using Segment and New Relic for monitoring user engagement,
 * system performance, and error tracking.
 * @version 1.0.0
 */

// Re-export analytics tracker singleton and its methods
export {
  AnalyticsTracker,
} from './tracker';

// Re-export event categories and names
export {
  EventCategory,
  EventName,
} from './events';

// Re-export event property interfaces
export type {
  EventProperties,
  UserEventMetadata,
  ArtworkEventMetadata,
  GraphEventMetadata,
  SearchEventMetadata,
  ErrorEventMetadata,
} from './events';

/**
 * Default analytics instance for application-wide use
 * Pre-configured singleton instance of AnalyticsTracker
 */
import { AnalyticsTracker } from './tracker';
export const analytics = AnalyticsTracker.getInstance();

/**
 * Helper function to initialize analytics with environment-specific keys
 * @throws Error if initialization fails
 */
export const initializeAnalytics = async (): Promise<void> => {
  const segmentKey = process.env.REACT_APP_SEGMENT_KEY;
  const newRelicKey = process.env.REACT_APP_NEW_RELIC_KEY;

  if (!segmentKey || !newRelicKey) {
    throw new Error('Analytics keys not found in environment variables');
  }

  await analytics.initialize(segmentKey, newRelicKey);
};

/**
 * Helper function to track user session duration
 * Implements the 15+ minutes average session duration requirement
 */
export const trackSessionEngagement = async (
  userId: string,
  sessionDuration: number
): Promise<void> => {
  await analytics.trackEvent(EventName.USER_LOGIN, {
    category: EventCategory.USER,
    timestamp: Date.now(),
    userId,
    sessionId: '', // Will be populated by tracker
    metadata: {
      sessionDuration,
      milestone: sessionDuration >= 15 * 60 * 1000 ? '15_minutes_reached' : 'in_progress'
    }
  });
};

/**
 * Helper function to track performance metrics
 * Implements performance monitoring requirement
 */
export const trackPerformanceMetric = async (
  metricName: string,
  value: number,
  additionalMetadata?: Record<string, any>
): Promise<void> => {
  await analytics.trackEvent(`performance_${metricName}`, {
    category: EventCategory.USER,
    timestamp: Date.now(),
    userId: null,
    sessionId: '', // Will be populated by tracker
    metadata: {
      metricValue: value,
      ...additionalMetadata
    }
  });
};

/**
 * Helper function to track errors with metadata
 * Implements error tracking requirement
 */
export const trackError = async (
  error: Error,
  context?: Record<string, any>
): Promise<void> => {
  await analytics.trackEvent(EventName.ERROR_OCCUR, {
    category: EventCategory.ERROR,
    timestamp: Date.now(),
    userId: null,
    sessionId: '', // Will be populated by tracker
    metadata: {
      errorCode: error.name,
      errorMessage: error.message,
      stackTrace: error.stack,
      context
    }
  });
};

/**
 * Helper function to reset analytics state
 * Useful for handling user logout or session expiration
 */
export const resetAnalyticsState = async (): Promise<void> => {
  await analytics.resetAnalytics();
};

/**
 * Helper function to identify user with traits
 * Implements user tracking requirement
 */
export const identifyAnalyticsUser = async (
  userId: string,
  userTraits: Record<string, any>
): Promise<void> => {
  await analytics.identifyUser(userId, userTraits);
};