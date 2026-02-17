/**
 * SolanaAdapter sign-only tests: parseTransaction + signExternalTransaction.
 *
 * Tests cover:
 * - parseTransaction: SystemProgram.transfer, SPL transferChecked, SPL approve, unknown program, multi-instruction, error cases
 * - signExternalTransaction: normal signing, WALLET_NOT_SIGNER error, INVALID_RAW_TRANSACTION error
 *
 * Fixture strategy: Build real Solana transactions using @solana/kit pipeline, serialize to base64.
 * No RPC mocking needed because parseTransaction and signExternalTransaction are offline operations.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  address,
  createNoopSigner,
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
import { getTransferSolInstruction } from '@solana-program/system';
import {
  getTransferCheckedInstruction,
  getApproveCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import { ChainError } from '@waiaas/core';
import type { ParsedTransaction, SignedTransaction } from '@waiaas/core';

// Import after defining -- no RPC mock needed for sign-only ops
import { SolanaAdapter } from '../adapter.js';

// ---- Test fixtures ----

const TEST_BLOCKHASH = blockhash('4EPD2GJZkETChiMBc7G3yqga8TaczFNKSRJBuAGDNBRk');
const txEncoder = getTransactionEncoder();

// Fixture variables populated in beforeAll
let adapter: SolanaAdapter;
let fromAddress: string;
let toAddress: string;
let privateKey64: Uint8Array;
let otherPrivateKey64: Uint8Array;

// Pre-built base64 fixtures
let nativeTransferBase64: string;
let splTransferCheckedBase64: string;
let splApproveBase64: string;
let unknownProgramBase64: string;
let multiInstructionBase64: string;

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

/** Encode a compiled transaction to base64 string */
function toBase64(compiled: ReturnType<typeof compileTransaction>): string {
  const bytes = new Uint8Array(txEncoder.encode(compiled));
  return Buffer.from(bytes).toString('base64');
}

beforeAll(async () => {
  adapter = new SolanaAdapter('devnet');
  // No connect needed -- parseTransaction and signExternalTransaction are offline

  // Generate test keypairs
  const kp1 = await buildTestKeypair();
  const kp2 = await buildTestKeypair();
  fromAddress = kp1.address;
  toAddress = kp2.address;
  privateKey64 = kp1.privateKey64;
  otherPrivateKey64 = kp2.privateKey64;

  const from = address(fromAddress);
  const to = address(toAddress);
  const fromSigner = createNoopSigner(from);

  // --- Fixture 1: Native SOL transfer (SystemProgram.transfer) ---
  {
    const txMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayer(from, tx),
      (tx) =>
        appendTransactionMessageInstruction(
          getTransferSolInstruction({ source: fromSigner, destination: to, amount: 1_000_000n }),
          tx,
        ),
      (tx) =>
        setTransactionMessageLifetimeUsingBlockhash(
          { blockhash: TEST_BLOCKHASH, lastValidBlockHeight: 200n },
          tx,
        ),
    );
    nativeTransferBase64 = toBase64(compileTransaction(txMessage));
  }

  // --- Fixture 2: SPL Token transferChecked ---
  // We need a fake mint address and use findAssociatedTokenPda for real ATAs
  // Instead, we manually build the instruction with the token program
  {
    const fakeMint = address('So11111111111111111111111111111111111111112');
    const fakeSourceAta = address('7YWHiEBEPFaqHHaJfGSKzKEqSN1cPY3YDnE8FNpBp3RF');
    const fakeDestAta = address('2xNweLHLqrbx4zo1waDvgWJHgsUpPj8Y8icbAFeR4a8i');

    const transferCheckedIx = getTransferCheckedInstruction(
      {
        source: fakeSourceAta,
        mint: fakeMint,
        destination: fakeDestAta,
        authority: fromSigner,
        amount: 500_000n,
        decimals: 6,
      },
      { programAddress: address(TOKEN_PROGRAM_ADDRESS) },
    );

    const txMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayer(from, tx),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (tx) => appendTransactionMessageInstruction(transferCheckedIx as any, tx),
      (tx) =>
        setTransactionMessageLifetimeUsingBlockhash(
          { blockhash: TEST_BLOCKHASH, lastValidBlockHeight: 200n },
          tx,
        ),
    );
    splTransferCheckedBase64 = toBase64(compileTransaction(txMessage as Parameters<typeof compileTransaction>[0]));
  }

  // --- Fixture 3: SPL Token approveChecked ---
  {
    const fakeMint = address('So11111111111111111111111111111111111111112');
    const fakeSourceAta = address('7YWHiEBEPFaqHHaJfGSKzKEqSN1cPY3YDnE8FNpBp3RF');
    const fakeDelegate = address(toAddress);

    const approveCheckedIx = getApproveCheckedInstruction(
      {
        source: fakeSourceAta,
        mint: fakeMint,
        delegate: fakeDelegate,
        owner: fromSigner,
        amount: 1_000_000n,
        decimals: 6,
      },
      { programAddress: address(TOKEN_PROGRAM_ADDRESS) },
    );

    const txMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayer(from, tx),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (tx) => appendTransactionMessageInstruction(approveCheckedIx as any, tx),
      (tx) =>
        setTransactionMessageLifetimeUsingBlockhash(
          { blockhash: TEST_BLOCKHASH, lastValidBlockHeight: 200n },
          tx,
        ),
    );
    splApproveBase64 = toBase64(compileTransaction(txMessage as Parameters<typeof compileTransaction>[0]));
  }

  // --- Fixture 4: Unknown program instruction (CONTRACT_CALL) ---
  {
    const fakeProgramId = address('CustomProg111111111111111111111111111111111');
    // 8-byte Anchor discriminator + arbitrary data
    const instructionData = new Uint8Array([0xab, 0xcd, 0xef, 0x01, 0x02, 0x03, 0x04, 0x05, 0x10, 0x20]);

    const instruction = {
      programAddress: fakeProgramId,
      accounts: [
        { address: from, role: AccountRole.WRITABLE_SIGNER },
        { address: to, role: AccountRole.WRITABLE },
      ],
      data: instructionData,
    };

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
    unknownProgramBase64 = toBase64(compileTransaction(txMessage as Parameters<typeof compileTransaction>[0]));
  }

  // --- Fixture 5: Multi-instruction tx (native transfer + unknown program) ---
  {
    const fakeProgramId = address('CustomProg111111111111111111111111111111111');
    const instructionData = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);

    const transferIx = getTransferSolInstruction({
      source: fromSigner,
      destination: to,
      amount: 500_000n,
    });

    const customIx = {
      programAddress: fakeProgramId,
      accounts: [
        { address: from, role: AccountRole.WRITABLE_SIGNER },
      ],
      data: instructionData,
    };

    let txMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayer(from, tx),
      (tx) => appendTransactionMessageInstruction(transferIx, tx),
      (tx) =>
        setTransactionMessageLifetimeUsingBlockhash(
          { blockhash: TEST_BLOCKHASH, lastValidBlockHeight: 200n },
          tx,
        ),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    txMessage = appendTransactionMessageInstruction(customIx as any, txMessage) as unknown as typeof txMessage;

    multiInstructionBase64 = toBase64(compileTransaction(txMessage));
  }
});

// ---- parseTransaction tests ----

describe('SolanaAdapter.parseTransaction', () => {
  it('parses SystemProgram.transfer as NATIVE_TRANSFER with correct to/amount', async () => {
    const result: ParsedTransaction = await adapter.parseTransaction(nativeTransferBase64);

    expect(result.rawTx).toBe(nativeTransferBase64);
    expect(result.operations).toHaveLength(1);

    const op = result.operations[0]!;
    expect(op.type).toBe('NATIVE_TRANSFER');
    expect(op.to).toBe(toAddress);
    expect(op.amount).toBe(1_000_000n);
  });

  it('parses SPL Token transferChecked as TOKEN_TRANSFER', async () => {
    const result = await adapter.parseTransaction(splTransferCheckedBase64);

    expect(result.rawTx).toBe(splTransferCheckedBase64);
    expect(result.operations).toHaveLength(1);

    const op = result.operations[0]!;
    expect(op.type).toBe('TOKEN_TRANSFER');
    expect(op.token).toBeDefined();
    expect(op.amount).toBe(500_000n);
  });

  it('parses SPL Token approveChecked as APPROVE', async () => {
    const result = await adapter.parseTransaction(splApproveBase64);

    expect(result.rawTx).toBe(splApproveBase64);
    expect(result.operations).toHaveLength(1);

    const op = result.operations[0]!;
    expect(op.type).toBe('APPROVE');
    expect(op.token).toBeDefined();
  });

  it('parses unknown program instruction as CONTRACT_CALL', async () => {
    const result = await adapter.parseTransaction(unknownProgramBase64);

    expect(result.rawTx).toBe(unknownProgramBase64);
    expect(result.operations).toHaveLength(1);

    const op = result.operations[0]!;
    expect(op.type).toBe('CONTRACT_CALL');
    expect(op.programId).toBeDefined();
    expect(op.method).toBeDefined(); // Anchor discriminator hex
  });

  it('parses multi-instruction tx with multiple operations', async () => {
    const result = await adapter.parseTransaction(multiInstructionBase64);

    expect(result.rawTx).toBe(multiInstructionBase64);
    expect(result.operations.length).toBeGreaterThanOrEqual(2);

    // First op should be NATIVE_TRANSFER
    const transferOp = result.operations.find((op) => op.type === 'NATIVE_TRANSFER');
    expect(transferOp).toBeDefined();
    expect(transferOp!.amount).toBe(500_000n);

    // Second op should be CONTRACT_CALL
    const contractOp = result.operations.find((op) => op.type === 'CONTRACT_CALL');
    expect(contractOp).toBeDefined();
  });

  it('throws INVALID_RAW_TRANSACTION for invalid base64', async () => {
    await expect(adapter.parseTransaction('not-valid-base64!!!')).rejects.toThrow(ChainError);

    try {
      await adapter.parseTransaction('not-valid-base64!!!');
    } catch (error) {
      expect(error).toBeInstanceOf(ChainError);
      expect((error as ChainError).code).toBe('INVALID_RAW_TRANSACTION');
      expect((error as ChainError).chain).toBe('solana');
    }
  });

  it('throws INVALID_RAW_TRANSACTION for corrupted bytes', async () => {
    // Valid base64 but not a valid Solana transaction
    const corruptedBase64 = Buffer.from(new Uint8Array([0, 1, 2, 3, 4, 5])).toString('base64');

    await expect(adapter.parseTransaction(corruptedBase64)).rejects.toThrow(ChainError);

    try {
      await adapter.parseTransaction(corruptedBase64);
    } catch (error) {
      expect(error).toBeInstanceOf(ChainError);
      expect((error as ChainError).code).toBe('INVALID_RAW_TRANSACTION');
    }
  });
});

// ---- signExternalTransaction tests ----

describe('SolanaAdapter.signExternalTransaction', () => {
  it('signs a valid tx where wallet is feePayer and returns base64 signedTransaction', async () => {
    const result: SignedTransaction = await adapter.signExternalTransaction(
      nativeTransferBase64,
      privateKey64,
    );

    expect(result.signedTransaction).toBeDefined();
    expect(typeof result.signedTransaction).toBe('string');
    // Should be valid base64
    expect(() => Buffer.from(result.signedTransaction, 'base64')).not.toThrow();
    // Signed tx should be different from unsigned (signature filled in)
    expect(result.signedTransaction).not.toBe(nativeTransferBase64);
  });

  it('throws WALLET_NOT_SIGNER when wallet is not a signer in the tx', async () => {
    // otherPrivateKey64 does not correspond to the feePayer of the transaction
    await expect(
      adapter.signExternalTransaction(nativeTransferBase64, otherPrivateKey64),
    ).rejects.toThrow(ChainError);

    try {
      await adapter.signExternalTransaction(nativeTransferBase64, otherPrivateKey64);
    } catch (error) {
      expect(error).toBeInstanceOf(ChainError);
      expect((error as ChainError).code).toBe('WALLET_NOT_SIGNER');
      expect((error as ChainError).chain).toBe('solana');
    }
  });

  it('throws INVALID_RAW_TRANSACTION for invalid base64 rawTx', async () => {
    await expect(
      adapter.signExternalTransaction('invalid-base64!!!', privateKey64),
    ).rejects.toThrow(ChainError);

    try {
      await adapter.signExternalTransaction('invalid-base64!!!', privateKey64);
    } catch (error) {
      expect(error).toBeInstanceOf(ChainError);
      expect((error as ChainError).code).toBe('INVALID_RAW_TRANSACTION');
    }
  });
});
