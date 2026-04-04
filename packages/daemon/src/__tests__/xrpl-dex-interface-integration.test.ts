/**
 * XRPL DEX Provider interface integration verification tests.
 *
 * Validates that XRPL DEX integrates correctly with existing frameworks:
 * - INTF-01: MCP auto-exposure via mcpExpose=true in builtin-metadata
 * - INTF-02: Admin Settings toggle via setting-keys
 * - INTF-04: SDK access via XrplDexProvider metadata and actions
 *
 * @see Phase 03-02 Task 1
 */
import { describe, it, expect } from 'vitest';
import { BUILTIN_PROVIDER_METADATA } from '../infrastructure/action/builtin-metadata.js';
import { SETTING_DEFINITIONS } from '../infrastructure/settings/setting-keys.js';
import { XrplDexProvider } from '@waiaas/actions';
import type { XrplOrderbookClient } from '@waiaas/actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStubOrderbookClient(): XrplOrderbookClient {
  return {} as unknown as XrplOrderbookClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('XRPL DEX Interface Integration', () => {
  // -----------------------------------------------------------------------
  // INTF-01: MCP auto-exposure
  // -----------------------------------------------------------------------
  describe('INTF-01: MCP auto-exposure', () => {
    const entry = BUILTIN_PROVIDER_METADATA.find((p) => p.name === 'xrpl_dex');

    it('xrpl_dex entry exists in BUILTIN_PROVIDER_METADATA', () => {
      expect(entry).toBeDefined();
    });

    it('has mcpExpose=true', () => {
      expect(entry!.mcpExpose).toBe(true);
    });

    it('chains includes ripple', () => {
      expect(entry!.chains).toEqual(['ripple']);
    });

    it('enabledKey matches setting key prefix', () => {
      expect(entry!.enabledKey).toBe('xrpl_dex');
    });

    it('category is Swap', () => {
      expect(entry!.category).toBe('Swap');
    });
  });

  // -----------------------------------------------------------------------
  // INTF-02: Admin Settings toggle
  // -----------------------------------------------------------------------
  describe('INTF-02: Admin Settings toggle', () => {
    it('actions.xrpl_dex_enabled setting key exists', () => {
      const def = SETTING_DEFINITIONS.find((d) => d.key === 'actions.xrpl_dex_enabled');
      expect(def).toBeDefined();
      expect(def!.defaultValue).toBe('false');
      expect(def!.category).toBe('actions');
    });

    it('actions.xrpl_dex_rpc_url setting key exists with correct default', () => {
      const def = SETTING_DEFINITIONS.find((d) => d.key === 'actions.xrpl_dex_rpc_url');
      expect(def).toBeDefined();
      expect(def!.defaultValue).toBe('wss://xrplcluster.com');
    });
  });

  // -----------------------------------------------------------------------
  // INTF-04: SDK access via XrplDexProvider
  // -----------------------------------------------------------------------
  describe('INTF-04: SDK access', () => {
    const provider = new XrplDexProvider(createStubOrderbookClient());

    it('metadata.name is xrpl_dex', () => {
      expect(provider.metadata.name).toBe('xrpl_dex');
    });

    it('metadata.mcpExpose is true', () => {
      expect(provider.metadata.mcpExpose).toBe(true);
    });

    it('has 5 action definitions', () => {
      expect(provider.actions).toHaveLength(5);
    });

    it('action names are correct', () => {
      const names = provider.actions.map((a) => a.name);
      expect(names).toEqual(['swap', 'limit_order', 'cancel_order', 'get_orderbook', 'get_offers']);
    });

    // Cross-check risk levels and default tiers
    it('swap: riskLevel=medium, defaultTier=INSTANT', () => {
      const action = provider.actions.find((a) => a.name === 'swap')!;
      expect(action.riskLevel).toBe('medium');
      expect(action.defaultTier).toBe('INSTANT');
    });

    it('limit_order: riskLevel=medium, defaultTier=DELAY', () => {
      const action = provider.actions.find((a) => a.name === 'limit_order')!;
      expect(action.riskLevel).toBe('medium');
      expect(action.defaultTier).toBe('DELAY');
    });

    it('cancel_order: riskLevel=low, defaultTier=INSTANT', () => {
      const action = provider.actions.find((a) => a.name === 'cancel_order')!;
      expect(action.riskLevel).toBe('low');
      expect(action.defaultTier).toBe('INSTANT');
    });

    it('get_orderbook: riskLevel=low, defaultTier=INSTANT', () => {
      const action = provider.actions.find((a) => a.name === 'get_orderbook')!;
      expect(action.riskLevel).toBe('low');
      expect(action.defaultTier).toBe('INSTANT');
    });

    it('get_offers: riskLevel=low, defaultTier=INSTANT', () => {
      const action = provider.actions.find((a) => a.name === 'get_offers')!;
      expect(action.riskLevel).toBe('low');
      expect(action.defaultTier).toBe('INSTANT');
    });
  });
});
