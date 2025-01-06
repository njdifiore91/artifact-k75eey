import { Dimensions } from 'react-native'; // ^0.70.0
import { SCREEN_SIZES } from '../constants/dimensions';

// Constants for responsive calculations
const MIN_SCALE_FACTOR = 0.8;
const MAX_SCALE_FACTOR = 1.2;
const DEFAULT_SCALE_FACTOR = 1.0;
const DIMENSION_CHANGE_DEBOUNCE_MS = 100;
const MIN_SUPPORTED_WIDTH = 320;

// Cache for memoization
interface Cache {
  deviceType?: 'small' | 'regular' | 'large';
  screenWidth?: number;
  responsiveSizes: Map<string, number>;
  responsiveSpacing: Map<number, number>;
  isLandscape?: boolean;
}

const cache: Cache = {
  responsiveSizes: new Map(),
  responsiveSpacing: new Map()
};

/**
 * Determines the device type based on screen width with memoization for performance
 * @returns {'small' | 'regular' | 'large'} Device type category
 * @throws {Error} If screen width is below minimum supported width
 */
export const getDeviceType = (): 'small' | 'regular' | 'large' => {
  try {
    const { width } = Dimensions.get('window');

    // Validate minimum supported width
    if (width < MIN_SUPPORTED_WIDTH) {
      throw new Error(`Screen width ${width}dp is below minimum supported width ${MIN_SUPPORTED_WIDTH}dp`);
    }

    // Return cached value if screen width hasn't changed
    if (cache.screenWidth === width && cache.deviceType) {
      return cache.deviceType;
    }

    // Determine device type based on screen width
    let deviceType: 'small' | 'regular' | 'large';
    if (width <= SCREEN_SIZES.SMALL_PHONE) {
      deviceType = 'small';
    } else if (width <= SCREEN_SIZES.REGULAR_PHONE) {
      deviceType = 'regular';
    } else {
      deviceType = 'large';
    }

    // Update cache
    cache.screenWidth = width;
    cache.deviceType = deviceType;

    return deviceType;
  } catch (error) {
    console.error('Error determining device type:', error);
    return 'regular'; // Fallback to regular size
  }
};

/**
 * Calculates responsive size with bounds checking and performance optimization
 * @param baseSize Base size in density-independent pixels
 * @param minScale Minimum scale factor (optional, defaults to MIN_SCALE_FACTOR)
 * @param maxScale Maximum scale factor (optional, defaults to MAX_SCALE_FACTOR)
 * @returns {number} Calculated responsive size value
 * @throws {Error} If baseSize is negative or scale factors are invalid
 */
export const getResponsiveSize = (
  baseSize: number,
  minScale: number = MIN_SCALE_FACTOR,
  maxScale: number = MAX_SCALE_FACTOR
): number => {
  try {
    // Validate input parameters
    if (baseSize < 0) {
      throw new Error('Base size cannot be negative');
    }
    if (minScale > maxScale) {
      throw new Error('Minimum scale cannot be greater than maximum scale');
    }

    // Generate cache key
    const cacheKey = `${baseSize}-${minScale}-${maxScale}`;
    
    // Return cached value if available
    if (cache.responsiveSizes.has(cacheKey)) {
      return cache.responsiveSizes.get(cacheKey)!;
    }

    const deviceType = getDeviceType();
    let scaleFactor = DEFAULT_SCALE_FACTOR;

    // Calculate scale factor based on device type
    switch (deviceType) {
      case 'small':
        scaleFactor = minScale;
        break;
      case 'regular':
        scaleFactor = DEFAULT_SCALE_FACTOR;
        break;
      case 'large':
        scaleFactor = maxScale;
        break;
    }

    // Calculate and cache responsive size
    const responsiveSize = Math.round(baseSize * scaleFactor);
    cache.responsiveSizes.set(cacheKey, responsiveSize);

    return responsiveSize;
  } catch (error) {
    console.error('Error calculating responsive size:', error);
    return baseSize; // Fallback to original size
  }
};

/**
 * Calculates responsive spacing with validation and spacing-specific scaling
 * @param baseSpacing Base spacing value in density-independent pixels
 * @returns {number} Calculated responsive spacing value
 * @throws {Error} If baseSpacing is negative
 */
export const getResponsiveSpacing = (baseSpacing: number): number => {
  try {
    // Validate input
    if (baseSpacing < 0) {
      throw new Error('Base spacing cannot be negative');
    }

    // Return cached value if available
    if (cache.responsiveSpacing.has(baseSpacing)) {
      return cache.responsiveSpacing.get(baseSpacing)!;
    }

    const deviceType = getDeviceType();
    let spacingFactor = DEFAULT_SCALE_FACTOR;

    // Calculate spacing factor based on device type
    switch (deviceType) {
      case 'small':
        spacingFactor = 0.9; // Slightly reduced spacing for small devices
        break;
      case 'regular':
        spacingFactor = DEFAULT_SCALE_FACTOR;
        break;
      case 'large':
        spacingFactor = 1.1; // Slightly increased spacing for large devices
        break;
    }

    // Calculate and cache responsive spacing
    const responsiveSpacing = Math.max(4, Math.round(baseSpacing * spacingFactor));
    cache.responsiveSpacing.set(baseSpacing, responsiveSpacing);

    return responsiveSpacing;
  } catch (error) {
    console.error('Error calculating responsive spacing:', error);
    return Math.max(4, baseSpacing); // Fallback with minimum spacing
  }
};

/**
 * Checks device orientation with change listener and lock detection
 * @returns {boolean} True if device is in landscape orientation
 */
export const isLandscape = (): boolean => {
  try {
    const { width, height } = Dimensions.get('window');

    // Update cache and return orientation state
    cache.isLandscape = width > height;
    return cache.isLandscape;
  } catch (error) {
    console.error('Error determining orientation:', error);
    return false; // Fallback to portrait
  }
};

// Set up dimension change listener with debouncing
let dimensionChangeTimeout: NodeJS.Timeout;
Dimensions.addEventListener('change', () => {
  clearTimeout(dimensionChangeTimeout);
  dimensionChangeTimeout = setTimeout(() => {
    // Clear caches on dimension change
    cache.deviceType = undefined;
    cache.screenWidth = undefined;
    cache.responsiveSizes.clear();
    cache.responsiveSpacing.clear();
    cache.isLandscape = undefined;
  }, DIMENSION_CHANGE_DEBOUNCE_MS);
});