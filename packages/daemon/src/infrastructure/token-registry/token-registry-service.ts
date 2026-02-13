/**
 * Token registry service for managing ERC-20 tokens per EVM network.
 *
 * Merges built-in token data (hardcoded) with custom tokens (DB-stored).
 * Custom tokens with the same address as a built-in token override the built-in entry.
 *
 * @see docs/56-spl-erc20-spec.md
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and } from 'drizzle-orm';
import { tokenRegistry } from '../database/schema.js';
import type * as schema from '../database/schema.js';
import { getBuiltinTokens, type TokenEntry } from './builtin-tokens.js';
import { generateId } from '../database/id.js';

export interface RegistryToken extends TokenEntry {
  source: 'builtin' | 'custom';
}

export class TokenRegistryService {
  constructor(private readonly db: BetterSQLite3Database<typeof schema>) {}

  /**
   * Get all tokens for a network: built-in + custom merged.
   * Custom tokens with the same address as a built-in token override the built-in entry.
   * Returns tokens sorted by symbol alphabetically.
   */
  async getTokensForNetwork(network: string): Promise<RegistryToken[]> {
    // 1. Get built-in tokens
    const builtins = getBuiltinTokens(network);

    // 2. Get custom tokens from DB
    const customRows = await this.db
      .select()
      .from(tokenRegistry)
      .where(eq(tokenRegistry.network, network));

    // 3. Merge: custom overrides built-in for same address (case-insensitive)
    const merged = new Map<string, RegistryToken>();

    for (const t of builtins) {
      merged.set(t.address.toLowerCase(), { ...t, source: 'builtin' });
    }

    for (const row of customRows) {
      merged.set(row.address.toLowerCase(), {
        address: row.address,
        symbol: row.symbol,
        name: row.name,
        decimals: row.decimals,
        source: row.source as 'builtin' | 'custom',
      });
    }

    // 4. Sort by symbol alphabetically
    return Array.from(merged.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  /**
   * Add a custom token to the registry.
   * If a token with the same network+address exists, throws (UNIQUE constraint).
   * Address is stored as-is (caller should provide checksum).
   */
  async addCustomToken(
    network: string,
    token: TokenEntry,
  ): Promise<{ id: string }> {
    const id = generateId();
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);

    await this.db.insert(tokenRegistry).values({
      id,
      network,
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      source: 'custom',
      createdAt: now,
    });

    return { id };
  }

  /**
   * Remove a custom token by network + address.
   * Only custom tokens can be removed. Built-in tokens cannot be removed.
   * Returns true if a row was deleted, false if not found.
   */
  async removeCustomToken(network: string, address: string): Promise<boolean> {
    const result = await this.db
      .delete(tokenRegistry)
      .where(
        and(
          eq(tokenRegistry.network, network),
          eq(tokenRegistry.address, address),
          eq(tokenRegistry.source, 'custom'),
        ),
      );

    return (result as unknown as { changes: number }).changes > 0;
  }

  /**
   * Get token list formatted for EvmAdapter.setAllowedTokens().
   * Returns all tokens (builtin + custom) for the given network.
   */
  async getAdapterTokenList(
    network: string,
  ): Promise<Array<{ address: string; symbol?: string; name?: string; decimals?: number }>> {
    const tokens = await this.getTokensForNetwork(network);
    return tokens.map((t) => ({
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals,
    }));
  }
}
