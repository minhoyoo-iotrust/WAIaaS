/**
 * CT-3: IPolicyEngine Contract Test shared suite.
 *
 * Verifies that any IPolicyEngine implementation returns a valid
 * PolicyEvaluation from evaluate(), with correct tier, allowed,
 * reason, and delaySeconds fields.
 *
 * Both MockPolicyEngine and DatabasePolicyEngine (in daemon tests)
 * must pass these tests to guarantee behavioral equivalence.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { IPolicyEngine, PolicyEvaluation } from '../../interfaces/IPolicyEngine.js';
import { POLICY_TIERS } from '../../enums/policy.js';

// ---------------------------------------------------------------------------
// Standard test request (lamport-scale integer string)
// ---------------------------------------------------------------------------

const CONTRACT_TEST_REQUEST = {
  type: 'TRANSFER',
  amount: '1000000000', // 1 SOL in lamports
  toAddress: 'So11111111111111111111111111111112',
  chain: 'solana',
};

// ---------------------------------------------------------------------------
// Shared suite
// ---------------------------------------------------------------------------

/**
 * IPolicyEngine contract test suite.
 *
 * @param factory - Function that returns a fresh IPolicyEngine instance.
 * @param options - Optional hooks for test customization.
 * @param options.setupPolicies - Called with the engine to configure policies before test runs.
 */
export function policyEngineContractTests(
  factory: () => IPolicyEngine | Promise<IPolicyEngine>,
  options?: { setupPolicies?: (engine: IPolicyEngine) => Promise<void> },
): void {
  let engine: IPolicyEngine;

  describe('IPolicyEngine contract', () => {
    beforeEach(async () => {
      engine = await factory();
      if (options?.setupPolicies) {
        await options.setupPolicies(engine);
      }
    });

    it('evaluate() returns a PolicyEvaluation with tier and allowed fields', async () => {
      const result: PolicyEvaluation = await engine.evaluate(
        'wallet-contract-test',
        CONTRACT_TEST_REQUEST,
      );

      expect(result).toBeDefined();
      expect(result).toHaveProperty('tier');
      expect(result).toHaveProperty('allowed');
    });

    it('PolicyEvaluation.tier is a valid PolicyTier', async () => {
      const result = await engine.evaluate(
        'wallet-contract-test',
        CONTRACT_TEST_REQUEST,
      );

      expect(POLICY_TIERS).toContain(result.tier);
    });

    it('PolicyEvaluation.allowed is a boolean', async () => {
      const result = await engine.evaluate(
        'wallet-contract-test',
        CONTRACT_TEST_REQUEST,
      );

      expect(typeof result.allowed).toBe('boolean');
    });

    it('returns INSTANT allowed in default state (no policies configured)', async () => {
      const result = await engine.evaluate(
        'wallet-contract-test',
        CONTRACT_TEST_REQUEST,
      );

      expect(result.tier).toBe('INSTANT');
      expect(result.allowed).toBe(true);
    });

    it('reason is a string when allowed=false', async () => {
      // This test verifies shape only -- if allowed is true, it passes trivially
      const result = await engine.evaluate(
        'wallet-contract-test',
        CONTRACT_TEST_REQUEST,
      );

      if (!result.allowed) {
        expect(typeof result.reason).toBe('string');
        expect(result.reason!.length).toBeGreaterThan(0);
      }
    });

    it('delaySeconds is a number when tier is DELAY', async () => {
      // Shape verification: if tier is not DELAY, delaySeconds should be absent
      const result = await engine.evaluate(
        'wallet-contract-test',
        CONTRACT_TEST_REQUEST,
      );

      if (result.tier === 'DELAY') {
        expect(typeof result.delaySeconds).toBe('number');
        expect(result.delaySeconds).toBeGreaterThan(0);
      } else {
        // delaySeconds should be undefined for non-DELAY tiers
        expect(result.delaySeconds).toBeUndefined();
      }
    });
  });
}
