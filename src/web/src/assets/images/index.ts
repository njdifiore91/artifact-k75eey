// Image asset exports for Art Knowledge Graph web application
// Material Design 3.0 and iOS Human Interface Guidelines compliant

import { ImageSourcePropType } from 'react-native';

// Application Logo - Light and Dark variants
export const appLogo: { light: ImageSourcePropType; dark: ImageSourcePropType } = {
  light: require('./logo/app-logo-light.png'),
  dark: require('./logo/app-logo-dark.png')
};

// Default placeholder for artwork loading states
export const placeholderArtwork: { default: ImageSourcePropType } = {
  default: require('./placeholders/artwork-placeholder.png')
};

// Upload functionality icon
export const uploadIcon: { default: ImageSourcePropType } = {
  default: require('./icons/upload.png')
};

// Knowledge Graph Visualization Icons
export const graphIcons: Record<string, ImageSourcePropType> = {
  node: require('./graph/node-icon.png'),
  edge: require('./graph/edge-icon.png'),
  expand: require('./graph/expand-icon.png'),
  collapse: require('./graph/collapse-icon.png')
};

// Navigation Icons
export const navigationIcons: Record<string, ImageSourcePropType> = {
  home: require('./navigation/home-icon.png'),
  search: require('./navigation/search-icon.png'),
  profile: require('./navigation/profile-icon.png'),
  settings: require('./navigation/settings-icon.png')
};

// Common Action Icons
export const actionIcons: Record<string, ImageSourcePropType> = {
  share: require('./actions/share-icon.png'),
  export: require('./actions/export-icon.png'),
  edit: require('./actions/edit-icon.png'),
  delete: require('./actions/delete-icon.png')
};

// Type definitions for strongly-typed image assets
export type GraphIconType = keyof typeof graphIcons;
export type NavigationIconType = keyof typeof navigationIcons;
export type ActionIconType = keyof typeof actionIcons;

// Re-export all image types for convenience
export type {
  ImageSourcePropType
};