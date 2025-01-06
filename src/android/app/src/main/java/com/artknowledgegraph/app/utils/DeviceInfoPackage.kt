package com.artknowledgegraph.app.utils

import com.facebook.react.ReactPackage // version: 0.71.0
import com.facebook.react.bridge.ReactApplicationContext // version: 0.71.0
import com.facebook.react.bridge.ReactContextBaseJavaModule // version: 0.71.0
import com.facebook.react.bridge.ReactMethod // version: 0.71.0
import com.facebook.react.bridge.Promise // version: 0.71.0
import com.facebook.react.bridge.NativeModule
import com.facebook.react.uimanager.ViewManager // version: 0.71.0
import android.util.DisplayMetrics // version: platform
import android.os.Build // version: platform
import kotlin.math.sqrt

/**
 * React Native package that provides enhanced device information functionality
 * with comprehensive validation for device compatibility and screen metrics.
 */
class DeviceInfoPackage : ReactPackage {

    override fun createNativeModules(reactContext: ReactApplicationContext): 
            List<NativeModule> {
        return listOf(DeviceInfoModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): 
            List<ViewManager<*, *>> {
        return emptyList()
    }
}

/**
 * Internal module that implements comprehensive device information functionality
 * with validation for API level and screen size requirements.
 */
private class DeviceInfoModule(reactContext: ReactApplicationContext) : 
        ReactContextBaseJavaModule(reactContext) {

    private val context: ReactApplicationContext = reactContext
    private var cachedDeviceInfo: Map<String, Any>? = null

    override fun getName(): String = "DeviceInfo"

    /**
     * Validates device compatibility with minimum requirements:
     * - Android API level >= 26 (Android 8.0+)
     * - Minimum screen size of 4.7 inches
     */
    private fun validateDeviceCompatibility(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return false
        }

        val metrics = context.resources.displayMetrics
        val widthInches = metrics.widthPixels / metrics.xdpi
        val heightInches = metrics.heightPixels / metrics.ydpi
        val screenSizeInches = sqrt(widthInches * widthInches + heightInches * heightInches)

        return screenSizeInches >= 4.7
    }

    /**
     * Returns comprehensive device information including screen metrics,
     * device model, and OS version with validation and caching.
     */
    @ReactMethod
    fun getDeviceInfo(promise: Promise) {
        try {
            cachedDeviceInfo?.let {
                promise.resolve(it)
                return
            }

            if (!validateDeviceCompatibility()) {
                promise.reject(
                    "DEVICE_INCOMPATIBLE",
                    "Device does not meet minimum requirements: Android 8.0+ and 4.7\" screen"
                )
                return
            }

            val metrics = context.resources.displayMetrics
            val widthInches = metrics.widthPixels / metrics.xdpi
            val heightInches = metrics.heightPixels / metrics.ydpi
            val screenSizeInches = sqrt(widthInches * widthInches + heightInches * heightInches)

            val deviceInfo = mapOf(
                "apiLevel" to Build.VERSION.SDK_INT,
                "deviceModel" to Build.MODEL,
                "manufacturer" to Build.MANUFACTURER,
                "osVersion" to Build.VERSION.RELEASE,
                "screenMetrics" to mapOf(
                    "widthPixels" to metrics.widthPixels,
                    "heightPixels" to metrics.heightPixels,
                    "widthDp" to (metrics.widthPixels / metrics.density).toInt(),
                    "heightDp" to (metrics.heightPixels / metrics.density).toInt(),
                    "densityDpi" to metrics.densityDpi,
                    "density" to metrics.density,
                    "scaledDensity" to metrics.scaledDensity,
                    "widthInches" to widthInches,
                    "heightInches" to heightInches,
                    "screenSizeInches" to screenSizeInches
                ),
                "supportedFeatures" to mapOf(
                    "adaptiveLayouts" to true,
                    "minScreenSize" to "4.7 inches",
                    "minApiLevel" to "API 26 (Android 8.0)"
                )
            )

            cachedDeviceInfo = deviceInfo
            promise.resolve(deviceInfo)

        } catch (e: Exception) {
            promise.reject(
                "DEVICE_INFO_ERROR",
                "Failed to retrieve device information: ${e.message}",
                e
            )
        }
    }
}