/**
 * resolve_asset tool: Resolve a CAIP-19 asset identifier to token metadata.
 *
 * Parses the CAIP-19 string locally, then queries the daemon's token registry
 * to check if the asset is registered. Returns full metadata for registered
 * tokens, or partial info (address from CAIP-19, decimals/symbol null) for
 * unregistered tokens.
 *
 * Native assets (slip44 namespace) return isNative=true with address=null.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';

/**
 * Parse a CAIP-19 asset identifier into its components.
 *
 * Format: {chainId}/{assetNamespace}:{assetReference}
 * Examples:
 *   - eip155:1/erc20:0xa0b8... -> chainId=eip155:1, namespace=erc20, ref=0xa0b8...
 *   - eip155:1/slip44:60 -> chainId=eip155:1, namespace=slip44, ref=60
 *   - solana:5eykt.../token:EPjFW... -> chainId=solana:5eykt..., namespace=token, ref=EPjFW...
 */
function parseAssetIdLocal(assetId: string): {
  chainId: string;
  namespace: string;
  reference: string;
  isNative: boolean;
  address: string | null;
} | null {
  const slashIdx = assetId.indexOf('/');
  if (slashIdx === -1) return null;

  const chainId = assetId.substring(0, slashIdx);
  const assetPart = assetId.substring(slashIdx + 1);

  const colonIdx = assetPart.indexOf(':');
  if (colonIdx === -1) return null;

  const namespace = assetPart.substring(0, colonIdx);
  const reference = assetPart.substring(colonIdx + 1);

  if (!chainId || !namespace || !reference) return null;

  const isNative = namespace === 'slip44';
  const address = isNative ? null : reference;

  return { chainId, namespace, reference, isNative, address };
}

export function registerResolveAsset(server: McpServer, apiClient: ApiClient): void {
  server.tool(
    'resolve_asset',
    'Resolve a CAIP-19 asset identifier to token metadata. Returns address, decimals, symbol, name, network, chainId, isNative, isRegistered.',
    {
      asset_id: z.string().describe(
        'CAIP-19 asset identifier (e.g., "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "eip155:1/slip44:60")',
      ),
    },
    async (args) => {
      const parsed = parseAssetIdLocal(args.asset_id);
      if (!parsed) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              code: 'INVALID_CAIP19',
              message: `Invalid CAIP-19 format: "${args.asset_id}". Expected format: {chainId}/{namespace}:{reference}`,
            }),
          }],
          isError: true,
        };
      }

      const { chainId, isNative, address } = parsed;

      // For native assets, we can return immediately without registry lookup
      if (isNative) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              assetId: args.asset_id,
              chainId,
              network: chainId,
              address: null,
              decimals: null,
              symbol: null,
              name: null,
              isNative: true,
              isRegistered: false,
            }),
          }],
        };
      }

      // Query the daemon's token registry using the CAIP-2 chainId as network
      const registryResult = await apiClient.get(
        `/v1/tokens?network=${encodeURIComponent(chainId)}`,
      );

      if (!registryResult.ok) {
        // Registry lookup failed -- return partial info from CAIP-19 parsing
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              assetId: args.asset_id,
              chainId,
              network: chainId,
              address,
              decimals: null,
              symbol: null,
              name: null,
              isNative: false,
              isRegistered: false,
            }),
          }],
        };
      }

      // Search registry for matching token by address
      const data = registryResult.data as {
        tokens?: Array<{
          address: string;
          symbol: string;
          name: string;
          decimals: number;
          [key: string]: unknown;
        }>;
      };

      const tokens = data.tokens ?? [];
      const normalizedAddress = address?.toLowerCase() ?? '';
      const match = tokens.find(
        (t) => t.address.toLowerCase() === normalizedAddress,
      );

      if (match) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              assetId: args.asset_id,
              chainId,
              network: chainId,
              address: match.address,
              decimals: match.decimals,
              symbol: match.symbol,
              name: match.name,
              isNative: false,
              isRegistered: true,
            }),
          }],
        };
      }

      // Token not found in registry
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            assetId: args.asset_id,
            chainId,
            network: chainId,
            address,
            decimals: null,
            symbol: null,
            name: null,
            isNative: false,
            isRegistered: false,
          }),
        }],
      };
    },
  );
}
