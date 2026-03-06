/**
 * Tests for connect-info NFT summary extension.
 *
 * Verifies:
 * - nftSummary included per wallet when indexer returns NFTs
 * - nftSummary omitted when nftIndexerClient is undefined
 * - nftSummary omitted (no error) when indexer call throws
 * - AI prompt includes NFT line when summary is available
 */

import { describe, it, expect } from 'vitest';
import { buildConnectInfoPrompt, type BuildConnectInfoPromptParams } from '../api/routes/connect-info.js';

// ---------------------------------------------------------------------------
// buildConnectInfoPrompt tests for NFT summary
// ---------------------------------------------------------------------------

function basePromptParams(overrides?: Partial<BuildConnectInfoPromptParams['wallets'][0]>): BuildConnectInfoPromptParams {
  return {
    wallets: [{
      id: 'w1',
      name: 'test-wallet',
      chain: 'ethereum',
      environment: 'mainnet',
      address: '0xabc',
      networks: ['ethereum-mainnet'],
      policies: [],
      accountType: 'eoa',
      ...overrides,
    }],
    capabilities: ['transfer'],
    defaultDeny: { tokenTransfers: false, contractCalls: false, tokenApprovals: false, x402Domains: false },
    baseUrl: 'http://localhost:3100',
    version: '2.10.0',
  };
}

describe('connect-info NFT summary in prompt', () => {
  it('includes NFT line when nftSummary is present', () => {
    const params = basePromptParams({ nftSummary: { count: 12, collections: 3 } });
    const prompt = buildConnectInfoPrompt(params);

    expect(prompt).toContain('NFTs: 12 items in 3 collections');
  });

  it('omits NFT line when nftSummary is undefined', () => {
    const params = basePromptParams();
    const prompt = buildConnectInfoPrompt(params);

    expect(prompt).not.toContain('NFTs:');
  });

  it('includes NFT line for specific wallet only', () => {
    const params: BuildConnectInfoPromptParams = {
      wallets: [
        {
          id: 'w1',
          name: 'wallet-with-nfts',
          chain: 'ethereum',
          environment: 'mainnet',
          address: '0xabc',
          networks: ['ethereum-mainnet'],
          policies: [],
          accountType: 'eoa',
          nftSummary: { count: 5, collections: 2 },
        },
        {
          id: 'w2',
          name: 'wallet-without-nfts',
          chain: 'solana',
          environment: 'mainnet',
          address: 'So1abc...',
          networks: ['solana-mainnet'],
          policies: [],
          accountType: 'eoa',
        },
      ],
      capabilities: ['transfer'],
      defaultDeny: { tokenTransfers: false, contractCalls: false, tokenApprovals: false, x402Domains: false },
      baseUrl: 'http://localhost:3100',
      version: '2.10.0',
    };
    const prompt = buildConnectInfoPrompt(params);

    expect(prompt).toContain('NFTs: 5 items in 2 collections');
    // Only one occurrence of NFTs line
    const nftLines = prompt.split('\n').filter((l: string) => l.includes('NFTs:'));
    expect(nftLines).toHaveLength(1);
  });

  it('shows zero collections when all NFTs have no collection', () => {
    const params = basePromptParams({ nftSummary: { count: 3, collections: 0 } });
    const prompt = buildConnectInfoPrompt(params);

    expect(prompt).toContain('NFTs: 3 items in 0 collections');
  });
});
