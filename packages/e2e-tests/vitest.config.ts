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
    // Workspace-style project definitions for --project filtering
    workspace: [
      {
        // Default project: offchain smoke tests
        test: {
          name: 'offchain',
          include: ['src/__tests__/*.e2e.test.ts'],
          exclude: ['src/__tests__/onchain-*.e2e.test.ts'],
          globals: true,
          testTimeout: 60_000,
          hookTimeout: 30_000,
        },
      },
      {
        // Onchain project: testnet E2E tests (longer timeouts)
        test: {
          name: 'onchain',
          include: ['src/__tests__/onchain-*.e2e.test.ts'],
          globals: true,
          testTimeout: 120_000,
          hookTimeout: 60_000,
          pool: 'forks',
          poolOptions: {
            forks: {
              maxForks: 1,
            },
          },
        },
      },
    ],
  },
});
