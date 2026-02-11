/**
 * Tests for createMcpServer and withAgentPrefix.
 *
 * Verifies:
 * - Server name follows agentName setting (MCPS-01, MCPS-02)
 * - Tool/resource descriptions include agent prefix (MCPS-03)
 * - Without agentName, descriptions have no prefix
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withAgentPrefix, createMcpServer } from '../server.js';
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
}));

function createMockApiClient(): ApiClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  } as unknown as ApiClient;
}

beforeEach(() => {
  mockTool.mockClear();
  mockResource.mockClear();
  vi.mocked(McpServer).mockClear();
});

describe('withAgentPrefix', () => {
  it('returns original description when agentName is undefined', () => {
    expect(withAgentPrefix('Some description')).toBe('Some description');
  });

  it('prefixes description with [agentName] when set', () => {
    expect(withAgentPrefix('Some description', 'trading-bot')).toBe(
      '[trading-bot] Some description',
    );
  });

  it('handles empty string agentName as falsy (no prefix)', () => {
    expect(withAgentPrefix('Some description', '')).toBe('Some description');
  });
});

describe('createMcpServer', () => {
  it('agentName 미설정 시 서버 이름이 waiaas-wallet', () => {
    const apiClient = createMockApiClient();
    createMcpServer(apiClient);

    expect(McpServer).toHaveBeenCalledWith({
      name: 'waiaas-wallet',
      version: '0.0.0',
    });
  });

  it('agentName 설정 시 서버 이름이 waiaas-{agentName}', () => {
    const apiClient = createMockApiClient();
    createMcpServer(apiClient, { agentName: 'trading-bot' });

    expect(McpServer).toHaveBeenCalledWith({
      name: 'waiaas-trading-bot',
      version: '0.0.0',
    });
  });

  it('agentName 설정 시 도구 description에 에이전트 프리픽스 포함', () => {
    const apiClient = createMockApiClient();
    createMcpServer(apiClient, { agentName: 'trading-bot' });

    // 6 tools should be registered
    expect(mockTool).toHaveBeenCalledTimes(6);

    // Every tool call's second argument (description) should have the prefix
    for (const call of mockTool.mock.calls) {
      const description = call[1] as string;
      expect(description).toMatch(/^\[trading-bot\] /);
    }
  });

  it('agentName 설정 시 리소스 description에 에이전트 프리픽스 포함', () => {
    const apiClient = createMockApiClient();
    createMcpServer(apiClient, { agentName: 'trading-bot' });

    // 3 resources should be registered
    expect(mockResource).toHaveBeenCalledTimes(3);

    // Resource metadata (3rd argument) should have prefixed description
    for (const call of mockResource.mock.calls) {
      const metadata = call[2] as { description: string };
      expect(metadata.description).toMatch(/^\[trading-bot\] /);
    }
  });

  it('agentName 미설정 시 description에 프리픽스 없음', () => {
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
