/*
 * BiometricAuthModule.kt
 * Secure biometric authentication implementation for Art Knowledge Graph Android app
 * 
 * Dependencies:
 * - react-native: 0.71.0
 * - androidx.biometric: 1.2.0-alpha05
 * - androidx.fragment: 1.5.5
 */

package com.artknowledgegraph.app.biometric

import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import androidx.biometric.BiometricPrompt
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators
import androidx.fragment.app.FragmentActivity
import java.util.concurrent.Executor
import android.os.Looper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties

class BiometricAuthModule(private val reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    private var biometricPrompt: BiometricPrompt? = null
    private val biometricManager: BiometricManager by lazy {
        BiometricManager.from(reactContext)
    }
    private val mainExecutor: Executor by lazy {
        reactContext.mainExecutor
    }

    companion object {
        private const val BIOMETRIC_ERROR_NO_HARDWARE = "BIOMETRIC_ERROR_NO_HARDWARE"
        private const val BIOMETRIC_ERROR_NOT_ENROLLED = "BIOMETRIC_ERROR_NOT_ENROLLED"
        private const val BIOMETRIC_ERROR_NOT_AVAILABLE = "BIOMETRIC_ERROR_NOT_AVAILABLE"
        private const val BIOMETRIC_ERROR_SECURITY_UPDATE = "BIOMETRIC_ERROR_SECURITY_UPDATE"
        private const val BIOMETRIC_SUCCESS = "BIOMETRIC_SUCCESS"
        private const val BIOMETRIC_ERROR_CANCELED = "BIOMETRIC_ERROR_CANCELED"
        private const val BIOMETRIC_ERROR_TIMEOUT = "BIOMETRIC_ERROR_TIMEOUT"
        
        // Security-related constants
        private const val AUTHENTICATION_DURATION = 30000L // 30 seconds timeout
        private const val ALLOWED_AUTHENTICATION_ATTEMPTS = 3
    }

    override fun getName(): String = "BiometricAuth"

    @ReactMethod
    fun authenticate(promise: Promise) {
        try {
            val activity = reactContext.currentActivity as? FragmentActivity
                ?: throw IllegalStateException("Current activity is not FragmentActivity")

            val promptInfo = BiometricPrompt.PromptInfo.Builder()
                .setTitle("Authentication Required")
                .setSubtitle("Verify your identity")
                .setDescription("Use biometric authentication to continue")
                .setAllowedAuthenticators(
                    Authenticators.BIOMETRIC_STRONG or
                    Authenticators.DEVICE_CREDENTIAL
                )
                .setConfirmationRequired(true)
                .build()

            val authCallback = object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    promise.resolve(BIOMETRIC_SUCCESS)
                    cleanup()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    when (errorCode) {
                        BiometricPrompt.ERROR_CANCELED -> 
                            promise.reject(BIOMETRIC_ERROR_CANCELED, errString.toString())
                        BiometricPrompt.ERROR_TIMEOUT -> 
                            promise.reject(BIOMETRIC_ERROR_TIMEOUT, errString.toString())
                        else -> promise.reject(errorCode.toString(), errString.toString())
                    }
                    cleanup()
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    // Authentication failed but can be retried, handled internally by BiometricPrompt
                }
            }

            biometricPrompt = BiometricPrompt(activity, mainExecutor, authCallback)
            biometricPrompt?.authenticate(promptInfo)

        } catch (e: Exception) {
            promise.reject("BIOMETRIC_ERROR", e.message)
            cleanup()
        }
    }

    @ReactMethod
    fun isBiometricAvailable(promise: Promise) {
        when (biometricManager.canAuthenticate(Authenticators.BIOMETRIC_STRONG)) {
            BiometricManager.BIOMETRIC_SUCCESS ->
                promise.resolve(BIOMETRIC_SUCCESS)
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE ->
                promise.reject(BIOMETRIC_ERROR_NO_HARDWARE, "Device does not have biometric hardware")
            BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE ->
                promise.reject(BIOMETRIC_ERROR_NOT_AVAILABLE, "Biometric hardware is currently unavailable")
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ->
                promise.reject(BIOMETRIC_ERROR_NOT_ENROLLED, "No biometric credentials enrolled")
            BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED ->
                promise.reject(BIOMETRIC_ERROR_SECURITY_UPDATE, "Security update required")
            else ->
                promise.reject(BIOMETRIC_ERROR_NOT_AVAILABLE, "Biometric authentication unavailable")
        }
    }

    private fun cleanup() {
        biometricPrompt?.cancelAuthentication()
        biometricPrompt = null
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        cleanup()
    }
}