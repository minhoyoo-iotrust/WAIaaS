import { describe, it, expect } from 'vitest';
import { sleep } from '../utils/sleep.js';

describe('sleep', () => {
  it('resolves after approximately the specified duration', async () => {
    const start = performance.now();
    await sleep(50);
    const elapsed = performance.now() - start;
    // Allow generous tolerance for CI environments
    expect(elapsed).toBeGreaterThanOrEqual(30);
    expect(elapsed).toBeLessThan(200);
  });

  it('resolves immediately with 0ms', async () => {
    const start = performance.now();
    await sleep(0);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('returns a Promise<void>', async () => {
    const result = sleep(1);
    expect(result).toBeInstanceOf(Promise);
    const resolved = await result;
    expect(resolved).toBeUndefined();
  });
});
