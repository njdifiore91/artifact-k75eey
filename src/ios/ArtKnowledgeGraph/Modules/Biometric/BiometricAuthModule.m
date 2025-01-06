// React Native 0.70.0+
#import <React/React.h>
// iOS 14.0+
#import <Foundation/Foundation.h>
#import "BiometricAuthModule-Swift.h"

// Error domain for biometric authentication
static NSString *const BiometricAuthErrorDomain = @"com.artknowledgegraph.biometric";

@interface BiometricAuthModule : NSObject <RCTBridgeModule>
@end

@implementation BiometricAuthModule

// Export module to React Native
RCT_EXPORT_MODULE()

// Configure module to run on main queue
+ (BOOL)requiresMainQueueSetup {
    return NO;
}

// Configure dispatch queue for module methods
- (dispatch_queue_t)methodQueue {
    return dispatch_get_main_queue();
}

// Export authenticateUser method to React Native
RCT_EXPORT_METHOD(authenticateUser:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    // Create instance of Swift BiometricAuthModule
    BiometricAuthModule *swiftModule = [[BiometricAuthModule alloc] init];
    
    // Forward authentication request to Swift implementation
    [swiftModule authenticateUser:^(id result) {
        resolve(result);
    } reject:^(NSString *code, NSString *message, NSError *error) {
        reject(code, message, error);
    }];
}

// Export isBiometricsAvailable method to React Native
RCT_EXPORT_METHOD(isBiometricsAvailable:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    // Create instance of Swift BiometricAuthModule
    BiometricAuthModule *swiftModule = [[BiometricAuthModule alloc] init];
    
    // Forward availability check request to Swift implementation
    [swiftModule isBiometricsAvailable:^(id result) {
        resolve(result);
    } reject:^(NSString *code, NSString *message, NSError *error) {
        reject(code, message, error);
    }];
}

// Export constants to JavaScript
- (NSDictionary *)constantsToExport {
    return @{
        @"ErrorDomain": BiometricAuthErrorDomain
    };
}

@end