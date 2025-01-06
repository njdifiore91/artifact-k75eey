#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <Foundation/Foundation.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import "ArtKnowledgeGraph-Swift.h" // Bridge header for Swift files

// Constants
static NSString* const kPermissionCache = @"com.artknowledgegraph.permissioncache";
static const NSTimeInterval kDefaultTimeout = 30.0;
static const NSTimeInterval kCacheExpiration = 300.0; // 5 minutes

@interface PermissionModule : NSObject <RCTBridgeModule>

@property (nonatomic, strong) LAContext *authContext;
@property (nonatomic, strong) NSCache *permissionCache;
@property (nonatomic, strong) dispatch_queue_t permissionQueue;
@property (nonatomic, strong) NSMutableSet *activeRequests;
@property (nonatomic, strong) NSLock *permissionLock;

@end

@implementation PermissionModule

RCT_EXPORT_MODULE();

- (instancetype)init {
    static dispatch_once_t onceToken;
    static PermissionModule *instance = nil;
    
    dispatch_once(&onceToken, ^{
        instance = [super init];
        if (instance) {
            instance.authContext = [[LAContext alloc] init];
            instance.permissionCache = [[NSCache alloc] init];
            instance.permissionQueue = dispatch_queue_create("com.artknowledgegraph.app.permission", 
                                                          DISPATCH_QUEUE_SERIAL);
            instance.activeRequests = [NSMutableSet new];
            instance.permissionLock = [[NSLock alloc] init];
            
            // Configure biometric authentication
            instance.authContext.localizedFallbackTitle = NSLocalizedString(@"Use Passcode", nil);
            instance.authContext.localizedCancelTitle = NSLocalizedString(@"Cancel", nil);
            
            // Setup notification observers
            [instance setupNotificationObservers];
        }
    });
    
    return instance;
}

- (dispatch_queue_t)methodQueue {
    return self.permissionQueue;
}

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

#pragma mark - Exported Methods

RCT_EXPORT_METHOD(checkPermissionStatus:(NSString *)permissionType
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    [self.permissionLock lock];
    @try {
        // Check cache first
        NSNumber *cachedStatus = [self.permissionCache objectForKey:permissionType];
        if (cachedStatus) {
            [self.permissionLock unlock];
            resolve(cachedStatus);
            return;
        }
        
        // Convert string to enum
        PermissionType type = [self permissionTypeFromString:permissionType];
        if (type == NSNotFound) {
            [self.permissionLock unlock];
            reject(@"INVALID_PERMISSION", @"Invalid permission type", nil);
            return;
        }
        
        // Get current status
        PermissionStatus status = [[PermissionModule swift] checkPermissionStatus:type];
        NSNumber *result = @(status);
        
        // Update cache
        [self.permissionCache setObject:result forKey:permissionType];
        
        [self.permissionLock unlock];
        resolve(result);
    } @catch (NSException *exception) {
        [self.permissionLock unlock];
        reject(@"PERMISSION_ERROR", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(requestPermission:(NSString *)permissionType
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    [self.permissionLock lock];
    
    // Check if request is already in progress
    if ([self.activeRequests containsObject:permissionType]) {
        [self.permissionLock unlock];
        reject(@"ALREADY_REQUESTING", @"Permission request already in progress", nil);
        return;
    }
    
    [self.activeRequests addObject:permissionType];
    [self.permissionLock unlock];
    
    // Convert string to enum
    PermissionType type = [self permissionTypeFromString:permissionType];
    if (type == NSNotFound) {
        [self cleanupRequest:permissionType];
        reject(@"INVALID_PERMISSION", @"Invalid permission type", nil);
        return;
    }
    
    // Check if biometric authentication is needed
    if ([self requiresBiometricAuth:type]) {
        [self authenticateWithBiometrics:^(BOOL success, NSError *error) {
            if (!success) {
                [self cleanupRequest:permissionType];
                reject(@"AUTH_FAILED", @"Biometric authentication failed", error);
                return;
            }
            
            [self processPermissionRequest:type
                            permissionType:permissionType
                                 resolver:resolve
                                 rejecter:reject];
        }];
    } else {
        [self processPermissionRequest:type
                        permissionType:permissionType
                             resolver:resolve
                             rejecter:reject];
    }
}

RCT_EXPORT_METHOD(checkMultiplePermissions:(NSArray *)permissionTypes
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    if (!permissionTypes || ![permissionTypes isKindOfClass:[NSArray class]]) {
        reject(@"INVALID_INPUT", @"Invalid permission types array", nil);
        return;
    }
    
    dispatch_group_t group = dispatch_group_create();
    NSMutableDictionary *results = [NSMutableDictionary new];
    
    for (NSString *permissionType in permissionTypes) {
        dispatch_group_enter(group);
        
        [self checkPermissionStatus:permissionType
                         resolver:^(id result) {
            [results setObject:result forKey:permissionType];
            dispatch_group_leave(group);
        } rejecter:^(NSString *code, NSString *message, NSError *error) {
            [results setObject:@(PermissionStatusDenied) forKey:permissionType];
            dispatch_group_leave(group);
        }];
    }
    
    dispatch_group_notify(group, self.permissionQueue, ^{
        resolve(results);
    });
}

#pragma mark - Private Methods

- (void)setupNotificationObservers {
    [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(handleAppStateChange:)
                                               name:UIApplicationDidBecomeActiveNotification
                                             object:nil];
}

- (void)handleAppStateChange:(NSNotification *)notification {
    [self.permissionCache removeAllObjects];
}

- (void)processPermissionRequest:(PermissionType)type
                 permissionType:(NSString *)permissionType
                      resolver:(RCTPromiseResolveBlock)resolve
                      rejecter:(RCTPromiseRejectBlock)reject {
    
    dispatch_time_t timeout = dispatch_time(DISPATCH_TIME_NOW, (int64_t)(kDefaultTimeout * NSEC_PER_SEC));
    dispatch_async(self.permissionQueue, ^{
        [[PermissionModule swift] requestPermission:type
                                          timeout:kDefaultTimeout
                                      completion:^(NSNumber *status, NSError *error) {
            [self cleanupRequest:permissionType];
            
            if (error) {
                reject(@"PERMISSION_ERROR", error.localizedDescription, error);
            } else {
                [self.permissionCache setObject:status forKey:permissionType];
                resolve(status);
            }
        }];
    });
}

- (void)cleanupRequest:(NSString *)permissionType {
    [self.permissionLock lock];
    [self.activeRequests removeObject:permissionType];
    [self.permissionLock unlock];
}

- (BOOL)requiresBiometricAuth:(PermissionType)type {
    return type == PermissionTypeBiometric;
}

- (void)authenticateWithBiometrics:(void (^)(BOOL success, NSError *error))completion {
    NSError *error = nil;
    if (![self.authContext canEvaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics error:&error]) {
        completion(NO, error);
        return;
    }
    
    [self.authContext evaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics
                   localizedReason:NSLocalizedString(@"Authenticate to access secure features", nil)
                             reply:^(BOOL success, NSError *error) {
        dispatch_async(self.permissionQueue, ^{
            completion(success, error);
        });
    }];
}

- (PermissionType)permissionTypeFromString:(NSString *)permissionType {
    NSDictionary *types = @{
        @"camera": @(PermissionTypeCamera),
        @"photoLibrary": @(PermissionTypePhotoLibrary),
        @"biometric": @(PermissionTypeBiometric),
        @"microphone": @(PermissionTypeMicrophone),
        @"location": @(PermissionTypeLocation)
    };
    
    NSNumber *type = types[permissionType];
    return type ? [type intValue] : NSNotFound;
}

- (NSDictionary *)constantsToExport {
    return @{
        @"PERMISSION_TYPES": @{
            @"CAMERA": @"camera",
            @"PHOTO_LIBRARY": @"photoLibrary",
            @"BIOMETRIC": @"biometric",
            @"MICROPHONE": @"microphone",
            @"LOCATION": @"location"
        },
        @"RESULTS": @{
            @"GRANTED": @(PermissionStatusAuthorized),
            @"DENIED": @(PermissionStatusDenied),
            @"UNAVAILABLE": @(PermissionStatusNotDetermined),
            @"LIMITED": @(PermissionStatusLimited),
            @"RESTRICTED": @(PermissionStatusRestricted)
        }
    };
}

- (void)dealloc {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

@end