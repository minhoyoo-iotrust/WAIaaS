/**
 * XRPL transaction parser tests.
 */

import { describe, it, expect } from 'vitest';
import { parseRippleTransaction } from '../tx-parser.js';

describe('parseRippleTransaction', () => {
  it('parses native XRP Payment (drops string Amount)', () => {
    const rawTx = JSON.stringify({
      TransactionType: 'Payment',
      Account: 'rSender',
      Destination: 'rReceiver',
      Amount: '1000000',
    });

    const result = parseRippleTransaction(rawTx);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]!.type).toBe('NATIVE_TRANSFER');
    expect(result.operations[0]!.to).toBe('rReceiver');
    expect(result.operations[0]!.amount).toBe(1_000_000n);
    expect(result.rawTx).toBe(rawTx);
  });

  it('parses IOU token Payment (object Amount)', () => {
    const rawTx = JSON.stringify({
      TransactionType: 'Payment',
      Account: 'rSender',
      Destination: 'rReceiver',
      Amount: {
        currency: 'USD',
        issuer: 'rIssuer',
        value: '100',
      },
    });

    const result = parseRippleTransaction(rawTx);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]!.type).toBe('TOKEN_TRANSFER');
    expect(result.operations[0]!.to).toBe('rReceiver');
    expect(result.operations[0]!.token).toBe('USD.rIssuer');
  });

  it('parses TrustSet as APPROVE', () => {
    const rawTx = JSON.stringify({
      TransactionType: 'TrustSet',
      Account: 'rSender',
      LimitAmount: {
        currency: 'USD',
        issuer: 'rGateway',
        value: '1000',
      },
    });

    const result = parseRippleTransaction(rawTx);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]!.type).toBe('APPROVE');
    expect(result.operations[0]!.to).toBe('rGateway');
    expect(result.operations[0]!.token).toBe('USD.rGateway');
  });

  it('parses unknown TransactionType as UNKNOWN', () => {
    const rawTx = JSON.stringify({
      TransactionType: 'OfferCreate',
      Account: 'rSender',
    });

    const result = parseRippleTransaction(rawTx);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]!.type).toBe('UNKNOWN');
    expect(result.operations[0]!.method).toBe('OfferCreate');
  });

  it('handles Payment with unexpected Amount type as UNKNOWN', () => {
    const rawTx = JSON.stringify({
      TransactionType: 'Payment',
      Account: 'rSender',
      Destination: 'rReceiver',
      Amount: 12345, // neither string nor object
    });

    const result = parseRippleTransaction(rawTx);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]!.type).toBe('UNKNOWN');
  });

  it('handles TrustSet without LimitAmount', () => {
    const rawTx = JSON.stringify({
      TransactionType: 'TrustSet',
      Account: 'rSender',
    });

    const result = parseRippleTransaction(rawTx);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]!.type).toBe('APPROVE');
    expect(result.operations[0]!.to).toBeUndefined();
  });
});
