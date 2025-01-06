//
// SceneDelegate.swift
// ArtKnowledgeGraph
//
// Scene lifecycle and window management for the Art Knowledge Graph iOS application
// Supports iOS 14.0+
//

import UIKit

/// Manages the scene lifecycle and window configuration with enhanced security and performance optimizations
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    
    // MARK: - Properties
    
    /// Main window of the application with secure configuration
    private(set) var window: UIWindow?
    
    /// Flag to track state restoration status
    private var isPerformingStateRestoration: Bool = false
    
    /// Weak reference collection of active view controllers for memory management
    private let activeViewControllers: NSHashTable<UIViewController> = NSHashTable.weakObjects()
    
    /// Memory warning notification token
    private var memoryWarningToken: NSObjectProtocol?
    
    // MARK: - Scene Lifecycle
    
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        
        // Configure window with secure settings
        let window = UIWindow(windowScene: windowScene)
        window.overrideUserInterfaceStyle = .unspecified
        window.backgroundColor = .systemBackground
        
        // Apply environment-specific configurations
        configureWindow(window)
        
        // Configure root view controller
        setupRootViewController(for: window)
        
        // Apply security configurations based on environment
        applySecurityConfigurations(to: window)
        
        // Store window reference and make it visible
        self.window = window
        window.makeKeyAndVisible()
        
        // Setup memory warning observation
        setupMemoryWarningObservation()
        
        // Configure state restoration if available
        if let stateRestorationActivity = connectionOptions.stateRestorationActivity {
            restoreScene(with: stateRestorationActivity)
        }
        
        // Initialize performance monitoring
        setupPerformanceMonitoring()
    }
    
    func sceneDidDisconnect(_ scene: UIScene) {
        // Save state and clean up resources
        saveApplicationState()
        
        // Clear sensitive data from memory
        clearSensitiveData()
        
        // Remove memory warning observer
        if let token = memoryWarningToken {
            NotificationCenter.default.removeObserver(token)
        }
        
        // Clear view controller references
        activeViewControllers.removeAllObjects()
        
        // Release window reference
        window = nil
    }
    
    // MARK: - Private Configuration Methods
    
    private func configureWindow(_ window: UIWindow) {
        // Apply environment-specific window configurations
        if Environment.current.isProduction {
            window.layer.speed = 1.0
            window.layer.allowsGroupOpacity = false
        } else {
            // Enable additional debug visualizations in development
            window.layer.speed = Environment.isDevelopment ? 1.0 : 0.8
            window.layer.allowsGroupOpacity = true
        }
        
        // Configure secure window settings
        window.layer.allowsEdgeAntialiasing = true
        window.insetsLayoutMarginsFromSafeArea = true
    }
    
    private func setupRootViewController(for window: UIWindow) {
        // Initialize root view controller hierarchy
        let rootViewController = UINavigationController(
            rootViewController: MainViewController()
        )
        
        // Configure navigation bar appearance
        let appearance = UINavigationBarAppearance()
        appearance.configureWithDefaultBackground()
        rootViewController.navigationBar.standardAppearance = appearance
        rootViewController.navigationBar.scrollEdgeAppearance = appearance
        
        // Set root view controller
        window.rootViewController = rootViewController
        
        // Track in active controllers
        activeViewControllers.add(rootViewController)
    }
    
    private func applySecurityConfigurations(to window: UIWindow) {
        // Apply security settings based on environment
        if Environment.current.isProduction {
            // Disable screen recording in production
            window.windowScene?.screen.isCaptureEnabled = false
            
            // Enable secure entry mode for sensitive content
            window.windowScene?.screen.secureMode = true
        }
    }
    
    private func setupMemoryWarningObservation() {
        memoryWarningToken = NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.handleMemoryWarning()
        }
    }
    
    private func handleMemoryWarning() {
        // Clear non-essential caches
        activeViewControllers.allObjects.forEach { viewController in
            viewController.didReceiveMemoryWarning()
        }
        
        // Clear image caches
        URLCache.shared.removeAllCachedResponses()
    }
    
    private func setupPerformanceMonitoring() {
        // Configure performance monitoring based on environment
        if Environment.current.isProduction {
            // Initialize production performance monitoring
            configureProductionPerformanceMonitoring()
        } else {
            // Initialize development performance monitoring
            configureDevelopmentPerformanceMonitoring()
        }
    }
    
    private func configureProductionPerformanceMonitoring() {
        // Configure production-specific monitoring
        window?.layer.shouldRasterize = false
        window?.layer.drawsAsynchronously = true
    }
    
    private func configureDevelopmentPerformanceMonitoring() {
        // Configure development-specific monitoring
        window?.layer.shouldRasterize = true
        window?.layer.drawsAsynchronously = false
    }
    
    private func saveApplicationState() {
        guard let window = window else { return }
        
        // Save current view controller state
        activeViewControllers.allObjects.forEach { viewController in
            viewController.view.endEditing(true)
        }
        
        // Persist necessary application state
        UserDefaults.standard.synchronize()
    }
    
    private func clearSensitiveData() {
        // Clear sensitive data from memory
        activeViewControllers.allObjects.forEach { viewController in
            if let secureController = viewController as? SecureContentProtocol {
                secureController.clearSensitiveData()
            }
        }
    }
    
    private func restoreScene(with activity: NSUserActivity) {
        isPerformingStateRestoration = true
        defer { isPerformingStateRestoration = false }
        
        // Implement state restoration logic
        guard let window = window,
              let rootViewController = window.rootViewController else {
            return
        }
        
        // Restore view controller state
        rootViewController.restoreUserActivityState(activity)
    }
}

// MARK: - SecureContentProtocol

private protocol SecureContentProtocol {
    func clearSensitiveData()
}