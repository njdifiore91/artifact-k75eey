import UIKit
// UIKit v14.0+
import CoreImage
// CoreImage v14.0+
import Vision
// Vision v14.0+
import Accelerate
// Accelerate v14.0+

// MARK: - Constants
private let kMaxDimension: CGFloat = 2048.0
private let kCompressionQuality: CGFloat = 0.8
private let kMaxFileSize: Int = 5 * 1024 * 1024 // 5MB
private let kColorAnalysisDimension: CGFloat = 64.0
private let kThumbnailDimension: CGFloat = 256.0

// MARK: - Result Types
struct ProcessedArtwork {
    let processedImage: UIImage
    let dimensions: CGSize
    let fileSize: Int
    let colorProfile: String
    let metadata: [String: Any]
}

struct ArtworkAnalysis {
    let dominantColors: [UIColor]
    let compositionFeatures: [String: Float]
    let styleVector: [Float]
    let technicalMetadata: [String: Any]
}

@objc public class ImageProcessor: NSObject {
    // MARK: - Properties
    private let ciContext: CIContext
    private let visionHandler: VNSequenceRequestHandler
    private let imageCache: NSCache<NSString, UIImage>
    private let processingQueue: DispatchQueue
    private let metalDevice: MTLDevice?
    
    // MARK: - Initialization
    override init() {
        // Initialize Metal device for GPU acceleration
        metalDevice = MTLCreateSystemDefaultDevice()
        
        // Configure CIContext with Metal acceleration
        let contextOptions: [CIContextOption: Any] = [
            .useSoftwareRenderer: false,
            .priorityRequestLow: true,
            .cacheIntermediates: true
        ]
        ciContext = CIContext(mtlDevice: metalDevice, options: contextOptions)
        
        // Initialize Vision handler
        visionHandler = VNSequenceRequestHandler()
        
        // Configure image cache
        imageCache = NSCache<NSString, UIImage>()
        imageCache.totalCostLimit = 50 * 1024 * 1024 // 50MB cache limit
        
        // Setup processing queue
        processingQueue = DispatchQueue(label: "com.artknowledgegraph.imageprocessing",
                                      qos: .userInitiated,
                                      attributes: .concurrent)
        
        super.init()
        
        // Setup memory pressure handling
        NotificationCenter.default.addObserver(self,
                                             selector: #selector(handleMemoryPressure),
                                             name: UIApplication.didReceiveMemoryWarningNotification,
                                             object: nil)
    }
    
    // MARK: - Public Methods
    public func generateThumbnail(image: UIImage, size: CGSize) -> UIImage? {
        guard let ciImage = CIImage(image: image) else { return nil }
        
        let scale = min(size.width / image.size.width,
                       size.height / image.size.height)
        
        // Apply content-aware cropping
        let cropRequest = VNGenerateAttentionBasedSaliencyImageRequest()
        try? visionHandler.perform([cropRequest], on: ciImage)
        
        guard let result = cropRequest.results?.first as? VNSaliencyImageObservation else {
            return generateBasicThumbnail(image: image, size: size)
        }
        
        // Calculate optimal crop rect based on saliency
        let cropRect = VNImageRectForNormalizedRect(result.salientObjects?.first?.boundingBox ?? .init(x: 0, y: 0, width: 1, height: 1),
                                                   Int(image.size.width),
                                                   Int(image.size.height))
        
        // Apply filters for artwork enhancement
        let filters = [
            CIFilter.unsharpMask(),
            CIFilter.colorControls()
        ]
        
        var processedImage = ciImage.cropped(to: cropRect)
        
        for filter in filters {
            filter.setValue(processedImage, forKey: kCIInputImageKey)
            if let output = filter.outputImage {
                processedImage = output
            }
        }
        
        // Generate final thumbnail
        let scaledImage = processedImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        
        guard let cgImage = ciContext.createCGImage(scaledImage, from: scaledImage.extent) else {
            return nil
        }
        
        let thumbnail = UIImage(cgImage: cgImage)
        
        // Cache the thumbnail
        let cacheKey = NSString(string: "\(image.hash)_\(size.width)x\(size.height)")
        imageCache.setObject(thumbnail, forKey: cacheKey, cost: Int(size.width * size.height * 4))
        
        return thumbnail
    }
    
    public func processArtworkImage(image: UIImage) -> ProcessedArtwork {
        var processedImage = image
        var metadata: [String: Any] = [:]
        
        // Validate and adjust dimensions
        if image.size.width > kMaxDimension || image.size.height > kMaxDimension {
            processedImage = resizeImage(image, maxDimension: kMaxDimension)
        }
        
        // Apply artwork enhancement filters
        if let enhancedImage = applyArtworkEnhancement(processedImage) {
            processedImage = enhancedImage
        }
        
        // Extract technical metadata
        metadata["originalSize"] = image.size
        metadata["processedSize"] = processedImage.size
        metadata["colorSpace"] = processedImage.cgImage?.colorSpace?.name ?? "Unknown"
        metadata["bitsPerComponent"] = processedImage.cgImage?.bitsPerComponent ?? 0
        
        return ProcessedArtwork(
            processedImage: processedImage,
            dimensions: processedImage.size,
            fileSize: processedImage.jpegData(compressionQuality: kCompressionQuality)?.count ?? 0,
            colorProfile: processedImage.cgImage?.colorSpace?.name ?? "Unknown",
            metadata: metadata
        )
    }
    
    public func analyzeArtworkFeatures(image: UIImage) -> ArtworkAnalysis {
        var analysis = ArtworkAnalysis(
            dominantColors: [],
            compositionFeatures: [:],
            styleVector: [],
            technicalMetadata: [:]
        )
        
        // Analyze color palette
        analysis = analyzeDominantColors(image: image, analysis: analysis)
        
        // Analyze composition
        analysis = analyzeComposition(image: image, analysis: analysis)
        
        // Generate style vectors
        analysis = generateStyleVectors(image: image, analysis: analysis)
        
        return analysis
    }
    
    public func optimizeForUpload(image: UIImage) -> Data? {
        let processedArtwork = processArtworkImage(image)
        
        // Progressive JPEG encoding
        let nsData = processedArtwork.processedImage.jpegData(compressionQuality: kCompressionQuality) as NSData?
        guard var data = nsData as Data? else { return nil }
        
        // Apply additional compression if needed
        if data.count > kMaxFileSize {
            var quality = kCompressionQuality
            while data.count > kMaxFileSize && quality > 0.5 {
                quality -= 0.1
                if let compressedData = processedArtwork.processedImage.jpegData(compressionQuality: quality) {
                    data = compressedData
                }
            }
        }
        
        return data
    }
    
    // MARK: - Private Methods
    private func generateBasicThumbnail(image: UIImage, size: CGSize) -> UIImage? {
        UIGraphicsBeginImageContextWithOptions(size, false, 0)
        image.draw(in: CGRect(origin: .zero, size: size))
        let thumbnail = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()
        return thumbnail
    }
    
    private func resizeImage(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let scale = maxDimension / max(image.size.width, image.size.height)
        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        
        UIGraphicsBeginImageContextWithOptions(newSize, false, 0)
        image.draw(in: CGRect(origin: .zero, size: newSize))
        let resizedImage = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()
        
        return resizedImage ?? image
    }
    
    private func applyArtworkEnhancement(_ image: UIImage) -> UIImage? {
        guard let ciImage = CIImage(image: image) else { return nil }
        
        let filters: [CIFilter] = [
            CIFilter.unsharpMask(),
            CIFilter.colorControls(),
            CIFilter.sharpenLuminance()
        ]
        
        var processedImage = ciImage
        
        for filter in filters {
            filter.setValue(processedImage, forKey: kCIInputImageKey)
            if let output = filter.outputImage {
                processedImage = output
            }
        }
        
        guard let cgImage = ciContext.createCGImage(processedImage, from: processedImage.extent) else {
            return nil
        }
        
        return UIImage(cgImage: cgImage)
    }
    
    private func analyzeDominantColors(image: UIImage, analysis: ArtworkAnalysis) -> ArtworkAnalysis {
        var updatedAnalysis = analysis
        // Color analysis implementation using k-means clustering
        // This is a placeholder for the actual implementation
        updatedAnalysis.dominantColors = []
        return updatedAnalysis
    }
    
    private func analyzeComposition(image: UIImage, analysis: ArtworkAnalysis) -> ArtworkAnalysis {
        var updatedAnalysis = analysis
        // Composition analysis using Vision framework
        // This is a placeholder for the actual implementation
        updatedAnalysis.compositionFeatures = [:]
        return updatedAnalysis
    }
    
    private func generateStyleVectors(image: UIImage, analysis: ArtworkAnalysis) -> ArtworkAnalysis {
        var updatedAnalysis = analysis
        // Style vector generation using ML models
        // This is a placeholder for the actual implementation
        updatedAnalysis.styleVector = []
        return updatedAnalysis
    }
    
    @objc private func handleMemoryPressure() {
        imageCache.removeAllObjects()
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}