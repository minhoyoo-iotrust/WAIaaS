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
      "End-to-end quickstart: create wallet, session, check balance, send first transfer",
  },
  {
    name: "wallet",
    filename: "wallet.skill.md",
    description:
      "Wallet CRUD, asset queries, session management, token registry, MCP provisioning, owner management",
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
      "Policy engine CRUD: 12 policy types for spending limits, whitelists, time restrictions, rate limits, token/contract/approve controls, network restrictions, x402 domain controls",
  },
  {
    name: "admin",
    filename: "admin.skill.md",
    description:
      "Admin API: daemon status, kill switch, notifications, settings management, JWT rotation, shutdown, oracle status, API key management",
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
