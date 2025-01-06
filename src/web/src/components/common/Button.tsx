import React from 'react';
import styled, { css } from 'styled-components';
import { theme } from '../../styles/theme';
import { getThemeColor, withOpacity } from '../../styles/colors';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'text';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'start' | 'end';
  children?: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  ariaLabel?: string;
  ariaExpanded?: boolean;
  ariaControls?: string;
  ariaDescribedBy?: string;
}

const getButtonStyles = (
  variant: ButtonProps['variant'] = 'primary',
  size: ButtonProps['size'] = 'medium',
  disabled: boolean = false,
  platform: 'ios' | 'android' = 'ios'
) => {
  const sizeMap = {
    small: {
      padding: '8px 16px',
      fontSize: theme.typography.platform.ios.fontFamily === "'SF Pro Display', -apple-system, BlinkMacSystemFont" ? '14px' : '16px',
      height: '32px',
    },
    medium: {
      padding: '12px 24px',
      fontSize: theme.typography.platform.ios.fontFamily === "'SF Pro Display', -apple-system, BlinkMacSystemFont" ? '16px' : '18px',
      height: '44px',
    },
    large: {
      padding: '16px 32px',
      fontSize: theme.typography.platform.ios.fontFamily === "'SF Pro Display', -apple-system, BlinkMacSystemFont" ? '18px' : '20px',
      height: '56px',
    },
  };

  const variantStyles = {
    primary: css`
      background-color: ${getThemeColor('primary')};
      color: ${getThemeColor('text')};
      border: none;
      ${platform === 'ios' 
        ? css`box-shadow: 0 1px 3px ${withOpacity(getThemeColor('primary'), 0.3)};`
        : css`elevation: 2;`}
    `,
    secondary: css`
      background-color: transparent;
      color: ${getThemeColor('primary')};
      border: 2px solid ${getThemeColor('primary')};
    `,
    text: css`
      background-color: transparent;
      color: ${getThemeColor('primary')};
      border: none;
      padding-left: 8px;
      padding-right: 8px;
    `,
  };

  return css`
    ${variantStyles[variant]}
    ${sizeMap[size]}
    opacity: ${disabled ? 0.5 : 1};
    cursor: ${disabled ? 'not-allowed' : 'pointer'};
    transition: all 200ms ${theme.transitions.timing};
    border-radius: ${platform === 'ios' ? '8px' : '4px'};
    font-family: ${theme.typography.platform.fontFamily};
    font-weight: ${theme.typography.platform.weightMedium};
    
    &:hover:not(:disabled) {
      ${variant === 'primary' && css`
        background-color: ${getThemeColor('primary', 'dark')};
      `}
      ${variant === 'secondary' && css`
        background-color: ${withOpacity(getThemeColor('primary'), 0.1)};
      `}
      ${variant === 'text' && css`
        background-color: ${withOpacity(getThemeColor('primary'), 0.05)};
      `}
    }

    &:active:not(:disabled) {
      transform: scale(0.98);
    }

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px ${withOpacity(getThemeColor('primary'), 0.4)};
    }
  `;
};

const StyledButton = styled.button<ButtonProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin: 0;
  min-width: 44px;
  text-decoration: none;
  text-align: center;
  white-space: nowrap;
  vertical-align: middle;
  touch-action: manipulation;
  user-select: none;
  width: ${props => props.fullWidth ? '100%' : 'auto'};
  
  ${props => getButtonStyles(props.variant, props.size, props.disabled)}

  ${props => props.loading && css`
    color: transparent;
    pointer-events: none;
  `}
`;

const ButtonContent = styled.span<{ loading?: boolean; iconPosition?: 'start' | 'end' }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  opacity: ${props => props.loading ? 0 : 1};
  flex-direction: ${props => props.iconPosition === 'end' ? 'row-reverse' : 'row'};
`;

const LoadingSpinner = styled.span<{ variant?: 'primary' | 'secondary' | 'text' }>`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
  border: 2px solid ${props => props.variant === 'primary' ? getThemeColor('text') : getThemeColor('primary')};
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to { transform: translate(-50%, -50%) rotate(360deg); }
  }
`;

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  iconPosition = 'start',
  children,
  onClick,
  className,
  ariaLabel,
  ariaExpanded,
  ariaControls,
  ariaDescribedBy,
  ...props
}) => {
  return (
    <StyledButton
      variant={variant}
      size={size}
      disabled={disabled || loading}
      loading={loading}
      fullWidth={fullWidth}
      onClick={onClick}
      className={className}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      aria-describedby={ariaDescribedBy}
      aria-busy={loading}
      {...props}
    >
      <ButtonContent loading={loading} iconPosition={iconPosition}>
        {icon && icon}
        {children}
      </ButtonContent>
      {loading && <LoadingSpinner variant={variant} />}
    </StyledButton>
  );
};

export default Button;