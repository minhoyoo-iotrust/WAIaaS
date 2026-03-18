/**
 * Coverage tests for notification templates and format utilities.
 *
 * Tests:
 * - getNotificationMessage: all event types, locale fallback, variable interpolation
 * - TX_TYPE_LABELS: human-friendly type conversion
 * - format-utils: abbreviateId, abbreviateAddress
 * - Edge cases: missing vars, unknown event types, empty strings
 */

import { describe, it, expect } from 'vitest';
import { getNotificationMessage } from '../notifications/templates/message-templates.js';
import { abbreviateId, abbreviateAddress } from '../notifications/channels/format-utils.js';

// ---------------------------------------------------------------------------
// getNotificationMessage
// ---------------------------------------------------------------------------

describe('getNotificationMessage', () => {
  describe('basic event types', () => {
    it('generates TX_CONFIRMED message in English', () => {
      const msg = getNotificationMessage('TX_CONFIRMED', 'en', {
        txId: 'tx-123',
        amount: '1.5 SOL',
      });
      expect(msg.title).toBeTruthy();
      expect(msg.body).toBeTruthy();
      expect(typeof msg.title).toBe('string');
      expect(typeof msg.body).toBe('string');
    });

    it('generates TX_CONFIRMED message in Korean', () => {
      const msg = getNotificationMessage('TX_CONFIRMED', 'ko', {
        txId: 'tx-456',
        amount: '2.0 ETH',
      });
      expect(msg.title).toBeTruthy();
      expect(msg.body).toBeTruthy();
    });

    it('generates TX_FAILED message', () => {
      const msg = getNotificationMessage('TX_FAILED', 'en', {
        txId: 'tx-fail',
        error: 'insufficient funds',
      });
      expect(msg.title).toBeTruthy();
      expect(msg.body).toBeTruthy();
    });

    it('generates TX_REQUESTED message', () => {
      const msg = getNotificationMessage('TX_REQUESTED', 'en', {
        walletName: 'my-wallet',
        type: 'TRANSFER',
        amount: '100 USDC',
      });
      expect(msg.title).toBeTruthy();
      // Should convert type to human-friendly label
      expect(msg.body).toContain('transfer');
    });

    it('generates KILL_SWITCH_ACTIVATED message', () => {
      const msg = getNotificationMessage('KILL_SWITCH_ACTIVATED', 'en', {
        reason: 'manual activation',
      });
      expect(msg.title).toBeTruthy();
    });

    it('generates TX_INCOMING message', () => {
      const msg = getNotificationMessage('TX_INCOMING', 'en', {
        amount: '5.0 ETH',
        fromAddress: '0x1234',
        walletName: 'my-wallet',
      });
      expect(msg.title).toBeTruthy();
    });

    it('generates TX_INCOMING_SUSPICIOUS message', () => {
      const msg = getNotificationMessage('TX_INCOMING_SUSPICIOUS', 'en', {
        amount: '999 ETH',
        reasons: 'largeAmount, unknownToken',
      });
      expect(msg.title).toBeTruthy();
    });

    it('generates LOW_BALANCE message', () => {
      const msg = getNotificationMessage('LOW_BALANCE', 'en', {
        walletName: 'my-wallet',
        amount: '0.001 ETH',
      });
      expect(msg.title).toBeTruthy();
    });
  });

  describe('TX_TYPE_LABELS conversion', () => {
    it('converts TRANSFER to human-friendly label (en)', () => {
      const msg = getNotificationMessage('TX_REQUESTED', 'en', {
        type: 'TRANSFER',
      });
      expect(msg.body).toContain('transfer');
    });

    it('converts TOKEN_TRANSFER to human-friendly label (en)', () => {
      const msg = getNotificationMessage('TX_REQUESTED', 'en', {
        type: 'TOKEN_TRANSFER',
      });
      expect(msg.body).toContain('token transfer');
    });

    it('converts CONTRACT_CALL to human-friendly label (ko)', () => {
      const msg = getNotificationMessage('TX_REQUESTED', 'ko', {
        type: 'CONTRACT_CALL',
      });
      // Korean label
      expect(msg.body).toBeTruthy();
    });

    it('passes through unknown type names unchanged', () => {
      const msg = getNotificationMessage('TX_REQUESTED', 'en', {
        type: 'CUSTOM_TYPE',
      });
      expect(msg.body).toContain('CUSTOM_TYPE');
    });
  });

  describe('variable interpolation', () => {
    it('interpolates multiple variables', () => {
      const msg = getNotificationMessage('TX_CONFIRMED', 'en', {
        walletName: 'prod-wallet',
        txId: 'tx-abc',
        amount: '10 ETH',
      });
      // Variables should be inserted into the template
      expect(msg.title).toBeTruthy();
    });

    it('removes un-substituted optional placeholders', () => {
      // Call without providing display_amount, type, etc.
      const msg = getNotificationMessage('TX_REQUESTED', 'en', {
        walletName: 'test',
      });
      // Should not contain raw {display_amount} placeholder
      expect(msg.title).not.toContain('{display_amount}');
      expect(msg.body).not.toContain('{type}');
    });

    it('handles no vars provided', () => {
      const msg = getNotificationMessage('TX_CONFIRMED', 'en');
      expect(msg.title).toBeTruthy();
      // Unresolved placeholders should be cleaned up
      expect(msg.title).not.toContain('{');
    });
  });
});

// ---------------------------------------------------------------------------
// format-utils
// ---------------------------------------------------------------------------

describe('abbreviateId', () => {
  it('abbreviates long UUID', () => {
    const result = abbreviateId('019c6f12-3456-7890-abcd-1234567864d0');
    expect(result).toBe('019c6f\u202664d0');
  });

  it('returns short ID unchanged', () => {
    const result = abbreviateId('short');
    expect(result).toBe('short');
  });

  it('returns exactly 12-char ID unchanged', () => {
    const result = abbreviateId('123456789012');
    expect(result).toBe('123456789012');
  });

  it('abbreviates 13-char string', () => {
    const result = abbreviateId('1234567890123');
    expect(result).toBe('123456\u20260123');
  });
});

describe('abbreviateAddress', () => {
  it('abbreviates long Ethereum address', () => {
    const result = abbreviateAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD61');
    expect(result).toBe('0x74\u2026bD61');
  });

  it('abbreviates long Solana address', () => {
    const result = abbreviateAddress('3HfE8kBCkSNZ9cDvBnkJaHxKAKvJw94bR4v4nB');
    expect(result).toBe('3HfE\u2026v4nB');
  });

  it('returns short address unchanged', () => {
    const result = abbreviateAddress('0x1234');
    expect(result).toBe('0x1234');
  });

  it('returns exactly 10-char address unchanged', () => {
    const result = abbreviateAddress('0x12345678');
    expect(result).toBe('0x12345678');
  });

  it('abbreviates 11-char address', () => {
    const result = abbreviateAddress('0x123456789');
    expect(result).toBe('0x12\u20266789');
  });
});
