package com.artknowledgegraph.app.storage

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * SecureStoragePackage - React Native package implementation for registering SecureStorageModule
 * 
 * This package enables secure storage capabilities in the Art Knowledge Graph Android application
 * by registering the SecureStorageModule with the React Native bridge.
 * 
 * Security Features:
 * - Implements AES-256 encryption through SecureStorageModule
 * - Handles sensitive data and authentication tokens
 * - Provides secure storage functionality to React Native components
 * 
 * Version: React Native 0.68.0
 */
class SecureStoragePackage : ReactPackage {

    /**
     * Creates and returns a list of native modules to register with the React Native bridge
     * 
     * @param reactContext The React Native application context
     * @return List containing the SecureStorageModule instance
     */
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(SecureStorageModule(reactContext))
    }

    /**
     * Creates and returns a list of ViewManagers to register with the React Native bridge
     * Not used for SecureStorage as it doesn't require any UI components
     * 
     * @param reactContext The React Native application context
     * @return Empty list as no ViewManagers are needed
     */
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}