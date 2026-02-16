/**
 * CT-3: IPolicyEngine Contract Test execution.
 *
 * Validates MockPolicyEngine (inline) against the shared contract suite.
 * DatabasePolicyEngine is tested in packages/daemon (requires DB infrastructure).
 */
import { describe } from 'vitest';
import type { IPolicyEngine, PolicyEvaluation } from '../../interfaces/IPolicyEngine.js';
import { policyEngineContractTests } from './policy-engine.contract.js';

// ---------------------------------------------------------------------------
// MockPolicyEngine (inline, per design doc 42)
// ---------------------------------------------------------------------------

class MockPolicyEngine implements IPolicyEngine {
  private defaultDecision: PolicyEvaluation = { tier: 'INSTANT', allowed: true };
  private nextDecisions: PolicyEvaluation[] = [];

  async evaluate(
    _walletId: string,
    _transaction: { type: string; amount: string; toAddress: string; chain: string },
  ): Promise<PolicyEvaluation> {
    if (this.nextDecisions.length > 0) return this.nextDecisions.shift()!;
    return { ...this.defaultDecision };
  }

  setNextDecision(...decisions: PolicyEvaluation[]): void {
    this.nextDecisions.push(...decisions);
  }

  setDefaultDecision(decision: PolicyEvaluation): void {
    this.defaultDecision = decision;
  }

  reset(): void {
    this.nextDecisions.length = 0;
    this.defaultDecision = { tier: 'INSTANT', allowed: true };
  }
}

// ---------------------------------------------------------------------------
// Run contract tests
// ---------------------------------------------------------------------------

describe('CT-3: IPolicyEngine Contract Tests', () => {
  describe('MockPolicyEngine', () => {
    policyEngineContractTests(() => new MockPolicyEngine());
  });
});
