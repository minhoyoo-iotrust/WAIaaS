/**
 * Asset resolve middleware: resolves token metadata from CAIP-19 assetId.
 *
 * When a request includes `token.assetId`:
 * 1. Parses CAIP-19 to extract chainId + address
 * 2. Validates network consistency (assetId network vs request network)
 * 3. Infers network from assetId when request network is undefined
 * 4. Looks up token registry for decimals/symbol
 * 5. Returns resolved token with all fields populated
 *
 * @see Phase 408 - CAIP-19 Asset Input + Resolve
 */
import { WAIaaSError, parseAssetId } from '@waiaas/core';
import type { TokenRegistryService } from '../../infrastructure/token-registry/token-registry-service.js';

export interface ResolvedToken {
  address: string;
  decimals?: number;
  symbol?: string;
  assetId: string;
}

export interface ResolveResult {
  token: ResolvedToken & Record<string, unknown>;
  network: string | undefined;
}

/**
 * Resolve token metadata from CAIP-19 assetId using the token registry.
 *
 * @param token - Token info from request (may have assetId only)
 * @param network - Request network (may be undefined for auto-inference)
 * @param tokenRegistry - Token registry service for metadata lookup
 * @returns Resolved token with address/decimals/symbol populated + inferred network
 */
export async function resolveTokenFromAssetId(
  token: { assetId?: string; address?: string; decimals?: number; symbol?: string } & Record<string, unknown>,
  network: string | undefined,
  tokenRegistry: TokenRegistryService,
): Promise<ResolveResult> {
  // No assetId: passthrough (legacy mode)
  if (!token.assetId) {
    return {
      token: token as ResolvedToken & Record<string, unknown>,
      network,
    };
  }

  // Parse CAIP-19
  const parsed = parseAssetId(token.assetId);

  // Native assets (slip44) should use TRANSFER type, not TOKEN_TRANSFER
  if (parsed.isNative) {
    throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
      message: 'Native assets do not use TokenInfo; use TRANSFER type instead',
    });
  }

  // Network mismatch check
  if (network && network !== parsed.network) {
    throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
      message: `assetId network mismatch: assetId resolves to '${parsed.network}' but request network is '${network}'`,
    });
  }

  // Infer network from assetId when not provided
  const resolvedNetwork = network ?? parsed.network;

  // Address cross-validation
  if (token.address) {
    if (token.address.toLowerCase() !== parsed.address!.toLowerCase()) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: `assetId address '${parsed.address}' does not match provided address '${token.address}'`,
      });
    }
  }

  // Set address from assetId if not provided
  const resolvedAddress = token.address ?? parsed.address!;

  // Look up registry for decimals/symbol
  let resolvedDecimals = token.decimals;
  let resolvedSymbol = token.symbol;

  const registryTokens = await tokenRegistry.getTokensForNetwork(resolvedNetwork);
  const registryMatch = registryTokens.find(
    (t) => t.address.toLowerCase() === resolvedAddress.toLowerCase(),
  );

  if (registryMatch) {
    // Only fill in missing fields (user-provided values take precedence)
    if (resolvedDecimals === undefined) {
      resolvedDecimals = registryMatch.decimals;
    }
    if (!resolvedSymbol) {
      resolvedSymbol = registryMatch.symbol;
    }
  }

  return {
    token: {
      ...token,
      address: resolvedAddress,
      decimals: resolvedDecimals,
      symbol: resolvedSymbol,
      assetId: token.assetId,
    },
    network: resolvedNetwork,
  };
}
