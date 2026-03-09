/**
 * Onchain Skip Utilities
 *
 * Provides skip logic for onchain E2E tests based on the ONCHAIN_SKIP_NETWORKS
 * environment variable (set by run-onchain.ts / PreconditionChecker).
 *
 * Usage:
 *   it.skipIf(shouldSkipNetwork('sepolia'))('sends ETH', async () => { ... });
 */

/**
 * Check if a network should be skipped (precondition failed: no wallet, insufficient balance, etc.).
 *
 * Reads from ONCHAIN_SKIP_NETWORKS env var (comma-separated network names).
 */
export function shouldSkipNetwork(network: string): boolean {
  const raw = process.env.ONCHAIN_SKIP_NETWORKS;
  if (!raw) return false;
  const networks = raw.split(',').map((s) => s.trim().toLowerCase());
  return networks.includes(network.toLowerCase());
}

/**
 * Get the reason a network is skipped (for test output clarity).
 */
export function getSkipReason(network: string): string | undefined {
  if (!shouldSkipNetwork(network)) return undefined;
  return `Insufficient balance or unavailable on ${network}`;
}

/**
 * Placeholder for self-transfer address.
 * When tests send to themselves to preserve balance, this constant documents the intent.
 */
export const SELF_ADDRESS_PLACEHOLDER = '<<SELF>>';
