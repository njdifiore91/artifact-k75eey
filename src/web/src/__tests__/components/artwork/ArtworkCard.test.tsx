import React from 'react';
import { render, fireEvent, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ThemeProvider } from '@mui/material';
import ArtworkCard from '../../../components/artwork/ArtworkCard';
import type { ArtworkResponse } from '../../../types/artwork';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

// Mock artwork data
const mockArtwork: ArtworkResponse = {
  id: 'test-artwork-id',
  image_url: 'https://test-cdn.com/artwork.jpg',
  thumbnail_url: 'https://test-cdn.com/thumbnail.jpg',
  metadata: {
    title: 'Test Artwork Title',
    artist: 'Test Artist Name',
    year: 2023,
    type: 'PAINTING',
    period: 'CONTEMPORARY',
    medium: 'Oil on canvas',
    dimensions: {
      width: 100,
      height: 100,
      unit: 'cm'
    },
    description: 'Test artwork description',
    source: {
      name: 'Test Source',
      url: 'https://test-source.com',
      provider: 'Test Provider'
    },
    tags: ['test', 'artwork'],
    style: ['Contemporary'],
    location: {
      museum: 'Test Museum',
      city: 'Test City',
      country: 'Test Country'
    }
  },
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  processing_status: {
    status: 'completed',
    progress: 100
  },
  permissions: {
    canEdit: true,
    canDelete: true,
    canShare: true
  }
};

// Helper function to render with theme
const renderWithTheme = (ui: React.ReactElement) => {
  return render(
    <ThemeProvider theme={{ spacing: (value: number) => `${value * 8}px` }}>
      {ui}
    </ThemeProvider>
  );
};

describe('ArtworkCard', () => {
  // Mock console.error to prevent noise from expected error cases
  const originalError = console.error;
  beforeEach(() => {
    console.error = jest.fn();
  });
  
  afterEach(() => {
    console.error = originalError;
  });

  describe('Rendering', () => {
    it('renders correctly with all required props', () => {
      renderWithTheme(<ArtworkCard artwork={mockArtwork} />);
      
      expect(screen.getByTestId('artwork-card')).toBeInTheDocument();
      expect(screen.getByText(mockArtwork.metadata.title)).toBeInTheDocument();
      expect(screen.getByText(mockArtwork.metadata.artist)).toBeInTheDocument();
      expect(screen.getByRole('img')).toHaveAttribute('src', mockArtwork.thumbnail_url);
    });

    it('renders loading state correctly', () => {
      renderWithTheme(<ArtworkCard artwork={mockArtwork} isLoading={true} />);
      
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByLabelText('Loading artwork')).toBeInTheDocument();
    });

    it('handles image loading error gracefully', async () => {
      renderWithTheme(<ArtworkCard artwork={mockArtwork} />);
      
      const img = screen.getByRole('img');
      fireEvent.error(img);
      
      await waitFor(() => {
        expect(img).toHaveAttribute('src', '/assets/artwork-placeholder.jpg');
      });
    });

    it('applies focused state styles when isFocused prop is true', () => {
      renderWithTheme(<ArtworkCard artwork={mockArtwork} isFocused={true} />);
      
      const card = screen.getByTestId('artwork-card');
      expect(card).toHaveStyle('outline: 2px solid');
    });
  });

  describe('Interaction', () => {
    it('calls onClick handler when clicked', async () => {
      const handleClick = jest.fn();
      renderWithTheme(<ArtworkCard artwork={mockArtwork} onClick={handleClick} />);
      
      await userEvent.click(screen.getByTestId('artwork-card'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('handles keyboard navigation correctly', async () => {
      const handleClick = jest.fn();
      renderWithTheme(<ArtworkCard artwork={mockArtwork} onClick={handleClick} />);
      
      const card = screen.getByTestId('artwork-card');
      card.focus();
      
      await userEvent.keyboard('{Enter}');
      expect(handleClick).toHaveBeenCalledTimes(1);
      
      await userEvent.keyboard(' ');
      expect(handleClick).toHaveBeenCalledTimes(2);
    });

    it('maintains focus state when tabbing', async () => {
      renderWithTheme(<ArtworkCard artwork={mockArtwork} />);
      
      const card = screen.getByTestId('artwork-card');
      await userEvent.tab();
      
      expect(card).toHaveFocus();
    });
  });

  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = renderWithTheme(<ArtworkCard artwork={mockArtwork} />);
      const results = await axe(container);
      
      expect(results).toHaveNoViolations();
    });

    it('provides proper ARIA labels', () => {
      renderWithTheme(<ArtworkCard artwork={mockArtwork} />);
      
      const card = screen.getByTestId('artwork-card');
      expect(card).toHaveAttribute(
        'aria-label',
        `View details for ${mockArtwork.metadata.title} by ${mockArtwork.metadata.artist}`
      );
    });

    it('maintains proper tab order', async () => {
      renderWithTheme(<ArtworkCard artwork={mockArtwork} />);
      
      const card = screen.getByTestId('artwork-card');
      expect(card).toHaveAttribute('tabIndex', '0');
    });

    it('provides proper role attributes', () => {
      renderWithTheme(<ArtworkCard artwork={mockArtwork} />);
      
      expect(screen.getByRole('button')).toBeInTheDocument();
      expect(screen.getByRole('img')).toHaveAttribute('alt', mockArtwork.metadata.title);
    });
  });

  describe('Performance', () => {
    it('uses lazy loading for images', () => {
      renderWithTheme(<ArtworkCard artwork={mockArtwork} />);
      
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('loading', 'lazy');
    });

    it('applies proper image optimization attributes', () => {
      renderWithTheme(<ArtworkCard artwork={mockArtwork} />);
      
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', mockArtwork.thumbnail_url);
    });
  });

  describe('Error Handling', () => {
    it('handles missing artwork data gracefully', () => {
      // @ts-expect-error Testing invalid props
      renderWithTheme(<ArtworkCard artwork={null} />);
      
      expect(console.error).toHaveBeenCalled();
    });

    it('handles missing image URLs gracefully', () => {
      const artworkWithoutImages = {
        ...mockArtwork,
        thumbnail_url: '',
        image_url: ''
      };
      
      renderWithTheme(<ArtworkCard artwork={artworkWithoutImages} />);
      
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', '/assets/artwork-placeholder.jpg');
    });
  });
});