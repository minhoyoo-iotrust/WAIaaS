/**
 * DaemonManager — E2E daemon lifecycle management.
 *
 * Spawns the WAIaaS daemon as a child process with isolated temp directories,
 * config generation, health check polling, and clean shutdown.
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { fork, type ChildProcess } from 'node:child_process';

export interface DaemonInstance {
  dataDir: string;
  port: number;
  baseUrl: string;
  process: ChildProcess;
  masterPassword: string;
}

const DEFAULT_MASTER_PASSWORD = 'e2e-test-password-12345';

export class DaemonManager {
  private instance: DaemonInstance | null = null;
  private stdout: string[] = [];
  private stderr: string[] = [];

  /**
   * Start the daemon.
   *
   * 1. Create temp data directory with required subdirectories
   * 2. Find a free port and write config.toml
   * 3. Fork the CLI entrypoint as a child process
   * 4. Wait for health check
   * 5. Return DaemonInstance
   */
  async start(opts?: {
    masterPassword?: string;
    cliPath?: string;
  }): Promise<DaemonInstance> {
    if (this.instance) {
      throw new Error('DaemonManager: already started');
    }

    const masterPassword = opts?.masterPassword ?? DEFAULT_MASTER_PASSWORD;

    // 1. Create isolated temp directory
    const dataDir = join(tmpdir(), `waiaas-e2e-${randomUUID()}`);
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    for (const sub of ['data', 'keystore', 'logs', 'backups']) {
      mkdirSync(join(dataDir, sub), { recursive: true, mode: 0o700 });
    }

    // 2. Find free port and write config
    const port = await this.findFreePort();
    const config = `[daemon]
port = ${port}
hostname = "127.0.0.1"

[database]
path = "data/waiaas.db"
`;
    writeFileSync(join(dataDir, 'config.toml'), config, { mode: 0o644 });

    // 3. Resolve CLI path
    const cliPath = opts?.cliPath
      ?? process.env['WAIAAS_CLI_PATH']
      ?? this.resolveMonorepoCli();

    if (!existsSync(cliPath)) {
      throw new Error(
        `DaemonManager: CLI entrypoint not found at ${cliPath}. ` +
        `Build with 'pnpm turbo run build --filter=@waiaas/cli' or set WAIAAS_CLI_PATH.`,
      );
    }

    // 4. Fork the CLI process
    this.stdout = [];
    this.stderr = [];

    const child = fork(cliPath, ['start', '--data-dir', dataDir], {
      env: {
        ...process.env,
        WAIAAS_MASTER_PASSWORD: masterPassword,
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      silent: true,
    });

    // Collect output for debugging
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
      await this.waitForHealth(baseUrl, 15_000);
    } catch (err) {
      // Kill the process on health check failure
      child.kill('SIGKILL');
      const stderrOutput = this.stderr.join('');
      rmSync(dataDir, { recursive: true, force: true });
      throw new Error(
        `DaemonManager: health check failed. stderr: ${stderrOutput}\n` +
        `Original error: ${(err as Error).message}`,
      );
    }

    this.instance = { dataDir, port, baseUrl, process: child, masterPassword };
    return this.instance;
  }

  /**
   * Stop the daemon and clean up temp directory.
   */
  async stop(): Promise<void> {
    if (!this.instance) return;

    const { process: child, dataDir } = this.instance;
    this.instance = null;

    // Send SIGTERM
    if (!child.killed) {
      child.kill('SIGTERM');

      // Wait up to 5 seconds for graceful shutdown
      const exited = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 5000);
        child.on('exit', () => {
          clearTimeout(timer);
          resolve(true);
        });
      });

      // Force kill if still alive
      if (!exited && !child.killed) {
        child.kill('SIGKILL');
        // Wait a bit for SIGKILL
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 1000);
          child.on('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    }

    // Check exit code
    if (child.exitCode !== null && child.exitCode !== 0 && child.exitCode !== null) {
      const stderrOutput = this.stderr.join('');
      if (stderrOutput) {
        console.error(`DaemonManager: non-zero exit (${child.exitCode}), stderr:\n${stderrOutput}`);
      }
    }

    // Clean up temp directory
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  /** Health check polling. */
  private async waitForHealth(baseUrl: string, timeoutMs = 15_000): Promise<void> {
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

  /** Resolve CLI bin path within monorepo. */
  private resolveMonorepoCli(): string {
    // helpers/ -> src/ -> e2e-tests/ -> packages/cli/bin/waiaas
    const helpersDir = new URL('.', import.meta.url).pathname;
    return join(helpersDir, '..', '..', '..', 'cli', 'bin', 'waiaas');
  }
}
