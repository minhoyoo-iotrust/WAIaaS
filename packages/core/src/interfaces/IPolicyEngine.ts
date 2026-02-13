import type { PolicyTier } from '../enums/policy.js';

/**
 * Policy evaluation result.
 * Determines the security tier and whether the transaction is allowed.
 */
export interface PolicyEvaluation {
  /** Security tier classification. */
  tier: PolicyTier;
  /** Whether the transaction is allowed by policy. */
  allowed: boolean;
  /** Denial reason (when allowed=false). */
  reason?: string;
  /** Delay seconds for DELAY tier. */
  delaySeconds?: number;
}

/**
 * Policy engine interface.
 * Evaluates transactions against configured policies and returns tier classification.
 *
 * v1.1: DefaultPolicyEngine (all INSTANT passthrough).
 * v1.2+: DatabasePolicyEngine (DB-backed rules, 4-tier classification).
 *
 * Design reference: 33-time-lock-approval-mechanism.md
 */
export interface IPolicyEngine {
  /** Evaluate a transaction against policies. */
  evaluate(
    walletId: string,
    transaction: {
      type: string;
      amount: string;
      toAddress: string;
      chain: string;
    },
  ): Promise<PolicyEvaluation>;
}
