import XCTest // iOS 14.0+
@testable import ArtKnowledgeGraph

final class DeviceInfoModuleTests: XCTestCase {
    
    // MARK: - Properties
    private var deviceInfoModule: DeviceInfoModule!
    private var expectations: [XCTestExpectation]!
    
    // MARK: - Setup/Teardown
    override func setUp() {
        super.setUp()
        deviceInfoModule = DeviceInfoModule()
        expectations = []
    }
    
    override func tearDown() {
        deviceInfoModule = nil
        expectations.removeAll()
        super.tearDown()
    }
    
    // MARK: - Test Device Info
    func testGetDeviceInfo() {
        // Create expectation
        let deviceInfoExpectation = expectation(description: "Device info retrieved")
        expectations.append(deviceInfoExpectation)
        
        // Test device info retrieval
        deviceInfoModule.getDeviceInfo({ (result) in
            guard let deviceInfo = result as? [String: Any] else {
                XCTFail("Invalid device info format")
                return
            }
            
            // Verify device model
            XCTAssertNotNil(deviceInfo["model"] as? String, "Device model should be available")
            
            // Verify iOS version meets minimum requirement
            if let systemVersion = deviceInfo["systemVersion"] as? String {
                let versionComponents = systemVersion.split(separator: ".").compactMap { Int($0) }
                XCTAssertGreaterThanOrEqual(versionComponents[0], 14, "iOS version should be 14 or higher")
            } else {
                XCTFail("System version not available")
            }
            
            // Verify screen metrics
            if let screen = deviceInfo["screen"] as? [String: Any] {
                let width = screen["width"] as? CGFloat ?? 0
                let height = screen["height"] as? CGFloat ?? 0
                let scale = screen["scale"] as? CGFloat ?? 0
                
                // Calculate screen size in inches (4.7" minimum)
                let screenInches = sqrt(pow(width, 2) + pow(height, 2)) / scale / 163
                XCTAssertGreaterThanOrEqual(screenInches, 4.7, "Screen size should be at least 4.7 inches")
                
                // Verify safe area insets
                XCTAssertNotNil(screen["safeAreaInsets"] as? [String: CGFloat], "Safe area insets should be available")
            } else {
                XCTFail("Screen metrics not available")
            }
            
            // Verify device capabilities
            if let capabilities = deviceInfo["capabilities"] as? [String: Any] {
                XCTAssertNotNil(capabilities["hasCamera"] as? Bool, "Camera capability should be defined")
                XCTAssertNotNil(capabilities["hasGPS"] as? Bool, "GPS capability should be defined")
                XCTAssertNotNil(capabilities["hasBiometrics"] as? Bool, "Biometric capability should be defined")
            } else {
                XCTFail("Device capabilities not available")
            }
            
            // Verify hardware info
            XCTAssertNotNil(deviceInfo["batteryLevel"] as? Float, "Battery level should be available")
            XCTAssertNotNil(deviceInfo["processorCount"] as? Int, "Processor count should be available")
            XCTAssertNotNil(deviceInfo["totalMemory"] as? UInt64, "Total memory should be available")
            XCTAssertNotNil(deviceInfo["freeMemory"] as? UInt64, "Free memory should be available")
            
            // Verify device identifier
            XCTAssertNotNil(deviceInfo["identifierForVendor"] as? String, "Device identifier should be available")
            
            deviceInfoExpectation.fulfill()
        }) { (error) in
            XCTFail("Device info retrieval failed: \(error.localizedDescription)")
        }
        
        waitForExpectations(timeout: 5, handler: nil)
    }
    
    // MARK: - Test System Version
    func testGetSystemVersion() {
        let versionExpectation = expectation(description: "System version retrieved")
        expectations.append(versionExpectation)
        
        deviceInfoModule.getSystemVersion({ (result) in
            guard let versionInfo = result as? [String: Any] else {
                XCTFail("Invalid version info format")
                return
            }
            
            // Verify version components
            XCTAssertNotNil(versionInfo["systemVersion"] as? String, "System version string should be available")
            
            if let majorVersion = versionInfo["majorVersion"] as? Int {
                XCTAssertGreaterThanOrEqual(majorVersion, 14, "Major version should be 14 or higher")
            } else {
                XCTFail("Major version not available")
            }
            
            XCTAssertNotNil(versionInfo["minorVersion"] as? Int, "Minor version should be available")
            XCTAssertNotNil(versionInfo["patchVersion"] as? Int, "Patch version should be available")
            XCTAssertNotNil(versionInfo["buildNumber"] as? String, "Build number should be available")
            
            // Verify compatibility flag
            XCTAssertTrue(versionInfo["isCompatible"] as? Bool ?? false, "Device should be compatible")
            
            versionExpectation.fulfill()
        }) { (error) in
            XCTFail("System version retrieval failed: \(error.localizedDescription)")
        }
        
        waitForExpectations(timeout: 5, handler: nil)
    }
    
    // MARK: - Test Emulator Detection
    func testIsEmulator() {
        let emulatorExpectation = expectation(description: "Emulator status retrieved")
        expectations.append(emulatorExpectation)
        
        deviceInfoModule.isEmulator({ (result) in
            guard let simulatorInfo = result as? [String: Any] else {
                XCTFail("Invalid simulator info format")
                return
            }
            
            // Verify simulator status
            XCTAssertNotNil(simulatorInfo["isSimulator"] as? Bool, "Simulator status should be available")
            
            #if targetEnvironment(simulator)
            XCTAssertTrue(simulatorInfo["isSimulator"] as? Bool ?? false, "Should be identified as simulator")
            XCTAssertEqual(simulatorInfo["environment"] as? String, "iOS Simulator", "Should be iOS Simulator environment")
            XCTAssertNotNil(simulatorInfo["processorType"], "Processor type should be available")
            #else
            XCTAssertFalse(simulatorInfo["isSimulator"] as? Bool ?? true, "Should be identified as physical device")
            #endif
            
            emulatorExpectation.fulfill()
        }) { (error) in
            XCTFail("Emulator detection failed: \(error.localizedDescription)")
        }
        
        waitForExpectations(timeout: 5, handler: nil)
    }
    
    // MARK: - Test Device Capabilities
    func testDeviceCapabilities() {
        let capabilitiesExpectation = expectation(description: "Device capabilities retrieved")
        expectations.append(capabilitiesExpectation)
        
        deviceInfoModule.getDeviceInfo({ (result) in
            guard let deviceInfo = result as? [String: Any],
                  let capabilities = deviceInfo["capabilities"] as? [String: Any],
                  let security = deviceInfo["security"] as? [String: Any] else {
                XCTFail("Invalid capabilities format")
                return
            }
            
            // Verify biometric capabilities
            XCTAssertNotNil(security["biometricCapabilities"], "Biometric capabilities should be defined")
            XCTAssertNotNil(security["isPasscodeSet"], "Passcode status should be defined")
            
            // Verify system capabilities
            XCTAssertNotNil(capabilities["hasCamera"], "Camera capability should be defined")
            XCTAssertNotNil(capabilities["hasGPS"], "GPS capability should be defined")
            XCTAssertNotNil(capabilities["hasNotifications"], "Notification capability should be defined")
            XCTAssertNotNil(capabilities["hasBiometrics"], "Biometric capability should be defined")
            
            capabilitiesExpectation.fulfill()
        }) { (error) in
            XCTFail("Capabilities retrieval failed: \(error.localizedDescription)")
        }
        
        waitForExpectations(timeout: 5, handler: nil)
    }
}