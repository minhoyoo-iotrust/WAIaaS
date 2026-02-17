/**
 * Payment Signer -- x402 chain-specific payment signature generation.
 *
 * Provides signPayment() which delegates to:
 * - signEip3009() for EVM chains (EIP-3009 transferWithAuthorization via EIP-712 signTypedData)
 * - signSolanaTransferChecked() for Solana chains (SPL TransferChecked partial signing)
 *
 * Key management follows the decrypt -> sign -> finally release pattern
 * from sign-only.ts Step 9 and stages.ts Stage 5c.
 *
 * Does NOT go through IChainAdapter -- EIP-3009 is typed data signing (not tx),
 * and Solana partial signing uses a different feePayer (facilitator, not wallet).
 *
 * @see packages/daemon/src/pipeline/sign-only.ts (Step 9)
 * @see docs/32-pipeline-design.md
 */

import { randomBytes } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';
import {
  address,
  createNoopSigner,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  appendTransactionMessageInstruction,
  setTransactionMessageLifetimeUsingBlockhash,
  compileTransaction,
  getTransactionEncoder,
  signBytes,
  createKeyPairFromBytes,
  createKeyPairFromPrivateKeyBytes,
  getAddressFromPublicKey,
  pipe,
} from '@solana/kit';
import {
  findAssociatedTokenPda,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import { parseCaip2, WAIaaSError } from '@waiaas/core';
import type { PaymentRequirements } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal keystore interface for payment signing. */
export interface PaymentKeyStore {
  decryptPrivateKey(walletId: string, masterPassword: string): Promise<Uint8Array>;
  releaseKey(key: Uint8Array): void;
}

/** EIP-712 domain for USDC contracts. */
export interface Eip712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

// ---------------------------------------------------------------------------
// USDC Domain Table (EIP-3009 EIP-712 domain separators)
// ---------------------------------------------------------------------------

/**
 * USDC v2 contract domain separators by CAIP-2 network identifier.
 *
 * Each EVM chain has a unique USDC contract with its own EIP-712 domain separator.
 * These are the Circle native USDC v2 contracts that support EIP-3009.
 *
 * Source: USDC v2 contracts + EIP-3009 standard + x402 reference implementation.
 */
export const USDC_DOMAINS: Record<string, Eip712Domain> = {
  // Base Mainnet
  'eip155:8453': {
    name: 'USD Coin',
    version: '2',
    chainId: 8453,
    verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  // Base Sepolia (testnet) — on-chain eip712Domain() returns 'USDC' (not 'USD Coin')
  'eip155:84532': {
    name: 'USDC',
    version: '2',
    chainId: 84532,
    verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  // Ethereum Mainnet
  'eip155:1': {
    name: 'USD Coin',
    version: '2',
    chainId: 1,
    verifyingContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  // Ethereum Sepolia
  'eip155:11155111': {
    name: 'USD Coin',
    version: '2',
    chainId: 11155111,
    verifyingContract: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  },
  // Polygon Mainnet
  'eip155:137': {
    name: 'USD Coin',
    version: '2',
    chainId: 137,
    verifyingContract: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  },
  // Arbitrum One
  'eip155:42161': {
    name: 'USD Coin',
    version: '2',
    chainId: 42161,
    verifyingContract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  // Optimism
  'eip155:10': {
    name: 'USD Coin',
    version: '2',
    chainId: 10,
    verifyingContract: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  },
};

// ---------------------------------------------------------------------------
// EIP-712 TransferWithAuthorization types (EIP-3009)
// ---------------------------------------------------------------------------

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

// ---------------------------------------------------------------------------
// Solana transaction encoder (stateless, safe to share)
// ---------------------------------------------------------------------------

const txEncoder = getTransactionEncoder();

// ---------------------------------------------------------------------------
// signPayment -- entry point with key management
// ---------------------------------------------------------------------------

/**
 * Sign a payment based on chain-specific strategy.
 *
 * Key management pattern (identical to sign-only.ts Step 9):
 * 1. Decrypt private key from keystore
 * 2. Sign using chain-specific strategy
 * 3. Finally block: release key (sodium_memzero)
 *
 * @param requirements - x402 PaymentRequirements from 402 response
 * @param keyStore - Keystore for key decrypt/release
 * @param walletId - Wallet ID for key lookup
 * @param walletAddress - Wallet public address
 * @param masterPassword - Master password for key decryption
 * @param rpc - Solana RPC client (required for Solana chains)
 * @returns PaymentPayload compatible with @x402/core PaymentPayloadV2Schema
 */
export async function signPayment(
  requirements: PaymentRequirements,
  keyStore: PaymentKeyStore,
  walletId: string,
  walletAddress: string,
  masterPassword: string,
  rpc?: unknown,
): Promise<Record<string, unknown>> {
  let privateKey: Uint8Array | null = null;
  try {
    privateKey = await keyStore.decryptPrivateKey(walletId, masterPassword);
    const { namespace } = parseCaip2(requirements.network);

    if (namespace === 'eip155') {
      return await signEip3009(requirements, privateKey, walletAddress);
    } else if (namespace === 'solana') {
      return await signSolanaTransferChecked(requirements, privateKey, walletAddress, rpc!);
    } else {
      throw new WAIaaSError('X402_UNSUPPORTED_SCHEME', {
        message: `Unsupported chain namespace: ${namespace}`,
      });
    }
  } finally {
    if (privateKey) {
      keyStore.releaseKey(privateKey);
    }
  }
}

// ---------------------------------------------------------------------------
// signEip3009 -- EVM EIP-3009 transferWithAuthorization
// ---------------------------------------------------------------------------

/**
 * Sign EVM EIP-3009 transferWithAuthorization via EIP-712 signTypedData.
 *
 * Uses viem's privateKeyToAccount + account.signTypedData for the EIP-712
 * structured data signature. The signature authorizes a USDC transfer
 * without requiring an on-chain transaction from the payer.
 *
 * @param requirements - Payment requirements (network, asset, amount, payTo)
 * @param privateKey - Raw private key bytes (32 bytes for secp256k1)
 * @param walletAddress - EVM wallet address (0x-prefixed EIP-55)
 * @returns PaymentPayload with signature and authorization object
 */
export async function signEip3009(
  requirements: PaymentRequirements,
  privateKey: Uint8Array,
  walletAddress: string,
): Promise<Record<string, unknown>> {
  const { reference: chainIdStr } = parseCaip2(requirements.network);
  const chainId = parseInt(chainIdStr, 10);

  // Resolve EIP-712 domain: prefer server-provided extra.name/version (x402 v2 spec),
  // fall back to USDC_DOMAINS table for backward compatibility.
  const extra = requirements.extra as Record<string, unknown> | undefined;
  const domainName = (extra?.name as string) ?? USDC_DOMAINS[requirements.network]?.name;
  const domainVersion = (extra?.version as string) ?? USDC_DOMAINS[requirements.network]?.version;
  if (!domainName || !domainVersion) {
    throw new WAIaaSError('X402_UNSUPPORTED_SCHEME', {
      message: `No EIP-712 domain (name/version) for network: ${requirements.network}`,
    });
  }

  // Generate 32-byte random nonce (EIP-3009 requirement)
  const nonce = `0x${randomBytes(32).toString('hex')}` as Hex;

  // validBefore = now + 5 minutes (300 seconds) -- minimizes attack window
  // See Pitfall 3 in research: too long validBefore creates security gap
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300);

  // Create viem account from private key
  const privateKeyHex = `0x${Buffer.from(privateKey).toString('hex')}` as Hex;
  const account = privateKeyToAccount(privateKeyHex);

  // Sign EIP-712 TransferWithAuthorization
  // verifyingContract = asset address (USDC contract) from requirements
  const signature = await account.signTypedData({
    domain: {
      name: domainName,
      version: domainVersion,
      chainId: BigInt(chainId),
      verifyingContract: requirements.asset as Hex,
    },
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: walletAddress as Hex,
      to: requirements.payTo as Hex,
      value: BigInt(requirements.amount),
      validAfter: 0n,
      validBefore,
      nonce,
    },
  });

  // Build PaymentPayload (compatible with PaymentPayloadV2Schema)
  return {
    x402Version: 2,
    resource: { url: '' }, // handler fills this in
    accepted: requirements,
    payload: {
      signature,
      authorization: {
        from: walletAddress,
        to: requirements.payTo,
        value: requirements.amount,
        validAfter: '0',
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// signSolanaTransferChecked -- Solana SPL TransferChecked partial signing
// ---------------------------------------------------------------------------

/**
 * Sign Solana SPL TransferChecked as partial signature.
 *
 * The feePayer is the facilitator (from requirements.extra.feePayer), set as
 * noopSigner so only a signature slot is created. The wallet signs the
 * transaction message with its private key.
 *
 * The resulting base64-encoded transaction contains:
 * - feePayer = facilitator address (noopSigner, unsigned)
 * - authority = wallet (signed)
 * - TransferChecked instruction for SPL token transfer
 *
 * @param requirements - Payment requirements with extra.feePayer and extra.decimals
 * @param privateKey - Raw private key bytes (32 or 64 bytes)
 * @param walletAddress - Solana wallet address (base58)
 * @param rpc - Solana RPC client with getLatestBlockhash method
 * @returns PaymentPayload with base64-encoded partial-signed transaction
 */
export async function signSolanaTransferChecked(
  requirements: PaymentRequirements,
  privateKey: Uint8Array,
  _walletAddress: string,
  rpc: unknown,
): Promise<Record<string, unknown>> {
  // Extract facilitator feePayer from requirements.extra
  const feePayerStr = requirements.extra?.feePayer as string;
  if (!feePayerStr) {
    throw new WAIaaSError('X402_UNSUPPORTED_SCHEME', {
      message: 'Missing feePayer in PaymentRequirements.extra',
    });
  }

  const feePayerAddress = address(feePayerStr);

  // Create key pair from raw bytes (64-byte or 32-byte detection)
  const keyPair = privateKey.length === 64
    ? await createKeyPairFromBytes(privateKey)
    : await createKeyPairFromPrivateKeyBytes(privateKey.slice(0, 32));

  const walletAddr = await getAddressFromPublicKey(keyPair.publicKey);

  // Get latest blockhash from RPC
  const solanaRpc = rpc as { getLatestBlockhash: () => { send: () => Promise<{ value: { blockhash: string; lastValidBlockHeight: bigint } }> } };
  const { value: blockhashInfo } = await solanaRpc.getLatestBlockhash().send();

  // Derive token accounts (ATAs)
  const mint = address(requirements.asset);
  const payTo = address(requirements.payTo);
  const decimals = (requirements.extra?.decimals as number) ?? 6;

  const [sourceAta] = await findAssociatedTokenPda({
    owner: walletAddr,
    tokenProgram: address(TOKEN_PROGRAM_ADDRESS),
    mint,
  });

  const [destAta] = await findAssociatedTokenPda({
    owner: payTo,
    tokenProgram: address(TOKEN_PROGRAM_ADDRESS),
    mint,
  });

  // Build TransferChecked instruction
  // Use noopSigner for feePayer (facilitator signs later)
  const walletSigner = createNoopSigner(walletAddr);

  const transferIx = getTransferCheckedInstruction({
    source: sourceAta,
    mint,
    destination: destAta,
    authority: walletSigner,
    amount: BigInt(requirements.amount),
    decimals,
  }, { programAddress: address(TOKEN_PROGRAM_ADDRESS) });

  // Build transaction message using pipe pattern
   
  const txMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (msg) => setTransactionMessageFeePayer(feePayerAddress, msg),
    (msg) => setTransactionMessageLifetimeUsingBlockhash(
      // RPC blockhash is untyped (from mock/dynamic source), cast to satisfy branded type
      blockhashInfo as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      msg,
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (msg) => appendTransactionMessageInstruction(transferIx as any, msg),
  );

  // Compile transaction and sign with wallet private key (partial signing)
  const compiled = compileTransaction(txMessage);
  const walletSignature = await signBytes(keyPair.privateKey, compiled.messageBytes);

  // Place wallet signature in the correct slot
  const partiallySignedTx = {
    ...compiled,
    signatures: {
      ...compiled.signatures,
      [walletAddr]: walletSignature,
    },
  };

  // Encode to base64
  const serialized = new Uint8Array(txEncoder.encode(partiallySignedTx));
  const base64Tx = Buffer.from(serialized).toString('base64');

  // Build PaymentPayload
  return {
    x402Version: 2,
    resource: { url: '' }, // handler fills this in
    accepted: requirements,
    payload: {
      transaction: base64Tx,
    },
  };
}
