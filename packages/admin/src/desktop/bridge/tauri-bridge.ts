/**
 * Tauri IPC bridge -- typed wrappers for all 7 IPC commands.
 *
 * IMPORTANT: This file must ONLY be loaded via dynamic import inside
 * isDesktop() guards. It is NEVER statically imported in browser code.
 *
 * The @tauri-apps/api/core dependency is dynamically imported to ensure
 * tree-shaking eliminates it from browser bundles.
 */

import type {
  DaemonStatus,
  GetLogsArgs,
  NotificationArgs,
  StopDaemonArgs,
} from './types';

/** Lazily import and cache the Tauri invoke function */
async function getInvoke(): Promise<
  <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke;
}

/** IPC-01: Start the sidecar daemon process */
export async function startDaemon(): Promise<DaemonStatus> {
  const invoke = await getInvoke();
  return invoke<DaemonStatus>('start_daemon');
}

/** IPC-02: Stop the sidecar daemon process */
export async function stopDaemon(args?: StopDaemonArgs): Promise<void> {
  const invoke = await getInvoke();
  return invoke<void>('stop_daemon', { args: args ?? {} });
}

/** IPC-03: Restart the sidecar daemon (stop + wait + start) */
export async function restartDaemon(): Promise<DaemonStatus> {
  const invoke = await getInvoke();
  return invoke<DaemonStatus>('restart_daemon');
}

/** IPC-04: Get the current daemon status including health check */
export async function getDaemonStatus(): Promise<DaemonStatus> {
  const invoke = await getInvoke();
  return invoke<DaemonStatus>('get_daemon_status');
}

/** IPC-05: Get recent daemon log lines */
export async function getDaemonLogs(args?: GetLogsArgs): Promise<string[]> {
  const invoke = await getInvoke();
  return invoke<string[]>('get_daemon_logs', { args: args ?? {} });
}

/** IPC-06: Send an OS native notification */
export async function sendNotification(args: NotificationArgs): Promise<void> {
  const invoke = await getInvoke();
  return invoke<void>('send_notification', { args });
}

/** IPC-07: Quit the WAIaaS Desktop app (graceful daemon shutdown + exit) */
export async function quitApp(): Promise<void> {
  const invoke = await getInvoke();
  return invoke<void>('quit_app');
}
