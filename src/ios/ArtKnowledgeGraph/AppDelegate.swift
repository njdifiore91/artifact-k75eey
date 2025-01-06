//
// AppDelegate.swift
// ArtKnowledgeGraph
//
// Main application delegate managing lifecycle and core configuration
// Supports iOS 14.0+
//

import UIKit
import OSLog

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    
    // MARK: - Properties
    
    var window: UIWindow?
    private let environment: Environment
    private let logger = Logger(subsystem: "com.artknowledge.ios", category: "AppDelegate")
    
    // MARK: - Initialization
    
    override init() {
        self.environment = Environment.current
        super.init()
    }
    
    // MARK: - UIApplicationDelegate
    
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        logger.info("Application launching in \(Environment.current.rawValue) environment")
        
        // Configure global appearance
        configureAppearance()
        
        // Configure core services
        configureCoreServices()
        
        // Configure crash reporting and analytics based on environment
        configureCrashReporting()
        
        // Configure networking layer
        configureNetworking()
        
        // Configure caching
        configureCaching()
        
        logger.info("Application launch completed successfully")
        return true
    }
    
    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        logger.debug("Configuring scene session: \(connectingSceneSession.configuration.name ?? "unnamed")")
        
        let configuration = UISceneConfiguration(
            name: "Default Configuration",
            sessionRole: connectingSceneSession.role
        )
        configuration.delegateClass = SceneDelegate.self
        
        return configuration
    }
    
    func application(
        _ application: UIApplication,
        didDiscardSceneSessions sceneSessions: Set<UISceneSession>
    ) {
        logger.debug("Discarding scene sessions: \(sceneSessions.count)")
        
        for session in sceneSessions {
            // Perform cleanup for discarded scenes
            cleanupResources(for: session)
        }
    }
    
    // MARK: - Private Configuration Methods
    
    private func configureAppearance() {
        if #available(iOS 15.0, *) {
            let navigationBarAppearance = UINavigationBarAppearance()
            navigationBarAppearance.configureWithOpaqueBackground()
            UINavigationBar.appearance().standardAppearance = navigationBarAppearance
            UINavigationBar.appearance().scrollEdgeAppearance = navigationBarAppearance
        }
        
        // Configure global tint color
        window?.tintColor = .systemBlue
    }
    
    private func configureCoreServices() {
        let config = Config.current
        
        // Initialize core services based on environment configuration
        if config.isDebugMode {
            logger.debug("Initializing core services in debug mode")
        }
        
        // Configure maximum concurrent operations
        OperationQueue.main.maxConcurrentOperationCount = config.maxConcurrentOperations
    }
    
    private func configureCrashReporting() {
        let config = Config.current
        
        if config.analyticsEnabled {
            logger.info("Configuring crash reporting and analytics")
            // Initialize crash reporting and analytics services
            // Note: Actual implementation would depend on chosen analytics service
        }
    }
    
    private func configureNetworking() {
        let config = Config.current
        
        // Configure URLSession with environment-specific settings
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = config.networkTimeout
        configuration.timeoutIntervalForResource = config.networkTimeout
        
        // Configure certificate pinning if enabled
        if config.certificatePinningEnabled {
            logger.info("Configuring certificate pinning")
            // Set up certificate pinning
        }
    }
    
    private func configureCaching() {
        let config = Config.current
        
        // Configure URLCache with environment-specific settings
        let memoryCapacity = Storage.maxCacheSize
        let diskCapacity = Storage.maxDiskSpace
        let cache = URLCache(
            memoryCapacity: memoryCapacity,
            diskCapacity: diskCapacity,
            directory: FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
        )
        URLCache.shared = cache
        
        logger.debug("Configured cache with memory capacity: \(memoryCapacity), disk capacity: \(diskCapacity)")
    }
    
    private func cleanupResources(for session: UISceneSession) {
        logger.debug("Cleaning up resources for session: \(session.persistentIdentifier)")
        
        // Clear any cached data associated with the scene
        // Release any scene-specific resources
        // Update environment state if needed
    }
}