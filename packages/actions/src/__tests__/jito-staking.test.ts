/**
 * JitoStakingActionProvider unit tests.
 *
 * Pure SPL Stake Pool instruction encoding tests -- no MSW needed (no external API calls).
 */
import { describe, it, expect } from 'vitest';
import { JitoStakingActionProvider } from '../providers/jito-staking/index.js';
import { JITO_MAINNET_ADDRESSES } from '../providers/jito-staking/config.js';
import type { ActionContext, ContractCallRequest } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Test context
// ---------------------------------------------------------------------------

const CONTEXT: ActionContext = {
  walletAddress: 'So11111111111111111111111111111111111111112',
  chain: 'solana',
  walletId: '00000000-0000-0000-0000-000000000001',
};

// ---------------------------------------------------------------------------
// Helper to decode base64 instruction data
// ---------------------------------------------------------------------------

function decodeInstructionData(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

function readLEu64(bytes: Uint8Array, offset: number): bigint {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getBigUint64(offset, true);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JitoStakingActionProvider', () => {
  describe('stake returns ContractCallRequest with Solana fields', () => {
    it('type=CONTRACT_CALL, programId=SPL_STAKE_POOL, instructionData and accounts present', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('stake', { amount: '1.0' }, CONTEXT);

      const req = result as ContractCallRequest;
      expect(req.type).toBe('CONTRACT_CALL');
      expect(req.programId).toBe(JITO_MAINNET_ADDRESSES.stakePoolProgram);
      expect(req.instructionData).toBeTruthy();
      expect(req.accounts).toBeTruthy();
      expect(Array.isArray(req.accounts)).toBe(true);
      expect(req.accounts!.length).toBe(10);
    });
  });

  describe('stake instructionData starts with DepositSol index (14)', () => {
    it('first byte of decoded base64 is 14', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('stake', { amount: '1.0' }, CONTEXT);

      const req = result as ContractCallRequest;
      const data = decodeInstructionData(req.instructionData!);
      expect(data[0]).toBe(14);
    });
  });

  describe('unstake returns ContractCallRequest with Solana fields', () => {
    it('type=CONTRACT_CALL, programId, instructionData, accounts present', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('unstake', { amount: '1.0' }, CONTEXT);

      const req = result as ContractCallRequest;
      expect(req.type).toBe('CONTRACT_CALL');
      expect(req.programId).toBe(JITO_MAINNET_ADDRESSES.stakePoolProgram);
      expect(req.instructionData).toBeTruthy();
      expect(req.accounts).toBeTruthy();
      expect(Array.isArray(req.accounts)).toBe(true);
      expect(req.accounts!.length).toBe(12);
    });
  });

  describe('unstake instructionData starts with WithdrawSol index (16)', () => {
    it('first byte of decoded base64 is 16', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('unstake', { amount: '1.0' }, CONTEXT);

      const req = result as ContractCallRequest;
      const data = decodeInstructionData(req.instructionData!);
      expect(data[0]).toBe(16);
    });
  });

  describe('stake amount "1.0" encodes 1000000000 lamports in instructionData', () => {
    it('decode LE u64 from bytes 1-8 = 1000000000', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('stake', { amount: '1.0' }, CONTEXT);

      const req = result as ContractCallRequest;
      const data = decodeInstructionData(req.instructionData!);
      const amount = readLEu64(data, 1);
      expect(amount).toBe(1000000000n);
    });
  });

  describe('zero amount throws', () => {
    it('amount "0" throws "Amount must be greater than 0"', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true });
      await expect(
        provider.resolve('stake', { amount: '0' }, CONTEXT),
      ).rejects.toThrow('Amount must be greater than 0');
    });
  });

  describe('unknown action throws', () => {
    it('throws for unknown action name', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true });
      await expect(
        provider.resolve('unknown_action', { amount: '1.0' }, CONTEXT),
      ).rejects.toThrow('Unknown action');
    });
  });

  describe('metadata', () => {
    it('has correct name, chains, mcpExpose', () => {
      const provider = new JitoStakingActionProvider({ enabled: true });
      expect(provider.metadata.name).toBe('jito_staking');
      expect(provider.metadata.chains).toEqual(['solana']);
      expect(provider.metadata.mcpExpose).toBe(true);
      expect(provider.metadata.requiresApiKey).toBe(false);
      expect(provider.metadata.requiredApis).toEqual([]);
      expect(provider.metadata.version).toBe('1.0.0');
      expect(provider.actions).toHaveLength(2);

      const [stake, unstake] = provider.actions;
      expect(stake!.name).toBe('stake');
      expect(stake!.riskLevel).toBe('medium');
      expect(stake!.defaultTier).toBe('DELAY');
      expect(unstake!.name).toBe('unstake');
      expect(unstake!.riskLevel).toBe('medium');
      expect(unstake!.defaultTier).toBe('DELAY');
    });
  });

  describe('stake decimal "0.5" SOL encodes 500000000 lamports', () => {
    it('verify precise conversion', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('stake', { amount: '0.5' }, CONTEXT);

      const req = result as ContractCallRequest;
      const data = decodeInstructionData(req.instructionData!);
      const amount = readLEu64(data, 1);
      expect(amount).toBe(500000000n);
    });
  });

  describe('stake accounts include wallet as signer', () => {
    it('accounts array has wallet address as signer', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('stake', { amount: '1.0' }, CONTEXT);

      const req = result as ContractCallRequest;
      const walletAccount = req.accounts!.find(
        (a) => a.pubkey === CONTEXT.walletAddress && a.isSigner,
      );
      expect(walletAccount).toBeDefined();
      expect(walletAccount!.isWritable).toBe(true);
    });
  });

  describe('unstake accounts include wallet as signer', () => {
    it('accounts array has wallet address as signer', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('unstake', { amount: '1.0' }, CONTEXT);

      const req = result as ContractCallRequest;
      const walletAccount = req.accounts!.find(
        (a) => a.pubkey === CONTEXT.walletAddress && a.isSigner,
      );
      expect(walletAccount).toBeDefined();
    });
  });

  describe('INSUFFICIENT_BALANCE: large amount is faithfully encoded', () => {
    it('999999999.0 SOL encodes faithfully for pipeline balance check', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('stake', { amount: '999999999.0' }, CONTEXT);

      const req = result as ContractCallRequest;
      // Verify the value field carries the lamport amount for pipeline Stage 3 balance check
      expect(req.value).toBe('999999999000000000');

      // Also verify the instruction data carries the same amount
      const data = decodeInstructionData(req.instructionData!);
      const amount = readLEu64(data, 1);
      expect(amount).toBe(999999999000000000n);
    });
  });
});
