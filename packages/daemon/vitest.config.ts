import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    // sodium-native guarded memory (mprotect) requires forks pool
    // because thread workers crash on mprotect_noaccess calls
    pool: 'forks',
  },
});
