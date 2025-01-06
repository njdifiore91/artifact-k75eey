import React, { useState, useCallback, useRef, useEffect } from 'react';
import styled, { css } from 'styled-components';
import { useMediaQuery } from '@react-hook/media-query';
import { CircularProgress } from '@mui/material';
import Button from '../common/Button';
import Input from '../common/Input';
import { uploadArtwork } from '../../services/api/artwork';
import { ArtworkType, ArtworkPeriod, ArtworkMetadata, ArtworkResponse } from '../../types/artwork';
import { getThemeColor, withOpacity } from '../../styles/colors';

interface ArtworkUploaderProps {
  onUploadComplete: (response: ArtworkResponse) => void;
  onUploadError: (error: Error) => void;
  onUploadProgress?: (progress: number) => void;
  maxFileSize?: number;
  acceptedFileTypes?: string[];
  className?: string;
}

const UploaderContainer = styled.div<{ isDragging?: boolean; hasError?: boolean }>`
  ${({ theme }) => theme.spacing.container}
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  background-color: ${({ theme }) => getThemeColor('surface')};
  border-radius: ${({ theme }) => theme.platform === 'ios' ? '12px' : '8px'};
  border: 2px dashed ${({ theme, isDragging, hasError }) => 
    hasError ? getThemeColor('error') :
    isDragging ? getThemeColor('primary') :
    getThemeColor('divider')
  };
  transition: ${({ theme }) => theme.transitions.create(['border-color', 'background-color'])};
  position: relative;
  min-height: 200px;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const DropZone = styled.div<{ isDragging?: boolean; isUploading?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  text-align: center;
  cursor: ${({ isUploading }) => isUploading ? 'not-allowed' : 'pointer'};
  opacity: ${({ isUploading }) => isUploading ? 0.7 : 1};
  
  ${({ isDragging }) => isDragging && css`
    background-color: ${({ theme }) => withOpacity(getThemeColor('primary'), 0.1)};
  `}
`;

const PreviewImage = styled.img`
  max-width: 200px;
  max-height: 200px;
  object-fit: contain;
  border-radius: 8px;
  margin-bottom: ${({ theme }) => theme.spacing.MEDIUM}px;
`;

const MetadataForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  width: 100%;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.SMALL}px;
  justify-content: flex-end;
  margin-top: ${({ theme }) => theme.spacing.MEDIUM}px;
`;

export const ArtworkUploader: React.FC<ArtworkUploaderProps> = ({
  onUploadComplete,
  onUploadError,
  onUploadProgress,
  maxFileSize = 10 * 1024 * 1024, // 10MB default
  acceptedFileTypes = ['image/jpeg', 'image/png', 'image/webp'],
  className
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Partial<ArtworkMetadata>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const isReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const platform = window.navigator.platform.toLowerCase().includes('iphone') ? 'ios' : 'android';

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) setIsDragging(true);
  }, [isUploading]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const validateFile = useCallback((file: File): string | null => {
    if (!acceptedFileTypes.includes(file.type)) {
      return 'Invalid file type. Please upload a supported image format.';
    }
    if (file.size > maxFileSize) {
      return `File size exceeds ${maxFileSize / (1024 * 1024)}MB limit.`;
    }
    return null;
  }, [acceptedFileTypes, maxFileSize]);

  const handleFileSelect = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSelectedFile(file);
    setError(null);

    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    // Clean up previous preview URL
    return () => URL.revokeObjectURL(url);
  }, [validateFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (isUploading) return;

    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect, isUploading]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleMetadataChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setMetadata(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleUpload = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !metadata.title || !metadata.artist) return;

    setIsUploading(true);
    setError(null);

    try {
      const response = await uploadArtwork({
        image: selectedFile,
        metadata: metadata as ArtworkMetadata,
        options: {
          generateThumbnail: true,
          compress: true
        }
      }, {
        onProgress: onUploadProgress
      });

      onUploadComplete(response.data);
      
      // Reset form
      setSelectedFile(null);
      setPreviewUrl(null);
      setMetadata({});
      if (fileInputRef.current) fileInputRef.current.value = '';
      
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Upload failed');
      onUploadError(error instanceof Error ? error : new Error('Upload failed'));
    } finally {
      setIsUploading(false);
    }
  }, [selectedFile, metadata, onUploadComplete, onUploadError, onUploadProgress]);

  useEffect(() => {
    const dropZone = dropZoneRef.current;
    if (!dropZone) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    dropZone.addEventListener('dragover', handleDragOver);
    return () => dropZone.removeEventListener('dragover', handleDragOver);
  }, []);

  return (
    <UploaderContainer 
      className={className}
      isDragging={isDragging}
      hasError={!!error}
      role="region"
      aria-label="Artwork upload area"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFileTypes.join(',')}
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
        aria-hidden="true"
      />

      <DropZone
        ref={dropZoneRef}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        isDragging={isDragging}
        isUploading={isUploading}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Click or drag and drop to upload artwork"
      >
        {isUploading ? (
          <>
            <CircularProgress size={48} />
            <p>Uploading artwork...</p>
          </>
        ) : previewUrl ? (
          <PreviewImage src={previewUrl} alt="Artwork preview" />
        ) : (
          <p>Drop artwork here or click to select</p>
        )}
      </DropZone>

      {error && (
        <div role="alert" aria-live="polite" style={{ color: getThemeColor('error') }}>
          {error}
        </div>
      )}

      {selectedFile && !isUploading && (
        <MetadataForm onSubmit={handleUpload}>
          <Input
            name="title"
            label="Artwork Title"
            value={metadata.title || ''}
            onChange={handleMetadataChange}
            required
            disabled={isUploading}
            aria-required="true"
          />
          <Input
            name="artist"
            label="Artist Name"
            value={metadata.artist || ''}
            onChange={handleMetadataChange}
            required
            disabled={isUploading}
            aria-required="true"
          />
          <Input
            name="year"
            label="Year Created"
            type="number"
            value={metadata.year?.toString() || ''}
            onChange={handleMetadataChange}
            disabled={isUploading}
          />
          
          <ButtonGroup>
            <Button
              variant="text"
              onClick={() => {
                setSelectedFile(null);
                setPreviewUrl(null);
                setMetadata({});
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isUploading || !metadata.title || !metadata.artist}
              loading={isUploading}
            >
              Upload Artwork
            </Button>
          </ButtonGroup>
        </MetadataForm>
      )}
    </UploaderContainer>
  );
};

export default ArtworkUploader;