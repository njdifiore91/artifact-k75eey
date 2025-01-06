/**
 * @fileoverview Custom React hook for managing artwork operations in the Art Knowledge Graph application
 * Provides unified interface for uploading, retrieving, and managing artwork data
 * @version 1.0.0
 */

import { useCallback, useState, useEffect, useRef } from 'react'; // ^18.0.0
import { useDispatch, useSelector } from 'react-redux'; // ^8.0.0
import debounce from 'lodash/debounce'; // ^4.17.21
import { captureException } from '@sentry/browser'; // ^7.0.0

import {
  ArtworkMetadata,
  ArtworkUploadRequest,
  ArtworkResponse,
  ArtworkError,
  ProcessingStatus
} from '../types/artwork';

import {
  uploadArtworkThunk,
  getArtworkStatusThunk,
  listArtworksThunk,
  selectArtworks,
  cancelStatusCheck
} from '../store/slices/artworkSlice';

// Constants for status check configuration
const STATUS_CHECK_INTERVAL = 5000; // 5 seconds
const MAX_STATUS_CHECKS = 60; // 5 minutes maximum

/**
 * Custom hook for managing artwork operations with enhanced error handling and progress tracking
 * @returns Object containing artwork state and operation handlers
 */
const useArtwork = () => {
  const dispatch = useDispatch();
  const artworks = useSelector(selectArtworks);

  // Granular loading states
  const [loading, setLoading] = useState({
    upload: false,
    status: false,
    list: false
  });

  // Upload progress tracking
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    status: 'pending'
  });

  // Error handling
  const [error, setError] = useState<ArtworkError | null>(null);

  // Refs for cleanup and status check tracking
  const statusCheckCount = useRef<number>(0);
  const statusCheckInterval = useRef<NodeJS.Timeout>();
  const isMounted = useRef(true);

  /**
   * Debounced status check function to prevent API overload
   */
  const debouncedStatusCheck = useCallback(
    debounce(async (id: string) => {
      if (statusCheckCount.current >= MAX_STATUS_CHECKS) {
        clearInterval(statusCheckInterval.current);
        setError({
          type: 'TIMEOUT',
          message: 'Artwork processing timed out'
        });
        return;
      }

      try {
        setLoading(prev => ({ ...prev, status: true }));
        const status = await dispatch(getArtworkStatusThunk(id)).unwrap();
        
        if (isMounted.current) {
          setProcessingStatus(status);
          statusCheckCount.current += 1;

          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(statusCheckInterval.current);
          }
        }
      } catch (error) {
        captureException(error);
        setError({
          type: 'STATUS_CHECK_ERROR',
          message: 'Failed to check artwork status'
        });
        clearInterval(statusCheckInterval.current);
      } finally {
        if (isMounted.current) {
          setLoading(prev => ({ ...prev, status: false }));
        }
      }
    }, 1000),
    [dispatch]
  );

  /**
   * Handles artwork upload with progress tracking and error handling
   */
  const uploadArtwork = useCallback(async (
    file: File,
    metadata: ArtworkMetadata
  ): Promise<void> => {
    try {
      setLoading(prev => ({ ...prev, upload: true }));
      setError(null);
      statusCheckCount.current = 0;

      const uploadRequest: ArtworkUploadRequest = {
        image: file,
        metadata,
        options: {
          compress: true,
          generateThumbnail: true
        }
      };

      const response = await dispatch(uploadArtworkThunk({
        request: uploadRequest,
        onProgress: (progress: number) => setUploadProgress(progress)
      })).unwrap();

      // Start status checking
      statusCheckInterval.current = setInterval(
        () => debouncedStatusCheck(response.id),
        STATUS_CHECK_INTERVAL
      );

    } catch (error) {
      captureException(error);
      setError({
        type: 'UPLOAD_ERROR',
        message: 'Failed to upload artwork'
      });
    } finally {
      if (isMounted.current) {
        setLoading(prev => ({ ...prev, upload: false }));
      }
    }
  }, [dispatch, debouncedStatusCheck]);

  /**
   * Retrieves artwork processing status
   */
  const getArtworkStatus = useCallback(async (
    id: string
  ): Promise<ProcessingStatus> => {
    try {
      setLoading(prev => ({ ...prev, status: true }));
      const status = await dispatch(getArtworkStatusThunk(id)).unwrap();
      setProcessingStatus(status);
      return status;
    } catch (error) {
      captureException(error);
      setError({
        type: 'STATUS_ERROR',
        message: 'Failed to get artwork status'
      });
      throw error;
    } finally {
      if (isMounted.current) {
        setLoading(prev => ({ ...prev, status: false }));
      }
    }
  }, [dispatch]);

  /**
   * Retrieves list of artworks with pagination support
   */
  const listArtworks = useCallback(async (
    page: number = 1,
    limit: number = 10
  ): Promise<void> => {
    try {
      setLoading(prev => ({ ...prev, list: true }));
      await dispatch(listArtworksThunk({ page, limit })).unwrap();
    } catch (error) {
      captureException(error);
      setError({
        type: 'LIST_ERROR',
        message: 'Failed to retrieve artworks'
      });
    } finally {
      if (isMounted.current) {
        setLoading(prev => ({ ...prev, list: false }));
      }
    }
  }, [dispatch]);

  /**
   * Cancels ongoing processing status checks
   */
  const cancelProcessing = useCallback((): void => {
    if (statusCheckInterval.current) {
      clearInterval(statusCheckInterval.current);
      dispatch(cancelStatusCheck());
    }
  }, [dispatch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      cancelProcessing();
      debouncedStatusCheck.cancel();
    };
  }, [cancelProcessing, debouncedStatusCheck]);

  return {
    artworks,
    loading,
    error,
    uploadProgress,
    processingStatus,
    uploadArtwork,
    getArtworkStatus,
    listArtworks,
    cancelProcessing
  };
};

export default useArtwork;