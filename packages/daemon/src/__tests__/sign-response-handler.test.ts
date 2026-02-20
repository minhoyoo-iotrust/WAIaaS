/**
 * Tests for SignResponseHandler service.
 *
 * Tests cover:
 * 1. Valid approve response: requestId match + signature verify -> { action: 'approved', txId }
 * 2. Valid reject response -> { action: 'rejected', txId }
 * 3. SIGN_REQUEST_NOT_FOUND: unknown requestId
 * 4. SIGN_REQUEST_EXPIRED: expiresAt exceeded (Date.now mock)
 * 5. INVALID_SIGNATURE: failed EVM signature verification
 * 6. SIGNER_ADDRESS_MISMATCH: signerAddress != ownerAddress
 * 7. INVALID_SIGN_RESPONSE: Zod validation failure (missing required fields)
 * 8. SIGN_REQUEST_ALREADY_PROCESSED: duplicate requestId
 * 9. approve with missing signature -> INVALID_SIGN_RESPONSE
 * 10. reject with optional signature (signed reject)
 *
 * Signature verification functions are mocked (viem.verifyMessage, @solana/kit).
 * DB is in-memory SQLite via createDatabase(':memory:').
 *
 * @see packages/daemon/src/services/signing-sdk/sign-response-handler.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WAIaaSError } from '@waiaas/core';
import type { SignRequest, SignResponse } from '@waiaas/core';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { SignResponseHandler } from '../services/signing-sdk/sign-response-handler.js';
import type { EvmVerifyFn, SolanaVerifyFn } from '../services/signing-sdk/sign-response-handler.js';

// ---------------------------------------------------------------------------
// Helper: create in-memory DB with full schema
// ---------------------------------------------------------------------------

function createTestDb(): { sqlite: DatabaseType } {
  const conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  return { sqlite: conn.sqlite };
}

// ---------------------------------------------------------------------------
// Helper: insert wallet + transaction + pending_approval
// ---------------------------------------------------------------------------

function insertTestData(
  sqlite: DatabaseType,
  opts: {
    walletId?: string;
    txId?: string;
    ownerAddress?: string;
    chain?: string;
    txStatus?: string;
  } = {},
): void {
  const walletId = opts.walletId ?? 'wallet-001';
  const txId = opts.txId ?? '01935a3b-7c8d-7e00-b123-456789abcdef';
  const ownerAddress = opts.ownerAddress ?? '0x1234567890abcdef1234567890abcdef12345678';
  const chain = opts.chain ?? 'ethereum';
  const txStatus = opts.txStatus ?? 'QUEUED';
  const now = Math.floor(Date.now() / 1000);

  // Insert wallet
  sqlite
    .prepare(
      'INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(walletId, 'test-wallet', chain, 'testnet', `pk-${walletId}`, 'ACTIVE', ownerAddress, now, now);

  // Insert transaction
  sqlite
    .prepare(
      'INSERT INTO transactions (id, wallet_id, chain, type, status, to_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(txId, walletId, chain, 'TRANSFER', txStatus, '0xabcdef01', now);

  // Insert pending_approval
  sqlite
    .prepare(
      'INSERT INTO pending_approvals (id, tx_id, required_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run('approval-001', txId, now, now + 3600, now);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const txId = '01935a3b-7c8d-7e00-b123-456789abcdef';
const requestId = '01935a3b-0000-7e00-b123-000000000001';
const signerAddress = '0x1234567890abcdef1234567890abcdef12345678';
const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

function createTestRequest(overrides: Partial<SignRequest> = {}): SignRequest {
  return {
    version: '1',
    requestId,
    chain: 'evm',
    network: 'ethereum-mainnet',
    message: 'WAIaaS Transaction Approval\n\nTransaction: ...',
    displayMessage: 'TRANSFER 1.5 ETH',
    metadata: {
      txId,
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      amount: '1.5',
      symbol: 'ETH',
      policyTier: 'APPROVAL',
    },
    responseChannel: {
      type: 'ntfy',
      responseTopic: `waiaas-response-${requestId}`,
    },
    expiresAt,
    ...overrides,
  };
}

function createTestResponse(overrides: Partial<SignResponse> = {}): SignResponse {
  return {
    version: '1',
    requestId,
    action: 'approve',
    signature: '0xmocksignature',
    signerAddress,
    signedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock verify functions
// ---------------------------------------------------------------------------

function _createMockEvmVerify(returns = true): EvmVerifyFn {
  return vi.fn().mockResolvedValue(returns);
}

function _createMockSolanaVerify(returns = true): SolanaVerifyFn {
  return vi.fn().mockResolvedValue(returns);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SignResponseHandler', () => {
  let sqlite: DatabaseType;
  let handler: SignResponseHandler;
  let mockEvmVerify: ReturnType<typeof vi.fn>;
  let mockSolanaVerify: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const db = createTestDb();
    sqlite = db.sqlite;
    insertTestData(sqlite);

    mockEvmVerify = vi.fn().mockResolvedValue(true);
    mockSolanaVerify = vi.fn().mockResolvedValue(true);

    handler = new SignResponseHandler(
      { sqlite },
      {
        evmVerify: mockEvmVerify as EvmVerifyFn,
        solanaVerify: mockSolanaVerify as SolanaVerifyFn,
      },
    );
  });

  afterEach(() => {
    handler.destroy();
  });

  // -----------------------------------------------------------------------
  // 1. Valid approve response
  // -----------------------------------------------------------------------

  it('approves transaction with valid signature', async () => {
    const request = createTestRequest();
    handler.registerRequest(request);

    const response = createTestResponse();
    const result = await handler.handle(response);

    expect(result.action).toBe('approved');
    expect(result.txId).toBe(txId);

    // Verify DB updates
    const pa = sqlite
      .prepare('SELECT approved_at, owner_signature, approval_channel FROM pending_approvals WHERE tx_id = ?')
      .get(txId) as any;
    expect(pa.approved_at).toBeTruthy();
    expect(pa.owner_signature).toBe('0xmocksignature');
    expect(pa.approval_channel).toBe('signing_sdk');

    const tx = sqlite.prepare('SELECT status FROM transactions WHERE id = ?').get(txId) as any;
    expect(tx.status).toBe('EXECUTING');

    // Verify EVM verify was called
    expect(mockEvmVerify).toHaveBeenCalledWith({
      address: signerAddress,
      message: request.message,
      signature: '0xmocksignature',
    });
  });

  // -----------------------------------------------------------------------
  // 2. Valid reject response
  // -----------------------------------------------------------------------

  it('rejects transaction with reject action', async () => {
    const request = createTestRequest();
    handler.registerRequest(request);

    const response = createTestResponse({ action: 'reject', signature: undefined });
    const result = await handler.handle(response);

    expect(result.action).toBe('rejected');
    expect(result.txId).toBe(txId);

    // Verify DB updates
    const pa = sqlite
      .prepare('SELECT rejected_at, approval_channel FROM pending_approvals WHERE tx_id = ?')
      .get(txId) as any;
    expect(pa.rejected_at).toBeTruthy();
    expect(pa.approval_channel).toBe('signing_sdk');

    const tx = sqlite.prepare('SELECT status, error FROM transactions WHERE id = ?').get(txId) as any;
    expect(tx.status).toBe('CANCELLED');
    expect(tx.error).toContain('Rejected via signing SDK');
  });

  // -----------------------------------------------------------------------
  // 3. SIGN_REQUEST_NOT_FOUND
  // -----------------------------------------------------------------------

  it('throws SIGN_REQUEST_NOT_FOUND for unknown requestId', async () => {
    // Do NOT register any request
    const response = createTestResponse();

    try {
      await handler.handle(response);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('SIGN_REQUEST_NOT_FOUND');
    }
  });

  // -----------------------------------------------------------------------
  // 4. SIGN_REQUEST_EXPIRED
  // -----------------------------------------------------------------------

  it('throws SIGN_REQUEST_EXPIRED for expired request', async () => {
    // Create request that expired 1 minute ago
    const expiredRequest = createTestRequest({
      expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
    });
    handler.registerRequest(expiredRequest);

    const response = createTestResponse();

    try {
      await handler.handle(response);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('SIGN_REQUEST_EXPIRED');
    }
  });

  // -----------------------------------------------------------------------
  // 5. INVALID_SIGNATURE: EVM verification failure
  // -----------------------------------------------------------------------

  it('throws INVALID_SIGNATURE when EVM signature verification fails', async () => {
    mockEvmVerify.mockResolvedValue(false);

    const request = createTestRequest();
    handler.registerRequest(request);

    const response = createTestResponse();

    try {
      await handler.handle(response);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('INVALID_SIGNATURE');
    }
  });

  // -----------------------------------------------------------------------
  // 6. SIGNER_ADDRESS_MISMATCH
  // -----------------------------------------------------------------------

  it('throws SIGNER_ADDRESS_MISMATCH when signerAddress != ownerAddress', async () => {
    const request = createTestRequest();
    handler.registerRequest(request);

    const response = createTestResponse({
      signerAddress: '0xDEADBEEF00000000000000000000000000000000',
    });

    try {
      await handler.handle(response);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('SIGNER_ADDRESS_MISMATCH');
    }
  });

  // -----------------------------------------------------------------------
  // 7. INVALID_SIGN_RESPONSE: Zod validation failure
  // -----------------------------------------------------------------------

  it('throws INVALID_SIGN_RESPONSE for invalid response schema', async () => {
    const request = createTestRequest();
    handler.registerRequest(request);

    // Missing required fields (version, requestId, action, signerAddress, signedAt)
    const invalidResponse = {
      version: '1',
      requestId,
      // missing action
      signerAddress,
      signedAt: new Date().toISOString(),
    } as any;

    try {
      await handler.handle(invalidResponse);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('INVALID_SIGN_RESPONSE');
    }
  });

  // -----------------------------------------------------------------------
  // 8. SIGN_REQUEST_ALREADY_PROCESSED
  // -----------------------------------------------------------------------

  it('throws SIGN_REQUEST_ALREADY_PROCESSED for duplicate requestId', async () => {
    const request = createTestRequest();
    handler.registerRequest(request);

    const response = createTestResponse();
    await handler.handle(response);

    // Second response with same requestId
    try {
      await handler.handle(response);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('SIGN_REQUEST_ALREADY_PROCESSED');
    }
  });

  // -----------------------------------------------------------------------
  // 9. Approve with missing signature -> INVALID_SIGN_RESPONSE
  // -----------------------------------------------------------------------

  it('throws INVALID_SIGN_RESPONSE when approve lacks signature', async () => {
    const request = createTestRequest();
    handler.registerRequest(request);

    const response = createTestResponse({ action: 'approve', signature: undefined });

    try {
      await handler.handle(response);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('INVALID_SIGN_RESPONSE');
    }
  });

  // -----------------------------------------------------------------------
  // 10. Reject with optional signature (signed reject verified)
  // -----------------------------------------------------------------------

  it('verifies signature on reject when signature is provided', async () => {
    const request = createTestRequest();
    handler.registerRequest(request);

    const response = createTestResponse({ action: 'reject', signature: '0xsignedreject' });
    const result = await handler.handle(response);

    expect(result.action).toBe('rejected');
    expect(mockEvmVerify).toHaveBeenCalledWith({
      address: signerAddress,
      message: request.message,
      signature: '0xsignedreject',
    });
  });

  // -----------------------------------------------------------------------
  // 11. Reject with invalid signature throws INVALID_SIGNATURE
  // -----------------------------------------------------------------------

  it('throws INVALID_SIGNATURE when reject has invalid signed signature', async () => {
    mockEvmVerify.mockResolvedValue(false);

    const request = createTestRequest();
    handler.registerRequest(request);

    const response = createTestResponse({ action: 'reject', signature: '0xbadsig' });

    try {
      await handler.handle(response);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('INVALID_SIGNATURE');
    }
  });

  // -----------------------------------------------------------------------
  // 12. registerRequest sets expiration timer
  // -----------------------------------------------------------------------

  it('auto-removes expired request from pending after timeout', async () => {
    vi.useFakeTimers();
    try {
      // Create handler with fake timers
      const freshHandler = new SignResponseHandler(
        { sqlite },
        { evmVerify: mockEvmVerify, solanaVerify: mockSolanaVerify },
      );

      // Register request that expires in 5 seconds
      const request = createTestRequest({
        expiresAt: new Date(Date.now() + 5000).toISOString(),
      });
      freshHandler.registerRequest(request);

      // Advance time past expiry
      vi.advanceTimersByTime(6000);

      // Response should fail with NOT_FOUND (auto-removed by timer)
      const response = createTestResponse();
      try {
        await freshHandler.handle(response);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(WAIaaSError);
        expect((err as WAIaaSError).code).toBe('SIGN_REQUEST_NOT_FOUND');
      }

      freshHandler.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});
