/**
 * Action Provider -> MCP Tool auto-conversion (ACTNP-05, ACTNP-06).
 *
 * Fetches mcpExpose=true providers from daemon REST API and registers
 * each action as an MCP tool with naming convention: action_{provider}_{action}.
 *
 * Phase 404: When inputSchema JSON is available in the provider response,
 * individual typed parameters are registered instead of generic params bag.
 *
 * Degraded mode: if REST fetch fails, returns empty Map (14 built-in tools
 * remain available).
 *
 * RegisteredTool references are stored for potential future remove() calls.
 */

import { z } from 'zod';
import type { ZodTypeAny } from 'zod';
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
  inputSchema?: Record<string, unknown>;
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

// ---------------------------------------------------------------------------
// JSON Schema -> Zod params converter
// ---------------------------------------------------------------------------

/** JSON Schema type -> Zod type mapping */
const JSON_SCHEMA_TYPE_MAP: Record<string, () => ZodTypeAny> = {
  string: () => z.string(),
  number: () => z.number(),
  integer: () => z.number(),
  boolean: () => z.boolean(),
  array: () => z.array(z.unknown()),
};

/**
 * Convert a JSON Schema's properties into a flat Record<string, ZodTypeAny>
 * suitable for MCP tool schema registration.
 *
 * Returns null if the schema has no properties or is invalid.
 *
 * @param jsonSchema - JSON Schema object with properties/required fields
 * @returns Record of field name -> Zod schema, or null if empty
 */
export function jsonSchemaToZodParams(
  jsonSchema: Record<string, unknown>,
): Record<string, ZodTypeAny> | null {
  const properties = jsonSchema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties || Object.keys(properties).length === 0) return null;

  const required = new Set<string>(
    Array.isArray(jsonSchema.required) ? (jsonSchema.required as string[]) : [],
  );

  const result: Record<string, ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(properties)) {
    const type = prop.type as string | undefined;
    const factory = type ? JSON_SCHEMA_TYPE_MAP[type] : undefined;
    let zodField: ZodTypeAny = factory ? factory() : z.unknown();

    // Apply description
    const desc = prop.description as string | undefined;
    if (desc) {
      zodField = zodField.describe(desc);
    }

    // Make optional if not required
    if (!required.has(key)) {
      zodField = zodField.optional();
    }

    result[key] = zodField;
  }

  return result;
}

// -- Common MCP fields shared across all action tools --

const COMMON_MCP_FIELDS = {
  network: z.string().optional()
    .describe('Target network. Required for EVM wallets; auto-resolved for Solana.'),
  wallet_id: z.string().optional()
    .describe('Target wallet ID. Required for multi-wallet sessions; auto-resolved when session has a single wallet.'),
  gas_condition: z.object({
    max_gas_price: z.string().optional().describe('Max gas price in wei (EVM baseFee+priorityFee)'),
    max_priority_fee: z.string().optional().describe('Max priority fee in wei (EVM) or micro-lamports (Solana)'),
    timeout: z.number().optional().describe('Max wait time in seconds (60-86400)'),
  }).optional().describe('Gas price condition for deferred execution. At least one of max_gas_price or max_priority_fee required.'),
};

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

      // Try to build typed schema from inputSchema JSON
      let typedParams: Record<string, ZodTypeAny> | null = null;
      try {
        if (action.inputSchema && typeof action.inputSchema === 'object') {
          typedParams = jsonSchemaToZodParams(action.inputSchema);
        }
      } catch {
        // Conversion failed -- fall through to generic params
        console.error(`[waiaas-mcp] Failed to convert inputSchema for ${toolName}, using generic params`);
      }

      if (typedParams) {
        // Typed schema: individual fields + common MCP fields
        const schema: Record<string, ZodTypeAny> = {
          ...typedParams,
          ...COMMON_MCP_FIELDS,
        };

        // Collect typed field names for handler extraction
        const typedFieldNames = Object.keys(typedParams);

        const tool = server.tool(
          toolName,
          description,
          schema,
          async (args: Record<string, unknown>) => {
            const body: Record<string, unknown> = {};

            // Collect typed fields into params object for REST API
            const params: Record<string, unknown> = {};
            for (const field of typedFieldNames) {
              if (args[field] !== undefined) {
                params[field] = args[field];
              }
            }
            if (Object.keys(params).length > 0) body.params = params;

            // Handle common fields
            if (args.network) body.network = args.network;
            if (args.wallet_id) body.walletId = args.wallet_id;
            if (args.gas_condition) {
              const gc = args.gas_condition as Record<string, unknown>;
              body.gasCondition = {
                maxGasPrice: gc.max_gas_price,
                maxPriorityFee: gc.max_priority_fee,
                timeout: gc.timeout,
              };
            }
            const res = await apiClient.post(
              `/v1/actions/${provider.name}/${action.name}`,
              body,
            );
            return toToolResult(res);
          },
        );

        registered.set(toolName, tool);
      } else {
        // Fallback: generic params bag
        const tool = server.tool(
          toolName,
          description,
          {
            params: z.record(z.string(), z.unknown()).optional()
              .describe('Action-specific parameters as key-value pairs'),
            ...COMMON_MCP_FIELDS,
          },
          async (args: Record<string, unknown>) => {
            const body: Record<string, unknown> = {};
            if (args.params) body.params = args.params;
            if (args.network) body.network = args.network;
            if (args.wallet_id) body.walletId = args.wallet_id;
            if (args.gas_condition) {
              const gc = args.gas_condition as Record<string, unknown>;
              body.gasCondition = {
                maxGasPrice: gc.max_gas_price,
                maxPriorityFee: gc.max_priority_fee,
                timeout: gc.timeout,
              };
            }
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
  }

  if (registered.size > 0) {
    console.error(`[waiaas-mcp] Registered ${registered.size} action provider tools`);
  }

  return registered;
}
