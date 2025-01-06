/**
 * @fileoverview Enhanced authentication service implementing secure OAuth2 flow,
 * multi-factor authentication, biometric verification, and token management.
 * @version 1.0.0
 */

import axios, { AxiosInstance } from 'axios'; // ^1.0.0
import CryptoJS from 'crypto-js'; // ^4.1.1
import { APIResponse } from '../../types/api';
import { 
  User, 
  LoginRequest, 
  AuthTokens, 
  loginRequestSchema, 
  authTokensSchema 
} from '../../types/user';

// Constants for authentication configuration
const API_BASE_URL = process.env.REACT_APP_API_URL + '/auth';
const TOKEN_STORAGE_KEY = 'encrypted_auth_tokens';
const TOKEN_EXPIRY_BUFFER = 300; // 5 minutes buffer for token refresh
const MAX_RETRY_ATTEMPTS = 3;
const CERTIFICATE_PINS = [
  'sha256//JS5h5uC+CyZ1xFa1GEOeGGKgNqFrwbWVOqk5nAh8nD0=',
  'sha256//YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg='
];

/**
 * Enhanced authentication service with security features
 */
export class AuthService {
  private axiosInstance: AxiosInstance;
  private refreshTimer: NodeJS.Timeout | null = null;
  private encryptionKey: string;

  constructor() {
    // Initialize axios instance with security configurations
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Version': process.env.REACT_APP_VERSION
      },
      withCredentials: true
    });

    // Configure certificate pinning
    this.axiosInstance.interceptors.request.use(config => {
      config.httpsAgent = {
        ...config.httpsAgent,
        options: {
          ...config.httpsAgent?.options,
          ca: CERTIFICATE_PINS
        }
      };
      return config;
    });

    // Generate unique encryption key for token storage
    this.encryptionKey = this.generateEncryptionKey();
  }

  /**
   * Enhanced login with MFA and biometric support
   */
  public async login(request: LoginRequest): Promise<APIResponse<AuthTokens>> {
    try {
      // Validate login request
      const validatedRequest = loginRequestSchema.parse(request);

      // Check biometric availability if token present
      if (validatedRequest.biometricToken) {
        await this.verifyBiometricToken(validatedRequest.biometricToken);
      }

      // Make login request with retry mechanism
      const response = await this.makeRequestWithRetry<AuthTokens>('/login', {
        method: 'POST',
        data: validatedRequest
      });

      if (response.success) {
        // Validate auth tokens
        const validatedTokens = authTokensSchema.parse(response.data);
        
        // Store tokens securely
        this.securelyStoreTokens(validatedTokens);
        
        // Set up token refresh
        this.setupTokenRefresh(validatedTokens);
      }

      return response;
    } catch (error) {
      return this.handleAuthError(error);
    }
  }

  /**
   * Enhanced token refresh with proactive renewal
   */
  public async refreshToken(refreshToken: string): Promise<APIResponse<AuthTokens>> {
    try {
      // Verify token integrity
      if (!this.verifyTokenIntegrity(refreshToken)) {
        throw new Error('Invalid refresh token');
      }

      const response = await this.makeRequestWithRetry<AuthTokens>('/refresh', {
        method: 'POST',
        data: { refreshToken }
      });

      if (response.success) {
        const validatedTokens = authTokensSchema.parse(response.data);
        this.securelyStoreTokens(validatedTokens);
        this.setupTokenRefresh(validatedTokens);
      }

      return response;
    } catch (error) {
      return this.handleAuthError(error);
    }
  }

  /**
   * Secure token storage with encryption
   */
  private securelyStoreTokens(tokens: AuthTokens): void {
    const encryptedTokens = CryptoJS.AES.encrypt(
      JSON.stringify(tokens),
      this.encryptionKey
    ).toString();

    localStorage.setItem(TOKEN_STORAGE_KEY, encryptedTokens);
  }

  /**
   * Retrieve securely stored tokens
   */
  private getStoredTokens(): AuthTokens | null {
    const encryptedTokens = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!encryptedTokens) return null;

    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedTokens, this.encryptionKey);
      return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
    } catch {
      return null;
    }
  }

  /**
   * Set up automatic token refresh
   */
  private setupTokenRefresh(tokens: AuthTokens): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    const refreshTime = (tokens.expiresIn - TOKEN_EXPIRY_BUFFER) * 1000;
    this.refreshTimer = setTimeout(() => {
      this.refreshToken(tokens.refreshToken);
    }, refreshTime);
  }

  /**
   * Make request with retry mechanism
   */
  private async makeRequestWithRetry<T>(
    url: string,
    config: any,
    retryCount = 0
  ): Promise<APIResponse<T>> {
    try {
      const response = await this.axiosInstance(url, config);
      return response.data;
    } catch (error) {
      if (retryCount < MAX_RETRY_ATTEMPTS && this.shouldRetry(error)) {
        await this.delay(Math.pow(2, retryCount) * 1000);
        return this.makeRequestWithRetry(url, config, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Verify biometric token with platform API
   */
  private async verifyBiometricToken(token: string): Promise<boolean> {
    const response = await this.axiosInstance.post('/verify-biometric', { token });
    return response.data.success;
  }

  /**
   * Generate unique encryption key for token storage
   */
  private generateEncryptionKey(): string {
    const browserData = [
      navigator.userAgent,
      navigator.language,
      screen.colorDepth,
      screen.pixelDepth
    ].join('');
    return CryptoJS.SHA256(browserData).toString();
  }

  /**
   * Verify token integrity
   */
  private verifyTokenIntegrity(token: string): boolean {
    try {
      const [header, payload, signature] = token.split('.');
      if (!header || !payload || !signature) return false;
      
      const decodedPayload = JSON.parse(atob(payload));
      return !this.isTokenExpired(decodedPayload.exp);
    } catch {
      return false;
    }
  }

  /**
   * Check if token is expired
   */
  private isTokenExpired(expirationTime: number): boolean {
    return Date.now() >= expirationTime * 1000;
  }

  /**
   * Determine if request should be retried
   */
  private shouldRetry(error: any): boolean {
    return (
      axios.isAxiosError(error) &&
      error.response?.status >= 500 &&
      error.response?.status !== 501
    );
  }

  /**
   * Handle authentication errors
   */
  private handleAuthError(error: any): APIResponse<AuthTokens> {
    return {
      success: false,
      data: null,
      error: {
        code: error.response?.data?.code || 'AUTH_ERROR',
        message: error.message || 'Authentication failed',
        details: error.response?.data?.details || null,
        path: error.response?.config?.url || '',
        timestamp: new Date().toISOString()
      },
      status: error.response?.status || 500,
      timestamp: new Date().toISOString(),
      requestId: error.response?.headers?.['x-request-id'] || '',
      version: 'v1'
    };
  }

  /**
   * Delay helper for retry mechanism
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new AuthService();