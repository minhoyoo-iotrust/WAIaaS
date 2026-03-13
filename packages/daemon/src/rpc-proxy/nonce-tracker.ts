/**
 * NonceTracker -- Local nonce management for sequential eth_sendTransaction.
 *
 * Addresses Pitfall 4 (Forge Script Multi-TX Nonce): When Forge sends
 * multiple transactions in rapid succession, each needs a unique nonce.
 * The on-chain nonce may not have updated yet, so we track locally.
 *
 * Per-address tracking with case-insensitive comparison.
 *
 * @see .planning/research/m31-14-rpc-proxy-PITFALLS.md (Pitfall 4)
 */

// ── Types ─────────────────────────────────────────────────────────

interface AddressState {
  nextNonce: number;
  pending: Set<number>;
}

// ── NonceTracker ──────────────────────────────────────────────────

export class NonceTracker {
  private tracker = new Map<string, AddressState>();

  /**
   * Get the next nonce for an address.
   * Returns max(onchainNonce, localNextNonce) and increments local counter.
   */
  getNextNonce(address: string, onchainNonce: number): number {
    const key = address.toLowerCase();
    let state = this.tracker.get(key);

    if (!state) {
      state = { nextNonce: onchainNonce, pending: new Set() };
      this.tracker.set(key, state);
    }

    // Use max of on-chain and local (on-chain may have advanced)
    const nonce = Math.max(onchainNonce, state.nextNonce);
    state.nextNonce = nonce + 1;
    state.pending.add(nonce);
    return nonce;
  }

  /**
   * Confirm a nonce has been included on-chain.
   * Removes from pending set.
   */
  confirmNonce(address: string, nonce: number): void {
    const key = address.toLowerCase();
    const state = this.tracker.get(key);
    if (state) {
      state.pending.delete(nonce);
    }
  }

  /**
   * Rollback a nonce allocation (transaction failed before submission).
   * Removes from pending and recalculates nextNonce.
   */
  rollbackNonce(address: string, nonce: number): void {
    const key = address.toLowerCase();
    const state = this.tracker.get(key);
    if (!state) return;

    state.pending.delete(nonce);

    // Recalculate nextNonce: max of remaining pending + 1, or the rolled-back nonce
    if (state.pending.size === 0) {
      state.nextNonce = nonce;
    } else {
      const maxPending = Math.max(...state.pending);
      state.nextNonce = maxPending + 1;
    }
  }

  /**
   * Get adjusted transaction count for eth_getTransactionCount('pending') interception.
   * Returns max of on-chain pending count and local next nonce.
   */
  getAdjustedTransactionCount(address: string, onchainPendingCount: number): number {
    const key = address.toLowerCase();
    const state = this.tracker.get(key);
    if (!state) return onchainPendingCount;
    return Math.max(onchainPendingCount, state.nextNonce);
  }

  /**
   * Clear all tracking state.
   */
  clear(): void {
    this.tracker.clear();
  }
}
