/**
 * DCent Currency Mapper unit tests.
 *
 * Tests bidirectional conversion between CAIP-19 asset identifiers
 * and DCent Currency IDs, including edge cases and error handling.
 */
import { describe, it, expect } from 'vitest';
import { caip19ToDcentId, dcentIdToCaip19 } from '../providers/dcent-swap/currency-mapper.js';
import { ChainError } from '@waiaas/core';

const SOLANA_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

describe('dcent-currency-mapper', () => {
  // -----------------------------------------------------------------------
  // caip19ToDcentId
  // -----------------------------------------------------------------------
  describe('caip19ToDcentId', () => {
    describe('EVM native tokens', () => {
      it('converts Ethereum native', () => {
        expect(caip19ToDcentId('eip155:1/slip44:60')).toBe('ETHEREUM');
      });

      it('converts BSC native', () => {
        expect(caip19ToDcentId('eip155:56/slip44:60')).toBe('BSC');
      });

      it('converts Polygon native (slip44:966)', () => {
        expect(caip19ToDcentId('eip155:137/slip44:966')).toBe('POLYGON');
      });

      it('converts Klaytn native', () => {
        expect(caip19ToDcentId('eip155:8217/slip44:60')).toBe('KLAYTN');
      });
    });

    describe('CHAN chains (EVM native, non-well-known)', () => {
      it('converts Optimism to CHAN:10', () => {
        expect(caip19ToDcentId('eip155:10/slip44:60')).toBe('CHAN:10');
      });

      it('converts Base to CHAN:8453', () => {
        expect(caip19ToDcentId('eip155:8453/slip44:60')).toBe('CHAN:8453');
      });

      it('converts Arbitrum to CHAN:42161', () => {
        expect(caip19ToDcentId('eip155:42161/slip44:60')).toBe('CHAN:42161');
      });

      it('converts unknown EVM chain to CHAN format', () => {
        expect(caip19ToDcentId('eip155:999/slip44:60')).toBe('CHAN:999');
      });
    });

    describe('EVM tokens', () => {
      it('converts Ethereum ERC-20 to ERC20/ prefix', () => {
        expect(caip19ToDcentId('eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'))
          .toBe('ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
      });

      it('converts BSC token to BEP20/ prefix', () => {
        expect(caip19ToDcentId('eip155:56/erc20:0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d'))
          .toBe('BEP20/0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d');
      });

      it('converts Polygon token to POLYGON-ERC20/ prefix', () => {
        expect(caip19ToDcentId('eip155:137/erc20:0x2791bca1f2de4661ed88a30c99a7a9449aa84174'))
          .toBe('POLYGON-ERC20/0x2791bca1f2de4661ed88a30c99a7a9449aa84174');
      });

      it('converts Klaytn token to KLAYTN-ERC20/ prefix', () => {
        expect(caip19ToDcentId('eip155:8217/erc20:0xceE8FAF64bB97a73bb51E115Aa89C17FfA8dD167'))
          .toBe('KLAYTN-ERC20/0xceE8FAF64bB97a73bb51E115Aa89C17FfA8dD167');
      });

      it('converts Optimism token to CH20:10/ prefix', () => {
        expect(caip19ToDcentId('eip155:10/erc20:0x7f5c764cbc14f9669b88837ca1490cca17c31607'))
          .toBe('CH20:10/0x7f5c764cbc14f9669b88837ca1490cca17c31607');
      });

      it('converts Base token to CH20:8453/ prefix', () => {
        expect(caip19ToDcentId('eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'))
          .toBe('CH20:8453/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
      });
    });

    describe('Solana', () => {
      it('converts Solana native', () => {
        expect(caip19ToDcentId(`${SOLANA_CAIP2}/slip44:501`)).toBe('SOLANA');
      });

      it('converts Solana SPL token (token: namespace)', () => {
        expect(caip19ToDcentId(`${SOLANA_CAIP2}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`))
          .toBe('SPL-TOKEN/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      });
    });

    describe('errors', () => {
      it('throws on invalid CAIP-19 format', () => {
        expect(() => caip19ToDcentId('invalid')).toThrow();
      });
    });
  });

  // -----------------------------------------------------------------------
  // dcentIdToCaip19
  // -----------------------------------------------------------------------
  describe('dcentIdToCaip19', () => {
    describe('named natives', () => {
      it('converts ETHEREUM', () => {
        expect(dcentIdToCaip19('ETHEREUM')).toBe('eip155:1/slip44:60');
      });

      it('converts BSC', () => {
        expect(dcentIdToCaip19('BSC')).toBe('eip155:56/slip44:60');
      });

      it('converts POLYGON with slip44:966', () => {
        expect(dcentIdToCaip19('POLYGON')).toBe('eip155:137/slip44:966');
      });

      it('converts KLAYTN', () => {
        expect(dcentIdToCaip19('KLAYTN')).toBe('eip155:8217/slip44:60');
      });

      it('converts XINFIN', () => {
        expect(dcentIdToCaip19('XINFIN')).toBe('eip155:50/slip44:60');
      });

      it('converts SOLANA', () => {
        expect(dcentIdToCaip19('SOLANA')).toBe(`${SOLANA_CAIP2}/slip44:501`);
      });
    });

    describe('CHAN chains', () => {
      it('converts CHAN:10 (Optimism)', () => {
        expect(dcentIdToCaip19('CHAN:10')).toBe('eip155:10/slip44:60');
      });

      it('converts CHAN:8453 (Base)', () => {
        expect(dcentIdToCaip19('CHAN:8453')).toBe('eip155:8453/slip44:60');
      });

      it('converts CHAN:42161 (Arbitrum)', () => {
        expect(dcentIdToCaip19('CHAN:42161')).toBe('eip155:42161/slip44:60');
      });
    });

    describe('EVM tokens', () => {
      it('converts ERC20/ to eip155:1 erc20', () => {
        expect(dcentIdToCaip19('ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'))
          .toBe('eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
      });

      it('converts BEP20/ to eip155:56 erc20', () => {
        expect(dcentIdToCaip19('BEP20/0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d'))
          .toBe('eip155:56/erc20:0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d');
      });

      it('converts POLYGON-ERC20/ to eip155:137 erc20', () => {
        expect(dcentIdToCaip19('POLYGON-ERC20/0x2791bca1f2de4661ed88a30c99a7a9449aa84174'))
          .toBe('eip155:137/erc20:0x2791bca1f2de4661ed88a30c99a7a9449aa84174');
      });

      it('converts KLAYTN-ERC20/ to eip155:8217 erc20', () => {
        expect(dcentIdToCaip19('KLAYTN-ERC20/0xceE8FAF64bB97a73bb51E115Aa89C17FfA8dD167'))
          .toBe('eip155:8217/erc20:0xceE8FAF64bB97a73bb51E115Aa89C17FfA8dD167');
      });

      it('converts CH20:10/ to eip155:10 erc20', () => {
        expect(dcentIdToCaip19('CH20:10/0x7f5c764cbc14f9669b88837ca1490cca17c31607'))
          .toBe('eip155:10/erc20:0x7f5c764cbc14f9669b88837ca1490cca17c31607');
      });

      it('converts CH20:8453/ to eip155:8453 erc20', () => {
        expect(dcentIdToCaip19('CH20:8453/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'))
          .toBe('eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
      });
    });

    describe('Solana SPL tokens', () => {
      it('converts SPL-TOKEN/ to solana token namespace', () => {
        expect(dcentIdToCaip19('SPL-TOKEN/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'))
          .toBe(`${SOLANA_CAIP2}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`);
      });
    });

    describe('errors', () => {
      it('throws on unknown DCent ID', () => {
        expect(() => dcentIdToCaip19('UNKNOWN_CHAIN')).toThrow(ChainError);
      });

      it('throws on malformed CH20 (no slash)', () => {
        expect(() => dcentIdToCaip19('CH20:10')).toThrow(ChainError);
      });
    });
  });

  // -----------------------------------------------------------------------
  // Round-trip
  // -----------------------------------------------------------------------
  describe('round-trip', () => {
    const ROUND_TRIP_CASES: [string, string][] = [
      ['eip155:1/slip44:60', 'ETHEREUM'],
      ['eip155:56/slip44:60', 'BSC'],
      ['eip155:137/slip44:966', 'POLYGON'],
      ['eip155:8217/slip44:60', 'KLAYTN'],
      ['eip155:10/slip44:60', 'CHAN:10'],
      ['eip155:8453/slip44:60', 'CHAN:8453'],
      ['eip155:42161/slip44:60', 'CHAN:42161'],
      [`${SOLANA_CAIP2}/slip44:501`, 'SOLANA'],
      ['eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'],
      ['eip155:56/erc20:0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', 'BEP20/0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d'],
      ['eip155:137/erc20:0x2791bca1f2de4661ed88a30c99a7a9449aa84174', 'POLYGON-ERC20/0x2791bca1f2de4661ed88a30c99a7a9449aa84174'],
      ['eip155:10/erc20:0x7f5c764cbc14f9669b88837ca1490cca17c31607', 'CH20:10/0x7f5c764cbc14f9669b88837ca1490cca17c31607'],
      [`${SOLANA_CAIP2}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, 'SPL-TOKEN/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'],
    ];

    it.each(ROUND_TRIP_CASES)(
      'CAIP-19 %s <-> DCent %s',
      (caip19, dcentId) => {
        // Forward
        expect(caip19ToDcentId(caip19)).toBe(dcentId);
        // Reverse
        expect(dcentIdToCaip19(dcentId)).toBe(caip19);
        // Round-trip
        expect(dcentIdToCaip19(caip19ToDcentId(caip19))).toBe(caip19);
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Error path coverage: caip19ToDcentId
// ---------------------------------------------------------------------------

describe('caip19ToDcentId error paths', () => {
  it('throws for unsupported Solana asset namespace', () => {
    // erc721 is not a valid Solana namespace
    expect(() =>
      caip19ToDcentId('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/erc721:SomeNft123'),
    ).toThrow('Unsupported Solana asset namespace');
  });

  it('throws for unsupported EVM asset namespace (erc721)', () => {
    expect(() =>
      caip19ToDcentId('eip155:1/erc721:0x1234567890abcdef1234567890abcdef12345678'),
    ).toThrow('Unsupported EVM asset namespace');
  });

  it('throws for unsupported chain namespace', () => {
    expect(() =>
      caip19ToDcentId('cosmos:cosmoshub-4/slip44:118'),
    ).toThrow('Unsupported chain namespace for DCent conversion');
  });
});
