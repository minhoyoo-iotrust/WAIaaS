/**
 * Tests for ERC-8004 SDK methods.
 *
 * Verifies:
 * - 8 write methods call correct action provider endpoints
 * - 3 read methods call correct GET endpoints
 * - Query parameters passed correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WAIaaSClient } from '../client.js';

function createMockJwt(sessionId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sessionId, walletId: 'wallet-1' })).toString('base64url');
  const signature = 'mock-signature';
  return `${header}.${payload}.${signature}`;
}

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('WAIaaSClient ERC-8004 methods', () => {
  const mockToken = createMockJwt('sess-001');
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: WAIaaSClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    client = new WAIaaSClient({
      baseUrl: 'http://localhost:3000',
      sessionToken: mockToken,
      retryOptions: { maxRetries: 0 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Write methods (executeAction wrappers)
  // -----------------------------------------------------------------------

  describe('registerAgent()', () => {
    it('calls POST /v1/actions/erc8004_agent/register_agent', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ id: 'tx-1', status: 'PENDING' }));

      await client.registerAgent({ name: 'my-agent', description: 'test' });

      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toBe('http://localhost:3000/v1/actions/erc8004_agent/register_agent');
      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string) as Record<string, unknown>;
      const params = body['params'] as Record<string, unknown>;
      expect(params['name']).toBe('my-agent');
      expect(params['description']).toBe('test');
    });
  });

  describe('setAgentWallet()', () => {
    it('calls POST /v1/actions/erc8004_agent/set_agent_wallet', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ id: 'tx-2', status: 'PENDING' }));

      await client.setAgentWallet({ agentId: '42', network: 'ethereum-mainnet' });

      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toBe('http://localhost:3000/v1/actions/erc8004_agent/set_agent_wallet');
      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string) as Record<string, unknown>;
      expect(body['network']).toBe('ethereum-mainnet');
    });
  });

  describe('giveFeedback()', () => {
    it('calls POST /v1/actions/erc8004_agent/give_feedback with params', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ id: 'tx-3', status: 'PENDING' }));

      await client.giveFeedback({ targetAgentId: '99', score: 80, tag1: 'reliability' });

      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toBe('http://localhost:3000/v1/actions/erc8004_agent/give_feedback');
      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string) as Record<string, unknown>;
      const params = body['params'] as Record<string, unknown>;
      expect(params['targetAgentId']).toBe('99');
      expect(params['score']).toBe(80);
      expect(params['tag1']).toBe('reliability');
    });
  });

  // -----------------------------------------------------------------------
  // Read methods (direct GET)
  // -----------------------------------------------------------------------

  describe('getAgentInfo()', () => {
    it('calls GET /v1/erc8004/agent/:agentId', async () => {
      const mockBody = { agentId: '42', wallet: '0xabc', uri: '', metadata: {}, registryAddress: '0xreg', chainId: 1 };
      fetchSpy.mockResolvedValue(mockResponse(mockBody));

      const result = await client.getAgentInfo('42');

      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toBe('http://localhost:3000/v1/erc8004/agent/42');
      expect(result.agentId).toBe('42');
      expect(result.registryAddress).toBe('0xreg');
    });
  });

  describe('getAgentReputation()', () => {
    it('calls GET /v1/erc8004/agent/:agentId/reputation', async () => {
      const mockBody = { agentId: '42', count: 5, score: '75', decimals: 0, tag1: '', tag2: '' };
      fetchSpy.mockResolvedValue(mockResponse(mockBody));

      const result = await client.getAgentReputation('42');

      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toBe('http://localhost:3000/v1/erc8004/agent/42/reputation');
      expect(result.score).toBe('75');
      expect(result.count).toBe(5);
    });

    it('passes tag1/tag2 query params', async () => {
      const mockBody = { agentId: '42', count: 2, score: '50', decimals: 0, tag1: 'speed', tag2: 'cost' };
      fetchSpy.mockResolvedValue(mockResponse(mockBody));

      await client.getAgentReputation('42', { tag1: 'speed', tag2: 'cost' });

      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('tag1=speed');
      expect(url).toContain('tag2=cost');
    });
  });

  describe('getValidationStatus()', () => {
    it('calls GET /v1/erc8004/validation/:requestHash', async () => {
      const mockBody = { requestHash: '0xhash', validator: '0xval', agentId: '42', response: 1, responseHash: '0xrh', tag: 'audit', lastUpdate: 1000 };
      fetchSpy.mockResolvedValue(mockResponse(mockBody));

      const result = await client.getValidationStatus('0xhash');

      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toBe('http://localhost:3000/v1/erc8004/validation/0xhash');
      expect(result.requestHash).toBe('0xhash');
      expect(result.validator).toBe('0xval');
    });
  });
});
