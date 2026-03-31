import { defineConfig } from "vite";

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  // Tauri expects a fixed port for dev, prevents reload issues
  server: {
    port: 1420,
    strictPort: true,
    host: true,
  },
  // Env prefix for WalletConnect project ID
  envPrefix: ["VITE_"],
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS/Linux
    target: ["es2021", "chrome100", "safari15"],
    // Don't minify for debugging
    minify: false,
    sourcemap: true,
  },
});
