//
// Environment.swift
// ArtKnowledgeGraph
//
// Thread-safe environment configuration management for the Art Knowledge Graph iOS application
// Supports iOS 14.0+
//

import Foundation

/// Thread-safe lock for configuration access
private let ConfigurationLock = NSLock()

/// Security level enumeration for API configuration
public enum SecurityLevel: Int {
    case standard = 0
    case enhanced = 1
    case maximum = 2
}

/// Environment types supported by the application
public enum Environment: String {
    case development
    case staging
    case production
    
    /// Thread-safe access to current environment
    public static var current: Environment {
        ConfigurationLock.lock()
        defer { ConfigurationLock.unlock() }
        
        #if DEBUG
            return .development
        #elseif STAGING
            return .staging
        #else
            return .production
        #endif
    }
}

/// Thread-safe configuration management with validation
public struct Config {
    // MARK: - Properties
    
    public let apiBaseURL: String
    public let apiVersion: String = "v1"
    public let cdnBaseURL: String
    public let apiTimeout: TimeInterval = TimeInterval(API.defaultTimeout)
    public let maxRetries: Int = API.maxRetryAttempts
    public let loggingEnabled: Bool
    public let cacheSize: Int = Storage.maxCacheSize
    public let analyticsEnabled: Bool
    public let environmentName: String
    public let isDebugMode: Bool
    public let apiSecurityLevel: SecurityLevel
    public let networkTimeout: TimeInterval
    public let maxConcurrentOperations: Int
    public let certificatePinningEnabled: Bool
    
    // MARK: - Private Initialization
    
    private init(environment: Environment) {
        ConfigurationLock.lock()
        defer { ConfigurationLock.unlock() }
        
        self.environmentName = environment.rawValue
        
        switch environment {
        case .development:
            self.apiBaseURL = "https://dev-api.artknowledge.com"
            self.cdnBaseURL = "https://dev-cdn.artknowledge.com"
            self.loggingEnabled = true
            self.analyticsEnabled = false
            self.isDebugMode = true
            self.apiSecurityLevel = .standard
            self.networkTimeout = 60
            self.maxConcurrentOperations = 4
            self.certificatePinningEnabled = false
            
        case .staging:
            self.apiBaseURL = "https://staging-api.artknowledge.com"
            self.cdnBaseURL = "https://staging-cdn.artknowledge.com"
            self.loggingEnabled = true
            self.analyticsEnabled = true
            self.isDebugMode = false
            self.apiSecurityLevel = .enhanced
            self.networkTimeout = 30
            self.maxConcurrentOperations = 8
            self.certificatePinningEnabled = true
            
        case .production:
            self.apiBaseURL = "https://api.artknowledge.com"
            self.cdnBaseURL = "https://cdn.artknowledge.com"
            self.loggingEnabled = false
            self.analyticsEnabled = true
            self.isDebugMode = false
            self.apiSecurityLevel = .maximum
            self.networkTimeout = 30
            self.maxConcurrentOperations = 10
            self.certificatePinningEnabled = true
        }
    }
    
    // MARK: - Public Interface
    
    /// Returns validated configuration for specified environment
    public static func forEnvironment(_ environment: Environment) -> Config {
        ConfigurationLock.lock()
        defer { ConfigurationLock.unlock() }
        
        return Config(environment: environment)
    }
    
    /// Returns thread-safe current environment configuration
    public static var current: Config {
        ConfigurationLock.lock()
        defer { ConfigurationLock.unlock() }
        
        return Config(environment: Environment.current)
    }
    
    // MARK: - Validation
    
    /// Validates configuration integrity
    private func validate() -> Bool {
        guard !apiBaseURL.isEmpty,
              !cdnBaseURL.isEmpty,
              networkTimeout > 0,
              maxConcurrentOperations > 0 else {
            assertionFailure("Invalid configuration detected")
            return false
        }
        return true
    }
}