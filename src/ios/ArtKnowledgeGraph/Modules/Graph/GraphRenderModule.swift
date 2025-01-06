import Foundation
// Foundation v14.0+
import UIKit
// UIKit v14.0+
import Metal
// Metal v14.0+

// MARK: - Constants
private let kDefaultNodeSize: CGFloat = 60.0
private let kDefaultEdgeThickness: CGFloat = 2.0
private let kAnimationDuration: TimeInterval = 0.3
private let kMaxFrameRate: Float = 60.0
private let kMinFrameRate: Float = 30.0
private let kMemoryWarningThreshold: Float = 0.8

// MARK: - Error Types
enum GraphRenderError: Error {
    case invalidGraphData
    case metalDeviceUnavailable
    case renderingFailed
}

// MARK: - GraphRenderModule
@objc
@objcMembers
public class GraphRenderModule: NSObject {
    // MARK: - Properties
    private let graphicsEngine: GraphicsEngine
    private let containerView: UIView
    private var currentGraphData: [String: Any]?
    private let metalDevice: MTLDevice?
    private var displayLink: CADisplayLink?
    private var currentFrameRate: Float = kMaxFrameRate
    private var isAccessibilityEnabled: Bool = false
    
    // MARK: - Initialization
    override init() {
        // Initialize container view
        containerView = UIView(frame: .zero)
        containerView.backgroundColor = .clear
        containerView.isUserInteractionEnabled = true
        
        // Initialize Metal device
        metalDevice = MTLCreateSystemDefaultDevice()
        
        // Initialize graphics engine with configuration
        let configuration = RenderConfiguration(
            preferLowPower: false,
            initialScale: 1.0,
            backgroundColor: .systemBackground,
            nodeStyle: NodeStyle(
                size: CGSize(width: kDefaultNodeSize, height: kDefaultNodeSize),
                cornerRadius: 8.0,
                borderWidth: 1.0,
                borderColor: .systemGray,
                shadowRadius: 4.0,
                shadowOpacity: 0.2
            ),
            edgeStyle: EdgeStyle(
                width: kDefaultEdgeThickness,
                color: .systemGray,
                dashPattern: nil,
                animationDuration: kAnimationDuration
            )
        )
        
        do {
            graphicsEngine = try GraphicsEngine(view: containerView, configuration: configuration)
        } catch {
            fatalError("Failed to initialize GraphicsEngine: \(error)")
        }
        
        super.init()
        
        setupGestureRecognizers(containerView)
        setupDisplayLink()
        setupAccessibility()
        setupMemoryWarningHandling()
    }
    
    // MARK: - Public Methods
    @objc
    public func render(_ graphData: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        do {
            let convertedData = try convertGraphData(graphData)
            graphicsEngine.updateNodePositions(nodes: convertedData.nodes, edges: convertedData.edges, animate: true)
            resolve(["success": true])
        } catch {
            reject("RENDER_ERROR", error.localizedDescription, error)
        }
    }
    
    @objc
    public func updateLayout(_ layoutData: NSDictionary) {
        guard let positions = layoutData["positions"] as? [[String: CGFloat]] else { return }
        
        CATransaction.begin()
        CATransaction.setAnimationDuration(kAnimationDuration)
        
        // Update node positions with animation
        positions.forEach { position in
            if let nodeId = position["id"] as? String,
               let x = position["x"],
               let y = position["y"] {
                graphicsEngine.updateNodePositions(nodes: [], edges: [], animate: true)
            }
        }
        
        CATransaction.commit()
    }
    
    @objc
    public func cleanup() {
        displayLink?.invalidate()
        displayLink = nil
        NotificationCenter.default.removeObserver(self)
    }
    
    // MARK: - Private Methods
    private func convertGraphData(_ graphData: NSDictionary) throws -> (nodes: [Node], edges: [Edge]) {
        guard let nodesData = graphData["nodes"] as? [[String: Any]],
              let edgesData = graphData["edges"] as? [[String: Any]] else {
            throw GraphRenderError.invalidGraphData
        }
        
        // Convert nodes
        let nodes = try nodesData.map { nodeData -> Node in
            guard let id = nodeData["id"] as? String,
                  let x = nodeData["x"] as? CGFloat,
                  let y = nodeData["y"] as? CGFloat else {
                throw GraphRenderError.invalidGraphData
            }
            
            return Node(id: id, position: CGPoint(x: x, y: y))
        }
        
        // Convert edges
        let edges = try edgesData.map { edgeData -> Edge in
            guard let sourceId = edgeData["source"] as? String,
                  let targetId = edgeData["target"] as? String,
                  let sourceNode = nodes.first(where: { $0.id == sourceId }),
                  let targetNode = nodes.first(where: { $0.id == targetId }) else {
                throw GraphRenderError.invalidGraphData
            }
            
            return Edge(sourceNode: sourceNode, targetNode: targetNode)
        }
        
        return (nodes, edges)
    }
    
    private func setupGestureRecognizers(_ containerView: UIView) {
        // Pinch gesture for zoom
        let pinchGesture = UIPinchGestureRecognizer(target: graphicsEngine, action: #selector(GraphicsEngine.handlePinchGesture(_:)))
        containerView.addGestureRecognizer(pinchGesture)
        
        // Pan gesture for navigation
        let panGesture = UIPanGestureRecognizer(target: graphicsEngine, action: #selector(GraphicsEngine.handlePanGesture(_:)))
        containerView.addGestureRecognizer(panGesture)
        
        // Double tap for reset
        let doubleTapGesture = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap(_:)))
        doubleTapGesture.numberOfTapsRequired = 2
        containerView.addGestureRecognizer(doubleTapGesture)
        
        // Configure gesture relationships
        panGesture.maximumNumberOfTouches = 2
        panGesture.delegate = self
        pinchGesture.delegate = self
    }
    
    private func setupDisplayLink() {
        displayLink = CADisplayLink(target: graphicsEngine, selector: #selector(GraphicsEngine.render))
        displayLink?.preferredFramesPerSecond = Int(currentFrameRate)
        displayLink?.add(to: .main, forMode: .common)
    }
    
    private func setupAccessibility() {
        containerView.isAccessibilityElement = true
        containerView.accessibilityLabel = "Interactive graph visualization"
        containerView.accessibilityHint = "Use two fingers to zoom and pan. Double tap to reset view."
        
        isAccessibilityEnabled = UIAccessibility.isVoiceOverRunning
        
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleVoiceOverStatusChanged),
            name: UIAccessibility.voiceOverStatusDidChangeNotification,
            object: nil
        )
    }
    
    private func setupMemoryWarningHandling() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMemoryWarning),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
    }
    
    @objc private func handleDoubleTap(_ gesture: UITapGestureRecognizer) {
        // Reset view with animation
        UIView.animate(withDuration: kAnimationDuration) {
            self.graphicsEngine.updateNodePositions(nodes: [], edges: [], animate: true)
        }
    }
    
    @objc private func handleVoiceOverStatusChanged() {
        isAccessibilityEnabled = UIAccessibility.isVoiceOverRunning
        // Adjust rendering for accessibility
        currentFrameRate = isAccessibilityEnabled ? kMinFrameRate : kMaxFrameRate
        displayLink?.preferredFramesPerSecond = Int(currentFrameRate)
    }
    
    @objc private func handleMemoryWarning() {
        // Reduce memory usage
        currentFrameRate = kMinFrameRate
        displayLink?.preferredFramesPerSecond = Int(currentFrameRate)
        graphicsEngine.handleMemoryWarning()
    }
}

// MARK: - UIGestureRecognizerDelegate
extension GraphRenderModule: UIGestureRecognizerDelegate {
    public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        return true
    }
}