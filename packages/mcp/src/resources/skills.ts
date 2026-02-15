/**
 * waiaas://skills/{name} resource template: WAIaaS API skill reference files.
 *
 * Exposes 7 skill files (quickstart, wallet, transactions, policies, admin, actions, x402)
 * as MCP resources that AI agents can read for in-context API reference.
 */

import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toResourceResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

const SKILL_NAMES = ['quickstart', 'wallet', 'transactions', 'policies', 'admin', 'actions', 'x402'] as const;

export function registerSkillResources(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  const skillTemplate = new ResourceTemplate('waiaas://skills/{name}', {
    list: async () => ({
      resources: SKILL_NAMES.map((name) => ({
        uri: `waiaas://skills/${name}`,
        name: `${name} skill`,
        description: withWalletPrefix(`API reference: ${name}`, walletContext?.walletName),
        mimeType: 'text/markdown',
      })),
    }),
  });

  server.resource(
    'API Skills',
    skillTemplate,
    {
      description: withWalletPrefix('WAIaaS API skill reference files', walletContext?.walletName),
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const name = variables.name as string;
      const result = await apiClient.get<{ name: string; content: string }>(`/v1/skills/${name}`);

      if (result.ok) {
        return {
          contents: [{
            uri: uri.href,
            text: result.data.content,
            mimeType: 'text/markdown',
          }],
        };
      }

      return toResourceResult(uri.href, result);
    },
  );
}
