import { Middleware } from '@reduxjs/toolkit';
import { store, get, remove, STORAGE_KEYS } from '../../services/storage';
import { createHash } from 'crypto';
import { gzip, ungzip } from 'pako';

// Cache configuration interface
interface CacheConfig {
  ttl: number;
  maxSize: number;
  excludedActions: string[];
  persistentKeys: string[];
  compressionThreshold: number;
  encryptionEnabled: boolean;
  integrityCheck: boolean;
}

// Cache entry interface with metadata
interface CacheEntry {
  data: any;
  timestamp: number;
  key: string;
  size: number;
  compressed: boolean;
  checksum: string;
  version: number;
}

// Default cache configuration
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  ttl: 3600000, // 1 hour
  maxSize: 100 * 1024 * 1024, // 100MB for graph viewing
  excludedActions: ['RESET_STATE', 'CLEAR_CACHE', 'SET_ERROR'],
  persistentKeys: ['USER_PREFERENCES', 'GRAPH_LAYOUTS'],
  compressionThreshold: 50000, // 50KB
  encryptionEnabled: true,
  integrityCheck: true
};

// Cache storage key
const CACHE_STORAGE_KEY = 'REDUX_CACHE_STATE';
const CACHE_VERSION = 1;

// Create cache middleware with enhanced security and performance
export const createCacheMiddleware = (config: Partial<CacheConfig> = {}): Middleware => {
  const cacheConfig: CacheConfig = { ...DEFAULT_CACHE_CONFIG, ...config };
  let cacheMap = new Map<string, CacheEntry>();

  // Initialize cache from storage
  const initializeCache = async () => {
    try {
      const storedCache = await get<Map<string, CacheEntry>>(CACHE_STORAGE_KEY);
      if (storedCache) {
        cacheMap = new Map(Object.entries(storedCache));
        await validateCacheIntegrity();
      }
    } catch (error) {
      console.error('Cache initialization failed:', error);
      cacheMap.clear();
    }
  };

  // Validate cache integrity
  const validateCacheIntegrity = async () => {
    if (!cacheConfig.integrityCheck) return;

    for (const [key, entry] of cacheMap.entries()) {
      const calculatedChecksum = createHash('sha256')
        .update(JSON.stringify(entry.data))
        .digest('hex');

      if (calculatedChecksum !== entry.checksum) {
        console.warn(`Cache integrity check failed for key: ${key}`);
        cacheMap.delete(key);
      }
    }
  };

  // Compress data if needed
  const compressData = async (data: any): Promise<{ compressed: Uint8Array; size: number }> => {
    const serialized = JSON.stringify(data);
    if (serialized.length < cacheConfig.compressionThreshold) {
      return { compressed: new TextEncoder().encode(serialized), size: serialized.length };
    }
    const compressed = gzip(serialized);
    return { compressed, size: compressed.length };
  };

  // Decompress data
  const decompressData = async (data: Uint8Array, isCompressed: boolean): Promise<any> => {
    if (!isCompressed) {
      return JSON.parse(new TextDecoder().decode(data));
    }
    const decompressed = ungzip(data);
    return JSON.parse(new TextDecoder().decode(decompressed));
  };

  // Check if action should be cached
  const shouldCacheAction = (action: any): boolean => {
    if (cacheConfig.excludedActions.includes(action.type)) return false;
    if (!action.payload) return false;
    return true;
  };

  // Clean up expired or excess cache entries
  const cleanupCache = async () => {
    let totalSize = 0;
    const now = Date.now();
    const entries = Array.from(cacheMap.entries());

    // Remove expired entries
    entries.forEach(([key, entry]) => {
      if (now - entry.timestamp > cacheConfig.ttl && !cacheConfig.persistentKeys.includes(key)) {
        cacheMap.delete(key);
      } else {
        totalSize += entry.size;
      }
    });

    // Apply LRU eviction if size exceeds limit
    if (totalSize > cacheConfig.maxSize) {
      const sortedEntries = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (const [key, entry] of sortedEntries) {
        if (!cacheConfig.persistentKeys.includes(key)) {
          cacheMap.delete(key);
          totalSize -= entry.size;
          if (totalSize <= cacheConfig.maxSize) break;
        }
      }
    }

    // Persist changes
    await store(CACHE_STORAGE_KEY, Object.fromEntries(cacheMap));
  };

  // Initialize cache on middleware creation
  initializeCache();

  // Return middleware function
  return store => next => async action => {
    // Process action through middleware chain
    const result = next(action);

    if (shouldCacheAction(action)) {
      try {
        const { compressed, size } = await compressData(action.payload);
        const checksum = createHash('sha256')
          .update(JSON.stringify(action.payload))
          .digest('hex');

        const cacheEntry: CacheEntry = {
          data: compressed,
          timestamp: Date.now(),
          key: action.type,
          size,
          compressed: size < cacheConfig.compressionThreshold ? false : true,
          checksum,
          version: CACHE_VERSION
        };

        cacheMap.set(action.type, cacheEntry);
        await cleanupCache();
      } catch (error) {
        console.error('Cache operation failed:', error);
      }
    }

    return result;
  };
};

// Export configured middleware
export default createCacheMiddleware();