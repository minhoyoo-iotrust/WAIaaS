/**
 * `waiaas stop` -- Stop the WAIaaS daemon.
 *
 * 1. Read PID file
 * 2. Check if process alive
 * 3. Send SIGTERM
 * 4. Poll until process exits (or SIGKILL after timeout)
 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

/** Maximum time to wait for graceful shutdown (ms). */
const STOP_TIMEOUT = 10_000;
/** Interval between alive checks (ms). */
const POLL_INTERVAL = 500;

export async function stopCommand(dataDir: string): Promise<void> {
  const pidPath = join(dataDir, 'daemon.pid');

  // Check PID file
  if (!existsSync(pidPath)) {
    console.log('Daemon is not running');
    return;
  }

  const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);

  // Check if process is alive
  if (!isProcessAlive(pid)) {
    console.log('Daemon is not running (stale PID file)');
    try {
      unlinkSync(pidPath);
    } catch {
      // Ignore cleanup errors
    }
    return;
  }

  // Send SIGTERM
  console.log(`Stopping daemon (PID: ${pid})...`);
  process.kill(pid, 'SIGTERM');

  // Poll for process exit
  const started = Date.now();
  while (Date.now() - started < STOP_TIMEOUT) {
    await sleep(POLL_INTERVAL);
    if (!isProcessAlive(pid)) {
      console.log('Daemon stopped');
      return;
    }
  }

  // Timeout -- send SIGKILL
  console.log('Daemon did not stop within 10s, sending SIGKILL');
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Process may have exited between check and kill
  }
  console.log('Daemon killed');
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
