import React from 'react';
import styled from 'styled-components';
import { ErrorBoundary } from 'react-error-boundary';
import Card from '../common/Card';
import type { ArtworkMetadata as ArtworkMetadataType } from '../../types/artwork';
import { heading2, bodyText, caption } from '../../styles/typography';

interface ArtworkMetadataProps {
  metadata: ArtworkMetadataType;
  isLoading: boolean;
  error: Error | null;
  className?: string;
  testId?: string;
}

const MetadataContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${props => props.theme.spacing(2)};
  padding: ${props => props.theme.spacing(2)};
  position: relative;

  @media (max-width: ${props => props.theme.breakpoints.sm}) {
    grid-template-columns: 1fr;
  }
`;

const MetadataLabel = styled.span`
  ${caption}
  color: ${props => props.theme.colors.textSecondary};
  text-transform: uppercase;
  font-weight: 500;
  margin-bottom: ${props => props.theme.spacing(0.5)};
`;

const MetadataValue = styled.span`
  ${bodyText}
  color: ${props => props.theme.colors.textPrimary};
  word-break: break-word;
  min-height: 24px;
`;

const MetadataTitle = styled.h2`
  ${heading2}
  grid-column: 1 / -1;
  margin-bottom: ${props => props.theme.spacing(2)};
  color: ${props => props.theme.colors.textPrimary};
  font-weight: 600;
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
`;

const MetadataField = React.memo(({ label, value }: { label: string; value: string | number }) => (
  <div>
    <MetadataLabel>{label}</MetadataLabel>
    <MetadataValue>{value}</MetadataValue>
  </div>
));

MetadataField.displayName = 'MetadataField';

const formatDimensions = (dimensions: ArtworkMetadataType['dimensions']): string => {
  const { width, height, depth, unit } = dimensions;
  const formattedDimensions = `${width} × ${height}${depth ? ` × ${depth}` : ''} ${unit}`;
  return formattedDimensions;
};

const validateMetadata = (metadata: ArtworkMetadataType): boolean => {
  const requiredFields: (keyof ArtworkMetadataType)[] = [
    'title',
    'artist',
    'year',
    'type',
    'period',
    'medium',
    'dimensions'
  ];

  return requiredFields.every(field => metadata[field] !== undefined && metadata[field] !== null);
};

const ErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
  <Card elevation="low">
    <div role="alert">
      <h2>Error displaying artwork metadata</h2>
      <pre style={{ color: 'red' }}>{error.message}</pre>
    </div>
  </Card>
);

const ArtworkMetadata: React.FC<ArtworkMetadataProps> = React.memo(({
  metadata,
  isLoading,
  error,
  className,
  testId = 'artwork-metadata'
}) => {
  if (error) {
    return <ErrorFallback error={error} />;
  }

  if (!validateMetadata(metadata)) {
    return <ErrorFallback error={new Error('Invalid metadata format')} />;
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Card 
        elevation="low"
        className={className}
        testId={testId}
        role="region"
        ariaLabel="Artwork metadata"
      >
        <MetadataContainer>
          <MetadataTitle>{metadata.title}</MetadataTitle>
          
          <MetadataField label="Artist" value={metadata.artist} />
          <MetadataField label="Year" value={metadata.year} />
          <MetadataField label="Type" value={metadata.type} />
          <MetadataField label="Period" value={metadata.period} />
          <MetadataField label="Medium" value={metadata.medium} />
          <MetadataField 
            label="Dimensions" 
            value={formatDimensions(metadata.dimensions)} 
          />
          
          {metadata.style && metadata.style.length > 0 && (
            <MetadataField 
              label="Style" 
              value={metadata.style.join(', ')} 
            />
          )}
          
          {metadata.location && (
            <MetadataField 
              label="Location" 
              value={`${metadata.location.museum || ''} ${metadata.location.city}, ${metadata.location.country}`.trim()} 
            />
          )}
          
          {metadata.description && (
            <div style={{ gridColumn: '1 / -1' }}>
              <MetadataLabel>Description</MetadataLabel>
              <MetadataValue>{metadata.description}</MetadataValue>
            </div>
          )}

          {isLoading && (
            <LoadingOverlay 
              role="progressbar"
              aria-label="Loading metadata"
            >
              Loading...
            </LoadingOverlay>
          )}
        </MetadataContainer>
      </Card>
    </ErrorBoundary>
  );
});

ArtworkMetadata.displayName = 'ArtworkMetadata';

export default ArtworkMetadata;