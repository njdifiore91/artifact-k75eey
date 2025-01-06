package com.artknowledgegraph.app.camera

import com.facebook.react.bridge.ReactContextBaseJavaModule // v0.71.0
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.Promise
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.TotalCaptureResult
import androidx.camera.core.ImageProcessor // v1.2.0
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageAnalysis
import android.Manifest
import android.graphics.ImageFormat
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Size
import com.artknowledgegraph.app.utils.PermissionModule
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class CameraModule(private val reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "CameraModule"
        private const val ERROR_NO_CAMERA = "E_NO_CAMERA"
        private const val ERROR_CAMERA_INIT = "E_CAMERA_INIT"
        private const val ERROR_PERMISSION = "E_PERMISSION"
        private const val ERROR_CAPTURE = "E_CAPTURE"
        private const val MAX_IMAGE_SIZE = 4096 // Maximum supported image dimension
        private const val JPEG_QUALITY = 95 // High quality for artwork
    }

    private lateinit var cameraManager: CameraManager
    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null
    private val cameraOpenCloseLock = Object()
    private val isCapturing = AtomicBoolean(false)
    private val backgroundThread = HandlerThread("CameraBackground").apply { start() }
    private val backgroundHandler = Handler(backgroundThread.looper)
    private val cameraExecutor = Executors.newSingleThreadExecutor()

    private val imageProcessor = ImageProcessor.Builder()
        .setTargetResolution(Size(MAX_IMAGE_SIZE, MAX_IMAGE_SIZE))
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .build()

    init {
        cameraManager = reactContext.getSystemService(ReactApplicationContext.CAMERA_SERVICE) as CameraManager
    }

    override fun getName(): String = "CameraModule"

    @ReactMethod
    fun initializeCamera(promise: Promise) {
        try {
            PermissionModule(reactContext).checkPermission(
                Manifest.permission.CAMERA
            ) { status ->
                when (status) {
                    "granted" -> setupCamera(promise)
                    else -> requestCameraPermission(promise)
                }
            }
        } catch (e: Exception) {
            promise.reject(ERROR_CAMERA_INIT, "Failed to initialize camera: ${e.message}")
        }
    }

    @ReactMethod
    fun captureImage(promise: Promise) {
        if (!isCapturing.compareAndSet(false, true)) {
            promise.reject(ERROR_CAPTURE, "Capture already in progress")
            return
        }

        try {
            val characteristics = cameraDevice?.id?.let { cameraManager.getCameraCharacteristics(it) }
            val maxSize = characteristics?.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                ?.getOutputSizes(ImageFormat.JPEG)
                ?.maxByOrNull { it.height * it.width }
                ?: Size(MAX_IMAGE_SIZE, MAX_IMAGE_SIZE)

            imageReader = ImageReader.newInstance(
                maxSize.width,
                maxSize.height,
                ImageFormat.JPEG,
                2
            ).apply {
                setOnImageAvailableListener({ reader ->
                    try {
                        reader.acquireLatestImage()?.use { image ->
                            val buffer = image.planes[0].buffer
                            val bytes = ByteArray(buffer.remaining())
                            buffer.get(bytes)
                            
                            // Process and optimize the image
                            processImage(bytes, promise)
                        }
                    } finally {
                        isCapturing.set(false)
                    }
                }, backgroundHandler)
            }

            createCaptureSession(promise)
        } catch (e: Exception) {
            isCapturing.set(false)
            promise.reject(ERROR_CAPTURE, "Failed to capture image: ${e.message}")
        }
    }

    private fun setupCamera(promise: Promise) {
        try {
            val cameraId = cameraManager.cameraIdList.firstOrNull { id ->
                cameraManager.getCameraCharacteristics(id)
                    .get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
            } ?: throw Exception("No suitable camera found")

            cameraManager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    cameraDevice = camera
                    promise.resolve(true)
                }

                override fun onDisconnected(camera: CameraDevice) {
                    camera.close()
                    cameraDevice = null
                }

                override fun onError(camera: CameraDevice, error: Int) {
                    camera.close()
                    cameraDevice = null
                    promise.reject(ERROR_CAMERA_INIT, "Camera device error: $error")
                }
            }, backgroundHandler)
        } catch (e: Exception) {
            promise.reject(ERROR_CAMERA_INIT, "Failed to setup camera: ${e.message}")
        }
    }

    private fun createCaptureSession(promise: Promise) {
        val surfaces = listOf(imageReader?.surface)
        
        cameraDevice?.createCaptureSession(
            surfaces,
            object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(session: CameraCaptureSession) {
                    captureSession = session
                    createCaptureRequest(session, promise)
                }

                override fun onConfigureFailed(session: CameraCaptureSession) {
                    promise.reject(ERROR_CAPTURE, "Failed to configure capture session")
                }
            },
            backgroundHandler
        )
    }

    private fun createCaptureRequest(session: CameraCaptureSession, promise: Promise) {
        try {
            val captureBuilder = cameraDevice?.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE)?.apply {
                addTarget(imageReader?.surface!!)
                set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_AUTO)
                set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
                set(CaptureRequest.JPEG_QUALITY, JPEG_QUALITY.toByte())
            }

            session.capture(captureBuilder?.build()!!, object : CameraCaptureSession.CaptureCallback() {
                override fun onCaptureCompleted(
                    session: CameraCaptureSession,
                    request: CaptureRequest,
                    result: TotalCaptureResult
                ) {
                    super.onCaptureCompleted(session, request, result)
                }

                override fun onCaptureFailed(
                    session: CameraCaptureSession,
                    request: CaptureRequest,
                    failure: CameraCaptureSession.CaptureFailure
                ) {
                    super.onCaptureFailed(session, request, failure)
                    promise.reject(ERROR_CAPTURE, "Capture failed: ${failure.reason}")
                }
            }, backgroundHandler)
        } catch (e: Exception) {
            promise.reject(ERROR_CAPTURE, "Failed to create capture request: ${e.message}")
        }
    }

    private fun processImage(imageBytes: ByteArray, promise: Promise) {
        cameraExecutor.execute {
            try {
                // Process image with quality optimization
                imageProcessor.process(imageBytes) { processedBytes ->
                    val tempFile = File.createTempFile("artwork", ".jpg", reactContext.cacheDir)
                    tempFile.writeBytes(processedBytes)
                    promise.resolve(tempFile.absolutePath)
                }
            } catch (e: Exception) {
                promise.reject(ERROR_CAPTURE, "Failed to process image: ${e.message}")
            }
        }
    }

    private fun requestCameraPermission(promise: Promise) {
        PermissionModule(reactContext).requestPermission(
            Manifest.permission.CAMERA
        ) { status ->
            when (status) {
                "granted" -> setupCamera(promise)
                else -> promise.reject(ERROR_PERMISSION, "Camera permission denied")
            }
        }
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        cleanup()
    }

    private fun cleanup() {
        try {
            cameraDevice?.close()
            captureSession?.close()
            imageReader?.close()
            backgroundThread.quitSafely()
            cameraExecutor.shutdown()
        } catch (e: Exception) {
            // Log cleanup errors but don't throw
        }
    }
}