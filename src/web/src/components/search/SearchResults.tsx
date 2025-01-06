import React, { useCallback, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useVirtualizer } from 'react-virtual';
import { useInView } from 'react-intersection-observer';
import { ErrorBoundary } from 'react-error-boundary';

import ArtworkCard from '../artwork/ArtworkCard';
import Loading from '../common/Loading';
import Error from '../common/Error';
import { useSearch } from '../../hooks/useSearch';
import type { ArtworkResponse } from '../../types/artwork';
import type { SearchFilters } from '../../services/api/search';

interface SearchResultsProps {
  query: string;
  filters: SearchFilters;
  onArtworkSelect: (artwork: ArtworkResponse) => void;
  className?: string;
  initialPage?: number;
  pageSize?: number;
  retryAttempts?: number;
  loadingStrategy?: 'eager' | 'lazy';
}

const ResultsContainer = styled.div<{ $loading?: boolean }>`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: ${props => props.theme.spacing.medium}px;
  padding: ${props => props.theme.spacing.medium}px;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  direction: ${props => props.theme.direction};
  opacity: ${props => props.$loading ? 0.7 : 1};
  transition: opacity 0.3s ease;

  @media (max-width: ${props => props.theme.breakpoints.sm}px) {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: ${props => props.theme.spacing.small}px;
  }

  @media (max-width: 320px) {
    grid-template-columns: 1fr;
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${props => props.theme.spacing.large}px;
  text-align: center;
  min-height: 200px;
  color: ${props => props.theme.colors.getColor('textSecondary')};
`;

const LoadingContainer = styled.div<{ $visible: boolean }>`
  display: flex;
  justify-content: center;
  padding: ${props => props.theme.spacing.medium}px;
  width: 100%;
  height: 100px;
  opacity: ${props => props.$visible ? 1 : 0};
  transition: opacity 0.3s ease;
`;

const SearchResults: React.FC<SearchResultsProps> = ({
  query,
  filters,
  onArtworkSelect,
  className,
  initialPage = 1,
  pageSize = 20,
  retryAttempts = 3,
  loadingStrategy = 'eager'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadMoreRef, inView] = useInView({
    threshold: 0.1,
    rootMargin: '100px'
  });

  const {
    results,
    loading,
    error,
    setQuery,
    setPage,
    page,
    resetSearch
  } = useSearch<ArtworkResponse>({
    initialQuery: query,
    pageSize,
    searchType: 'artwork',
    onError: (error) => {
      console.error('Search error:', error);
    }
  });

  const rowVirtualizer = useVirtualizer({
    count: results.items.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 300,
    overscan: 5
  });

  useEffect(() => {
    setQuery(query);
  }, [query, setQuery]);

  useEffect(() => {
    if (inView && results.has_next && !loading) {
      setPage(page + 1);
    }
  }, [inView, results.has_next, loading, page, setPage]);

  const handleKeyboardNavigation = useCallback((event: React.KeyboardEvent) => {
    const { key } = event;
    const currentFocus = document.activeElement;
    const cards = containerRef.current?.querySelectorAll('[role="article"]');
    
    if (!cards?.length) return;

    const currentIndex = Array.from(cards).indexOf(currentFocus as Element);
    let nextIndex = currentIndex;

    switch (key) {
      case 'ArrowRight':
        nextIndex = Math.min(currentIndex + 1, cards.length - 1);
        break;
      case 'ArrowLeft':
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case 'ArrowUp':
        nextIndex = Math.max(currentIndex - 3, 0);
        break;
      case 'ArrowDown':
        nextIndex = Math.min(currentIndex + 3, cards.length - 1);
        break;
      default:
        return;
    }

    event.preventDefault();
    (cards[nextIndex] as HTMLElement).focus();
  }, []);

  const renderContent = () => {
    if (loading && loadingStrategy === 'eager') {
      return (
        <LoadingContainer $visible={true}>
          <Loading size="large" label="Loading search results" />
        </LoadingContainer>
      );
    }

    if (error) {
      return (
        <Error 
          error={error}
          onRetry={resetSearch}
          testId="search-error"
        />
      );
    }

    if (!results.items.length && !loading) {
      return (
        <EmptyState role="status" aria-live="polite">
          <p>No results found for "{query}"</p>
          <p>Try adjusting your search terms or filters</p>
        </EmptyState>
      );
    }

    return (
      <>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const artwork = results.items[virtualRow.index];
          return (
            <ArtworkCard
              key={artwork.id}
              artwork={artwork}
              onClick={() => onArtworkSelect(artwork)}
              testId={`artwork-card-${artwork.id}`}
              isLoading={loading && loadingStrategy === 'lazy'}
            />
          );
        })}
        <div ref={loadMoreRef} style={{ height: 20 }} />
      </>
    );
  };

  return (
    <ErrorBoundary
      FallbackComponent={({ error }) => (
        <Error error={error.message} testId="search-error-boundary" />
      )}
    >
      <ResultsContainer
        ref={containerRef}
        className={className}
        $loading={loading}
        role="grid"
        aria-busy={loading}
        aria-live="polite"
        onKeyDown={handleKeyboardNavigation}
        data-testid="search-results"
      >
        {renderContent()}
      </ResultsContainer>
    </ErrorBoundary>
  );
};

export default SearchResults;