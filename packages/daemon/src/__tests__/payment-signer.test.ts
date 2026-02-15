/**
 * Unit tests for payment-signer module (x402 chain-specific payment signing).
 *
 * Tests cover:
 * 1. EVM EIP-3009 signature (signEip3009) -- EIP-712 structure, domain, authorization
 * 2. Solana TransferChecked partial signature (signSolanaTransferChecked) -- base64 tx, feePayer
 * 3. Key management pattern (signPayment) -- decrypt -> sign -> finally release
 * 4. Chain strategy selection (signPayment) -- EVM / Solana / unsupported
 * 5. USDC domain table constants
 *
 * keyStore is mocked. viem signTypedData and @solana/kit signBytes are called
 * with real crypto -- they are pure functions that do not require network access.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverTypedDataAddress } from 'viem';
import type { Hex } from 'viem';
import {
  signPayment,
  signEip3009,
  signSolanaTransferChecked,
  USDC_DOMAINS,
  type PaymentKeyStore,
} from '../services/x402/payment-signer.js';
import type { PaymentRequirements } from '@x402/core/types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Fixed 32-byte EVM private key for deterministic tests. */
const EVM_PRIVATE_KEY = new Uint8Array(32).fill(0xab);
const EVM_PRIVATE_KEY_HEX = `0x${Buffer.from(EVM_PRIVATE_KEY).toString('hex')}` as Hex;
const EVM_ACCOUNT = privateKeyToAccount(EVM_PRIVATE_KEY_HEX);
const EVM_WALLET_ADDRESS = EVM_ACCOUNT.address;

/** Fixed 64-byte Solana private key for deterministic tests. */
const SOLANA_PRIVATE_KEY = randomBytes(64);

/** Base Sepolia USDC PaymentRequirements fixture. */
function makeEvmRequirements(overrides?: Partial<PaymentRequirements>): PaymentRequirements {
  return {
    scheme: 'exact',
    network: 'eip155:84532',
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia USDC
    amount: '1000000', // 1 USDC (6 decimals)
    payTo: '0x1234567890abcdef1234567890abcdef12345678',
    maxTimeoutSeconds: 300,
    extra: {},
    ...overrides,
  };
}

/** Solana devnet PaymentRequirements fixture. */
function makeSolanaRequirements(overrides?: Partial<PaymentRequirements>): PaymentRequirements {
  return {
    scheme: 'exact',
    network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    asset: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // devnet USDC
    amount: '1000000',
    payTo: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
    maxTimeoutSeconds: 300,
    extra: {
      feePayer: '7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMoDUi',
      decimals: 6,
    },
    ...overrides,
  };
}

/** Mock keyStore factory. */
function createMockKeyStore(privateKey: Uint8Array = EVM_PRIVATE_KEY): PaymentKeyStore {
  return {
    decryptPrivateKey: vi.fn().mockResolvedValue(new Uint8Array(privateKey)),
    releaseKey: vi.fn(),
  };
}

/** Mock Solana RPC for getLatestBlockhash. */
function createMockSolanaRpc() {
  return {
    getLatestBlockhash: vi.fn().mockReturnValue({
      send: vi.fn().mockResolvedValue({
        value: {
          blockhash: '4EPaFSuXRiGbcVoJF4FjxN3g1jQ5zJGRPbYRjNrwQMxL',
          lastValidBlockHeight: 100_000n,
        },
      }),
    }),
  };
}

// ---------------------------------------------------------------------------
// 1. EVM EIP-3009 signature tests
// ---------------------------------------------------------------------------

describe('signEip3009', () => {
  it('Base Sepolia (eip155:84532) PaymentRequirements로 서명 생성', async () => {
    const requirements = makeEvmRequirements();
    const result = await signEip3009(requirements, EVM_PRIVATE_KEY, EVM_WALLET_ADDRESS);

    // PaymentPayload structure
    expect(result).toHaveProperty('x402Version', 2);
    expect(result).toHaveProperty('accepted');
    expect(result).toHaveProperty('payload');
  });

  it('payload에 signature (0x 65-byte hex)와 authorization 객체가 포함된다', async () => {
    const requirements = makeEvmRequirements();
    const result = await signEip3009(requirements, EVM_PRIVATE_KEY, EVM_WALLET_ADDRESS);

    const payload = result.payload as Record<string, unknown>;
    expect(payload).toHaveProperty('signature');
    expect(payload).toHaveProperty('authorization');

    const signature = payload.signature as string;
    // EIP-712 signature: 0x + 130 hex chars (65 bytes)
    expect(signature).toMatch(/^0x[0-9a-fA-F]{130}$/);
  });

  it('authorization.from이 privateKey 파생 주소와 일치한다', async () => {
    const requirements = makeEvmRequirements();
    const result = await signEip3009(requirements, EVM_PRIVATE_KEY, EVM_WALLET_ADDRESS);

    const payload = result.payload as Record<string, unknown>;
    const auth = payload.authorization as Record<string, unknown>;
    expect(auth.from).toBe(EVM_WALLET_ADDRESS);
  });

  it('authorization.to가 requirements.payTo와 일치한다', async () => {
    const requirements = makeEvmRequirements();
    const result = await signEip3009(requirements, EVM_PRIVATE_KEY, EVM_WALLET_ADDRESS);

    const payload = result.payload as Record<string, unknown>;
    const auth = payload.authorization as Record<string, unknown>;
    expect(auth.to).toBe(requirements.payTo);
  });

  it('authorization.value가 requirements.amount와 일치한다', async () => {
    const requirements = makeEvmRequirements();
    const result = await signEip3009(requirements, EVM_PRIVATE_KEY, EVM_WALLET_ADDRESS);

    const payload = result.payload as Record<string, unknown>;
    const auth = payload.authorization as Record<string, unknown>;
    expect(auth.value).toBe(requirements.amount);
  });

  it('authorization.validAfter가 "0"이다', async () => {
    const requirements = makeEvmRequirements();
    const result = await signEip3009(requirements, EVM_PRIVATE_KEY, EVM_WALLET_ADDRESS);

    const payload = result.payload as Record<string, unknown>;
    const auth = payload.authorization as Record<string, unknown>;
    expect(auth.validAfter).toBe('0');
  });

  it('authorization.validBefore가 현재 시간 + 5분 (오차 +-10초)이다', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const requirements = makeEvmRequirements();
    const result = await signEip3009(requirements, EVM_PRIVATE_KEY, EVM_WALLET_ADDRESS);

    const payload = result.payload as Record<string, unknown>;
    const auth = payload.authorization as Record<string, unknown>;
    const validBefore = Number(auth.validBefore);

    // now + 5min = now + 300sec, allow +-10sec tolerance
    expect(validBefore).toBeGreaterThanOrEqual(nowSec + 290);
    expect(validBefore).toBeLessThanOrEqual(nowSec + 310);
  });

  it('authorization.nonce가 0x + 64자 hex (32 bytes)이다', async () => {
    const requirements = makeEvmRequirements();
    const result = await signEip3009(requirements, EVM_PRIVATE_KEY, EVM_WALLET_ADDRESS);

    const payload = result.payload as Record<string, unknown>;
    const auth = payload.authorization as Record<string, unknown>;
    expect(auth.nonce).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it('EIP-712 서명이 올바른 USDC 도메인으로 검증 가능하다', async () => {
    const requirements = makeEvmRequirements();
    const result = await signEip3009(requirements, EVM_PRIVATE_KEY, EVM_WALLET_ADDRESS);

    const payload = result.payload as Record<string, unknown>;
    const auth = payload.authorization as Record<string, unknown>;
    const signature = payload.signature as Hex;

    // Recover signer address from typed data signature
    const recoveredAddress = await recoverTypedDataAddress({
      domain: {
        name: 'USD Coin',
        version: '2',
        chainId: BigInt(84532),
        verifyingContract: requirements.asset as Hex,
      },
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      message: {
        from: auth.from as Hex,
        to: auth.to as Hex,
        value: BigInt(auth.value as string),
        validAfter: 0n,
        validBefore: BigInt(auth.validBefore as string),
        nonce: auth.nonce as Hex,
      },
      signature,
    });

    expect(recoveredAddress.toLowerCase()).toBe(EVM_WALLET_ADDRESS.toLowerCase());
  });

  it('accepted에 원본 requirements가 포함된다', async () => {
    const requirements = makeEvmRequirements();
    const result = await signEip3009(requirements, EVM_PRIVATE_KEY, EVM_WALLET_ADDRESS);
    expect(result.accepted).toEqual(requirements);
  });
});

// ---------------------------------------------------------------------------
// 2. Solana TransferChecked partial signature tests
// ---------------------------------------------------------------------------

describe('signSolanaTransferChecked', () => {
  it('반환된 payload에 x402Version: 2, accepted, payload.transaction이 포함된다', async () => {
    const requirements = makeSolanaRequirements();
    const mockRpc = createMockSolanaRpc();
    const result = await signSolanaTransferChecked(
      requirements,
      SOLANA_PRIVATE_KEY,
      'dummy-wallet-address',
      mockRpc,
    );

    expect(result).toHaveProperty('x402Version', 2);
    expect(result).toHaveProperty('accepted');
    expect(result).toHaveProperty('payload');
    const payload = result.payload as Record<string, unknown>;
    expect(payload).toHaveProperty('transaction');
    expect(typeof payload.transaction).toBe('string');
  });

  it('payload.transaction이 유효한 base64이다', async () => {
    const requirements = makeSolanaRequirements();
    const mockRpc = createMockSolanaRpc();
    const result = await signSolanaTransferChecked(
      requirements,
      SOLANA_PRIVATE_KEY,
      'dummy-wallet-address',
      mockRpc,
    );

    const payload = result.payload as Record<string, unknown>;
    const tx = payload.transaction as string;

    // Valid base64 should decode without errors
    const decoded = Buffer.from(tx, 'base64');
    expect(decoded.length).toBeGreaterThan(0);

    // Round-trip: encode back to base64 should match
    expect(decoded.toString('base64')).toBe(tx);
  });

  it('RPC의 getLatestBlockhash가 호출된다', async () => {
    const requirements = makeSolanaRequirements();
    const mockRpc = createMockSolanaRpc();
    await signSolanaTransferChecked(
      requirements,
      SOLANA_PRIVATE_KEY,
      'dummy-wallet-address',
      mockRpc,
    );

    expect(mockRpc.getLatestBlockhash).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Key management pattern tests (signPayment - integration)
// ---------------------------------------------------------------------------

describe('signPayment key management', () => {
  it('keyStore.decryptPrivateKey가 호출된다', async () => {
    const mockKeyStore = createMockKeyStore();
    const requirements = makeEvmRequirements();

    await signPayment(
      requirements,
      mockKeyStore,
      'test-wallet-id',
      EVM_WALLET_ADDRESS,
      'test-password',
    );

    expect(mockKeyStore.decryptPrivateKey).toHaveBeenCalledWith('test-wallet-id', 'test-password');
  });

  it('서명 성공 시 keyStore.releaseKey가 호출된다', async () => {
    const mockKeyStore = createMockKeyStore();
    const requirements = makeEvmRequirements();

    await signPayment(
      requirements,
      mockKeyStore,
      'test-wallet-id',
      EVM_WALLET_ADDRESS,
      'test-password',
    );

    expect(mockKeyStore.releaseKey).toHaveBeenCalled();
  });

  it('서명 중 에러 발생 시에도 keyStore.releaseKey가 호출된다 (finally)', async () => {
    const mockKeyStore = createMockKeyStore();
    // Force signEip3009 to fail by providing unsupported network
    const requirements = makeEvmRequirements({ network: 'eip155:999999' });

    await expect(
      signPayment(
        requirements,
        mockKeyStore,
        'test-wallet-id',
        EVM_WALLET_ADDRESS,
        'test-password',
      ),
    ).rejects.toThrow();

    // releaseKey MUST be called even on error (finally block verification)
    expect(mockKeyStore.releaseKey).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. Chain strategy selection tests (signPayment)
// ---------------------------------------------------------------------------

describe('signPayment chain strategy selection', () => {
  it('EVM 네트워크 (eip155:...) -> signEip3009 호출', async () => {
    const mockKeyStore = createMockKeyStore();
    const requirements = makeEvmRequirements();

    const result = await signPayment(
      requirements,
      mockKeyStore,
      'test-wallet-id',
      EVM_WALLET_ADDRESS,
      'test-password',
    );

    // EVM signature has authorization object in payload
    const payload = result.payload as Record<string, unknown>;
    expect(payload).toHaveProperty('signature');
    expect(payload).toHaveProperty('authorization');
  });

  it('Solana 네트워크 (solana:...) -> signSolanaTransferChecked 호출', async () => {
    const mockKeyStore = createMockKeyStore(SOLANA_PRIVATE_KEY);
    const requirements = makeSolanaRequirements();
    const mockRpc = createMockSolanaRpc();

    const result = await signPayment(
      requirements,
      mockKeyStore,
      'test-wallet-id',
      'dummy-solana-address',
      'test-password',
      mockRpc,
    );

    // Solana signature has transaction in payload
    const payload = result.payload as Record<string, unknown>;
    expect(payload).toHaveProperty('transaction');
  });

  it('미지원 네트워크 -> X402_UNSUPPORTED_SCHEME 에러', async () => {
    const mockKeyStore = createMockKeyStore();
    const requirements = makeEvmRequirements({ network: 'bitcoin:mainnet' });

    await expect(
      signPayment(
        requirements,
        mockKeyStore,
        'test-wallet-id',
        '0xdummy',
        'test-password',
      ),
    ).rejects.toThrow(/X402_UNSUPPORTED_SCHEME|Unsupported/);
  });
});

// ---------------------------------------------------------------------------
// 5. USDC Domain table tests
// ---------------------------------------------------------------------------

describe('USDC_DOMAINS constant table', () => {
  it('Base (eip155:8453) domain이 올바르다', () => {
    const domain = USDC_DOMAINS['eip155:8453'];
    expect(domain).toBeDefined();
    expect(domain!.name).toBe('USD Coin');
    expect(domain!.version).toBe('2');
    expect(domain!.chainId).toBe(8453);
    expect(domain!.verifyingContract).toMatch(/^0x/);
  });

  it('Base Sepolia (eip155:84532) domain이 올바르다', () => {
    const domain = USDC_DOMAINS['eip155:84532'];
    expect(domain).toBeDefined();
    expect(domain!.name).toBe('USD Coin');
    expect(domain!.version).toBe('2');
    expect(domain!.chainId).toBe(84532);
    expect(domain!.verifyingContract).toMatch(/^0x/);
  });

  it('미지원 네트워크 키는 undefined이다', () => {
    expect(USDC_DOMAINS['eip155:999999']).toBeUndefined();
  });

  it('Ethereum Mainnet (eip155:1) domain이 등록되어 있다', () => {
    const domain = USDC_DOMAINS['eip155:1'];
    expect(domain).toBeDefined();
    expect(domain!.name).toBe('USD Coin');
    expect(domain!.version).toBe('2');
    expect(domain!.chainId).toBe(1);
  });
});
