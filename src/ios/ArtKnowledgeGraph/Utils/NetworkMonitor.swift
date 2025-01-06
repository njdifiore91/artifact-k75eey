//
// NetworkMonitor.swift
// ArtKnowledgeGraph
//
// Thread-safe network connectivity monitoring with power optimization
// Supports iOS 14.0+
//

import Network
import Foundation
import Combine
import os.log

/// Network connection type enumeration
public enum NetworkType {
    case wifi
    case cellular
    case ethernet
    case unknown
}

/// Network status information structure
public struct NetworkStatus: Equatable {
    let isConnected: Bool
    let connectionType: NetworkType
    let isExpensive: Bool
    let timestamp: Date
}

/// Thread-safe network monitoring singleton
@available(iOS 14.0, *)
public final class NetworkMonitor {
    
    // MARK: - Properties
    
    /// Shared singleton instance with thread safety
    public static let shared = NetworkMonitor()
    
    /// Network status publisher
    public private(set) var networkStatus: CurrentValueSubject<NetworkStatus, Never>
    
    /// Current connection status
    public private(set) var isConnected: Bool {
        get {
            queue.sync { _isConnected }
        }
    }
    
    /// Current connection type
    public private(set) var connectionType: NetworkType {
        get {
            queue.sync { _connectionType }
        }
    }
    
    /// Indicates if current connection is expensive (cellular)
    public private(set) var isExpensive: Bool {
        get {
            queue.sync { _isExpensive }
        }
    }
    
    // MARK: - Private Properties
    
    private let monitor: NWPathMonitor
    private let queue: DispatchQueue
    private let logger: OSLog
    private var isMonitoring: Bool
    private var lastUpdateTime: Date
    
    private var _isConnected: Bool = false
    private var _connectionType: NetworkType = .unknown
    private var _isExpensive: Bool = false
    
    // MARK: - Initialization
    
    private init() {
        // Initialize with power-efficient configuration
        self.monitor = NWPathMonitor()
        self.queue = DispatchQueue(label: "com.artknowledgegraph.networkMonitor", qos: .utility)
        self.logger = OSLog(subsystem: "com.artknowledgegraph", category: "network")
        self.isMonitoring = false
        self.lastUpdateTime = Date()
        
        // Initialize network status publisher
        self.networkStatus = CurrentValueSubject<NetworkStatus, Never>(
            NetworkStatus(
                isConnected: false,
                connectionType: .unknown,
                isExpensive: false,
                timestamp: Date()
            )
        )
        
        // Configure monitor with power-efficient settings
        self.monitor.pathUpdateHandler = { [weak self] path in
            self?.handleNetworkTransition(path)
        }
    }
    
    // MARK: - Public Methods
    
    /// Starts network monitoring with power optimization
    public func startMonitoring() {
        queue.async { [weak self] in
            guard let self = self, !self.isMonitoring else { return }
            
            os_log("Starting network monitoring", log: self.logger, type: .info)
            
            self.monitor.start(queue: self.queue)
            self.isMonitoring = true
            
            // Update initial status
            if let path = self.monitor.currentPath {
                self.handleNetworkTransition(path)
            }
        }
    }
    
    /// Stops network monitoring and performs cleanup
    public func stopMonitoring() {
        queue.async { [weak self] in
            guard let self = self, self.isMonitoring else { return }
            
            os_log("Stopping network monitoring", log: self.logger, type: .info)
            
            self.monitor.cancel()
            self.isMonitoring = false
            
            // Reset status
            self._isConnected = false
            self._connectionType = .unknown
            self._isExpensive = false
            
            // Update publisher
            self.updateNetworkStatus()
        }
    }
    
    // MARK: - Private Methods
    
    private func handleNetworkTransition(_ path: NWPath) {
        queue.async { [weak self] in
            guard let self = self else { return }
            
            // Update connection status
            self._isConnected = path.status == .satisfied
            self._isExpensive = path.isExpensive
            
            // Determine connection type
            if path.usesInterfaceType(.wifi) {
                self._connectionType = .wifi
            } else if path.usesInterfaceType(.cellular) {
                self._connectionType = .cellular
            } else if path.usesInterfaceType(.wired) {
                self._connectionType = .ethernet
            } else {
                self._connectionType = .unknown
            }
            
            // Log transition with privacy consideration
            os_log("Network status changed - Connected: %{public}@ Type: %{public}@",
                  log: self.logger,
                  type: .info,
                  String(describing: self._isConnected),
                  String(describing: self._connectionType))
            
            // Update publisher
            self.updateNetworkStatus()
        }
    }
    
    private func updateNetworkStatus() {
        let status = NetworkStatus(
            isConnected: _isConnected,
            connectionType: _connectionType,
            isExpensive: _isExpensive,
            timestamp: Date()
        )
        networkStatus.send(status)
        lastUpdateTime = status.timestamp
    }
}