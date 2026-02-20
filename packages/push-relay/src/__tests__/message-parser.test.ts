import { describe, it, expect } from 'vitest';
import {
  determineMessageType,
  mapPriority,
  parseSignRequest,
  parseNotificationMessage,
  buildPushPayload,
} from '../subscriber/message-parser.js';
import type { SignRequest, NotificationMessage } from '@waiaas/core';

// ── Fixtures ──────────────────────────────────────────────────────────

function makeSignRequest(overrides?: Partial<SignRequest>): SignRequest {
  return {
    version: '1',
    requestId: '550e8400-e29b-41d4-a716-446655440000',
    chain: 'solana',
    network: 'devnet',
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
    responseChannel: {
      type: 'ntfy',
      responseTopic: 'resp-topic',
    },
    expiresAt: '2026-12-31T23:59:59Z',
    ...overrides,
  };
}

function encodeBase64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf-8').toString('base64url');
}

function makeNotificationMessage(overrides?: Partial<NotificationMessage>): NotificationMessage {
  return {
    version: '1',
    eventType: 'transaction.confirmed',
    walletId: 'wallet-1',
    walletName: 'dcent',
    category: 'transaction',
    title: 'Transaction Confirmed',
    body: 'Your transaction has been confirmed.',
    timestamp: 1700000000,
    ...overrides,
  };
}

// ── determineMessageType ──────────────────────────────────────────────

describe('determineMessageType', () => {
  it('returns sign_request for sign prefix topic', () => {
    expect(determineMessageType('waiaas-sign-dcent', 'waiaas-sign', 'waiaas-notify')).toBe(
      'sign_request',
    );
  });

  it('returns notification for notify prefix topic', () => {
    expect(determineMessageType('waiaas-notify-dcent', 'waiaas-sign', 'waiaas-notify')).toBe(
      'notification',
    );
  });

  it('returns null for unknown topic', () => {
    expect(determineMessageType('other-topic', 'waiaas-sign', 'waiaas-notify')).toBeNull();
  });
});

// ── mapPriority ───────────────────────────────────────────────────────

describe('mapPriority', () => {
  it('maps ntfy priority 5 to high', () => {
    expect(mapPriority(5)).toBe('high');
  });

  it('maps other priorities to normal', () => {
    expect(mapPriority(3)).toBe('normal');
    expect(mapPriority(1)).toBe('normal');
    expect(mapPriority(undefined)).toBe('normal');
  });
});

// ── parseSignRequest ──────────────────────────────────────────────────

describe('parseSignRequest', () => {
  it('decodes and validates base64url-encoded SignRequest', () => {
    const request = makeSignRequest();
    const encoded = encodeBase64url(request);
    const result = parseSignRequest(encoded);
    expect(result.requestId).toBe(request.requestId);
    expect(result.chain).toBe('solana');
    expect(result.displayMessage).toBe('Send 1 SOL');
  });

  it('throws on invalid JSON', () => {
    const encoded = Buffer.from('not json', 'utf-8').toString('base64url');
    expect(() => parseSignRequest(encoded)).toThrow();
  });

  it('throws on schema mismatch', () => {
    const encoded = encodeBase64url({ version: '2', bad: true });
    expect(() => parseSignRequest(encoded)).toThrow();
  });
});

// ── parseNotificationMessage ──────────────────────────────────────────

describe('parseNotificationMessage', () => {
  it('decodes and validates base64url-encoded NotificationMessage', () => {
    const msg = makeNotificationMessage();
    const encoded = encodeBase64url(msg);
    const result = parseNotificationMessage(encoded);
    expect(result.title).toBe('Transaction Confirmed');
    expect(result.category).toBe('transaction');
  });

  it('throws on invalid data', () => {
    const encoded = encodeBase64url({ invalid: true });
    expect(() => parseNotificationMessage(encoded)).toThrow();
  });
});

// ── buildPushPayload ──────────────────────────────────────────────────

describe('buildPushPayload', () => {
  it('builds sign_request payload with metadata fields', () => {
    const request = makeSignRequest();
    const encoded = encodeBase64url(request);
    const payload = buildPushPayload(
      { topic: 'waiaas-sign-dcent', message: encoded, title: 'Send 1 SOL', priority: 5 },
      'sign_request',
    );

    expect(payload.category).toBe('sign_request');
    expect(payload.title).toBe('Send 1 SOL');
    expect(payload.body).toContain('TRANSFER');
    expect(payload.body).toContain('1 SOL');
    expect(payload.priority).toBe('high');
    expect(payload.data['requestId']).toBe(request.requestId);
  });

  it('uses displayMessage as title fallback when ntfy title is absent', () => {
    const request = makeSignRequest({ displayMessage: 'Approve TX' });
    const encoded = encodeBase64url(request);
    const payload = buildPushPayload(
      { topic: 'waiaas-sign-dcent', message: encoded },
      'sign_request',
    );
    expect(payload.title).toBe('Approve TX');
  });

  it('builds notification payload', () => {
    const msg = makeNotificationMessage();
    const encoded = encodeBase64url(msg);
    const payload = buildPushPayload(
      { topic: 'waiaas-notify-dcent', message: encoded, priority: 3 },
      'notification',
    );

    expect(payload.category).toBe('notification');
    expect(payload.title).toBe('Transaction Confirmed');
    expect(payload.body).toBe('Your transaction has been confirmed.');
    expect(payload.priority).toBe('normal');
    expect(payload.data['walletName']).toBe('dcent');
  });
});
