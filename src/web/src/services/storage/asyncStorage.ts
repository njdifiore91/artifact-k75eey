import AsyncStorage from '@react-native-async-storage/async-storage'; // ^1.19.0

// Storage keys for type safety and consistency
export const STORAGE_KEYS = {
  USER_PREFERENCES: '@art_knowledge_graph/user_preferences',
  CACHED_ARTWORK: '@art_knowledge_graph/cached_artwork',
  SEARCH_HISTORY: '@art_knowledge_graph/search_history',
  GRAPH_LAYOUTS: '@art_knowledge_graph/graph_layouts',
} as const;

// Storage size limits in bytes
const STORAGE_LIMITS = {
  CACHED_ARTWORK: 100 * 1024 * 1024, // 100MB
  SEARCH_HISTORY: 50 * 1024, // 50KB
  GRAPH_LAYOUTS: 10 * 1024 * 1024, // 10MB
} as const;

// Custom error class for storage-related errors
class StorageError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'StorageError';
  }
}

// Types for function options
interface StorageOptions {
  compress?: boolean;
  retry?: number;
  timeout?: number;
}

interface GetOptions {
  defaultValue?: any;
  timeout?: number;
  retry?: number;
}

interface RemoveOptions {
  cleanup?: boolean;
  timeout?: number;
}

interface ClearOptions {
  preservePreferences?: boolean;
  backup?: boolean;
}

interface SizeOptions {
  detailed?: boolean;
}

interface OptimizeOptions {
  aggressive?: boolean;
  timeout?: number;
}

interface StorageMetrics {
  size: number;
  compressed?: number;
  fragmentation: number;
  usage: {
    [key: string]: number;
  };
}

interface OptimizationResult {
  spaceSaved: number;
  compressionRatio: number;
  fragmentationReduced: number;
}

// Utility functions for data compression
const compressData = async (data: string): Promise<string> => {
  // Implementation would use a compression library
  // Placeholder for actual compression logic
  return data;
};

const decompressData = async (data: string): Promise<string> => {
  // Implementation would use a compression library
  // Placeholder for actual decompression logic
  return data;
};

// Main storage functions
export async function storeData<T>(
  key: keyof typeof STORAGE_KEYS,
  value: T,
  options: StorageOptions = {}
): Promise<void> {
  try {
    const storageKey = STORAGE_KEYS[key];
    const serializedData = JSON.stringify(value);
    
    // Check size limits
    const dataSize = new Blob([serializedData]).size;
    const sizeLimit = STORAGE_LIMITS[key as keyof typeof STORAGE_LIMITS];
    
    if (sizeLimit && dataSize > sizeLimit) {
      throw new StorageError(
        `Data size exceeds limit for ${key}`,
        'SIZE_LIMIT_EXCEEDED'
      );
    }

    // Compress if needed
    const finalData = options.compress 
      ? await compressData(serializedData)
      : serializedData;

    await AsyncStorage.setItem(storageKey, finalData);
  } catch (error) {
    if (options.retry && options.retry > 0) {
      return storeData(key, value, { ...options, retry: options.retry - 1 });
    }
    throw new StorageError(
      `Failed to store data for ${key}: ${error.message}`,
      'STORE_FAILED'
    );
  }
}

export async function getData<T>(
  key: keyof typeof STORAGE_KEYS,
  options: GetOptions = {}
): Promise<T | null> {
  try {
    const storageKey = STORAGE_KEYS[key];
    const data = await AsyncStorage.getItem(storageKey);

    if (!data) {
      return options.defaultValue ?? null;
    }

    // Check if data is compressed
    const decompressedData = data.startsWith('compressed:')
      ? await decompressData(data.slice(11))
      : data;

    return JSON.parse(decompressedData);
  } catch (error) {
    if (options.retry && options.retry > 0) {
      return getData(key, { ...options, retry: options.retry - 1 });
    }
    throw new StorageError(
      `Failed to retrieve data for ${key}: ${error.message}`,
      'RETRIEVE_FAILED'
    );
  }
}

export async function removeData(
  key: keyof typeof STORAGE_KEYS,
  options: RemoveOptions = {}
): Promise<void> {
  try {
    const storageKey = STORAGE_KEYS[key];
    await AsyncStorage.removeItem(storageKey);

    if (options.cleanup) {
      // Perform additional cleanup like removing related caches
      await optimizeStorage();
    }
  } catch (error) {
    throw new StorageError(
      `Failed to remove data for ${key}: ${error.message}`,
      'REMOVE_FAILED'
    );
  }
}

export async function clearStorage(
  options: ClearOptions = {}
): Promise<void> {
  try {
    if (options.preservePreferences) {
      const preferences = await getData('USER_PREFERENCES');
      await AsyncStorage.clear();
      if (preferences) {
        await storeData('USER_PREFERENCES', preferences);
      }
    } else {
      await AsyncStorage.clear();
    }
  } catch (error) {
    throw new StorageError(
      `Failed to clear storage: ${error.message}`,
      'CLEAR_FAILED'
    );
  }
}

export async function getStorageSize(
  key?: keyof typeof STORAGE_KEYS,
  options: SizeOptions = {}
): Promise<StorageMetrics> {
  try {
    const metrics: StorageMetrics = {
      size: 0,
      fragmentation: 0,
      usage: {}
    };

    if (key) {
      const data = await AsyncStorage.getItem(STORAGE_KEYS[key]);
      metrics.size = data ? new Blob([data]).size : 0;
      if (options.detailed && data) {
        metrics.compressed = new Blob([await compressData(data)]).size;
      }
    } else {
      const keys = await AsyncStorage.getAllKeys();
      for (const storageKey of keys) {
        const data = await AsyncStorage.getItem(storageKey);
        if (data) {
          metrics.usage[storageKey] = new Blob([data]).size;
          metrics.size += metrics.usage[storageKey];
        }
      }
    }

    return metrics;
  } catch (error) {
    throw new StorageError(
      `Failed to calculate storage size: ${error.message}`,
      'SIZE_CALCULATION_FAILED'
    );
  }
}

export async function optimizeStorage(
  options: OptimizeOptions = {}
): Promise<OptimizationResult> {
  try {
    const before = await getStorageSize();
    const result: OptimizationResult = {
      spaceSaved: 0,
      compressionRatio: 1,
      fragmentationReduced: 0
    };

    // Perform optimization
    const keys = await AsyncStorage.getAllKeys();
    for (const key of keys) {
      const data = await AsyncStorage.getItem(key);
      if (data && options.aggressive) {
        const compressed = await compressData(data);
        if (compressed.length < data.length) {
          await AsyncStorage.setItem(key, compressed);
        }
      }
    }

    const after = await getStorageSize();
    result.spaceSaved = before.size - after.size;
    result.compressionRatio = after.size / before.size;

    return result;
  } catch (error) {
    throw new StorageError(
      `Failed to optimize storage: ${error.message}`,
      'OPTIMIZATION_FAILED'
    );
  }
}