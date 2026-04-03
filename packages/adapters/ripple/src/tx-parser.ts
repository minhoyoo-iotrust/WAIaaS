/**
 * XRPL transaction parser for sign-only operations.
 *
 * Parses raw XRPL transaction JSON into structured ParsedTransaction format.
 * Supports Payment (native + IOU), TrustSet, and unknown transaction types.
 */

import type { ParsedTransaction, ParsedOperation, ParsedOperationType } from '@waiaas/core';

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
      // IOU values are decimal strings, store as-is converted to smallest unit
      // For IOU tokens, precision varies; store raw value as bigint of the integer part
      try {
        const value = amountObj.value ?? '0';
        parsedAmount = BigInt(Math.floor(Number(value) * 1e6));
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
  } else {
    operations.push({
      type: 'UNKNOWN',
      method: txType,
    });
  }

  return { operations, rawTx };
}
