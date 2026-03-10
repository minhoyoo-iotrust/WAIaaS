/**
 * PolymarketApproveHelper: USDC approve logic for CTF Exchange contracts.
 *
 * Handles ERC-20 approval for USDC.e to the appropriate exchange contract
 * (CTF Exchange for binary markets, Neg Risk CTF Exchange for neg risk).
 *
 * @see design doc 80, Section 7.2
 */
import type { Hex, PublicClient } from 'viem';
import { PM_CONTRACTS } from './config.js';
import { NegRiskRouter } from './neg-risk-router.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_UINT256 = 2n ** 256n - 1n;

/** Minimal ERC-20 ABI for allowance + approve */
const ERC20_ALLOWANCE_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApproveRequest {
  type: 'APPROVE';
  to: Hex;
  spender: Hex;
  amount: bigint;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

export class PolymarketApproveHelper {
  /**
   * Build an APPROVE request for USDC.e to the appropriate exchange.
   * Defaults to MaxUint256 (unlimited) approval.
   */
  buildApproveRequest(negRisk: boolean, amount?: bigint): ApproveRequest {
    return {
      type: 'APPROVE',
      to: PM_CONTRACTS.USDC_E as Hex,
      spender: NegRiskRouter.getApproveTarget(negRisk),
      amount: amount ?? MAX_UINT256,
    };
  }

  /**
   * Build dual APPROVE requests for both CTF Exchange and Neg Risk CTF Exchange.
   * Used when polymarket_auto_approve_ctf setting is true.
   */
  buildDualApproveRequests(amount?: bigint): ApproveRequest[] {
    return [
      this.buildApproveRequest(false, amount),
      this.buildApproveRequest(true, amount),
    ];
  }

  /**
   * Check current ERC-20 allowance for USDC.e to the appropriate exchange.
   */
  async checkAllowance(
    publicClient: PublicClient,
    walletAddress: Hex,
    negRisk: boolean,
  ): Promise<bigint> {
    const spender = NegRiskRouter.getApproveTarget(negRisk);
    return publicClient.readContract({
      address: PM_CONTRACTS.USDC_E as Hex,
      abi: ERC20_ALLOWANCE_ABI,
      functionName: 'allowance',
      args: [walletAddress, spender],
    });
  }

  /**
   * Check if approval is needed (allowance < requiredAmount).
   */
  async needsApproval(
    publicClient: PublicClient,
    walletAddress: Hex,
    negRisk: boolean,
    requiredAmount: bigint,
  ): Promise<boolean> {
    const allowance = await this.checkAllowance(publicClient, walletAddress, negRisk);
    return allowance < requiredAmount;
  }
}
