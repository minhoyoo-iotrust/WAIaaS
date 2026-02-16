/**
 * CT-5: IClock Contract Test execution.
 *
 * Validates FakeClock and SystemClock against the shared contract suite.
 * Both implementations are defined in clock.contract.ts (not yet in core).
 */
import { describe } from 'vitest';
import { clockContractTests, FakeClock, SystemClock } from './clock.contract.js';

// ---------------------------------------------------------------------------
// Run contract tests
// ---------------------------------------------------------------------------

describe('CT-5: IClock Contract Tests', () => {
  describe('FakeClock', () => {
    clockContractTests(() => new FakeClock());
  });

  describe('SystemClock', () => {
    clockContractTests(() => new SystemClock());
  });
});
