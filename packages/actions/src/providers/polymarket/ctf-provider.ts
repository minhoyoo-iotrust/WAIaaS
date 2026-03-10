/**
 * PolymarketCtfProvider: 5 on-chain CTF actions (split, merge, redeem, approve).
 *
 * Uses standard 6-stage CONTRACT_CALL/APPROVE pipeline for Polygon transactions.
 * requiresSigningKey: false (standard on-chain signing flow).
 *
 * @see design doc 80, Section 7.2
 */
import { ChainError } from '@waiaas/core';
import type {
  IActionProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ContractCallRequest,
} from '@waiaas/core';
import { encodeFunctionData, parseAbi, parseUnits } from 'viem';
import { PM_CONTRACTS, PM_ERRORS } from './config.js';
import { NegRiskRouter } from './neg-risk-router.js';
import { PolymarketApproveHelper } from './approve-helper.js';
import {
  PmRedeemSchema,
  PmSplitSchema,
  PmMergeSchema,
  PmApproveCollateralSchema,
  PmApproveCtfSchema,
} from './ctf-schemas.js';

// ---------------------------------------------------------------------------
// ABI Constants (human-readable format for viem)
// ---------------------------------------------------------------------------

const CONDITIONAL_TOKENS_ABI = parseAbi([
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)',
  'function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)',
  'function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)',
]);

const NEG_RISK_ADAPTER_ABI = parseAbi([
  'function redeemPositions(bytes32 conditionId, uint256[] indexSets)',
]);

const ERC1155_ABI = parseAbi([
  'function setApprovalForAll(address operator, bool approved)',
]);

/** Root collection ID (bytes32 zero). */
const PARENT_COLLECTION_ID = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class PolymarketCtfProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata = {
    name: 'polymarket_ctf',
    description: 'Polymarket CTF on-chain operations (split, merge, redeem, approve)',
    version: '1.0.0',
    chains: ['ethereum'],
    mcpExpose: true,
    requiresApiKey: false,
    requiredApis: [],
    requiresSigningKey: false,
  };

  readonly actions: readonly ActionDefinition[] = [
    {
      name: 'pm_redeem_positions',
      description: 'Redeem winning tokens after market resolution for USDC collateral',
      chain: 'ethereum',
      riskLevel: 'low',
      defaultTier: 'INSTANT',
      inputSchema: PmRedeemSchema,
    },
    {
      name: 'pm_split_position',
      description: 'Split USDC collateral into outcome token sets on CTF contract',
      chain: 'ethereum',
      riskLevel: 'medium',
      defaultTier: 'DELAY',
      inputSchema: PmSplitSchema,
    },
    {
      name: 'pm_merge_positions',
      description: 'Merge outcome token sets back to USDC collateral on CTF contract',
      chain: 'ethereum',
      riskLevel: 'medium',
      defaultTier: 'DELAY',
      inputSchema: PmMergeSchema,
    },
    {
      name: 'pm_approve_collateral',
      description: 'Approve USDC.e spending for Polymarket CTF Exchange contract',
      chain: 'ethereum',
      riskLevel: 'low',
      defaultTier: 'INSTANT',
      inputSchema: PmApproveCollateralSchema,
    },
    {
      name: 'pm_approve_ctf',
      description: 'Approve CTF ERC-1155 tokens for Polymarket Exchange contract',
      chain: 'ethereum',
      riskLevel: 'low',
      defaultTier: 'INSTANT',
      inputSchema: PmApproveCtfSchema,
    },
  ];

  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    _context: ActionContext,
  ): Promise<ContractCallRequest | ContractCallRequest[]> {
    switch (actionName) {
      case 'pm_redeem_positions':
        return this.resolveRedeem(params);
      case 'pm_split_position':
        return this.resolveSplit(params);
      case 'pm_merge_positions':
        return this.resolveMerge(params);
      case 'pm_approve_collateral':
        return this.resolveApproveCollateral(params);
      case 'pm_approve_ctf':
        return this.resolveApproveCTF(params);
      default:
        throw new ChainError(PM_ERRORS.API_ERROR, 'POLYMARKET', {
          message: `Unknown CTF action: ${actionName}`,
        });
    }
  }

  /**
   * Calculate spending amount for policy engine limits.
   */
  async getSpendingAmount(
    actionName: string,
    params: Record<string, unknown>,
  ): Promise<{ amount: bigint; asset: string }> {
    if (actionName === 'pm_split_position') {
      const parsed = PmSplitSchema.parse(params);
      return {
        amount: parseUnits(parsed.amount, 6),
        asset: PM_CONTRACTS.USDC_E,
      };
    }
    return { amount: 0n, asset: PM_CONTRACTS.USDC_E };
  }

  // -----------------------------------------------------------------------
  // Private resolve methods
  // -----------------------------------------------------------------------

  private resolveRedeem(params: Record<string, unknown>): ContractCallRequest {
    const parsed = PmRedeemSchema.parse(params);
    const target = NegRiskRouter.getRedeemTarget(parsed.isNegRisk);

    if (parsed.isNegRisk) {
      // Neg Risk: NegRiskAdapter.redeemPositions(conditionId, indexSets)
      const calldata = encodeFunctionData({
        abi: NEG_RISK_ADAPTER_ABI,
        functionName: 'redeemPositions',
        args: [
          parsed.conditionId as `0x${string}`,
          parsed.indexSets.map(BigInt),
        ],
      });

      return {
        type: 'CONTRACT_CALL',
        to: target,
        calldata,
        value: '0',
      };
    }

    // Binary: ConditionalTokens.redeemPositions(collateral, parentCollectionId, conditionId, indexSets)
    const calldata = encodeFunctionData({
      abi: CONDITIONAL_TOKENS_ABI,
      functionName: 'redeemPositions',
      args: [
        PM_CONTRACTS.USDC_E,
        PARENT_COLLECTION_ID,
        parsed.conditionId as `0x${string}`,
        parsed.indexSets.map(BigInt),
      ],
    });

    return {
      type: 'CONTRACT_CALL',
      to: target,
      calldata,
      value: '0',
    };
  }

  private resolveSplit(params: Record<string, unknown>): ContractCallRequest {
    const parsed = PmSplitSchema.parse(params);
    const amount = parseUnits(parsed.amount, 6);

    const calldata = encodeFunctionData({
      abi: CONDITIONAL_TOKENS_ABI,
      functionName: 'splitPosition',
      args: [
        PM_CONTRACTS.USDC_E,
        PARENT_COLLECTION_ID,
        parsed.conditionId as `0x${string}`,
        parsed.partition.map(BigInt),
        amount,
      ],
    });

    return {
      type: 'CONTRACT_CALL',
      to: PM_CONTRACTS.CONDITIONAL_TOKENS,
      calldata,
      value: '0',
    };
  }

  private resolveMerge(params: Record<string, unknown>): ContractCallRequest {
    const parsed = PmMergeSchema.parse(params);
    const amount = parseUnits(parsed.amount, 6);

    const calldata = encodeFunctionData({
      abi: CONDITIONAL_TOKENS_ABI,
      functionName: 'mergePositions',
      args: [
        PM_CONTRACTS.USDC_E,
        PARENT_COLLECTION_ID,
        parsed.conditionId as `0x${string}`,
        parsed.partition.map(BigInt),
        amount,
      ],
    });

    return {
      type: 'CONTRACT_CALL',
      to: PM_CONTRACTS.CONDITIONAL_TOKENS,
      calldata,
      value: '0',
    };
  }

  private resolveApproveCollateral(params: Record<string, unknown>): ContractCallRequest {
    const parsed = PmApproveCollateralSchema.parse(params);
    const helper = new PolymarketApproveHelper();
    const req = helper.buildApproveRequest(parsed.isNegRisk, parsed.amount ? parseUnits(parsed.amount, 6) : undefined);

    // Convert ApproveRequest to ContractCallRequest (APPROVE type in pipeline)
    return {
      type: 'CONTRACT_CALL',
      to: req.to,
      calldata: encodeFunctionData({
        abi: parseAbi(['function approve(address spender, uint256 amount) returns (bool)']),
        functionName: 'approve',
        args: [req.spender, req.amount],
      }),
      value: '0',
    };
  }

  private resolveApproveCTF(params: Record<string, unknown>): ContractCallRequest {
    const parsed = PmApproveCtfSchema.parse(params);
    const exchange = NegRiskRouter.getApproveTarget(parsed.isNegRisk);

    const calldata = encodeFunctionData({
      abi: ERC1155_ABI,
      functionName: 'setApprovalForAll',
      args: [exchange, true],
    });

    return {
      type: 'CONTRACT_CALL',
      to: PM_CONTRACTS.CONDITIONAL_TOKENS,
      calldata,
      value: '0',
    };
  }
}
