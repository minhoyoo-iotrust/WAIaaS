/**
 * Lifecycle module barrel export.
 *
 * Re-exports DaemonLifecycle, signal handler, and BackgroundWorkers.
 */

export { DaemonLifecycle, withTimeout } from './daemon.js';
export { registerSignalHandlers } from './signal-handler.js';
export { BackgroundWorkers } from './workers.js';
