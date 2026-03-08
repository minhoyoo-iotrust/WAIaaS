/**
 * Hyperliquid query MCP tools (8 tools).
 *
 * Action tools (9) are auto-registered via action-provider.ts (mcpExpose=true).
 * These are the 8 read-only query tools that bypass the pipeline.
 *
 * @see HDESIGN-05: MCP tool list
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerHyperliquidTools(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  // hl_get_positions
  server.tool(
    'waiaas_hl_get_positions',
    withWalletPrefix('Get Hyperliquid perpetual positions for a wallet.', walletContext?.walletName),
    {
      wallet_id: z.string().optional().describe('Wallet ID. Auto-resolved for single-wallet sessions.'),
      sub_account: z.string().optional().describe('Sub-account address (hex).'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.wallet_id) params.set('wallet_id', args.wallet_id);
      if (args.sub_account) params.set('subAccount', args.sub_account);
      const walletId = args.wallet_id || 'default';
      const qs = params.toString();
      const result = await apiClient.get(`/v1/wallets/${walletId}/hyperliquid/positions${qs ? '?' + qs : ''}`);
      return toToolResult(result);
    },
  );

  // hl_get_open_orders
  server.tool(
    'waiaas_hl_get_open_orders',
    withWalletPrefix('Get Hyperliquid open orders for a wallet.', walletContext?.walletName),
    {
      wallet_id: z.string().optional().describe('Wallet ID.'),
      sub_account: z.string().optional().describe('Sub-account address (hex).'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.sub_account) params.set('subAccount', args.sub_account);
      const walletId = args.wallet_id || 'default';
      const qs = params.toString();
      const result = await apiClient.get(`/v1/wallets/${walletId}/hyperliquid/orders${qs ? '?' + qs : ''}`);
      return toToolResult(result);
    },
  );

  // hl_get_markets
  server.tool(
    'waiaas_hl_get_markets',
    'Get Hyperliquid perpetual market list with metadata (leverage limits, etc.).',
    {},
    async () => {
      const result = await apiClient.get('/v1/hyperliquid/markets');
      return toToolResult(result);
    },
  );

  // hl_get_funding_rates
  server.tool(
    'waiaas_hl_get_funding_rates',
    'Get funding rate history for a Hyperliquid perpetual market.',
    {
      market: z.string().describe('Market symbol (e.g., "ETH", "BTC").'),
      start_time: z.string().optional().describe('Unix timestamp to start from.'),
    },
    async (args) => {
      const params = new URLSearchParams();
      params.set('market', args.market);
      if (args.start_time) params.set('startTime', args.start_time);
      const result = await apiClient.get(`/v1/hyperliquid/funding-rates?${params.toString()}`);
      return toToolResult(result);
    },
  );

  // hl_get_account_state
  server.tool(
    'waiaas_hl_get_account_state',
    withWalletPrefix('Get Hyperliquid account state (balances, margins, positions).', walletContext?.walletName),
    {
      wallet_id: z.string().optional().describe('Wallet ID.'),
    },
    async (args) => {
      const walletId = args.wallet_id || 'default';
      const result = await apiClient.get(`/v1/wallets/${walletId}/hyperliquid/account`);
      return toToolResult(result);
    },
  );

  // hl_get_trade_history
  server.tool(
    'waiaas_hl_get_trade_history',
    withWalletPrefix('Get Hyperliquid trade history (fills) for a wallet.', walletContext?.walletName),
    {
      wallet_id: z.string().optional().describe('Wallet ID.'),
      limit: z.string().optional().describe('Maximum number of fills to return.'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.limit) params.set('limit', args.limit);
      const walletId = args.wallet_id || 'default';
      const qs = params.toString();
      const result = await apiClient.get(`/v1/wallets/${walletId}/hyperliquid/fills${qs ? '?' + qs : ''}`);
      return toToolResult(result);
    },
  );

  // hl_get_spot_balances
  server.tool(
    'waiaas_hl_get_spot_balances',
    withWalletPrefix('Get Hyperliquid spot token balances for a wallet.', walletContext?.walletName),
    {
      wallet_id: z.string().optional().describe('Wallet ID. Auto-resolved for single-wallet sessions.'),
    },
    async (args) => {
      const walletId = args.wallet_id || 'default';
      const result = await apiClient.get(`/v1/wallets/${walletId}/hyperliquid/spot/balances`);
      return toToolResult(result);
    },
  );

  // hl_get_spot_markets
  server.tool(
    'waiaas_hl_get_spot_markets',
    'Get Hyperliquid spot market list (trading pairs, token info).',
    {},
    async () => {
      const result = await apiClient.get('/v1/hyperliquid/spot/markets');
      return toToolResult(result);
    },
  );

  // hl_list_sub_accounts
  server.tool(
    'waiaas_hl_list_sub_accounts',
    withWalletPrefix('List Hyperliquid sub-accounts for a wallet.', walletContext?.walletName),
    {
      wallet_id: z.string().optional().describe('Wallet ID. Auto-resolved for single-wallet sessions.'),
    },
    async (args) => {
      const walletId = args.wallet_id || 'default';
      const result = await apiClient.get(`/v1/wallets/${walletId}/hyperliquid/sub-accounts`);
      return toToolResult(result);
    },
  );

  // hl_get_sub_positions
  server.tool(
    'waiaas_hl_get_sub_positions',
    withWalletPrefix('Get positions for a Hyperliquid sub-account.', walletContext?.walletName),
    {
      wallet_id: z.string().optional().describe('Wallet ID.'),
      sub_account: z.string().describe('Sub-account address (hex, 42 chars).'),
    },
    async (args) => {
      const walletId = args.wallet_id || 'default';
      const result = await apiClient.get(`/v1/wallets/${walletId}/hyperliquid/sub-accounts/${args.sub_account}/positions`);
      return toToolResult(result);
    },
  );
}
