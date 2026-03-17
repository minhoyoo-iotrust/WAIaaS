/**
 * Coverage tests for admin-monitoring.ts route helpers and exported functions.
 *
 * Tests:
 * - resolveContractFields with various type/address/network combinations
 * - buildConnectInfoPrompt helper
 */

import { describe, it, expect, vi } from 'vitest';
import { resolveContractFields } from '../api/routes/admin-monitoring.js';
import { buildConnectInfoPrompt } from '../api/routes/connect-info.js';

// ---------------------------------------------------------------------------
// resolveContractFields (extended coverage)
// ---------------------------------------------------------------------------

describe('resolveContractFields (monitoring patterns)', () => {
  it('handles APPROVE type (returns nulls)', () => {
    const result = resolveContractFields('APPROVE', '0x123', 'ethereum-mainnet', {} as any);
    expect(result.contractName).toBeNull();
  });

  it('handles TOKEN_TRANSFER type (returns nulls)', () => {
    const result = resolveContractFields('TOKEN_TRANSFER', '0x123', 'ethereum-mainnet', {} as any);
    expect(result.contractName).toBeNull();
  });

  it('handles CONTRACT_CALL with alchemy source', () => {
    const registry = {
      resolve: vi.fn().mockReturnValue({ name: 'Aave V3: Pool', source: 'alchemy' }),
    };
    const result = resolveContractFields('CONTRACT_CALL', '0xpool', 'ethereum-mainnet', registry as any);
    expect(result.contractName).toBe('Aave V3: Pool');
    expect(result.contractNameSource).toBe('alchemy');
  });

  it('handles BATCH type (returns nulls)', () => {
    const result = resolveContractFields('BATCH', '0x123', 'ethereum-mainnet', {} as any);
    expect(result.contractName).toBeNull();
  });

  it('handles CONTRACT_DEPLOY type (returns nulls)', () => {
    const result = resolveContractFields('CONTRACT_DEPLOY', null, 'ethereum-mainnet', {} as any);
    expect(result.contractName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildConnectInfoPrompt
// ---------------------------------------------------------------------------

describe('buildConnectInfoPrompt', () => {
  const makeWallet = (overrides: Record<string, any> = {}) => ({
    id: 'w-123',
    name: 'my-wallet',
    chain: 'solana',
    address: 'SomePublicKey123',
    networks: ['solana-mainnet'],
    environment: 'mainnet',
    accountType: 'eoa',
    policies: [],
    ...overrides,
  });

  const defaultDeny = {
    tokenTransfers: false,
    contractCalls: false,
    tokenApprovals: false,
    x402Domains: false,
  };

  it('generates prompt with wallet info', () => {
    const prompt = buildConnectInfoPrompt({
      wallets: [makeWallet()],
      capabilities: [],
      defaultDeny,
      baseUrl: 'http://localhost:3000',
      version: '2.0.0',
    });

    expect(prompt).toContain('my-wallet');
    expect(prompt).toContain('solana');
    expect(prompt).toContain('SomePublicKey123');
    expect(prompt).toContain('2.0.0');
  });

  it('generates prompt with EVM wallet and multiple networks', () => {
    const prompt = buildConnectInfoPrompt({
      wallets: [makeWallet({
        id: 'w-456',
        name: 'eth-wallet',
        chain: 'ethereum',
        address: '0x742d35Cc',
        networks: ['ethereum-mainnet', 'polygon-mainnet'],
      })],
      capabilities: ['userop'],
      defaultDeny,
      baseUrl: 'http://localhost:3000',
      version: '2.0.0',
    });

    expect(prompt).toContain('eth-wallet');
    expect(prompt).toContain('ethereum');
  });

  it('includes default-deny info when active', () => {
    const prompt = buildConnectInfoPrompt({
      wallets: [makeWallet()],
      capabilities: [],
      defaultDeny: {
        tokenTransfers: true,
        contractCalls: true,
        tokenApprovals: false,
        x402Domains: false,
      },
      baseUrl: 'http://localhost:3000',
      version: '2.0.0',
    });

    expect(prompt).toContain('default-deny');
  });

  it('handles multiple wallets', () => {
    const prompt = buildConnectInfoPrompt({
      wallets: [
        makeWallet({ id: 'w1', name: 'sol-wallet' }),
        makeWallet({ id: 'w2', name: 'eth-wallet', chain: 'ethereum' }),
      ],
      capabilities: [],
      defaultDeny,
      baseUrl: 'http://localhost:3000',
      version: '2.0.0',
    });

    expect(prompt).toContain('sol-wallet');
    expect(prompt).toContain('eth-wallet');
    expect(prompt).toContain('2 wallet(s)');
  });

  it('shows policy summary when policies exist', () => {
    const prompt = buildConnectInfoPrompt({
      wallets: [makeWallet({
        policies: [{ type: 'SPENDING_LIMIT' }, { type: 'ALLOWED_TOKENS' }],
      })],
      capabilities: [],
      defaultDeny,
      baseUrl: 'http://localhost:3000',
      version: '2.0.0',
    });

    expect(prompt).toContain('SPENDING_LIMIT');
    expect(prompt).toContain('ALLOWED_TOKENS');
  });
});
