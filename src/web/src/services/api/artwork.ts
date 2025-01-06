/**
 * @fileoverview Artwork API service implementation for the Art Knowledge Graph frontend
 * Handles artwork-related operations with enhanced error handling and type safety
 * @version 1.0.0
 */

import axios, { AxiosRequestConfig, CancelTokenSource } from 'axios'; // ^1.4.0
import { captureException } from '@sentry/browser'; // ^7.0.0
import { RequestManager } from '@core/request-manager'; // ^1.0.0

import { 
  ArtworkMetadata, 
  ArtworkUploadRequest, 
  ArtworkResponse, 
  ArtworkAPIResponse 
} from '../types/artwork';

import { 
  ARTWORK_ENDPOINTS, 
  API_VERSION, 
  buildApiUrl, 
  replaceUrlParams 
} from '../constants/endpoints';

import { 
  handleApiError, 
  AppError, 
  ErrorType 
} from '../utils/errorHandling';

// Constants for upload configurations
const CHUNK_SIZE = 1024 * 1024 * 5; // 5MB chunks
const MAX_RETRIES = 3;
const TIMEOUT = 30000; // 30 seconds

// Initialize request manager for handling concurrent uploads
const requestManager = new RequestManager({
  maxConcurrent: 3,
  retryConfig: {
    maxRetries: MAX_RETRIES,
    backoffFactor: 1.5
  }
});

/**
 * Validates artwork upload request data
 * @param request - Upload request object to validate
 * @throws {AppError} If validation fails
 */
const validateUploadRequest = (request: ArtworkUploadRequest): void => {
  if (!request.image || !(request.image instanceof File)) {
    throw new AppError({
      type: ErrorType.VALIDATION_ERROR,
      message: 'Invalid image file provided',
      timestamp: new Date().toISOString()
    });
  }

  if (!request.metadata.title || !request.metadata.artist) {
    throw new AppError({
      type: ErrorType.VALIDATION_ERROR,
      message: 'Required metadata fields missing',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Creates form data for artwork upload
 * @param request - Upload request data
 * @returns FormData object with request data
 */
const createUploadFormData = (request: ArtworkUploadRequest): FormData => {
  const formData = new FormData();
  formData.append('image', request.image);
  formData.append('metadata', JSON.stringify(request.metadata));
  
  if (request.options) {
    formData.append('options', JSON.stringify(request.options));
  }
  
  return formData;
};

/**
 * Uploads artwork with support for chunked upload and progress tracking
 * @param request - Artwork upload request
 * @param options - Upload options including progress callback and chunk size
 * @returns Promise resolving to upload response
 */
export const uploadArtwork = async (
  request: ArtworkUploadRequest,
  options?: {
    onProgress?: (progress: number) => void;
    chunkSize?: number;
  }
): Promise<ArtworkAPIResponse<ArtworkResponse>> => {
  try {
    validateUploadRequest(request);

    const cancelSource: CancelTokenSource = axios.CancelToken.source();
    const useChunkedUpload = request.image.size > (options?.chunkSize || CHUNK_SIZE);

    const config: AxiosRequestConfig = {
      timeout: TIMEOUT,
      cancelToken: cancelSource.token,
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        if (options?.onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          options.onProgress(progress);
        }
      }
    };

    if (useChunkedUpload) {
      return await uploadInChunks(request, config, options);
    }

    const formData = createUploadFormData(request);
    const response = await requestManager.enqueue(() => 
      axios.post<ArtworkAPIResponse<ArtworkResponse>>(
        buildApiUrl(ARTWORK_ENDPOINTS.UPLOAD),
        formData,
        config
      )
    );

    return response.data;

  } catch (error) {
    const appError = handleApiError(error);
    captureException(error, {
      extra: {
        request_metadata: request.metadata,
        file_size: request.image.size
      }
    });
    throw appError;
  }
};

/**
 * Handles chunked upload for large files
 * @param request - Upload request
 * @param config - Axios config
 * @param options - Upload options
 * @returns Promise resolving to upload response
 */
const uploadInChunks = async (
  request: ArtworkUploadRequest,
  config: AxiosRequestConfig,
  options?: {
    onProgress?: (progress: number) => void;
    chunkSize?: number;
  }
): Promise<ArtworkAPIResponse<ArtworkResponse>> => {
  const chunkSize = options?.chunkSize || CHUNK_SIZE;
  const chunks = Math.ceil(request.image.size / chunkSize);
  const uploadId = crypto.randomUUID();

  let uploadedChunks = 0;
  const chunkPromises: Promise<void>[] = [];

  for (let i = 0; i < chunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, request.image.size);
    const chunk = request.image.slice(start, end);

    const chunkFormData = new FormData();
    chunkFormData.append('chunk', chunk);
    chunkFormData.append('chunkIndex', i.toString());
    chunkFormData.append('uploadId', uploadId);
    chunkFormData.append('totalChunks', chunks.toString());

    if (i === chunks - 1) {
      chunkFormData.append('metadata', JSON.stringify(request.metadata));
      chunkFormData.append('options', JSON.stringify(request.options));
    }

    const chunkPromise = requestManager.enqueue(() =>
      axios.post(
        buildApiUrl(ARTWORK_ENDPOINTS.UPLOAD),
        chunkFormData,
        {
          ...config,
          headers: {
            ...config.headers,
            'X-Upload-Id': uploadId
          }
        }
      )
    ).then(() => {
      uploadedChunks++;
      if (options?.onProgress) {
        options.onProgress((uploadedChunks * 100) / chunks);
      }
    });

    chunkPromises.push(chunkPromise);
  }

  await Promise.all(chunkPromises);

  // Complete upload
  const response = await requestManager.enqueue(() =>
    axios.post<ArtworkAPIResponse<ArtworkResponse>>(
      buildApiUrl(ARTWORK_ENDPOINTS.UPLOAD),
      {
        uploadId,
        metadata: request.metadata,
        options: request.options
      },
      {
        ...config,
        headers: {
          ...config.headers,
          'X-Upload-Complete': 'true'
        }
      }
    )
  );

  return response.data;
};

/**
 * Retrieves artwork metadata by ID
 * @param id - Artwork ID
 * @returns Promise resolving to artwork metadata
 */
export const getArtworkMetadata = async (
  id: string
): Promise<ArtworkAPIResponse<ArtworkMetadata>> => {
  try {
    const response = await axios.get<ArtworkAPIResponse<ArtworkMetadata>>(
      buildApiUrl(replaceUrlParams(ARTWORK_ENDPOINTS.METADATA, { id }))
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
};

/**
 * Checks artwork processing status
 * @param id - Artwork ID
 * @returns Promise resolving to processing status
 */
export const checkArtworkStatus = async (
  id: string
): Promise<ArtworkAPIResponse<{ status: string; progress?: number }>> => {
  try {
    const response = await axios.get<ArtworkAPIResponse<{ status: string; progress?: number }>>(
      buildApiUrl(replaceUrlParams(ARTWORK_ENDPOINTS.STATUS, { id }))
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
};