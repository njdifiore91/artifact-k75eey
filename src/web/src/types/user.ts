import { z } from 'zod'; // v3.0.0

/**
 * Enumeration of user roles with associated permission levels
 */
export enum UserRole {
  ANONYMOUS = 'ANONYMOUS',
  FREE_USER = 'FREE_USER',
  PREMIUM = 'PREMIUM',
  ADMIN = 'ADMIN'
}

/**
 * Enumeration of supported OAuth providers
 */
export enum OAuthProvider {
  GOOGLE = 'GOOGLE',
  APPLE = 'APPLE'
}

/**
 * Theme preference type
 */
export type Theme = 'light' | 'dark' | 'system';

/**
 * Notification settings interface
 */
export interface NotificationSettings {
  email: boolean;
  push: boolean;
  inApp: boolean;
}

/**
 * Privacy settings interface
 */
export interface PrivacySettings {
  profileVisibility: 'public' | 'private';
  shareActivity: boolean;
  allowDataCollection: boolean;
}

/**
 * User preferences interface with type safety
 */
export interface UserPreferences {
  theme: Theme;
  notifications: NotificationSettings;
  privacy: PrivacySettings;
}

/**
 * Comprehensive user data interface
 */
export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  isVerified: boolean;
  mfaEnabled: boolean;
  preferences: UserPreferences;
  oauthProvider: OAuthProvider | null;
  biometricEnabled: boolean;
  lastLoginAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Login request payload interface with MFA and biometric support
 */
export interface LoginRequest {
  email: string;
  password: string;
  mfaCode?: string;
  biometricToken?: string;
}

/**
 * Registration request payload interface
 */
export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  acceptedTerms: boolean;
}

/**
 * Authentication tokens interface
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

// Constants for validation
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;
export const EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
export const MFA_CODE_REGEX = /^[0-9]{6}$/;

/**
 * Zod schema for runtime validation of user data
 */
export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().regex(EMAIL_REGEX),
  fullName: z.string().min(1),
  role: z.nativeEnum(UserRole),
  isActive: z.boolean(),
  isVerified: z.boolean(),
  mfaEnabled: z.boolean(),
  preferences: z.object({
    theme: z.enum(['light', 'dark', 'system']),
    notifications: z.object({
      email: z.boolean(),
      push: z.boolean(),
      inApp: z.boolean(),
    }),
    privacy: z.object({
      profileVisibility: z.enum(['public', 'private']),
      shareActivity: z.boolean(),
      allowDataCollection: z.boolean(),
    }),
  }),
  oauthProvider: z.nativeEnum(OAuthProvider).nullable(),
  biometricEnabled: z.boolean(),
  lastLoginAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * Zod schema for login request validation
 */
export const loginRequestSchema = z.object({
  email: z.string().regex(EMAIL_REGEX),
  password: z.string().regex(PASSWORD_REGEX),
  mfaCode: z.string().regex(MFA_CODE_REGEX).optional(),
  biometricToken: z.string().optional(),
});

/**
 * Zod schema for registration request validation
 */
export const registerRequestSchema = z.object({
  email: z.string().regex(EMAIL_REGEX),
  password: z.string().regex(PASSWORD_REGEX),
  fullName: z.string().min(1),
  acceptedTerms: z.literal(true),
});

/**
 * Zod schema for auth tokens validation
 */
export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().positive(),
  tokenType: z.literal('Bearer'),
});

// Type assertions for runtime type checking
export type ValidatedUser = z.infer<typeof userSchema>;
export type ValidatedLoginRequest = z.infer<typeof loginRequestSchema>;
export type ValidatedRegisterRequest = z.infer<typeof registerRequestSchema>;
export type ValidatedAuthTokens = z.infer<typeof authTokensSchema>;