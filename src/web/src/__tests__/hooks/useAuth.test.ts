import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { useAuth } from '../../hooks/useAuth';
import TokenService from '@auth/token-service';
import LocalAuthentication from '@react-native-community/biometrics';
import { User, UserRole, AuthTokens, LoginRequest } from '../../types/user';

// Mock external services
jest.mock('@auth/token-service');
jest.mock('@react-native-community/biometrics');

// Test data
const mockUser: User = {
  id: 'test-user-id',
  email: 'test@example.com',
  fullName: 'Test User',
  role: UserRole.FREE_USER,
  isActive: true,
  isVerified: true,
  mfaEnabled: true,
  biometricEnabled: true,
  preferences: {
    theme: 'light',
    notifications: { email: true, push: true, inApp: true },
    privacy: { profileVisibility: 'private', shareActivity: false, allowDataCollection: true }
  },
  oauthProvider: null,
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

// Test store setup
const createTestStore = () => {
  return configureStore({
    reducer: {
      auth: (state = {
        user: null,
        isAuthenticated: false,
        isMfaRequired: false,
        isBiometricEnabled: false,
        isLoading: false,
        error: null
      }, action) => {
        switch (action.type) {
          case 'auth/loginStart':
            return { ...state, isLoading: true, error: null };
          case 'auth/loginSuccess':
            return {
              ...state,
              isLoading: false,
              isAuthenticated: true,
              user: action.payload.user
            };
          case 'auth/loginFailure':
            return {
              ...state,
              isLoading: false,
              error: action.payload
            };
          case 'auth/logout':
            return {
              ...state,
              user: null,
              isAuthenticated: false
            };
          default:
            return state;
        }
      }
    }
  });
};

describe('useAuth', () => {
  let store: ReturnType<typeof createTestStore>;
  let wrapper: React.FC<{ children: React.ReactNode }>;

  beforeEach(() => {
    store = createTestStore();
    wrapper = ({ children }) => (
      <Provider store={store}>{children}</Provider>
    );
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Authentication Flow', () => {
    it('should initialize with unauthenticated state', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      
      expect(result.current.isAuthenticated).toBeFalsy();
      expect(result.current.user).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should handle successful login', async () => {
      const credentials: LoginRequest = {
        email: 'test@example.com',
        password: 'Test123!@#'
      };

      (TokenService.login as jest.Mock).mockResolvedValueOnce({
        user: mockUser,
        tokens: mockTokens
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login(credentials);
      });

      expect(result.current.isAuthenticated).toBeTruthy();
      expect(result.current.user).toEqual(mockUser);
      expect(TokenService.storeTokens).toHaveBeenCalledWith(mockTokens);
    });

    it('should handle logout', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.isAuthenticated).toBeFalsy();
      expect(result.current.user).toBeNull();
      expect(TokenService.clearTokens).toHaveBeenCalled();
      expect(TokenService.clearBiometricToken).toHaveBeenCalled();
    });

    it('should refresh tokens automatically', async () => {
      jest.useFakeTimers();
      
      (TokenService.getRefreshToken as jest.Mock).mockResolvedValue(mockTokens.refreshToken);
      (TokenService.refreshTokens as jest.Mock).mockResolvedValue(mockTokens);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.refreshToken();
      });

      expect(TokenService.refreshTokens).toHaveBeenCalledWith(mockTokens.refreshToken);
      expect(TokenService.storeTokens).toHaveBeenCalledWith(mockTokens);
    });
  });

  describe('Multi-Factor Authentication', () => {
    it('should handle MFA requirement', async () => {
      const credentials: LoginRequest = {
        email: 'test@example.com',
        password: 'Test123!@#'
      };

      (TokenService.login as jest.Mock).mockResolvedValueOnce({
        requiresMfa: true
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      const response = await act(async () => {
        return await result.current.login(credentials);
      });

      expect(response).toEqual({ requiresMfa: true });
      expect(result.current.isMfaRequired).toBeTruthy();
    });

    it('should complete MFA verification', async () => {
      const credentials: LoginRequest = {
        email: 'test@example.com',
        password: 'Test123!@#',
        mfaCode: '123456'
      };

      (TokenService.login as jest.Mock).mockResolvedValueOnce({
        user: mockUser,
        tokens: mockTokens
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login(credentials);
      });

      expect(result.current.isAuthenticated).toBeTruthy();
      expect(result.current.user).toEqual(mockUser);
    });
  });

  describe('Biometric Authentication', () => {
    it('should handle successful biometric authentication', async () => {
      (LocalAuthentication.isSensorAvailable as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.simplePrompt as jest.Mock).mockResolvedValue({ success: true });
      (TokenService.getBiometricToken as jest.Mock).mockResolvedValue('biometric-token');
      (TokenService.login as jest.Mock).mockResolvedValueOnce({
        user: mockUser,
        tokens: mockTokens
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.loginWithBiometric();
      });

      expect(result.current.isAuthenticated).toBeTruthy();
      expect(result.current.user).toEqual(mockUser);
    });

    it('should handle biometric authentication failure', async () => {
      (LocalAuthentication.isSensorAvailable as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.simplePrompt as jest.Mock).mockResolvedValue({ success: false });

      const { result } = renderHook(() => useAuth(), { wrapper });

      const response = await act(async () => {
        return await result.current.loginWithBiometric();
      });

      expect(response.success).toBeFalsy();
      expect(result.current.isAuthenticated).toBeFalsy();
    });
  });

  describe('Error Handling', () => {
    it('should handle login failure', async () => {
      const credentials: LoginRequest = {
        email: 'test@example.com',
        password: 'wrong-password'
      };

      (TokenService.login as jest.Mock).mockRejectedValueOnce(
        new Error('Invalid credentials')
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login(credentials);
      });

      expect(result.current.isAuthenticated).toBeFalsy();
      expect(result.current.error).toBe('Invalid credentials');
    });

    it('should handle token refresh failure', async () => {
      (TokenService.getRefreshToken as jest.Mock).mockResolvedValue(mockTokens.refreshToken);
      (TokenService.refreshTokens as jest.Mock).mockRejectedValueOnce(
        new Error('Token refresh failed')
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.refreshToken();
      });

      expect(result.current.isAuthenticated).toBeFalsy();
      expect(TokenService.clearTokens).toHaveBeenCalled();
    });

    it('should handle network errors', async () => {
      const credentials: LoginRequest = {
        email: 'test@example.com',
        password: 'Test123!@#'
      };

      (TokenService.login as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      const response = await act(async () => {
        return await result.current.login(credentials);
      });

      expect(response.success).toBeFalsy();
      expect(result.current.error).toBe('Network error');
    });
  });
});