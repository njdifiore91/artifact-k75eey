import { NavigationProp, RouteProp } from '@react-navigation/native'; // ^6.0.0

/**
 * Root navigation stack parameter list defining the main authentication 
 * and application navigation separation
 */
export interface RootStackParamList {
  Auth: undefined;
  App: undefined;
}

/**
 * Authentication flow navigation parameter list defining all auth-related 
 * screens and their parameters
 */
export interface AuthStackParamList {
  /** Login screen with optional redirect URL after successful authentication */
  Login: {
    redirectUrl?: string;
  };
  /** Registration screen with optional invite code support */
  Register: {
    inviteCode?: string;
  };
  /** Password recovery screen with optional pre-filled email */
  ForgotPassword: {
    email?: string;
  };
  /** OAuth callback screen for handling third-party authentication */
  OAuthCallback: {
    provider: string;
    token: string;
  };
}

/**
 * Main application navigation parameter list defining all app screens 
 * and their respective parameters
 */
export interface AppStackParamList {
  /** Home screen - main entry point of the authenticated application */
  Home: undefined;

  /** Search screen with optional query and filter parameters */
  Search: {
    query?: string;
    filters?: {
      period?: string;
      movement?: string;
      artist?: string;
    };
  };

  /** Detailed artwork view with required artwork ID and optional initial tab selection */
  ArtworkDetail: {
    artworkId: string;
    initialTab?: 'info' | 'graph' | 'history';
  };

  /** Artwork upload screen with optional source type selection */
  ArtworkUpload: {
    sourceType?: 'camera' | 'gallery';
  };

  /** Interactive graph visualization screen with required graph ID and optional view parameters */
  GraphView: {
    graphId: string;
    centerNodeId?: string;
    zoomLevel?: number;
  };

  /** Graph export screen with required graph ID and optional export parameters */
  GraphExport: {
    graphId: string;
    format?: 'png' | 'pdf' | 'url';
    quality?: 'high' | 'medium' | 'low';
  };

  /** User profile screen with optional user ID and section selection */
  Profile: {
    userId?: string;
    section?: 'uploads' | 'graphs' | 'settings';
  };

  /** Application settings screen with optional section selection */
  Settings: {
    section?: 'account' | 'preferences' | 'notifications' | 'privacy';
  };
}

/**
 * Type helper for navigation prop usage in components
 * Provides type-safe navigation methods for all navigation stacks
 */
export type NavigationProps = {
  navigation: NavigationProp<
    RootStackParamList | AuthStackParamList | AppStackParamList
  >;
};

/**
 * Type helper for route prop usage in components
 * Provides type-safe access to route parameters for all navigation stacks
 */
export type RouteProps = {
  route: RouteProp<
    RootStackParamList | AuthStackParamList | AppStackParamList
  >;
};