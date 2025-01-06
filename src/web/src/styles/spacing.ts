import { css } from 'styled-components';
import { SPACING, SCREEN_SIZES } from '../constants/dimensions';

// Type definitions for spacing system
type SpacingSize = 'extra-small' | 'small' | 'medium' | 'large' | 'extra-large';
type Direction = 'all' | 'horizontal' | 'vertical' | 'top' | 'right' | 'bottom' | 'left';
type SpacingOptions = { responsive?: boolean; scale?: number };

// Mapping of SpacingSize to SPACING constant values
const spacingMap: Record<SpacingSize, number> = {
  'extra-small': SPACING.EXTRA_SMALL,
  'small': SPACING.SMALL,
  'medium': SPACING.MEDIUM,
  'large': SPACING.LARGE,
  'extra-large': SPACING.EXTRA_LARGE
};

// Screen size breakpoint media queries
const mediaQueries = {
  smallPhone: `@media (min-width: ${SCREEN_SIZES.SMALL_PHONE}px)`,
  regularPhone: `@media (min-width: ${SCREEN_SIZES.REGULAR_PHONE}px)`,
  largePhone: `@media (min-width: ${SCREEN_SIZES.LARGE_PHONE}px)`
};

/**
 * Calculates responsive spacing value based on screen size
 * @param baseSize Base spacing value in dp
 * @param scale Optional multiplier for the spacing value
 */
const calculateResponsiveSpacing = (baseSize: number, scale: number = 1) => ({
  small: baseSize * scale * 0.875,
  regular: baseSize * scale,
  large: baseSize * scale * 1.125
});

/**
 * Generates margin CSS with responsive adaptation
 * @param size Spacing size from the scale
 * @param direction Direction to apply margin
 * @param options Configuration options
 */
export const margin = (
  size: SpacingSize,
  direction: Direction = 'all',
  { responsive = true, scale = 1 }: SpacingOptions = {}
) => {
  const baseSpacing = spacingMap[size];
  const spacing = calculateResponsiveSpacing(baseSpacing, scale);

  return css`
    ${getDirectionalCSS('margin', direction, spacing.regular)}
    
    ${responsive && css`
      ${mediaQueries.smallPhone} {
        ${getDirectionalCSS('margin', direction, spacing.small)}
      }
      ${mediaQueries.regularPhone} {
        ${getDirectionalCSS('margin', direction, spacing.regular)}
      }
      ${mediaQueries.largePhone} {
        ${getDirectionalCSS('margin', direction, spacing.large)}
      }
    `}
  `;
};

/**
 * Generates padding CSS with responsive adaptation
 * @param size Spacing size from the scale
 * @param direction Direction to apply padding
 * @param options Configuration options
 */
export const padding = (
  size: SpacingSize,
  direction: Direction = 'all',
  { responsive = true, scale = 1 }: SpacingOptions = {}
) => {
  const baseSpacing = spacingMap[size];
  const spacing = calculateResponsiveSpacing(baseSpacing, scale);

  return css`
    ${getDirectionalCSS('padding', direction, spacing.regular)}
    
    ${responsive && css`
      ${mediaQueries.smallPhone} {
        ${getDirectionalCSS('padding', direction, spacing.small)}
      }
      ${mediaQueries.regularPhone} {
        ${getDirectionalCSS('padding', direction, spacing.regular)}
      }
      ${mediaQueries.largePhone} {
        ${getDirectionalCSS('padding', direction, spacing.large)}
      }
    `}
  `;
};

/**
 * Generates gap CSS for flex/grid layouts with responsive adaptation
 * @param size Spacing size from the scale
 * @param options Configuration options
 */
export const gap = (
  size: SpacingSize,
  { responsive = true, scale = 1 }: SpacingOptions = {}
) => {
  const baseSpacing = spacingMap[size];
  const spacing = calculateResponsiveSpacing(baseSpacing, scale);

  return css`
    gap: ${spacing.regular}px;
    
    ${responsive && css`
      ${mediaQueries.smallPhone} {
        gap: ${spacing.small}px;
      }
      ${mediaQueries.regularPhone} {
        gap: ${spacing.regular}px;
      }
      ${mediaQueries.largePhone} {
        gap: ${spacing.large}px;
      }
    `}
  `;
};

// Helper function to generate directional CSS properties
const getDirectionalCSS = (property: string, direction: Direction, value: number) => {
  switch (direction) {
    case 'all':
      return `${property}: ${value}px;`;
    case 'horizontal':
      return `
        ${property}-left: ${value}px;
        ${property}-right: ${value}px;
      `;
    case 'vertical':
      return `
        ${property}-top: ${value}px;
        ${property}-bottom: ${value}px;
      `;
    default:
      return `${property}-${direction}: ${value}px;`;
  }
};

/**
 * Predefined spacing mixins for common layout components
 * Following Material Design 3.0 spacing guidelines
 */
export const spacingMixins = {
  container: css`
    ${padding('medium', 'horizontal', { responsive: true })}
    ${margin('medium', 'bottom', { responsive: true })}
  `,
  
  section: css`
    ${padding('large', 'all', { responsive: true })}
    ${gap('medium', { responsive: true })}
  `,
  
  card: css`
    ${padding('medium', 'all', { responsive: true })}
    ${margin('small', 'bottom', { responsive: true })}
  `
};