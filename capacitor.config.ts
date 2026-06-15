import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "tt.ttflix.app",
  appName: "TTFlix",
  webDir: "dist",
  server: {
    allowNavigation: [
      "*.streamed.pk",
      "streamed.pk",
      "*.strmd.link",
      "strmd.link",
      "*.videasy.net",
      "player.videasy.net",
    ],
  },
  plugins: {
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
