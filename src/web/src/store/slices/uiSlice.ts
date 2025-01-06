import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';

// Interfaces and Types
export type ThemePreference = 'light' | 'dark' | 'system';
export type NetworkStatus = 'online' | 'offline' | 'limited';
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  autoDismiss: boolean;
  dismissTimeout: number;
}

export interface UIState {
  isLoading: boolean;
  activeModal: string | null;
  modalData: Record<string, unknown>;
  theme: ThemePreference;
  toasts: ToastNotification[];
  networkStatus: NetworkStatus;
  deviceType: DeviceType;
}

// Initial state
const initialState: UIState = {
  isLoading: false,
  activeModal: null,
  modalData: {},
  theme: 'system',
  toasts: [],
  networkStatus: 'online',
  deviceType: 'desktop'
};

// Create the slice
export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    
    showModal: (state, action: PayloadAction<{ modalId: string; data?: Record<string, unknown> }>) => {
      state.activeModal = action.payload.modalId;
      state.modalData = action.payload.data || {};
    },
    
    hideModal: (state) => {
      state.activeModal = null;
      state.modalData = {};
    },
    
    setTheme: (state, action: PayloadAction<ThemePreference>) => {
      state.theme = action.payload;
      // Persist theme preference
      localStorage.setItem('theme-preference', action.payload);
    },
    
    addToast: (state, action: PayloadAction<Omit<ToastNotification, 'id'>>) => {
      const id = `toast-${Date.now()}`;
      state.toasts.push({
        ...action.payload,
        id,
      });
    },
    
    removeToast: (state, action: PayloadAction<string>) => {
      state.toasts = state.toasts.filter(toast => toast.id !== action.payload);
    },
    
    setNetworkStatus: (state, action: PayloadAction<NetworkStatus>) => {
      state.networkStatus = action.payload;
    },
    
    setDeviceType: (state, action: PayloadAction<DeviceType>) => {
      state.deviceType = action.payload;
    },
    
    clearAllToasts: (state) => {
      state.toasts = [];
    }
  }
});

// Selectors
const selectUI = (state: { ui: UIState }) => state.ui;

export const selectTheme = createSelector(
  [selectUI],
  (ui) => ui.theme
);

export const selectActiveModal = createSelector(
  [selectUI],
  (ui) => ({
    modalId: ui.activeModal,
    modalData: ui.modalData
  })
);

export const selectNetworkStatus = createSelector(
  [selectUI],
  (ui) => ui.networkStatus
);

export const selectDeviceType = createSelector(
  [selectUI],
  (ui) => ui.deviceType
);

export const selectToasts = createSelector(
  [selectUI],
  (ui) => ui.toasts
);

export const selectIsLoading = createSelector(
  [selectUI],
  (ui) => ui.isLoading
);

// Export actions and reducer
export const {
  setLoading,
  showModal,
  hideModal,
  setTheme,
  addToast,
  removeToast,
  setNetworkStatus,
  setDeviceType,
  clearAllToasts
} = uiSlice.actions;

export default uiSlice.reducer;