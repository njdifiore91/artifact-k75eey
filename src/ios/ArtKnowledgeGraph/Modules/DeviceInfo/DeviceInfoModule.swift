import Foundation // iOS 14.0+
import UIKit // iOS 14.0+

// MARK: - Constants
private let kDeviceInfoErrorDomain = "com.artknowledgegraph.app.deviceinfo"
private let kMinimumScreenSize: CGFloat = 4.7
private let kDeviceInfoCacheTimeout: TimeInterval = 300 // 5 minutes

// MARK: - Error Types
enum DeviceInfoError: Error {
    case incompatibleDevice
    case insufficientScreenSize
    case securityCheckFailed
    case systemVersionInvalid
}

// MARK: - DeviceInfoModule Implementation
@objc(DeviceInfoModule)
final class DeviceInfoModule: NSObject {
    
    // MARK: - Properties
    private let device = UIDevice.current
    private let screen = UIScreen.main
    private let deviceInfoCache = NSCache<NSString, NSDictionary>()
    private let deviceInfoQueue = DispatchQueue(label: "com.artknowledgegraph.app.deviceinfo",
                                              qos: .userInitiated)
    
    // MARK: - Initialization
    override init() {
        super.init()
        deviceInfoCache.countLimit = 1
        device.isBatteryMonitoringEnabled = true
    }
    
    // MARK: - RCTBridgeModule Requirement
    @objc static func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    // MARK: - Public Methods
    @objc func getDeviceInfo(_ resolve: @escaping RCTPromiseResolveBlock,
                            reject: @escaping RCTPromiseRejectBlock) {
        deviceInfoQueue.async { [weak self] in
            guard let self = self else {
                reject(kDeviceInfoErrorDomain, "Module deallocated", nil)
                return
            }
            
            // Check cache first
            if let cachedInfo = self.deviceInfoCache.object(forKey: "deviceInfo" as NSString) {
                resolve(cachedInfo)
                return
            }
            
            // Validate minimum requirements
            guard self.validateMinimumRequirements() else {
                reject(kDeviceInfoErrorDomain, "Device does not meet minimum requirements", DeviceInfoError.incompatibleDevice)
                return
            }
            
            // Collect device information
            var deviceInfo: [String: Any] = [:]
            
            // Device identification
            deviceInfo["model"] = self.getDeviceModel()
            deviceInfo["systemName"] = self.device.systemName
            deviceInfo["systemVersion"] = self.device.systemVersion
            deviceInfo["identifierForVendor"] = self.device.identifierForVendor?.uuidString
            
            // Screen metrics
            let screenMetrics = self.getScreenMetrics()
            deviceInfo["screen"] = screenMetrics
            
            // Hardware capabilities
            deviceInfo["batteryLevel"] = self.device.batteryLevel
            deviceInfo["batteryState"] = self.getBatteryState()
            deviceInfo["processorCount"] = ProcessInfo.processInfo.processorCount
            deviceInfo["totalMemory"] = ProcessInfo.processInfo.physicalMemory
            deviceInfo["freeMemory"] = self.getFreeMemory()
            
            // Device orientation
            deviceInfo["orientation"] = self.getDeviceOrientation()
            deviceInfo["supportedOrientations"] = self.getSupportedOrientations()
            
            // Security status
            let securityInfo = self.getSecurityInfo()
            deviceInfo["security"] = securityInfo
            
            // System capabilities
            deviceInfo["capabilities"] = self.getSystemCapabilities()
            
            // Cache the results
            self.deviceInfoCache.setObject(deviceInfo as NSDictionary,
                                         forKey: "deviceInfo" as NSString)
            
            // Schedule cache invalidation
            DispatchQueue.global().asyncAfter(deadline: .now() + kDeviceInfoCacheTimeout) { [weak self] in
                self?.clearCache()
            }
            
            resolve(deviceInfo)
        }
    }
    
    @objc func getSystemVersion(_ resolve: @escaping RCTPromiseResolveBlock,
                               reject: @escaping RCTPromiseRejectBlock) {
        deviceInfoQueue.async { [weak self] in
            guard let self = self else {
                reject(kDeviceInfoErrorDomain, "Module deallocated", nil)
                return
            }
            
            let systemVersion = self.device.systemVersion
            let versionComponents = systemVersion.split(separator: ".").compactMap { Int($0) }
            
            guard versionComponents.count >= 2 else {
                reject(kDeviceInfoErrorDomain, "Invalid system version", DeviceInfoError.systemVersionInvalid)
                return
            }
            
            let versionInfo: [String: Any] = [
                "systemVersion": systemVersion,
                "majorVersion": versionComponents[0],
                "minorVersion": versionComponents[1],
                "patchVersion": versionComponents.count > 2 ? versionComponents[2] : 0,
                "buildNumber": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "",
                "isCompatible": versionComponents[0] >= 14 // iOS 14+ requirement
            ]
            
            resolve(versionInfo)
        }
    }
    
    @objc func isEmulator(_ resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
        deviceInfoQueue.async {
            #if targetEnvironment(simulator)
            let simulatorInfo: [String: Any] = [
                "isSimulator": true,
                "environment": "iOS Simulator",
                "processorType": ProcessInfo.processInfo.processorInfo
            ]
            resolve(simulatorInfo)
            #else
            resolve(["isSimulator": false])
            #endif
        }
    }
    
    @objc func clearCache() {
        deviceInfoQueue.async { [weak self] in
            self?.deviceInfoCache.removeAllObjects()
        }
    }
    
    // MARK: - Private Helper Methods
    private func validateMinimumRequirements() -> Bool {
        // Check iOS version
        let systemVersion = device.systemVersion.split(separator: ".").compactMap { Int($0) }
        guard systemVersion.first ?? 0 >= 14 else { return false }
        
        // Check screen size
        let screenSize = screen.bounds.size
        let screenInches = sqrt(pow(screenSize.width, 2) + pow(screenSize.height, 2)) / screen.scale / 163
        guard screenInches >= kMinimumScreenSize else { return false }
        
        return true
    }
    
    private func getDeviceModel() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let modelCode = withUnsafePointer(to: &systemInfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                ptr in String(validatingUTF8: ptr)
            }
        }
        return modelCode ?? "Unknown"
    }
    
    private func getScreenMetrics() -> [String: Any] {
        let screenBounds = screen.bounds
        let screenScale = screen.scale
        let nativeScale = screen.nativeScale
        
        return [
            "width": screenBounds.width,
            "height": screenBounds.height,
            "scale": screenScale,
            "nativeScale": nativeScale,
            "density": screenScale * 163, // PPI
            "safeAreaInsets": getSafeAreaInsets()
        ]
    }
    
    private func getSafeAreaInsets() -> [String: CGFloat] {
        guard let window = UIApplication.shared.windows.first else {
            return [:]
        }
        
        let safeArea = window.safeAreaInsets
        return [
            "top": safeArea.top,
            "bottom": safeArea.bottom,
            "left": safeArea.left,
            "right": safeArea.right
        ]
    }
    
    private func getBatteryState() -> String {
        switch device.batteryState {
        case .charging: return "charging"
        case .full: return "full"
        case .unplugged: return "unplugged"
        case .unknown: return "unknown"
        @unknown default: return "unknown"
        }
    }
    
    private func getFreeMemory() -> UInt64 {
        var pagesize: vm_size_t = 0
        var vmStats = vm_statistics64()
        var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64>.stride / MemoryLayout<integer_t>.stride)
        
        host_page_size(mach_host_self(), &pagesize)
        host_statistics64(mach_host_self(), HOST_VM_INFO64, &vmStats.withUnsafeMutableBytes { pointer in
            pointer.baseAddress!.assumingMemoryBound(to: integer_t.self)
        }, &count)
        
        let freeMemory = UInt64(vmStats.free_count) * UInt64(pagesize)
        return freeMemory
    }
    
    private func getDeviceOrientation() -> String {
        switch device.orientation {
        case .portrait: return "portrait"
        case .portraitUpsideDown: return "portraitUpsideDown"
        case .landscapeLeft: return "landscapeLeft"
        case .landscapeRight: return "landscapeRight"
        case .faceUp: return "faceUp"
        case .faceDown: return "faceDown"
        case .unknown: return "unknown"
        @unknown default: return "unknown"
        }
    }
    
    private func getSupportedOrientations() -> [String] {
        guard let supportedOrientations = Bundle.main.object(forInfoDictionaryKey: "UISupportedInterfaceOrientations") as? [String] else {
            return []
        }
        return supportedOrientations
    }
    
    private func getSecurityInfo() -> [String: Any] {
        let securityManager = SecurityManager.shared
        
        return [
            "biometricCapabilities": securityManager.checkBiometricCapabilities(),
            "isJailbroken": securityManager.isDeviceJailbroken(),
            "isPasscodeSet": LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
        ]
    }
    
    private func getSystemCapabilities() -> [String: Any] {
        return [
            "hasCamera": UIImagePickerController.isSourceTypeAvailable(.camera),
            "hasGPS": CLLocationManager.locationServicesEnabled(),
            "hasNotifications": UIApplication.shared.isRegisteredForRemoteNotifications,
            "hasBiometrics": LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        ]
    }
}