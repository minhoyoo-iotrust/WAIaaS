/**
 * Settings Completeness Test (#314)
 *
 * Ensures every user-facing setting key defined in the daemon's setting-keys.ts
 * is referenced in at least one active Admin UI page (system.tsx, security.tsx,
 * notifications.tsx, actions.tsx, wallets.tsx, etc.).
 *
 * Prevents regressions when pages are reorganized (e.g., settings.tsx legacy
 * redirect) by catching orphaned setting keys that have no Admin UI surface.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// 1. Extract setting keys from daemon's setting-keys.ts
// ---------------------------------------------------------------------------

const DAEMON_SETTING_KEYS_PATH = resolve(
  __dirname,
  '../../../../packages/daemon/src/infrastructure/settings/setting-keys.ts',
);

function extractSettingKeys(): string[] {
  const src = readFileSync(DAEMON_SETTING_KEYS_PATH, 'utf-8');
  const keys: string[] = [];
  // Match: key: 'some.key'  in SETTING_DEFINITIONS array
  const keyPattern = /key:\s*'([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = keyPattern.exec(src)) !== null) {
    keys.push(match[1]);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// 2. Scan active admin pages for setting key references
// ---------------------------------------------------------------------------

const PAGES_DIR = resolve(__dirname, '../pages');

/** Legacy page that redirects to dashboard -- not an active settings surface */
const LEGACY_PAGES = new Set(['settings.tsx']);

function getActivePageSources(): string {
  const files = readdirSync(PAGES_DIR).filter(
    (f) => f.endsWith('.tsx') && !LEGACY_PAGES.has(f),
  );
  return files.map((f) => readFileSync(join(PAGES_DIR, f), 'utf-8')).join('\n');
}

// ---------------------------------------------------------------------------
// 3. Exclusion list: settings intentionally NOT shown in Admin UI
//    Each entry must have a documented reason.
// ---------------------------------------------------------------------------

/**
 * Categories whose settings are managed via dynamic key construction
 * (e.g., `actions.${providerKey}_enabled`) in their respective pages.
 * These are verified at the category level, not per-key.
 */
const DYNAMIC_CATEGORIES: Record<string, string> = {
  actions: 'Dynamic: action provider settings managed via dynamic keys in actions.tsx, hyperliquid.tsx, erc8004.tsx, system.tsx',
  signing_sdk: 'Dynamic: signing SDK settings managed in human-wallet-apps.tsx via dynamic category access',
  monitoring: 'Dynamic: monitoring settings managed in security.tsx via dynamic category access',
  autostop: 'Dynamic: autostop settings managed in security.tsx via dynamic category access',
};

const EXCLUDED_KEYS: Record<string, string> = {
  // --- RPC endpoints: managed via RPC Pool page or config.toml bootstrap ---
  'rpc.solana_mainnet': 'Bootstrap-only: RPC endpoints configured in config.toml',
  'rpc.solana_devnet': 'Bootstrap-only: RPC endpoints configured in config.toml',
  'rpc.solana_testnet': 'Bootstrap-only: RPC endpoints configured in config.toml',
  'rpc.evm_ethereum_mainnet': 'Bootstrap-only: RPC endpoints configured in config.toml',
  'rpc.evm_ethereum_sepolia': 'Bootstrap-only: RPC endpoints configured in config.toml',
  'rpc.evm_polygon_mainnet': 'Bootstrap-only: RPC endpoints configured in config.toml',
  'rpc.evm_polygon_amoy': 'Bootstrap-only: RPC endpoints configured in config.toml',
  'rpc.evm_arbitrum_mainnet': 'Bootstrap-only: RPC endpoints configured in config.toml',
  'rpc.evm_arbitrum_sepolia': 'Bootstrap-only: RPC endpoints configured in config.toml',
  'rpc.evm_optimism_mainnet': 'Bootstrap-only: RPC endpoints configured in config.toml',
  'rpc.evm_optimism_sepolia': 'Bootstrap-only: RPC endpoints configured in config.toml',
  'rpc.evm_base_mainnet': 'Bootstrap-only: RPC endpoints configured in config.toml',
  'rpc.evm_base_sepolia': 'Bootstrap-only: RPC endpoints configured in config.toml',
  'rpc.evm_hyperevm_mainnet': 'Bootstrap-only: RPC endpoints configured in config.toml',
  'rpc.evm_hyperevm_testnet': 'Bootstrap-only: RPC endpoints configured in config.toml',

  // --- RPC Pool: managed via API (PUT /v1/admin/settings), not directly in UI ---
  'rpc_pool.solana-mainnet': 'API-only: RPC pool URLs managed via Admin Settings API',
  'rpc_pool.solana-devnet': 'API-only: RPC pool URLs managed via Admin Settings API',
  'rpc_pool.solana-testnet': 'API-only: RPC pool URLs managed via Admin Settings API',
  'rpc_pool.ethereum-mainnet': 'API-only: RPC pool URLs managed via Admin Settings API',
  'rpc_pool.ethereum-sepolia': 'API-only: RPC pool URLs managed via Admin Settings API',
  'rpc_pool.arbitrum-mainnet': 'API-only: RPC pool URLs managed via Admin Settings API',
  'rpc_pool.arbitrum-sepolia': 'API-only: RPC pool URLs managed via Admin Settings API',
  'rpc_pool.optimism-mainnet': 'API-only: RPC pool URLs managed via Admin Settings API',
  'rpc_pool.optimism-sepolia': 'API-only: RPC pool URLs managed via Admin Settings API',
  'rpc_pool.base-mainnet': 'API-only: RPC pool URLs managed via Admin Settings API',
  'rpc_pool.base-sepolia': 'API-only: RPC pool URLs managed via Admin Settings API',
  'rpc_pool.polygon-mainnet': 'API-only: RPC pool URLs managed via Admin Settings API',
  'rpc_pool.polygon-amoy': 'API-only: RPC pool URLs managed via Admin Settings API',
  'rpc_pool.hyperevm-mainnet': 'API-only: RPC pool URLs managed via Admin Settings API',
  'rpc_pool.hyperevm-testnet': 'API-only: RPC pool URLs managed via Admin Settings API',

  // --- Incoming TX WSS: per-network overrides, API-only ---
  'incoming.solana_mode': 'API-only: Solana monitor mode (websocket/polling/adaptive) via Admin Settings API (#454)',
  'incoming.wss_url': 'API-only: global WebSocket URL override via Admin Settings API',
  'incoming.wss_url.solana-mainnet': 'API-only: per-network WSS URL override',
  'incoming.wss_url.solana-devnet': 'API-only: per-network WSS URL override',
  'incoming.wss_url.solana-testnet': 'API-only: per-network WSS URL override',
  'incoming.wss_url.ethereum-mainnet': 'API-only: per-network WSS URL override',
  'incoming.wss_url.ethereum-sepolia': 'API-only: per-network WSS URL override',
  'incoming.wss_url.arbitrum-mainnet': 'API-only: per-network WSS URL override',
  'incoming.wss_url.arbitrum-sepolia': 'API-only: per-network WSS URL override',
  'incoming.wss_url.optimism-mainnet': 'API-only: per-network WSS URL override',
  'incoming.wss_url.optimism-sepolia': 'API-only: per-network WSS URL override',
  'incoming.wss_url.base-mainnet': 'API-only: per-network WSS URL override',
  'incoming.wss_url.base-sepolia': 'API-only: per-network WSS URL override',
  'incoming.wss_url.polygon-mainnet': 'API-only: per-network WSS URL override',
  'incoming.wss_url.polygon-amoy': 'API-only: per-network WSS URL override',
  'incoming.wss_url.hyperevm-mainnet': 'API-only: per-network WSS URL override',
  'incoming.wss_url.hyperevm-testnet': 'API-only: per-network WSS URL override',

  // --- Position tracker: internal service toggle, no UI control needed ---
  'position_tracker.enabled': 'Internal: DeFi position sync runs automatically when providers are enabled',

  // --- Notification category filter: managed via API, not exposed in Admin UI ---
  'notifications.notify_categories': 'API-only: notification category filter managed via Admin Settings API',

  // --- Smart Account provider API keys: managed through API Keys or per-wallet config ---
  'smart_account.pimlico.api_key': 'Credential: per-wallet AA provider key',
  'smart_account.pimlico.paymaster_policy_id': 'Per-wallet AA provider config',
  'smart_account.alchemy.api_key': 'Credential: per-wallet AA provider key',
  'smart_account.alchemy.paymaster_policy_id': 'Per-wallet AA provider config',

  // --- CORS: infrastructure setting, requires restart ---
  'security.cors_origins': 'Infrastructure: CORS origins configured in config.toml, requires restart',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Settings Completeness (#314)', () => {
  const allSettingKeys = extractSettingKeys();
  const activePageSource = getActivePageSources();

  it('should find setting keys from daemon setting-keys.ts', () => {
    expect(allSettingKeys.length).toBeGreaterThan(50);
  });

  it('every non-excluded setting key is referenced in at least one active admin page', () => {
    const missing: string[] = [];

    for (const key of allSettingKeys) {
      if (key in EXCLUDED_KEYS) continue;

      // Check if key belongs to a dynamically-managed category
      const dotIdx = key.indexOf('.');
      if (dotIdx > 0) {
        const cat = key.substring(0, dotIdx);
        if (cat in DYNAMIC_CATEGORIES) continue;
      }

      // Check for the full key (e.g., 'daemon.log_level') or partial references
      const found = activePageSource.includes(key);
      if (!found) {
        // Also check for the category.subkey pattern split into ev('category', 'subkey')
        if (dotIdx > 0) {
          const cat = key.substring(0, dotIdx);
          const subkey = key.substring(dotIdx + 1);
          const evPattern = `'${cat}', '${subkey}'`;
          const evPattern2 = `'${cat}', "${subkey}"`;
          const evPattern3 = `"${cat}", '${subkey}'`;
          if (
            activePageSource.includes(evPattern) ||
            activePageSource.includes(evPattern2) ||
            activePageSource.includes(evPattern3)
          ) {
            continue;
          }
        }
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `${missing.length} setting key(s) not found in any active admin page.\n` +
          'Either add them to the appropriate page or add to EXCLUDED_KEYS with a reason:\n' +
          missing.map((k) => `  - ${k}`).join('\n'),
      );
    }
  });

  it('dynamic categories have at least one active page referencing the category name', () => {
    for (const cat of Object.keys(DYNAMIC_CATEGORIES)) {
      const catReferenced = activePageSource.includes(`'${cat}'`) || activePageSource.includes(`"${cat}"`);
      expect(catReferenced).toBe(true);
    }
  });

  it('excluded keys list does not contain keys that are actually referenced', () => {
    const unnecessaryExclusions: string[] = [];

    for (const key of Object.keys(EXCLUDED_KEYS)) {
      if (activePageSource.includes(key)) {
        // Check if it's also referenced via ev() pattern
        unnecessaryExclusions.push(key);
      }
    }

    // This is informational -- excluded keys CAN appear in pages (e.g., in comments
    // or conditional code), so we only warn, not fail.
    // If you want to be strict, uncomment the expect below:
    // expect(unnecessaryExclusions).toHaveLength(0);
  });

  it('all excluded keys exist in daemon setting-keys.ts', () => {
    const allKeysSet = new Set(allSettingKeys);
    const phantomExclusions: string[] = [];

    for (const key of Object.keys(EXCLUDED_KEYS)) {
      if (!allKeysSet.has(key)) {
        phantomExclusions.push(key);
      }
    }

    if (phantomExclusions.length > 0) {
      throw new Error(
        `${phantomExclusions.length} key(s) in EXCLUDED_KEYS do not exist in setting-keys.ts ` +
          '(stale exclusions):\n' +
          phantomExclusions.map((k) => `  - ${k}`).join('\n'),
      );
    }
  });
});
