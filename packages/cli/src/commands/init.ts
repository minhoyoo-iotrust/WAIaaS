/**
 * `waiaas init` -- Initialize the WAIaaS data directory.
 *
 * Creates:
 *   - Data directory (0o700)
 *   - Subdirectories: keystore/, data/, logs/, backups/
 *   - Default config.toml (if not exists)
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_CONFIG = `# WAIaaS Daemon Configuration
# See documentation for all available options

[daemon]
port = 3100
hostname = "127.0.0.1"

[database]
path = "data/waiaas.db"
`;

export async function initCommand(dataDir: string): Promise<void> {
  const configPath = join(dataDir, 'config.toml');

  // Check if already initialized
  if (existsSync(dataDir) && existsSync(configPath)) {
    console.log(`Already initialized: ${dataDir}`);
    return;
  }

  // Create data directory
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });

  // Create subdirectories
  const subdirs = ['keystore', 'data', 'logs', 'backups'];
  for (const sub of subdirs) {
    const subPath = join(dataDir, sub);
    if (!existsSync(subPath)) {
      mkdirSync(subPath, { recursive: true, mode: 0o700 });
    }
  }

  // Write default config.toml (skip if already exists)
  if (!existsSync(configPath)) {
    writeFileSync(configPath, DEFAULT_CONFIG, { mode: 0o644 });
  }

  console.log(`Initialized WAIaaS data directory: ${dataDir}`);
  console.log(`  config.toml`);
  for (const sub of subdirs) {
    console.log(`  ${sub}/`);
  }
  console.log('');
  console.log('Next: waiaas start');
}
