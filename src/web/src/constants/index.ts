/**
 * Central export point for all constants used in the Art Knowledge Graph application.
 * Implements Material Design 3.0 and iOS Human Interface Guidelines standards.
 * @version 1.0.0
 */

// Animation constants - v1.0.0
export {
  ANIMATION_DURATION,
  EASING,
  GRAPH_ANIMATION,
  UI_ANIMATION
} from './animations';

// Color system constants - v3.1.0
export {
  BASE_COLORS,
  THEME_COLORS,
  SEMANTIC_COLORS,
  GRAPH_COLORS
} from './colors';

// Dimension and layout constants - v1.0.0
export {
  SCREEN_SIZES,
  SPACING,
  GRAPH_DIMENSIONS
} from './dimensions';

// API endpoint constants - v1.0.0
export {
  API_VERSION,
  AUTH_ENDPOINTS,
  ARTWORK_ENDPOINTS,
  GRAPH_ENDPOINTS,
  SEARCH_ENDPOINTS,
  USER_ENDPOINTS,
  SYSTEM_ENDPOINTS,
  buildApiUrl,
  replaceUrlParams
} from './endpoints';

// Typography constants - v1.0.0
export {
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  LINE_HEIGHT
} from './typography';

/**
 * Re-export type definitions for better TypeScript support
 */
export type {
  // Animation types
  AnimationDuration,
  Easing,
  GraphAnimation,
  UiAnimation
} from './animations';

// Color types
export type {
  Color,
  ColorToken,
  ThemeColorScheme,
  SemanticColorToken,
  GraphNodeColors,
  GraphColorScheme
} from './colors';

// Dimension types
export type {
  ScreenSizes,
  Spacing,
  GraphDimensions
} from './dimensions';

/**
 * Ensure all constants are read-only at runtime
 * This provides an additional layer of immutability protection
 */
Object.freeze(module.exports);