import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { useNavigation } from '@react-navigation/native';
import { useDebounce } from 'use-debounce';

import Header from '../../components/common/Header';
import ArtworkGrid from '../../components/artwork/ArtworkGrid';
import SearchBar from '../../components/search/SearchBar';
import useArtwork from '../../hooks/useArtwork';
import { ArtworkResponse } from '../../types/artwork';
import { fadeIn } from '../../styles/animations';
import { getThemeColor, withOpacity } from '../../styles/colors';

const HomeContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: ${props => props.theme.colors.background};
  padding: ${props => props.theme.spacing.medium};

  @media (max-width: ${props => props.theme.breakpoints.mobile}) {
    padding: ${props => props.theme.spacing.small};
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const ContentContainer = styled.div`
  flex: 1;
  width: 100%;
  max-width: ${props => props.theme.layout.maxWidth};
  margin: 0 auto;
  padding-top: ${props => props.theme.spacing.large};

  @media (max-width: ${props => props.theme.breakpoints.tablet}) {
    padding-top: ${props => props.theme.spacing.medium};
  }
`;

const SearchContainer = styled.div`
  margin-bottom: ${props => props.theme.spacing.large};
  width: 100%;
  position: sticky;
  top: 0;
  z-index: ${props => props.theme.zIndex.sticky};
  backdrop-filter: blur(8px);
  background-color: ${props => withOpacity(getThemeColor('background'), 0.95)};

  @media (max-width: ${props => props.theme.breakpoints.mobile}) {
    margin-bottom: ${props => props.theme.spacing.medium};
  }
`;

const HomeScreen: React.FC = React.memo(() => {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const { artworks, loading, error, listArtworks } = useArtwork();

  // Initialize artwork list on mount
  useEffect(() => {
    const fetchInitialArtworks = async () => {
      try {
        await listArtworks(1, 20);
      } catch (err) {
        console.error('Failed to fetch initial artworks:', err);
      }
    };

    fetchInitialArtworks();

    return () => {
      // Cleanup if needed
    };
  }, [listArtworks]);

  // Handle search query changes
  useEffect(() => {
    const performSearch = async () => {
      if (debouncedQuery) {
        try {
          await listArtworks(1, 20, { query: debouncedQuery });
        } catch (err) {
          console.error('Search failed:', err);
        }
      }
    };

    performSearch();
  }, [debouncedQuery, listArtworks]);

  const handleArtworkSelect = useCallback((artwork: ArtworkResponse) => {
    navigation.navigate('ArtworkDetail', { 
      artworkId: artwork.id,
      title: artwork.metadata.title 
    });
  }, [navigation]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (!loading && artworks.length > 0) {
      const nextPage = Math.ceil(artworks.length / 20) + 1;
      try {
        await listArtworks(nextPage, 20, { query: searchQuery });
      } catch (err) {
        console.error('Failed to load more artworks:', err);
      }
    }
  }, [loading, artworks.length, listArtworks, searchQuery]);

  return (
    <HomeContainer>
      <Header 
        title="Art Knowledge Graph"
        showUserMenu
        testID="home-screen-header"
      />
      
      <ContentContainer>
        <SearchContainer>
          <SearchBar
            onSearch={handleSearch}
            placeholder="Search artwork or artists..."
            initialValue={searchQuery}
            debounceMs={300}
            maxSuggestions={5}
            onError={(err) => console.error('Search error:', err)}
            analyticsEnabled
          />
        </SearchContainer>

        <ArtworkGrid
          artworks={artworks}
          loading={loading}
          onArtworkClick={handleArtworkSelect}
          testId="home-artwork-grid"
          virtualizationEnabled
          itemHeight={320}
          onLoadMore={handleLoadMore}
        />
      </ContentContainer>
    </HomeContainer>
  );
});

HomeScreen.displayName = 'HomeScreen';

export default HomeScreen;