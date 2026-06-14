import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv("", path.resolve(__dirname), "VITE_"),
    ...loadEnv(mode, path.resolve(__dirname), "VITE_"),
  };

  return {
    plugins: [react(), tailwindcss(), tsconfigPaths()],
    define: {
      "import.meta.env.VITE_TMDB_API_KEY": JSON.stringify(env.VITE_TMDB_API_KEY ?? ""),
      "import.meta.env.VITE_APP_MODE": JSON.stringify("capacitor"),
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: (id: string) => {
            if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) return "react-core";
            if (id.includes("node_modules/react-router-dom/")) return "router";
            if (id.includes("node_modules/@tanstack/")) return "query";
            if (id.includes("node_modules/@supabase/")) return "supabase";
            if (id.includes("node_modules/@radix-ui/")) return "ui-radix";
          },
        },
      },
    },
    base: "./",
  };
});
