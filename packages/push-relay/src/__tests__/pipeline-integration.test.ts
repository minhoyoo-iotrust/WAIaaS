import { describe, it, expect } from 'vitest';
import { buildPushPayload } from '../subscriber/message-parser.js';
import { ConfigurablePayloadTransformer } from '../transformer/payload-transformer.js';
import type { ParsedNtfyMessage } from '../subscriber/message-parser.js';

// ── Fixtures ──────────────────────────────────────────────────────────

function encodeBase64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf-8').toString('base64url');
}

const validSignRequest = {
  version: '1',
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  caip2ChainId: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  networkName: 'solana-devnet',
  signerAddress: 'OwnerSolanaAddress1234567890abcdef',
  message: 'base64tx',
  displayMessage: 'Send 1 SOL',
  metadata: {
    txId: '550e8400-e29b-41d4-a716-446655440001',
    type: 'TRANSFER',
    from: 'sender',
    to: 'receiver',
    amount: '1',
    symbol: 'SOL',
    policyTier: 'APPROVAL',
  },
  responseChannel: { type: 'ntfy', responseTopic: 'resp-topic' },
  expiresAt: '2026-12-31T23:59:59Z',
};

const validNotification = {
  version: '1',
  eventType: 'transaction.confirmed',
  walletId: 'wallet-1',
  walletName: 'dcent',
  category: 'transaction',
  title: 'Transaction Confirmed',
  body: 'Your transaction has been confirmed.',
  timestamp: 1700000000,
};

// ── Tests ─────────────────────────────────────────────────────────────

describe('Pipeline Integration', () => {
  it('full pipeline: ntfy message -> buildPushPayload -> transformer -> final payload', () => {
    const ntfyMsg: ParsedNtfyMessage = {
      topic: 'sign-dcent',
      message: encodeBase64url(validSignRequest),
      title: 'Sign Request',
      priority: 5,
    };

    const transformer = new ConfigurablePayloadTransformer({
      static_fields: { app_id: 'com.dcent.wallet', env: 'production' },
      category_map: {
        sign_request: { sound: 'alert.caf', badge: '1' },
      },
    });

    const rawPayload = buildPushPayload(ntfyMsg, 'sign_request');
    const finalPayload = transformer.transform(rawPayload);

    // Static fields injected
    expect(finalPayload.data.app_id).toBe('com.dcent.wallet');
    expect(finalPayload.data.env).toBe('production');
    // Category map fields injected
    expect(finalPayload.data.sound).toBe('alert.caf');
    expect(finalPayload.data.badge).toBe('1');
    // Original data preserved
    expect(finalPayload.data.requestId).toBe(validSignRequest.requestId);
    expect(finalPayload.category).toBe('sign_request');
    expect(finalPayload.priority).toBe('high');
  });

  it('full pipeline: bypass when no transformer', () => {
    const ntfyMsg: ParsedNtfyMessage = {
      topic: 'sign-dcent',
      message: encodeBase64url(validSignRequest),
      title: 'Sign Request',
      priority: 5,
    };

    const rawPayload = buildPushPayload(ntfyMsg, 'sign_request');

    // Without transformer, payload is unchanged
    expect(rawPayload.data).not.toHaveProperty('app_id');
    expect(rawPayload.data).not.toHaveProperty('sound');
    expect(rawPayload.data.requestId).toBe(validSignRequest.requestId);
    expect(rawPayload.category).toBe('sign_request');
  });

  it('transformer preserves original payload fields (title, body, priority)', () => {
    const ntfyMsg: ParsedNtfyMessage = {
      topic: 'notify-dcent',
      message: encodeBase64url(validNotification),
      title: 'Notification',
      priority: 3,
    };

    const transformer = new ConfigurablePayloadTransformer({
      static_fields: { app_id: 'com.dcent.wallet' },
      category_map: {
        notification: { sound: 'default' },
      },
    });

    const rawPayload = buildPushPayload(ntfyMsg, 'notification');
    const finalPayload = transformer.transform(rawPayload);

    // Top-level fields preserved
    expect(finalPayload.title).toBe(validNotification.title);
    expect(finalPayload.body).toBe(validNotification.body);
    expect(finalPayload.category).toBe('notification');
    expect(finalPayload.priority).toBe('normal');
    // Transformer fields injected into data only
    expect(finalPayload.data.app_id).toBe('com.dcent.wallet');
    expect(finalPayload.data.sound).toBe('default');
  });

  it('original data keys take precedence over static_fields and category_map', () => {
    const ntfyMsg: ParsedNtfyMessage = {
      topic: 'sign-dcent',
      message: encodeBase64url(validSignRequest),
      title: 'Sign Request',
      priority: 5,
    };

    const transformer = new ConfigurablePayloadTransformer({
      // requestId exists in original data — should NOT be overwritten
      static_fields: { requestId: 'should-not-overwrite' },
      category_map: {
        sign_request: { requestId: 'also-should-not-overwrite' },
      },
    });

    const rawPayload = buildPushPayload(ntfyMsg, 'sign_request');
    const finalPayload = transformer.transform(rawPayload);

    // Original data takes precedence
    expect(finalPayload.data.requestId).toBe(validSignRequest.requestId);
  });
});
