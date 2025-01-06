import { useState, useEffect, useCallback } from 'react'; // ^18.0.0
import { useDispatch } from 'react-redux'; // ^8.0.0
import { handleRuntimeError, ErrorType } from '../utils/errorHandling';
import { setNetworkStatus } from '../store/slices/uiSlice';

// Network performance thresholds
const PERFORMANCE_THRESHOLDS = {
  SLOW_RTT: 500, // ms
  MIN_DOWNLINK: 0.5, // Mbps
  STORAGE_WARNING: 0.9, // 90% usage
} as const;

// Connection type mapping to effective speeds
const CONNECTION_SPEED_MAP = {
  'wifi': 'fast',
  '4g': 'fast',
  '3g': 'medium',
  '2g': 'slow',
  'slow-2g': 'slow',
  'none': 'slow',
} as const;

export interface NetworkStatus {
  isOnline: boolean;
  connectionType: 'wifi' | '4g' | '3g' | '2g' | 'slow-2g' | 'none';
  effectiveType: 'fast' | 'medium' | 'slow';
  downlink: number;
  rtt: number;
  lastUpdated: Date;
  supportedFeatures: {
    offlineSync: boolean;
    backgroundSync: boolean;
  };
  storageQuota: {
    total: number;
    used: number;
    remaining: number;
  };
}

/**
 * Custom hook for comprehensive network status monitoring and offline capability management
 * @returns {NetworkStatus} Current network status and performance metrics
 */
export default function useNetworkStatus(): NetworkStatus {
  const dispatch = useDispatch();
  const [status, setStatus] = useState<NetworkStatus>(() => ({
    isOnline: navigator.onLine,
    connectionType: 'none',
    effectiveType: 'slow',
    downlink: 0,
    rtt: 0,
    lastUpdated: new Date(),
    supportedFeatures: {
      offlineSync: 'serviceWorker' in navigator,
      backgroundSync: 'sync' in navigator.serviceWorker || false,
    },
    storageQuota: {
      total: 0,
      used: 0,
      remaining: 0,
    },
  }));

  // Update storage quota information
  const updateStorageQuota = useCallback(async () => {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const total = estimate.quota || 0;
        const used = estimate.usage || 0;
        
        setStatus(prev => ({
          ...prev,
          storageQuota: {
            total,
            used,
            remaining: total - used,
          },
        }));

        // Warn if storage usage is high
        if (used / total > PERFORMANCE_THRESHOLDS.STORAGE_WARNING) {
          dispatch(setNetworkStatus('limited'));
        }
      }
    } catch (error) {
      handleRuntimeError(error as Error);
    }
  }, [dispatch]);

  // Update connection information
  const updateConnectionInfo = useCallback(() => {
    const connection = (navigator as any).connection || 
                      (navigator as any).mozConnection || 
                      (navigator as any).webkitConnection;

    if (connection) {
      const connectionType = connection.type || 'none';
      const effectiveType = CONNECTION_SPEED_MAP[connectionType as keyof typeof CONNECTION_SPEED_MAP];
      const downlink = connection.downlink || 0;
      const rtt = connection.rtt || 0;

      setStatus(prev => ({
        ...prev,
        connectionType,
        effectiveType,
        downlink,
        rtt,
        lastUpdated: new Date(),
      }));

      // Check for degraded performance
      if (rtt > PERFORMANCE_THRESHOLDS.SLOW_RTT || 
          downlink < PERFORMANCE_THRESHOLDS.MIN_DOWNLINK) {
        dispatch(setNetworkStatus('limited'));
      }
    }
  }, [dispatch]);

  // Handle online status changes
  const handleOnlineStatus = useCallback((isOnline: boolean) => {
    setStatus(prev => ({
      ...prev,
      isOnline,
      lastUpdated: new Date(),
    }));
    
    dispatch(setNetworkStatus(isOnline ? 'online' : 'offline'));

    // Announce status change for accessibility
    const message = isOnline ? 
      'Network connection restored' : 
      'Network connection lost';
    
    const announcement = new CustomEvent('announce', { 
      detail: { message, priority: 'assertive' } 
    });
    document.dispatchEvent(announcement);
  }, [dispatch]);

  // Set up event listeners
  useEffect(() => {
    const handleOnline = () => handleOnlineStatus(true);
    const handleOffline = () => handleOnlineStatus(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const connection = (navigator as any).connection || 
                      (navigator as any).mozConnection || 
                      (navigator as any).webkitConnection;

    if (connection) {
      connection.addEventListener('change', updateConnectionInfo);
    }

    // Initial updates
    updateConnectionInfo();
    updateStorageQuota();

    // Set up periodic checks
    const periodicCheck = setInterval(() => {
      updateConnectionInfo();
      updateStorageQuota();
    }, 30000); // Check every 30 seconds

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      
      if (connection) {
        connection.removeEventListener('change', updateConnectionInfo);
      }
      
      clearInterval(periodicCheck);
    };
  }, [handleOnlineStatus, updateConnectionInfo, updateStorageQuota]);

  return status;
}

export type { NetworkStatus };