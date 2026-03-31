#!/usr/bin/env node
/**
 * build-sea.mjs - Build WAIaaS daemon as a Node.js SEA (Single Executable Application)
 *
 * Pipeline:
 *   1. esbuild bundle (CJS, node22, externalize native addons)
 *   2. Copy native addon prebuilds to native-addons/
 *   3. Generate SEA blob via node --experimental-sea-config
 *   4. Copy node binary and inject SEA blob via postject
 *   5. Copy final binary to Tauri externalBin location
 *
 * Usage:
 *   node scripts/build-sea.mjs [--target <target_triple>]
 *
 * @see internal/design/39-tauri-desktop-architecture.md section 4.1
 */

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, arch } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MONOREPO_ROOT = resolve(ROOT, '../..');
const DIST_DIR = join(ROOT, 'dist');
const NATIVE_ADDONS_DIR = join(ROOT, 'native-addons');
const SEA_CONFIG = join(ROOT, 'sea-config.json');
const BUNDLE_OUTPUT = join(DIST_DIR, 'daemon-bundle.cjs');
const SEA_BLOB = join(DIST_DIR, 'sea-prep.blob');

// Parse arguments
const args = process.argv.slice(2);
const targetIdx = args.indexOf('--target');
const targetTriple = targetIdx >= 0 ? args[targetIdx + 1] : getDefaultTargetTriple();

function getDefaultTargetTriple() {
  const os = platform();
  const cpu = arch();

  const osMap = {
    darwin: 'apple-darwin',
    linux: 'unknown-linux-gnu',
    win32: 'pc-windows-msvc',
  };

  const cpuMap = {
    arm64: 'aarch64',
    x64: 'x86_64',
  };

  return `${cpuMap[cpu] || cpu}-${osMap[os] || os}`;
}

function run(cmd, opts = {}) {
  console.log(`  > ${cmd}`);
  return execSync(cmd, {
    cwd: ROOT,
    stdio: 'inherit',
    ...opts,
  });
}

function findPrebuild(packageName, patterns) {
  for (const pattern of patterns) {
    const resolved = resolve(ROOT, pattern);
    if (existsSync(resolved)) {
      return resolved;
    }
    // Try from monorepo root node_modules
    const monoResolved = resolve(MONOREPO_ROOT, pattern);
    if (monoResolved !== resolved && existsSync(monoResolved)) {
      return monoResolved;
    }
  }

  // Glob search in node_modules
  const searchDirs = [
    join(ROOT, 'node_modules', packageName),
    join(MONOREPO_ROOT, 'node_modules', packageName),
  ];

  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    const found = findNodeFile(dir);
    if (found) return found;
  }

  return null;
}

function findNodeFile(dir, depth = 0) {
  if (depth > 5) return null;
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      if (entry.endsWith('.node') || entry === 'node.napi.node') {
        return fullPath;
      }
      try {
        if (statSync(fullPath).isDirectory() && entry !== 'node_modules') {
          const found = findNodeFile(fullPath, depth + 1);
          if (found) return found;
        }
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }
  return null;
}

async function main() {
  console.log('=== WAIaaS SEA Build ===');
  console.log(`Target: ${targetTriple}`);
  console.log(`Platform: ${platform()} ${arch()}`);
  console.log();

  // 1. Ensure dist directory
  if (!existsSync(DIST_DIR)) {
    mkdirSync(DIST_DIR, { recursive: true });
  }

  // 2. esbuild bundle
  console.log('[1/5] Bundling daemon with esbuild...');
  try {
    const { build } = await import('esbuild');
    await build({
      entryPoints: [join(MONOREPO_ROOT, 'packages/cli/src/index.ts')],
      bundle: true,
      format: 'cjs',
      platform: 'node',
      target: 'node22',
      outfile: BUNDLE_OUTPUT,
      external: [
        'sodium-native',
        'better-sqlite3',
        'argon2',
        // Keep native modules external
        'fsevents',
      ],
      sourcemap: false,
      minify: false,
      // Handle ESM -> CJS conversion
      mainFields: ['module', 'main'],
      conditions: ['node', 'import'],
      logLevel: 'warning',
    });
    console.log(`  Bundle: ${BUNDLE_OUTPUT}`);
  } catch (err) {
    console.error('esbuild bundle failed:', err.message);
    process.exit(1);
  }

  // 3. Copy native addon prebuilds
  console.log('[2/5] Copying native addon prebuilds...');
  if (existsSync(NATIVE_ADDONS_DIR)) {
    rmSync(NATIVE_ADDONS_DIR, { recursive: true });
  }
  mkdirSync(NATIVE_ADDONS_DIR, { recursive: true });

  const currentPlatform = platform();
  const currentArch = arch();
  const prebuildPlatform = `${currentPlatform}-${currentArch === 'arm64' ? 'arm64' : 'x64'}`;

  const nativeModules = [
    {
      name: 'sodium-native',
      assetName: 'sodium-native.node',
      patterns: [
        `node_modules/sodium-native/prebuilds/${prebuildPlatform}/node.napi.node`,
      ],
    },
    {
      name: 'better-sqlite3',
      assetName: 'better_sqlite3.node',
      patterns: [
        `node_modules/better-sqlite3/prebuilds/${prebuildPlatform}/node.napi.node`,
      ],
    },
    {
      name: 'argon2',
      assetName: 'argon2.node',
      patterns: [
        `node_modules/argon2/prebuilds/${prebuildPlatform}/argon2.napi.node`,
        `node_modules/argon2/lib/binding/napi-v3-${currentPlatform}-${currentArch}/argon2.node`,
      ],
    },
  ];

  for (const mod of nativeModules) {
    const srcPath = findPrebuild(mod.name, mod.patterns);
    if (srcPath) {
      const destPath = join(NATIVE_ADDONS_DIR, mod.assetName);
      copyFileSync(srcPath, destPath);
      console.log(`  ${mod.assetName}: ${srcPath}`);
    } else {
      console.warn(`  WARNING: ${mod.name} prebuild not found -- SEA may fail to load this module`);
    }
  }

  // 4. Generate SEA blob
  console.log('[3/5] Generating SEA blob...');
  try {
    run(`node --experimental-sea-config ${SEA_CONFIG}`);
    console.log(`  Blob: ${SEA_BLOB}`);
  } catch (err) {
    console.error('SEA blob generation failed:', err.message);
    process.exit(1);
  }

  // 5. Copy node binary and inject SEA blob
  console.log('[4/5] Injecting SEA blob into node binary...');
  const isWindows = currentPlatform === 'win32';
  const binaryName = isWindows ? 'waiaas-daemon.exe' : 'waiaas-daemon';
  const binaryPath = join(DIST_DIR, binaryName);

  // Copy node binary
  copyFileSync(process.execPath, binaryPath);

  // Platform-specific signing and injection
  if (currentPlatform === 'darwin') {
    // macOS: remove signature, inject, re-sign
    try {
      run(`codesign --remove-signature "${binaryPath}"`);
    } catch {
      console.warn('  codesign --remove-signature failed (may not be signed)');
    }

    run(
      `npx postject "${binaryPath}" NODE_SEA_BLOB "${SEA_BLOB}" ` +
      `--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 ` +
      `--macho-segment-name NODE_SEA`
    );

    run(`codesign --sign - "${binaryPath}"`);
  } else {
    // Linux/Windows: just inject
    run(
      `npx postject "${binaryPath}" NODE_SEA_BLOB "${SEA_BLOB}" ` +
      `--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`
    );
  }

  console.log(`  Binary: ${binaryPath}`);

  // 6. Copy to Tauri externalBin location
  console.log('[5/5] Copying to Tauri externalBin...');
  const tauriBinDir = join(MONOREPO_ROOT, 'apps/desktop/src-tauri/binaries');
  if (!existsSync(tauriBinDir)) {
    mkdirSync(tauriBinDir, { recursive: true });
  }

  const tauriBinaryName = isWindows
    ? `waiaas-daemon-${targetTriple}.exe`
    : `waiaas-daemon-${targetTriple}`;
  const tauriBinaryPath = join(tauriBinDir, tauriBinaryName);
  copyFileSync(binaryPath, tauriBinaryPath);

  console.log(`  Tauri sidecar: ${tauriBinaryPath}`);
  console.log();
  console.log('=== SEA Build Complete ===');
}

main().catch((err) => {
  console.error('SEA build failed:', err);
  process.exit(1);
});
