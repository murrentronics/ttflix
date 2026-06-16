import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "tt.ttflix.app",
  appName: "TTFlix",
  webDir: "dist",
  server: {
    hostname: "app.ttflix.tt",
    androidScheme: "https",
    allowNavigation: [
      "*.videasy.net",
      "player.videasy.net",
    ],
  },
  android: {
    // Spoof user agent so third-party stream embeds don't block the Capacitor WebView
    overrideUserAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  },
  plugins: {
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
