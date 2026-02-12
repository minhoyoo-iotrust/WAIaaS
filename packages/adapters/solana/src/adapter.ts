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
  SweepResult,
  TokenTransferParams,
  ContractCallParams,
  ApproveParams,
  BatchParams,
} from '@waiaas/core';
import { WAIaaSError, ChainError } from '@waiaas/core';

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

/** Re-usable transaction encoder (stateless, safe to share). */
const txEncoder = getTransactionEncoder();

/** Re-usable transaction decoder (stateless, safe to share). */
const txDecoder = getTransactionDecoder();

type SolanaRpc = ReturnType<typeof createSolanaRpc>;

/**
 * Solana chain adapter implementing the 20-method IChainAdapter contract.
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
 * Utility: getTransactionFee, getCurrentNonce, sweepAll
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

      // 2. Get SPL Token Program accounts
      const tokenResult = await rpc
        .getTokenAccountsByOwner(
          address(addr),
          { programId: address(SPL_TOKEN_PROGRAM_ID) },
          { encoding: 'jsonParsed' },
        )
        .send();

      // 3. Get Token-2022 program accounts
      const token2022Result = await rpc
        .getTokenAccountsByOwner(
          address(addr),
          { programId: address(TOKEN_2022_PROGRAM_ID) },
          { encoding: 'jsonParsed' },
        )
        .send();

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

        let tokenProgramId: string;
        if (!mintAccountInfo.value) {
          throw new ChainError('TOKEN_ACCOUNT_NOT_FOUND', 'solana', {
            message: `Token mint not found: ${tokenRequest.token.address}`,
          });
        }
        tokenProgramId = String(mintAccountInfo.value.owner);

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
      if (error instanceof ChainError) throw error;
      if (error instanceof WAIaaSError) throw error;
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Failed to estimate fee: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      });
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
      if (error instanceof ChainError) throw error;
      if (error instanceof WAIaaSError) throw error;
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Failed to build token transfer: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      });
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
      if (error instanceof ChainError) throw error;
      if (error instanceof WAIaaSError) throw error;
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Failed to get token info: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  // -- Contract operations (2) --

  async buildContractCall(request: ContractCallParams): Promise<UnsignedTransaction> {
    const rpc = this.getRpc();
    try {
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

      // Build the instruction
      const instruction = {
        programAddress: address(request.programId),
        accounts: mappedAccounts,
        data: dataBytes,
      };

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

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      txMessage = appendTransactionMessageInstruction(instruction as any, txMessage) as unknown as typeof txMessage;

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
      if (error instanceof ChainError) throw error;
      if (error instanceof WAIaaSError) throw error;
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Failed to build contract call: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      });
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

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
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
      if (error instanceof ChainError) throw error;
      if (error instanceof WAIaaSError) throw error;
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Failed to build approve: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  // -- Batch operations (1) --

  async buildBatch(_request: BatchParams): Promise<UnsignedTransaction> {
    throw new Error('Not implemented: buildBatch will be implemented in Phase 80');
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

  async sweepAll(_from: string, _to: string, _privateKey: Uint8Array): Promise<SweepResult> {
    throw new Error('Not implemented: sweepAll will be implemented in Phase 80');
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
