/**
 * Tests for desktop/bridge/types.ts -- pure type definitions.
 *
 * Since types.ts only exports TypeScript types (no runtime code),
 * we verify the type shapes are importable and structurally correct.
 */
import { describe, it, expect } from 'vitest';
import type {
  DaemonState,
  DaemonStatus,
  HealthStatus,
  StopDaemonArgs,
  GetLogsArgs,
  NotificationArgs,
} from '../../desktop/bridge/types';

describe('bridge/types', () => {
  it('should define DaemonState union', () => {
    const states: DaemonState[] = [
      'Stopped',
      'Starting',
      'Running',
      'Stopping',
      'Crashed',
      'Error',
    ];
    expect(states).toHaveLength(6);
  });

  it('should define HealthStatus union', () => {
    const healthy: HealthStatus = 'Healthy';
    const unhealthy: HealthStatus = { Unhealthy: { reason: 'timeout' } };
    const unknown: HealthStatus = 'Unknown';
    expect(healthy).toBe('Healthy');
    expect(unhealthy).toEqual({ Unhealthy: { reason: 'timeout' } });
    expect(unknown).toBe('Unknown');
  });

  it('should define DaemonStatus interface', () => {
    const status: DaemonStatus = {
      running: true,
      pid: 1234,
      port: 3000,
      uptime_secs: 600,
      health: 'Healthy',
      restart_count: 0,
      state: 'Running',
    };
    expect(status.running).toBe(true);
    expect(status.pid).toBe(1234);
    expect(status.port).toBe(3000);
    expect(status.state).toBe('Running');
  });

  it('should define DaemonStatus with null pid', () => {
    const status: DaemonStatus = {
      running: false,
      pid: null,
      port: 0,
      uptime_secs: 0,
      health: 'Unknown',
      restart_count: 0,
      state: 'Stopped',
    };
    expect(status.pid).toBeNull();
  });

  it('should define StopDaemonArgs interface', () => {
    const args: StopDaemonArgs = { force: true };
    expect(args.force).toBe(true);
    const emptyArgs: StopDaemonArgs = {};
    expect(emptyArgs.force).toBeUndefined();
  });

  it('should define GetLogsArgs interface', () => {
    const args: GetLogsArgs = { lines: 50, since: '2026-01-01T00:00:00Z' };
    expect(args.lines).toBe(50);
    expect(args.since).toBe('2026-01-01T00:00:00Z');
    const emptyArgs: GetLogsArgs = {};
    expect(emptyArgs.lines).toBeUndefined();
  });

  it('should define NotificationArgs interface', () => {
    const args: NotificationArgs = {
      title: 'Test',
      body: 'Hello',
      icon: 'icon.png',
    };
    expect(args.title).toBe('Test');
    expect(args.body).toBe('Hello');
    expect(args.icon).toBe('icon.png');
  });

  it('should allow NotificationArgs without icon', () => {
    const args: NotificationArgs = { title: 'Test', body: 'Hello' };
    expect(args.icon).toBeUndefined();
  });
});
