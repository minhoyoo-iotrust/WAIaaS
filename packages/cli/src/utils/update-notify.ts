/**
 * CLI upgrade notification utility.
 *
 * Checks the daemon /health endpoint for update availability and displays
 * a notification box on stderr. Uses file-based 24-hour dedup to avoid
 * spamming users on repeated CLI invocations.
 *
 * Design constraints:
 *   - MUST NOT write to stdout (pipe safety)
 *   - MUST NOT throw (CLI must always work even if notification fails)
 *   - MUST NOT block CLI startup (called fire-and-forget)
 */

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Default daemon port when config.toml is unavailable. */
const DEFAULT_PORT = 3100;

/** Suppress duplicate notifications within this window (ms). */
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Fetch timeout to keep CLI responsive (ms). */
const FETCH_TIMEOUT_MS = 2000;

/** Filename used to track last notification time. */
const LAST_NOTIFY_FILE = '.last-update-notify';

export interface UpdateNotifyOpts {
  dataDir: string;
  quiet?: boolean;
}

/**
 * Check for available updates and print a notification box to stderr.
 *
 * Safe to call fire-and-forget — all errors are silently swallowed.
 */
export async function checkAndNotifyUpdate(opts: UpdateNotifyOpts): Promise<void> {
  try {
    // 1. Suppress if quiet mode
    if (opts.quiet === true || process.env['WAIAAS_NO_UPDATE_NOTIFY'] === '1') {
      return;
    }

    // 2. Resolve port from config.toml
    const port = resolvePort(opts.dataDir);

    // 3. Fetch /health with timeout
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) return;

    const body = (await res.json()) as {
      updateAvailable?: boolean;
      latestVersion?: string | null;
      version?: string;
    };

    // 4. Check if update is available
    if (body.updateAvailable !== true) return;

    // 5. 24-hour dedup via file mtime
    const notifyPath = join(opts.dataDir, LAST_NOTIFY_FILE);
    if (isWithinDedupWindow(notifyPath)) return;

    // 6. Touch the dedup file
    writeFileSync(notifyPath, '', 'utf-8');

    // 7. Render notification box to stderr
    const currentVersion = body.version ?? 'unknown';
    const latestVersion = body.latestVersion ?? 'unknown';
    renderNotification(currentVersion, latestVersion);
  } catch {
    // Silently ignore all errors — CLI must not break
  }
}

/**
 * Check whether the dedup file exists and was modified within the dedup window.
 */
function isWithinDedupWindow(filePath: string): boolean {
  try {
    if (!existsSync(filePath)) return false;
    const stat = statSync(filePath);
    const age = Date.now() - stat.mtimeMs;
    return age < DEDUP_WINDOW_MS;
  } catch {
    return false;
  }
}

/**
 * Resolve daemon port from config.toml using simple regex (no TOML parser dependency).
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

/**
 * Render an update notification box to stderr.
 */
function renderNotification(currentVersion: string, latestVersion: string): void {
  const message = `Update available: ${currentVersion} → ${latestVersion}`;
  const action = 'Run: waiaas upgrade';

  // Calculate box width (account for 3-space padding on each side)
  const contentWidth = Math.max(message.length, action.length);
  const boxWidth = contentWidth + 6; // 3 padding each side

  const top = `\u256D${'─'.repeat(boxWidth)}\u256E`;
  const bottom = `\u2570${'─'.repeat(boxWidth)}\u256F`;
  const empty = `\u2502${' '.repeat(boxWidth)}\u2502`;
  const msgLine = `\u2502   ${message.padEnd(contentWidth)}   \u2502`;
  const actLine = `\u2502   ${action.padEnd(contentWidth)}   \u2502`;

  const box = `\n${top}\n${empty}\n${msgLine}\n${actLine}\n${empty}\n${bottom}\n`;

  process.stderr.write(box);
}
