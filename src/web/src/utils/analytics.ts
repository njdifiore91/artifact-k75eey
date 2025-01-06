import { debounce } from 'lodash'; // v4.17.21
import { EventCategory } from '../services/analytics/events';
import { AnalyticsTracker } from '../services/analytics/tracker';

// Constants for analytics configuration
const ANALYTICS_DEBOUNCE_MS = 1000;
const MIN_SESSION_DURATION_MS = 900000; // 15 minutes

/**
 * Validates and sanitizes event metadata by removing potential PII
 * @param metadata - Raw event metadata
 * @returns Sanitized metadata object
 */
const sanitizeMetadata = (metadata: Record<string, any>): Record<string, any> => {
  const piiFields = ['email', 'phone', 'address', 'password'];
  return Object.entries(metadata).reduce((acc, [key, value]) => {
    if (!piiFields.includes(key.toLowerCase())) {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, any>);
};

/**
 * Tracks user-initiated actions with debouncing and retry logic
 * @param eventName - Name of the event to track
 * @param metadata - Event-specific metadata
 */
export const trackUserAction = debounce(async (
  eventName: string,
  metadata: Record<string, any>
): Promise<void> => {
  try {
    // Validate event name format
    if (!eventName.match(/^[a-z_]{3,50}$/)) {
      throw new Error('Invalid event name format');
    }

    const sanitizedMetadata = sanitizeMetadata(metadata);
    const enrichedMetadata = {
      ...sanitizedMetadata,
      browserInfo: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        screenResolution: `${window.screen.width}x${window.screen.height}`
      },
      timestamp: Date.now()
    };

    await AnalyticsTracker.getInstance().trackEvent(eventName, {
      category: EventCategory.USER,
      timestamp: Date.now(),
      userId: null, // Will be populated by tracker if user is identified
      sessionId: '', // Will be populated by tracker
      metadata: enrichedMetadata
    });
  } catch (error) {
    await trackError(error as Error, 'user_action_tracking');
  }
}, ANALYTICS_DEBOUNCE_MS);

/**
 * Tracks graph-specific interactions with performance metrics
 * @param interactionType - Type of graph interaction
 * @param graphData - Graph-specific data and metrics
 */
export const trackGraphInteraction = async (
  interactionType: string,
  graphData: Record<string, any>
): Promise<void> => {
  try {
    const startTime = performance.now();
    const performanceMetrics = {
      interactionDuration: 0,
      renderTime: performance.getEntriesByType('measure')
        .filter(entry => entry.name.includes('graph'))
        .map(entry => entry.duration)
        .reduce((acc, dur) => acc + dur, 0)
    };

    const enrichedGraphData = {
      ...graphData,
      nodeCount: graphData.nodes?.length ?? 0,
      edgeCount: graphData.edges?.length ?? 0,
      interactionType,
      performanceMetrics: {
        ...performanceMetrics,
        interactionDuration: performance.now() - startTime
      }
    };

    await AnalyticsTracker.getInstance().trackEvent('graph_interaction', {
      category: EventCategory.GRAPH,
      timestamp: Date.now(),
      userId: null,
      sessionId: '',
      metadata: enrichedGraphData
    });
  } catch (error) {
    await trackError(error as Error, 'graph_interaction_tracking');
  }
};

/**
 * Tracks application errors with context and grouping
 * @param error - Error object to track
 * @param context - Error context information
 */
export const trackError = async (
  error: Error,
  context: string
): Promise<void> => {
  try {
    const errorMetadata = {
      errorName: error.name,
      errorMessage: error.message,
      stackTrace: error.stack,
      context,
      browserInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language
      },
      timestamp: Date.now()
    };

    await AnalyticsTracker.getInstance().trackEvent('error_occurred', {
      category: EventCategory.ERROR,
      timestamp: Date.now(),
      userId: null,
      sessionId: '',
      metadata: errorMetadata
    });
  } catch (trackingError) {
    // Fallback error logging if tracking fails
    console.error('Error tracking failed:', trackingError);
  }
};

/**
 * Tracks comprehensive session metrics and engagement data
 */
export const trackSessionMetrics = async (): Promise<void> => {
  try {
    const sessionStart = performance.timing.navigationStart;
    const currentTime = Date.now();
    const sessionDuration = currentTime - sessionStart;

    // Only track sessions meeting minimum duration requirement
    if (sessionDuration >= MIN_SESSION_DURATION_MS) {
      const engagementMetrics = {
        sessionDuration,
        pageViews: performance.getEntriesByType('navigation').length,
        interactions: performance.getEntriesByType('measure')
          .filter(entry => entry.name.includes('interaction'))
          .length,
        activeTime: document.visibilityState === 'visible' ? 
          sessionDuration : 
          performance.getEntriesByType('measure')
            .filter(entry => entry.name === 'visibility_visible')
            .reduce((acc, entry) => acc + entry.duration, 0)
      };

      await AnalyticsTracker.getInstance().trackEvent('session_metrics', {
        category: EventCategory.USER,
        timestamp: currentTime,
        userId: null,
        sessionId: '',
        metadata: {
          ...engagementMetrics,
          engagementScore: (engagementMetrics.activeTime / sessionDuration) * 100,
          sessionQuality: engagementMetrics.interactions > 10 ? 'high' : 'low'
        }
      });
    }
  } catch (error) {
    await trackError(error as Error, 'session_metrics_tracking');
  }
};