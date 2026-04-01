/**
 * native-loader.ts - SEA environment native addon loader
 *
 * In SEA (Single Executable Application) mode, native addons (.node files)
 * are embedded as assets in the binary. This module extracts them to a
 * temporary directory and loads them via process.dlopen().
 *
 * In normal development mode, it falls back to standard require().
 *
 * @see internal/design/39-tauri-desktop-architecture.md section 4.1.1
 */

import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const esmRequire = createRequire(import.meta.url);

/**
 * Dynamically imported node:sea module (only available in SEA environment)
 */
let seaModule: {
  isSea: () => boolean;
  getRawAsset: (name: string) => ArrayBuffer;
} | null = null;

let seaChecked = false;

async function ensureSeaModule(): Promise<typeof seaModule> {
  if (!seaChecked) {
    seaChecked = true;
    try {
      seaModule = await import('node:sea');
    } catch {
      // Not running as SEA -- use normal require
      seaModule = null;
    }
  }
  return seaModule;
}

/**
 * Check if currently running as a SEA binary
 */
export async function isSea(): Promise<boolean> {
  const sea = await ensureSeaModule();
  return sea?.isSea() ?? false;
}

/**
 * Load a native addon from SEA assets or fall back to normal require.
 *
 * @param assetName - Name of the asset in sea-config.json (e.g., "sodium-native.node")
 * @param fallbackModuleName - Module name for normal require (e.g., "sodium-native")
 * @returns The loaded native module
 */
export async function loadNativeAddon<T>(
  assetName: string,
  fallbackModuleName: string,
): Promise<T> {
  const sea = await ensureSeaModule();

  if (sea?.isSea()) {
    // SEA mode: extract .node file from embedded asset and load via dlopen
    const rawAsset = sea.getRawAsset(assetName);
    const buffer = Buffer.from(rawAsset);

    // Use PID in path to avoid conflicts with concurrent instances
    const tmpDir = mkdtempSync(join(tmpdir(), `waiaas-${assetName}-`));
    const tmpPath = join(tmpDir, assetName);

    try {
      writeFileSync(tmpPath, buffer);

      // Load the native addon via dlopen
      const mod = { exports: {} } as NodeJS.Module;
      process.dlopen(mod, tmpPath);

      return mod.exports as T;
    } finally {
      // Clean up extracted file (best effort)
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  // Normal mode: use standard require
  return esmRequire(fallbackModuleName) as T;
}

/**
 * Pre-configured loaders for WAIaaS native addons.
 * These are not called until explicitly invoked -- the module just provides
 * the loader functions. Existing code that directly imports native modules
 * continues to work unchanged; migration to native-loader is optional and
 * will be done incrementally.
 */
export async function loadSodiumNative(): Promise<typeof import('sodium-native')> {
  return loadNativeAddon<typeof import('sodium-native')>(
    'sodium-native.node',
    'sodium-native',
  );
}

export async function loadBetterSqlite3(): Promise<typeof import('better-sqlite3')> {
  return loadNativeAddon<typeof import('better-sqlite3')>(
    'better_sqlite3.node',
    'better-sqlite3',
  );
}

export async function loadArgon2(): Promise<typeof import('argon2')> {
  return loadNativeAddon<typeof import('argon2')>(
    'argon2.node',
    'argon2',
  );
}
