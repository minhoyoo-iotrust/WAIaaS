/**
 * Tests for HyperliquidSigner: EIP-712 signing for L1 and User-Signed actions.
 *
 * @see HDESIGN-02: EIP-712 signing spec
 */
import { describe, it, expect } from 'vitest';
import { HyperliquidSigner, removeTrailingZeros, orderToWire } from '../signer.js';
import type { Hex } from 'viem';

// Test private key (DO NOT use in production)
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;

describe('HyperliquidSigner', () => {
  describe('removeTrailingZeros', () => {
    it('removes trailing zeros from decimal: "100.00" -> "100"', () => {
      expect(removeTrailingZeros('100.00')).toBe('100');
    });

    it('removes trailing zeros: "1.50" -> "1.5"', () => {
      expect(removeTrailingZeros('1.50')).toBe('1.5');
    });

    it('removes trailing zeros: "0.0010" -> "0.001"', () => {
      expect(removeTrailingZeros('0.0010')).toBe('0.001');
    });

    it('keeps integers unchanged: "10" -> "10"', () => {
      expect(removeTrailingZeros('10')).toBe('10');
    });

    it('handles "0.0" -> "0"', () => {
      expect(removeTrailingZeros('0.0')).toBe('0');
    });

    it('handles "1.0" -> "1"', () => {
      expect(removeTrailingZeros('1.0')).toBe('1');
    });

    it('handles no trailing zeros: "1.23" -> "1.23"', () => {
      expect(removeTrailingZeros('1.23')).toBe('1.23');
    });
  });

  describe('orderToWire', () => {
    it('creates wire format with canonical field order', () => {
      const wire = orderToWire(
        4, true, '2000.50', '1.0', false,
        { limit: { tif: 'GTC' } },
      );
      expect(wire.a).toBe(4);
      expect(wire.b).toBe(true);
      expect(wire.p).toBe('2000.5'); // trailing zero removed
      expect(wire.s).toBe('1'); // trailing zero removed
      expect(wire.r).toBe(false);
      expect(wire.t).toEqual({ limit: { tif: 'GTC' } });
      expect(wire.c).toBeUndefined();
    });

    it('includes cloid when provided', () => {
      const wire = orderToWire(
        0, false, '100', '5', true,
        { limit: { tif: 'IOC' } },
        '0x1234abcd',
      );
      expect(wire.c).toBe('0x1234abcd');
    });

    it('handles trigger order type', () => {
      const wire = orderToWire(
        2, true, '1800', '0.5', true,
        { trigger: { isMarket: true, triggerPx: '1800', tpsl: 'sl' } },
      );
      expect(wire.t).toEqual({
        trigger: { isMarket: true, triggerPx: '1800', tpsl: 'sl' },
      });
    });
  });

  describe('signL1Action', () => {
    it('produces valid {r, s, v} signature for mainnet', async () => {
      const action = orderToWire(
        4, true, '2000', '1', false,
        { limit: { tif: 'GTC' } },
      );

      const sig = await HyperliquidSigner.signL1Action(
        action as unknown as Record<string, unknown>,
        Date.now(),
        true, // mainnet
        TEST_PRIVATE_KEY,
      );

      expect(sig.r).toBeDefined();
      expect(sig.s).toBeDefined();
      expect(typeof sig.v).toBe('number');
      expect(sig.r.startsWith('0x')).toBe(true);
      expect(sig.s.startsWith('0x')).toBe(true);
      expect(sig.v === 27 || sig.v === 28).toBe(true);
    });

    it('produces valid signature for testnet', async () => {
      const action = { a: 0, b: true, p: '100', s: '1', r: false, t: { limit: { tif: 'GTC' } } };

      const sig = await HyperliquidSigner.signL1Action(
        action as unknown as Record<string, unknown>,
        1234567890,
        false, // testnet
        TEST_PRIVATE_KEY,
      );

      expect(sig.r).toBeDefined();
      expect(sig.s).toBeDefined();
      expect(sig.v === 27 || sig.v === 28).toBe(true);
    });

    it('produces different signatures for different actions', async () => {
      const nonce = Date.now();

      const sig1 = await HyperliquidSigner.signL1Action(
        { a: 4, b: true, p: '2000', s: '1', r: false, t: { limit: { tif: 'GTC' } } },
        nonce,
        true,
        TEST_PRIVATE_KEY,
      );

      const sig2 = await HyperliquidSigner.signL1Action(
        { a: 4, b: false, p: '2100', s: '2', r: false, t: { limit: { tif: 'GTC' } } },
        nonce,
        true,
        TEST_PRIVATE_KEY,
      );

      // Different actions should produce different signatures
      expect(sig1.r).not.toBe(sig2.r);
    });

    it('handles vaultAddress (sub-account)', async () => {
      const action = { a: 0, b: true, p: '100', s: '1', r: false, t: { limit: { tif: 'GTC' } } };

      const sig = await HyperliquidSigner.signL1Action(
        action as unknown as Record<string, unknown>,
        Date.now(),
        true,
        TEST_PRIVATE_KEY,
        '0x1234567890abcdef1234567890abcdef12345678' as Hex,
      );

      expect(sig.r).toBeDefined();
      expect(sig.v === 27 || sig.v === 28).toBe(true);
    });
  });

  describe('signUserSignedAction', () => {
    it('signs UsdClassTransfer action for mainnet', async () => {
      const sig = await HyperliquidSigner.signUserSignedAction(
        'UsdClassTransfer',
        {
          hyperliquidChain: 'Mainnet',
          amount: '100',
          toPerp: true,
          nonce: BigInt(Date.now()),
        },
        true,
        TEST_PRIVATE_KEY,
      );

      expect(sig.r).toBeDefined();
      expect(sig.s).toBeDefined();
      expect(sig.v === 27 || sig.v === 28).toBe(true);
    });

    it('signs UsdClassTransfer action for testnet', async () => {
      const sig = await HyperliquidSigner.signUserSignedAction(
        'UsdClassTransfer',
        {
          hyperliquidChain: 'Testnet',
          amount: '50',
          toPerp: false,
          nonce: BigInt(Date.now()),
        },
        false,
        TEST_PRIVATE_KEY,
      );

      expect(sig.r).toBeDefined();
      expect(sig.v === 27 || sig.v === 28).toBe(true);
    });

    it('throws for unknown action type', async () => {
      await expect(
        HyperliquidSigner.signUserSignedAction(
          'UnknownAction',
          { data: 'test' },
          true,
          TEST_PRIVATE_KEY,
        ),
      ).rejects.toThrow('Unknown user-signed action type: UnknownAction');
    });
  });
});
