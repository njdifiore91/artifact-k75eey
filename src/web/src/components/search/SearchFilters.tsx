import React, { useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { Slider } from '@mui/material';
import { ErrorBoundary } from 'react-error-boundary';
import { useDebounce } from 'use-debounce';

import Input from '../common/Input';
import { useSearch } from '../../hooks/useSearch';
import { ArtworkPeriod, ArtworkType } from '../../types/artwork';

// Constants
const MIN_YEAR = 1800;
const MAX_YEAR = 2023;
const DEFAULT_YEAR_RANGE: [number, number] = [MIN_YEAR, MAX_YEAR];
const DEBOUNCE_DELAY = 300;
const MAX_MOVEMENT_OPTIONS = 100;

// Interfaces
interface SearchFiltersProps {
  onFilterChange: (filters: FilterState) => void;
  initialFilters: FilterState;
  className?: string;
  'aria-label'?: string;
  id?: string;
}

interface FilterState {
  yearRange: [number, number];
  artMovements: string[];
  relationships: string[];
  loading?: boolean;
  error?: Error | null;
}

// Styled Components
const FilterContainer = styled.div`
  ${({ theme }) => theme.spacing.padding('medium', 'all')}
  background-color: ${({ theme }) => theme.colors.getColor('surface')};
  border-radius: 8px;
  box-shadow: 0 2px 4px ${({ theme }) => theme.colors.getColor('divider', 0.1)};

  @media (prefers-reduced-motion: no-preference) {
    transition: ${({ theme }) => theme.transitions.create(['background-color', 'box-shadow'])};
  }

  &:focus-within {
    ${({ theme }) => theme.accessibility.focusRing}
  }
`;

const FilterSection = styled.section`
  ${({ theme }) => theme.spacing.margin('medium', 'bottom')}

  &:last-child {
    margin-bottom: 0;
  }
`;

const FilterLabel = styled.label`
  ${({ theme }) => theme.typography.bodyText}
  color: ${({ theme }) => theme.colors.getColor('text')};
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing.SMALL}px;
`;

const CheckboxGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.SMALL}px;
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.SMALL}px;
  cursor: pointer;
  ${({ theme }) => theme.typography.bodyText}
  color: ${({ theme }) => theme.colors.getColor('text')};

  input[type="checkbox"] {
    width: 20px;
    height: 20px;
    cursor: pointer;
  }
`;

// Error Fallback Component
const ErrorFallback = styled.div`
  color: ${({ theme }) => theme.colors.getColor('error')};
  ${({ theme }) => theme.typography.caption}
  ${({ theme }) => theme.spacing.padding('small', 'all')}
`;

// Custom hook for filter state management
const useFilterState = (
  initialFilters: FilterState,
  onFilterChange: (filters: FilterState) => void
) => {
  const [filters, setFilters] = React.useState<FilterState>(initialFilters);
  const [debouncedFilters] = useDebounce(filters, DEBOUNCE_DELAY);

  React.useEffect(() => {
    onFilterChange(debouncedFilters);
  }, [debouncedFilters, onFilterChange]);

  return { filters, setFilters };
};

// Main Component
export const SearchFilters: React.FC<SearchFiltersProps> = ({
  onFilterChange,
  initialFilters,
  className,
  'aria-label': ariaLabel,
  id
}) => {
  const { filters, setFilters } = useFilterState(initialFilters, onFilterChange);
  const { loading, error } = useSearch({ searchType: 'artwork' });

  // Memoized handlers
  const handleYearRangeChange = useCallback(
    (_event: Event, newValue: number | number[]) => {
      setFilters(prev => ({
        ...prev,
        yearRange: newValue as [number, number]
      }));
    },
    [setFilters]
  );

  const handleMovementChange = useCallback(
    (movement: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setFilters(prev => ({
        ...prev,
        artMovements: event.target.checked
          ? [...prev.artMovements, movement]
          : prev.artMovements.filter(m => m !== movement)
      }));
    },
    [setFilters]
  );

  const handleRelationshipChange = useCallback(
    (relationship: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setFilters(prev => ({
        ...prev,
        relationships: event.target.checked
          ? [...prev.relationships, relationship]
          : prev.relationships.filter(r => r !== relationship)
      }));
    },
    [setFilters]
  );

  // Memoized values
  const artMovementOptions = useMemo(() => Object.values(ArtworkPeriod), []);
  const relationshipOptions = useMemo(() => ['Artist', 'Movement', 'Influence'], []);

  return (
    <ErrorBoundary
      FallbackComponent={({ error }) => (
        <ErrorFallback role="alert">
          Error loading filters: {error.message}
        </ErrorFallback>
      )}
    >
      <FilterContainer
        className={className}
        id={id}
        aria-label={ariaLabel || 'Search filters'}
        role="region"
      >
        <FilterSection>
          <FilterLabel id="year-range-label">Time Period</FilterLabel>
          <Slider
            value={filters.yearRange}
            onChange={handleYearRangeChange}
            valueLabelDisplay="auto"
            min={MIN_YEAR}
            max={MAX_YEAR}
            aria-labelledby="year-range-label"
            disabled={loading}
            sx={{
              '& .MuiSlider-thumb': {
                width: 20,
                height: 20,
              },
            }}
          />
        </FilterSection>

        <FilterSection>
          <FilterLabel id="art-movements-label">Art Movements</FilterLabel>
          <CheckboxGroup role="group" aria-labelledby="art-movements-label">
            {artMovementOptions.slice(0, MAX_MOVEMENT_OPTIONS).map((movement) => (
              <CheckboxLabel key={movement}>
                <input
                  type="checkbox"
                  checked={filters.artMovements.includes(movement)}
                  onChange={handleMovementChange(movement)}
                  disabled={loading}
                  aria-label={`Filter by ${movement}`}
                />
                {movement}
              </CheckboxLabel>
            ))}
          </CheckboxGroup>
        </FilterSection>

        <FilterSection>
          <FilterLabel id="relationships-label">Relationships</FilterLabel>
          <CheckboxGroup role="group" aria-labelledby="relationships-label">
            {relationshipOptions.map((relationship) => (
              <CheckboxLabel key={relationship}>
                <input
                  type="checkbox"
                  checked={filters.relationships.includes(relationship)}
                  onChange={handleRelationshipChange(relationship)}
                  disabled={loading}
                  aria-label={`Show ${relationship} relationships`}
                />
                {relationship}
              </CheckboxLabel>
            ))}
          </CheckboxGroup>
        </FilterSection>

        {error && (
          <ErrorFallback role="alert">
            {error.message}
          </ErrorFallback>
        )}
      </FilterContainer>
    </ErrorBoundary>
  );
};

export default SearchFilters;