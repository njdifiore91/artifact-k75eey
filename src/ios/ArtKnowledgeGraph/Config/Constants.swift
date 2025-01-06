//
// Constants.swift
// ArtKnowledgeGraph
//
// Global configuration constants for the Art Knowledge Graph iOS application
// Supports iOS 14.0+
//

import Foundation

/// API configuration constants for network communication
public struct API {
    /// Default timeout interval for API requests in seconds
    public static let defaultTimeout: TimeInterval = 30
    
    /// Maximum number of retry attempts for failed requests
    public static let maxRetryAttempts: Int = 3
    
    /// Delay between retry attempts in seconds
    public static let retryDelay: TimeInterval = 2.0
    
    /// Maximum request size in bytes (10MB)
    public static let maxRequestSize: Int = 10 * 1024 * 1024
    
    /// Base URL for the API endpoints
    public static let baseURL: String = "https://api.artknowledge.com/v1"
    
    /// Current API version
    public static let apiVersion: String = "1.0"
    
    private init() {}
}

/// UI configuration constants following iOS Human Interface Guidelines
public struct UI {
    /// Default duration for UI animations in seconds
    public static let defaultAnimationDuration: CGFloat = 0.3
    
    /// Minimum zoom scale for pinch gestures
    public static let minimumZoomScale: CGFloat = 0.5
    
    /// Maximum zoom scale for pinch gestures
    public static let maximumZoomScale: CGFloat = 3.0
    
    /// Default corner radius for UI elements
    public static let defaultCornerRadius: CGFloat = 8.0
    
    /// Default padding for UI elements
    public static let defaultPadding: CGFloat = 16.0
    
    /// Minimum size for tappable UI elements (44x44 as per HIG)
    public static let minimumTapTargetSize: CGFloat = 44.0
    
    /// Default shadow radius for elevated UI elements
    public static let defaultShadowRadius: CGFloat = 4.0
    
    /// Default shadow opacity for elevated UI elements
    public static let defaultShadowOpacity: CGFloat = 0.1
    
    private init() {}
}

/// Constants for graph visualization and physics simulation
public struct Graph {
    /// Default size for graph nodes
    public static let nodeDefaultSize: CGFloat = 60.0
    
    /// Default width for graph edges
    public static let edgeDefaultWidth: CGFloat = 2.0
    
    /// Spring stiffness for graph physics simulation
    public static let defaultSpringStiffness: CGFloat = 0.8
    
    /// Damping factor for graph physics simulation
    public static let defaultDamping: CGFloat = 0.5
    
    /// Duration for graph layout animations
    public static let layoutAnimationDuration: TimeInterval = 0.5
    
    /// Default spacing between nodes
    public static let nodeSpacing: CGFloat = 100.0
    
    /// Minimum touch area for node interaction
    public static let minimumNodeTouchArea: CGFloat = 44.0
    
    /// Maximum number of visible nodes for performance
    public static let maxVisibleNodes: Int = 50
    
    private init() {}
}

/// Constants for storage and caching configuration
public struct Storage {
    /// Maximum cache size in bytes (100MB)
    public static let maxCacheSize: Int = 100 * 1024 * 1024
    
    /// Default cache expiration time in seconds (24 hours)
    public static let defaultCacheExpiration: TimeInterval = 24 * 60 * 60
    
    /// Maximum number of graphs stored for offline access
    public static let maxOfflineGraphs: Int = 50
    
    /// Maximum number of search history items
    public static let maxSearchHistory: Int = 100
    
    /// Maximum size for image cache in bytes (50MB)
    public static let maxImageCacheSize: Int = 50 * 1024 * 1024
    
    /// Image cache expiration time in seconds (7 days)
    public static let imageCacheExpiration: TimeInterval = 7 * 24 * 60 * 60
    
    /// Maximum disk space usage in bytes (200MB)
    public static let maxDiskSpace: Int = 200 * 1024 * 1024
    
    private init() {}
}