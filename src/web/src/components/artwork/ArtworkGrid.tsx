import React, { useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useIntersectionObserver } from 'react-intersection-observer';
import ArtworkCard from './ArtworkCard';
import Loading from '../common/Loading';
import type { ArtworkResponse } from '../../types/artwork';
import { fadeIn } from '../../styles/animations';

interface ArtworkGridProps {
  artworks: ArtworkResponse[];
  loading: boolean;
  onArtworkClick: (artwork: ArtworkResponse) => void;
  className?: string;
  testId?: string;
  virtualizationEnabled?: boolean;
  itemHeight?: number;
  onLoadMore?: () => void;
}

const GridContainer = styled.div<{ $loading?: boolean }>`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
  width: 100%;
  padding: 16px;
  position: relative;
  animation: ${fadeIn} 0.3s ease-out;
  
  @media (max-width: 600px) {
    gap: 16px;
    padding: 12px;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  }
  
  @media (max-width: 320px) {
    grid-template-columns: 1fr;
  }
  
  /* Ensure proper color contrast in both themes */
  background-color: ${props => props.theme.colors.background};
  
  /* Accessibility */
  role: grid;
  aria-busy: ${props => props.$loading ? 'true' : 'false'};
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  min-height: 200px;
  grid-column: 1 / -1;
  
  /* Accessibility */
  role: status;
  aria-live: polite;
`;

const EmptyStateContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 200px;
  text-align: center;
  color: ${props => props.theme.colors.textSecondary};
  padding: 24px;
  grid-column: 1 / -1;
  
  /* Accessibility */
  role: alert;
  aria-live: polite;
`;

const VirtualizedContainer = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
  overflow-y: auto;
`;

const ArtworkGrid: React.FC<ArtworkGridProps> = React.memo(({
  artworks,
  loading,
  onArtworkClick,
  className,
  testId = 'artwork-grid',
  virtualizationEnabled = false,
  itemHeight = 320,
  onLoadMore
}) => {
  // Intersection observer for infinite loading
  const { ref: loadMoreRef, inView } = useIntersectionObserver({
    threshold: 0.1,
    onChange: (inView) => {
      if (inView && onLoadMore && !loading) {
        onLoadMore();
      }
    },
  });

  // Virtualization setup
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: artworks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan: 5,
    enabled: virtualizationEnabled
  });

  // Memoized artwork click handler
  const handleArtworkClick = useCallback((artwork: ArtworkResponse) => {
    onArtworkClick(artwork);
  }, [onArtworkClick]);

  // Render virtualized artwork cards
  const renderVirtualizedArtworks = useMemo(() => {
    if (!virtualizationEnabled) return null;

    return virtualizer.getVirtualItems().map((virtualItem) => {
      const artwork = artworks[virtualItem.index];
      return (
        <div
          key={artwork.id}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: `${virtualItem.size}px`,
            transform: `translateY(${virtualItem.start}px)`,
          }}
        >
          <ArtworkCard
            artwork={artwork}
            onClick={() => handleArtworkClick(artwork)}
            testId={`artwork-card-${artwork.id}`}
          />
        </div>
      );
    });
  }, [artworks, virtualizer, handleArtworkClick, virtualizationEnabled]);

  // Render regular grid of artwork cards
  const renderArtworks = useMemo(() => {
    if (virtualizationEnabled) return null;

    return artworks.map((artwork) => (
      <ArtworkCard
        key={artwork.id}
        artwork={artwork}
        onClick={() => handleArtworkClick(artwork)}
        testId={`artwork-card-${artwork.id}`}
      />
    ));
  }, [artworks, handleArtworkClick, virtualizationEnabled]);

  // Render empty state
  const renderEmptyState = useMemo(() => {
    if (loading || artworks.length > 0) return null;

    return (
      <EmptyStateContainer>
        <h2>No artworks found</h2>
        <p>Try adjusting your search criteria or upload new artwork</p>
      </EmptyStateContainer>
    );
  }, [loading, artworks.length]);

  return (
    <GridContainer
      className={className}
      data-testid={testId}
      $loading={loading}
      role="grid"
      aria-label="Artwork grid"
    >
      {virtualizationEnabled ? (
        <VirtualizedContainer ref={parentRef}>
          {renderVirtualizedArtworks}
        </VirtualizedContainer>
      ) : (
        renderArtworks
      )}
      
      {renderEmptyState}
      
      {loading && (
        <LoadingContainer>
          <Loading
            size="large"
            label="Loading artworks..."
            testID="artwork-grid-loading"
          />
        </LoadingContainer>
      )}
      
      {!loading && onLoadMore && (
        <div ref={loadMoreRef} style={{ height: '20px', gridColumn: '1 / -1' }} />
      )}
    </GridContainer>
  );
});

ArtworkGrid.displayName = 'ArtworkGrid';

export default ArtworkGrid;