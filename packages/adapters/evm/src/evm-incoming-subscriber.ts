/**
 * EvmIncomingSubscriber -- IChainSubscriber implementation for EVM chains.
 *
 * Detection strategy: polling-first (design decision D-06).
 * - ERC-20 transfers: getLogs with parseAbiItem Transfer event filter
 * - Native ETH transfers: getBlock(includeTransactions:true) scanning tx.to
 * - 10-block cap per poll cycle to stay within RPC provider limits (pitfall 4)
 *
 * Lifecycle:
 * - connect() is no-op (no WebSocket needed)
 * - waitForDisconnect() returns a never-resolving Promise (EVM stays in WS_ACTIVE permanently)
 * - pollAll() is called externally by BackgroundWorkers in Phase 226
 *
 * Phase 225-02: Initial implementation.
 */

import {
  createPublicClient,
  http,
  parseAbiItem,
  type PublicClient,
  type Address,
} from 'viem';
import type { IChainSubscriber, IncomingTransaction, ChainType, ILogger } from '@waiaas/core';

/** ERC-20 Transfer event signature for getLogs filtering. */
const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

/** Maximum blocks per poll cycle (pitfall 4: RPC provider limits). */
const MAX_BLOCK_RANGE = 10n;

/**
 * L2 network prefixes where getBlock(includeTransactions:true) causes timeouts
 * due to high TX density (500-2000+ TXs/block → 200KB-1MB+ responses).
 * On these chains, only ERC-20 detection (getLogs) is used (#172).
 */
const L2_NETWORK_PREFIXES = ['arbitrum', 'optimism', 'base'];

interface EvmSubscription {
  address: string;
  network: string;
  onTransaction: (tx: IncomingTransaction) => void;
  lastBlock: bigint;
  /** Consecutive per-wallet poll error count. */
  errorCount: number;
  /** Timestamp (ms) until which this wallet's polling is skipped. */
  backoffUntil: number;
}

/** Base backoff in ms after first RPC error. */
const BACKOFF_BASE_MS = 30_000;
/** Maximum backoff in ms (cap). */
const BACKOFF_MAX_MS = 300_000;
/** Consecutive errors before escalating log level to warn. */
const WARN_THRESHOLD = 3;
/** Maximum same-range retries before forcing cursor advancement. */
const MAX_RETRY_SAME_RANGE = 3;
/** Consecutive errors before emitting RPC health degraded alert (#185). */
const RPC_ALERT_THRESHOLD = 5;

/** RPC alert callback type for notifying admin of RPC issues (#185). */
export type RpcAlertCallback = (alert: {
  type: 'RPC_HEALTH_DEGRADED' | 'INCOMING_TX_RANGE_SKIPPED';
  walletId: string;
  network: string;
  errorCount: number;
  lastError: string;
  fromBlock?: string;
  toBlock?: string;
}) => void;

export class EvmIncomingSubscriber implements IChainSubscriber {
  readonly chain: ChainType = 'ethereum';

  private client: PublicClient;
  private currentRpcUrl: string;
  private resolveRpcUrl: () => string;
  private reportRpcFailure?: (url: string) => void;
  private reportRpcSuccess?: (url: string) => void;
  private subscriptions = new Map<string, EvmSubscription>();
  private generateId: () => string;
  private onRpcAlert?: RpcAlertCallback;
  private resolveTokenAddresses?: () => Address[];
  private logger?: ILogger;
  private errorCount = 0;
  private backoffUntil = 0;
  /** Track wallets that already emitted RPC_HEALTH_DEGRADED to avoid spam. */
  private alertedWallets = new Set<string>();
  /**
   * Cache of block numbers per network to avoid redundant getBlockNumber() calls
   * during subscribe(). Keyed by network string (#359).
   */
  private blockNumberCache = new Map<string, bigint>();

  constructor(config: {
    rpcUrl?: string;
    resolveRpcUrl?: () => string;
    reportRpcFailure?: (url: string) => void;
    reportRpcSuccess?: (url: string) => void;
    wsUrl?: string;
    generateId?: () => string;
    onRpcAlert?: RpcAlertCallback;
    /** Resolve registered token contract addresses for getLogs address filter (#203). */
    resolveTokenAddresses?: () => Address[];
    logger?: ILogger;
  }) {
    this.resolveRpcUrl = config.resolveRpcUrl ?? (() => config.rpcUrl!);
    this.reportRpcFailure = config.reportRpcFailure;
    this.reportRpcSuccess = config.reportRpcSuccess;
    this.currentRpcUrl = this.resolveRpcUrl();
    this.client = createPublicClient({ transport: http(this.currentRpcUrl) });
    this.generateId = config.generateId ?? (() => crypto.randomUUID());
    this.onRpcAlert = config.onRpcAlert;
    this.resolveTokenAddresses = config.resolveTokenAddresses;
    this.logger = config.logger;
    // wsUrl accepted for future WSS subscription support (#193).
    // Currently stored but unused -- EVM uses polling-first strategy (D-06).
  }

  // -- Subscription management (2) --

  async subscribe(
    walletId: string,
    address: string,
    network: string,
    onTransaction: (tx: IncomingTransaction) => void,
  ): Promise<void> {
    if (this.subscriptions.has(walletId)) return; // idempotent

    // Reuse cached block number for the same network to avoid redundant RPC calls (#359).
    // With N wallets × M networks, this reduces getBlockNumber() calls from N*M to M.
    let currentBlock = this.blockNumberCache.get(network);
    if (currentBlock === undefined) {
      currentBlock = await this.client.getBlockNumber();
      this.blockNumberCache.set(network, currentBlock);
    }

    this.subscriptions.set(walletId, {
      address,
      network,
      onTransaction,
      lastBlock: currentBlock,
      errorCount: 0,
      backoffUntil: 0,
    });
  }

  async unsubscribe(walletId: string): Promise<void> {
    this.subscriptions.delete(walletId);
  }

  // -- Query (1) --

  subscribedWallets(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  // -- Lifecycle (3) --

  async connect(): Promise<void> {
    // No-op: EVM uses polling-first strategy (design decision D-06).
  }

  async waitForDisconnect(): Promise<void> {
    // Never-resolving Promise: EVM polling mode has no WebSocket to disconnect.
    // The reconnectLoop in Phase 226 will call connect() (succeeds instantly)
    // then waitForDisconnect() (blocks forever), meaning EVM stays in
    // WS_ACTIVE state permanently and polling workers handle the actual work.
    return new Promise(() => {});
  }

  async destroy(): Promise<void> {
    this.subscriptions.clear();
  }

  // -- RPC helpers (used by confirmation worker) --

  /**
   * Returns the current block number from the connected EVM RPC.
   * Used by the confirmation worker to compare against DETECTED tx block numbers.
   */
  async getBlockNumber(): Promise<bigint> {
    return this.client.getBlockNumber();
  }

  // -- Polling (called by BackgroundWorkers in Phase 226) --

  async pollAll(): Promise<void> {
    // Backoff: skip polling if still within backoff window
    if (Date.now() < this.backoffUntil) return;

    // Dynamic RPC URL re-resolution: switch to next available endpoint (#199)
    this.refreshClient();
    const rpcUrl = this.currentRpcUrl;

    let hadError = false;
    try {
      const currentBlock = await this.client.getBlockNumber();

      for (const [walletId, sub] of this.subscriptions) {
        // Per-wallet backoff: skip if still within cooldown window
        if (Date.now() < sub.backoffUntil) continue;

        try {
          if (sub.lastBlock >= currentBlock) continue; // no new blocks

          const toBlock =
            sub.lastBlock + MAX_BLOCK_RANGE < currentBlock
              ? sub.lastBlock + MAX_BLOCK_RANGE
              : currentBlock;

          const erc20Txs = await this.pollERC20(
            sub.address as Address,
            sub.lastBlock + 1n,
            toBlock,
            walletId,
            sub.network,
          );

          // Skip native ETH polling on L2 chains to avoid getBlock timeout (#172)
          const isL2 = L2_NETWORK_PREFIXES.some((p) => sub.network.startsWith(p));
          const nativeTxs = isL2
            ? []
            : await this.pollNativeETH(
                sub.address as Address,
                sub.lastBlock + 1n,
                toBlock,
                walletId,
                sub.network,
              );

          const allTxs = [...erc20Txs, ...nativeTxs];
          for (const tx of allTxs) {
            sub.onTransaction(tx);
          }

          sub.lastBlock = toBlock;
          sub.errorCount = 0;
          sub.backoffUntil = 0;
          this.alertedWallets.delete(walletId);
        } catch (err) {
          hadError = true;
          sub.errorCount++;

          const errMsg = err instanceof Error ? err.message : String(err);

          // Force cursor advancement after N consecutive failures to escape infinite retry
          if (sub.errorCount >= MAX_RETRY_SAME_RANGE) {
            const fromBlock = sub.lastBlock + 1n;
            const toBlock =
              sub.lastBlock + MAX_BLOCK_RANGE < currentBlock
                ? sub.lastBlock + MAX_BLOCK_RANGE
                : currentBlock;
            sub.lastBlock = toBlock;

            // Emit INCOMING_TX_RANGE_SKIPPED alert (#185)
            this.onRpcAlert?.({
              type: 'INCOMING_TX_RANGE_SKIPPED',
              walletId,
              network: sub.network,
              errorCount: sub.errorCount,
              lastError: errMsg,
              fromBlock: String(fromBlock),
              toBlock: String(toBlock),
            });
          }

          // Per-wallet exponential backoff
          const backoffMs = Math.min(
            BACKOFF_BASE_MS * 2 ** (sub.errorCount - 1),
            BACKOFF_MAX_MS,
          );
          sub.backoffUntil = Date.now() + backoffMs;

          // Emit RPC_HEALTH_DEGRADED alert once per wallet (#185)
          if (sub.errorCount === RPC_ALERT_THRESHOLD && !this.alertedWallets.has(walletId)) {
            this.alertedWallets.add(walletId);
            this.onRpcAlert?.({
              type: 'RPC_HEALTH_DEGRADED',
              walletId,
              network: sub.network,
              errorCount: sub.errorCount,
              lastError: errMsg,
            });
          }

          // Log only after WARN_THRESHOLD, message-only (no full stack trace)
          if (sub.errorCount >= WARN_THRESHOLD) {
            this.logger?.warn(
              `EVM poll failed for wallet ${walletId} (backoff ${backoffMs / 1000}s, consecutive: ${sub.errorCount}): ${errMsg}`,
            );
          }
        }
      }

      // Full cycle completed without RPC-level failure → reset backoff
      if (!hadError) {
        this.errorCount = 0;
        this.backoffUntil = 0;
        this.reportRpcSuccess?.(rpcUrl);
      } else {
        // At least one per-wallet error: report to RPC Pool for cooldown (#199)
        this.reportRpcFailure?.(rpcUrl);
      }
    } catch (err) {
      // RPC-level error (e.g. getBlockNumber failed — 429/500): apply backoff
      this.errorCount++;
      this.reportRpcFailure?.(rpcUrl);
      const backoffMs = Math.min(
        BACKOFF_BASE_MS * 2 ** (this.errorCount - 1),
        BACKOFF_MAX_MS,
      );
      this.backoffUntil = Date.now() + backoffMs;
      if (this.errorCount >= WARN_THRESHOLD) {
        this.logger?.warn(
          `EVM poll RPC error (backoff ${backoffMs / 1000}s, consecutive: ${this.errorCount}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // -- Private helpers --

  /**
   * Re-resolve RPC URL from pool and recreate viem client if URL changed (#199).
   * Called at the start of each pollAll() cycle to pick up cooldown rotations.
   */
  private refreshClient(): void {
    try {
      const newUrl = this.resolveRpcUrl();
      if (newUrl !== this.currentRpcUrl) {
        this.currentRpcUrl = newUrl;
        this.client = createPublicClient({ transport: http(newUrl) });
      }
    } catch {
      // resolveRpcUrl may throw (e.g., AllRpcFailedError) — keep current client
    }
  }

  private async pollERC20(
    walletAddress: Address,
    fromBlock: bigint,
    toBlock: bigint,
    walletId: string,
    network: string,
  ): Promise<IncomingTransaction[]> {
    // Resolve token addresses for getLogs address filter (#203)
    const tokenAddresses = this.resolveTokenAddresses?.() ?? [];

    // No registered tokens → skip ERC-20 polling gracefully (#203)
    if (tokenAddresses.length === 0) return [];

    const logs = await this.client.getLogs({
      address: tokenAddresses,
      event: TRANSFER_EVENT,
      args: { to: walletAddress },
      fromBlock,
      toBlock,
    });

    // Null guard: some RPCs return null instead of empty array (#203)
    const results = logs ?? [];
    return results.map((log) => ({
      id: this.generateId(),
      txHash: log.transactionHash!,
      walletId,
      fromAddress: log.args.from!,
      amount: log.args.value!.toString(),
      tokenAddress: log.address,
      chain: 'ethereum' as const,
      network,
      status: 'DETECTED' as const,
      blockNumber: Number(log.blockNumber),
      detectedAt: Math.floor(Date.now() / 1000),
      confirmedAt: null,
    }));
  }

  private async pollNativeETH(
    walletAddress: Address,
    fromBlock: bigint,
    toBlock: bigint,
    walletId: string,
    network: string,
  ): Promise<IncomingTransaction[]> {
    const results: IncomingTransaction[] = [];

    for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
      const block = await this.client.getBlock({
        blockNumber: blockNum,
        includeTransactions: true,
      });

      for (const tx of block.transactions) {
        // Guard: hash-only without includeTransactions (pitfall 2)
        if (typeof tx === 'string') continue;
        if (typeof tx !== 'object' || !tx.to) continue;

        if (
          tx.to.toLowerCase() === walletAddress.toLowerCase() &&
          tx.value > 0n
        ) {
          results.push({
            id: this.generateId(),
            txHash: tx.hash,
            walletId,
            fromAddress: tx.from,
            amount: tx.value.toString(),
            tokenAddress: null, // native ETH
            chain: 'ethereum' as const,
            network,
            status: 'DETECTED' as const,
            blockNumber: Number(blockNum),
            detectedAt: Math.floor(Date.now() / 1000),
            confirmedAt: null,
          });
        }
      }
    }

    return results;
  }
}
