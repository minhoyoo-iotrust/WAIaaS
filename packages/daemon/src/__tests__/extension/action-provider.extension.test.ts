/**
 * EXT-06: Action Provider functional tests (16 scenarios).
 *
 * Tests ActionProviderRegistry from an "extension scenario" perspective:
 * - ACT-U01~U04: Registry error conditions
 * - ACT-I01~I04: Plugin loading + pipeline integration
 * - ACT-F01~F04: Normal functional behavior (resolve-then-execute, MCP, listing)
 * - ACT-X01~X04: Cross-validation (whitelist, multi-provider, unregister, MCP schema)
 *
 * Differs from action-provider-registry.test.ts (unit tests per method):
 *   This file validates end-to-end extension scenarios including resolve flow,
 *   MCP tool conversion, and ESM plugin loading edge cases.
 *
 * @see docs/64-extension-test-strategy.md section 6.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import {
  WAIaaSError,
  ContractCallRequestSchema,
  type IActionProvider,
  type ActionDefinition,
  type ActionProviderMetadata,
  type ActionContext,
  type ContractCallRequest,
} from '@waiaas/core';
import { ActionProviderRegistry } from '../../infrastructure/action/action-provider-registry.js';
import { createMockActionProvider } from '../mocks/mock-action-provider.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let registry: ActionProviderRegistry;

/** Standard action context for resolve() calls. */
const testContext: ActionContext = {
  walletAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
  chain: 'ethereum',
  walletId: 'wallet-ext-06-001',
  sessionId: 'session-ext-06-001',
};

/** Create a valid provider with configurable overrides using MockActionProvider. */
function makeProvider(
  name: string,
  overrides?: {
    actions?: ActionDefinition[];
    resolveResult?: ContractCallRequest;
    metadata?: Partial<ActionProviderMetadata>;
  },
): ReturnType<typeof createMockActionProvider> {
  return createMockActionProvider({
    metadata: {
      name,
      description: `Extension test provider: ${name} for EXT-06`,
      version: '1.0.0',
      chains: ['ethereum'],
      ...overrides?.metadata,
    },
    actions: overrides?.actions,
    resolveResult: overrides?.resolveResult,
  });
}

/** Create a raw IActionProvider (not MockActionProvider) for custom resolve behavior. */
function makeRawProvider(
  name: string,
  overrides?: {
    actions?: ActionDefinition[];
    resolveImpl?: IActionProvider['resolve'];
    metadata?: Partial<ActionProviderMetadata>;
  },
): IActionProvider {
  const defaultAction: ActionDefinition = {
    name: 'test_action',
    description: 'Default test action for extension test scenarios',
    chain: 'ethereum',
    inputSchema: z.object({ amount: z.string() }),
    riskLevel: 'low',
    defaultTier: 'INSTANT',
  };

  return {
    metadata: {
      name,
      description: `Raw provider ${name} for extension testing`,
      version: '1.0.0',
      chains: ['ethereum'],
      mcpExpose: false,
      requiresApiKey: false,
      requiredApis: [],
      ...overrides?.metadata,
    },
    actions: overrides?.actions ?? [defaultAction],
    resolve: overrides?.resolveImpl ?? vi.fn().mockResolvedValue({
      type: 'CONTRACT_CALL' as const,
      to: '0x1234567890abcdef1234567890abcdef12345678',
      calldata: '0xdeadbeef',
      value: '0',
    }),
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  registry = new ActionProviderRegistry();
});

// ===========================================================================
// ACT-U01~U04: Unit Registry errors
// ===========================================================================

describe('ACT-U01~U04: Unit Registry errors', () => {
  // ACT-U01: MCP Tool upper limit (mcpExpose=true provider registration count)
  it('ACT-U01: registers multiple mcpExpose=true providers without throwing', () => {
    // Register 16 mcpExpose=true providers (current limit consideration)
    // The registry does not enforce a hard limit -- this documents behavior
    for (let i = 0; i < 16; i++) {
      const provider = makeProvider(`mcp_prov_${String(i).padStart(3, '0')}`, {
        metadata: { mcpExpose: true },
      });
      registry.register(provider);
    }

    const exposed = registry.getMcpExposedActions();
    expect(exposed).toHaveLength(16);

    // 17th provider also registers (no hard cap in registry)
    const extra = makeProvider('mcp_prov_017', {
      metadata: { mcpExpose: true },
    });
    expect(() => registry.register(extra)).not.toThrow();
    expect(registry.getMcpExposedActions()).toHaveLength(17);
  });

  // ACT-U02: Action name collision (duplicate providerName)
  it('ACT-U02: rejects duplicate provider name with ACTION_NAME_CONFLICT', () => {
    const first = makeProvider('conflict_name');
    const second = makeProvider('conflict_name');

    registry.register(first);

    try {
      registry.register(second);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('ACTION_NAME_CONFLICT');
    }
  });

  // ACT-U03: Invalid input params (inputSchema.parse failure)
  it('ACT-U03: rejects invalid input params with ACTION_VALIDATION_FAILED', async () => {
    const provider = makeProvider('validate_input');
    registry.register(provider);

    // mock_action expects { amount: z.string() }, passing missing required field
    await expect(
      registry.executeResolve('validate_input/mock_action', {}, testContext),
    ).rejects.toThrow(WAIaaSError);

    try {
      await registry.executeResolve(
        'validate_input/mock_action',
        { amount: 12345 as unknown as string },
        testContext,
      );
    } catch (err) {
      expect((err as WAIaaSError).code).toBe('ACTION_VALIDATION_FAILED');
    }
  });

  // ACT-U04: Chain mismatch (ethereum wallet + solana action)
  // 156-02 decision: Registry does NOT enforce chain matching at resolve time
  it('ACT-U04: registry does not enforce chain mismatch -- pipeline-level responsibility', async () => {
    const solanaProvider = makeProvider('solana_only_prov', {
      metadata: { chains: ['solana'] },
      actions: [{
        name: 'sol_action',
        description: 'Solana-only action for chain mismatch testing',
        chain: 'solana',
        inputSchema: z.object({ amount: z.string() }),
        riskLevel: 'low',
        defaultTier: 'INSTANT',
      }],
    });

    registry.register(solanaProvider);

    // Context is ethereum, but provider is solana-only -- registry allows it
    const ethContext: ActionContext = {
      ...testContext,
      chain: 'ethereum',
    };

    const result = await registry.executeResolve(
      'solana_only_prov/sol_action',
      { amount: '100' },
      ethContext,
    );

    // Registry passes through -- chain enforcement is at pipeline level
    expect(result.type).toBe('CONTRACT_CALL');
  });
});

// ===========================================================================
// ACT-I01~I04: Integration plugin load + pipeline
// ===========================================================================

describe('ACT-I01~I04: Integration plugin load + pipeline', () => {
  // ACT-I01: CJS module plugin load failure
  it('ACT-I01: CJS module plugin (type !== "module") fails to load', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'waiaas-plugin-'));
    const pluginDir = join(tmpDir, 'cjs_plugin');
    await mkdir(pluginDir, { recursive: true });

    // Create package.json without "type": "module" (CJS)
    await writeFile(
      join(pluginDir, 'package.json'),
      JSON.stringify({ name: 'cjs-plugin', version: '1.0.0', main: 'index.js' }),
    );
    await writeFile(join(pluginDir, 'index.js'), 'module.exports = {};');

    const result = await registry.loadPlugins(tmpDir);

    expect(result.loaded).not.toContain('cjs_plugin');
    expect(result.failed).toContain('cjs_plugin');

    await rm(tmpDir, { recursive: true, force: true });
  });

  // ACT-I02: resolve() timeout simulation via AbortSignal
  it('ACT-I02: resolve() timeout can be enforced externally', async () => {
    const slowProvider = makeRawProvider('slow_provider', {
      resolveImpl: vi.fn(async () => {
        // Simulate a slow operation (but we abort before it completes)
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return {
          type: 'CONTRACT_CALL' as const,
          to: '0x1234567890abcdef1234567890abcdef12345678',
          calldata: '0x',
          value: '0',
        };
      }),
    });

    registry.register(slowProvider);

    // Wrap in AbortController-style timeout (30s in production, 100ms here)
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('ACTION_RESOLVE_TIMEOUT')), 100),
    );

    await expect(
      Promise.race([
        registry.executeResolve(
          'slow_provider/test_action',
          { amount: '100' },
          testContext,
        ),
        timeoutPromise,
      ]),
    ).rejects.toThrow('ACTION_RESOLVE_TIMEOUT');
  });

  // ACT-I03: resolve() succeeds but CONTRACT_WHITELIST would reject at pipeline
  it('ACT-I03: resolve() succeeds regardless of CONTRACT_WHITELIST -- pipeline handles rejection', async () => {
    const provider = makeProvider('whitelist_test', {
      resolveResult: {
        type: 'CONTRACT_CALL',
        to: '0xUnknownContract1234567890abcdef12345678',
        calldata: '0xa9059cbb',
        value: '0',
      },
    });

    registry.register(provider);

    // Registry resolves successfully -- it does not check CONTRACT_WHITELIST
    const result = await registry.executeResolve(
      'whitelist_test/mock_action',
      { amount: '100' },
      testContext,
    );

    expect(result.type).toBe('CONTRACT_CALL');
    expect(result.to).toBe('0xUnknownContract1234567890abcdef12345678');
    // Note: Stage 3 policy engine would reject this if to is not whitelisted
  });

  // ACT-I04: Plugin directory not existing -> 0 loaded, no error
  it('ACT-I04: non-existent plugin directory returns 0 loaded with no error', async () => {
    const result = await registry.loadPlugins('/nonexistent/path/to/plugins');

    expect(result.loaded).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });
});

// ===========================================================================
// ACT-F01~F04: Normal functional behavior
// ===========================================================================

describe('ACT-F01~F04: Normal functional behavior', () => {
  // ACT-F01: Normal provider registration + executeResolve -> ContractCallRequest
  it('ACT-F01: register + executeResolve returns valid ContractCallRequest', async () => {
    const provider = makeProvider('swap_provider', {
      resolveResult: {
        type: 'CONTRACT_CALL',
        to: '0xDex1234567890abcdef1234567890abcdef123456',
        calldata: '0x38ed1739',
        value: '0',
      },
    });

    registry.register(provider);

    const result = await registry.executeResolve(
      'swap_provider/mock_action',
      { amount: '1000000' },
      testContext,
    );

    // Validate result matches ContractCallRequestSchema
    expect(result.type).toBe('CONTRACT_CALL');
    expect(result.to).toBe('0xDex1234567890abcdef1234567890abcdef123456');
    expect(result.calldata).toBe('0x38ed1739');

    // Re-validate via Zod schema (what registry does internally)
    const parsed = ContractCallRequestSchema.parse(result);
    expect(parsed).toEqual(result);

    // Verify resolve was called with correct args
    expect(provider.resolve).toHaveBeenCalledOnce();
    expect(provider.resolve).toHaveBeenCalledWith(
      'mock_action',
      { amount: '1000000' },
      testContext,
    );
  });

  // ACT-F02: resolve() return from === context.walletAddress (validate-then-trust)
  it('ACT-F02: resolve() result from matches context.walletAddress when set', async () => {
    const walletAddr = '0xabcdef1234567890abcdef1234567890abcdef12';
    const context: ActionContext = {
      walletAddress: walletAddr,
      chain: 'ethereum',
      walletId: 'wallet-f02',
      sessionId: 'session-f02',
    };

    // Provider returns a ContractCallRequest -- 'from' is not part of the schema
    // but the pipeline trusts context.walletAddress for the signer
    const provider = makeProvider('from_check_prov');
    registry.register(provider);

    const result = await registry.executeResolve(
      'from_check_prov/mock_action',
      { amount: '100' },
      context,
    );

    // The resolve call receives context.walletAddress as part of the context
    const resolveCall = provider.resolve.mock.calls[0];
    expect(resolveCall[2].walletAddress).toBe(walletAddr);

    // Result is a valid ContractCallRequest (from is enforced at pipeline level)
    expect(result.type).toBe('CONTRACT_CALL');
  });

  // ACT-F03: getMcpExposedActions() filters mcpExpose=true only
  it('ACT-F03: getMcpExposedActions filters only mcpExpose=true providers', () => {
    const exposed1 = makeProvider('exposed_aaa', {
      metadata: { mcpExpose: true },
    });
    const exposed2 = makeProvider('exposed_bbb', {
      metadata: { mcpExpose: true },
    });
    const hidden = makeProvider('hidden_ccc', {
      metadata: { mcpExpose: false },
    });

    registry.register(exposed1);
    registry.register(exposed2);
    registry.register(hidden);

    const mcpActions = registry.getMcpExposedActions();
    const providerNames = mcpActions.map((a) => a.provider.metadata.name);

    expect(providerNames).toContain('exposed_aaa');
    expect(providerNames).toContain('exposed_bbb');
    expect(providerNames).not.toContain('hidden_ccc');
    expect(mcpActions).toHaveLength(2);
  });

  // ACT-F04: listProviders + listActions return all registered entries
  it('ACT-F04: listProviders and listActions enumerate all registered entries', () => {
    const provA = makeProvider('list_prov_aaa', {
      actions: [{
        name: 'action_alpha',
        description: 'Alpha action for list enumeration testing',
        chain: 'ethereum',
        inputSchema: z.object({ x: z.string() }),
        riskLevel: 'low',
        defaultTier: 'INSTANT',
      }],
    });
    const provB = makeProvider('list_prov_bbb', {
      actions: [
        {
          name: 'action_beta',
          description: 'Beta action for list enumeration testing purposes',
          chain: 'ethereum',
          inputSchema: z.object({ y: z.string() }),
          riskLevel: 'medium',
          defaultTier: 'NOTIFY',
        },
        {
          name: 'action_gamma',
          description: 'Gamma action for multi-action list testing purpose',
          chain: 'ethereum',
          inputSchema: z.object({ z: z.string() }),
          riskLevel: 'high',
          defaultTier: 'APPROVAL',
        },
      ],
    });

    registry.register(provA);
    registry.register(provB);

    // listProviders
    const providers = registry.listProviders();
    expect(providers).toHaveLength(2);
    const names = providers.map((p) => p.name).sort();
    expect(names).toEqual(['list_prov_aaa', 'list_prov_bbb']);

    // listActions (all)
    const allActions = registry.listActions();
    expect(allActions).toHaveLength(3); // 1 + 2

    // listActions (filtered)
    const actionsB = registry.listActions('list_prov_bbb');
    expect(actionsB).toHaveLength(2);
    expect(actionsB.map((a) => a.action.name).sort()).toEqual([
      'action_beta',
      'action_gamma',
    ]);
  });
});

// ===========================================================================
// ACT-X01~X04: Cross-validation
// ===========================================================================

describe('ACT-X01~X04: Cross-validation', () => {
  // ACT-X01: resolve -> ContractCallRequest passes ContractCallRequestSchema validation
  it('ACT-X01: resolve result passes ContractCallRequestSchema validation', async () => {
    const provider = makeProvider('whitelist_pass', {
      resolveResult: {
        type: 'CONTRACT_CALL',
        to: '0xWhitelistedContract1234567890abcdef123456',
        calldata: '0xa9059cbb000000000000000000000000receiver',
        value: '1000000000000000000',
      },
    });

    registry.register(provider);

    const result = await registry.executeResolve(
      'whitelist_pass/mock_action',
      { amount: '100' },
      testContext,
    );

    // Result passes schema validation (which executeResolve does internally)
    expect(result.type).toBe('CONTRACT_CALL');
    expect(result.to).toBe('0xWhitelistedContract1234567890abcdef123456');
    expect(result.value).toBe('1000000000000000000');

    // Double-check with explicit schema parse
    expect(() => ContractCallRequestSchema.parse(result)).not.toThrow();
  });

  // ACT-X02: Multiple providers with independent resolve
  it('ACT-X02: multiple providers resolve independently', async () => {
    const provA = makeProvider('multi_prov_aaa', {
      resolveResult: {
        type: 'CONTRACT_CALL',
        to: '0xContractAAAA1234567890abcdef1234567890ab',
        calldata: '0xaaaa',
        value: '100',
      },
    });
    const provB = makeProvider('multi_prov_bbb', {
      resolveResult: {
        type: 'CONTRACT_CALL',
        to: '0xContractBBBB1234567890abcdef1234567890ab',
        calldata: '0xbbbb',
        value: '200',
      },
    });
    const provC = makeProvider('multi_prov_ccc', {
      resolveResult: {
        type: 'CONTRACT_CALL',
        to: '0xContractCCCC1234567890abcdef1234567890ab',
        calldata: '0xcccc',
        value: '300',
      },
    });

    registry.register(provA);
    registry.register(provB);
    registry.register(provC);

    const resultA = await registry.executeResolve(
      'multi_prov_aaa/mock_action',
      { amount: '100' },
      testContext,
    );
    const resultB = await registry.executeResolve(
      'multi_prov_bbb/mock_action',
      { amount: '200' },
      testContext,
    );
    const resultC = await registry.executeResolve(
      'multi_prov_ccc/mock_action',
      { amount: '300' },
      testContext,
    );

    // Each provider returns its own result independently
    expect(resultA.to).toBe('0xContractAAAA1234567890abcdef1234567890ab');
    expect(resultB.to).toBe('0xContractBBBB1234567890abcdef1234567890ab');
    expect(resultC.to).toBe('0xContractCCCC1234567890abcdef1234567890ab');

    expect(resultA.calldata).toBe('0xaaaa');
    expect(resultB.calldata).toBe('0xbbbb');
    expect(resultC.calldata).toBe('0xcccc');

    // Each provider's resolve called exactly once
    expect(provA.resolve).toHaveBeenCalledOnce();
    expect(provB.resolve).toHaveBeenCalledOnce();
    expect(provC.resolve).toHaveBeenCalledOnce();
  });

  // ACT-X03: unregister + re-register -> clean state
  it('ACT-X03: unregister and re-register resets provider state', async () => {
    const provider1 = makeProvider('reregister_prov', {
      resolveResult: {
        type: 'CONTRACT_CALL',
        to: '0xOriginal1234567890abcdef1234567890abcdef',
        calldata: '0xoriginal',
        value: '0',
      },
    });

    registry.register(provider1);

    // Verify initial state
    let result = await registry.executeResolve(
      'reregister_prov/mock_action',
      { amount: '100' },
      testContext,
    );
    expect(result.to).toBe('0xOriginal1234567890abcdef1234567890abcdef');

    // Unregister
    expect(registry.unregister('reregister_prov')).toBe(true);
    expect(registry.getProvider('reregister_prov')).toBeUndefined();
    expect(registry.getAction('reregister_prov/mock_action')).toBeUndefined();

    // Re-register with different resolve result
    const provider2 = makeProvider('reregister_prov', {
      resolveResult: {
        type: 'CONTRACT_CALL',
        to: '0xUpdated1234567890abcdef1234567890abcdef12',
        calldata: '0xupdated',
        value: '0',
      },
    });

    registry.register(provider2);

    result = await registry.executeResolve(
      'reregister_prov/mock_action',
      { amount: '100' },
      testContext,
    );
    expect(result.to).toBe('0xUpdated1234567890abcdef1234567890abcdef12');
  });

  // ACT-X04: MCP Tool conversion accuracy (ActionDefinition -> MCP tool schema)
  it('ACT-X04: MCP tool conversion preserves ActionDefinition fields', () => {
    const swapSchema = z.object({
      tokenIn: z.string(),
      tokenOut: z.string(),
      amount: z.string(),
    });

    const mcpProvider = makeProvider('mcp_convert_prov', {
      metadata: { mcpExpose: true },
      actions: [{
        name: 'swap_tokens',
        description: 'Swap one token for another on a decentralized exchange',
        chain: 'ethereum',
        inputSchema: swapSchema,
        riskLevel: 'medium',
        defaultTier: 'NOTIFY',
      }],
    });

    registry.register(mcpProvider);

    const exposedActions = registry.getMcpExposedActions();
    expect(exposedActions).toHaveLength(1);

    const { provider, action } = exposedActions[0];

    // Verify ActionDefinition -> MCP tool mapping fields
    expect(action.name).toBe('swap_tokens');
    expect(action.description).toBe(
      'Swap one token for another on a decentralized exchange',
    );
    expect(action.chain).toBe('ethereum');
    expect(action.riskLevel).toBe('medium');
    expect(action.defaultTier).toBe('NOTIFY');

    // Verify inputSchema is preserved (Zod schema with parse/safeParse)
    expect(typeof action.inputSchema.parse).toBe('function');
    expect(typeof action.inputSchema.safeParse).toBe('function');

    // Verify provider metadata
    expect(provider.metadata.name).toBe('mcp_convert_prov');
    expect(provider.metadata.mcpExpose).toBe(true);

    // Validate input schema works correctly
    const validInput = { tokenIn: 'USDC', tokenOut: 'WETH', amount: '1000000' };
    expect(() => action.inputSchema.parse(validInput)).not.toThrow();

    const invalidInput = { tokenIn: 'USDC' }; // missing required fields
    expect(() => action.inputSchema.parse(invalidInput)).toThrow();
  });
});
