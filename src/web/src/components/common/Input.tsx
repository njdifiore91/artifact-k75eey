import React, { forwardRef, useState, useCallback } from 'react';
import styled, { css } from 'styled-components';
import { getThemeColor, withOpacity } from '../../styles/colors';

// Input types supported by the component
type InputType = 'text' | 'email' | 'password' | 'search' | 'number' | 'tel' | 'url';
type InputModeType = 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';

// Comprehensive props interface
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  type?: InputType;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  placeholder?: string;
  error?: boolean;
  errorMessage?: string;
  disabled?: boolean;
  label?: string;
  name: string;
  required?: boolean;
  className?: string;
  ariaLabel?: string;
  pattern?: RegExp;
  maxLength?: number;
  minLength?: number;
  autoComplete?: string;
  inputMode?: InputModeType;
}

// Container component with proper spacing and positioning
const StyledInputContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  position: relative;
  ${({ theme }) => theme.spacing.margin('small', 'bottom')}
  ${({ theme }) => theme.accessibility.touchTarget}
`;

// Label component with accessibility features
const StyledLabel = styled.label<{ error?: boolean; disabled?: boolean; required?: boolean }>`
  ${({ theme }) => theme.typography.bodyText}
  color: ${({ theme, error, disabled }) => {
    if (disabled) return withOpacity(getThemeColor('textSecondary', theme.colors.mode), 0.5);
    if (error) return getThemeColor('error', theme.colors.mode);
    return getThemeColor('textSecondary', theme.colors.mode);
  }};
  margin-bottom: ${({ theme }) => theme.spacing.EXTRA_SMALL}px;
  pointer-events: ${({ disabled }) => disabled ? 'none' : 'auto'};
  
  ${({ required }) => required && css`
    &::after {
      content: '*';
      color: ${({ theme }) => getThemeColor('error', theme.colors.mode)};
      margin-left: ${({ theme }) => theme.spacing.EXTRA_SMALL}px;
    }
  `}
`;

// Input element with platform-specific styling
const StyledInput = styled.input<{
  error?: boolean;
  disabled?: boolean;
  type?: InputType;
  platform?: 'ios' | 'android';
}>`
  ${({ theme }) => theme.typography.bodyText}
  width: 100%;
  padding: ${({ theme }) => theme.spacing.SMALL}px ${({ theme }) => theme.spacing.MEDIUM}px;
  border-radius: ${({ platform }) => platform === 'ios' ? '8px' : '4px'};
  border: 2px solid ${({ theme, error }) => 
    error ? getThemeColor('error', theme.colors.mode) : 
    getThemeColor('divider', theme.colors.mode)
  };
  background-color: ${({ theme }) => getThemeColor('surface', theme.colors.mode)};
  color: ${({ theme }) => getThemeColor('text', theme.colors.mode)};
  
  &::placeholder {
    color: ${({ theme }) => withOpacity(getThemeColor('textSecondary', theme.colors.mode), 0.5)};
  }
  
  &:focus {
    outline: none;
    ${({ theme }) => theme.accessibility.focusRing}
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: ${({ theme }) => withOpacity(getThemeColor('surface', theme.colors.mode), 0.5)};
  }
  
  ${({ theme }) => theme.transitions.create(['border-color', 'background-color', 'color'])}
  
  @media (hover: hover) {
    &:hover:not(:disabled) {
      border-color: ${({ theme }) => getThemeColor('primary', theme.colors.mode)};
    }
  }
  
  // Platform-specific appearance
  -webkit-appearance: none;
  appearance: none;
  
  // Enhanced touch target for mobile
  @media (pointer: coarse) {
    min-height: 44px;
  }
`;

// Error message with proper styling and animation
const StyledError = styled.span`
  ${({ theme }) => theme.typography.caption}
  color: ${({ theme }) => getThemeColor('error', theme.colors.mode)};
  position: absolute;
  bottom: -${({ theme }) => theme.spacing.MEDIUM}px;
  left: 0;
  
  @media screen and (prefers-reduced-motion: no-preference) {
    animation: fadeIn 200ms ease-in;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

// Input component implementation
export const Input = forwardRef<HTMLInputElement, InputProps>(({
  type = 'text',
  value,
  onChange,
  onBlur,
  placeholder,
  error = false,
  errorMessage,
  disabled = false,
  label,
  name,
  required = false,
  className,
  ariaLabel,
  pattern,
  maxLength,
  minLength,
  autoComplete,
  inputMode,
  ...props
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const platform = window.navigator.platform.toLowerCase().includes('iphone') ? 'ios' : 'android';
  
  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);
  
  const handleBlur = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    onBlur?.(event);
  }, [onBlur]);

  return (
    <StyledInputContainer className={className}>
      {label && (
        <StyledLabel
          htmlFor={name}
          error={error}
          disabled={disabled}
          required={required}
        >
          {label}
        </StyledLabel>
      )}
      <StyledInput
        ref={ref}
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel || label}
        aria-invalid={error}
        aria-required={required}
        aria-describedby={error ? `${name}-error` : undefined}
        maxLength={maxLength}
        minLength={minLength}
        autoComplete={autoComplete}
        inputMode={inputMode}
        pattern={pattern?.source}
        error={error}
        platform={platform}
        {...props}
      />
      {error && errorMessage && (
        <StyledError
          id={`${name}-error`}
          role="alert"
        >
          {errorMessage}
        </StyledError>
      )}
    </StyledInputContainer>
  );
});

Input.displayName = 'Input';

export default Input;