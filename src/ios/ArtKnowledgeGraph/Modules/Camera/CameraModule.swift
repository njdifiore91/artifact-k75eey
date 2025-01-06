import AVFoundation
// AVFoundation v14.0+
import UIKit
// UIKit v14.0+

// MARK: - Constants
private let kDefaultCameraPosition = AVCaptureDevice.Position.back
private let kDefaultFlashMode = AVCaptureDevice.FlashMode.auto
private let kDefaultPhotoQuality = AVCaptureSession.Preset.photo
private let kErrorDomain = "com.artknowledgegraph.camera"
private let kHDREnabled = true
private let kMaxImageDimension = 4096
private let kMemoryWarningThreshold = 0.8

// MARK: - Error Types
enum CameraError: Error {
    case permissionDenied
    case setupFailed
    case captureError
    case deviceNotAvailable
    case configurationFailed
    case memoryWarning
}

// MARK: - Configuration Types
struct HDRConfiguration {
    let enabled: Bool
    let autoHDR: Bool
    let bracketedCapture: Bool
    let preferredSemanticSegmentation: AVSemanticSegmentationMatte.MatteType?
}

struct CameraConfiguration {
    let position: AVCaptureDevice.Position
    let flashMode: AVCaptureDevice.FlashMode
    let photoQuality: AVCaptureSession.Preset
    let stabilizationEnabled: Bool
    let hdrConfig: HDRConfiguration
}

@objc public class CameraModule: NSObject {
    // MARK: - Properties
    private var captureSession: AVCaptureSession
    private var photoOutput: AVCapturePhotoOutput
    private var camera: AVCaptureDevice?
    private var imageProcessor: ImageProcessor
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var memoryWarningObserver: NSObjectProtocol?
    private var qualityPreservationEnabled: Bool
    private var hdrSettings: HDRConfiguration
    
    // MARK: - Initialization
    override public init() {
        // Initialize core components
        captureSession = AVCaptureSession()
        photoOutput = AVCapturePhotoOutput()
        imageProcessor = ImageProcessor()
        qualityPreservationEnabled = true
        hdrSettings = HDRConfiguration(
            enabled: kHDREnabled,
            autoHDR: true,
            bracketedCapture: true,
            preferredSemanticSegmentation: .sky
        )
        
        super.init()
        
        // Setup memory warning observer
        memoryWarningObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.handleMemoryWarning()
        }
    }
    
    // MARK: - Public Methods
    @objc public func checkCameraPermissions(completion: @escaping (Bool, Error?) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            completion(true, nil)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    completion(granted, granted ? nil : CameraError.permissionDenied)
                }
            }
        case .denied, .restricted:
            completion(false, CameraError.permissionDenied)
        @unknown default:
            completion(false, CameraError.permissionDenied)
        }
    }
    
    @objc public func initializeCamera(config: CameraConfiguration) -> Result<Void, Error> {
        captureSession.beginConfiguration()
        defer { captureSession.commitConfiguration() }
        
        // Configure quality preset
        guard captureSession.canSetSessionPreset(config.photoQuality) else {
            return .failure(CameraError.configurationFailed)
        }
        captureSession.sessionPreset = config.photoQuality
        
        // Setup camera input
        let result = setupCameraInput(position: config.position)
        switch result {
        case .failure(let error):
            return .failure(error)
        case .success:
            break
        }
        
        // Configure photo output
        guard captureSession.canAddOutput(photoOutput) else {
            return .failure(CameraError.setupFailed)
        }
        
        photoOutput.isHighResolutionCaptureEnabled = true
        photoOutput.maxPhotoQualityPrioritization = .quality
        
        if #available(iOS 14.0, *) {
            photoOutput.maxPhotoDimensions = CMVideoDimensions(width: kMaxImageDimension, height: kMaxImageDimension)
        }
        
        captureSession.addOutput(photoOutput)
        
        return .success(())
    }
    
    @objc public func captureImage(completion: @escaping (Result<Data, Error>) -> Void) {
        guard let camera = camera else {
            completion(.failure(CameraError.deviceNotAvailable))
            return
        }
        
        let settings = AVCapturePhotoSettings()
        settings.flashMode = camera.hasFlash ? kDefaultFlashMode : .off
        
        if camera.isHDRPhotoPixelFormatSupported && hdrSettings.enabled {
            settings.isHighResolutionPhotoEnabled = true
            settings.isAutoStillImageStabilizationEnabled = true
            if #available(iOS 14.0, *) {
                settings.photoQualityPrioritization = .quality
            }
        }
        
        photoOutput.capturePhoto(with: settings) { [weak self] photo, error in
            guard let self = self else { return }
            
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let photoData = photo?.fileDataRepresentation() else {
                completion(.failure(CameraError.captureError))
                return
            }
            
            guard let image = UIImage(data: photoData) else {
                completion(.failure(CameraError.captureError))
                return
            }
            
            // Process image using ImageProcessor
            if let optimizedData = self.imageProcessor.optimizeForUpload(image: image) {
                completion(.success(optimizedData))
            } else {
                completion(.failure(CameraError.captureError))
            }
        }
    }
    
    @objc public func configureHDR(_ config: HDRConfiguration) {
        hdrSettings = config
        
        guard let camera = camera,
              camera.isHDRPhotoPixelFormatSupported else { return }
        
        try? camera.lockForConfiguration()
        if #available(iOS 14.0, *) {
            camera.isHDRPhotoPixelFormatSupported = config.enabled
        }
        camera.unlockForConfiguration()
    }
    
    // MARK: - Private Methods
    private func setupCameraInput(position: AVCaptureDevice.Position) -> Result<Void, Error> {
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position) else {
            return .failure(CameraError.deviceNotAvailable)
        }
        
        do {
            try device.lockForConfiguration()
            
            // Configure focus system
            if device.isFocusModeSupported(.continuousAutoFocus) {
                device.focusMode = .continuousAutoFocus
            }
            
            // Configure stabilization
            if device.isSubjectMotionModeSupported {
                device.subjectMotionMode = .active
            }
            
            // Configure HDR if available
            if #available(iOS 14.0, *) {
                if device.isHDRPhotoPixelFormatSupported {
                    device.isHDRPhotoPixelFormatSupported = hdrSettings.enabled
                }
            }
            
            device.unlockForConfiguration()
            
            let input = try AVCaptureDeviceInput(device: device)
            if captureSession.canAddInput(input) {
                captureSession.addInput(input)
                camera = device
                return .success(())
            } else {
                return .failure(CameraError.setupFailed)
            }
            
        } catch {
            return .failure(error)
        }
    }
    
    @objc private func handleMemoryWarning() {
        if ProcessInfo.processInfo.systemFreeMemory < kMemoryWarningThreshold {
            qualityPreservationEnabled = false
            photoOutput.maxPhotoQualityPrioritization = .speed
        }
    }
    
    // MARK: - Deinitialization
    deinit {
        if let observer = memoryWarningObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        captureSession.stopRunning()
    }
}