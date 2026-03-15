/**
 * ContractNameRegistry - 4-tier synchronous contract name resolution.
 *
 * Priority cascade:
 *   1. Action Provider (registered via registerProvider)
 *   2. Well-known (static WELL_KNOWN_CONTRACTS data)
 *   3. Whitelist (registered via registerWhitelist from CONTRACT_WHITELIST policy)
 *   4. Fallback (truncated address format)
 *
 * EVM addresses are normalized to lowercase for case-insensitive matching.
 * Solana addresses are case-sensitive (base58).
 *
 * Compound key: `${normalizedAddress}:${network}` ensures per-network isolation.
 */

import { WELL_KNOWN_CONTRACTS } from '../constants/well-known-contracts.js';
import type { ActionProviderMetadata } from '../interfaces/action-provider.types.js';
import { snakeCaseToDisplayName } from '../interfaces/action-provider.types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Source of the resolved contract name. */
export type ContractNameSource =
  | 'action_provider'
  | 'well_known'
  | 'whitelist'
  | 'fallback';

/** Result of a contract name resolution. */
export interface ContractNameResult {
  /** Human-readable name. */
  name: string;
  /** Which tier resolved this name. */
  source: ContractNameSource;
}

// ---------------------------------------------------------------------------
// ContractNameRegistry
// ---------------------------------------------------------------------------

export class ContractNameRegistry {
  /** Tier 1: Action Provider names. */
  private readonly providerNames = new Map<string, string>();
  /** Tier 2: Well-known static names (loaded from WELL_KNOWN_CONTRACTS). */
  private readonly wellKnownNames = new Map<string, string>();
  /** Tier 3: Whitelist names (from CONTRACT_WHITELIST policy). */
  private readonly whitelistNames = new Map<string, string>();

  constructor() {
    this.loadWellKnownContracts();
  }

  /**
   * Resolve a contract address to a human-readable name.
   * Synchronous, returns immediately from in-memory maps.
   */
  resolve(address: string, network: string): ContractNameResult {
    const key = this.makeKey(address, network);

    // Tier 1: Action Provider
    const providerName = this.providerNames.get(key);
    if (providerName) {
      return { name: providerName, source: 'action_provider' };
    }

    // Tier 2: Well-known
    const wellKnownName = this.wellKnownNames.get(key);
    if (wellKnownName) {
      return { name: wellKnownName, source: 'well_known' };
    }

    // Tier 3: Whitelist
    const whitelistName = this.whitelistNames.get(key);
    if (whitelistName) {
      return { name: whitelistName, source: 'whitelist' };
    }

    // Tier 4: Fallback
    return { name: this.truncateAddress(address), source: 'fallback' };
  }

  /**
   * Register contract addresses from an Action Provider (Tier 1).
   * Uses metadata.displayName if set, falls back to snakeCaseToDisplayName(metadata.name).
   */
  registerProvider(
    metadata: ActionProviderMetadata,
    contractAddresses: Array<{ address: string; network: string }>,
  ): void {
    const displayName =
      metadata.displayName ?? snakeCaseToDisplayName(metadata.name);

    for (const entry of contractAddresses) {
      const key = this.makeKey(entry.address, entry.network);
      this.providerNames.set(key, displayName);
    }
  }

  /**
   * Register contract addresses from CONTRACT_WHITELIST policy (Tier 3).
   * Skips entries without a name.
   */
  registerWhitelist(
    contracts: Array<{ address: string; name?: string }>,
    network: string,
  ): void {
    for (const entry of contracts) {
      if (!entry.name) continue;
      const key = this.makeKey(entry.address, network);
      this.whitelistNames.set(key, entry.name);
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /** Normalize EVM addresses to lowercase; leave Solana addresses as-is. */
  private normalizeAddress(address: string): string {
    if (address.startsWith('0x') || address.startsWith('0X')) {
      return address.toLowerCase();
    }
    // Solana (base58): case-sensitive
    return address;
  }

  /** Create compound key for per-network isolation. */
  private makeKey(address: string, network: string): string {
    return `${this.normalizeAddress(address)}:${network}`;
  }

  /**
   * Truncate an address for fallback display.
   * EVM: '0xabcd...1234'  (0x + first 4 hex chars + ... + last 4 hex chars)
   * Solana: 'ABCD...5678' (first 4 chars + ... + last 4 chars)
   */
  private truncateAddress(address: string): string {
    // Too short to truncate
    if (address.length <= 10) {
      return address;
    }

    if (address.startsWith('0x') || address.startsWith('0X')) {
      // EVM: show 0x + 4 hex chars ... 4 hex chars
      const hex = address.slice(2).toLowerCase();
      return `0x${hex.slice(0, 4)}...${hex.slice(-4)}`;
    }

    // Solana: first 4 ... last 4
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }

  /** Load WELL_KNOWN_CONTRACTS into Tier 2 map. */
  private loadWellKnownContracts(): void {
    for (const entry of WELL_KNOWN_CONTRACTS) {
      const key = this.makeKey(entry.address, entry.network);
      this.wellKnownNames.set(key, entry.name);
    }
  }
}
