import React, { useEffect } from 'react';
import { Platform, AccessibilityInfo } from 'react-native';
import { createStackNavigator, StackNavigationOptions } from '@react-navigation/stack'; // ^6.3.0
import { useNavigationPersistence } from '@react-navigation/native'; // ^6.3.0

import { AppStackParamList } from './types';

// Initialize stack navigator with type safety
const Stack = createStackNavigator<AppStackParamList>();

// Default screen transition animation duration
const TRANSITION_DURATION = Platform.select({
  ios: 350,
  android: 300,
  default: 250
});

/**
 * Generates default screen options with platform-specific styling and accessibility
 */
const getDefaultScreenOptions = (): StackNavigationOptions => ({
  headerShown: true,
  headerBackTitleVisible: Platform.OS === 'ios',
  headerTitleAlign: Platform.OS === 'ios' ? 'center' : 'left',
  headerShadowVisible: Platform.OS === 'ios',
  headerElevation: Platform.OS === 'android' ? 4 : 0,
  gestureEnabled: Platform.OS === 'ios',
  animationEnabled: !AccessibilityInfo.isReduceMotionEnabled(),
  animation: Platform.select({
    ios: 'default',
    android: 'slide_from_right',
    default: 'fade'
  }),
  transitionSpec: {
    open: {
      animation: 'timing',
      config: {
        duration: TRANSITION_DURATION
      }
    },
    close: {
      animation: 'timing',
      config: {
        duration: TRANSITION_DURATION
      }
    }
  },
  // WCAG 2.1 AA compliance
  screenReaderAnnouncement: 'New screen loaded',
  headerAccessibilityLabel: 'Navigation header',
  headerBackAccessibilityLabel: 'Go back',
});

/**
 * Main application navigator component that defines the authenticated user flow
 * with enhanced accessibility and platform-specific behavior
 */
export const AppNavigator: React.FC = () => {
  // Set up navigation state persistence
  const { isRestored, initialState } = useNavigationPersistence({
    storage: 'AsyncStorage',
    persistenceKey: 'ArtKnowledgeGraph.NavigationState'
  });

  // Wait for navigation state restoration
  if (!isRestored) {
    return null;
  }

  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={getDefaultScreenOptions()}
      screenListeners={{
        focus: (e) => {
          // Announce screen changes to screen readers
          AccessibilityInfo.announceForAccessibility(
            `Navigated to ${e.target?.split('-')[0] || 'new screen'}`
          );
        }
      }}
      initialState={initialState}
    >
      <Stack.Screen
        name="Home"
        getComponent={() => require('../screens/HomeScreen').default}
        options={{
          title: 'Art Knowledge Graph',
          headerLargeTitle: Platform.OS === 'ios'
        }}
      />

      <Stack.Screen
        name="Search"
        getComponent={() => require('../screens/SearchScreen').default}
        options={{
          title: 'Search Artwork',
          headerSearchBarOptions: Platform.select({
            ios: {
              placeholder: 'Search art or artists...'
            },
            default: undefined
          })
        }}
      />

      <Stack.Screen
        name="ArtworkDetail"
        getComponent={() => require('../screens/ArtworkDetailScreen').default}
        options={({ route }) => ({
          title: 'Artwork Details',
          headerBackTitleVisible: false
        })}
      />

      <Stack.Screen
        name="ArtworkUpload"
        getComponent={() => require('../screens/ArtworkUploadScreen').default}
        options={{
          title: 'Upload Artwork',
          presentation: 'modal',
          headerLargeTitle: false
        }}
      />

      <Stack.Screen
        name="GraphView"
        getComponent={() => require('../screens/GraphViewScreen').default}
        options={{
          title: 'Knowledge Graph',
          headerBackTitleVisible: false,
          gestureResponseDistance: Platform.OS === 'ios' ? 50 : undefined
        }}
      />

      <Stack.Screen
        name="GraphExport"
        getComponent={() => require('../screens/GraphExportScreen').default}
        options={{
          title: 'Export Graph',
          presentation: 'modal',
          gestureEnabled: true
        }}
      />

      <Stack.Screen
        name="Profile"
        getComponent={() => require('../screens/ProfileScreen').default}
        options={({ route }) => ({
          title: route.params?.userId ? 'User Profile' : 'My Profile',
          headerLargeTitle: Platform.OS === 'ios'
        })}
      />

      <Stack.Screen
        name="Settings"
        getComponent={() => require('../screens/SettingsScreen').default}
        options={{
          title: 'Settings',
          presentation: Platform.select({
            ios: 'modal',
            default: 'card'
          })
        }}
      />
    </Stack.Navigator>
  );
};

export default AppNavigator;