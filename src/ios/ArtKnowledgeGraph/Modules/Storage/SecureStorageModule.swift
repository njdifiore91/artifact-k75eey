import Foundation // iOS 14.0+
import React // 0.70.0+

// MARK: - Constants
private let kModuleName = "SecureStorageModule"
private let kErrorDomain = "com.artknowledgegraph.app.storage"
private let kStorageQueueLabel = "com.artknowledgegraph.app.storage.queue"
private let kSecureStorageErrorCodes = [
    "invalidInput": 1001,
    "encryptionFailed": 1002,
    "decryptionFailed": 1003,
    "itemNotFound": 1004,
    "deletionFailed": 1005
]

// MARK: - SecureStorageModule Implementation
@objc
@objcMembers
final class SecureStorageModule: NSObject {
    
    // MARK: - Properties
    private let storageQueue: DispatchQueue
    private let operationLock: NSLock
    private let securityManager: SecurityManager
    
    // MARK: - Initialization
    override init() {
        self.storageQueue = DispatchQueue(
            label: kStorageQueueLabel,
            qos: .userInitiated,
            attributes: [],
            autoreleaseFrequency: .workItem,
            target: nil
        )
        self.operationLock = NSLock()
        self.securityManager = SecurityManager.shared
        
        super.init()
        
        // Register for memory pressure notifications
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMemoryWarning),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
    
    // MARK: - React Native Required Methods
    @objc
    static func moduleName() -> String {
        return kModuleName
    }
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    // MARK: - Public Methods
    @objc
    func saveSecureData(_ key: String,
                       data: String,
                       resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
        guard !key.isEmpty, !data.isEmpty else {
            reject(
                String(kSecureStorageErrorCodes["invalidInput"]!),
                "Key and data must not be empty",
                NSError(domain: kErrorDomain, code: kSecureStorageErrorCodes["invalidInput"]!)
            )
            return
        }
        
        storageQueue.async { [weak self] in
            guard let self = self else { return }
            
            self.operationLock.lock()
            autoreleasepool {
                guard let dataToStore = data.data(using: .utf8) else {
                    self.operationLock.unlock()
                    reject(
                        String(kSecureStorageErrorCodes["encryptionFailed"]!),
                        "Failed to encode data",
                        NSError(domain: kErrorDomain, code: kSecureStorageErrorCodes["encryptionFailed"]!)
                    )
                    return
                }
                
                let result = self.securityManager.storeSecureItem(
                    dataToStore,
                    key: key,
                    accessLevel: .whenUnlockedThisDeviceOnly
                )
                
                switch result {
                case .success:
                    // Sanitize sensitive data from memory
                    self.securityManager.sanitizeMemory()
                    self.operationLock.unlock()
                    resolve(true)
                    
                case .failure(let error):
                    self.operationLock.unlock()
                    reject(
                        String(kSecureStorageErrorCodes["encryptionFailed"]!),
                        error.localizedDescription,
                        error as NSError
                    )
                }
            }
        }
    }
    
    @objc
    func getSecureData(_ key: String,
                      resolve: @escaping RCTPromiseResolveBlock,
                      reject: @escaping RCTPromiseRejectBlock) {
        guard !key.isEmpty else {
            reject(
                String(kSecureStorageErrorCodes["invalidInput"]!),
                "Key must not be empty",
                NSError(domain: kErrorDomain, code: kSecureStorageErrorCodes["invalidInput"]!)
            )
            return
        }
        
        storageQueue.async { [weak self] in
            guard let self = self else { return }
            
            self.operationLock.lock()
            autoreleasepool {
                let result = self.securityManager.retrieveSecureItem(
                    key: key,
                    accessLevel: .whenUnlockedThisDeviceOnly
                )
                
                switch result {
                case .success(let data):
                    guard let data = data else {
                        self.operationLock.unlock()
                        reject(
                            String(kSecureStorageErrorCodes["itemNotFound"]!),
                            "Item not found for key: \(key)",
                            NSError(domain: kErrorDomain, code: kSecureStorageErrorCodes["itemNotFound"]!)
                        )
                        return
                    }
                    
                    guard let stringData = String(data: data, encoding: .utf8) else {
                        self.operationLock.unlock()
                        reject(
                            String(kSecureStorageErrorCodes["decryptionFailed"]!),
                            "Failed to decode data",
                            NSError(domain: kErrorDomain, code: kSecureStorageErrorCodes["decryptionFailed"]!)
                        )
                        return
                    }
                    
                    // Sanitize sensitive data from memory
                    self.securityManager.sanitizeMemory()
                    self.operationLock.unlock()
                    resolve(stringData)
                    
                case .failure(let error):
                    self.operationLock.unlock()
                    reject(
                        String(kSecureStorageErrorCodes["decryptionFailed"]!),
                        error.localizedDescription,
                        error as NSError
                    )
                }
            }
        }
    }
    
    @objc
    func removeSecureData(_ key: String,
                         resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
        guard !key.isEmpty else {
            reject(
                String(kSecureStorageErrorCodes["invalidInput"]!),
                "Key must not be empty",
                NSError(domain: kErrorDomain, code: kSecureStorageErrorCodes["invalidInput"]!)
            )
            return
        }
        
        storageQueue.async { [weak self] in
            guard let self = self else { return }
            
            self.operationLock.lock()
            
            let result = self.securityManager.removeSecureItem(key: key)
            
            switch result {
            case .success:
                self.operationLock.unlock()
                resolve(true)
                
            case .failure(let error):
                self.operationLock.unlock()
                reject(
                    String(kSecureStorageErrorCodes["deletionFailed"]!),
                    error.localizedDescription,
                    error as NSError
                )
            }
        }
    }
    
    // MARK: - Memory Management
    @objc
    private func handleMemoryWarning() {
        storageQueue.async { [weak self] in
            guard let self = self else { return }
            
            self.operationLock.lock()
            autoreleasepool {
                self.securityManager.sanitizeMemory()
            }
            self.operationLock.unlock()
        }
    }
}