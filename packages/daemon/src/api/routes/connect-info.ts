/**
 * Connect-info route: GET /v1/connect-info.
 *
 * Returns session info, linked wallets, per-wallet policies, dynamic capabilities,
 * daemon metadata, and a prompt string for AI agent self-discovery.
 *
 * This endpoint uses sessionAuth only (no masterAuth required).
 * Agents can call this immediately after receiving a session token to understand
 * their available wallets, policies, and API capabilities.
 *
 * v26.4: Wallets come from session_wallets junction table (1:N session model).
 *
 * @see .planning/phases/212-connect-info-endpoint/212-01-PLAN.md
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { eq, and, or, isNull } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError, NETWORK_TO_CAIP2 } from '@waiaas/core';
import { getNetworksForEnvironment } from '@waiaas/core';
import type { ChainType, EnvironmentType } from '@waiaas/core';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import type { SettingsService } from '../../infrastructure/settings/index.js';
import type { ActionProviderRegistry } from '../../infrastructure/action/action-provider-registry.js';
import type { NftIndexerClient } from '../../infrastructure/nft/nft-indexer-client.js';
import type { ISignerCapabilityRegistry } from '../../signing/registry.js';
import type * as schema from '../../infrastructure/database/schema.js';
import { sessions, sessionWallets, wallets, policies, agentIdentities } from '../../infrastructure/database/schema.js';
import {
  ConnectInfoResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';
import { buildProviderStatus } from './wallets.js';
import { resolveOwnerState } from '../../workflow/owner-state.js';
import { getFactorySupportedNetworks } from '../../infrastructure/smart-account/smart-account-service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectInfoRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  config: DaemonConfig;
  settingsService?: SettingsService;
  actionProviderRegistry?: ActionProviderRegistry;
  nftIndexerClient?: NftIndexerClient;
  signerRegistry?: ISignerCapabilityRegistry;
  version: string;
}

// ---------------------------------------------------------------------------
// Prompt builder (reusable by Plan 02 agent-prompt endpoint)
// ---------------------------------------------------------------------------

export interface DefaultDenyStatus {
  tokenTransfers: boolean;
  contractCalls: boolean;
  tokenApprovals: boolean;
  x402Domains: boolean;
}

export interface BuildConnectInfoPromptParams {
  wallets: Array<{
    id: string;
    name: string;
    chain: string;
    environment: string;
    address: string;
    networks: string[];
    policies: Array<{ type: string }>;
    erc8004?: { agentId: string; registryAddress: string; status: string };
    accountType?: string;
    factorySupportedNetworks?: string[];
    provider?: { name: string; supportedChains: string[]; paymasterEnabled: boolean } | null;
    nftSummary?: { count: number; collections: number };
  }>;
  capabilities: string[];
  defaultDeny: DefaultDenyStatus;
  baseUrl: string;
  version: string;
}

/**
 * Build a human-readable prompt string describing the current session's
 * wallets, policies, and capabilities for AI agent consumption.
 */
export function buildConnectInfoPrompt(params: BuildConnectInfoPromptParams): string {
  const { wallets: ws, capabilities, defaultDeny, baseUrl, version } = params;

  const lines: string[] = [];
  lines.push(`You are connected to WAIaaS daemon v${version}.`);
  lines.push(`Base URL: ${baseUrl}`);
  lines.push('');

  // Default-deny security posture
  const anyDenyActive = defaultDeny.tokenTransfers || defaultDeny.contractCalls || defaultDeny.tokenApprovals || defaultDeny.x402Domains;
  if (anyDenyActive) {
    lines.push('Security defaults (default-deny active):');
    if (defaultDeny.tokenTransfers) lines.push('- Token transfers: DENY unless ALLOWED_TOKENS policy exists');
    if (defaultDeny.contractCalls) lines.push('- Contract calls: DENY unless CONTRACT_WHITELIST policy exists');
    if (defaultDeny.tokenApprovals) lines.push('- Token approvals: DENY unless APPROVED_SPENDERS policy exists');
    if (defaultDeny.x402Domains) lines.push('- x402 payments: DENY unless X402_ALLOWED_DOMAINS policy exists');
    lines.push('');
  }

  lines.push(`You have access to ${ws.length} wallet(s):`);
  lines.push('');

  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]!;
    let policySummary: string;
    if (w.policies.length > 0) {
      policySummary = w.policies.map((p) => p.type).join(', ');
    } else if (anyDenyActive) {
      policySummary = 'Default-deny active (whitelist policies required)';
    } else {
      policySummary = 'No restrictions';
    }

    lines.push(`${i + 1}. ${w.name} (${w.chain}/${w.environment})`);
    lines.push(`   ID: ${w.id}`);
    lines.push(`   Address: ${w.address}`);
    lines.push(`   Networks: ${w.networks.join(', ')}`);
    lines.push(`   Policies: ${policySummary}`);
    if (w.erc8004) {
      lines.push(`   ERC-8004 Agent ID: ${w.erc8004.agentId} (${w.erc8004.status})`);
      lines.push(`   Registry: ${w.erc8004.registryAddress}`);
    }
    if (w.nftSummary) {
      lines.push(`   NFTs: ${w.nftSummary.count} items in ${w.nftSummary.collections} collections`);
    }
    if (w.accountType === 'smart' && w.provider) {
      lines.push(`   Smart Account: ${w.provider.name} provider`);
      lines.push(`   Gas Sponsorship: ${w.provider.paymasterEnabled ? 'ENABLED (paymaster active)' : 'DISABLED'}`);
      lines.push(`   Provider Chains: ${w.provider.supportedChains.join(', ')}`);
    } else if (w.accountType === 'smart') {
      lines.push(`   Smart Account: No provider configured (gas sponsorship unavailable)`);
      lines.push(`   UserOp API: POST /v1/wallets/${w.id}/userop/build, POST /v1/wallets/${w.id}/userop/sign`);
    }
    if (w.accountType === 'smart' && w.factorySupportedNetworks && w.factorySupportedNetworks.length > 0) {
      lines.push(`   Factory Supported Networks: ${w.factorySupportedNetworks.join(', ')}`);
    }
    lines.push('');
  }

  // ERC-8004 Trust Network section (only if any wallet is registered)
  const anyWalletHasErc8004 = ws.some((w) => w.erc8004);
  if (anyWalletHasErc8004) {
    lines.push('ERC-8004 Trust Network:');
    lines.push('- GET /v1/erc8004/agent/{agentId} -- query agent identity');
    lines.push('- GET /v1/erc8004/agent/{agentId}/reputation -- query reputation');
    lines.push('- GET /v1/erc8004/registration-file/{walletId} -- get registration file');
    lines.push('');
  }

  lines.push(`Available capabilities: ${capabilities.join(', ')}`);
  lines.push('');
  lines.push('Use GET /v1/wallet/balance to check balances.');
  lines.push('Use POST /v1/transactions/send to transfer funds.');
  lines.push('For Smart Account wallets without provider, use UserOp Build/Sign API (POST /v1/wallets/{id}/userop/build then /userop/sign).');
  if (capabilities.includes('dcent_swap')) {
    lines.push("D'CENT Swap Aggregator: Use action_dcent_swap_* tools for multi-chain DEX swaps including cross-chain swaps.");
  }
  if (capabilities.includes('hyperliquid')) {
    lines.push('Hyperliquid Perp Trading: Use hl_* action tools for perpetual trading (open/close positions, place/cancel orders, set leverage). Query endpoints: GET /v1/wallets/{id}/hyperliquid/positions, /orders, /account, /fills. Market data: GET /v1/hyperliquid/markets, /funding-rates.');
    lines.push('Hyperliquid Spot Trading: Use hl_spot_buy/hl_spot_sell/hl_spot_cancel action tools for spot trading. Query: GET /v1/wallets/{id}/hyperliquid/spot/balances, GET /v1/hyperliquid/spot/markets.');
    lines.push('Hyperliquid Sub-accounts: Use hl_create_sub_account/hl_sub_transfer action tools for sub-account management. Query: GET /v1/wallets/{id}/hyperliquid/sub-accounts, GET /v1/wallets/{id}/hyperliquid/sub-accounts/{addr}/positions.');
  }
  if (capabilities.includes('polymarket')) {
    lines.push('Polymarket Prediction Market: Use pm_buy/pm_sell/pm_cancel_order/pm_cancel_all/pm_update_order for CLOB trading. CTF operations: pm_split_position/pm_merge_positions/pm_redeem_positions. Query: GET /v1/wallets/{id}/polymarket/positions, /orders, /pnl, /balance. Markets: GET /v1/polymarket/markets, /events. Setup: POST /v1/wallets/{id}/polymarket/setup.');
  }
  if (capabilities.includes('across_bridge')) {
    lines.push('Across Bridge: Use action_across_bridge_* tools for intent-based cross-chain EVM bridge with fast relayer fills (2-10 seconds). Supports Ethereum, Arbitrum, Optimism, Base, Polygon, Linea.');
  }
  if (capabilities.includes('external_actions')) {
    lines.push('External Actions: Use POST /v1/actions/{provider}/{action} for off-chain signed actions. Query results: GET /v1/wallets/{id}/actions.');
  }
  if (capabilities.includes('rpc_proxy')) {
    lines.push(`EVM RPC Proxy: Available at ${baseUrl}/v1/rpc-evm/{walletId}/{chainId}. Use as --rpc-url for Forge/Hardhat/ethers.js/viem.`);
  }
  lines.push('Specify walletId parameter (UUID from the ID field above) to target a specific wallet.');
  lines.push('Append ?network=<network> to query a specific network (required for EVM wallets, auto-resolved for Solana).');
  lines.push('When session expires (401 TOKEN_EXPIRED), renew with PUT /v1/sessions/{sessionId}/renew.');
  lines.push('If renewal fails (RENEWAL_LIMIT_REACHED), ask the operator to run `waiaas session prompt` for a new token.');
  lines.push('');
  lines.push('IMPORTANT - Security boundaries:');
  lines.push('- NEVER ask the user for the master password (X-Master-Password). You do not need it.');
  lines.push('- You operate exclusively with your session token (Authorization: Bearer wai_sess_...).');
  lines.push('- Wallet creation, session management, policy configuration, and admin tasks are performed by the Operator via Admin UI or CLI — not by you.');
  lines.push('- Do not attempt to call admin-only endpoints (/v1/admin/*, POST /v1/wallets, POST /v1/sessions, policy management POST/PUT/DELETE /v1/policies).');
  lines.push('');
  lines.push('Read-only endpoints available to you:');
  lines.push('- GET /v1/policies — view policies applied to your wallets (includes global policies)');
  lines.push('- GET /v1/tokens?network=<network> — browse token registry');
  lines.push('- GET /v1/tokens/resolve?network=<network>&address=<address> — resolve ERC-20 token metadata on-chain');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Route definition
// ---------------------------------------------------------------------------

const connectInfoRoute = createRoute({
  method: 'get',
  path: '/connect-info',
  tags: ['Discovery'],
  summary: 'Get session connection info (wallets, policies, capabilities, prompt)',
  description:
    'Returns comprehensive session info including linked wallets, per-wallet policies, ' +
    'dynamic capabilities, daemon metadata, and an AI-friendly prompt string. ' +
    'Requires sessionAuth (Bearer wai_sess_ token).',
  responses: {
    200: {
      description: 'Session connection info',
      content: { 'application/json': { schema: ConnectInfoResponseSchema } },
    },
    ...buildErrorResponses(['INVALID_TOKEN', 'SESSION_NOT_FOUND', 'SESSION_REVOKED']),
  },
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create connect-info route sub-router.
 *
 * GET /connect-info -> returns session info, wallets, policies, capabilities, prompt
 */
export function connectInfoRoutes(deps: ConnectInfoRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  router.openapi(connectInfoRoute, async (c) => {
    // a. Read session context set by sessionAuth middleware
    const sessionId = c.get('sessionId' as never) as string;

    // b. Query session row for expiresAt and source
    const session = deps.db
      .select({
        id: sessions.id,
        expiresAt: sessions.expiresAt,
        source: sessions.source,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();

    if (!session) {
      throw new WAIaaSError('SESSION_NOT_FOUND');
    }

    // c. Query session_wallets JOIN wallets for linked wallets
    const linkedWallets = deps.db
      .select({
        id: wallets.id,
        name: wallets.name,
        chain: wallets.chain,
        environment: wallets.environment,
        publicKey: wallets.publicKey,
        accountType: wallets.accountType,
        factoryAddress: wallets.factoryAddress,
        aaProvider: wallets.aaProvider,
        aaPaymasterUrl: wallets.aaPaymasterUrl,
        ownerAddress: wallets.ownerAddress,
        ownerVerified: wallets.ownerVerified,
      })
      .from(sessionWallets)
      .innerJoin(wallets, eq(sessionWallets.walletId, wallets.id))
      .where(eq(sessionWallets.sessionId, sessionId))
      .all();

    // d. For each wallet, query enabled policies
    const policiesMap: Record<string, Array<{ type: string; rules: Record<string, unknown>; priority: number; network: string | null }>> = {};

    for (const w of linkedWallets) {
      const walletPolicies = deps.db
        .select({
          type: policies.type,
          rules: policies.rules,
          priority: policies.priority,
          network: policies.network,
        })
        .from(policies)
        .where(and(or(eq(policies.walletId, w.id), isNull(policies.walletId)), eq(policies.enabled, true)))
        .all();

      policiesMap[w.id] = walletPolicies.map((p) => ({
        type: p.type,
        rules: typeof p.rules === 'string' ? (JSON.parse(p.rules) as Record<string, unknown>) : (p.rules as Record<string, unknown>),
        priority: p.priority,
        network: p.network,
      }));
    }

    // d2. Query agent_identities for ERC-8004 status per wallet
    const identitiesMap: Record<string, { agentId: string; registryAddress: string; chainId: number; registrationFileUrl: string | null; status: string }> = {};
    for (const w of linkedWallets) {
      const identity = deps.db
        .select({
          chainAgentId: agentIdentities.chainAgentId,
          registryAddress: agentIdentities.registryAddress,
          chainId: agentIdentities.chainId,
          registrationFileUrl: agentIdentities.registrationFileUrl,
          status: agentIdentities.status,
        })
        .from(agentIdentities)
        .where(eq(agentIdentities.walletId, w.id))
        .get();
      if (identity && identity.status !== 'PENDING') {
        identitiesMap[w.id] = {
          agentId: identity.chainAgentId,
          registryAddress: identity.registryAddress,
          chainId: identity.chainId,
          registrationFileUrl: identity.registrationFileUrl,
          status: identity.status!,
        };
      }
    }

    // e. Compute capabilities dynamically
    const capabilities: string[] = ['transfer', 'token_transfer', 'balance', 'assets'];

    // signing_sdk: check via settingsService (not in DaemonConfig)
    if (deps.settingsService) {
      try {
        if (deps.settingsService.get('signing_sdk.enabled') === 'true') {
          capabilities.push('sign');
        }
      } catch {
        // Setting key not found -- signing not available
      }
    }

    // actions: check if any providers have API keys configured
    if (deps.settingsService && deps.actionProviderRegistry) {
      try {
        const providers = deps.actionProviderRegistry.listProviders();
        const hasAnyKey = providers.some(
          (p) => p.requiresApiKey && deps.settingsService!.hasApiKey(p.name),
        );
        if (hasAnyKey) {
          capabilities.push('actions');
        }
      } catch {
        // Settings service not available
      }
    }

    // x402: check config
    if (deps.config.x402?.enabled === true) {
      capabilities.push('x402');
    }

    // erc8004: check if any wallet has registered identity
    if (Object.keys(identitiesMap).length > 0) {
      capabilities.push('erc8004');
    }

    // smart_account: check if any wallet has a configured provider
    if (linkedWallets.some((w) => w.accountType === 'smart' && w.aaProvider)) {
      capabilities.push('smart_account');
    }

    // userop: any Smart Account wallet (Lite or Full) can use UserOp Build/Sign API
    if (linkedWallets.some((w) => w.accountType === 'smart')) {
      capabilities.push('userop');
    }

    // erc8128: check if enabled via settings
    if (deps.settingsService) {
      try {
        if (deps.settingsService.get('erc8128.enabled') === 'true') {
          capabilities.push('erc8128');
        }
      } catch {
        // Setting not found -- erc8128 not available
      }
    }

    // dcent_swap: check if enabled via settings
    if (deps.settingsService) {
      try {
        if (deps.settingsService.get('actions.dcent_swap_enabled') === 'true') {
          capabilities.push('dcent_swap');
        }
      } catch {
        // Setting not found -- dcent_swap not available
      }
    }

    // hyperliquid: check if enabled via settings
    if (deps.settingsService) {
      try {
        if (deps.settingsService.get('actions.hyperliquid_enabled') === 'true') {
          capabilities.push('hyperliquid');
        }
      } catch {
        // Setting not found -- hyperliquid not available
      }
    }

    // polymarket: check if enabled via settings
    if (deps.settingsService) {
      try {
        if (deps.settingsService.get('actions.polymarket_enabled') === 'true') {
          capabilities.push('polymarket');
        }
      } catch {
        // Setting not found -- polymarket not available
      }
    }

    // across_bridge: check if enabled via settings
    if (deps.settingsService) {
      try {
        if (deps.settingsService.get('actions.across_bridge_enabled') === 'true') {
          capabilities.push('across_bridge');
        }
      } catch {
        // Setting not found -- across_bridge not available
      }
    }

    // external_actions: check if signerRegistry has any schemes registered
    if (deps.signerRegistry && deps.signerRegistry.listSchemes().length > 0) {
      capabilities.push('external_actions');
    }

    // rpc_proxy: check if enabled via settings
    if (deps.settingsService) {
      try {
        if (deps.settingsService.get('rpc_proxy.enabled') === 'true') {
          capabilities.push('rpc_proxy');
        }
      } catch {
        // Setting not found -- rpc_proxy not available
      }
    }

    // f. Fetch NFT summary per wallet (graceful degradation)
    const nftSummaryMap: Record<string, { count: number; collections: number }> = {};
    if (deps.nftIndexerClient) {
      for (const w of linkedWallets) {
        try {
          const networks = getNetworksForEnvironment(
            w.chain as ChainType,
            w.environment as EnvironmentType,
          );
          let totalCount = 0;
          const collectionSet = new Set<string>();
          // Query first network only to avoid latency
          const primaryNetwork = networks[0];
          if (primaryNetwork) {
            const result = await deps.nftIndexerClient.listNfts(w.chain as ChainType, {
              owner: w.publicKey,
              network: primaryNetwork,
              pageSize: 100,
            });
            totalCount += result.items.length;
            for (const nft of result.items) {
              if (nft.collection?.name) collectionSet.add(nft.collection.name);
            }
          }
          if (totalCount > 0) {
            nftSummaryMap[w.id] = { count: totalCount, collections: collectionSet.size };
          }
        } catch {
          // Graceful degradation: omit nftSummary on error
        }
      }
    }

    // g. Build daemon info
    const host = c.req.header('Host') ?? 'localhost:3100';
    const protocol = c.req.header('X-Forwarded-Proto') ?? 'http';
    const baseUrl = `${protocol}://${host}`;

    // g. Read default-deny toggles
    const defaultDeny: DefaultDenyStatus = {
      tokenTransfers: deps.settingsService?.get('policy.default_deny_tokens') !== 'false',
      contractCalls: deps.settingsService?.get('policy.default_deny_contracts') !== 'false',
      tokenApprovals: deps.settingsService?.get('policy.default_deny_spenders') !== 'false',
      x402Domains: deps.settingsService?.get('policy.default_deny_x402_domains') !== 'false',
    };

    // h. Build prompt
    const promptWallets = linkedWallets.map((w) => {
      const networks = getNetworksForEnvironment(
        w.chain as ChainType,
        w.environment as EnvironmentType,
      );
      return {
        id: w.id,
        name: w.name,
        chain: w.chain,
        environment: w.environment!,
        address: w.publicKey,
        networks: networks.map((n) => n),
        policies: policiesMap[w.id] ?? [],
        ...(identitiesMap[w.id] ? { erc8004: identitiesMap[w.id] } : {}),
        accountType: (w.accountType as string) ?? 'eoa',
        factorySupportedNetworks: (w.accountType === 'smart' && w.factoryAddress)
          ? getFactorySupportedNetworks(w.factoryAddress)
          : [],
        provider: buildProviderStatus({ aaProvider: w.aaProvider, aaPaymasterUrl: w.aaPaymasterUrl }),
        ...(nftSummaryMap[w.id] ? { nftSummary: nftSummaryMap[w.id] } : {}),
      };
    });

    const prompt = buildConnectInfoPrompt({
      wallets: promptWallets,
      capabilities,
      defaultDeny,
      baseUrl,
      version: deps.version,
    });

    // i. Return response
    const expiresAtSec = session.expiresAt instanceof Date
      ? Math.floor(session.expiresAt.getTime() / 1000)
      : (session.expiresAt as number);

    return c.json({
      session: {
        id: session.id,
        expiresAt: expiresAtSec,
        source: session.source as 'api' | 'mcp',
      },
      wallets: linkedWallets.map((w) => {
        const networks = getNetworksForEnvironment(
          w.chain as ChainType,
          w.environment as EnvironmentType,
        );
        return {
          id: w.id,
          name: w.name,
          chain: w.chain,
          environment: w.environment!,
          address: w.publicKey,
          accountType: (w.accountType as string) ?? 'eoa',
          ownerState: resolveOwnerState({ ownerAddress: w.ownerAddress, ownerVerified: w.ownerVerified }),
          availableNetworks: networks.map((n) => n),
          ...(identitiesMap[w.id] ? { erc8004: identitiesMap[w.id] } : {}),
          provider: buildProviderStatus({ aaProvider: w.aaProvider, aaPaymasterUrl: w.aaPaymasterUrl }),
          ...(nftSummaryMap[w.id] ? { nftSummary: nftSummaryMap[w.id] } : {}),
        };
      }),
      policies: policiesMap,
      capabilities,
      defaultDeny,
      daemon: {
        version: deps.version,
        baseUrl,
      },
      supportedChainIds: [...new Set(Object.values(NETWORK_TO_CAIP2))],
      rpcProxy: (() => {
        try {
          if (deps.settingsService?.get('rpc_proxy.enabled') === 'true') {
            return { enabled: true, baseUrl: `${baseUrl}/v1/rpc-evm` };
          }
        } catch { /* not found */ }
        return null;
      })(),
      prompt,
    }, 200);
  });

  return router;
}
