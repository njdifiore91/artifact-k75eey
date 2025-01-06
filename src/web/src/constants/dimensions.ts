/**
 * Constants for screen sizes, spacing, and graph dimensions used throughout the application.
 * Values are in density-independent pixels (dp) for consistent rendering across devices.
 * @version 1.0.0
 */

/**
 * Screen size breakpoints for responsive design
 * Based on common mobile device widths (320dp-428dp)
 */
export const SCREEN_SIZES = {
    /** Minimum supported screen width - 320dp (e.g. iPhone SE) */
    SMALL_PHONE: 320 as const,
    /** Medium screen width - 375dp (e.g. iPhone 12/13) */
    REGULAR_PHONE: 375 as const,
    /** Large screen width - 428dp (e.g. iPhone 12/13 Pro Max) */
    LARGE_PHONE: 428 as const
} as const;

/**
 * Standard spacing values for consistent layout spacing
 * Following 8-point grid system with additional granularity for fine adjustments
 */
export const SPACING = {
    /** Extra small spacing - 4dp */
    EXTRA_SMALL: 4 as const,
    /** Small spacing - 8dp */
    SMALL: 8 as const,
    /** Medium spacing - 16dp */
    MEDIUM: 16 as const,
    /** Large spacing - 24dp */
    LARGE: 24 as const,
    /** Extra large spacing - 32dp */
    EXTRA_LARGE: 32 as const
} as const;

/**
 * Graph visualization dimensions and constraints
 * Defines zoom levels, node sizes, and edge properties for consistent graph rendering
 */
export const GRAPH_DIMENSIONS = {
    /** Minimum zoom level - 0.5x */
    MIN_ZOOM: 0.5 as const,
    /** Maximum zoom level - 3.0x */
    MAX_ZOOM: 3.0 as const,
    /** Default zoom level - 1.0x */
    DEFAULT_ZOOM: 1.0 as const,
    /** Standard node size in dp */
    NODE_SIZE: 40 as const,
    /** Standard edge thickness in dp */
    EDGE_THICKNESS: 2 as const
} as const;

// Type definitions for better TypeScript support
export type ScreenSizes = typeof SCREEN_SIZES;
export type Spacing = typeof SPACING;
export type GraphDimensions = typeof GRAPH_DIMENSIONS;