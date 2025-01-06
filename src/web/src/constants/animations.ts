/**
 * @fileoverview Core animation constants for the Art Knowledge Graph application
 * @version 1.0.0
 * 
 * Defines standardized animation durations and easing functions optimized for:
 * - Interactive graph visualizations
 * - Touch-based interactions
 * - UI component transitions
 * - Cross-device performance
 */

/**
 * Standard animation durations in milliseconds.
 * - FAST: Quick feedback for simple interactions
 * - NORMAL: Standard transitions
 * - SLOW: Complex or emphasis transitions
 * - GRAPH_TRANSITION: Optimized for graph state changes
 */
export const ANIMATION_DURATION = {
  FAST: 150,
  NORMAL: 300,
  SLOW: 500,
  GRAPH_TRANSITION: 750,
} as const;

/**
 * Easing functions using optimized cubic-bezier curves.
 * - LINEAR: Constant velocity
 * - EASE_IN: Gradual acceleration
 * - EASE_OUT: Gradual deceleration
 * - EASE_IN_OUT: Smooth acceleration and deceleration
 */
export const EASING = {
  LINEAR: 'linear',
  EASE_IN: 'cubic-bezier(0.4, 0, 1, 1)',
  EASE_OUT: 'cubic-bezier(0, 0, 0.2, 1)',
  EASE_IN_OUT: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

/**
 * Graph-specific animation durations in milliseconds.
 * Optimized for visual comprehension and smooth transitions
 * in knowledge graph interactions.
 */
export const GRAPH_ANIMATION = {
  NODE_ENTER: 500,  // Node appearance animation
  NODE_EXIT: 300,   // Node removal animation
  EDGE_ENTER: 750,  // Edge drawing animation
  EDGE_EXIT: 500,   // Edge removal animation
  ZOOM: 300,        // Graph zoom transition
  PAN: 300,         // Graph pan movement
} as const;

/**
 * UI component animation durations in milliseconds.
 * Consistent timings for different types of UI interactions
 * and visual feedback.
 */
export const UI_ANIMATION = {
  FADE: 300,     // Opacity transitions
  SLIDE: 300,    // Position transitions
  SCALE: 300,    // Size transitions
  MODAL: 250,    // Modal dialogs
  TOOLTIP: 150,  // Tooltip display
} as const;

// Type definitions for strict type checking
type AnimationDuration = typeof ANIMATION_DURATION;
type Easing = typeof EASING;
type GraphAnimation = typeof GRAPH_ANIMATION;
type UiAnimation = typeof UI_ANIMATION;

// Ensure constants are read-only
Object.freeze(ANIMATION_DURATION);
Object.freeze(EASING);
Object.freeze(GRAPH_ANIMATION);
Object.freeze(UI_ANIMATION);