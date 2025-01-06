import { useDispatch, useSelector } from 'react-redux';
import { useCallback, useEffect, useRef } from 'react';
import LocalAuthentication from '@react-native-community/biometrics'; // v2.1.0
import TokenService from '@auth/token-service'; // v1.0.0
import { User, LoginRequest, UserRole } from '../../types/user';

// Constants for token management
const TOKEN_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const BIOMETRIC_CONFIG = {
  title: 'Biometric Authentication',
  subtitle: 'Authenticate to access Art Knowledge Graph',
  description: 'Please verify your identity',
  cancelButtonText: 'Cancel',
  fallbackLabel: 'Use Passcode',
};

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isMfaRequired: boolean;
  isBiometricEnabled: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Enhanced custom hook for managing authentication state and operations
 * Supports OAuth2, MFA, biometric authentication, and secure token management
 */
export const useAuth = () => {
  const dispatch = useDispatch();
  const refreshInterval = useRef<NodeJS.Timeout>();

  // Enhanced selectors with type safety
  const user = useSelector((state: { auth: AuthState }) => state.auth.user);
  const isAuthenticated = useSelector((state: { auth: AuthState }) => state.auth.isAuthenticated);
  const isMfaRequired = useSelector((state: { auth: AuthState }) => state.auth.isMfaRequired);
  const isBiometricEnabled = useSelector((state: { auth: AuthState }) => state.auth.isBiometricEnabled);
  const isLoading = useSelector((state: { auth: AuthState }) => state.auth.isLoading);
  const error = useSelector((state: { auth: AuthState }) => state.auth.error);

  /**
   * Handles secure token refresh
   */
  const handleTokenRefresh = useCallback(async () => {
    try {
      const refreshToken = await TokenService.getRefreshToken();
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const newTokens = await TokenService.refreshTokens(refreshToken);
      await TokenService.storeTokens(newTokens);
      
      // Update authentication state with new tokens
      dispatch({ type: 'auth/refreshTokens', payload: newTokens });
    } catch (error) {
      console.error('Token refresh failed:', error);
      // Force logout on refresh failure
      handleLogout();
    }
  }, [dispatch]);

  /**
   * Enhanced login handler with MFA and biometric support
   */
  const handleLogin = useCallback(async (credentials: LoginRequest) => {
    try {
      dispatch({ type: 'auth/loginStart' });

      // Generate device fingerprint for enhanced security
      const deviceFingerprint = await TokenService.generateDeviceFingerprint();
      
      const loginPayload = {
        ...credentials,
        deviceFingerprint,
      };

      // Initial authentication attempt
      const response = await TokenService.login(loginPayload);

      if (response.requiresMfa) {
        dispatch({ type: 'auth/mfaRequired' });
        return { requiresMfa: true };
      }

      // Store tokens securely
      await TokenService.storeTokens(response.tokens);

      // Setup automatic token refresh
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
      refreshInterval.current = setInterval(handleTokenRefresh, TOKEN_REFRESH_INTERVAL);

      dispatch({ 
        type: 'auth/loginSuccess',
        payload: {
          user: response.user,
          tokens: response.tokens
        }
      });

      return { success: true };
    } catch (error) {
      dispatch({ 
        type: 'auth/loginFailure',
        payload: error instanceof Error ? error.message : 'Login failed'
      });
      return { success: false, error };
    }
  }, [dispatch, handleTokenRefresh]);

  /**
   * Handles biometric authentication
   */
  const handleBiometricAuth = useCallback(async () => {
    try {
      const biometricSupport = await LocalAuthentication.isSensorAvailable();
      
      if (!biometricSupport) {
        throw new Error('Biometric authentication not available');
      }

      const biometricAuth = await LocalAuthentication.simplePrompt(BIOMETRIC_CONFIG);
      
      if (!biometricAuth.success) {
        throw new Error('Biometric authentication failed');
      }

      const biometricToken = await TokenService.getBiometricToken();
      
      if (!biometricToken) {
        throw new Error('No biometric token available');
      }

      return handleLogin({ biometricToken });
    } catch (error) {
      console.error('Biometric authentication failed:', error);
      return { success: false, error };
    }
  }, [handleLogin]);

  /**
   * Enhanced logout handler with secure cleanup
   */
  const handleLogout = useCallback(async () => {
    try {
      // Clear token refresh interval
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }

      // Revoke tokens on server
      const refreshToken = await TokenService.getRefreshToken();
      if (refreshToken) {
        await TokenService.revokeTokens(refreshToken);
      }

      // Clear secure storage
      await TokenService.clearTokens();
      await TokenService.clearBiometricToken();

      dispatch({ type: 'auth/logout' });
    } catch (error) {
      console.error('Logout failed:', error);
      // Force logout even if server revocation fails
      dispatch({ type: 'auth/logout' });
    }
  }, [dispatch]);

  // Setup token refresh on mount
  useEffect(() => {
    if (isAuthenticated) {
      handleTokenRefresh();
      refreshInterval.current = setInterval(handleTokenRefresh, TOKEN_REFRESH_INTERVAL);
    }

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, [isAuthenticated, handleTokenRefresh]);

  return {
    user,
    isAuthenticated,
    isMfaRequired,
    isBiometricEnabled,
    isLoading,
    error,
    login: handleLogin,
    loginWithBiometric: handleBiometricAuth,
    logout: handleLogout,
    refreshToken: handleTokenRefresh,
  };
};

export type UseAuth = ReturnType<typeof useAuth>;