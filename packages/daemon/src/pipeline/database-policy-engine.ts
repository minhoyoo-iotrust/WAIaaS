/**
 * DatabasePolicyEngine - v1.2 DB-backed policy engine.
 *
 * Evaluates transactions against policies stored in the policies table.
 * Supports SPENDING_LIMIT (4-tier classification) and WHITELIST (address filtering).
 *
 * Algorithm:
 * 1. Load enabled policies for agent (agent-specific + global), ORDER BY priority DESC
 * 2. If no policies found, return INSTANT passthrough (Phase 7 compat)
 * 3. Resolve overrides: agent-specific policies override global policies of same type
 * 4. Evaluate WHITELIST: deny if toAddress not in allowed_addresses
 * 5. Evaluate SPENDING_LIMIT: classify amount into INSTANT/NOTIFY/DELAY/APPROVAL
 *
 * @see docs/33-time-lock-approval-mechanism.md
 */

import type { IPolicyEngine, PolicyEvaluation, PolicyTier } from '@waiaas/core';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, or, and, isNull, desc } from 'drizzle-orm';
import { policies } from '../infrastructure/database/schema.js';
import type * as schema from '../infrastructure/database/schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpendingLimitRules {
  instant_max: string;
  notify_max: string;
  delay_max: string;
  delay_seconds: number;
}

interface WhitelistRules {
  allowed_addresses: string[];
}

interface PolicyRow {
  id: string;
  agentId: string | null;
  type: string;
  rules: string;
  priority: number;
  enabled: boolean | null;
}

// ---------------------------------------------------------------------------
// DatabasePolicyEngine
// ---------------------------------------------------------------------------

/**
 * DB-backed policy engine with SPENDING_LIMIT 4-tier and WHITELIST evaluation.
 *
 * Constructor takes a Drizzle DB instance typed with the full schema.
 */
export class DatabasePolicyEngine implements IPolicyEngine {
  constructor(private readonly db: BetterSQLite3Database<typeof schema>) {}

  /**
   * Evaluate a transaction against DB-stored policies.
   */
  async evaluate(
    agentId: string,
    transaction: {
      type: string;
      amount: string;
      toAddress: string;
      chain: string;
    },
  ): Promise<PolicyEvaluation> {
    // Step 1: Load enabled policies (agent-specific + global)
    const rows = await this.db
      .select()
      .from(policies)
      .where(
        and(
          or(eq(policies.agentId, agentId), isNull(policies.agentId)),
          eq(policies.enabled, true),
        ),
      )
      .orderBy(desc(policies.priority))
      .all();

    // Step 2: No policies -> INSTANT passthrough
    if (rows.length === 0) {
      return { allowed: true, tier: 'INSTANT' };
    }

    // Step 3: Resolve overrides (agent-specific wins over global for same type)
    const resolved = this.resolveOverrides(rows as PolicyRow[], agentId);

    // Step 4: Evaluate WHITELIST (deny-first)
    const whitelistResult = this.evaluateWhitelist(resolved, transaction.toAddress);
    if (whitelistResult !== null) {
      return whitelistResult;
    }

    // Step 5: Evaluate SPENDING_LIMIT (tier classification)
    const spendingResult = this.evaluateSpendingLimit(resolved, transaction.amount);
    if (spendingResult !== null) {
      return spendingResult;
    }

    // Default: INSTANT passthrough (no applicable rules)
    return { allowed: true, tier: 'INSTANT' };
  }

  // -------------------------------------------------------------------------
  // Private: Override resolution
  // -------------------------------------------------------------------------

  /**
   * Resolve policy overrides: for each policy type, agent-specific wins over global.
   * Returns deduplicated policy list (one per type, agent-specific preferred).
   */
  private resolveOverrides(rows: PolicyRow[], agentId: string): PolicyRow[] {
    const typeMap = new Map<string, PolicyRow>();

    // Rows are already sorted by priority DESC.
    // For each type, prefer agent-specific over global.
    for (const row of rows) {
      const existing = typeMap.get(row.type);
      if (!existing) {
        typeMap.set(row.type, row);
      } else if (row.agentId === agentId && existing.agentId !== agentId) {
        // Agent-specific overrides global
        typeMap.set(row.type, row);
      }
    }

    return Array.from(typeMap.values());
  }

  // -------------------------------------------------------------------------
  // Private: WHITELIST evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate WHITELIST policy.
   * Returns PolicyEvaluation if denied, null if allowed (or no whitelist).
   */
  private evaluateWhitelist(
    resolved: PolicyRow[],
    toAddress: string,
  ): PolicyEvaluation | null {
    const whitelist = resolved.find((p) => p.type === 'WHITELIST');
    if (!whitelist) return null;

    const rules: WhitelistRules = JSON.parse(whitelist.rules);

    // Empty allowed_addresses = whitelist inactive
    if (!rules.allowed_addresses || rules.allowed_addresses.length === 0) {
      return null;
    }

    // Case-insensitive comparison (EVM compat)
    const normalizedTo = toAddress.toLowerCase();
    const isWhitelisted = rules.allowed_addresses.some(
      (addr) => addr.toLowerCase() === normalizedTo,
    );

    if (!isWhitelisted) {
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: `Address ${toAddress} not in whitelist`,
      };
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Private: SPENDING_LIMIT evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate SPENDING_LIMIT policy.
   * Returns PolicyEvaluation with tier classification, or null if no spending limit.
   */
  private evaluateSpendingLimit(
    resolved: PolicyRow[],
    amount: string,
  ): PolicyEvaluation | null {
    const spending = resolved.find((p) => p.type === 'SPENDING_LIMIT');
    if (!spending) return null;

    const rules: SpendingLimitRules = JSON.parse(spending.rules);
    const amountBig = BigInt(amount);
    const instantMax = BigInt(rules.instant_max);
    const notifyMax = BigInt(rules.notify_max);
    const delayMax = BigInt(rules.delay_max);

    let tier: PolicyTier;
    let delaySeconds: number | undefined;

    if (amountBig <= instantMax) {
      tier = 'INSTANT';
    } else if (amountBig <= notifyMax) {
      tier = 'NOTIFY';
    } else if (amountBig <= delayMax) {
      tier = 'DELAY';
      delaySeconds = rules.delay_seconds;
    } else {
      tier = 'APPROVAL';
    }

    return {
      allowed: true,
      tier,
      ...(delaySeconds !== undefined ? { delaySeconds } : {}),
    };
  }
}
