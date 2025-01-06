# Art Knowledge Graph Android Application

## Overview

The Art Knowledge Graph Android application is a cross-platform mobile solution that enables users to explore and understand artwork through interactive knowledge graphs. This application is built using React Native and native Android modules, supporting Android 8.0 (API 26) and above.

## Prerequisites

- Android Studio Arctic Fox (2021.3.1) or newer
- JDK 11 or newer
- Android SDK Platform 33 (Android 13.0)
- Android SDK Build-Tools 33.0.0
- Gradle 7.4.2
- Kotlin 1.7.20
- Node.js 16.x or newer
- React Native 0.71.0

## Development Environment Setup

1. Clone the repository and navigate to the android directory:
```bash
git clone <repository-url>
cd src/android
```

2. Install Android Studio and required SDK components:
   - Android SDK Platform 33
   - Android SDK Build-Tools 33.0.0
   - Android Emulator
   - Android SDK Platform-Tools

3. Configure environment variables:
```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
```

4. Install project dependencies:
```bash
npm install
```

## Project Structure

```
android/
├── app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/artknowledgegraph/app/
│   │   │   │   ├── MainActivity.kt
│   │   │   │   ├── MainApplication.kt
│   │   │   │   ├── camera/
│   │   │   │   │   ├── CameraModule.kt
│   │   │   │   │   └── CameraPackage.kt
│   │   │   │   └── utils/
│   │   │   │       ├── DeviceInfoModule.kt
│   │   │   │       └── PermissionModule.kt
│   │   │   ├── res/
│   │   │   └── AndroidManifest.xml
│   │   ├── debug/
│   │   └── release/
│   ├── build.gradle
│   └── proguard-rules.pro
├── gradle/
└── keystore/
    ├── debug.keystore
    └── release.keystore
```

## Build Configuration

### Debug Build
```bash
./gradlew assembleDebug
```

### Release Build
```bash
export KEYSTORE_PASSWORD=<password>
export KEY_PASSWORD=<password>
./gradlew assembleRelease
```

## Security Implementation

1. Network Security:
   - TLS 1.3 enforcement
   - Certificate pinning
   - Cleartext traffic disabled
   - Custom network security configuration

2. Data Protection:
   - Biometric authentication support
   - Secure file storage
   - Runtime permissions management
   - ProGuard code obfuscation

3. Hardware Security:
   - Secure hardware attestation
   - SafetyNet API integration
   - Secure key storage

## Testing

### Unit Tests
```bash
./gradlew test
```

### Instrumented Tests
```bash
./gradlew connectedAndroidTest
```

## Deployment

### Play Store Deployment Checklist:

1. Version Update:
   - Update `versionCode` and `versionName` in app/build.gradle
   - Update changelog

2. Release Build:
   - Generate signed APK/Bundle
   - Test on multiple devices
   - Verify ProGuard configuration

3. Store Listing:
   - Update screenshots
   - Update app description
   - Verify content rating

## Performance Optimization

1. Memory Management:
   - Large heap enabled
   - Memory leak detection
   - Image optimization
   - Cache management

2. Rendering Performance:
   - Hardware acceleration enabled
   - Optimized layouts
   - Efficient view recycling

## Accessibility

- TalkBack support
- Content descriptions
- Adequate touch targets
- High contrast support
- Dynamic text sizing

## Troubleshooting

### Common Issues:

1. Build Failures:
   - Clean project: `./gradlew clean`
   - Invalidate caches: File > Invalidate Caches
   - Verify SDK installation

2. Runtime Errors:
   - Check logcat output
   - Verify permissions
   - Check device compatibility

## Device Compatibility

- Minimum SDK: Android 8.0 (API 26)
- Target SDK: Android 13 (API 33)
- Screen Requirements:
  - Minimum 4.7" screen size
  - hdpi density or higher
  - Portrait orientation support

## License

Copyright © 2023 Art Knowledge Graph. All rights reserved.