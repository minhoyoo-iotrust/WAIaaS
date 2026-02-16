/**
 * CT-5: IClock Contract Test shared suite.
 *
 * Verifies that any IClock implementation returns valid Date instances
 * from now() with correct type, non-NaN value, monotonic ordering,
 * and reference independence.
 *
 * IClock, FakeClock, and SystemClock are defined inline (not yet in core).
 * Based on design document 42-mock-boundaries-interfaces-contracts.md section 4.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// IClock interface (test-local, not yet in @waiaas/core)
// ---------------------------------------------------------------------------

export interface IClock {
  now(): Date;
}

// ---------------------------------------------------------------------------
// FakeClock implementation
// ---------------------------------------------------------------------------

export class FakeClock implements IClock {
  private currentTime: Date;

  constructor(initialTime: Date = new Date('2026-01-01T00:00:00Z')) {
    this.currentTime = new Date(initialTime.getTime());
  }

  now(): Date {
    return new Date(this.currentTime.getTime());
  }

  advance(ms: number): void {
    if (ms < 0) throw new Error('FakeClock.advance(): ms must be non-negative');
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  setTime(time: Date): void {
    this.currentTime = new Date(time.getTime());
  }
}

// ---------------------------------------------------------------------------
// SystemClock implementation
// ---------------------------------------------------------------------------

export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
}

// ---------------------------------------------------------------------------
// Shared suite
// ---------------------------------------------------------------------------

/**
 * IClock contract test suite.
 *
 * @param factory - Function that returns a fresh IClock instance.
 */
export function clockContractTests(
  factory: () => IClock | Promise<IClock>,
): void {
  let clock: IClock;

  describe('IClock contract', () => {
    beforeEach(async () => {
      clock = await factory();
    });

    it('now() returns a Date instance', () => {
      const result = clock.now();
      expect(result).toBeInstanceOf(Date);
    });

    it('now().getTime() is valid (not NaN, greater than 0)', () => {
      const time = clock.now().getTime();
      expect(Number.isNaN(time)).toBe(false);
      expect(time).toBeGreaterThan(0);
    });

    it('consecutive calls do not go backwards (t2 >= t1)', () => {
      const t1 = clock.now();
      const t2 = clock.now();
      expect(t2.getTime()).toBeGreaterThanOrEqual(t1.getTime());
    });

    it('now() returns a new instance on each call (reference independence)', () => {
      const d1 = clock.now();
      const d2 = clock.now();
      expect(d1).not.toBe(d2);
    });
  });
}
