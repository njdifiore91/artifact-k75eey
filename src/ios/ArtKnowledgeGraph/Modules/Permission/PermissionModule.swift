import Foundation // iOS 14.0+
import Photos // iOS 14.0+
import AVFoundation // iOS 14.0+
import LocalAuthentication // iOS 14.0+

// MARK: - Permission Types
@objc enum PermissionType: Int {
    case camera
    case photoLibrary
    case biometric
    case microphone
    case location
}

// MARK: - Permission Status
@objc enum PermissionStatus: Int {
    case notDetermined
    case denied
    case authorized
    case restricted
    case limited
    case provisional
}

// MARK: - Permission Errors
@objc enum PermissionError: Int, Error {
    case timeout
    case systemError
    case notAvailable
    case alreadyInProgress
}

// MARK: - PermissionModule Implementation
@objc final class PermissionModule: NSObject {
    
    // MARK: - Properties
    private let securityManager: SecurityManager
    private let permissionLock: NSLock
    private let permissionCache: NSCache<NSString, NSNumber>
    private let permissionQueue: DispatchQueue
    private var activeRequests: Set<PermissionType> = []
    private var observers: [NSObjectProtocol] = []
    
    // MARK: - Constants
    private let defaultTimeout: TimeInterval = 30.0
    private let cacheExpirationInterval: TimeInterval = 300.0 // 5 minutes
    
    // MARK: - Initialization
    override init() {
        self.securityManager = SecurityManager.shared
        self.permissionLock = NSLock()
        self.permissionCache = NSCache<NSString, NSNumber>()
        self.permissionQueue = DispatchQueue(label: "com.artknowledgegraph.app.permission",
                                           qos: .userInitiated)
        
        super.init()
        setupNotificationObservers()
    }
    
    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }
    
    // MARK: - Public Methods
    @objc func checkPermissionStatus(_ permissionType: PermissionType) -> PermissionStatus {
        permissionLock.lock()
        defer { permissionLock.unlock() }
        
        // Check cache first
        let cacheKey = NSString(string: "\(permissionType)")
        if let cachedStatus = permissionCache.object(forKey: cacheKey) {
            return PermissionStatus(rawValue: cachedStatus.intValue) ?? .notDetermined
        }
        
        // Get current status
        let status = getCurrentPermissionStatus(permissionType)
        
        // Update cache
        permissionCache.setObject(NSNumber(value: status.rawValue), forKey: cacheKey)
        
        return status
    }
    
    @objc func requestPermission(_ permissionType: PermissionType,
                                timeout: TimeInterval = 30.0,
                                completion: @escaping (Result<PermissionStatus, PermissionError>) -> Void) {
        permissionQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Check if request already in progress
            self.permissionLock.lock()
            guard !self.activeRequests.contains(permissionType) else {
                self.permissionLock.unlock()
                completion(.failure(.alreadyInProgress))
                return
            }
            self.activeRequests.insert(permissionType)
            self.permissionLock.unlock()
            
            // Setup timeout
            let timeoutWorkItem = DispatchWorkItem { [weak self] in
                self?.handlePermissionTimeout(permissionType, completion: completion)
            }
            
            DispatchQueue.global().asyncAfter(deadline: .now() + timeout, execute: timeoutWorkItem)
            
            // Request permission
            self.requestSpecificPermission(permissionType) { [weak self] result in
                timeoutWorkItem.cancel()
                
                self?.permissionLock.lock()
                self?.activeRequests.remove(permissionType)
                self?.permissionLock.unlock()
                
                completion(result)
            }
        }
    }
    
    @objc func monitorPermissionChanges(_ permissionType: PermissionType) {
        switch permissionType {
        case .camera:
            setupCameraObserver()
        case .photoLibrary:
            setupPhotoLibraryObserver()
        case .biometric:
            setupBiometricObserver()
        case .microphone:
            setupMicrophoneObserver()
        case .location:
            setupLocationObserver()
        }
    }
    
    // MARK: - Private Methods
    private func getCurrentPermissionStatus(_ permissionType: PermissionType) -> PermissionStatus {
        switch permissionType {
        case .camera:
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .notDetermined: return .notDetermined
            case .restricted: return .restricted
            case .denied: return .denied
            case .authorized: return .authorized
            @unknown default: return .notDetermined
            }
            
        case .photoLibrary:
            switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
            case .notDetermined: return .notDetermined
            case .restricted: return .restricted
            case .denied: return .denied
            case .authorized: return .authorized
            case .limited: return .limited
            @unknown default: return .notDetermined
            }
            
        case .biometric:
            let context = LAContext()
            var error: NSError?
            guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
                return error?.code == LAError.biometryNotAvailable.rawValue ? .notAvailable : .denied
            }
            return .authorized
            
        case .microphone:
            switch AVAudioSession.sharedInstance().recordPermission {
            case .undetermined: return .notDetermined
            case .denied: return .denied
            case .granted: return .authorized
            @unknown default: return .notDetermined
            }
            
        case .location:
            // Location status would be implemented here
            return .notDetermined
        }
    }
    
    private func requestSpecificPermission(_ permissionType: PermissionType,
                                         completion: @escaping (Result<PermissionStatus, PermissionError>) -> Void) {
        switch permissionType {
        case .camera:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                self?.updatePermissionCache(permissionType, granted: granted)
                completion(.success(granted ? .authorized : .denied))
            }
            
        case .photoLibrary:
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { [weak self] status in
                self?.updatePermissionCache(permissionType, status: status)
                completion(.success(self?.convertPhotoAuthorizationStatus(status) ?? .denied))
            }
            
        case .biometric:
            securityManager.authenticateWithBiometrics(
                reason: NSLocalizedString("Authenticate to access secure features", comment: ""),
                policy: SecurityPolicy()
            ) { result in
                switch result {
                case .success:
                    completion(.success(.authorized))
                case .failure:
                    completion(.success(.denied))
                }
            }
            
        case .microphone:
            AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in
                self?.updatePermissionCache(permissionType, granted: granted)
                completion(.success(granted ? .authorized : .denied))
            }
            
        case .location:
            // Location permission request would be implemented here
            completion(.failure(.notAvailable))
        }
    }
    
    private func handlePermissionTimeout(_ permissionType: PermissionType,
                                       completion: @escaping (Result<PermissionStatus, PermissionError>) -> Void) {
        permissionLock.lock()
        activeRequests.remove(permissionType)
        permissionLock.unlock()
        
        completion(.failure(.timeout))
    }
    
    private func updatePermissionCache(_ permissionType: PermissionType, granted: Bool) {
        let status: PermissionStatus = granted ? .authorized : .denied
        updatePermissionCache(permissionType, status: status)
    }
    
    private func updatePermissionCache(_ permissionType: PermissionType, status: PermissionStatus) {
        permissionLock.lock()
        permissionCache.setObject(NSNumber(value: status.rawValue),
                                forKey: NSString(string: "\(permissionType)"))
        permissionLock.unlock()
    }
    
    private func convertPhotoAuthorizationStatus(_ status: PHAuthorizationStatus) -> PermissionStatus {
        switch status {
        case .notDetermined: return .notDetermined
        case .restricted: return .restricted
        case .denied: return .denied
        case .authorized: return .authorized
        case .limited: return .limited
        @unknown default: return .notDetermined
        }
    }
    
    // MARK: - Observer Setup
    private func setupNotificationObservers() {
        let center = NotificationCenter.default
        
        observers.append(center.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.refreshPermissionCache()
        })
    }
    
    private func setupCameraObserver() {
        // Camera status changes would be monitored here
    }
    
    private func setupPhotoLibraryObserver() {
        PHPhotoLibrary.shared().register(self)
    }
    
    private func setupBiometricObserver() {
        // Biometric changes would be monitored here
    }
    
    private func setupMicrophoneObserver() {
        // Microphone status changes would be monitored here
    }
    
    private func setupLocationObserver() {
        // Location status changes would be monitored here
    }
    
    private func refreshPermissionCache() {
        permissionLock.lock()
        permissionCache.removeAllObjects()
        permissionLock.unlock()
    }
}

// MARK: - PHPhotoLibraryChangeObserver
extension PermissionModule: PHPhotoLibraryChangeObserver {
    func photoLibraryDidChange(_ changeInstance: PHChange) {
        updatePermissionCache(.photoLibrary, status: getCurrentPermissionStatus(.photoLibrary))
    }
}