/**
 * CT-7: IActionProvider Contract Test execution.
 *
 * Validates InlineMockActionProvider and TestESMPlugin against the
 * shared contract suite. Both are inline implementations -- no daemon
 * dependency needed.
 */
import { describe } from 'vitest';
import { z } from 'zod';
import type {
  IActionProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
} from '../../interfaces/action-provider.types.js';
import type { ContractCallRequest } from '../../schemas/transaction.schema.js';
import { actionProviderContractTests } from './action-provider.contract.js';

// ---------------------------------------------------------------------------
// InlineMockActionProvider (simplified M10 without vi.fn)
// ---------------------------------------------------------------------------

class InlineMockActionProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata = {
    name: 'mock_provider',
    description: 'Mock action provider for testing purposes',
    version: '1.0.0',
    chains: ['ethereum'],
    mcpExpose: false,
    requiresApiKey: false,
    requiredApis: [],
  };

  readonly actions: readonly ActionDefinition[] = [
    {
      name: 'mock_action',
      description: 'A mock action for testing purposes in vitest',
      chain: 'ethereum',
      inputSchema: z.object({ amount: z.string() }),
      riskLevel: 'low',
      defaultTier: 'INSTANT',
    },
  ];

  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    _context: ActionContext,
  ): Promise<ContractCallRequest> {
    const action = this.actions.find((a) => a.name === actionName);
    if (!action) throw new Error(`ACTION_NOT_FOUND: ${actionName}`);
    action.inputSchema.parse(params);
    return {
      type: 'CONTRACT_CALL' as const,
      to: '0x1234567890abcdef1234567890abcdef12345678',
      calldata: '0xdeadbeef',
      value: '0',
    };
  }
}

// ---------------------------------------------------------------------------
// TestESMPlugin (fixture -- simulates a real ESM plugin)
// ---------------------------------------------------------------------------

class TestESMPlugin implements IActionProvider {
  readonly metadata: ActionProviderMetadata = {
    name: 'test_esm_plugin',
    description: 'Test ESM plugin for contract test validation',
    version: '1.0.0',
    chains: ['ethereum'],
    mcpExpose: false,
    requiresApiKey: false,
    requiredApis: [],
  };

  readonly actions: readonly ActionDefinition[] = [
    {
      name: 'test_action',
      description: 'A test action that returns a contract call request',
      chain: 'ethereum',
      inputSchema: z.object({ amount: z.string(), recipient: z.string() }),
      riskLevel: 'low',
      defaultTier: 'INSTANT',
    },
  ];

  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    _context: ActionContext,
  ): Promise<ContractCallRequest> {
    const action = this.actions.find((a) => a.name === actionName);
    if (!action) throw new Error(`ACTION_NOT_FOUND: ${actionName}`);
    action.inputSchema.parse(params);
    return {
      type: 'CONTRACT_CALL' as const,
      to: String(params.recipient),
      calldata: '0xdeadbeef',
      value: String(params.amount),
    };
  }
}

// ---------------------------------------------------------------------------
// Run contract tests
// ---------------------------------------------------------------------------

describe('CT-7: IActionProvider Contract Tests', () => {
  describe('InlineMockActionProvider', () => {
    actionProviderContractTests(
      () => new InlineMockActionProvider(),
      {
        validActionName: 'mock_action',
        validParams: { amount: '100' },
        invalidParams: {}, // missing required 'amount'
      },
    );
  });

  describe('TestESMPlugin', () => {
    actionProviderContractTests(
      () => new TestESMPlugin(),
      {
        validActionName: 'test_action',
        validParams: { amount: '100', recipient: '0xabc123' },
        invalidParams: { amount: '100' }, // missing required 'recipient'
      },
    );
  });
});
