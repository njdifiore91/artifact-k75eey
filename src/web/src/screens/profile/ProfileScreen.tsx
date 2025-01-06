import React, { useCallback, useEffect, useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { useNavigation } from '@react-navigation/native';
import { withErrorBoundary } from 'react-error-boundary';
import { useAccessibility } from '@react-native-accessibility/hooks';
import { useSecureData } from '@security/secure-data-hooks';
import { useAuth } from '../../hooks/useAuth';
import { User, UserRole, Theme, NotificationSettings, PrivacySettings } from '../../types/user';

// Styled components with accessibility and security features
const SecureProfileContainer = styled.div`
  padding: ${({ theme }) => theme.spacing.safe}px;
  background-color: ${({ theme }) => theme.colors.background};
  min-height: 100vh;
  
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
  
  @media (max-width: ${({ theme }) => theme.breakpoints.mobile}px) {
    padding: ${({ theme }) => theme.spacing.compact}px;
  }
`;

const AccessibleProfileSection = styled.section`
  margin: 16px 0;
  padding: 24px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: 8px;
  box-shadow: ${({ theme }) => theme.shadows.elevation2};
  
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`;

const SecureDataDisplay = styled.div`
  min-height: 44px;
  padding: 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  
  &[data-sensitive="true"] {
    filter: blur(4px);
    &:hover {
      filter: none;
    }
  }
`;

const AccessibleButton = styled.button`
  min-width: 44px;
  min-height: 44px;
  padding: 12px 24px;
  background-color: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.onPrimary};
  border: none;
  border-radius: 8px;
  cursor: pointer;
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  @media (hover: hover) {
    &:hover:not(:disabled) {
      background-color: ${({ theme }) => theme.colors.primaryDark};
    }
  }
`;

interface ProfileScreenProps {
  onError?: (error: Error) => void;
}

const ProfileScreen: React.FC<ProfileScreenProps> = ({ onError }) => {
  const { user, isAuthenticated, logout, validateBiometric } = useAuth();
  const navigation = useNavigation();
  const theme = useTheme();
  const { secureData, maskData } = useSecureData();
  const { isScreenReaderEnabled, announce } = useAccessibility();
  
  const [isLoading, setIsLoading] = useState(false);
  const [preferences, setPreferences] = useState<{
    theme: Theme;
    notifications: NotificationSettings;
    privacy: PrivacySettings;
  }>(user?.preferences || {
    theme: 'system',
    notifications: { email: true, push: true, inApp: true },
    privacy: { profileVisibility: 'private', shareActivity: false, allowDataCollection: false }
  });

  useEffect(() => {
    if (!isAuthenticated) {
      navigation.navigate('Login');
    }
  }, [isAuthenticated, navigation]);

  const handleSecureLogout = useCallback(async () => {
    try {
      setIsLoading(true);
      if (user?.biometricEnabled) {
        const biometricValid = await validateBiometric();
        if (!biometricValid) {
          throw new Error('Biometric validation failed');
        }
      }
      await logout();
      announce('Successfully logged out');
      navigation.navigate('Login');
    } catch (error) {
      onError?.(error as Error);
      announce('Logout failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [user, logout, validateBiometric, navigation, announce, onError]);

  if (!user) {
    return null;
  }

  return (
    <SecureProfileContainer role="main" aria-label="Profile">
      <AccessibleProfileSection>
        <h1>{user.fullName}</h1>
        <SecureDataDisplay data-sensitive="true" aria-label="Email address">
          {maskData(user.email)}
        </SecureDataDisplay>
        
        <AccessibleProfileSection aria-label="Account Information">
          <h2>Account Details</h2>
          <p>Role: {user.role}</p>
          <p>Account Status: {user.isActive ? 'Active' : 'Inactive'}</p>
          <p>MFA Enabled: {user.mfaEnabled ? 'Yes' : 'No'}</p>
          <p>Biometric Auth: {user.biometricEnabled ? 'Enabled' : 'Disabled'}</p>
        </AccessibleProfileSection>

        <AccessibleProfileSection aria-label="Security Settings">
          <h2>Security Settings</h2>
          <AccessibleButton
            onClick={() => navigation.navigate('SecuritySettings')}
            aria-label="Manage security settings"
          >
            Manage Security
          </AccessibleButton>
        </AccessibleProfileSection>

        <AccessibleProfileSection aria-label="Privacy Settings">
          <h2>Privacy Settings</h2>
          <AccessibleButton
            onClick={() => navigation.navigate('PrivacySettings')}
            aria-label="Manage privacy settings"
          >
            Manage Privacy
          </AccessibleButton>
        </AccessibleProfileSection>

        <AccessibleButton
          onClick={handleSecureLogout}
          disabled={isLoading}
          aria-busy={isLoading}
          aria-label="Logout from account"
        >
          {isLoading ? 'Logging out...' : 'Logout'}
        </AccessibleButton>
      </AccessibleProfileSection>
    </SecureProfileContainer>
  );
};

// Error boundary wrapper for the profile screen
const ProfileScreenWithErrorBoundary = withErrorBoundary(ProfileScreen, {
  fallback: (
    <SecureProfileContainer>
      <AccessibleProfileSection>
        <h1>Something went wrong</h1>
        <AccessibleButton onClick={() => window.location.reload()}>
          Reload Page
        </AccessibleButton>
      </AccessibleProfileSection>
    </SecureProfileContainer>
  ),
  onError: (error) => {
    console.error('Profile Screen Error:', error);
  }
});

export default ProfileScreenWithErrorBoundary;