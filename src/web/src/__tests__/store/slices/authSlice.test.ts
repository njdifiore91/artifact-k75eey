import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'; // ^29.0.0
import { configureStore } from '@reduxjs/toolkit'; // ^1.9.0
import { setupServer } from 'msw/node'; // ^1.2.1
import { rest } from 'msw'; // ^1.2.1

import {
  reducer as authReducer,
  loginAsync,
  logoutAsync,
  refreshTokenAsync,
  verifyMfaAsync,
  socialAuthAsync,
  selectIsAuthenticated,
  selectUserRole,
  hasPermission,
  updateDeviceFingerprint,
  setMFARequired
} from '../../../store/slices/authSlice';

import {
  User,
  UserRole,
  AuthTokens,
  LoginRequest,
  OAuthProvider
} from '../../../types/user';

// Mock data
const mockUser: User = {
  id: 'test-user-id',
  email: 'test@example.com',
  fullName: 'Test User',
  role: UserRole.FREE_USER,
  isActive: true,
  isVerified: true,
  mfaEnabled: false,
  preferences: {
    theme: 'light',
    notifications: {
      email: true,
      push: true,
      inApp: true
    },
    privacy: {
      profileVisibility: 'public',
      shareActivity: true,
      allowDataCollection: true
    }
  },
  oauthProvider: null,
  biometricEnabled: false,
  lastLoginAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const mockTokens: AuthTokens = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresIn: 3600,
  tokenType: 'Bearer'
};

const mockDeviceInfo = {
  fingerprint: 'mock-device-fingerprint',
  platform: 'web',
  userAgent: 'jest-test',
  biometricSupport: false
};

// MSW server setup
const server = setupServer(
  // Login endpoint
  rest.post('/api/v1/auth/login', (req, res, ctx) => {
    return res(
      ctx.json({
        user: mockUser,
        tokens: mockTokens
      })
    );
  }),

  // Refresh token endpoint
  rest.post('/api/v1/auth/refresh', (req, res, ctx) => {
    return res(
      ctx.json(mockTokens)
    );
  }),

  // MFA verification endpoint
  rest.post('/api/v1/auth/mfa/verify', (req, res, ctx) => {
    return res(
      ctx.json({
        user: mockUser,
        tokens: mockTokens
      })
    );
  }),

  // Social auth endpoint
  rest.post('/api/v1/auth/social/:provider', (req, res, ctx) => {
    return res(
      ctx.json({
        user: { ...mockUser, oauthProvider: req.params.provider },
        tokens: mockTokens
      })
    );
  })
);

// Store setup
const setupStore = () => {
  return configureStore({
    reducer: {
      auth: authReducer
    }
  });
};

describe('authSlice', () => {
  let store: ReturnType<typeof setupStore>;

  beforeEach(() => {
    store = setupStore();
    server.listen();
  });

  afterEach(() => {
    server.resetHandlers();
    localStorage.clear();
    jest.clearAllMocks();
  });

  afterAll(() => {
    server.close();
  });

  describe('reducer tests', () => {
    test('should return initial state', () => {
      expect(store.getState().auth).toEqual({
        user: null,
        tokens: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        mfaRequired: false,
        lastAuthAttempt: null,
        deviceFingerprint: null,
        tokenExpiryTime: null,
        refreshAttempts: 0
      });
    });

    test('should handle device fingerprint update', () => {
      store.dispatch(updateDeviceFingerprint(mockDeviceInfo.fingerprint));
      expect(store.getState().auth.deviceFingerprint).toBe(mockDeviceInfo.fingerprint);
      expect(localStorage.getItem('device_fingerprint')).toBe(mockDeviceInfo.fingerprint);
    });

    test('should handle MFA requirement update', () => {
      store.dispatch(setMFARequired(true));
      expect(store.getState().auth.mfaRequired).toBe(true);
    });
  });

  describe('authentication flow tests', () => {
    const loginCredentials: LoginRequest = {
      email: 'test@example.com',
      password: 'Test123!@#$'
    };

    test('should handle successful login', async () => {
      await store.dispatch(loginAsync({ credentials: loginCredentials, deviceInfo: mockDeviceInfo }));
      
      const state = store.getState().auth;
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(mockUser);
      expect(state.tokens).toEqual(mockTokens);
      expect(state.error).toBeNull();
    });

    test('should handle login failure', async () => {
      server.use(
        rest.post('/api/v1/auth/login', (req, res, ctx) => {
          return res(
            ctx.status(401),
            ctx.json({ message: 'Invalid credentials' })
          );
        })
      );

      await store.dispatch(loginAsync({ credentials: loginCredentials, deviceInfo: mockDeviceInfo }));
      
      const state = store.getState().auth;
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBe('Invalid credentials');
    });

    test('should handle token refresh', async () => {
      // Setup initial authenticated state
      await store.dispatch(loginAsync({ credentials: loginCredentials, deviceInfo: mockDeviceInfo }));
      
      const newTokens = { ...mockTokens, accessToken: 'new-access-token' };
      server.use(
        rest.post('/api/v1/auth/refresh', (req, res, ctx) => {
          return res(ctx.json(newTokens));
        })
      );

      await store.dispatch(refreshTokenAsync());
      
      const state = store.getState().auth;
      expect(state.tokens).toEqual(newTokens);
      expect(state.refreshAttempts).toBe(0);
    });

    test('should handle logout', async () => {
      // Setup initial authenticated state
      await store.dispatch(loginAsync({ credentials: loginCredentials, deviceInfo: mockDeviceInfo }));
      await store.dispatch(logoutAsync());
      
      const state = store.getState().auth;
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.tokens).toBeNull();
      expect(localStorage.getItem('auth_tokens')).toBeNull();
    });
  });

  describe('MFA flow tests', () => {
    test('should handle MFA verification', async () => {
      const mfaCode = '123456';
      
      await store.dispatch(verifyMfaAsync({ 
        code: mfaCode,
        challengeId: 'test-challenge'
      }));
      
      const state = store.getState().auth;
      expect(state.isAuthenticated).toBe(true);
      expect(state.mfaRequired).toBe(false);
    });

    test('should handle MFA failure', async () => {
      server.use(
        rest.post('/api/v1/auth/mfa/verify', (req, res, ctx) => {
          return res(
            ctx.status(401),
            ctx.json({ message: 'Invalid MFA code' })
          );
        })
      );

      await store.dispatch(verifyMfaAsync({
        code: 'invalid',
        challengeId: 'test-challenge'
      }));
      
      const state = store.getState().auth;
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBe('Invalid MFA code');
    });
  });

  describe('social authentication tests', () => {
    test('should handle social authentication', async () => {
      await store.dispatch(socialAuthAsync({
        provider: OAuthProvider.GOOGLE,
        token: 'mock-oauth-token',
        deviceInfo: mockDeviceInfo
      }));
      
      const state = store.getState().auth;
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.oauthProvider).toBe(OAuthProvider.GOOGLE);
    });

    test('should handle social auth failure', async () => {
      server.use(
        rest.post('/api/v1/auth/social/:provider', (req, res, ctx) => {
          return res(
            ctx.status(401),
            ctx.json({ message: 'Invalid OAuth token' })
          );
        })
      );

      await store.dispatch(socialAuthAsync({
        provider: OAuthProvider.GOOGLE,
        token: 'invalid-token',
        deviceInfo: mockDeviceInfo
      }));
      
      const state = store.getState().auth;
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBe('Invalid OAuth token');
    });
  });

  describe('authorization tests', () => {
    test('should correctly check user permissions', async () => {
      await store.dispatch(loginAsync({ 
        credentials: { email: 'admin@example.com', password: 'Admin123!@#' },
        deviceInfo: mockDeviceInfo
      }));

      const state = store.getState();
      expect(hasPermission(state, UserRole.FREE_USER)).toBe(true);
      expect(hasPermission(state, UserRole.ADMIN)).toBe(false);
    });

    test('should handle role-based access', () => {
      const userRole = selectUserRole(store.getState());
      const isAuthenticated = selectIsAuthenticated(store.getState());
      
      expect(userRole).toBeUndefined();
      expect(isAuthenticated).toBe(false);
    });
  });
});