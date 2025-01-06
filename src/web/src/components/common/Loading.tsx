import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { rotate } from '../../styles/animations';
import { getThemeColor, withOpacity } from '../../styles/colors';

/**
 * Props interface for the Loading component with comprehensive typing
 */
interface LoadingProps {
  /** Size of the loading indicator - number for custom size or preset */
  size?: number | 'small' | 'medium' | 'large';
  /** Custom color for the spinner */
  color?: string;
  /** Additional CSS classes */
  className?: string;
  /** Test identifier for testing */
  testID?: string;
  /** Optional timeout in milliseconds */
  timeout?: number;
  /** Accessible label for screen readers */
  label?: string;
}

/**
 * Converts size prop to pixel value
 * @param size - Size value as number or preset string
 * @returns CSS size value in pixels
 */
const getSizeValue = (size?: number | 'small' | 'medium' | 'large'): string => {
  if (typeof size === 'number') {
    return `${size}px`;
  }

  switch (size) {
    case 'small':
      return '24px';
    case 'large':
      return '64px';
    case 'medium':
    default:
      return '40px';
  }
};

/**
 * Styled container component with accessibility attributes
 */
const LoadingContainer = styled.div<{ size?: LoadingProps['size'] }>`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: ${props => getSizeValue(props.size)};
  width: ${props => getSizeValue(props.size)};
  position: relative;
  
  /* Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
`;

/**
 * Styled spinner component with optimized animation
 */
const Spinner = styled.div<{ color?: string }>`
  border: 2px solid ${props => withOpacity(props.color || getThemeColor('primary'), 0.2)};
  border-top-color: ${props => props.color || getThemeColor('primary')};
  border-radius: 50%;
  width: 100%;
  height: 100%;
  animation: ${rotate} 1s linear infinite;
  
  /* Performance optimizations */
  will-change: transform;
  transform: translateZ(0);
  backface-visibility: hidden;
  
  /* Reduce animation complexity for users who prefer reduced motion */
  @media (prefers-reduced-motion: reduce) {
    animation: none;
    border: 2px solid ${props => props.color || getThemeColor('primary')};
  }
`;

/**
 * Loading component that displays an animated spinner with accessibility support
 * and performance optimizations.
 */
const Loading: React.FC<LoadingProps> = ({
  size = 'medium',
  color,
  className,
  testID,
  timeout = 0,
  label = 'Loading...'
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        setVisible(false);
      }, timeout);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [timeout]);

  if (!visible) {
    return null;
  }

  return (
    <LoadingContainer
      size={size}
      className={className}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      data-testid={testID || 'loading-spinner'}
    >
      <Spinner color={color} />
    </LoadingContainer>
  );
};

export default Loading;