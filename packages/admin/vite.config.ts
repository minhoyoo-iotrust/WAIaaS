import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: 'dist',
    modulePreload: { polyfill: false },
    target: 'es2022',
    sourcemap: false,
  },
  base: '/admin/',
  server: {
    proxy: {
      '/v1': {
        target: 'http://127.0.0.1:3100',
        changeOrigin: true,
      },
    },
  },
});
