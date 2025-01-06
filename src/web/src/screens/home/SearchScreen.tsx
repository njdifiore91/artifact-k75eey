import React, { useState, useCallback, useRef, useEffect } from 'react';
import styled from 'styled-components'; // v5.3.0
import { useVirtualizer } from 'react-virtual'; // v2.10.4
import { useDebounce } from 'use-debounce'; // v8.0.0
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.0

import SearchBar from '../../components/search/SearchBar';
import SearchFilters from '../../components/search/SearchFilters';
import Button from '../../components/common/Button';
import { useSearch } from '../../hooks/useSearch';
import { ArtworkResponse } from '../../types/artwork';

// Default filter state
const DEFAULT_FILTERS = {
  yearRange: [1800, 2023],
  artMovements: [],
  relationships: [],
  loading: false,
  error: null
};

// Breakpoints for responsive design
const BREAKPOINTS = {
  mobile: '320px',
  tablet: '768px',
  desktop: '1024px'
};

// Styled Components
const ResponsiveContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;

  @media (min-width: ${BREAKPOINTS.tablet}) {
    padding: ${({ theme }) => theme.spacing.LARGE}px;
  }
`;

const StickyHeader = styled.header`
  position: sticky;
  top: 0;
  z-index: 10;
  background: ${({ theme }) => theme.colors.getColor('background')};
  backdrop-filter: blur(8px);
  padding: ${({ theme }) => theme.spacing.MEDIUM}px 0;
`;

const ContentLayout = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  
  @media (min-width: ${BREAKPOINTS.tablet}) {
    grid-template-columns: 300px 1fr;
  }
`;

const ResultsContainer = styled.div`
  min-height: 200px;
  position: relative;
`;

const VirtualList = styled.div`
  height: 100%;
  width: 100%;
`;

const ResultCard = styled.article<{ selected?: boolean }>`
  padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  background: ${({ theme }) => theme.colors.getColor('surface')};
  border-radius: 8px;
  box-shadow: 0 2px 4px ${({ theme }) => theme.colors.getColor('divider', 0.1)};
  cursor: pointer;
  
  ${({ selected, theme }) => selected && `
    border: 2px solid ${theme.colors.getColor('primary')};
  `}

  &:hover {
    transform: translateY(-2px);
    transition: transform 200ms ${({ theme }) => theme.transitions.timing};
  }
`;

const NoResults = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  color: ${({ theme }) => theme.colors.getColor('textSecondary')};
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: ${({ theme }) => theme.colors.getColor('background', 0.8)};
  display: flex;
  align-items: center;
  justify-content: center;
`;

interface SearchScreenProps {
  onArtworkSelect?: (artwork: ArtworkResponse) => void;
  initialQuery?: string;
  className?: string;
}

export const SearchScreen: React.FC<SearchScreenProps> = React.memo(({
  onArtworkSelect,
  initialQuery = '',
  className
}) => {
  // State management
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedArtwork, setSelectedArtwork] = useState<string | null>(null);
  const [debouncedQuery] = useDebounce(searchQuery, 300);

  // Refs
  const parentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Custom hooks
  const {
    results,
    loading,
    error,
    setQuery,
    page,
    setPage
  } = useSearch<ArtworkResponse>({
    initialQuery: debouncedQuery,
    searchType: 'artwork',
    onError: (err) => console.error('Search error:', err)
  });

  // Virtual list setup
  const rowVirtualizer = useVirtualizer({
    count: results.items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 100,
    overscan: 5
  });

  // Handlers
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setQuery(query);
    setPage(1);
  }, [setQuery, setPage]);

  const handleFilterChange = useCallback((newFilters: typeof DEFAULT_FILTERS) => {
    setFilters(newFilters);
    setPage(1);
  }, [setPage]);

  const handleArtworkClick = useCallback((artwork: ArtworkResponse) => {
    setSelectedArtwork(artwork.id);
    onArtworkSelect?.(artwork);
  }, [onArtworkSelect]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      if (scrollHeight - scrollTop <= clientHeight * 1.5 && !loading && results.has_next) {
        setPage(prev => prev + 1);
      }
    }
  }, [loading, results.has_next, setPage]);

  // Effects
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement) {
      scrollElement.addEventListener('scroll', handleScroll);
      return () => scrollElement.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Error fallback component
  const ErrorFallback = ({ error }: { error: Error }) => (
    <div role="alert">
      <h3>Error:</h3>
      <pre>{error.message}</pre>
      <Button onClick={() => window.location.reload()}>
        Retry
      </Button>
    </div>
  );

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <ResponsiveContainer className={className}>
        <StickyHeader>
          <SearchBar
            onSearch={handleSearch}
            placeholder="Search artwork or artists..."
            initialValue={initialQuery}
          />
        </StickyHeader>

        <ContentLayout>
          <SearchFilters
            onFilterChange={handleFilterChange}
            initialFilters={filters}
          />

          <ResultsContainer>
            <div ref={parentRef} style={{ height: '800px', overflow: 'auto' }}>
              <VirtualList
                ref={scrollRef}
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative'
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const artwork = results.items[virtualRow.index];
                  return (
                    <ResultCard
                      key={artwork.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`
                      }}
                      selected={artwork.id === selectedArtwork}
                      onClick={() => handleArtworkClick(artwork)}
                    >
                      <h3>{artwork.metadata.title}</h3>
                      <p>{artwork.metadata.artist}</p>
                      <p>{artwork.metadata.year}</p>
                    </ResultCard>
                  );
                })}
              </VirtualList>
            </div>

            {!loading && results.items.length === 0 && (
              <NoResults>
                No results found for "{searchQuery}"
              </NoResults>
            )}

            {loading && (
              <LoadingOverlay>
                Loading...
              </LoadingOverlay>
            )}

            {error && (
              <div role="alert">
                Error: {error}
              </div>
            )}
          </ResultsContainer>
        </ContentLayout>
      </ResponsiveContainer>
    </ErrorBoundary>
  );
});

SearchScreen.displayName = 'SearchScreen';

export default SearchScreen;