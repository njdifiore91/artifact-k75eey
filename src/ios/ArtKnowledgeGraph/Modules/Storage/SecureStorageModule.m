#import <React/RCTBridgeModule.h> // React Native 0.70.0+
#import <Foundation/Foundation.h> // iOS 14.0+
#import "SecureStorageModule-Swift.h" // Bridge header for Swift implementation

// Error domain constant
NSString * const kSecureStorageErrorDomain = @"com.artknowledgegraph.securestorage";

// Thread-safe queue for storage operations
static dispatch_queue_t secureStorageQueue;

@interface SecureStorageModule : NSObject <RCTBridgeModule>
@property (nonatomic, strong) SecureStorageModule *swiftModule;
@end

@implementation SecureStorageModule

RCT_EXPORT_MODULE();

+ (void)initialize {
    if (self == [SecureStorageModule class]) {
        // Initialize serial queue with user-initiated QoS
        secureStorageQueue = dispatch_queue_create(
            "com.artknowledgegraph.securestorage.queue",
            dispatch_queue_attr_make_with_qos_class(DISPATCH_QUEUE_SERIAL, QOS_CLASS_USER_INITIATED, 0)
        );
    }
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _swiftModule = [[SecureStorageModule alloc] init];
    }
    return self;
}

+ (BOOL)requiresMainQueueSetup {
    return NO; // Using custom queue for operations
}

RCT_EXPORT_METHOD(saveSecureData:(NSString *)key
                  data:(NSString *)data
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    
    dispatch_async(secureStorageQueue, ^{
        @autoreleasepool {
            // Validate input parameters
            if (!key || [key length] == 0 || !data || [data length] == 0) {
                NSError *error = [NSError errorWithDomain:kSecureStorageErrorDomain
                                                   code:1001
                                               userInfo:@{NSLocalizedDescriptionKey: @"Key and data must not be empty"}];
                reject(@"1001", @"Invalid input parameters", error);
                return;
            }
            
            // Call Swift implementation
            [self.swiftModule saveSecureData:key
                                      data:data
                                  resolve:^(id result) {
                // Clear sensitive data from memory
                @autoreleasepool {
                    NSMutableData *sensitiveData = [data dataUsingEncoding:NSUTF8StringEncoding].mutableCopy;
                    if (sensitiveData) {
                        memset(sensitiveData.mutableBytes, 0, sensitiveData.length);
                    }
                }
                resolve(result);
            }
                                   reject:^(NSString *code, NSString *message, NSError *error) {
                reject(code, message, error);
            }];
        }
    });
}

RCT_EXPORT_METHOD(getSecureData:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    
    dispatch_async(secureStorageQueue, ^{
        @autoreleasepool {
            // Validate key parameter
            if (!key || [key length] == 0) {
                NSError *error = [NSError errorWithDomain:kSecureStorageErrorDomain
                                                   code:1001
                                               userInfo:@{NSLocalizedDescriptionKey: @"Key must not be empty"}];
                reject(@"1001", @"Invalid key parameter", error);
                return;
            }
            
            // Call Swift implementation
            [self.swiftModule getSecureData:key
                                  resolve:^(NSString *result) {
                if (result) {
                    // Return data while ensuring memory cleanup
                    @autoreleasepool {
                        resolve(result);
                    }
                } else {
                    NSError *error = [NSError errorWithDomain:kSecureStorageErrorDomain
                                                       code:1004
                                                   userInfo:@{NSLocalizedDescriptionKey: @"Data not found"}];
                    reject(@"1004", @"Data not found for key", error);
                }
            }
                                   reject:^(NSString *code, NSString *message, NSError *error) {
                reject(code, message, error);
            }];
        }
    });
}

RCT_EXPORT_METHOD(removeSecureData:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    
    dispatch_async(secureStorageQueue, ^{
        @autoreleasepool {
            // Validate key parameter
            if (!key || [key length] == 0) {
                NSError *error = [NSError errorWithDomain:kSecureStorageErrorDomain
                                                   code:1001
                                               userInfo:@{NSLocalizedDescriptionKey: @"Key must not be empty"}];
                reject(@"1001", @"Invalid key parameter", error);
                return;
            }
            
            // Call Swift implementation
            [self.swiftModule removeSecureData:key
                                     resolve:^(id result) {
                resolve(result);
            }
                                      reject:^(NSString *code, NSString *message, NSError *error) {
                reject(code, message, error);
            }];
        }
    });
}

- (void)dealloc {
    // Cleanup any remaining sensitive data
    @autoreleasepool {
        self.swiftModule = nil;
    }
}

@end