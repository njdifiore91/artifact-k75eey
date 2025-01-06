/**
 * @fileoverview Root Redux store configuration with enhanced type safety, performance optimization,
 * and security features for the Art Knowledge Graph application.
 * @version 1.0.0
 */

import { configureStore } from '@reduxjs/toolkit'; // ^1.9.0
import { persistStore, persistReducer } from 'redux-persist'; // ^6.0.0
import storage from 'redux-persist/lib/storage'; // ^6.0.0
import { encryptTransform } from 'redux-persist-transform-encrypt';
import { compressTransform } from 'redux-persist-transform-compress';

// Import reducers
import { reducer as artworkReducer } from './slices/artworkSlice';
import { reducer as authReducer } from './slices/authSlice';
import { reducer as graphReducer } from './slices/graphSlice';
import { reducer as uiReducer } from './slices/uiSlice';

// Import middleware
import { apiMiddleware } from './middleware/api';
import { cacheMiddleware } from './middleware/cache';
import { loggerMiddleware } from './middleware/logger';

// Environment check
const isDevelopment = process.env.NODE_ENV === 'development';

// Encryption key for persisted state
const ENCRYPTION_KEY = process.env.REACT_APP_PERSIST_KEY || crypto.randomUUID();

// Configure persistence with security and performance optimizations
const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['auth', 'ui'], // Only persist necessary slices
  blacklist: ['artwork', 'graph'], // Exclude large/sensitive data
  transforms: [
    encryptTransform({
      secretKey: ENCRYPTION_KEY,
      onError: (error) => {
        console.error('Persist encryption error:', error);
      },
    }),
    compressTransform({
      whitelist: ['ui.preferences', 'auth.deviceFingerprint'],
    }),
  ],
  timeout: 10000,
  debug: isDevelopment,
};

// Combine reducers with type safety
const rootReducer = {
  artwork: artworkReducer,
  auth: authReducer,
  graph: graphReducer,
  ui: uiReducer,
};

// Create persisted reducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

// Configure middleware with conditional development tools
const configureMiddleware = (getDefaultMiddleware: any) => {
  const middleware = getDefaultMiddleware({
    serializableCheck: {
      ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      ignoredPaths: ['artwork.uploadProgress', 'graph.optimisticUpdates'],
    },
    thunk: {
      extraArgument: {
        api: apiMiddleware,
        cache: cacheMiddleware,
      },
    },
  }).concat(apiMiddleware, cacheMiddleware);

  // Add logger in development
  if (isDevelopment) {
    middleware.push(loggerMiddleware);
  }

  return middleware;
};

// Configure store with performance monitoring
export const store = configureStore({
  reducer: persistedReducer,
  middleware: configureMiddleware,
  devTools: isDevelopment && {
    maxAge: 50,
    trace: true,
    traceLimit: 25,
    actionsBlacklist: ['@artwork/setUploadProgress'],
  },
  preloadedState: undefined,
  enhancers: [],
});

// Configure persistor
export const persistor = persistStore(store, {
  manualPersist: false,
  transforms: persistConfig.transforms,
});

// Export types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Export store instance and persistor
export default {
  store,
  persistor,
};

// Type guard for checking if state is rehydrated
export const isStateRehydrated = (state: RootState): boolean => {
  return state._persist?.rehydrated === true;
};

// Type-safe hooks for use in components
export const useAppDispatch = () => store.dispatch as AppDispatch;
export const useAppSelector = <T>(selector: (state: RootState) => T): T => {
  return selector(store.getState());
};

// Performance monitoring in development
if (isDevelopment) {
  let prevState = store.getState();
  store.subscribe(() => {
    const currentState = store.getState();
    const stateChangeTime = performance.now();
    
    console.debug(
      `State updated in ${(performance.now() - stateChangeTime).toFixed(2)}ms`,
      {
        changed: Object.keys(currentState).filter(
          key => currentState[key] !== prevState[key]
        ),
      }
    );
    
    prevState = currentState;
  });
}