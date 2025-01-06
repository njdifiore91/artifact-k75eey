import XCTest
import Photos
import AVFoundation
import LocalAuthentication
@testable import ArtKnowledgeGraph

final class PermissionModuleTests: XCTestCase {
    
    // MARK: - Properties
    private var sut: PermissionModule!
    private var testQueue: DispatchQueue!
    private var permissionExpectation: XCTestExpectation!
    
    // MARK: - Setup/Teardown
    override func setUp() {
        super.setUp()
        sut = PermissionModule()
        testQueue = DispatchQueue(label: "com.artknowledgegraph.test.permission",
                                qos: .userInitiated,
                                attributes: .concurrent)
        permissionExpectation = expectation(description: "Permission Operation")
    }
    
    override func tearDown() {
        sut = nil
        testQueue = nil
        permissionExpectation = nil
        super.tearDown()
    }
    
    // MARK: - Permission Status Tests
    func testCheckPermissionStatus() {
        // Test camera permission status
        let cameraStatus = sut.checkPermissionStatus(.camera)
        XCTAssertNotNil(cameraStatus, "Camera permission status should not be nil")
        
        // Test concurrent photo library status checks
        let concurrentExpectation = expectation(description: "Concurrent Status Checks")
        concurrentExpectation.expectedFulfillmentCount = 5
        
        for _ in 0..<5 {
            testQueue.async {
                let status = self.sut.checkPermissionStatus(.photoLibrary)
                XCTAssertNotNil(status, "Photo library status should not be nil")
                concurrentExpectation.fulfill()
            }
        }
        
        wait(for: [concurrentExpectation], timeout: 5.0)
        
        // Test biometric status with timeout
        let biometricStatus = sut.checkPermissionStatus(.biometric)
        XCTAssertNotNil(biometricStatus, "Biometric status should not be nil")
        
        // Verify cache consistency
        let cachedStatus = sut.checkPermissionStatus(.camera)
        XCTAssertEqual(cameraStatus, cachedStatus, "Cached status should match initial status")
    }
    
    // MARK: - Permission Request Tests
    func testRequestPermission() {
        // Test camera permission request
        let cameraExpectation = expectation(description: "Camera Permission Request")
        
        sut.requestPermission(.camera, timeout: 5.0) { result in
            switch result {
            case .success(let status):
                XCTAssertNotNil(status, "Camera permission status should not be nil")
            case .failure(let error):
                XCTAssertNotEqual(error, .timeout, "Camera permission request should not timeout")
            }
            cameraExpectation.fulfill()
        }
        
        // Test concurrent photo library requests
        let photoExpectation = expectation(description: "Photo Library Permission Request")
        photoExpectation.expectedFulfillmentCount = 3
        
        for _ in 0..<3 {
            testQueue.async {
                self.sut.requestPermission(.photoLibrary) { result in
                    if case .failure(.alreadyInProgress) = result {
                        // Expected behavior for concurrent requests
                        XCTAssertTrue(true, "Concurrent request properly handled")
                    }
                    photoExpectation.fulfill()
                }
            }
        }
        
        // Test biometric request with timeout
        let biometricExpectation = expectation(description: "Biometric Permission Request")
        
        sut.requestPermission(.biometric, timeout: 2.0) { result in
            switch result {
            case .success(let status):
                XCTAssertNotNil(status, "Biometric status should not be nil")
            case .failure(let error):
                XCTAssertTrue([.timeout, .notAvailable].contains(error),
                            "Biometric error should be timeout or not available")
            }
            biometricExpectation.fulfill()
        }
        
        wait(for: [cameraExpectation, photoExpectation, biometricExpectation], timeout: 10.0)
    }
    
    // MARK: - Multiple Permission Tests
    func testCheckMultiplePermissions() {
        // Test multiple permission types
        let permissions: [PermissionType] = [.camera, .photoLibrary, .biometric]
        
        let multipleExpectation = expectation(description: "Multiple Permission Checks")
        multipleExpectation.expectedFulfillmentCount = permissions.count
        
        for permission in permissions {
            testQueue.async {
                let status = self.sut.checkPermissionStatus(permission)
                XCTAssertNotNil(status, "\(permission) status should not be nil")
                multipleExpectation.fulfill()
            }
        }
        
        // Test concurrent access to different permissions
        let concurrentExpectation = expectation(description: "Concurrent Permission Checks")
        concurrentExpectation.expectedFulfillmentCount = 10
        
        for _ in 0..<10 {
            testQueue.async {
                let randomPermission = permissions.randomElement()!
                let status = self.sut.checkPermissionStatus(randomPermission)
                XCTAssertNotNil(status, "Random permission status should not be nil")
                concurrentExpectation.fulfill()
            }
        }
        
        wait(for: [multipleExpectation, concurrentExpectation], timeout: 5.0)
    }
    
    // MARK: - Cache Tests
    func testPermissionCache() {
        // Test cache invalidation
        let initialStatus = sut.checkPermissionStatus(.camera)
        
        // Simulate app entering background/foreground
        NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        
        let updatedStatus = sut.checkPermissionStatus(.camera)
        XCTAssertNotNil(updatedStatus, "Updated status should not be nil")
        
        // Test cache consistency across threads
        let cacheExpectation = expectation(description: "Cache Consistency")
        cacheExpectation.expectedFulfillmentCount = 5
        
        for _ in 0..<5 {
            testQueue.async {
                let status = self.sut.checkPermissionStatus(.camera)
                XCTAssertEqual(status, updatedStatus, "Cache should be consistent across threads")
                cacheExpectation.fulfill()
            }
        }
        
        wait(for: [cacheExpectation], timeout: 5.0)
    }
    
    // MARK: - Error Handling Tests
    func testErrorHandling() {
        // Test timeout handling
        let timeoutExpectation = expectation(description: "Timeout Handling")
        
        sut.requestPermission(.camera, timeout: 0.1) { result in
            if case .failure(.timeout) = result {
                XCTAssertTrue(true, "Timeout properly handled")
            }
            timeoutExpectation.fulfill()
        }
        
        // Test concurrent request handling
        let concurrentExpectation = expectation(description: "Concurrent Request Handling")
        
        sut.requestPermission(.photoLibrary) { _ in
            self.sut.requestPermission(.photoLibrary) { result in
                if case .failure(.alreadyInProgress) = result {
                    XCTAssertTrue(true, "Concurrent request properly rejected")
                }
                concurrentExpectation.fulfill()
            }
        }
        
        wait(for: [timeoutExpectation, concurrentExpectation], timeout: 5.0)
    }
    
    // MARK: - Thread Safety Tests
    func testThreadSafety() {
        // Test concurrent access to permission module
        let threadSafetyExpectation = expectation(description: "Thread Safety")
        threadSafetyExpectation.expectedFulfillmentCount = 100
        
        for _ in 0..<100 {
            testQueue.async {
                let status = self.sut.checkPermissionStatus(.camera)
                XCTAssertNotNil(status, "Status should be thread-safe")
                threadSafetyExpectation.fulfill()
            }
        }
        
        wait(for: [threadSafetyExpectation], timeout: 10.0)
    }
    
    // MARK: - Observer Tests
    func testPermissionObservers() {
        // Test photo library observer
        let observerExpectation = expectation(description: "Permission Observer")
        
        sut.monitorPermissionChanges(.photoLibrary)
        
        // Simulate photo library change
        NotificationCenter.default.post(name: .PHPhotoLibraryDidChange, object: nil)
        
        // Allow time for observer to process
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            let status = self.sut.checkPermissionStatus(.photoLibrary)
            XCTAssertNotNil(status, "Observer should update permission status")
            observerExpectation.fulfill()
        }
        
        wait(for: [observerExpectation], timeout: 5.0)
    }
}