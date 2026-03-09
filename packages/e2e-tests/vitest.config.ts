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
    testTimeout: 60_000,
    hookTimeout: 30_000,
    forceExit: true,
    reporters: ['default', './src/helpers/ci-reporter.ts'],
  },
});
