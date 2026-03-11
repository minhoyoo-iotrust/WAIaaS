/**
 * Polymarket query MCP tools (8 tools).
 *
 * Action tools (10) are auto-registered via action-provider.ts (mcpExpose=true).
 * These are the 8 read-only query tools that bypass the pipeline.
 *
 * @see design doc 80, Section 9.2
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerPolymarketTools(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  // pm_get_positions
  server.tool(
    'waiaas_pm_get_positions',
    withWalletPrefix('Get Polymarket prediction market positions for a wallet.', walletContext?.walletName),
    {
      wallet_id: z.string().optional().describe('Wallet ID. Auto-resolved for single-wallet sessions.'),
    },
    async (args) => {
      const walletId = args.wallet_id || 'default';
      const result = await apiClient.get(`/v1/wallets/${walletId}/polymarket/positions`);
      return toToolResult(result);
    },
  );

  // pm_get_orders
  server.tool(
    'waiaas_pm_get_orders',
    withWalletPrefix('Get Polymarket CLOB orders for a wallet.', walletContext?.walletName),
    {
      wallet_id: z.string().optional().describe('Wallet ID. Auto-resolved for single-wallet sessions.'),
      status: z.enum(['LIVE', 'MATCHED', 'CANCELLED']).optional().describe('Filter by order status.'),
    },
    async (args) => {
      const walletId = args.wallet_id || 'default';
      const params = new URLSearchParams();
      if (args.status) params.set('status', args.status);
      const qs = params.toString();
      const result = await apiClient.get(`/v1/wallets/${walletId}/polymarket/orders${qs ? '?' + qs : ''}`);
      return toToolResult(result);
    },
  );

  // pm_get_markets
  server.tool(
    'waiaas_pm_get_markets',
    'Browse Polymarket prediction markets with optional filters.',
    {
      category: z.string().optional().describe('Market category filter.'),
      status: z.string().optional().describe('Market status filter (e.g., active, resolved).'),
      keyword: z.string().optional().describe('Search keyword.'),
      limit: z.string().optional().describe('Maximum number of markets to return.'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.category) params.set('category', args.category);
      if (args.status) params.set('status', args.status);
      if (args.keyword) params.set('keyword', args.keyword);
      if (args.limit) params.set('limit', args.limit);
      const qs = params.toString();
      const result = await apiClient.get(`/v1/polymarket/markets${qs ? '?' + qs : ''}`);
      return toToolResult(result);
    },
  );

  // pm_get_market_detail
  server.tool(
    'waiaas_pm_get_market_detail',
    'Get detailed information about a specific Polymarket prediction market.',
    {
      condition_id: z.string().describe('Market condition ID.'),
    },
    async (args) => {
      const result = await apiClient.get(`/v1/polymarket/markets/${args.condition_id}`);
      return toToolResult(result);
    },
  );

  // pm_get_events
  server.tool(
    'waiaas_pm_get_events',
    'Get Polymarket events (groups of related markets).',
    {
      category: z.string().optional().describe('Event category filter.'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.category) params.set('category', args.category);
      const qs = params.toString();
      const result = await apiClient.get(`/v1/polymarket/events${qs ? '?' + qs : ''}`);
      return toToolResult(result);
    },
  );

  // pm_get_balance
  server.tool(
    'waiaas_pm_get_balance',
    withWalletPrefix('Get Polymarket USDC.e balance and CTF token positions for a wallet.', walletContext?.walletName),
    {
      wallet_id: z.string().optional().describe('Wallet ID. Auto-resolved for single-wallet sessions.'),
    },
    async (args) => {
      const walletId = args.wallet_id || 'default';
      const result = await apiClient.get(`/v1/wallets/${walletId}/polymarket/balance`);
      return toToolResult(result);
    },
  );

  // pm_get_pnl
  server.tool(
    'waiaas_pm_get_pnl',
    withWalletPrefix('Get Polymarket profit and loss summary for a wallet.', walletContext?.walletName),
    {
      wallet_id: z.string().optional().describe('Wallet ID. Auto-resolved for single-wallet sessions.'),
    },
    async (args) => {
      const walletId = args.wallet_id || 'default';
      const result = await apiClient.get(`/v1/wallets/${walletId}/polymarket/pnl`);
      return toToolResult(result);
    },
  );

  // pm_setup
  server.tool(
    'waiaas_pm_setup',
    withWalletPrefix('Set up Polymarket API keys and optional CTF contract approval for a wallet.', walletContext?.walletName),
    {
      wallet_id: z.string().describe('Wallet ID (required).'),
      auto_approve: z.boolean().optional().describe('Automatically approve CTF contracts.'),
    },
    async (args) => {
      const walletId = args.wallet_id;
      const body: Record<string, unknown> = {};
      if (args.auto_approve !== undefined) body.auto_approve = args.auto_approve;
      const result = await apiClient.post(`/v1/wallets/${walletId}/polymarket/setup`, body);
      return toToolResult(result);
    },
  );
}
