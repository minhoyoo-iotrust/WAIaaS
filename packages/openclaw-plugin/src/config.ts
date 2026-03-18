/**
 * OpenClaw plugin interface types.
 *
 * OpenClaw does not publish a types package; declare the interface locally.
 * Based on OpenClaw plugin system specification.
 */

export interface PluginToolConfig {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required?: string[];
  };
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface PluginApi {
  config: Record<string, unknown>;
  registerTool(tool: PluginToolConfig): void;
}

export interface PluginConfig {
  sessionToken: string;
  daemonUrl: string;
}

export function resolveConfig(apiConfig: Record<string, unknown>): PluginConfig {
  const sessionToken = apiConfig['sessionToken'];
  const daemonUrl = apiConfig['daemonUrl'] ?? 'http://localhost:3100';
  if (typeof sessionToken !== 'string' || !sessionToken) {
    throw new Error('WAIaaS plugin: sessionToken is required in plugin config');
  }
  if (typeof daemonUrl !== 'string') {
    throw new Error('WAIaaS plugin: daemonUrl must be a string');
  }
  return { sessionToken, daemonUrl: (daemonUrl as string).replace(/\/+$/, '') };
}
