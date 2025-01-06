import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useInView } from 'react-intersection-observer';
import { Skeleton } from '@mui/material';
import { ErrorBoundary } from 'react-error-boundary';

// Internal imports
import ArtworkMetadata from '../../components/artwork/ArtworkMetadata';
import GraphCanvas from '../../components/graph/GraphCanvas';
import useArtwork from '../../hooks/useArtwork';

// Styled components
const DetailContainer = styled.main`
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  padding: 24px;
  min-height: 100vh;
  
  @media (min-width: 768px) {
    grid-template-columns: 1fr 1fr;
  }
  
  @media (min-width: 1200px) {
    grid-template-columns: 2fr 3fr;
  }
`;

const GraphContainer = styled.section`
  width: 100%;
  height: min(700px, 80vh);
  border-radius: 8px;
  overflow: hidden;
  background: ${props => props.theme.colors.background};
  box-shadow: ${props => props.theme.shadows.medium};
  position: relative;
  touch-action: none;
`;

const ErrorFallback = styled.div`
  padding: 24px;
  color: ${props => props.theme.colors.error};
  text-align: center;
`;

// Props interface
interface ArtworkDetailScreenProps {
  className?: string;
  onNodeSelect?: (nodeId: string) => void;
  initialScale?: number;
}

const ArtworkDetailScreen: React.FC<ArtworkDetailScreenProps> = ({
  className,
  onNodeSelect,
  initialScale = 1.0
}) => {
  // Hooks
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ref, inView] = useInView({ threshold: 0.1 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Custom hook for artwork data management
  const {
    artworks,
    loading,
    error,
    processingStatus,
    getArtworkStatus,
    cancelProcessing
  } = useArtwork();

  // Local state
  const [graphData, setGraphData] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Memoized handlers
  const handleNodeSelect = useCallback((nodeId: string) => {
    setSelectedNode(nodeId);
    onNodeSelect?.(nodeId);
  }, [onNodeSelect]);

  const handleError = useCallback((error: Error) => {
    console.error('Artwork detail error:', error);
    // Implement error tracking/logging here
  }, []);

  // Effect for fetching artwork data
  useEffect(() => {
    if (id && inView) {
      const fetchData = async () => {
        try {
          await getArtworkStatus(id);
        } catch (error) {
          handleError(error as Error);
        }
      };
      fetchData();
    }

    return () => {
      cancelProcessing();
    };
  }, [id, inView, getArtworkStatus, cancelProcessing, handleError]);

  // Effect for handling processing status updates
  useEffect(() => {
    if (processingStatus?.status === 'failed') {
      navigate('/error', { state: { error: 'Artwork processing failed' } });
    }
  }, [processingStatus, navigate]);

  // Render loading state
  if (loading.status) {
    return (
      <DetailContainer className={className} ref={containerRef}>
        <Skeleton 
          variant="rectangular" 
          height={400} 
          animation="wave"
          sx={{ borderRadius: '8px' }}
        />
        <Skeleton 
          variant="rectangular" 
          height={700} 
          animation="wave"
          sx={{ borderRadius: '8px' }}
        />
      </DetailContainer>
    );
  }

  // Render error state
  if (error) {
    return (
      <ErrorFallback role="alert">
        <h2>Error loading artwork details</h2>
        <p>{error}</p>
      </ErrorFallback>
    );
  }

  const artwork = artworks[id || ''];

  return (
    <ErrorBoundary
      FallbackComponent={({ error }) => (
        <ErrorFallback role="alert">
          <h2>Error in artwork detail view</h2>
          <p>{error.message}</p>
        </ErrorFallback>
      )}
      onError={handleError}
    >
      <DetailContainer 
        className={className} 
        ref={containerRef}
        role="main"
        aria-label="Artwork detail view"
      >
        {artwork && (
          <>
            <ArtworkMetadata
              metadata={artwork.metadata}
              isLoading={loading.detail[id || '']}
              error={error}
              testId="artwork-metadata-section"
            />
            <GraphContainer ref={ref}>
              <GraphCanvas
                graphData={graphData}
                width={containerRef.current?.clientWidth || 800}
                height={containerRef.current?.clientHeight || 600}
                onNodeSelect={handleNodeSelect}
                performanceMode={true}
                accessibilityEnabled={true}
                progressiveLoading={true}
                touchConfig={{
                  enablePinchZoom: true,
                  enablePan: true,
                  enableDoubleTap: true,
                  enableLongPress: true,
                  touchFeedback: true
                }}
              />
            </GraphContainer>
          </>
        )}
      </DetailContainer>
    </ErrorBoundary>
  );
};

export default React.memo(ArtworkDetailScreen);