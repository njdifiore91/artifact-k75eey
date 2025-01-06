import React from 'react';
import styled from 'styled-components';
import { theme } from '../../styles/theme';
import Button from './Button';
import type { APIErrorResponse } from '../../types/api';

interface ErrorProps {
  /** Error message string or API error response object */
  error: string | APIErrorResponse;
  /** Optional retry callback function */
  onRetry?: () => void;
  /** Optional className for styled-components */
  className?: string;
  /** Optional ARIA role override */
  role?: string;
  /** Optional test ID for testing */
  testId?: string;
}

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.medium}px;
  border-radius: ${theme.borderRadius.medium}px;
  background-color: ${props => props.theme.colors.getColor('error', 0.1)};
  color: ${props => props.theme.colors.getColor('error')};
  direction: ${props => props.theme.direction};
  min-height: 120px;
  width: 100%;
  max-width: 600px;
  margin: ${theme.spacing.small}px auto;
  border: 1px solid ${props => props.theme.colors.getColor('error', 0.3)};
  box-shadow: 0 2px 4px ${props => props.theme.colors.getColor('error', 0.1)};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  @media (forced-colors: active) {
    border: 2px solid currentColor;
  }
`;

const ErrorMessage = styled.p`
  margin: ${theme.spacing.small}px 0;
  text-align: center;
  font-size: ${theme.typography.bodyText.fontSize}px;
  font-weight: ${theme.typography.platform.weightMedium};
  color: ${props => props.theme.colors.getColor('error')};
  word-break: break-word;
  line-height: 1.5;
  max-width: 100%;
  padding: 0 ${theme.spacing.small}px;

  @media (max-width: ${theme.breakpoints.sm}px) {
    font-size: ${theme.typography.caption.fontSize}px;
  }
`;

const RetryButton = styled(Button)`
  margin-top: ${theme.spacing.medium}px;
`;

/**
 * Extracts and formats error message from error prop
 * @param error - String or APIErrorResponse error object
 * @returns Formatted error message
 */
const getErrorMessage = (error: string | APIErrorResponse): string => {
  if (typeof error === 'string') {
    return error;
  }

  if (error.code && error.message) {
    const formattedMessage = `${error.message} (${error.code})`;
    if (error.details) {
      return `${formattedMessage}\n${JSON.stringify(error.details)}`;
    }
    return formattedMessage;
  }

  return 'An unexpected error occurred. Please try again.';
};

/**
 * Error component for displaying error messages with retry functionality
 * Features WCAG 2.1 Level AA compliance and platform-specific styling
 */
const Error: React.FC<ErrorProps> = ({
  error,
  onRetry,
  className,
  role = 'alert',
  testId = 'error-message',
}) => {
  const errorMessage = getErrorMessage(error);

  return (
    <ErrorContainer
      className={className}
      role={role}
      data-testid={testId}
      aria-live="polite"
      aria-atomic="true"
    >
      <ErrorMessage>
        {errorMessage}
      </ErrorMessage>
      {onRetry && (
        <RetryButton
          variant="secondary"
          size="medium"
          onClick={onRetry}
          aria-label="Retry action"
          icon={
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M13.666 2.334A7.333 7.333 0 0 0 2.334 13.666"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M2.334 2.334A7.333 7.333 0 0 1 13.666 13.666"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          }
        >
          Try Again
        </RetryButton>
      )}
    </ErrorContainer>
  );
};

export default Error;