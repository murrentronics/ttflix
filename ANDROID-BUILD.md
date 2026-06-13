# TTFlix Android Build Guide

## What this builds
- **Android APK** — installs on phones, tablets, Android TV, Amazon Fire TV Stick
- No URL needed — all app code is bundled inside the APK
- Only needs internet for streaming and API calls
- Ad popups are blocked at the WebView level — they cannot open new tabs

## Prerequisites
1. Install [Android Studio](https://developer.android.com/studio)
2. Install Java JDK 17+ (bundled with Android Studio)
3. Make sure `ANDROID_HOME` environment variable is set

## Build steps

### 1. Build the web app
```
npm run build:app
```

### 2. Sync to Android
```
npx cap sync android
```

### 3. Open in Android Studio
```
npx cap open android
```

### 4. Build APK in Android Studio
- Menu → Build → Build Bundle(s) / APK(s) → Build APK(s)
- APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

### 5. For release APK (Google Play / Fire TV store)
- Menu → Build → Generate Signed Bundle / APK
- Create a keystore if you don't have one
- Sign and build the release APK

## Installing on devices

### Android Phone/Tablet
- Enable "Install from unknown sources" in Settings
- Transfer APK to device and open it

### Android TV
- Use a file manager app (e.g. Solid Explorer) to sideload the APK
- Or submit to Google Play Store (TV category)

### Amazon Fire TV Stick
- Enable ADB debugging in Developer Options
- Use `adb install app-release.apk` via USB or network ADB
- Or submit to Amazon Appstore

## One-command build + open
```
npm run cap:build
```
