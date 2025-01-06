#import <React/React.h>
#import <React/RCTBridgeModule.h>
#import <Foundation/Foundation.h>

// Version comments for external dependencies
// React/React.h - v0.71.0+
// React/RCTBridgeModule.h - v0.71.0+
// Foundation/Foundation.h - iOS 14.0+

@interface GraphRenderModuleImpl : NSObject <RCTBridgeModule>

@property (nonatomic, strong) id _graphViewInstance;
@property (nonatomic, assign) BOOL _isInitialized;

@end

@implementation GraphRenderModuleImpl

RCT_EXPORT_MODULE(GraphRenderModule);

- (instancetype)init {
    self = [super init];
    if (self) {
        _isInitialized = NO;
        _graphViewInstance = nil;
        
        // Configure debug logging in development
        #ifdef DEBUG
        NSLog(@"GraphRenderModule: Initialized");
        #endif
    }
    return self;
}

// Ensure module runs on main thread for UI operations
- (dispatch_queue_t)methodQueue {
    return dispatch_get_main_queue();
}

// Export render method to JavaScript
RCT_EXPORT_METHOD(render:(NSDictionary *)graphData 
                  resolver:(RCTPromiseResolveBlock)resolve 
                  rejecter:(RCTPromiseRejectBlock)reject) {
    
    // Validate input data
    if (!graphData || ![graphData isKindOfClass:[NSDictionary class]]) {
        reject(@"invalid_data", @"Invalid graph data provided", nil);
        return;
    }
    
    // Process graph data in background
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        @try {
            // Initialize graph view if needed
            if (!self._isInitialized) {
                [self initializeGraphView];
            }
            
            // Process graph data
            NSDictionary *processedData = [self processGraphData:graphData];
            
            // Update UI on main thread
            dispatch_async(dispatch_get_main_queue(), ^{
                [self updateGraphView:processedData];
                resolve(@{@"success": @YES});
            });
        } @catch (NSException *exception) {
            reject(@"render_error", exception.reason, nil);
        }
    });
}

// Export layout update method to JavaScript
RCT_EXPORT_METHOD(updateLayout:(NSDictionary *)layoutData) {
    if (!layoutData || !self._isInitialized) {
        return;
    }
    
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        @try {
            NSDictionary *processedLayout = [self processLayoutUpdate:layoutData];
            
            dispatch_async(dispatch_get_main_queue(), ^{
                [self applyLayoutUpdate:processedLayout];
            });
        } @catch (NSException *exception) {
            NSLog(@"Layout update error: %@", exception.reason);
        }
    });
}

// Export cleanup method to JavaScript
RCT_EXPORT_METHOD(cleanup) {
    dispatch_async(dispatch_get_main_queue(), ^{
        [self cleanupGraphResources];
    });
}

#pragma mark - Private Methods

- (void)initializeGraphView {
    if (self._isInitialized) {
        return;
    }
    
    // Initialize graph view with gesture recognizers
    self._graphViewInstance = [[NSObject alloc] init]; // Replace with actual graph view implementation
    [self setupGestureRecognizers];
    self._isInitialized = YES;
}

- (void)setupGestureRecognizers {
    // Setup pinch zoom (0.5x-3x)
    UIPinchGestureRecognizer *pinchRecognizer = [[UIPinchGestureRecognizer alloc]
                                                 initWithTarget:self
                                                 action:@selector(handlePinchGesture:)];
    
    // Setup pan gesture
    UIPanGestureRecognizer *panRecognizer = [[UIPanGestureRecognizer alloc]
                                            initWithTarget:self
                                            action:@selector(handlePanGesture:)];
    panRecognizer.minimumNumberOfTouches = 2;
    
    // Setup tap gestures
    UITapGestureRecognizer *singleTapRecognizer = [[UITapGestureRecognizer alloc]
                                                   initWithTarget:self
                                                   action:@selector(handleSingleTap:)];
    
    UITapGestureRecognizer *doubleTapRecognizer = [[UITapGestureRecognizer alloc]
                                                   initWithTarget:self
                                                   action:@selector(handleDoubleTap:)];
    doubleTapRecognizer.numberOfTapsRequired = 2;
    
    // Add recognizers to view
    [self._graphViewInstance addGestureRecognizer:pinchRecognizer];
    [self._graphViewInstance addGestureRecognizer:panRecognizer];
    [self._graphViewInstance addGestureRecognizer:singleTapRecognizer];
    [self._graphViewInstance addGestureRecognizer:doubleTapRecognizer];
}

- (NSDictionary *)processGraphData:(NSDictionary *)graphData {
    // Process and optimize graph data for rendering
    // Implementation would include data transformation and optimization logic
    return graphData;
}

- (void)updateGraphView:(NSDictionary *)processedData {
    // Update graph view with processed data
    // Implementation would include actual graph rendering logic
}

- (NSDictionary *)processLayoutUpdate:(NSDictionary *)layoutData {
    // Process layout update data
    // Implementation would include layout calculation logic
    return layoutData;
}

- (void)applyLayoutUpdate:(NSDictionary *)processedLayout {
    // Apply layout updates to graph view
    // Implementation would include layout application logic
}

- (void)cleanupGraphResources {
    // Remove gesture recognizers
    for (UIGestureRecognizer *recognizer in [self._graphViewInstance gestureRecognizers]) {
        [self._graphViewInstance removeGestureRecognizer:recognizer];
    }
    
    // Clear graph data and reset state
    self._graphViewInstance = nil;
    self._isInitialized = NO;
    
    #ifdef DEBUG
    NSLog(@"GraphRenderModule: Cleaned up resources");
    #endif
}

#pragma mark - Gesture Handlers

- (void)handlePinchGesture:(UIPinchGestureRecognizer *)recognizer {
    // Implement pinch zoom handling (0.5x-3x)
    CGFloat scale = recognizer.scale;
    scale = MAX(0.5, MIN(scale, 3.0));
    
    // Apply zoom scale to graph view
    // Implementation would include zoom application logic
}

- (void)handlePanGesture:(UIPanGestureRecognizer *)recognizer {
    // Implement two-finger pan handling
    CGPoint translation = [recognizer translationInView:self._graphViewInstance];
    
    // Apply translation to graph view
    // Implementation would include pan application logic
}

- (void)handleSingleTap:(UITapGestureRecognizer *)recognizer {
    // Implement single tap selection
    CGPoint location = [recognizer locationInView:self._graphViewInstance];
    
    // Handle node selection at tap location
    // Implementation would include selection logic
}

- (void)handleDoubleTap:(UITapGestureRecognizer *)recognizer {
    // Implement double tap reset
    // Reset graph view to initial state
    // Implementation would include reset logic
}

@end