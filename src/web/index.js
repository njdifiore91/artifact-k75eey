/**
 * Entry point for the Art Knowledge Graph web application
 * Initializes React Native web platform with error handling and performance monitoring
 * @version 1.0.0
 */

import { AppRegistry, Platform } from 'react-native'; // ^0.71.0
import { ErrorBoundary } from 'react-error-boundary'; // ^6.0.0
import { PerformanceMonitor } from '@performance-monitor/web'; // ^1.0.0
import App from './src/App';

// Performance monitoring configuration
const performanceConfig = {
  sampleRate: 0.1, // 10% sampling
  maxEntries: 100,
  reportingThreshold: 3000, // 3 seconds
  metrics: ['FCP', 'LCP', 'CLS', 'FID'],
};

/**
 * Checks required web platform features and capabilities
 * @returns {boolean} True if all required features are available
 */
function checkPlatformFeatures() {
  const requiredFeatures = {
    webgl: !!window.WebGLRenderingContext,
    webWorkers: !!window.Worker,
    localStorage: !!window.localStorage,
    indexedDB: !!window.indexedDB,
    webCrypto: !!window.crypto?.subtle,
  };

  // Log feature support for debugging
  Object.entries(requiredFeatures).forEach(([feature, supported]) => {
    if (!supported) {
      console.warn(`Required feature not supported: ${feature}`);
    }
  });

  return Object.values(requiredFeatures).every(Boolean);
}

/**
 * Error fallback component for critical failures
 */
const CriticalErrorFallback = ({ error }) => (
  <div role="alert" style={{
    padding: '20px',
    margin: '20px',
    border: '1px solid #ff0000',
    borderRadius: '4px',
    backgroundColor: '#fff5f5'
  }}>
    <h2>Application Error</h2>
    <pre style={{ color: '#ff0000' }}>{error.message}</pre>
    <button onClick={() => window.location.reload()} style={{
      padding: '8px 16px',
      backgroundColor: '#0066cc',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer'
    }}>
      Reload Application
    </button>
  </div>
);

/**
 * Initializes the React Native web application with error handling
 * and performance monitoring
 */
function initializeApp() {
  // Start performance monitoring
  const performanceMonitor = new PerformanceMonitor(performanceConfig);
  performanceMonitor.startTracking();

  // Check platform compatibility
  if (!checkPlatformFeatures()) {
    document.getElementById('root').innerHTML = `
      <div role="alert" style="padding: 20px; text-align: center;">
        <h2>Unsupported Browser</h2>
        <p>Your browser does not support all required features. Please use a modern browser.</p>
      </div>
    `;
    return;
  }

  // Configure development environment
  if (__DEV__) {
    // Enable React DevTools
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__.inject = function () {};
    
    // Enable strict mode warnings
    console.warn = (...args) => {
      const warning = args.join(' ');
      if (warning.includes('UNSAFE_')) {
        console.trace('Strict Mode Warning:', warning);
      }
    };
  }

  // Get root element with type safety
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found');
  }

  // Register the application
  AppRegistry.registerComponent('ArtKnowledgeGraph', () => () => (
    <ErrorBoundary
      FallbackComponent={CriticalErrorFallback}
      onError={(error, errorInfo) => {
        // Log to error reporting service in production
        if (process.env.NODE_ENV === 'production') {
          console.error('Critical application error:', error, errorInfo);
        }
        performanceMonitor.logError(error);
      }}
      onReset={() => {
        // Clear any error state and refresh data
        window.location.reload();
      }}
    >
      <App />
    </ErrorBoundary>
  ));

  // Start the application
  AppRegistry.runApplication('ArtKnowledgeGraph', {
    rootTag: rootElement,
    initialProps: {
      platform: Platform.OS,
      version: process.env.REACT_APP_VERSION,
    }
  });

  // Track initialization completion
  performanceMonitor.markEvent('app_initialized');
}

// Initialize the application with error handling
try {
  initializeApp();
} catch (error) {
  console.error('Failed to initialize application:', error);
  document.getElementById('root').innerHTML = `
    <div role="alert" style="padding: 20px; text-align: center;">
      <h2>Application Failed to Start</h2>
      <p>Please try refreshing the page. If the problem persists, contact support.</p>
    </div>
  `;
}