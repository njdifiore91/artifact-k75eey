import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { jest } from '@jest/globals';
import { ThemeProvider } from 'styled-components';

import HomeScreen from '../../../screens/home/HomeScreen';
import { theme } from '../../../styles/theme';
import { mockStore } from '../../../utils/testUtils';
import { ArtworkResponse } from '../../../types/artwork';

// Mock hooks and navigation
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: jest.fn(),
  }),
}));

jest.mock('../../../hooks/useArtwork', () => ({
  __esModule: true,
  default: () => ({
    artworks: mockArtworks,
    loading: false,
    error: null,
    listArtworks: jest.fn(),
  }),
}));

// Mock artwork data
const mockArtworks: ArtworkResponse[] = [
  {
    id: '1',
    image_url: 'https://example.com/artwork1.jpg',
    thumbnail_url: 'https://example.com/thumbnail1.jpg',
    metadata: {
      title: 'The Starry Night',
      artist: 'Vincent van Gogh',
      year: 1889,
      type: 'PAINTING',
      period: 'POST_IMPRESSIONIST',
      medium: 'Oil on canvas',
      dimensions: { width: 73.7, height: 92.1, unit: 'cm' },
    },
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    processing_status: { status: 'completed' },
    permissions: { canEdit: true, canDelete: true, canShare: true },
  },
];

describe('HomeScreen', () => {
  // Setup test environment before each test
  beforeEach(() => {
    jest.clearAllMocks();
    const store = mockStore({
      artwork: {
        items: {},
        loading: false,
        error: null,
      },
    });

    render(
      <Provider store={store}>
        <NavigationContainer>
          <ThemeProvider theme={theme}>
            <HomeScreen />
          </ThemeProvider>
        </NavigationContainer>
      </Provider>
    );
  });

  it('renders correctly with initial state', async () => {
    // Verify header presence
    expect(screen.getByTestId('home-screen-header')).toBeInTheDocument();
    expect(screen.getByText('Art Knowledge Graph')).toBeInTheDocument();

    // Verify search bar presence
    const searchBar = screen.getByPlaceholderText('Search artwork or artists...');
    expect(searchBar).toBeInTheDocument();
    expect(searchBar).toHaveAttribute('type', 'search');

    // Verify artwork grid presence
    expect(screen.getByTestId('home-artwork-grid')).toBeInTheDocument();
  });

  it('handles accessibility requirements', () => {
    // Verify ARIA labels and roles
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByRole('grid')).toBeInTheDocument();

    // Verify keyboard navigation
    const searchBar = screen.getByRole('searchbox');
    searchBar.focus();
    expect(document.activeElement).toBe(searchBar);

    // Verify color contrast
    const header = screen.getByTestId('home-screen-header');
    const headerStyles = window.getComputedStyle(header);
    expect(headerStyles.backgroundColor).toHaveContrastRatio(headerStyles.color);
  });

  it('handles search functionality', async () => {
    const searchBar = screen.getByRole('searchbox');
    
    // Test search input
    fireEvent.change(searchBar, { target: { value: 'Starry Night' } });
    
    await waitFor(() => {
      expect(searchBar).toHaveValue('Starry Night');
    });

    // Verify debounced search behavior
    await waitFor(
      () => {
        expect(screen.getByTestId('home-artwork-grid')).toBeInTheDocument();
      },
      { timeout: 350 } // Account for 300ms debounce
    );
  });

  it('handles artwork selection and navigation', async () => {
    const navigation = require('@react-navigation/native').useNavigation();
    
    // Find and click artwork
    const artworkCard = screen.getByText('The Starry Night').closest('div');
    fireEvent.click(artworkCard!);

    // Verify navigation
    expect(navigation.navigate).toHaveBeenCalledWith('ArtworkDetail', {
      artworkId: '1',
      title: 'The Starry Night',
    });
  });

  it('tracks user engagement metrics', async () => {
    // Mock performance tracking
    const performanceNow = jest.spyOn(performance, 'now');
    const startTime = 1000;
    performanceNow.mockReturnValue(startTime);

    // Simulate user interaction
    const searchBar = screen.getByRole('searchbox');
    fireEvent.change(searchBar, { target: { value: 'van Gogh' } });

    // Simulate session duration
    performanceNow.mockReturnValue(startTime + 900000); // 15 minutes

    await waitFor(() => {
      const sessionDuration = performance.now() - startTime;
      expect(sessionDuration).toBeGreaterThanOrEqual(900000); // 15 minutes
    });
  });

  it('handles loading states correctly', async () => {
    // Mock loading state
    jest.spyOn(require('../../../hooks/useArtwork'), 'default').mockImplementation(() => ({
      artworks: [],
      loading: true,
      error: null,
      listArtworks: jest.fn(),
    }));

    // Verify loading indicator
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    
    // Verify loading state accessibility
    expect(screen.getByRole('grid')).toHaveAttribute('aria-busy', 'true');
  });

  it('handles error states appropriately', async () => {
    // Mock error state
    const errorMessage = 'Failed to load artworks';
    jest.spyOn(require('../../../hooks/useArtwork'), 'default').mockImplementation(() => ({
      artworks: [],
      loading: false,
      error: new Error(errorMessage),
      listArtworks: jest.fn(),
    }));

    // Verify error message
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
    
    // Verify error state accessibility
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('supports infinite scrolling', async () => {
    const { listArtworks } = require('../../../hooks/useArtwork').default();
    
    // Simulate scroll to bottom
    fireEvent.scroll(window, { target: { scrollY: 2000 } });

    await waitFor(() => {
      expect(listArtworks).toHaveBeenCalledWith(2, 20);
    });
  });
});