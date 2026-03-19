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
import { parseTokenAmount } from '../../common/amount-parser.js';
import {
  type JitoStakingConfig,
  JITO_WITHDRAW_AUTHORITY,
  SPL_TOKEN_PROGRAM,
  SYSTEM_PROGRAM,
} from './config.js';

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

// Ed25519 prime: p = 2^255 - 19
const ED25519_P = (1n << 255n) - 19n;

// Ed25519 curve constant d = -121665/121666 mod p
// d = -121665 * modInverse(121666, p) mod p
const ED25519_D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;

/**
 * Modular exponentiation: base^exp mod m using square-and-multiply.
 */
function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  let result = 1n;
  base = ((base % m) + m) % m;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % m;
    exp >>= 1n;
    base = (base * base) % m;
  }
  return result;
}

/**
 * Check if a 32-byte compressed Ed25519 point represents a valid curve point.
 *
 * Ed25519 encoding: 32 bytes, little-endian y-coordinate, high bit of last byte = sign of x.
 * A point is on curve if we can recover x from y using: x^2 = (y^2 - 1) / (d*y^2 + 1) mod p
 * and the square root exists.
 */
function isOnCurve(point: Uint8Array): boolean {
  if (point.length !== 32) return false;

  // Decode y from little-endian bytes (clear the sign bit from the last byte)
  const lastByte = point[31]!;
  const yBytes = new Uint8Array(point);
  yBytes[31] = lastByte & 0x7f; // clear sign bit

  let y = 0n;
  for (let i = 0; i < 32; i++) {
    y |= BigInt(yBytes[i]!) << BigInt(i * 8);
  }

  // y must be < p
  if (y >= ED25519_P) return false;

  // Compute x^2 = (y^2 - 1) / (d*y^2 + 1) mod p
  const y2 = (y * y) % ED25519_P;
  const numerator = ((y2 - 1n) % ED25519_P + ED25519_P) % ED25519_P;
  const denominator = ((ED25519_D * y2 + 1n) % ED25519_P + ED25519_P) % ED25519_P;

  // denominator inverse: denom^(p-2) mod p (Fermat's little theorem)
  const denomInv = modPow(denominator, ED25519_P - 2n, ED25519_P);
  const x2 = (numerator * denomInv) % ED25519_P;

  if (x2 === 0n) {
    // x = 0, valid if sign bit is 0
    return (lastByte & 0x80) === 0;
  }

  // Check if x^2 has a square root mod p
  // x = x2^((p+3)/8) mod p (since p ≡ 5 mod 8)
  const x = modPow(x2, (ED25519_P + 3n) / 8n, ED25519_P);

  if ((x * x) % ED25519_P === x2) return true;

  // Try x * sqrt(-1): sqrt(-1) = 2^((p-1)/4) mod p
  const sqrtM1 = modPow(2n, (ED25519_P - 1n) / 4n, ED25519_P);
  const x2Alt = (x * sqrtM1) % ED25519_P;

  return (x2Alt * x2Alt) % ED25519_P === x2;
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

    if (!isOnCurve(hashBytes)) {
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
// Position query helpers
// ---------------------------------------------------------------------------

/**
 * Fetch jitoSOL token balance for a wallet via getTokenAccountsByOwner RPC.
 *
 * @returns Balance info or null if no token account found
 */
export async function getJitoSolBalance(
  rpcUrl: string,
  walletAddress: string,
  jitosolMint: string,
): Promise<{ amount: bigint; uiAmount: number } | null> {
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenAccountsByOwner',
      params: [
        walletAddress,
        { mint: jitosolMint },
        { encoding: 'jsonParsed' },
      ],
    }),
  });

  const json = (await resp.json()) as {
    result: {
      value: Array<{
        account: {
          data: {
            parsed: {
              info: {
                tokenAmount: {
                  amount: string;
                  uiAmount: number;
                };
              };
            };
          };
        };
      }>;
    };
  };

  const accounts = json.result?.value;
  if (!accounts || accounts.length === 0) return null;

  const tokenAmount = accounts[0]!.account.data.parsed.info.tokenAmount;
  return {
    amount: BigInt(tokenAmount.amount),
    uiAmount: tokenAmount.uiAmount,
  };
}

/**
 * Fetch the raw stake pool account data buffer from the RPC.
 *
 * @returns Buffer containing the Borsh-serialized stake pool account data
 */
async function fetchStakePoolAccountData(
  rpcUrl: string,
  stakePoolAddress: string,
): Promise<Buffer> {
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getAccountInfo',
      params: [stakePoolAddress, { encoding: 'base64' }],
    }),
  });

  const json = (await resp.json()) as {
    result: {
      value: {
        data: [string, string]; // [base64_data, encoding]
      } | null;
    };
  };

  if (!json.result?.value?.data) {
    throw new Error(`Stake pool account not found: ${stakePoolAddress}`);
  }

  const base64Data = json.result.value.data[0];
  return Buffer.from(base64Data, 'base64');
}

/**
 * Fetch the SPL Stake Pool exchange rate (total_lamports / pool_token_supply).
 *
 * SPL Stake Pool account layout:
 * - total_lamports: u64 LE at byte offset 258
 * - pool_token_supply: u64 LE at byte offset 266
 *
 * @returns Exchange rate as floating point (SOL per pool token)
 */
export async function getStakePoolExchangeRate(
  rpcUrl: string,
  stakePoolAddress: string,
): Promise<number> {
  const buffer = await fetchStakePoolAccountData(rpcUrl, stakePoolAddress);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const totalLamports = view.getBigUint64(258, true);
  const poolTokenSupply = view.getBigUint64(266, true);

  if (poolTokenSupply === 0n) return 1.0;
  return Number(totalLamports) / Number(poolTokenSupply);
}

/**
 * Fetch and parse key accounts from the on-chain SPL Stake Pool account data.
 *
 * SPL Stake Pool Borsh layout (relevant offsets):
 * - reserve_stake:       32 bytes at offset 130
 * - manager_fee_account: 32 bytes at offset 194
 *
 * @returns Parsed stake pool accounts as base58-encoded public keys
 */
export async function getStakePoolAccounts(
  rpcUrl: string,
  stakePoolAddress: string,
): Promise<{ managerFeeAccount: string; reserveStake: string }> {
  const buffer = await fetchStakePoolAccountData(rpcUrl, stakePoolAddress);

  if (buffer.length < 226) {
    throw new Error(
      `Stake pool account data too short: ${buffer.length} bytes (expected at least 226)`,
    );
  }

  const reserveStakeBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + 130, 32);
  const managerFeeBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + 194, 32);

  return {
    reserveStake: base58Encode(reserveStakeBytes),
    managerFeeAccount: base58Encode(managerFeeBytes),
  };
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
export function parseSolAmount(amount: string): bigint {
  return parseTokenAmount(amount, 9);
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

/** Pre-instruction for Solana transaction (e.g., ATA creation). */
interface PreInstruction {
  programId: string;
  data: string; // base64-encoded
  accounts: AccountMeta[];
}

// ---------------------------------------------------------------------------
// CreateAssociatedTokenAccountIdempotent instruction builder
// ---------------------------------------------------------------------------

/**
 * Build a CreateAssociatedTokenAccountIdempotent instruction.
 * This instruction creates an ATA if it doesn't exist, or is a no-op if it does.
 *
 * Accounts (in order):
 * 0. funding account (signer, writable) = wallet (pays rent)
 * 1. associated token account (writable) = the ATA to create
 * 2. wallet address (read-only) = owner of the ATA
 * 3. token mint (read-only)
 * 4. system program (read-only)
 * 5. token program (read-only)
 *
 * Instruction index: 1 (CreateIdempotent)
 */
function buildCreateAtaIdempotentInstruction(
  payer: string,
  ataAddress: string,
  owner: string,
  mint: string,
  tokenProgram: string,
): PreInstruction {
  // CreateAssociatedTokenAccountIdempotent has instruction discriminator = 1
  const data = Buffer.from([1]).toString('base64');

  return {
    programId: ATA_PROGRAM_ID,
    data,
    accounts: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ataAddress, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
  };
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
 * 5. managerFeeAccount (writable) — read dynamically from on-chain stake pool data
 * 6. referralFeeAccount (writable) = same as managerFeeAccount (no referral)
 * 7. poolMint (writable) = JitoSOL mint
 * 8. systemProgram (read-only)
 * 9. tokenProgram (read-only)
 */
export async function buildDepositSolRequest(
  config: JitoStakingConfig,
  amountLamports: bigint,
  walletAddress: string,
  rpcUrl: string,
): Promise<{
  type: 'CONTRACT_CALL';
  to: string;
  programId: string;
  instructionData: string;
  accounts: AccountMeta[];
  value: string;
  preInstructions: PreInstruction[];
}> {
  const [destTokenAccount, stakePoolAccounts] = await Promise.all([
    getAssociatedTokenAddress(walletAddress, config.jitosolMint, SPL_TOKEN_PROGRAM),
    getStakePoolAccounts(rpcUrl, config.stakePoolAddress),
  ]);

  const { managerFeeAccount, reserveStake } = stakePoolAccounts;

  // Pre-instruction: Create JitoSOL ATA if it doesn't exist (idempotent).
  // Without this, DepositSol fails with Custom(1) when the ATA is missing.
  const createAtaIx = buildCreateAtaIdempotentInstruction(
    walletAddress,
    destTokenAccount,
    walletAddress,
    config.jitosolMint,
    SPL_TOKEN_PROGRAM,
  );

  const accounts: AccountMeta[] = [
    { pubkey: config.stakePoolAddress, isSigner: false, isWritable: true },
    { pubkey: JITO_WITHDRAW_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: reserveStake, isSigner: false, isWritable: true },
    { pubkey: walletAddress, isSigner: true, isWritable: true },
    { pubkey: destTokenAccount, isSigner: false, isWritable: true },
    { pubkey: managerFeeAccount, isSigner: false, isWritable: true },
    { pubkey: managerFeeAccount, isSigner: false, isWritable: true }, // referral = manager (no referral)
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
    preInstructions: [createAtaIx],
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
 * 4. reserveStake (writable) — read dynamically from on-chain stake pool data
 * 5. destSolAccount (writable) = wallet (receives SOL)
 * 6. managerFeeAccount (writable) — read dynamically from on-chain stake pool data
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
  rpcUrl: string,
): Promise<{
  type: 'CONTRACT_CALL';
  to: string;
  programId: string;
  instructionData: string;
  accounts: AccountMeta[];
}> {
  const [sourceTokenAccount, stakePoolAccounts] = await Promise.all([
    getAssociatedTokenAddress(walletAddress, config.jitosolMint, SPL_TOKEN_PROGRAM),
    getStakePoolAccounts(rpcUrl, config.stakePoolAddress),
  ]);

  const { managerFeeAccount, reserveStake } = stakePoolAccounts;

  const accounts: AccountMeta[] = [
    { pubkey: config.stakePoolAddress, isSigner: false, isWritable: true },
    { pubkey: JITO_WITHDRAW_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: walletAddress, isSigner: true, isWritable: false },
    { pubkey: sourceTokenAccount, isSigner: false, isWritable: true },
    { pubkey: reserveStake, isSigner: false, isWritable: true },
    { pubkey: walletAddress, isSigner: false, isWritable: true },
    { pubkey: managerFeeAccount, isSigner: false, isWritable: true },
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
