/**
 * Tests for PolymarketSigner: EIP-712 signing + HMAC header generation.
 *
 * Plan 371-01 Task 1: Signer tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyTypedData } from 'viem';
import { PolymarketSigner } from '../signer.js';
import {
  CTF_EXCHANGE_DOMAIN,
  NEG_RISK_CTF_EXCHANGE_DOMAIN,
  CLOB_AUTH_DOMAIN,
  ORDER_TYPES,
  CLOB_AUTH_TYPES,
  CLOB_AUTH_MESSAGE,
  ZERO_ADDRESS,
  ORDER_SIDE,
  SIGNATURE_TYPE,
} from '../config.js';
import type { PolymarketOrderStruct } from '../schemas.js';
import type { Hex } from 'viem';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
const TEST_ACCOUNT = privateKeyToAccount(TEST_PRIVATE_KEY);
const TEST_ADDRESS = TEST_ACCOUNT.address;

const TEST_ORDER: PolymarketOrderStruct = {
  salt: 123456789n,
  maker: TEST_ADDRESS,
  signer: TEST_ADDRESS,
  taker: ZERO_ADDRESS,
  tokenId: 12345n,
  makerAmount: 65000000n, // 65 USDC.e
  takerAmount: 100000000n, // 100 tokens
  expiration: 0n,
  nonce: 0n,
  feeRateBps: 0n,
  side: ORDER_SIDE.BUY,
  signatureType: SIGNATURE_TYPE.EOA,
};

// ---------------------------------------------------------------------------
// signOrder tests
// ---------------------------------------------------------------------------

describe('PolymarketSigner.signOrder', () => {
  it('produces a valid hex signature', async () => {
    const sig = await PolymarketSigner.signOrder(TEST_ORDER, TEST_PRIVATE_KEY, false);
    expect(sig).toMatch(/^0x[0-9a-f]+$/i);
    // EIP-712 signatures are 65 bytes = 130 hex chars + '0x' prefix = 132 chars
    expect(sig).toHaveLength(132);
  });

  it('uses CTF Exchange domain for binary markets (isNegRisk=false)', async () => {
    const sig = await PolymarketSigner.signOrder(TEST_ORDER, TEST_PRIVATE_KEY, false);

    const valid = await verifyTypedData({
      address: TEST_ADDRESS,
      domain: CTF_EXCHANGE_DOMAIN,
      types: ORDER_TYPES,
      primaryType: 'Order',
      message: TEST_ORDER,
      signature: sig,
    });
    expect(valid).toBe(true);
  });

  it('uses Neg Risk CTF Exchange domain for neg risk markets (isNegRisk=true)', async () => {
    const sig = await PolymarketSigner.signOrder(TEST_ORDER, TEST_PRIVATE_KEY, true);

    const valid = await verifyTypedData({
      address: TEST_ADDRESS,
      domain: NEG_RISK_CTF_EXCHANGE_DOMAIN,
      types: ORDER_TYPES,
      primaryType: 'Order',
      message: TEST_ORDER,
      signature: sig,
    });
    expect(valid).toBe(true);
  });

  it('produces different signatures for binary vs neg risk domains', async () => {
    const sigBinary = await PolymarketSigner.signOrder(TEST_ORDER, TEST_PRIVATE_KEY, false);
    const sigNegRisk = await PolymarketSigner.signOrder(TEST_ORDER, TEST_PRIVATE_KEY, true);

    expect(sigBinary).not.toBe(sigNegRisk);
  });
});

// ---------------------------------------------------------------------------
// signClobAuth tests
// ---------------------------------------------------------------------------

describe('PolymarketSigner.signClobAuth', () => {
  it('produces a valid hex signature', async () => {
    const sig = await PolymarketSigner.signClobAuth(
      TEST_ADDRESS,
      '1700000000',
      0n,
      TEST_PRIVATE_KEY,
    );
    expect(sig).toMatch(/^0x[0-9a-f]+$/i);
    expect(sig).toHaveLength(132);
  });

  it('produces a verifiable EIP-712 ClobAuth signature', async () => {
    const timestamp = '1700000000';
    const nonce = 0n;
    const sig = await PolymarketSigner.signClobAuth(
      TEST_ADDRESS,
      timestamp,
      nonce,
      TEST_PRIVATE_KEY,
    );

    const valid = await verifyTypedData({
      address: TEST_ADDRESS,
      domain: CLOB_AUTH_DOMAIN,
      types: CLOB_AUTH_TYPES,
      primaryType: 'ClobAuth',
      message: {
        address: TEST_ADDRESS,
        timestamp,
        nonce,
        message: CLOB_AUTH_MESSAGE,
      },
      signature: sig,
    });
    expect(valid).toBe(true);
  });

  it('uses fixed attestation message', async () => {
    // Signature should be deterministic for same inputs
    const sig1 = await PolymarketSigner.signClobAuth(
      TEST_ADDRESS,
      '1700000000',
      0n,
      TEST_PRIVATE_KEY,
    );
    const sig2 = await PolymarketSigner.signClobAuth(
      TEST_ADDRESS,
      '1700000000',
      0n,
      TEST_PRIVATE_KEY,
    );
    expect(sig1).toBe(sig2);
  });
});

// ---------------------------------------------------------------------------
// buildHmacHeaders tests
// ---------------------------------------------------------------------------

describe('PolymarketSigner.buildHmacHeaders', () => {
  const API_KEY = 'test-api-key';
  const SECRET = Buffer.from('test-secret-key-32bytes!!').toString('base64');
  const PASSPHRASE = 'test-passphrase';
  const WALLET = '0x1234567890abcdef1234567890abcdef12345678';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns all 5 required POLY_* headers', () => {
    const headers = PolymarketSigner.buildHmacHeaders(
      API_KEY, SECRET, PASSPHRASE, WALLET, 'GET', '/data/orders',
    );

    expect(headers).toHaveProperty('POLY_ADDRESS', WALLET);
    expect(headers).toHaveProperty('POLY_API_KEY', API_KEY);
    expect(headers).toHaveProperty('POLY_PASSPHRASE', PASSPHRASE);
    expect(headers).toHaveProperty('POLY_TIMESTAMP');
    expect(headers).toHaveProperty('POLY_SIGNATURE');
  });

  it('timestamp is Unix seconds string', () => {
    const headers = PolymarketSigner.buildHmacHeaders(
      API_KEY, SECRET, PASSPHRASE, WALLET, 'GET', '/data/orders',
    );

    const ts = Number(headers.POLY_TIMESTAMP);
    expect(ts).toBeGreaterThan(1700000000);
    expect(String(ts)).toBe(headers.POLY_TIMESTAMP);
  });

  it('produces correct HMAC-SHA256 signature', () => {
    const method = 'POST';
    const path = '/order';
    const body = '{"order":"test"}';

    const headers = PolymarketSigner.buildHmacHeaders(
      API_KEY, SECRET, PASSPHRASE, WALLET, method, path, body,
    );

    // Verify by recomputing the HMAC
    const expectedMessage = headers.POLY_TIMESTAMP + 'POST' + path + body;
    const expectedSig = createHmac('sha256', Buffer.from(SECRET, 'base64'))
      .update(expectedMessage)
      .digest('base64');

    expect(headers.POLY_SIGNATURE).toBe(expectedSig);
  });

  it('method is uppercased in HMAC message', () => {
    const h1 = PolymarketSigner.buildHmacHeaders(
      API_KEY, SECRET, PASSPHRASE, WALLET, 'get', '/test',
    );
    const h2 = PolymarketSigner.buildHmacHeaders(
      API_KEY, SECRET, PASSPHRASE, WALLET, 'GET', '/test',
    );

    expect(h1.POLY_SIGNATURE).toBe(h2.POLY_SIGNATURE);
  });

  it('handles empty body', () => {
    const headers = PolymarketSigner.buildHmacHeaders(
      API_KEY, SECRET, PASSPHRASE, WALLET, 'GET', '/data/orders',
    );

    const expectedMessage = headers.POLY_TIMESTAMP + 'GET' + '/data/orders';
    const expectedSig = createHmac('sha256', Buffer.from(SECRET, 'base64'))
      .update(expectedMessage)
      .digest('base64');

    expect(headers.POLY_SIGNATURE).toBe(expectedSig);
  });
});
