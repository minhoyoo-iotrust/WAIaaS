import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    passWithNoTests: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 2,
      },
    },
    forceExit: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/__tests__/**', 'src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/index.ts'],
      thresholds: {
        branches: 65,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
  },
});
