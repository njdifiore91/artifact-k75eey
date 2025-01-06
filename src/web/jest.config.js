// Jest configuration for Art Knowledge Graph mobile application
// Dependencies:
// - jest ^29.0.0
// - @testing-library/react-native ^12.0.0
// - @testing-library/jest-dom ^5.16.0

/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  // Use react-native preset as base configuration
  preset: 'react-native',

  // Supported file extensions for test modules
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json',
    'node'
  ],

  // Setup files to run before tests
  setupFiles: [
    './node_modules/react-native-gesture-handler/jestSetup.js'
  ],

  // Setup files to run after environment is setup
  setupFilesAfterEnv: [
    '@testing-library/jest-dom'
  ],

  // Configure module transformation patterns
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-reanimated|@react-navigation|d3)/)'
  ],

  // Module name mapping for absolute imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },

  // Test file patterns
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.[jt]sx?$',

  // Use jsdom as test environment
  testEnvironment: 'jsdom',

  // Enable coverage collection
  collectCoverage: true,

  // Configure coverage collection patterns
  collectCoverageFrom: [
    'src/**/*.{ts,tsx,js,jsx}',
    '!src/**/*.d.ts',
    '!src/assets/**',
    '!src/locales/**',
    '!src/constants/**'
  ],

  // Set coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Enable verbose test output
  verbose: true,

  // Set test timeout to 10 seconds (matching pipeline SLA)
  testTimeout: 10000,

  // Global teardown to ensure cleanup
  globalTeardown: '<rootDir>/src/test/teardown.js',

  // Custom resolver for module resolution
  resolver: '<rootDir>/src/test/resolver.js',

  // Watch plugins for interactive mode
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],

  // Cache configuration
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',

  // Error handling configuration
  errorOnDeprecated: true,
  bail: 0,

  // Notification configuration
  notify: true,
  notifyMode: 'failure-change',

  // Projects configuration for monorepo support
  projects: [
    {
      displayName: 'web',
      testMatch: [
        '<rootDir>/src/**/__tests__/**/*.{ts,tsx,js,jsx}',
        '<rootDir>/src/**/*.{spec,test}.{ts,tsx,js,jsx}'
      ]
    }
  ]
};