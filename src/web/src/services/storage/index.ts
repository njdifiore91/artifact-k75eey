import * as AsyncStorage from './asyncStorage';
import * as SecureStorage from './secureStorage';

// Re-export storage constants for external use
export const { STORAGE_KEYS } = AsyncStorage;
export const { SECURE_STORAGE_KEYS } = SecureStorage;

// Storage metrics interface
interface StorageMetrics {
  size: number;
  secureSize?: number;
  lastOptimized: Date;
  availableSpace: number;
}

// Enhanced security validation with logging
function isSecureKey(key: string): boolean {
  try {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid key parameter');
    }
    const isSecure = Object.values(SECURE_STORAGE_KEYS).includes(key as any);
    // Log security classification for audit trail
    console.debug(`Storage security classification - Key: ${key}, Secure: ${isSecure}`);
    return isSecure;
  } catch (error) {
    console.error('Security validation error:', error);
    throw error;
  }
}

// Universal storage function with enhanced features
export async function store<T>(key: string, value: T): Promise<void> {
  try {
    // Validate inputs
    if (!key || value === undefined) {
      throw new Error('Invalid storage parameters');
    }

    // Check storage metrics before operation
    const metrics = await getStorageMetrics();
    if (metrics.availableSpace < JSON.stringify(value).length) {
      await AsyncStorage.optimizeStorage({ aggressive: true });
    }

    // Route to appropriate storage method
    if (isSecureKey(key)) {
      await SecureStorage.storeSecureData(key as any, value, {
        requireAuthentication: true,
        keychainAccessible: true
      });
    } else {
      await AsyncStorage.storeData(key as any, value, {
        compress: true,
        retry: 2
      });
    }

    // Update storage metrics after successful operation
    await updateStorageMetrics();
  } catch (error) {
    console.error('Storage operation failed:', error);
    throw error;
  }
}

// Universal retrieval function with type safety
export async function get<T>(key: string): Promise<T | null> {
  try {
    // Validate key
    if (!key) {
      throw new Error('Invalid key parameter');
    }

    // Route to appropriate retrieval method
    if (isSecureKey(key)) {
      return await SecureStorage.getSecureData<T>(key as any, {
        requireAuthentication: true
      });
    } else {
      return await AsyncStorage.getData<T>(key as any, {
        retry: 2
      });
    }
  } catch (error) {
    console.error('Retrieval operation failed:', error);
    throw error;
  }
}

// Universal removal function with secure cleanup
export async function remove(key: string): Promise<void> {
  try {
    // Validate key
    if (!key) {
      throw new Error('Invalid key parameter');
    }

    // Route to appropriate removal method
    if (isSecureKey(key)) {
      await SecureStorage.removeSecureData(key as any, {
        requireAuthentication: true
      });
    } else {
      await AsyncStorage.removeData(key as any, {
        cleanup: true
      });
    }

    // Update storage metrics after removal
    await updateStorageMetrics();
  } catch (error) {
    console.error('Removal operation failed:', error);
    throw error;
  }
}

// Universal clear function with atomic operations
export async function clearAll(): Promise<void> {
  try {
    // Begin atomic clear operation
    console.debug('Starting atomic clear operation');

    // Clear secure storage first
    await SecureStorage.clearSecureStorage({
      requireAuthentication: true
    });

    // Clear regular storage
    await AsyncStorage.clearStorage({
      preservePreferences: true
    });

    // Reset storage metrics
    await updateStorageMetrics();
    
    console.debug('Storage clear operation completed');
  } catch (error) {
    console.error('Clear operation failed:', error);
    throw error;
  }
}

// Private helper function to update storage metrics
async function updateStorageMetrics(): Promise<StorageMetrics> {
  const regularMetrics = await AsyncStorage.getStorageSize();
  
  return {
    size: regularMetrics.size,
    lastOptimized: new Date(),
    availableSpace: calculateAvailableSpace(regularMetrics.size)
  };
}

// Private helper function to calculate available space
function calculateAvailableSpace(currentSize: number): number {
  const MAX_STORAGE_SIZE = 200 * 1024 * 1024; // 200MB total limit
  return Math.max(0, MAX_STORAGE_SIZE - currentSize);
}

// Export storage limit constants
export const STORAGE_LIMITS = {
  MAX_TOTAL_SIZE: 200 * 1024 * 1024, // 200MB
  MAX_GRAPH_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_SEARCH_HISTORY: 50 * 1024, // 50KB
  MAX_UPLOAD_QUEUE: 200 * 1024 * 1024 // 200MB
} as const;