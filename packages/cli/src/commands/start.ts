/**
 * `waiaas start` -- Start the WAIaaS daemon.
 *
 * 1. Check if already running (PID file + process alive check)
 * 2. Resolve master password
 * 3. Call startDaemon() (in-process)
 * 4. Process stays alive via signal handlers
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePassword } from '../utils/password.js';

export async function startCommand(dataDir: string): Promise<void> {
  const pidPath = join(dataDir, 'daemon.pid');

  // Check if already running
  if (existsSync(pidPath)) {
    try {
      const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
      process.kill(pid, 0); // check if process is alive
      console.error(`Daemon already running (PID: ${pid})`);
      process.exit(1);
      return; // Ensure no further execution after exit
    } catch (err) {
      // ESRCH = process not found, stale PID file -- continue
      if ((err as NodeJS.ErrnoException).code !== 'ESRCH') {
        console.error(`Daemon already running (PID file exists: ${pidPath})`);
        process.exit(1);
        return; // Ensure no further execution after exit
      }
      // Stale PID file, continue with startup
    }
  }

  // Resolve master password
  let password: string;
  try {
    password = await resolvePassword();
  } catch (err) {
    console.error(`Failed to resolve master password: ${(err as Error).message}`);
    process.exit(1);
    return; // Ensure no further execution after exit
  }

  // Start daemon (in-process)
  // daemon.ts outputs "WAIaaS daemon ready on ..." + Admin UI URL on success
  try {
    const { startDaemon } = await import('@waiaas/daemon');
    await startDaemon(dataDir, password);
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`Failed to start daemon: ${msg}`);
    if (msg.includes('already in use')) {
      console.error('Hint: Check what is using the port with: lsof -i :3100');
    }
    process.exit(1);
  }
}
