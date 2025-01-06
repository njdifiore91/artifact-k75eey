/*
 * BiometricAuthPackage.kt
 * React Native package implementation for biometric authentication in Art Knowledge Graph Android app
 * 
 * Dependencies:
 * - react-native: 0.71.0
 */

package com.artknowledgegraph.app.biometric

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * React Native package that securely registers BiometricAuthModule with proper lifecycle management
 * and security validation. Implements ReactPackage interface for module registration.
 */
class BiometricAuthPackage : ReactPackage {

    /**
     * Creates and returns a list containing the BiometricAuthModule instance with security validation.
     * Ensures proper module initialization and lifecycle management.
     *
     * @param reactContext The React Native application context for module initialization
     * @return List containing the validated BiometricAuthModule instance
     * @throws IllegalStateException if context validation fails
     */
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        // Validate context before module creation
        requireNotNull(reactContext) { "ReactApplicationContext cannot be null" }
        require(reactContext.hasActiveCatalystInstance()) { 
            "ReactApplicationContext must have an active CatalystInstance" 
        }

        // Create and return module with security validation
        return listOf(BiometricAuthModule(reactContext))
    }

    /**
     * Creates and returns an empty list of view managers.
     * Required by ReactPackage interface but unused for biometric authentication.
     *
     * @param reactContext The React Native application context
     * @return Empty list of view managers
     */
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        // No view managers needed for biometric authentication
        return emptyList()
    }
}