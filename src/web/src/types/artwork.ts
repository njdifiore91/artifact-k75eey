/**
 * @fileoverview TypeScript type definitions for artwork-related data structures
 * in the Art Knowledge Graph frontend application.
 * @version 1.0.0
 */

/**
 * Generic API response wrapper for artwork-related endpoints
 * Provides consistent error handling and response structure
 */
export interface ArtworkAPIResponse<T> {
  success: boolean;
  data: T;
  error: string | null;
  timestamp: string;
}

/**
 * Valid artwork types supported by the system
 * Used for strict type checking and validation
 */
export enum ArtworkType {
  PAINTING = 'PAINTING',
  SCULPTURE = 'SCULPTURE',
  PHOTOGRAPH = 'PHOTOGRAPH',
  DRAWING = 'DRAWING',
  PRINT = 'PRINT',
  DIGITAL = 'DIGITAL'
}

/**
 * Historical periods for artwork classification
 * Enables temporal categorization and filtering
 */
export enum ArtworkPeriod {
  ANCIENT = 'ANCIENT',
  MEDIEVAL = 'MEDIEVAL',
  RENAISSANCE = 'RENAISSANCE',
  BAROQUE = 'BAROQUE',
  MODERN = 'MODERN',
  CONTEMPORARY = 'CONTEMPORARY'
}

/**
 * Measurement units supported for artwork dimensions
 */
export type DimensionUnit = 'cm' | 'in';

/**
 * Physical dimensions of an artwork
 */
export interface Dimensions {
  width: number;
  height: number;
  depth?: number;
  unit: DimensionUnit;
}

/**
 * Source information for artwork data
 */
export interface ArtworkSource {
  name: string;
  url: string;
  provider: string;
}

/**
 * Location information for artwork
 */
export interface ArtworkLocation {
  museum?: string;
  city: string;
  country: string;
}

/**
 * Processing status for artwork uploads
 */
export interface ProcessingStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
}

/**
 * Permission settings for artwork
 */
export interface ArtworkPermissions {
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
}

/**
 * Comprehensive metadata interface for artwork
 * Contains all relevant information about an artwork piece
 */
export interface ArtworkMetadata {
  title: string;
  artist: string;
  year: number;
  type: ArtworkType;
  period: ArtworkPeriod;
  medium: string;
  dimensions: Dimensions;
  description: string;
  source: ArtworkSource;
  tags: string[];
  style: string[];
  location: ArtworkLocation;
}

/**
 * Upload request interface for new artwork submissions
 * Includes image file and associated metadata
 */
export interface ArtworkUploadRequest {
  image: File;
  metadata: ArtworkMetadata;
  options: {
    compress?: boolean;
    generateThumbnail?: boolean;
    maxSize?: number;
  };
}

/**
 * Complete artwork response interface
 * Returned by API endpoints when retrieving artwork data
 */
export interface ArtworkResponse {
  id: string;
  image_url: string;
  thumbnail_url: string;
  metadata: ArtworkMetadata;
  created_at: string;
  updated_at: string;
  processing_status: ProcessingStatus;
  permissions: ArtworkPermissions;
}

/**
 * Global constants for artwork types
 */
export const ARTWORK_TYPES: ArtworkType[] = [
  ArtworkType.PAINTING,
  ArtworkType.SCULPTURE,
  ArtworkType.PHOTOGRAPH,
  ArtworkType.DRAWING,
  ArtworkType.PRINT,
  ArtworkType.DIGITAL
];

/**
 * Global constants for artwork periods
 */
export const ARTWORK_PERIODS: ArtworkPeriod[] = [
  ArtworkPeriod.ANCIENT,
  ArtworkPeriod.MEDIEVAL,
  ArtworkPeriod.RENAISSANCE,
  ArtworkPeriod.BAROQUE,
  ArtworkPeriod.MODERN,
  ArtworkPeriod.CONTEMPORARY
];