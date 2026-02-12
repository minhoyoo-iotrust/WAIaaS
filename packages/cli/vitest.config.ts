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
  },
});
