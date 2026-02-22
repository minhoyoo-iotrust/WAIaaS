/**
 * Pure parsing functions for detecting incoming SOL and SPL/Token-2022 transfers.
 *
 * Operates on plain objects (the shape returned by getTransaction jsonParsed).
 * No @solana/kit imports -- pure logic for testability.
 *
 * References:
 *   Design doc 76 sections 3.2.1 (SOL native), 3.2.2 (SPL/Token-2022)
 */

import type { IncomingTransaction } from '@waiaas/core';

// ─── Solana RPC Response Types ──────────────────────────────────

/** Account key entry from a jsonParsed transaction. */
export interface SolanaAccountKey {
  pubkey: string;
  signer: boolean;
  writable: boolean;
  source?: string;
}

/** Token balance entry from preTokenBalances / postTokenBalances. */
export interface SolanaTokenBalance {
  accountIndex: number;
  mint: string;
  owner: string;
  uiTokenAmount: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
  };
  programId?: string;
}

/** Transaction result shape from getTransaction jsonParsed. */
export interface SolanaTransactionResult {
  slot: number;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: SolanaAccountKey[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      instructions: any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
    };
  };
  meta: {
    err: unknown | null;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances: SolanaTokenBalance[];
    postTokenBalances: SolanaTokenBalance[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  } | null;
}

// ─── SOL Native Transfer Detection ─────────────────────────────

/**
 * Detect an incoming SOL native transfer by comparing preBalances/postBalances.
 *
 * Returns an IncomingTransaction if the wallet's balance increased (positive delta),
 * or null if not an incoming transfer.
 *
 * @param tx - Transaction result from getTransaction (jsonParsed)
 * @param walletAddress - The wallet address to check for incoming transfers
 * @param walletId - Wallet ID for the IncomingTransaction record
 * @param network - Network identifier (e.g. 'devnet')
 * @param generateId - ID generator function (injected for testability)
 */
export function parseSOLTransfer(
  tx: SolanaTransactionResult,
  walletAddress: string,
  walletId: string,
  network: string,
  generateId: () => string,
): IncomingTransaction | null {
  const { meta, transaction } = tx;
  if (!meta || meta.err !== null) return null;

  const accountKeys = transaction.message.accountKeys;
  const walletIndex = accountKeys.findIndex(
    (key) => key.pubkey === walletAddress,
  );
  if (walletIndex === -1) return null;

  const preBalance = BigInt(meta.preBalances[walletIndex]!);
  const postBalance = BigInt(meta.postBalances[walletIndex]!);
  const delta = postBalance - preBalance;

  if (delta <= 0n) return null;

  // Find sender: first account with decreased balance (excluding wallet)
  let fromAddress = 'unknown';
  for (let i = 0; i < meta.preBalances.length; i++) {
    if (i === walletIndex) continue;
    if (BigInt(meta.preBalances[i]!) > BigInt(meta.postBalances[i]!)) {
      fromAddress = accountKeys[i]!.pubkey;
      break;
    }
  }

  return {
    id: generateId(),
    txHash: transaction.signatures[0]!,
    walletId,
    fromAddress,
    amount: delta.toString(),
    tokenAddress: null,
    chain: 'solana',
    network,
    status: 'DETECTED',
    blockNumber: tx.slot,
    detectedAt: Math.floor(Date.now() / 1000),
    confirmedAt: null,
  };
}

// ─── SPL / Token-2022 Transfer Detection ────────────────────────

/**
 * Find the sender of a token transfer for a specific mint.
 *
 * Looks in preTokenBalances for accounts (different owner) with decreased balance
 * for the same mint.
 */
function findTokenSender(
  meta: NonNullable<SolanaTransactionResult['meta']>,
  mint: string,
  walletAddress: string,
): string {
  for (const tb of meta.preTokenBalances) {
    if (tb.mint !== mint) continue;
    if (tb.owner === walletAddress) continue;

    // Check if this owner's balance decreased for this mint
    const postEntry = meta.postTokenBalances.find(
      (ptb) => ptb.mint === mint && ptb.owner === tb.owner,
    );
    const preAmount = BigInt(tb.uiTokenAmount.amount);
    const postAmount = postEntry ? BigInt(postEntry.uiTokenAmount.amount) : 0n;

    if (preAmount > postAmount) {
      return tb.owner;
    }
  }
  return 'unknown';
}

/**
 * Detect incoming SPL Token and Token-2022 transfers by comparing
 * preTokenBalances/postTokenBalances.
 *
 * Returns an array of IncomingTransaction objects (one per token with positive delta).
 * Handles first-time token receipt (no preTokenBalance entry) by defaulting to 0n.
 * Both SPL Token and Token-2022 produce identical preTokenBalances/postTokenBalances
 * structures -- no program-specific logic needed.
 *
 * @param tx - Transaction result from getTransaction (jsonParsed)
 * @param walletAddress - The wallet address to check for incoming transfers
 * @param walletId - Wallet ID for the IncomingTransaction record
 * @param network - Network identifier (e.g. 'devnet')
 * @param generateId - ID generator function (injected for testability)
 */
export function parseSPLTransfers(
  tx: SolanaTransactionResult,
  walletAddress: string,
  walletId: string,
  network: string,
  generateId: () => string,
): IncomingTransaction[] {
  const { meta } = tx;
  if (!meta || meta.err !== null) return [];

  const results: IncomingTransaction[] = [];

  // Build pre-state map: mint -> amount for wallet's token balances
  const preMap = new Map<string, bigint>();
  for (const tb of meta.preTokenBalances) {
    if (tb.owner === walletAddress) {
      preMap.set(tb.mint, BigInt(tb.uiTokenAmount.amount));
    }
  }

  // Compare post-state: positive delta = incoming token transfer
  for (const tb of meta.postTokenBalances) {
    if (tb.owner !== walletAddress) continue;

    const preAmount = preMap.get(tb.mint) ?? 0n; // 0n for first-time receipt (Pitfall 1)
    const postAmount = BigInt(tb.uiTokenAmount.amount);
    const delta = postAmount - preAmount;
    if (delta <= 0n) continue;

    const fromAddress = findTokenSender(meta, tb.mint, walletAddress);

    results.push({
      id: generateId(),
      txHash: tx.transaction.signatures[0]!,
      walletId,
      fromAddress,
      amount: delta.toString(),
      tokenAddress: tb.mint,
      chain: 'solana',
      network,
      status: 'DETECTED',
      blockNumber: tx.slot,
      detectedAt: Math.floor(Date.now() / 1000),
      confirmedAt: null,
    });
  }

  return results;
}
