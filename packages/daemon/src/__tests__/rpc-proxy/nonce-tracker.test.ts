import { describe, it, expect, beforeEach } from 'vitest';
import { NonceTracker } from '../../rpc-proxy/nonce-tracker.js';

describe('NonceTracker', () => {
  let tracker: NonceTracker;

  beforeEach(() => {
    tracker = new NonceTracker();
  });

  describe('getNextNonce', () => {
    it('returns onchainNonce on first call (no pending)', () => {
      expect(tracker.getNextNonce('0xAddr', 5)).toBe(5);
    });

    it('returns 6 on second call (one pending)', () => {
      tracker.getNextNonce('0xAddr', 5); // returns 5
      expect(tracker.getNextNonce('0xAddr', 5)).toBe(6);
    });

    it('returns 7 on third call', () => {
      tracker.getNextNonce('0xAddr', 5); // 5
      tracker.getNextNonce('0xAddr', 5); // 6
      expect(tracker.getNextNonce('0xAddr', 5)).toBe(7);
    });

    it('handles case-insensitive addresses', () => {
      tracker.getNextNonce('0xAbC', 5); // 5
      expect(tracker.getNextNonce('0xabc', 5)).toBe(6);
    });

    it('tracks different addresses independently', () => {
      tracker.getNextNonce('0xAddr1', 5); // 5
      expect(tracker.getNextNonce('0xAddr2', 10)).toBe(10);
      expect(tracker.getNextNonce('0xAddr1', 5)).toBe(6);
    });

    it('uses max of onchainNonce and localNext', () => {
      tracker.getNextNonce('0xAddr', 5); // returns 5, local=6
      // If on-chain confirms and nonce advances to 10, should use 10
      expect(tracker.getNextNonce('0xAddr', 10)).toBe(10);
    });
  });

  describe('confirmNonce', () => {
    it('removes confirmed nonce from pending', () => {
      tracker.getNextNonce('0xAddr', 5); // allocate nonce 5
      tracker.confirmNonce('0xAddr', 5); // confirm
      // After confirm, internal state should be clean for nonce 5
      // Next call with same onchain should give same nonce
      // (this is an internal state test - just verify no crash)
      expect(tracker.getNextNonce('0xAddr', 6)).toBe(6);
    });
  });

  describe('rollbackNonce', () => {
    it('resets pending after rollback', () => {
      tracker.getNextNonce('0xAddr', 5); // 5
      tracker.getNextNonce('0xAddr', 5); // 6
      tracker.getNextNonce('0xAddr', 5); // 7
      tracker.rollbackNonce('0xAddr', 7); // rollback nonce 7
      // Next nonce should be 7 again (since we rolled back)
      expect(tracker.getNextNonce('0xAddr', 5)).toBe(7);
    });
  });

  describe('getAdjustedTransactionCount', () => {
    it('returns max of onchainPending and localNext', () => {
      tracker.getNextNonce('0xAddr', 5); // allocate 5, local=6
      tracker.getNextNonce('0xAddr', 5); // allocate 6, local=7
      // onchainPending=5 (no confirms yet), local has allocated up to 7
      expect(tracker.getAdjustedTransactionCount('0xAddr', 5)).toBe(7);
    });

    it('returns onchainPending when no local tracker exists', () => {
      expect(tracker.getAdjustedTransactionCount('0xUnknown', 10)).toBe(10);
    });

    it('handles case-insensitive addresses', () => {
      tracker.getNextNonce('0xAbC', 5); // allocate 5, local=6
      expect(tracker.getAdjustedTransactionCount('0xabc', 3)).toBe(6);
    });
  });

  describe('clear', () => {
    it('clears all tracking state', () => {
      tracker.getNextNonce('0xAddr', 5); // 5
      tracker.getNextNonce('0xAddr', 5); // 6
      tracker.clear();
      // After clear, should start fresh
      expect(tracker.getNextNonce('0xAddr', 5)).toBe(5);
    });
  });
});
