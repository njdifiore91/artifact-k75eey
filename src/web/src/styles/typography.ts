import { css } from 'styled-components';
import {
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  LINE_HEIGHT,
} from '../constants/typography';

/**
 * Primary heading typography mixin
 * Implements Material Design 3.0 specs with responsive scaling and optimized rendering
 * @returns Styled-components CSS mixin
 */
export const heading1 = css`
  font-family: ${FONT_FAMILY.primary};
  font-size: clamp(${FONT_SIZE.lg}px, 5vw, ${FONT_SIZE.xl}px);
  font-weight: ${FONT_WEIGHT.bold};
  line-height: ${LINE_HEIGHT.normal};
  letter-spacing: -0.02em;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: 'kern' 1, 'liga' 1, 'calt' 1;
  font-display: swap;
  overflow-wrap: break-word;
  contain: content;
  direction: inherit;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/**
 * Secondary heading typography mixin
 * Optimized for readability with proper letter-spacing and responsive scaling
 * @returns Styled-components CSS mixin
 */
export const heading2 = css`
  font-family: ${FONT_FAMILY.primary};
  font-size: clamp(${FONT_SIZE.md}px, 4vw, ${FONT_SIZE.lg}px);
  font-weight: ${FONT_WEIGHT.medium};
  line-height: ${LINE_HEIGHT.normal};
  letter-spacing: -0.01em;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: 'kern' 1, 'liga' 1;
  font-display: swap;
  margin-block-end: 0.5em;
  direction: inherit;

  @supports (margin-block-end: 0.5em) {
    margin-bottom: 0.5em;
  }
`;

/**
 * Body text typography mixin
 * Enhanced readability with optimal line height and text flow
 * @returns Styled-components CSS mixin
 */
export const bodyText = css`
  font-family: ${FONT_FAMILY.secondary};
  font-size: clamp(${FONT_SIZE.sm}px, 3vw, ${FONT_SIZE.md}px);
  font-weight: ${FONT_WEIGHT.regular};
  line-height: ${LINE_HEIGHT.relaxed};
  letter-spacing: 0.01em;
  text-rendering: optimizeSpeed;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: 'kern' 1;
  hyphens: auto;
  word-spacing: 0.01em;
  text-align: start;

  @supports (font-variation-settings: normal) {
    font-feature-settings: normal;
    font-variation-settings: 'wght' ${FONT_WEIGHT.regular};
  }
`;

/**
 * Caption text typography mixin
 * Hierarchical styling with proper spacing and accessibility considerations
 * @returns Styled-components CSS mixin
 */
export const caption = css`
  font-family: ${FONT_FAMILY.secondary};
  font-size: clamp(${FONT_SIZE.xs}px, 2vw, ${FONT_SIZE.sm}px);
  font-weight: ${FONT_WEIGHT.regular};
  line-height: ${LINE_HEIGHT.normal};
  letter-spacing: 0.02em;
  text-rendering: optimizeSpeed;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  opacity: 0.8;
  max-width: 65ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &[aria-hidden='true'] {
    display: none;
  }
`;