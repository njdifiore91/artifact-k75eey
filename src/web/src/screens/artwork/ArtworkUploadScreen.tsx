import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import styled from 'styled-components';
import { useToast } from '@chakra-ui/toast';

import Header from '../../components/common/Header';
import ArtworkUploader from '../../components/artwork/ArtworkUploader';
import { useArtwork } from '../../hooks/useArtwork';
import { ArtworkResponse } from '../../types/artwork';
import { getThemeColor, withOpacity } from '../../styles/colors';

// Styled components with enhanced accessibility and responsive design
const ScreenContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: ${({ theme }) => getThemeColor('background')};
  
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  @media screen and (forced-colors: active) {
    border: 1px solid ButtonText;
  }
`;

const ContentContainer = styled.main`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.padding('medium', 'all')};
  max-width: ${({ theme }) => theme.breakpoints.regularPhone}px;
  margin: 0 auto;
  width: 100%;
  
  @media (max-width: ${({ theme }) => theme.breakpoints.smallPhone}px) {
    padding: ${({ theme }) => theme.spacing.padding('small', 'all')};
  }
`;

const StatusMessage = styled.div<{ type: 'success' | 'error' | 'info' }>`
  padding: ${({ theme }) => theme.spacing.padding('medium', 'all')};
  margin-bottom: ${({ theme }) => theme.spacing.margin('medium', 'bottom')};
  border-radius: ${({ theme }) => theme.platform === 'ios' ? '12px' : '4px'};
  background-color: ${({ theme, type }) => 
    withOpacity(getThemeColor(
      type === 'success' ? 'success' :
      type === 'error' ? 'error' : 'info'
    ), 0.1)};
  color: ${({ theme, type }) => 
    getThemeColor(
      type === 'success' ? 'success' :
      type === 'error' ? 'error' : 'info'
    )};
  
  ${({ theme }) => theme.typography.bodyText};
  
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const ArtworkUploadScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const toast = useToast();
  const { uploadArtwork, uploadProgress, uploadStatus } = useArtwork();
  
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploadStartTime = useRef<number | null>(null);

  // Handle successful upload completion
  const handleUploadComplete = useCallback((response: ArtworkResponse) => {
    setIsUploading(false);
    uploadStartTime.current = null;

    // Announce success to screen readers
    const successMessage = 'Artwork uploaded successfully';
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.textContent = successMessage;
    document.body.appendChild(announcement);
    
    toast({
      title: 'Upload Complete',
      description: successMessage,
      status: 'success',
      duration: 5000,
      isClosable: true,
    });

    // Navigate to artwork detail screen
    navigation.navigate('ArtworkDetail', { id: response.id });
  }, [navigation, toast]);

  // Enhanced error handling with user feedback
  const handleUploadError = useCallback((error: Error) => {
    setIsUploading(false);
    setError(error.message);
    uploadStartTime.current = null;

    // Announce error to screen readers
    const errorMessage = `Upload failed: ${error.message}`;
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'alert');
    announcement.textContent = errorMessage;
    document.body.appendChild(announcement);

    toast({
      title: 'Upload Failed',
      description: errorMessage,
      status: 'error',
      duration: 7000,
      isClosable: true,
    });
  }, [toast]);

  // Track upload duration for analytics
  useEffect(() => {
    if (isUploading && !uploadStartTime.current) {
      uploadStartTime.current = Date.now();
    }
    
    return () => {
      if (uploadStartTime.current) {
        const duration = Date.now() - uploadStartTime.current;
        // Log upload duration for analytics
        console.log('Upload duration:', duration);
      }
    };
  }, [isUploading]);

  return (
    <ScreenContainer>
      <Header
        title="Upload Artwork"
        showBackButton
        showUserMenu
        accessibilityLabel="Upload artwork screen"
      />
      
      <ContentContainer
        role="main"
        aria-label="Artwork upload form"
      >
        {error && (
          <StatusMessage
            type="error"
            role="alert"
            aria-live="polite"
          >
            {error}
          </StatusMessage>
        )}

        {uploadProgress > 0 && uploadProgress < 100 && (
          <StatusMessage
            type="info"
            role="status"
            aria-live="polite"
          >
            Uploading: {Math.round(uploadProgress)}%
          </StatusMessage>
        )}

        <ArtworkUploader
          onUploadComplete={handleUploadComplete}
          onUploadError={handleUploadError}
          onUploadProgress={(progress) => {
            setIsUploading(true);
            setError(null);
          }}
          maxFileSize={10 * 1024 * 1024} // 10MB
          acceptedFileTypes={['image/jpeg', 'image/png', 'image/webp']}
          aria-label="Artwork upload form"
          aria-busy={isUploading}
        />
      </ContentContainer>
    </ScreenContainer>
  );
};

export default ArtworkUploadScreen;