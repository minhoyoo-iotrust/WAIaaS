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

  it('parses genuinely unknown TransactionType as UNKNOWN', () => {
    const rawTx = JSON.stringify({
      TransactionType: 'AccountDelete',
      Account: 'rSender',
    });

    const result = parseRippleTransaction(rawTx);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]!.type).toBe('UNKNOWN');
    expect(result.operations[0]!.method).toBe('AccountDelete');
  });

  // -- OfferCreate/OfferCancel parsing --

  describe('OfferCreate/OfferCancel parsing', () => {
    it('parses OfferCreate with XRP TakerGets as CONTRACT_CALL', () => {
      const rawTx = JSON.stringify({
        TransactionType: 'OfferCreate',
        Account: 'rSender',
        TakerGets: '50000000', // 50 XRP in drops
        TakerPays: { currency: 'USD', issuer: 'rIssuer', value: '100' },
      });

      const result = parseRippleTransaction(rawTx);
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]!.type).toBe('CONTRACT_CALL');
      expect(result.operations[0]!.method).toBe('OfferCreate');
      expect(result.operations[0]!.amount).toBe(50_000_000n);
      expect(result.operations[0]!.token).toBeUndefined();
    });

    it('parses OfferCreate with IOU TakerGets as CONTRACT_CALL', () => {
      const rawTx = JSON.stringify({
        TransactionType: 'OfferCreate',
        Account: 'rSender',
        TakerGets: { currency: 'USD', issuer: 'rIssuer', value: '100' },
        TakerPays: '50000000',
      });

      const result = parseRippleTransaction(rawTx);
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]!.type).toBe('CONTRACT_CALL');
      expect(result.operations[0]!.method).toBe('OfferCreate');
      // 100 * 10^15 = 100_000_000_000_000_000n
      expect(result.operations[0]!.amount).toBe(100_000_000_000_000_000n);
      expect(result.operations[0]!.token).toBe('USD.rIssuer');
    });

    it('parses OfferCreate with IOU/IOU pair', () => {
      const rawTx = JSON.stringify({
        TransactionType: 'OfferCreate',
        Account: 'rSender',
        TakerGets: { currency: 'EUR', issuer: 'rEuroBank', value: '200.5' },
        TakerPays: { currency: 'USD', issuer: 'rIssuer', value: '250' },
      });

      const result = parseRippleTransaction(rawTx);
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]!.type).toBe('CONTRACT_CALL');
      expect(result.operations[0]!.method).toBe('OfferCreate');
      // 200.5 * 10^15 = 200_500_000_000_000_000n
      expect(result.operations[0]!.amount).toBe(200_500_000_000_000_000n);
      expect(result.operations[0]!.token).toBe('EUR.rEuroBank');
    });

    it('parses OfferCancel as CONTRACT_CALL', () => {
      const rawTx = JSON.stringify({
        TransactionType: 'OfferCancel',
        Account: 'rSender',
        OfferSequence: 12345,
      });

      const result = parseRippleTransaction(rawTx);
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]!.type).toBe('CONTRACT_CALL');
      expect(result.operations[0]!.method).toBe('OfferCancel');
      expect(result.operations[0]!.amount).toBeUndefined();
    });
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

  it('parses IOU Payment with improved 15-decimal precision', () => {
    const rawTx = JSON.stringify({
      TransactionType: 'Payment',
      Account: 'rSender',
      Destination: 'rReceiver',
      Amount: {
        currency: 'USD',
        issuer: 'rIssuer',
        value: '100.5',
      },
    });

    const result = parseRippleTransaction(rawTx);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]!.type).toBe('TOKEN_TRANSFER');
    // 100.5 * 10^15 = 100_500_000_000_000_000n (15-decimal precision)
    expect(result.operations[0]!.amount).toBe(100_500_000_000_000_000n);
  });

  it('parses TrustSet as APPROVE with token', () => {
    const rawTx = JSON.stringify({
      TransactionType: 'TrustSet',
      Account: 'rSender',
      LimitAmount: {
        currency: 'EUR',
        issuer: 'rEuropeanBank',
        value: '5000',
      },
      Flags: 131072,
    });

    const result = parseRippleTransaction(rawTx);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]!.type).toBe('APPROVE');
    expect(result.operations[0]!.to).toBe('rEuropeanBank');
    expect(result.operations[0]!.token).toBe('EUR.rEuropeanBank');
  });
});
