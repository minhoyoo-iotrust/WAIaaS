/**
 * ERC-8004 Registration File builder.
 *
 * Generates the agent registration file JSON per ERC-8004 spec (IDEN-05).
 * The registration file declares agent services, identity, and trust capabilities.
 *
 * Reference: https://eips.ethereum.org/EIPS/eip-8004#registration-v1
 */

/** Options for building a registration file. */
export interface RegistrationFileOptions {
  /** Agent display name. */
  name: string;
  /** Optional agent description. */
  description?: string;
  /** Additional service endpoints to include. */
  services?: Array<{ name: string; endpoint: string; version?: string }>;
  /** On-chain agent ID (if registered). */
  agentId?: string;
  /** EVM chain ID (default: 1 for Ethereum mainnet). */
  chainId?: number;
  /** Identity Registry contract address. */
  identityRegistryAddress?: string;
  /** Daemon base URL for auto-generating MCP/REST service entries. */
  baseUrl?: string;
}

/**
 * Build an ERC-8004 registration file JSON.
 *
 * Automatically includes MCP and REST API service endpoints when baseUrl
 * is provided. Additional services from options.services are appended.
 */
export function buildRegistrationFile(
  options: RegistrationFileOptions,
): Record<string, unknown> {
  const services: Array<{ name: string; endpoint: string; version?: string }> = [];

  // Auto-add WAIaaS daemon endpoints when baseUrl is available
  if (options.baseUrl) {
    const base = options.baseUrl.replace(/\/$/, ''); // trim trailing slash
    services.push(
      { name: 'mcp', endpoint: `${base}/mcp`, version: '1.0.0' },
      { name: 'rest-api', endpoint: `${base}/v1`, version: '1.0.0' },
    );
  }

  // Append user-provided additional services
  if (options.services) {
    services.push(...options.services);
  }

  const file: Record<string, unknown> = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: options.name,
    description: options.description || 'WAIaaS-managed AI agent wallet',
    services,
    active: true,
    supportedTrust: ['reputation'],
  };

  // Include registration info if agent is registered on-chain
  if (options.agentId && options.identityRegistryAddress) {
    const chainId = options.chainId ?? 1;
    file.registrations = [
      {
        agentId: options.agentId,
        agentRegistry: `eip155:${chainId}:${options.identityRegistryAddress}`,
      },
    ];
  }

  return file;
}
