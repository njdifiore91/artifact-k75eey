import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { Platform } from 'react-native';

// Internal imports
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import { AuthStackParamList } from './types';

// Initialize the authentication stack navigator
const Stack = createStackNavigator<AuthStackParamList>();

/**
 * Generates platform-specific screen options with proper styling and animations
 * @returns Stack navigation options with platform adaptations
 */
const getScreenOptions = () => ({
  headerShown: false,
  cardStyle: {
    backgroundColor: 'transparent',
  },
  presentation: 'card',
  gestureEnabled: Platform.OS === 'ios',
  animationEnabled: true,
  cardStyleInterpolator: ({ current, layouts }) => ({
    cardStyle: {
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [0, 1],
            outputRange: [layouts.screen.width, 0],
          }),
        },
      ],
    },
  }),
  transitionSpec: {
    open: {
      animation: 'spring',
      config: {
        stiffness: 1000,
        damping: 500,
        mass: 3,
        overshootClamping: true,
        restDisplacementThreshold: 0.01,
        restSpeedThreshold: 0.01,
      },
    },
    close: {
      animation: 'spring',
      config: {
        stiffness: 1000,
        damping: 500,
        mass: 3,
        overshootClamping: true,
        restDisplacementThreshold: 0.01,
        restSpeedThreshold: 0.01,
      },
    },
  },
});

/**
 * Authentication Navigator Component
 * Manages the routing between authentication-related screens with secure transitions
 * and accessibility support
 */
const AuthNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={getScreenOptions()}
      screenListeners={{
        focus: e => {
          // Announce screen change for accessibility
          if (Platform.OS === 'ios') {
            const screenName = e.target?.split('-')[0];
            const announcement = `${screenName} screen`;
            AccessibilityInfo.announceForAccessibility(announcement);
          }
        },
      }}
    >
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{
          title: 'Sign In',
          gestureEnabled: false,
          animationEnabled: true,
          accessibilityRole: 'none',
          accessibilityLabel: 'Login Screen',
        }}
      />

      <Stack.Screen
        name="Register"
        component={RegisterScreen}
        options={{
          title: 'Create Account',
          gestureEnabled: true,
          animationEnabled: true,
          accessibilityRole: 'none',
          accessibilityLabel: 'Registration Screen',
        }}
      />

      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{
          title: 'Reset Password',
          gestureEnabled: true,
          animationEnabled: true,
          accessibilityRole: 'none',
          accessibilityLabel: 'Password Reset Screen',
        }}
      />
    </Stack.Navigator>
  );
};

export default AuthNavigator;