/**
 * Desktop environment detection utility.
 *
 * Uses Tauri's injected __TAURI_INTERNALS__ global to determine
 * if the app is running inside a Tauri WebView (Desktop) vs browser.
 *
 * Result is cached after first check for performance.
 */

let _isDesktop: boolean | null = null;

export function isDesktop(): boolean {
  if (_isDesktop === null) {
    _isDesktop =
      typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }
  return _isDesktop;
}

/**
 * Invoke a Tauri IPC command. Returns null outside Desktop or on failure.
 * Kept local to this module to avoid bundling `@tauri-apps/api` in browser builds.
 */
async function tauriInvoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isDesktop()) return null;
  try {
    const internals = (window as unknown as {
      __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<T> };
    }).__TAURI_INTERNALS__;
    if (!internals?.invoke) return null;
    return await internals.invoke(cmd, args);
  } catch {
    return null;
  }
}

/**
 * Read the desktop bootstrap recovery.key via Tauri IPC (issue 491).
 * Returns null if: not running in Desktop, the file doesn't exist, or IPC failed.
 */
export async function getDesktopRecoveryKey(): Promise<string | null> {
  const result = await tauriInvoke<string | null>('get_recovery_key');
  return result ?? null;
}

/**
 * Delete the desktop bootstrap recovery.key via Tauri IPC (issue 491).
 * Called after the user successfully changes their master password so subsequent
 * launches fall through to the manual Login page instead of trying a stale key.
 */
export async function clearDesktopRecoveryKey(): Promise<void> {
  await tauriInvoke<void>('clear_recovery_key');
}
