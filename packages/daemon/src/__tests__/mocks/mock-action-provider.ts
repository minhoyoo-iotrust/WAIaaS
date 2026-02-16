/**
 * M10: MockActionProvider implementing IActionProvider.
 *
 * vi.fn()-based mock for Contract Tests (CT-7) and Action Provider tests.
 * Metadata, actions, and resolve() are all configurable via constructor
 * overrides and test helper methods.
 *
 * resolve() validates action name existence and input schema before
 * returning the configurable result, matching real provider behavior.
 */
import { vi } from 'vitest';
import { z } from 'zod';
import type {
  IActionProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ContractCallRequest,
} from '@waiaas/core';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default provider metadata (minimal valid ActionProviderMetadata). */
const DEFAULT_METADATA: ActionProviderMetadata = {
  name: 'mock_provider',
  description: 'Mock action provider for testing purposes',
  version: '1.0.0',
  chains: ['ethereum'],
  mcpExpose: false,
  requiresApiKey: false,
  requiredApis: [],
};

/** Default action definition. */
const DEFAULT_ACTION: ActionDefinition = {
  name: 'mock_action',
  description: 'A mock action for testing purposes in vitest',
  chain: 'ethereum',
  inputSchema: z.object({ amount: z.string() }),
  riskLevel: 'low',
  defaultTier: 'INSTANT',
};

/** Default resolve result (valid ContractCallRequest). */
const DEFAULT_RESOLVE_RESULT: ContractCallRequest = {
  type: 'CONTRACT_CALL' as const,
  to: '0x1234567890abcdef1234567890abcdef12345678',
  calldata: '0xdeadbeef',
  value: '0',
};

// ---------------------------------------------------------------------------
// MockActionProvider
// ---------------------------------------------------------------------------

/**
 * Mock IActionProvider with vi.fn() spies and configurable behavior.
 *
 * Usage:
 * ```ts
 * const provider = createMockActionProvider({
 *   metadata: { name: 'test_swap', chains: ['solana'] },
 * });
 *
 * const result = await provider.resolve('mock_action', { amount: '100' }, context);
 * expect(provider.resolve).toHaveBeenCalledOnce();
 * ```
 */
export class MockActionProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];

  private resolveResult: ContractCallRequest;

  resolve = vi.fn(async (
    actionName: string,
    params: Record<string, unknown>,
    _context: ActionContext,
  ): Promise<ContractCallRequest> => {
    // Verify action exists
    const action = this.actions.find((a) => a.name === actionName);
    if (!action) {
      throw new Error(`ACTION_NOT_FOUND: ${actionName}`);
    }

    // Validate input against action's schema
    action.inputSchema.parse(params);

    return { ...this.resolveResult };
  });

  constructor(overrides?: {
    metadata?: Partial<ActionProviderMetadata>;
    actions?: ActionDefinition[];
    resolveResult?: ContractCallRequest;
  }) {
    this.metadata = { ...DEFAULT_METADATA, ...overrides?.metadata };
    this.actions = overrides?.actions ?? [DEFAULT_ACTION];
    this.resolveResult = overrides?.resolveResult ?? { ...DEFAULT_RESOLVE_RESULT };
  }

  // ---------------------------------------------------------------------------
  // Test helpers
  // ---------------------------------------------------------------------------

  /**
   * Change the result returned by resolve().
   *
   * @param result - New ContractCallRequest to return.
   */
  setResolveResult(result: ContractCallRequest): void {
    this.resolveResult = result;
  }

  /**
   * Make resolve() reject with the given error on next call.
   *
   * @param error - Error to throw.
   */
  setResolveError(error: Error): void {
    this.resolve.mockRejectedValueOnce(error);
  }

  /** Reset resolve result to default and clear vi.fn() call history. */
  reset(): void {
    this.resolveResult = { ...DEFAULT_RESOLVE_RESULT };
    this.resolve.mockClear();
  }
}

/**
 * Factory function for MockActionProvider.
 *
 * @param overrides - Optional metadata, actions, and resolve result overrides.
 * @returns A new MockActionProvider instance.
 */
export function createMockActionProvider(
  overrides?: ConstructorParameters<typeof MockActionProvider>[0],
): MockActionProvider {
  return new MockActionProvider(overrides);
}
