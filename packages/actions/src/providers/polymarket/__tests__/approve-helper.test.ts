/**
 * Tests for PolymarketApproveHelper: USDC approve logic for CTF Exchange contracts.
 *
 * Plan 371-04 Task 1: ApproveHelper tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { PolymarketApproveHelper } from '../approve-helper.js';
import { PM_CONTRACTS } from '../config.js';

const MAX_UINT256 = 2n ** 256n - 1n;

describe('PolymarketApproveHelper', () => {
  const helper = new PolymarketApproveHelper();

  describe('buildApproveRequest', () => {
    it('builds APPROVE targeting CTF_EXCHANGE for binary markets', () => {
      const req = helper.buildApproveRequest(false);
      expect(req.type).toBe('APPROVE');
      expect(req.to.toLowerCase()).toBe(PM_CONTRACTS.USDC_E.toLowerCase());
      expect(req.spender.toLowerCase()).toBe(PM_CONTRACTS.CTF_EXCHANGE.toLowerCase());
    });

    it('builds APPROVE targeting NEG_RISK_CTF_EXCHANGE for neg risk markets', () => {
      const req = helper.buildApproveRequest(true);
      expect(req.type).toBe('APPROVE');
      expect(req.to.toLowerCase()).toBe(PM_CONTRACTS.USDC_E.toLowerCase());
      expect(req.spender.toLowerCase()).toBe(PM_CONTRACTS.NEG_RISK_CTF_EXCHANGE.toLowerCase());
    });

    it('defaults to MaxUint256 approval amount', () => {
      const req = helper.buildApproveRequest(false);
      expect(req.amount).toBe(MAX_UINT256);
    });

    it('accepts custom approval amount', () => {
      const customAmount = 1_000_000n; // 1 USDC
      const req = helper.buildApproveRequest(false, customAmount);
      expect(req.amount).toBe(customAmount);
    });
  });

  describe('buildDualApproveRequests', () => {
    it('returns 2 approve requests for both exchanges', () => {
      const reqs = helper.buildDualApproveRequests();
      expect(reqs).toHaveLength(2);

      const spenders = reqs.map((r) => r.spender.toLowerCase());
      expect(spenders).toContain(PM_CONTRACTS.CTF_EXCHANGE.toLowerCase());
      expect(spenders).toContain(PM_CONTRACTS.NEG_RISK_CTF_EXCHANGE.toLowerCase());
    });

    it('both use MaxUint256 by default', () => {
      const reqs = helper.buildDualApproveRequests();
      for (const req of reqs) {
        expect(req.amount).toBe(MAX_UINT256);
      }
    });

    it('both use custom amount when specified', () => {
      const amount = 5_000_000n;
      const reqs = helper.buildDualApproveRequests(amount);
      for (const req of reqs) {
        expect(req.amount).toBe(amount);
      }
    });
  });

  describe('checkAllowance', () => {
    it('reads ERC-20 allowance from public client', async () => {
      const mockClient = {
        readContract: vi.fn().mockResolvedValue(1_000_000n),
      };
      const walletAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as `0x${string}`;

      const allowance = await helper.checkAllowance(mockClient as any, walletAddress, false);
      expect(allowance).toBe(1_000_000n);
      expect(mockClient.readContract).toHaveBeenCalledWith({
        address: PM_CONTRACTS.USDC_E,
        abi: expect.any(Array),
        functionName: 'allowance',
        args: [walletAddress, PM_CONTRACTS.CTF_EXCHANGE],
      });
    });
  });

  describe('needsApproval', () => {
    it('returns true when allowance < requiredAmount', async () => {
      const mockClient = {
        readContract: vi.fn().mockResolvedValue(500_000n),
      };
      const walletAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as `0x${string}`;

      const needs = await helper.needsApproval(mockClient as any, walletAddress, false, 1_000_000n);
      expect(needs).toBe(true);
    });

    it('returns false when allowance >= requiredAmount', async () => {
      const mockClient = {
        readContract: vi.fn().mockResolvedValue(2_000_000n),
      };
      const walletAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as `0x${string}`;

      const needs = await helper.needsApproval(mockClient as any, walletAddress, false, 1_000_000n);
      expect(needs).toBe(false);
    });
  });
});
