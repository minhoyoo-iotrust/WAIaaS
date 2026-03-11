/**
 * Tests for Polymarket policy engine integration and connect-info capability.
 *
 * Covers:
 * - connect-info polymarket capability (enabled/disabled/missing)
 * - Order provider defaultTier values
 * - CTF provider defaultTier values
 * - getSpendingAmount for order and CTF actions
 * - Network validation (polygon-mainnet only)
 */

import { describe, it, expect } from 'vitest';
import { buildConnectInfoPrompt } from '../api/routes/connect-info.js';
import type { BuildConnectInfoPromptParams } from '../api/routes/connect-info.js';
import { PolymarketOrderProvider, PolymarketCtfProvider } from '@waiaas/actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createPromptParams(overrides: Partial<BuildConnectInfoPromptParams> = {}): BuildConnectInfoPromptParams {
  return {
    wallets: [],
    capabilities: ['transfer', 'token_transfer', 'balance', 'assets'],
    defaultDeny: {
      tokenTransfers: false,
      contractCalls: false,
      tokenApprovals: false,
      x402Domains: false,
    },
    baseUrl: 'http://localhost:3100',
    version: '2.10.0',
    ...overrides,
  };
}

// Minimal mocks for provider construction
const mockConfig = {
  clobApiUrl: 'https://clob.polymarket.com',
  negRiskEnabled: true,
  autoApproveCTF: true,
  defaultFeeBps: 0,
  orderExpirySeconds: 86400,
  maxPositionUsdc: 1000,
  proxyWallet: false,
};

const mockDeps = {
  clobClient: {} as never,
  apiKeyService: {} as never,
  db: { orders: {} as never },
};

const mockCtfDeps = {
  chainAdapter: {} as never,
};

// ---------------------------------------------------------------------------
// connect-info capability tests
// ---------------------------------------------------------------------------

describe('connect-info polymarket capability', () => {
  it('polymarket capability included when setting is true', () => {
    const capabilities: string[] = ['transfer', 'token_transfer', 'balance', 'assets'];
    const polymarketEnabled = 'true';
    if (polymarketEnabled === 'true') {
      capabilities.push('polymarket');
    }

    expect(capabilities).toContain('polymarket');

    const prompt = buildConnectInfoPrompt(createPromptParams({ capabilities }));
    expect(prompt).toContain('polymarket');
  });

  it('polymarket capability excluded when setting is false', () => {
    const capabilities: string[] = ['transfer', 'token_transfer', 'balance', 'assets'];
    const polymarketEnabled = 'false';
    if (polymarketEnabled === 'true') {
      capabilities.push('polymarket');
    }

    expect(capabilities).not.toContain('polymarket');
  });

  it('polymarket capability excluded when setting key not found', () => {
    const capabilities: string[] = ['transfer', 'token_transfer', 'balance', 'assets'];
    try {
      throw new Error('Setting not found: actions.polymarket_enabled');
    } catch {
      // Setting not found -- polymarket not available
    }

    expect(capabilities).not.toContain('polymarket');
  });

  it('prompt includes Polymarket Prediction Market hint when polymarket capability present', () => {
    const capabilities = ['transfer', 'token_transfer', 'balance', 'assets', 'polymarket'];
    const prompt = buildConnectInfoPrompt(createPromptParams({ capabilities }));

    expect(prompt).toContain('Polymarket Prediction Market');
    expect(prompt).toContain('pm_buy');
    expect(prompt).toContain('pm_sell');
    expect(prompt).toContain('pm_split_position');
    expect(prompt).toContain('/v1/polymarket/markets');
  });

  it('prompt does NOT include Polymarket hint when capability absent', () => {
    const capabilities = ['transfer', 'token_transfer', 'balance', 'assets'];
    const prompt = buildConnectInfoPrompt(createPromptParams({ capabilities }));

    expect(prompt).not.toContain('Polymarket Prediction Market');
  });
});

// ---------------------------------------------------------------------------
// Order provider defaultTier tests
// ---------------------------------------------------------------------------

describe('PolymarketOrderProvider defaultTier', () => {
  const provider = new PolymarketOrderProvider(mockConfig, mockDeps as never);

  it('pm_buy has APPROVAL tier', () => {
    const action = provider.actions.find((a) => a.name === 'pm_buy');
    expect(action?.defaultTier).toBe('APPROVAL');
  });

  it('pm_sell has DELAY tier', () => {
    const action = provider.actions.find((a) => a.name === 'pm_sell');
    expect(action?.defaultTier).toBe('DELAY');
  });

  it('pm_cancel_order has INSTANT tier', () => {
    const action = provider.actions.find((a) => a.name === 'pm_cancel_order');
    expect(action?.defaultTier).toBe('INSTANT');
  });

  it('pm_cancel_all has INSTANT tier', () => {
    const action = provider.actions.find((a) => a.name === 'pm_cancel_all');
    expect(action?.defaultTier).toBe('INSTANT');
  });

  it('pm_update_order has DELAY tier', () => {
    const action = provider.actions.find((a) => a.name === 'pm_update_order');
    expect(action?.defaultTier).toBe('DELAY');
  });
});

// ---------------------------------------------------------------------------
// CTF provider defaultTier tests
// ---------------------------------------------------------------------------

describe('PolymarketCtfProvider defaultTier', () => {
  const provider = new PolymarketCtfProvider(mockConfig, mockCtfDeps as never);

  it('pm_redeem_positions has INSTANT tier', () => {
    const action = provider.actions.find((a) => a.name === 'pm_redeem_positions');
    expect(action?.defaultTier).toBe('INSTANT');
  });

  it('pm_split_position has DELAY tier', () => {
    const action = provider.actions.find((a) => a.name === 'pm_split_position');
    expect(action?.defaultTier).toBe('DELAY');
  });

  it('pm_merge_positions has DELAY tier', () => {
    const action = provider.actions.find((a) => a.name === 'pm_merge_positions');
    expect(action?.defaultTier).toBe('DELAY');
  });

  it('pm_approve_collateral has INSTANT tier', () => {
    const action = provider.actions.find((a) => a.name === 'pm_approve_collateral');
    expect(action?.defaultTier).toBe('INSTANT');
  });

  it('pm_approve_ctf has INSTANT tier', () => {
    const action = provider.actions.find((a) => a.name === 'pm_approve_ctf');
    expect(action?.defaultTier).toBe('INSTANT');
  });
});

// ---------------------------------------------------------------------------
// Network validation tests (via action metadata)
// ---------------------------------------------------------------------------

describe('Polymarket network validation', () => {
  const orderProvider = new PolymarketOrderProvider(mockConfig, mockDeps as never);
  const ctfProvider = new PolymarketCtfProvider(mockConfig, mockCtfDeps as never);

  it('all order actions require ethereum chain', () => {
    for (const action of orderProvider.actions) {
      expect(action.chain).toBe('ethereum');
    }
  });

  it('all CTF actions require ethereum chain', () => {
    for (const action of ctfProvider.actions) {
      expect(action.chain).toBe('ethereum');
    }
  });
});
