package com.artknowledgegraph.app

import android.os.Bundle // version: platform
import com.facebook.react.ReactActivity // version: 0.71.0
import com.facebook.react.ReactActivityDelegate // version: 0.71.0
import com.facebook.react.defaults.DefaultReactActivityDelegate // version: 0.71.0
import com.facebook.react.perflogger.PerformanceLogger // version: 0.71.0
import com.facebook.react.bridge.ReactContext // version: 0.71.0
import android.view.WindowManager
import android.util.Log
import android.os.Build
import androidx.core.view.WindowCompat
import java.util.concurrent.atomic.AtomicReference

/**
 * Enhanced MainActivity class that serves as the entry point for the React Native application
 * with performance monitoring, security measures, and optimized lifecycle management.
 */
class MainActivity : ReactActivity() {

    companion object {
        private const val TAG = "MainActivity"
        private const val COMPONENT_NAME = "ArtKnowledgeGraph"
    }

    // Thread-safe performance logger instance
    private val performanceLogger = AtomicReference<PerformanceLogger>()
    
    // Thread-safe error boundary reference
    private val errorBoundary = AtomicReference<ReactContext>()

    /**
     * Returns the name of the main component registered from JavaScript.
     * This is used to schedule rendering of the component.
     */
    override fun getMainComponentName(): String = COMPONENT_NAME

    /**
     * Enhanced onCreate lifecycle callback with performance monitoring,
     * security measures, and error handling.
     */
    override fun onCreate(savedInstanceState: Bundle?) {
        try {
            // Start performance monitoring
            val startTime = System.nanoTime()
            performanceLogger.get()?.startTimeLogger("MainActivity_onCreate")

            // Apply security configurations
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WindowCompat.setDecorFitsSystemWindows(window, false)
            }
            window.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            )

            super.onCreate(savedInstanceState)

            // Initialize React Native components with error boundaries
            setupErrorBoundaries()
            
            // Configure memory optimization
            configureMemoryOptimization()

            // End performance monitoring
            val duration = (System.nanoTime() - startTime) / 1_000_000
            performanceLogger.get()?.stopTimeLogger("MainActivity_onCreate")
            Log.d(TAG, "onCreate completed in $duration ms")

        } catch (e: Exception) {
            Log.e(TAG, "Error during onCreate", e)
            // Fallback initialization
            super.onCreate(savedInstanceState)
        }
    }

    /**
     * Creates an enhanced ReactActivityDelegate with performance monitoring
     * and error handling capabilities.
     */
    override fun createReactActivityDelegate(): ReactActivityDelegate {
        return object : DefaultReactActivityDelegate(
            this,
            mainComponentName,
            (application as MainApplication).getReactNativeHost()
        ) {
            override fun onCreate() {
                performanceLogger.get()?.startTimeLogger("ReactDelegate_onCreate")
                super.onCreate()
                performanceLogger.get()?.stopTimeLogger("ReactDelegate_onCreate")
            }

            override fun loadApp(appKey: String?) {
                performanceLogger.get()?.startTimeLogger("ReactDelegate_loadApp")
                super.loadApp(appKey)
                performanceLogger.get()?.stopTimeLogger("ReactDelegate_loadApp")
            }

            override fun onResume() {
                performanceLogger.get()?.startTimeLogger("ReactDelegate_onResume")
                super.onResume()
                performanceLogger.get()?.stopTimeLogger("ReactDelegate_onResume")
            }
        }
    }

    /**
     * Enhanced onResume lifecycle callback with graph state management
     * and performance monitoring.
     */
    override fun onResume() {
        try {
            performanceLogger.get()?.startTimeLogger("MainActivity_onResume")
            
            super.onResume()
            
            // Restore graph state if needed
            restoreGraphState()
            
            // Resume performance monitoring
            resumePerformanceMonitoring()
            
            // Check memory usage
            checkMemoryUsage()

            performanceLogger.get()?.stopTimeLogger("MainActivity_onResume")
        } catch (e: Exception) {
            Log.e(TAG, "Error during onResume", e)
            super.onResume()
        }
    }

    /**
     * Enhanced onPause lifecycle callback with resource optimization
     * and state preservation.
     */
    override fun onPause() {
        try {
            performanceLogger.get()?.startTimeLogger("MainActivity_onPause")
            
            // Save graph state
            saveGraphState()
            
            // Pause performance monitoring
            pausePerformanceMonitoring()
            
            // Optimize memory usage
            optimizeMemoryUsage()

            super.onPause()
            
            performanceLogger.get()?.stopTimeLogger("MainActivity_onPause")
        } catch (e: Exception) {
            Log.e(TAG, "Error during onPause", e)
            super.onPause()
        }
    }

    private fun setupErrorBoundaries() {
        try {
            val reactContext = (application as MainApplication)
                .getReactNativeHost()
                .reactInstanceManager
                .currentReactContext

            reactContext?.let { context ->
                errorBoundary.set(context)
                context.setNativeModuleCallExceptionHandler { throwable ->
                    Log.e(TAG, "Native module call exception", throwable)
                    // Handle native module exceptions
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error setting up error boundaries", e)
        }
    }

    private fun configureMemoryOptimization() {
        try {
            val runtime = Runtime.getRuntime()
            runtime.gc()
            
            // Configure memory thresholds
            System.setProperty("react.gc.threshold", "0.8")
            System.setProperty("react.gc.interval", "30000")
        } catch (e: Exception) {
            Log.e(TAG, "Error configuring memory optimization", e)
        }
    }

    private fun saveGraphState() {
        // Implementation for saving graph state
    }

    private fun restoreGraphState() {
        // Implementation for restoring graph state
    }

    private fun resumePerformanceMonitoring() {
        performanceLogger.get()?.resumeAllTimers()
    }

    private fun pausePerformanceMonitoring() {
        performanceLogger.get()?.pauseAllTimers()
    }

    private fun checkMemoryUsage() {
        val runtime = Runtime.getRuntime()
        val usedMemory = (runtime.totalMemory() - runtime.freeMemory()) / 1024 / 1024
        Log.d(TAG, "Current memory usage: $usedMemory MB")
    }

    private fun optimizeMemoryUsage() {
        System.gc()
        Runtime.getRuntime().gc()
    }
}