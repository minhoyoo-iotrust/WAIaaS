import { describe, it, expect } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { signHttpMessage } from '../http-message-signer.js';
import { verifyHttpSignature } from '../verifier.js';

// Deterministic test key
const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const TEST_ACCOUNT = privateKeyToAccount(TEST_PRIVATE_KEY);
const TEST_ADDRESS = TEST_ACCOUNT.address;
const TEST_CHAIN_ID = 1;

describe('verifyHttpSignature', () => {
  it('full roundtrip: sign then verify returns valid=true', async () => {
    const body = '{"hello":"world"}';
    const signed = await signHttpMessage({
      method: 'POST',
      url: 'https://api.example.com/data',
      headers: { 'Content-Type': 'application/json' },
      body,
      privateKey: TEST_PRIVATE_KEY,
      chainId: TEST_CHAIN_ID,
      address: TEST_ADDRESS,
    });

    const result = await verifyHttpSignature({
      method: 'POST',
      url: 'https://api.example.com/data',
      headers: {
        'Content-Type': 'application/json',
        'Signature-Input': signed.headers['Signature-Input'],
        'Signature': signed.headers['Signature'],
        'Content-Digest': signed.headers['Content-Digest']!,
      },
      body,
    });

    expect(result.valid).toBe(true);
    expect(result.recoveredAddress?.toLowerCase()).toBe(
      TEST_ADDRESS.toLowerCase(),
    );
    expect(result.keyid).toContain(`erc8128:${TEST_CHAIN_ID}:`);
  });

  it('roundtrip with GET request (no body) returns valid=true', async () => {
    const signed = await signHttpMessage({
      method: 'GET',
      url: 'https://api.example.com/data',
      headers: {},
      privateKey: TEST_PRIVATE_KEY,
      chainId: TEST_CHAIN_ID,
      address: TEST_ADDRESS,
      preset: 'minimal',
    });

    const result = await verifyHttpSignature({
      method: 'GET',
      url: 'https://api.example.com/data',
      headers: {
        'Signature-Input': signed.headers['Signature-Input'],
        'Signature': signed.headers['Signature'],
      },
    });

    expect(result.valid).toBe(true);
  });

  it('returns invalid with tampered body', async () => {
    const body = '{"hello":"world"}';
    const signed = await signHttpMessage({
      method: 'POST',
      url: 'https://api.example.com/data',
      headers: { 'Content-Type': 'application/json' },
      body,
      privateKey: TEST_PRIVATE_KEY,
      chainId: TEST_CHAIN_ID,
      address: TEST_ADDRESS,
    });

    const result = await verifyHttpSignature({
      method: 'POST',
      url: 'https://api.example.com/data',
      headers: {
        'Content-Type': 'application/json',
        'Signature-Input': signed.headers['Signature-Input'],
        'Signature': signed.headers['Signature'],
        'Content-Digest': signed.headers['Content-Digest']!,
      },
      body: '{"hello":"tampered"}',
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Content-Digest mismatch');
  });

  it('returns invalid with wrong keyid address', async () => {
    // Sign with one key
    const signed = await signHttpMessage({
      method: 'GET',
      url: 'https://example.com/',
      headers: {},
      privateKey: TEST_PRIVATE_KEY,
      chainId: TEST_CHAIN_ID,
      address: TEST_ADDRESS,
      preset: 'minimal',
      nonce: false,
    });

    // Tamper the Signature-Input to use a different address in keyid
    const tamperedInput = signed.headers['Signature-Input'].replace(
      TEST_ADDRESS,
      '0x0000000000000000000000000000000000000001',
    );

    const result = await verifyHttpSignature({
      method: 'GET',
      url: 'https://example.com/',
      headers: {
        'Signature-Input': tamperedInput,
        'Signature': signed.headers['Signature'],
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Recovered address does not match keyid');
  });

  it('returns invalid with expired signature', async () => {
    const signed = await signHttpMessage({
      method: 'GET',
      url: 'https://example.com/',
      headers: {},
      privateKey: TEST_PRIVATE_KEY,
      chainId: TEST_CHAIN_ID,
      address: TEST_ADDRESS,
      preset: 'minimal',
      ttlSec: 10,
      nonce: false,
    });

    // Replace expires with a past timestamp
    const pastExpires = Math.floor(Date.now() / 1000) - 100;
    const tamperedInput = signed.headers['Signature-Input'].replace(
      /;expires=\d+/,
      `;expires=${pastExpires}`,
    );

    const result = await verifyHttpSignature({
      method: 'GET',
      url: 'https://example.com/',
      headers: {
        'Signature-Input': tamperedInput,
        'Signature': signed.headers['Signature'],
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Signature expired');
  });

  it('returns invalid with missing Signature header', async () => {
    const result = await verifyHttpSignature({
      method: 'GET',
      url: 'https://example.com/',
      headers: {
        'Signature-Input': 'sig1=("@method");created=123',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing Signature header');
  });

  it('returns invalid with missing Signature-Input header', async () => {
    const result = await verifyHttpSignature({
      method: 'GET',
      url: 'https://example.com/',
      headers: {
        Signature: 'sig1=:abc=:',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing Signature-Input header');
  });

  it('returns invalid with malformed Signature-Input (bad label)', async () => {
    const result = await verifyHttpSignature({
      method: 'GET',
      url: 'https://example.com/',
      headers: {
        'Signature-Input': 'bad=("@method");created=123',
        Signature: 'sig1=:abc=:',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Failed to parse Signature-Input');
  });

  it('returns invalid with malformed Signature-Input (no parens)', async () => {
    const result = await verifyHttpSignature({
      method: 'GET',
      url: 'https://example.com/',
      headers: {
        'Signature-Input': 'sig1=@method;created=123',
        Signature: 'sig1=:abc=:',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Failed to parse Signature-Input');
  });

  it('returns invalid with malformed Signature format', async () => {
    const result = await verifyHttpSignature({
      method: 'GET',
      url: 'https://example.com/',
      headers: {
        'Signature-Input': 'sig1=("@method");created=123;keyid="erc8128:1:0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";alg="eip191"',
        Signature: 'sig1=notbase64format',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid Signature format');
  });

  it('returns invalid with corrupted signature bytes (ecrecover failure)', async () => {
    const result = await verifyHttpSignature({
      method: 'GET',
      url: 'https://example.com/',
      headers: {
        'Signature-Input': 'sig1=("@method");created=123;keyid="erc8128:1:0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";alg="eip191"',
        Signature: 'sig1=:AAAA:',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Failed to recover address from signature');
  });

  it('returns invalid with malformed keyid in Signature-Input', async () => {
    // Sign a valid message first to get valid signature bytes
    const signed = await signHttpMessage({
      method: 'GET',
      url: 'https://example.com/',
      headers: {},
      privateKey: TEST_PRIVATE_KEY,
      chainId: TEST_CHAIN_ID,
      address: TEST_ADDRESS,
      preset: 'minimal',
      nonce: false,
    });

    // Replace keyid with invalid format
    const tamperedInput = signed.headers['Signature-Input'].replace(
      /;keyid="[^"]*"/,
      ';keyid="not-a-valid-keyid"',
    );

    const result = await verifyHttpSignature({
      method: 'GET',
      url: 'https://example.com/',
      headers: {
        'Signature-Input': tamperedInput,
        Signature: signed.headers['Signature'],
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid keyid format');
  });
});
