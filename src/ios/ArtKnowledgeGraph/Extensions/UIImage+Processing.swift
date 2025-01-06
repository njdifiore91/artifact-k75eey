//
// UIImage+Processing.swift
// ArtKnowledgeGraph
//
// Image processing extensions for artwork optimization and analysis
// Supporting iOS 14.0+
//

import UIKit          // v14.0+
import CoreImage      // v14.0+
import Vision        // v14.0+
import Accelerate    // v14.0+

// MARK: - Constants
private let kMaxDimension: CGFloat = 2048.0
private let kCompressionQuality: CGFloat = 0.8
private let kMaxFileSize: Int = 5 * 1024 * 1024 // 5MB
private let kColorAnalysisDimension: CGFloat = 64.0

// MARK: - ArtworkAnalysis Structure
public struct ArtworkAnalysis {
    let dominantColors: [(UIColor, Float)]
    let edges: VNPixelBufferObservation?
    let composition: VNImageCompositionObservation?
    let featureVector: [Float]
    let styleClassification: String?
}

// MARK: - UIImage Extension
public extension UIImage {
    
    /// Resizes the image while maintaining aspect ratio for optimal upload size
    /// - Parameter targetSize: The target size for the resized image
    /// - Returns: Resized UIImage or nil if operation fails
    func resizeForUpload(to targetSize: CGSize) -> UIImage? {
        guard let cgImage = self.cgImage else { return nil }
        
        let aspectRatio = cgImage.width / cgImage.height
        let scaledSize = CGSize(
            width: min(targetSize.width, CGFloat(cgImage.width)),
            height: min(targetSize.height, CGFloat(cgImage.height))
        )
        
        // Create format for vImage
        var format = vImage_CGImageFormat(
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            colorSpace: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.first.rawValue),
            version: 0,
            decode: nil,
            renderingIntent: .defaultIntent
        )
        
        var sourceBuffer = vImage_Buffer()
        var destinationBuffer = vImage_Buffer()
        
        defer {
            sourceBuffer.data?.deallocate()
            destinationBuffer.data?.deallocate()
        }
        
        // Initialize vImage buffers
        vImageBuffer_InitWithCGImage(&sourceBuffer, &format, nil, cgImage, vImage_Flags(kvImageNoFlags))
        vImageBuffer_Init(&destinationBuffer, UInt(scaledSize.height), UInt(scaledSize.width), 32, vImage_Flags(kvImageNoFlags))
        
        // Perform high-quality scaling
        vImageScale_ARGB8888(&sourceBuffer, &destinationBuffer, nil, vImage_Flags(kvImageHighQualityResampling))
        
        // Create resulting image
        guard let resultCGImage = vImageCreateCGImageFromBuffer(
            &destinationBuffer,
            &format,
            nil,
            nil,
            vImage_Flags(kvImageNoFlags),
            nil
        )?.takeRetainedValue() else { return nil }
        
        return UIImage(cgImage: resultCGImage)
    }
    
    /// Compresses the image to meet upload size requirements
    /// - Parameter maxBytes: Maximum allowed size in bytes
    /// - Returns: Compressed image data or nil if compression fails
    func compressForUpload(maxBytes: Int = kMaxFileSize) -> Data? {
        var compression: CGFloat = kCompressionQuality
        var data = jpegData(compressionQuality: compression)
        
        // Binary search for optimal compression
        var max: CGFloat = 1.0
        var min: CGFloat = 0.0
        
        while let imageData = data, imageData.count > maxBytes && max - min > 0.01 {
            compression = (max + min) / 2
            data = jpegData(compressionQuality: compression)
            
            if let imageData = data {
                if imageData.count > maxBytes {
                    max = compression
                } else {
                    min = compression
                }
            }
        }
        
        return data
    }
    
    /// Extracts dominant colors using k-means clustering
    /// - Parameter maxColors: Maximum number of colors to extract
    /// - Returns: Array of colors and their proportions
    func extractDominantColors(maxColors: Int = 5) -> [(UIColor, Float)] {
        guard let resized = resizeForUpload(to: CGSize(width: kColorAnalysisDimension, height: kColorAnalysisDimension)),
              let cgImage = resized.cgImage else { return [] }
        
        var pixelData = [UInt8](repeating: 0, count: Int(kColorAnalysisDimension * kColorAnalysisDimension * 4))
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let context = CGContext(
            data: &pixelData,
            width: Int(kColorAnalysisDimension),
            height: Int(kColorAnalysisDimension),
            bitsPerComponent: 8,
            bytesPerRow: 4 * Int(kColorAnalysisDimension),
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )
        
        context?.draw(cgImage, in: CGRect(x: 0, y: 0, width: kColorAnalysisDimension, height: kColorAnalysisDimension))
        
        // Convert pixel data to color vectors
        var colors: [(UIColor, Float)] = []
        var currentColor: [UInt8] = []
        var colorCounts: [String: Int] = [:]
        
        for i in stride(from: 0, to: pixelData.count, by: 4) {
            currentColor = Array(pixelData[i..<i+4])
            let colorKey = currentColor.map { String($0) }.joined(separator: ",")
            colorCounts[colorKey, default: 0] += 1
        }
        
        // Sort and convert to UIColors
        let totalPixels = Float(kColorAnalysisDimension * kColorAnalysisDimension)
        let sortedColors = colorCounts.sorted { $0.value > $1.value }.prefix(maxColors)
        
        for colorEntry in sortedColors {
            let components = colorEntry.key.split(separator: ",").compactMap { UInt8($0) }
            if components.count == 4 {
                let color = UIColor(
                    red: CGFloat(components[0]) / 255.0,
                    green: CGFloat(components[1]) / 255.0,
                    blue: CGFloat(components[2]) / 255.0,
                    alpha: CGFloat(components[3]) / 255.0
                )
                let proportion = Float(colorEntry.value) / totalPixels
                colors.append((color, proportion))
            }
        }
        
        return colors
    }
    
    /// Enhances artwork using CoreImage filters
    /// - Returns: Enhanced image or nil if enhancement fails
    func enhanceArtwork() -> UIImage? {
        guard let ciImage = CIImage(image: self) else { return nil }
        let context = CIContext(options: [.useSoftwareRenderer: false])
        
        // Apply enhancement filters
        let filters: [(CIFilter, [String: Any])] = [
            (CIFilter(name: "CIColorControls")!, ["inputSaturation": 1.1, "inputContrast": 1.1]),
            (CIFilter(name: "CIUnsharpMask")!, ["inputRadius": 2.5, "inputIntensity": 0.5]),
            (CIFilter(name: "CINoiseReduction")!, ["inputNoiseLevel": 0.02])
        ]
        
        var processedImage = ciImage
        
        for (filter, parameters) in filters {
            filter.setValue(processedImage, forKey: kCIInputImageKey)
            for (key, value) in parameters {
                filter.setValue(value, forKey: key)
            }
            if let outputImage = filter.outputImage {
                processedImage = outputImage
            }
        }
        
        guard let cgImage = context.createCGImage(processedImage, from: processedImage.extent) else {
            return nil
        }
        
        return UIImage(cgImage: cgImage)
    }
    
    /// Prepares image for upload by optimizing size and quality
    /// - Returns: Optimized image data ready for upload
    func prepareForUpload() -> Data? {
        // Check dimensions and resize if needed
        var processedImage: UIImage = self
        let maxDimension = max(size.width, size.height)
        
        if maxDimension > kMaxDimension {
            let scale = kMaxDimension / maxDimension
            let newSize = CGSize(width: size.width * scale, height: size.height * scale)
            guard let resized = resizeForUpload(to: newSize) else { return nil }
            processedImage = resized
        }
        
        // Enhance and compress
        if let enhanced = processedImage.enhanceArtwork() {
            processedImage = enhanced
        }
        
        return processedImage.compressForUpload(maxBytes: kMaxFileSize)
    }
    
    /// Performs comprehensive artwork analysis
    /// - Returns: Structure containing analysis results
    func analyzeArtwork() -> ArtworkAnalysis {
        let dominantColors = extractDominantColors()
        var edges: VNPixelBufferObservation?
        var composition: VNImageCompositionObservation?
        var featureVector: [Float] = []
        var styleClassification: String?
        
        // Perform Vision analysis
        let requestHandler = VNImageRequestHandler(cgImage: cgImage!, options: [:])
        
        let edgeRequest = VNDetectEdgesRequest()
        let compositionRequest = VNGenerateImageFeaturePrintRequest()
        
        try? requestHandler.perform([edgeRequest, compositionRequest])
        
        edges = edgeRequest.results?.first as? VNPixelBufferObservation
        composition = compositionRequest.results?.first as? VNImageCompositionObservation
        
        if let featurePrint = compositionRequest.results?.first as? VNFeaturePrintObservation {
            var vector = [Float](repeating: 0, count: featurePrint.elementCount)
            try? featurePrint.copy(vector)
            featureVector = vector
        }
        
        return ArtworkAnalysis(
            dominantColors: dominantColors,
            edges: edges,
            composition: composition,
            featureVector: featureVector,
            styleClassification: styleClassification
        )
    }
}