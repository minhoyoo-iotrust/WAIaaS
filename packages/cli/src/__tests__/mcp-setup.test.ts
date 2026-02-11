/**
 * Tests for `waiaas mcp setup` command.
 *
 * Uses vi.stubGlobal('fetch') and mocked fs operations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `waiaas-mcp-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function rmrf(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

// Helper: create a mock Response
function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: () => mockResponse(status, body),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(body)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

// Standard mock responses for success flow
function createSuccessFetchMock(agentId = 'agent-1') {
  return vi.fn((url: string | URL) => {
    const urlStr = String(url);
    if (urlStr.includes('/v1/admin/status')) {
      return Promise.resolve(mockResponse(200, { status: 'ok' }));
    }
    if (urlStr.includes('/v1/agents')) {
      return Promise.resolve(mockResponse(200, {
        agents: [{ id: agentId, name: 'Test Agent' }],
      }));
    }
    if (urlStr.includes('/v1/sessions') && !urlStr.includes('/renew')) {
      return Promise.resolve(mockResponse(200, {
        id: 'session-123',
        token: 'jwt.token.here',
        expiresAt: Math.floor(Date.now() / 1000) + 86400,
      }));
    }
    return Promise.reject(new Error(`Unexpected fetch: ${urlStr}`));
  });
}

describe('mcpSetupCommand', () => {
  let testDir: string;
  let mockStdout: ReturnType<typeof vi.spyOn>;
  let mockStderr: ReturnType<typeof vi.spyOn>;
  const originalPlatform = process.platform;

  beforeEach(() => {
    testDir = makeTmpDir();
    mockStdout = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockStderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Mock process.exit to throw
    vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    // Mock resolvePassword to not require interactive input
    vi.doMock('../utils/password.js', () => ({
      resolvePassword: vi.fn().mockResolvedValue('test-master-password'),
    }));
  });

  afterEach(() => {
    rmrf(testDir);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.doUnmock('../utils/password.js');
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('successful setup flow: auto-detect agent, create session, write file', async () => {
    vi.stubGlobal('fetch', createSuccessFetchMock());

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      baseUrl: 'http://127.0.0.1:3100',
      masterPassword: 'test-pw',
    });

    // Token file should exist
    const tokenPath = join(testDir, 'mcp-token');
    expect(existsSync(tokenPath)).toBe(true);
    expect(readFileSync(tokenPath, 'utf-8')).toBe('jwt.token.here');

    // Should print success message
    expect(mockStdout).toHaveBeenCalledWith('MCP session created successfully!');
    expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining(`Token file: ${tokenPath}`));
  });

  it('--agent flag passed to session creation', async () => {
    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/v1/admin/status')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }
      if (urlStr.includes('/v1/sessions')) {
        // Verify agent ID was passed
        const body = JSON.parse(init?.body as string) as { agentId: string };
        expect(body.agentId).toBe('my-custom-agent');
        return Promise.resolve(mockResponse(200, {
          id: 'session-123',
          token: 'jwt.token.here',
          expiresAt: Math.floor(Date.now() / 1000) + 86400,
        }));
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      agent: 'my-custom-agent',
      masterPassword: 'test-pw',
    });

    // Should NOT call /v1/agents when --agent is provided
    const agentCalls = fetchMock.mock.calls.filter(
      (c: unknown[]) => String(c[0]).includes('/v1/agents'),
    );
    expect(agentCalls.length).toBe(0);
  });

  it('multiple agents without --agent -> error', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/v1/admin/status')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }
      if (urlStr.includes('/v1/agents')) {
        return Promise.resolve(mockResponse(200, {
          agents: [
            { id: 'agent-1', name: 'First' },
            { id: 'agent-2', name: 'Second' },
          ],
        }));
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`));
    }));

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await expect(mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    })).rejects.toThrow('process.exit(1)');

    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining('Multiple agents found'),
    );
  });

  it('no agents -> error', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/v1/admin/status')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }
      if (urlStr.includes('/v1/agents')) {
        return Promise.resolve(mockResponse(200, { agents: [] }));
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`));
    }));

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await expect(mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    })).rejects.toThrow('process.exit(1)');

    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining('No agents found'),
    );
  });

  it('daemon unreachable -> error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => {
      return Promise.reject(new TypeError('fetch failed'));
    }));

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await expect(mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    })).rejects.toThrow('process.exit(1)');

    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining('Cannot reach WAIaaS daemon'),
    );
  });

  it('session creation failure (401 bad password) -> error', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/v1/admin/status')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }
      if (urlStr.includes('/v1/agents')) {
        return Promise.resolve(mockResponse(200, {
          agents: [{ id: 'agent-1' }],
        }));
      }
      if (urlStr.includes('/v1/sessions')) {
        return Promise.resolve(mockResponse(401, { message: 'Invalid master password' }));
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`));
    }));

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await expect(mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'wrong-pw',
    })).rejects.toThrow('process.exit(1)');

    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining('Failed to create session'),
    );
  });

  it('mcp-token file written with correct content', async () => {
    vi.stubGlobal('fetch', createSuccessFetchMock());

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    });

    const tokenPath = join(testDir, 'mcp-token');
    const content = readFileSync(tokenPath, 'utf-8');
    expect(content).toBe('jwt.token.here');
  });

  it('config.json snippet output format', async () => {
    vi.stubGlobal('fetch', createSuccessFetchMock());

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      baseUrl: 'http://127.0.0.1:3100',
      masterPassword: 'test-pw',
    });

    // Should output JSON with mcpServers config
    const jsonCalls = mockStdout.mock.calls
      .filter((c: unknown[]) => {
        const str = String(c[0]);
        return str.includes('"mcpServers"');
      });
    expect(jsonCalls.length).toBe(1);

    const configStr = String(jsonCalls[0]![0]);
    const config = JSON.parse(configStr) as {
      mcpServers: {
        'waiaas-wallet': {
          command: string;
          args: string[];
          env: Record<string, string>;
        };
      };
    };

    expect(config.mcpServers['waiaas-wallet'].command).toBe('npx');
    expect(config.mcpServers['waiaas-wallet'].args).toEqual(['@waiaas/mcp']);
    expect(config.mcpServers['waiaas-wallet'].env['WAIAAS_DATA_DIR']).toBe(testDir);
    expect(config.mcpServers['waiaas-wallet'].env['WAIAAS_BASE_URL']).toBe('http://127.0.0.1:3100');
  });

  it('platform-specific config path (darwin)', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    vi.stubGlobal('fetch', createSuccessFetchMock());

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    });

    expect(mockStdout).toHaveBeenCalledWith(
      expect.stringContaining('~/Library/Application Support/Claude/claude_desktop_config.json'),
    );
  });

  it('platform-specific config path (linux)', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    vi.stubGlobal('fetch', createSuccessFetchMock());

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    });

    expect(mockStdout).toHaveBeenCalledWith(
      expect.stringContaining('~/.config/Claude/claude_desktop_config.json'),
    );
  });

  it('--expires-in passed correctly', async () => {
    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/v1/admin/status')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }
      if (urlStr.includes('/v1/agents')) {
        return Promise.resolve(mockResponse(200, {
          agents: [{ id: 'agent-1' }],
        }));
      }
      if (urlStr.includes('/v1/sessions')) {
        const body = JSON.parse(init?.body as string) as { expiresIn: number };
        expect(body.expiresIn).toBe(7200); // Custom 2h
        return Promise.resolve(mockResponse(200, {
          id: 'session-123',
          token: 'jwt.token.here',
          expiresAt: Math.floor(Date.now() / 1000) + 7200,
        }));
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      expiresIn: 7200,
      masterPassword: 'test-pw',
    });

    expect(mockStdout).toHaveBeenCalledWith('MCP session created successfully!');
  });

  it('file atomic write (tmp + rename pattern)', async () => {
    vi.stubGlobal('fetch', createSuccessFetchMock());

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    });

    // Final file should exist (tmp was renamed)
    const tokenPath = join(testDir, 'mcp-token');
    expect(existsSync(tokenPath)).toBe(true);

    // .tmp file should NOT exist (was renamed)
    expect(existsSync(`${tokenPath}.tmp`)).toBe(false);
  });

  it('auto-detects single agent (CLI-04)', async () => {
    vi.stubGlobal('fetch', createSuccessFetchMock('auto-agent-42'));

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    });

    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining('Auto-detected agent: auto-agent-42'),
    );
    expect(mockStdout).toHaveBeenCalledWith(
      expect.stringContaining('Agent: auto-agent-42'),
    );
  });
});
