package com.artknowledgegraph.app.graph

import com.facebook.react.ReactPackage // version: 0.68.0
import com.facebook.react.bridge.ReactApplicationContext // version: 0.68.0
import com.facebook.react.bridge.NativeModule // version: 0.68.0
import com.facebook.react.uimanager.ViewManager // version: 0.68.0
import com.facebook.react.bridge.ReactContextBaseJavaModule // version: 0.68.0
import com.facebook.react.bridge.ReactMethod // version: 0.68.0
import android.opengl.GLES20 // version: 1.0.0
import com.facebook.react.bridge.ReadableMap // version: 0.68.0
import android.view.MotionEvent
import java.nio.FloatBuffer
import java.nio.ByteBuffer
import java.nio.ByteOrder
import android.util.Log

/**
 * React Native package for high-performance graph rendering using OpenGL ES 2.0
 * Provides hardware-accelerated visualization of knowledge graphs with optimized
 * touch handling and memory management.
 */
class GraphRenderPackage : ReactPackage {

    companion object {
        private const val TAG = "GraphRenderPackage"
    }

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(InternalGraphRenderModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList() // Rendering handled through native module
    }
}

/**
 * Internal implementation of the graph rendering native module.
 * Handles OpenGL context management, shader compilation, and vertex buffer optimization.
 */
private class InternalGraphRenderModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private var vertexShader: Int = 0
    private var fragmentShader: Int = 0
    private var shaderProgram: Int = 0
    private var vertexBuffer: FloatBuffer? = null
    private var lastRenderTime: Long = 0

    companion object {
        private const val TAG = "GraphRenderModule"
        
        // Shader source code
        private const val VERTEX_SHADER = """
            attribute vec4 vPosition;
            uniform mat4 uMVPMatrix;
            void main() {
                gl_Position = uMVPMatrix * vPosition;
            }
        """

        private const val FRAGMENT_SHADER = """
            precision mediump float;
            uniform vec4 uColor;
            void main() {
                gl_FragColor = uColor;
            }
        """
    }

    init {
        initializeOpenGL()
    }

    private fun initializeOpenGL() {
        try {
            // Compile shaders
            vertexShader = compileShader(GLES20.GL_VERTEX_SHADER, VERTEX_SHADER)
            fragmentShader = compileShader(GLES20.GL_FRAGMENT_SHADER, FRAGMENT_SHADER)

            // Create and link shader program
            shaderProgram = GLES20.glCreateProgram().also { program ->
                GLES20.glAttachShader(program, vertexShader)
                GLES20.glAttachShader(program, fragmentShader)
                GLES20.glLinkProgram(program)
            }

            // Initialize vertex buffer
            val bb = ByteBuffer.allocateDirect(1024 * 4) // Initial capacity
            bb.order(ByteOrder.nativeOrder())
            vertexBuffer = bb.asFloatBuffer()

        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize OpenGL", e)
        }
    }

    private fun compileShader(type: Int, source: String): Int {
        return GLES20.glCreateShader(type).also { shader ->
            GLES20.glShaderSource(shader, source)
            GLES20.glCompileShader(shader)

            val compiled = IntArray(1)
            GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, compiled, 0)
            if (compiled[0] == 0) {
                val error = GLES20.glGetShaderInfoLog(shader)
                GLES20.glDeleteShader(shader)
                throw RuntimeException("Shader compilation failed: $error")
            }
        }
    }

    override fun getName(): String = "GraphRenderModule"

    @ReactMethod
    fun renderGraph(graphData: ReadableMap) {
        try {
            val startTime = System.nanoTime()

            // Ensure we're on the correct thread
            reactContext.runOnUiQueueThread {
                // Set up OpenGL context
                GLES20.glUseProgram(shaderProgram)

                // Process graph data and update buffers
                updateVertexBuffers(graphData)

                // Render nodes
                renderNodes()

                // Render edges
                renderEdges()

                // Performance monitoring
                val renderTime = (System.nanoTime() - startTime) / 1_000_000 // Convert to ms
                lastRenderTime = renderTime
                Log.d(TAG, "Graph render completed in $renderTime ms")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error rendering graph", e)
        }
    }

    private fun updateVertexBuffers(graphData: ReadableMap) {
        // Extract node and edge data
        val nodes = graphData.getArray("nodes")
        val edges = graphData.getArray("edges")

        // Resize buffer if needed
        val totalVertices = (nodes?.size() ?: 0) * 4 + (edges?.size() ?: 0) * 2
        if (vertexBuffer?.capacity() ?: 0 < totalVertices * 3) {
            val bb = ByteBuffer.allocateDirect(totalVertices * 3 * 4)
            bb.order(ByteOrder.nativeOrder())
            vertexBuffer = bb.asFloatBuffer()
        }

        // Update vertex data
        vertexBuffer?.apply {
            clear()
            // Add node vertices
            nodes?.let {
                for (i in 0 until it.size()) {
                    val node = it.getMap(i)
                    putNodeVertices(node)
                }
            }
            // Add edge vertices
            edges?.let {
                for (i in 0 until it.size()) {
                    val edge = it.getMap(i)
                    putEdgeVertices(edge)
                }
            }
            position(0)
        }
    }

    private fun putNodeVertices(node: ReadableMap) {
        val x = node.getDouble("x").toFloat()
        val y = node.getDouble("y").toFloat()
        val size = node.getDouble("size").toFloat()

        vertexBuffer?.apply {
            // Add quad vertices for node
            put(x - size)
            put(y - size)
            put(0f)
            put(x + size)
            put(y - size)
            put(0f)
            put(x + size)
            put(y + size)
            put(0f)
            put(x - size)
            put(y + size)
            put(0f)
        }
    }

    private fun putEdgeVertices(edge: ReadableMap) {
        val x1 = edge.getDouble("x1").toFloat()
        val y1 = edge.getDouble("y1").toFloat()
        val x2 = edge.getDouble("x2").toFloat()
        val y2 = edge.getDouble("y2").toFloat()

        vertexBuffer?.apply {
            put(x1)
            put(y1)
            put(0f)
            put(x2)
            put(y2)
            put(0f)
        }
    }

    private fun renderNodes() {
        GLES20.glVertexAttribPointer(0, 3, GLES20.GL_FLOAT, false, 0, vertexBuffer)
        GLES20.glEnableVertexAttribArray(0)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, vertexBuffer?.position() ?: 0)
    }

    private fun renderEdges() {
        GLES20.glVertexAttribPointer(0, 3, GLES20.GL_FLOAT, false, 0, vertexBuffer)
        GLES20.glEnableVertexAttribArray(0)
        GLES20.glDrawArrays(GLES20.GL_LINES, 0, vertexBuffer?.position() ?: 0)
    }

    fun handleTouchEvent(event: MotionEvent): Boolean {
        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                // Handle touch down
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                // Handle touch move
                return true
            }
            MotionEvent.ACTION_UP -> {
                // Handle touch up
                return true
            }
        }
        return false
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        // Clean up OpenGL resources
        GLES20.glDeleteProgram(shaderProgram)
        GLES20.glDeleteShader(vertexShader)
        GLES20.glDeleteShader(fragmentShader)
    }
}