import { useEffect, useCallback, useRef } from 'react'; // v18.0.0
import { useSelector, useDispatch } from 'react-redux'; // v8.0.0
import { selectTheme, setTheme } from '../../store/slices/uiSlice';
import { theme, darkTheme, ThemeType } from '../../styles/theme';
import { BASE_COLORS, THEME_COLORS } from '../../constants/colors';

// Constants
const THEME_STORAGE_KEY = '@art-knowledge-graph/theme-preference';
const TRANSITION_DURATION = 200;
const MIN_CONTRAST_RATIO = 4.5; // WCAG 2.1 Level AA requirement

/**
 * Custom hook for managing theme state and preferences
 * Implements system theme detection, smooth transitions, and WCAG compliance
 */
export const useTheme = () => {
  const dispatch = useDispatch();
  const currentTheme = useSelector(selectTheme);
  const mediaQueryRef = useRef<MediaQueryList | null>(null);

  /**
   * Detects system color scheme preference
   * @returns 'light' | 'dark'
   */
  const getSystemTheme = useCallback((): ThemeType => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return 'light';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }, []);

  /**
   * Validates theme colors against WCAG contrast requirements
   * @param theme - Theme configuration to validate
   * @returns boolean indicating if theme meets contrast requirements
   */
  const validateThemeContrast = useCallback((themeConfig: typeof theme): boolean => {
    const getLuminance = (color: string): number => {
      const rgb = color.match(/\d+/g)?.map(Number) || [0, 0, 0];
      const [r, g, b] = rgb.map(val => {
        const sRGB = val / 255;
        return sRGB <= 0.03928
          ? sRGB / 12.92
          : Math.pow((sRGB + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const calculateContrastRatio = (color1: string, color2: string): number => {
      const l1 = getLuminance(color1);
      const l2 = getLuminance(color2);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };

    // Check text contrast ratios
    const backgroundColors = [
      THEME_COLORS[themeConfig === theme ? 'light' : 'dark'].background,
      THEME_COLORS[themeConfig === theme ? 'light' : 'dark'].surface
    ];
    const textColors = [
      THEME_COLORS[themeConfig === theme ? 'light' : 'dark'].text,
      THEME_COLORS[themeConfig === theme ? 'light' : 'dark'].textSecondary
    ];

    return backgroundColors.every(bg =>
      textColors.every(text => calculateContrastRatio(bg, text) >= MIN_CONTRAST_RATIO)
    );
  }, []);

  /**
   * Toggles between light and dark themes
   */
  const toggleTheme = useCallback(() => {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.classList.add('theme-transitioning');
    dispatch(setTheme(newTheme));
    
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
    }, TRANSITION_DURATION);
  }, [currentTheme, dispatch]);

  /**
   * Sets whether to use system theme preference
   */
  const setSystemTheme = useCallback((useSystem: boolean) => {
    if (useSystem) {
      const systemTheme = getSystemTheme();
      dispatch(setTheme('system'));
      document.documentElement.setAttribute('data-theme', systemTheme);
    } else {
      dispatch(setTheme(getSystemTheme()));
    }
  }, [dispatch, getSystemTheme]);

  // Initialize theme state and system preference detection
  useEffect(() => {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme && ['light', 'dark', 'system'].includes(storedTheme)) {
      dispatch(setTheme(storedTheme as ThemeType));
    }

    mediaQueryRef.current = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = (e: MediaQueryListEvent) => {
      if (currentTheme === 'system') {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    };

    mediaQueryRef.current.addEventListener('change', handleThemeChange);
    return () => {
      mediaQueryRef.current?.removeEventListener('change', handleThemeChange);
    };
  }, [dispatch, currentTheme]);

  // Apply theme changes and validate contrast
  useEffect(() => {
    const themeToApply = currentTheme === 'system' ? getSystemTheme() : currentTheme;
    const themeConfig = themeToApply === 'dark' ? darkTheme : theme;

    if (!validateThemeContrast(themeConfig)) {
      console.warn('Theme contrast does not meet WCAG 2.1 Level AA requirements');
    }

    document.documentElement.setAttribute('data-theme', themeToApply);
    localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
  }, [currentTheme, getSystemTheme, validateThemeContrast]);

  return {
    currentTheme,
    toggleTheme,
    isDarkMode: currentTheme === 'dark' || (currentTheme === 'system' && getSystemTheme() === 'dark'),
    isSystemTheme: currentTheme === 'system',
    setSystemTheme
  };
};