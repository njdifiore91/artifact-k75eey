import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import Card from '../common/Card';
import ArtworkMetadata from './ArtworkMetadata';
import type { ArtworkResponse } from '../../types/artwork';
import { getThemeColor } from '../../styles/colors';
import { caption } from '../../styles/typography';

interface ArtworkCardProps {
  artwork: ArtworkResponse;
  onClick?: () => void;
  className?: string;
  testId?: string;
  isLoading?: boolean;
  isFocused?: boolean;
}

const StyledArtworkCard = styled(motion.div)<{ isFocused?: boolean }>`
  width: 100%;
  max-width: 360px;
  border-radius: ${props => props.theme.shape.borderRadius.large};
  overflow: hidden;
  background: ${props => getThemeColor('surface')};
  position: relative;
  cursor: pointer;
  
  &:hover {
    transform: translateY(-4px);
  }

  &:focus-visible {
    outline: 2px solid ${props => getThemeColor('primary')};
    outline-offset: 2px;
  }

  ${props => props.isFocused && `
    outline: 2px solid ${getThemeColor('primary')};
    outline-offset: 2px;
  `}

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    transform: none;
  }
`;

const ThumbnailContainer = styled.div`
  position: relative;
  width: 100%;
  padding-top: 100%; /* 1:1 Aspect ratio */
  background: ${props => getThemeColor('surface')};
  overflow: hidden;
`;

const ThumbnailImage = styled(motion.img)<{ $isLoading?: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: ${props => getThemeColor('surface')};
  
  ${props => props.$isLoading && `
    filter: blur(10px);
    transform: scale(1.1);
  `}
`;

const CardContent = styled.div`
  padding: ${props => props.theme.spacing(2)};
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing(1)};
  background: ${props => getThemeColor('surface')};
`;

const Title = styled.h3`
  ${caption}
  color: ${props => getThemeColor('text')};
  font-weight: 500;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Artist = styled.span`
  ${caption}
  color: ${props => getThemeColor('textSecondary')};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const LoadingOverlay = styled(motion.div)`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: ${props => getThemeColor('surface')};
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ArtworkCard: React.FC<ArtworkCardProps> = React.memo(({
  artwork,
  onClick,
  className,
  testId = 'artwork-card',
  isLoading = false,
  isFocused = false,
}) => {
  const [imageError, setImageError] = React.useState(false);
  const fallbackImage = '/assets/artwork-placeholder.jpg';

  const handleImageError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    event.preventDefault();
    setImageError(true);
    console.error('Error loading artwork image:', artwork.id);
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick?.();
    }
  };

  return (
    <StyledArtworkCard
      className={className}
      data-testid={testId}
      onClick={onClick}
      onKeyPress={handleKeyPress}
      tabIndex={0}
      role="button"
      aria-label={`View details for ${artwork.metadata.title} by ${artwork.metadata.artist}`}
      isFocused={isFocused}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300 }}
    >
      <Card elevation="low">
        <ThumbnailContainer>
          <ThumbnailImage
            src={imageError ? fallbackImage : artwork.thumbnail_url}
            alt={artwork.metadata.title}
            onError={handleImageError}
            $isLoading={isLoading}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            loading="lazy"
          />
        </ThumbnailContainer>
        <CardContent>
          <Title>{artwork.metadata.title}</Title>
          <Artist>{artwork.metadata.artist}</Artist>
        </CardContent>
        
        {isLoading && (
          <LoadingOverlay
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="progressbar"
            aria-label="Loading artwork"
          />
        )}
      </Card>
    </StyledArtworkCard>
  );
});

ArtworkCard.displayName = 'ArtworkCard';

export default ArtworkCard;