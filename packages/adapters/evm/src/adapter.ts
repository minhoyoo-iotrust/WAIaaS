/**
 * EvmAdapter -- IChainAdapter implementation for EVM chains using viem 2.x.
 *
 * Phase 77-01: Scaffolding with 6 real implementations.
 * Phase 77-02: 11 more real implementations (build/simulate/sign/submit/confirm/fee/nonce/assets/tokenInfo/approve/txFee).
 * Phase 78-02: buildTokenTransfer real implementation + getAssets ERC-20 multicall expansion.
 * Phase 79-01: buildContractCall real implementation.
 *
 * Real implementations (21):
 *   connect, disconnect, isConnected, getHealth, getBalance, getCurrentNonce,
 *   buildTransaction, simulateTransaction, signTransaction, submitTransaction,
 *   waitForConfirmation, estimateFee, getTransactionFee, getAssets, getTokenInfo,
 *   buildApprove, buildBatch (BATCH_NOT_SUPPORTED), buildTokenTransfer, buildContractCall,
 *   parseTransaction, signExternalTransaction
 */

import {
  createPublicClient,
  http,
  serializeTransaction,
  parseTransaction as viemParseTransaction,
  encodeFunctionData,
  hexToBytes,
  toHex,
  getAddress,
  type PublicClient,
  type Chain,
  type TransactionSerializedEIP1559,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { parseEvmTransaction } from './tx-parser.js';
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
import { WAIaaSError, ChainError } from '@waiaas/core';
import { ERC20_ABI } from './abi/erc20.js';
import { ERC721_ABI } from './abi/erc721.js';
import { ERC1155_ABI } from './abi/erc1155.js';
import { ERC165_ABI, ERC_INTERFACE_IDS } from './abi/erc165.js';

/** Gas safety margin multiplier: 1.2x (120/100). */
const GAS_SAFETY_NUMERATOR = 120n;
const GAS_SAFETY_DENOMINATOR = 100n;

/**
 * EVM chain adapter implementing the 20-method IChainAdapter contract.
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
 */
export class EvmAdapter implements IChainAdapter {
  readonly chain: ChainType = 'ethereum';
  readonly network: NetworkType;

  private _client: PublicClient | null = null;
  private _connected = false;
  private _chain: Chain | undefined;
  private _nativeSymbol: string;
  private _nativeName: string;
  private _allowedTokens: Array<{ address: string; symbol?: string; name?: string; decimals?: number }> = [];

  constructor(
    network: NetworkType,
    chain?: Chain,
    nativeSymbol: string = 'ETH',
    nativeName: string = 'Ether',
  ) {
    this.network = network;
    this._chain = chain;
    this._nativeSymbol = nativeSymbol;
    this._nativeName = nativeName;
  }

  /** Set the allowed tokens list for getAssets ERC-20 queries. Normalizes addresses to EIP-55 checksum. */
  setAllowedTokens(tokens: Array<{ address: string; symbol?: string; name?: string; decimals?: number }>): void {
    this._allowedTokens = tokens.map(token => ({
      ...token,
      address: getAddress(token.address),
    }));
  }

  // -- Connection management (4) --

  async connect(rpcUrl: string): Promise<void> {
    this._client = createPublicClient({
      transport: http(rpcUrl),
      chain: this._chain,
    });
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this._client = null;
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }

  async getHealth(): Promise<HealthInfo> {
    const client = this.getClient();
    try {
      const start = Date.now();
      const blockNumber = await client.getBlockNumber();
      const latencyMs = Date.now() - start;
      return {
        healthy: true,
        latencyMs,
        blockHeight: blockNumber,
      };
    } catch {
      return { healthy: false, latencyMs: 0 };
    }
  }

  // -- Balance query (1) --

  async getBalance(addr: string): Promise<BalanceInfo> {
    const client = this.getClient();
    try {
      const balance = await client.getBalance({
        address: addr as `0x${string}`,
      });
      return {
        address: addr,
        balance,
        decimals: 18,
        symbol: this._nativeSymbol,
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
    const client = this.getClient();
    try {
      // 1. Get native balance
      const ethBalance = await client.getBalance({
        address: addr as `0x${string}`,
      });
      const assets: AssetInfo[] = [
        {
          mint: 'native',
          symbol: this._nativeSymbol,
          name: this._nativeName,
          balance: ethBalance,
          decimals: 18,
          isNative: true,
        },
      ];

      // 2. Query ERC-20 balances if allowedTokens configured
      if (this._allowedTokens.length > 0) {
        // Build multicall contracts array for balanceOf queries
        const balanceContracts = this._allowedTokens.map(token => ({
          address: token.address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf' as const,
          args: [addr as `0x${string}`],
        }));

        const results = await client.multicall({ contracts: balanceContracts });

        // 3. Process results, fall back to individual eth_call for failed multicall entries
        for (let i = 0; i < results.length; i++) {
          const result = results[i]!;
          const tokenDef = this._allowedTokens[i]!;

          if (result.status === 'success') {
            const balance = result.result as bigint;
            if (balance > 0n) {
              assets.push({
                mint: tokenDef.address,
                symbol: tokenDef.symbol ?? '',
                name: tokenDef.name ?? '',
                balance,
                decimals: tokenDef.decimals ?? 18,
                isNative: false,
              });
            }
          } else {
            // Multicall failed for this token -- log and fall back to individual balanceOf
            console.warn('[EvmAdapter] ERC-20 multicall failed, falling back to individual call', {
              token: tokenDef.address,
              symbol: tokenDef.symbol,
              error: result.error?.message,
            });
            try {
              const fallbackBalance = await client.readContract({
                address: tokenDef.address as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [addr as `0x${string}`],
              }) as bigint;
              if (fallbackBalance > 0n) {
                assets.push({
                  mint: tokenDef.address,
                  symbol: tokenDef.symbol ?? '',
                  name: tokenDef.name ?? '',
                  balance: fallbackBalance,
                  decimals: tokenDef.decimals ?? 18,
                  isNative: false,
                });
              }
            } catch (fallbackErr) {
              console.warn('[EvmAdapter] ERC-20 individual balanceOf also failed, skipping token', {
                token: tokenDef.address,
                symbol: tokenDef.symbol,
                error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
              });
            }
          }
        }

        // 4. Sort: native first (already first), then by balance descending
        if (assets.length > 1) {
          const native = assets[0]!;
          const tokens = assets.slice(1).sort((a, b) => {
            if (b.balance > a.balance) return 1;
            if (b.balance < a.balance) return -1;
            return a.symbol.localeCompare(b.symbol); // tie-break: alphabetical
          });
          return [native, ...tokens];
        }
      }

      return assets;
    } catch (error) {
      throw this.mapError(error, 'Failed to get assets');
    }
  }

  // -- Transaction 4-stage pipeline (4) --

  async buildTransaction(request: TransferRequest): Promise<UnsignedTransaction> {
    const client = this.getClient();
    try {
      const fromAddr = request.from as `0x${string}`;
      const toAddr = request.to as `0x${string}`;

      // 1. Get nonce
      const nonce = await client.getTransactionCount({ address: fromAddr });

      // 2. Get EIP-1559 fee data
      const fees = await client.estimateFeesPerGas();

      // 3. Estimate gas with 1.2x safety margin
      const estimatedGas = await client.estimateGas({
        account: fromAddr,
        to: toAddr,
        value: request.amount,
        data: request.memo
          ? (`0x${Buffer.from(request.memo).toString('hex')}` as Hex)
          : undefined,
      });
      const gasLimit = (estimatedGas * GAS_SAFETY_NUMERATOR) / GAS_SAFETY_DENOMINATOR;

      const maxFeePerGas = fees.maxFeePerGas!;
      const maxPriorityFeePerGas = fees.maxPriorityFeePerGas!;

      // 4. Build EIP-1559 transaction request
      const chainId = client.chain?.id ?? 1;
      const txRequest = {
        type: 'eip1559' as const,
        to: toAddr,
        value: request.amount,
        nonce,
        gas: gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas,
        chainId,
        data: request.memo
          ? (`0x${Buffer.from(request.memo).toString('hex')}` as Hex)
          : undefined,
      };

      // 5. Serialize transaction
      const serializedHex = serializeTransaction(txRequest);
      const serializedBytes = hexToBytes(serializedHex);

      // 6. Calculate estimated fee
      const estimatedFee = gasLimit * maxFeePerGas;

      return {
        chain: 'ethereum',
        serialized: serializedBytes,
        estimatedFee,
        expiresAt: undefined, // EVM uses nonce, no expiry
        metadata: {
          from: request.from,
          nonce,
          chainId,
          maxFeePerGas,
          maxPriorityFeePerGas,
          gasLimit,
          type: 'eip1559',
        },
        nonce,
      };
    } catch (error) {
      if (error instanceof ChainError || error instanceof WAIaaSError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('insufficient funds')) {
        throw new ChainError('INSUFFICIENT_BALANCE', 'evm', {
          message: `Insufficient funds for transfer: ${msg}`,
          cause: error instanceof Error ? error : undefined,
        });
      }
      if (msg.toLowerCase().includes('nonce too low')) {
        throw new ChainError('NONCE_TOO_LOW', 'evm', {
          message: `Nonce too low: ${msg}`,
          cause: error instanceof Error ? error : undefined,
        });
      }
      throw this.mapError(error, 'Failed to build transaction');
    }
  }

  async simulateTransaction(tx: UnsignedTransaction): Promise<SimulationResult> {
    const client = this.getClient();
    try {
      // Deserialize the tx from serialized bytes back to tx params
      const serializedHex = toHex(tx.serialized);
      const parsed = viemParseTransaction(serializedHex as TransactionSerializedEIP1559);

      // Use client.call() to simulate via eth_call
      await client.call({
        to: parsed.to!,
        value: parsed.value,
        data: parsed.data,
        account: tx.metadata.from as `0x${string}` | undefined,
      });

      return {
        success: true,
        logs: [],
        unitsConsumed: tx.metadata.gasLimit != null ? BigInt(tx.metadata.gasLimit as bigint) : undefined,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        logs: [],
        error: msg,
      };
    }
  }

  async signTransaction(tx: UnsignedTransaction, privateKey: Uint8Array): Promise<Uint8Array> {
    this.ensureConnected();
    try {
      // Convert private key bytes to hex
      const privateKeyHex = `0x${Buffer.from(privateKey).toString('hex')}` as Hex;

      // Create account from private key
      const account = privateKeyToAccount(privateKeyHex);

      // Deserialize tx bytes back to tx object
      const serializedHex = toHex(tx.serialized);
      const parsed = viemParseTransaction(serializedHex as TransactionSerializedEIP1559);

      // Sign the transaction
      const signedHex = await account.signTransaction({
        ...parsed,
        type: 'eip1559',
      } as Parameters<typeof account.signTransaction>[0]);

      // Convert signed hex to Uint8Array
      return hexToBytes(signedHex as Hex);
    } catch (error) {
      if (error instanceof ChainError || error instanceof WAIaaSError) throw error;
      throw this.mapError(error, 'Failed to sign transaction');
    }
  }

  async submitTransaction(signedTx: Uint8Array): Promise<SubmitResult> {
    const client = this.getClient();
    try {
      // Convert bytes to hex
      const hex = toHex(signedTx);

      // Submit via eth_sendRawTransaction
      const txHash = await client.sendRawTransaction({
        serializedTransaction: hex as Hex,
      });

      return {
        txHash,
        status: 'submitted',
      };
    } catch (error) {
      if (error instanceof ChainError || error instanceof WAIaaSError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('nonce') && msg.toLowerCase().includes('already')) {
        throw new ChainError('NONCE_ALREADY_USED', 'evm', {
          message: `Nonce already used: ${msg}`,
          cause: error instanceof Error ? error : undefined,
        });
      }
      throw this.mapError(error, 'Failed to submit transaction');
    }
  }

  // -- Confirmation wait (1) --

  async waitForConfirmation(txHash: string, timeoutMs = 30_000): Promise<SubmitResult> {
    const client = this.getClient();
    try {
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        timeout: timeoutMs,
      });

      return {
        txHash,
        status: receipt.status === 'success' ? 'confirmed' : 'failed',
        blockNumber: receipt.blockNumber,
        fee: receipt.gasUsed * receipt.effectiveGasPrice,
      };
    } catch {
      // Timeout or RPC error: fallback to direct receipt query
      try {
        const receipt = await client.getTransactionReceipt({
          hash: txHash as `0x${string}`,
        });
        return {
          txHash,
          status: receipt.status === 'success' ? 'confirmed' : 'failed',
          blockNumber: receipt.blockNumber,
          fee: receipt.gasUsed * receipt.effectiveGasPrice,
        };
      } catch {
        // Receipt not found: tx still pending
        return { txHash, status: 'submitted' };
      }
    }
  }

  // -- Fee estimation (1) --

  async estimateFee(request: TransferRequest | TokenTransferParams): Promise<FeeEstimate> {
    const client = this.getClient();
    try {
      // Get EIP-1559 fee data
      const fees = await client.estimateFeesPerGas();

      // Determine gas estimate based on request type
      let gasEstimateParams: { account: `0x${string}`; to: `0x${string}`; value?: bigint; data?: Hex };

      if ('token' in request) {
        // TokenTransferParams: estimate for ERC-20 transfer calldata
        const tokenRequest = request as TokenTransferParams;
        const transferData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [tokenRequest.to as `0x${string}`, tokenRequest.amount],
        });
        gasEstimateParams = {
          account: tokenRequest.from as `0x${string}`,
          to: tokenRequest.token.address as `0x${string}`,
          data: transferData,
        };
      } else {
        // TransferRequest: native transfer
        gasEstimateParams = {
          account: request.from as `0x${string}`,
          to: request.to as `0x${string}`,
          value: request.amount,
        };
      }

      const estimatedGas = await client.estimateGas(gasEstimateParams);
      const gasLimit = (estimatedGas * GAS_SAFETY_NUMERATOR) / GAS_SAFETY_DENOMINATOR;

      const maxFeePerGas = fees.maxFeePerGas!;
      const maxPriorityFeePerGas = fees.maxPriorityFeePerGas!;
      const fee = gasLimit * maxFeePerGas;

      return {
        fee,
        details: {
          gasLimit,
          maxFeePerGas,
          maxPriorityFeePerGas,
        },
      };
    } catch (error) {
      if (error instanceof ChainError || error instanceof WAIaaSError) throw error;
      throw this.mapError(error, 'Failed to estimate fee');
    }
  }

  // -- Token operations (2) --

  async buildTokenTransfer(request: TokenTransferParams): Promise<UnsignedTransaction> {
    const client = this.getClient();
    try {
      const fromAddr = request.from as `0x${string}`;
      const tokenAddr = request.token.address as `0x${string}`;
      const toAddr = request.to as `0x${string}`;

      // 1. Encode ERC-20 transfer(address,uint256) calldata
      const transferData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [toAddr, request.amount],
      });

      // 2. Get nonce
      const nonce = await client.getTransactionCount({ address: fromAddr });

      // 3. Get EIP-1559 fee data
      const fees = await client.estimateFeesPerGas();

      // 4. Estimate gas with 1.2x safety margin
      const estimatedGas = await client.estimateGas({
        account: fromAddr,
        to: tokenAddr, // tx target is the TOKEN CONTRACT, not the recipient
        data: transferData,
      });
      const gasLimit = (estimatedGas * GAS_SAFETY_NUMERATOR) / GAS_SAFETY_DENOMINATOR;

      const maxFeePerGas = fees.maxFeePerGas!;
      const maxPriorityFeePerGas = fees.maxPriorityFeePerGas!;
      const chainId = client.chain?.id ?? 1;

      // 5. Build EIP-1559 tx to token contract with transfer calldata, value=0
      const txRequest = {
        type: 'eip1559' as const,
        to: tokenAddr, // target is token contract
        value: 0n, // no ETH value for ERC-20 transfer
        nonce,
        gas: gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas,
        chainId,
        data: transferData,
      };

      // 6. Serialize
      const serializedHex = serializeTransaction(txRequest);
      const serializedBytes = hexToBytes(serializedHex);

      const estimatedFee = gasLimit * maxFeePerGas;

      return {
        chain: 'ethereum',
        serialized: serializedBytes,
        estimatedFee,
        expiresAt: undefined, // EVM uses nonce, no expiry
        metadata: {
          from: request.from,
          nonce,
          chainId,
          maxFeePerGas,
          maxPriorityFeePerGas,
          gasLimit,
          type: 'eip1559',
          tokenAddress: request.token.address,
          recipient: request.to,
          tokenAmount: request.amount,
        },
        nonce,
      };
    } catch (error) {
      if (error instanceof ChainError || error instanceof WAIaaSError) throw error;
      throw this.mapError(error, 'Failed to build token transfer');
    }
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    const client = this.getClient();
    try {
      const contractAddr = tokenAddress as `0x${string}`;

      // Use multicall to batch decimals, symbol, name in a single RPC
      const results = await client.multicall({
        contracts: [
          { address: contractAddr, abi: ERC20_ABI, functionName: 'decimals' },
          { address: contractAddr, abi: ERC20_ABI, functionName: 'symbol' },
          { address: contractAddr, abi: ERC20_ABI, functionName: 'name' },
        ],
      });

      // Extract results with defaults for failed calls
      const decimals = results[0].status === 'success' ? Number(results[0].result) : 18;
      const symbol = results[1].status === 'success' ? String(results[1].result) : '';
      const name = results[2].status === 'success' ? String(results[2].result) : '';

      return {
        address: tokenAddress,
        symbol,
        name,
        decimals,
      };
    } catch (error) {
      if (error instanceof ChainError || error instanceof WAIaaSError) throw error;
      throw this.mapError(error, 'Failed to get token info');
    }
  }

  // -- Contract operations (2) --

  async buildContractCall(request: ContractCallParams): Promise<UnsignedTransaction> {
    const client = this.getClient();
    try {
      const fromAddr = request.from as `0x${string}`;
      const toAddr = request.to as `0x${string}`;

      // Validate calldata: must be hex string with 0x prefix + at least 4-byte selector (8 hex chars)
      if (!request.calldata || !/^0x[0-9a-fA-F]{8,}$/.test(request.calldata)) {
        throw new ChainError('INVALID_INSTRUCTION', 'evm', {
          message: 'Invalid calldata: must be hex string with 0x prefix and at least 4-byte function selector',
        });
      }

      const calldata = request.calldata as `0x${string}`;

      // 1. Get nonce
      const nonce = await client.getTransactionCount({ address: fromAddr });

      // 2. Get EIP-1559 fee data
      const fees = await client.estimateFeesPerGas();

      // 3. Estimate gas with 1.2x safety margin
      const estimatedGas = await client.estimateGas({
        account: fromAddr,
        to: toAddr,
        data: calldata,
        value: request.value ?? 0n,
      });
      const gasLimit = (estimatedGas * GAS_SAFETY_NUMERATOR) / GAS_SAFETY_DENOMINATOR;

      const maxFeePerGas = fees.maxFeePerGas!;
      const maxPriorityFeePerGas = fees.maxPriorityFeePerGas!;
      const chainId = client.chain?.id ?? 1;

      // 4. Build EIP-1559 tx targeting the contract address with calldata
      const txRequest = {
        type: 'eip1559' as const,
        to: toAddr,
        value: request.value ?? 0n,
        nonce,
        gas: gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas,
        chainId,
        data: calldata,
      };

      // 5. Serialize
      const serializedHex = serializeTransaction(txRequest);
      const serializedBytes = hexToBytes(serializedHex);

      const estimatedFee = gasLimit * maxFeePerGas;

      // 6. Extract function selector (first 10 chars: 0x + 4-byte selector)
      const selector = calldata.slice(0, 10);

      return {
        chain: 'ethereum',
        serialized: serializedBytes,
        estimatedFee,
        expiresAt: undefined,
        metadata: {
          from: request.from,
          nonce,
          chainId,
          maxFeePerGas,
          maxPriorityFeePerGas,
          gasLimit,
          type: 'eip1559',
          selector,
          contractAddress: request.to,
          value: request.value ?? 0n,
        },
        nonce,
      };
    } catch (error) {
      if (error instanceof ChainError || error instanceof WAIaaSError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('insufficient funds')) {
        throw new ChainError('INSUFFICIENT_BALANCE', 'evm', {
          message: `Insufficient funds for contract call: ${msg}`,
          cause: error instanceof Error ? error : undefined,
        });
      }
      throw this.mapError(error, 'Failed to build contract call');
    }
  }

  async buildApprove(request: ApproveParams): Promise<UnsignedTransaction> {
    const client = this.getClient();
    try {
      const fromAddr = request.from as `0x${string}`;
      const tokenAddr = request.token.address as `0x${string}`;
      const spenderAddr = request.spender as `0x${string}`;

      // 1. Encode approve calldata
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spenderAddr, request.amount],
      });

      // 2. Get nonce
      const nonce = await client.getTransactionCount({ address: fromAddr });

      // 3. Get EIP-1559 fee data
      const fees = await client.estimateFeesPerGas();

      // 4. Estimate gas for approve call
      const estimatedGas = await client.estimateGas({
        account: fromAddr,
        to: tokenAddr,
        data: approveData,
      });
      const gasLimit = (estimatedGas * GAS_SAFETY_NUMERATOR) / GAS_SAFETY_DENOMINATOR;

      const maxFeePerGas = fees.maxFeePerGas!;
      const maxPriorityFeePerGas = fees.maxPriorityFeePerGas!;
      const chainId = client.chain?.id ?? 1;

      // 5. Build EIP-1559 tx to token contract with approve calldata, value=0
      const txRequest = {
        type: 'eip1559' as const,
        to: tokenAddr,
        value: 0n,
        nonce,
        gas: gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas,
        chainId,
        data: approveData,
      };

      // 6. Serialize
      const serializedHex = serializeTransaction(txRequest);
      const serializedBytes = hexToBytes(serializedHex);

      const estimatedFee = gasLimit * maxFeePerGas;

      return {
        chain: 'ethereum',
        serialized: serializedBytes,
        estimatedFee,
        expiresAt: undefined,
        metadata: {
          from: request.from,
          nonce,
          chainId,
          maxFeePerGas,
          maxPriorityFeePerGas,
          gasLimit,
          type: 'eip1559',
          tokenAddress: request.token.address,
          spender: request.spender,
          approveAmount: request.amount,
        },
        nonce,
      };
    } catch (error) {
      if (error instanceof ChainError || error instanceof WAIaaSError) throw error;
      throw this.mapError(error, 'Failed to build approve transaction');
    }
  }

  // -- Batch operations (1) --

  async buildBatch(_request: BatchParams): Promise<UnsignedTransaction> {
    throw new WAIaaSError('BATCH_NOT_SUPPORTED', {
      message: 'EVM does not support atomic batch transactions. Use Account Abstraction for batching.',
    });
  }

  // -- Utility operations (3) --

  async getTransactionFee(tx: UnsignedTransaction): Promise<bigint> {
    // Extract gasLimit and maxFeePerGas from metadata
    const metadata = tx.metadata;
    if (metadata.gasLimit != null && metadata.maxFeePerGas != null) {
      return BigInt(metadata.gasLimit as bigint) * BigInt(metadata.maxFeePerGas as bigint);
    }
    // Fallback to estimatedFee
    return tx.estimatedFee;
  }

  async getCurrentNonce(addr: string): Promise<number> {
    const client = this.getClient();
    try {
      const nonce = await client.getTransactionCount({
        address: addr as `0x${string}`,
      });
      return nonce;
    } catch (error) {
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Failed to get nonce: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  // -- Sign-only operations (2) -- v1.4.7

  async parseTransaction(rawTx: string): Promise<ParsedTransaction> {
    return parseEvmTransaction(rawTx);
  }

  async signExternalTransaction(rawTx: string, privateKey: Uint8Array): Promise<SignedTransaction> {
    try {
      // Convert private key bytes to hex
      const privateKeyHex = `0x${Buffer.from(privateKey).toString('hex')}` as Hex;

      // Create account from private key
      const account = privateKeyToAccount(privateKeyHex);

      // Parse the raw unsigned tx
      let parsed: ReturnType<typeof viemParseTransaction>;
      try {
        parsed = viemParseTransaction(rawTx as Hex);
      } catch {
        throw new ChainError('INVALID_RAW_TRANSACTION', 'evm', {
          message: 'Failed to parse unsigned transaction for signing',
        });
      }

      // Sign the transaction
      const signedHex = await account.signTransaction({
        ...parsed,
        type: parsed.type ?? 'eip1559',
      } as Parameters<typeof account.signTransaction>[0]);

      return { signedTransaction: signedHex };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      throw new ChainError('INVALID_RAW_TRANSACTION', 'evm', {
        message: `Failed to sign external transaction: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  // -- NFT operations (3) -- v31.0

  async buildNftTransferTx(request: NftTransferParams): Promise<UnsignedTransaction> {
    const client = this.getClient();
    try {
      const fromAddr = request.from as `0x${string}`;
      const toAddr = request.to as `0x${string}`;
      const contractAddr = request.token.address as `0x${string}`;

      let data: `0x${string}`;

      if (request.token.standard === 'ERC-721') {
        // safeTransferFrom(address from, address to, uint256 tokenId)
        data = encodeFunctionData({
          abi: ERC721_ABI,
          functionName: 'safeTransferFrom',
          args: [fromAddr, toAddr, BigInt(request.token.tokenId)],
        });
      } else if (request.token.standard === 'ERC-1155') {
        // safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)
        data = encodeFunctionData({
          abi: ERC1155_ABI,
          functionName: 'safeTransferFrom',
          args: [fromAddr, toAddr, BigInt(request.token.tokenId), request.amount, '0x'],
        });
      } else {
        throw new WAIaaSError('UNSUPPORTED_NFT_STANDARD', {
          message: `EVM adapter does not support NFT standard: ${request.token.standard}`,
        });
      }

      const nonce = await client.getTransactionCount({ address: fromAddr });
      const fees = await client.estimateFeesPerGas();
      const estimatedGas = await client.estimateGas({
        account: fromAddr,
        to: contractAddr,
        data,
      });
      const gasLimit = (estimatedGas * GAS_SAFETY_NUMERATOR) / GAS_SAFETY_DENOMINATOR;
      const maxFeePerGas = fees.maxFeePerGas!;
      const maxPriorityFeePerGas = fees.maxPriorityFeePerGas!;
      const chainId = client.chain?.id ?? 1;

      const txRequest = {
        type: 'eip1559' as const,
        to: contractAddr,
        value: 0n,
        nonce,
        gas: gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas,
        chainId,
        data,
      };

      const serializedHex = serializeTransaction(txRequest);
      const serializedBytes = hexToBytes(serializedHex);
      const estimatedFee = gasLimit * maxFeePerGas;

      return {
        chain: 'ethereum',
        serialized: serializedBytes,
        estimatedFee,
        expiresAt: undefined,
        metadata: {
          from: request.from,
          nonce,
          chainId,
          maxFeePerGas,
          maxPriorityFeePerGas,
          gasLimit,
          type: 'eip1559',
          nftStandard: request.token.standard,
          tokenId: request.token.tokenId,
          contractAddress: request.token.address,
        },
        nonce,
      };
    } catch (error) {
      if (error instanceof ChainError || error instanceof WAIaaSError) throw error;
      throw this.mapError(error, 'Failed to build NFT transfer transaction');
    }
  }

  async transferNft(request: NftTransferParams, privateKey: Uint8Array): Promise<SubmitResult> {
    const unsignedTx = await this.buildNftTransferTx(request);
    const signedTx = await this.signTransaction(unsignedTx, privateKey);
    return this.submitTransaction(signedTx);
  }

  async approveNft(request: NftApproveParams): Promise<UnsignedTransaction> {
    const client = this.getClient();
    try {
      const fromAddr = request.from as `0x${string}`;
      const contractAddr = request.token.address as `0x${string}`;
      const spenderAddr = request.spender as `0x${string}`;

      let data: `0x${string}`;

      if (request.token.standard === 'ERC-721') {
        if (request.approvalType === 'single') {
          // approve(address to, uint256 tokenId)
          data = encodeFunctionData({
            abi: ERC721_ABI,
            functionName: 'approve',
            args: [spenderAddr, BigInt(request.token.tokenId)],
          });
        } else {
          // setApprovalForAll(address operator, bool approved)
          data = encodeFunctionData({
            abi: ERC721_ABI,
            functionName: 'setApprovalForAll',
            args: [spenderAddr, true],
          });
        }
      } else if (request.token.standard === 'ERC-1155') {
        if (request.approvalType === 'single') {
          // ERC-1155 does not support single token approval
          throw new WAIaaSError('UNSUPPORTED_NFT_STANDARD', {
            message: 'ERC-1155 does not support single token approval. Use approvalType "all" for setApprovalForAll.',
          });
        }
        // setApprovalForAll(address operator, bool approved)
        data = encodeFunctionData({
          abi: ERC1155_ABI,
          functionName: 'setApprovalForAll',
          args: [spenderAddr, true],
        });
      } else {
        throw new WAIaaSError('UNSUPPORTED_NFT_STANDARD', {
          message: `EVM adapter does not support NFT standard: ${request.token.standard}`,
        });
      }

      const nonce = await client.getTransactionCount({ address: fromAddr });
      const fees = await client.estimateFeesPerGas();
      const estimatedGas = await client.estimateGas({
        account: fromAddr,
        to: contractAddr,
        data,
      });
      const gasLimit = (estimatedGas * GAS_SAFETY_NUMERATOR) / GAS_SAFETY_DENOMINATOR;
      const maxFeePerGas = fees.maxFeePerGas!;
      const maxPriorityFeePerGas = fees.maxPriorityFeePerGas!;
      const chainId = client.chain?.id ?? 1;

      const txRequest = {
        type: 'eip1559' as const,
        to: contractAddr,
        value: 0n,
        nonce,
        gas: gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas,
        chainId,
        data,
      };

      const serializedHex = serializeTransaction(txRequest);
      const serializedBytes = hexToBytes(serializedHex);
      const estimatedFee = gasLimit * maxFeePerGas;

      return {
        chain: 'ethereum',
        serialized: serializedBytes,
        estimatedFee,
        expiresAt: undefined,
        metadata: {
          from: request.from,
          nonce,
          chainId,
          maxFeePerGas,
          maxPriorityFeePerGas,
          gasLimit,
          type: 'eip1559',
          nftStandard: request.token.standard,
          tokenId: request.token.tokenId,
          contractAddress: request.token.address,
          spender: request.spender,
          approvalType: request.approvalType,
        },
        nonce,
      };
    } catch (error) {
      if (error instanceof ChainError || error instanceof WAIaaSError) throw error;
      throw this.mapError(error, 'Failed to build NFT approval transaction');
    }
  }

  /**
   * Detect NFT standard via ERC-165 supportsInterface.
   * Returns 'ERC-721' or 'ERC-1155', throws UNSUPPORTED_NFT_STANDARD if neither.
   */
  async detectNftStandard(contractAddress: string): Promise<'ERC-721' | 'ERC-1155'> {
    const client = this.getClient();
    const addr = contractAddress as `0x${string}`;

    try {
      // Check ERC-721 (0x80ac58cd)
      const isErc721 = await client.readContract({
        address: addr,
        abi: ERC165_ABI,
        functionName: 'supportsInterface',
        args: [ERC_INTERFACE_IDS.ERC721],
      });
      if (isErc721) return 'ERC-721';

      // Check ERC-1155 (0xd9b67a26)
      const isErc1155 = await client.readContract({
        address: addr,
        abi: ERC165_ABI,
        functionName: 'supportsInterface',
        args: [ERC_INTERFACE_IDS.ERC1155],
      });
      if (isErc1155) return 'ERC-1155';

      throw new WAIaaSError('UNSUPPORTED_NFT_STANDARD', {
        message: `Contract ${contractAddress} does not support ERC-721 or ERC-1155`,
      });
    } catch (error) {
      if (error instanceof WAIaaSError) throw error;
      throw new WAIaaSError('UNSUPPORTED_NFT_STANDARD', {
        message: `Failed to detect NFT standard for ${contractAddress}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // -- Private helpers --

  private ensureConnected(): void {
    if (!this._connected || !this._client) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'EvmAdapter is not connected. Call connect() first.',
      });
    }
  }

  private getClient(): PublicClient {
    this.ensureConnected();
    return this._client!;
  }

  /**
   * Map unknown errors to appropriate ChainError or WAIaaSError.
   * Inspects error message for known patterns.
   */
  private mapError(error: unknown, context: string): ChainError | WAIaaSError {
    const msg = error instanceof Error ? error.message : String(error);
    const lowerMsg = msg.toLowerCase();

    if (lowerMsg.includes('insufficient funds') || lowerMsg.includes('insufficient balance')) {
      return new ChainError('INSUFFICIENT_BALANCE', 'evm', {
        message: `${context}: ${msg}`,
        cause: error instanceof Error ? error : undefined,
      });
    }
    if (lowerMsg.includes('nonce too low')) {
      return new ChainError('NONCE_TOO_LOW', 'evm', {
        message: `${context}: ${msg}`,
        cause: error instanceof Error ? error : undefined,
      });
    }
    if (lowerMsg.includes('connection') || lowerMsg.includes('econnrefused') || lowerMsg.includes('fetch failed')) {
      return new ChainError('RPC_CONNECTION_ERROR', 'evm', {
        message: `${context}: ${msg}`,
        cause: error instanceof Error ? error : undefined,
      });
    }
    if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out')) {
      return new ChainError('RPC_TIMEOUT', 'evm', {
        message: `${context}: ${msg}`,
        cause: error instanceof Error ? error : undefined,
      });
    }

    return new WAIaaSError('CHAIN_ERROR', {
      message: `${context}: ${msg}`,
      cause: error instanceof Error ? error : undefined,
    });
  }
}
