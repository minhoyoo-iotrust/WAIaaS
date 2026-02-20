#!/usr/bin/env node
// Promote RC to stable release, or restore prerelease mode.
//
// Usage:
//   node scripts/promote-release.js <rc-version>         # promote: 2.4.0-rc.8 -> 2.4.0
//   node scripts/promote-release.js --restore            # restore prerelease mode
//   node scripts/promote-release.js <rc-version> --dry-run
//   node scripts/promote-release.js --restore --dry-run

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '..', 'release-please-config.json');

const PRERELEASE_SETTINGS = {
  versioning: 'prerelease',
  prerelease: true,
  'prerelease-type': 'rc',
};

function parseArgs(argv) {
  const args = argv.slice(2);
  let rcVersion = null;
  let mode = 'promote';
  let dryRun = false;

  for (const arg of args) {
    if (arg === '--restore') mode = 'restore';
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/promote-release.js [<rc-version>] [--restore] [--dry-run]

  <rc-version>   RC version to promote (e.g., 2.4.0-rc.8)
  --restore      Restore prerelease mode after stable release
  --dry-run      Show changes without writing to disk

Examples:
  node scripts/promote-release.js 2.4.0-rc.8           # promote
  node scripts/promote-release.js --restore             # restore
  node scripts/promote-release.js 2.4.0-rc.8 --dry-run # preview`);
      process.exit(0);
    } else {
      rcVersion = arg;
    }
  }

  return { rcVersion, mode, dryRun };
}

function extractStableVersion(rcVersion) {
  // 2.4.0-rc.8 -> 2.4.0, v2.4.0-rc.8 -> 2.4.0
  const stripped = rcVersion.replace(/^v/, '');
  const match = stripped.match(/^(\d+\.\d+\.\d+)-rc\.\d+$/);
  if (!match) {
    console.error(`Error: "${rcVersion}" is not a valid RC version (expected X.Y.Z-rc.N)`);
    process.exit(1);
  }
  return match[1];
}

function readConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
}

function writeConfig(config, dryRun) {
  const content = JSON.stringify(config, null, 2) + '\n';
  if (dryRun) {
    console.log('\n[dry-run] Would write to release-please-config.json:\n');
    // Show only the packages section for brevity
    const preview = JSON.parse(content);
    console.log(JSON.stringify(preview.packages, null, 2));
    return;
  }
  writeFileSync(CONFIG_PATH, content);
}

function promote(rcVersion, dryRun) {
  if (!rcVersion) {
    console.error('Error: RC version required for promote mode.');
    console.error('Usage: node scripts/promote-release.js <rc-version>');
    process.exit(1);
  }

  const stableVersion = extractStableVersion(rcVersion);
  const config = readConfig();

  console.log(`=== Promote: ${rcVersion} -> ${stableVersion} ===`);

  let changed = 0;
  for (const [pkgPath, pkgConfig] of Object.entries(config.packages)) {
    // Remove prerelease settings
    delete pkgConfig.versioning;
    delete pkgConfig.prerelease;
    delete pkgConfig['prerelease-type'];

    // Add release-as
    // Insert release-as before extra-files for readability
    const ordered = {};
    for (const [key, value] of Object.entries(pkgConfig)) {
      if (key === 'extra-files') {
        ordered['release-as'] = stableVersion;
      }
      ordered[key] = value;
    }
    // If extra-files wasn't found, add at end
    if (!ordered['release-as']) {
      ordered['release-as'] = stableVersion;
    }
    config.packages[pkgPath] = ordered;
    changed++;
  }

  console.log(`  Removed prerelease settings from ${changed} package(s)`);
  console.log(`  Added release-as: "${stableVersion}" to ${changed} package(s)`);

  writeConfig(config, dryRun);

  if (!dryRun) {
    console.log('\nDone. Commit and push to trigger release-please stable Release PR.');
    console.log('After the stable release is published, run:');
    console.log('  node scripts/promote-release.js --restore');
  }
}

function restore(dryRun) {
  const config = readConfig();

  console.log('=== Restore: stable -> prerelease ===');

  let changed = 0;
  for (const [pkgPath, pkgConfig] of Object.entries(config.packages)) {
    // Remove release-as
    delete pkgConfig['release-as'];

    // Restore prerelease settings before extra-files
    const ordered = {};
    for (const [key, value] of Object.entries(pkgConfig)) {
      if (key === 'extra-files') {
        ordered.versioning = PRERELEASE_SETTINGS.versioning;
        ordered.prerelease = PRERELEASE_SETTINGS.prerelease;
        ordered['prerelease-type'] = PRERELEASE_SETTINGS['prerelease-type'];
      }
      // Skip if already a prerelease key (avoid duplicates)
      if (key === 'versioning' || key === 'prerelease' || key === 'prerelease-type') continue;
      ordered[key] = value;
    }
    // If extra-files wasn't found, add at end
    if (!ordered.versioning) {
      ordered.versioning = PRERELEASE_SETTINGS.versioning;
      ordered.prerelease = PRERELEASE_SETTINGS.prerelease;
      ordered['prerelease-type'] = PRERELEASE_SETTINGS['prerelease-type'];
    }
    config.packages[pkgPath] = ordered;
    changed++;
  }

  console.log(`  Removed release-as from ${changed} package(s)`);
  console.log(`  Restored prerelease settings to ${changed} package(s)`);

  writeConfig(config, dryRun);

  if (!dryRun) {
    console.log('\nDone. Commit and push. Next commits will produce RC versions.');
  }
}

// Main
const { rcVersion, mode, dryRun } = parseArgs(process.argv);

if (mode === 'promote') {
  promote(rcVersion, dryRun);
} else {
  restore(dryRun);
}
