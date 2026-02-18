import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
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
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/*.test.ts', 'src/**/index.ts'],
      thresholds: {
        branches: 45,
        functions: 50,
        lines: 50,
        statements: 50,
      },
    },
  },
});
