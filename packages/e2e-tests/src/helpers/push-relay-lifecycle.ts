/**
 * PushRelayManager — E2E Push Relay lifecycle management.
 *
 * Spawns the Push Relay server as a child process with isolated temp directories,
 * config generation, health check polling, and clean shutdown.
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { fork, type ChildProcess } from 'node:child_process';

export interface PushRelayInstance {
  dataDir: string;
  port: number;
  baseUrl: string;
  process: ChildProcess;
}

export class PushRelayManager {
  private instance: PushRelayInstance | null = null;
  private stdout: string[] = [];
  private stderr: string[] = [];

  /**
   * Start Push Relay.
   *
   * 1. Create temp directory
   * 2. Write config.toml with required relay config
   * 3. Fork push-relay bin
   * 4. Wait for health check
   * 5. Return PushRelayInstance
   */
  async start(opts?: { binPath?: string }): Promise<PushRelayInstance> {
    if (this.instance) {
      throw new Error('PushRelayManager: already started');
    }

    // 1. Create temp directory
    const dataDir = join(tmpdir(), `waiaas-push-relay-e2e-${randomUUID()}`);
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    mkdirSync(join(dataDir, 'data'), { recursive: true, mode: 0o700 });

    // 2. Find free port and write config
    const port = await this.findFreePort();
    const config = `[relay]
ntfy_server = "https://ntfy.sh"
sign_topic_prefix = "waiaas-e2e-sign"
notify_topic_prefix = "waiaas-e2e-notify"
wallet_names = ["e2e-test-wallet"]

[relay.push]
provider = "pushwoosh"

[relay.push.pushwoosh]
api_token = "e2e-test-token"
application_code = "E2E00"

[relay.server]
port = ${port}
host = "127.0.0.1"
api_key = "e2e-test-api-key"
`;
    writeFileSync(join(dataDir, 'config.toml'), config, { mode: 0o644 });

    // 3. Resolve bin path
    const binPath = opts?.binPath
      ?? process.env['PUSH_RELAY_BIN_PATH']
      ?? this.resolveMonorepoBin();

    if (!existsSync(binPath)) {
      throw new Error(
        `PushRelayManager: bin not found at ${binPath}. ` +
        `Build with 'pnpm turbo run build --filter=@waiaas/push-relay' or set PUSH_RELAY_BIN_PATH.`,
      );
    }

    // 4. Fork the process
    this.stdout = [];
    this.stderr = [];

    const child = fork(binPath, [], {
      env: {
        ...process.env,
        PUSH_RELAY_CONFIG: join(dataDir, 'config.toml'),
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      silent: true,
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      this.stdout.push(chunk.toString());
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      this.stderr.push(chunk.toString());
    });

    child.on('error', (err) => {
      this.stderr.push(`Process error: ${err.message}`);
    });

    const baseUrl = `http://127.0.0.1:${port}`;

    // 5. Wait for health check
    try {
      await this.waitForHealth(baseUrl, 10_000);
    } catch (err) {
      child.kill('SIGKILL');
      const stderrOutput = this.stderr.join('');
      rmSync(dataDir, { recursive: true, force: true });
      throw new Error(
        `PushRelayManager: health check failed. stderr: ${stderrOutput}\n` +
        `Original error: ${(err as Error).message}`,
      );
    }

    this.instance = { dataDir, port, baseUrl, process: child };
    return this.instance;
  }

  /** Stop Push Relay and clean up. */
  async stop(): Promise<void> {
    if (!this.instance) return;

    const { process: child, dataDir } = this.instance;
    this.instance = null;

    if (!child.killed) {
      child.kill('SIGTERM');

      const exited = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 5000);
        child.on('exit', () => {
          clearTimeout(timer);
          resolve(true);
        });
      });

      if (!exited && !child.killed) {
        child.kill('SIGKILL');
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 1000);
          child.on('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    }

    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  /** Health check polling. */
  private async waitForHealth(baseUrl: string, timeoutMs = 10_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`${baseUrl}/health`);
        if (res.status === 200) return;
      } catch {
        // Connection refused, not ready yet
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`Health check timeout after ${timeoutMs}ms`);
  }

  /** Find a free port using net.createServer bind. */
  private async findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          const port = addr.port;
          server.close(() => resolve(port));
        } else {
          server.close(() => reject(new Error('Failed to get address')));
        }
      });
    });
  }

  /** Resolve push-relay bin path within monorepo. */
  private resolveMonorepoBin(): string {
    // helpers/ -> src/ -> e2e-tests/ -> packages/push-relay/dist/bin.js
    const helpersDir = new URL('.', import.meta.url).pathname;
    return join(helpersDir, '..', '..', '..', 'push-relay', 'dist', 'bin.js');
  }
}
