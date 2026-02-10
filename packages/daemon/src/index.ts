// @waiaas/daemon - daemon infrastructure

// Database module
export {
  createDatabase,
  closeDatabase,
  pushSchema,
  agents,
  sessions,
  transactions,
  policies,
  pendingApprovals,
  auditLog,
  keyValueStore,
  generateId,
} from './infrastructure/database/index.js';
export type { DatabaseConnection } from './infrastructure/database/index.js';

// Keystore module
export {
  deriveKey,
  encrypt,
  decrypt,
  KDF_PARAMS,
  allocateGuarded,
  writeToGuarded,
  zeroAndRelease,
  isAvailable,
  LocalKeyStore,
} from './infrastructure/keystore/index.js';
export type { EncryptedData } from './infrastructure/keystore/index.js';
export type { KeystoreFileV1 } from './infrastructure/keystore/index.js';

// Config module
export {
  loadConfig,
  DaemonConfigSchema,
  detectNestedSections,
  applyEnvOverrides,
  parseEnvValue,
} from './infrastructure/config/index.js';
export type { DaemonConfig } from './infrastructure/config/index.js';

// Lifecycle module
export { DaemonLifecycle, withTimeout } from './lifecycle/index.js';
export { registerSignalHandlers } from './lifecycle/index.js';
export { BackgroundWorkers } from './lifecycle/index.js';

// API module
export { createApp } from './api/index.js';
export type { CreateAppDeps } from './api/index.js';
export { agentRoutes, walletRoutes, transactionRoutes } from './api/routes/index.js';
export type { AgentRouteDeps } from './api/routes/agents.js';
export type { WalletRouteDeps } from './api/routes/wallet.js';
export type { TransactionRouteDeps } from './api/routes/transactions.js';

// Pipeline module
export { TransactionPipeline, DefaultPolicyEngine } from './pipeline/index.js';
export type { PipelineDeps, PipelineContext } from './pipeline/index.js';

// ---------------------------------------------------------------------------
// Convenience: top-level startDaemon()
// ---------------------------------------------------------------------------

import { DaemonLifecycle } from './lifecycle/index.js';
import { registerSignalHandlers } from './lifecycle/index.js';

/**
 * Start the WAIaaS daemon.
 *
 * Convenience wrapper that creates a DaemonLifecycle, registers signal handlers,
 * and starts the daemon with the given data directory and master password.
 *
 * @param dataDir - Path to the WAIaaS data directory (contains config.toml, data/, keystore/)
 * @param masterPassword - Master password for keystore encryption
 * @returns The DaemonLifecycle instance (for testing or programmatic shutdown)
 */
export async function startDaemon(
  dataDir: string,
  masterPassword: string,
): Promise<DaemonLifecycle> {
  const daemon = new DaemonLifecycle();
  registerSignalHandlers(daemon);
  await daemon.start(dataDir, masterPassword);
  return daemon;
}
