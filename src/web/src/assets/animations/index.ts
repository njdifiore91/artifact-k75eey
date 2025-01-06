/**
 * @fileoverview Animation assets and configuration for the Art Knowledge Graph application
 * @version 1.0.0
 * 
 * Exports optimized Lottie animations and device-aware configuration settings.
 * Supports high-refresh displays, battery optimization, and accessibility.
 */

import lottie from 'lottie-web'; // v5.9.0
import { ANIMATION_DURATION } from '../../constants/animations';

// Types for animation configuration
type DeviceCapabilities = {
  refreshRate: number;
  batteryLevel?: number;
  isBatterySaver: boolean;
  isHighPerformance: boolean;
};

type UserPreferences = {
  reducedMotion: boolean;
  powerSaveMode: boolean;
  animationSpeed: 'fast' | 'normal' | 'slow';
};

type LottieConfig = {
  loop: boolean;
  autoplay: boolean;
  rendererSettings: {
    preserveAspectRatio: string;
    progressiveLoad: boolean;
    hideOnTransparent: boolean;
    className: string;
  };
  deviceSettings: {
    highRefreshRate: {
      frameRate: number;
    };
    lowPower: {
      frameRate: number;
      quality: 'low' | 'medium' | 'high';
    };
  };
};

// Global animation configurations
export const ANIMATION_CONFIG = {
  LOADING: {
    loop: true,
    autoplay: true,
    rendererSettings: {
      preserveAspectRatio: 'xMidYMid slice',
      progressiveLoad: true,
      hideOnTransparent: true,
      className: 'loading-animation'
    },
    deviceSettings: {
      highRefreshRate: { frameRate: 60 },
      lowPower: { frameRate: 30, quality: 'low' }
    }
  },
  SUCCESS: {
    loop: false,
    autoplay: true,
    rendererSettings: {
      preserveAspectRatio: 'xMidYMid slice',
      progressiveLoad: true,
      hideOnTransparent: true,
      className: 'success-animation'
    },
    deviceSettings: {
      highRefreshRate: { frameRate: 60 },
      lowPower: { frameRate: 30, quality: 'low' }
    }
  },
  ERROR: {
    loop: false,
    autoplay: true,
    rendererSettings: {
      preserveAspectRatio: 'xMidYMid slice',
      progressiveLoad: true,
      hideOnTransparent: true,
      className: 'error-animation'
    },
    deviceSettings: {
      highRefreshRate: { frameRate: 60 },
      lowPower: { frameRate: 30, quality: 'low' }
    }
  }
} as const;

/**
 * Returns optimized animation configuration based on device capabilities and user preferences
 * @param type Animation type to configure
 * @param deviceCapabilities Device hardware capabilities
 * @param preferences User animation preferences
 * @returns Optimized Lottie configuration
 */
export const getAnimationConfig = (
  type: keyof typeof ANIMATION_CONFIG,
  deviceCapabilities: DeviceCapabilities,
  preferences: UserPreferences
): LottieConfig => {
  const baseConfig = { ...ANIMATION_CONFIG[type] };
  
  // Apply device-specific optimizations
  const frameRate = deviceCapabilities.isHighPerformance && !preferences.powerSaveMode
    ? baseConfig.deviceSettings.highRefreshRate.frameRate
    : baseConfig.deviceSettings.lowPower.frameRate;

  // Apply user preferences
  if (preferences.reducedMotion) {
    baseConfig.loop = false;
  }

  // Apply animation speed preference
  const speedMap = {
    fast: ANIMATION_DURATION.FAST,
    normal: ANIMATION_DURATION.NORMAL,
    slow: ANIMATION_DURATION.SLOW
  };
  
  return {
    ...baseConfig,
    rendererSettings: {
      ...baseConfig.rendererSettings,
      progressiveLoad: deviceCapabilities.isBatterySaver || preferences.powerSaveMode
    },
    deviceSettings: {
      ...baseConfig.deviceSettings,
      highRefreshRate: { frameRate },
      lowPower: {
        frameRate: Math.min(30, frameRate),
        quality: deviceCapabilities.isBatterySaver ? 'low' : 'medium'
      }
    }
  };
};

// Export optimized animation assets
export const loadingAnimation = {
  data: require('./loading.json'),
  config: ANIMATION_CONFIG.LOADING
};

export const successAnimation = {
  data: require('./success.json'),
  config: ANIMATION_CONFIG.SUCCESS
};

export const errorAnimation = {
  data: require('./error.json'),
  config: ANIMATION_CONFIG.ERROR
};

export const graphLoadingAnimation = {
  data: require('./graph-loading.json'),
  config: {
    ...ANIMATION_CONFIG.LOADING,
    rendererSettings: {
      ...ANIMATION_CONFIG.LOADING.rendererSettings,
      className: 'graph-loading-animation'
    }
  }
};

// Type exports for consumers
export type { DeviceCapabilities, UserPreferences, LottieConfig };