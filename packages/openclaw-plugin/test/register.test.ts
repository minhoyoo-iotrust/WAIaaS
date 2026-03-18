/**
 * Tests for register() function:
 * 1. Exactly 17 tools are registered
 * 2. No masterAuth-exclusive tools (wallet CRUD, policy CRUD, provider config)
 * 3. All tools have valid inputSchema
 * 4. Tool handlers call the correct API endpoints (via mock client)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { register } from '../src/index.js';
import type { PluginApi, PluginToolConfig } from '../src/config.js';

// FORBIDDEN tools: masterAuth-only operations
const MASTERAUTH_TOOLS = [
  'create_wallet', 'delete_wallet', 'update_wallet',
  'create_policy', 'delete_policy', 'update_policy',
  'configure_provider', 'set_api_key', 'admin_settings',
  'kill_switch', 'backup', 'restore',
];

function createMockApi(config: Record<string, unknown> = {}): {
  api: PluginApi;
  tools: PluginToolConfig[];
} {
  const tools: PluginToolConfig[] = [];
  const api: PluginApi = {
    config: {
      sessionToken: 'test-token',
      daemonUrl: 'http://localhost:3100',
      ...config,
    },
    registerTool(tool: PluginToolConfig): void {
      tools.push(tool);
    },
  };
  return { api, tools };
}

describe('register()', () => {
  it('registers exactly 17 tools', () => {
    const { api, tools } = createMockApi();
    register(api);
    expect(tools).toHaveLength(17);
  });

  it('does not register any masterAuth tools', () => {
    const { api, tools } = createMockApi();
    register(api);
    const toolNames = tools.map((t) => t.name);
    for (const forbidden of MASTERAUTH_TOOLS) {
      expect(toolNames).not.toContain(forbidden);
    }
  });

  it('registers all expected tool names', () => {
    const { api, tools } = createMockApi();
    register(api);
    const names = tools.map((t) => t.name);
    // Wallet group
    expect(names).toContain('get_wallet_info');
    expect(names).toContain('get_balance');
    expect(names).toContain('connect_info');
    // Transfer group
    expect(names).toContain('send_token');
    expect(names).toContain('get_transaction');
    expect(names).toContain('list_transactions');
    // DeFi group
    expect(names).toContain('execute_action');
    expect(names).toContain('get_defi_positions');
    expect(names).toContain('get_provider_status');
    // NFT group
    expect(names).toContain('list_nfts');
    expect(names).toContain('transfer_nft');
    // Utility group
    expect(names).toContain('sign_message');
    expect(names).toContain('resolve_asset');
    expect(names).toContain('call_contract');
    expect(names).toContain('approve_token');
    expect(names).toContain('send_batch');
    expect(names).toContain('get_policies');
  });

  it('every tool has a valid inputSchema', () => {
    const { api, tools } = createMockApi();
    register(api);
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe('object');
      expect(typeof tool.inputSchema.properties).toBe('object');
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('throws if sessionToken is missing', () => {
    const { api } = createMockApi({ sessionToken: '' });
    expect(() => register(api)).toThrow('sessionToken is required');
  });

  it('tool handlers are functions', () => {
    const { api, tools } = createMockApi();
    register(api);
    for (const tool of tools) {
      expect(typeof tool.handler).toBe('function');
    }
  });
});

describe('send_token handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls POST /v1/transactions/send with correct body', async () => {
    const { api, tools } = createMockApi();
    // Patch fetch to capture request
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ txId: 'abc123' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    register(api);
    const sendTool = tools.find((t) => t.name === 'send_token');
    expect(sendTool).toBeDefined();

    await sendTool!.handler({ to: '0xrecipient', amount: '1000000' });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/transactions/send');
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body['to']).toBe('0xrecipient');
    expect(body['amount']).toBe('1000000');
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token');

    vi.unstubAllGlobals();
  });
});

describe('execute_action handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls POST /v1/actions/execute with action/provider/params', async () => {
    const { api, tools } = createMockApi();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: 'ok' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    register(api);
    const execTool = tools.find((t) => t.name === 'execute_action');
    expect(execTool).toBeDefined();

    await execTool!.handler({ action: 'swap', provider: 'jupiter', params: { fromToken: 'SOL', toToken: 'USDC', amount: '1000000000' } });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/actions/execute');
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body['action']).toBe('swap');
    expect(body['provider']).toBe('jupiter');

    vi.unstubAllGlobals();
  });
});
