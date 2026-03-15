#!/usr/bin/env tsx
/**
 * OpenAPI Spec Extraction Script
 *
 * Extracts the complete OpenAPI 3.0 spec from createApp() by passing typed stub
 * dependencies that satisfy ALL conditional route registration branches.
 *
 * Output: packages/admin/openapi.json
 *
 * Usage: tsx scripts/extract-openapi.ts
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from '../packages/daemon/src/api/server.js';
import type { CreateAppDeps } from '../packages/daemon/src/api/server.js';
import { DatabasePolicyEngine } from '../packages/daemon/src/pipeline/database-policy-engine.js';

const OUTPUT_PATH = resolve(import.meta.dirname ?? '.', '..', 'packages', 'admin', 'openapi.json');
const MIN_PATH_THRESHOLD = 10;

/**
 * Build stub deps that satisfy every conditional branch in createApp().
 * Since we only need route registration (no actual method calls), empty
 * objects cast to the required types are sufficient.
 *
 * Special case: x402Routes checks `deps.policyEngine instanceof DatabasePolicyEngine`,
 * so we must provide a real (stubbed) instance.
 */
function buildStubDeps(): CreateAppDeps {
  // Stub db satisfies DatabasePolicyEngine constructor requirement
  const stubDb = {} as unknown as Parameters<typeof DatabasePolicyEngine['prototype']['evaluate']> extends never[] ? never : any;
  const policyEngine = new DatabasePolicyEngine(
    {} as any, // db (BetterSQLite3Database)
  );

  return {
    db: {} as any,
    sqlite: {} as any,
    keyStore: {} as any,
    masterPassword: 'stub-password',
    masterPasswordHash: '$argon2id$stub',
    passwordRef: { password: 'stub-password', hash: '$argon2id$stub' } as any,
    config: {
      daemon: { admin_ui: true, admin_timeout: 900 },
      rpc: {},
    } as any,
    adapterPool: {} as any,
    policyEngine,
    jwtSecretManager: {} as any,
    approvalWorkflow: {} as any,
    delayQueue: {} as any,
    ownerLifecycle: {} as any,
    notificationService: {} as any,
    settingsService: {
      get: () => '',
      getAll: () => ({}),
      getAllMasked: () => ({}),
      hasApiKey: () => false,
      setMany: () => {},
      setApiKey: () => {},
      deleteApiKey: () => {},
      getApiKeyMasked: () => null,
      getApiKeyUpdatedAt: () => null,
    } as any,
    priceOracle: {} as any,
    actionProviderRegistry: {} as any,
    onSettingsChanged: () => {},
    dataDir: '/tmp/waiaas-stub',
    forexRateService: {} as any,
    eventBus: { on: () => {}, off: () => {}, emit: () => {} } as any,
    killSwitchService: {
      getState: () => ({ state: 'ACTIVE', activatedAt: null, activatedBy: null }),
      activateWithCascade: () => ({ success: true }),
    } as any,
    wcServiceRef: { current: null },
    wcSigningBridgeRef: { current: null } as any,
    approvalChannelRouter: {} as any,
    versionCheckService: null,
    incomingTxMonitorService: { syncSubscriptions: () => {} },
    encryptedBackupService: {
      createBackup: async () => ({ path: '', filename: '', size: 0, created_at: '', daemon_version: '', schema_version: 0, file_count: 0 }),
      listBackups: () => [],
    },
    adminStatsService: {} as any,
    autoStopService: {} as any,
    metricsCounter: {} as any,
    smartAccountService: {} as any,
    reputationCache: {} as any,
    hyperliquidMarketData: null,
    polymarketInfra: null,
    signerRegistry: {} as any,
  };
}

async function main(): Promise<void> {
  console.log('Extracting OpenAPI spec from createApp(stubDeps)...\n');

  const deps = buildStubDeps();
  const app = createApp(deps);

  const res = await app.request('/doc', {
    headers: { Host: '127.0.0.1:3100' },
  });

  if (res.status !== 200) {
    console.error(`FAILED: GET /doc returned status ${res.status}`);
    process.exit(1);
  }

  const spec = await res.json();
  const pathCount = Object.keys((spec as any).paths ?? {}).length;

  console.log(`  OpenAPI version: ${(spec as any).openapi}`);
  console.log(`  Title: ${(spec as any).info?.title}`);
  console.log(`  API version: ${(spec as any).info?.version}`);
  console.log(`  Paths extracted: ${pathCount}`);

  if (pathCount < MIN_PATH_THRESHOLD) {
    console.error(`\nFAILED: Only ${pathCount} paths extracted (minimum: ${MIN_PATH_THRESHOLD}).`);
    console.error('This likely means stub deps are incomplete -- some conditional routes were not registered.');
    process.exit(1);
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(spec, null, 2) + '\n', 'utf-8');
  console.log(`\nOpenAPI spec written to: ${OUTPUT_PATH}`);
  console.log(`Total paths: ${pathCount}`);
}

main();
