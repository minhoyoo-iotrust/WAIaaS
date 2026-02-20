/**
 * Action Provider -> MCP Tool auto-conversion (ACTNP-05, ACTNP-06).
 *
 * Fetches mcpExpose=true providers from daemon REST API and registers
 * each action as an MCP tool with naming convention: action_{provider}_{action}.
 *
 * Degraded mode: if REST fetch fails, returns empty Map (14 built-in tools
 * remain available).
 *
 * RegisteredTool references are stored for potential future remove() calls.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

// -- Provider/Action response types (mirrors GET /v1/actions/providers) --

interface ActionDefinitionResponse {
  name: string;
  description: string;
  chain: string;
  riskLevel: string;
  defaultTier: string;
}

interface ProviderResponse {
  name: string;
  description: string;
  version: string;
  chains: string[];
  mcpExpose: boolean;
  requiresApiKey: boolean;
  hasApiKey: boolean;
  actions: ActionDefinitionResponse[];
}

interface ProvidersListResponse {
  providers: ProviderResponse[];
}

/**
 * Fetch mcpExpose=true action providers from daemon and register each action
 * as an MCP tool. Returns Map<toolName, RegisteredTool> for future removal.
 *
 * Must be called AFTER sessionManager.start() so API calls have valid token.
 * Must be called AFTER server.connect() -- server.tool() after connect()
 * automatically fires sendToolListChanged().
 */
export async function registerActionProviderTools(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): Promise<Map<string, RegisteredTool>> {
  const registered = new Map<string, RegisteredTool>();

  // 1. Fetch providers from daemon REST API
  const result = await apiClient.get<ProvidersListResponse>('/v1/actions/providers');

  if (!result.ok) {
    // Degraded mode: action provider tools not available, 14 built-in tools still work
    console.error('[waiaas-mcp] Failed to fetch action providers, skipping dynamic tool registration');
    return registered;
  }

  // 2. Filter mcpExpose=true providers and collect actions
  const exposedProviders = result.data.providers.filter((p) => p.mcpExpose);

  // 3. Register each action as MCP tool
  for (const provider of exposedProviders) {
    for (const action of provider.actions) {
      const toolName = `action_${provider.name}_${action.name}`;
      const description = withWalletPrefix(
        `[${provider.name}] ${action.description} (chain: ${action.chain}, risk: ${action.riskLevel})`,
        walletContext?.walletName,
      );

      const tool = server.tool(
        toolName,
        description,
        {
          params: z.record(z.unknown()).optional()
            .describe('Action-specific parameters as key-value pairs'),
          network: z.string().optional()
            .describe('Target network. Defaults to wallet default network.'),
          wallet_id: z.string().optional()
            .describe('Target wallet ID. Omit to use the default wallet.'),
        },
        async (args) => {
          const body: Record<string, unknown> = {};
          if (args.params) body.params = args.params;
          if (args.network) body.network = args.network;
          if (args.wallet_id) body.walletId = args.wallet_id;
          const res = await apiClient.post(
            `/v1/actions/${provider.name}/${action.name}`,
            body,
          );
          return toToolResult(res);
        },
      );

      registered.set(toolName, tool);
    }
  }

  if (registered.size > 0) {
    console.error(`[waiaas-mcp] Registered ${registered.size} action provider tools`);
  }

  return registered;
}
