import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  validateArtworkMetadata,
  validateLoginRequest,
  validateRegistrationRequest,
  validateImageFile,
  MAX_TITLE_LENGTH,
  MAX_FILE_SIZE,
  SUPPORTED_IMAGE_TYPES,
  MIN_IMAGE_DIMENSION,
  MAX_IMAGE_DIMENSION
} from '../../utils/validation';
import { ArtworkMetadata, ArtworkType, ArtworkPeriod } from '../../types/artwork';

// Test data setup
const VALID_ARTWORK_METADATA: ArtworkMetadata = {
  title: 'The Starry Night',
  artist: 'Vincent van Gogh',
  year: 1889,
  type: ArtworkType.PAINTING,
  period: ArtworkPeriod.MODERN,
  medium: 'Oil on canvas',
  dimensions: {
    width: 73.7,
    height: 92.1,
    unit: 'cm'
  },
  description: 'A masterpiece of post-impressionist art',
  source: {
    name: 'Museum of Modern Art',
    url: 'https://www.moma.org/collection/works/79802',
    provider: 'getty'
  },
  tags: ['post-impressionism', 'landscape', 'night sky'],
  style: ['Post-Impressionism', 'Modern'],
  location: {
    museum: 'Museum of Modern Art',
    city: 'New York',
    country: 'United States'
  }
};

describe('validateArtworkMetadata', () => {
  let metadata: ArtworkMetadata;

  beforeEach(() => {
    metadata = { ...VALID_ARTWORK_METADATA };
  });

  test('should pass validation for valid artwork metadata', () => {
    const result = validateArtworkMetadata(metadata);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should fail validation for title exceeding maximum length', () => {
    metadata.title = 'A'.repeat(MAX_TITLE_LENGTH + 1);
    const result = validateArtworkMetadata(metadata);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'title',
      message: expect.stringContaining('maximum length')
    });
  });

  test('should fail validation for incorrect period-year correlation', () => {
    metadata.period = ArtworkPeriod.CONTEMPORARY;
    metadata.year = 1889;
    const result = validateArtworkMetadata(metadata);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'year',
      message: expect.stringContaining('does not match the specified period')
    });
  });

  test('should fail validation for invalid source URL', () => {
    metadata.source.url = 'invalid-url';
    const result = validateArtworkMetadata(metadata);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'source.url',
      message: expect.stringContaining('Invalid or inaccessible source URL')
    });
  });

  test('should fail validation for inconsistent style and period', () => {
    metadata.style = ['Renaissance'];
    const result = validateArtworkMetadata(metadata);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'metadata',
      message: 'Inconsistent data across fields'
    });
  });
});

describe('validateLoginRequest', () => {
  test('should pass validation for valid login request', () => {
    const request = {
      email: 'user@example.com',
      password: 'SecurePass123!@#',
      mfaCode: '123456'
    };
    const result = validateLoginRequest(request);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should fail validation for invalid email format', () => {
    const request = {
      email: 'invalid-email',
      password: 'SecurePass123!@#'
    };
    const result = validateLoginRequest(request);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'email',
      message: 'Invalid email format'
    });
  });

  test('should fail validation for weak password', () => {
    const request = {
      email: 'user@example.com',
      password: 'weak'
    };
    const result = validateLoginRequest(request);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'password',
      message: 'Password does not meet security requirements'
    });
  });

  test('should fail validation for invalid MFA code', () => {
    const request = {
      email: 'user@example.com',
      password: 'SecurePass123!@#',
      mfaCode: '12345' // Invalid length
    };
    const result = validateLoginRequest(request);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'mfaCode',
      message: 'Invalid MFA code format'
    });
  });
});

describe('validateImageFile', () => {
  const createMockFile = (type: string, size: number): File => {
    return new File([''], 'test.jpg', { type });
  };

  test('should pass validation for valid image file', () => {
    const file = createMockFile('image/jpeg', 1024 * 1024);
    const result = validateImageFile(file);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should fail validation for unsupported file type', () => {
    const file = createMockFile('image/gif', 1024 * 1024);
    const result = validateImageFile(file);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'fileType',
      message: expect.stringContaining('Unsupported file type')
    });
  });

  test('should fail validation for file exceeding size limit', () => {
    const file = createMockFile('image/jpeg', MAX_FILE_SIZE + 1);
    const result = validateImageFile(file);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'fileSize',
      message: expect.stringContaining('exceeds maximum allowed size')
    });
  });

  test('should fail validation for invalid dimensions', async () => {
    const file = createMockFile('image/jpeg', 1024 * 1024);
    Object.defineProperty(file, 'width', { value: MIN_IMAGE_DIMENSION - 1 });
    Object.defineProperty(file, 'height', { value: MIN_IMAGE_DIMENSION - 1 });
    
    const result = await validateImageFile(file);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'dimensions',
      message: expect.stringContaining('minimum dimension requirements')
    });
  });
});

describe('validateRegistrationRequest', () => {
  test('should pass validation for valid registration request', () => {
    const request = {
      email: 'user@example.com',
      password: 'SecurePass123!@#',
      fullName: 'John Doe',
      acceptedTerms: true,
      preferredLanguage: 'en'
    };
    const result = validateRegistrationRequest(request);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should fail validation for invalid name format', () => {
    const request = {
      email: 'user@example.com',
      password: 'SecurePass123!@#',
      fullName: '123', // Invalid name format
      acceptedTerms: true,
      preferredLanguage: 'en'
    };
    const result = validateRegistrationRequest(request);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'fullName',
      message: 'Invalid name format'
    });
  });

  test('should fail validation when terms not accepted', () => {
    const request = {
      email: 'user@example.com',
      password: 'SecurePass123!@#',
      fullName: 'John Doe',
      acceptedTerms: false,
      preferredLanguage: 'en'
    };
    const result = validateRegistrationRequest(request);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'acceptedTerms',
      message: 'Terms must be accepted'
    });
  });

  test('should fail validation for unsupported language', () => {
    const request = {
      email: 'user@example.com',
      password: 'SecurePass123!@#',
      fullName: 'John Doe',
      acceptedTerms: true,
      preferredLanguage: 'xx' // Invalid language code
    };
    const result = validateRegistrationRequest(request);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'preferredLanguage',
      message: 'Unsupported language code'
    });
  });
});