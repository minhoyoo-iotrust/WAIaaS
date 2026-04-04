/**
 * RippleAdapter -- IChainAdapter implementation for XRP Ledger.
 *
 * Uses xrpl.js v4.x Client for WebSocket RPC communication.
 * Supports native XRP transfers, balance queries, fee estimation, and nonce retrieval.
 * Trust Line tokens (Phase 472), NFTs (Phase 473) will extend this adapter.
 *
 * @see Phase 471-01 (scaffold + connection + balance + fee + nonce)
 * @see Phase 471-02 (transaction pipeline + AdapterPool wiring)
 */

import { Client, Wallet, ECDSA } from 'xrpl';
import type { Payment, TrustSet, Transaction, NFTokenCreateOffer, OfferCreate, OfferCancel } from 'xrpl';
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
import { ChainError } from '@waiaas/core';

import { isXAddress, decodeXAddress, XRP_DECIMALS, DROPS_PER_XRP } from './address-utils.js';
import { parseTrustLineToken, smallestUnitToIou, iouToSmallestUnit, IOU_DECIMALS } from './currency-utils.js';
import { parseRippleTransaction } from './tx-parser.js';

/** Average ledger close time in milliseconds (~3.5-4s). */
const LEDGER_CLOSE_MS = 4000;

/** Fee safety margin: 120% of base fee per project convention. */
const FEE_SAFETY_NUMERATOR = 120n;
const FEE_SAFETY_DENOMINATOR = 100n;

export class RippleAdapter implements IChainAdapter {
  readonly chain: ChainType = 'ripple';
  readonly network: NetworkType;
  private client: Client | null = null;
  private _connected = false;
  private serverInfo: {
    baseReserve: bigint; // in drops
    ownerReserve: bigint; // in drops
    baseFee: bigint; // in drops
    ledgerIndex: number;
  } | null = null;

  constructor(network: NetworkType) {
    this.network = network;
  }

  // -- Connection management (4) --

  async connect(rpcUrl: string): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {
        // ignore
      }
    }
    this.client = new Client(rpcUrl, { connectionTimeout: 10000 });
    await this.client.connect();
    this._connected = true;
    // Fetch initial server info for reserve values
    await this.refreshServerInfo();
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {
        // ignore
      }
      this.client = null;
    }
    this._connected = false;
    this.serverInfo = null;
  }

  isConnected(): boolean {
    return this._connected && this.client?.isConnected() === true;
  }

  async getHealth(): Promise<HealthInfo> {
    const start = Date.now();
    try {
      const client = this.getClient();
      const response = await client.request({ command: 'server_info' });
      const latencyMs = Date.now() - start;
      const info = response.result.info;
      const ledgerIndex = info.validated_ledger?.seq ?? 0;
      return {
        healthy: true,
        latencyMs,
        blockHeight: BigInt(ledgerIndex),
      };
    } catch (err) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
      };
    }
  }

  // -- Balance query (1) --

  async getBalance(address: string): Promise<BalanceInfo> {
    const client = this.getClient();

    // Decode X-address if needed
    let classicAddress = address;
    if (isXAddress(address)) {
      const decoded = decodeXAddress(address);
      classicAddress = decoded.classicAddress;
    }

    try {
      const response = await client.request({
        command: 'account_info',
        account: classicAddress,
        ledger_index: 'validated',
      });
      const balance = BigInt(response.result.account_data.Balance);
      return {
        address: classicAddress,
        balance,
        decimals: XRP_DECIMALS,
        symbol: 'XRP',
      };
    } catch (err) {
      // Handle "Account not found" (actNotFound)
      if (this.isActNotFound(err)) {
        return {
          address: classicAddress,
          balance: 0n,
          decimals: XRP_DECIMALS,
          symbol: 'XRP',
        };
      }
      throw this.mapError(err);
    }
  }

  // -- Transaction 4-stage pipeline (4) --

  async buildTransaction(request: TransferRequest): Promise<UnsignedTransaction> {
    const client = this.getClient();

    // Decode destination address
    let destinationAddress = request.to;
    let destinationTag: number | undefined;

    if (isXAddress(request.to)) {
      const decoded = decodeXAddress(request.to);
      destinationAddress = decoded.classicAddress;
      if (decoded.tag !== false) {
        destinationTag = decoded.tag;
      }
    }

    // Parse Destination Tag from memo
    if (request.memo) {
      const memoTag = this.parseDestinationTag(request.memo);
      if (memoTag !== undefined) {
        // Explicit memo tag takes priority over X-address tag
        destinationTag = memoTag;
      }
    }

    // Build XRPL Payment transaction
    const payment: Payment = {
      TransactionType: 'Payment',
      Account: request.from,
      Destination: destinationAddress,
      Amount: request.amount.toString(), // drops as string
      ...(destinationTag !== undefined && { DestinationTag: destinationTag }),
    };

    // autofill populates Sequence, Fee, LastLedgerSequence
    const autofilled = await client.autofill(payment);

    // Apply fee safety margin: (Fee * 120) / 100
    const baseFee = BigInt(autofilled.Fee ?? '12');
    const safeFee = (baseFee * FEE_SAFETY_NUMERATOR) / FEE_SAFETY_DENOMINATOR;
    autofilled.Fee = safeFee.toString();

    // Serialize to JSON bytes
    const txJson = JSON.stringify(autofilled);
    const serialized = new TextEncoder().encode(txJson);

    // Calculate approximate expiry from LastLedgerSequence
    const lastLedgerSeq = autofilled.LastLedgerSequence ?? 0;
    const currentLedger = this.serverInfo?.ledgerIndex ?? 0;
    const ledgersRemaining = lastLedgerSeq - currentLedger;
    const expiresAt = new Date(Date.now() + ledgersRemaining * LEDGER_CLOSE_MS);

    return {
      chain: 'ripple',
      serialized,
      estimatedFee: safeFee,
      expiresAt,
      metadata: {
        Sequence: autofilled.Sequence,
        LastLedgerSequence: autofilled.LastLedgerSequence,
        Fee: autofilled.Fee,
        DestinationTag: destinationTag,
        originalTx: autofilled,
      },
      nonce: autofilled.Sequence,
    };
  }

  async simulateTransaction(tx: UnsignedTransaction): Promise<SimulationResult> {
    const client = this.getClient();
    try {
      // Deserialize transaction JSON
      const txJson = new TextDecoder().decode(tx.serialized);
      const txObj = JSON.parse(txJson) as Payment;

      // Use autofill as dry-run validation
      await client.autofill(txObj);

      return {
        success: true,
        logs: ['autofill validation passed'],
      };
    } catch (err) {
      return {
        success: false,
        logs: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async signTransaction(tx: UnsignedTransaction, privateKey: Uint8Array): Promise<Uint8Array> {
    // Deserialize transaction JSON
    const txJson = new TextDecoder().decode(tx.serialized);
    const txObj = JSON.parse(txJson) as Transaction;

    // The privateKey from KeyStore is the 32-byte Ed25519 seed
    // Create Wallet from entropy (seed)
    const wallet = Wallet.fromEntropy(privateKey, { algorithm: ECDSA.ed25519 });

    // Verify wallet address matches transaction Account
    const txAccount = (txObj as unknown as Record<string, unknown>)['Account'] as string;
    if (wallet.address !== txAccount) {
      throw new ChainError('WALLET_NOT_SIGNER', 'ripple', {
        message: `Wallet address ${wallet.address} does not match transaction Account ${txAccount}`,
      });
    }

    // Sign the transaction
    const { tx_blob } = wallet.sign(txObj);

    // Encode tx_blob hex to Uint8Array
    return new Uint8Array(Buffer.from(tx_blob, 'hex'));
  }

  async submitTransaction(signedTx: Uint8Array): Promise<SubmitResult> {
    const client = this.getClient();

    // Convert signedTx bytes back to hex string
    const txBlob = Buffer.from(signedTx).toString('hex').toUpperCase();

    const response = await client.request({
      command: 'submit',
      tx_blob: txBlob,
    });

    const result = response.result as unknown as Record<string, unknown>;
    const engineResult = result['engine_result'] as string;
    const txJson = result['tx_json'] as Record<string, unknown> | undefined;
    const txHash = txJson?.['hash'] as string ?? '';

    // Check result
    if (engineResult === 'tesSUCCESS' || engineResult.startsWith('tec')) {
      return {
        txHash,
        status: 'submitted',
      };
    }

    // Rejected transactions
    throw new ChainError('CONTRACT_EXECUTION_FAILED', 'ripple', {
      message: `Transaction rejected: ${engineResult} - ${result['engine_result_message'] ?? ''}`,
    });
  }

  async waitForConfirmation(txHash: string, timeoutMs: number = 30000): Promise<SubmitResult> {
    const client = this.getClient();
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const response = await client.request({
          command: 'tx',
          transaction: txHash,
        });

        const result = response.result as unknown as Record<string, unknown>;
        const validated = result['validated'] as boolean;

        if (validated) {
          const meta = result['meta'] as Record<string, unknown> | undefined;
          const txResult = (meta?.['TransactionResult'] ?? 'tesSUCCESS') as string;
          const ledgerIndex = result['ledger_index'] as number | undefined;
          const fee = result['Fee'] as string | undefined;

          return {
            txHash,
            status: txResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
            blockNumber: ledgerIndex !== undefined ? BigInt(ledgerIndex) : undefined,
            fee: fee !== undefined ? BigInt(fee) : undefined,
          };
        }
      } catch (err) {
        // Transaction not found yet, continue polling
        if (!this.isActNotFound(err) && !this.isTxNotFound(err)) {
          throw this.mapError(err);
        }
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Timeout -- still pending
    return {
      txHash,
      status: 'submitted',
    };
  }

  // -- Asset query (1) --

  async getAssets(address: string): Promise<AssetInfo[]> {
    const client = this.getClient();

    // Decode X-address if needed
    let classicAddress = address;
    if (isXAddress(address)) {
      const decoded = decodeXAddress(address);
      classicAddress = decoded.classicAddress;
    }

    const assets: AssetInfo[] = [];

    // 1. Native XRP balance
    const balanceInfo = await this.getBalance(classicAddress);
    assets.push({
      mint: 'native',
      symbol: 'XRP',
      name: 'XRP',
      balance: balanceInfo.balance,
      decimals: XRP_DECIMALS,
      isNative: true,
    });

    // 2. Trust Line tokens via account_lines
    try {
      const response = await client.request({
        command: 'account_lines',
        account: classicAddress,
        ledger_index: 'validated',
      });

      const lines = (response.result as unknown as { lines: Array<{ account: string; balance: string; currency: string; limit: string }> }).lines;

      for (const line of lines) {
        assets.push({
          mint: `${line.currency}.${line.account}`,
          symbol: line.currency,
          name: `Trust Line: ${line.currency}`,
          balance: iouToSmallestUnit(line.balance, IOU_DECIMALS),
          decimals: IOU_DECIMALS,
          isNative: false,
        });
      }
    } catch (err) {
      // actNotFound means no account -- return only XRP with 0 balance
      if (!this.isActNotFound(err)) {
        throw this.mapError(err);
      }
    }

    return assets;
  }

  // -- Fee estimation (1) --

  async estimateFee(_request: TransferRequest | TokenTransferParams): Promise<FeeEstimate> {
    await this.refreshServerInfo();
    const baseFee = this.serverInfo?.baseFee ?? 10n;
    const safeFee = (baseFee * FEE_SAFETY_NUMERATOR) / FEE_SAFETY_DENOMINATOR;
    return {
      fee: safeFee,
      details: {
        baseFee: baseFee.toString(),
        safetyMargin: '120%',
      },
    };
  }

  // -- Token operations (2) -- Phase 472 stubs

  async buildTokenTransfer(request: TokenTransferParams): Promise<UnsignedTransaction> {
    const client = this.getClient();

    // Parse "{currency}.{issuer}" from token address
    const { currency, issuer } = parseTrustLineToken(request.token.address);

    // Decode destination address
    let destinationAddress = request.to;
    let destinationTag: number | undefined;

    if (isXAddress(request.to)) {
      const decoded = decodeXAddress(request.to);
      destinationAddress = decoded.classicAddress;
      if (decoded.tag !== false) {
        destinationTag = decoded.tag;
      }
    }

    // Parse Destination Tag from memo
    if (request.memo) {
      const memoTag = this.parseDestinationTag(request.memo);
      if (memoTag !== undefined) {
        destinationTag = memoTag;
      }
    }

    // Build IOU Payment transaction with Amount object
    const payment: Payment = {
      TransactionType: 'Payment',
      Account: request.from,
      Destination: destinationAddress,
      Amount: {
        currency,
        issuer,
        value: smallestUnitToIou(request.amount, request.token.decimals),
      },
      ...(destinationTag !== undefined && { DestinationTag: destinationTag }),
    };

    // autofill populates Sequence, Fee, LastLedgerSequence
    const autofilled = await client.autofill(payment);

    // Apply fee safety margin: (Fee * 120) / 100
    const baseFee = BigInt(autofilled.Fee ?? '12');
    const safeFee = (baseFee * FEE_SAFETY_NUMERATOR) / FEE_SAFETY_DENOMINATOR;
    autofilled.Fee = safeFee.toString();

    // Serialize to JSON bytes
    const txJson = JSON.stringify(autofilled);
    const serialized = new TextEncoder().encode(txJson);

    // Calculate approximate expiry
    const lastLedgerSeq = autofilled.LastLedgerSequence ?? 0;
    const currentLedger = this.serverInfo?.ledgerIndex ?? 0;
    const ledgersRemaining = lastLedgerSeq - currentLedger;
    const expiresAt = new Date(Date.now() + ledgersRemaining * LEDGER_CLOSE_MS);

    return {
      chain: 'ripple',
      serialized,
      estimatedFee: safeFee,
      expiresAt,
      metadata: {
        Sequence: autofilled.Sequence,
        LastLedgerSequence: autofilled.LastLedgerSequence,
        Fee: autofilled.Fee,
        DestinationTag: destinationTag,
        originalTx: autofilled,
      },
      nonce: autofilled.Sequence,
    };
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    // Parse "{currency}.{issuer}" -- no RPC call needed for XRPL Trust Lines
    const { currency } = parseTrustLineToken(tokenAddress);

    return {
      address: tokenAddress,
      symbol: currency,
      name: `Trust Line: ${currency}`,
      decimals: IOU_DECIMALS,
    };
  }

  // -- Contract operations (2) -- XRPL native tx via calldata JSON

  async buildContractCall(request: ContractCallParams): Promise<UnsignedTransaction> {
    if (request.calldata) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(request.calldata) as Record<string, unknown>;
      } catch {
        throw new ChainError('INVALID_INSTRUCTION', 'ripple', {
          message: 'XRPL does not support smart contracts. Invalid calldata JSON.',
        });
      }

      const xrplTxType = parsed['xrplTxType'] as string | undefined;
      switch (xrplTxType) {
        case 'OfferCreate': {
          const offer: OfferCreate = {
            TransactionType: 'OfferCreate',
            Account: request.from,
            TakerPays: parsed['TakerPays'] as OfferCreate['TakerPays'],
            TakerGets: parsed['TakerGets'] as OfferCreate['TakerGets'],
            ...(parsed['Flags'] !== undefined && { Flags: parsed['Flags'] as number }),
            ...(parsed['Expiration'] !== undefined && { Expiration: parsed['Expiration'] as number }),
            ...(parsed['OfferSequence'] !== undefined && { OfferSequence: parsed['OfferSequence'] as number }),
          };
          return this.buildXrplNativeTx(offer);
        }
        case 'OfferCancel': {
          const cancel: OfferCancel = {
            TransactionType: 'OfferCancel',
            Account: request.from,
            OfferSequence: parsed['OfferSequence'] as number,
          };
          return this.buildXrplNativeTx(cancel);
        }
        default:
          throw new ChainError('INVALID_INSTRUCTION', 'ripple', {
            message: `Unsupported XRPL transaction type: ${xrplTxType ?? 'none'}. Use calldata with xrplTxType: OfferCreate | OfferCancel.`,
          });
      }
    }

    throw new ChainError('INVALID_INSTRUCTION', 'ripple', {
      message: 'XRPL does not support smart contracts. Use calldata with xrplTxType for native DEX operations.',
    });
  }

  async buildApprove(request: ApproveParams): Promise<UnsignedTransaction> {
    const client = this.getClient();

    // Parse "{currency}.{issuer}" from token address
    const { currency, issuer } = parseTrustLineToken(request.token.address);

    // Build TrustSet transaction with tfSetNoRipple flag
    const trustSet: TrustSet = {
      TransactionType: 'TrustSet',
      Account: request.from,
      LimitAmount: {
        currency,
        issuer,
        value: smallestUnitToIou(request.amount, request.token.decimals),
      },
      Flags: 131072, // tfSetNoRipple (0x00020000)
    };

    // autofill populates Sequence, Fee, LastLedgerSequence
    const autofilled = await client.autofill(trustSet);

    // Apply fee safety margin: (Fee * 120) / 100
    const baseFee = BigInt(autofilled.Fee ?? '12');
    const safeFee = (baseFee * FEE_SAFETY_NUMERATOR) / FEE_SAFETY_DENOMINATOR;
    autofilled.Fee = safeFee.toString();

    // Serialize to JSON bytes
    const txJson = JSON.stringify(autofilled);
    const serialized = new TextEncoder().encode(txJson);

    // Calculate approximate expiry
    const lastLedgerSeq = autofilled.LastLedgerSequence ?? 0;
    const currentLedger = this.serverInfo?.ledgerIndex ?? 0;
    const ledgersRemaining = lastLedgerSeq - currentLedger;
    const expiresAt = new Date(Date.now() + ledgersRemaining * LEDGER_CLOSE_MS);

    return {
      chain: 'ripple',
      serialized,
      estimatedFee: safeFee,
      expiresAt,
      metadata: {
        Sequence: autofilled.Sequence,
        LastLedgerSequence: autofilled.LastLedgerSequence,
        Fee: autofilled.Fee,
        originalTx: autofilled,
      },
      nonce: autofilled.Sequence,
    };
  }

  // -- Batch operations (1) -- Unsupported

  async buildBatch(_request: BatchParams): Promise<UnsignedTransaction> {
    throw new ChainError('BATCH_NOT_SUPPORTED', 'ripple', {
      message: 'XRPL does not support batch transactions',
    });
  }

  // -- Utility operations (3) --

  async getTransactionFee(tx: UnsignedTransaction): Promise<bigint> {
    const fee = tx.metadata?.Fee;
    if (typeof fee === 'string') {
      return BigInt(fee);
    }
    return tx.estimatedFee;
  }

  async getCurrentNonce(address: string): Promise<number> {
    const client = this.getClient();

    // Decode X-address if needed
    let classicAddress = address;
    if (isXAddress(address)) {
      const decoded = decodeXAddress(address);
      classicAddress = decoded.classicAddress;
    }

    try {
      const response = await client.request({
        command: 'account_info',
        account: classicAddress,
        ledger_index: 'validated',
      });
      return response.result.account_data.Sequence;
    } catch (err) {
      if (this.isActNotFound(err)) {
        return 0;
      }
      throw this.mapError(err);
    }
  }

  // sweepAll is optional, not implemented for Ripple (reserve makes full sweep complex)

  // -- Sign-only operations (2) --

  async parseTransaction(rawTx: string): Promise<ParsedTransaction> {
    return parseRippleTransaction(rawTx);
  }

  async signExternalTransaction(rawTx: string, privateKey: Uint8Array): Promise<SignedTransaction> {
    const txObj = JSON.parse(rawTx) as Transaction;
    const wallet = Wallet.fromEntropy(privateKey, { algorithm: ECDSA.ed25519 });
    const { tx_blob, hash } = wallet.sign(txObj);

    return {
      signedTransaction: tx_blob,
      txHash: hash,
    };
  }

  // -- NFT operations (3) -- XLS-20

  async buildNftTransferTx(request: NftTransferParams): Promise<UnsignedTransaction> {
    const client = this.getClient();

    // XLS-20 NFT transfer uses NFTokenCreateOffer (sell offer with Amount=0)
    // The recipient must accept the offer to complete the transfer.
    const offerTx: NFTokenCreateOffer = {
      TransactionType: 'NFTokenCreateOffer',
      Account: request.from,
      NFTokenID: request.token.tokenId,
      Destination: request.to,
      Amount: '0', // Free transfer (not a sale)
      Flags: 1, // tfSellNFToken
    };

    // autofill populates Sequence, Fee, LastLedgerSequence
    const autofilled = await client.autofill(offerTx);

    // Apply fee safety margin: (Fee * 120) / 100
    const baseFee = BigInt(autofilled.Fee ?? '12');
    const safeFee = (baseFee * FEE_SAFETY_NUMERATOR) / FEE_SAFETY_DENOMINATOR;
    autofilled.Fee = safeFee.toString();

    // Serialize to JSON bytes
    const txJson = JSON.stringify(autofilled);
    const serialized = new TextEncoder().encode(txJson);

    // Calculate approximate expiry
    const lastLedgerSeq = autofilled.LastLedgerSequence ?? 0;
    const currentLedger = this.serverInfo?.ledgerIndex ?? 0;
    const ledgersRemaining = lastLedgerSeq - currentLedger;
    const expiresAt = new Date(Date.now() + ledgersRemaining * LEDGER_CLOSE_MS);

    return {
      chain: 'ripple',
      serialized,
      estimatedFee: safeFee,
      expiresAt,
      metadata: {
        Sequence: autofilled.Sequence,
        LastLedgerSequence: autofilled.LastLedgerSequence,
        Fee: autofilled.Fee,
        originalTx: autofilled,
        pendingAccept: true,
        nftTokenId: request.token.tokenId,
      },
      nonce: autofilled.Sequence,
    };
  }

  async transferNft(request: NftTransferParams, privateKey: Uint8Array): Promise<SubmitResult> {
    // Build the NFTokenCreateOffer transaction
    const unsignedTx = await this.buildNftTransferTx(request);

    // Sign the transaction
    const signedTx = await this.signTransaction(unsignedTx, privateKey);

    // Submit the signed transaction
    const result = await this.submitTransaction(signedTx);

    return {
      ...result,
      status: 'submitted',
    };
  }

  async approveNft(_request: NftApproveParams): Promise<UnsignedTransaction> {
    throw new ChainError('INVALID_INSTRUCTION', 'ripple', {
      message: 'XRPL NFTs use offer-based transfers, not approvals',
    });
  }

  // -- Private helpers --

  /**
   * Build an XRPL native transaction from a Transaction object.
   * Shared autofill/fee-margin/serialize pattern used by buildContractCall.
   */
  private async buildXrplNativeTx(tx: OfferCreate | OfferCancel): Promise<UnsignedTransaction> {
    const client = this.getClient();
    const autofilled = await client.autofill(tx);

    // Apply fee safety margin: (Fee * 120) / 100
    const baseFee = BigInt(autofilled.Fee ?? '12');
    const safeFee = (baseFee * FEE_SAFETY_NUMERATOR) / FEE_SAFETY_DENOMINATOR;
    autofilled.Fee = safeFee.toString();

    // Serialize to JSON bytes
    const txJson = JSON.stringify(autofilled);
    const serialized = new TextEncoder().encode(txJson);

    // Calculate approximate expiry from LastLedgerSequence
    const lastLedgerSeq = autofilled.LastLedgerSequence ?? 0;
    const currentLedger = this.serverInfo?.ledgerIndex ?? 0;
    const ledgersRemaining = lastLedgerSeq - currentLedger;
    const expiresAt = new Date(Date.now() + ledgersRemaining * LEDGER_CLOSE_MS);

    return {
      chain: 'ripple',
      serialized,
      estimatedFee: safeFee,
      expiresAt,
      metadata: {
        Sequence: autofilled.Sequence,
        LastLedgerSequence: autofilled.LastLedgerSequence,
        Fee: autofilled.Fee,
        originalTx: autofilled,
      },
      nonce: autofilled.Sequence,
    };
  }

  private getClient(): Client {
    if (!this.client || !this._connected) {
      throw new ChainError('RPC_CONNECTION_ERROR', 'ripple', {
        message: 'Not connected to XRPL. Call connect() first.',
      });
    }
    return this.client;
  }

  private async refreshServerInfo(): Promise<void> {
    const client = this.getClient();
    try {
      const response = await client.request({ command: 'server_info' });
      const info = response.result.info;
      const validatedLedger = info.validated_ledger;

      if (validatedLedger) {
        // base_reserve_xrp and reserve_inc_xrp are in XRP, convert to drops
        this.serverInfo = {
          baseReserve: BigInt(Math.round((validatedLedger.reserve_base_xrp ?? 10) * 1e6)),
          ownerReserve: BigInt(Math.round((validatedLedger.reserve_inc_xrp ?? 2) * 1e6)),
          baseFee: BigInt(Math.round((validatedLedger.base_fee_xrp ?? 0.00001) * 1e6)),
          ledgerIndex: validatedLedger.seq ?? 0,
        };
      }
    } catch (err) {
      // If we can't refresh, keep the old info or use defaults
      if (!this.serverInfo) {
        this.serverInfo = {
          baseReserve: 10n * DROPS_PER_XRP, // 10 XRP default
          ownerReserve: 2n * DROPS_PER_XRP, // 2 XRP default
          baseFee: 10n, // 10 drops default
          ledgerIndex: 0,
        };
      }
    }
  }

  /**
   * Parse Destination Tag from memo field.
   * Supports numeric string ("12345") or JSON with destinationTag field.
   */
  private parseDestinationTag(memo: string): number | undefined {
    // Try as numeric string
    const num = Number(memo);
    if (Number.isInteger(num) && num >= 0 && num <= 4294967295) {
      return num;
    }

    // Try as JSON
    try {
      const parsed = JSON.parse(memo) as Record<string, unknown>;
      const tag = parsed['destinationTag'] ?? parsed['DestinationTag'] ?? parsed['destination_tag'];
      if (typeof tag === 'number' && Number.isInteger(tag) && tag >= 0) {
        return tag;
      }
    } catch {
      // Not JSON, ignore
    }

    return undefined;
  }

  /**
   * Check if error is "Account not found" (actNotFound).
   */
  private isActNotFound(err: unknown): boolean {
    if (err instanceof Error) {
      return err.message.includes('actNotFound') || err.message.includes('Account not found');
    }
    return false;
  }

  /**
   * Check if error is "Transaction not found" (txnNotFound).
   */
  private isTxNotFound(err: unknown): boolean {
    if (err instanceof Error) {
      return err.message.includes('txnNotFound') || err.message.includes('Transaction not found');
    }
    return false;
  }

  /**
   * Map xrpl.js errors to ChainError.
   */
  private mapError(err: unknown): ChainError {
    if (err instanceof ChainError) return err;

    const message = err instanceof Error ? err.message : String(err);

    // Connection errors
    if (message.includes('NotConnectedError') || message.includes('not connected') || message.includes('WebSocket')) {
      return new ChainError('RPC_CONNECTION_ERROR', 'ripple', { message, cause: err instanceof Error ? err : undefined });
    }

    // Account not found
    if (message.includes('actNotFound') || message.includes('Account not found')) {
      return new ChainError('ACCOUNT_NOT_FOUND', 'ripple', { message, cause: err instanceof Error ? err : undefined });
    }

    // Rate limiting
    if (message.includes('rate') || message.includes('slowDown')) {
      return new ChainError('RATE_LIMITED', 'ripple', { message, cause: err instanceof Error ? err : undefined });
    }

    // Timeout
    if (message.includes('timeout') || message.includes('Timeout')) {
      return new ChainError('RPC_TIMEOUT', 'ripple', { message, cause: err instanceof Error ? err : undefined });
    }

    // Insufficient balance
    if (message.includes('tecUNFUNDED') || message.includes('insufficient')) {
      return new ChainError('INSUFFICIENT_BALANCE', 'ripple', { message, cause: err instanceof Error ? err : undefined });
    }

    // Default to RPC connection error for unknown errors
    return new ChainError('RPC_CONNECTION_ERROR', 'ripple', { message, cause: err instanceof Error ? err : undefined });
  }
}
