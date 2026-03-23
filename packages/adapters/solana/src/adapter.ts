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
  AccountRole,
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
  fetchAddressesForLookupTables,
  compressTransactionMessageUsingAddressLookupTables,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  getApproveCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
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
  FeeEstimate,
  TokenInfo,
  TokenTransferParams,
  ContractCallParams,
  ApproveParams,
  BatchParams,
  ParsedTransaction,
  SignedTransaction,
  NftTransferParams,
  NftApproveParams,
} from '@waiaas/core';
import { WAIaaSError, ChainError, sleep } from '@waiaas/core';
import { parseSolanaTransaction } from './tx-parser.js';

/** Default SOL transfer fee in lamports (5000 = 0.000005 SOL). */
const DEFAULT_SOL_TRANSFER_FEE = 5000n;

/** Default confirmation polling interval in milliseconds. */
const CONFIRMATION_POLL_INTERVAL_MS = 2000;

/** SPL Token Program ID. */
const SPL_TOKEN_PROGRAM_ID = TOKEN_PROGRAM_ADDRESS;

/** Token-2022 (Token Extensions) Program ID. */
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

/** Rent-exempt minimum for an Associated Token Account (~0.00204 SOL). */
const ATA_RENT_LAMPORTS = 2_039_280n;

/** RPC retry constants for rate-limited endpoints (#187). */
const RPC_RETRY_MAX = 3;
const RPC_RETRY_BASE_MS = 1_000;
const RPC_RETRY_MAX_MS = 10_000;
const RPC_RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** Re-usable transaction encoder (stateless, safe to share). */
const txEncoder = getTransactionEncoder();

/** Re-usable transaction decoder (stateless, safe to share). */
const txDecoder = getTransactionDecoder();

type SolanaRpc = ReturnType<typeof createSolanaRpc>;

/**
 * Solana chain adapter implementing the 22-method IChainAdapter contract.
 *
 * Connection: connect, disconnect, isConnected, getHealth
 * Balance: getBalance
 * Pipeline: buildTransaction, simulateTransaction, signTransaction, submitTransaction
 * Confirmation: waitForConfirmation
 * Assets: getAssets
 * Fee: estimateFee
 * Token: buildTokenTransfer, getTokenInfo
 * Contract: buildContractCall, buildApprove
 * Batch: buildBatch
 * Utility: getTransactionFee, getCurrentNonce
 * Sign-only: parseTransaction, signExternalTransaction
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
      const result = await this.withRpcRetry(() => rpc.getBalance(address(addr)).send());
      return {
        address: addr,
        balance: result.value,
        decimals: 9,
        symbol: 'SOL',
      };
    } catch (error) {
      this.mapError('get balance', error);
    }
  }

  // -- Asset query (1) --

  async getAssets(addr: string): Promise<AssetInfo[]> {
    const rpc = this.getRpc();
    try {
      // 1. Get native SOL balance (with retry for rate limits #187)
      const balanceResult = await this.withRpcRetry(() => rpc.getBalance(address(addr)).send());

      // 2. Get SPL Token Program accounts (with retry for rate limits #187)
      const tokenResult = await this.withRpcRetry(() =>
        rpc
          .getTokenAccountsByOwner(
            address(addr),
            { programId: address(SPL_TOKEN_PROGRAM_ID) },
            { encoding: 'jsonParsed' },
          )
          .send(),
      );

      // 3. Get Token-2022 program accounts (with retry for rate limits #187)
      const token2022Result = await this.withRpcRetry(() =>
        rpc
          .getTokenAccountsByOwner(
            address(addr),
            { programId: address(TOKEN_2022_PROGRAM_ID) },
            { encoding: 'jsonParsed' },
          )
          .send(),
      );

      // 4. Build result array -- native SOL first
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

      // 5. Append non-zero SPL token accounts
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

      // 6. Append non-zero Token-2022 accounts
      for (const item of token2022Result.value) {
        const parsed = (item.account.data as { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } }).parsed;
        const info = parsed.info;
        const tokenBalance = BigInt(info.tokenAmount.amount);

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

      // 7. Sort: native first, then by balance descending
      assets.sort((a, b) => {
        if (a.isNative) return -1;
        if (b.isNative) return 1;
        if (a.balance > b.balance) return -1;
        if (a.balance < b.balance) return 1;
        return 0;
      });

      return assets;
    } catch (error) {
      this.mapError('get assets', error);
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
      this.mapError('build transaction', error);
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
        error: simValue.err ? JSON.stringify(simValue.err, (_, v) => typeof v === 'bigint' ? v.toString() : v) : undefined,
      };
    } catch (error) {
      this.mapError('simulate transaction', error);
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
      this.mapError('sign transaction', error);
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
      this.mapError('submit transaction', error);
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
      } catch {
        // RPC error during polling: return submitted (don't mark as failed)
        // Stage 6 will keep SUBMITTED status, tx may confirm later
        return { txHash, status: 'submitted' };
      }

      // Wait before next poll
      await sleep(CONFIRMATION_POLL_INTERVAL_MS);
    }

    // Timeout: return current status without confirmed
    return { txHash, status: 'submitted' };
  }

  // -- Fee estimation (1) --

  async estimateFee(request: TransferRequest | TokenTransferParams): Promise<FeeEstimate> {
    this.ensureConnected();
    try {
      // Check if this is a token transfer (has 'token' field)
      if ('token' in request) {
        const tokenRequest = request as TokenTransferParams;
        const rpc = this.getRpc();

        // Compute destination ATA and check if it exists
        const mintAddr = address(tokenRequest.token.address);
        const toAddr = address(tokenRequest.to);

        // Determine token program by querying mint account owner
        const mintAccountInfo = await rpc
          .getAccountInfo(mintAddr, { encoding: 'base64' })
          .send();

        if (!mintAccountInfo.value) {
          throw new ChainError('TOKEN_ACCOUNT_NOT_FOUND', 'solana', {
            message: `Token mint not found: ${tokenRequest.token.address}`,
          });
        }
        const tokenProgramId = String(mintAccountInfo.value.owner);

        // Compute destination ATA address
        const [destinationAta] = await findAssociatedTokenPda({
          owner: toAddr,
          tokenProgram: address(tokenProgramId),
          mint: mintAddr,
        });

        // Check if destination ATA exists
        const ataAccountInfo = await rpc
          .getAccountInfo(destinationAta, { encoding: 'base64' })
          .send();

        const needCreateAta = !ataAccountInfo.value;
        const fee = DEFAULT_SOL_TRANSFER_FEE + (needCreateAta ? ATA_RENT_LAMPORTS : 0n);

        return {
          fee,
          needsAtaCreation: needCreateAta,
          ataRentCost: needCreateAta ? ATA_RENT_LAMPORTS : undefined,
        };
      }

      // Native SOL transfer
      return { fee: DEFAULT_SOL_TRANSFER_FEE };
    } catch (error) {
      this.mapError('estimate fee', error);
    }
  }

  // -- Token operations (2) --

  async buildTokenTransfer(request: TokenTransferParams): Promise<UnsignedTransaction> {
    const rpc = this.getRpc();
    try {
      const from = address(request.from);
      const to = address(request.to);
      const mintAddr = address(request.token.address);

      // Step 1: Query mint account to determine token program
      const mintAccountInfo = await rpc
        .getAccountInfo(mintAddr, { encoding: 'base64' })
        .send();

      if (!mintAccountInfo.value) {
        throw new ChainError('TOKEN_ACCOUNT_NOT_FOUND', 'solana', {
          message: `Token mint not found: ${request.token.address}`,
        });
      }

      const mintOwner = String(mintAccountInfo.value.owner);
      let tokenProgramId: string;

      if (mintOwner === SPL_TOKEN_PROGRAM_ID) {
        tokenProgramId = SPL_TOKEN_PROGRAM_ID;
      } else if (mintOwner === TOKEN_2022_PROGRAM_ID) {
        tokenProgramId = TOKEN_2022_PROGRAM_ID;
      } else {
        throw new ChainError('INVALID_INSTRUCTION', 'solana', {
          message: 'Invalid token mint: owner is not a token program',
        });
      }

      // Step 2: Compute source and destination ATA addresses
      const [sourceAta] = await findAssociatedTokenPda({
        owner: from,
        tokenProgram: address(tokenProgramId),
        mint: mintAddr,
      });

      const [destinationAta] = await findAssociatedTokenPda({
        owner: to,
        tokenProgram: address(tokenProgramId),
        mint: mintAddr,
      });

      // Step 3: Check if destination ATA exists
      const destAtaInfo = await rpc
        .getAccountInfo(destinationAta, { encoding: 'base64' })
        .send();

      const needCreateAta = !destAtaInfo.value;

      // Step 4: Get latest blockhash
      const { value: blockhashInfo } = await rpc.getLatestBlockhash().send();

      // Step 5: Build transaction message
      const fromSigner = createNoopSigner(from);

      // Collect instructions: optionally ATA creation + transferChecked
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const instructions: any[] = [];

      if (needCreateAta) {
        instructions.push(
          getCreateAssociatedTokenIdempotentInstruction({
            payer: fromSigner,
            ata: destinationAta,
            owner: to,
            mint: mintAddr,
            tokenProgram: address(tokenProgramId),
          }),
        );
      }

      instructions.push(
        getTransferCheckedInstruction(
          {
            source: sourceAta,
            mint: mintAddr,
            destination: destinationAta,
            authority: fromSigner,
            amount: request.amount,
            decimals: request.token.decimals,
          },
          { programAddress: address(tokenProgramId) },
        ),
      );

      // Build transaction message in a single pipe (avoids TS brand issues with reassignment)
      let txMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayer(from, tx),
        (tx) =>
          setTransactionMessageLifetimeUsingBlockhash(
            {
              blockhash: blockhashInfo.blockhash,
              lastValidBlockHeight: blockhashInfo.lastValidBlockHeight,
            },
            tx,
          ),
      );

      for (const ix of instructions) {
        txMessage = appendTransactionMessageInstruction(ix, txMessage) as unknown as typeof txMessage;
      }

      // Step 6: Compile and encode
      const compiled = compileTransaction(txMessage);
      const serialized = new Uint8Array(txEncoder.encode(compiled));

      // Estimated fee: base fee + ATA creation rent if needed
      const estimatedFee = DEFAULT_SOL_TRANSFER_FEE + (needCreateAta ? ATA_RENT_LAMPORTS : 0n);

      return {
        chain: 'solana',
        serialized,
        estimatedFee,
        expiresAt: new Date(Date.now() + 60_000),
        metadata: {
          blockhash: blockhashInfo.blockhash,
          lastValidBlockHeight: Number(blockhashInfo.lastValidBlockHeight),
          version: 0,
          tokenProgram: tokenProgramId,
          needCreateAta,
          token: request.token,
        },
      };
    } catch (error) {
      this.mapError('build token transfer', error);
    }
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    const rpc = this.getRpc();
    try {
      const mintAddr = address(tokenAddress);
      const accountInfo = await rpc
        .getAccountInfo(mintAddr, { encoding: 'base64' })
        .send();

      if (!accountInfo.value) {
        throw new ChainError('TOKEN_ACCOUNT_NOT_FOUND', 'solana', {
          message: `Token mint not found: ${tokenAddress}`,
        });
      }

      // Extract decimals from raw mint data at offset 44 (1 byte uint8)
      // SPL Token Mint layout: mintAuthorityOption(4) + mintAuthority(32) + supply(8) + decimals(1)
      // Offset: 4 + 32 + 8 = 44
      const rawData = accountInfo.value.data;
      let decimals = 0;

      if (Array.isArray(rawData) && rawData.length >= 2) {
        // base64 encoded data: [base64string, encoding]
        const decoded = Buffer.from(rawData[0] as string, 'base64');
        if (decoded.length >= 45) {
          decimals = decoded[44]!;
        }
      }

      const programId = String(accountInfo.value.owner);

      return {
        address: tokenAddress,
        symbol: '',
        name: '',
        decimals,
        programId,
      };
    } catch (error) {
      this.mapError('get token info', error);
    }
  }

  // -- Contract operations (2) --

  async buildContractCall(request: ContractCallParams): Promise<UnsignedTransaction> {
    const rpc = this.getRpc();
    try {
      // Pre-built serialized transaction bypass (#419):
      // When a provider (e.g., DCent) returns a full serialized Solana transaction
      // instead of individual instruction data, pass it through directly.
      if (!request.programId && request.instructionData && (!request.accounts || request.accounts.length === 0)) {
        const serialized = typeof request.instructionData === 'string'
          ? new Uint8Array(Buffer.from(request.instructionData, 'base64'))
          : request.instructionData instanceof Uint8Array
            ? request.instructionData
            : new Uint8Array(Buffer.from(request.instructionData as unknown as string, 'base64'));

        // Refresh blockhash for pre-built transactions (#427):
        // External providers (DCent) may return stale blockhashes. Decode the
        // compiled message, replace lifetimeToken (blockhash), and re-serialize.
        let refreshedSerialized = serialized;
        try {
          const { getCompiledTransactionMessageDecoder, getCompiledTransactionMessageEncoder } = await import('@solana/kit');
          const msgDecoder = getCompiledTransactionMessageDecoder();
          const msgEncoder = getCompiledTransactionMessageEncoder();
          const decoded = txDecoder.decode(serialized);
          const compiledMsg = msgDecoder.decode(decoded.messageBytes);
          const { value: blockhashInfo } = await rpc.getLatestBlockhash().send();
          const updatedMsg = { ...compiledMsg, lifetimeToken: blockhashInfo.blockhash };
          const newMsgBytes = new Uint8Array(msgEncoder.encode(updatedMsg));
          refreshedSerialized = new Uint8Array(txEncoder.encode({
            messageBytes: newMsgBytes as unknown as typeof decoded.messageBytes,
            signatures: decoded.signatures,
          }));
        } catch {
          // If refresh fails, use original serialized bytes (best-effort)
        }

        return {
          chain: 'solana',
          serialized: refreshedSerialized,
          estimatedFee: DEFAULT_SOL_TRANSFER_FEE,
          expiresAt: new Date(Date.now() + 60_000),
          metadata: {
            preBuilt: true,
            provider: 'dcent-swap',
          },
        };
      }

      // Validate required Solana contract call fields
      if (!request.programId) {
        throw new ChainError('INVALID_INSTRUCTION', 'solana', {
          message: 'Missing programId for Solana contract call',
        });
      }
      if (!request.instructionData) {
        throw new ChainError('INVALID_INSTRUCTION', 'solana', {
          message: 'Missing instructionData for Solana contract call',
        });
      }
      if (!request.accounts || request.accounts.length === 0) {
        throw new ChainError('INVALID_INSTRUCTION', 'solana', {
          message: 'Missing accounts for Solana contract call',
        });
      }

      const from = address(request.from);

      // Map account roles: isSigner + isWritable -> AccountRole
      const mappedAccounts = request.accounts.map((acc) => {
        let role: AccountRole;
        if (acc.isSigner && acc.isWritable) {
          role = AccountRole.WRITABLE_SIGNER;
        } else if (acc.isSigner && !acc.isWritable) {
          role = AccountRole.READONLY_SIGNER;
        } else if (!acc.isSigner && acc.isWritable) {
          role = AccountRole.WRITABLE;
        } else {
          role = AccountRole.READONLY;
        }
        return {
          address: address(acc.pubkey),
          role,
        };
      });

      // Handle instructionData: may be Uint8Array or base64 string from REST API
      let dataBytes: Uint8Array;
      if (request.instructionData instanceof Uint8Array) {
        dataBytes = request.instructionData;
      } else {
        // base64 string from REST API
        dataBytes = new Uint8Array(Buffer.from(request.instructionData as unknown as string, 'base64'));
      }

      // Build the main instruction
      const instruction = {
        programAddress: address(request.programId),
        accounts: mappedAccounts,
        data: dataBytes,
      };

      // Helper to map account role
      const mapRole = (acc: { isSigner: boolean; isWritable: boolean }): AccountRole => {
        if (acc.isSigner && acc.isWritable) return AccountRole.WRITABLE_SIGNER;
        if (acc.isSigner && !acc.isWritable) return AccountRole.READONLY_SIGNER;
        if (!acc.isSigner && acc.isWritable) return AccountRole.WRITABLE;
        return AccountRole.READONLY;
      };

      // Helper to decode instruction data (Uint8Array or base64 string)
      const decodeData = (data: Uint8Array | string): Uint8Array => {
        if (data instanceof Uint8Array) return data;
        return new Uint8Array(Buffer.from(data as string, 'base64'));
      };

      // Build pre-instructions (e.g., computeBudget + setup instructions from Jupiter)
      const preInstructions: Array<{
        programAddress: ReturnType<typeof address>;
        accounts: Array<{ address: ReturnType<typeof address>; role: AccountRole }>;
        data: Uint8Array;
      }> = [];
      if (request.preInstructions && request.preInstructions.length > 0) {
        for (const pre of request.preInstructions) {
          preInstructions.push({
            programAddress: address(pre.programId),
            accounts: pre.accounts.map((acc) => ({ address: address(acc.pubkey), role: mapRole(acc) })),
            data: decodeData(pre.data),
          });
        }
      }

      // Build post-instructions (e.g., cleanup instruction from Jupiter)
      const postInstructions: Array<{
        programAddress: ReturnType<typeof address>;
        accounts: Array<{ address: ReturnType<typeof address>; role: AccountRole }>;
        data: Uint8Array;
      }> = [];
      if (request.postInstructions && request.postInstructions.length > 0) {
        for (const post of request.postInstructions) {
          postInstructions.push({
            programAddress: address(post.programId),
            accounts: post.accounts.map((acc) => ({ address: address(acc.pubkey), role: mapRole(acc) })),
            data: decodeData(post.data),
          });
        }
      }

      // Get latest blockhash
      const { value: blockhashInfo } = await rpc.getLatestBlockhash().send();

      // Build transaction message using pipe pattern
      let txMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayer(from, tx),
        (tx) =>
          setTransactionMessageLifetimeUsingBlockhash(
            {
              blockhash: blockhashInfo.blockhash,
              lastValidBlockHeight: blockhashInfo.lastValidBlockHeight,
            },
            tx,
          ),
      );

      // Append pre-instructions first (e.g., computeBudget + ATA creation)
      for (const preIx of preInstructions) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        txMessage = appendTransactionMessageInstruction(preIx as any, txMessage) as unknown as typeof txMessage;
      }

      // Append main instruction
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      txMessage = appendTransactionMessageInstruction(instruction as any, txMessage) as unknown as typeof txMessage;

      // Append post-instructions (e.g., cleanup)
      for (const postIx of postInstructions) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        txMessage = appendTransactionMessageInstruction(postIx as any, txMessage) as unknown as typeof txMessage;
      }

      // Apply Address Lookup Table compression if ALT addresses are provided.
      // This replaces full account pubkeys with compact ALT index references,
      // allowing transactions with many accounts (like Jupiter swaps) to fit
      // within the 1232-byte transaction size limit.
      if (request.addressLookupTableAddresses && request.addressLookupTableAddresses.length > 0) {
        const altAddresses = request.addressLookupTableAddresses.map((a) => address(a));
        const addressesByLookupTable = await fetchAddressesForLookupTables(
          altAddresses,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rpc as any,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        txMessage = compressTransactionMessageUsingAddressLookupTables(txMessage as any, addressesByLookupTable) as unknown as typeof txMessage;
      }

      // Compile and encode
      const compiled = compileTransaction(txMessage);
      const serialized = new Uint8Array(txEncoder.encode(compiled));

      return {
        chain: 'solana',
        serialized,
        estimatedFee: DEFAULT_SOL_TRANSFER_FEE,
        expiresAt: new Date(Date.now() + 60_000),
        metadata: {
          programId: request.programId,
          blockhash: blockhashInfo.blockhash,
          lastValidBlockHeight: Number(blockhashInfo.lastValidBlockHeight),
          version: 0,
        },
      };
    } catch (error) {
      this.mapError('build contract call', error);
    }
  }

  async buildApprove(request: ApproveParams): Promise<UnsignedTransaction> {
    const rpc = this.getRpc();
    try {
      const from = address(request.from);
      const mintAddr = address(request.token.address);

      // Step 1: Query mint account to determine token program
      const mintAccountInfo = await rpc
        .getAccountInfo(mintAddr, { encoding: 'base64' })
        .send();

      if (!mintAccountInfo.value) {
        throw new ChainError('TOKEN_ACCOUNT_NOT_FOUND', 'solana', {
          message: `Token mint not found: ${request.token.address}`,
        });
      }

      const mintOwner = String(mintAccountInfo.value.owner);
      let tokenProgramId: string;

      if (mintOwner === SPL_TOKEN_PROGRAM_ID) {
        tokenProgramId = SPL_TOKEN_PROGRAM_ID;
      } else if (mintOwner === TOKEN_2022_PROGRAM_ID) {
        tokenProgramId = TOKEN_2022_PROGRAM_ID;
      } else {
        throw new ChainError('INVALID_INSTRUCTION', 'solana', {
          message: 'Invalid token mint: owner is not a token program',
        });
      }

      // Step 2: Compute owner's ATA (the token account being approved)
      const [ownerAta] = await findAssociatedTokenPda({
        owner: from,
        tokenProgram: address(tokenProgramId),
        mint: mintAddr,
      });

      // Step 3: Build ApproveChecked instruction
      const instruction = getApproveCheckedInstruction({
        source: ownerAta,
        mint: mintAddr,
        delegate: address(request.spender),
        owner: createNoopSigner(from),
        amount: request.amount,
        decimals: request.token.decimals,
      }, { programAddress: address(tokenProgramId) });

      // Step 4: Get latest blockhash
      const { value: blockhashInfo } = await rpc.getLatestBlockhash().send();

      // Step 5: Build transaction message using pipe pattern
      let txMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayer(from, tx),
        (tx) =>
          setTransactionMessageLifetimeUsingBlockhash(
            {
              blockhash: blockhashInfo.blockhash,
              lastValidBlockHeight: blockhashInfo.lastValidBlockHeight,
            },
            tx,
          ),
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      txMessage = appendTransactionMessageInstruction(instruction as any, txMessage) as unknown as typeof txMessage;

      // Step 6: Compile and encode
      const compiled = compileTransaction(txMessage);
      const serialized = new Uint8Array(txEncoder.encode(compiled));

      return {
        chain: 'solana',
        serialized,
        estimatedFee: DEFAULT_SOL_TRANSFER_FEE,
        expiresAt: new Date(Date.now() + 60_000),
        metadata: {
          blockhash: blockhashInfo.blockhash,
          lastValidBlockHeight: Number(blockhashInfo.lastValidBlockHeight),
          version: 0,
          tokenProgram: tokenProgramId,
          tokenAddress: request.token.address,
          spender: request.spender,
          approveAmount: request.amount,
        },
      };
    } catch (error) {
      this.mapError('build approve', error);
    }
  }

  // -- Batch operations (1) --

  async buildBatch(request: BatchParams): Promise<UnsignedTransaction> {
    const rpc = this.getRpc();
    try {
      const from = address(request.from);
      const fromSigner = createNoopSigner(from);

      // 1. Validate instruction count (2-20)
      if (request.instructions.length < 2) {
        throw new ChainError('BATCH_SIZE_EXCEEDED', 'solana', {
          message: 'Batch requires at least 2 instructions',
        });
      }
      if (request.instructions.length > 20) {
        throw new ChainError('BATCH_SIZE_EXCEEDED', 'solana', {
          message: 'Batch maximum 20 instructions',
        });
      }

      // 2. Get latest blockhash
      const { value: blockhashInfo } = await rpc.getLatestBlockhash().send();

      // 3. Build base transaction message
      let txMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayer(from, tx),
        (tx) =>
          setTransactionMessageLifetimeUsingBlockhash(
            {
              blockhash: blockhashInfo.blockhash,
              lastValidBlockHeight: blockhashInfo.lastValidBlockHeight,
            },
            tx,
          ),
      );

      // 4. Convert each instruction and append
      let ataCount = 0;
      const instructionTypes: string[] = [];

      for (const instr of request.instructions) {
        const solanaInstructions = await this.convertBatchInstruction(instr, from, fromSigner, rpc);
        // Count ATA creations (TOKEN_TRANSFER may insert extra ATA create instruction)
        if ('token' in instr && !('spender' in instr) && solanaInstructions.length > 1) {
          ataCount++;
        }
        instructionTypes.push(this.classifyInstruction(instr));
        for (const ix of solanaInstructions) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          txMessage = appendTransactionMessageInstruction(ix as any, txMessage) as unknown as typeof txMessage;
        }
      }

      // 5. Compile and encode
      const compiled = compileTransaction(txMessage);
      const serialized = new Uint8Array(txEncoder.encode(compiled));

      // 6. Estimate fee: base fee + ATA rent for each needed ATA
      const estimatedFee = DEFAULT_SOL_TRANSFER_FEE + (BigInt(ataCount) * ATA_RENT_LAMPORTS);

      return {
        chain: 'solana',
        serialized,
        estimatedFee,
        expiresAt: new Date(Date.now() + 60_000),
        metadata: {
          blockhash: blockhashInfo.blockhash,
          lastValidBlockHeight: Number(blockhashInfo.lastValidBlockHeight),
          version: 0,
          instructionCount: request.instructions.length,
          instructionTypes,
          ataCreations: ataCount,
        },
      };
    } catch (error) {
      this.mapError('build batch', error);
    }
  }

  // -- Batch helpers --

  /**
   * Classify an instruction into its type string based on the fields present.
   * Discriminator logic (no `type` field on union members):
   *   has `spender` -> APPROVE
   *   has `token` but no `spender` -> TOKEN_TRANSFER
   *   has `programId` -> CONTRACT_CALL
   *   else -> TRANSFER
   */
  private classifyInstruction(
    instr: import('@waiaas/core').TransferRequest
      | import('@waiaas/core').TokenTransferParams
      | import('@waiaas/core').ContractCallParams
      | import('@waiaas/core').ApproveParams,
  ): string {
    if ('spender' in instr) return 'APPROVE';
    if ('token' in instr) return 'TOKEN_TRANSFER';
    if ('programId' in instr) return 'CONTRACT_CALL';
    return 'TRANSFER';
  }

  /**
   * Convert a single batch instruction into one or more Solana instructions.
   * Returns an array because TOKEN_TRANSFER may prepend an ATA create instruction.
   */
  private async convertBatchInstruction(
    instr: import('@waiaas/core').TransferRequest
      | import('@waiaas/core').TokenTransferParams
      | import('@waiaas/core').ContractCallParams
      | import('@waiaas/core').ApproveParams,
    from: ReturnType<typeof address>,
    fromSigner: ReturnType<typeof createNoopSigner>,
    rpc: SolanaRpc,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    const type = this.classifyInstruction(instr);

    if (type === 'TRANSFER') {
      const transfer = instr as import('@waiaas/core').TransferRequest;
      const to = address(transfer.to);
      return [
        getTransferSolInstruction({
          source: fromSigner,
          destination: to,
          amount: transfer.amount,
        }),
      ];
    }

    if (type === 'TOKEN_TRANSFER') {
      const tokenTx = instr as import('@waiaas/core').TokenTransferParams;
      const mintAddr = address(tokenTx.token.address);
      const to = address(tokenTx.to);

      // Query mint to determine token program
      const mintAccountInfo = await rpc
        .getAccountInfo(mintAddr, { encoding: 'base64' })
        .send();

      if (!mintAccountInfo.value) {
        throw new ChainError('TOKEN_ACCOUNT_NOT_FOUND', 'solana', {
          message: `Token mint not found: ${tokenTx.token.address}`,
        });
      }

      const mintOwner = String(mintAccountInfo.value.owner);
      let tokenProgramId: string;

      if (mintOwner === SPL_TOKEN_PROGRAM_ID) {
        tokenProgramId = SPL_TOKEN_PROGRAM_ID;
      } else if (mintOwner === TOKEN_2022_PROGRAM_ID) {
        tokenProgramId = TOKEN_2022_PROGRAM_ID;
      } else {
        throw new ChainError('INVALID_INSTRUCTION', 'solana', {
          message: 'Invalid token mint: owner is not a token program',
        });
      }

      // Compute source and destination ATA
      const [sourceAta] = await findAssociatedTokenPda({
        owner: from,
        tokenProgram: address(tokenProgramId),
        mint: mintAddr,
      });

      const [destinationAta] = await findAssociatedTokenPda({
        owner: to,
        tokenProgram: address(tokenProgramId),
        mint: mintAddr,
      });

      // Check if destination ATA exists
      const destAtaInfo = await rpc
        .getAccountInfo(destinationAta, { encoding: 'base64' })
        .send();

      const needCreateAta = !destAtaInfo.value;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const instructions: any[] = [];

      if (needCreateAta) {
        instructions.push(
          getCreateAssociatedTokenIdempotentInstruction({
            payer: fromSigner,
            ata: destinationAta,
            owner: to,
            mint: mintAddr,
            tokenProgram: address(tokenProgramId),
          }),
        );
      }

      instructions.push(
        getTransferCheckedInstruction(
          {
            source: sourceAta,
            mint: mintAddr,
            destination: destinationAta,
            authority: fromSigner,
            amount: tokenTx.amount,
            decimals: tokenTx.token.decimals,
          },
          { programAddress: address(tokenProgramId) },
        ),
      );

      return instructions;
    }

    if (type === 'CONTRACT_CALL') {
      const contractCall = instr as import('@waiaas/core').ContractCallParams;

      if (!contractCall.programId) {
        throw new ChainError('INVALID_INSTRUCTION', 'solana', {
          message: 'Missing programId for Solana contract call in batch',
        });
      }
      if (!contractCall.instructionData) {
        throw new ChainError('INVALID_INSTRUCTION', 'solana', {
          message: 'Missing instructionData for Solana contract call in batch',
        });
      }
      if (!contractCall.accounts || contractCall.accounts.length === 0) {
        throw new ChainError('INVALID_INSTRUCTION', 'solana', {
          message: 'Missing accounts for Solana contract call in batch',
        });
      }

      // Map account roles
      const mappedAccounts = contractCall.accounts.map((acc) => {
        let role: AccountRole;
        if (acc.isSigner && acc.isWritable) {
          role = AccountRole.WRITABLE_SIGNER;
        } else if (acc.isSigner && !acc.isWritable) {
          role = AccountRole.READONLY_SIGNER;
        } else if (!acc.isSigner && acc.isWritable) {
          role = AccountRole.WRITABLE;
        } else {
          role = AccountRole.READONLY;
        }
        return {
          address: address(acc.pubkey),
          role,
        };
      });

      // Handle instructionData: Uint8Array or base64 string
      let dataBytes: Uint8Array;
      if (contractCall.instructionData instanceof Uint8Array) {
        dataBytes = contractCall.instructionData;
      } else {
        dataBytes = new Uint8Array(Buffer.from(contractCall.instructionData as unknown as string, 'base64'));
      }

      return [
        {
          programAddress: address(contractCall.programId),
          accounts: mappedAccounts,
          data: dataBytes,
        },
      ];
    }

    if (type === 'APPROVE') {
      const approve = instr as import('@waiaas/core').ApproveParams;
      const mintAddr = address(approve.token.address);

      // Query mint to determine token program
      const mintAccountInfo = await rpc
        .getAccountInfo(mintAddr, { encoding: 'base64' })
        .send();

      if (!mintAccountInfo.value) {
        throw new ChainError('TOKEN_ACCOUNT_NOT_FOUND', 'solana', {
          message: `Token mint not found: ${approve.token.address}`,
        });
      }

      const mintOwner = String(mintAccountInfo.value.owner);
      let tokenProgramId: string;

      if (mintOwner === SPL_TOKEN_PROGRAM_ID) {
        tokenProgramId = SPL_TOKEN_PROGRAM_ID;
      } else if (mintOwner === TOKEN_2022_PROGRAM_ID) {
        tokenProgramId = TOKEN_2022_PROGRAM_ID;
      } else {
        throw new ChainError('INVALID_INSTRUCTION', 'solana', {
          message: 'Invalid token mint: owner is not a token program',
        });
      }

      // Compute owner's ATA
      const [ownerAta] = await findAssociatedTokenPda({
        owner: from,
        tokenProgram: address(tokenProgramId),
        mint: mintAddr,
      });

      return [
        getApproveCheckedInstruction(
          {
            source: ownerAta,
            mint: mintAddr,
            delegate: address(approve.spender),
            owner: fromSigner,
            amount: approve.amount,
            decimals: approve.token.decimals,
          },
          { programAddress: address(tokenProgramId) },
        ),
      ];
    }

    throw new ChainError('INVALID_INSTRUCTION', 'solana', {
      message: `Unknown instruction type in batch`,
    });
  }

  // -- Utility operations (3) --

  async getTransactionFee(tx: UnsignedTransaction): Promise<bigint> {
    // Solana fees are known at build time (estimatedFee is set during build)
    return tx.estimatedFee;
  }

  async getCurrentNonce(_address: string): Promise<number> {
    // Solana doesn't use nonces in the EVM sense; return 0 as specified.
    return 0;
  }

  // -- Sign-only operations (2) -- v1.4.7

  async parseTransaction(rawTx: string): Promise<ParsedTransaction> {
    // Offline operation -- no RPC connection needed.
    // Delegates to tx-parser.ts which handles all instruction identification.
    return parseSolanaTransaction(rawTx);
  }

  async signExternalTransaction(rawTx: string, privateKey: Uint8Array): Promise<SignedTransaction> {
    // Offline operation -- no RPC connection needed.
    try {
      // Step 1: Decode base64 rawTx to wire-format bytes
      let txBytes: Uint8Array;
      try {
        txBytes = new Uint8Array(Buffer.from(rawTx, 'base64'));
      } catch {
        throw new ChainError('INVALID_RAW_TRANSACTION', 'solana', {
          message: 'Failed to decode base64 rawTx',
        });
      }

      // Step 2: Decode compiled transaction
      let compiled;
      try {
        compiled = txDecoder.decode(txBytes);
      } catch (error) {
        throw new ChainError('INVALID_RAW_TRANSACTION', 'solana', {
          message: `Failed to decode Solana transaction: ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      // Step 3: Create key pair (reuse existing 64-byte vs 32-byte detection pattern)
      const keyPair =
        privateKey.length === 64
          ? await createKeyPairFromBytes(privateKey)
          : await createKeyPairFromPrivateKeyBytes(privateKey.slice(0, 32));

      // Step 4: Get signer address from public key
      const signerAddress = await getAddressFromPublicKey(keyPair.publicKey);

      // Step 5: Verify wallet is a signer in this transaction
      if (!(signerAddress in compiled.signatures)) {
        throw new ChainError('WALLET_NOT_SIGNER', 'solana', {
          message: `Wallet ${signerAddress} is not a signer in this transaction`,
        });
      }

      // Step 6: Sign the messageBytes with the private key
      const signature = await signBytes(keyPair.privateKey, compiled.messageBytes);

      // Step 7: Place signature in the correct slot
      const signedTx = {
        ...compiled,
        signatures: {
          ...compiled.signatures,
          [signerAddress]: signature,
        },
      };

      // Step 8: Re-encode and return as base64
      const signedBytes = new Uint8Array(txEncoder.encode(signedTx));
      const signedBase64 = Buffer.from(signedBytes).toString('base64');

      return { signedTransaction: signedBase64 };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      throw new ChainError('INVALID_RAW_TRANSACTION', 'solana', {
        message: `Failed to sign external transaction: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // -- NFT operations (3) -- v31.0

  async buildNftTransferTx(request: NftTransferParams): Promise<UnsignedTransaction> {
    const rpc = this.getRpc();
    try {
      if (request.token.standard !== 'METAPLEX') {
        throw new WAIaaSError('UNSUPPORTED_NFT_STANDARD', {
          message: `Solana adapter only supports METAPLEX NFTs, got: ${request.token.standard}`,
        });
      }

      const from = address(request.from);
      const to = address(request.to);
      const mintAddr = address(request.token.address);

      // Metaplex NFTs are SPL tokens with decimals=0
      const mintAccountInfo = await rpc
        .getAccountInfo(mintAddr, { encoding: 'base64' })
        .send();

      if (!mintAccountInfo.value) {
        throw new ChainError('TOKEN_ACCOUNT_NOT_FOUND', 'solana', {
          message: `NFT mint not found: ${request.token.address}`,
        });
      }

      const mintOwner = String(mintAccountInfo.value.owner);
      let tokenProgramId: string;

      if (mintOwner === SPL_TOKEN_PROGRAM_ID) {
        tokenProgramId = SPL_TOKEN_PROGRAM_ID;
      } else if (mintOwner === TOKEN_2022_PROGRAM_ID) {
        tokenProgramId = TOKEN_2022_PROGRAM_ID;
      } else {
        throw new ChainError('INVALID_INSTRUCTION', 'solana', {
          message: 'Invalid NFT mint: owner is not a token program',
        });
      }

      // Find source and destination ATAs
      const [sourceAta] = await findAssociatedTokenPda({
        owner: from,
        tokenProgram: address(tokenProgramId),
        mint: mintAddr,
      });

      const [destinationAta] = await findAssociatedTokenPda({
        owner: to,
        tokenProgram: address(tokenProgramId),
        mint: mintAddr,
      });

      // Check if destination ATA exists
      const destAtaInfo = await rpc
        .getAccountInfo(destinationAta, { encoding: 'base64' })
        .send();
      const needCreateAta = !destAtaInfo.value;

      // Get blockhash
      const { value: blockhashInfo } = await rpc.getLatestBlockhash().send();

      const fromSigner = createNoopSigner(from);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const instructions: any[] = [];

      if (needCreateAta) {
        instructions.push(
          getCreateAssociatedTokenIdempotentInstruction({
            payer: fromSigner,
            ata: destinationAta,
            owner: to,
            mint: mintAddr,
            tokenProgram: address(tokenProgramId),
          }),
        );
      }

      // NFT transfer: amount = request.amount (typically 1), decimals = 0
      instructions.push(
        getTransferCheckedInstruction(
          {
            source: sourceAta,
            mint: mintAddr,
            destination: destinationAta,
            authority: fromSigner,
            amount: request.amount,
            decimals: 0,
          },
          { programAddress: address(tokenProgramId) },
        ),
      );

      let txMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayer(from, tx),
        (tx) =>
          setTransactionMessageLifetimeUsingBlockhash(
            {
              blockhash: blockhashInfo.blockhash,
              lastValidBlockHeight: blockhashInfo.lastValidBlockHeight,
            },
            tx,
          ),
      );

      for (const ix of instructions) {
        txMessage = appendTransactionMessageInstruction(ix, txMessage) as unknown as typeof txMessage;
      }

      const compiled = compileTransaction(txMessage);
      const serialized = new Uint8Array(txEncoder.encode(compiled));
      const estimatedFee = DEFAULT_SOL_TRANSFER_FEE + (needCreateAta ? ATA_RENT_LAMPORTS : 0n);

      return {
        chain: 'solana',
        serialized,
        estimatedFee,
        expiresAt: new Date(Date.now() + 60_000),
        metadata: {
          blockhash: blockhashInfo.blockhash,
          lastValidBlockHeight: Number(blockhashInfo.lastValidBlockHeight),
          version: 0,
          tokenProgram: tokenProgramId,
          needCreateAta,
          nftStandard: 'METAPLEX',
          tokenMint: request.token.address,
        },
      };
    } catch (error) {
      this.mapError('build NFT transfer', error);
    }
  }

  async transferNft(request: NftTransferParams, privateKey: Uint8Array): Promise<SubmitResult> {
    const unsignedTx = await this.buildNftTransferTx(request);
    const signedTx = await this.signTransaction(unsignedTx, privateKey);
    return this.submitTransaction(signedTx);
  }

  async approveNft(request: NftApproveParams): Promise<UnsignedTransaction> {
    const rpc = this.getRpc();
    try {
      if (request.approvalType === 'all') {
        throw new WAIaaSError('UNSUPPORTED_NFT_STANDARD', {
          message: 'Solana does not support collection-wide NFT approval',
        });
      }

      if (request.token.standard !== 'METAPLEX') {
        throw new WAIaaSError('UNSUPPORTED_NFT_STANDARD', {
          message: `Solana adapter only supports METAPLEX NFTs, got: ${request.token.standard}`,
        });
      }

      const from = address(request.from);
      const mintAddr = address(request.token.address);

      // Query mint account for token program
      const mintAccountInfo = await rpc
        .getAccountInfo(mintAddr, { encoding: 'base64' })
        .send();

      if (!mintAccountInfo.value) {
        throw new ChainError('TOKEN_ACCOUNT_NOT_FOUND', 'solana', {
          message: `NFT mint not found: ${request.token.address}`,
        });
      }

      const mintOwner = String(mintAccountInfo.value.owner);
      let tokenProgramId: string;

      if (mintOwner === SPL_TOKEN_PROGRAM_ID) {
        tokenProgramId = SPL_TOKEN_PROGRAM_ID;
      } else if (mintOwner === TOKEN_2022_PROGRAM_ID) {
        tokenProgramId = TOKEN_2022_PROGRAM_ID;
      } else {
        throw new ChainError('INVALID_INSTRUCTION', 'solana', {
          message: 'Invalid NFT mint: owner is not a token program',
        });
      }

      // Find owner's ATA
      const [ownerAta] = await findAssociatedTokenPda({
        owner: from,
        tokenProgram: address(tokenProgramId),
        mint: mintAddr,
      });

      // Delegate with amount=1, decimals=0 for NFT
      const instruction = getApproveCheckedInstruction({
        source: ownerAta,
        mint: mintAddr,
        delegate: address(request.spender),
        owner: createNoopSigner(from),
        amount: 1n,
        decimals: 0,
      }, { programAddress: address(tokenProgramId) });

      const { value: blockhashInfo } = await rpc.getLatestBlockhash().send();

      let txMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayer(from, tx),
        (tx) =>
          setTransactionMessageLifetimeUsingBlockhash(
            {
              blockhash: blockhashInfo.blockhash,
              lastValidBlockHeight: blockhashInfo.lastValidBlockHeight,
            },
            tx,
          ),
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      txMessage = appendTransactionMessageInstruction(instruction as any, txMessage) as unknown as typeof txMessage;

      const compiled = compileTransaction(txMessage);
      const serialized = new Uint8Array(txEncoder.encode(compiled));

      return {
        chain: 'solana',
        serialized,
        estimatedFee: DEFAULT_SOL_TRANSFER_FEE,
        expiresAt: new Date(Date.now() + 60_000),
        metadata: {
          blockhash: blockhashInfo.blockhash,
          lastValidBlockHeight: Number(blockhashInfo.lastValidBlockHeight),
          version: 0,
          nftStandard: 'METAPLEX',
          tokenMint: request.token.address,
          spender: request.spender,
          approvalType: request.approvalType,
        },
      };
    } catch (error) {
      this.mapError('build NFT approval', error);
    }
  }

  // -- Private helpers --

  /**
   * Centralized error mapping for catch blocks.
   * - WAIaaSError: re-throw as-is
   * - ChainError: re-throw as-is (Stage 5 converts to WAIaaSError)
   * - Other: wrap in WAIaaSError('CHAIN_ERROR')
   */
  private mapError(operation: string, error: unknown): never {
    if (error instanceof WAIaaSError) throw error;
    if (error instanceof ChainError) throw error;
    throw new WAIaaSError('CHAIN_ERROR', {
      message: `Failed to ${operation}: ${error instanceof Error ? error.message : String(error)}`,
      cause: error instanceof Error ? error : undefined,
    });
  }

  private ensureConnected(): void {
    if (!this._connected || !this._rpc) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'SolanaAdapter is not connected. Call connect() first.',
      });
    }
  }

  /**
   * Wraps an RPC call with exponential backoff retry for 429/408/5xx errors (#187).
   * Jitter: 50-100% of computed delay to prevent thundering herd.
   */
  private async withRpcRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RPC_RETRY_MAX; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt >= RPC_RETRY_MAX) break;
        // Only retry on retryable HTTP status codes or network errors
        if (!isRetryableRpcError(err)) break;
        const delayMs = Math.min(RPC_RETRY_BASE_MS * 2 ** attempt, RPC_RETRY_MAX_MS);
        const jitter = delayMs * (0.5 + Math.random() * 0.5);
        await sleep(jitter);
      }
    }
    throw lastError;
  }

  private getRpc(): SolanaRpc {
    this.ensureConnected();
    return this._rpc!;
  }
}

/** Check if an RPC error is retryable (429/408/5xx or network errors). */
function isRetryableRpcError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  // Solana RPC errors include HTTP status in the message
  for (const status of RPC_RETRYABLE_STATUSES) {
    if (msg.includes(String(status))) return true;
  }
  // Network errors
  if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')) {
    return true;
  }
  return false;
}
