/**
 * @fileoverview Redux Toolkit slice for artwork state management
 * Implements comprehensive state handling for artwork operations
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'; // ^1.9.0
import debounce from 'lodash/debounce'; // ^4.17.21

import {
  ArtworkMetadata,
  ArtworkUploadRequest,
  ArtworkResponse,
  ArtworkAPIResponse,
  ProcessingStatus,
} from '../../types/artwork';

import {
  uploadArtwork,
  getArtworkList,
  getArtworkDetail,
  updateArtworkMetadata,
  checkArtworkStatus,
  cancelRequest
} from '../../services/api/artwork';

// State interface definition
interface ArtworkState {
  items: Record<string, ArtworkResponse>;
  uploadProgress: Record<string, number>;
  processingStatus: Record<string, ProcessingStatus>;
  loading: {
    upload: boolean;
    list: boolean;
    detail: Record<string, boolean>;
    update: Record<string, boolean>;
  };
  error: string | null;
  lastUpdated: string | null;
  cache: {
    listTimestamp: string | null;
    detailTimestamp: Record<string, string>;
  };
}

// Initial state
const initialState: ArtworkState = {
  items: {},
  uploadProgress: {},
  processingStatus: {},
  loading: {
    upload: false,
    list: false,
    detail: {},
    update: {}
  },
  error: null,
  lastUpdated: null,
  cache: {
    listTimestamp: null,
    detailTimestamp: {}
  }
};

// Cache duration constants
const CACHE_DURATION = {
  LIST: 5 * 60 * 1000, // 5 minutes
  DETAIL: 15 * 60 * 1000 // 15 minutes
};

// Create async thunks
export const uploadArtworkThunk = createAsyncThunk(
  'artwork/upload',
  async (request: ArtworkUploadRequest, { dispatch }) => {
    const response = await uploadArtwork(request, {
      onProgress: (progress) => {
        dispatch(setUploadProgress({ id: request.metadata.title, progress }));
      }
    });
    return response.data;
  }
);

export const fetchArtworkListThunk = createAsyncThunk(
  'artwork/fetchList',
  async (_, { getState }) => {
    const response = await getArtworkList();
    return response.data;
  }
);

export const fetchArtworkDetailThunk = createAsyncThunk(
  'artwork/fetchDetail',
  async (id: string) => {
    const response = await getArtworkDetail(id);
    return response.data;
  }
);

export const updateArtworkThunk = createAsyncThunk(
  'artwork/update',
  async ({ id, metadata }: { id: string; metadata: ArtworkMetadata }) => {
    const response = await updateArtworkMetadata(id, metadata);
    return response.data;
  }
);

// Debounced status check function
const debouncedStatusCheck = debounce(async (id: string, dispatch: any) => {
  try {
    const response = await checkArtworkStatus(id);
    dispatch(updateProcessingStatus({ id, status: response.data }));
  } catch (error) {
    console.error('Status check failed:', error);
  }
}, 5000);

// Create the slice
const artworkSlice = createSlice({
  name: 'artwork',
  initialState,
  reducers: {
    setUploadProgress: (state, action: PayloadAction<{ id: string; progress: number }>) => {
      state.uploadProgress[action.payload.id] = action.payload.progress;
    },
    updateProcessingStatus: (state, action: PayloadAction<{ id: string; status: ProcessingStatus }>) => {
      state.processingStatus[action.payload.id] = action.payload.status;
    },
    clearError: (state) => {
      state.error = null;
    },
    invalidateCache: (state) => {
      state.cache.listTimestamp = null;
      state.cache.detailTimestamp = {};
    },
    cancelUpload: (state, action: PayloadAction<string>) => {
      delete state.uploadProgress[action.payload];
      cancelRequest();
    }
  },
  extraReducers: (builder) => {
    // Upload artwork
    builder
      .addCase(uploadArtworkThunk.pending, (state) => {
        state.loading.upload = true;
        state.error = null;
      })
      .addCase(uploadArtworkThunk.fulfilled, (state, action) => {
        state.loading.upload = false;
        state.items[action.payload.id] = action.payload;
        state.lastUpdated = new Date().toISOString();
        delete state.uploadProgress[action.payload.id];
        state.processingStatus[action.payload.id] = action.payload.processing_status;
      })
      .addCase(uploadArtworkThunk.rejected, (state, action) => {
        state.loading.upload = false;
        state.error = action.error.message || 'Upload failed';
      })

    // Fetch artwork list
    builder
      .addCase(fetchArtworkListThunk.pending, (state) => {
        state.loading.list = true;
        state.error = null;
      })
      .addCase(fetchArtworkListThunk.fulfilled, (state, action) => {
        state.loading.list = false;
        action.payload.forEach((artwork: ArtworkResponse) => {
          state.items[artwork.id] = artwork;
        });
        state.cache.listTimestamp = new Date().toISOString();
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(fetchArtworkListThunk.rejected, (state, action) => {
        state.loading.list = false;
        state.error = action.error.message || 'Failed to fetch artwork list';
      })

    // Fetch artwork detail
    builder
      .addCase(fetchArtworkDetailThunk.pending, (state, action) => {
        state.loading.detail[action.meta.arg] = true;
        state.error = null;
      })
      .addCase(fetchArtworkDetailThunk.fulfilled, (state, action) => {
        state.loading.detail[action.meta.arg] = false;
        state.items[action.payload.id] = action.payload;
        state.cache.detailTimestamp[action.payload.id] = new Date().toISOString();
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(fetchArtworkDetailThunk.rejected, (state, action) => {
        state.loading.detail[action.meta.arg] = false;
        state.error = action.error.message || 'Failed to fetch artwork detail';
      })

    // Update artwork
    builder
      .addCase(updateArtworkThunk.pending, (state, action) => {
        state.loading.update[action.meta.arg.id] = true;
        state.error = null;
      })
      .addCase(updateArtworkThunk.fulfilled, (state, action) => {
        state.loading.update[action.payload.id] = false;
        state.items[action.payload.id] = action.payload;
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(updateArtworkThunk.rejected, (state, action) => {
        state.loading.update[action.meta.arg.id] = false;
        state.error = action.error.message || 'Failed to update artwork';
      });
  }
});

// Export actions and reducer
export const {
  setUploadProgress,
  updateProcessingStatus,
  clearError,
  invalidateCache,
  cancelUpload
} = artworkSlice.actions;

export default artworkSlice.reducer;

// Selectors
export const selectArtworkById = (state: { artwork: ArtworkState }, id: string) =>
  state.artwork.items[id];

export const selectAllArtwork = (state: { artwork: ArtworkState }) =>
  Object.values(state.artwork.items);

export const selectUploadProgress = (state: { artwork: ArtworkState }, id: string) =>
  state.artwork.uploadProgress[id];

export const selectProcessingStatus = (state: { artwork: ArtworkState }, id: string) =>
  state.artwork.processingStatus[id];

export const selectIsLoading = (state: { artwork: ArtworkState }, type: keyof ArtworkState['loading']) =>
  state.artwork.loading[type];

export const selectError = (state: { artwork: ArtworkState }) =>
  state.artwork.error;