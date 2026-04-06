import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig(({ mode }) => {
  const isDesktop = mode === 'desktop';
  return {
    plugins: [preact()],
    define: {
      // Layer 3: Build-time dead code elimination for Desktop-only code
      // Usage: if (__DESKTOP__) { ... } -- stripped from browser builds
      __DESKTOP__: isDesktop,
    },
    build: {
      outDir: 'dist',
      modulePreload: { polyfill: false },
      target: 'es2022',
      sourcemap: false,
      rollupOptions: {
        // Layer 2: Externalize Tauri/WalletConnect deps for browser builds
        // These are only available inside Tauri WebView, not in browser
        ...(!isDesktop && {
          external: [
            '@tauri-apps/api',
            '@tauri-apps/api/core',
            '@tauri-apps/plugin-shell',
            '@tauri-apps/plugin-notification',
            '@tauri-apps/plugin-updater',
            '@reown/appkit',
            '@reown/appkit-adapter-solana',
          ],
        }),
      },
    },
    base: isDesktop ? '/' : '/admin/',
    server: {
      proxy: {
        '/v1': {
          target: 'http://127.0.0.1:3100',
          changeOrigin: true,
        },
      },
    },
  };
});
