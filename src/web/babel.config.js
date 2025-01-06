// @version metro-react-native-babel-preset@0.76.0
// @version @babel/preset-typescript@7.22.0
// @version react-native-reanimated/plugin@3.3.0
// @version babel-plugin-transform-remove-console@6.9.4

module.exports = function configureBabel(api) {
  // Cache the returned value forever and don't call this function again
  api.cache(true);

  return {
    // Base presets for React Native and TypeScript support
    presets: [
      'metro-react-native-babel-preset',
      '@babel/preset-typescript'
    ],

    // Environment-specific configurations
    env: {
      production: {
        plugins: [
          // Remove console.* statements in production for better performance
          'transform-remove-console',
          // Optimize animations in production
          'react-native-reanimated/plugin'
        ]
      },
      development: {
        plugins: [
          // Enable animation support in development
          'react-native-reanimated/plugin'
        ]
      }
    },

    // Enable source map generation for debugging
    sourceMaps: true,

    // Optimize module resolution
    moduleResolver: {
      root: ['./src'],
      extensions: [
        '.ios.ts',
        '.android.ts',
        '.ts',
        '.ios.tsx',
        '.android.tsx',
        '.tsx',
        '.jsx',
        '.js',
        '.json'
      ]
    },

    // Retain line numbers for better debugging
    retainLines: true
  };
};