import React, { useState, useCallback, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useDebounce } from 'use-debounce'; // v9.0.0

import Input from '../common/Input';
import Button from '../common/Button';
import { useSearch } from '../../hooks/useSearch';
import { getThemeColor, withOpacity } from '../../styles/colors';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  initialValue?: string;
  className?: string;
  debounceMs?: number;
  maxSuggestions?: number;
  onError?: (error: Error) => void;
  analyticsEnabled?: boolean;
}

const SearchContainer = styled.div`
  position: relative;
  width: 100%;
  display: flex;
  gap: ${({ theme }) => theme.spacing.SMALL}px;
  ${({ theme }) => theme.spacing.padding('small', 'all')}

  @media (max-width: ${({ theme }) => theme.SCREEN_SIZES.SMALL_PHONE}px) {
    flex-direction: column;
  }

  &:focus-within {
    ${({ theme }) => theme.accessibility.focusRing}
  }

  @media (prefers-color-scheme: dark) {
    background-color: ${({ theme }) => withOpacity(getThemeColor('surface', 'dark'), 0.1)};
  }
`;

const SuggestionsContainer = styled.div<{ visible: boolean }>`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 300px;
  overflow-y: auto;
  background-color: ${({ theme }) => getThemeColor('surface')};
  border: 1px solid ${({ theme }) => getThemeColor('divider')};
  border-radius: 8px;
  box-shadow: 0 4px 6px ${({ theme }) => withOpacity(getThemeColor('primary'), 0.1)};
  z-index: 1000;
  display: ${({ visible }) => visible ? 'block' : 'none'};
  margin-top: ${({ theme }) => theme.spacing.EXTRA_SMALL}px;

  @media (prefers-reduced-motion: no-preference) {
    transition: opacity 200ms ${({ theme }) => theme.transitions.timing};
  }

  &:focus-visible {
    ${({ theme }) => theme.accessibility.focusRing}
  }
`;

const SuggestionItem = styled.button`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.SMALL}px;
  text-align: left;
  border: none;
  background: none;
  cursor: pointer;
  color: ${({ theme }) => getThemeColor('text')};
  ${({ theme }) => theme.typography.bodyText}

  &:hover, &:focus {
    background-color: ${({ theme }) => withOpacity(getThemeColor('primary'), 0.1)};
  }

  &[aria-selected="true"] {
    background-color: ${({ theme }) => withOpacity(getThemeColor('primary'), 0.2)};
  }

  @media (prefers-reduced-motion: no-preference) {
    transition: background-color 200ms ${({ theme }) => theme.transitions.timing};
  }
`;

export const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  placeholder = 'Search artwork or artists...',
  initialValue = '',
  className,
  debounceMs = 300,
  maxSuggestions = 5,
  onError,
  analyticsEnabled = false
}) => {
  const [searchTerm, setSearchTerm] = useState(initialValue);
  const [debouncedTerm] = useDebounce(searchTerm, debounceMs);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    suggestions,
    loading,
    error
  } = useSearch({
    initialQuery: debouncedTerm,
    searchType: 'artwork',
    onError: (err) => onError?.(new Error(err))
  });

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setShowSuggestions(true);
    setSelectedIndex(-1);
  }, []);

  const handleSearch = useCallback(() => {
    if (searchTerm.trim()) {
      onSearch(searchTerm);
      setShowSuggestions(false);
      if (analyticsEnabled) {
        // Analytics tracking would go here
      }
    }
  }, [searchTerm, onSearch, analyticsEnabled]);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setSearchTerm(suggestion);
    onSearch(suggestion);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }, [onSearch]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        event.preventDefault();
        setSelectedIndex(prev => prev > -1 ? prev - 1 : prev);
        break;
      case 'Enter':
        event.preventDefault();
        if (selectedIndex > -1 && suggestions[selectedIndex]) {
          handleSuggestionClick(suggestions[selectedIndex]);
        } else {
          handleSearch();
        }
        break;
      case 'Escape':
        event.preventDefault();
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  }, [suggestions, selectedIndex, handleSuggestionClick, handleSearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <SearchContainer className={className}>
      <Input
        ref={inputRef}
        type="search"
        value={searchTerm}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        name="search"
        aria-label="Search artwork"
        aria-expanded={showSuggestions}
        aria-controls="search-suggestions"
        aria-activedescendant={selectedIndex > -1 ? `suggestion-${selectedIndex}` : undefined}
        aria-describedby={error ? 'search-error' : undefined}
        error={!!error}
        errorMessage={error?.message}
      />
      <Button
        onClick={handleSearch}
        disabled={!searchTerm.trim() || loading}
        loading={loading}
        aria-label="Search"
      >
        Search
      </Button>
      <SuggestionsContainer
        ref={suggestionsRef}
        visible={showSuggestions && suggestions.length > 0}
        id="search-suggestions"
        role="listbox"
      >
        {suggestions.slice(0, maxSuggestions).map((suggestion, index) => (
          <SuggestionItem
            key={suggestion}
            onClick={() => handleSuggestionClick(suggestion)}
            role="option"
            id={`suggestion-${index}`}
            aria-selected={index === selectedIndex}
          >
            {suggestion}
          </SuggestionItem>
        ))}
      </SuggestionsContainer>
    </SearchContainer>
  );
};

export default SearchBar;