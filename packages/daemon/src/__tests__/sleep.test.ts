import { describe, it, expect, vi } from 'vitest';
import { sleep } from '../pipeline/sleep.js';

describe('sleep', () => {
  it('should resolve after the given ms', async () => {
    vi.useFakeTimers();
    const p = sleep(100);
    vi.advanceTimersByTime(100);
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it('should return a Promise', () => {
    const result = sleep(0);
    expect(result).toBeInstanceOf(Promise);
  });
});
