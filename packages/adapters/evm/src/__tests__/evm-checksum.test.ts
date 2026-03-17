/**
 * EvmAdapter EIP-55 checksum normalization tests.
 *
 * Verifies that setAllowedTokens() normalizes token addresses
 * to proper EIP-55 checksum format, preventing multicall failures
 * caused by invalid checksum addresses.
 *
 * Issue #379: EVM token address EIP-55 checksum validation missing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EvmAdapter } from '../adapter.js';

// Mock viem module — we only need getAddress to be real
vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      chain: { id: 1 },
    })),
  };
});

describe('EvmAdapter EIP-55 checksum', () => {
  let adapter: EvmAdapter;

  beforeEach(() => {
    adapter = new EvmAdapter('ethereum-sepolia');
  });

  it('should normalize addresses with wrong checksum in setAllowedTokens()', () => {
    // Wrong checksum (the old PIM address from issue #379)
    const wrongChecksum = '0xFc3e86566895FB007c6A0D3809eB2827dF94f751';
    // Correct EIP-55 checksum
    const correctChecksum = '0xFC3e86566895Fb007c6A0d3809eb2827DF94F751';

    adapter.setAllowedTokens([
      { address: wrongChecksum, symbol: 'PIM', name: 'Pimlico Test Token', decimals: 6 },
    ]);

    // Access internal state to verify normalization
    const tokens = (adapter as unknown as { _allowedTokens: Array<{ address: string }> })._allowedTokens;
    expect(tokens[0]!.address).toBe(correctChecksum);
  });

  it('should normalize lowercase addresses to EIP-55 checksum', () => {
    const lowercase = '0xfc3e86566895fb007c6a0d3809eb2827df94f751';
    const correctChecksum = '0xFC3e86566895Fb007c6A0d3809eb2827DF94F751';

    adapter.setAllowedTokens([
      { address: lowercase, symbol: 'PIM', decimals: 6 },
    ]);

    const tokens = (adapter as unknown as { _allowedTokens: Array<{ address: string }> })._allowedTokens;
    expect(tokens[0]!.address).toBe(correctChecksum);
  });

  it('should pass through already-correct checksum addresses unchanged', () => {
    const correct = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC

    adapter.setAllowedTokens([
      { address: correct, symbol: 'USDC', decimals: 6 },
    ]);

    const tokens = (adapter as unknown as { _allowedTokens: Array<{ address: string }> })._allowedTokens;
    expect(tokens[0]!.address).toBe(correct);
  });

  it('should throw error for invalid address in setAllowedTokens()', () => {
    expect(() => {
      adapter.setAllowedTokens([
        { address: '0xinvalid', symbol: 'BAD', decimals: 18 },
      ]);
    }).toThrow();
  });

  it('should throw error for non-hex address in setAllowedTokens()', () => {
    expect(() => {
      adapter.setAllowedTokens([
        { address: 'not-an-address', symbol: 'BAD', decimals: 18 },
      ]);
    }).toThrow();
  });

  it('should normalize multiple tokens in a single call', () => {
    adapter.setAllowedTokens([
      { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC', decimals: 6 },
      { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT', decimals: 6 },
    ]);

    const tokens = (adapter as unknown as { _allowedTokens: Array<{ address: string }> })._allowedTokens;
    expect(tokens[0]!.address).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
    expect(tokens[1]!.address).toBe('0xdAC17F958D2ee523a2206206994597C13D831ec7');
  });
});
