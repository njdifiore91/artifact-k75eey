import UIKit
// UIKit v14.0+
import CoreGraphics
// CoreGraphics v14.0+
import QuartzCore
// QuartzCore v14.0+
import Metal
// Metal v14.0+

// MARK: - Constants
private let kMinZoomScale: CGFloat = 0.5
private let kMaxZoomScale: CGFloat = 3.0
private let kDefaultAnimationDuration: TimeInterval = 0.3
private let kNodeSpacing: CGFloat = 100.0
private let kEdgeWidth: CGFloat = 2.0
private let kMaxFrameRate: Int = 60
private let kLowPowerFrameRate: Int = 30
private let kSpatialGridSize: CGFloat = 200.0

// MARK: - Error Types
enum GraphicsEngineError: Error {
    case metalDeviceNotAvailable
    case shaderCompilationFailed
    case pipelineCreationFailed
}

// MARK: - Supporting Types
struct RenderConfiguration {
    let preferLowPower: Bool
    let initialScale: CGFloat
    let backgroundColor: UIColor
    let nodeStyle: NodeStyle
    let edgeStyle: EdgeStyle
}

struct NodeStyle {
    let size: CGSize
    let cornerRadius: CGFloat
    let borderWidth: CGFloat
    let borderColor: UIColor
    let shadowRadius: CGFloat
    let shadowOpacity: Float
}

struct EdgeStyle {
    let width: CGFloat
    let color: UIColor
    let dashPattern: [NSNumber]?
    let animationDuration: TimeInterval
}

// MARK: - GraphicsEngine Class
@objc public class GraphicsEngine: NSObject {
    // MARK: - Properties
    private let metalDevice: MTLDevice
    private let metalLayer: CAMetalLayer
    private let containerView: UIView
    private var commandQueue: MTLCommandQueue?
    private var renderPipelineState: MTLRenderPipelineState?
    private var vertexBuffer: MTLBuffer?
    private var uniformBuffer: MTLBuffer?
    
    private var nodes: [Node] = []
    private var edges: [Edge] = []
    private var spatialIndex: SpatialIndex
    private var currentScale: CGFloat = 1.0
    private var contentOffset: CGPoint = .zero
    private var isDragging: Bool = false
    
    private var displayLink: CADisplayLink?
    private var performanceMonitor: PerformanceMonitor
    private var lastFrameTime: CFTimeInterval = 0
    private var frameCount: Int = 0
    
    private let imageProcessor: ImageProcessor
    
    // MARK: - Initialization
    public init(view: UIView, configuration: RenderConfiguration) throws {
        guard let device = MTLCreateSystemDefaultDevice() else {
            throw GraphicsEngineError.metalDeviceNotAvailable
        }
        
        metalDevice = device
        containerView = view
        metalLayer = CAMetalLayer()
        spatialIndex = SpatialIndex(gridSize: kSpatialGridSize)
        performanceMonitor = PerformanceMonitor()
        imageProcessor = ImageProcessor()
        
        super.init()
        
        try setupMetalRenderer(device: metalDevice, preferLowPower: configuration.preferLowPower)
        setupMetalLayer(configuration: configuration)
        setupGestureRecognizers()
        setupDisplayLink()
        setupMemoryHandling()
    }
    
    // MARK: - Public Methods
    public func updateNodePositions(nodes: [Node], edges: [Edge], animate: Bool) {
        self.nodes = nodes
        self.edges = edges
        spatialIndex.update(with: nodes)
        
        if animate {
            CATransaction.begin()
            CATransaction.setAnimationDuration(kDefaultAnimationDuration)
            updateForceDirectedLayout()
            CATransaction.commit()
        } else {
            updateForceDirectedLayout()
        }
        
        setNeedsDisplay()
    }
    
    public func handlePinchGesture(_ gesture: UIPinchGestureRecognizer) {
        let scale = gesture.scale
        let location = gesture.location(in: containerView)
        
        switch gesture.state {
        case .began:
            gesture.scale = currentScale
        case .changed:
            let newScale = scale.clamped(to: kMinZoomScale...kMaxZoomScale)
            let scaleDelta = newScale / currentScale
            
            let translatedPoint = CGPoint(
                x: location.x - contentOffset.x,
                y: location.y - contentOffset.y
            )
            
            contentOffset = CGPoint(
                x: location.x - translatedPoint.x * scaleDelta,
                y: location.y - translatedPoint.y * scaleDelta
            )
            
            currentScale = newScale
            setNeedsDisplay()
        default:
            break
        }
    }
    
    public func handlePanGesture(_ gesture: UIPanGestureRecognizer) {
        let translation = gesture.translation(in: containerView)
        
        switch gesture.state {
        case .began:
            isDragging = true
        case .changed:
            contentOffset = CGPoint(
                x: contentOffset.x + translation.x,
                y: contentOffset.y + translation.y
            )
            gesture.setTranslation(.zero, in: containerView)
            setNeedsDisplay()
        case .ended, .cancelled:
            isDragging = false
            let velocity = gesture.velocity(in: containerView)
            applyPanningInertia(velocity: velocity)
        default:
            break
        }
    }
    
    // MARK: - Private Methods
    private func setupMetalRenderer(device: MTLDevice, preferLowPower: Bool) throws {
        commandQueue = device.makeCommandQueue()
        
        let library = try device.makeDefaultLibrary()
        let vertexFunction = library.makeFunction(name: "vertexShader")
        let fragmentFunction = library.makeFunction(name: "fragmentShader")
        
        let pipelineDescriptor = MTLRenderPipelineDescriptor()
        pipelineDescriptor.vertexFunction = vertexFunction
        pipelineDescriptor.fragmentFunction = fragmentFunction
        pipelineDescriptor.colorAttachments[0].pixelFormat = .bgra8Unorm
        
        renderPipelineState = try device.makeRenderPipelineState(descriptor: pipelineDescriptor)
        
        setupVertexBuffer()
        setupUniformBuffer()
    }
    
    private func setupMetalLayer(configuration: RenderConfiguration) {
        metalLayer.device = metalDevice
        metalLayer.pixelFormat = .bgra8Unorm
        metalLayer.framebufferOnly = true
        metalLayer.drawableSize = containerView.bounds.size
        metalLayer.frame = containerView.bounds
        
        containerView.layer.addSublayer(metalLayer)
    }
    
    private func setupGestureRecognizers() {
        let pinchGesture = UIPinchGestureRecognizer(target: self, action: #selector(handlePinchGesture(_:)))
        let panGesture = UIPanGestureRecognizer(target: self, action: #selector(handlePanGesture(_:)))
        let doubleTapGesture = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap(_:)))
        doubleTapGesture.numberOfTapsRequired = 2
        
        containerView.addGestureRecognizer(pinchGesture)
        containerView.addGestureRecognizer(panGesture)
        containerView.addGestureRecognizer(doubleTapGesture)
    }
    
    private func setupDisplayLink() {
        displayLink = CADisplayLink(target: self, selector: #selector(render))
        displayLink?.preferredFramesPerSecond = kMaxFrameRate
        displayLink?.add(to: .main, forMode: .common)
    }
    
    private func setupMemoryHandling() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMemoryWarning),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
    }
    
    @objc private func render() {
        autoreleasepool {
            guard let drawable = metalLayer.nextDrawable(),
                  let commandBuffer = commandQueue?.makeCommandBuffer(),
                  let renderPassDescriptor = MTLRenderPassDescriptor() else {
                return
            }
            
            setupRenderPass(renderPassDescriptor, drawable: drawable)
            
            guard let renderEncoder = commandBuffer.makeRenderCommandEncoder(descriptor: renderPassDescriptor) else {
                return
            }
            
            renderEncoder.setRenderPipelineState(renderPipelineState!)
            renderEncoder.setVertexBuffer(vertexBuffer, offset: 0, index: 0)
            renderEncoder.setVertexBuffer(uniformBuffer, offset: 0, index: 1)
            
            drawNodes(renderEncoder)
            drawEdges(renderEncoder)
            
            renderEncoder.endEncoding()
            commandBuffer.present(drawable)
            commandBuffer.commit()
            
            updatePerformanceMetrics()
        }
    }
    
    private func drawNodes(_ encoder: MTLRenderCommandEncoder) {
        for node in nodes {
            let nodePosition = transformNodePosition(node.position)
            updateUniformBuffer(position: nodePosition, scale: currentScale)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 6)
        }
    }
    
    private func drawEdges(_ encoder: MTLRenderCommandEncoder) {
        for edge in edges {
            let startPosition = transformNodePosition(edge.sourceNode.position)
            let endPosition = transformNodePosition(edge.targetNode.position)
            drawEdge(from: startPosition, to: endPosition, encoder: encoder)
        }
    }
    
    private func updateForceDirectedLayout() {
        var forces = [CGPoint](repeating: .zero, count: nodes.count)
        
        // Calculate repulsive forces
        for i in 0..<nodes.count {
            for j in (i+1)..<nodes.count {
                let force = calculateRepulsiveForce(between: nodes[i], and: nodes[j])
                forces[i] = forces[i] + force
                forces[j] = forces[j] - force
            }
        }
        
        // Calculate attractive forces
        for edge in edges {
            if let sourceIndex = nodes.firstIndex(of: edge.sourceNode),
               let targetIndex = nodes.firstIndex(of: edge.targetNode) {
                let force = calculateAttractiveForce(between: edge.sourceNode, and: edge.targetNode)
                forces[sourceIndex] = forces[sourceIndex] + force
                forces[targetIndex] = forces[targetIndex] - force
            }
        }
        
        // Apply forces
        for (index, force) in forces.enumerated() {
            nodes[index].position = nodes[index].position + force
        }
        
        spatialIndex.update(with: nodes)
    }
    
    @objc private func handleMemoryWarning() {
        // Clear non-essential caches
        performanceMonitor.reset()
    }
    
    deinit {
        displayLink?.invalidate()
        NotificationCenter.default.removeObserver(self)
    }
}

// MARK: - Performance Monitoring
private class PerformanceMonitor {
    private var frameRates: [Double] = []
    private var lastFrameTime: CFTimeInterval = 0
    
    func update(currentTime: CFTimeInterval) {
        if lastFrameTime == 0 {
            lastFrameTime = currentTime
            return
        }
        
        let delta = currentTime - lastFrameTime
        let frameRate = 1.0 / delta
        
        frameRates.append(frameRate)
        if frameRates.count > 60 {
            frameRates.removeFirst()
        }
        
        lastFrameTime = currentTime
    }
    
    func averageFrameRate() -> Double {
        return frameRates.reduce(0.0, +) / Double(frameRates.count)
    }
    
    func reset() {
        frameRates.removeAll()
        lastFrameTime = 0
    }
}

// MARK: - Spatial Indexing
private class SpatialIndex {
    private var grid: [CGPoint: Set<Node>] = [:]
    private let gridSize: CGFloat
    
    init(gridSize: CGFloat) {
        self.gridSize = gridSize
    }
    
    func update(with nodes: [Node]) {
        grid.removeAll()
        
        for node in nodes {
            let gridPoint = CGPoint(
                x: floor(node.position.x / gridSize),
                y: floor(node.position.y / gridSize)
            )
            
            var cellNodes = grid[gridPoint] ?? Set<Node>()
            cellNodes.insert(node)
            grid[gridPoint] = cellNodes
        }
    }
    
    func nearbyNodes(to position: CGPoint) -> Set<Node> {
        let gridPoint = CGPoint(
            x: floor(position.x / gridSize),
            y: floor(position.y / gridSize)
        )
        
        var nearby = Set<Node>()
        
        for dx in -1...1 {
            for dy in -1...1 {
                let neighborPoint = CGPoint(
                    x: gridPoint.x + CGFloat(dx),
                    y: gridPoint.y + CGFloat(dy)
                )
                if let nodes = grid[neighborPoint] {
                    nearby.formUnion(nodes)
                }
            }
        }
        
        return nearby
    }
}