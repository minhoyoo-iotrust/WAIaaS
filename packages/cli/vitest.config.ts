import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    testTimeout: 30_000, // E2E tests need longer timeout
    hookTimeout: 30_000,
    pool: 'forks', // Isolate tests using forks (sodium-native mprotect compatibility)
    poolOptions: {
      forks: {
        maxForks: 2, // Limit workers to reduce orphan processes on abnormal exit
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/*.test.ts', 'src/**/index.ts'],
      thresholds: {
        branches: 65,
        functions: 70,
        lines: 65,
        statements: 65,
      },
    },
  },
});
