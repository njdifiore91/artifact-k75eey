import { DefaultTheme, ThemeProvider, css } from 'styled-components'; // v5.3.0
import {
  getThemeColor,
  withOpacity,
  colorMixins,
  ThemeType
} from './colors';
import {
  heading1,
  heading2,
  bodyText,
  caption,
  TypographyType
} from './typography';
import {
  margin,
  padding,
  gap,
  spacingMixins,
  SpacingType
} from './spacing';

// Type definitions for theme configuration
type AccessibilityConfig = {
  reduceMotion: boolean;
  highContrast: boolean;
  colorBlind: boolean;
};

type PlatformType = 'ios' | 'android';

/**
 * Creates a theme object with platform-specific adaptations and accessibility features
 */
const createTheme = (
  mode: 'light' | 'dark' | 'high-contrast',
  platform: PlatformType,
  accessibility: AccessibilityConfig
) => ({
  colors: {
    ...colorMixins,
    mode,
    platform,
    getColor: (key: string, opacity?: number) => {
      const color = getThemeColor(key, mode);
      return opacity ? withOpacity(color, opacity) : color;
    }
  },

  typography: {
    heading1,
    heading2,
    bodyText,
    caption,
    platform: {
      ios: {
        fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont",
        weightRegular: 400,
        weightMedium: 500,
        weightBold: 700
      },
      android: {
        fontFamily: "'Roboto', 'Segoe UI', sans-serif",
        weightRegular: 400,
        weightMedium: 500,
        weightBold: 700
      }
    }[platform]
  },

  spacing: {
    ...spacingMixins,
    margin,
    padding,
    gap
  },

  transitions: {
    duration: accessibility.reduceMotion ? '0ms' : '200ms',
    timing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    create: (properties: string[]) => css`
      transition: ${properties
        .map(prop => `${prop} ${accessibility.reduceMotion ? '0ms' : '200ms'} cubic-bezier(0.4, 0, 0.2, 1)`)
        .join(', ')};
    `
  },

  accessibility: {
    reduceMotion: accessibility.reduceMotion,
    highContrast: accessibility.highContrast,
    colorBlind: accessibility.colorBlind,
    focusRing: css`
      outline: 3px solid ${getThemeColor('primary', mode)};
      outline-offset: 2px;
    `,
    touchTarget: css`
      min-width: 44px;
      min-height: 44px;
      padding: ${accessibility.highContrast ? '12px' : '8px'};
    `
  }
});

// Default theme configuration
export const theme = createTheme('light', 'ios', {
  reduceMotion: false,
  highContrast: false,
  colorBlind: false
});

// Dark theme variant
export const darkTheme = createTheme('dark', 'ios', {
  reduceMotion: false,
  highContrast: false,
  colorBlind: false
});

// High contrast theme for accessibility
export const highContrastTheme = createTheme('high-contrast', 'ios', {
  reduceMotion: true,
  highContrast: true,
  colorBlind: false
});

// Global styles with accessibility and platform adaptations
export const GlobalStyle = css`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html {
    font-size: 100%;
    -webkit-text-size-adjust: 100%;
    font-feature-settings: "kern" 1, "liga" 1, "calt" 1;
  }

  body {
    ${bodyText}
    background-color: ${props => props.theme.colors.getColor('background')};
    color: ${props => props.theme.colors.getColor('text')};
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }

  @media screen and (forced-colors: active) {
    * {
      forced-color-adjust: none;
    }
  }
`;

// Theme context for component access
export const ThemeContext = React.createContext(theme);

// Extend DefaultTheme for better TypeScript support
declare module 'styled-components' {
  export interface DefaultTheme {
    colors: typeof theme.colors;
    typography: typeof theme.typography;
    spacing: typeof theme.spacing;
    transitions: typeof theme.transitions;
    accessibility: typeof theme.accessibility;
  }
}