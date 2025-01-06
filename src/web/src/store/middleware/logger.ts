import { Middleware } from '@reduxjs/toolkit';

// Constants for styling console output
const LOG_STYLES = {
  action: 'color: #149eca; font-weight: bold;',
  prevState: 'color: #666; font-weight: bold;',
  nextState: 'color: #4CAF50; font-weight: bold;',
  error: 'color: #ff0000; font-weight: bold;',
  performance: 'color: #9c27b0; font-weight: bold;'
} as const;

// Performance monitoring threshold in milliseconds
const PERFORMANCE_THRESHOLD_MS = 100;

// Maximum length for logged state/payload objects
const MAX_LOG_LENGTH = 500;

// Environment check for development mode
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Formats payload data for console output with size limits and circular reference handling
 * @param payload - Action payload to be formatted
 * @returns Formatted string representation of the payload
 */
const formatPayload = (payload: any): string => {
  if (!payload) return 'undefined';
  
  try {
    // Handle circular references in payload
    const seen = new WeakSet();
    const formatted = JSON.stringify(payload, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular Reference]';
        }
        seen.add(value);
      }
      return value;
    }, 2);

    // Truncate if exceeds maximum length
    if (formatted.length > MAX_LOG_LENGTH) {
      return `${formatted.substring(0, MAX_LOG_LENGTH)}...`;
    }
    
    return formatted;
  } catch (error) {
    return `[Unserializable Payload]: ${String(error)}`;
  }
};

/**
 * Measures and logs performance metrics for state updates
 * @param actionType - Type of the dispatched action
 * @param startTime - Timestamp when action processing started
 */
const measurePerformance = (actionType: string, startTime: number): void => {
  const endTime = performance.now();
  const timeTaken = endTime - startTime;

  if (timeTaken > PERFORMANCE_THRESHOLD_MS) {
    console.warn(
      `%c⚠️ Performance Warning: Action ${actionType} took ${timeTaken.toFixed(2)}ms to process`,
      LOG_STYLES.performance
    );
  }
};

/**
 * Creates Redux middleware for comprehensive action and state logging with performance monitoring
 * Only active in development environment
 */
const createLoggerMiddleware = (): Middleware => {
  if (!isDevelopment) {
    return () => (next) => (action) => next(action);
  }

  return (store) => (next) => (action) => {
    try {
      const startTime = performance.now();
      const actionType = action.type || 'Unknown Action';

      // Log action
      console.group(`%cAction: ${actionType}`, LOG_STYLES.action);
      console.log('Payload:', formatPayload(action.payload));

      // Log previous state
      console.log('%cPrevious State:', LOG_STYLES.prevState);
      console.log(formatPayload(store.getState()));

      // Pass action to next middleware
      const result = next(action);

      // Log next state
      console.log('%cNext State:', LOG_STYLES.nextState);
      console.log(formatPayload(store.getState()));

      // Measure performance
      measurePerformance(actionType, startTime);

      console.groupEnd();
      return result;
    } catch (error) {
      console.error(
        `%cLogger Middleware Error: ${error instanceof Error ? error.message : String(error)}`,
        LOG_STYLES.error
      );
      return next(action);
    }
  };
};

// Create and export the configured middleware instance
const loggerMiddleware = createLoggerMiddleware();

export default loggerMiddleware;