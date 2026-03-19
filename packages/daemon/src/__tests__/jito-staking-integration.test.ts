/**
 * Jito Staking integration tests.
 *
 * Tests cover the full integration path:
 * 1. registerBuiltInProviders() registration + settings toggle
 * 2. Admin Settings address override
 * 3. Default mainnet address fallback
 * 4. Provider-trust auto-tagging via executeResolve()
 * 5. Stake returns ContractCallRequest with Solana fields
 * 6. Unstake returns ContractCallRequest with Solana fields
 * 7. Stake instructionData encodes correct amount in lamports
 * 8. Large amount encoding for INSUFFICIENT_BALANCE pipeline check (JITO-04)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ActionProviderRegistry } from '../infrastructure/action/action-provider-registry.js';
import {
  registerBuiltInProviders,
  JITO_MAINNET_ADDRESSES,
} from '@waiaas/actions';
import type { ActionContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Mock RPC for dynamic stake pool account lookup
// ---------------------------------------------------------------------------

const TEST_RPC_URL = 'https://api.mainnet-beta.solana.com';

function buildFakeStakePoolBuffer(): Buffer {
  const buf = Buffer.alloc(300, 0);
  // Write total_lamports at offset 258 and pool_token_supply at offset 266
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setBigUint64(258, 1_000_000_000_000n, true);
  view.setBigUint64(266, 1_000_000_000_000n, true);
  return buf;
}

function buildStakePoolRpcResponse(): object {
  const buf = buildFakeStakePoolBuffer();
  return {
    jsonrpc: '2.0',
    id: 1,
    result: { value: { data: [buf.toString('base64'), 'base64'], executable: false, lamports: 100000000, owner: 'SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy', rentEpoch: 0 } },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fetchSpy: any;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response(JSON.stringify(buildStakePoolRpcResponse()), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
});
afterEach(() => { fetchSpy?.mockRestore(); });

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeSettingsReader = (overrides: Record<string, string> = {}) => {
  const defaults: Record<string, string> = {
    'actions.jito_staking_enabled': 'false',
    'actions.jito_staking_stake_pool_address': '',
    'actions.jito_staking_jitosol_mint': '',
    'rpc.solana_mainnet': TEST_RPC_URL,
    // Disable other providers to prevent interference
    'actions.jupiter_swap_enabled': 'false',
    'actions.zerox_swap_enabled': 'false',
    'actions.lifi_enabled': 'false',
    'actions.lido_staking_enabled': 'false',
  };
  const data = { ...defaults, ...overrides };
  return { get: (key: string) => data[key] ?? '' };
};

const validContext: ActionContext = {
  walletAddress: 'AaGEDioj2rK7bKnbKN3x64RBjktGGaJd6cM4o7F5bFLe',
  chain: 'solana',
  walletId: '550e8400-e29b-41d4-a716-446655440000',
  sessionId: '660e8400-e29b-41d4-a716-446655440001',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Jito Staking integration', () => {
  // 1. Registration via registerBuiltInProviders
  describe('registration via registerBuiltInProviders', () => {
    it('registers jito_staking when actions.jito_staking_enabled is true', () => {
      const registry = new ActionProviderRegistry();
      const reader = makeSettingsReader({
        'actions.jito_staking_enabled': 'true',
      });

      const { loaded, skipped } = registerBuiltInProviders(registry, reader);

      expect(loaded).toContain('jito_staking');
      expect(skipped).not.toContain('jito_staking');
      expect(registry.getProvider('jito_staking')).toBeDefined();
      expect(registry.listActions('jito_staking')).toHaveLength(2);
    });
  });

  // 2. Disabled via settings
  describe('disabled via settings', () => {
    it('skips jito_staking when actions.jito_staking_enabled is false', () => {
      const registry = new ActionProviderRegistry();
      const reader = makeSettingsReader({
        'actions.jito_staking_enabled': 'false',
      });

      const { loaded, skipped } = registerBuiltInProviders(registry, reader);

      expect(skipped).toContain('jito_staking');
      expect(loaded).not.toContain('jito_staking');
      expect(registry.getProvider('jito_staking')).toBeUndefined();
    });
  });

  // 3. Admin override address
  describe('admin override address', () => {
    it('uses custom stake_pool_address when set via Admin Settings', async () => {
      const customPoolAddress = 'CustomPoolAddr111111111111111111111111111111';
      const registry = new ActionProviderRegistry();
      const reader = makeSettingsReader({
        'actions.jito_staking_enabled': 'true',
        'actions.jito_staking_stake_pool_address': customPoolAddress,
      });

      registerBuiltInProviders(registry, reader);

      const results = await registry.executeResolve(
        'jito_staking/stake',
        { amount: '1.0' },
        validContext,
      );

      expect(results[0]!.to).toBe(customPoolAddress);
    });
  });

  // 4. Default mainnet address when override is empty
  describe('default mainnet address', () => {
    it('uses default mainnet address when override is empty', async () => {
      const registry = new ActionProviderRegistry();
      const reader = makeSettingsReader({
        'actions.jito_staking_enabled': 'true',
      });

      registerBuiltInProviders(registry, reader);

      const results = await registry.executeResolve(
        'jito_staking/stake',
        { amount: '1.0' },
        validContext,
      );

      expect(results[0]!.to).toBe(JITO_MAINNET_ADDRESSES.stakePoolAddress);
    });
  });

  // 5. Provider-trust auto-tag
  describe('provider-trust auto-tag', () => {
    it('auto-tags all results with actionProvider=jito_staking', async () => {
      const registry = new ActionProviderRegistry();
      const reader = makeSettingsReader({
        'actions.jito_staking_enabled': 'true',
      });

      registerBuiltInProviders(registry, reader);

      const results = await registry.executeResolve(
        'jito_staking/stake',
        { amount: '1.0' },
        validContext,
      );

      for (const req of results) {
        expect(req.actionProvider).toBe('jito_staking');
      }
    });
  });

  // 6. Stake returns ContractCallRequest with Solana fields
  describe('stake Solana fields', () => {
    it('returns CONTRACT_CALL with programId, instructionData, and accounts', async () => {
      const registry = new ActionProviderRegistry();
      const reader = makeSettingsReader({
        'actions.jito_staking_enabled': 'true',
      });

      registerBuiltInProviders(registry, reader);

      const results = await registry.executeResolve(
        'jito_staking/stake',
        { amount: '1.0' },
        validContext,
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe('CONTRACT_CALL');
      expect(results[0]!.programId).toBeDefined();
      expect(results[0]!.programId).toBe(JITO_MAINNET_ADDRESSES.stakePoolProgram);
      expect(results[0]!.instructionData).toBeDefined();
      expect(results[0]!.accounts).toBeDefined();
      expect(results[0]!.accounts!.length).toBeGreaterThan(0);
    });
  });

  // 7. Unstake returns ContractCallRequest with Solana fields
  describe('unstake Solana fields', () => {
    it('returns CONTRACT_CALL with different instruction index from stake', async () => {
      const registry = new ActionProviderRegistry();
      const reader = makeSettingsReader({
        'actions.jito_staking_enabled': 'true',
      });

      registerBuiltInProviders(registry, reader);

      const stakeResults = await registry.executeResolve(
        'jito_staking/stake',
        { amount: '1.0' },
        validContext,
      );
      const unstakeResults = await registry.executeResolve(
        'jito_staking/unstake',
        { amount: '1.0' },
        validContext,
      );

      expect(unstakeResults).toHaveLength(1);
      expect(unstakeResults[0]!.type).toBe('CONTRACT_CALL');
      expect(unstakeResults[0]!.programId).toBeDefined();
      expect(unstakeResults[0]!.instructionData).toBeDefined();
      expect(unstakeResults[0]!.accounts).toBeDefined();
      expect(unstakeResults[0]!.accounts!.length).toBeGreaterThan(0);

      // Stake and unstake should have different instructionData (different instruction index)
      expect(unstakeResults[0]!.instructionData).not.toBe(stakeResults[0]!.instructionData);

      // Verify instruction indices: stake=14, unstake=16
      const stakeData = Buffer.from(stakeResults[0]!.instructionData!, 'base64');
      const unstakeData = Buffer.from(unstakeResults[0]!.instructionData!, 'base64');
      expect(stakeData[0]).toBe(14); // DepositSol
      expect(unstakeData[0]).toBe(16); // WithdrawSol
    });
  });

  // 8. Stake instructionData encodes correct amount in lamports
  describe('amount encoding', () => {
    it('stake with 2.0 SOL encodes 2000000000 lamports in LE u64', async () => {
      const registry = new ActionProviderRegistry();
      const reader = makeSettingsReader({
        'actions.jito_staking_enabled': 'true',
      });

      registerBuiltInProviders(registry, reader);

      const results = await registry.executeResolve(
        'jito_staking/stake',
        { amount: '2.0' },
        validContext,
      );

      const instructionData = Buffer.from(results[0]!.instructionData!, 'base64');

      // First byte = 14 (DepositSol instruction index)
      expect(instructionData[0]).toBe(14);

      // Bytes 1-8 as LE u64 = 2_000_000_000 (2 SOL = 2 * 10^9 lamports)
      const view = new DataView(instructionData.buffer, instructionData.byteOffset, instructionData.byteLength);
      const amountLamports = view.getBigUint64(1, true); // little-endian
      expect(amountLamports).toBe(2_000_000_000n);
    });
  });

  // 9. Large amount encoding for INSUFFICIENT_BALANCE pipeline check (JITO-04)
  describe('INSUFFICIENT_BALANCE error propagation (JITO-04)', () => {
    it('faithfully encodes large amount for pipeline Stage 3 balance check', async () => {
      const registry = new ActionProviderRegistry();
      const reader = makeSettingsReader({
        'actions.jito_staking_enabled': 'true',
      });

      registerBuiltInProviders(registry, reader);

      // Use a very large amount -- provider should still encode it correctly.
      // The actual INSUFFICIENT_BALANCE check happens in pipeline Stage 3
      // (SolanaAdapter.getBalance vs requested amount).
      const results = await registry.executeResolve(
        'jito_staking/stake',
        { amount: '999999999.0' },
        validContext,
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe('CONTRACT_CALL');

      // Verify the large amount is faithfully encoded in instructionData
      const instructionData = Buffer.from(results[0]!.instructionData!, 'base64');
      expect(instructionData[0]).toBe(14); // DepositSol

      const view = new DataView(instructionData.buffer, instructionData.byteOffset, instructionData.byteLength);
      const amountLamports = view.getBigUint64(1, true);
      // 999999999 SOL * 10^9 = 999999999000000000 lamports
      expect(amountLamports).toBe(999_999_999_000_000_000n);

      // The value field should also contain the amount (for SPENDING_LIMIT policy)
      expect(results[0]!.value).toBe('999999999000000000');

      // Note: The actual INSUFFICIENT_BALANCE enforcement happens in the
      // transaction pipeline Stage 3 (SolanaAdapter.getBalance check).
      // The provider's role is to faithfully encode the amount so the
      // pipeline CAN enforce the balance check.
    });
  });
});
