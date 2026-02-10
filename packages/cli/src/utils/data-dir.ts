/**
 * Resolve the WAIaaS data directory.
 *
 * Priority:
 *   1. --data-dir CLI option
 *   2. WAIAAS_DATA_DIR environment variable
 *   3. Default: ~/.waiaas/
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

export function resolveDataDir(opts?: { dataDir?: string }): string {
  if (opts?.dataDir) return opts.dataDir;
  if (process.env['WAIAAS_DATA_DIR']) return process.env['WAIAAS_DATA_DIR'];
  return join(homedir(), '.waiaas');
}
