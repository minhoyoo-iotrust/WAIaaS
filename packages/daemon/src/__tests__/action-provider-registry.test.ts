/**
 * ActionProviderRegistry unit tests.
 *
 * Tests cover:
 * a. register -- valid provider registration
 * b. register -- name conflict rejection (ACTION_NAME_CONFLICT)
 * c. register -- metadata validation failure
 * d. register -- inputSchema duck-typing failure
 * e. unregister -- registered provider removal
 * f. unregister -- unregistered provider returns false
 * g. getProvider -- lookup by name
 * h. getAction -- lookup by providerName/actionName key
 * i. listProviders -- all provider metadata
 * j. listActions -- filter by provider name
 * k. getMcpExposedActions -- mcpExpose=true only
 * l. executeResolve -- normal execution with ContractCallRequestSchema validation
 * m. executeResolve -- ACTION_NOT_FOUND for unknown key
 * n. executeResolve -- ACTION_VALIDATION_FAILED for bad input
 * o. executeResolve -- ACTION_RETURN_INVALID for bad resolve() return value
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ActionProviderRegistry } from '../infrastructure/action/action-provider-registry.js';
import type {
  IActionProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ContractCallRequest,
} from '@waiaas/core';

// ---------------------------------------------------------------------------
// Test helpers: create mock providers
// ---------------------------------------------------------------------------

const swapInputSchema = z.object({
  tokenIn: z.string(),
  tokenOut: z.string(),
  amount: z.string(),
});

function createMockProvider(
  overrides?: Partial<{
    name: string;
    mcpExpose: boolean;
    requiresApiKey: boolean;
    chains: ('solana' | 'ethereum')[];
    actions: ActionDefinition[];
    resolveReturn: ContractCallRequest;
  }>,
): IActionProvider {
  const name = overrides?.name ?? 'test_provider';
  const resolveReturn: ContractCallRequest = overrides?.resolveReturn ?? {
    type: 'CONTRACT_CALL' as const,
    to: '0x1234567890abcdef1234567890abcdef12345678',
    calldata: '0xdeadbeef',
    value: '0',
  };

  const actions: ActionDefinition[] = overrides?.actions ?? [
    {
      name: 'swap_tokens',
      description: 'Swap one token for another on a DEX',
      chain: 'ethereum',
      inputSchema: swapInputSchema,
      riskLevel: 'medium',
      defaultTier: 'NOTIFY',
    },
  ];

  const metadata: ActionProviderMetadata = {
    name,
    description: 'A test action provider for unit tests',
    version: '1.0.0',
    chains: overrides?.chains ?? ['ethereum'],
    mcpExpose: overrides?.mcpExpose ?? false,
    requiresApiKey: overrides?.requiresApiKey ?? false,
    requiredApis: [],
  };

  return {
    metadata,
    actions,
    resolve: vi.fn().mockResolvedValue(resolveReturn),
  };
}

const validContext: ActionContext = {
  walletAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
  chain: 'ethereum',
  walletId: '550e8400-e29b-41d4-a716-446655440000',
  sessionId: '660e8400-e29b-41d4-a716-446655440001',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActionProviderRegistry', () => {
  // (a) register -- valid provider
  it('registers a valid provider successfully', () => {
    const registry = new ActionProviderRegistry();
    const provider = createMockProvider();

    expect(() => registry.register(provider)).not.toThrow();
    expect(registry.getProvider('test_provider')).toBe(provider);
  });

  // (b) register -- name conflict
  it('rejects duplicate provider name with ACTION_NAME_CONFLICT', () => {
    const registry = new ActionProviderRegistry();
    const provider1 = createMockProvider();
    const provider2 = createMockProvider();

    registry.register(provider1);
    expect(() => registry.register(provider2)).toThrow(
      expect.objectContaining({ code: 'ACTION_NAME_CONFLICT' }),
    );
  });

  // (c) register -- metadata validation failure
  it('rejects provider with invalid metadata', () => {
    const registry = new ActionProviderRegistry();
    const provider = createMockProvider();
    // Corrupt metadata: name too short
    (provider as any).metadata = {
      ...provider.metadata,
      name: 'ab', // min 3 chars
    };

    expect(() => registry.register(provider)).toThrow();
  });

  // (c2) register -- metadata invalid version format
  it('rejects provider with invalid version format', () => {
    const registry = new ActionProviderRegistry();
    const provider = createMockProvider();
    (provider as any).metadata = {
      ...provider.metadata,
      version: 'invalid',
    };

    expect(() => registry.register(provider)).toThrow();
  });

  // (d) register -- inputSchema duck-typing failure
  it('rejects action with missing inputSchema.parse()', () => {
    const registry = new ActionProviderRegistry();
    const provider = createMockProvider({
      actions: [
        {
          name: 'bad_action',
          description: 'An action with broken inputSchema for testing',
          chain: 'ethereum',
          inputSchema: { /* no parse or safeParse */ },
          riskLevel: 'low',
          defaultTier: 'INSTANT',
        },
      ],
    });

    expect(() => registry.register(provider)).toThrow(
      expect.objectContaining({ code: 'ACTION_VALIDATION_FAILED' }),
    );
  });

  // (e) unregister -- removes provider and actions
  it('unregisters a provider and removes all its actions', () => {
    const registry = new ActionProviderRegistry();
    const provider = createMockProvider();
    registry.register(provider);

    expect(registry.unregister('test_provider')).toBe(true);
    expect(registry.getProvider('test_provider')).toBeUndefined();
    expect(registry.getAction('test_provider/swap_tokens')).toBeUndefined();
  });

  // (f) unregister -- unregistered provider returns false
  it('returns false when unregistering a non-existent provider', () => {
    const registry = new ActionProviderRegistry();
    expect(registry.unregister('nonexistent')).toBe(false);
  });

  // (g) getProvider -- lookup by name
  it('getProvider returns the registered provider', () => {
    const registry = new ActionProviderRegistry();
    const provider = createMockProvider();
    registry.register(provider);

    const result = registry.getProvider('test_provider');
    expect(result).toBe(provider);
    expect(result?.metadata.name).toBe('test_provider');
  });

  // (g2) getProvider -- returns undefined for unknown
  it('getProvider returns undefined for unknown name', () => {
    const registry = new ActionProviderRegistry();
    expect(registry.getProvider('unknown')).toBeUndefined();
  });

  // (h) getAction -- providerName/actionName key
  it('getAction returns action by providerName/actionName key', () => {
    const registry = new ActionProviderRegistry();
    const provider = createMockProvider();
    registry.register(provider);

    const entry = registry.getAction('test_provider/swap_tokens');
    expect(entry).toBeDefined();
    expect(entry!.provider).toBe(provider);
    expect(entry!.action.name).toBe('swap_tokens');
  });

  // (h2) getAction -- returns undefined for unknown key
  it('getAction returns undefined for unknown key', () => {
    const registry = new ActionProviderRegistry();
    expect(registry.getAction('unknown/action')).toBeUndefined();
  });

  // (i) listProviders -- all metadata
  it('listProviders returns metadata for all registered providers', () => {
    const registry = new ActionProviderRegistry();
    registry.register(createMockProvider({ name: 'provider_aaa' }));
    registry.register(createMockProvider({ name: 'provider_bbb' }));

    const list = registry.listProviders();
    expect(list).toHaveLength(2);
    expect(list.map((m) => m.name).sort()).toEqual([
      'provider_aaa',
      'provider_bbb',
    ]);
  });

  // (j) listActions -- filter by provider
  it('listActions filters by provider name', () => {
    const registry = new ActionProviderRegistry();
    registry.register(createMockProvider({ name: 'provider_aaa' }));
    registry.register(createMockProvider({ name: 'provider_bbb' }));

    const allActions = registry.listActions();
    expect(allActions).toHaveLength(2);

    const filtered = registry.listActions('provider_aaa');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].providerName).toBe('provider_aaa');
  });

  // (k) getMcpExposedActions -- mcpExpose=true only
  it('getMcpExposedActions returns only actions from mcpExpose=true providers', () => {
    const registry = new ActionProviderRegistry();
    registry.register(
      createMockProvider({ name: 'exposed_one', mcpExpose: true }),
    );
    registry.register(
      createMockProvider({ name: 'hidden_one', mcpExpose: false }),
    );

    const exposed = registry.getMcpExposedActions();
    expect(exposed).toHaveLength(1);
    expect(exposed[0].provider.metadata.name).toBe('exposed_one');
  });

  // (l) executeResolve -- normal execution
  it('executeResolve calls resolve() and validates return with ContractCallRequestSchema', async () => {
    const registry = new ActionProviderRegistry();
    const provider = createMockProvider();
    registry.register(provider);

    const result = await registry.executeResolve(
      'test_provider/swap_tokens',
      { tokenIn: 'USDC', tokenOut: 'WETH', amount: '1000000' },
      validContext,
    );

    expect(result.type).toBe('CONTRACT_CALL');
    expect(result.to).toBe('0x1234567890abcdef1234567890abcdef12345678');
    expect(provider.resolve).toHaveBeenCalledWith(
      'swap_tokens',
      { tokenIn: 'USDC', tokenOut: 'WETH', amount: '1000000' },
      validContext,
    );
  });

  // (m) executeResolve -- ACTION_NOT_FOUND
  it('executeResolve throws ACTION_NOT_FOUND for unknown action key', async () => {
    const registry = new ActionProviderRegistry();

    await expect(
      registry.executeResolve('nonexistent/action', {}, validContext),
    ).rejects.toThrow(
      expect.objectContaining({ code: 'ACTION_NOT_FOUND' }),
    );
  });

  // (n) executeResolve -- ACTION_VALIDATION_FAILED
  it('executeResolve throws ACTION_VALIDATION_FAILED for invalid input', async () => {
    const registry = new ActionProviderRegistry();
    const provider = createMockProvider();
    registry.register(provider);

    await expect(
      registry.executeResolve(
        'test_provider/swap_tokens',
        { /* missing required fields */ },
        validContext,
      ),
    ).rejects.toThrow(
      expect.objectContaining({ code: 'ACTION_VALIDATION_FAILED' }),
    );
  });

  // (o) executeResolve -- ACTION_RETURN_INVALID
  it('executeResolve throws ACTION_RETURN_INVALID when resolve() returns invalid data', async () => {
    const registry = new ActionProviderRegistry();
    const provider = createMockProvider({
      resolveReturn: { invalid: 'data' } as any,
    });
    registry.register(provider);

    await expect(
      registry.executeResolve(
        'test_provider/swap_tokens',
        { tokenIn: 'USDC', tokenOut: 'WETH', amount: '1000000' },
        validContext,
      ),
    ).rejects.toThrow(
      expect.objectContaining({ code: 'ACTION_RETURN_INVALID' }),
    );
  });

  // Additional: multiple actions per provider
  it('registers provider with multiple actions', () => {
    const registry = new ActionProviderRegistry();
    const provider = createMockProvider({
      name: 'multi_action',
      actions: [
        {
          name: 'action_one',
          description: 'First test action with multiple params',
          chain: 'ethereum',
          inputSchema: z.object({ x: z.string() }),
          riskLevel: 'low',
          defaultTier: 'INSTANT',
        },
        {
          name: 'action_two',
          description: 'Second test action with different schema',
          chain: 'ethereum',
          inputSchema: z.object({ y: z.number() }),
          riskLevel: 'high',
          defaultTier: 'APPROVAL',
        },
      ],
    });

    registry.register(provider);
    expect(registry.getAction('multi_action/action_one')).toBeDefined();
    expect(registry.getAction('multi_action/action_two')).toBeDefined();
    expect(registry.listActions('multi_action')).toHaveLength(2);
  });

  // Additional: requiresApiKey flag preserved
  it('preserves requiresApiKey metadata flag', () => {
    const registry = new ActionProviderRegistry();
    const provider = createMockProvider({
      name: 'keyed_provider',
      requiresApiKey: true,
    });
    registry.register(provider);

    const meta = registry.listProviders();
    expect(meta[0].requiresApiKey).toBe(true);
  });
});
