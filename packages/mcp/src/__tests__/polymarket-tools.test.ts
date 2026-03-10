/**
 * Tests for Polymarket MCP query tools (8 tools).
 *
 * Verifies:
 * - All 8 tools are registered
 * - Correct REST API endpoints called
 * - Parameter forwarding
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerPolymarketTools } from '../tools/polymarket.js';
import type { ApiClient } from '../api-client.js';

// ---------------------------------------------------------------------------
// Mock MCP Server
// ---------------------------------------------------------------------------

interface RegisteredTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

function createMockServer() {
  const tools: RegisteredTool[] = [];
  return {
    tool: vi.fn((name: string, description: string, schema: Record<string, unknown>, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
      tools.push({ name, description, schema, handler });
    }),
    _tools: tools,
    getTool: (name: string) => tools.find((t) => t.name === name),
  };
}

function createMockApiClient() {
  return {
    get: vi.fn().mockResolvedValue({ data: 'ok' }),
    post: vi.fn().mockResolvedValue({ data: 'ok' }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerPolymarketTools', () => {
  let server: ReturnType<typeof createMockServer>;
  let apiClient: ReturnType<typeof createMockApiClient>;

  beforeEach(() => {
    server = createMockServer();
    apiClient = createMockApiClient();
    registerPolymarketTools(server as never, apiClient as unknown as ApiClient);
  });

  it('registers exactly 8 tools', () => {
    expect(server._tools).toHaveLength(8);
  });

  it('registers waiaas_pm_get_positions', () => {
    expect(server.getTool('waiaas_pm_get_positions')).toBeTruthy();
  });

  it('registers waiaas_pm_get_orders', () => {
    expect(server.getTool('waiaas_pm_get_orders')).toBeTruthy();
  });

  it('registers waiaas_pm_get_markets', () => {
    expect(server.getTool('waiaas_pm_get_markets')).toBeTruthy();
  });

  it('registers waiaas_pm_get_market_detail', () => {
    expect(server.getTool('waiaas_pm_get_market_detail')).toBeTruthy();
  });

  it('registers waiaas_pm_get_events', () => {
    expect(server.getTool('waiaas_pm_get_events')).toBeTruthy();
  });

  it('registers waiaas_pm_get_balance', () => {
    expect(server.getTool('waiaas_pm_get_balance')).toBeTruthy();
  });

  it('registers waiaas_pm_get_pnl', () => {
    expect(server.getTool('waiaas_pm_get_pnl')).toBeTruthy();
  });

  it('registers waiaas_pm_setup', () => {
    expect(server.getTool('waiaas_pm_setup')).toBeTruthy();
  });

  describe('tool handlers call correct endpoints', () => {
    it('pm_get_positions calls GET /v1/wallets/:id/polymarket/positions', async () => {
      const tool = server.getTool('waiaas_pm_get_positions')!;
      await tool.handler({ wallet_id: 'wlt-1' });
      expect(apiClient.get).toHaveBeenCalledWith('/v1/wallets/wlt-1/polymarket/positions');
    });

    it('pm_get_positions uses default wallet when not specified', async () => {
      const tool = server.getTool('waiaas_pm_get_positions')!;
      await tool.handler({});
      expect(apiClient.get).toHaveBeenCalledWith('/v1/wallets/default/polymarket/positions');
    });

    it('pm_get_orders calls GET /v1/wallets/:id/polymarket/orders', async () => {
      const tool = server.getTool('waiaas_pm_get_orders')!;
      await tool.handler({ wallet_id: 'wlt-2', status: 'LIVE' });
      expect(apiClient.get).toHaveBeenCalledWith('/v1/wallets/wlt-2/polymarket/orders?status=LIVE');
    });

    it('pm_get_markets calls GET /v1/polymarket/markets', async () => {
      const tool = server.getTool('waiaas_pm_get_markets')!;
      await tool.handler({ keyword: 'election' });
      expect(apiClient.get).toHaveBeenCalledWith('/v1/polymarket/markets?keyword=election');
    });

    it('pm_get_market_detail calls GET /v1/polymarket/markets/:conditionId', async () => {
      const tool = server.getTool('waiaas_pm_get_market_detail')!;
      await tool.handler({ condition_id: 'cond-123' });
      expect(apiClient.get).toHaveBeenCalledWith('/v1/polymarket/markets/cond-123');
    });

    it('pm_get_events calls GET /v1/polymarket/events', async () => {
      const tool = server.getTool('waiaas_pm_get_events')!;
      await tool.handler({});
      expect(apiClient.get).toHaveBeenCalledWith('/v1/polymarket/events');
    });

    it('pm_get_balance calls GET /v1/wallets/:id/polymarket/balance', async () => {
      const tool = server.getTool('waiaas_pm_get_balance')!;
      await tool.handler({ wallet_id: 'wlt-3' });
      expect(apiClient.get).toHaveBeenCalledWith('/v1/wallets/wlt-3/polymarket/balance');
    });

    it('pm_get_pnl calls GET /v1/wallets/:id/polymarket/pnl', async () => {
      const tool = server.getTool('waiaas_pm_get_pnl')!;
      await tool.handler({ wallet_id: 'wlt-4' });
      expect(apiClient.get).toHaveBeenCalledWith('/v1/wallets/wlt-4/polymarket/pnl');
    });

    it('pm_setup calls POST /v1/wallets/:id/polymarket/setup', async () => {
      const tool = server.getTool('waiaas_pm_setup')!;
      await tool.handler({ wallet_id: 'wlt-5', auto_approve: true });
      expect(apiClient.post).toHaveBeenCalledWith(
        '/v1/wallets/wlt-5/polymarket/setup',
        { auto_approve: true },
      );
    });
  });
});
