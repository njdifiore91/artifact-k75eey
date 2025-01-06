package com.artknowledgegraph.app.utils

import com.facebook.react.bridge.ReactContextBaseJavaModule // version: 0.71.0
import com.facebook.react.bridge.ReactMethod // version: 0.71.0
import com.facebook.react.bridge.ReactApplicationContext // version: 0.71.0
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import android.os.Build // version: platform
import android.util.DisplayMetrics // version: platform
import android.view.WindowManager // version: platform
import android.content.Context
import kotlin.math.sqrt
import kotlin.math.min
import kotlin.math.max

/**
 * Enhanced React Native module providing comprehensive device information and screen metrics
 * with validation for API level and screen size requirements.
 * Implements caching for performance optimization and handles orientation changes.
 */
class DeviceInfoModule(private val reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val MIN_API_LEVEL = 26 // Android 8.0
        private const val MIN_SCREEN_SIZE_INCHES = 4.7f
        private const val MIN_DP_WIDTH = 320
        private const val MAX_DP_WIDTH = 428
    }

    private var cachedDeviceInfo: WritableMap? = null
    private var cachedScreenMetrics: WritableMap? = null
    private var lastOrientation: Int = -1

    override fun getName(): String = "DeviceInfoModule"

    /**
     * Validates device compatibility with minimum requirements:
     * - Android API level >= 26 (Android 8.0+)
     * - Minimum screen size of 4.7 inches
     */
    private fun validateDeviceCompatibility(): Boolean {
        if (Build.VERSION.SDK_INT < MIN_API_LEVEL) {
            return false
        }

        val metrics = getDisplayMetrics()
        val screenSizeInches = calculateScreenSizeInches(metrics)
        return screenSizeInches >= MIN_SCREEN_SIZE_INCHES
    }

    /**
     * Retrieves current display metrics from WindowManager
     */
    private fun getDisplayMetrics(): DisplayMetrics {
        val metrics = DisplayMetrics()
        val windowManager = reactContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        windowManager.defaultDisplay.getRealMetrics(metrics)
        return metrics
    }

    /**
     * Calculates screen size in inches using Pythagorean theorem
     */
    private fun calculateScreenSizeInches(metrics: DisplayMetrics): Float {
        val widthInches = metrics.widthPixels / metrics.xdpi
        val heightInches = metrics.heightPixels / metrics.ydpi
        return sqrt(widthInches * widthInches + heightInches * heightInches)
    }

    /**
     * Provides comprehensive device information with validation and caching
     */
    @ReactMethod
    fun getDeviceInfo(promise: Promise) {
        try {
            // Return cached info if available and orientation hasn't changed
            val currentOrientation = reactContext.resources.configuration.orientation
            if (cachedDeviceInfo != null && lastOrientation == currentOrientation) {
                promise.resolve(cachedDeviceInfo)
                return
            }

            if (!validateDeviceCompatibility()) {
                promise.reject(
                    "DEVICE_INCOMPATIBLE",
                    "Device does not meet minimum requirements: Android 8.0+ and 4.7\" screen"
                )
                return
            }

            val metrics = getDisplayMetrics()
            val screenSizeInches = calculateScreenSizeInches(metrics)

            val deviceInfo = Arguments.createMap().apply {
                putInt("apiLevel", Build.VERSION.SDK_INT)
                putString("manufacturer", Build.MANUFACTURER)
                putString("model", Build.MODEL)
                putString("osVersion", Build.VERSION.RELEASE)
                putString("brand", Build.BRAND)
                putString("device", Build.DEVICE)
                putString("product", Build.PRODUCT)
                putString("hardware", Build.HARDWARE)

                // Screen metrics
                putMap("screenMetrics", Arguments.createMap().apply {
                    putInt("widthPixels", metrics.widthPixels)
                    putInt("heightPixels", metrics.heightPixels)
                    putInt("densityDpi", metrics.densityDpi)
                    putDouble("density", metrics.density.toDouble())
                    putDouble("scaledDensity", metrics.scaledDensity.toDouble())
                    putDouble("widthInches", (metrics.widthPixels / metrics.xdpi).toDouble())
                    putDouble("heightInches", (metrics.heightPixels / metrics.ydpi).toDouble())
                    putDouble("screenSizeInches", screenSizeInches.toDouble())
                    putInt("orientation", currentOrientation)
                })

                // Device capabilities
                putMap("capabilities", Arguments.createMap().apply {
                    putBoolean("hasNotch", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P)
                    putBoolean("supportsDarkMode", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                    putBoolean("supportsAdaptiveLayouts", true)
                    putString("minApiLevel", "API $MIN_API_LEVEL (Android 8.0)")
                    putString("minScreenSize", "$MIN_SCREEN_SIZE_INCHES inches")
                })
            }

            cachedDeviceInfo = deviceInfo
            lastOrientation = currentOrientation
            promise.resolve(deviceInfo)

        } catch (e: Exception) {
            promise.reject(
                "DEVICE_INFO_ERROR",
                "Failed to retrieve device information: ${e.message}",
                e
            )
        }
    }

    /**
     * Provides detailed screen metrics with density and scaling calculations
     */
    @ReactMethod
    fun getScreenMetrics(promise: Promise) {
        try {
            val currentOrientation = reactContext.resources.configuration.orientation
            if (cachedScreenMetrics != null && lastOrientation == currentOrientation) {
                promise.resolve(cachedScreenMetrics)
                return
            }

            val metrics = getDisplayMetrics()
            val widthDp = (metrics.widthPixels / metrics.density).toInt()
            val heightDp = (metrics.heightPixels / metrics.density).toInt()

            // Validate dp range requirements
            if (min(widthDp, heightDp) < MIN_DP_WIDTH || max(widthDp, heightDp) > MAX_DP_WIDTH) {
                promise.reject(
                    "SCREEN_SIZE_INCOMPATIBLE",
                    "Screen dimensions must be between ${MIN_DP_WIDTH}dp and ${MAX_DP_WIDTH}dp"
                )
                return
            }

            val screenMetrics = Arguments.createMap().apply {
                // Physical pixels
                putInt("widthPixels", metrics.widthPixels)
                putInt("heightPixels", metrics.heightPixels)

                // Density-independent pixels (dp)
                putInt("widthDp", widthDp)
                putInt("heightDp", heightDp)

                // Density information
                putInt("densityDpi", metrics.densityDpi)
                putDouble("density", metrics.density.toDouble())
                putDouble("scaledDensity", metrics.scaledDensity.toDouble())

                // Physical size
                putDouble("xdpi", metrics.xdpi.toDouble())
                putDouble("ydpi", metrics.ydpi.toDouble())

                // Screen metrics
                putDouble("screenWidthInches", (metrics.widthPixels / metrics.xdpi).toDouble())
                putDouble("screenHeightInches", (metrics.heightPixels / metrics.ydpi).toDouble())
                putDouble("screenSizeInches", calculateScreenSizeInches(metrics).toDouble())

                // Orientation
                putInt("orientation", currentOrientation)

                // Font scaling
                putDouble("fontScale", metrics.scaledDensity / metrics.density)
            }

            cachedScreenMetrics = screenMetrics
            lastOrientation = currentOrientation
            promise.resolve(screenMetrics)

        } catch (e: Exception) {
            promise.reject(
                "SCREEN_METRICS_ERROR",
                "Failed to retrieve screen metrics: ${e.message}",
                e
            )
        }
    }
}