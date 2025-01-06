import type { Color } from 'csstype'; // v3.1.0
import { rgba, darken, lighten, mix } from 'polished'; // v4.2.2
import {
  BASE_COLORS,
  THEME_COLORS,
  SEMANTIC_COLORS,
  GRAPH_COLORS
} from '../constants/colors';

// Type definitions
type ThemeType = 'light' | 'dark';
type ColorKey = keyof typeof THEME_COLORS[ThemeType] | keyof typeof BASE_COLORS;

// Color cache for memoization
const colorCache = new Map<string, string>();

/**
 * Validates color contrast against WCAG 2.1 Level AA standards
 * @param foreground - Foreground color
 * @param background - Background color
 * @returns boolean indicating if contrast ratio meets WCAG AA standards
 */
const meetsContrastRequirements = (foreground: string, background: string): boolean => {
  const getLuminance = (color: string): number => {
    // Convert color to RGB values
    const rgb = color.match(/\d+/g)?.map(Number) || [0, 0, 0];
    const [r, g, b] = rgb.map(val => {
      const sRGB = val / 255;
      return sRGB <= 0.03928
        ? sRGB / 12.92
        : Math.pow((sRGB + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return ratio >= 4.5; // WCAG AA standard
};

/**
 * Returns a theme-aware color value with memoization
 * @param colorKey - Key of the color in theme or base colors
 * @param theme - Current theme ('light' or 'dark')
 * @returns CSS color value
 */
export const getThemeColor = (colorKey: ColorKey, theme: ThemeType = 'light'): string => {
  const cacheKey = `${colorKey}-${theme}`;
  
  if (colorCache.has(cacheKey)) {
    return colorCache.get(cacheKey)!;
  }

  let color: string;
  
  if (colorKey in THEME_COLORS[theme]) {
    color = THEME_COLORS[theme][colorKey as keyof typeof THEME_COLORS[ThemeType]];
  } else if (colorKey in BASE_COLORS) {
    color = BASE_COLORS[colorKey as keyof typeof BASE_COLORS].main;
  } else {
    throw new Error(`Color key "${colorKey}" not found in theme or base colors`);
  }

  // Validate contrast for text colors
  if (colorKey.includes('text')) {
    const background = THEME_COLORS[theme].background;
    if (!meetsContrastRequirements(color, background)) {
      color = theme === 'light' 
        ? darken(0.1, color)
        : lighten(0.1, color);
    }
  }

  // Convert to appropriate color space
  const supportsP3 = CSS.supports('color', 'color(display-p3 0 0 0)');
  if (supportsP3) {
    // Convert sRGB to Display P3 for wider color gamut
    color = `color(display-p3 ${color})`;
  }

  colorCache.set(cacheKey, color);
  return color;
};

/**
 * Adjusts color opacity with validation
 * @param color - Base color value
 * @param opacity - Opacity value (0-1)
 * @returns RGBA/HSLA color value
 */
export const withOpacity = (color: string, opacity: number): string => {
  if (opacity < 0 || opacity > 1) {
    throw new Error('Opacity must be between 0 and 1');
  }

  // Handle different color formats
  if (color.startsWith('color(display-p3')) {
    return color.replace(')', ` / ${opacity})`);
  }
  
  return rgba(color, opacity);
};

/**
 * Common color style mixins for styled-components
 */
export const colorMixins = {
  // Theme colors
  primary: `color: ${getThemeColor('primary')}`,
  secondary: `color: ${getThemeColor('secondary')}`,
  background: `background-color: ${getThemeColor('background')}`,
  surface: `background-color: ${getThemeColor('surface')}`,
  text: `color: ${getThemeColor('text')}`,
  textSecondary: `color: ${getThemeColor('textSecondary')}`,

  // Semantic colors
  error: `color: ${SEMANTIC_COLORS.error.main}`,
  success: `color: ${SEMANTIC_COLORS.success.main}`,
  warning: `color: ${SEMANTIC_COLORS.warning.main}`,
  info: `color: ${SEMANTIC_COLORS.info.main}`,

  // Graph colors
  graphNode: (type: keyof typeof GRAPH_COLORS.nodes) => `
    fill: ${GRAPH_COLORS.nodes[type].fill};
    stroke: ${GRAPH_COLORS.nodes[type].stroke};
    color: ${GRAPH_COLORS.nodes[type].text};
  `,
  graphEdge: (state: 'default' | 'highlighted' | 'selected') => `
    stroke: ${GRAPH_COLORS.edges[state]};
    stroke-width: ${GRAPH_COLORS.edges.width[state]}px;
  `,
  graphHighlight: (state: keyof typeof GRAPH_COLORS.highlights) => `
    color: ${GRAPH_COLORS.highlights[state]};
  `,

  // Color transitions
  colorTransition: `
    transition: color ${THEME_COLORS.transitions.duration} ${THEME_COLORS.transitions.timing},
                background-color ${THEME_COLORS.transitions.duration} ${THEME_COLORS.transitions.timing};
  `
};