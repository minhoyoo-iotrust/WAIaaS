/**
 * Solana transaction parsing utilities.
 *
 * Decodes base64 unsigned Solana transactions and identifies operation types:
 * - SystemProgram.transfer -> NATIVE_TRANSFER
 * - SPL Token transferChecked -> TOKEN_TRANSFER
 * - SPL Token approve/approveChecked -> APPROVE
 * - Unknown programs -> CONTRACT_CALL
 *
 * Uses the compiled message decoder to avoid address lookup table issues.
 */

import {
  getTransactionDecoder,
  getCompiledTransactionMessageDecoder,
} from '@solana/kit';
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { ChainError } from '@waiaas/core';
import type { ParsedTransaction, ParsedOperation } from '@waiaas/core';

/** Token-2022 (Token Extensions) Program ID. */
const TOKEN_2022_ADDRESS = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

/** Stateless decoders (safe to share). */
const txDecoder = getTransactionDecoder();
const compiledMessageDecoder = getCompiledTransactionMessageDecoder();

// -- SystemProgram instruction discriminators --
// SystemProgram instructions use a 4-byte LE u32 index prefix.
const SYSTEM_TRANSFER_INDEX = 2;

// -- SPL Token instruction discriminators --
// SPL Token instructions use a 1-byte type prefix.
const SPL_APPROVE = 4;
const SPL_TRANSFER_CHECKED = 12;
const SPL_APPROVE_CHECKED = 13;

/**
 * Parse a base64-encoded unsigned Solana transaction into structured operations.
 *
 * @param rawTx - Base64-encoded unsigned transaction bytes
 * @returns ParsedTransaction with identified operations
 * @throws ChainError('INVALID_RAW_TRANSACTION') if decoding fails
 */
export function parseSolanaTransaction(rawTx: string): ParsedTransaction {
  let txBytes: Uint8Array;
  try {
    txBytes = new Uint8Array(Buffer.from(rawTx, 'base64'));
  } catch {
    throw new ChainError('INVALID_RAW_TRANSACTION', 'solana', {
      message: 'Failed to decode base64 rawTx',
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let compiledMessage: any;
  try {
    // Step 1: Decode wire-format transaction -> { messageBytes, signatures }
    const decoded = txDecoder.decode(txBytes);

    // Step 2: Decode compiled message -> { staticAccounts, instructions, ... }
    compiledMessage = compiledMessageDecoder.decode(decoded.messageBytes);
  } catch (error) {
    throw new ChainError('INVALID_RAW_TRANSACTION', 'solana', {
      message: `Failed to decode Solana transaction: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  // Step 3: Extract operations from each instruction
  const operations: ParsedOperation[] = [];
  const staticAccounts: string[] = compiledMessage.staticAccounts ?? [];
  const instructions: Array<{
    programAddressIndex: number;
    accountIndices?: number[];
    data?: Uint8Array;
  }> = compiledMessage.instructions ?? [];

  for (const instruction of instructions) {
    const programAddress = staticAccounts[instruction.programAddressIndex] ?? '';
    const accountAddresses = (instruction.accountIndices ?? []).map(
      (i: number) => staticAccounts[i] ?? '',
    );
    const data = instruction.data ?? new Uint8Array(0);

    const op = identifyOperation(programAddress, data, accountAddresses);
    operations.push(op);
  }

  return { operations, rawTx };
}

/**
 * Identify the operation type from a single Solana instruction.
 */
function identifyOperation(
  programAddress: string,
  data: Uint8Array,
  accounts: string[],
): ParsedOperation {
  // SystemProgram instructions
  if (programAddress === SYSTEM_PROGRAM_ADDRESS) {
    return parseSystemInstruction(data, accounts);
  }

  // SPL Token or Token-2022 instructions
  if (programAddress === TOKEN_PROGRAM_ADDRESS || programAddress === TOKEN_2022_ADDRESS) {
    return parseTokenInstruction(data, accounts);
  }

  // Unknown program -> CONTRACT_CALL
  return {
    type: 'CONTRACT_CALL',
    programId: programAddress,
    method: data.length >= 8 ? toHex(data.slice(0, 8)) : data.length > 0 ? toHex(data) : undefined,
  };
}

/**
 * Parse a SystemProgram instruction.
 */
function parseSystemInstruction(data: Uint8Array, accounts: string[]): ParsedOperation {
  if (data.length >= 12) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const instrIndex = view.getUint32(0, true); // LE u32

    if (instrIndex === SYSTEM_TRANSFER_INDEX) {
      const lamports = view.getBigUint64(4, true); // LE u64
      return {
        type: 'NATIVE_TRANSFER',
        to: accounts[1], // destination is account[1] in SystemProgram.transfer
        amount: lamports,
      };
    }
  }

  // Other SystemProgram instructions -> CONTRACT_CALL
  return {
    type: 'CONTRACT_CALL',
    programId: SYSTEM_PROGRAM_ADDRESS,
    method: data.length >= 4 ? toHex(data.slice(0, 4)) : undefined,
  };
}

/**
 * Parse an SPL Token (or Token-2022) instruction.
 */
function parseTokenInstruction(data: Uint8Array, accounts: string[]): ParsedOperation {
  if (data.length === 0) {
    return { type: 'UNKNOWN' };
  }

  const instrType = data[0]!;

  // TransferChecked (type 12): amount LE u64 at bytes 1-8
  if (instrType === SPL_TRANSFER_CHECKED && data.length >= 10) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const amount = view.getBigUint64(1, true);
    return {
      type: 'TOKEN_TRANSFER',
      token: accounts[1], // mint is account[1] in transferChecked
      to: accounts[2],    // destination is account[2]
      amount,
    };
  }

  // Approve (type 4) or ApproveChecked (type 13)
  if (instrType === SPL_APPROVE || instrType === SPL_APPROVE_CHECKED) {
    return {
      type: 'APPROVE',
      // For ApproveChecked, mint is account[1]; for Approve, delegate is account[1]
      token: instrType === SPL_APPROVE_CHECKED ? accounts[1] : undefined,
      to: instrType === SPL_APPROVE_CHECKED ? accounts[2] : accounts[1], // delegate
    };
  }

  // Other token instructions -> CONTRACT_CALL
  return {
    type: 'CONTRACT_CALL',
    programId: TOKEN_PROGRAM_ADDRESS,
    method: toHex(data.slice(0, Math.min(data.length, 8))),
  };
}

/**
 * Convert bytes to hex string (lowercase, no prefix).
 */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
