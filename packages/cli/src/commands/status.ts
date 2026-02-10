/**
 * `waiaas status` -- Check the WAIaaS daemon status.
 *
 * Reports:
 *   - running (PID + port) -- PID alive + health check OK
 *   - starting (PID) -- PID alive but health check fails
 *   - stopped -- no PID file or process not alive
 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

/** Default daemon port if config is unavailable. */
const DEFAULT_PORT = 3100;

export async function statusCommand(dataDir: string): Promise<void> {
  const pidPath = join(dataDir, 'daemon.pid');

  // No PID file
  if (!existsSync(pidPath)) {
    console.log('Status: stopped');
    return;
  }

  const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);

  // Check if process alive
  if (!isProcessAlive(pid)) {
    console.log('Status: stopped (stale PID file)');
    try {
      unlinkSync(pidPath);
    } catch {
      // Ignore cleanup errors
    }
    return;
  }

  // Resolve port from config
  const port = resolvePort(dataDir);

  // Health check
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    if (res.ok) {
      console.log(`Status: running (PID: ${pid}, Port: ${port})`);
    } else {
      console.log(`Status: starting (PID: ${pid})`);
    }
  } catch {
    console.log(`Status: starting (PID: ${pid})`);
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to read the port from config.toml. Falls back to DEFAULT_PORT.
 * We do a simple TOML parse to avoid importing the full config loader
 * (which pulls in many daemon dependencies).
 */
function resolvePort(dataDir: string): number {
  try {
    const configPath = join(dataDir, 'config.toml');
    if (!existsSync(configPath)) return DEFAULT_PORT;

    const content = readFileSync(configPath, 'utf-8');
    const match = /^\s*port\s*=\s*(\d+)/m.exec(content);
    if (match?.[1]) {
      const port = parseInt(match[1], 10);
      if (port > 0 && port <= 65535) return port;
    }
  } catch {
    // Ignore config read errors
  }
  return DEFAULT_PORT;
}
