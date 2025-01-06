import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'; // ^1.9.0
import { 
  User, 
  UserRole, 
  LoginRequest, 
  AuthTokens,
  loginRequestSchema,
  authTokensSchema
} from '../../types/user';
import { encryptData, decryptData } from '../../utils/encryption';
import { RootState } from '../store';

// Constants for authentication configuration
const AUTH_CONFIG = {
  maxRefreshAttempts: 3,
  tokenRefreshThreshold: 300, // 5 minutes in seconds
  mfaTimeoutSeconds: 300,
  maxLoginAttempts: 5,
  tokenStorageKey: 'auth_tokens',
  deviceFingerprintKey: 'device_fingerprint'
} as const;

// Interface for device information
interface DeviceInfo {
  fingerprint: string;
  platform: string;
  userAgent: string;
  biometricSupport: boolean;
}

// Interface for authentication state
interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  mfaRequired: boolean;
  lastAuthAttempt: number | null;
  deviceFingerprint: string | null;
  tokenExpiryTime: number | null;
  refreshAttempts: number;
}

// Initial state with type safety
const initialState: AuthState = {
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
};

// Async thunk for login with enhanced security
export const loginAsync = createAsyncThunk(
  'auth/login',
  async (
    { credentials, deviceInfo }: { credentials: LoginRequest; deviceInfo: DeviceInfo },
    { rejectWithValue }
  ) => {
    try {
      // Validate login request
      const validatedCredentials = loginRequestSchema.parse(credentials);
      
      // Check device fingerprint
      if (localStorage.getItem(AUTH_CONFIG.deviceFingerprintKey) !== deviceInfo.fingerprint) {
        return rejectWithValue('Invalid device fingerprint');
      }

      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Fingerprint': deviceInfo.fingerprint
        },
        body: JSON.stringify({
          ...validatedCredentials,
          deviceInfo
        })
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message);
      }

      const authData = await response.json();
      const validatedTokens = authTokensSchema.parse(authData.tokens);
      
      // Encrypt tokens before storage
      const encryptedTokens = encryptData(validatedTokens);
      localStorage.setItem(AUTH_CONFIG.tokenStorageKey, encryptedTokens);

      return {
        user: authData.user,
        tokens: validatedTokens
      };
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Login failed');
    }
  }
);

// Async thunk for token refresh
export const refreshTokenAsync = createAsyncThunk(
  'auth/refreshToken',
  async (_, { getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const { tokens, refreshAttempts } = state.auth;

    if (refreshAttempts >= AUTH_CONFIG.maxRefreshAttempts) {
      return rejectWithValue('Max refresh attempts exceeded');
    }

    try {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokens?.refreshToken}`
        }
      });

      if (!response.ok) {
        return rejectWithValue('Token refresh failed');
      }

      const newTokens = await response.json();
      const validatedTokens = authTokensSchema.parse(newTokens);
      
      // Update encrypted tokens in storage
      const encryptedTokens = encryptData(validatedTokens);
      localStorage.setItem(AUTH_CONFIG.tokenStorageKey, encryptedTokens);

      return validatedTokens;
    } catch (error) {
      return rejectWithValue('Token refresh failed');
    }
  }
);

// Auth slice with comprehensive state management
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      localStorage.removeItem(AUTH_CONFIG.tokenStorageKey);
      return { ...initialState };
    },
    setMFARequired: (state, action: PayloadAction<boolean>) => {
      state.mfaRequired = action.payload;
    },
    updateTokenExpiry: (state, action: PayloadAction<number>) => {
      state.tokenExpiryTime = action.payload;
    },
    resetError: (state) => {
      state.error = null;
    },
    updateDeviceFingerprint: (state, action: PayloadAction<string>) => {
      state.deviceFingerprint = action.payload;
      localStorage.setItem(AUTH_CONFIG.deviceFingerprintKey, action.payload);
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.lastAuthAttempt = Date.now();
      })
      .addCase(loginAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.tokens = action.payload.tokens;
        state.tokenExpiryTime = Date.now() + (action.payload.tokens.expiresIn * 1000);
        state.refreshAttempts = 0;
      })
      .addCase(loginAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(refreshTokenAsync.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(refreshTokenAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        state.tokens = action.payload;
        state.tokenExpiryTime = Date.now() + (action.payload.expiresIn * 1000);
        state.refreshAttempts = 0;
      })
      .addCase(refreshTokenAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.refreshAttempts += 1;
        if (state.refreshAttempts >= AUTH_CONFIG.maxRefreshAttempts) {
          state.isAuthenticated = false;
          state.user = null;
          state.tokens = null;
        }
      });
  }
});

// Selectors with memoization potential
export const selectIsAuthenticated = (state: RootState) => state.auth.isAuthenticated;
export const selectUser = (state: RootState) => state.auth.user;
export const selectUserRole = (state: RootState) => state.auth.user?.role;
export const selectAuthError = (state: RootState) => state.auth.error;
export const selectMFARequired = (state: RootState) => state.auth.mfaRequired;
export const selectTokenExpiryTime = (state: RootState) => state.auth.tokenExpiryTime;

// Permission check helper
export const hasPermission = (state: RootState, requiredRole: UserRole): boolean => {
  const userRole = selectUserRole(state);
  if (!userRole) return false;
  
  const roleHierarchy = {
    [UserRole.ADMIN]: 3,
    [UserRole.PREMIUM]: 2,
    [UserRole.FREE_USER]: 1,
    [UserRole.ANONYMOUS]: 0
  };

  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
};

export const { 
  logout, 
  setMFARequired, 
  updateTokenExpiry, 
  resetError,
  updateDeviceFingerprint 
} = authSlice.actions;

export default authSlice.reducer;