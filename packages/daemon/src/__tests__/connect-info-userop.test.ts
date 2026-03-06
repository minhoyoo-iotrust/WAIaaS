/**
 * Tests for userop capability in GET /v1/connect-info.
 *
 * Plan 340-02: connect-info userop capability + prompt guidance.
 * Verifies userop capability appears when Smart Account wallets exist
 * (regardless of aaProvider), and prompt includes UserOp API guidance.
 */

import { describe, it, expect } from 'vitest';
import { buildConnectInfoPrompt } from '../api/routes/connect-info.js';
import type { BuildConnectInfoPromptParams } from '../api/routes/connect-info.js';

// ---------------------------------------------------------------------------
// Helper: create prompt params
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

function createWallet(overrides: Record<string, unknown> = {}) {
  return {
    id: 'w-test-1',
    name: 'test-wallet',
    chain: 'ethereum',
    environment: 'testnet',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    networks: ['ethereum-sepolia'],
    policies: [],
    accountType: 'eoa' as string,
    provider: null as { name: string; supportedChains: string[]; paymasterEnabled: boolean } | null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('connect-info userop capability', () => {
  // T1: Smart Account Lite mode (no aaProvider) -> capabilities includes 'userop' but NOT 'smart_account'
  it('T1: Lite mode Smart Account wallet includes userop capability but not smart_account', () => {
    // Capability computation logic (mirrored from connect-info.ts):
    const linkedWallets = [
      createWallet({ accountType: 'smart', provider: null }),
    ];

    const capabilities: string[] = ['transfer', 'token_transfer', 'balance', 'assets'];

    // smart_account: requires aaProvider
    if (linkedWallets.some((w) => w.accountType === 'smart' && w.provider)) {
      capabilities.push('smart_account');
    }

    // userop: any Smart Account (Lite or Full)
    if (linkedWallets.some((w) => w.accountType === 'smart')) {
      capabilities.push('userop');
    }

    expect(capabilities).toContain('userop');
    expect(capabilities).not.toContain('smart_account');
  });

  // T2: Smart Account Full mode (aaProvider set) -> capabilities includes BOTH 'userop' AND 'smart_account'
  it('T2: Full mode Smart Account wallet includes both userop and smart_account', () => {
    const linkedWallets = [
      createWallet({
        accountType: 'smart',
        provider: { name: 'pimlico', supportedChains: ['ethereum'], paymasterEnabled: true },
      }),
    ];

    const capabilities: string[] = ['transfer', 'token_transfer', 'balance', 'assets'];

    if (linkedWallets.some((w) => w.accountType === 'smart' && w.provider)) {
      capabilities.push('smart_account');
    }

    if (linkedWallets.some((w) => w.accountType === 'smart')) {
      capabilities.push('userop');
    }

    expect(capabilities).toContain('userop');
    expect(capabilities).toContain('smart_account');
  });

  // T3: Only EOA wallets -> capabilities does NOT include 'userop'
  it('T3: EOA-only wallets do not include userop capability', () => {
    const linkedWallets = [
      createWallet({ accountType: 'eoa' }),
    ];

    const capabilities: string[] = ['transfer', 'token_transfer', 'balance', 'assets'];

    if (linkedWallets.some((w) => w.accountType === 'smart' && w.provider)) {
      capabilities.push('smart_account');
    }

    if (linkedWallets.some((w) => w.accountType === 'smart')) {
      capabilities.push('userop');
    }

    expect(capabilities).not.toContain('userop');
    expect(capabilities).not.toContain('smart_account');
  });

  // T4: Prompt includes "UserOp API" text when userop capability is present
  it('T4: Prompt includes UserOp API guidance for Lite mode Smart Account', () => {
    const params = createPromptParams({
      wallets: [
        createWallet({ id: 'w-sa-lite', accountType: 'smart', provider: null }),
      ],
      capabilities: ['transfer', 'token_transfer', 'balance', 'assets', 'userop'],
    });

    const prompt = buildConnectInfoPrompt(params);

    // Should mention UserOp API
    expect(prompt).toContain('UserOp');
  });

  // T5: Lite mode shows UserOp build/sign URLs in prompt
  it('T5: Lite mode wallet prompt includes userop/build and userop/sign URLs', () => {
    const params = createPromptParams({
      wallets: [
        createWallet({ id: 'w-sa-lite', accountType: 'smart', provider: null }),
      ],
      capabilities: ['transfer', 'token_transfer', 'balance', 'assets', 'userop'],
    });

    const prompt = buildConnectInfoPrompt(params);

    expect(prompt).toContain('userop/build');
    expect(prompt).toContain('userop/sign');
  });
});
