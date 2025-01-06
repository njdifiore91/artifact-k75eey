import UIKit

// MARK: - Layout Constants
private let kDefaultPadding: CGFloat = 16.0
private let kDefaultCornerRadius: CGFloat = 8.0

// MARK: - UIView Layout Extension
extension UIView {
    
    // MARK: - Private Properties
    private struct AssociatedKeys {
        static var constraintsKey = "layoutConstraintsKey"
    }
    
    private var storedConstraints: [String: NSLayoutConstraint] {
        get {
            return objc_getAssociatedObject(self, &AssociatedKeys.constraintsKey) as? [String: NSLayoutConstraint] ?? [:]
        }
        set {
            objc_setAssociatedObject(self, &AssociatedKeys.constraintsKey, newValue, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        }
    }
    
    // MARK: - Public Methods
    
    /// Prepares view for auto layout by disabling translatesAutoresizingMaskIntoConstraints
    /// and initializing constraint storage.
    public func setupForAutoLayout() {
        translatesAutoresizingMaskIntoConstraints = false
        if storedConstraints.isEmpty {
            storedConstraints = [:]
        }
        #if DEBUG
        accessibilityIdentifier = String(describing: type(of: self))
        #endif
    }
    
    /// Pins the view to all edges of its superview with optional padding.
    /// - Parameter padding: The padding to apply to each edge. Defaults to zero padding.
    public func pinToSuperview(padding: UIEdgeInsets = .zero) {
        precondition(superview != nil, "View must have a superview to pin to")
        setupForAutoLayout()
        
        // Deactivate existing edge constraints
        ["leading", "trailing", "top", "bottom"].forEach { edge in
            storedConstraints[edge]?.isActive = false
        }
        
        // Create and activate new constraints
        storedConstraints["leading"] = leadingAnchor.constraint(equalTo: superview!.leadingAnchor, constant: padding.left)
        storedConstraints["trailing"] = trailingAnchor.constraint(equalTo: superview!.trailingAnchor, constant: -padding.right)
        storedConstraints["top"] = topAnchor.constraint(equalTo: superview!.topAnchor, constant: padding.top)
        storedConstraints["bottom"] = bottomAnchor.constraint(equalTo: superview!.bottomAnchor, constant: -padding.bottom)
        
        NSLayoutConstraint.activate(storedConstraints.values.map { $0 })
    }
    
    /// Centers the view in its superview both horizontally and vertically.
    public func centerInSuperview() {
        precondition(superview != nil, "View must have a superview to center in")
        setupForAutoLayout()
        
        // Deactivate existing center constraints
        ["centerX", "centerY"].forEach { center in
            storedConstraints[center]?.isActive = false
        }
        
        // Create and activate new constraints
        storedConstraints["centerX"] = centerXAnchor.constraint(equalTo: superview!.centerXAnchor)
        storedConstraints["centerY"] = centerYAnchor.constraint(equalTo: superview!.centerYAnchor)
        
        NSLayoutConstraint.activate(storedConstraints.values.map { $0 })
    }
    
    /// Sets the size of the view using width and height constraints.
    /// - Parameter size: The desired size for the view.
    public func setSize(_ size: CGSize) {
        setupForAutoLayout()
        
        // Deactivate existing size constraints
        ["width", "height"].forEach { dimension in
            storedConstraints[dimension]?.isActive = false
        }
        
        // Create and activate new constraints
        storedConstraints["width"] = widthAnchor.constraint(equalToConstant: size.width)
        storedConstraints["height"] = heightAnchor.constraint(equalToConstant: size.height)
        
        NSLayoutConstraint.activate(storedConstraints.values.map { $0 })
    }
    
    /// Sets a single dimension (width or height) of the view.
    /// - Parameters:
    ///   - dimension: The layout dimension to constrain (width or height anchor).
    ///   - value: The constant value to set for the dimension.
    public func setDimension(_ dimension: NSLayoutDimension, value: CGFloat) {
        setupForAutoLayout()
        
        let constraintKey = dimension === widthAnchor ? "width" : "height"
        storedConstraints[constraintKey]?.isActive = false
        
        let constraint = dimension.constraint(equalToConstant: value)
        storedConstraints[constraintKey] = constraint
        constraint.isActive = true
    }
    
    /// Pins the view to the safe area of its superview with optional padding.
    /// - Parameter padding: The padding to apply to each edge of the safe area. Defaults to zero padding.
    public func pinToSafeArea(padding: UIEdgeInsets = .zero) {
        precondition(superview != nil, "View must have a superview to pin to safe area")
        setupForAutoLayout()
        
        let safeArea = superview!.safeAreaLayoutGuide
        
        // Deactivate existing safe area constraints
        ["safeLeading", "safeTrailing", "safeTop", "safeBottom"].forEach { edge in
            storedConstraints[edge]?.isActive = false
        }
        
        // Create and activate new constraints
        storedConstraints["safeLeading"] = leadingAnchor.constraint(equalTo: safeArea.leadingAnchor, constant: padding.left)
        storedConstraints["safeTrailing"] = trailingAnchor.constraint(equalTo: safeArea.trailingAnchor, constant: -padding.right)
        storedConstraints["safeTop"] = topAnchor.constraint(equalTo: safeArea.topAnchor, constant: padding.top)
        storedConstraints["safeBottom"] = bottomAnchor.constraint(equalTo: safeArea.bottomAnchor, constant: -padding.bottom)
        
        NSLayoutConstraint.activate(storedConstraints.values.map { $0 })
    }
}