import React from 'react';
import styled from 'styled-components';
import { getThemeColor } from '../../styles/colors';

// Elevation shadow mapping based on Material Design 3.0 guidelines
const ELEVATION_MAP = {
  low: {
    umbra: '0px 1px 2px',
    penumbra: '0px 1px 3px',
    ambient: '0px 1px 1px'
  },
  medium: {
    umbra: '0px 2px 4px',
    penumbra: '0px 3px 8px',
    ambient: '0px 1px 2px'
  },
  high: {
    umbra: '0px 4px 8px',
    penumbra: '0px 6px 12px',
    ambient: '0px 2px 3px'
  }
};

interface CardProps {
  children: React.ReactNode;
  onClick?: () => void;
  elevation?: 'low' | 'medium' | 'high';
  className?: string;
  testId?: string;
  ariaLabel?: string;
  role?: string;
}

const getElevationShadow = (elevation: CardProps['elevation'] = 'low'): string => {
  const shadowColor = getThemeColor('secondary', 'light');
  const { umbra, penumbra, ambient } = ELEVATION_MAP[elevation];

  return `
    ${umbra} rgba(0, 0, 0, 0.2),
    ${penumbra} ${shadowColor},
    ${ambient} rgba(0, 0, 0, 0.14)
  `;
};

const getNextElevation = (currentElevation: CardProps['elevation'] = 'low'): CardProps['elevation'] => {
  const elevationLevels: CardProps['elevation'][] = ['low', 'medium', 'high'];
  const currentIndex = elevationLevels.indexOf(currentElevation);
  return currentIndex < elevationLevels.length - 1 ? elevationLevels[currentIndex + 1] : 'high';
};

const StyledCard = styled.div<Pick<CardProps, 'elevation' | 'onClick'>>`
  background-color: ${props => getThemeColor('surface')};
  border-radius: 16px;
  box-shadow: ${props => getElevationShadow(props.elevation)};
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  position: relative;
  width: 100%;
  cursor: ${props => props.onClick ? 'pointer' : 'default'};
  
  // Ensure proper color contrast in both themes
  color: ${props => getThemeColor('text')};
  
  // Interactive states
  &:hover {
    ${props => props.onClick && `
      box-shadow: ${getElevationShadow(getNextElevation(props.elevation))};
      transform: translateY(-2px);
    `}
  }

  &:active {
    ${props => props.onClick && `
      transform: translateY(0);
      transition-duration: 100ms;
    `}
  }

  // Focus state with keyboard navigation
  &:focus-visible {
    outline: 2px solid ${props => getThemeColor('primary')};
    outline-offset: 2px;
  }

  // Ensure proper contrast in dark mode
  @media (prefers-color-scheme: dark) {
    background-color: ${props => getThemeColor('surface', 'dark')};
  }
`;

const Card: React.FC<CardProps> = React.memo(({
  children,
  onClick,
  elevation = 'low',
  className,
  testId = 'card',
  ariaLabel,
  role = onClick ? 'button' : 'article'
}) => {
  return (
    <StyledCard
      onClick={onClick}
      elevation={elevation}
      className={className}
      data-testid={testId}
      aria-label={ariaLabel}
      role={role}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </StyledCard>
  );
});

Card.displayName = 'Card';

export default Card;