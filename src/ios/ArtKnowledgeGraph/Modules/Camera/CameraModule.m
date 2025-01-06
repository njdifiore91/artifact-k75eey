#import <AVFoundation/AVFoundation.h>
#import <UIKit/UIKit.h>
#import <React/RCTBridgeModule.h>
#import "CameraModule.h"
#import "ImageProcessor.h"

// Constants
static const AVCaptureDevicePosition kDefaultCameraPosition = AVCaptureDevicePositionBack;
static const AVCaptureFlashMode kDefaultFlashMode = AVCaptureFlashModeAuto;
static const NSInteger kMaxImageDimension = 4096;
static const float kMemoryWarningThreshold = 0.8f;
static const NSInteger kThermalStateThreshold = AVCaptureDeviceThermalStateSerious;

@interface CameraModule () <RCTBridgeModule>

@property (nonatomic, strong) AVCaptureSession *captureSession;
@property (nonatomic, strong) AVCapturePhotoOutput *photoOutput;
@property (nonatomic, strong) AVCaptureDevice *camera;
@property (nonatomic, strong) ImageProcessor *imageProcessor;
@property (nonatomic, strong) AVCaptureVideoPreviewLayer *previewLayer;
@property (nonatomic, strong) NSProcessInfo *processInfo;
@property (nonatomic, strong) dispatch_queue_t processingQueue;
@property (nonatomic, strong) NSOperationQueue *imageProcessingQueue;
@property (nonatomic, assign) BOOL qualityPreservationEnabled;
@property (nonatomic, assign) BOOL hdrEnabled;

@end

@implementation CameraModule

RCT_EXPORT_MODULE()

- (instancetype)init {
    if (self = [super init]) {
        // Initialize high-priority processing queue
        self.processingQueue = dispatch_queue_create("com.artknowledgegraph.camera.processing", 
                                                   DISPATCH_QUEUE_SERIAL);
        dispatch_set_target_queue(self.processingQueue, 
                                dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_HIGH, 0));
        
        // Initialize image processing queue with quality of service
        self.imageProcessingQueue = [[NSOperationQueue alloc] init];
        self.imageProcessingQueue.qualityOfService = NSQualityOfServiceUserInitiated;
        self.imageProcessingQueue.maxConcurrentOperationCount = 1;
        
        // Initialize capture components
        self.captureSession = [[AVCaptureSession alloc] init];
        self.photoOutput = [[AVCapturePhotoOutput alloc] init];
        self.imageProcessor = [[ImageProcessor alloc] init];
        self.processInfo = [NSProcessInfo processInfo];
        
        // Configure default settings
        self.qualityPreservationEnabled = YES;
        self.hdrEnabled = YES;
        
        // Setup memory warning observer
        [[NSNotificationCenter defaultCenter] addObserver:self
                                               selector:@selector(handleMemoryWarning)
                                                   name:UIApplicationDidReceiveMemoryWarningNotification
                                                 object:nil];
        
        // Setup thermal state monitoring
        [self setupThermalStateMonitoring];
    }
    return self;
}

RCT_EXPORT_METHOD(checkCameraPermissions:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo];
    
    switch (status) {
        case AVAuthorizationStatusAuthorized: {
            NSMutableDictionary *response = [NSMutableDictionary dictionary];
            response[@"authorized"] = @YES;
            response[@"backgroundAccess"] = @([self hasBackgroundAccess]);
            response[@"deviceCapabilities"] = [self getDeviceCapabilities];
            resolve(response);
            break;
        }
        case AVAuthorizationStatusNotDetermined:
            [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo
                                    completionHandler:^(BOOL granted) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    if (granted) {
                        NSMutableDictionary *response = [NSMutableDictionary dictionary];
                        response[@"authorized"] = @YES;
                        response[@"backgroundAccess"] = @([self hasBackgroundAccess]);
                        response[@"deviceCapabilities"] = [self getDeviceCapabilities];
                        resolve(response);
                    } else {
                        reject(@"permission_denied", @"Camera permission denied", nil);
                    }
                });
            }];
            break;
        case AVAuthorizationStatusDenied:
            reject(@"permission_denied", @"Camera permission denied", nil);
            break;
        case AVAuthorizationStatusRestricted:
            reject(@"permission_restricted", @"Camera access restricted", nil);
            break;
    }
}

RCT_EXPORT_METHOD(initializeCamera:(NSDictionary *)config
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    dispatch_async(self.processingQueue, ^{
        // Check thermal state before initialization
        if ([self isThermalStateExcessive]) {
            reject(@"thermal_state", @"Device temperature too high", nil);
            return;
        }
        
        // Check available memory
        if (![self hasAdequateMemory]) {
            reject(@"memory_warning", @"Insufficient memory available", nil);
            return;
        }
        
        [self.captureSession beginConfiguration];
        
        // Configure session preset
        if ([self.captureSession canSetSessionPreset:AVCaptureSessionPresetPhoto]) {
            self.captureSession.sessionPreset = AVCaptureSessionPresetPhoto;
        } else {
            reject(@"config_error", @"Unable to set photo preset", nil);
            [self.captureSession commitConfiguration];
            return;
        }
        
        // Setup camera input
        NSError *error;
        if (![self setupCameraInput:kDefaultCameraPosition error:&error]) {
            [self.captureSession commitConfiguration];
            reject(@"setup_error", @"Failed to setup camera input", error);
            return;
        }
        
        // Configure photo output with advanced settings
        if ([self.captureSession canAddOutput:self.photoOutput]) {
            self.photoOutput.highResolutionCaptureEnabled = YES;
            
            if (@available(iOS 14.0, *)) {
                self.photoOutput.maxPhotoDimensions = CMVideoDimensions{kMaxImageDimension, kMaxImageDimension};
                [self.photoOutput setHighestPhotoQualityPrioritization:AVCapturePhotoQualityPrioritizationQuality];
            }
            
            [self.captureSession addOutput:self.photoOutput];
        } else {
            [self.captureSession commitConfiguration];
            reject(@"output_error", @"Failed to setup photo output", nil);
            return;
        }
        
        [self.captureSession commitConfiguration];
        
        // Start running session
        [self.captureSession startRunning];
        
        resolve(@{
            @"initialized": @YES,
            @"capabilities": [self getDeviceCapabilities]
        });
    });
}

RCT_EXPORT_METHOD(captureImage:(NSDictionary *)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    dispatch_async(self.processingQueue, ^{
        if (![self.captureSession isRunning]) {
            reject(@"session_error", @"Capture session not running", nil);
            return;
        }
        
        // Check thermal state before capture
        if ([self isThermalStateExcessive]) {
            reject(@"thermal_state", @"Device temperature too high", nil);
            return;
        }
        
        // Configure capture settings
        AVCapturePhotoSettings *settings = [AVCapturePhotoSettings photoSettings];
        settings.flashMode = self.camera.hasFlash ? kDefaultFlashMode : AVCaptureFlashModeOff;
        
        if (@available(iOS 14.0, *)) {
            if (self.camera.isHDRPhotoPixelFormatSupported && self.hdrEnabled) {
                settings.photoQualityPrioritization = AVCapturePhotoQualityPrioritizationQuality;
                settings.highResolutionPhotoEnabled = YES;
            }
        }
        
        // Capture photo with completion handler
        [self.photoOutput capturePhotoWithSettings:settings
                                        delegate:[[CameraPhotoCaptureDelegate alloc]
                                                 initWithCompletion:^(NSData *imageData, NSError *error) {
            if (error) {
                reject(@"capture_error", @"Failed to capture photo", error);
                return;
            }
            
            // Process captured image
            [self.imageProcessingQueue addOperationWithBlock:^{
                UIImage *image = [UIImage imageWithData:imageData];
                NSData *processedData = [self.imageProcessor optimizeForUpload:image];
                
                if (processedData) {
                    resolve(@{
                        @"data": [processedData base64EncodedStringWithOptions:0],
                        @"width": @(image.size.width),
                        @"height": @(image.size.height)
                    });
                } else {
                    reject(@"processing_error", @"Failed to process image", nil);
                }
            }];
        }]];
    });
}

#pragma mark - Private Methods

- (BOOL)setupCameraInput:(AVCaptureDevicePosition)position error:(NSError **)error {
    AVCaptureDevice *device = [AVCaptureDevice defaultDeviceWithMediaType:AVMediaTypeVideo];
    
    if (!device) {
        if (error) {
            *error = [NSError errorWithDomain:@"com.artknowledgegraph.camera"
                                       code:1
                                   userInfo:@{NSLocalizedDescriptionKey: @"Camera device not available"}];
        }
        return NO;
    }
    
    NSError *inputError;
    AVCaptureDeviceInput *input = [AVCaptureDeviceInput deviceInputWithDevice:device error:&inputError];
    
    if (inputError) {
        if (error) {
            *error = inputError;
        }
        return NO;
    }
    
    if ([self.captureSession canAddInput:input]) {
        [self.captureSession addInput:input];
        self.camera = device;
        
        // Configure advanced camera features
        [device lockForConfiguration:&inputError];
        if (!inputError) {
            if ([device isLowLightBoostSupported]) {
                device.automaticallyEnablesLowLightBoostWhenAvailable = YES;
            }
            
            if ([device isAutoFocusRangeRestrictionSupported]) {
                device.autoFocusRangeRestriction = AVCaptureAutoFocusRangeRestrictionNear;
            }
            
            [device unlockForConfiguration];
        }
        
        return YES;
    }
    
    return NO;
}

- (void)handleMemoryWarning {
    self.qualityPreservationEnabled = NO;
    if (@available(iOS 14.0, *)) {
        [self.photoOutput setHighestPhotoQualityPrioritization:AVCapturePhotoQualityPrioritizationSpeed];
    }
}

- (void)setupThermalStateMonitoring {
    [self.processInfo addObserver:self
                      forKeyPath:@"thermalState"
                         options:NSKeyValueObservingOptionNew
                         context:nil];
}

- (BOOL)isThermalStateExcessive {
    return self.processInfo.thermalState >= kThermalStateThreshold;
}

- (BOOL)hasAdequateMemory {
    return self.processInfo.physicalMemory * kMemoryWarningThreshold > self.processInfo.systemUptime;
}

- (BOOL)hasBackgroundAccess {
    return [[AVCaptureDevice defaultDeviceWithMediaType:AVMediaTypeVideo] isAccessibilityElement];
}

- (NSDictionary *)getDeviceCapabilities {
    AVCaptureDevice *device = self.camera ?: [AVCaptureDevice defaultDeviceWithMediaType:AVMediaTypeVideo];
    
    return @{
        @"hdrSupported": @(device.isHDRPhotoPixelFormatSupported),
        @"flashSupported": @(device.hasFlash),
        @"maxDimension": @(kMaxImageDimension),
        @"stabilizationSupported": @(device.isSubjectMotionModeSupported),
        @"lowLightSupported": @(device.isLowLightBoostSupported)
    };
}

- (void)dealloc {
    [self.captureSession stopRunning];
    [[NSNotificationCenter defaultCenter] removeObserver:self];
    [self.processInfo removeObserver:self forKeyPath:@"thermalState"];
}

@end