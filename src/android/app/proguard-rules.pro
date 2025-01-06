# Art Knowledge Graph Android Application ProGuard Rules
# Version: 1.0
# Target SDK: Android 8.0+ (API 26+)

#-------------------------------------------
# Global Configuration
#-------------------------------------------
-optimizationpasses 5
-dontusemixedcaseclassnames
-verbose
-dontskipnonpubliclibraryclasses
-dontskipnonpubliclibraryclassmembers
-allowaccessmodification
-repackageclasses 'com.artknowledgegraph.app'

# Keep important attributes for debugging and security
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keepattributes SourceFile,LineNumberTable,Exceptions,InnerClasses
-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations

#-------------------------------------------
# Application Components
#-------------------------------------------
# Keep main application components
-keep public class com.artknowledgegraph.app.MainActivity {
    public <init>();
    protected void onCreate(android.os.Bundle);
    public java.lang.String getMainComponentName();
}

-keep public class com.artknowledgegraph.app.MainApplication {
    public <init>();
    public boolean getUseDeveloperSupport();
    protected java.util.List getPackages();
}

#-------------------------------------------
# React Native Rules
#-------------------------------------------
# React Native 0.71.0
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep,allowobfuscation @interface com.facebook.common.internal.DoNotStrip

# React Native core
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keep @com.facebook.common.internal.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.common.internal.DoNotStrip *;
}

-keepclassmembers @com.facebook.proguard.annotations.KeepGettersAndSetters class * {
    void set*(***);
    *** get*();
}

-keep class * extends com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keepclassmembers,includedescriptorclasses class * { native <methods>; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactProp <methods>; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>; }

#-------------------------------------------
# Camera Module Rules
#-------------------------------------------
# Camera2 API and CameraX
-keep class androidx.camera.** { *; }
-keep class android.hardware.camera2.** { *; }
-keep class com.artknowledgegraph.app.camera.** { *; }

# Image processing
-keep class androidx.camera.core.ImageProcessor { *; }
-keep class androidx.camera.core.ImageCapture { *; }
-keep class androidx.camera.core.ImageAnalysis { *; }

#-------------------------------------------
# Device Info Module Rules
#-------------------------------------------
-keep class com.artknowledgegraph.app.utils.DeviceInfoModule { *; }
-keepclassmembers class com.artknowledgegraph.app.utils.DeviceInfoModule {
    public <methods>;
    private <methods>;
}

#-------------------------------------------
# Permission Module Rules
#-------------------------------------------
-keep class com.artknowledgegraph.app.utils.PermissionModule { *; }
-keepclassmembers class com.artknowledgegraph.app.utils.PermissionModule {
    public <methods>;
    private <methods>;
}

#-------------------------------------------
# Networking Rules
#-------------------------------------------
# OkHttp3 4.9.2
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# SSL/TLS Security
-keepclassmembers class * implements javax.net.ssl.SSLSocketFactory {
    private final javax.net.ssl.SSLContext sslContext;
}
-keepclassmembers class * implements javax.net.ssl.HostnameVerifier {
    public boolean verify(java.lang.String, javax.net.ssl.SSLSession);
}

#-------------------------------------------
# Graph Visualization Rules
#-------------------------------------------
# D3.js Android wrapper (7.0.0)
-keep class org.d3js.** { *; }
-keepclassmembers class org.d3js.** { *; }
-dontwarn org.d3js.**

#-------------------------------------------
# Biometric Authentication Rules
#-------------------------------------------
# AndroidX Biometric (1.1.0)
-keep class androidx.biometric.** { *; }
-keepclassmembers class androidx.biometric.** { *; }
-dontwarn androidx.biometric.**

#-------------------------------------------
# Security Optimizations
#-------------------------------------------
# Remove logging and debugging
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}

# Keep encryption-related classes
-keep class javax.crypto.** { *; }
-keep class javax.security.** { *; }
-keep class java.security.** { *; }

# Prevent class name obfuscation for security-critical components
-keepnames class com.artknowledgegraph.app.security.** { *; }

#-------------------------------------------
# Memory Optimization
#-------------------------------------------
# Remove unused code
-optimizations !code/simplification/arithmetic,!code/simplification/cast,!field/*,!class/merging/*
-optimizationpasses 5
-allowaccessmodification

# Keep custom application-specific annotations
-keep @interface com.artknowledgegraph.app.annotations.** { *; }

#-------------------------------------------
# Miscellaneous
#-------------------------------------------
# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep custom exceptions
-keep public class * extends java.lang.Exception

# Keep Parcelable implementations
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Keep Serializable implementations
-keepnames class * implements java.io.Serializable