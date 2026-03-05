import { describe, it, expect } from 'vitest';
import { signHttpMessage } from '../http-message-signer.js';
import { privateKeyToAccount } from 'viem/accounts';

// Deterministic test key (DO NOT use in production)
const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const TEST_ACCOUNT = privateKeyToAccount(TEST_PRIVATE_KEY);
const TEST_ADDRESS = TEST_ACCOUNT.address;
const TEST_CHAIN_ID = 1;

describe('signHttpMessage', () => {
  it('returns headers with Signature-Input, Signature, and Content-Digest for POST with body', async () => {
    const result = await signHttpMessage({
      method: 'POST',
      url: 'https://api.example.com/data',
      headers: { 'Content-Type': 'application/json' },
      body: '{"hello":"world"}',
      privateKey: TEST_PRIVATE_KEY,
      chainId: TEST_CHAIN_ID,
      address: TEST_ADDRESS,
    });

    expect(result.headers['Signature-Input']).toBeDefined();
    expect(result.headers['Signature']).toBeDefined();
    expect(result.headers['Content-Digest']).toBeDefined();
    expect(result.keyid).toContain('erc8128:1:');
    expect(result.algorithm).toBe('eip191-secp256k1');
  });

  it('omits Content-Digest for GET request without body', async () => {
    const result = await signHttpMessage({
      method: 'GET',
      url: 'https://api.example.com/data',
      headers: {},
      privateKey: TEST_PRIVATE_KEY,
      chainId: TEST_CHAIN_ID,
      address: TEST_ADDRESS,
      preset: 'minimal',
    });

    expect(result.headers['Content-Digest']).toBeUndefined();
  });

  it('uses minimal preset components', async () => {
    const result = await signHttpMessage({
      method: 'GET',
      url: 'https://api.example.com/data',
      headers: {},
      privateKey: TEST_PRIVATE_KEY,
      chainId: TEST_CHAIN_ID,
      address: TEST_ADDRESS,
      preset: 'minimal',
    });

    expect(result.coveredComponents).toEqual(['@method', '@target-uri']);
  });

  it('uses custom coveredComponents overriding preset', async () => {
    const result = await signHttpMessage({
      method: 'POST',
      url: 'https://api.example.com/data',
      headers: { 'Content-Type': 'application/json', 'X-Custom': 'value' },
      body: '{}',
      privateKey: TEST_PRIVATE_KEY,
      chainId: TEST_CHAIN_ID,
      address: TEST_ADDRESS,
      coveredComponents: ['@method', 'x-custom'],
    });

    expect(result.coveredComponents).toEqual(['@method', 'x-custom']);
  });

  it('auto-generates UUID v4 nonce by default', async () => {
    const result = await signHttpMessage({
      method: 'GET',
      url: 'https://example.com/',
      headers: {},
      privateKey: TEST_PRIVATE_KEY,
      chainId: TEST_CHAIN_ID,
      address: TEST_ADDRESS,
      preset: 'minimal',
    });

    // nonce should be in Signature-Input
    expect(result.headers['Signature-Input']).toContain(';nonce="');
  });

  it('omits nonce when nonce=false', async () => {
    const result = await signHttpMessage({
      method: 'GET',
      url: 'https://example.com/',
      headers: {},
      privateKey: TEST_PRIVATE_KEY,
      chainId: TEST_CHAIN_ID,
      address: TEST_ADDRESS,
      nonce: false,
      preset: 'minimal',
    });

    expect(result.headers['Signature-Input']).not.toContain(';nonce=');
  });

  it('Signature header is in sig1=:base64: format', async () => {
    const result = await signHttpMessage({
      method: 'GET',
      url: 'https://example.com/',
      headers: {},
      privateKey: TEST_PRIVATE_KEY,
      chainId: TEST_CHAIN_ID,
      address: TEST_ADDRESS,
      preset: 'minimal',
    });

    expect(result.headers['Signature']).toMatch(/^sig1=:[A-Za-z0-9+/]+=*:$/);
  });

  it('sets ttlSec=600 correctly in expires', async () => {
    const result = await signHttpMessage({
      method: 'GET',
      url: 'https://example.com/',
      headers: {},
      privateKey: TEST_PRIVATE_KEY,
      chainId: TEST_CHAIN_ID,
      address: TEST_ADDRESS,
      ttlSec: 600,
      preset: 'minimal',
    });

    expect(result.expires).toBe(result.created + 600);
  });

  it('uses default ttlSec=300', async () => {
    const result = await signHttpMessage({
      method: 'GET',
      url: 'https://example.com/',
      headers: {},
      privateKey: TEST_PRIVATE_KEY,
      chainId: TEST_CHAIN_ID,
      address: TEST_ADDRESS,
      preset: 'minimal',
    });

    expect(result.expires).toBe(result.created + 300);
  });

  it('auto-adjusts coveredComponents: removes content-digest for bodyless requests', async () => {
    const result = await signHttpMessage({
      method: 'GET',
      url: 'https://example.com/',
      headers: {},
      privateKey: TEST_PRIVATE_KEY,
      chainId: TEST_CHAIN_ID,
      address: TEST_ADDRESS,
      preset: 'standard', // standard includes content-digest
    });

    // content-digest should be removed for GET (no body)
    expect(result.coveredComponents).not.toContain('content-digest');
    expect(result.headers['Content-Digest']).toBeUndefined();
  });
});
