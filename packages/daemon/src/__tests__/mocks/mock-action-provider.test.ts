/**
 * MockActionProvider (M10) validation tests.
 *
 * Verifies that MockActionProvider correctly implements IActionProvider,
 * validates action names and input schemas, supports test helpers for
 * configurable results/errors, and exposes vi.fn() call tracking.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { z, ZodError } from 'zod';
import {
  ActionProviderMetadataSchema,
  ActionDefinitionSchema,
} from '@waiaas/core';
import type { IActionProvider, ActionContext, ContractCallRequest } from '@waiaas/core';
import { MockActionProvider, createMockActionProvider } from './mock-action-provider.js';

describe('MockActionProvider (M10)', () => {
  let provider: MockActionProvider;

  const context: ActionContext = {
    walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
    chain: 'ethereum',
    walletId: 'test-wallet-id',
    sessionId: 'test-session-id',
  };

  beforeEach(() => {
    provider = createMockActionProvider();
  });

  // -------------------------------------------------------------------------
  // Interface compliance
  // -------------------------------------------------------------------------

  it('implements IActionProvider interface', () => {
    const iface: IActionProvider = provider;
    expect(iface.metadata).toBeDefined();
    expect(iface.actions).toBeDefined();
    expect(typeof iface.resolve).toBe('function');
  });

  // -------------------------------------------------------------------------
  // metadata
  // -------------------------------------------------------------------------

  it('metadata satisfies ActionProviderMetadata schema', () => {
    const parsed = ActionProviderMetadataSchema.safeParse(provider.metadata);
    expect(parsed.success).toBe(true);
  });

  it('metadata defaults are sensible', () => {
    expect(provider.metadata.name).toBe('mock_provider');
    expect(provider.metadata.version).toBe('1.0.0');
    expect(provider.metadata.chains).toContain('ethereum');
    expect(provider.metadata.mcpExpose).toBe(false);
    expect(provider.metadata.requiresApiKey).toBe(false);
  });

  it('metadata can be customized via constructor', () => {
    const custom = createMockActionProvider({
      metadata: { name: 'custom_swap', chains: ['solana'], mcpExpose: true },
    });
    expect(custom.metadata.name).toBe('custom_swap');
    expect(custom.metadata.chains).toContain('solana');
    expect(custom.metadata.mcpExpose).toBe(true);
    // Non-overridden fields use defaults
    expect(custom.metadata.version).toBe('1.0.0');
  });

  // -------------------------------------------------------------------------
  // actions
  // -------------------------------------------------------------------------

  it('actions returns a readonly ActionDefinition array', () => {
    expect(Array.isArray(provider.actions)).toBe(true);
    expect(provider.actions.length).toBeGreaterThan(0);
  });

  it('default action satisfies ActionDefinition schema', () => {
    const action = provider.actions[0];
    // ActionDefinitionSchema uses z.any() for inputSchema so we validate the rest
    expect(action.name).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(action.description.length).toBeGreaterThanOrEqual(20);
    expect(['low', 'medium', 'high']).toContain(action.riskLevel);
    expect(['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL']).toContain(action.defaultTier);
  });

  it('custom actions can be provided via constructor', () => {
    const customAction = {
      name: 'swap_tokens',
      description: 'Swap tokens via DEX aggregator for testing',
      chain: 'solana' as const,
      inputSchema: z.object({ fromMint: z.string(), toMint: z.string(), amount: z.string() }),
      riskLevel: 'medium' as const,
      defaultTier: 'DELAY' as const,
    };

    const custom = createMockActionProvider({ actions: [customAction] });
    expect(custom.actions).toHaveLength(1);
    expect(custom.actions[0].name).toBe('swap_tokens');
  });

  // -------------------------------------------------------------------------
  // resolve()
  // -------------------------------------------------------------------------

  it('resolve() returns a ContractCallRequest', async () => {
    const result = await provider.resolve('mock_action', { amount: '100' }, context);

    expect(result.type).toBe('CONTRACT_CALL');
    expect(result.to).toBeDefined();
    expect(typeof result.to).toBe('string');
  });

  it('resolve() throws ACTION_NOT_FOUND for unknown action name', async () => {
    await expect(
      provider.resolve('nonexistent_action', { amount: '100' }, context),
    ).rejects.toThrow('ACTION_NOT_FOUND: nonexistent_action');
  });

  it('resolve() throws ZodError when inputSchema validation fails', async () => {
    // Default action expects { amount: z.string() } -- pass invalid input
    await expect(
      provider.resolve('mock_action', { amount: 123 as unknown as string }, context),
    ).rejects.toThrow(ZodError);
  });

  it('resolve() validates input against action inputSchema', async () => {
    // Valid params should not throw
    const result = await provider.resolve('mock_action', { amount: '500' }, context);
    expect(result.type).toBe('CONTRACT_CALL');
  });

  // -------------------------------------------------------------------------
  // setResolveResult()
  // -------------------------------------------------------------------------

  it('setResolveResult() changes the returned ContractCallRequest', async () => {
    const newResult: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      calldata: '0x12345678',
      value: '1000000000000000000',
    };

    provider.setResolveResult(newResult);
    const result = await provider.resolve('mock_action', { amount: '1' }, context);

    expect(result.to).toBe('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd');
    expect(result.calldata).toBe('0x12345678');
    expect(result.value).toBe('1000000000000000000');
  });

  // -------------------------------------------------------------------------
  // setResolveError()
  // -------------------------------------------------------------------------

  it('setResolveError() injects an error on next call', async () => {
    const error = new Error('PROVIDER_UNAVAILABLE');
    provider.setResolveError(error);

    await expect(
      provider.resolve('mock_action', { amount: '1' }, context),
    ).rejects.toThrow('PROVIDER_UNAVAILABLE');

    // Subsequent call should work normally
    const result = await provider.resolve('mock_action', { amount: '1' }, context);
    expect(result.type).toBe('CONTRACT_CALL');
  });

  // -------------------------------------------------------------------------
  // vi.fn() call verification
  // -------------------------------------------------------------------------

  it('vi.fn() tracks resolve call count and arguments', async () => {
    await provider.resolve('mock_action', { amount: '100' }, context);
    await provider.resolve('mock_action', { amount: '200' }, context);

    expect(provider.resolve).toHaveBeenCalledTimes(2);
    expect(provider.resolve).toHaveBeenCalledWith('mock_action', { amount: '100' }, context);
    expect(provider.resolve).toHaveBeenCalledWith('mock_action', { amount: '200' }, context);
  });

  // -------------------------------------------------------------------------
  // reset()
  // -------------------------------------------------------------------------

  it('reset() clears resolve result and call history', async () => {
    // Modify state
    provider.setResolveResult({
      type: 'CONTRACT_CALL',
      to: '0xbeef',
      calldata: '0x00',
    });
    await provider.resolve('mock_action', { amount: '1' }, context);

    // Reset
    provider.reset();

    // Verify call history cleared
    expect(provider.resolve).toHaveBeenCalledTimes(0);

    // Verify resolve result reset to default
    const result = await provider.resolve('mock_action', { amount: '1' }, context);
    expect(result.to).toBe('0x1234567890abcdef1234567890abcdef12345678');
  });

  // -------------------------------------------------------------------------
  // Factory
  // -------------------------------------------------------------------------

  it('createMockActionProvider() returns independent instances', () => {
    const a = createMockActionProvider();
    const b = createMockActionProvider();
    expect(a).not.toBe(b);
    expect(a).toBeInstanceOf(MockActionProvider);
  });
});
