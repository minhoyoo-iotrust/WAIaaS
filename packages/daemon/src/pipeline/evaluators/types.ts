/**
 * evaluators/types.ts - Shared types for policy evaluator modules.
 *
 * Extracted from database-policy-engine.ts to avoid circular dependencies.
 */

import type { PolicyEvaluation, PolicyTier } from '@waiaas/core';
import type { z } from 'zod';

export type { PolicyEvaluation, PolicyTier };

export interface PolicyRow {
  id: string;
  walletId: string | null;
  type: string;
  rules: string;
  priority: number;
  enabled: boolean | null;
  network: string | null;
}

/** Transaction parameter for policy evaluation. */
export interface TransactionParam {
  type: string;
  amount: string;
  toAddress: string;
  chain: string;
  /** Resolved network for ALLOWED_NETWORKS evaluation + network scoping. */
  network?: string;
  /** Token address for ALLOWED_TOKENS evaluation (TOKEN_TRANSFER only). */
  tokenAddress?: string;
  /** CAIP-19 asset identifier for ALLOWED_TOKENS 4-scenario matching (TOKEN_TRANSFER only). */
  assetId?: string;
  /** Contract address for CONTRACT_WHITELIST evaluation (CONTRACT_CALL only). */
  contractAddress?: string;
  /** Function selector (4-byte hex, e.g. '0x12345678') for METHOD_WHITELIST evaluation (CONTRACT_CALL only). */
  selector?: string;
  /** Spender address for APPROVED_SPENDERS evaluation (APPROVE only). */
  spenderAddress?: string;
  /** Approve amount in raw units for APPROVE_AMOUNT_LIMIT evaluation (APPROVE only). */
  approveAmount?: string;
  /** Token decimals for token_limits human-readable conversion (TOKEN_TRANSFER/APPROVE only). */
  tokenDecimals?: number;
  /** Action provider name for provider-trust policy bypass (set by ActionProviderRegistry). */
  actionProvider?: string;
  /** Action name for lending policy evaluation (supply/borrow/repay/withdraw). Set by ActionProviderRegistry. */
  actionName?: string;
  /** Leverage for perp policy evaluation (open_position/modify_position). Set by ActionProviderRegistry. */
  perpLeverage?: number;
  /** Position size in USD for perp policy evaluation. Set by ActionProviderRegistry. */
  perpSizeUsd?: number;
  // Phase 389: External action fields
  /** Venue identifier for VENUE_WHITELIST evaluation (signedData/signedHttp only). */
  venue?: string;
  /** Action category for ACTION_CATEGORY_LIMIT evaluation (e.g., 'trade', 'withdraw'). */
  actionCategory?: string;
  /** Notional USD value for ACTION_CATEGORY_LIMIT evaluation. */
  notionalUsd?: number;
  /** Leverage for off-chain action (for policy context). */
  leverage?: number;
  /** Expiry timestamp (ISO string) for off-chain action. */
  expiry?: string;
  /** Whether the off-chain action has withdrawal capability. */
  hasWithdrawCapability?: boolean;
}

/** Context object providing parseRules utility to evaluators. */
export interface ParseRulesContext {
  parseRules: <S extends z.ZodTypeAny>(rules: string, schema: S, policyType: string) => z.infer<S>;
}

/** Context providing SettingsService access for evaluators that need it. */
export interface SettingsContext {
  settingsService: { get(key: string): string } | null;
}
