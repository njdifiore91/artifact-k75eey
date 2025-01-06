/**
 * Core typography constants for the Art Knowledge Graph web application.
 * Follows Material Design 3.0 specifications and WCAG 2.1 Level AA compliance.
 * @version 1.0.0
 */

/**
 * Font family definitions with system font fallbacks for optimal performance
 * Primary: Used for headings and prominent text
 * Secondary: Used for body text and longer content
 */
export const FONT_FAMILY = {
  primary: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  secondary: "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
} as const;

/**
 * Font size scale following Material Design 3.0 specifications
 * Sizes are in pixels and support responsive scaling from 11pt to 23pt
 * xs: Small labels, captions
 * sm: Body text, buttons
 * md: Subheadings, emphasized text
 * lg: Section headings
 * xl: Main headings
 */
export const FONT_SIZE = {
  xs: 11, // 11pt - minimum size for accessibility
  sm: 14, // 14pt - standard body text
  md: 16, // 16pt - enhanced readability
  lg: 20, // 20pt - prominent text
  xl: 23, // 23pt - maximum size for standard text
} as const;

/**
 * Standardized font weights for consistent text emphasis
 * Following Material Design weight scale and accessibility guidelines
 * regular: Standard text
 * medium: Mild emphasis
 * bold: Strong emphasis
 */
export const FONT_WEIGHT = {
  regular: 400, // Normal text weight
  medium: 500, // Semi-bold for emphasis
  bold: 700,   // Bold for strong emphasis
} as const;

/**
 * WCAG-compliant line height ratios for optimal readability
 * Ensures sufficient spacing between lines of text
 * normal: Standard spacing for most text
 * relaxed: Enhanced spacing for improved readability
 */
export const LINE_HEIGHT = {
  normal: 1.5,   // Standard spacing (150%)
  relaxed: 1.75, // Enhanced spacing (175%)
} as const;