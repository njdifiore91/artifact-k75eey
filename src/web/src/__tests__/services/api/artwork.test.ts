import { describe, test, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import * as Sentry from '@sentry/browser';
import { RequestManager } from 'request-manager';

import { 
  uploadArtwork, 
  getArtworkList, 
  getArtworkDetail, 
  updateArtworkMetadata, 
  checkArtworkStatus 
} from '../../../services/api/artwork';
import { handleApiError } from '../../../utils/errorHandling';
import { 
  ArtworkType, 
  ArtworkPeriod, 
  ArtworkMetadata, 
  ArtworkUploadRequest,
  ArtworkResponse,
  ArtworkAPIResponse 
} from '../../../types/artwork';
import { ARTWORK_ENDPOINTS, API_VERSION } from '../../../constants/endpoints';

// Mock setup
let mockAxios: MockAdapter;
jest.mock('@sentry/browser');
jest.mock('request-manager');

// Mock data
const mockArtworkMetadata: ArtworkMetadata = {
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
  description: 'A famous post-impressionist painting',
  source: {
    name: 'MoMA',
    url: 'https://moma.org/starry-night',
    provider: 'Museum of Modern Art'
  },
  tags: ['post-impressionism', 'landscape', 'night-scene'],
  style: ['post-impressionist'],
  location: {
    museum: 'Museum of Modern Art',
    city: 'New York',
    country: 'USA'
  }
};

const mockFile = new File(['mock image content'], 'starry-night.jpg', { type: 'image/jpeg' });

const mockUploadRequest: ArtworkUploadRequest = {
  image: mockFile,
  metadata: mockArtworkMetadata,
  options: {
    compress: true,
    generateThumbnail: true,
    maxSize: 2048
  }
};

const mockArtworkResponse: ArtworkResponse = {
  id: 'art123',
  image_url: 'https://cdn.artapp.com/images/starry-night.jpg',
  thumbnail_url: 'https://cdn.artapp.com/thumbnails/starry-night.jpg',
  metadata: mockArtworkMetadata,
  created_at: '2023-08-01T12:00:00Z',
  updated_at: '2023-08-01T12:00:00Z',
  processing_status: {
    status: 'completed',
    progress: 100
  },
  permissions: {
    canEdit: true,
    canDelete: true,
    canShare: true
  }
};

// Test setup
beforeAll(() => {
  mockAxios = new MockAdapter(axios);
  jest.spyOn(crypto, 'randomUUID').mockReturnValue('mock-uuid');
});

afterEach(() => {
  mockAxios.reset();
  jest.clearAllMocks();
});

afterAll(() => {
  mockAxios.restore();
  jest.restoreAllMocks();
});

describe('uploadArtwork', () => {
  test('should successfully upload artwork with valid data', async () => {
    const apiResponse: ArtworkAPIResponse<ArtworkResponse> = {
      success: true,
      data: mockArtworkResponse,
      error: null,
      timestamp: '2023-08-01T12:00:00Z'
    };

    mockAxios.onPost(`${API_VERSION}${ARTWORK_ENDPOINTS.UPLOAD}`).reply(200, apiResponse);

    const onProgress = jest.fn();
    const result = await uploadArtwork(mockUploadRequest, { onProgress });

    expect(result).toEqual(apiResponse);
    expect(onProgress).toHaveBeenCalled();
  });

  test('should handle chunked upload for large files', async () => {
    const largeFile = new File(['large content'.repeat(1000000)], 'large.jpg', { type: 'image/jpeg' });
    const largeRequest = { ...mockUploadRequest, image: largeFile };

    mockAxios.onPost(`${API_VERSION}${ARTWORK_ENDPOINTS.UPLOAD}`).reply(200, {
      success: true,
      data: mockArtworkResponse,
      error: null,
      timestamp: '2023-08-01T12:00:00Z'
    });

    const result = await uploadArtwork(largeRequest);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockArtworkResponse);
  });

  test('should handle upload failure with invalid image format', async () => {
    const invalidFile = new File(['content'], 'invalid.txt', { type: 'text/plain' });
    const invalidRequest = { ...mockUploadRequest, image: invalidFile };

    await expect(uploadArtwork(invalidRequest)).rejects.toThrow();
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  test('should handle missing metadata fields', async () => {
    const invalidRequest = {
      ...mockUploadRequest,
      metadata: { ...mockArtworkMetadata, title: '' }
    };

    await expect(uploadArtwork(invalidRequest)).rejects.toThrow();
  });

  test('should handle network errors during upload', async () => {
    mockAxios.onPost(`${API_VERSION}${ARTWORK_ENDPOINTS.UPLOAD}`).networkError();
    await expect(uploadArtwork(mockUploadRequest)).rejects.toThrow();
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

describe('checkArtworkStatus', () => {
  test('should return processing status for valid artwork ID', async () => {
    const statusResponse: ArtworkAPIResponse<{ status: string; progress: number }> = {
      success: true,
      data: { status: 'processing', progress: 50 },
      error: null,
      timestamp: '2023-08-01T12:00:00Z'
    };

    mockAxios.onGet(`${API_VERSION}/artwork/art123/status`).reply(200, statusResponse);

    const result = await checkArtworkStatus('art123');
    expect(result).toEqual(statusResponse);
  });

  test('should handle non-existent artwork ID', async () => {
    mockAxios.onGet(`${API_VERSION}/artwork/invalid/status`).reply(404, {
      success: false,
      data: null,
      error: 'Artwork not found',
      timestamp: '2023-08-01T12:00:00Z'
    });

    await expect(checkArtworkStatus('invalid')).rejects.toThrow();
  });
});

describe('getArtworkDetail', () => {
  test('should return artwork details for valid ID', async () => {
    const detailResponse: ArtworkAPIResponse<ArtworkResponse> = {
      success: true,
      data: mockArtworkResponse,
      error: null,
      timestamp: '2023-08-01T12:00:00Z'
    };

    mockAxios.onGet(`${API_VERSION}/artwork/art123`).reply(200, detailResponse);

    const result = await getArtworkDetail('art123');
    expect(result).toEqual(detailResponse);
  });

  test('should handle API errors', async () => {
    mockAxios.onGet(`${API_VERSION}/artwork/art123`).reply(500, {
      success: false,
      data: null,
      error: 'Internal server error',
      timestamp: '2023-08-01T12:00:00Z'
    });

    await expect(getArtworkDetail('art123')).rejects.toThrow();
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

describe('updateArtworkMetadata', () => {
  test('should successfully update artwork metadata', async () => {
    const updatedMetadata = { ...mockArtworkMetadata, title: 'Updated Title' };
    const updateResponse: ArtworkAPIResponse<ArtworkResponse> = {
      success: true,
      data: { ...mockArtworkResponse, metadata: updatedMetadata },
      error: null,
      timestamp: '2023-08-01T12:00:00Z'
    };

    mockAxios.onPatch(`${API_VERSION}/artwork/art123/metadata`).reply(200, updateResponse);

    const result = await updateArtworkMetadata('art123', updatedMetadata);
    expect(result).toEqual(updateResponse);
  });

  test('should validate metadata before update', async () => {
    const invalidMetadata = { ...mockArtworkMetadata, year: 'invalid' as any };
    await expect(updateArtworkMetadata('art123', invalidMetadata)).rejects.toThrow();
  });
});