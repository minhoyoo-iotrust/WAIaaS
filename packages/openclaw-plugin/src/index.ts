/**
 * @waiaas/openclaw-plugin
 *
 * Registers ~22 sessionAuth WAIaaS tools with an OpenClaw Gateway.
 * Does NOT register any masterAuth tools.
 *
 * Usage (openclaw.plugin.json entry: "./dist/index.js"):
 *   The register() function is called by OpenClaw with a PluginApi instance.
 *   Config must include: { sessionToken: string, daemonUrl: string }
 */

import type { PluginApi } from './config.js';
import { resolveConfig } from './config.js';
import { createClient } from './client.js';
import { registerWalletTools } from './tools/wallet.js';
import { registerTransferTools } from './tools/transfer.js';
import { registerDefiTools } from './tools/defi.js';
import { registerNftTools } from './tools/nft.js';
import { registerUtilityTools } from './tools/utility.js';

export function register(api: PluginApi): void {
  const config = resolveConfig(api.config);
  const client = createClient(config.daemonUrl, config.sessionToken);

  registerWalletTools(api, client);
  registerTransferTools(api, client);
  registerDefiTools(api, client);
  registerNftTools(api, client);
  registerUtilityTools(api, client);
}

export type { PluginApi, PluginToolConfig, PluginConfig } from './config.js';
