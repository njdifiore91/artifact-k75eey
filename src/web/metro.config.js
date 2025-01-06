// @react-native/metro-config: ^0.72.0
const path = require('path');
const { getDefaultConfig } = require('@react-native/metro-config');

/**
 * Metro configuration for Art Knowledge Graph mobile application
 * Optimizes bundling, transformation and resolution for React Native development
 * with enhanced art asset handling capabilities
 */
const config = async () => {
  const defaultConfig = await getDefaultConfig(__dirname);

  return {
    transformer: {
      getTransformOptions: async () => ({
        transform: {
          experimentalImportSupport: false,
          inlineRequires: true,
          // Exclude large dependencies from inline requires for better performance
          nonInlinedRequires: [
            '@react-native-community/netinfo',
            'react-native-reanimated',
            'react-native-gesture-handler',
            '@react-native-async-storage/async-storage',
            'd3',
            'react-native-svg',
            'react-native-image-crop-picker',
            'react-native-fast-image'
          ]
        }
      }),
      babelTransformerPath: require.resolve('metro-react-native-babel-transformer'),
      assetPlugins: [
        'react-native-asset-plugin',
        'react-native-svg-transformer',
        'art-metadata-transformer'
      ],
      enableBabelRuntime: true,
      enableBabelTransformProfiler: false,
      minifierPath: 'metro-minify-terser'
    },

    resolver: {
      // Add support for TypeScript and art-specific file extensions
      sourceExts: [
        'tsx',
        'ts',
        'jsx',
        'js',
        'json',
        'art',
        'metadata'
      ],
      // Configure asset extensions including art-specific formats
      assetExts: [
        'png',
        'jpg',
        'jpeg',
        'gif',
        'svg',
        'mp4',
        'webp',
        'heic',
        'ttf',
        'otf',
        'art'
      ],
      // Block unnecessary React dist files
      blockList: [
        /node_modules[\/]react[\/]dist[\/].*/,
        /node_modules[\/]core-js[\/].*/
      ],
      // Polyfills for cross-platform compatibility
      extraNodeModules: {
        'crypto': 'react-native-crypto',
        'stream': 'stream-browserify',
        'vm': 'vm-browserify',
        'path': 'path-browserify'
      },
      platforms: ['ios', 'android', 'web'],
      disableHierarchicalLookup: true
    },

    // Cache configuration for improved build performance
    cacheVersion: 'art-knowledge-graph-1.0',
    maxWorkers: 8,
    resetCache: false,

    // Project structure configuration
    projectRoot: path.resolve(__dirname),
    watchFolders: [
      path.resolve(__dirname),
      path.resolve(__dirname, '../shared')
    ],

    // Development server configuration
    server: {
      port: 8081,
      enhanceMiddleware: (middleware) => {
        return require('art-asset-middleware')(middleware);
      }
    },

    // Module serialization configuration
    serializer: {
      createModuleIdFactory: require.resolve('deterministic-module-ids'),
      processModuleFilter: (module) => {
        return require('art-module-filter')(module);
      }
    }
  };
};

module.exports = config;