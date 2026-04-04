/**
 * XRPL transaction parser for sign-only operations.
 *
 * Parses raw XRPL transaction JSON into structured ParsedTransaction format.
 * Supports Payment (native + IOU), TrustSet, and unknown transaction types.
 */

import type { ParsedTransaction, ParsedOperation, ParsedOperationType } from '@waiaas/core';
import { iouToSmallestUnit, IOU_DECIMALS } from './currency-utils.js';

/**
 * Parse a raw XRPL transaction JSON string into structured operations.
 */
export function parseRippleTransaction(rawTx: string): ParsedTransaction {
  const tx = JSON.parse(rawTx) as Record<string, unknown>;
  const operations: ParsedOperation[] = [];

  const txType = tx['TransactionType'] as string | undefined;

  if (txType === 'Payment') {
    const amount = tx['Amount'];
    let type: ParsedOperationType;
    let token: string | undefined;
    let parsedAmount: bigint | undefined;

    if (typeof amount === 'string') {
      // Native XRP transfer (amount in drops)
      type = 'NATIVE_TRANSFER';
      parsedAmount = BigInt(amount);
    } else if (typeof amount === 'object' && amount !== null) {
      // IOU token transfer
      type = 'TOKEN_TRANSFER';
      const amountObj = amount as { currency?: string; issuer?: string; value?: string };
      token = `${amountObj.currency ?? 'unknown'}.${amountObj.issuer ?? 'unknown'}`;
      // IOU values: convert to 15-decimal smallest unit for full precision
      try {
        const value = amountObj.value ?? '0';
        parsedAmount = iouToSmallestUnit(value, IOU_DECIMALS);
      } catch {
        parsedAmount = 0n;
      }
    } else {
      type = 'UNKNOWN';
    }

    operations.push({
      type,
      to: tx['Destination'] as string | undefined,
      amount: parsedAmount,
      token,
    });
  } else if (txType === 'TrustSet') {
    const limitAmount = tx['LimitAmount'] as { currency?: string; issuer?: string; value?: string } | undefined;
    operations.push({
      type: 'APPROVE',
      to: limitAmount?.issuer,
      token: limitAmount ? `${limitAmount.currency ?? 'unknown'}.${limitAmount.issuer ?? 'unknown'}` : undefined,
    });
  } else if (txType === 'OfferCreate') {
    // DEX offer: TakerGets is what the Account gives (= spending amount)
    const takerGets = tx['TakerGets'];
    let parsedAmount: bigint | undefined;
    let token: string | undefined;

    if (typeof takerGets === 'string') {
      // XRP in drops
      parsedAmount = BigInt(takerGets);
    } else if (typeof takerGets === 'object' && takerGets !== null) {
      const iou = takerGets as { currency?: string; issuer?: string; value?: string };
      token = `${iou.currency ?? 'unknown'}.${iou.issuer ?? 'unknown'}`;
      try {
        parsedAmount = iouToSmallestUnit(iou.value ?? '0', IOU_DECIMALS);
      } catch {
        parsedAmount = 0n;
      }
    }

    operations.push({
      type: 'CONTRACT_CALL',
      amount: parsedAmount,
      token,
      method: 'OfferCreate',
    });
  } else if (txType === 'OfferCancel') {
    operations.push({
      type: 'CONTRACT_CALL',
      method: 'OfferCancel',
    });
  } else {
    operations.push({
      type: 'UNKNOWN',
      method: txType,
    });
  }

  return { operations, rawTx };
}
