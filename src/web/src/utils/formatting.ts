/**
 * @fileoverview Utility functions for formatting various data types in the Art Knowledge Graph application.
 * Implements robust error handling and input validation with comprehensive type safety.
 * @version 1.0.0
 */

import { format, formatDistance } from 'date-fns'; // v2.30.0
import { ArtworkType, ArtworkPeriod, DimensionUnit } from '../types/artwork';
import { NodeType, RelationshipType } from '../types/graph';

/**
 * Formats a date string into a localized display format
 * @param dateString - ISO date string to format
 * @returns Formatted date string in the format 'MMM dd, yyyy' or error message
 */
export function formatDate(dateString: string): string {
  try {
    if (!dateString) {
      throw new Error('Date string is required');
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format');
    }
    return format(date, 'MMM dd, yyyy');
  } catch (error) {
    console.error('Date formatting error:', error);
    return 'Invalid date';
  }
}

/**
 * Formats a date into a relative time string
 * @param dateString - ISO date string to format
 * @returns Relative time string (e.g., "2 days ago") or error message
 */
export function formatRelativeTime(dateString: string): string {
  try {
    if (!dateString) {
      throw new Error('Date string is required');
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format');
    }
    if (date > new Date()) {
      throw new Error('Future date not supported');
    }
    return formatDistance(date, new Date(), { addSuffix: true });
  } catch (error) {
    console.error('Relative time formatting error:', error);
    return 'Invalid date';
  }
}

/**
 * Formats an artwork type enum value into a display string
 * @param type - ArtworkType enum value
 * @returns Formatted artwork type string with proper capitalization
 */
export function formatArtworkType(type: ArtworkType): string {
  try {
    if (!Object.values(ArtworkType).includes(type)) {
      throw new Error('Invalid artwork type');
    }
    return type.toLowerCase()
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  } catch (error) {
    console.error('Artwork type formatting error:', error);
    return 'Unknown Type';
  }
}

/**
 * Formats an artwork period enum value into a display string
 * @param period - ArtworkPeriod enum value
 * @returns Formatted artwork period string with proper capitalization
 */
export function formatArtworkPeriod(period: ArtworkPeriod): string {
  try {
    if (!Object.values(ArtworkPeriod).includes(period)) {
      throw new Error('Invalid artwork period');
    }
    return period.toLowerCase()
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  } catch (error) {
    console.error('Artwork period formatting error:', error);
    return 'Unknown Period';
  }
}

/**
 * Formats a node type enum value into a display string
 * @param type - NodeType enum value
 * @returns Formatted node type string with proper capitalization
 */
export function formatNodeType(type: NodeType): string {
  try {
    if (!Object.values(NodeType).includes(type)) {
      throw new Error('Invalid node type');
    }
    return type.toLowerCase()
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  } catch (error) {
    console.error('Node type formatting error:', error);
    return 'Unknown Node Type';
  }
}

/**
 * Formats a relationship type enum value into a display string
 * @param type - RelationshipType enum value
 * @returns Formatted relationship type string with proper spacing
 */
export function formatRelationshipType(type: RelationshipType): string {
  try {
    if (!Object.values(RelationshipType).includes(type)) {
      throw new Error('Invalid relationship type');
    }
    return type.toLowerCase()
      .split('_')
      .join(' ');
  } catch (error) {
    console.error('Relationship type formatting error:', error);
    return 'unknown relationship';
  }
}

/**
 * Interface for artwork dimensions with validation
 */
interface DimensionsInput {
  width: number;
  height: number;
  depth?: number;
  unit: DimensionUnit;
}

/**
 * Formats artwork dimensions into a display string
 * @param dimensions - Dimensions object with width, height, optional depth, and unit
 * @returns Formatted dimensions string (e.g., "100 x 150 cm") or error message
 */
export function formatDimensions(dimensions: DimensionsInput): string {
  try {
    if (!dimensions || typeof dimensions !== 'object') {
      throw new Error('Invalid dimensions object');
    }

    const { width, height, depth, unit } = dimensions;

    if (!width || !height || typeof width !== 'number' || typeof height !== 'number') {
      throw new Error('Invalid width or height values');
    }

    if (!['cm', 'in'].includes(unit)) {
      throw new Error('Invalid unit');
    }

    const formatter = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    });

    const formattedWidth = formatter.format(width);
    const formattedHeight = formatter.format(height);
    
    if (depth && typeof depth === 'number') {
      const formattedDepth = formatter.format(depth);
      return `${formattedWidth} × ${formattedHeight} × ${formattedDepth} ${unit}`;
    }

    return `${formattedWidth} × ${formattedHeight} ${unit}`;
  } catch (error) {
    console.error('Dimensions formatting error:', error);
    return 'Invalid dimensions';
  }
}