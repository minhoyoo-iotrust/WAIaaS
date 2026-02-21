/**
 * Tests for createMcpServer and withWalletPrefix.
 *
 * Verifies:
 * - Server name follows walletName setting (MCPS-01, MCPS-02)
 * - Tool/resource descriptions include wallet prefix (MCPS-03)
 * - Without walletName, descriptions have no prefix
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withWalletPrefix, createMcpServer } from '../server.js';
import type { ApiClient } from '../api-client.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Spy on McpServer constructor and tool/resource calls
const mockTool = vi.fn();
const mockResource = vi.fn();

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation((opts: { name: string; version: string }) => ({
    _name: opts.name,
    _version: opts.version,
    tool: mockTool,
    resource: mockResource,
  })),
  ResourceTemplate: vi.fn().mockImplementation(() => ({
    uriTemplate: { toString: () => 'waiaas://skills/{name}' },
  })),
}));

function createMockApiClient(): ApiClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as unknown as ApiClient;
}

beforeEach(() => {
  mockTool.mockClear();
  mockResource.mockClear();
  vi.mocked(McpServer).mockClear();
});

describe('withWalletPrefix', () => {
  it('returns original description when walletName is undefined', () => {
    expect(withWalletPrefix('Some description')).toBe('Some description');
  });

  it('prefixes description with [walletName] when set', () => {
    expect(withWalletPrefix('Some description', 'trading-bot')).toBe(
      '[trading-bot] Some description',
    );
  });

  it('handles empty string walletName as falsy (no prefix)', () => {
    expect(withWalletPrefix('Some description', '')).toBe('Some description');
  });
});

describe('createMcpServer', () => {
  it('walletName 미설정 시 서버 이름이 waiaas-wallet', () => {
    const apiClient = createMockApiClient();
    createMcpServer(apiClient);

    expect(McpServer).toHaveBeenCalledWith({
      name: 'waiaas-wallet',
      version: '0.0.0',
    });
  });

  it('walletName 설정 시 서버 이름이 waiaas-{walletName}', () => {
    const apiClient = createMockApiClient();
    createMcpServer(apiClient, { walletName: 'trading-bot' });

    expect(McpServer).toHaveBeenCalledWith({
      name: 'waiaas-trading-bot',
      version: '0.0.0',
    });
  });

  it('walletName 설정 시 도구 description에 월렛 프리픽스 포함', () => {
    const apiClient = createMockApiClient();
    createMcpServer(apiClient, { walletName: 'trading-bot' });

    // 21 tools should be registered (20 wallet tools + connect_info)
    expect(mockTool).toHaveBeenCalledTimes(21);

    // connect_info (first tool) has no wallet prefix (not wallet-scoped)
    // All other tool calls' second argument (description) should have the prefix
    const [connectInfoCall, ...walletToolCalls] = mockTool.mock.calls;
    expect(connectInfoCall).toBeDefined();
    expect(connectInfoCall![0]).toBe('connect_info');
    expect(connectInfoCall![1]).not.toMatch(/^\[trading-bot\] /);

    for (const call of walletToolCalls) {
      const description = call[1] as string;
      expect(description).toMatch(/^\[trading-bot\] /);
    }
  });

  it('walletName 설정 시 리소스 description에 월렛 프리픽스 포함', () => {
    const apiClient = createMockApiClient();
    createMcpServer(apiClient, { walletName: 'trading-bot' });

    // 4 resource groups should be registered (3 static + 1 template)
    expect(mockResource).toHaveBeenCalledTimes(4);

    // Resource metadata (3rd argument) should have prefixed description
    for (const call of mockResource.mock.calls) {
      const metadata = call[2] as { description: string };
      expect(metadata.description).toMatch(/^\[trading-bot\] /);
    }
  });

  it('walletName 미설정 시 description에 프리픽스 없음', () => {
    const apiClient = createMockApiClient();
    createMcpServer(apiClient);

    // Tools should not have prefix
    for (const call of mockTool.mock.calls) {
      const description = call[1] as string;
      expect(description).not.toMatch(/^\[/);
    }

    // Resources should not have prefix
    for (const call of mockResource.mock.calls) {
      const metadata = call[2] as { description: string };
      expect(metadata.description).not.toMatch(/^\[/);
    }
  });
});

describe('BUG-011: init order — server.connect before sessionManager.start', () => {
  it('index.ts에서 server.connect()가 sessionManager.start() 이전에 호출된다', async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const src = await readFile(resolve(__dirname, '..', 'index.ts'), 'utf-8');

    const connectIdx = src.indexOf('await server.connect(transport)');
    const startIdx = src.indexOf('await sessionManager.start()');

    expect(connectIdx).toBeGreaterThan(-1);
    expect(startIdx).toBeGreaterThan(-1);
    // server.connect must appear BEFORE sessionManager.start in the source
    expect(connectIdx).toBeLessThan(startIdx);
  });
});
