/**
 * Tests for ApiDirectResult type, isApiDirectResult guard,
 * and extended ActionProviderMetadata/ActionContext schemas.
 *
 * @see HDESIGN-01: ApiDirectResult pattern for API-based trading
 */
import { describe, it, expect } from 'vitest';
import {
  isApiDirectResult,
  ActionProviderMetadataSchema,
  ActionContextSchema,
} from '../interfaces/action-provider.types.js';

describe('ApiDirectResult', () => {
  describe('isApiDirectResult()', () => {
    it('returns true for valid ApiDirectResult object', () => {
      const result = {
        __apiDirect: true,
        externalId: 'order-123',
        status: 'success' as const,
        provider: 'hyperliquid_perp',
        action: 'hl_open_position',
        data: { oid: 12345 },
      };
      expect(isApiDirectResult(result)).toBe(true);
    });

    it('returns true with optional metadata field', () => {
      const result = {
        __apiDirect: true,
        externalId: 'order-456',
        status: 'pending' as const,
        provider: 'test_provider',
        action: 'test_action',
        data: {},
        metadata: { market: 'ETH', side: 'BUY', size: '1.0', price: '2000' },
      };
      expect(isApiDirectResult(result)).toBe(true);
    });

    it('returns true for partial status', () => {
      const result = {
        __apiDirect: true,
        externalId: 'x',
        status: 'partial' as const,
        provider: 'test',
        action: 'act',
        data: {},
      };
      expect(isApiDirectResult(result)).toBe(true);
    });

    it('returns false for ContractCallRequest-like object', () => {
      const result = { type: 'CONTRACT_CALL', to: '0x123', data: '0x' };
      expect(isApiDirectResult(result)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isApiDirectResult(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isApiDirectResult(undefined)).toBe(false);
    });

    it('returns false when __apiDirect is false', () => {
      expect(isApiDirectResult({ __apiDirect: false })).toBe(false);
    });

    it('returns false for primitive values', () => {
      expect(isApiDirectResult(42)).toBe(false);
      expect(isApiDirectResult('string')).toBe(false);
      expect(isApiDirectResult(true)).toBe(false);
    });

    it('returns false for arrays', () => {
      expect(isApiDirectResult([])).toBe(false);
      expect(isApiDirectResult([{ __apiDirect: true }])).toBe(false);
    });
  });

  describe('ActionProviderMetadataSchema with requiresSigningKey', () => {
    it('parses with requiresSigningKey: true', () => {
      const metadata = ActionProviderMetadataSchema.parse({
        name: 'hyperliquid_perp',
        description: 'Hyperliquid Perpetual Futures trading provider',
        version: '1.0.0',
        chains: ['ethereum'],
        mcpExpose: true,
        requiresSigningKey: true,
      });
      expect(metadata.requiresSigningKey).toBe(true);
    });

    it('defaults requiresSigningKey to false when omitted', () => {
      const metadata = ActionProviderMetadataSchema.parse({
        name: 'test_provider',
        description: 'A test provider for validation',
        version: '1.0.0',
        chains: ['ethereum'],
      });
      expect(metadata.requiresSigningKey).toBe(false);
    });

    it('parses with requiresSigningKey: false', () => {
      const metadata = ActionProviderMetadataSchema.parse({
        name: 'other_provider',
        description: 'Another test provider for validation',
        version: '2.0.0',
        chains: ['solana'],
        requiresSigningKey: false,
      });
      expect(metadata.requiresSigningKey).toBe(false);
    });
  });

  describe('ActionContextSchema with privateKey', () => {
    it('parses with privateKey field', () => {
      const context = ActionContextSchema.parse({
        walletAddress: '0x1234567890abcdef',
        chain: 'ethereum',
        walletId: 'wallet-1',
        privateKey: '0xdeadbeef',
      });
      expect(context.privateKey).toBe('0xdeadbeef');
    });

    it('parses without privateKey field (optional)', () => {
      const context = ActionContextSchema.parse({
        walletAddress: '0x1234567890abcdef',
        chain: 'ethereum',
        walletId: 'wallet-2',
      });
      expect(context.privateKey).toBeUndefined();
    });

    it('parses with both privateKey and sessionId', () => {
      const context = ActionContextSchema.parse({
        walletAddress: '0xabc',
        chain: 'ethereum',
        walletId: 'w-1',
        sessionId: 'session-123',
        privateKey: '0x0123456789',
      });
      expect(context.privateKey).toBe('0x0123456789');
      expect(context.sessionId).toBe('session-123');
    });
  });
});
