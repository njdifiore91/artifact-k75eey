import React, { useState, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { useDebounce } from 'use-debounce'; // v9.0.0
import { NodeType, RelationshipType } from '../../types/graph';
import Input from '../common/Input';
import { theme } from '../../styles/theme';

// Styled components with accessibility and mobile optimization
const FilterContainer = styled.div<{ isOpen: boolean }>`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: ${({ theme }) => theme.colors.getColor('surface')};
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  box-shadow: 0 -2px 10px ${({ theme }) => theme.colors.getColor('overlay')};
  transform: translateY(${({ isOpen }) => (isOpen ? '0' : '100%')});
  transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1000;
  padding: ${theme.spacing.MEDIUM}px;
  max-height: 80vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const FilterSection = styled.div`
  margin-bottom: ${theme.spacing.MEDIUM}px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.getColor('divider')};
  padding-bottom: ${theme.spacing.MEDIUM}px;

  &:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }
`;

const FilterTitle = styled.h3`
  ${theme.typography.heading2}
  color: ${({ theme }) => theme.colors.getColor('text')};
  margin-bottom: ${theme.spacing.SMALL}px;
`;

const CheckboxGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.SMALL}px;
`;

const RangeContainer = styled.div`
  display: flex;
  gap: ${theme.spacing.MEDIUM}px;
  align-items: center;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: ${theme.spacing.SMALL}px;
  margin-top: ${theme.spacing.MEDIUM}px;
`;

const Button = styled.button<{ variant?: 'primary' | 'secondary' }>`
  ${theme.typography.bodyText}
  padding: ${theme.spacing.SMALL}px ${theme.spacing.MEDIUM}px;
  border-radius: 8px;
  border: none;
  background-color: ${({ theme, variant }) =>
    variant === 'primary' ? theme.colors.getColor('primary') : theme.colors.getColor('surface')};
  color: ${({ theme, variant }) =>
    variant === 'primary' ? '#FFFFFF' : theme.colors.getColor('text')};
  cursor: pointer;
  min-height: 44px;
  min-width: 44px;
  
  &:focus-visible {
    ${theme.accessibility.focusRing}
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// Interfaces
export interface GraphFilterProps {
  onFilterChange: (filters: GraphFilters) => void;
  initialFilters?: GraphFilters;
  className?: string;
  id?: string;
  ariaLabel?: string;
  isOpen: boolean;
}

export interface GraphFilters {
  nodeTypes: NodeType[];
  relationshipTypes: RelationshipType[];
  timeRange: {
    start: number;
    end: number;
  };
}

// Default values
const DEFAULT_FILTERS: GraphFilters = {
  nodeTypes: Object.values(NodeType),
  relationshipTypes: Object.values(RelationshipType),
  timeRange: {
    start: 1800,
    end: new Date().getFullYear()
  }
};

export const GraphFilter: React.FC<GraphFilterProps> = ({
  onFilterChange,
  initialFilters = DEFAULT_FILTERS,
  className,
  id = 'graph-filter',
  ariaLabel = 'Graph filter controls',
  isOpen
}) => {
  // State management
  const [filters, setFilters] = useState<GraphFilters>(initialFilters);
  const [debouncedFilters] = useDebounce(filters, 300);

  // Update parent component when filters change
  useEffect(() => {
    onFilterChange(debouncedFilters);
  }, [debouncedFilters, onFilterChange]);

  // Handler for node type changes
  const handleNodeTypeChange = useCallback((type: NodeType) => {
    setFilters(prev => ({
      ...prev,
      nodeTypes: prev.nodeTypes.includes(type)
        ? prev.nodeTypes.filter(t => t !== type)
        : [...prev.nodeTypes, type]
    }));
  }, []);

  // Handler for relationship type changes
  const handleRelationshipTypeChange = useCallback((type: RelationshipType) => {
    setFilters(prev => ({
      ...prev,
      relationshipTypes: prev.relationshipTypes.includes(type)
        ? prev.relationshipTypes.filter(t => t !== type)
        : [...prev.relationshipTypes, type]
    }));
  }, []);

  // Handler for time range changes
  const handleTimeRangeChange = useCallback((field: 'start' | 'end', value: number) => {
    setFilters(prev => ({
      ...prev,
      timeRange: {
        ...prev.timeRange,
        [field]: value
      }
    }));
  }, []);

  // Reset filters to default
  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  return (
    <FilterContainer
      className={className}
      id={id}
      role="region"
      aria-label={ariaLabel}
      isOpen={isOpen}
    >
      <FilterSection>
        <FilterTitle>Node Types</FilterTitle>
        <CheckboxGroup role="group" aria-label="Filter by node types">
          {Object.values(NodeType).map(type => (
            <label key={type}>
              <input
                type="checkbox"
                checked={filters.nodeTypes.includes(type)}
                onChange={() => handleNodeTypeChange(type)}
                aria-label={`Show ${type.toLowerCase()} nodes`}
              />
              {type}
            </label>
          ))}
        </CheckboxGroup>
      </FilterSection>

      <FilterSection>
        <FilterTitle>Relationship Types</FilterTitle>
        <CheckboxGroup role="group" aria-label="Filter by relationship types">
          {Object.values(RelationshipType).map(type => (
            <label key={type}>
              <input
                type="checkbox"
                checked={filters.relationshipTypes.includes(type)}
                onChange={() => handleRelationshipTypeChange(type)}
                aria-label={`Show ${type.toLowerCase().replace('_', ' ')} relationships`}
              />
              {type.replace('_', ' ')}
            </label>
          ))}
        </CheckboxGroup>
      </FilterSection>

      <FilterSection>
        <FilterTitle>Time Period</FilterTitle>
        <RangeContainer>
          <Input
            type="number"
            name="timeStart"
            label="Start Year"
            value={filters.timeRange.start.toString()}
            onChange={(e) => handleTimeRangeChange('start', parseInt(e.target.value, 10))}
            min={1800}
            max={filters.timeRange.end}
            aria-label="Start year"
          />
          <span aria-hidden="true">to</span>
          <Input
            type="number"
            name="timeEnd"
            label="End Year"
            value={filters.timeRange.end.toString()}
            onChange={(e) => handleTimeRangeChange('end', parseInt(e.target.value, 10))}
            min={filters.timeRange.start}
            max={new Date().getFullYear()}
            aria-label="End year"
          />
        </RangeContainer>
      </FilterSection>

      <ButtonGroup>
        <Button
          onClick={handleReset}
          aria-label="Reset all filters"
        >
          Reset
        </Button>
        <Button
          variant="primary"
          onClick={() => onFilterChange(filters)}
          aria-label="Apply filters"
        >
          Apply
        </Button>
      </ButtonGroup>
    </FilterContainer>
  );
};

export default GraphFilter;