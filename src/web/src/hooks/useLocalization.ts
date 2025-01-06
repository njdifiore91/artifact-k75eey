import { useState, useCallback, useEffect, useRef } from 'react'; // v18.0.0
import { translations } from '../locales/en.json';
import { formatDate, formatRelativeTime } from '../utils/formatting';
import { useTheme } from '../hooks/useTheme';

// Constants for localization configuration
const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'ja'] as const;
const DEFAULT_LANGUAGE = 'en';
const RTL_LANGUAGES = ['ar', 'he', 'fa'] as const;
const STORAGE_KEY = 'app_language';

// Type definitions
type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
type RTLLanguage = typeof RTL_LANGUAGES[number];
type TranslationKey = keyof typeof translations;
type InterpolationValues = Record<string, string | number>;

interface LocalizationError extends Error {
  code: string;
  key: string;
}

/**
 * Enhanced React hook for managing application localization with RTL support,
 * dynamic type scaling, and performance optimizations
 */
export const useLocalization = () => {
  // State and refs
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage))
      ? stored as SupportedLanguage
      : DEFAULT_LANGUAGE;
  });

  const translationsCache = useRef<Record<string, typeof translations>>({
    [DEFAULT_LANGUAGE]: translations
  });

  const { currentTheme } = useTheme();

  // Detect RTL language
  const isRTL = useCallback((lang: string): boolean => {
    return RTL_LANGUAGES.includes(lang as RTLLanguage);
  }, []);

  // Load translations for a language
  const loadTranslations = useCallback(async (lang: SupportedLanguage) => {
    if (translationsCache.current[lang]) {
      return translationsCache.current[lang];
    }

    try {
      const module = await import(`../locales/${lang}.json`);
      translationsCache.current[lang] = module.default;
      return module.default;
    } catch (error) {
      console.error(`Failed to load translations for ${lang}:`, error);
      return translations; // Fallback to default English translations
    }
  }, []);

  // Translation function with interpolation and type safety
  const translate = useCallback((
    key: TranslationKey,
    values?: InterpolationValues,
    namespace: keyof typeof translations = 'common'
  ): string => {
    try {
      const translationSet = translationsCache.current[currentLanguage] || translations;
      let translation = key.split('.').reduce((obj, k) => obj[k], translationSet[namespace] as any);

      if (typeof translation !== 'string') {
        throw new Error(`Translation key "${key}" not found`);
      }

      if (values) {
        translation = translation.replace(/\{\{(\w+)\}\}/g, (_, key) => 
          String(values[key] ?? `{{${key}}}`)
        );
      }

      return translation;
    } catch (error) {
      const locError: LocalizationError = new Error(`Translation error: ${error.message}`);
      locError.code = 'TRANSLATION_ERROR';
      locError.key = key;
      console.error(locError);
      return key;
    }
  }, [currentLanguage]);

  // Number formatting with locale support
  const formatNumber = useCallback((
    value: number,
    options?: Intl.NumberFormatOptions
  ): string => {
    try {
      return new Intl.NumberFormat(currentLanguage, options).format(value);
    } catch (error) {
      console.error('Number formatting error:', error);
      return String(value);
    }
  }, [currentLanguage]);

  // Currency formatting with locale support
  const formatCurrency = useCallback((
    value: number,
    currency: string = 'USD'
  ): string => {
    try {
      return new Intl.NumberFormat(currentLanguage, {
        style: 'currency',
        currency,
        currencyDisplay: 'symbol'
      }).format(value);
    } catch (error) {
      console.error('Currency formatting error:', error);
      return String(value);
    }
  }, [currentLanguage]);

  // Plural rules handling
  const getPlural = useCallback((
    count: number,
    singular: string,
    plural: string
  ): string => {
    try {
      const rules = new Intl.PluralRules(currentLanguage);
      return rules.select(count) === 'one' ? singular : plural;
    } catch (error) {
      console.error('Plural rules error:', error);
      return count === 1 ? singular : plural;
    }
  }, [currentLanguage]);

  // Language switching with persistence
  const setLanguage = useCallback((lang: SupportedLanguage) => {
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      console.error(`Language ${lang} is not supported`);
      return;
    }

    setCurrentLanguage(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', isRTL(lang) ? 'rtl' : 'ltr');
  }, [isRTL]);

  // Initialize language and load translations
  useEffect(() => {
    loadTranslations(currentLanguage);
    document.documentElement.setAttribute('lang', currentLanguage);
    document.documentElement.setAttribute('dir', isRTL(currentLanguage) ? 'rtl' : 'ltr');
  }, [currentLanguage, isRTL, loadTranslations]);

  return {
    currentLanguage,
    setLanguage,
    translate,
    formatDate,
    formatRelativeTime,
    formatNumber,
    formatCurrency,
    getPlural,
    isRTL: isRTL(currentLanguage),
    supportedLanguages: SUPPORTED_LANGUAGES
  };
};