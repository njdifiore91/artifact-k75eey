package com.artknowledgegraph.app.utils

import com.facebook.react.ReactPackage // v0.68.0
import com.facebook.react.bridge.ReactApplicationContext // v0.68.0
import com.facebook.react.bridge.NativeModule // v0.68.0
import com.facebook.react.uimanager.ViewManager // v0.68.0
import android.util.Log

/**
 * React Native package implementation for registering the PermissionModule.
 * Handles runtime permissions for Android 8+ devices with proper error handling
 * and lifecycle management.
 */
class PermissionPackage : ReactPackage {

    companion object {
        private const val TAG = "PermissionPackage"
    }

    /**
     * Creates and returns a list of native modules to register with React Native.
     * Implements proper error handling and context validation.
     *
     * @param reactContext The React Native application context
     * @return List containing the PermissionModule instance
     */
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        try {
            // Validate context
            requireNotNull(reactContext) { "ReactApplicationContext cannot be null" }

            // Initialize list with optimal capacity
            val modules = ArrayList<NativeModule>(1)

            // Create and add PermissionModule with error handling
            val permissionModule = PermissionModule(reactContext)
            modules.add(permissionModule)

            Log.d(TAG, "Successfully created PermissionModule")
            return modules
        } catch (e: Exception) {
            Log.e(TAG, "Error creating native modules", e)
            // Return empty list in case of initialization failure
            return ArrayList(0)
        }
    }

    /**
     * Creates and returns an empty list of view managers as this package
     * focuses on permission handling without UI components.
     *
     * @param reactContext The React Native application context
     * @return Empty list as no view managers are needed
     */
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        // Return empty list optimized for memory usage
        return ArrayList(0)
    }
}