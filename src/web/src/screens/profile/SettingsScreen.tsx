import React, { useState, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { debounce } from 'lodash';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useTheme } from '../../hooks/useTheme';
import { useLocalization } from '../../hooks/useLocalization';

// Styled components with accessibility and platform-specific styling
const SettingsContainer = styled.main`
  ${({ theme }) => theme.spacing.container};
  max-width: 600px;
  margin: 0 auto;
  background-color: ${({ theme }) => theme.colors.getColor('background')};
  direction: ${({ dir }) => dir};
  
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const SettingsSectionContainer = styled.section`
  ${({ theme }) => theme.spacing.section};
  background-color: ${({ theme }) => theme.colors.getColor('surface')};
  border-radius: ${({ theme }) => theme.platform === 'ios' ? '12px' : '8px'};
  box-shadow: 0 2px 4px ${({ theme }) => theme.colors.getColor('overlay')};
  margin-bottom: ${({ theme }) => theme.spacing.MEDIUM}px;

  &:focus-within {
    ${({ theme }) => theme.accessibility.focusRing}
  }
`;

const SectionTitle = styled.h2`
  ${({ theme }) => theme.typography.heading2};
  color: ${({ theme }) => theme.colors.getColor('text')};
  margin-bottom: ${({ theme }) => theme.spacing.SMALL}px;
`;

const SectionDescription = styled.p`
  ${({ theme }) => theme.typography.bodyText};
  color: ${({ theme }) => theme.colors.getColor('textSecondary')};
  margin-bottom: ${({ theme }) => theme.spacing.MEDIUM}px;
`;

const SettingRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.SMALL}px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.getColor('divider')};

  &:last-child {
    border-bottom: none;
  }
`;

const SettingLabel = styled.label`
  ${({ theme }) => theme.typography.bodyText};
  color: ${({ theme }) => theme.colors.getColor('text')};
`;

const Select = styled.select`
  ${({ theme }) => theme.typography.bodyText};
  padding: ${({ theme }) => theme.spacing.SMALL}px;
  border-radius: ${({ theme }) => theme.platform === 'ios' ? '8px' : '4px'};
  border: 2px solid ${({ theme }) => theme.colors.getColor('divider')};
  background-color: ${({ theme }) => theme.colors.getColor('surface')};
  color: ${({ theme }) => theme.colors.getColor('text')};
  min-width: 120px;
  ${({ theme }) => theme.accessibility.touchTarget}

  &:focus {
    ${({ theme }) => theme.accessibility.focusRing}
  }
`;

interface SettingsScreenProps {
  className?: string;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ className }) => {
  const { currentTheme, toggleTheme, setSystemTheme } = useTheme();
  const { currentLanguage, setLanguage, translate, isRTL, supportedLanguages } = useLocalization();
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    frequency: 'daily'
  });

  // Debounced notification settings update
  const updateNotifications = useCallback(
    debounce(async (settings) => {
      try {
        // API call would go here
        console.log('Updating notification settings:', settings);
      } catch (error) {
        console.error('Failed to update notification settings:', error);
      }
    }, 500),
    []
  );

  const handleNotificationChange = useCallback((key: string, value: boolean | string) => {
    const newSettings = { ...notifications, [key]: value };
    setNotifications(newSettings);
    updateNotifications(newSettings);
  }, [notifications, updateNotifications]);

  const handleLanguageChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const newLanguage = event.target.value;
    setLanguage(newLanguage as typeof supportedLanguages[number]);
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
  }, [setLanguage, isRTL]);

  const handleThemeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const newTheme = event.target.value;
    if (newTheme === 'system') {
      setSystemTheme(true);
    } else {
      toggleTheme();
    }
  }, [setSystemTheme, toggleTheme]);

  return (
    <SettingsContainer 
      className={className}
      dir={isRTL ? 'rtl' : 'ltr'}
      role="main"
      aria-label={translate('common.navigation.settings')}
    >
      <SettingsSectionContainer>
        <SectionTitle>{translate('settings.appearance.title')}</SectionTitle>
        <SectionDescription>{translate('settings.appearance.description')}</SectionDescription>
        
        <SettingRow>
          <SettingLabel htmlFor="theme">{translate('settings.appearance.theme')}</SettingLabel>
          <Select
            id="theme"
            value={currentTheme}
            onChange={handleThemeChange}
            aria-label={translate('settings.appearance.theme')}
          >
            <option value="light">{translate('settings.appearance.theme_light')}</option>
            <option value="dark">{translate('settings.appearance.theme_dark')}</option>
            <option value="system">{translate('settings.appearance.theme_system')}</option>
          </Select>
        </SettingRow>

        <SettingRow>
          <SettingLabel htmlFor="language">{translate('settings.language.title')}</SettingLabel>
          <Select
            id="language"
            value={currentLanguage}
            onChange={handleLanguageChange}
            aria-label={translate('settings.language.select')}
          >
            {supportedLanguages.map(lang => (
              <option key={lang} value={lang}>
                {translate(`settings.language.${lang}`)}
              </option>
            ))}
          </Select>
        </SettingRow>
      </SettingsSectionContainer>

      <SettingsSectionContainer>
        <SectionTitle>{translate('settings.notifications.title')}</SectionTitle>
        <SectionDescription>{translate('settings.notifications.description')}</SectionDescription>

        <SettingRow>
          <SettingLabel htmlFor="email-notifications">
            {translate('settings.notifications.email')}
          </SettingLabel>
          <input
            type="checkbox"
            id="email-notifications"
            checked={notifications.email}
            onChange={(e) => handleNotificationChange('email', e.target.checked)}
            aria-label={translate('settings.notifications.email')}
          />
        </SettingRow>

        <SettingRow>
          <SettingLabel htmlFor="push-notifications">
            {translate('settings.notifications.push')}
          </SettingLabel>
          <input
            type="checkbox"
            id="push-notifications"
            checked={notifications.push}
            onChange={(e) => handleNotificationChange('push', e.target.checked)}
            aria-label={translate('settings.notifications.push')}
          />
        </SettingRow>

        <SettingRow>
          <SettingLabel htmlFor="notification-frequency">
            {translate('settings.notifications.frequency')}
          </SettingLabel>
          <Select
            id="notification-frequency"
            value={notifications.frequency}
            onChange={(e) => handleNotificationChange('frequency', e.target.value)}
            aria-label={translate('settings.notifications.frequency')}
          >
            <option value="daily">{translate('settings.notifications.frequency_daily')}</option>
            <option value="weekly">{translate('settings.notifications.frequency_weekly')}</option>
            <option value="monthly">{translate('settings.notifications.frequency_monthly')}</option>
          </Select>
        </SettingRow>
      </SettingsSectionContainer>

      <Button
        variant="primary"
        size="large"
        fullWidth
        onClick={() => {/* Save settings */}}
        aria-label={translate('common.actions.save')}
      >
        {translate('common.actions.save')}
      </Button>
    </SettingsContainer>
  );
};

export default SettingsScreen;