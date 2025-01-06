import XCTest
import AVFoundation
@testable import ArtKnowledgeGraph

// MARK: - Constants
private let kTestImageDimension: CGFloat = 1024.0
private let kTestTimeout: TimeInterval = 5.0
private let kHDRTestTimeout: TimeInterval = 10.0
private let kMemoryWarningThreshold: UInt64 = 50_000_000

class CameraModuleTests: XCTestCase {
    // MARK: - Properties
    private var cameraModule: CameraModule?
    private var imageProcessor: ImageProcessor?
    private var mockHDRConfiguration: HDRConfiguration?
    private var gpuContext: CIContext?
    
    // MARK: - Setup
    override func setUp() {
        super.setUp()
        
        // Initialize camera module
        cameraModule = CameraModule()
        
        // Initialize image processor
        imageProcessor = ImageProcessor()
        
        // Setup mock HDR configuration
        mockHDRConfiguration = HDRConfiguration(
            enabled: true,
            autoHDR: true,
            bracketedCapture: true,
            preferredSemanticSegmentation: .sky
        )
        
        // Setup GPU context for processing tests
        if let metalDevice = MTLCreateSystemDefaultDevice() {
            gpuContext = CIContext(mtlDevice: metalDevice)
        }
    }
    
    // MARK: - Teardown
    override func tearDown() {
        cameraModule = nil
        imageProcessor = nil
        mockHDRConfiguration = nil
        gpuContext = nil
        super.tearDown()
    }
    
    // MARK: - Permission Tests
    func testCameraPermissions() {
        guard let cameraModule = cameraModule else {
            XCTFail("Camera module not initialized")
            return
        }
        
        let permissionExpectation = expectation(description: "Camera permission check")
        
        cameraModule.checkCameraPermissions { granted, error in
            XCTAssertNotNil(granted, "Permission status should not be nil")
            if !granted {
                XCTAssertNotNil(error, "Error should be present when permission denied")
                XCTAssertEqual(error as? CameraError, CameraError.permissionDenied)
            }
            permissionExpectation.fulfill()
        }
        
        wait(for: [permissionExpectation], timeout: kTestTimeout)
    }
    
    // MARK: - Camera Configuration Tests
    func testCameraInitialization() {
        guard let cameraModule = cameraModule else {
            XCTFail("Camera module not initialized")
            return
        }
        
        let config = CameraConfiguration(
            position: .back,
            flashMode: .auto,
            photoQuality: .photo,
            stabilizationEnabled: true,
            hdrConfig: mockHDRConfiguration ?? HDRConfiguration(
                enabled: true,
                autoHDR: true,
                bracketedCapture: true,
                preferredSemanticSegmentation: nil
            )
        )
        
        let result = cameraModule.initializeCamera(config: config)
        
        switch result {
        case .success:
            XCTAssertTrue(true, "Camera initialization successful")
        case .failure(let error):
            XCTFail("Camera initialization failed with error: \(error)")
        }
    }
    
    // MARK: - HDR Tests
    func testHDRConfiguration() {
        guard let cameraModule = cameraModule else {
            XCTFail("Camera module not initialized")
            return
        }
        
        let hdrExpectation = expectation(description: "HDR configuration")
        
        // Configure HDR
        cameraModule.configureHDR(mockHDRConfiguration ?? HDRConfiguration(
            enabled: true,
            autoHDR: true,
            bracketedCapture: true,
            preferredSemanticSegmentation: nil
        ))
        
        // Test image capture with HDR
        cameraModule.captureImage { result in
            switch result {
            case .success(let imageData):
                XCTAssertNotNil(imageData, "Image data should not be nil")
                XCTAssertGreaterThan(imageData.count, 0, "Image data should not be empty")
                
                // Verify HDR metadata if available
                if let image = UIImage(data: imageData),
                   let cgImage = image.cgImage {
                    XCTAssertGreaterThanOrEqual(cgImage.bitsPerComponent, 8)
                    XCTAssertTrue(cgImage.byteOrderInfo == .orderDefault)
                }
            case .failure(let error):
                XCTFail("HDR capture failed with error: \(error)")
            }
            hdrExpectation.fulfill()
        }
        
        wait(for: [hdrExpectation], timeout: kHDRTestTimeout)
    }
    
    // MARK: - Memory Management Tests
    func testMemoryWarningHandling() {
        guard let cameraModule = cameraModule else {
            XCTFail("Camera module not initialized")
            return
        }
        
        let memoryWarningExpectation = expectation(description: "Memory warning handling")
        
        // Simulate memory warning
        NotificationCenter.default.post(
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
        
        // Capture image after memory warning
        cameraModule.captureImage { result in
            switch result {
            case .success(let imageData):
                XCTAssertNotNil(imageData, "Image data should not be nil")
                XCTAssertLessThan(imageData.count, kMemoryWarningThreshold, "Image size should be reduced under memory pressure")
            case .failure(let error):
                XCTAssertNotEqual(error as? CameraError, CameraError.memoryWarning, "Should handle memory warning gracefully")
            }
            memoryWarningExpectation.fulfill()
        }
        
        wait(for: [memoryWarningExpectation], timeout: kTestTimeout)
    }
    
    // MARK: - Image Processing Tests
    func testGPUAcceleratedProcessing() {
        guard let imageProcessor = imageProcessor,
              let testImage = UIImage(named: "TestArtwork") else {
            XCTFail("Image processor or test image not available")
            return
        }
        
        let processingExpectation = expectation(description: "GPU accelerated processing")
        
        // Process test image
        let processedArtwork = imageProcessor.processArtworkImage(image: testImage)
        
        // Verify processed image properties
        XCTAssertNotNil(processedArtwork.processedImage, "Processed image should not be nil")
        XCTAssertLessThanOrEqual(
            max(processedArtwork.dimensions.width, processedArtwork.dimensions.height),
            kTestImageDimension,
            "Image should be properly resized"
        )
        
        // Test optimization for upload
        if let optimizedData = imageProcessor.optimizeForUpload(image: processedArtwork.processedImage) {
            XCTAssertGreaterThan(optimizedData.count, 0, "Optimized data should not be empty")
            XCTAssertLessThanOrEqual(optimizedData.count, 5 * 1024 * 1024, "Optimized image should be under 5MB")
        } else {
            XCTFail("Image optimization failed")
        }
        
        processingExpectation.fulfill()
        wait(for: [processingExpectation], timeout: kTestTimeout)
    }
    
    // MARK: - Image Quality Tests
    func testImageQualityPreservation() {
        guard let cameraModule = cameraModule else {
            XCTFail("Camera module not initialized")
            return
        }
        
        let qualityExpectation = expectation(description: "Image quality preservation")
        
        cameraModule.captureImage { result in
            switch result {
            case .success(let imageData):
                XCTAssertNotNil(imageData, "Image data should not be nil")
                
                if let image = UIImage(data: imageData) {
                    // Verify image dimensions
                    XCTAssertGreaterThan(image.size.width, 0)
                    XCTAssertGreaterThan(image.size.height, 0)
                    
                    // Verify color depth
                    if let cgImage = image.cgImage {
                        XCTAssertGreaterThanOrEqual(cgImage.bitsPerComponent, 8)
                        XCTAssertGreaterThanOrEqual(cgImage.bitsPerPixel, 24)
                    }
                }
            case .failure(let error):
                XCTFail("Image capture failed with error: \(error)")
            }
            qualityExpectation.fulfill()
        }
        
        wait(for: [qualityExpectation], timeout: kTestTimeout)
    }
}