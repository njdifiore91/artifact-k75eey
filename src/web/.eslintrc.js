module.exports = {
  // Use TypeScript parser for enhanced type checking
  parser: '@typescript-eslint/parser',

  // Parser options for modern JavaScript and TypeScript features
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
    project: './tsconfig.json',
  },

  // Extend recommended configs and plugins
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react/recommended',
    'plugin:react-native/all',
    'prettier',
  ],

  // Required plugins for TypeScript, React, and React Native
  plugins: ['@typescript-eslint', 'react', 'react-native'],

  // Global variables available in the codebase
  globals: {
    __DEV__: 'readonly',
    'process.env': 'readonly',
  },

  // Comprehensive rule configuration
  rules: {
    // TypeScript-specific rules
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
    }],
    '@typescript-eslint/strict-boolean-expressions': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',

    // React-specific rules
    'react/jsx-uses-react': 'error',
    'react/jsx-uses-vars': 'error',

    // React Native-specific rules
    'react-native/no-unused-styles': 'error',
    'react-native/split-platform-components': 'error',
    'react-native/no-inline-styles': 'error',
    'react-native/no-raw-text': ['error', {
      skip: ['Text'],
    }],
    'react-native/no-single-element-style-arrays': 'error',

    // General JavaScript rules
    'no-console': ['error', {
      allow: ['warn', 'error'],
    }],
    'no-debugger': 'error',
    'no-alert': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
  },

  // React version detection and environment settings
  settings: {
    react: {
      version: 'detect',
    },
  },

  // Environment configuration
  env: {
    browser: true,
    es2020: true,
    'react-native/react-native': true,
    jest: true,
    node: true,
  },
};