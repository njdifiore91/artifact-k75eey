import React from 'react';
import { render, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { ThemeProvider } from 'styled-components';
import '@testing-library/jest-dom';

import Button from '../../../components/common/Button';
import { theme, darkTheme, highContrastTheme } from '../../../styles/theme';

// Helper function to render components with theme context
const renderWithTheme = (ui: React.ReactElement, customTheme = theme) => {
  return render(
    <ThemeProvider theme={customTheme}>
      {ui}
    </ThemeProvider>
  );
};

describe('Button Component', () => {
  // Mock click handler
  const mockOnClick = jest.fn();

  beforeEach(() => {
    mockOnClick.mockClear();
  });

  describe('Rendering', () => {
    it('renders primary variant correctly', () => {
      renderWithTheme(
        <Button variant="primary">Primary Button</Button>
      );
      const button = screen.getByRole('button', { name: /primary button/i });
      expect(button).toHaveStyle({
        backgroundColor: theme.colors.getColor('primary'),
        color: theme.colors.getColor('text')
      });
    });

    it('renders secondary variant correctly', () => {
      renderWithTheme(
        <Button variant="secondary">Secondary Button</Button>
      );
      const button = screen.getByRole('button', { name: /secondary button/i });
      expect(button).toHaveStyle({
        backgroundColor: 'transparent',
        color: theme.colors.getColor('primary'),
        border: `2px solid ${theme.colors.getColor('primary')}`
      });
    });

    it('renders text variant correctly', () => {
      renderWithTheme(
        <Button variant="text">Text Button</Button>
      );
      const button = screen.getByRole('button', { name: /text button/i });
      expect(button).toHaveStyle({
        backgroundColor: 'transparent',
        color: theme.colors.getColor('primary'),
        border: 'none'
      });
    });

    it('renders different sizes correctly', () => {
      const { rerender } = renderWithTheme(
        <Button size="small">Small Button</Button>
      );
      let button = screen.getByRole('button');
      expect(button).toHaveStyle({ height: '32px' });

      rerender(
        <ThemeProvider theme={theme}>
          <Button size="large">Large Button</Button>
        </ThemeProvider>
      );
      button = screen.getByRole('button');
      expect(button).toHaveStyle({ height: '56px' });
    });

    it('renders with icon correctly', () => {
      const icon = <span data-testid="test-icon">★</span>;
      renderWithTheme(
        <Button icon={icon}>Icon Button</Button>
      );
      expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    });

    it('renders in full width mode', () => {
      renderWithTheme(
        <Button fullWidth>Full Width Button</Button>
      );
      expect(screen.getByRole('button')).toHaveStyle({ width: '100%' });
    });

    it('renders loading state correctly', () => {
      renderWithTheme(
        <Button loading>Loading Button</Button>
      );
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByRole('button')).toContainElement(
        document.querySelector('[class*="LoadingSpinner"]')
      );
    });
  });

  describe('Interactions', () => {
    it('handles click events', async () => {
      const user = userEvent.setup();
      renderWithTheme(
        <Button onClick={mockOnClick}>Click Me</Button>
      );
      await user.click(screen.getByRole('button'));
      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('prevents interaction when disabled', async () => {
      const user = userEvent.setup();
      renderWithTheme(
        <Button disabled onClick={mockOnClick}>Disabled Button</Button>
      );
      await user.click(screen.getByRole('button'));
      expect(mockOnClick).not.toHaveBeenCalled();
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('prevents interaction when loading', async () => {
      const user = userEvent.setup();
      renderWithTheme(
        <Button loading onClick={mockOnClick}>Loading Button</Button>
      );
      await user.click(screen.getByRole('button'));
      expect(mockOnClick).not.toHaveBeenCalled();
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      renderWithTheme(
        <Button onClick={mockOnClick}>Keyboard Button</Button>
      );
      const button = screen.getByRole('button');
      button.focus();
      expect(button).toHaveFocus();
      await user.keyboard('[Space]');
      expect(mockOnClick).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('supports ARIA attributes', () => {
      renderWithTheme(
        <Button 
          ariaLabel="Custom Label"
          ariaExpanded={true}
          ariaControls="menu-1"
          ariaDescribedBy="desc-1"
        >
          ARIA Button
        </Button>
      );
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Custom Label');
      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(button).toHaveAttribute('aria-controls', 'menu-1');
      expect(button).toHaveAttribute('aria-describedby', 'desc-1');
    });

    it('maintains minimum touch target size', () => {
      renderWithTheme(
        <Button size="small">Small Button</Button>
      );
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({ minWidth: '44px' });
    });

    it('provides loading state announcement', () => {
      renderWithTheme(
        <Button loading>Loading Button</Button>
      );
      expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('Theming', () => {
    it('adapts to dark theme', () => {
      renderWithTheme(
        <Button variant="primary">Dark Theme Button</Button>,
        darkTheme
      );
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({
        backgroundColor: darkTheme.colors.getColor('primary'),
        color: darkTheme.colors.getColor('text')
      });
    });

    it('supports high contrast theme', () => {
      renderWithTheme(
        <Button variant="primary">High Contrast Button</Button>,
        highContrastTheme
      );
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({
        backgroundColor: highContrastTheme.colors.getColor('primary'),
        color: highContrastTheme.colors.getColor('text')
      });
    });

    it('handles theme transitions', () => {
      const { rerender } = renderWithTheme(
        <Button>Theme Transition Button</Button>
      );
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({
        transition: expect.stringContaining('200ms')
      });

      rerender(
        <ThemeProvider theme={highContrastTheme}>
          <Button>Theme Transition Button</Button>
        </ThemeProvider>
      );
      expect(button).toHaveStyle({
        transition: expect.stringContaining('0ms')
      });
    });
  });

  describe('Platform Adaptations', () => {
    it('uses correct font family based on platform', () => {
      renderWithTheme(
        <Button>Platform Button</Button>
      );
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({
        fontFamily: theme.typography.platform.fontFamily
      });
    });

    it('applies platform-specific border radius', () => {
      renderWithTheme(
        <Button>Platform Button</Button>
      );
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({
        borderRadius: '8px' // iOS default
      });
    });
  });
});