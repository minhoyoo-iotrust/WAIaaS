/**
 * Branch-coverage tests for tx-parser.ts edge cases.
 *
 * Targets specific uncovered branches:
 * - parseSystemInstruction: short data, non-transfer index, method undefined
 * - parseTokenInstruction: empty data, SPL_APPROVE (type 4), short TransferChecked, other types
 * - identifyOperation: Token-2022 dispatch, unknown program method variants
 * - Null coalescing fallbacks: accountIndices ?? [], data ?? new Uint8Array(0)
 *
 * Fixture strategy: Build real Solana transactions with raw instructions containing
 * specific binary data patterns to trigger the uncovered branches.
 * No RPC mocking needed -- parseSolanaTransaction is an offline parser.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  address,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  appendTransactionMessageInstruction,
  setTransactionMessageLifetimeUsingBlockhash,
  compileTransaction,
  getTransactionEncoder,
  pipe,
  createKeyPairFromBytes,
  getAddressFromPublicKey,
  blockhash,
  AccountRole,
} from '@solana/kit';
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';

// Import parser directly for unit testing
import { parseSolanaTransaction } from '../tx-parser.js';
// Import adapter for integration testing
import { SolanaAdapter } from '../adapter.js';

// ---- Constants ----

const TEST_BLOCKHASH = blockhash('4EPD2GJZkETChiMBc7G3yqga8TaczFNKSRJBuAGDNBRk');
const TOKEN_2022_ADDRESS = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const txEncoder = getTransactionEncoder();

// ---- Fixture variables ----

let fromAddress: string;
let toAddress: string;
let from: ReturnType<typeof address>;
let to: ReturnType<typeof address>;
let adapter: SolanaAdapter;

/** Build a test keypair from crypto and return address + 64-byte key */
async function buildTestKeypair(): Promise<{ address: string; privateKey64: Uint8Array }> {
  const { webcrypto } = await import('node:crypto');
  const kp = (await webcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as {
    privateKey: CryptoKey;
    publicKey: CryptoKey;
  };
  const pkcs8 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', kp.privateKey));
  const rawPriv = pkcs8.slice(-32);
  const rawPub = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey));

  const combined = new Uint8Array(64);
  combined.set(rawPriv, 0);
  combined.set(rawPub, 32);

  const solKp = await createKeyPairFromBytes(combined);
  const addr = await getAddressFromPublicKey(solKp.publicKey);
  return { address: addr, privateKey64: combined };
}

/** Build a transaction with a single raw instruction and encode to base64 */
function buildTxBase64(instruction: {
  programAddress: ReturnType<typeof address>;
  accounts: Array<{ address: ReturnType<typeof address>; role: AccountRole }>;
  data: Uint8Array;
}): string {
  const txMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(from, tx),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tx) => appendTransactionMessageInstruction(instruction as any, tx),
    (tx) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: TEST_BLOCKHASH, lastValidBlockHeight: 200n },
        tx,
      ),
  );
  const compiled = compileTransaction(txMessage as Parameters<typeof compileTransaction>[0]);
  const bytes = new Uint8Array(txEncoder.encode(compiled));
  return Buffer.from(bytes).toString('base64');
}

beforeAll(async () => {
  adapter = new SolanaAdapter('devnet');

  const kp1 = await buildTestKeypair();
  const kp2 = await buildTestKeypair();
  fromAddress = kp1.address;
  toAddress = kp2.address;
  from = address(fromAddress);
  to = address(toAddress);
});

// ---- parseSystemInstruction branches ----

describe('tx-parser parseSystemInstruction branches', () => {
  it('short data (< 12 bytes, >= 4 bytes) returns CONTRACT_CALL with method hex', () => {
    // 4 bytes: SystemProgram instruction with index 0 (CreateAccount) but only 4 bytes total
    // This triggers: data.length < 12 fallback, and data.length >= 4 branch for method
    const data = new Uint8Array([0x00, 0x00, 0x00, 0x00]); // index 0, no payload
    const base64 = buildTxBase64({
      programAddress: address(SYSTEM_PROGRAM_ADDRESS),
      accounts: [
        { address: from, role: AccountRole.WRITABLE_SIGNER },
        { address: to, role: AccountRole.WRITABLE },
      ],
      data,
    });

    const result = parseSolanaTransaction(base64);
    expect(result.operations).toHaveLength(1);
    const op = result.operations[0]!;
    expect(op.type).toBe('CONTRACT_CALL');
    expect(op.programId).toBe(SYSTEM_PROGRAM_ADDRESS);
    expect(op.method).toBe('00000000');
  });

  it('non-transfer index (>= 12 bytes, index != 2) returns CONTRACT_CALL', () => {
    // 12 bytes: index = 0 (CreateAccount, not transfer index 2), rest zeros
    const data = new Uint8Array(12);
    const view = new DataView(data.buffer);
    view.setUint32(0, 0, true); // instrIndex = 0 (CreateAccount)
    view.setBigUint64(4, 0n, true); // arbitrary 8-byte payload

    const base64 = buildTxBase64({
      programAddress: address(SYSTEM_PROGRAM_ADDRESS),
      accounts: [
        { address: from, role: AccountRole.WRITABLE_SIGNER },
        { address: to, role: AccountRole.WRITABLE },
      ],
      data,
    });

    const result = parseSolanaTransaction(base64);
    expect(result.operations).toHaveLength(1);
    const op = result.operations[0]!;
    expect(op.type).toBe('CONTRACT_CALL');
    expect(op.programId).toBe(SYSTEM_PROGRAM_ADDRESS);
    // method is first 4 bytes hex: 00000000
    expect(op.method).toBe('00000000');
  });

  it('short data (< 4 bytes) returns CONTRACT_CALL with method undefined', () => {
    // 2 bytes only -- triggers data.length < 4 branch -> method undefined
    const data = new Uint8Array([0x01, 0x02]);
    const base64 = buildTxBase64({
      programAddress: address(SYSTEM_PROGRAM_ADDRESS),
      accounts: [
        { address: from, role: AccountRole.WRITABLE_SIGNER },
      ],
      data,
    });

    const result = parseSolanaTransaction(base64);
    expect(result.operations).toHaveLength(1);
    const op = result.operations[0]!;
    expect(op.type).toBe('CONTRACT_CALL');
    expect(op.programId).toBe(SYSTEM_PROGRAM_ADDRESS);
    expect(op.method).toBeUndefined();
  });
});

// ---- parseTokenInstruction branches ----

describe('tx-parser parseTokenInstruction branches', () => {
  it('empty data (0 bytes) returns UNKNOWN', () => {
    // Token program instruction with zero-length data
    const base64 = buildTxBase64({
      programAddress: address(TOKEN_PROGRAM_ADDRESS),
      accounts: [
        { address: from, role: AccountRole.WRITABLE_SIGNER },
      ],
      data: new Uint8Array(0),
    });

    const result = parseSolanaTransaction(base64);
    expect(result.operations).toHaveLength(1);
    const op = result.operations[0]!;
    expect(op.type).toBe('UNKNOWN');
  });

  it('SPL_APPROVE (type 4) returns APPROVE with token undefined and to = delegate', () => {
    // Type 4 = Approve (not ApproveChecked which is type 13)
    // Approve layout: [type(1)] [amount(8)]
    const data = new Uint8Array(9);
    data[0] = 4; // SPL_APPROVE
    const view = new DataView(data.buffer);
    view.setBigUint64(1, 1_000_000n, true);

    const delegateAddress = toAddress;
    const base64 = buildTxBase64({
      programAddress: address(TOKEN_PROGRAM_ADDRESS),
      accounts: [
        { address: from, role: AccountRole.WRITABLE_SIGNER },     // source
        { address: to, role: AccountRole.WRITABLE },                // delegate (accounts[1])
      ],
      data,
    });

    const result = parseSolanaTransaction(base64);
    expect(result.operations).toHaveLength(1);
    const op = result.operations[0]!;
    expect(op.type).toBe('APPROVE');
    expect(op.token).toBeUndefined(); // SPL_APPROVE has no mint in accounts layout
    expect(op.to).toBe(delegateAddress); // delegate is accounts[1] for type 4
  });

  it('TransferChecked (type 12) with short data (< 10 bytes) falls through to CONTRACT_CALL', () => {
    // Type 12 = TransferChecked but only 5 bytes total (need >= 10 for valid TransferChecked)
    const data = new Uint8Array([12, 0x01, 0x02, 0x03, 0x04]);
    const base64 = buildTxBase64({
      programAddress: address(TOKEN_PROGRAM_ADDRESS),
      accounts: [
        { address: from, role: AccountRole.WRITABLE_SIGNER },
        { address: to, role: AccountRole.WRITABLE },
      ],
      data,
    });

    const result = parseSolanaTransaction(base64);
    expect(result.operations).toHaveLength(1);
    const op = result.operations[0]!;
    expect(op.type).toBe('CONTRACT_CALL');
    expect(op.programId).toBe(TOKEN_PROGRAM_ADDRESS);
    expect(op.method).toBeDefined(); // hex of data slice
  });

  it('other token instruction type (e.g., MintTo = 7) returns CONTRACT_CALL', () => {
    // Type 7 = MintTo -- not 4, 12, or 13
    const data = new Uint8Array([7, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const base64 = buildTxBase64({
      programAddress: address(TOKEN_PROGRAM_ADDRESS),
      accounts: [
        { address: from, role: AccountRole.WRITABLE_SIGNER },
        { address: to, role: AccountRole.WRITABLE },
      ],
      data,
    });

    const result = parseSolanaTransaction(base64);
    expect(result.operations).toHaveLength(1);
    const op = result.operations[0]!;
    expect(op.type).toBe('CONTRACT_CALL');
    expect(op.programId).toBe(TOKEN_PROGRAM_ADDRESS);
    expect(op.method).toBeDefined();
  });
});

// ---- identifyOperation Token-2022 dispatch ----

describe('tx-parser identifyOperation Token-2022 dispatch', () => {
  it('Token-2022 program address dispatches to parseTokenInstruction', () => {
    // TransferChecked via Token-2022 program
    const data = new Uint8Array(10);
    data[0] = 12; // SPL_TRANSFER_CHECKED
    const view = new DataView(data.buffer);
    view.setBigUint64(1, 100_000n, true);
    data[9] = 6; // decimals

    const fakeMint = address('So11111111111111111111111111111111111111112');

    const base64 = buildTxBase64({
      programAddress: address(TOKEN_2022_ADDRESS),
      accounts: [
        { address: from, role: AccountRole.WRITABLE_SIGNER },  // source
        { address: fakeMint, role: AccountRole.READONLY },       // mint (accounts[1])
        { address: to, role: AccountRole.WRITABLE },             // destination (accounts[2])
      ],
      data,
    });

    const result = parseSolanaTransaction(base64);
    expect(result.operations).toHaveLength(1);
    const op = result.operations[0]!;
    expect(op.type).toBe('TOKEN_TRANSFER');
    expect(op.amount).toBe(100_000n);
  });

  it('Token-2022 with empty data returns UNKNOWN', () => {
    const base64 = buildTxBase64({
      programAddress: address(TOKEN_2022_ADDRESS),
      accounts: [
        { address: from, role: AccountRole.WRITABLE_SIGNER },
      ],
      data: new Uint8Array(0),
    });

    const result = parseSolanaTransaction(base64);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]!.type).toBe('UNKNOWN');
  });
});

// ---- CONTRACT_CALL method field branches ----

describe('tx-parser CONTRACT_CALL method field branches', () => {
  it('unknown program with 0 < data < 8 bytes uses toHex(data)', () => {
    const customProgram = address('CustomProg111111111111111111111111111111111');
    const data = new Uint8Array([0xab, 0xcd, 0xef]); // 3 bytes

    const base64 = buildTxBase64({
      programAddress: customProgram,
      accounts: [
        { address: from, role: AccountRole.WRITABLE_SIGNER },
      ],
      data,
    });

    const result = parseSolanaTransaction(base64);
    expect(result.operations).toHaveLength(1);
    const op = result.operations[0]!;
    expect(op.type).toBe('CONTRACT_CALL');
    expect(op.method).toBe('abcdef');
  });

  it('unknown program with empty data (0 bytes) has method undefined', () => {
    const customProgram = address('CustomProg111111111111111111111111111111111');

    const base64 = buildTxBase64({
      programAddress: customProgram,
      accounts: [
        { address: from, role: AccountRole.WRITABLE_SIGNER },
      ],
      data: new Uint8Array(0),
    });

    const result = parseSolanaTransaction(base64);
    expect(result.operations).toHaveLength(1);
    const op = result.operations[0]!;
    expect(op.type).toBe('CONTRACT_CALL');
    expect(op.method).toBeUndefined();
  });

  it('unknown program with >= 8 bytes uses first 8 bytes', () => {
    const customProgram = address('CustomProg111111111111111111111111111111111');
    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a]);

    const base64 = buildTxBase64({
      programAddress: customProgram,
      accounts: [
        { address: from, role: AccountRole.WRITABLE_SIGNER },
      ],
      data,
    });

    const result = parseSolanaTransaction(base64);
    expect(result.operations).toHaveLength(1);
    const op = result.operations[0]!;
    expect(op.type).toBe('CONTRACT_CALL');
    expect(op.method).toBe('0102030405060708');
  });
});

// ---- Null coalescing / defensive fallback branches ----

describe('tx-parser null coalescing defensive branches', () => {
  it('instruction with no accounts triggers accountIndices ?? [] fallback', () => {
    // Build an instruction with zero accounts -- accountIndices will be empty
    const customProgram = address('CustomProg111111111111111111111111111111111');

    const base64 = buildTxBase64({
      programAddress: customProgram,
      accounts: [], // no accounts at all
      data: new Uint8Array([0x42]),
    });

    const result = parseSolanaTransaction(base64);
    expect(result.operations).toHaveLength(1);
    const op = result.operations[0]!;
    expect(op.type).toBe('CONTRACT_CALL');
    // With no accounts, the programAddress still resolves from staticAccounts
    expect(op.programId).toBeDefined();
  });

  // Note: compiledMessage.staticAccounts ?? [] and compiledMessage.instructions ?? []
  // are defensive fallbacks that cannot be triggered with real @solana/kit decoders,
  // as the decoder always provides these fields. Documented as defensive coding.
});

// ---- Integration: adapter.parseTransaction delegates to tx-parser ----

describe('adapter.parseTransaction integration with tx-parser', () => {
  it('adapter.parseTransaction returns same result as parseSolanaTransaction', async () => {
    const customProgram = address('CustomProg111111111111111111111111111111111');
    const data = new Uint8Array([0xab, 0xcd]);

    const base64 = buildTxBase64({
      programAddress: customProgram,
      accounts: [{ address: from, role: AccountRole.WRITABLE_SIGNER }],
      data,
    });

    const directResult = parseSolanaTransaction(base64);
    const adapterResult = await adapter.parseTransaction(base64);

    expect(adapterResult.operations).toEqual(directResult.operations);
    expect(adapterResult.rawTx).toBe(directResult.rawTx);
  });
});
