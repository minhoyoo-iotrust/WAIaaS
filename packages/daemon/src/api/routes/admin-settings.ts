/**
 * Admin Settings route handlers: settings CRUD, test-rpc, oracle status, API keys, forex rates.
 *
 * Extracted from admin.ts for maintainability.
 */

import type { OpenAPIHono } from '@hono/zod-openapi';
import { createRoute, z } from '@hono/zod-openapi';
import { WAIaaSError, BUILT_IN_RPC_DEFAULTS } from '@waiaas/core';
import { CurrencyCodeSchema, formatRatePreview } from '@waiaas/core';
import type { CurrencyCode } from '@waiaas/core';
import { getSettingDefinition, ActionTierOverrideSchema } from '../../infrastructure/settings/index.js';
import {
  SettingsResponseSchema,
  SettingsUpdateRequestSchema,
  SettingsUpdateResponseSchema,
  TestRpcRequestSchema,
  TestRpcResponseSchema,
  OracleStatusResponseSchema,
  RpcStatusResponseSchema,
  buildErrorResponses,
} from './openapi-schemas.js';
import type { AdminRouteDeps } from './admin.js';

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const settingsGetRoute = createRoute({
  method: 'get',
  path: '/admin/settings',
  tags: ['Admin'],
  summary: 'Get all settings grouped by category',
  responses: {
    200: {
      description: 'All settings with credentials masked as boolean',
      content: { 'application/json': { schema: SettingsResponseSchema } },
    },
  },
});

const settingsPutRoute = createRoute({
  method: 'put',
  path: '/admin/settings',
  tags: ['Admin'],
  summary: 'Update settings',
  request: {
    body: {
      content: { 'application/json': { schema: SettingsUpdateRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Updated settings',
      content: { 'application/json': { schema: SettingsUpdateResponseSchema } },
    },
    ...buildErrorResponses(['ACTION_VALIDATION_FAILED']),
  },
});

const testRpcRoute = createRoute({
  method: 'post',
  path: '/admin/settings/test-rpc',
  tags: ['Admin'],
  summary: 'Test RPC endpoint connectivity',
  request: {
    body: {
      content: { 'application/json': { schema: TestRpcRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'RPC connectivity test result',
      content: { 'application/json': { schema: TestRpcResponseSchema } },
    },
  },
});

const oracleStatusRoute = createRoute({
  method: 'get',
  path: '/admin/oracle-status',
  tags: ['Admin'],
  summary: 'Get oracle cache statistics and source status',
  responses: {
    200: {
      description: 'Oracle status',
      content: { 'application/json': { schema: OracleStatusResponseSchema } },
    },
  },
});

const rpcStatusRoute = createRoute({
  method: 'get',
  path: '/admin/rpc-status',
  tags: ['Admin'],
  summary: 'Get per-network RPC pool endpoint status',
  responses: {
    200: {
      description: 'RPC pool status per network',
      content: { 'application/json': { schema: RpcStatusResponseSchema } },
    },
  },
});

// API Keys route definitions
const apiKeysListResponseSchema = z.object({
  keys: z.array(
    z.object({
      providerName: z.string(),
      hasKey: z.boolean(),
      maskedKey: z.string().nullable(),
      requiresApiKey: z.boolean(),
      updatedAt: z.string().nullable(),
    }),
  ),
});

const apiKeysListRoute = createRoute({
  method: 'get',
  path: '/admin/api-keys',
  tags: ['Admin'],
  summary: 'List Action Provider API key status',
  responses: {
    200: {
      description: 'API key status per provider',
      content: { 'application/json': { schema: apiKeysListResponseSchema } },
    },
  },
});

const apiKeyPutRoute = createRoute({
  method: 'put',
  path: '/admin/api-keys/{provider}',
  tags: ['Admin'],
  summary: 'Set or update Action Provider API key',
  request: {
    params: z.object({ provider: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({ apiKey: z.string().min(1) }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'API key saved',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            providerName: z.string(),
          }),
        },
      },
    },
  },
});

const apiKeyDeleteRoute = createRoute({
  method: 'delete',
  path: '/admin/api-keys/{provider}',
  tags: ['Admin'],
  summary: 'Delete Action Provider API key',
  request: {
    params: z.object({ provider: z.string() }),
  },
  responses: {
    200: {
      description: 'API key deleted',
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
    },
    ...buildErrorResponses(['ACTION_NOT_FOUND']),
  },
});

// Forex rates route definitions
const forexRatesQuerySchema = z.object({
  currencies: z.string().optional().openapi({
    description: 'Comma-separated currency codes (e.g. KRW,JPY,EUR). If omitted, returns empty.',
  }),
});

const forexRatesRoute = createRoute({
  method: 'get',
  path: '/admin/forex/rates',
  tags: ['Admin'],
  summary: 'Get forex exchange rates for display currencies',
  request: {
    query: forexRatesQuerySchema,
  },
  responses: {
    200: {
      description: 'Forex rates with preview strings',
      content: {
        'application/json': {
          schema: z.object({
            rates: z.record(
              z.string(),
              z.object({
                rate: z.number(),
                preview: z.string(),
              }),
            ),
          }),
        },
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Register handlers
// ---------------------------------------------------------------------------

export function registerAdminSettingsRoutes(router: OpenAPIHono, deps: AdminRouteDeps): void {
  // GET /admin/settings
  router.openapi(settingsGetRoute, async (c) => {
    if (!deps.settingsService) {
      const emptyCategory = {} as Record<string, string | boolean>;
      return c.json(
        {
          notifications: emptyCategory,
          rpc: emptyCategory,
          security: emptyCategory,
          daemon: emptyCategory,
          walletconnect: emptyCategory,
          oracle: emptyCategory,
          display: emptyCategory,
          autostop: emptyCategory,
          monitoring: emptyCategory,
          telegram: emptyCategory,
          signing_sdk: emptyCategory,
          gas_condition: emptyCategory,
        },
        200,
      );
    }

    const masked = deps.settingsService.getAllMasked() as z.infer<typeof SettingsResponseSchema>;
    return c.json(masked, 200);
  });

  // PUT /admin/settings
  router.openapi(settingsPutRoute, async (c) => {
    const body = c.req.valid('json');
    const entries = body.settings;

    // Validate all keys exist in SETTING_DEFINITIONS (or dynamic tier pattern)
    for (const entry of entries) {
      const def = getSettingDefinition(entry.key);
      if (!def) {
        throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
          message: `Unknown setting key: ${entry.key}`,
        });
      }
      // [Phase 331] Validate tier override values
      if (entry.key.startsWith('actions.') && entry.key.endsWith('_tier')) {
        const parsed = ActionTierOverrideSchema.safeParse(entry.value);
        if (!parsed.success) {
          throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
            message: `Invalid tier value '${entry.value}' for key '${entry.key}'. Must be one of: INSTANT, NOTIFY, DELAY, APPROVAL, or empty string.`,
          });
        }
      }
    }

    if (!deps.settingsService) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'Settings service not available',
      });
    }

    // Persist all values
    deps.settingsService.setMany(entries);

    // Notify hot-reload callback if provided
    if (deps.onSettingsChanged) {
      deps.onSettingsChanged(entries.map((e) => e.key));
    }

    const masked = deps.settingsService.getAllMasked() as z.infer<typeof SettingsResponseSchema>;
    return c.json(
      {
        updated: entries.length,
        settings: masked,
      },
      200,
    );
  });

  // POST /admin/settings/test-rpc
  router.openapi(testRpcRoute, async (c) => {
    const body = c.req.valid('json');
    const { url, chain } = body;

    const rpcMethod = chain === 'solana' ? 'getBlockHeight' : 'eth_blockNumber';
    const rpcBody = JSON.stringify({
      jsonrpc: '2.0',
      method: rpcMethod,
      params: [],
      id: 1,
    });

    const startMs = performance.now();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: rpcBody,
        signal: AbortSignal.timeout(5000),
      });

      const latencyMs = Math.round(performance.now() - startMs);
      const result = (await response.json()) as {
        result?: unknown;
        error?: { message?: string };
      };

      if (result.error) {
        return c.json(
          {
            success: false,
            latencyMs,
            error: result.error.message ?? 'RPC error',
          },
          200,
        );
      }

      // Parse block number from result
      let blockNumber: number | undefined;
      if (chain === 'solana') {
        blockNumber = typeof result.result === 'number' ? result.result : undefined;
      } else {
        // eth_blockNumber returns hex string
        blockNumber =
          typeof result.result === 'string'
            ? parseInt(result.result, 16)
            : undefined;
      }

      return c.json(
        {
          success: true,
          latencyMs,
          blockNumber,
        },
        200,
      );
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startMs);
      const errorMessage = err instanceof Error ? err.message : String(err);

      return c.json(
        {
          success: false,
          latencyMs,
          error: errorMessage,
        },
        200,
      );
    }
  });

  // GET /admin/oracle-status
  router.openapi(oracleStatusRoute, async (c) => {
    const stats = deps.priceOracle?.getCacheStats() ?? { hits: 0, misses: 0, staleHits: 0, size: 0, evictions: 0 };
    return c.json(
      {
        cache: stats,
        sources: {
          pyth: {
            available: !!deps.priceOracle,
            baseUrl: 'https://hermes.pyth.network',
          },
          coingecko: {
            available: deps.oracleConfig?.coingeckoApiKeyConfigured ?? false,
            apiKeyConfigured: deps.oracleConfig?.coingeckoApiKeyConfigured ?? false,
          },
        },
        crossValidation: {
          enabled: deps.oracleConfig?.coingeckoApiKeyConfigured ?? false,
          threshold: deps.oracleConfig?.crossValidationThreshold ?? 5,
        },
      },
      200,
    );
  });

  // GET /admin/api-keys
  router.openapi(apiKeysListRoute, async (c) => {
    const registry = deps.actionProviderRegistry;
    const ss = deps.settingsService;

    if (!registry) {
      return c.json({ keys: [] }, 200);
    }

    const providers = registry.listProviders();
    const keys = providers.map((p) => {
      const hasKey = ss ? ss.hasApiKey(p.name) : false;
      const maskedKey = ss ? ss.getApiKeyMasked(p.name) : null;
      const updatedAt = ss ? ss.getApiKeyUpdatedAt(p.name) : null;
      return {
        providerName: p.name,
        hasKey,
        maskedKey,
        requiresApiKey: p.requiresApiKey ?? false,
        updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : null,
      };
    });

    return c.json({ keys }, 200);
  });

  // PUT /admin/api-keys/:provider
  router.openapi(apiKeyPutRoute, async (c) => {
    const { provider } = c.req.valid('param');
    const body = c.req.valid('json');

    if (!deps.settingsService) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'Settings service not available',
      });
    }

    const settingKey = `actions.${provider}_api_key`;
    deps.settingsService.setApiKey(provider, body.apiKey);

    // Trigger hot-reload so providers pick up the new key immediately
    if (deps.onSettingsChanged) {
      deps.onSettingsChanged([settingKey]);
    }

    return c.json({ success: true, providerName: provider }, 200);
  });

  // DELETE /admin/api-keys/:provider
  router.openapi(apiKeyDeleteRoute, async (c) => {
    const { provider } = c.req.valid('param');

    if (!deps.settingsService) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'Settings service not available',
      });
    }

    // Check if key exists before "deleting"
    if (!deps.settingsService.hasApiKey(provider)) {
      throw new WAIaaSError('ACTION_NOT_FOUND', {
        message: `No API key found for provider '${provider}'`,
        details: { providerName: provider },
      });
    }

    const settingKey = `actions.${provider}_api_key`;
    deps.settingsService.setApiKey(provider, '');

    // Trigger hot-reload
    if (deps.onSettingsChanged) {
      deps.onSettingsChanged([settingKey]);
    }

    return c.json({ success: true }, 200);
  });

  // GET /admin/forex/rates
  router.openapi(forexRatesRoute, async (c) => {
    const { currencies: currenciesParam } = c.req.valid('query');
    const rates: Record<string, { rate: number; preview: string }> = {};

    if (!currenciesParam || !deps.forexRateService) {
      return c.json({ rates }, 200);
    }

    // Parse comma-separated currency codes, validate each
    const codes = currenciesParam
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => CurrencyCodeSchema.safeParse(s).success) as CurrencyCode[];

    if (codes.length === 0) {
      return c.json({ rates }, 200);
    }

    const rateMap = await deps.forexRateService.getRates(codes);
    for (const [code, forexRate] of rateMap) {
      rates[code] = {
        rate: forexRate.rate,
        preview: formatRatePreview(forexRate.rate, code),
      };
    }

    return c.json({ rates }, 200);
  });

  // GET /admin/rpc-status
  router.openapi(rpcStatusRoute, async (c) => {
    const networks: Record<string, { url: string; status: 'available' | 'cooldown'; failureCount: number; cooldownRemainingMs: number }[]> = {};

    if (deps.rpcPool) {
      for (const network of deps.rpcPool.getNetworks()) {
        networks[network] = deps.rpcPool.getStatus(network);
      }
    }

    // Provide built-in URL defaults so Admin UI doesn't need hardcoded mirror (#197)
    const builtinUrls: Record<string, string[]> = {};
    for (const [network, urls] of Object.entries(BUILT_IN_RPC_DEFAULTS)) {
      builtinUrls[network] = [...urls];
    }

    return c.json({ networks, builtinUrls }, 200);
  });
}
