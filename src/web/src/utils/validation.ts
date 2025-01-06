/**
 * @fileoverview Comprehensive validation utilities for the Art Knowledge Graph application
 * @version 1.0.0
 */

import { z } from 'zod'; // ^3.0.0
import { isEmail } from 'validator'; // ^13.0.0
import type { ValidationResult } from '@types/validation-result'; // ^1.0.0
import {
  ArtworkMetadata,
  ArtworkType,
  ArtworkPeriod,
  type Dimensions,
  ARTWORK_TYPES,
  ARTWORK_PERIODS
} from '../types/artwork';

// Global validation constants
export const MAX_TITLE_LENGTH = 200;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MIN_IMAGE_DIMENSION = 800;
export const MAX_IMAGE_DIMENSION = 8000;
export const ALLOWED_SOURCES = ['getty', 'wikidata', 'google_arts'];
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;

// Period year ranges for validation
const PERIOD_YEAR_RANGES = {
  [ArtworkPeriod.ANCIENT]: { start: -3000, end: 476 },
  [ArtworkPeriod.MEDIEVAL]: { start: 476, end: 1300 },
  [ArtworkPeriod.RENAISSANCE]: { start: 1300, end: 1600 },
  [ArtworkPeriod.BAROQUE]: { start: 1600, end: 1750 },
  [ArtworkPeriod.MODERN]: { start: 1750, end: 1970 },
  [ArtworkPeriod.CONTEMPORARY]: { start: 1970, end: new Date().getFullYear() }
};

// Zod schema for dimensions validation
const dimensionsSchema = z.object({
  width: z.number().min(0).max(10000),
  height: z.number().min(0).max(10000),
  depth: z.number().min(0).max(10000).optional(),
  unit: z.enum(['cm', 'in'])
});

// Zod schema for artwork metadata validation
const artworkMetadataSchema = z.object({
  title: z.string().min(1).max(MAX_TITLE_LENGTH),
  artist: z.string().min(1),
  year: z.number().int().min(-3000).max(new Date().getFullYear()),
  type: z.enum(ARTWORK_TYPES as [string, ...string[]]),
  period: z.enum(ARTWORK_PERIODS as [string, ...string[]]),
  medium: z.string().min(1),
  dimensions: dimensionsSchema,
  description: z.string(),
  source: z.object({
    name: z.string(),
    url: z.string().url(),
    provider: z.enum(ALLOWED_SOURCES as [string, ...string[]])
  }),
  tags: z.array(z.string()),
  style: z.array(z.string()),
  location: z.object({
    museum: z.string().optional(),
    city: z.string(),
    country: z.string()
  })
});

/**
 * Validates artwork metadata with enhanced cross-reference validation
 * @param metadata - The artwork metadata to validate
 * @returns Validation result with detailed errors if any
 */
export function validateArtworkMetadata(metadata: ArtworkMetadata): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: []
  };

  try {
    // Validate against Zod schema
    artworkMetadataSchema.parse(metadata);

    // Cross-reference period with year
    const periodRange = PERIOD_YEAR_RANGES[metadata.period];
    if (metadata.year < periodRange.start || metadata.year > periodRange.end) {
      result.errors.push({
        field: 'year',
        message: `Year ${metadata.year} does not match the specified period ${metadata.period}`
      });
    }

    // Validate dimensions
    if (metadata.dimensions) {
      validateDimensions(metadata.dimensions, result);
    }

    // Validate source URL format and accessibility
    if (!isValidSourceUrl(metadata.source.url)) {
      result.errors.push({
        field: 'source.url',
        message: 'Invalid or inaccessible source URL'
      });
    }

    // Check for data consistency
    if (!isDataConsistent(metadata)) {
      result.errors.push({
        field: 'metadata',
        message: 'Inconsistent data across fields'
      });
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      result.errors.push(...error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      })));
    } else {
      result.errors.push({
        field: 'general',
        message: 'Validation failed due to unexpected error'
      });
    }
  }

  result.isValid = result.errors.length === 0;
  return result;
}

/**
 * Validates login request with enhanced security checks
 * @param request - The login request to validate
 * @returns Validation result with detailed errors if any
 */
export function validateLoginRequest(request: {
  email: string;
  password: string;
  mfaCode?: string;
  biometricToken?: string;
}): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: []
  };

  // Validate email
  if (!isEmail(request.email)) {
    result.errors.push({
      field: 'email',
      message: 'Invalid email format'
    });
  }

  // Validate password against enhanced requirements
  if (!PASSWORD_REGEX.test(request.password)) {
    result.errors.push({
      field: 'password',
      message: 'Password does not meet security requirements'
    });
  }

  // Validate MFA code if provided
  if (request.mfaCode && !/^\d{6}$/.test(request.mfaCode)) {
    result.errors.push({
      field: 'mfaCode',
      message: 'Invalid MFA code format'
    });
  }

  // Validate biometric token if present
  if (request.biometricToken && !isValidBiometricToken(request.biometricToken)) {
    result.errors.push({
      field: 'biometricToken',
      message: 'Invalid biometric token'
    });
  }

  result.isValid = result.errors.length === 0;
  return result;
}

// Helper functions

function validateDimensions(dimensions: Dimensions, result: ValidationResult): void {
  if (dimensions.width < MIN_IMAGE_DIMENSION || dimensions.width > MAX_IMAGE_DIMENSION ||
      dimensions.height < MIN_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION) {
    result.errors.push({
      field: 'dimensions',
      message: `Dimensions must be between ${MIN_IMAGE_DIMENSION} and ${MAX_IMAGE_DIMENSION}`
    });
  }
}

function isValidSourceUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return ALLOWED_SOURCES.some(source => parsedUrl.hostname.includes(source));
  } catch {
    return false;
  }
}

function isDataConsistent(metadata: ArtworkMetadata): boolean {
  // Check for temporal consistency
  const isTemporallyConsistent = metadata.year >= PERIOD_YEAR_RANGES[metadata.period].start &&
                                metadata.year <= PERIOD_YEAR_RANGES[metadata.period].end;

  // Check for style consistency with period
  const isStyleConsistent = metadata.style.some(style =>
    style.toLowerCase().includes(metadata.period.toLowerCase())
  );

  return isTemporallyConsistent && isStyleConsistent;
}

function isValidBiometricToken(token: string): boolean {
  // Validate biometric token format and signature
  return /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/.test(token);
}