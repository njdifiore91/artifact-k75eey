import Foundation // iOS 14.0+

// MARK: - Constants
private let kMaxStorageSize: Int = 200 * 1024 * 1024 // 200MB total storage limit
private let kCacheStorageKey: String = "com.artknowledgegraph.app.cache"
private let kDefaultExpiration: TimeInterval = 24 * 60 * 60 // 24 hours
private let kStorageQueueLabel: String = "com.artknowledgegraph.app.storage"

// MARK: - Storage Error Types
enum StorageError: Error {
    case insufficientSpace
    case invalidData
    case dataNotFound
    case securityError
    case storageCorrupted
    case expirationError
}

// MARK: - Storage Metrics
private struct StorageMetrics {
    var totalSize: Int = 0
    var itemCount: Int = 0
    var lastCleanup: Date = Date()
    
    mutating func update(size: Int, count: Int) {
        totalSize = size
        itemCount = count
        lastCleanup = Date()
    }
}

// MARK: - Cache Metadata
private struct CacheMetadata: Codable {
    let key: String
    let size: Int
    let createdAt: Date
    let expiresAt: Date?
    let isEncrypted: Bool
    let storageType: StorageType
    
    enum StorageType: String, Codable {
        case userDefaults
        case fileSystem
    }
}

// MARK: - LocalStorage Implementation
@objc final class LocalStorage: NSObject {
    
    // MARK: - Properties
    private let defaults: UserDefaults
    private let fileManager: FileManager
    private let storageQueue: DispatchQueue
    private let memoryCache: NSCache<NSString, NSData>
    private var metrics: StorageMetrics
    
    // MARK: - Singleton
    @objc static let shared = LocalStorage()
    
    private override init() {
        self.defaults = UserDefaults.standard
        self.fileManager = FileManager.default
        self.storageQueue = DispatchQueue(label: kStorageQueueLabel, qos: .userInitiated)
        self.memoryCache = NSCache<NSString, NSData>()
        self.metrics = StorageMetrics()
        
        super.init()
        
        setupStorage()
    }
    
    private func setupStorage() {
        memoryCache.totalCostLimit = 50 * 1024 * 1024 // 50MB memory cache limit
        calculateStorageSize()
        scheduleCleanup()
    }
    
    // MARK: - Public Methods
    @objc func saveData(_ data: Data, 
                       forKey key: String, 
                       expiration: TimeInterval? = kDefaultExpiration,
                       encrypt: Bool = false) -> Result<Void, StorageError> {
        return storageQueue.sync {
            // Check available space
            guard (metrics.totalSize + data.count) <= kMaxStorageSize else {
                return .failure(.insufficientSpace)
            }
            
            do {
                let finalData: Data
                if encrypt {
                    guard case .success(let encryptedData) = SecurityManager.shared.encryptData(data) else {
                        return .failure(.securityError)
                    }
                    finalData = encryptedData
                } else {
                    finalData = data
                }
                
                // Create metadata
                let expirationDate = expiration.map { Date().addingTimeInterval($0) }
                let metadata = CacheMetadata(
                    key: key,
                    size: finalData.count,
                    createdAt: Date(),
                    expiresAt: expirationDate,
                    isEncrypted: encrypt,
                    storageType: finalData.count > 100_000 ? .fileSystem : .userDefaults
                )
                
                // Store data based on size
                if metadata.storageType == .fileSystem {
                    try storeInFileSystem(finalData, metadata: metadata)
                } else {
                    storeInUserDefaults(finalData, metadata: metadata)
                }
                
                // Update memory cache
                memoryCache.setObject(finalData as NSData, forKey: key as NSString)
                
                // Update metrics
                calculateStorageSize()
                
                return .success(())
            } catch {
                return .failure(.storageCorrupted)
            }
        }
    }
    
    @objc func getData(forKey key: String, 
                      checkExpiration: Bool = true) -> Result<Data?, StorageError> {
        return storageQueue.sync {
            // Check memory cache first
            if let cachedData = memoryCache.object(forKey: key as NSString) {
                return .success(cachedData as Data)
            }
            
            // Get metadata
            guard let metadata = getMetadata(forKey: key) else {
                return .success(nil)
            }
            
            // Check expiration
            if checkExpiration, 
               let expirationDate = metadata.expiresAt,
               expirationDate < Date() {
                _ = removeData(forKey: key)
                return .success(nil)
            }
            
            do {
                let data: Data
                if metadata.storageType == .fileSystem {
                    data = try loadFromFileSystem(key: key)
                } else {
                    guard let storedData = defaults.data(forKey: dataKey(for: key)) else {
                        return .success(nil)
                    }
                    data = storedData
                }
                
                // Decrypt if necessary
                if metadata.isEncrypted {
                    guard case .success(let decryptedData) = SecurityManager.shared.decryptData(data) else {
                        return .failure(.securityError)
                    }
                    return .success(decryptedData)
                }
                
                // Cache in memory
                memoryCache.setObject(data as NSData, forKey: key as NSString)
                
                return .success(data)
            } catch {
                return .failure(.dataNotFound)
            }
        }
    }
    
    @objc func removeData(forKey key: String) -> Result<Void, StorageError> {
        return storageQueue.sync {
            guard let metadata = getMetadata(forKey: key) else {
                return .success(())
            }
            
            // Remove from memory cache
            memoryCache.removeObject(forKey: key as NSString)
            
            // Remove from storage
            if metadata.storageType == .fileSystem {
                do {
                    try fileManager.removeItem(at: fileURL(for: key))
                } catch {
                    return .failure(.storageCorrupted)
                }
            } else {
                defaults.removeObject(forKey: dataKey(for: key))
            }
            
            // Remove metadata
            removeMetadata(forKey: key)
            
            // Update metrics
            calculateStorageSize()
            
            return .success(())
        }
    }
    
    @objc func clearStorage() -> Result<Void, StorageError> {
        return storageQueue.sync {
            // Clear memory cache
            memoryCache.removeAllObjects()
            
            // Clear all metadata
            defaults.removeObject(forKey: kCacheStorageKey)
            
            // Clear UserDefaults storage
            if let metadata = getAllMetadata() {
                for item in metadata where item.storageType == .userDefaults {
                    defaults.removeObject(forKey: dataKey(for: item.key))
                }
            }
            
            // Clear file system storage
            do {
                let storageURL = try fileManager.url(for: .cachesDirectory,
                                                   in: .userDomainMask,
                                                   appropriateFor: nil,
                                                   create: false)
                try fileManager.removeItem(at: storageURL)
                try fileManager.createDirectory(at: storageURL,
                                             withIntermediateDirectories: true,
                                             attributes: nil)
            } catch {
                return .failure(.storageCorrupted)
            }
            
            // Reset metrics
            metrics = StorageMetrics()
            
            return .success(())
        }
    }
    
    // MARK: - Private Methods
    @objc private func clearExpiredCache() {
        storageQueue.async { [weak self] in
            guard let self = self else { return }
            
            let now = Date()
            guard let metadata = self.getAllMetadata() else { return }
            
            for item in metadata {
                if let expirationDate = item.expiresAt, expirationDate < now {
                    _ = self.removeData(forKey: item.key)
                }
            }
            
            self.calculateStorageSize()
            self.scheduleCleanup()
        }
    }
    
    @objc private func calculateStorageSize() -> Int {
        var totalSize = 0
        
        if let metadata = getAllMetadata() {
            for item in metadata {
                totalSize += item.size
            }
        }
        
        metrics.update(size: totalSize, count: getAllMetadata()?.count ?? 0)
        return totalSize
    }
    
    private func scheduleCleanup() {
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 3600) { [weak self] in
            self?.clearExpiredCache()
        }
    }
    
    // MARK: - Storage Helpers
    private func storeInFileSystem(_ data: Data, metadata: CacheMetadata) throws {
        let url = fileURL(for: metadata.key)
        try data.write(to: url, options: .atomicWrite)
        updateMetadata(metadata)
    }
    
    private func storeInUserDefaults(_ data: Data, metadata: CacheMetadata) {
        defaults.set(data, forKey: dataKey(for: metadata.key))
        updateMetadata(metadata)
    }
    
    private func loadFromFileSystem(key: String) throws -> Data {
        let url = fileURL(for: key)
        return try Data(contentsOf: url)
    }
    
    private func fileURL(for key: String) -> URL {
        let filename = key.addingPercentEncoding(withAllowedCharacters: .urlHostAllowed) ?? key
        return try! fileManager.url(for: .cachesDirectory,
                                  in: .userDomainMask,
                                  appropriateFor: nil,
                                  create: true)
            .appendingPathComponent(filename)
    }
    
    private func dataKey(for key: String) -> String {
        return "data_\(key)"
    }
    
    // MARK: - Metadata Management
    private func getAllMetadata() -> [CacheMetadata]? {
        guard let data = defaults.data(forKey: kCacheStorageKey),
              let metadata = try? JSONDecoder().decode([CacheMetadata].self, from: data) else {
            return nil
        }
        return metadata
    }
    
    private func getMetadata(forKey key: String) -> CacheMetadata? {
        return getAllMetadata()?.first { $0.key == key }
    }
    
    private func updateMetadata(_ metadata: CacheMetadata) {
        var allMetadata = getAllMetadata() ?? []
        allMetadata.removeAll { $0.key == metadata.key }
        allMetadata.append(metadata)
        if let encoded = try? JSONEncoder().encode(allMetadata) {
            defaults.set(encoded, forKey: kCacheStorageKey)
        }
    }
    
    private func removeMetadata(forKey key: String) {
        var allMetadata = getAllMetadata() ?? []
        allMetadata.removeAll { $0.key == key }
        if let encoded = try? JSONEncoder().encode(allMetadata) {
            defaults.set(encoded, forKey: kCacheStorageKey)
        }
    }
}