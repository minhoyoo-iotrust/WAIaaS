/**
 * EVM transaction parsing utilities for sign-only operations.
 *
 * Parses unsigned EIP-1559 hex transactions into ParsedTransaction
 * with operation classification: NATIVE_TRANSFER, TOKEN_TRANSFER,
 * APPROVE, or CONTRACT_CALL.
 *
 * Phase 115-03: Initial implementation.
 */

import { parseTransaction as viemParseTransaction, type Hex } from 'viem';
import type { ParsedTransaction, ParsedOperation } from '@waiaas/core';
import { ChainError } from '@waiaas/core';

/** ERC-20 transfer(address,uint256) function selector. */
const ERC20_TRANSFER_SELECTOR = '0xa9059cbb';

/** ERC-20 approve(address,uint256) function selector. */
const ERC20_APPROVE_SELECTOR = '0x095ea7b3';

/**
 * Parse an unsigned EVM transaction hex into a structured ParsedTransaction.
 *
 * Classification logic:
 * - No calldata (or '0x'): NATIVE_TRANSFER
 * - Calldata present:
 *   - transfer(address,uint256) selector: TOKEN_TRANSFER
 *   - approve(address,uint256) selector: APPROVE
 *   - Other: CONTRACT_CALL
 * - Value + calldata: CONTRACT_CALL (calldata takes priority over value)
 *
 * @param rawTx - Hex-encoded unsigned EVM transaction
 * @returns ParsedTransaction with operations array
 * @throws ChainError('INVALID_RAW_TRANSACTION', 'evm') on parse failure
 */
export function parseEvmTransaction(rawTx: string): ParsedTransaction {
  let parsed: ReturnType<typeof viemParseTransaction>;

  try {
    parsed = viemParseTransaction(rawTx as Hex);
  } catch {
    throw new ChainError('INVALID_RAW_TRANSACTION', 'evm', {
      message: `Failed to parse EVM transaction: invalid raw transaction data`,
    });
  }

  const { to, value, data } = parsed;
  const operations: ParsedOperation[] = [];

  if (!data || data === '0x') {
    // No calldata: native ETH transfer
    operations.push({
      type: 'NATIVE_TRANSFER',
      to: to ?? undefined,
      amount: value ?? 0n,
    });
  } else {
    // Has calldata: classify by function selector
    const selector = data.slice(0, 10).toLowerCase();

    if (selector === ERC20_TRANSFER_SELECTOR) {
      // ERC-20 transfer(address,uint256)
      // ABI encoding: 0x + 4-byte selector (8 chars) + 32-byte address (64 chars) + 32-byte amount (64 chars)
      // Address at offset 10+24=34, length 40 (20-byte address zero-padded to 32 bytes)
      const recipient = '0x' + data.slice(34, 74);
      const amount = BigInt('0x' + data.slice(74, 138));
      operations.push({
        type: 'TOKEN_TRANSFER',
        token: to ?? undefined,
        to: recipient,
        amount,
      });
    } else if (selector === ERC20_APPROVE_SELECTOR) {
      // ERC-20 approve(address,uint256)
      const spender = '0x' + data.slice(34, 74);
      const amount = BigInt('0x' + data.slice(74, 138));
      operations.push({
        type: 'APPROVE',
        token: to ?? undefined,
        to: spender,
        amount,
      });
    } else {
      // Unknown function: generic contract call
      operations.push({
        type: 'CONTRACT_CALL',
        programId: to ?? undefined,
        method: selector,
      });
    }
  }

  return { operations, rawTx };
}
