/**
 * Tests for config loader: TOML parsing, env overrides, nested section rejection, Zod validation.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { loadConfig, parseEnvValue, detectNestedSections, DaemonConfigSchema } from '../infrastructure/config/index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  const dir = join(tmpdir(), `waiaas-config-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const tempDirs: string[] = [];
const savedEnvVars: Record<string, string | undefined> = {};

function saveTempDir(dir: string): string {
  tempDirs.push(dir);
  return dir;
}

/** Save original env var and optionally set a new value. */
function setEnv(key: string, value?: string): void {
  if (!(key in savedEnvVars)) {
    savedEnvVars[key] = process.env[key];
  }
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Restore env vars before each test
  for (const [key, val] of Object.entries(savedEnvVars)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
  // Clear tracking
  for (const key of Object.keys(savedEnvVars)) {
    delete savedEnvVars[key];
  }
});

afterEach(() => {
  // Restore env vars after each test
  for (const [key, val] of Object.entries(savedEnvVars)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
});

afterAll(() => {
  for (const dir of tempDirs) {
    try {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
});

// ---------------------------------------------------------------------------
// TOML parsing tests
// ---------------------------------------------------------------------------

describe('TOML parsing', () => {
  it('loads valid config.toml and returns parsed config', () => {
    const dir = saveTempDir(createTempDir());
    writeFileSync(
      join(dir, 'config.toml'),
      `[daemon]
port = 4000
log_level = "debug"

[database]
path = "my.db"
`,
    );

    const config = loadConfig(dir);
    expect(config.daemon.port).toBe(4000);
    expect(config.daemon.log_level).toBe('debug');
    expect(config.database.path).toBe('my.db');
  });

  it('returns all defaults when config.toml is missing', () => {
    const dir = saveTempDir(createTempDir());
    // No config.toml file
    const config = loadConfig(dir);
    expect(config.daemon.port).toBe(3100);
    expect(config.daemon.hostname).toBe('127.0.0.1');
    expect(config.daemon.log_level).toBe('info');
  });

  it('returns all defaults when config.toml is empty', () => {
    const dir = saveTempDir(createTempDir());
    writeFileSync(join(dir, 'config.toml'), '');
    const config = loadConfig(dir);
    expect(config.daemon.port).toBe(3100);
    expect(config.daemon.hostname).toBe('127.0.0.1');
  });

  it('fills other sections with defaults when only [daemon] is specified', () => {
    const dir = saveTempDir(createTempDir());
    writeFileSync(
      join(dir, 'config.toml'),
      `[daemon]
port = 5000
`,
    );
    const config = loadConfig(dir);
    expect(config.daemon.port).toBe(5000);
    // Other sections should have defaults
    expect(config.keystore.argon2_memory).toBe(65536);
    expect(config.database.path).toBe('data/waiaas.db');
    expect(config.rpc.solana_devnet).toBe('https://api.devnet.solana.com');
    expect(config.security.session_ttl).toBe(86400);
    expect(config.notifications.enabled).toBe(false);
    expect(config.notifications.locale).toBe('en');
    expect(config.notifications.rate_limit_rpm).toBe(20);
    expect(config.walletconnect.project_id).toBe('');
  });

  it('has correct default values for key settings', () => {
    const dir = saveTempDir(createTempDir());
    const config = loadConfig(dir);
    expect(config.daemon.port).toBe(3100);
    expect(config.daemon.hostname).toBe('127.0.0.1');
    expect(config.daemon.log_level).toBe('info');
    expect(config.daemon.shutdown_timeout).toBe(30);
    expect(config.daemon.dev_mode).toBe(false);
    expect(config.security.session_ttl).toBe(86400);
    expect(config.database.wal_checkpoint_interval).toBe(300);
    expect(config.database.busy_timeout).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// Nested section rejection tests
// ---------------------------------------------------------------------------

describe('nested section rejection', () => {
  it('rejects [rpc.solana] nested section with error mentioning flattened keys', () => {
    const dir = saveTempDir(createTempDir());
    writeFileSync(
      join(dir, 'config.toml'),
      `[rpc.solana]
mainnet = "https://custom.rpc.com"
`,
    );
    expect(() => loadConfig(dir)).toThrow(/flattened keys/);
  });

  it('rejects [security.auto_stop] nested section', () => {
    const dir = saveTempDir(createTempDir());
    writeFileSync(
      join(dir, 'config.toml'),
      `[security.auto_stop]
threshold = 5
`,
    );
    expect(() => loadConfig(dir)).toThrow(/Nested TOML section/);
  });

  it('rejects unknown section [unknown] listing allowed sections', () => {
    const dir = saveTempDir(createTempDir());
    writeFileSync(
      join(dir, 'config.toml'),
      `[unknown]
key = "value"
`,
    );
    expect(() => loadConfig(dir)).toThrow(/Unknown config section.*unknown.*Allowed sections/);
  });
});

// ---------------------------------------------------------------------------
// Environment variable override tests
// ---------------------------------------------------------------------------

describe('environment variable overrides', () => {
  it('WAIAAS_DAEMON_PORT=4000 overrides to number', () => {
    const dir = saveTempDir(createTempDir());
    setEnv('WAIAAS_DAEMON_PORT', '4000');
    const config = loadConfig(dir);
    expect(config.daemon.port).toBe(4000);
  });

  it('WAIAAS_DAEMON_LOG_LEVEL=debug overrides log level', () => {
    const dir = saveTempDir(createTempDir());
    setEnv('WAIAAS_DAEMON_LOG_LEVEL', 'debug');
    const config = loadConfig(dir);
    expect(config.daemon.log_level).toBe('debug');
  });

  it('WAIAAS_RPC_SOLANA_MAINNET overrides RPC URL', () => {
    const dir = saveTempDir(createTempDir());
    setEnv('WAIAAS_RPC_SOLANA_MAINNET', 'https://custom.rpc.com');
    const config = loadConfig(dir);
    expect(config.rpc.solana_mainnet).toBe('https://custom.rpc.com');
  });

  it('WAIAAS_SECURITY_SESSION_TTL=7200 overrides as number', () => {
    const dir = saveTempDir(createTempDir());
    setEnv('WAIAAS_SECURITY_SESSION_TTL', '7200');
    const config = loadConfig(dir);
    expect(config.security.session_ttl).toBe(7200);
  });

  it('WAIAAS_NOTIFICATIONS_ENABLED=true overrides as boolean', () => {
    const dir = saveTempDir(createTempDir());
    setEnv('WAIAAS_NOTIFICATIONS_ENABLED', 'true');
    const config = loadConfig(dir);
    expect(config.notifications.enabled).toBe(true);
  });

  it('env override takes priority over toml value', () => {
    const dir = saveTempDir(createTempDir());
    writeFileSync(
      join(dir, 'config.toml'),
      `[daemon]
port = 3100
`,
    );
    setEnv('WAIAAS_DAEMON_PORT', '5000');
    const config = loadConfig(dir);
    expect(config.daemon.port).toBe(5000);
  });

  it('special keys (WAIAAS_DATA_DIR, WAIAAS_MASTER_PASSWORD) are NOT applied', () => {
    const dir = saveTempDir(createTempDir());
    setEnv('WAIAAS_DATA_DIR', '/some/path');
    setEnv('WAIAAS_MASTER_PASSWORD', 'secret');
    setEnv('WAIAAS_MASTER_PASSWORD_FILE', '/secret/file');
    const config = loadConfig(dir);
    // These should not appear anywhere in config (no 'data' or 'master' section)
    expect(config.daemon.port).toBe(3100); // default, unaffected
  });
});

// ---------------------------------------------------------------------------
// Zod validation tests
// ---------------------------------------------------------------------------

describe('Zod validation', () => {
  it('rejects port below 1024', () => {
    expect(() =>
      DaemonConfigSchema.parse({ daemon: { port: 80 } }),
    ).toThrow();
  });

  it('rejects port above 65535', () => {
    expect(() =>
      DaemonConfigSchema.parse({ daemon: { port: 70000 } }),
    ).toThrow();
  });

  it('rejects invalid hostname', () => {
    expect(() =>
      DaemonConfigSchema.parse({ daemon: { hostname: 'evil.com' } }),
    ).toThrow();
  });

  it('rejects invalid log_level', () => {
    expect(() =>
      DaemonConfigSchema.parse({ daemon: { log_level: 'verbose' } }),
    ).toThrow();
  });

  it('rejects shutdown_timeout below 5', () => {
    expect(() =>
      DaemonConfigSchema.parse({ daemon: { shutdown_timeout: 1 } }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseEnvValue tests
// ---------------------------------------------------------------------------

describe('parseEnvValue', () => {
  it('"true" -> true (boolean)', () => {
    expect(parseEnvValue('true')).toBe(true);
  });

  it('"false" -> false (boolean)', () => {
    expect(parseEnvValue('false')).toBe(false);
  });

  it('"3100" -> 3100 (number)', () => {
    expect(parseEnvValue('3100')).toBe(3100);
  });

  it('\'["a","b"]\' -> ["a","b"] (JSON array)', () => {
    expect(parseEnvValue('["a","b"]')).toEqual(['a', 'b']);
  });

  it('"hello" -> "hello" (string)', () => {
    expect(parseEnvValue('hello')).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// detectNestedSections unit tests
// ---------------------------------------------------------------------------

describe('detectNestedSections', () => {
  it('accepts flat sections', () => {
    expect(() =>
      detectNestedSections({
        daemon: { port: 3100 },
        rpc: { solana_mainnet: 'https://...' },
      }),
    ).not.toThrow();
  });

  it('rejects nested objects', () => {
    expect(() =>
      detectNestedSections({
        rpc: { solana: { mainnet: 'https://...' } },
      }),
    ).toThrow(/Nested TOML section.*rpc\.solana/);
  });

  it('allows arrays in section values', () => {
    expect(() =>
      detectNestedSections({
        security: { cors_origins: ['http://localhost:3100'] },
      }),
    ).not.toThrow();
  });
});
