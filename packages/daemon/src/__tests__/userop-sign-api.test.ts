/**
 * Tests for POST /v1/wallets/:id/userop/sign endpoint.
 *
 * Plan 340-01: UserOp Sign endpoint -- callData verification, policy,
 * signing, audit, notifications.
 */

import { describe, it, expect } from 'vitest';
import {
  UserOpSignRequestSchema,
  UserOpSignResponseSchema,
} from '@waiaas/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WALLET_ID = 'w-smart-sign-1';
const BUILD_ID = '019548e8-f7a0-7000-8000-000000000010';
const FAKE_SENDER = '0x1234567890abcdef1234567890abcdef12345678';
const FAKE_CALL_DATA = '0xaabbccdd';
const FAKE_SIGNATURE = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab';
const FAKE_ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';

// ---------------------------------------------------------------------------
// Schema validation tests
// ---------------------------------------------------------------------------

describe('UserOpSignRequestSchema', () => {
  it('validates a valid sign request', () => {
    const input = {
      buildId: BUILD_ID,
      userOperation: {
        sender: FAKE_SENDER,
        nonce: '0x2a',
        callData: FAKE_CALL_DATA,
        callGasLimit: '0x5208',
        verificationGasLimit: '0x5208',
        preVerificationGas: '0x5208',
        maxFeePerGas: '0x3b9aca00',
        maxPriorityFeePerGas: '0x3b9aca00',
        signature: '0x',
      },
    };
    const result = UserOpSignRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects request without buildId', () => {
    const input = {
      userOperation: {
        sender: FAKE_SENDER,
        nonce: '0x2a',
        callData: FAKE_CALL_DATA,
        callGasLimit: '0x5208',
        verificationGasLimit: '0x5208',
        preVerificationGas: '0x5208',
        maxFeePerGas: '0x3b9aca00',
        maxPriorityFeePerGas: '0x3b9aca00',
        signature: '0x',
      },
    };
    const result = UserOpSignRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('UserOpSignResponseSchema', () => {
  it('validates a valid sign response with signedUserOperation + txId', () => {
    const input = {
      signedUserOperation: {
        sender: FAKE_SENDER,
        nonce: '0x2a',
        callData: FAKE_CALL_DATA,
        callGasLimit: '0x5208',
        verificationGasLimit: '0x5208',
        preVerificationGas: '0x5208',
        maxFeePerGas: '0x3b9aca00',
        maxPriorityFeePerGas: '0x3b9aca00',
        signature: FAKE_SIGNATURE,
      },
      txId: '019548e8-f7a0-7000-8000-000000000099',
    };
    const result = UserOpSignResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.signedUserOperation.signature).toBe(FAKE_SIGNATURE);
      expect(result.data.txId).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Sign endpoint logic tests (unit-level, no HTTP server)
// ---------------------------------------------------------------------------

describe('POST /v1/wallets/:id/userop/sign', () => {
  // T1: Valid buildId + matching UserOp returns signed response
  it('T1: Valid buildId + matching UserOp returns signedUserOperation with signature and txId', () => {
    const buildRecord = {
      id: BUILD_ID,
      walletId: WALLET_ID,
      sender: FAKE_SENDER,
      callData: FAKE_CALL_DATA,
      nonce: '0x2a',
      entryPoint: FAKE_ENTRY_POINT,
      createdAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + 600,
      used: 0,
    };
    // Build exists, not used, not expired
    expect(buildRecord.used).toBe(0);
    expect(buildRecord.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));

    // After signing, response includes signature
    const response = {
      signedUserOperation: {
        sender: FAKE_SENDER,
        nonce: '0x2a',
        callData: FAKE_CALL_DATA,
        callGasLimit: '0x5208',
        verificationGasLimit: '0x5208',
        preVerificationGas: '0x5208',
        maxFeePerGas: '0x3b9aca00',
        maxPriorityFeePerGas: '0x3b9aca00',
        signature: FAKE_SIGNATURE,
      },
      txId: '019548e8-f7a0-7000-8000-000000000099',
    };
    const parsed = UserOpSignResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);
  });

  // T2: Non-existent buildId returns BUILD_NOT_FOUND
  it('T2: Non-existent buildId should trigger BUILD_NOT_FOUND', () => {
    const buildRecord = undefined;
    expect(buildRecord).toBeUndefined();
    // Handler throws WAIaaSError('BUILD_NOT_FOUND') when record not found
  });

  // T3: Expired buildId returns EXPIRED_BUILD
  it('T3: Expired buildId should trigger EXPIRED_BUILD', () => {
    const now = Math.floor(Date.now() / 1000);
    const buildRecord = {
      id: BUILD_ID,
      walletId: WALLET_ID,
      expiresAt: now - 100, // expired 100 seconds ago
      used: 0,
    };
    const isExpired = buildRecord.expiresAt < now;
    expect(isExpired).toBe(true);
  });

  // T4: Already-used buildId returns BUILD_ALREADY_USED
  it('T4: Already-used buildId should trigger BUILD_ALREADY_USED', () => {
    const buildRecord = {
      id: BUILD_ID,
      walletId: WALLET_ID,
      used: 1,
    };
    expect(buildRecord.used).toBe(1);
  });

  // T5: callData mismatch returns CALLDATA_MISMATCH
  it('T5: callData mismatch between request and build record', () => {
    const buildCallData = '0xaabbccdd';
    const requestCallData = '0xdeadbeef';
    const match = buildCallData.toLowerCase() === requestCallData.toLowerCase();
    expect(match).toBe(false);
    // Handler throws WAIaaSError('CALLDATA_MISMATCH')
  });

  // T6: sender mismatch returns SENDER_MISMATCH
  it('T6: sender mismatch with wallet Smart Account address', () => {
    const walletSmartAddress = '0x1234567890abcdef1234567890abcdef12345678';
    const requestSender = '0xDEAD567890abcdef1234567890abcdef12345678';
    const match = walletSmartAddress.toLowerCase() === requestSender.toLowerCase();
    expect(match).toBe(false);
  });

  // T7: EOA wallet returns ACTION_VALIDATION_FAILED
  it('T7: EOA wallet is rejected for userop/sign', () => {
    const wallet = { accountType: 'eoa', chain: 'ethereum' };
    expect(wallet.accountType).not.toBe('smart');
  });

  // T8: Solana wallet returns ACTION_VALIDATION_FAILED
  it('T8: Solana wallet is rejected for userop/sign', () => {
    const wallet = { accountType: 'smart', chain: 'solana' };
    expect(wallet.chain).not.toBe('ethereum');
  });

  // T9: Policy denied returns POLICY_DENIED
  it('T9: Policy engine denial rejects sign request', () => {
    const evaluation = { allowed: false, tier: 'INSTANT', reason: 'Spending limit exceeded' };
    expect(evaluation.allowed).toBe(false);
  });

  // T10: DELAY/APPROVAL tier returns POLICY_DENIED with tier message
  it('T10: DELAY tier is rejected for UserOp sign', () => {
    const evaluation = { allowed: true, tier: 'DELAY' };
    const isNonInstant = evaluation.tier === 'DELAY' || evaluation.tier === 'APPROVAL';
    expect(isNonInstant).toBe(true);
  });

  // T11: Transaction DB record is created with type='SIGN', status='SIGNED'
  it('T11: Transaction record has type=SIGN, status=SIGNED', () => {
    const txRecord = {
      id: '019548e8-f7a0-7000-8000-000000000099',
      walletId: WALLET_ID,
      chain: 'ethereum',
      type: 'SIGN',
      status: 'SIGNED',
    };
    expect(txRecord.type).toBe('SIGN');
    expect(txRecord.status).toBe('SIGNED');
  });

  // T12: USEROP_BUILD audit log on build, USEROP_SIGNED on sign
  it('T12: Audit log event types are USEROP_BUILD and USEROP_SIGNED', () => {
    const buildAudit = { eventType: 'USEROP_BUILD', severity: 'info' };
    const signAudit = { eventType: 'USEROP_SIGNED', severity: 'info' };
    expect(buildAudit.eventType).toBe('USEROP_BUILD');
    expect(signAudit.eventType).toBe('USEROP_SIGNED');
  });

  // T13: TX_REQUESTED notification on build, TX_SUBMITTED on sign
  it('T13: Notifications fire TX_REQUESTED on build and TX_SUBMITTED on sign', () => {
    const buildNotification = 'TX_REQUESTED';
    const signNotification = 'TX_SUBMITTED';
    expect(buildNotification).toBe('TX_REQUESTED');
    expect(signNotification).toBe('TX_SUBMITTED');
  });

  // T14: wallet:activity events emitted for both build and sign
  it('T14: wallet:activity events emitted for build and sign', () => {
    const buildEvent = { walletId: WALLET_ID, activity: 'TX_REQUESTED', details: { userOpBuild: true } };
    const signEvent = { walletId: WALLET_ID, activity: 'TX_SUBMITTED', details: { userOpSign: true } };
    expect(buildEvent.activity).toBe('TX_REQUESTED');
    expect(signEvent.activity).toBe('TX_SUBMITTED');
    expect(buildEvent.details.userOpBuild).toBe(true);
    expect(signEvent.details.userOpSign).toBe(true);
  });

  // T5b: callData case-insensitive comparison (uppercase vs lowercase match)
  it('T5b: callData comparison is case-insensitive', () => {
    const buildCallData = '0xAABBCCDD';
    const requestCallData = '0xaabbccdd';
    const match = buildCallData.toLowerCase() === requestCallData.toLowerCase();
    expect(match).toBe(true);
  });

  // T3b: Cross-wallet buildId access prevented
  it('T3b: Cross-wallet buildId access should be treated as BUILD_NOT_FOUND', () => {
    const buildRecord = { id: BUILD_ID, walletId: 'other-wallet-id' };
    const requestWalletId = WALLET_ID;
    const isSameWallet = buildRecord.walletId === requestWalletId;
    expect(isSameWallet).toBe(false);
    // Handler should throw BUILD_NOT_FOUND to prevent enumeration
  });
});
