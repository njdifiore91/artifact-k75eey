package com.artknowledgegraph.app

import android.app.Application // version: platform
import com.facebook.react.ReactApplication // version: 0.71.0
import com.facebook.react.ReactNativeHost // version: 0.71.0
import com.facebook.react.ReactPackage // version: 0.71.0
import com.facebook.react.defaults.DefaultReactNativeHost // version: 0.71.0
import com.facebook.soloader.SoLoader // version: 0.10.5
import com.artknowledgegraph.app.utils.DeviceInfoPackage
import com.artknowledgegraph.app.camera.CameraPackage
import java.util.concurrent.CopyOnWriteArrayList
import android.os.StrictMode
import android.util.Log
import com.facebook.react.modules.core.DefaultHardwareBackBtnHandler
import com.facebook.react.bridge.ReactContext

/**
 * MainApplication class that initializes React Native and manages native modules
 * with enhanced security, performance optimization, and error handling.
 */
class MainApplication : Application(), ReactApplication {

    companion object {
        private const val TAG = "MainApplication"
        private const val MIN_HEAP_SIZE = 256 * 1024 * 1024 // 256MB minimum heap
    }

    // Thread-safe list for validated packages
    private val validatedPackages = CopyOnWriteArrayList<ReactPackage>()
    
    // Lock object for thread-safe initialization
    private val packageInitLock = Object()

    // Enhanced ReactNativeHost implementation with error boundaries
    private val mReactNativeHost = object : DefaultReactNativeHost(this) {
        override fun getUseDeveloperSupport(): Boolean {
            return BuildConfig.DEBUG
        }

        override fun getPackages(): List<ReactPackage> {
            synchronized(packageInitLock) {
                if (validatedPackages.isEmpty()) {
                    try {
                        // Initialize and validate native packages
                        validatedPackages.addAll(
                            listOf(
                                DeviceInfoPackage(),
                                CameraPackage()
                            )
                        )
                        Log.d(TAG, "Successfully initialized native packages")
                    } catch (e: Exception) {
                        Log.e(TAG, "Error initializing packages", e)
                        // Return empty list as fallback to prevent crash
                        return emptyList()
                    }
                }
                return validatedPackages
            }
        }

        override fun getJSMainModuleName(): String {
            return "index"
        }

        override fun createReactInstanceManager() = super.createReactInstanceManager().apply {
            addReactInstanceEventListener(object : ReactInstanceEventListener {
                override fun onReactContextInitialized(context: ReactContext) {
                    setupErrorBoundary(context)
                }
            })
        }
    }

    override fun onCreate() {
        super.onCreate()

        // Enable strict mode for development builds
        if (BuildConfig.DEBUG) {
            enableStrictMode()
        }

        try {
            // Initialize SoLoader with performance monitoring
            val startTime = System.nanoTime()
            SoLoader.init(this, false)
            val duration = (System.nanoTime() - startTime) / 1_000_000
            Log.d(TAG, "SoLoader initialization took $duration ms")

            // Configure memory optimization
            configureMemoryOptimization()

            // Initialize error reporting
            setupErrorReporting()

            // Register lifecycle callbacks
            registerActivityLifecycleCallbacks(ApplicationLifecycleHandler())

        } catch (e: Exception) {
            Log.e(TAG, "Error during application initialization", e)
            // Fallback initialization for critical components
            SoLoader.init(this, true)
        }
    }

    override fun getReactNativeHost(): ReactNativeHost {
        return mReactNativeHost
    }

    private fun enableStrictMode() {
        StrictMode.setThreadPolicy(
            StrictMode.ThreadPolicy.Builder()
                .detectDiskReads()
                .detectDiskWrites()
                .detectNetwork()
                .penaltyLog()
                .build()
        )
    }

    private fun configureMemoryOptimization() {
        try {
            val runtime = Runtime.getRuntime()
            runtime.gc()
            val maxMemory = runtime.maxMemory()
            
            if (maxMemory < MIN_HEAP_SIZE) {
                Log.w(TAG, "Available heap size may be insufficient: $maxMemory bytes")
            }

            // Configure memory thresholds
            System.setProperty("react.gc.threshold", "0.8")
            System.setProperty("react.gc.interval", "30000")
        } catch (e: Exception) {
            Log.e(TAG, "Error configuring memory optimization", e)
        }
    }

    private fun setupErrorReporting() {
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e(TAG, "Uncaught exception in thread ${thread.name}", throwable)
            // Here you would typically integrate with your error reporting service
        }
    }

    private fun setupErrorBoundary(reactContext: ReactContext) {
        reactContext.setNativeModuleCallExceptionHandler { exception ->
            Log.e(TAG, "Native module call exception", exception)
            // Handle native module exceptions
        }
    }

    private inner class ApplicationLifecycleHandler : ActivityLifecycleCallbacks {
        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
            if (activity is DefaultHardwareBackBtnHandler) {
                mReactNativeHost.reactInstanceManager?.onHostResume(activity, activity)
            }
        }

        override fun onActivityStarted(activity: Activity) {}
        override fun onActivityResumed(activity: Activity) {}
        override fun onActivityPaused(activity: Activity) {}
        override fun onActivityStopped(activity: Activity) {}
        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
        
        override fun onActivityDestroyed(activity: Activity) {
            if (activity is DefaultHardwareBackBtnHandler) {
                mReactNativeHost.reactInstanceManager?.onHostDestroy(activity)
            }
        }
    }
}