/**
 * Tests for Signing Protocol v1 Zod schemas and utilities.
 *
 * Tests cover:
 * 1. SignRequestSchema parse/reject
 * 2. SignResponseSchema parse/reject
 * 3. WalletLinkConfigSchema parse/reject
 * 4. ApprovalMethodSchema with 5 valid values
 * 5. encodeSignRequest / decodeSignRequest round-trip
 * 6. buildUniversalLinkUrl correct format
 * 7. ResponseChannel discriminatedUnion (ntfy / telegram)
 * 8. SIGNING domain error codes exist and WAIaaSError works
 */

import { describe, it, expect } from 'vitest';
import {
  SignRequestSchema,
  SignResponseSchema,
  WalletLinkConfigSchema,
  ApprovalMethodSchema,
  APPROVAL_METHODS,
  ResponseChannelSchema,
  SignRequestMetadataSchema,
  encodeSignRequest,
  decodeSignRequest,
  buildUniversalLinkUrl,
  WAIaaSError,
  ERROR_CODES,
  EVENT_CATEGORY_MAP,
  NOTIFICATION_CATEGORIES,
  NotificationMessageSchema,
} from '../index.js';
import { NOTIFICATION_EVENT_TYPES } from '../enums/notification.js';
import type {
  SignRequest,
  SignResponse,
  WalletLinkConfig,
} from '../index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validMetadata = {
  txId: '01935a3b-7c8d-7e00-b123-456789abcdef',
  type: 'TRANSFER',
  from: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  to: 'GsbwXfJraMomNxBcjYLcG3mxkBUiyWXAB32fGbSQQRJe',
  amount: '1.5',
  symbol: 'SOL',
  policyTier: 'APPROVAL' as const,
};

const validSignRequest: SignRequest = {
  version: '1',
  requestId: '01935a3b-7c8d-7e00-b123-456789abcdef',
  caip2ChainId: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  networkName: 'solana-devnet',
  signerAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  message: 'V0FJYWFTIFNpZ25pbmcgUmVxdWVzdA==',
  displayMessage: 'Transfer 1.5 SOL to GsbwXf...',
  metadata: validMetadata,
  responseChannel: {
    type: 'push_relay',
    pushRelayUrl: 'https://relay.example.com',
    requestId: '01935a3b-7c8d-7e00-b123-456789abcdef',
  },
  expiresAt: '2026-03-01T00:00:00Z',
};

const validSignResponse: SignResponse = {
  version: '1',
  requestId: '01935a3b-7c8d-7e00-b123-456789abcdef',
  action: 'approve',
  signature: 'base64-signature-data',
  signerAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  signedAt: '2026-03-01T00:05:00Z',
};

const validWalletLinkConfig: WalletLinkConfig = {
  name: 'dcent',
  displayName: "D'CENT Wallet",
  universalLink: {
    base: 'https://link.dcentwallet.com',
    signPath: '/waiaas/sign',
  },
  deepLink: {
    scheme: 'dcent-wallet',
    signPath: '/waiaas/sign',
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SignRequestSchema', () => {
  it('parses a valid SignRequest', () => {
    const result = SignRequestSchema.parse(validSignRequest);
    expect(result.version).toBe('1');
    expect(result.requestId).toBe('01935a3b-7c8d-7e00-b123-456789abcdef');
    expect(result.caip2ChainId).toBe('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
    expect(result.networkName).toBe('solana-devnet');
    expect(result.responseChannel.type).toBe('push_relay');
    expect(result.metadata.policyTier).toBe('APPROVAL');
  });

  it('parses a SignRequest with telegram response channel', () => {
    const telegramRequest = {
      ...validSignRequest,
      responseChannel: {
        type: 'telegram' as const,
        botUsername: 'waiaas_bot',
      },
    };
    const result = SignRequestSchema.parse(telegramRequest);
    expect(result.responseChannel.type).toBe('telegram');
    if (result.responseChannel.type === 'telegram') {
      expect(result.responseChannel.botUsername).toBe('waiaas_bot');
    }
  });

  it('parses a SignRequest with EVM CAIP-2 chain ID', () => {
    const evmRequest = {
      ...validSignRequest,
      caip2ChainId: 'eip155:1',
      networkName: 'ethereum-mainnet',
      signerAddress: '0x1234567890abcdef1234567890abcdef12345678',
    };
    const result = SignRequestSchema.parse(evmRequest);
    expect(result.caip2ChainId).toBe('eip155:1');
    expect(result.networkName).toBe('ethereum-mainnet');
  });

  it('rejects invalid version', () => {
    expect(() =>
      SignRequestSchema.parse({ ...validSignRequest, version: '2' }),
    ).toThrow();
  });

  it('rejects missing required fields', () => {
    const { message: _msg, ...noMessage } = validSignRequest;
    expect(() => SignRequestSchema.parse(noMessage)).toThrow();
  });

  it('rejects invalid expiresAt format', () => {
    expect(() =>
      SignRequestSchema.parse({ ...validSignRequest, expiresAt: 'not-a-date' }),
    ).toThrow();
  });

  it('accepts metadata without optional amount and symbol', () => {
    const metadataWithoutOptionals = {
      ...validSignRequest,
      metadata: {
        txId: '01935a3b-7c8d-7e00-b123-456789abcdef',
        type: 'CONTRACT_CALL',
        from: '0x1234567890abcdef1234567890abcdef12345678',
        to: '0xabcdef1234567890abcdef1234567890abcdef12',
        policyTier: 'DELAY' as const,
      },
    };
    const result = SignRequestSchema.parse(metadataWithoutOptionals);
    expect(result.metadata.amount).toBeUndefined();
    expect(result.metadata.symbol).toBeUndefined();
    expect(result.metadata.policyTier).toBe('DELAY');
  });
});

describe('SignResponseSchema', () => {
  it('parses a valid approve response', () => {
    const result = SignResponseSchema.parse(validSignResponse);
    expect(result.action).toBe('approve');
    expect(result.signature).toBe('base64-signature-data');
    expect(result.signerAddress).toBeDefined();
  });

  it('parses a valid reject response without signature', () => {
    const rejectResponse = {
      ...validSignResponse,
      action: 'reject' as const,
      signature: undefined,
    };
    const result = SignResponseSchema.parse(rejectResponse);
    expect(result.action).toBe('reject');
    expect(result.signature).toBeUndefined();
  });

  it('rejects invalid action', () => {
    expect(() =>
      SignResponseSchema.parse({ ...validSignResponse, action: 'cancel' }),
    ).toThrow();
  });

  it('rejects invalid version', () => {
    expect(() =>
      SignResponseSchema.parse({ ...validSignResponse, version: '0' }),
    ).toThrow();
  });

  it('rejects missing signerAddress', () => {
    const { signerAddress: _addr, ...noAddr } = validSignResponse;
    expect(() => SignResponseSchema.parse(noAddr)).toThrow();
  });
});

describe('WalletLinkConfigSchema', () => {
  it('parses a valid config with all fields', () => {
    const result = WalletLinkConfigSchema.parse(validWalletLinkConfig);
    expect(result.name).toBe('dcent');
    expect(result.displayName).toBe("D'CENT Wallet");
    expect(result.universalLink.base).toBe('https://link.dcentwallet.com');
    expect(result.deepLink?.scheme).toBe('dcent-wallet');
  });

  it('parses a minimal config without optional fields', () => {
    const minimalConfig = {
      name: 'phantom',
      displayName: 'Phantom Wallet',
      universalLink: {
        base: 'https://phantom.app',
        signPath: '/sign',
      },
    };
    const result = WalletLinkConfigSchema.parse(minimalConfig);
    expect(result.deepLink).toBeUndefined();
  });

  it('rejects invalid universal link base URL', () => {
    expect(() =>
      WalletLinkConfigSchema.parse({
        ...validWalletLinkConfig,
        universalLink: { base: 'not-a-url', signPath: '/sign' },
      }),
    ).toThrow();
  });

  it('rejects missing name', () => {
    const { name: _name, ...noName } = validWalletLinkConfig;
    expect(() => WalletLinkConfigSchema.parse(noName)).toThrow();
  });
});

describe('ApprovalMethodSchema', () => {
  it('has exactly 5 values', () => {
    expect(APPROVAL_METHODS).toHaveLength(5);
  });

  it('accepts all 5 valid values', () => {
    for (const method of APPROVAL_METHODS) {
      expect(ApprovalMethodSchema.parse(method)).toBe(method);
    }
  });

  it('contains expected values', () => {
    expect(APPROVAL_METHODS).toContain('sdk_push');
    expect(APPROVAL_METHODS).toContain('sdk_telegram');
    expect(APPROVAL_METHODS).toContain('walletconnect');
    expect(APPROVAL_METHODS).toContain('telegram_bot');
    expect(APPROVAL_METHODS).toContain('rest');
  });

  it('does NOT contain sdk_ntfy', () => {
    expect(APPROVAL_METHODS).not.toContain('sdk_ntfy');
  });

  it('rejects invalid value', () => {
    expect(() => ApprovalMethodSchema.parse('invalid')).toThrow();
  });
});

describe('ResponseChannelSchema', () => {
  it('parses push_relay channel', () => {
    const channel = {
      type: 'push_relay' as const,
      pushRelayUrl: 'https://relay.example.com',
      requestId: '01935a3b-7c8d-7e00-b123-456789abcdef',
    };
    const result = ResponseChannelSchema.parse(channel);
    expect(result.type).toBe('push_relay');
  });

  it('rejects type ntfy', () => {
    const channel = {
      type: 'ntfy',
      responseTopic: 'waiaas-response-test',
    };
    expect(() => ResponseChannelSchema.parse(channel)).toThrow();
  });

  it('parses telegram channel', () => {
    const channel = {
      type: 'telegram' as const,
      botUsername: 'waiaas_bot',
    };
    const result = ResponseChannelSchema.parse(channel);
    expect(result.type).toBe('telegram');
  });

  it('rejects invalid channel type', () => {
    expect(() =>
      ResponseChannelSchema.parse({ type: 'discord', responseTopic: 'test' }),
    ).toThrow();
  });
});

describe('SignRequestMetadataSchema', () => {
  it('parses valid metadata', () => {
    const result = SignRequestMetadataSchema.parse(validMetadata);
    expect(result.txId).toBe('01935a3b-7c8d-7e00-b123-456789abcdef');
    expect(result.policyTier).toBe('APPROVAL');
  });

  it('rejects invalid policyTier', () => {
    expect(() =>
      SignRequestMetadataSchema.parse({ ...validMetadata, policyTier: 'INSTANT' }),
    ).toThrow();
  });
});

describe('encodeSignRequest / decodeSignRequest', () => {
  it('round-trips a SignRequest correctly', () => {
    const encoded = encodeSignRequest(validSignRequest);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = decodeSignRequest(encoded);
    expect(decoded).toEqual(validSignRequest);
  });

  it('produces valid base64url (no +/= characters)', () => {
    const encoded = encodeSignRequest(validSignRequest);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('throws on invalid base64url input', () => {
    expect(() => decodeSignRequest('not-valid-base64url!!!')).toThrow();
  });

  it('throws on valid base64url but invalid JSON', () => {
    const notJson = Buffer.from('hello world', 'utf-8').toString('base64url');
    expect(() => decodeSignRequest(notJson)).toThrow();
  });

  it('throws on valid JSON but invalid SignRequest schema', () => {
    const invalidRequest = Buffer.from(
      JSON.stringify({ foo: 'bar' }),
      'utf-8',
    ).toString('base64url');
    expect(() => decodeSignRequest(invalidRequest)).toThrow();
  });
});

describe('buildUniversalLinkUrl', () => {
  it('builds correct URL format', () => {
    const url = buildUniversalLinkUrl(validWalletLinkConfig, validSignRequest);
    expect(url).toMatch(
      /^https:\/\/link\.dcentwallet\.com\/waiaas\/sign\?data=/,
    );
  });

  it('contains base64url-encoded SignRequest in data param', () => {
    const url = buildUniversalLinkUrl(validWalletLinkConfig, validSignRequest);
    const dataParam = url.split('?data=')[1]!;
    const decoded = decodeSignRequest(dataParam);
    expect(decoded).toEqual(validSignRequest);
  });

  it('strips trailing slash from base URL', () => {
    const configWithTrailingSlash: WalletLinkConfig = {
      ...validWalletLinkConfig,
      universalLink: {
        base: 'https://example.com/',
        signPath: '/sign',
      },
    };
    const url = buildUniversalLinkUrl(configWithTrailingSlash, validSignRequest);
    expect(url).toMatch(/^https:\/\/example\.com\/sign\?data=/);
    expect(url).not.toMatch(/\/\/sign/);
  });
});

describe('SIGNING domain error codes', () => {
  const signingCodes = Object.values(ERROR_CODES).filter(
    (e) => e.domain === 'SIGNING',
  );

  it('has exactly 8 SIGNING domain codes', () => {
    // v29.7: +SIGNING_DISABLED
    expect(signingCodes).toHaveLength(8);
  });

  it('includes all expected error codes', () => {
    const codeNames = signingCodes.map((e) => e.code);
    expect(codeNames).toContain('WALLET_NOT_REGISTERED');
    expect(codeNames).toContain('SIGNING_SDK_DISABLED');
    expect(codeNames).toContain('SIGN_REQUEST_NOT_FOUND');
    expect(codeNames).toContain('SIGN_REQUEST_EXPIRED');
    expect(codeNames).toContain('SIGNER_ADDRESS_MISMATCH');
    expect(codeNames).toContain('INVALID_SIGN_RESPONSE');
    expect(codeNames).toContain('SIGN_REQUEST_ALREADY_PROCESSED');
    expect(codeNames).toContain('SIGNING_DISABLED');
  });

  it('creates WAIaaSError from SIGNING domain codes (type-safe)', () => {
    const err = new WAIaaSError('WALLET_NOT_REGISTERED');
    expect(err.code).toBe('WALLET_NOT_REGISTERED');
    expect(err.httpStatus).toBe(404);
    expect(err.retryable).toBe(false);
    expect(err.name).toBe('WAIaaSError');
  });

  it('SIGN_REQUEST_EXPIRED has httpStatus 408', () => {
    const err = new WAIaaSError('SIGN_REQUEST_EXPIRED');
    expect(err.httpStatus).toBe(408);
  });

  it('SIGN_REQUEST_ALREADY_PROCESSED has httpStatus 409', () => {
    const err = new WAIaaSError('SIGN_REQUEST_ALREADY_PROCESSED');
    expect(err.httpStatus).toBe(409);
  });
});

describe('EVENT_CATEGORY_MAP', () => {
  it('covers all NotificationEventType values', () => {
    for (const eventType of NOTIFICATION_EVENT_TYPES) {
      expect(EVENT_CATEGORY_MAP[eventType]).toBeDefined();
      expect(NOTIFICATION_CATEGORIES).toContain(EVENT_CATEGORY_MAP[eventType]);
    }
    expect(Object.keys(EVENT_CATEGORY_MAP)).toHaveLength(NOTIFICATION_EVENT_TYPES.length);
  });

  it('has no extra keys beyond NOTIFICATION_EVENT_TYPES', () => {
    const mapKeys = new Set(Object.keys(EVENT_CATEGORY_MAP));
    const enumKeys = new Set(NOTIFICATION_EVENT_TYPES as readonly string[]);
    for (const key of mapKeys) {
      expect(enumKeys.has(key)).toBe(true);
    }
  });

  it('maps DeFi events to correct categories', () => {
    expect(EVENT_CATEGORY_MAP.LIQUIDATION_WARNING).toBe('defi_monitoring');
    expect(EVENT_CATEGORY_MAP.MATURITY_WARNING).toBe('defi_monitoring');
    expect(EVENT_CATEGORY_MAP.MARGIN_WARNING).toBe('defi_monitoring');
    expect(EVENT_CATEGORY_MAP.LIQUIDATION_IMMINENT).toBe('security_alert');
  });

  it('NOTIFICATION_CATEGORIES has 8 values including defi_monitoring and identity', () => {
    expect(NOTIFICATION_CATEGORIES).toHaveLength(8);
    expect(NOTIFICATION_CATEGORIES).toContain('defi_monitoring');
    // v30.8: ERC-8004 identity category
    expect(NOTIFICATION_CATEGORIES).toContain('identity');
  });
});

describe('NotificationMessageSchema', () => {
  it('validates a correct NotificationMessage', () => {
    const msg = {
      version: '1' as const,
      eventType: 'TX_CONFIRMED',
      walletId: '01958f3a-1234-7000-8000-abcdef123456',
      walletName: 'trading-bot',
      category: 'transaction' as const,
      title: 'Transaction Confirmed',
      body: 'Your transaction has been confirmed',
      timestamp: 1707000000,
    };
    const result = NotificationMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('validates a NotificationMessage with optional details', () => {
    const msg = {
      version: '1' as const,
      eventType: 'TX_CONFIRMED',
      walletId: '01958f3a-1234-7000-8000-abcdef123456',
      walletName: 'trading-bot',
      category: 'transaction' as const,
      title: 'Transaction Confirmed',
      body: 'Your transaction has been confirmed',
      details: { txHash: '0xabc123', amount: '1.5' },
      timestamp: 1707000000,
    };
    const result = NotificationMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('rejects invalid category', () => {
    const msg = {
      version: '1',
      eventType: 'TX_CONFIRMED',
      walletId: 'id',
      walletName: 'w',
      category: 'invalid_category',
      title: 'T',
      body: 'B',
      timestamp: 1707000000,
    };
    const result = NotificationMessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });

  it('rejects invalid version', () => {
    const msg = {
      version: '2',
      eventType: 'TX_CONFIRMED',
      walletId: 'id',
      walletName: 'w',
      category: 'transaction',
      title: 'T',
      body: 'B',
      timestamp: 1707000000,
    };
    const result = NotificationMessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });
});
