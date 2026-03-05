/**
 * Tests for provider status in connect-info prompt.
 *
 * Verifies buildConnectInfoPrompt includes provider info for smart account wallets
 * and omits it for EOA wallets.
 */

import { describe, it, expect } from 'vitest';
import { buildConnectInfoPrompt, type BuildConnectInfoPromptParams } from '../api/routes/connect-info.js';

const baseParams: BuildConnectInfoPromptParams = {
  wallets: [],
  capabilities: ['transfer', 'balance'],
  defaultDeny: { tokenTransfers: false, contractCalls: false, tokenApprovals: false, x402Domains: false },
  baseUrl: 'http://localhost:3100',
  version: '2.9.0',
};

describe('buildConnectInfoPrompt - provider info', () => {
  it('includes provider info for smart account wallet with provider', () => {
    const params: BuildConnectInfoPromptParams = {
      ...baseParams,
      wallets: [
        {
          id: 'w1',
          name: 'smart-bot',
          chain: 'ethereum',
          environment: 'testnet',
          address: '0xabc',
          networks: ['ethereum-sepolia'],
          policies: [],
          accountType: 'smart',
          provider: { name: 'pimlico', supportedChains: ['ethereum-mainnet', 'ethereum-sepolia'], paymasterEnabled: true },
        },
      ],
    };

    const prompt = buildConnectInfoPrompt(params);

    expect(prompt).toContain('Smart Account: pimlico provider');
    expect(prompt).toContain('Gas Sponsorship: ENABLED (paymaster active)');
    expect(prompt).toContain('Provider Chains: ethereum-mainnet, ethereum-sepolia');
  });

  it('shows "No provider configured" for smart account without provider', () => {
    const params: BuildConnectInfoPromptParams = {
      ...baseParams,
      wallets: [
        {
          id: 'w2',
          name: 'no-provider',
          chain: 'ethereum',
          environment: 'testnet',
          address: '0xdef',
          networks: ['ethereum-sepolia'],
          policies: [],
          accountType: 'smart',
          provider: null,
        },
      ],
    };

    const prompt = buildConnectInfoPrompt(params);

    expect(prompt).toContain('Smart Account: No provider configured (gas sponsorship unavailable)');
    expect(prompt).not.toContain('Gas Sponsorship:');
  });

  it('omits provider section for EOA wallet', () => {
    const params: BuildConnectInfoPromptParams = {
      ...baseParams,
      wallets: [
        {
          id: 'w3',
          name: 'eoa-wallet',
          chain: 'ethereum',
          environment: 'testnet',
          address: '0x789',
          networks: ['ethereum-sepolia'],
          policies: [],
          accountType: 'eoa',
        },
      ],
    };

    const prompt = buildConnectInfoPrompt(params);

    expect(prompt).not.toContain('Smart Account:');
    expect(prompt).not.toContain('Gas Sponsorship:');
    expect(prompt).not.toContain('Provider Chains:');
  });

  it('shows Gas Sponsorship DISABLED when paymasterEnabled is false', () => {
    const params: BuildConnectInfoPromptParams = {
      ...baseParams,
      wallets: [
        {
          id: 'w4',
          name: 'custom-bot',
          chain: 'ethereum',
          environment: 'testnet',
          address: '0xghi',
          networks: ['ethereum-sepolia'],
          policies: [],
          accountType: 'smart',
          provider: { name: 'custom', supportedChains: [], paymasterEnabled: false },
        },
      ],
    };

    const prompt = buildConnectInfoPrompt(params);

    expect(prompt).toContain('Smart Account: custom provider');
    expect(prompt).toContain('Gas Sponsorship: DISABLED');
    expect(prompt).not.toContain('ENABLED');
  });
});
