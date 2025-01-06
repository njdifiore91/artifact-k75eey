import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRegistry } from 'react-native';
import * as Sentry from '@sentry/react';
import { ErrorBoundary } from 'react-error-boundary';
import App from './App';

/**
 * Initializes error tracking and performance monitoring
 */
function initializeApp(): void {
  // Initialize Sentry for error tracking and performance monitoring
  if (process.env.NODE_ENV === 'production') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.2,
      integrations: [
        new Sentry.BrowserTracing({
          tracePropagationTargets: ['localhost', 'app.artknowledgegraph.com'],
        }),
      ],
      beforeSend(event) {
        // Sanitize sensitive data before sending to Sentry
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers;
        }
        return event;
      },
    });
  }

  // Enable React strict mode in development
  if (process.env.NODE_ENV === 'development') {
    // Add development-specific configurations
    console.debug('Running in development mode');
  }
}

/**
 * Registers the React Native application with platform-specific settings
 */
function registerApp(): void {
  AppRegistry.registerComponent('ArtKnowledgeGraph', () => App);

  // Configure platform-specific initial props
  const initialProps = {
    platform: 'web',
    enablePerformanceTracking: true,
    enableErrorBoundary: true,
  };

  // Register the web-specific entry point
  AppRegistry.runApplication('ArtKnowledgeGraph', {
    rootTag: document.getElementById('root'),
    initialProps,
  });
}

/**
 * Renders the React application with error boundaries and performance tracking
 */
function renderApp(): void {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found');
  }

  const root = ReactDOM.createRoot(rootElement);

  // Track initial render performance
  const startTime = performance.now();

  root.render(
    <React.StrictMode>
      <ErrorBoundary
        fallback={
          <div role="alert">
            <h2>Application Error</h2>
            <p>The application failed to load. Please refresh the page.</p>
          </div>
        }
        onError={(error) => {
          console.error('Application Error:', error);
          if (process.env.NODE_ENV === 'production') {
            Sentry.captureException(error);
          }
        }}
        onReset={() => {
          // Reset application state
          window.location.reload();
        }}
      >
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );

  // Log initial render performance in development
  if (process.env.NODE_ENV === 'development') {
    const renderTime = performance.now() - startTime;
    console.debug(`Initial render completed in ${renderTime.toFixed(2)}ms`);
  }

  // Handle hydration errors
  root.onRecoverableError = (error) => {
    console.error('Hydration error:', error);
    if (process.env.NODE_ENV === 'production') {
      Sentry.captureException(error, {
        tags: { errorType: 'hydration' },
      });
    }
  };
}

// Initialize the application
try {
  initializeApp();
  registerApp();
  renderApp();
} catch (error) {
  console.error('Application initialization failed:', error);
  if (process.env.NODE_ENV === 'production') {
    Sentry.captureException(error, {
      tags: { errorType: 'initialization' },
    });
  }
}