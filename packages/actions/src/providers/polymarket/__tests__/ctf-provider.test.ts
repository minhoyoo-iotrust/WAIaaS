/**
 * Tests for PolymarketCtfProvider.
 *
 * @see design doc 80, Section 7.2
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { decodeFunctionData, parseAbi } from 'viem';
import { PolymarketCtfProvider } from '../ctf-provider.js';
import { PM_CONTRACTS } from '../config.js';
import type { ActionContext, ContractCallRequest } from '@waiaas/core';

// ---------------------------------------------------------------------------
// ABI for decoding
// ---------------------------------------------------------------------------

const CT_ABI = parseAbi([
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)',
  'function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)',
  'function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)',
]);

const NRA_ABI = parseAbi([
  'function redeemPositions(bytes32 conditionId, uint256[] indexSets)',
]);

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
]);

const ERC1155_ABI = parseAbi([
  'function setApprovalForAll(address operator, bool approved)',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONTEXT: ActionContext = {
  walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
  chain: 'ethereum',
  walletId: 'wallet-1',
};

const CONDITION_ID = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
const PARENT_COLLECTION = '0x0000000000000000000000000000000000000000000000000000000000000000';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PolymarketCtfProvider', () => {
  let provider: PolymarketCtfProvider;

  beforeEach(() => {
    provider = new PolymarketCtfProvider();
  });

  describe('metadata', () => {
    it('has correct provider metadata', () => {
      expect(provider.metadata.name).toBe('polymarket_ctf');
      expect(provider.metadata.requiresSigningKey).toBe(false);
      expect(provider.metadata.mcpExpose).toBe(true);
    });

    it('exposes 5 actions', () => {
      expect(provider.actions).toHaveLength(5);
      const names = provider.actions.map((a) => a.name);
      expect(names).toContain('pm_redeem_positions');
      expect(names).toContain('pm_split_position');
      expect(names).toContain('pm_merge_positions');
      expect(names).toContain('pm_approve_collateral');
      expect(names).toContain('pm_approve_ctf');
    });
  });

  describe('pm_redeem_positions (binary)', () => {
    it('targets CONDITIONAL_TOKENS with collateral arg', async () => {
      const result = await provider.resolve(
        'pm_redeem_positions',
        { conditionId: CONDITION_ID, isNegRisk: false },
        CONTEXT,
      ) as ContractCallRequest;

      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.to).toBe(PM_CONTRACTS.CONDITIONAL_TOKENS);
      expect(result.value).toBe('0');

      // Decode and verify args
      const decoded = decodeFunctionData({ abi: CT_ABI, data: result.calldata! as `0x${string}` });
      expect(decoded.functionName).toBe('redeemPositions');
      expect(decoded.args[0]).toBe(PM_CONTRACTS.USDC_E); // collateralToken
      expect(decoded.args[1]).toBe(PARENT_COLLECTION); // parentCollectionId
      expect(decoded.args[2]).toBe(CONDITION_ID); // conditionId
      expect(decoded.args[3]).toEqual([1n, 2n]); // default indexSets
    });
  });

  describe('pm_redeem_positions (neg risk)', () => {
    it('targets NEG_RISK_ADAPTER without collateral arg', async () => {
      const result = await provider.resolve(
        'pm_redeem_positions',
        { conditionId: CONDITION_ID, isNegRisk: true },
        CONTEXT,
      ) as ContractCallRequest;

      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.to).toBe(PM_CONTRACTS.NEG_RISK_ADAPTER);

      // Decode and verify args (no collateral for neg risk)
      const decoded = decodeFunctionData({ abi: NRA_ABI, data: result.calldata! as `0x${string}` });
      expect(decoded.functionName).toBe('redeemPositions');
      expect(decoded.args[0]).toBe(CONDITION_ID); // conditionId
      expect(decoded.args[1]).toEqual([1n, 2n]); // default indexSets
    });
  });

  describe('pm_split_position', () => {
    it('encodes correct ABI with USDC.e 6 decimal amount', async () => {
      const result = await provider.resolve(
        'pm_split_position',
        { conditionId: CONDITION_ID, amount: '10.5' },
        CONTEXT,
      ) as ContractCallRequest;

      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.to).toBe(PM_CONTRACTS.CONDITIONAL_TOKENS);

      const decoded = decodeFunctionData({ abi: CT_ABI, data: result.calldata! as `0x${string}` });
      expect(decoded.functionName).toBe('splitPosition');
      expect(decoded.args[0]).toBe(PM_CONTRACTS.USDC_E); // collateralToken
      expect(decoded.args[1]).toBe(PARENT_COLLECTION); // parentCollectionId
      expect(decoded.args[2]).toBe(CONDITION_ID); // conditionId
      expect(decoded.args[3]).toEqual([1n, 2n]); // default partition
      expect(decoded.args[4]).toBe(10_500_000n); // 10.5 * 10^6
    });
  });

  describe('pm_merge_positions', () => {
    it('encodes correct ABI with amount', async () => {
      const result = await provider.resolve(
        'pm_merge_positions',
        { conditionId: CONDITION_ID, amount: '25' },
        CONTEXT,
      ) as ContractCallRequest;

      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.to).toBe(PM_CONTRACTS.CONDITIONAL_TOKENS);

      const decoded = decodeFunctionData({ abi: CT_ABI, data: result.calldata! as `0x${string}` });
      expect(decoded.functionName).toBe('mergePositions');
      expect(decoded.args[4]).toBe(25_000_000n); // 25 * 10^6
    });
  });

  describe('pm_approve_collateral', () => {
    it('returns approve call to correct exchange (binary)', async () => {
      const result = await provider.resolve(
        'pm_approve_collateral',
        { isNegRisk: false },
        CONTEXT,
      ) as ContractCallRequest;

      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.to).toBe(PM_CONTRACTS.USDC_E);

      const decoded = decodeFunctionData({ abi: ERC20_ABI, data: result.calldata! as `0x${string}` });
      expect(decoded.functionName).toBe('approve');
      expect(decoded.args[0]).toBe(PM_CONTRACTS.CTF_EXCHANGE); // spender
      expect(decoded.args[1]).toBe(2n ** 256n - 1n); // MaxUint256
    });

    it('returns approve to neg risk exchange when isNegRisk=true', async () => {
      const result = await provider.resolve(
        'pm_approve_collateral',
        { isNegRisk: true },
        CONTEXT,
      ) as ContractCallRequest;

      const decoded = decodeFunctionData({ abi: ERC20_ABI, data: result.calldata! as `0x${string}` });
      expect(decoded.args[0]).toBe(PM_CONTRACTS.NEG_RISK_CTF_EXCHANGE);
    });
  });

  describe('pm_approve_ctf', () => {
    it('returns setApprovalForAll call on CONDITIONAL_TOKENS', async () => {
      const result = await provider.resolve(
        'pm_approve_ctf',
        { isNegRisk: false },
        CONTEXT,
      ) as ContractCallRequest;

      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.to).toBe(PM_CONTRACTS.CONDITIONAL_TOKENS);

      const decoded = decodeFunctionData({ abi: ERC1155_ABI, data: result.calldata! as `0x${string}` });
      expect(decoded.functionName).toBe('setApprovalForAll');
      expect(decoded.args[0]).toBe(PM_CONTRACTS.CTF_EXCHANGE); // operator
      expect(decoded.args[1]).toBe(true); // approved
    });

    it('approves for neg risk exchange when isNegRisk=true', async () => {
      const result = await provider.resolve(
        'pm_approve_ctf',
        { isNegRisk: true },
        CONTEXT,
      ) as ContractCallRequest;

      const decoded = decodeFunctionData({ abi: ERC1155_ABI, data: result.calldata! as `0x${string}` });
      expect(decoded.args[0]).toBe(PM_CONTRACTS.NEG_RISK_CTF_EXCHANGE);
    });
  });

  describe('getSpendingAmount', () => {
    it('returns parsed amount for pm_split_position', async () => {
      const result = await provider.getSpendingAmount!(
        'pm_split_position',
        { conditionId: CONDITION_ID, amount: '100' },
      );
      expect(result.amount).toBe(100_000_000n); // 100 * 10^6
      expect(result.asset).toBe(PM_CONTRACTS.USDC_E);
    });

    it('returns 0 for pm_redeem_positions', async () => {
      const result = await provider.getSpendingAmount!(
        'pm_redeem_positions',
        { conditionId: CONDITION_ID },
      );
      expect(result.amount).toBe(0n);
    });

    it('returns 0 for pm_merge_positions', async () => {
      const result = await provider.getSpendingAmount!(
        'pm_merge_positions',
        { conditionId: CONDITION_ID, amount: '50' },
      );
      expect(result.amount).toBe(0n);
    });

    it('returns 0 for pm_approve_collateral', async () => {
      const result = await provider.getSpendingAmount!(
        'pm_approve_collateral',
        { isNegRisk: false },
      );
      expect(result.amount).toBe(0n);
    });
  });

  describe('unknown action', () => {
    it('throws ChainError for unknown action name', async () => {
      await expect(
        provider.resolve('pm_unknown', {}, CONTEXT),
      ).rejects.toThrow(/Unknown CTF action/);
    });
  });
});
