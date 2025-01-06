import * as Sentry from '@sentry/react'; // ^7.0.0

// Error codes mapping for standardized HTTP status codes
const ERROR_CODES = {
  validation_error: 400,
  authentication_error: 401,
  authorization_error: 403,
  not_found: 404,
  conflict: 409,
  internal_error: 500,
} as const;

// Default error message for production environment
const DEFAULT_ERROR_MESSAGE = 'An unexpected error occurred. Please try again later.';

// Environment check for development-specific behavior
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

/**
 * Enumeration of possible error types in the application
 * Used for consistent error classification across the application
 */
export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_ERROR = 'API_ERROR',
  RUNTIME_ERROR = 'RUNTIME_ERROR'
}

/**
 * Interface for standardized API error responses
 * Ensures consistent error structure from backend APIs
 */
export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: Record<string, any>;
  request_id?: string;
  status_code: number;
  timestamp: string;
}

/**
 * Interface for standardized application error objects
 * Used throughout the frontend for consistent error handling
 */
export interface AppError {
  type: ErrorType;
  message: string;
  details?: Record<string, any>;
  originalError?: Error;
  request_id?: string;
  stack?: string;
  timestamp: string;
}

/**
 * Type guard to validate if an unknown error matches the ApiErrorResponse interface
 * @param error - Unknown error object to validate
 * @returns Boolean indicating if error is an ApiErrorResponse
 */
export function isApiError(error: unknown): error is ApiErrorResponse {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as Partial<ApiErrorResponse>;
  
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.status_code === 'number' &&
    candidate.status_code >= 100 &&
    candidate.status_code < 600 &&
    typeof candidate.timestamp === 'string' &&
    (!candidate.details || typeof candidate.details === 'object') &&
    (!candidate.request_id || typeof candidate.request_id === 'string')
  );
}

/**
 * Maps API errors to standardized AppError format and reports to Sentry if severe
 * @param error - Unknown error object from API
 * @returns Standardized AppError object
 */
export function handleApiError(error: unknown): AppError {
  const timestamp = new Date().toISOString();
  
  // Handle non-API errors
  if (!isApiError(error)) {
    return {
      type: ErrorType.API_ERROR,
      message: DEFAULT_ERROR_MESSAGE,
      timestamp,
      details: IS_DEVELOPMENT ? { originalError: error } : undefined
    };
  }

  // Map status code to error type
  let errorType: ErrorType;
  switch (error.status_code) {
    case ERROR_CODES.validation_error:
      errorType = ErrorType.VALIDATION_ERROR;
      break;
    case ERROR_CODES.authentication_error:
      errorType = ErrorType.AUTHENTICATION_ERROR;
      break;
    case ERROR_CODES.authorization_error:
      errorType = ErrorType.AUTHORIZATION_ERROR;
      break;
    case ERROR_CODES.not_found:
      errorType = ErrorType.NOT_FOUND;
      break;
    default:
      errorType = ErrorType.API_ERROR;
  }

  // Create standardized error object
  const appError: AppError = {
    type: errorType,
    message: IS_DEVELOPMENT ? error.message : DEFAULT_ERROR_MESSAGE,
    request_id: error.request_id || crypto.randomUUID(),
    timestamp,
    details: IS_DEVELOPMENT ? error.details : undefined
  };

  // Report severe errors to Sentry
  if (error.status_code >= ERROR_CODES.internal_error) {
    Sentry.captureException(error, {
      extra: {
        request_id: appError.request_id,
        error_code: error.code,
        error_details: error.details
      }
    });
  }

  return appError;
}

/**
 * Handles runtime errors and transforms them into AppError format
 * @param error - Runtime Error object
 * @returns Standardized AppError object
 */
export function handleRuntimeError(error: Error): AppError {
  const timestamp = new Date().toISOString();
  const request_id = crypto.randomUUID();

  // Create standardized error object
  const appError: AppError = {
    type: ErrorType.RUNTIME_ERROR,
    message: IS_DEVELOPMENT ? error.message : DEFAULT_ERROR_MESSAGE,
    request_id,
    timestamp,
    stack: IS_DEVELOPMENT ? error.stack : undefined,
    originalError: IS_DEVELOPMENT ? error : undefined
  };

  // Report all runtime errors to Sentry
  Sentry.captureException(error, {
    extra: {
      request_id,
      error_type: ErrorType.RUNTIME_ERROR,
      error_stack: error.stack
    }
  });

  return appError;
}