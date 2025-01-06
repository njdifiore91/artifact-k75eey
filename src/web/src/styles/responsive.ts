import { css } from 'styled-components';
import { SCREEN_SIZES } from '../constants/dimensions';

/**
 * Media query breakpoints for responsive design
 * Provides type-safe styled-components media query helpers
 * @version 1.0.0
 */
export const media = {
  /**
   * Styles for small phones (320dp to 374dp)
   * Example: iPhone SE and similar compact devices
   */
  smallPhone: (styles: TemplateStringsArray | string) => css`
    @media (max-width: ${SCREEN_SIZES.REGULAR_PHONE - 1}px) {
      ${styles}
    }
  `,

  /**
   * Styles for regular phones (375dp to 427dp)
   * Example: iPhone 12/13 and similar medium-sized devices
   */
  regularPhone: (styles: TemplateStringsArray | string) => css`
    @media (min-width: ${SCREEN_SIZES.REGULAR_PHONE}px) and 
           (max-width: ${SCREEN_SIZES.LARGE_PHONE - 1}px) {
      ${styles}
    }
  `,

  /**
   * Styles for large phones (428dp and above)
   * Example: iPhone 12/13 Pro Max and similar large devices
   */
  largePhone: (styles: TemplateStringsArray | string) => css`
    @media (min-width: ${SCREEN_SIZES.LARGE_PHONE}px) {
      ${styles}
    }
  `
};

/**
 * Reusable flex centering mixin
 * Provides cross-browser compatible centered flex container
 */
export const flexCenter = css`
  display: flex;
  justify-content: center;
  align-items: center;
`;

/**
 * Calculates responsive spacing based on screen size
 * Dynamically scales spacing values for different device sizes
 * 
 * @param baseSize - Base spacing value in pixels
 * @returns Calculated spacing with px unit
 */
export const responsiveSpacing = (baseSize: number): string => {
  // Get current screen width, fallback to regular phone size if not available
  const screenWidth = typeof window !== 'undefined' 
    ? window.innerWidth 
    : SCREEN_SIZES.REGULAR_PHONE;

  // Determine scale factor based on screen size
  let scaleFactor = 1;
  
  if (screenWidth <= SCREEN_SIZES.REGULAR_PHONE - 1) {
    // Small phones get slightly reduced spacing
    scaleFactor = 0.85;
  } else if (screenWidth >= SCREEN_SIZES.LARGE_PHONE) {
    // Large phones get slightly increased spacing
    scaleFactor = 1.15;
  }

  // Calculate final spacing value
  const calculatedValue = Math.round(baseSize * scaleFactor);
  
  // Ensure minimum spacing of 4px
  const finalValue = Math.max(calculatedValue, 4);
  
  return `${finalValue}px`;
};

/**
 * Type definitions for better TypeScript support
 */
export type MediaQueries = typeof media;
export type ResponsiveSpacing = typeof responsiveSpacing;