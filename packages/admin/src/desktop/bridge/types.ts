/**
 * TypeScript types mirroring Rust IPC types from apps/desktop/src-tauri/src/types.rs
 *
 * These are pure type exports with no runtime code -- safe for static import
 * without affecting browser bundle size.
 */

/** Daemon process state enum (mirrors Rust DaemonState) */
export type DaemonState =
  | 'Stopped'
  | 'Starting'
  | 'Running'
  | 'Stopping'
  | 'Crashed'
  | 'Error';

/** Health status union (mirrors Rust HealthStatus enum with serde tagging) */
export type HealthStatus =
  | 'Healthy'
  | { Unhealthy: { reason: string } }
  | 'Unknown';

/** Overall daemon status returned from get_daemon_status IPC command */
export interface DaemonStatus {
  running: boolean;
  pid: number | null;
  port: number;
  uptime_secs: number;
  health: HealthStatus;
  restart_count: number;
  state: DaemonState;
}

/** Arguments for stop_daemon IPC command */
export interface StopDaemonArgs {
  force?: boolean;
}

/** Arguments for get_daemon_logs IPC command */
export interface GetLogsArgs {
  lines?: number;
  since?: string;
}

/** Arguments for send_notification IPC command */
export interface NotificationArgs {
  title: string;
  body: string;
  icon?: string;
}
