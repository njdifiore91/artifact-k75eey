import type { Color } from 'csstype'; // v3.1.0

// Type definitions for color tokens
type ColorToken = {
  main: Color;
  light: Color;
  dark: Color;
  alpha: {
    10: Color;
    50: Color;
    75: Color;
  };
};

type ThemeColorScheme = {
  background: Color;
  surface: Color;
  text: Color;
  textSecondary: Color;
  divider: Color;
  overlay: Color;
};

type SemanticColorToken = {
  main: Color;
  light: Color;
  dark: Color;
  contrast: Color;
};

type GraphNodeColors = {
  fill: Color;
  stroke: Color;
  text: Color;
};

type GraphColorScheme = {
  nodes: {
    artwork: GraphNodeColors;
    artist: GraphNodeColors;
    movement: GraphNodeColors;
    period: GraphNodeColors;
    influence: GraphNodeColors;
  };
  edges: {
    default: Color;
    highlighted: Color;
    selected: Color;
    width: {
      default: number;
      highlighted: number;
      selected: number;
    };
  };
  highlights: {
    selected: Color;
    hover: Color;
    active: Color;
    focus: Color;
  };
};

// Core color palette with WCAG 2.1 Level AA compliance
export const BASE_COLORS = {
  primary: {
    main: '#1976D2',
    light: '#64B5F6',
    dark: '#1565C0',
    alpha: {
      10: 'rgba(25, 118, 210, 0.1)',
      50: 'rgba(25, 118, 210, 0.5)',
      75: 'rgba(25, 118, 210, 0.75)'
    }
  } as ColorToken,
  
  secondary: {
    main: '#424242',
    light: '#757575',
    dark: '#212121',
    alpha: {
      10: 'rgba(66, 66, 66, 0.1)',
      50: 'rgba(66, 66, 66, 0.5)',
      75: 'rgba(66, 66, 66, 0.75)'
    }
  } as ColorToken,
  
  accent: {
    main: '#FF4081',
    light: '#FF80AB',
    dark: '#F50057',
    alpha: {
      10: 'rgba(255, 64, 129, 0.1)',
      50: 'rgba(255, 64, 129, 0.5)',
      75: 'rgba(255, 64, 129, 0.75)'
    }
  } as ColorToken
};

// Theme-specific color schemes
export const THEME_COLORS = {
  light: {
    background: '#FFFFFF',
    surface: '#F5F5F5',
    text: '#212121',
    textSecondary: '#757575',
    divider: '#BDBDBD',
    overlay: 'rgba(0, 0, 0, 0.05)'
  } as ThemeColorScheme,
  
  dark: {
    background: '#121212',
    surface: '#1E1E1E',
    text: '#FFFFFF',
    textSecondary: '#B0B0B0',
    divider: '#424242',
    overlay: 'rgba(255, 255, 255, 0.05)'
  } as ThemeColorScheme,
  
  transitions: {
    duration: '200ms',
    timing: 'cubic-bezier(0.4, 0, 0.2, 1)'
  }
};

// Semantic colors for feedback and status
export const SEMANTIC_COLORS = {
  success: {
    main: '#4CAF50',
    light: '#81C784',
    dark: '#388E3C',
    contrast: '#FFFFFF'
  } as SemanticColorToken,
  
  error: {
    main: '#F44336',
    light: '#E57373',
    dark: '#D32F2F',
    contrast: '#FFFFFF'
  } as SemanticColorToken,
  
  warning: {
    main: '#FFC107',
    light: '#FFD54F',
    dark: '#FFA000',
    contrast: '#000000'
  } as SemanticColorToken,
  
  info: {
    main: '#2196F3',
    light: '#64B5F6',
    dark: '#1976D2',
    contrast: '#FFFFFF'
  } as SemanticColorToken,
  
  disabled: {
    main: '#9E9E9E',
    light: '#BDBDBD',
    dark: '#757575',
    contrast: '#FFFFFF'
  } as SemanticColorToken
};

// Graph visualization colors
export const GRAPH_COLORS = {
  nodes: {
    artwork: {
      fill: '#1976D2',
      stroke: '#1565C0',
      text: '#FFFFFF'
    },
    artist: {
      fill: '#9C27B0',
      stroke: '#7B1FA2',
      text: '#FFFFFF'
    },
    movement: {
      fill: '#FF9800',
      stroke: '#F57C00',
      text: '#000000'
    },
    period: {
      fill: '#4CAF50',
      stroke: '#388E3C',
      text: '#FFFFFF'
    },
    influence: {
      fill: '#F44336',
      stroke: '#D32F2F',
      text: '#FFFFFF'
    }
  },
  edges: {
    default: '#757575',
    highlighted: '#2196F3',
    selected: '#FF4081',
    width: {
      default: 1,
      highlighted: 2,
      selected: 2
    }
  },
  highlights: {
    selected: '#FFD700',
    hover: '#90CAF9',
    active: '#64B5F6',
    focus: '#2196F3'
  }
} as GraphColorScheme;