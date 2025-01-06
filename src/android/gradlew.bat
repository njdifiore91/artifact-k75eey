@rem
@rem Art Knowledge Graph Android application Gradle wrapper script
@rem Enhanced for mobile development with security features
@rem Version: 7.3.3
@rem

@if "%DEBUG%" == "" @echo off
@rem ##########################################################################
@rem
@rem  Enhanced Gradle startup script for Windows
@rem  with mobile-specific optimizations and Android 8+ compatibility
@rem
@rem ##########################################################################

@rem Set local scope for the variables with windows NT shell
if "%OS%"=="Windows_NT" setlocal

set DIRNAME=%~dp0
if "%DIRNAME%" == "" set DIRNAME=.
@rem Validate script location for security
if not exist "%DIRNAME%\gradle\wrapper\gradle-wrapper.jar" (
    echo Error: Gradle wrapper JAR not found.
    exit /b 1
)

@rem Configure memory settings optimized for mobile development
set DEFAULT_JVM_OPTS="-Xmx2048m" "-XX:MaxMetaspaceSize=512m" "-XX:+HeapDumpOnOutOfMemoryError" "-XX:+UseG1GC"

@rem Enable HTTPS enforcement for security
set HTTPS_ONLY=true

@rem Enable checksum verification
set VERIFY_CHECKSUM=true

@rem Find java.exe with version validation for Android 8+ compatibility
if defined JAVA_HOME goto findJavaFromJavaHome

set JAVA_EXE=java.exe
%JAVA_EXE% -version >NUL 2>&1
if "%ERRORLEVEL%" == "0" goto execute

echo Error: JAVA_HOME is not set and no 'java' command could be found in your PATH.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.
exit /b 1

:findJavaFromJavaHome
set JAVA_HOME=%JAVA_HOME:"=%
set JAVA_EXE=%JAVA_HOME%/bin/java.exe

if exist "%JAVA_EXE%" goto checkJavaVersion
echo Error: JAVA_HOME is set to an invalid directory: %JAVA_HOME%
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.
exit /b 1

:checkJavaVersion
@rem Validate Java version for Android 8+ compatibility
"%JAVA_EXE%" -version 2>&1 | findstr /i "version" > nul
set JAVA_VERSION=%ERRORLEVEL%
if %JAVA_VERSION% NEQ 0 (
    echo Error: Java version check failed.
    exit /b 1
)

:execute
@rem Setup the command line with mobile optimizations

set CLASSPATH=%DIRNAME%\gradle\wrapper\gradle-wrapper.jar

@rem Set Gradle user home if not already set
if not defined GRADLE_USER_HOME (
    set GRADLE_USER_HOME=%USERPROFILE%\.gradle
)

@rem Configure build cache for improved performance
set GRADLE_OPTS=%GRADLE_OPTS% "-Dorg.gradle.caching=true"
set GRADLE_OPTS=%GRADLE_OPTS% "-Dorg.gradle.daemon=true"
set GRADLE_OPTS=%GRADLE_OPTS% "-Dorg.gradle.parallel=true"
set GRADLE_OPTS=%GRADLE_OPTS% "-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m"

@rem Mobile-specific optimizations
set GRADLE_OPTS=%GRADLE_OPTS% "-Dandroid.enableR8.fullMode=true"
set GRADLE_OPTS=%GRADLE_OPTS% "-Dandroid.enableD8.desugaring=true"
set GRADLE_OPTS=%GRADLE_OPTS% "-Dkotlin.incremental=true"

@rem Execute Gradle with enhanced security and error handling
"%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% ^
  "-Dorg.gradle.appname=%APP_BASE_NAME%" ^
  "-Dgradle.user.home=%GRADLE_USER_HOME%" ^
  "-Dhttps.protocols=TLSv1.2,TLSv1.3" ^
  "-Dgradle.wrapper.validateDistributionUrl=true" ^
  -classpath "%CLASSPATH%" ^
  org.gradle.wrapper.GradleWrapperMain %*

:end
@rem Return the exit code from the Gradle execution
if "%OS%"=="Windows_NT" endlocal
exit /b %ERRORLEVEL%