import React, { useEffect, useMemo } from 'react';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { ThemeProvider } from 'styled-components';
import { useColorScheme, Platform } from 'react-native';
import { ErrorBoundary } from 'react-error-boundary';

import RootNavigator from './navigation';
import { store, persistor } from './store';
import { theme, darkTheme, highContrastTheme, GlobalStyle } from './styles/theme';

/**
 * Error fallback component for top-level error boundary
 */
const ErrorFallback: React.FC<{ error: Error; resetErrorBoundary: () => void }> = ({
  error,
  resetErrorBoundary
}) => (
  <div role="alert" style={{ padding: '20px', textAlign: 'center' }}>
    <h2>Something went wrong</h2>
    <pre style={{ color: 'red' }}>{error.message}</pre>
    <button onClick={resetErrorBoundary}>Try again</button>
  </div>
);

/**
 * Root application component with enhanced error handling, theme management,
 * and state persistence configuration
 */
const App: React.FC = () => {
  // Get system color scheme preference
  const colorScheme = useColorScheme();

  // Determine active theme based on system preference and accessibility settings
  const activeTheme = useMemo(() => {
    // Check for high contrast preference
    if (window.matchMedia('(prefers-contrast: more)').matches) {
      return highContrastTheme;
    }
    // Apply theme based on system color scheme
    return colorScheme === 'dark' ? darkTheme : theme;
  }, [colorScheme]);

  // Monitor system theme changes for performance
  useEffect(() => {
    const startTime = performance.now();
    
    const cleanup = () => {
      const duration = performance.now() - startTime;
      if (duration > 16.67) { // More than one frame (60fps)
        console.warn(`Theme switch took ${duration.toFixed(2)}ms`);
      }
    };

    return cleanup;
  }, [activeTheme]);

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error) => {
        console.error('Application Error:', error);
        // Log to error reporting service
        if (process.env.NODE_ENV === 'production') {
          // Send to error reporting service
        }
      }}
      onReset={() => {
        // Reset application state on error recovery
        window.location.reload();
      }}
    >
      <Provider store={store}>
        <PersistGate 
          loading={<div>Loading...</div>} 
          persistor={persistor}
          onBeforeLift={() => {
            // Perform any necessary state rehydration checks
            console.debug('State rehydration complete');
          }}
        >
          <ThemeProvider theme={activeTheme}>
            <GlobalStyle />
            <RootNavigator />
          </ThemeProvider>
        </PersistGate>
      </Provider>
    </ErrorBoundary>
  );
};

export default App;