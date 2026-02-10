/**
 * SolanaAdapter -- IChainAdapter implementation for Solana using @solana/kit 3.x.
 *
 * Uses the functional pipe pattern:
 *   createTransactionMessage -> setFeePayer -> appendInstruction -> setBlockhash -> compile
 *
 * All RPC calls follow `rpc.method(params).send()` pattern.
 * Addresses use `address()` branded type from @solana/addresses.
 * Signing uses `signBytes()` with Ed25519 CryptoKey from `createKeyPairFromBytes()`.
 */

import {
  address,
  createNoopSigner,
  createSolanaRpc,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  appendTransactionMessageInstruction,
  setTransactionMessageLifetimeUsingBlockhash,
  compileTransaction,
  getTransactionEncoder,
  getTransactionDecoder,
  getBase64EncodedWireTransaction,
  pipe,
  signBytes,
  createKeyPairFromBytes,
  createKeyPairFromPrivateKeyBytes,
  getAddressFromPublicKey,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import type {
  IChainAdapter,
  ChainType,
  NetworkType,
  TransferRequest,
  UnsignedTransaction,
  SimulationResult,
  SubmitResult,
  BalanceInfo,
  HealthInfo,
  AssetInfo,
} from '@waiaas/core';
import { WAIaaSError } from '@waiaas/core';

/** Default SOL transfer fee in lamports (5000 = 0.000005 SOL). */
const DEFAULT_SOL_TRANSFER_FEE = 5000n;

/** Default confirmation polling interval in milliseconds. */
const CONFIRMATION_POLL_INTERVAL_MS = 2000;

/** SPL Token Program ID (hard-coded to avoid @solana-program/token dependency). */
const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/** Re-usable transaction encoder (stateless, safe to share). */
const txEncoder = getTransactionEncoder();

/** Re-usable transaction decoder (stateless, safe to share). */
const txDecoder = getTransactionDecoder();

type SolanaRpc = ReturnType<typeof createSolanaRpc>;

/**
 * Solana chain adapter implementing the 10-method IChainAdapter contract.
 *
 * Connection: connect, disconnect, isConnected, getHealth
 * Balance: getBalance
 * Pipeline: buildTransaction, simulateTransaction, signTransaction, submitTransaction
 * Confirmation: waitForConfirmation
 */
export class SolanaAdapter implements IChainAdapter {
  readonly chain: ChainType = 'solana';
  readonly network: NetworkType;

  private _rpc: SolanaRpc | null = null;
  private _connected = false;

  constructor(network: NetworkType) {
    this.network = network;
  }

  // -- Connection management (4) --

  async connect(rpcUrl: string): Promise<void> {
    this._rpc = createSolanaRpc(rpcUrl);
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this._rpc = null;
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }

  async getHealth(): Promise<HealthInfo> {
    const rpc = this.getRpc();
    try {
      const start = Date.now();
      const slot = await rpc.getSlot().send();
      const latencyMs = Date.now() - start;
      return {
        healthy: true,
        latencyMs,
        blockHeight: slot,
      };
    } catch {
      return { healthy: false, latencyMs: 0 };
    }
  }

  // -- Balance query (1) --

  async getBalance(addr: string): Promise<BalanceInfo> {
    const rpc = this.getRpc();
    try {
      const result = await rpc.getBalance(address(addr)).send();
      return {
        address: addr,
        balance: result.value,
        decimals: 9,
        symbol: 'SOL',
      };
    } catch (error) {
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Failed to get balance: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  // -- Asset query (1) --

  async getAssets(addr: string): Promise<AssetInfo[]> {
    const rpc = this.getRpc();
    try {
      // 1. Get native SOL balance
      const balanceResult = await rpc.getBalance(address(addr)).send();

      // 2. Get all SPL token accounts via getTokenAccountsByOwner
      const tokenResult = await rpc
        .getTokenAccountsByOwner(
          address(addr),
          { programId: address(SPL_TOKEN_PROGRAM_ID) },
          { encoding: 'jsonParsed' },
        )
        .send();

      // 3. Build result array -- native SOL first
      const assets: AssetInfo[] = [
        {
          mint: 'native',
          symbol: 'SOL',
          name: 'Solana',
          balance: balanceResult.value,
          decimals: 9,
          isNative: true,
        },
      ];

      // 4. Append non-zero SPL token accounts
      for (const item of tokenResult.value) {
        const parsed = (item.account.data as { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } }).parsed;
        const info = parsed.info;
        const tokenBalance = BigInt(info.tokenAmount.amount);

        // Filter out zero-balance token accounts
        if (tokenBalance === 0n) continue;

        assets.push({
          mint: info.mint,
          symbol: '',
          name: '',
          balance: tokenBalance,
          decimals: info.tokenAmount.decimals,
          isNative: false,
        });
      }

      return assets;
    } catch (error) {
      if (error instanceof WAIaaSError) throw error;
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Failed to get assets: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  // -- Transaction 4-stage pipeline (4) --

  async buildTransaction(request: TransferRequest): Promise<UnsignedTransaction> {
    const rpc = this.getRpc();
    try {
      const from = address(request.from);
      const to = address(request.to);

      // Get latest blockhash for transaction lifetime
      const { value: blockhashInfo } = await rpc.getLatestBlockhash().send();

      // Use noopSigner: we build unsigned tx now, real signing happens in signTransaction()
      const fromSigner = createNoopSigner(from);

      // Build transaction message using functional pipe pattern
      const txMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayer(from, tx),
        (tx) =>
          appendTransactionMessageInstruction(
            getTransferSolInstruction({
              source: fromSigner,
              destination: to,
              amount: request.amount,
            }),
            tx,
          ),
        (tx) =>
          setTransactionMessageLifetimeUsingBlockhash(
            {
              blockhash: blockhashInfo.blockhash,
              lastValidBlockHeight: blockhashInfo.lastValidBlockHeight,
            },
            tx,
          ),
      );

      // Compile to wire-format transaction
      const compiled = compileTransaction(txMessage);
      const serialized = new Uint8Array(txEncoder.encode(compiled));

      // Estimate expiry: blockhash valid for ~60s
      const expiresAt = new Date(Date.now() + 60_000);

      return {
        chain: 'solana',
        serialized,
        estimatedFee: DEFAULT_SOL_TRANSFER_FEE,
        expiresAt,
        metadata: {
          blockhash: blockhashInfo.blockhash,
          lastValidBlockHeight: Number(blockhashInfo.lastValidBlockHeight),
          version: 0,
        },
      };
    } catch (error) {
      if (error instanceof WAIaaSError) throw error;
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Failed to build transaction: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async simulateTransaction(tx: UnsignedTransaction): Promise<SimulationResult> {
    const rpc = this.getRpc();
    try {
      // Decode the compiled transaction and get base64 wire format
      const compiled = txDecoder.decode(tx.serialized);
      const base64Tx = getBase64EncodedWireTransaction(compiled);

      const result = await rpc
        .simulateTransaction(base64Tx, { encoding: 'base64' })
        .send();

      const simValue = result.value;
      return {
        success: simValue.err === null,
        logs: simValue.logs ?? [],
        unitsConsumed: simValue.unitsConsumed != null ? BigInt(simValue.unitsConsumed) : undefined,
        error: simValue.err ? JSON.stringify(simValue.err) : undefined,
      };
    } catch (error) {
      if (error instanceof WAIaaSError) throw error;
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Failed to simulate transaction: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async signTransaction(tx: UnsignedTransaction, privateKey: Uint8Array): Promise<Uint8Array> {
    this.ensureConnected();
    try {
      // Create CryptoKeyPair from raw bytes
      // privateKey may be 64 bytes (secret + public) or 32 bytes (secret only)
      const keyPair =
        privateKey.length === 64
          ? await createKeyPairFromBytes(privateKey)
          : await createKeyPairFromPrivateKeyBytes(privateKey.slice(0, 32));

      // Get the signer address from the public key
      const signerAddress = await getAddressFromPublicKey(keyPair.publicKey);

      // Decode the compiled transaction
      const compiled = txDecoder.decode(tx.serialized);

      // Sign the messageBytes with the private key
      const signature = await signBytes(keyPair.privateKey, compiled.messageBytes);

      // Place the signature in the correct slot
      const signedTx = {
        ...compiled,
        signatures: {
          ...compiled.signatures,
          [signerAddress]: signature,
        },
      };

      // Re-encode the signed transaction
      return new Uint8Array(txEncoder.encode(signedTx));
    } catch (error) {
      if (error instanceof WAIaaSError) throw error;
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Failed to sign transaction: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async submitTransaction(signedTx: Uint8Array): Promise<SubmitResult> {
    const rpc = this.getRpc();
    try {
      // Decode and get base64 wire format
      const compiled = txDecoder.decode(signedTx);
      const base64Tx = getBase64EncodedWireTransaction(compiled);

      const txHash = await rpc
        .sendTransaction(base64Tx, { encoding: 'base64' })
        .send();

      return {
        txHash: String(txHash),
        status: 'submitted',
      };
    } catch (error) {
      if (error instanceof WAIaaSError) throw error;
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Failed to submit transaction: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  // -- Confirmation wait (1) --

  async waitForConfirmation(txHash: string, timeoutMs = 30_000): Promise<SubmitResult> {
    const rpc = this.getRpc();
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const result = await rpc
          .getSignatureStatuses([txHash as Parameters<SolanaRpc['getSignatureStatuses']>[0][0]])
          .send();

        const status = result.value[0];
        if (status) {
          const confirmationStatus = status.confirmationStatus;
          if (confirmationStatus === 'confirmed' || confirmationStatus === 'finalized') {
            return {
              txHash,
              status: confirmationStatus,
              confirmations: status.confirmations != null ? Number(status.confirmations) : undefined,
              blockNumber: status.slot != null ? BigInt(status.slot) : undefined,
            };
          }
        }
      } catch (error) {
        throw new WAIaaSError('CHAIN_ERROR', {
          message: `Failed to check confirmation: ${error instanceof Error ? error.message : String(error)}`,
          cause: error instanceof Error ? error : undefined,
        });
      }

      // Wait before next poll
      await sleep(CONFIRMATION_POLL_INTERVAL_MS);
    }

    // Timeout: return current status without confirmed
    return { txHash, status: 'submitted' };
  }

  // -- Private helpers --

  private ensureConnected(): void {
    if (!this._connected || !this._rpc) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'SolanaAdapter is not connected. Call connect() first.',
      });
    }
  }

  private getRpc(): SolanaRpc {
    this.ensureConnected();
    return this._rpc!;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
