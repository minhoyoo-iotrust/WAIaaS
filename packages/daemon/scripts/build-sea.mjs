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
import { copyFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, arch } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MONOREPO_ROOT = resolve(ROOT, '../..');
const DIST_DIR = join(ROOT, 'dist');
const NATIVE_ADDONS_DIR = join(ROOT, 'native-addons');
// Generated at build time (see admin asset embedding below). Placed under
// dist/ so it stays out of git, since the asset paths are machine-absolute
// and admin file hashes change per build.
const SEA_CONFIG = join(ROOT, 'dist', 'sea-config.json');
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

function findPrebuild(packageName, patterns, { strict = false } = {}) {
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

  if (strict) {
    // Do NOT fall back to recursive search: it can pick a wrong-arch prebuild
    // (e.g., android-arm) and produce a silently-broken SEA binary.
    return null;
  }

  // Glob search in node_modules (non-strict only)
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

// Recursively collect relative file paths under a root directory.
function collectFiles(root, rel = '', acc = []) {
  const abs = join(root, rel);
  for (const entry of readdirSync(abs)) {
    const childRel = rel ? join(rel, entry) : entry;
    const stat = statSync(join(abs, entry));
    if (stat.isDirectory()) {
      collectFiles(root, childRel, acc);
    } else {
      acc.push(childRel);
    }
  }
  return acc;
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

  // 1b. Collect Admin UI static assets (issue 489). The daemon's ADMIN_STATIC_ROOT
  // is normally resolved relative to __dirname in dev mode; in SEA mode we
  // extract these assets to a tmp dir at startup and expose the path via
  // WAIAAS_ADMIN_STATIC_ROOT. The list of asset keys is injected into the
  // bootstrap shim so the shim can enumerate + extract them at runtime.
  const adminDistDir = resolve(MONOREPO_ROOT, 'packages/admin/dist');
  let adminAssets = [];
  if (existsSync(adminDistDir)) {
    adminAssets = collectFiles(adminDistDir).sort();
    console.log(`  Admin UI: ${adminAssets.length} files from ${adminDistDir}`);
  } else {
    console.warn(`  WARNING: admin dist not found at ${adminDistDir} -- Desktop Setup Wizard will be unavailable`);
  }

  // SEA bootstrap shim — see issue 486.
  //
  // In SEA mode, the main script's `require` is Node's embedderRequire which
  // ONLY resolves built-in modules. Any externalized native addon (e.g.
  // `require('better-sqlite3')`) hits embedderRequire and throws
  // ERR_UNKNOWN_BUILTIN_MODULE.
  //
  // Fix: prepend a shim that (1) dlopen()s the 3 embedded native .node assets,
  // (2) stashes them on globalThis, and (3) shadows the outer `require` param
  // with an interceptor that routes known names to the dlopen'd exports and
  // falls back to Module.createRequire(process.execPath) for disk-resolvable
  // modules. In dev mode (non-SEA), the shim is a no-op and the original
  // require is preserved.
  const adminAssetKeysJs = JSON.stringify(adminAssets.map(f => 'admin/' + f.split(/\\|\//).join('/')));

  const SEA_BOOTSTRAP_SHIM = `
// === WAIaaS SEA bootstrap shim (issue 486) ===
(function __waiaasSeaBootstrap() {
  // Always set an import.meta.url equivalent. esbuild's CJS output replaces
  // \`import.meta.url\` with undefined, which breaks \`createRequire(import.meta.url)\`
  // call sites sprinkled across the codebase (keystore, wc-signing-bridge,
  // version-check-service, etc.). See esbuild \`define\` in build-sea.mjs.
  try {
    globalThis.__waiaasImportMetaUrl = require('node:url').pathToFileURL(process.execPath).href;
  } catch (_) {}

  var sea;
  try { sea = require('node:sea'); } catch (_) { return; }
  if (!sea || !sea.isSea || !sea.isSea()) return;

  var fs = require('node:fs');
  var os = require('node:os');
  var path = require('node:path');
  var Module = require('node:module');

  function dlopenAsset(assetName) {
    var buf = Buffer.from(sea.getRawAsset(assetName));
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waiaas-sea-'));
    var p = path.join(dir, assetName);
    fs.writeFileSync(p, buf);
    var m = { exports: {} };
    process.dlopen(m, p);
    return m.exports;
  }

  // Load all embedded native addons up front.
  var addons = Object.create(null);
  var addonFiles = ['better_sqlite3.node', 'sodium-native.node', 'argon2.node'];
  for (var i = 0; i < addonFiles.length; i++) {
    try { addons[addonFiles[i]] = dlopenAsset(addonFiles[i]); }
    catch (e) { console.error('[SEA] failed to load ' + addonFiles[i] + ': ' + e.message); }
  }

  // Extract Admin UI static assets (issue 489) so Hono's serveStatic can
  // read them from the filesystem. Asset keys are injected by build-sea.mjs.
  var adminAssetKeys = ${adminAssetKeysJs};
  if (adminAssetKeys.length > 0) {
    try {
      var adminRoot = path.join(os.tmpdir(), 'waiaas-sea-admin-' + process.pid);
      fs.mkdirSync(adminRoot, { recursive: true });
      for (var j = 0; j < adminAssetKeys.length; j++) {
        var key = adminAssetKeys[j];
        var rel = key.slice('admin/'.length);
        var dest = path.join(adminRoot, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        var aBuf = Buffer.from(sea.getRawAsset(key));
        fs.writeFileSync(dest, aBuf);
      }
      process.env.WAIAAS_ADMIN_STATIC_ROOT = adminRoot;
      // Best-effort cleanup on process exit
      process.on('exit', function () {
        try { fs.rmSync(adminRoot, { recursive: true, force: true }); } catch (_) {}
      });
    } catch (e) {
      console.error('[SEA] failed to extract admin assets: ' + e.message);
    }
  }

  // Stub the three native addon loader packages so the bundled JS wrappers
  // (better-sqlite3/lib/database.js, sodium-native/index.js, argon2.cjs)
  // receive the dlopened addon exports instead of trying to walk the disk.
  function bindingsStub(name) {
    var key = String(name);
    if (!/\\.node$/.test(key)) key += '.node';
    if (addons[key]) return addons[key];
    throw new Error("SEA: bindings('" + name + "') not found in embedded assets");
  }
  // sodium-native is the only consumer of require-addon in our deps
  var requireAddonStub = function () { return addons['sodium-native.node']; };
  // argon2 is the only consumer of node-gyp-build in our deps
  var nodeGypBuildStub = function () { return addons['argon2.node']; };

  var natives = Object.create(null);
  // Loader package stubs (intercept the mechanism used by bundled JS wrappers)
  natives['bindings'] = bindingsStub;
  natives['require-addon'] = requireAddonStub;
  natives['node-gyp-build'] = nodeGypBuildStub;
  natives['node-gyp-build-optional-packages'] = nodeGypBuildStub;

  // Direct module name intercepts (issue 493). Several daemon source files
  // use \`createRequire(import.meta.url)('sodium-native')\` instead of going
  // through the bundled JS wrapper. These calls resolve via the shim's
  // diskRequire which can't find the module next to the SEA binary. Map the
  // module names directly to the dlopened exports so both code paths work.
  // For sodium-native the raw .node export IS the full module API (the JS
  // wrapper at index.js just re-exports it). For better-sqlite3 and argon2
  // the situation is different (JS wrappers add constructors/helpers), but
  // no direct requires exist today so we only add sodium-native for now.
  natives['sodium-native'] = addons['sodium-native.node'];

  // Issue 494: patch Module._load globally so ALL require code paths
  // (including createRequire-generated loaders) hit our native map. The
  // per-wrapper \`var require = __waiaasSeaRequire\` shadow only covers
  // the outer CJS wrapper parameter; createRequire() creates an independent
  // loader that goes through Module._load instead.
  var origLoad = Module._load;
  Module._load = function __waiaasModuleLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(natives, request)) return natives[request];
    return origLoad.call(this, request, parent, isMain);
  };

  var diskRequire;
  try { diskRequire = Module.createRequire(process.execPath); } catch (_) {}

  globalThis.__waiaasSeaRequire = function (id) {
    if (Object.prototype.hasOwnProperty.call(natives, id)) return natives[id];
    if (diskRequire) { try { return diskRequire(id); } catch (_) {} }
    throw new Error("SEA require('" + id + "') failed: not a bundled native addon loader and not resolvable from disk");
  };
})();
// Shadow the outer \`require\` parameter so the rest of this CJS wrapper routes
// through the SEA interceptor. In dev mode __waiaasSeaRequire is undefined so
// the original require is preserved.
var require = globalThis.__waiaasSeaRequire || require;
// === end SEA bootstrap shim ===
`;

  // esbuild plugin: SEA source compatibility transforms (issues 486, 492, 494).
  //
  // Several daemon/CLI source files use `createRequire(import.meta.url)` to get
  // a CJS `require` function in ESM context. This creates a SEPARATE loader
  // that resolves from disk relative to process.execPath — completely bypassing
  // both esbuild's bundling and our SEA bootstrap shim. In SEA mode these calls
  // fail with MODULE_NOT_FOUND because there's no node_modules next to the
  // binary.
  //
  // Fix: strip the createRequire pattern at build time so that:
  //   `const require = createRequire(import.meta.url)` → removed
  //     → subsequent `require('sodium-native')` uses the outer CJS require
  //     → esbuild statically resolves and bundles it (or externalizes it)
  //   `const esmRequire = createRequire(import.meta.url)` → `const esmRequire = require`
  //     → aliased to outer CJS require for existing `esmRequire(...)` call sites
  //   `import { createRequire } from 'node:module'` → removed (unused after above)
  //
  // Also inlines relative `require('*/package.json')` as literal JSON objects
  // since those resolve relative to source location, not the SEA binary.
  const seaSourcePlugin = {
    name: 'sea-source-compat',
    setup(build) {
      const pkgCache = new Map();
      build.onLoad({ filter: /\.(ts|js)$/ }, (args) => {
        if (args.path.includes('/node_modules/')) return null;
        let source;
        try {
          source = readFileSync(args.path, 'utf8');
        } catch {
          return null;
        }

        // Quick bail: file has no createRequire or package.json patterns
        if (!/createRequire|package\.json/.test(source)) return null;

        let modified = source;

        // 1. Strip `const require = createRequire(import.meta.url);`
        //    This lets the outer CJS require take over, enabling esbuild to
        //    statically resolve require('sodium-native'), require('ripple-keypairs') etc.
        modified = modified.replace(
          /(?:const|let|var)\s+require\s*=\s*createRequire\([^)]*\);?\s*\n?/g,
          '/* [SEA] createRequire stripped — using outer CJS require */\n',
        );

        // 2. Alias `const esmRequire = createRequire(...)` → `const esmRequire = require`
        modified = modified.replace(
          /(?:const|let|var)\s+(esmRequire|require_)\s*=\s*createRequire\([^)]*\);?/g,
          'const $1 = require; /* [SEA] aliased to outer CJS require */',
        );

        // 3. Strip the now-unused createRequire import
        modified = modified.replace(
          /import\s*\{\s*createRequire\s*\}\s*from\s*['"]node:module['"];?\s*\n?/g,
          '/* [SEA] createRequire import stripped */\n',
        );

        // 4. Inline relative package.json requires (unchanged from original plugin)
        modified = modified.replace(
          /\b(?:require|esmRequire)\((['"])([^'"]*package\.json)\1\)/g,
          (match, _quote, relPath) => {
            const absPath = resolve(dirname(args.path), relPath);
            if (!existsSync(absPath)) return match;
            let pkg = pkgCache.get(absPath);
            if (!pkg) {
              try {
                pkg = JSON.parse(readFileSync(absPath, 'utf8'));
              } catch {
                return match;
              }
              pkgCache.set(absPath, pkg);
            }
            return JSON.stringify({ version: pkg.version ?? '0.0.0' });
          },
        );

        if (modified === source) return null;
        const loader = args.path.endsWith('.ts') ? 'ts' : 'js';
        return { contents: modified, loader };
      });
    },
  };

  // 2. esbuild bundle
  console.log('[1/5] Bundling daemon with esbuild...');
  try {
    const { build } = await import('esbuild');
    await build({
      plugins: [seaSourcePlugin],
      entryPoints: [join(MONOREPO_ROOT, 'packages/cli/src/index.ts')],
      bundle: true,
      format: 'cjs',
      platform: 'node',
      target: 'node22',
      outfile: BUNDLE_OUTPUT,
      banner: {
        js: SEA_BOOTSTRAP_SHIM,
      },
      define: {
        // esbuild's CJS output defaults \`import.meta.url\` to undefined which
        // breaks createRequire(). Redirect to the shim-set globalThis value
        // (pathToFileURL(process.execPath).href in SEA, or fallback env).
        'import.meta.url': 'globalThis.__waiaasImportMetaUrl',
      },
      external: [
        // Native addon LOADER packages -- externalized so the SEA bootstrap
        // shim can intercept require('bindings'), require('require-addon'),
        // and require('node-gyp-build') and return the dlopened addon exports.
        // The native modules themselves (better-sqlite3, sodium-native, argon2)
        // are now BUNDLED so their JS wrappers are available, and the native
        // .node files are extracted from SEA assets at runtime. See issue 486.
        'bindings',
        'require-addon',
        'node-gyp-build',
        'node-gyp-build-optional-packages',
        'fsevents',
        // Legacy @solana/web3.js dependency tree — transitive deps from @solana/spl-token etc.
        // Our codebase uses @solana/kit; these are optional peer deps not needed at runtime.
        '@solana/web3.js',
        '@solana/buffer-layout-utils',
        '@solana/spl-token-metadata',
        '@project-serum/borsh',
        '@project-serum/serum',
        'buffer-layout',
        'superstruct',
        'pako',
        'camelcase',
        'js-sha256',
        'snake-case',
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
        // sodium-native v4+ ships prebuilds as <name>.node, not node.napi.node
        `node_modules/sodium-native/prebuilds/${prebuildPlatform}/sodium-native.node`,
        `node_modules/sodium-native/prebuilds/${prebuildPlatform}/node.napi.node`,
        `packages/daemon/node_modules/sodium-native/prebuilds/${prebuildPlatform}/sodium-native.node`,
      ],
      // Never fall back to recursive search -- would pick wrong arch (e.g. android-arm)
      strict: true,
    },
    {
      name: 'better-sqlite3',
      assetName: 'better_sqlite3.node',
      patterns: [
        `node_modules/better-sqlite3/prebuilds/${prebuildPlatform}/node.napi.node`,
        `node_modules/better-sqlite3/build/Release/better_sqlite3.node`,
        `packages/daemon/node_modules/better-sqlite3/prebuilds/${prebuildPlatform}/node.napi.node`,
        `packages/daemon/node_modules/better-sqlite3/build/Release/better_sqlite3.node`,
      ],
      strict: true,
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
    const srcPath = findPrebuild(mod.name, mod.patterns, { strict: mod.strict });
    if (srcPath) {
      const destPath = join(NATIVE_ADDONS_DIR, mod.assetName);
      copyFileSync(srcPath, destPath);
      console.log(`  ${mod.assetName}: ${srcPath}`);
    } else {
      console.warn(`  WARNING: ${mod.name} prebuild not found -- SEA may fail to load this module`);
    }
  }

  // 4. Generate SEA blob (rewrite sea-config.json to include admin assets)
  console.log('[3/5] Generating SEA blob...');
  try {
    const seaConfigObj = {
      main: 'dist/daemon-bundle.cjs',
      output: 'dist/sea-prep.blob',
      disableExperimentalSEAWarning: true,
      useCodeCache: true,
      assets: {
        'sodium-native.node': 'native-addons/sodium-native.node',
        'better_sqlite3.node': 'native-addons/better_sqlite3.node',
        'argon2.node': 'native-addons/argon2.node',
      },
    };
    for (const rel of adminAssets) {
      const key = 'admin/' + rel.split(/\\|\//).join('/');
      // Path is relative to SEA_CONFIG directory (ROOT = packages/daemon)
      seaConfigObj.assets[key] = resolve(adminDistDir, rel);
    }
    writeFileSync(SEA_CONFIG, JSON.stringify(seaConfigObj, null, 2));
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
