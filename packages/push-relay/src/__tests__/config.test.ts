import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../config.js';

function tmpDirFn(): string {
  const dir = join(tmpdir(), `push-relay-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('loadConfig', () => {
  it('loads valid pushwoosh config', () => {
    const dir = tmpDirFn();
    const path = join(dir, 'config.toml');
    writeFileSync(
      path,
      `
[relay.push]
provider = "pushwoosh"

[relay.push.pushwoosh]
api_token = "test-token"
application_code = "TEST-123"

[relay.server]
port = 3200
host = "0.0.0.0"
api_key = "secret"
`,
    );

    const config = loadConfig(path);
    expect(config.relay.push.provider).toBe('pushwoosh');
    expect(config.relay.push.pushwoosh?.api_token).toBe('test-token');
    expect(config.relay.server.port).toBe(3200);
    expect(config.relay.server.api_key).toBe('secret');

    rmSync(dir, { recursive: true });
  });

  it('loads valid fcm config', () => {
    const dir = tmpDirFn();
    const path = join(dir, 'config.toml');
    writeFileSync(
      path,
      `
[relay.push]
provider = "fcm"

[relay.push.fcm]
project_id = "my-project"
service_account_key_path = "/etc/sa.json"

[relay.server]
api_key = "my-key"
`,
    );

    const config = loadConfig(path);
    expect(config.relay.push.provider).toBe('fcm');
    expect(config.relay.push.fcm?.project_id).toBe('my-project');

    rmSync(dir, { recursive: true });
  });

  it('throws on missing pushwoosh section when provider is pushwoosh', () => {
    const dir = tmpDirFn();
    const path = join(dir, 'config.toml');
    writeFileSync(
      path,
      `
[relay.push]
provider = "pushwoosh"

[relay.server]
api_key = "secret"
`,
    );

    expect(() => loadConfig(path)).toThrow('pushwoosh');
    rmSync(dir, { recursive: true });
  });

  it('throws on missing api_key', () => {
    const dir = tmpDirFn();
    const path = join(dir, 'config.toml');
    writeFileSync(
      path,
      `
[relay.push]
provider = "pushwoosh"

[relay.push.pushwoosh]
api_token = "token"
application_code = "code"

[relay.server]
port = 3200
`,
    );

    expect(() => loadConfig(path)).toThrow();
    rmSync(dir, { recursive: true });
  });

  it('applies defaults for port and host', () => {
    const dir = tmpDirFn();
    const path = join(dir, 'config.toml');
    writeFileSync(
      path,
      `
[relay.push]
provider = "pushwoosh"

[relay.push.pushwoosh]
api_token = "t"
application_code = "c"

[relay.server]
api_key = "k"
`,
    );

    const config = loadConfig(path);
    expect(config.relay.server.port).toBe(3200);
    expect(config.relay.server.host).toBe('0.0.0.0');

    rmSync(dir, { recursive: true });
  });

  it('loads config with [relay.push.payload] section', () => {
    const dir = tmpDirFn();
    const path = join(dir, 'config.toml');
    writeFileSync(
      path,
      `
[relay.push]
provider = "pushwoosh"

[relay.push.pushwoosh]
api_token = "token"
application_code = "code"

[relay.push.payload.static_fields]
app_id = "com.dcent.wallet"
env = "production"

[relay.push.payload.category_map.sign_request]
sound = "alert.caf"
badge = "1"

[relay.push.payload.category_map.notification]
sound = "default"

[relay.server]
api_key = "secret"
`,
    );

    const config = loadConfig(path);
    expect(config.relay.push.payload).toBeDefined();
    expect(config.relay.push.payload!.static_fields).toEqual({
      app_id: 'com.dcent.wallet',
      env: 'production',
    });
    expect(config.relay.push.payload!.category_map).toEqual({
      sign_request: { sound: 'alert.caf', badge: '1' },
      notification: { sound: 'default' },
    });

    rmSync(dir, { recursive: true });
  });

  it('loads config without [relay.push.payload] section (backward compat)', () => {
    const dir = tmpDirFn();
    const path = join(dir, 'config.toml');
    writeFileSync(
      path,
      `
[relay.push]
provider = "pushwoosh"

[relay.push.pushwoosh]
api_token = "token"
application_code = "code"

[relay.server]
api_key = "secret"
`,
    );

    const config = loadConfig(path);
    expect(config.relay.push.payload).toBeUndefined();

    rmSync(dir, { recursive: true });
  });
});
