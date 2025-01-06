import React, { useCallback, useMemo } from 'react';
import styled, { css } from 'styled-components';
import { useNavigation } from '@react-navigation/native';
import { Button } from './Button';
import { useAuth } from '../../hooks/useAuth';
import { theme } from '../../styles/theme';

interface HeaderProps {
  title: string;
  showBackButton?: boolean;
  showUserMenu?: boolean;
  className?: string;
  onCustomAction?: (type: string) => void;
  accessibilityLabel?: string;
  testID?: string;
  rtl?: boolean;
}

const HeaderContainer = styled.header<{ rtl?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: ${theme.spacing.padding('medium', 'horizontal')};
  background-color: ${props => props.theme.colors.getColor('surface')};
  direction: ${props => props.rtl ? 'rtl' : 'ltr'};
  position: sticky;
  top: 0;
  z-index: 100;
  
  /* Platform-specific styling */
  ${props => props.theme.platform === 'ios' ? css`
    box-shadow: 0 1px 3px ${props => props.theme.colors.getColor('overlay')};
  ` : css`
    elevation: 4;
  `}

  /* Responsive adjustments */
  @media (min-width: ${theme.breakpoints.regularPhone}px) {
    height: 64px;
  }

  /* Smooth theme transitions */
  ${theme.transitions.create(['background-color', 'box-shadow'])}

  /* Accessibility enhancements */
  &:focus-within {
    ${props => props.theme.accessibility.focusRing}
  }
`;

const HeaderTitle = styled.h1<{ rtl?: boolean }>`
  ${theme.typography.heading2}
  color: ${props => props.theme.colors.getColor('text')};
  margin: 0;
  text-align: ${props => props.rtl ? 'right' : 'left'};
  flex: 1;
  
  /* Text truncation with tooltip */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  
  /* Dynamic font scaling */
  @media (max-width: ${theme.breakpoints.smallPhone}px) {
    font-size: ${theme.typography.platform.ios.fontFamily === "'SF Pro Display', -apple-system, BlinkMacSystemFont" ? '18px' : '20px'};
  }
`;

const HeaderActions = styled.div<{ rtl?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.gap('small')};
  margin-${props => props.rtl ? 'right' : 'left'}: auto;

  /* Platform-specific touch targets */
  & > * {
    ${props => props.theme.accessibility.touchTarget}
  }

  /* Loading state styling */
  &[aria-busy='true'] {
    opacity: 0.7;
    pointer-events: none;
  }
`;

export const Header: React.FC<HeaderProps> = ({
  title,
  showBackButton = false,
  showUserMenu = true,
  className,
  onCustomAction,
  accessibilityLabel,
  testID,
  rtl = false,
}) => {
  const navigation = useNavigation();
  const { user, isAuthenticated, logout, isMFAEnabled } = useAuth();

  const handleNavigation = useCallback((route: string) => {
    navigation.navigate(route);
  }, [navigation]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [logout, navigation]);

  const userMenuItems = useMemo(() => [
    {
      label: 'Profile',
      onClick: () => handleNavigation('Profile'),
      icon: '👤',
    },
    {
      label: 'Settings',
      onClick: () => handleNavigation('Settings'),
      icon: '⚙️',
    },
    {
      label: 'Logout',
      onClick: handleLogout,
      icon: '🚪',
    },
  ], [handleNavigation, handleLogout]);

  return (
    <HeaderContainer 
      className={className}
      rtl={rtl}
      role="banner"
      aria-label={accessibilityLabel || 'Main header'}
      data-testid={testID}
    >
      {showBackButton && (
        <Button
          variant="text"
          icon="←"
          onClick={() => navigation.goBack()}
          ariaLabel="Go back"
          testID="header-back-button"
        />
      )}

      <HeaderTitle rtl={rtl} title={title}>
        {title}
      </HeaderTitle>

      <HeaderActions rtl={rtl}>
        {isAuthenticated && showUserMenu && (
          <>
            {isMFAEnabled && (
              <Button
                variant="text"
                icon="🔒"
                onClick={() => handleNavigation('MFASettings')}
                ariaLabel="MFA Settings"
                testID="header-mfa-button"
              />
            )}
            <Button
              variant="text"
              icon="👤"
              onClick={() => onCustomAction?.('userMenu')}
              ariaLabel="User menu"
              testID="header-user-menu-button"
              ariaExpanded={false}
              ariaControls="user-menu-dropdown"
            >
              {user?.fullName}
            </Button>
          </>
        )}
        {!isAuthenticated && (
          <Button
            variant="primary"
            onClick={() => handleNavigation('Login')}
            ariaLabel="Login"
            testID="header-login-button"
          >
            Login
          </Button>
        )}
      </HeaderActions>
    </HeaderContainer>
  );
};

export default Header;