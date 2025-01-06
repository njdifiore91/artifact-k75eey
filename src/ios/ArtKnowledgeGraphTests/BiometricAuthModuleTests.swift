import XCTest // iOS 14.0+
import LocalAuthentication // iOS 14.0+
@testable import ArtKnowledgeGraph

// MARK: - Constants
private let kTestBiometricReason = "Test biometric authentication"
private let kTestTimeout: TimeInterval = 5.0

final class BiometricAuthModuleTests: XCTestCase {
    
    // MARK: - Properties
    private var sut: BiometricAuthModule!
    private var mockBiometricContext: LAContext!
    private var mockSecurityManager: SecurityManager!
    private var authExpectation: XCTestExpectation!
    
    // MARK: - Test Lifecycle
    override func setUp() {
        super.setUp()
        
        // Initialize mock objects
        mockBiometricContext = LAContext()
        mockSecurityManager = SecurityManager.shared
        
        // Initialize system under test
        sut = BiometricAuthModule()
        
        // Set up test expectations
        authExpectation = expectation(description: "Authentication completion")
    }
    
    override func tearDown() {
        // Reset mocks and state
        sut.resetBiometricState()
        mockBiometricContext = nil
        mockSecurityManager = nil
        authExpectation = nil
        
        sut = nil
        super.tearDown()
    }
    
    // MARK: - Device Integrity Tests
    func testDeviceIntegrityValidation() {
        // Given
        var deviceIntegrityChecked = false
        let mockSecurityManager = SecurityManager.shared
        
        // When
        sut.authenticateUser({ result in
            self.authExpectation.fulfill()
        }) { error, message, details in
            self.authExpectation.fulfill()
        }
        
        // Then
        wait(for: [authExpectation], timeout: kTestTimeout)
        XCTAssertTrue(deviceIntegrityChecked, "Device integrity should be validated before authentication")
    }
    
    // MARK: - Biometric Policy Tests
    func testBiometricPolicyEnforcement() {
        // Given
        let mockContext = LAContext()
        var policyEvaluated = false
        
        // When
        sut.authenticateUser({ result in
            self.authExpectation.fulfill()
        }) { error, message, details in
            self.authExpectation.fulfill()
        }
        
        // Then
        wait(for: [authExpectation], timeout: kTestTimeout)
        XCTAssertTrue(policyEvaluated, "Biometric policy should be evaluated")
    }
    
    // MARK: - Secure Enclave Tests
    func testSecureEnclaveIntegration() {
        // Given
        let mockSecurityManager = SecurityManager.shared
        var secureEnclaveAccessed = false
        
        // When
        sut.authenticateUser({ result in
            self.authExpectation.fulfill()
        }) { error, message, details in
            self.authExpectation.fulfill()
        }
        
        // Then
        wait(for: [authExpectation], timeout: kTestTimeout)
        XCTAssertTrue(secureEnclaveAccessed, "Secure Enclave should be accessed during authentication")
    }
    
    // MARK: - Rate Limiting Tests
    func testRateLimitingBehavior() {
        // Given
        let maxAttempts = 3
        var attemptCount = 0
        
        // When
        for _ in 0...maxAttempts {
            sut.authenticateUser({ result in
                attemptCount += 1
            }) { error, message, details in
                attemptCount += 1
            }
        }
        
        // Then
        XCTAssertEqual(attemptCount, maxAttempts, "Authentication should be rate limited")
        XCTAssertTrue(sut.isBiometricsAvailable({ result in
            self.authExpectation.fulfill()
        }) { error, message, details in
            XCTAssertEqual(error, "10002", "Should return too many attempts error")
            self.authExpectation.fulfill()
        })
        
        wait(for: [authExpectation], timeout: kTestTimeout)
    }
    
    // MARK: - React Native Promise Tests
    func testReactNativePromiseResolution() {
        // Given
        var promiseResolved = false
        var promiseRejected = false
        
        // When - Success case
        sut.authenticateUser({ result in
            promiseResolved = true
            self.authExpectation.fulfill()
        }) { error, message, details in
            promiseRejected = true
            self.authExpectation.fulfill()
        }
        
        // Then
        wait(for: [authExpectation], timeout: kTestTimeout)
        XCTAssertTrue(promiseResolved, "Promise should be resolved on success")
        XCTAssertFalse(promiseRejected, "Promise should not be rejected on success")
        
        // Reset for failure case
        authExpectation = expectation(description: "Authentication failure")
        promiseResolved = false
        promiseRejected = false
        
        // When - Failure case
        mockBiometricContext.invalidate()
        sut.authenticateUser({ result in
            promiseResolved = true
            self.authExpectation.fulfill()
        }) { error, message, details in
            promiseRejected = true
            self.authExpectation.fulfill()
        }
        
        // Then
        wait(for: [authExpectation], timeout: kTestTimeout)
        XCTAssertFalse(promiseResolved, "Promise should not be resolved on failure")
        XCTAssertTrue(promiseRejected, "Promise should be rejected on failure")
    }
    
    // MARK: - Availability Tests
    func testBiometricAvailabilityCheck() {
        // Given
        var availabilityChecked = false
        
        // When
        sut.isBiometricsAvailable({ result in
            guard let response = result as? [String: Any] else {
                XCTFail("Invalid response format")
                return
            }
            availabilityChecked = true
            XCTAssertNotNil(response["available"])
            XCTAssertNotNil(response["biometryType"])
            XCTAssertNotNil(response["enrolled"])
            self.authExpectation.fulfill()
        }) { error, message, details in
            XCTFail("Availability check should not fail on supported devices")
            self.authExpectation.fulfill()
        }
        
        // Then
        wait(for: [authExpectation], timeout: kTestTimeout)
        XCTAssertTrue(availabilityChecked, "Biometric availability should be checked")
    }
    
    // MARK: - Error Handling Tests
    func testAuthenticationErrorHandling() {
        // Given
        let errorTypes: [BiometricError] = [
            .deviceNotSecure,
            .tooManyAttempts,
            .notAvailable,
            .notEnrolled,
            .cancelled,
            .systemError,
            .authenticationFailed
        ]
        
        for errorType in errorTypes {
            // When
            let expectation = XCTestExpectation(description: "Error handling \(errorType)")
            
            sut.authenticateUser({ result in
                XCTFail("Should not succeed with error \(errorType)")
                expectation.fulfill()
            }) { error, message, details in
                // Then
                XCTAssertEqual(error, String(errorType.rawValue))
                XCTAssertNotNil(message)
                XCTAssertNotNil(details)
                expectation.fulfill()
            }
            
            wait(for: [expectation], timeout: kTestTimeout)
        }
    }
}