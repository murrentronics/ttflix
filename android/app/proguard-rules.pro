# Capacitor
-keep class com.getcapacitor.** { *; }
-keep class tt.ttflix.app.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# AndroidX
-keep class androidx.** { *; }
-dontwarn androidx.**

# Keep WebView JS bridge
-keepattributes JavascriptInterface
-keepattributes *Annotation*

# Suppress warnings for unused libs
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
