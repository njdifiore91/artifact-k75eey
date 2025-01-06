package com.artknowledgegraph.app.utils

import com.facebook.react.bridge.ReactContextBaseJavaModule // v0.68.0
import com.facebook.react.bridge.ReactMethod // v0.68.0
import com.facebook.react.bridge.ReactApplicationContext // v0.68.0
import com.facebook.react.bridge.Promise // v0.68.0
import com.facebook.react.bridge.ReadableArray // v0.68.0
import com.facebook.react.bridge.WritableMap // v0.68.0
import com.facebook.react.bridge.Arguments // v0.68.0
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat // v1.6.0
import androidx.core.app.ActivityCompat // v1.6.0
import android.app.Activity

class PermissionModule(private val reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val PERMISSION_DENIED = "denied"
        private const val PERMISSION_GRANTED = "granted"
        private const val PERMISSION_NEVER_ASK = "never_ask_again"
        private const val ERROR_INVALID_ACTIVITY = "E_INVALID_ACTIVITY"
        private const val ERROR_INVALID_PERMISSION = "E_INVALID_PERMISSION"
        private const val ERROR_INVALID_PERMISSIONS_ARRAY = "E_INVALID_PERMISSIONS_ARRAY"
    }

    private val permissionConstants: Map<String, Int> = mapOf(
        PackageManager.PERMISSION_GRANTED.toString() to PackageManager.PERMISSION_GRANTED,
        PackageManager.PERMISSION_DENIED.toString() to PackageManager.PERMISSION_DENIED
    )

    override fun getName(): String = "PermissionModule"

    @ReactMethod
    fun checkPermission(permission: String, promise: Promise) {
        try {
            val activity = currentActivity
                ?: return promise.reject(ERROR_INVALID_ACTIVITY, "Activity is null")

            if (!isValidPermission(permission)) {
                return promise.reject(ERROR_INVALID_PERMISSION, "Invalid permission format")
            }

            val result = ContextCompat.checkSelfPermission(activity, permission)
            val response = Arguments.createMap()

            when (result) {
                PackageManager.PERMISSION_GRANTED -> {
                    response.putString("status", PERMISSION_GRANTED)
                    response.putBoolean("granted", true)
                }
                PackageManager.PERMISSION_DENIED -> {
                    val neverAskAgain = !ActivityCompat.shouldShowRequestPermissionRationale(activity, permission)
                    response.putString("status", if (neverAskAgain) PERMISSION_NEVER_ASK else PERMISSION_DENIED)
                    response.putBoolean("granted", false)
                }
            }
            promise.resolve(response)
        } catch (e: Exception) {
            promise.reject("E_PERMISSION_CHECK_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun requestPermission(permission: String, promise: Promise) {
        try {
            val activity = currentActivity
                ?: return promise.reject(ERROR_INVALID_ACTIVITY, "Activity is null")

            if (!isValidPermission(permission)) {
                return promise.reject(ERROR_INVALID_PERMISSION, "Invalid permission format")
            }

            val permissionCallback = object : ActivityCompat.OnRequestPermissionsResultCallback {
                override fun onRequestPermissionsResult(
                    requestCode: Int,
                    permissions: Array<String>,
                    grantResults: IntArray
                ) {
                    val response = Arguments.createMap()
                    when {
                        grantResults.isEmpty() -> {
                            response.putString("status", PERMISSION_DENIED)
                            response.putBoolean("granted", false)
                        }
                        grantResults[0] == PackageManager.PERMISSION_GRANTED -> {
                            response.putString("status", PERMISSION_GRANTED)
                            response.putBoolean("granted", true)
                        }
                        else -> {
                            val neverAskAgain = !ActivityCompat.shouldShowRequestPermissionRationale(activity, permission)
                            response.putString("status", if (neverAskAgain) PERMISSION_NEVER_ASK else PERMISSION_DENIED)
                            response.putBoolean("granted", false)
                        }
                    }
                    promise.resolve(response)
                    activity.removeOnRequestPermissionsResultCallback(this)
                }
            }

            activity.addOnRequestPermissionsResultCallback(permissionCallback)
            ActivityCompat.requestPermissions(activity, arrayOf(permission), generateRequestCode())
        } catch (e: Exception) {
            promise.reject("E_PERMISSION_REQUEST_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun checkMultiplePermissions(permissions: ReadableArray, promise: Promise) {
        try {
            val activity = currentActivity
                ?: return promise.reject(ERROR_INVALID_ACTIVITY, "Activity is null")

            if (permissions.size() == 0) {
                return promise.reject(ERROR_INVALID_PERMISSIONS_ARRAY, "Permissions array is empty")
            }

            val response = Arguments.createMap()
            
            for (i in 0 until permissions.size()) {
                val permission = permissions.getString(i)
                if (!isValidPermission(permission)) {
                    return promise.reject(ERROR_INVALID_PERMISSION, "Invalid permission format: $permission")
                }

                val result = ContextCompat.checkSelfPermission(activity, permission)
                val permissionStatus = Arguments.createMap()

                when (result) {
                    PackageManager.PERMISSION_GRANTED -> {
                        permissionStatus.putString("status", PERMISSION_GRANTED)
                        permissionStatus.putBoolean("granted", true)
                    }
                    PackageManager.PERMISSION_DENIED -> {
                        val neverAskAgain = !ActivityCompat.shouldShowRequestPermissionRationale(activity, permission)
                        permissionStatus.putString("status", if (neverAskAgain) PERMISSION_NEVER_ASK else PERMISSION_DENIED)
                        permissionStatus.putBoolean("granted", false)
                    }
                }
                response.putMap(permission, permissionStatus)
            }
            promise.resolve(response)
        } catch (e: Exception) {
            promise.reject("E_MULTIPLE_PERMISSIONS_CHECK_FAILED", e.message, e)
        }
    }

    private fun isValidPermission(permission: String): Boolean {
        return permission.startsWith("android.permission.") || 
               permission.startsWith("com.android.launcher.permission.") ||
               permission.startsWith("com.artknowledgegraph.app.permission.")
    }

    private fun generateRequestCode(): Int {
        return (System.currentTimeMillis() % 65535).toInt()
    }

    private fun Activity.addOnRequestPermissionsResultCallback(callback: ActivityCompat.OnRequestPermissionsResultCallback) {
        if (this is ActivityCompat.OnRequestPermissionsResultCallback) {
            ActivityCompat.setOnRequestPermissionsResultCallback(this, callback)
        }
    }

    private fun Activity.removeOnRequestPermissionsResultCallback(callback: ActivityCompat.OnRequestPermissionsResultCallback) {
        if (this is ActivityCompat.OnRequestPermissionsResultCallback) {
            ActivityCompat.setOnRequestPermissionsResultCallback(this, null)
        }
    }
}