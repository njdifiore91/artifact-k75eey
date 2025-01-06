import React, { useState, useCallback, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '@mui/material';
import GraphCanvas, { GraphCanvasProps, useGraphRenderer } from '../../components/graph/GraphCanvas';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import { theme } from '../../styles/theme';
import { getThemeColor, withOpacity } from '../../styles/colors';
import { margin, padding } from '../../styles/spacing';

interface GraphExportScreenProps {
  graphId: string;
  onClose: () => void;
  initialFormat?: 'png' | 'pdf' | 'url';
  onExportComplete: (result: ExportResult) => void;
}

interface ExportOptions {
  format: 'png' | 'pdf' | 'url';
  quality: 'low' | 'medium' | 'high';
  includeMetadata: boolean;
  annotations: boolean;
  dimensions: { width: number; height: number };
}

interface ExportResult {
  url: string;
  format: string;
  timestamp: string;
}

const ExportContainer = styled.div`
  ${margin('medium', 'all')}
  ${padding('large', 'all')}
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.gap}px;
  background-color: ${({ theme }) => theme.colors.getColor('surface')};
  border-radius: 8px;
  min-width: 320px;
  max-width: 480px;

  &:focus-visible {
    ${theme.accessibility.focusRing}
  }
`;

const PreviewContainer = styled.div<{ isLoading: boolean }>`
  position: relative;
  width: 100%;
  aspect-ratio: 16/9;
  border: 1px solid ${({ theme }) => theme.colors.getColor('divider')};
  border-radius: 4px;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.getColor('background')};

  ${({ isLoading }) => isLoading && `
    &::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: ${withOpacity(getThemeColor('background'), 0.7)};
    }
  `}
`;

const OptionsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.gap}px;
`;

const GraphExportScreen: React.FC<GraphExportScreenProps> = ({
  graphId,
  onClose,
  initialFormat = 'png',
  onExportComplete
}) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: initialFormat,
    quality: 'high',
    includeMetadata: true,
    annotations: false,
    dimensions: { width: 1920, height: 1080 }
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  const handleExport = useCallback(async () => {
    try {
      setIsExporting(true);
      setExportError(null);

      // Validate export options
      if (!canvasRef.current) {
        throw new Error(t('export.errors.canvasNotFound'));
      }

      // Generate export preview
      const renderer = useGraphRenderer(canvasRef, {
        width: exportOptions.dimensions.width,
        height: exportOptions.dimensions.height,
        performanceMode: true
      });

      // Process export based on format
      let exportUrl: string;
      switch (exportOptions.format) {
        case 'png':
          exportUrl = await renderer.exportAsPNG(exportOptions.quality);
          break;
        case 'pdf':
          exportUrl = await renderer.exportAsPDF(exportOptions.quality, exportOptions.includeMetadata);
          break;
        case 'url':
          exportUrl = await renderer.generateShareableURL(exportOptions.annotations);
          break;
        default:
          throw new Error(t('export.errors.invalidFormat'));
      }

      const result: ExportResult = {
        url: exportUrl,
        format: exportOptions.format,
        timestamp: new Date().toISOString()
      };

      onExportComplete(result);
      onClose();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : t('export.errors.unknown'));
    } finally {
      setIsExporting(false);
    }
  }, [exportOptions, graphId, onExportComplete, onClose, t]);

  const handleFormatChange = useCallback((format: ExportOptions['format']) => {
    setExportOptions(prev => ({
      ...prev,
      format,
      quality: format === 'url' ? 'high' : prev.quality
    }));
    setPreviewKey(prev => prev + 1);
  }, []);

  const handleQualityChange = useCallback((quality: ExportOptions['quality']) => {
    setExportOptions(prev => ({
      ...prev,
      quality
    }));
    setPreviewKey(prev => prev + 1);
  }, []);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('export.title')}
      size="medium"
      ariaDescribedBy="export-description"
      actions={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isExporting}
            aria-label={t('common.cancel')}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleExport}
            disabled={isExporting}
            loading={isExporting}
            aria-label={t('export.actions.export')}
          >
            {t('export.actions.export')}
          </Button>
        </>
      }
    >
      <ExportContainer>
        <p id="export-description" className="sr-only">
          {t('export.description')}
        </p>

        <PreviewContainer isLoading={isExporting}>
          <GraphCanvas
            ref={canvasRef}
            key={previewKey}
            graphId={graphId}
            width={exportOptions.dimensions.width}
            height={exportOptions.dimensions.height}
            performanceMode
            accessibilityEnabled={false}
          />
          {isExporting && <LoadingSpinner size="large" />}
        </PreviewContainer>

        <OptionsContainer>
          <div role="radiogroup" aria-label={t('export.options.format.label')}>
            {['png', 'pdf', 'url'].map(format => (
              <Button
                key={format}
                variant={exportOptions.format === format ? 'primary' : 'secondary'}
                onClick={() => handleFormatChange(format as ExportOptions['format'])}
                aria-checked={exportOptions.format === format}
                role="radio"
              >
                {t(`export.options.format.${format}`)}
              </Button>
            ))}
          </div>

          {exportOptions.format !== 'url' && (
            <div role="radiogroup" aria-label={t('export.options.quality.label')}>
              {['low', 'medium', 'high'].map(quality => (
                <Button
                  key={quality}
                  variant={exportOptions.quality === quality ? 'primary' : 'secondary'}
                  onClick={() => handleQualityChange(quality as ExportOptions['quality'])}
                  aria-checked={exportOptions.quality === quality}
                  role="radio"
                >
                  {t(`export.options.quality.${quality}`)}
                </Button>
              ))}
            </div>
          )}

          <label>
            <input
              type="checkbox"
              checked={exportOptions.includeMetadata}
              onChange={e => setExportOptions(prev => ({
                ...prev,
                includeMetadata: e.target.checked
              }))}
              aria-label={t('export.options.metadata')}
            />
            {t('export.options.metadata')}
          </label>

          <label>
            <input
              type="checkbox"
              checked={exportOptions.annotations}
              onChange={e => setExportOptions(prev => ({
                ...prev,
                annotations: e.target.checked
              }))}
              aria-label={t('export.options.annotations')}
            />
            {t('export.options.annotations')}
          </label>
        </OptionsContainer>

        {exportError && (
          <div role="alert" aria-live="polite" className="error-message">
            {exportError}
          </div>
        )}
      </ExportContainer>
    </Modal>
  );
};

export default GraphExportScreen;