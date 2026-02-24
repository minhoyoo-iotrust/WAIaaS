/**
 * SPL Stake Pool instruction encoding for Jito.
 *
 * Builds DepositSol and WithdrawSol instructions locally using zero external
 * Solana SDK dependencies. Uses Node.js `node:crypto` for PDA derivation.
 *
 * The SolanaAdapter reconstructs TransactionInstructions from `programId`,
 * `instructionData` (base64), and `accounts` -- so the provider must supply
 * all resolved addresses.
 *
 * SPL Stake Pool instruction indices:
 * - DepositSol = 14
 * - WithdrawSol = 16
 */
import { createHash } from 'node:crypto';
import type { ChainError as ChainErrorType } from '@waiaas/core';
import {
  type JitoStakingConfig,
  JITO_WITHDRAW_AUTHORITY,
  JITO_RESERVE_STAKE,
  JITO_MANAGER_FEE,
  SPL_TOKEN_PROGRAM,
  SYSTEM_PROGRAM,
} from './config.js';

// Re-export ChainError dynamically to avoid circular issues
let _ChainError: typeof ChainErrorType;

async function getChainError(): Promise<typeof ChainErrorType> {
  if (!_ChainError) {
    const mod = await import('@waiaas/core');
    _ChainError = mod.ChainError;
  }
  return _ChainError;
}

// ---------------------------------------------------------------------------
// Base58 encoder/decoder (Bitcoin alphabet)
// ---------------------------------------------------------------------------

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP = new Uint8Array(128);
for (let i = 0; i < 128; i++) BASE58_MAP[i] = 255;
for (let i = 0; i < 58; i++) BASE58_MAP[BASE58_ALPHABET.charCodeAt(i)!] = i;

/**
 * Decode a base58 string to bytes.
 */
export function base58Decode(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);

  // Count leading '1's (they represent leading zero bytes)
  let leadingZeros = 0;
  for (let i = 0; i < str.length && str[i] === '1'; i++) leadingZeros++;

  // Allocate enough space (base58 is ~log(256)/log(58) ratio)
  const size = Math.ceil((str.length * 733) / 1000) + 1;
  const b256 = new Uint8Array(size);

  for (let i = leadingZeros; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    const digit = ch < 128 ? BASE58_MAP[ch]! : 255;
    if (digit === 255) throw new Error(`Invalid base58 character: ${str[i]}`);

    let carry = digit;
    for (let j = size - 1; j >= 0; j--) {
      carry += 58 * b256[j]!;
      b256[j] = carry % 256;
      carry = Math.floor(carry / 256);
    }
  }

  // Skip leading zeros in b256 that are not part of the result
  let start = 0;
  while (start < size && b256[start] === 0) start++;

  const result = new Uint8Array(leadingZeros + (size - start));
  for (let i = 0; i < leadingZeros; i++) result[i] = 0;
  for (let i = start; i < size; i++) result[leadingZeros + i - start] = b256[i]!;

  return result;
}

/**
 * Encode bytes to a base58 string.
 */
export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';

  // Count leading zeros
  let leadingZeros = 0;
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) leadingZeros++;

  // Allocate enough space
  const size = Math.ceil((bytes.length * 138) / 100) + 1;
  const b58 = new Uint8Array(size);

  for (let i = leadingZeros; i < bytes.length; i++) {
    let carry = bytes[i]!;
    for (let j = size - 1; j >= 0; j--) {
      carry += 256 * b58[j]!;
      b58[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
  }

  // Skip leading zeros in b58
  let start = 0;
  while (start < size && b58[start] === 0) start++;

  let result = '1'.repeat(leadingZeros);
  for (let i = start; i < size; i++) {
    result += BASE58_ALPHABET[b58[i]!];
  }

  return result;
}

// ---------------------------------------------------------------------------
// Ed25519 on-curve check + PDA derivation
// ---------------------------------------------------------------------------

/**
 * Check if a 32-byte point is on the Ed25519 curve using Node.js 22 crypto.subtle.
 */
async function isOnCurve(point: Uint8Array): Promise<boolean> {
  try {
    await crypto.subtle.importKey(
      'raw',
      point.buffer.slice(point.byteOffset, point.byteOffset + point.byteLength) as ArrayBuffer,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Find a program-derived address (PDA) for the given seeds and program ID.
 *
 * @param seeds - Array of seed buffers
 * @param programId - Program ID as bytes (32 bytes)
 * @returns [address_bytes (32), bump (number)]
 */
export async function findProgramAddress(
  seeds: Uint8Array[],
  programId: Uint8Array,
): Promise<[Uint8Array, number]> {
  const PDA_MARKER = new TextEncoder().encode('ProgramDerivedAddress');

  for (let bump = 255; bump >= 0; bump--) {
    const hashInput: Uint8Array[] = [
      ...seeds,
      new Uint8Array([bump]),
      programId,
      PDA_MARKER,
    ];

    // Concatenate all parts
    let totalLen = 0;
    for (const part of hashInput) totalLen += part.length;
    const buffer = new Uint8Array(totalLen);
    let offset = 0;
    for (const part of hashInput) {
      buffer.set(part, offset);
      offset += part.length;
    }

    const hash = createHash('sha256').update(buffer).digest();
    const hashBytes = new Uint8Array(hash);

    if (!(await isOnCurve(hashBytes))) {
      return [hashBytes, bump];
    }
  }

  throw new Error('Could not find a valid PDA');
}

// ---------------------------------------------------------------------------
// Associated Token Address derivation
// ---------------------------------------------------------------------------

/** Associated Token Account Program ID. */
const ATA_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

/**
 * Derive the Associated Token Address (ATA) for a wallet and mint.
 *
 * @param wallet - Wallet public key (base58)
 * @param mint - Token mint address (base58)
 * @param tokenProgram - Token program ID (base58), defaults to SPL Token
 * @returns ATA public key as base58 string
 */
export async function getAssociatedTokenAddress(
  wallet: string,
  mint: string,
  tokenProgram: string = SPL_TOKEN_PROGRAM,
): Promise<string> {
  const walletBytes = base58Decode(wallet);
  const mintBytes = base58Decode(mint);
  const tokenProgramBytes = base58Decode(tokenProgram);
  const ataProgramBytes = base58Decode(ATA_PROGRAM_ID);

  const [address] = await findProgramAddress(
    [walletBytes, tokenProgramBytes, mintBytes],
    ataProgramBytes,
  );

  return base58Encode(address);
}

// ---------------------------------------------------------------------------
// Instruction data encoding
// ---------------------------------------------------------------------------

/**
 * Encode DepositSol instruction data (index 14 + LE u64 amount).
 * @returns base64-encoded instruction data
 */
export function encodeDepositSolData(amountLamports: bigint): string {
  const buffer = new Uint8Array(9); // 1 byte index + 8 bytes u64
  buffer[0] = 14; // DepositSol instruction index
  const view = new DataView(buffer.buffer);
  view.setBigUint64(1, amountLamports, true); // little-endian
  return Buffer.from(buffer).toString('base64');
}

/**
 * Encode WithdrawSol instruction data (index 16 + LE u64 amount).
 * @returns base64-encoded instruction data
 */
export function encodeWithdrawSolData(amountLamports: bigint): string {
  const buffer = new Uint8Array(9); // 1 byte index + 8 bytes u64
  buffer[0] = 16; // WithdrawSol instruction index
  const view = new DataView(buffer.buffer);
  view.setBigUint64(1, amountLamports, true); // little-endian
  return Buffer.from(buffer).toString('base64');
}

// ---------------------------------------------------------------------------
// Amount parsing
// ---------------------------------------------------------------------------

/**
 * Parse a human-readable SOL amount string to lamports (bigint).
 * SOL has 9 decimals (not 18 like ETH).
 *
 * "1.5" -> 1500000000n (1.5 SOL in lamports)
 *
 * @throws ChainError if amount is zero or negative
 */
export async function parseSolAmount(amount: string): Promise<bigint> {
  const parts = amount.split('.');
  const whole = BigInt(parts[0] || '0');
  const decimals = (parts[1] || '').padEnd(9, '0').slice(0, 9);
  const result = whole * 10n ** 9n + BigInt(decimals);

  if (result <= 0n) {
    const ChainError = await getChainError();
    throw new ChainError('INVALID_INSTRUCTION', 'solana', {
      message: 'Amount must be greater than 0',
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Sysvar and program addresses for WithdrawSol
// ---------------------------------------------------------------------------

const CLOCK_SYSVAR = 'SysvarC1ock11111111111111111111111111111111';
const STAKE_HISTORY_SYSVAR = 'SysvarStakeHistory1111111111111111111111111';
const STAKE_PROGRAM = 'Stake11111111111111111111111111111111111111';

// ---------------------------------------------------------------------------
// ContractCallRequest builders
// ---------------------------------------------------------------------------

/** Account meta for Solana instruction accounts. */
interface AccountMeta {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

/**
 * Build a ContractCallRequest for SPL Stake Pool DepositSol.
 *
 * SPL Stake Pool DepositSol accounts (in order):
 * 0. stakePool (writable)
 * 1. withdrawAuthority (PDA, read-only)
 * 2. reserveStake (writable)
 * 3. fundingAccount (signer, writable) = wallet
 * 4. destTokenAccount (writable) = wallet's JitoSOL ATA
 * 5. managerFeeAccount (writable)
 * 6. referralFeeAccount (writable) = same as managerFeeAccount (no referral)
 * 7. poolMint (writable) = JitoSOL mint
 * 8. systemProgram (read-only)
 * 9. tokenProgram (read-only)
 */
export async function buildDepositSolRequest(
  config: JitoStakingConfig,
  amountLamports: bigint,
  walletAddress: string,
): Promise<{
  type: 'CONTRACT_CALL';
  to: string;
  programId: string;
  instructionData: string;
  accounts: AccountMeta[];
  value: string;
}> {
  const destTokenAccount = await getAssociatedTokenAddress(
    walletAddress,
    config.jitosolMint,
    SPL_TOKEN_PROGRAM,
  );

  const accounts: AccountMeta[] = [
    { pubkey: config.stakePoolAddress, isSigner: false, isWritable: true },
    { pubkey: JITO_WITHDRAW_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: JITO_RESERVE_STAKE, isSigner: false, isWritable: true },
    { pubkey: walletAddress, isSigner: true, isWritable: true },
    { pubkey: destTokenAccount, isSigner: false, isWritable: true },
    { pubkey: JITO_MANAGER_FEE, isSigner: false, isWritable: true },
    { pubkey: JITO_MANAGER_FEE, isSigner: false, isWritable: true }, // referral = manager (no referral)
    { pubkey: config.jitosolMint, isSigner: false, isWritable: true },
    { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: SPL_TOKEN_PROGRAM, isSigner: false, isWritable: false },
  ];

  return {
    type: 'CONTRACT_CALL' as const,
    to: config.stakePoolAddress,
    programId: config.stakePoolProgram,
    instructionData: encodeDepositSolData(amountLamports),
    accounts,
    value: amountLamports.toString(),
  };
}

/**
 * Build a ContractCallRequest for SPL Stake Pool WithdrawSol.
 *
 * SPL Stake Pool WithdrawSol accounts (in order):
 * 0. stakePool (writable)
 * 1. withdrawAuthority (PDA, read-only)
 * 2. userTransferAuthority (signer) = wallet
 * 3. sourceTokenAccount (writable) = wallet's JitoSOL ATA
 * 4. reserveStake (writable)
 * 5. destSolAccount (writable) = wallet (receives SOL)
 * 6. managerFeeAccount (writable)
 * 7. poolMint (writable) = JitoSOL mint
 * 8. clock (read-only)
 * 9. stakeHistory (read-only)
 * 10. stakeProgram (read-only)
 * 11. tokenProgram (read-only)
 */
export async function buildWithdrawSolRequest(
  config: JitoStakingConfig,
  amountLamports: bigint,
  walletAddress: string,
): Promise<{
  type: 'CONTRACT_CALL';
  to: string;
  programId: string;
  instructionData: string;
  accounts: AccountMeta[];
}> {
  const sourceTokenAccount = await getAssociatedTokenAddress(
    walletAddress,
    config.jitosolMint,
    SPL_TOKEN_PROGRAM,
  );

  const accounts: AccountMeta[] = [
    { pubkey: config.stakePoolAddress, isSigner: false, isWritable: true },
    { pubkey: JITO_WITHDRAW_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: walletAddress, isSigner: true, isWritable: false },
    { pubkey: sourceTokenAccount, isSigner: false, isWritable: true },
    { pubkey: JITO_RESERVE_STAKE, isSigner: false, isWritable: true },
    { pubkey: walletAddress, isSigner: false, isWritable: true },
    { pubkey: JITO_MANAGER_FEE, isSigner: false, isWritable: true },
    { pubkey: config.jitosolMint, isSigner: false, isWritable: true },
    { pubkey: CLOCK_SYSVAR, isSigner: false, isWritable: false },
    { pubkey: STAKE_HISTORY_SYSVAR, isSigner: false, isWritable: false },
    { pubkey: STAKE_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: SPL_TOKEN_PROGRAM, isSigner: false, isWritable: false },
  ];

  return {
    type: 'CONTRACT_CALL' as const,
    to: config.stakePoolAddress,
    programId: config.stakePoolProgram,
    instructionData: encodeWithdrawSolData(amountLamports),
    accounts,
  };
}
