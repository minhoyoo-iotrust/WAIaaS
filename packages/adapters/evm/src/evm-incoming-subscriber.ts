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
import type { IChainSubscriber, IncomingTransaction, ChainType } from '@waiaas/core';

/** ERC-20 Transfer event signature for getLogs filtering. */
const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

/** Maximum blocks per poll cycle (pitfall 4: RPC provider limits). */
const MAX_BLOCK_RANGE = 10n;

interface EvmSubscription {
  address: string;
  network: string;
  onTransaction: (tx: IncomingTransaction) => void;
  lastBlock: bigint;
}

export class EvmIncomingSubscriber implements IChainSubscriber {
  readonly chain: ChainType = 'ethereum';

  private client: PublicClient;
  private subscriptions = new Map<string, EvmSubscription>();
  private generateId: () => string;

  constructor(config: { rpcUrl: string; generateId?: () => string }) {
    this.client = createPublicClient({ transport: http(config.rpcUrl) });
    this.generateId = config.generateId ?? (() => crypto.randomUUID());
  }

  // -- Subscription management (2) --

  async subscribe(
    walletId: string,
    address: string,
    network: string,
    onTransaction: (tx: IncomingTransaction) => void,
  ): Promise<void> {
    if (this.subscriptions.has(walletId)) return; // idempotent

    const currentBlock = await this.client.getBlockNumber();
    this.subscriptions.set(walletId, {
      address,
      network,
      onTransaction,
      lastBlock: currentBlock,
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
    const currentBlock = await this.client.getBlockNumber();

    for (const [walletId, sub] of this.subscriptions) {
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

        const nativeTxs = await this.pollNativeETH(
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
      } catch (err) {
        console.warn(`EVM poll failed for wallet ${walletId}:`, err);
      }
    }
  }

  // -- Private helpers --

  private async pollERC20(
    walletAddress: Address,
    fromBlock: bigint,
    toBlock: bigint,
    walletId: string,
    network: string,
  ): Promise<IncomingTransaction[]> {
    const logs = await this.client.getLogs({
      event: TRANSFER_EVENT,
      args: { to: walletAddress },
      fromBlock,
      toBlock,
    });

    return logs.map((log) => ({
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
