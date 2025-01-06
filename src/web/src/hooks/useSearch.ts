/**
 * @fileoverview Custom React hook providing comprehensive search functionality for artworks
 * and graph nodes with debouncing, pagination, suggestions, and error handling.
 * @version 1.0.0
 */

import { useState, useCallback, useEffect } from 'react'; // ^18.0.0
import { debounce } from 'lodash'; // ^4.17.21

import { 
  searchArtwork,
  searchGraphNodes,
  getSearchSuggestions
} from '../../services/api/search';
import { 
  APIResponse,
  PaginatedResponse
} from '../../types/api';
import { ArtworkResponse } from '../../types/artwork';

// Constants for configuration
const DEBOUNCE_DELAY = 300;
const DEFAULT_PAGE_SIZE = 20;
const MAX_SUGGESTIONS = 5;
const RETRY_ATTEMPTS = 3;

/**
 * Search options interface for type safety
 */
interface SearchOptions<T> {
  initialQuery?: string;
  pageSize?: number;
  searchType: 'artwork' | 'graph';
  onError?: (error: string) => void;
}

/**
 * Custom hook for comprehensive search functionality
 */
export function useSearch<T extends ArtworkResponse>({
  initialQuery = '',
  pageSize = DEFAULT_PAGE_SIZE,
  searchType,
  onError
}: SearchOptions<T>) {
  // Search state
  const [query, setQuery] = useState<string>(initialQuery);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PaginatedResponse<T>>({
    items: [],
    total: 0,
    page: 1,
    page_size: pageSize,
    total_pages: 0,
    has_next: false,
    has_previous: false
  });

  // Pagination state
  const [page, setPage] = useState<number>(1);
  
  // Suggestions state
  const [suggestions, setSuggestions] = useState<string[]>([]);

  /**
   * Execute search with retry logic
   */
  const executeSearch = useCallback(async (
    searchQuery: string,
    currentPage: number,
    attempts: number = 0
  ): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const searchFunction = searchType === 'artwork' ? searchArtwork : searchGraphNodes;
      
      const response = await searchFunction(
        searchQuery,
        { 
          page: currentPage,
          page_size: pageSize,
          sort_order: 'desc'
        }
      );

      if (response.success) {
        setResults(response.data);
      } else {
        throw new Error(response.error || 'Search failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      
      if (attempts < RETRY_ATTEMPTS) {
        // Retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
        return executeSearch(searchQuery, currentPage, attempts + 1);
      }

      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [searchType, pageSize, onError]);

  /**
   * Fetch search suggestions
   */
  const fetchSuggestions = useCallback(async (searchQuery: string): Promise<void> => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }

    try {
      const response = await getSearchSuggestions(searchQuery, MAX_SUGGESTIONS);
      if (response.success) {
        setSuggestions(response.data);
      }
    } catch (err) {
      // Silently fail for suggestions
      setSuggestions([]);
    }
  }, []);

  /**
   * Debounced search handler
   */
  const debouncedSearch = useCallback(
    debounce(async (searchQuery: string, currentPage: number) => {
      if (searchQuery.trim()) {
        await executeSearch(searchQuery, currentPage);
        await fetchSuggestions(searchQuery);
      } else {
        setResults({
          items: [],
          total: 0,
          page: 1,
          page_size: pageSize,
          total_pages: 0,
          has_next: false,
          has_previous: false
        });
        setSuggestions([]);
      }
    }, DEBOUNCE_DELAY),
    [executeSearch, fetchSuggestions, pageSize]
  );

  /**
   * Handle query changes
   */
  useEffect(() => {
    debouncedSearch(query, page);
    
    return () => {
      debouncedSearch.cancel();
    };
  }, [query, page, debouncedSearch]);

  /**
   * Reset search state
   */
  const resetSearch = useCallback(() => {
    setQuery('');
    setPage(1);
    setError(null);
    setResults({
      items: [],
      total: 0,
      page: 1,
      page_size: pageSize,
      total_pages: 0,
      has_next: false,
      has_previous: false
    });
    setSuggestions([]);
  }, [pageSize]);

  return {
    // Search state
    query,
    setQuery,
    loading,
    error,
    results,
    suggestions,
    
    // Pagination controls
    page,
    setPage,
    
    // Utility functions
    resetSearch
  };
}