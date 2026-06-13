import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "tt.ttflix.app",
  appName: "TTFlix",
  webDir: "dist",
  // Load from bundled files — no server URL needed
  server: {
    androidScheme: "https",
    // cleartext traffic for local assets only
    allowNavigation: [],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    // Back button closes the app from home screen
    overrideUserAgent:
      "Mozilla/5.0 (Linux; Android 10; TTFlix) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 TTFlix/1.0",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#000000",
      showSpinner: false,
    },
  },
};

export default config;
