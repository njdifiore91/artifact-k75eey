#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <Foundation/Foundation.h>
#import "DeviceInfoModule-Swift.h"

// Error domain constant
static NSString *const kDeviceInfoErrorDomain = @"com.artknowledgegraph.deviceinfo";

@interface DeviceInfoModule : NSObject <RCTBridgeModule>

@property (nonatomic, strong) NSCache *deviceInfoCache;
@property (nonatomic, strong) DeviceInfoModule *swiftModule;

@end

@implementation DeviceInfoModule

// MARK: - RCTBridgeModule Setup

RCT_EXPORT_MODULE(DeviceInfoModule)

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

// MARK: - Initialization

- (instancetype)init {
    if (self = [super init]) {
        _deviceInfoCache = [[NSCache alloc] init];
        _deviceInfoCache.countLimit = 1;
        _swiftModule = [[DeviceInfoModule alloc] init];
        
        // Register for memory warnings to clear cache
        [[NSNotificationCenter defaultCenter] addObserver:self
                                               selector:@selector(clearCache)
                                                   name:UIApplicationDidReceiveMemoryWarningNotification
                                                 object:nil];
    }
    return self;
}

- (void)dealloc {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
    [_deviceInfoCache removeAllObjects];
    _swiftModule = nil;
}

// MARK: - Exported Methods

RCT_EXPORT_METHOD(getDeviceInfo:(RCTPromiseResolveBlock)resolve
                       reject:(RCTPromiseRejectBlock)reject) {
    @autoreleasepool {
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
            // Check cache first
            NSDictionary *cachedInfo = [self.deviceInfoCache objectForKey:@"deviceInfo"];
            if (cachedInfo) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    resolve(cachedInfo);
                });
                return;
            }
            
            // Forward to Swift implementation
            [self.swiftModule getDeviceInfo:^(NSDictionary *info) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    [self.deviceInfoCache setObject:info forKey:@"deviceInfo"];
                    resolve(info);
                });
            } reject:^(NSString *code, NSString *message, NSError *error) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    reject(code, message, error);
                });
            }];
        });
    }
}

RCT_EXPORT_METHOD(getSystemVersion:(RCTPromiseResolveBlock)resolve
                          reject:(RCTPromiseRejectBlock)reject) {
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        // Check cache first
        NSDictionary *cachedVersion = [self.deviceInfoCache objectForKey:@"systemVersion"];
        if (cachedVersion) {
            dispatch_async(dispatch_get_main_queue(), ^{
                resolve(cachedVersion);
            });
            return;
        }
        
        // Forward to Swift implementation
        [self.swiftModule getSystemVersion:^(NSDictionary *versionInfo) {
            dispatch_async(dispatch_get_main_queue(), ^{
                [self.deviceInfoCache setObject:versionInfo forKey:@"systemVersion"];
                resolve(versionInfo);
            });
        } reject:^(NSString *code, NSString *message, NSError *error) {
            dispatch_async(dispatch_get_main_queue(), ^{
                reject(code, message, error);
            });
        }];
    });
}

RCT_EXPORT_METHOD(isEmulator:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject) {
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        // Check cache first
        NSDictionary *cachedEmulatorInfo = [self.deviceInfoCache objectForKey:@"emulatorInfo"];
        if (cachedEmulatorInfo) {
            dispatch_async(dispatch_get_main_queue(), ^{
                resolve(cachedEmulatorInfo);
            });
            return;
        }
        
        // Forward to Swift implementation
        [self.swiftModule isEmulator:^(NSDictionary *emulatorInfo) {
            dispatch_async(dispatch_get_main_queue(), ^{
                [self.deviceInfoCache setObject:emulatorInfo forKey:@"emulatorInfo"];
                resolve(emulatorInfo);
            });
        } reject:^(NSString *code, NSString *message, NSError *error) {
            dispatch_async(dispatch_get_main_queue(), ^{
                reject(code, message, error);
            });
        }];
    });
}

// MARK: - Private Methods

- (void)clearCache {
    [self.deviceInfoCache removeAllObjects];
    [self.swiftModule clearCache];
}

@end