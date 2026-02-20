import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../config.js';

function tmpDir(): string {
  const dir = join(tmpdir(), `push-relay-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('loadConfig', () => {
  it('loads valid pushwoosh config', () => {
    const dir = tmpDir();
    const path = join(dir, 'config.toml');
    writeFileSync(
      path,
      `
[relay]
ntfy_server = "https://ntfy.sh"
sign_topic_prefix = "waiaas-sign"
notify_topic_prefix = "waiaas-notify"
wallet_names = ["dcent"]

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
    expect(config.relay.ntfy_server).toBe('https://ntfy.sh');
    expect(config.relay.wallet_names).toEqual(['dcent']);
    expect(config.relay.push.provider).toBe('pushwoosh');
    expect(config.relay.push.pushwoosh?.api_token).toBe('test-token');
    expect(config.relay.server.port).toBe(3200);
    expect(config.relay.server.api_key).toBe('secret');

    rmSync(dir, { recursive: true });
  });

  it('loads valid fcm config', () => {
    const dir = tmpDir();
    const path = join(dir, 'config.toml');
    writeFileSync(
      path,
      `
[relay]
wallet_names = ["bot1", "bot2"]

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
    expect(config.relay.wallet_names).toEqual(['bot1', 'bot2']);
    expect(config.relay.push.provider).toBe('fcm');
    expect(config.relay.push.fcm?.project_id).toBe('my-project');

    rmSync(dir, { recursive: true });
  });

  it('throws on missing pushwoosh section when provider is pushwoosh', () => {
    const dir = tmpDir();
    const path = join(dir, 'config.toml');
    writeFileSync(
      path,
      `
[relay]
wallet_names = ["dcent"]

[relay.push]
provider = "pushwoosh"

[relay.server]
api_key = "secret"
`,
    );

    expect(() => loadConfig(path)).toThrow('pushwoosh');
    rmSync(dir, { recursive: true });
  });

  it('throws on empty wallet_names', () => {
    const dir = tmpDir();
    const path = join(dir, 'config.toml');
    writeFileSync(
      path,
      `
[relay]
wallet_names = []

[relay.push]
provider = "pushwoosh"

[relay.push.pushwoosh]
api_token = "token"
application_code = "code"

[relay.server]
api_key = "secret"
`,
    );

    expect(() => loadConfig(path)).toThrow();
    rmSync(dir, { recursive: true });
  });

  it('throws on missing api_key', () => {
    const dir = tmpDir();
    const path = join(dir, 'config.toml');
    writeFileSync(
      path,
      `
[relay]
wallet_names = ["dcent"]

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

  it('applies defaults for ntfy_server, prefixes, port, host', () => {
    const dir = tmpDir();
    const path = join(dir, 'config.toml');
    writeFileSync(
      path,
      `
[relay]
wallet_names = ["w1"]

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
    expect(config.relay.ntfy_server).toBe('https://ntfy.sh');
    expect(config.relay.sign_topic_prefix).toBe('waiaas-sign');
    expect(config.relay.notify_topic_prefix).toBe('waiaas-notify');
    expect(config.relay.server.port).toBe(3200);
    expect(config.relay.server.host).toBe('0.0.0.0');

    rmSync(dir, { recursive: true });
  });
});
