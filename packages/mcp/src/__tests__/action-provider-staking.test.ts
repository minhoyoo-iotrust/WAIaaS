/**
 * Tests for Lido + Jito Staking Action Providers -> MCP Tool auto-registration (INTF-01).
 *
 * Verifies the existing registerActionProviderTools() mechanism works correctly
 * for Lido staking (2 actions: stake, unstake) and Jito staking (2 actions:
 * stake, unstake), producing 4 MCP tools total:
 *   - action_lido_staking_stake
 *   - action_lido_staking_unstake
 *   - action_jito_staking_stake
 *   - action_jito_staking_unstake
 *
 * Uses the same mock patterns from action-provider-lifi.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResult } from '../api-client.js';
import { registerActionProviderTools } from '../tools/action-provider.js';

// --- Mock ApiClient factory (reused from action-provider-lifi.test.ts) ---

function createMockApiClient(responses: Map<string, ApiResult<unknown>>): ApiClient {
  const defaultOk: ApiResult<unknown> = { ok: true, data: { mock: true } };

  return {
    get: vi.fn(async (path: string) => responses.get(`GET:${path}`) ?? defaultOk),
    post: vi.fn(async (path: string, _body: unknown) => responses.get(`POST:${path}`) ?? defaultOk),
    put: vi.fn(async (path: string, _body: unknown) => responses.get(`PUT:${path}`) ?? defaultOk),
  } as unknown as ApiClient;
}

// --- Mock McpServer factory (reused from action-provider-lifi.test.ts) ---

function createMockServer(): {
  server: McpServer;
  toolCalls: Array<{ name: string; description: string; handler: (...args: unknown[]) => Promise<unknown> }>;
} {
  const toolCalls: Array<{ name: string; description: string; handler: (...args: unknown[]) => Promise<unknown> }> = [];

  const server = {
    tool: vi.fn((...args: unknown[]) => {
      const name = args[0] as string;
      const description = args[1] as string;
      const handler = args[args.length - 1] as (...a: unknown[]) => Promise<unknown>;
      toolCalls.push({ name, description, handler });

      return {
        enabled: true,
        enable: vi.fn(),
        disable: vi.fn(),
        remove: vi.fn(),
        update: vi.fn(),
      } as unknown as RegisteredTool;
    }),
  } as unknown as McpServer;

  return { server, toolCalls };
}

// --- Staking providers fixture ---

function makeStakingProvidersResponse() {
  return {
    providers: [
      {
        name: 'lido_staking',
        description: 'Lido liquid staking protocol for ETH to stETH conversion with withdrawal support',
        version: '1.0.0',
        chains: ['ethereum'],
        mcpExpose: true,
        requiresApiKey: false,
        hasApiKey: false,
        actions: [
          {
            name: 'stake',
            description: 'Stake ETH to receive stETH via Lido protocol (submit). Immediate, no lock-up.',
            chain: 'ethereum',
            riskLevel: 'medium',
            defaultTier: 'DELAY',
          },
          {
            name: 'unstake',
            description: 'Request stETH to ETH withdrawal via Lido Withdrawal Queue. Takes 1-5 days to finalize.',
            chain: 'ethereum',
            riskLevel: 'medium',
            defaultTier: 'DELAY',
          },
        ],
      },
      {
        name: 'jito_staking',
        description: 'Jito liquid staking protocol for SOL to JitoSOL conversion via SPL Stake Pool',
        version: '1.0.0',
        chains: ['solana'],
        mcpExpose: true,
        requiresApiKey: false,
        hasApiKey: false,
        actions: [
          {
            name: 'stake',
            description: 'Stake SOL to receive JitoSOL via Jito Stake Pool (DepositSol). Immediate, no lock-up.',
            chain: 'solana',
            riskLevel: 'medium',
            defaultTier: 'DELAY',
          },
          {
            name: 'unstake',
            description: 'Withdraw SOL from Jito Stake Pool by burning JitoSOL (WithdrawSol). Epoch boundary delay.',
            chain: 'solana',
            riskLevel: 'medium',
            defaultTier: 'DELAY',
          },
        ],
      },
    ],
  };
}

describe('registerActionProviderTools (Staking: Lido + Jito)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('Lido + Jito providers with mcpExpose=true register 4 MCP tools', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: makeStakingProvidersResponse() }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    const result = await registerActionProviderTools(server, apiClient);

    expect(result.size).toBe(4);
    expect(server.tool).toHaveBeenCalledTimes(4);

    const toolNames = toolCalls.map((t) => t.name);
    expect(toolNames).toContain('action_lido_staking_stake');
    expect(toolNames).toContain('action_lido_staking_unstake');
    expect(toolNames).toContain('action_jito_staking_stake');
    expect(toolNames).toContain('action_jito_staking_unstake');

    expect(result.has('action_lido_staking_stake')).toBe(true);
    expect(result.has('action_lido_staking_unstake')).toBe(true);
    expect(result.has('action_jito_staking_stake')).toBe(true);
    expect(result.has('action_jito_staking_unstake')).toBe(true);
  });

  it('action_lido_staking_stake handler calls POST /v1/actions/lido_staking/stake', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: makeStakingProvidersResponse() }],
      ['POST:/v1/actions/lido_staking/stake', {
        ok: true,
        data: { id: 'tx-lido-stake-1', status: 'PENDING' },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    await registerActionProviderTools(server, apiClient);

    const stakeHandler = toolCalls.find((t) => t.name === 'action_lido_staking_stake')!.handler;
    await stakeHandler({
      params: { amount: '1.0' },
      network: 'ethereum-mainnet',
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/actions/lido_staking/stake',
      {
        params: { amount: '1.0' },
        network: 'ethereum-mainnet',
      },
    );
  });

  it('action_lido_staking_unstake handler calls POST /v1/actions/lido_staking/unstake', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: makeStakingProvidersResponse() }],
      ['POST:/v1/actions/lido_staking/unstake', {
        ok: true,
        data: { id: 'tx-lido-unstake-1', status: 'PENDING' },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    await registerActionProviderTools(server, apiClient);

    const unstakeHandler = toolCalls.find((t) => t.name === 'action_lido_staking_unstake')!.handler;
    await unstakeHandler({
      params: { amount: '0.5' },
      network: 'ethereum-mainnet',
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/actions/lido_staking/unstake',
      {
        params: { amount: '0.5' },
        network: 'ethereum-mainnet',
      },
    );
  });

  it('action_jito_staking_stake handler calls POST /v1/actions/jito_staking/stake', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: makeStakingProvidersResponse() }],
      ['POST:/v1/actions/jito_staking/stake', {
        ok: true,
        data: { id: 'tx-jito-stake-1', status: 'PENDING' },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    await registerActionProviderTools(server, apiClient);

    const stakeHandler = toolCalls.find((t) => t.name === 'action_jito_staking_stake')!.handler;
    await stakeHandler({
      params: { amount: '2.0' },
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/actions/jito_staking/stake',
      {
        params: { amount: '2.0' },
      },
    );
  });

  it('action_jito_staking_unstake handler calls POST /v1/actions/jito_staking/unstake', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: makeStakingProvidersResponse() }],
      ['POST:/v1/actions/jito_staking/unstake', {
        ok: true,
        data: { id: 'tx-jito-unstake-1', status: 'PENDING' },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    await registerActionProviderTools(server, apiClient);

    const unstakeHandler = toolCalls.find((t) => t.name === 'action_jito_staking_unstake')!.handler;
    await unstakeHandler({
      params: { amount: '1.5' },
      wallet_id: 'w-sol-1',
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/actions/jito_staking/unstake',
      {
        params: { amount: '1.5' },
        walletId: 'w-sol-1',
      },
    );
  });

  it('tool descriptions include stETH/Lido and JitoSOL/Jito keywords', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: makeStakingProvidersResponse() }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    await registerActionProviderTools(server, apiClient);

    const lidoStake = toolCalls.find((t) => t.name === 'action_lido_staking_stake')!;
    const lidoUnstake = toolCalls.find((t) => t.name === 'action_lido_staking_unstake')!;
    const jitoStake = toolCalls.find((t) => t.name === 'action_jito_staking_stake')!;
    const jitoUnstake = toolCalls.find((t) => t.name === 'action_jito_staking_unstake')!;

    // Lido tools reference stETH and Lido
    expect(lidoStake.description).toContain('stETH');
    expect(lidoStake.description).toContain('[lido_staking]');
    expect(lidoStake.description).toContain('chain: ethereum');
    expect(lidoStake.description).toContain('risk: medium');

    expect(lidoUnstake.description).toContain('stETH');
    expect(lidoUnstake.description).toContain('[lido_staking]');

    // Jito tools reference JitoSOL and Jito
    expect(jitoStake.description).toContain('JitoSOL');
    expect(jitoStake.description).toContain('[jito_staking]');
    expect(jitoStake.description).toContain('chain: solana');
    expect(jitoStake.description).toContain('risk: medium');

    expect(jitoUnstake.description).toContain('JitoSOL');
    expect(jitoUnstake.description).toContain('[jito_staking]');
  });

  it('staking tools pass wallet_id correctly via walletId field', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: makeStakingProvidersResponse() }],
      ['POST:/v1/actions/lido_staking/stake', { ok: true, data: { id: 'tx-1', status: 'PENDING' } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    await registerActionProviderTools(server, apiClient);

    const stakeHandler = toolCalls.find((t) => t.name === 'action_lido_staking_stake')!.handler;
    await stakeHandler({
      params: { amount: '1.0' },
      network: 'ethereum-mainnet',
      wallet_id: 'w-eth-123',
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/actions/lido_staking/stake',
      {
        params: { amount: '1.0' },
        network: 'ethereum-mainnet',
        walletId: 'w-eth-123',
      },
    );
  });

  it('SDK executeAction pattern works for lido_staking (mock REST call)', async () => {
    // This test verifies the pattern that TS SDK's executeAction('lido_staking/stake')
    // translates to POST /v1/actions/lido_staking/stake -- the same endpoint the MCP tool calls.
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: makeStakingProvidersResponse() }],
      ['POST:/v1/actions/lido_staking/stake', {
        ok: true,
        data: { id: 'tx-sdk-1', status: 'PENDING' },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    await registerActionProviderTools(server, apiClient);

    // Simulate the same call path that SDK uses
    const handler = toolCalls.find((t) => t.name === 'action_lido_staking_stake')!.handler;
    await handler({
      params: { amount: '10.0' },
    });

    // Verify the REST endpoint called matches what SDK would call
    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/actions/lido_staking/stake',
      { params: { amount: '10.0' } },
    );
  });
});
