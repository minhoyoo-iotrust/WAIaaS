/**
 * Incoming transaction safety rules.
 *
 * Three rule implementations for detecting suspicious incoming transactions:
 * 1. DustAttackRule -- flags micro-value transfers (potential address poisoning)
 * 2. UnknownTokenRule -- flags transfers of unregistered tokens
 * 3. LargeAmountRule -- flags unusually large incoming amounts
 *
 * Each rule implements IIncomingSafetyRule with a synchronous check() method.
 * Rules return true when the transaction IS suspicious (should be flagged).
 * Safe default: when price data is unavailable, rules return false (not suspicious).
 *
 * @see docs/76-incoming-transaction-monitoring.md section 4.2
 */

import type { IncomingTransaction } from '@waiaas/core';

// ── Types ────────────────────────────────────────────────────────

export type SuspiciousReason = 'dust' | 'unknownToken' | 'largeAmount';

export interface SafetyRuleContext {
  /** Configurable USD threshold below which a transfer is considered dust. */
  dustThresholdUsd: number;
  /** Multiplier of average incoming USD above which a transfer is flagged. */
  amountMultiplier: number;
  /** Whether the token address is in the registered token registry. */
  isRegisteredToken: boolean;
  /** USD price per whole token unit, or null if unavailable. */
  usdPrice: number | null;
  /** Average incoming USD for this wallet, or null if no history. */
  avgIncomingUsd: number | null;
  /** Token decimals (e.g. 9 for SOL, 18 for ETH). */
  decimals: number;
}

export interface IIncomingSafetyRule {
  readonly name: SuspiciousReason;
  check(tx: IncomingTransaction, context: SafetyRuleContext): boolean;
}

// ── DustAttackRule ───────────────────────────────────────────────

/**
 * Flags transactions with USD value below a configurable dust threshold.
 *
 * Dust attacks send tiny amounts to pollute the recipient's transaction
 * history, hoping they'll copy-paste a malicious address.
 *
 * Safe default: if usdPrice is null (unavailable), returns false.
 */
export class DustAttackRule implements IIncomingSafetyRule {
  readonly name: SuspiciousReason = 'dust';

  check(tx: IncomingTransaction, ctx: SafetyRuleContext): boolean {
    if (ctx.usdPrice === null) return false;

    const amountUsd =
      (Number(tx.amount) * ctx.usdPrice) / 10 ** ctx.decimals;

    return amountUsd < ctx.dustThresholdUsd;
  }
}

// ── UnknownTokenRule ────────────────────────────────────────────

/**
 * Flags token transfers where the token address is not in the registry.
 *
 * Native transfers (tokenAddress === null) are never flagged by this rule,
 * since SOL/ETH are inherently "known".
 */
export class UnknownTokenRule implements IIncomingSafetyRule {
  readonly name: SuspiciousReason = 'unknownToken';

  check(tx: IncomingTransaction, ctx: SafetyRuleContext): boolean {
    // Native transfers are always safe for this rule
    if (tx.tokenAddress === null) return false;

    return !ctx.isRegisteredToken;
  }
}

// ── LargeAmountRule ─────────────────────────────────────────────

/**
 * Flags transactions whose USD value exceeds a configurable multiplier
 * of the wallet's average incoming USD amount.
 *
 * Helps detect unexpected large deposits that may indicate stolen funds
 * being routed through monitored wallets.
 *
 * Safe default: if either usdPrice or avgIncomingUsd is null, returns false.
 */
export class LargeAmountRule implements IIncomingSafetyRule {
  readonly name: SuspiciousReason = 'largeAmount';

  check(tx: IncomingTransaction, ctx: SafetyRuleContext): boolean {
    if (ctx.usdPrice === null || ctx.avgIncomingUsd === null) return false;

    const amountUsd =
      (Number(tx.amount) * ctx.usdPrice) / 10 ** ctx.decimals;

    return amountUsd > ctx.avgIncomingUsd * ctx.amountMultiplier;
  }
}
