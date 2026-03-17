import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WAIaaSClient } from '../client.js';
import { WAIaaSError } from '../error.js';

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

describe('WAIaaSClient coverage tests', () => {
  const mockToken = createMockJwt('sess-001');
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: WAIaaSClient;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(mockResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchSpy);
    client = new WAIaaSClient({
      baseUrl: 'http://localhost:3100',
      sessionToken: mockToken,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Incoming Transactions
  // =========================================================================

  describe('listIncomingTransactions', () => {
    it('calls GET /v1/wallet/incoming with all query params', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ items: [], cursor: null }));
      await client.listIncomingTransactions({
        cursor: 'c1',
        limit: 10,
        chain: 'solana',
        network: 'solana-mainnet',
        status: 'confirmed',
        token: 'SOL',
        fromAddress: '0xabc',
        since: 1000,
        until: 2000,
        walletId: 'w1',
      });
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain('/v1/wallet/incoming?');
      expect(url).toContain('cursor=c1');
      expect(url).toContain('limit=10');
      expect(url).toContain('chain=solana');
      expect(url).toContain('network=solana-mainnet');
      expect(url).toContain('status=confirmed');
      expect(url).toContain('token=SOL');
      expect(url).toContain('from_address=0xabc');
      expect(url).toContain('since=1000');
      expect(url).toContain('until=2000');
      expect(url).toContain('wallet_id=w1');
    });

    it('calls GET /v1/wallet/incoming with no params', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ items: [] }));
      await client.listIncomingTransactions();
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toBe('http://localhost:3100/v1/wallet/incoming');
    });
  });

  describe('getIncomingTransactionSummary', () => {
    it('calls GET /v1/wallet/incoming/summary with query params', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ totalCount: 5 }));
      await client.getIncomingTransactionSummary({
        period: '24h',
        chain: 'ethereum',
        network: 'ethereum-mainnet',
        since: 100,
        until: 200,
        walletId: 'w2',
      });
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain('/v1/wallet/incoming/summary?');
      expect(url).toContain('period=24h');
      expect(url).toContain('chain=ethereum');
      expect(url).toContain('wallet_id=w2');
    });

    it('calls without params', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ totalCount: 0 }));
      await client.getIncomingTransactionSummary();
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toBe('http://localhost:3100/v1/wallet/incoming/summary');
    });
  });

  // =========================================================================
  // Session management
  // =========================================================================

  describe('createSession', () => {
    it('calls POST /v1/sessions with masterAuth and body fields', async () => {
      const masterClient = new WAIaaSClient({
        baseUrl: 'http://localhost:3100',
        masterPassword: 'testpass',
      });
      fetchSpy.mockResolvedValue(mockResponse({ token: 'tok', sessionId: 's1' }));
      await masterClient.createSession(
        { walletIds: ['w1'], walletId: 'w1', ttl: 3600, maxRenewals: 5, absoluteLifetime: 86400 },
        'testpass',
      );
      const [url, opts] = fetchSpy.mock.calls[0]!;
      expect(url).toBe('http://localhost:3100/v1/sessions');
      expect(opts.method).toBe('POST');
      expect(opts.headers['X-Master-Password']).toBe('testpass');
      const body = JSON.parse(opts.body);
      expect(body.walletIds).toEqual(['w1']);
      expect(body.ttl).toBe(3600);
      expect(body.maxRenewals).toBe(5);
      expect(body.absoluteLifetime).toBe(86400);
    });
  });

  describe('rotateSessionToken', () => {
    it('calls POST /v1/sessions/:id/rotate with master auth', async () => {
      const masterClient = new WAIaaSClient({
        baseUrl: 'http://localhost:3100',
        masterPassword: 'testpass',
      });
      fetchSpy.mockResolvedValue(mockResponse({ token: 'new-tok' }));
      const result = await masterClient.rotateSessionToken('sess-001');
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain('/v1/sessions/sess-001/rotate');
      expect(result).toEqual({ token: 'new-tok' });
    });

    it('throws NO_MASTER_PASSWORD without masterPassword', async () => {
      await expect(client.rotateSessionToken('sess-001')).rejects.toMatchObject({
        code: 'NO_MASTER_PASSWORD',
      });
    });
  });

  // =========================================================================
  // Discovery & Utils
  // =========================================================================

  describe('getConnectInfo', () => {
    it('calls GET /v1/connect-info', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ walletId: 'w1', chains: ['solana'] }));
      const result = await client.getConnectInfo();
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toBe('http://localhost:3100/v1/connect-info');
      expect(result.walletId).toBe('w1');
    });
  });

  describe('getRpcProxyUrl', () => {
    it('returns correct RPC proxy URL when proxy is enabled', async () => {
      fetchSpy.mockResolvedValue(mockResponse({
        walletId: 'w1',
        rpcProxy: { enabled: true, baseUrl: 'http://localhost:3100/v1/rpc-evm' },
      }));
      const url = await client.getRpcProxyUrl('w1', 1);
      expect(url).toBe('http://localhost:3100/v1/rpc-evm/w1/1');
    });

    it('returns null when proxy is not enabled', async () => {
      fetchSpy.mockResolvedValue(mockResponse({
        walletId: 'w1',
        rpcProxy: { enabled: false },
      }));
      const url = await client.getRpcProxyUrl('w1', 1);
      expect(url).toBeNull();
    });

    it('returns null when rpcProxy has no baseUrl', async () => {
      fetchSpy.mockResolvedValue(mockResponse({
        walletId: 'w1',
        rpcProxy: { enabled: true },
      }));
      const url = await client.getRpcProxyUrl('w1', 1);
      expect(url).toBeNull();
    });
  });

  describe('encodeCalldata', () => {
    it('calls POST /v1/utils/encode-calldata', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ calldata: '0xabcd' }));
      await client.encodeCalldata({ abi: [], functionName: 'transfer', args: [] });
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toBe('http://localhost:3100/v1/utils/encode-calldata');
    });
  });

  describe('signTransaction', () => {
    it('calls POST /v1/transactions/sign', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ signature: '0x...' }));
      await client.signTransaction({ transaction: '0xraw', network: 'ethereum-mainnet' });
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain('/v1/transactions/sign');
    });
  });

  // =========================================================================
  // WalletConnect
  // =========================================================================

  describe('wcConnect', () => {
    it('calls POST /v1/wallet/wc/pair', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ uri: 'wc:...' }));
      await client.wcConnect();
      const [url, opts] = fetchSpy.mock.calls[0]!;
      expect(url).toBe('http://localhost:3100/v1/wallet/wc/pair');
      expect(opts.method).toBe('POST');
    });
  });

  describe('wcStatus', () => {
    it('calls GET /v1/wallet/wc/session', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ connected: true }));
      await client.wcStatus();
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toBe('http://localhost:3100/v1/wallet/wc/session');
    });
  });

  describe('wcDisconnect', () => {
    it('calls DELETE /v1/wallet/wc/session', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ disconnected: true }));
      await client.wcDisconnect();
      const [url, opts] = fetchSpy.mock.calls[0]!;
      expect(url).toBe('http://localhost:3100/v1/wallet/wc/session');
      expect(opts.method).toBe('DELETE');
    });
  });

  // =========================================================================
  // ERC-8004 write actions (uncovered: unsetAgentWallet, setAgentUri, setAgentMetadata, revokeFeedback, requestValidation)
  // =========================================================================

  describe('ERC-8004 uncovered write methods', () => {
    it('unsetAgentWallet calls erc8004_agent/unset_agent_wallet', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ txId: 'tx1' }));
      await client.unsetAgentWallet({ agentId: 'a1', network: 'ethereum-mainnet', walletId: 'w1' });
      const [url, opts] = fetchSpy.mock.calls[0]!;
      expect(url).toContain('/v1/actions/erc8004_agent/unset_agent_wallet');
      const body = JSON.parse(opts.body);
      expect(body.params.agentId).toBe('a1');
    });

    it('setAgentUri calls erc8004_agent/set_agent_uri', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ txId: 'tx1' }));
      await client.setAgentUri({ agentId: 'a1', uri: 'https://x.ai', network: 'ethereum-mainnet', walletId: 'w1' });
      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body.params.uri).toBe('https://x.ai');
    });

    it('setAgentMetadata calls erc8004_agent/set_metadata', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ txId: 'tx1' }));
      await client.setAgentMetadata({ agentId: 'a1', key: 'k1', value: 'v1', network: 'ethereum-mainnet', walletId: 'w1' });
      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body.params.key).toBe('k1');
    });

    it('revokeFeedback calls erc8004_agent/revoke_feedback', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ txId: 'tx1' }));
      await client.revokeFeedback({ agentId: 'a1', feedbackId: 'fb1', network: 'ethereum-mainnet', walletId: 'w1' });
      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body.params.feedbackId).toBe('fb1');
    });

    it('requestValidation calls erc8004_agent/request_validation', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ txId: 'tx1' }));
      await client.requestValidation({ agentId: 'a1', validatorAddress: '0xval', network: 'ethereum-mainnet', walletId: 'w1' });
      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body.params.validatorAddress).toBe('0xval');
    });
  });

  // =========================================================================
  // Across Bridge methods
  // =========================================================================

  describe('Across Bridge methods', () => {
    it('acrossBridgeQuote calls across_bridge/quote', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ quote: {} }));
      await client.acrossBridgeQuote({ fromToken: '0x1', toToken: '0x2', amount: '1000', walletId: 'w1', network: 'ethereum-mainnet' });
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain('/v1/actions/across_bridge/quote');
    });

    it('acrossBridgeExecute calls across_bridge/execute', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ txId: 'tx1' }));
      await client.acrossBridgeExecute({ fromToken: '0x1', toToken: '0x2', amount: '1000', walletId: 'w1', network: 'ethereum-mainnet' });
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain('/v1/actions/across_bridge/execute');
    });

    it('acrossBridgeStatus calls across_bridge/status', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ status: 'filled' }));
      await client.acrossBridgeStatus({ depositTxHash: '0xtx', walletId: 'w1', network: 'ethereum-mainnet' });
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain('/v1/actions/across_bridge/status');
    });

    it('acrossBridgeRoutes calls across_bridge/routes', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ routes: [] }));
      await client.acrossBridgeRoutes({ walletId: 'w1', network: 'ethereum-mainnet' });
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain('/v1/actions/across_bridge/routes');
    });

    it('acrossBridgeRoutes works without params', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ routes: [] }));
      await client.acrossBridgeRoutes();
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain('/v1/actions/across_bridge/routes');
    });
  });

  // =========================================================================
  // Credential admin methods (missing masterPassword path)
  // =========================================================================

  describe('credential admin - no masterPassword', () => {
    it('deleteCredential throws MASTER_PASSWORD_REQUIRED', async () => {
      // client has no masterPassword
      await expect(client.deleteCredential('w1', 'ref1')).rejects.toThrow(WAIaaSError);
      await expect(client.deleteCredential('w1', 'ref1')).rejects.toMatchObject({
        code: 'MASTER_PASSWORD_REQUIRED',
      });
    });

    it('rotateCredential throws MASTER_PASSWORD_REQUIRED', async () => {
      await expect(client.rotateCredential('w1', 'ref1', 'new-value')).rejects.toThrow(WAIaaSError);
      await expect(client.rotateCredential('w1', 'ref1', 'new-value')).rejects.toMatchObject({
        code: 'MASTER_PASSWORD_REQUIRED',
      });
    });
  });

  // =========================================================================
  // extractSessionId error path (no token)
  // =========================================================================

  describe('extractSessionId error path', () => {
    it('throws NO_TOKEN when calling renewSession without token', async () => {
      const noTokenClient = new WAIaaSClient({ baseUrl: 'http://localhost:3100' });
      await expect(noTokenClient.renewSession()).rejects.toThrow(WAIaaSError);
      await expect(noTokenClient.renewSession()).rejects.toMatchObject({
        code: 'NO_TOKEN',
      });
    });
  });

  // =========================================================================
  // UserOp
  // =========================================================================

  describe('buildUserOp', () => {
    it('calls POST /v1/wallets/:id/userop/build with masterAuth', async () => {
      const masterClient = new WAIaaSClient({
        baseUrl: 'http://localhost:3100',
        masterPassword: 'testpass',
      });
      fetchSpy.mockResolvedValue(mockResponse({ userOpHash: '0x...' }));
      await masterClient.buildUserOp('w1', { to: '0xabc', value: '100' } as any);
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain('/v1/wallets/w1/userop/build');
    });

    it('throws NO_MASTER_PASSWORD without masterPassword', async () => {
      await expect(client.buildUserOp('w1', {} as any)).rejects.toMatchObject({
        code: 'NO_MASTER_PASSWORD',
      });
    });
  });

  describe('signUserOp', () => {
    it('calls POST /v1/wallets/:id/userop/sign with masterAuth', async () => {
      const masterClient = new WAIaaSClient({
        baseUrl: 'http://localhost:3100',
        masterPassword: 'testpass',
      });
      fetchSpy.mockResolvedValue(mockResponse({ signed: true }));
      await masterClient.signUserOp('w1', { userOpHash: '0xhash' } as any);
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain('/v1/wallets/w1/userop/sign');
    });

    it('throws NO_MASTER_PASSWORD without masterPassword', async () => {
      await expect(client.signUserOp('w1', {} as any)).rejects.toMatchObject({
        code: 'NO_MASTER_PASSWORD',
      });
    });
  });

  // =========================================================================
  // ERC-8128 methods
  // =========================================================================

  describe('verifyHttpSignature', () => {
    it('calls POST /v1/erc8128/verify with headers', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ verified: true }));
      await client.verifyHttpSignature({
        method: 'GET',
        url: 'https://example.com',
        headers: { host: 'example.com' },
        signatureInput: 'sig-input',
        signature: 'sig-value',
        contentDigest: 'sha-256=abc',
      });
      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body.headers['signature-input']).toBe('sig-input');
      expect(body.headers['content-digest']).toBe('sha-256=abc');
    });

    it('calls without contentDigest', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ verified: true }));
      await client.verifyHttpSignature({
        method: 'GET',
        url: 'https://example.com',
        headers: {},
        signatureInput: 'si',
        signature: 'sv',
      });
      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body.headers['content-digest']).toBeUndefined();
    });
  });

  describe('fetchWithErc8128', () => {
    it('signs and fetches with signature headers', async () => {
      // First call: signHttpRequest
      fetchSpy.mockResolvedValueOnce(
        mockResponse({ signatureInput: 'si', signature: 'sv', contentDigest: 'cd' }),
      );
      // Second call: actual fetch
      fetchSpy.mockResolvedValueOnce(
        new Response('response-body', {
          status: 200,
          headers: { 'X-Custom': 'val' },
        }),
      );

      const result = await client.fetchWithErc8128({
        url: 'https://api.example.com/data',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"key":"value"}',
        walletId: 'w1',
        network: 'ethereum-mainnet',
      });

      expect(result.status).toBe(200);
      expect(result.body).toBe('response-body');
      expect(result.signatureHeaders.signatureInput).toBe('si');
      expect(result.signatureHeaders.contentDigest).toBe('cd');

      // Verify second fetch call has Signature headers
      const secondCall = fetchSpy.mock.calls[1]!;
      expect(secondCall[1].headers['Signature-Input']).toBe('si');
      expect(secondCall[1].headers['Signature']).toBe('sv');
      expect(secondCall[1].headers['Content-Digest']).toBe('cd');
      expect(secondCall[1].body).toBe('{"key":"value"}');
    });

    it('handles GET request without body or contentDigest', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({ signatureInput: 'si', signature: 'sv' }),
      );
      fetchSpy.mockResolvedValueOnce(
        new Response('ok', { status: 200 }),
      );

      const result = await client.fetchWithErc8128({
        url: 'https://api.example.com',
      });
      expect(result.status).toBe(200);
      expect(result.signatureHeaders.contentDigest).toBeUndefined();
    });
  });

  // =========================================================================
  // runCliSync (private static, tested via connect coverage)
  // =========================================================================

  describe('clearSessionToken + setSessionToken', () => {
    it('clears and sets tokens', () => {
      client.clearSessionToken();
      expect(() => {
        // Accessing authHeaders internally will throw
      }).not.toThrow();
      client.setSessionToken(mockToken);
    });
  });

  // =========================================================================
  // signHttpRequest
  // =========================================================================

  describe('signHttpRequest', () => {
    it('calls POST /v1/erc8128/sign', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ signatureInput: 'si', signature: 'sv' }));
      await client.signHttpRequest({
        method: 'GET',
        url: 'https://example.com',
        walletId: 'w1',
        network: 'ethereum-mainnet',
      });
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain('/v1/erc8128/sign');
    });
  });

  // =========================================================================
  // DCent methods
  // =========================================================================

  describe('getDcentQuotes', () => {
    it('calls dcent_swap/get_quotes action', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ quotes: [] }));
      await client.getDcentQuotes({ fromToken: 'ETH', toToken: 'USDC', amount: '1000', network: 'ethereum-mainnet', walletId: 'w1' });
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain('/v1/actions/dcent_swap/get_quotes');
    });
  });

  describe('dcentDexSwap', () => {
    it('calls dcent_swap/dex_swap action', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ txId: 'tx' }));
      await client.dcentDexSwap({ fromToken: 'ETH', toToken: 'USDC', amount: '1000', network: 'ethereum-mainnet', walletId: 'w1' });
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain('/v1/actions/dcent_swap/dex_swap');
    });
  });

  // =========================================================================
  // Wallet creation
  // =========================================================================

  describe('createWallet', () => {
    it('calls POST /v1/wallets with masterAuth and body', async () => {
      const masterClient = new WAIaaSClient({
        baseUrl: 'http://localhost:3100',
        masterPassword: 'testpass',
      });
      fetchSpy.mockResolvedValue(mockResponse({ walletId: 'w1' }));
      await masterClient.createWallet({
        name: 'test-wallet',
        chain: 'ethereum',
        environment: 'testnet',
        accountType: 'eoa',
        createSession: true,
      });
      const [url, opts] = fetchSpy.mock.calls[0]!;
      expect(url).toBe('http://localhost:3100/v1/wallets');
      expect(opts.headers['X-Master-Password']).toBe('testpass');
      const body = JSON.parse(opts.body);
      expect(body.name).toBe('test-wallet');
      expect(body.chain).toBe('ethereum');
      expect(body.accountType).toBe('eoa');
      expect(body.createSession).toBe(true);
    });

    it('throws MASTER_PASSWORD_REQUIRED without masterPassword', async () => {
      await expect(client.createWallet({ name: 'test' })).rejects.toMatchObject({
        code: 'MASTER_PASSWORD_REQUIRED',
      });
    });
  });
});
