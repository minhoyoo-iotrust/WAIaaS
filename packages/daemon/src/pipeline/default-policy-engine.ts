/**
 * DefaultPolicyEngine - v1.1 passthrough policy engine.
 *
 * All transactions are allowed with INSTANT tier.
 * No policy rules are evaluated.
 *
 * v1.2+ will introduce DatabasePolicyEngine with DB-backed rules
 * and 4-tier classification (INSTANT/NOTIFY/DELAY/APPROVAL).
 *
 * @see docs/33-time-lock-approval-mechanism.md
 */

import type { IPolicyEngine, PolicyEvaluation } from '@waiaas/core';

/**
 * Default policy engine that allows all transactions instantly.
 *
 * Used in v1.1 where no policy rules are configured.
 */
export class DefaultPolicyEngine implements IPolicyEngine {
  async evaluate(
    _walletId: string,
    _transaction: {
      type: string;
      amount: string;
      toAddress: string;
      chain: string;
    },
  ): Promise<PolicyEvaluation> {
    return {
      tier: 'INSTANT',
      allowed: true,
    };
  }
}
