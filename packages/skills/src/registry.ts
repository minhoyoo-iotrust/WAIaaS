import path from "node:path";

export interface SkillEntry {
  readonly name: string;
  readonly filename: string;
  readonly description: string;
}

export const SKILL_REGISTRY: readonly SkillEntry[] = [
  {
    name: "quickstart",
    filename: "quickstart.skill.md",
    description:
      "End-to-end quickset: create wallet, session, check balance, send first transfer",
  },
  {
    name: "wallet",
    filename: "wallet.skill.md",
    description:
      "Wallet queries, asset balances, session info, token list",
  },
  {
    name: "transactions",
    filename: "transactions.skill.md",
    description:
      "All 5 transaction types (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH) with lifecycle management",
  },
  {
    name: "policies",
    filename: "policies.skill.md",
    description:
      "Policy queries: view applied spending limits, whitelists, time restrictions",
  },
  {
    name: "actions",
    filename: "actions.skill.md",
    description:
      "Action Provider framework: list providers, execute DeFi actions through the 6-stage transaction pipeline",
  },
  {
    name: "x402",
    filename: "x402.skill.md",
    description:
      "x402 auto-payment protocol: fetch URLs with automatic cryptocurrency payments",
  },
] as const;

/**
 * Returns absolute path to the bundled skills directory.
 * Works from both source (src/) and compiled (dist/) locations.
 */
export function getSkillsDir(): string {
  return path.resolve(import.meta.dirname, "../skills");
}
