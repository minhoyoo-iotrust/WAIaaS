/**
 * TDD tests for ISignerCapability interface + 7 signing capability implementations.
 *
 * Tests cover:
 * 1. ISignerCapability contract (canSign/sign)
 * 2. SigningError error class
 * 3. Eip712SignerCapability (EIP-712 typed data)
 * 4. PersonalSignCapability (personal_sign)
 * 5. Erc8128SignerCapability (ERC-8128 HTTP signing)
 * 6. HmacSignerCapability (HMAC-SHA256)
 * 7. RsaPssSignerCapability (RSA-PSS)
 * 8. EcdsaSignBytesCapability (secp256k1)
 * 9. Ed25519SignBytesCapability (ed25519)
 *
 * @since v31.12
 */
import { describe, it, expect, vi } from 'vitest';
import * as crypto from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import type { SigningScheme } from '@waiaas/core';
import type {
  ISignerCapability,
  SigningParams,
  SigningResult,
  Eip712SigningParams,
  PersonalSigningParams,
  HmacSigningParams,
  RsaPssSigningParams,
  EcdsaSecp256k1SigningParams,
  Ed25519SigningParams,
  Erc8128SigningParams,
} from '../signing/types.js';
import { SigningError } from '../signing/signing-error.js';
import type { SigningErrorCode } from '../signing/signing-error.js';
import {
  Eip712SignerCapability,
  PersonalSignCapability,
  Erc8128SignerCapability,
  HmacSignerCapability,
  RsaPssSignerCapability,
  EcdsaSignBytesCapability,
  Ed25519SignBytesCapability,
} from '../signing/capabilities/index.js';

// -----------------------------------------------------------------------
// Test fixtures
// -----------------------------------------------------------------------

const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`;
const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// Ed25519 keypair via node:crypto
const ed25519Keypair = crypto.generateKeyPairSync('ed25519');
const ed25519PrivateRaw = ed25519Keypair.privateKey.export({ type: 'pkcs8', format: 'der' });
// DER PKCS8 ed25519 private key: last 32 bytes are the raw seed
const ed25519PrivateKey = new Uint8Array(ed25519PrivateRaw.subarray(ed25519PrivateRaw.length - 32));
const ed25519PublicRaw = ed25519Keypair.publicKey.export({ type: 'spki', format: 'der' });
const ed25519PublicKey = new Uint8Array(ed25519PublicRaw.subarray(ed25519PublicRaw.length - 32));

// RSA-PSS keypair
const rsaKeypair = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// -----------------------------------------------------------------------
// SigningError tests
// -----------------------------------------------------------------------

describe('SigningError', () => {
  it('should extend Error with scheme, code, cause', () => {
    const cause = new Error('root cause');
    const err = new SigningError('test error', 'eip712', 'INVALID_KEY', cause);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SigningError);
    expect(err.message).toBe('test error');
    expect(err.scheme).toBe('eip712');
    expect(err.code).toBe('INVALID_KEY');
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('SigningError');
  });

  it('should work without cause', () => {
    const err = new SigningError('no cause', 'hmac-sha256', 'SIGNING_FAILED');
    expect(err.cause).toBeUndefined();
  });
});

// -----------------------------------------------------------------------
// Eip712SignerCapability tests
// -----------------------------------------------------------------------

describe('Eip712SignerCapability', () => {
  const cap = new Eip712SignerCapability();

  it('should have scheme "eip712"', () => {
    expect(cap.scheme).toBe('eip712');
  });

  it('canSign returns true for eip712 params with privateKey', () => {
    const params: Eip712SigningParams = {
      scheme: 'eip712',
      privateKey: TEST_PRIVATE_KEY,
      domain: { name: 'Test', version: '1', chainId: 1 },
      types: { EIP712Domain: [] },
      primaryType: 'EIP712Domain',
      value: {},
    };
    expect(cap.canSign(params)).toBe(true);
  });

  it('canSign returns false for wrong scheme', () => {
    expect(cap.canSign({ scheme: 'personal', privateKey: TEST_PRIVATE_KEY, message: 'hi' } as any)).toBe(false);
  });

  it('sign produces hex signature string', async () => {
    const params: Eip712SigningParams = {
      scheme: 'eip712',
      privateKey: TEST_PRIVATE_KEY,
      domain: { name: 'Test', version: '1', chainId: 1 },
      types: {
        Person: [{ name: 'name', type: 'string' }],
      },
      primaryType: 'Person',
      value: { name: 'Alice' },
    };
    const result = await cap.sign(params);
    expect(typeof result.signature).toBe('string');
    expect((result.signature as string).startsWith('0x')).toBe(true);
    expect((result.signature as string).length).toBe(132); // 0x + 65 bytes hex
  });

  it('sign throws SigningError for invalid key', async () => {
    const params: Eip712SigningParams = {
      scheme: 'eip712',
      privateKey: '0xinvalid' as any,
      domain: { name: 'Test', version: '1' },
      types: {},
      primaryType: 'Test',
      value: {},
    };
    await expect(cap.sign(params)).rejects.toThrow(SigningError);
    try {
      await cap.sign(params);
    } catch (e) {
      expect((e as SigningError).code).toBe('INVALID_KEY');
      expect((e as SigningError).scheme).toBe('eip712');
    }
  });
});

// -----------------------------------------------------------------------
// PersonalSignCapability tests
// -----------------------------------------------------------------------

describe('PersonalSignCapability', () => {
  const cap = new PersonalSignCapability();

  it('should have scheme "personal"', () => {
    expect(cap.scheme).toBe('personal');
  });

  it('canSign returns true for personal params with privateKey', () => {
    const params: PersonalSigningParams = {
      scheme: 'personal',
      privateKey: TEST_PRIVATE_KEY,
      message: 'hello world',
    };
    expect(cap.canSign(params)).toBe(true);
  });

  it('canSign returns false for wrong scheme', () => {
    expect(cap.canSign({ scheme: 'eip712' } as any)).toBe(false);
  });

  it('sign produces hex signature for string message', async () => {
    const params: PersonalSigningParams = {
      scheme: 'personal',
      privateKey: TEST_PRIVATE_KEY,
      message: 'hello world',
    };
    const result = await cap.sign(params);
    expect(typeof result.signature).toBe('string');
    expect((result.signature as string).startsWith('0x')).toBe(true);
  });

  it('sign produces hex signature for hex message', async () => {
    const params: PersonalSigningParams = {
      scheme: 'personal',
      privateKey: TEST_PRIVATE_KEY,
      message: '0xdeadbeef',
    };
    const result = await cap.sign(params);
    expect(typeof result.signature).toBe('string');
    expect((result.signature as string).startsWith('0x')).toBe(true);
  });
});

// -----------------------------------------------------------------------
// Erc8128SignerCapability tests
// -----------------------------------------------------------------------

describe('Erc8128SignerCapability', () => {
  const cap = new Erc8128SignerCapability();

  it('should have scheme "erc8128"', () => {
    expect(cap.scheme).toBe('erc8128');
  });

  it('canSign returns true when privateKey, chainId, address present', () => {
    const params: Erc8128SigningParams = {
      scheme: 'erc8128',
      privateKey: TEST_PRIVATE_KEY,
      chainId: 1,
      address: TEST_ADDRESS,
      method: 'POST',
      url: 'https://example.com/api',
      headers: {},
    };
    expect(cap.canSign(params)).toBe(true);
  });

  it('canSign returns false for wrong scheme', () => {
    expect(cap.canSign({ scheme: 'personal' } as any)).toBe(false);
  });

  it('canSign returns false when chainId missing', () => {
    const params = {
      scheme: 'erc8128' as const,
      privateKey: TEST_PRIVATE_KEY,
      address: TEST_ADDRESS,
      method: 'POST',
      url: 'https://example.com',
      headers: {},
    };
    expect(cap.canSign(params as any)).toBe(false);
  });

  it('sign delegates to erc8128 signHttpMessage and returns metadata', async () => {
    const params: Erc8128SigningParams = {
      scheme: 'erc8128',
      privateKey: TEST_PRIVATE_KEY,
      chainId: 1,
      address: TEST_ADDRESS,
      method: 'POST',
      url: 'https://example.com/api',
      headers: { 'Content-Type': 'application/json' },
      body: '{"test":true}',
    };
    const result = await cap.sign(params);
    expect(typeof result.signature).toBe('string');
    expect(result.metadata).toBeDefined();
    expect(result.metadata!['Signature-Input']).toBeDefined();
    expect(result.metadata!['Signature']).toBeDefined();
  });
});

// -----------------------------------------------------------------------
// HmacSignerCapability tests
// -----------------------------------------------------------------------

describe('HmacSignerCapability', () => {
  const cap = new HmacSignerCapability();
  const testSecret = 'my-super-secret-key';
  const testData = 'data to sign';

  it('should have scheme "hmac-sha256"', () => {
    expect(cap.scheme).toBe('hmac-sha256');
  });

  it('canSign returns true for hmac-sha256 with secret', () => {
    const params: HmacSigningParams = {
      scheme: 'hmac-sha256',
      secret: testSecret,
      data: testData,
    };
    expect(cap.canSign(params)).toBe(true);
  });

  it('canSign returns false for wrong scheme', () => {
    expect(cap.canSign({ scheme: 'personal' } as any)).toBe(false);
  });

  it('canSign returns false when secret is empty', () => {
    expect(cap.canSign({ scheme: 'hmac-sha256', secret: '', data: 'x' } as HmacSigningParams)).toBe(false);
  });

  it('sign produces correct HMAC-SHA256 hex by default', async () => {
    const params: HmacSigningParams = {
      scheme: 'hmac-sha256',
      secret: testSecret,
      data: testData,
    };
    const result = await cap.sign(params);
    // Verify against node:crypto
    const expected = crypto.createHmac('sha256', testSecret).update(testData).digest('hex');
    expect(result.signature).toBe(expected);
  });

  it('sign produces correct HMAC-SHA256 base64 when encoding specified', async () => {
    const params: HmacSigningParams = {
      scheme: 'hmac-sha256',
      secret: testSecret,
      data: testData,
      encoding: 'base64',
    };
    const result = await cap.sign(params);
    const expected = crypto.createHmac('sha256', testSecret).update(testData).digest('base64');
    expect(result.signature).toBe(expected);
  });
});

// -----------------------------------------------------------------------
// RsaPssSignerCapability tests
// -----------------------------------------------------------------------

describe('RsaPssSignerCapability', () => {
  const cap = new RsaPssSignerCapability();

  it('should have scheme "rsa-pss"', () => {
    expect(cap.scheme).toBe('rsa-pss');
  });

  it('canSign returns true for rsa-pss with privateKey', () => {
    const params: RsaPssSigningParams = {
      scheme: 'rsa-pss',
      privateKey: rsaKeypair.privateKey,
      data: 'test data',
    };
    expect(cap.canSign(params)).toBe(true);
  });

  it('canSign returns false for wrong scheme', () => {
    expect(cap.canSign({ scheme: 'personal' } as any)).toBe(false);
  });

  it('sign produces verifiable RSA-PSS signature', async () => {
    const testData = 'test data for RSA-PSS signing';
    const params: RsaPssSigningParams = {
      scheme: 'rsa-pss',
      privateKey: rsaKeypair.privateKey,
      data: testData,
    };
    const result = await cap.sign(params);
    expect(typeof result.signature).toBe('string');

    // Verify the signature
    const sigBuffer = Buffer.from(result.signature as string, 'base64');
    const verified = crypto.verify(
      'sha256',
      Buffer.from(testData),
      {
        key: rsaKeypair.publicKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: 32,
      },
      sigBuffer,
    );
    expect(verified).toBe(true);
  });

  it('sign with custom saltLength', async () => {
    const params: RsaPssSigningParams = {
      scheme: 'rsa-pss',
      privateKey: rsaKeypair.privateKey,
      data: 'test',
      saltLength: 64,
    };
    const result = await cap.sign(params);
    const sigBuffer = Buffer.from(result.signature as string, 'base64');
    const verified = crypto.verify(
      'sha256',
      Buffer.from('test'),
      {
        key: rsaKeypair.publicKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: 64,
      },
      sigBuffer,
    );
    expect(verified).toBe(true);
  });
});

// -----------------------------------------------------------------------
// EcdsaSignBytesCapability tests
// -----------------------------------------------------------------------

describe('EcdsaSignBytesCapability', () => {
  const cap = new EcdsaSignBytesCapability();

  it('should have scheme "ecdsa-secp256k1"', () => {
    expect(cap.scheme).toBe('ecdsa-secp256k1');
  });

  it('canSign returns true for ecdsa-secp256k1 with privateKey', () => {
    const params: EcdsaSecp256k1SigningParams = {
      scheme: 'ecdsa-secp256k1',
      privateKey: TEST_PRIVATE_KEY,
      data: '0xdeadbeef',
    };
    expect(cap.canSign(params)).toBe(true);
  });

  it('canSign returns false for wrong scheme', () => {
    expect(cap.canSign({ scheme: 'personal' } as any)).toBe(false);
  });

  it('sign with hashData=true (default) produces hex signature', async () => {
    const params: EcdsaSecp256k1SigningParams = {
      scheme: 'ecdsa-secp256k1',
      privateKey: TEST_PRIVATE_KEY,
      data: '0xdeadbeef',
    };
    const result = await cap.sign(params);
    expect(typeof result.signature).toBe('string');
    expect((result.signature as string).startsWith('0x')).toBe(true);
  });

  it('sign with hashData=false signs raw bytes', async () => {
    // Must provide a 32-byte hash (keccak256 output)
    const params: EcdsaSecp256k1SigningParams = {
      scheme: 'ecdsa-secp256k1',
      privateKey: TEST_PRIVATE_KEY,
      data: '0x' + '00'.repeat(32),
      hashData: false,
    };
    const result = await cap.sign(params);
    expect(typeof result.signature).toBe('string');
    expect((result.signature as string).startsWith('0x')).toBe(true);
  });
});

// -----------------------------------------------------------------------
// Ed25519SignBytesCapability tests
// -----------------------------------------------------------------------

describe('Ed25519SignBytesCapability', () => {
  const cap = new Ed25519SignBytesCapability();

  it('should have scheme "ed25519"', () => {
    expect(cap.scheme).toBe('ed25519');
  });

  it('canSign returns true for ed25519 with privateKey Uint8Array', () => {
    const params: Ed25519SigningParams = {
      scheme: 'ed25519',
      privateKey: ed25519PrivateKey,
      data: new Uint8Array([1, 2, 3]),
    };
    expect(cap.canSign(params)).toBe(true);
  });

  it('canSign returns false for wrong scheme', () => {
    expect(cap.canSign({ scheme: 'personal' } as any)).toBe(false);
  });

  it('sign produces verifiable Ed25519 signature', async () => {
    const testData = new Uint8Array([1, 2, 3, 4, 5]);
    const params: Ed25519SigningParams = {
      scheme: 'ed25519',
      privateKey: ed25519PrivateKey,
      data: testData,
    };
    const result = await cap.sign(params);
    expect(result.signature).toBeInstanceOf(Uint8Array);
    expect((result.signature as Uint8Array).length).toBe(64);

    // Verify with node:crypto
    const verified = crypto.verify(
      null,
      testData,
      ed25519Keypair.publicKey,
      Buffer.from(result.signature as Uint8Array),
    );
    expect(verified).toBe(true);
  });
});

// -----------------------------------------------------------------------
// ISignerCapability contract: all 7 implement the interface
// -----------------------------------------------------------------------

describe('ISignerCapability contract', () => {
  const capabilities: ISignerCapability[] = [
    new Eip712SignerCapability(),
    new PersonalSignCapability(),
    new Erc8128SignerCapability(),
    new HmacSignerCapability(),
    new RsaPssSignerCapability(),
    new EcdsaSignBytesCapability(),
    new Ed25519SignBytesCapability(),
  ];

  const expectedSchemes: SigningScheme[] = [
    'eip712', 'personal', 'erc8128', 'hmac-sha256',
    'rsa-pss', 'ecdsa-secp256k1', 'ed25519',
  ];

  it('all 7 capabilities have unique scheme values', () => {
    const schemes = capabilities.map((c) => c.scheme);
    expect(new Set(schemes).size).toBe(7);
    for (const s of expectedSchemes) {
      expect(schemes).toContain(s);
    }
  });

  it('all capabilities have canSign and sign methods', () => {
    for (const cap of capabilities) {
      expect(typeof cap.canSign).toBe('function');
      expect(typeof cap.sign).toBe('function');
    }
  });
});
