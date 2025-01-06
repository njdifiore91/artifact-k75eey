import XCTest // iOS 14.0+
import React // 0.70.0+
@testable import ArtKnowledgeGraph

// MARK: - Constants
private let kTestKey = "test_key"
private let kTestData = "test_data"
private let kSecureEnclaveTag = "com.artknowledgegraph.securestorage.test"
private let kEncryptionIterations = 1000

final class SecureStorageModuleTests: XCTestCase {
    
    // MARK: - Properties
    private var sut: SecureStorageModule!
    private var securityManager: SecurityManager!
    private var concurrentQueue: DispatchQueue!
    private var asyncExpectation: XCTestExpectation!
    private var testData: [String: Data]!
    
    // MARK: - Setup & Teardown
    override func setUp() {
        super.setUp()
        
        // Initialize test components
        sut = SecureStorageModule()
        securityManager = SecurityManager.shared
        concurrentQueue = DispatchQueue(
            label: "com.artknowledgegraph.test.concurrent",
            attributes: .concurrent
        )
        
        // Prepare test data with varying security classifications
        testData = [
            "public": "Public test data".data(using: .utf8)!,
            "sensitive": "Sensitive test data".data(using: .utf8)!,
            "critical": "Critical test data".data(using: .utf8)!
        ]
    }
    
    override func tearDown() {
        // Secure cleanup of test data
        autoreleasepool {
            testData.forEach { key, data in
                var mutableData = data
                mutableData.withUnsafeMutableBytes { ptr in
                    guard let basePtr = ptr.baseAddress else { return }
                    memset(basePtr, 0, ptr.count)
                }
            }
            testData = nil
        }
        
        // Clear secure storage
        let clearExpectation = expectation(description: "Clear all secure data")
        sut.clearAllData { success, error in
            XCTAssertTrue(success)
            XCTAssertNil(error)
            clearExpectation.fulfill()
        }
        wait(for: [clearExpectation], timeout: 5.0)
        
        sut = nil
        securityManager = nil
        concurrentQueue = nil
        super.tearDown()
    }
    
    // MARK: - Test Cases
    
    func testSaveSecureDataThreadSafety() {
        let operationCount = 100
        let saveExpectation = expectation(description: "Concurrent save operations")
        saveExpectation.expectedFulfillmentCount = operationCount
        
        let results = Atomic<[Bool]>([])
        
        // Perform concurrent save operations
        for i in 0..<operationCount {
            concurrentQueue.async {
                let testKey = "\(kTestKey)_\(i)"
                let testValue = "\(kTestData)_\(i)"
                
                self.sut.saveSecureData(testKey, data: testValue) { success in
                    results.mutate { $0.append(success as! Bool) }
                    saveExpectation.fulfill()
                } reject: { _, _, _ in
                    results.mutate { $0.append(false) }
                    saveExpectation.fulfill()
                }
            }
        }
        
        wait(for: [saveExpectation], timeout: 30.0)
        
        // Verify all operations succeeded
        XCTAssertEqual(results.value.count, operationCount)
        XCTAssertTrue(results.value.allSatisfy { $0 })
    }
    
    func testEncryptionWithSecureEnclave() {
        // Test encryption with varying data sizes
        let dataSizes = [64, 1024, 1024 * 1024] // 64B, 1KB, 1MB
        
        for size in dataSizes {
            let testData = Data((0..<size).map { _ in UInt8.random(in: 0...255) })
            let encryptionExpectation = expectation(description: "Encryption test \(size) bytes")
            
            // Save data with secure enclave encryption
            sut.saveSecureData(kTestKey, data: testData.base64EncodedString()) { success in
                XCTAssertTrue(success as! Bool)
                
                // Verify encryption
                self.securityManager.verifyEncryption(forKey: kTestKey) { result in
                    switch result {
                    case .success(let isEncrypted):
                        XCTAssertTrue(isEncrypted)
                        encryptionExpectation.fulfill()
                    case .failure(let error):
                        XCTFail("Encryption verification failed: \(error)")
                        encryptionExpectation.fulfill()
                    }
                }
            } reject: { code, message, error in
                XCTFail("Save failed: \(message)")
                encryptionExpectation.fulfill()
            }
        }
        
        wait(for: [dataSizes.map { _ in XCTestExpectation() }], timeout: 30.0)
    }
    
    func testMemorySanitization() {
        let sanitizationExpectation = expectation(description: "Memory sanitization")
        
        // Store sensitive data
        var sensitiveData = "Highly sensitive test data".data(using: .utf8)!
        let sensitiveKey = "sensitive_test_key"
        
        sut.saveSecureData(sensitiveKey, data: sensitiveData.base64EncodedString()) { success in
            XCTAssertTrue(success as! Bool)
            
            // Trigger memory warning to force sanitization
            NotificationCenter.default.post(
                name: UIApplication.didReceiveMemoryWarningNotification,
                object: nil
            )
            
            // Verify data is securely erased from memory
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                sensitiveData.withUnsafeBytes { ptr in
                    let buffer = ptr.bindMemory(to: UInt8.self)
                    let containsSensitiveData = buffer.contains { byte in
                        byte != 0
                    }
                    XCTAssertFalse(containsSensitiveData, "Memory not properly sanitized")
                }
                sanitizationExpectation.fulfill()
            }
        } reject: { code, message, error in
            XCTFail("Save failed: \(message)")
            sanitizationExpectation.fulfill()
        }
        
        wait(for: [sanitizationExpectation], timeout: 5.0)
    }
    
    func testSecureDataRetrieval() {
        let retrievalExpectation = expectation(description: "Secure data retrieval")
        
        // Save test data
        sut.saveSecureData(kTestKey, data: kTestData) { success in
            XCTAssertTrue(success as! Bool)
            
            // Retrieve and verify data
            self.sut.getSecureData(kTestKey) { result in
                XCTAssertEqual(result as? String, kTestData)
                retrievalExpectation.fulfill()
            } reject: { code, message, error in
                XCTFail("Retrieval failed: \(message)")
                retrievalExpectation.fulfill()
            }
        } reject: { code, message, error in
            XCTFail("Save failed: \(message)")
            retrievalExpectation.fulfill()
        }
        
        wait(for: [retrievalExpectation], timeout: 5.0)
    }
}

// MARK: - Helper Classes
private class Atomic<T> {
    private let queue = DispatchQueue(label: "com.artknowledgegraph.test.atomic")
    private var _value: T
    
    var value: T {
        queue.sync { _value }
    }
    
    init(_ value: T) {
        self._value = value
    }
    
    func mutate(_ mutation: (inout T) -> Void) {
        queue.sync {
            mutation(&self._value)
        }
    }
}