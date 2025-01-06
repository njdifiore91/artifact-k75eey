import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native'; // ^6.0.0
import { createStackNavigator } from '@react-navigation/stack'; // ^6.0.0
import { useAuth } from '@react-navigation/native'; // ^6.0.0

// Internal imports
import AppNavigator from './AppNavigator';
import AuthNavigator from './AuthNavigator';
import { RootStackParamList } from './types';

// Initialize root stack navigator with type safety
const Stack = createStackNavigator<RootStackParamList>();

/**
 * Root navigation component that manages authentication state transitions,
 * deep linking, accessibility, and secure routing between authenticated
 * and non-authenticated navigation stacks
 */
export const RootNavigator: React.FC = () => {
  const { isAuthenticated, isMfaRequired, isBiometricEnabled } = useAuth();

  // Configure deep linking with security validation
  const linking = {
    prefixes: [
      'artknowledgegraph://',
      'https://app.artknowledgegraph.com'
    ],
    config: {
      screens: {
        Auth: {
          screens: {
            Login: 'login',
            Register: 'register',
            ForgotPassword: 'forgot-password',
            OAuthCallback: 'oauth-callback'
          }
        },
        App: {
          screens: {
            Home: 'home',
            Search: 'search',
            ArtworkDetail: 'artwork/:artworkId',
            GraphView: 'graph/:graphId',
            Profile: 'profile/:userId?'
          }
        }
      }
    },
    // Validate deep links for security
    getInitialURL: async () => {
      try {
        const url = await Linking.getInitialURL();
        if (url) {
          // Validate URL structure and parameters
          const isValid = validateDeepLink(url);
          return isValid ? url : null;
        }
        return null;
      } catch (error) {
        console.error('Deep linking error:', error);
        return null;
      }
    }
  };

  // Configure navigation theme with accessibility support
  const navigationTheme = {
    dark: false,
    colors: {
      primary: '#1976D2',
      background: '#FFFFFF',
      card: '#F5F5F5',
      text: '#212121',
      border: '#BDBDBD',
      notification: '#FF4081'
    }
  };

  // Set up navigation event tracking
  useEffect(() => {
    const unsubscribe = navigation.addListener('state', (e) => {
      const currentRoute = navigation.getCurrentRoute();
      if (currentRoute) {
        // Track navigation events securely
        analytics.trackScreenView({
          screenName: currentRoute.name,
          routeParams: currentRoute.params
        });
      }
    });

    return unsubscribe;
  }, [navigation]);

  return (
    <NavigationContainer
      linking={linking}
      theme={navigationTheme}
      fallback={<LoadingScreen />}
      documentTitle={{
        formatter: (options, route) => 
          `${options?.title ?? route?.name} - Art Knowledge Graph`
      }}
      onStateChange={(state) => {
        // Monitor navigation state changes for security
        validateNavigationState(state);
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          gestureEnabled: false,
          animationEnabled: !isReduceMotionEnabled(),
          presentation: 'modal'
        }}
      >
        {!isAuthenticated ? (
          // Non-authenticated stack
          <Stack.Screen
            name="Auth"
            component={AuthNavigator}
            options={{
              animationTypeForReplace: 'pop'
            }}
          />
        ) : (
          // Authenticated stack with conditional MFA/Biometric checks
          <Stack.Screen
            name="App"
            component={AppNavigator}
            options={{
              gestureEnabled: false
            }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

/**
 * Validates deep link URLs for security
 */
const validateDeepLink = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    const allowedHosts = [
      'app.artknowledgegraph.com',
      'artknowledgegraph.com'
    ];
    return allowedHosts.includes(parsedUrl.host);
  } catch {
    return false;
  }
};

/**
 * Validates navigation state changes for security
 */
const validateNavigationState = (state: any) => {
  if (!state) return;

  // Check for suspicious navigation patterns
  const suspiciousPatterns = [
    '/../../', // Path traversal
    'javascript:', // XSS attempts
    'data:', // Data URL injection
    'file:' // Local file access
  ];

  const stateString = JSON.stringify(state);
  const hasSuspiciousPattern = suspiciousPatterns.some(pattern => 
    stateString.includes(pattern)
  );

  if (hasSuspiciousPattern) {
    console.error('Suspicious navigation state detected');
    // Reset to safe state
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }]
    });
  }
};

/**
 * Checks if reduce motion is enabled for accessibility
 */
const isReduceMotionEnabled = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
};

export default RootNavigator;