// Font asset management for Art Knowledge Graph web application
// @font-face CSS3
// FontFace Web API Latest

// Font loading status enum for tracking and error handling
export enum FontLoadingStatus {
  LOADING = 'loading',
  LOADED = 'loaded',
  ERROR = 'error'
}

// Font family name constants
export const SFProDisplayRegular = 'SF Pro Display Regular';
export const SFProDisplayMedium = 'SF Pro Display Medium';
export const SFProDisplayBold = 'SF Pro Display Bold';
export const SFProTextRegular = 'SF Pro Text Regular';
export const SFProTextMedium = 'SF Pro Text Medium';

// Font face definitions with optimized loading strategy
const fontFaces = `
  @font-face {
    font-family: '${SFProDisplayRegular}';
    src: url('./SFProDisplay-Regular.woff2') format('woff2');
    font-display: swap;
    font-weight: 400;
    font-style: normal;
  }

  @font-face {
    font-family: '${SFProDisplayMedium}';
    src: url('./SFProDisplay-Medium.woff2') format('woff2');
    font-display: swap;
    font-weight: 500;
    font-style: normal;
  }

  @font-face {
    font-family: '${SFProDisplayBold}';
    src: url('./SFProDisplay-Bold.woff2') format('woff2');
    font-display: swap;
    font-weight: 700;
    font-style: normal;
  }

  @font-face {
    font-family: '${SFProTextRegular}';
    src: url('./SFProText-Regular.woff2') format('woff2');
    font-display: swap;
    font-weight: 400;
    font-style: normal;
  }

  @font-face {
    font-family: '${SFProTextMedium}';
    src: url('./SFProText-Medium.woff2') format('woff2');
    font-display: swap;
    font-weight: 500;
    font-style: normal;
  }
`;

// Insert font face definitions into document
const styleSheet = document.createElement('style');
styleSheet.textContent = fontFaces;
document.head.appendChild(styleSheet);

// Font loading timeout in milliseconds
const FONT_LOADING_TIMEOUT = 3000;

/**
 * Preloads critical font assets for improved performance
 */
export const preloadFonts = (): void => {
  const criticalFonts = [
    './SFProDisplay-Regular.woff2',
    './SFProDisplay-Medium.woff2'
  ];

  criticalFonts.forEach(fontUrl => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'font';
    link.type = 'font/woff2';
    link.href = fontUrl;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });
};

/**
 * Asynchronously loads and initializes all required font assets
 * with optimized loading strategies
 * @returns Promise resolving to FontLoadingStatus
 */
export const loadFonts = async (): Promise<FontLoadingStatus> => {
  try {
    const fontFaceDefinitions = [
      new FontFace(SFProDisplayRegular, `url('./SFProDisplay-Regular.woff2') format('woff2')`),
      new FontFace(SFProDisplayMedium, `url('./SFProDisplay-Medium.woff2') format('woff2')`),
      new FontFace(SFProDisplayBold, `url('./SFProDisplay-Bold.woff2') format('woff2')`),
      new FontFace(SFProTextRegular, `url('./SFProText-Regular.woff2') format('woff2')`),
      new FontFace(SFProTextMedium, `url('./SFProText-Medium.woff2') format('woff2')`)
    ];

    // Create loading timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Font loading timeout')), FONT_LOADING_TIMEOUT);
    });

    // Load fonts with timeout
    const loadedFonts = await Promise.race([
      Promise.all(fontFaceDefinitions.map(font => font.load())),
      timeoutPromise
    ]);

    // Add loaded fonts to document fonts collection
    loadedFonts.forEach(font => document.fonts.add(font));

    return FontLoadingStatus.LOADED;
  } catch (error) {
    console.error('Error loading fonts:', error);
    return FontLoadingStatus.ERROR;
  }
};

// Export font family names for use in styles
export const fontFamilies = {
  displayRegular: SFProDisplayRegular,
  displayMedium: SFProDisplayMedium,
  displayBold: SFProDisplayBold,
  textRegular: SFProTextRegular,
  textMedium: SFProTextMedium
} as const;

// Initialize font loading
preloadFonts();