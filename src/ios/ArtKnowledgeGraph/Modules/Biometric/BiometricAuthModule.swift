import Foundation // iOS 14.0+
import LocalAuthentication // iOS 14.0+
import React // 0.70.0+

// MARK: - Constants
private let kBiometricAuthReason = "Authenticate to access Art Knowledge Graph"
private let kBiometricErrorDomain = "com.artknowledgegraph.app.biometric"
private let kMaxAuthAttempts = 3
private let kAuthQueueLabel = "com.artknowledgegraph.app.biometric.queue"

// MARK: - Error Types
private enum BiometricError: Int {
    case deviceNotSecure = 10001
    case tooManyAttempts = 10002
    case notAvailable = 10003
    case notEnrolled = 10004
    case cancelled = 10005
    case systemError = 10006
    case authenticationFailed = 10007
}

@objc
@objcMembers
class BiometricAuthModule: NSObject {
    
    // MARK: - Properties
    private let biometricContext: LAContext
    private let authQueue: DispatchQueue
    private var authAttempts: Int
    private var isContextValid: Bool
    private var lastError: NSError?
    
    // MARK: - Initialization
    override init() {
        self.biometricContext = LAContext()
        self.authQueue = DispatchQueue(label: kAuthQueueLabel, qos: .userInitiated)
        self.authAttempts = 0
        self.isContextValid = true
        super.init()
        
        configureBiometricContext()
    }
    
    private func configureBiometricContext() {
        biometricContext.localizedFallbackTitle = NSLocalizedString("Use Passcode", comment: "")
        biometricContext.localizedCancelTitle = NSLocalizedString("Cancel", comment: "")
        biometricContext.touchIDAuthenticationAllowableReuseDuration = 0
    }
    
    // MARK: - React Native Module Requirements
    static func moduleName() -> String {
        return "BiometricAuthModule"
    }
    
    // MARK: - Public Methods
    func authenticateUser(_ resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
        authQueue.async { [weak self] in
            guard let self = self else {
                reject("ERROR", "Module deallocated", nil)
                return
            }
            
            // Check device integrity
            guard SecurityManager.shared.validateDeviceIntegrity() else {
                self.handleError(.deviceNotSecure, reject: reject)
                return
            }
            
            // Check attempt limits
            guard self.authAttempts < kMaxAuthAttempts else {
                self.handleError(.tooManyAttempts, reject: reject)
                return
            }
            
            // Verify context validity
            guard self.isContextValid else {
                self.resetAuthenticationState()
                self.configureBiometricContext()
            }
            
            // Increment attempt counter
            self.authAttempts += 1
            
            // Perform biometric authentication
            SecurityManager.shared.authenticateWithBiometrics(
                reason: kBiometricAuthReason,
                policy: SecurityPolicy()
            ) { result in
                switch result {
                case .success(let authenticated):
                    if authenticated {
                        // Encrypt successful authentication result
                        if let encryptedResult = SecurityManager.shared.encryptAuthenticationResult() {
                            self.authAttempts = 0
                            resolve(["success": true, "token": encryptedResult])
                        } else {
                            self.handleError(.systemError, reject: reject)
                        }
                    } else {
                        self.handleError(.authenticationFailed, reject: reject)
                    }
                    
                case .failure(let error):
                    self.lastError = error as NSError
                    self.handleError(.systemError, reject: reject)
                }
            }
        }
    }
    
    func isBiometricsAvailable(_ resolve: @escaping RCTPromiseResolveBlock,
                              reject: @escaping RCTPromiseRejectBlock) {
        authQueue.async { [weak self] in
            guard let self = self else {
                reject("ERROR", "Module deallocated", nil)
                return
            }
            
            var error: NSError?
            let canEvaluate = self.biometricContext.canEvaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                error: &error
            )
            
            if canEvaluate {
                let biometryType = self.biometricContext.biometryType
                let response: [String: Any] = [
                    "available": true,
                    "biometryType": biometryType.rawValue,
                    "enrolled": true
                ]
                resolve(response)
            } else {
                if let error = error as? LAError {
                    switch error.code {
                    case .biometryNotEnrolled:
                        resolve(["available": true, "enrolled": false])
                    case .biometryNotAvailable:
                        self.handleError(.notAvailable, reject: reject)
                    default:
                        self.handleError(.systemError, reject: reject)
                    }
                } else {
                    self.handleError(.systemError, reject: reject)
                }
            }
        }
    }
    
    // MARK: - Private Methods
    private func handleError(_ error: BiometricError, reject: RCTPromiseRejectBlock) {
        let errorMessage: String
        
        switch error {
        case .deviceNotSecure:
            errorMessage = "Device security is compromised"
        case .tooManyAttempts:
            errorMessage = "Too many authentication attempts"
        case .notAvailable:
            errorMessage = "Biometric authentication not available"
        case .notEnrolled:
            errorMessage = "No biometric data enrolled"
        case .cancelled:
            errorMessage = "Authentication cancelled"
        case .systemError:
            errorMessage = "System error occurred"
        case .authenticationFailed:
            errorMessage = "Authentication failed"
        }
        
        reject(
            String(error.rawValue),
            errorMessage,
            lastError ?? NSError(domain: kBiometricErrorDomain, code: error.rawValue, userInfo: nil)
        )
    }
    
    private func resetAuthenticationState() {
        authAttempts = 0
        isContextValid = true
        lastError = nil
        biometricContext.invalidate()
    }
}