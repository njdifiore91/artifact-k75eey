package com.artknowledgegraph.app.camera

import com.facebook.react.ReactPackage // v0.71.0
import com.facebook.react.bridge.ReactApplicationContext // v0.71.0
import com.facebook.react.bridge.NativeModule // v0.71.0
import com.facebook.react.uimanager.ViewManager // v0.71.0
import java.util.Collections
import java.util.concurrent.atomic.AtomicReference
import android.util.Log

/**
 * Thread-safe React Native package implementation that registers the camera module
 * for artwork capture functionality in the Art Knowledge Graph application.
 */
class CameraPackage : ReactPackage {

    companion object {
        private const val TAG = "CameraPackage"
    }

    // Thread-safe module instance management using AtomicReference
    private val moduleInstance = AtomicReference<CameraModule>()
    
    // Synchronization lock for module creation
    private val lock = Object()

    /**
     * Creates and returns a list of native modules with thread-safe instantiation.
     * Ensures only one instance of CameraModule is created and reused.
     *
     * @param reactContext The React Native application context
     * @return List containing the single CameraModule instance
     */
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        try {
            synchronized(lock) {
                val startTime = System.nanoTime()
                
                // Get or create module instance atomically
                var module = moduleInstance.get()
                if (module == null) {
                    module = CameraModule(reactContext)
                    if (!moduleInstance.compareAndSet(null, module)) {
                        // Another thread beat us to creation, use their instance
                        module = moduleInstance.get()
                    } else {
                        Log.d(TAG, "Created new CameraModule instance")
                    }
                }

                // Log performance metrics
                val duration = (System.nanoTime() - startTime) / 1_000_000 // Convert to milliseconds
                Log.d(TAG, "Module creation/retrieval took $duration ms")

                return Collections.singletonList(module)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error creating native modules", e)
            // Return empty list in case of error to prevent app crash
            return Collections.emptyList()
        }
    }

    /**
     * Creates and returns an empty list of view managers as no custom views are needed.
     * Required by ReactPackage interface but unused for camera functionality.
     *
     * @param reactContext The React Native application context
     * @return Empty immutable list as no view managers are needed
     */
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return Collections.emptyList()
    }
}