/**
 * Lido Staking integration tests.
 *
 * Tests cover the full integration path:
 * 1. registerBuiltInProviders() registration + settings toggle
 * 2. Environment-based address switching (mainnet vs Holesky testnet)
 * 3. Admin Settings address override
 * 4. Provider-trust auto-tagging via executeResolve()
 * 5. Stake value field for SPENDING_LIMIT policy evaluation
 * 6. Unstake multi-step (approve + requestWithdrawals) output
 */
import { describe, it, expect } from 'vitest';
import { ActionProviderRegistry } from '../infrastructure/action/action-provider-registry.js';
import {
  registerBuiltInProviders,
  LIDO_MAINNET_ADDRESSES,
  LIDO_TESTNET_ADDRESSES,
} from '@waiaas/actions';
import type { ActionContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeSettingsReader = (overrides: Record<string, string> = {}) => {
  const defaults: Record<string, string> = {
    'actions.lido_staking_enabled': 'false',
    'actions.lido_staking_steth_address': '',
    'actions.lido_staking_withdrawal_queue_address': '',
    // Disable other providers to prevent interference
    'actions.jupiter_swap_enabled': 'false',
    'actions.zerox_swap_enabled': 'false',
    'actions.lifi_enabled': 'false',
  };
  const data = { ...defaults, ...overrides };
  return { get: (key: string) => data[key] ?? '' };
};

const validContext: ActionContext = {
  walletAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
  chain: 'ethereum',
  walletId: '550e8400-e29b-41d4-a716-446655440000',
  sessionId: '660e8400-e29b-41d4-a716-446655440001',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Lido Staking integration', () => {
  // 1. Registration via registerBuiltInProviders
  describe('registration via registerBuiltInProviders', () => {
    it('registers lido_staking when actions.lido_staking_enabled is true', () => {
      const registry = new ActionProviderRegistry();
      const reader = makeSettingsReader({
        'actions.lido_staking_enabled': 'true',
      });

      const { loaded, skipped } = registerBuiltInProviders(registry, reader);

      expect(loaded).toContain('lido_staking');
      expect(skipped).not.toContain('lido_staking');
      expect(registry.getProvider('lido_staking')).toBeDefined();
      expect(registry.listActions('lido_staking')).toHaveLength(2);
    });
  });

  // 2. Disabled via settings
  describe('disabled via settings', () => {
    it('skips lido_staking when actions.lido_staking_enabled is false', () => {
      const registry = new ActionProviderRegistry();
      const reader = makeSettingsReader({
        'actions.lido_staking_enabled': 'false',
      });

      const { loaded, skipped } = registerBuiltInProviders(registry, reader);

      expect(skipped).toContain('lido_staking');
      expect(loaded).not.toContain('lido_staking');
      expect(registry.getProvider('lido_staking')).toBeUndefined();
    });
  });

  // 3. Environment address switching
  describe('environment address switching', () => {
    it('uses Holesky testnet addresses via Admin Settings override', async () => {
      const registry = new ActionProviderRegistry();
      const reader = makeSettingsReader({
        'actions.lido_staking_enabled': 'true',
        // Admin Settings address override takes priority over environment defaults
        'actions.lido_staking_steth_address': LIDO_TESTNET_ADDRESSES.stethAddress,
        'actions.lido_staking_withdrawal_queue_address': LIDO_TESTNET_ADDRESSES.withdrawalQueueAddress,
      });

      registerBuiltInProviders(registry, reader);

      // Resolve stake action -> ContractCallRequest.to should be Holesky stETH
      const results = await registry.executeResolve(
        'lido_staking/stake',
        { amount: '1.0' },
        validContext,
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.to).toBe(LIDO_TESTNET_ADDRESSES.stethAddress);
    });

    it('uses mainnet addresses when environment is mainnet', async () => {
      const registry = new ActionProviderRegistry();
      const reader = makeSettingsReader({
        'actions.lido_staking_enabled': 'true',
      });

      registerBuiltInProviders(registry, reader);

      const results = await registry.executeResolve(
        'lido_staking/stake',
        { amount: '1.0' },
        validContext,
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.to).toBe(LIDO_MAINNET_ADDRESSES.stethAddress);
    });
  });

  // 4. Admin override address
  describe('admin override address', () => {
    it('uses custom stETH address when set via Admin Settings', async () => {
      const customSteth = '0xCustomStethAddress000000000000000000000001';
      const registry = new ActionProviderRegistry();
      const reader = makeSettingsReader({
        'actions.lido_staking_enabled': 'true',
        'actions.lido_staking_steth_address': customSteth,
      });

      registerBuiltInProviders(registry, reader);

      const results = await registry.executeResolve(
        'lido_staking/stake',
        { amount: '1.0' },
        validContext,
      );

      expect(results[0]!.to).toBe(customSteth);
    });
  });

  // 5. Provider-trust auto-tag (executeResolve)
  describe('provider-trust auto-tag', () => {
    it('auto-tags ContractCallRequest with actionProvider=lido_staking', async () => {
      const registry = new ActionProviderRegistry();
      const reader = makeSettingsReader({
        'actions.lido_staking_enabled': 'true',
      });

      registerBuiltInProviders(registry, reader);

      const results = await registry.executeResolve(
        'lido_staking/stake',
        { amount: '1.0' },
        validContext,
      );

      for (const req of results) {
        expect(req.actionProvider).toBe('lido_staking');
      }
    });
  });

  // 6. Stake value flows to policy evaluation
  describe('stake value for policy evaluation', () => {
    it('stake with 2.0 ETH has value field set to 2000000000000000000 wei', async () => {
      const registry = new ActionProviderRegistry();
      const reader = makeSettingsReader({
        'actions.lido_staking_enabled': 'true',
      });

      registerBuiltInProviders(registry, reader);

      const results = await registry.executeResolve(
        'lido_staking/stake',
        { amount: '2.0' },
        validContext,
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.value).toBe('2000000000000000000');
      expect(results[0]!.type).toBe('CONTRACT_CALL');
    });
  });

  // 7. Unstake produces approve + requestWithdrawals
  describe('unstake multi-step output', () => {
    it('returns 2 elements: approve + requestWithdrawals with correct selectors', async () => {
      const registry = new ActionProviderRegistry();
      const reader = makeSettingsReader({
        'actions.lido_staking_enabled': 'true',
      });

      registerBuiltInProviders(registry, reader);

      const results = await registry.executeResolve(
        'lido_staking/unstake',
        { amount: '1.0' },
        validContext,
      );

      expect(results).toHaveLength(2);

      // First element: approve calldata (selector 0x095ea7b3), to = stETH address
      expect(results[0]!.calldata).toMatch(/^0x095ea7b3/);
      expect(results[0]!.to).toBe(LIDO_MAINNET_ADDRESSES.stethAddress);
      expect(results[0]!.actionProvider).toBe('lido_staking');

      // Second element: requestWithdrawals calldata (selector 0xd669a4e2), to = withdrawal queue
      expect(results[1]!.calldata).toMatch(/^0xd669a4e2/);
      expect(results[1]!.to).toBe(LIDO_MAINNET_ADDRESSES.withdrawalQueueAddress);
      expect(results[1]!.actionProvider).toBe('lido_staking');
    });
  });
});
