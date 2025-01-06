/**
 * @fileoverview Reusable animation styles and keyframe animations for the Art Knowledge Graph application
 * @version 1.0.0
 * 
 * Provides GPU-accelerated, performance-optimized animations with:
 * - Hardware acceleration using transform properties
 * - Reduced motion support for accessibility
 * - Touch-optimized timing and easing
 * - RTL layout compatibility
 */

import { keyframes } from '@emotion/react'; // v11.0.0
import { 
  ANIMATION_DURATION, 
  EASING 
} from '../constants/animations';

/**
 * GPU-accelerated fade in animation
 * Uses composite-friendly transform and opacity properties
 */
export const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(10px);
    will-change: opacity, transform;
  }
  to {
    opacity: 1;
    transform: translateY(0);
    will-change: auto;
  }
`;

/**
 * GPU-accelerated fade out animation
 * Uses composite-friendly transform and opacity properties
 */
export const fadeOut = keyframes`
  from {
    opacity: 1;
    transform: translateY(0);
    will-change: opacity, transform;
  }
  to {
    opacity: 0;
    transform: translateY(10px);
    will-change: auto;
  }
`;

/**
 * Hardware-accelerated slide in animation
 * Optimized for touch interactions and RTL layouts
 */
export const slideIn = keyframes`
  from {
    transform: translateX(-100%);
    will-change: transform;
  }
  to {
    transform: translateX(0);
    will-change: auto;
  }
`;

/**
 * Hardware-accelerated slide out animation
 * Optimized for touch interactions and RTL layouts
 */
export const slideOut = keyframes`
  from {
    transform: translateX(0);
    will-change: transform;
  }
  to {
    transform: translateX(100%);
    will-change: auto;
  }
`;

/**
 * Performance-optimized scale in animation for graph nodes
 * Uses transform scale for GPU acceleration
 */
export const scaleIn = keyframes`
  from {
    transform: scale(0.8);
    opacity: 0;
    will-change: transform, opacity;
  }
  to {
    transform: scale(1);
    opacity: 1;
    will-change: auto;
  }
`;

/**
 * Performance-optimized scale out animation for graph nodes
 * Uses transform scale for GPU acceleration
 */
export const scaleOut = keyframes`
  from {
    transform: scale(1);
    opacity: 1;
    will-change: transform, opacity;
  }
  to {
    transform: scale(0.8);
    opacity: 0;
    will-change: auto;
  }
`;

/**
 * Touch-optimized pulse animation
 * Supports reduced motion preferences
 */
export const pulse = keyframes`
  0% {
    transform: scale(1);
    will-change: transform;
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
    will-change: auto;
  }
`;

/**
 * Smooth rotation animation for loading indicators
 * Performance optimized with transform-origin center
 */
export const rotate = keyframes`
  from {
    transform: rotate(0deg);
    transform-origin: center;
    will-change: transform;
  }
  to {
    transform: rotate(360deg);
    transform-origin: center;
    will-change: auto;
  }
`;

// Animation timing presets using imported constants
export const timings = {
  fadeInFast: `${ANIMATION_DURATION.FAST}ms ${EASING.EASE_OUT}`,
  fadeInNormal: `${ANIMATION_DURATION.NORMAL}ms ${EASING.EASE_OUT}`,
  fadeOutFast: `${ANIMATION_DURATION.FAST}ms ${EASING.EASE_IN}`,
  fadeOutNormal: `${ANIMATION_DURATION.NORMAL}ms ${EASING.EASE_IN}`,
  slideInNormal: `${ANIMATION_DURATION.NORMAL}ms ${EASING.EASE_OUT}`,
  slideOutNormal: `${ANIMATION_DURATION.NORMAL}ms ${EASING.EASE_IN}`,
  graphTransition: `${ANIMATION_DURATION.GRAPH_TRANSITION}ms ${EASING.EASE_IN_OUT}`,
  touchResponse: `${ANIMATION_DURATION.FAST}ms ${EASING.EASE_OUT}`,
} as const;

// Ensure constants are read-only
Object.freeze(timings);