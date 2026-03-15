/**
 * Admin route aggregator: delegates to domain-specific modules.
 *
 * Domain modules:
 *   - admin-auth.ts:          status, kill-switch, recover, shutdown, password, rotate-secret
 *   - admin-notifications.ts: notifications status/test/log
 *   - admin-settings.ts:      settings CRUD, test-rpc, oracle, API keys, forex, RPC status
 *   - admin-wallets.ts:       wallet transactions/balance/staking, telegram users, DeFi positions
 *   - admin-monitoring.ts:    cross-wallet transactions, incoming, agent-prompt, session-reissue,
 *                              tx cancel/reject, backup, stats, autostop
 *
 * @see docs/37-rest-api-complete-spec.md
 * @see docs/36-killswitch-evm-freeze.md
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import type { IPriceOracle, IForexRateService } from '@waiaas/core';
import type { RpcPool } from '@waiaas/core';
import type { JwtSecretManager } from '../../infrastructure/jwt/jwt-secret-manager.js';
import type * as schema from '../../infrastructure/database/schema.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import type { SettingsService } from '../../infrastructure/settings/index.js';
import type { AdapterPool } from '../../infrastructure/adapter-pool.js';
import type { ActionProviderRegistry } from '../../infrastructure/action/action-provider-registry.js';
import type { KillSwitchService } from '../../services/kill-switch-service.js';
import type { VersionCheckService } from '../../infrastructure/version/version-check-service.js';
import type { DelayQueue } from '../../workflow/delay-queue.js';
import type { ApprovalWorkflow } from '../../workflow/approval-workflow.js';
import type { MasterPasswordRef } from '../middleware/master-auth.js';
import type { EncryptedBackupService } from '../../infrastructure/backup/encrypted-backup-service.js';
import { openApiValidationHook } from './openapi-schemas.js';
import { registerAdminAuthRoutes } from './admin-auth.js';
import { registerAdminNotificationRoutes } from './admin-notifications.js';
import { registerAdminSettingsRoutes } from './admin-settings.js';
import { registerAdminWalletRoutes } from './admin-wallets.js';
import { registerAdminMonitoringRoutes } from './admin-monitoring.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KillSwitchState {
  state: string;
  activatedAt: number | null;
  activatedBy: string | null;
}

export interface AdminRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  jwtSecretManager?: JwtSecretManager;
  /** Mutable ref for live password/hash updates (password change API). */
  passwordRef?: MasterPasswordRef;
  getKillSwitchState: () => KillSwitchState;
  setKillSwitchState: (state: string, activatedBy?: string) => void;
  killSwitchService?: KillSwitchService;
  requestShutdown?: () => void;
  startTime: number; // epoch seconds
  version: string;
  adminTimeout: number;
  notificationService?: NotificationService;
  notificationConfig?: DaemonConfig['notifications'];
  settingsService?: SettingsService;
  onSettingsChanged?: (changedKeys: string[]) => void;
  adapterPool?: AdapterPool | null;
  daemonConfig?: DaemonConfig;
  priceOracle?: IPriceOracle;
  oracleConfig?: { coingeckoApiKeyConfigured: boolean; crossValidationThreshold: number };
  actionProviderRegistry?: ActionProviderRegistry;
  forexRateService?: IForexRateService;
  sqlite?: SQLiteDatabase;
  dataDir?: string;
  versionCheckService?: VersionCheckService | null;
  delayQueue?: DelayQueue;
  approvalWorkflow?: ApprovalWorkflow;
  rpcPool?: RpcPool;
  encryptedBackupService?: EncryptedBackupService;
  adminStatsService?: import('../../services/admin-stats-service.js').AdminStatsService;
  autoStopService?: import('../../services/autostop/autostop-service.js').AutoStopService;
  contractNameRegistry?: import('@waiaas/core').ContractNameRegistry;
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function adminRoutes(deps: AdminRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  registerAdminAuthRoutes(router, deps);
  registerAdminNotificationRoutes(router, deps);
  registerAdminSettingsRoutes(router, deps);
  registerAdminWalletRoutes(router, deps);
  registerAdminMonitoringRoutes(router, deps);

  return router;
}
