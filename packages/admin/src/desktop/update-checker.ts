// Dynamic import for tree-shaking -- only loads in Desktop environment
import { isDesktop } from '../utils/platform';

export interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
}

let cachedUpdate: any = null;

/**
 * Check for available updates via Tauri updater plugin.
 * Returns update info if a newer version is available, null otherwise.
 * Ed25519 signature verification is handled automatically by the Rust plugin.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isDesktop()) return null;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (update) {
      cachedUpdate = update;
      return {
        version: update.version,
        date: update.date,
        body: update.body,
      };
    }
    return null;
  } catch (e) {
    console.error('[updater] check failed:', e);
    return null;
  }
}

/**
 * Download and install the cached update.
 * Calls onProgress with percentage (0-100) during download.
 * App will restart automatically after install.
 */
export async function installUpdate(
  onProgress?: (progress: number) => void,
): Promise<void> {
  if (!cachedUpdate) throw new Error('No update available');
  let downloaded = 0;
  let contentLength = 0;
  await cachedUpdate.downloadAndInstall((event: any) => {
    if (event.event === 'Started') {
      contentLength = event.data.contentLength ?? 0;
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
      if (contentLength > 0 && onProgress) {
        onProgress(Math.round((downloaded / contentLength) * 100));
      }
    } else if (event.event === 'Finished') {
      onProgress?.(100);
    }
  });
  // App will restart automatically after install
}
