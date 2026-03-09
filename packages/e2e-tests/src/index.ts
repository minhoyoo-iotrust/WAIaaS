/**
 * @waiaas/e2e-tests
 *
 * E2E test infrastructure: types, reporter, and helpers for scenario-based testing.
 */

export {
  type Track,
  type ScenarioStatus,
  type E2EScenario,
  type ScenarioResult,
  ScenarioRegistry,
  registry,
} from './types.js';

export { E2EReporter } from './reporter.js';

export {
  DaemonManager,
  type DaemonInstance,
  PushRelayManager,
  type PushRelayInstance,
  E2EHttpClient,
  type HttpResponse,
  SessionManager,
  setupDaemonSession,
} from './helpers/index.js';
