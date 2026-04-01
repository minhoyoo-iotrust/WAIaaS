/**
 * Tests for desktop/bridge/tauri-bridge.ts -- Tauri IPC wrappers.
 *
 * Mocks @tauri-apps/api/core since it won't exist in test environment.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the @tauri-apps/api/core module
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

import {
  startDaemon,
  stopDaemon,
  restartDaemon,
  getDaemonStatus,
  getDaemonLogs,
  sendNotification,
  quitApp,
} from '../../desktop/bridge/tauri-bridge';

describe('tauri-bridge', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('startDaemon should invoke start_daemon', async () => {
    const mockStatus = {
      running: true,
      pid: 1234,
      port: 3000,
      uptime_secs: 0,
      health: 'Healthy',
      restart_count: 0,
      state: 'Running',
    };
    mockInvoke.mockResolvedValue(mockStatus);

    const result = await startDaemon();
    expect(mockInvoke).toHaveBeenCalledWith('start_daemon');
    expect(result).toEqual(mockStatus);
  });

  it('stopDaemon should invoke stop_daemon with empty args by default', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await stopDaemon();
    expect(mockInvoke).toHaveBeenCalledWith('stop_daemon', { args: {} });
  });

  it('stopDaemon should invoke stop_daemon with force flag', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await stopDaemon({ force: true });
    expect(mockInvoke).toHaveBeenCalledWith('stop_daemon', {
      args: { force: true },
    });
  });

  it('restartDaemon should invoke restart_daemon', async () => {
    const mockStatus = {
      running: true,
      pid: 5678,
      port: 3000,
      uptime_secs: 0,
      health: 'Healthy',
      restart_count: 1,
      state: 'Running',
    };
    mockInvoke.mockResolvedValue(mockStatus);

    const result = await restartDaemon();
    expect(mockInvoke).toHaveBeenCalledWith('restart_daemon');
    expect(result).toEqual(mockStatus);
  });

  it('getDaemonStatus should invoke get_daemon_status', async () => {
    const mockStatus = {
      running: true,
      pid: 1234,
      port: 3000,
      uptime_secs: 300,
      health: 'Healthy',
      restart_count: 0,
      state: 'Running',
    };
    mockInvoke.mockResolvedValue(mockStatus);

    const result = await getDaemonStatus();
    expect(mockInvoke).toHaveBeenCalledWith('get_daemon_status');
    expect(result).toEqual(mockStatus);
  });

  it('getDaemonLogs should invoke get_daemon_logs with default args', async () => {
    const mockLogs = ['line1', 'line2'];
    mockInvoke.mockResolvedValue(mockLogs);

    const result = await getDaemonLogs();
    expect(mockInvoke).toHaveBeenCalledWith('get_daemon_logs', { args: {} });
    expect(result).toEqual(mockLogs);
  });

  it('getDaemonLogs should invoke get_daemon_logs with custom args', async () => {
    const mockLogs = ['line1'];
    mockInvoke.mockResolvedValue(mockLogs);

    const result = await getDaemonLogs({ lines: 10, since: '2026-01-01' });
    expect(mockInvoke).toHaveBeenCalledWith('get_daemon_logs', {
      args: { lines: 10, since: '2026-01-01' },
    });
    expect(result).toEqual(mockLogs);
  });

  it('sendNotification should invoke send_notification with args', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await sendNotification({ title: 'Test', body: 'Hello world' });
    expect(mockInvoke).toHaveBeenCalledWith('send_notification', {
      args: { title: 'Test', body: 'Hello world' },
    });
  });

  it('sendNotification should pass icon argument', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await sendNotification({ title: 'Test', body: 'Hello', icon: 'icon.png' });
    expect(mockInvoke).toHaveBeenCalledWith('send_notification', {
      args: { title: 'Test', body: 'Hello', icon: 'icon.png' },
    });
  });

  it('quitApp should invoke quit_app', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await quitApp();
    expect(mockInvoke).toHaveBeenCalledWith('quit_app');
  });
});
