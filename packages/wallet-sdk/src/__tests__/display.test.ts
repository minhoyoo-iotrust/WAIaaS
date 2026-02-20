import { describe, it, expect } from 'vitest';
import type { SignRequest } from '@waiaas/core';
import { formatDisplayMessage } from '../display.js';

function makeRequest(overrides?: Partial<SignRequest>): SignRequest {
  return {
    version: '1',
    requestId: '550e8400-e29b-41d4-a716-446655440000',
    chain: 'solana',
    network: 'devnet',
    message: 'SGVsbG8=',
    displayMessage: 'Transfer 1 SOL',
    metadata: {
      txId: '550e8400-e29b-41d4-a716-446655440001',
      type: 'TRANSFER',
      from: 'So1addr1',
      to: 'So1addr2',
      amount: '1.0',
      symbol: 'SOL',
      policyTier: 'APPROVAL',
    },
    responseChannel: {
      type: 'ntfy',
      responseTopic: 'waiaas-resp-abc123',
    },
    expiresAt: '2026-12-31T23:59:59.000Z',
    ...overrides,
  };
}

describe('formatDisplayMessage', () => {
  it('should include Amount line for TRANSFER with amount and symbol', () => {
    const request = makeRequest();
    const message = formatDisplayMessage(request);

    expect(message).toContain('Transaction Approval Request');
    expect(message).toContain('Type: TRANSFER');
    expect(message).toContain('From: So1addr1');
    expect(message).toContain('To: So1addr2');
    expect(message).toContain('Amount: 1.0 SOL');
    expect(message).toContain('Network: devnet');
    expect(message).toContain('Policy: APPROVAL');
    expect(message).toContain('Expires: 2026-12-31T23:59:59.000Z');
  });

  it('should omit Amount line for CONTRACT_CALL without amount', () => {
    const request = makeRequest({
      metadata: {
        txId: '550e8400-e29b-41d4-a716-446655440001',
        type: 'CONTRACT_CALL',
        from: '0xSender',
        to: '0xContract',
        policyTier: 'DELAY',
      },
    });

    const message = formatDisplayMessage(request);

    expect(message).toContain('Type: CONTRACT_CALL');
    expect(message).not.toContain('Amount:');
    expect(message).toContain('Policy: DELAY');
  });

  it('should format all fields accurately', () => {
    const request = makeRequest({
      network: 'mainnet-beta',
      metadata: {
        txId: '550e8400-e29b-41d4-a716-446655440001',
        type: 'TOKEN_TRANSFER',
        from: 'Wallet1',
        to: 'Wallet2',
        amount: '100',
        symbol: 'USDC',
        policyTier: 'APPROVAL',
      },
      expiresAt: '2026-06-15T12:00:00.000Z',
    });

    const lines = formatDisplayMessage(request).split('\n');

    expect(lines[0]).toBe('Transaction Approval Request');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('Type: TOKEN_TRANSFER');
    expect(lines[3]).toBe('From: Wallet1');
    expect(lines[4]).toBe('To: Wallet2');
    expect(lines[5]).toBe('Amount: 100 USDC');
    expect(lines[6]).toBe('Network: mainnet-beta');
    expect(lines[7]).toBe('Policy: APPROVAL');
    expect(lines[8]).toBe('Expires: 2026-06-15T12:00:00.000Z');
  });

  it('should omit Amount when symbol present but amount is undefined', () => {
    const request = makeRequest({
      metadata: {
        txId: '550e8400-e29b-41d4-a716-446655440001',
        type: 'APPROVE',
        from: '0xOwner',
        to: '0xSpender',
        symbol: 'USDT',
        policyTier: 'APPROVAL',
      },
    });

    const message = formatDisplayMessage(request);
    expect(message).not.toContain('Amount:');
  });
});
