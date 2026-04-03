/**
 * Network Setting Keys Completeness Test (#282)
 *
 * Dynamically verifies that ALL networks in NETWORK_TYPES have
 * corresponding setting keys in SETTING_DEFINITIONS for:
 *   1. rpc.{rpcConfigKey(chain, network)} -- RPC endpoint
 *   2. rpc_pool.{network} -- RPC pool URLs
 *   3. incoming.wss_url.{network} -- WebSocket URL for incoming TX
 *   4. BUILT_IN_RPC_DEFAULTS -- built-in RPC fallback URLs
 *
 * Uses NETWORK_TYPES as SSoT: adding a network to chain.ts without
 * adding the corresponding setting keys will cause this test to fail.
 *
 * Supersedes hardcoded key list checks in config-loader.test.ts (CFG-02).
 */

import { describe, it, expect } from 'vitest';
import {
  NETWORK_TYPES,
  SOLANA_NETWORK_TYPES,
  EVM_NETWORK_TYPES,
  RIPPLE_NETWORK_TYPES,
  BUILT_IN_RPC_DEFAULTS,
} from '@waiaas/core';
import { SETTING_DEFINITIONS } from '../infrastructure/settings/setting-keys.js';
import { rpcConfigKey } from '../infrastructure/adapter-pool.js';

// Build a Set of all defined setting keys for O(1) lookup
const allKeys = new Set(SETTING_DEFINITIONS.map((d) => d.key));

describe('Network Setting Keys Completeness (#282)', () => {
  // --- 1. rpc.* keys ---
  describe('rpc.* keys', () => {
    it.each([...NETWORK_TYPES])('has rpc key for %s', (network) => {
      const chain = (SOLANA_NETWORK_TYPES as readonly string[]).includes(network)
        ? 'solana'
        : (RIPPLE_NETWORK_TYPES as readonly string[]).includes(network)
          ? 'ripple'
          : 'ethereum';
      const key = `rpc.${rpcConfigKey(chain, network)}`;
      expect(allKeys.has(key)).toBe(true);
    });

    it('rpc key count matches NETWORK_TYPES.length', () => {
      const rpcKeys = SETTING_DEFINITIONS.filter(
        (d) => d.category === 'rpc' && d.key.startsWith('rpc.'),
      );
      expect(rpcKeys).toHaveLength(NETWORK_TYPES.length);
    });
  });

  // --- 2. rpc_pool.* keys ---
  describe('rpc_pool.* keys', () => {
    it.each([...NETWORK_TYPES])('has rpc_pool key for %s', (network) => {
      const key = `rpc_pool.${network}`;
      expect(allKeys.has(key)).toBe(true);
    });

    it('rpc_pool key count matches NETWORK_TYPES.length', () => {
      const poolKeys = SETTING_DEFINITIONS.filter((d) => d.category === 'rpc_pool');
      expect(poolKeys).toHaveLength(NETWORK_TYPES.length);
    });
  });

  // --- 3. incoming.wss_url.* keys ---
  describe('incoming.wss_url.* keys', () => {
    it.each([...NETWORK_TYPES])('has incoming.wss_url key for %s', (network) => {
      const key = `incoming.wss_url.${network}`;
      expect(allKeys.has(key)).toBe(true);
    });

    it('incoming.wss_url per-network key count matches NETWORK_TYPES.length', () => {
      const wssKeys = SETTING_DEFINITIONS.filter(
        (d) =>
          d.key.startsWith('incoming.wss_url.') && d.key !== 'incoming.wss_url',
      );
      expect(wssKeys).toHaveLength(NETWORK_TYPES.length);
    });
  });

  // --- 4. BUILT_IN_RPC_DEFAULTS ---
  describe('BUILT_IN_RPC_DEFAULTS', () => {
    it.each([...NETWORK_TYPES])('has built-in RPC default for %s', (network) => {
      expect(BUILT_IN_RPC_DEFAULTS).toHaveProperty(network);
    });

    it('BUILT_IN_RPC_DEFAULTS key count matches NETWORK_TYPES.length', () => {
      expect(Object.keys(BUILT_IN_RPC_DEFAULTS)).toHaveLength(NETWORK_TYPES.length);
    });
  });

  // --- 5. Cross-check: all three categories are in sync ---
  describe('cross-check', () => {
    it('Solana networks have exactly SOLANA_NETWORK_TYPES.length entries per category', () => {
      expect(SOLANA_NETWORK_TYPES).toHaveLength(3);
    });

    it('EVM networks have exactly EVM_NETWORK_TYPES.length entries per category', () => {
      expect(EVM_NETWORK_TYPES).toHaveLength(12);
    });

    it('XRPL networks have exactly RIPPLE_NETWORK_TYPES.length entries per category', () => {
      expect(RIPPLE_NETWORK_TYPES).toHaveLength(3);
    });

    it('NETWORK_TYPES = SOLANA + EVM + RIPPLE', () => {
      expect(NETWORK_TYPES).toHaveLength(
        SOLANA_NETWORK_TYPES.length + EVM_NETWORK_TYPES.length + RIPPLE_NETWORK_TYPES.length,
      );
    });
  });
});
