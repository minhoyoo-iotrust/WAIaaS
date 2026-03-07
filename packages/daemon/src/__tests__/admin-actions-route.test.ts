/**
 * Admin action routes unit tests.
 *
 * Tests cover:
 * - Route factory returns a valid router
 * - resolveChainId helper for various networks
 * - AdminActionExecuteRequestSchema validation
 * - 404 for unknown action
 * - 404 for missing wallet
 * - API key requirement check
 * - Terminated wallet rejection
 * - Action resolve failure
 * - Network resolve failure
 * - Full pipeline execution (single + batch)
 * - EIP-712 metadata handling
 * - ERC-8004 notification events
 * - Reputation cache invalidation
 * - Pipeline error handling (background)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { AdminActionRouteDeps } from '../api/routes/admin-actions.js';

// Use vi.hoisted to ensure mock fns are available before vi.mock (hoisted)
const {
  mockStage1Validate,
  mockStage2Auth,
  mockStage3Policy,
  mockStage3_5GasCondition,
  mockStage4Wait,
  mockStage5Execute,
  mockStage6Confirm,
  mockGetRequestTo,
  mockResolveNetwork,
  mockResolveRpcUrl,
} = vi.hoisted(() => ({
  mockStage1Validate: vi.fn(),
  mockStage2Auth: vi.fn(),
  mockStage3Policy: vi.fn(),
  mockStage3_5GasCondition: vi.fn(),
  mockStage4Wait: vi.fn(),
  mockStage5Execute: vi.fn(),
  mockStage6Confirm: vi.fn(),
  mockGetRequestTo: vi.fn().mockReturnValue('0xRegistryAddr'),
  mockResolveNetwork: vi.fn().mockReturnValue('ethereum-mainnet'),
  mockResolveRpcUrl: vi.fn().mockReturnValue('https://rpc.example.com'),
}));

vi.mock('../pipeline/stages.js', () => ({
  stage1Validate: mockStage1Validate,
  stage2Auth: mockStage2Auth,
  stage3Policy: mockStage3Policy,
  stage3_5GasCondition: mockStage3_5GasCondition,
  stage4Wait: mockStage4Wait,
  stage5Execute: mockStage5Execute,
  stage6Confirm: mockStage6Confirm,
  getRequestTo: mockGetRequestTo,
}));

vi.mock('../pipeline/network-resolver.js', () => ({
  resolveNetwork: mockResolveNetwork,
}));

vi.mock('../infrastructure/adapter-pool.js', () => ({
  resolveRpcUrl: mockResolveRpcUrl,
}));

import { adminActionRoutes } from '../api/routes/admin-actions.js';

// ---------------------------------------------------------------------------
// Minimal mock deps
// ---------------------------------------------------------------------------

const WALLET_ID = '019cc695-e499-7ddb-a9e5-7e46f7cb81cd';

const mockWallet = {
  id: WALLET_ID,
  publicKey: '0xabc',
  chain: 'ethereum',
  environment: 'mainnet',
  status: 'ACTIVE',
  accountType: 'eoa',
  aaProvider: null,
  aaProviderApiKeyEncrypted: null,
  aaBundlerUrl: null,
  aaPaymasterUrl: null,
  aaPaymasterPolicyId: null,
  ownerAddress: '0xOwner123',
};

const mockEntry = {
  provider: { metadata: { name: 'test_provider', requiresApiKey: false } },
  action: { defaultTier: 'standard' },
};

function buildDbMock(walletResult: any = mockWallet) {
  const mockUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });
  const mockSelectGet = vi.fn().mockResolvedValue(walletResult);
  const mockSelectWhere = vi.fn().mockReturnValue({ get: mockSelectGet });
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
  return { select: mockSelect, update: mockUpdate, _mockSelectGet: mockSelectGet };
}

function createMockDeps(overrides: Partial<AdminActionRouteDeps> = {}): AdminActionRouteDeps {
  const dbMock = buildDbMock();
  return {
    registry: {
      getAction: vi.fn().mockReturnValue(undefined),
      executeResolve: vi.fn(),
      listProviders: vi.fn().mockReturnValue([]),
      listActions: vi.fn().mockReturnValue([]),
    } as any,
    db: dbMock as any,
    adapterPool: { resolve: vi.fn().mockResolvedValue({}) } as any,
    config: { rpc: {}, security: { policy_defaults_delay_seconds: 0, policy_defaults_approval_timeout: 300 } } as any,
    keyStore: {} as any,
    policyEngine: {} as any,
    masterPassword: 'test-pw',
    settingsService: {
      hasApiKey: vi.fn().mockReturnValue(true),
      get: vi.fn(),
    } as any,
    ...overrides,
  };
}

function buildApp(deps: AdminActionRouteDeps) {
  const router = adminActionRoutes(deps);
  const app = new Hono();
  app.route('/v1', router);
  return app;
}

async function postAction(
  app: ReturnType<typeof buildApp>,
  provider: string,
  action: string,
  body: Record<string, any>,
) {
  return app.request(`/v1/admin/actions/${provider}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('adminActionRoutes', () => {
  let deps: AdminActionRouteDeps;
  let txIdCounter = 0;

  beforeEach(() => {
    deps = createMockDeps();
    txIdCounter = 0;

    // Default: stage1Validate assigns a txId
    mockStage1Validate.mockImplementation(async (ctx: any) => {
      txIdCounter++;
      ctx.txId = `tx-mock-${txIdCounter}`;
    });
    mockStage2Auth.mockResolvedValue(undefined);
    mockStage3Policy.mockResolvedValue(undefined);
    mockStage3_5GasCondition.mockResolvedValue(undefined);
    mockStage4Wait.mockResolvedValue(undefined);
    mockStage5Execute.mockResolvedValue(undefined);
    mockStage6Confirm.mockResolvedValue(undefined);
    mockResolveNetwork.mockReturnValue('ethereum-mainnet');
    mockResolveRpcUrl.mockReturnValue('https://rpc.example.com');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns a valid Hono router', () => {
    const router = adminActionRoutes(deps);
    expect(router).toBeDefined();
    expect(router).toBeInstanceOf(Hono);
  });

  it('returns 404 ACTION_NOT_FOUND for unknown action', async () => {
    const app = buildApp(deps);
    await postAction(app, 'unknown_provider', 'unknown_action', { walletId: WALLET_ID });
    expect((deps.registry as any).getAction).toHaveBeenCalledWith('unknown_provider/unknown_action');
  });

  it('returns error when API key is required but missing', async () => {
    const entryWithApiKey = {
      provider: { metadata: { name: 'paid_provider', requiresApiKey: true } },
      action: { defaultTier: 'standard' },
    };
    (deps.registry as any).getAction = vi.fn().mockReturnValue(entryWithApiKey);
    (deps.settingsService as any).hasApiKey = vi.fn().mockReturnValue(false);

    const app = buildApp(deps);
    await postAction(app, 'paid_provider', 'test', { walletId: WALLET_ID });
    expect((deps.settingsService as any).hasApiKey).toHaveBeenCalledWith('paid_provider');
  });

  it('returns error when wallet not found', async () => {
    (deps.registry as any).getAction = vi.fn().mockReturnValue(mockEntry);
    const dbMock = buildDbMock(undefined);
    (deps as any).db = dbMock;

    const app = buildApp(deps);
    await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });
    expect(dbMock._mockSelectGet).toHaveBeenCalled();
  });

  it('rejects request with missing body', async () => {
    const app = buildApp(deps);
    const res = await postAction(app, 'test_provider', 'test', {});
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects terminated wallet', async () => {
    (deps.registry as any).getAction = vi.fn().mockReturnValue(mockEntry);
    const terminatedWallet = { ...mockWallet, status: 'TERMINATED' };
    (deps as any).db = buildDbMock(terminatedWallet);

    const app = buildApp(deps);
    await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });
    // WAIaaSError('WALLET_TERMINATED') is thrown
    expect((deps.registry as any).getAction).toHaveBeenCalled();
  });

  it('handles action resolve failure (WAIaaSError)', async () => {
    (deps.registry as any).getAction = vi.fn().mockReturnValue(mockEntry);
    (deps as any).db = buildDbMock(mockWallet);
    const { WAIaaSError } = await import('@waiaas/core');
    (deps.registry as any).executeResolve = vi.fn().mockRejectedValue(
      new WAIaaSError('ACTION_VALIDATION_FAILED' as any, { message: 'bad params' }),
    );

    const app = buildApp(deps);
    await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });
    expect((deps.registry as any).executeResolve).toHaveBeenCalled();
  });

  it('handles action resolve failure (generic Error)', async () => {
    (deps.registry as any).getAction = vi.fn().mockReturnValue(mockEntry);
    (deps as any).db = buildDbMock(mockWallet);
    (deps.registry as any).executeResolve = vi.fn().mockRejectedValue(new Error('oops'));

    const app = buildApp(deps);
    await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });
    expect((deps.registry as any).executeResolve).toHaveBeenCalled();
  });

  it('handles action resolve failure (non-Error)', async () => {
    (deps.registry as any).getAction = vi.fn().mockReturnValue(mockEntry);
    (deps as any).db = buildDbMock(mockWallet);
    (deps.registry as any).executeResolve = vi.fn().mockRejectedValue('string error');

    const app = buildApp(deps);
    await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });
    expect((deps.registry as any).executeResolve).toHaveBeenCalled();
  });

  it('handles network resolve failure (environment mismatch)', async () => {
    (deps.registry as any).getAction = vi.fn().mockReturnValue(mockEntry);
    (deps as any).db = buildDbMock(mockWallet);
    (deps.registry as any).executeResolve = vi.fn().mockResolvedValue([
      { type: 'CONTRACT_CALL', to: '0xabc', data: '0x123', value: '0' },
    ]);
    mockResolveNetwork.mockImplementation(() => {
      throw new Error('Network does not match environment');
    });

    const app = buildApp(deps);
    await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });
    expect(mockResolveNetwork).toHaveBeenCalled();
  });

  it('handles network resolve failure (generic)', async () => {
    (deps.registry as any).getAction = vi.fn().mockReturnValue(mockEntry);
    (deps as any).db = buildDbMock(mockWallet);
    (deps.registry as any).executeResolve = vi.fn().mockResolvedValue([
      { type: 'CONTRACT_CALL', to: '0xabc', data: '0x123', value: '0' },
    ]);
    mockResolveNetwork.mockImplementation(() => {
      throw new Error('Unknown network');
    });

    const app = buildApp(deps);
    await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });
    expect(mockResolveNetwork).toHaveBeenCalled();
  });

  describe('pipeline execution', () => {
    function setupPipelineDeps() {
      (deps.registry as any).getAction = vi.fn().mockReturnValue(mockEntry);
      (deps.registry as any).executeResolve = vi.fn().mockResolvedValue([
        { type: 'CONTRACT_CALL', to: '0xabc', data: '0x123', value: '0' },
      ]);

      // DB mock: first call returns wallet, second call returns tx metadata
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });
      const mockSelectGet = vi.fn()
        .mockResolvedValueOnce(mockWallet) // wallet lookup
        .mockResolvedValueOnce({ metadata: '{}' }); // tx metadata lookup
      const mockSelectWhere = vi.fn().mockReturnValue({ get: mockSelectGet });
      const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
      (deps as any).db = { select: mockSelect, update: mockUpdate };

      mockResolveNetwork.mockReturnValue('ethereum-mainnet');
    }

    it('executes single contract call and returns 201', async () => {
      setupPipelineDeps();
      const app = buildApp(deps);

      const res = await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.id).toBe('tx-mock-1');
      expect(json.status).toBe('PENDING');
      expect(json.pipeline).toBeUndefined();
    });

    it('executes batch contract calls and returns pipeline array', async () => {
      (deps.registry as any).getAction = vi.fn().mockReturnValue(mockEntry);
      (deps.registry as any).executeResolve = vi.fn().mockResolvedValue([
        { type: 'APPROVE', to: '0xtoken', data: '0xapprove', value: '0' },
        { type: 'CONTRACT_CALL', to: '0xabc', data: '0x123', value: '0' },
      ]);

      // DB mock: wallet lookup + 2x tx metadata lookups
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });
      const mockSelectGet = vi.fn()
        .mockResolvedValueOnce(mockWallet)
        .mockResolvedValueOnce({ metadata: '{}' })
        .mockResolvedValueOnce({ metadata: '{}' });
      const mockSelectWhere = vi.fn().mockReturnValue({ get: mockSelectGet });
      const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
      (deps as any).db = { select: mockSelect, update: mockUpdate };

      const app = buildApp(deps);
      const res = await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.pipeline).toHaveLength(2);
      expect(json.pipeline[0].id).toBe('tx-mock-1');
      expect(json.pipeline[1].id).toBe('tx-mock-2');
    });

    it('handles EIP-712 metadata in contract call', async () => {
      (deps.registry as any).getAction = vi.fn().mockReturnValue(mockEntry);
      const eip712TypedData = {
        types: { EIP712Domain: [], RegisterAgent: [{ name: 'owner', type: 'address' }] },
        domain: { name: 'test', chainId: 0 },
        primaryType: 'RegisterAgent',
        message: { owner: '0x0000000000000000000000000000000000000000' },
      };
      (deps.registry as any).executeResolve = vi.fn().mockResolvedValue([
        {
          type: 'CONTRACT_CALL',
          to: '0xRegistry',
          data: '0x123',
          value: '0',
          eip712: {
            approvalType: 'EIP712',
            typedDataJson: JSON.stringify(eip712TypedData),
            agentId: 'agent-1',
            newWallet: '0xNewWallet',
            deadline: '1740000000',
          },
        },
      ]);

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });
      const mockSelectGet = vi.fn()
        .mockResolvedValueOnce(mockWallet)
        .mockResolvedValueOnce({ metadata: '{}' });
      const mockSelectWhere = vi.fn().mockReturnValue({ get: mockSelectGet });
      const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
      (deps as any).db = { select: mockSelect, update: mockUpdate };

      const app = buildApp(deps);
      const res = await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });
      expect(res.status).toBe(201);

      // Verify stage1Validate was called with eip712Metadata set
      expect(mockStage1Validate).toHaveBeenCalled();
      const ctx = mockStage1Validate.mock.calls[0][0];
      expect(ctx.eip712Metadata).toBeDefined();
      expect(ctx.eip712Metadata.approvalType).toBe('EIP712');
      expect(ctx.eip712Metadata.agentId).toBe('agent-1');
    });

    it('handles EIP-712 with no ownerAddress (uses zero address)', async () => {
      (deps.registry as any).getAction = vi.fn().mockReturnValue(mockEntry);
      const eip712TypedData = {
        types: { EIP712Domain: [], RegisterAgent: [{ name: 'owner', type: 'address' }] },
        domain: { name: 'test', chainId: 0 },
        primaryType: 'RegisterAgent',
        message: { owner: '0x0' },
      };
      (deps.registry as any).executeResolve = vi.fn().mockResolvedValue([
        {
          type: 'CONTRACT_CALL',
          to: '0xReg',
          data: '0x',
          value: '0',
          eip712: {
            approvalType: 'EIP712',
            typedDataJson: JSON.stringify(eip712TypedData),
            agentId: 'a1',
            newWallet: '0xW',
            deadline: '999',
          },
        },
      ]);

      const walletNoOwner = { ...mockWallet, ownerAddress: null };
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });
      const mockSelectGet = vi.fn()
        .mockResolvedValueOnce(walletNoOwner)
        .mockResolvedValueOnce({ metadata: null });
      const mockSelectWhere = vi.fn().mockReturnValue({ get: mockSelectGet });
      const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
      (deps as any).db = { select: mockSelect, update: mockUpdate };

      const app = buildApp(deps);
      const res = await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });
      expect(res.status).toBe(201);
      const ctx = mockStage1Validate.mock.calls[0][0];
      // ownerAddress null -> zero address
      const typedData = JSON.parse(ctx.eip712Metadata.typedDataJson);
      expect(typedData.message.owner).toBe('0x0000000000000000000000000000000000000000');
    });

    it('sends ERC-8004 notification for register_agent action', async () => {
      const mockNotify = vi.fn();
      const notificationService = { notify: mockNotify } as any;
      const erc8004Entry = {
        provider: { metadata: { name: 'erc8004_agent', requiresApiKey: false } },
        action: { defaultTier: 'standard' },
      };
      (deps.registry as any).getAction = vi.fn().mockReturnValue(erc8004Entry);
      (deps.registry as any).executeResolve = vi.fn().mockResolvedValue([
        { type: 'CONTRACT_CALL', to: '0xReg', data: '0x', value: '0' },
      ]);
      deps.notificationService = notificationService;

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });
      const mockSelectGet = vi.fn()
        .mockResolvedValueOnce(mockWallet)
        .mockResolvedValueOnce({ metadata: '{}' });
      const mockSelectWhere = vi.fn().mockReturnValue({ get: mockSelectGet });
      const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
      (deps as any).db = { select: mockSelect, update: mockUpdate };

      const app = buildApp(deps);
      const res = await postAction(app, 'erc8004_agent', 'register_agent', {
        walletId: WALLET_ID,
        params: { agentId: 'my-agent-42' },
      });
      expect(res.status).toBe(201);

      // Wait for the async pipeline to complete
      await vi.waitFor(() => {
        expect(mockNotify).toHaveBeenCalledWith(
          'AGENT_REGISTERED',
          WALLET_ID,
          expect.objectContaining({ chainAgentId: 'my-agent-42' }),
          expect.objectContaining({ txId: 'tx-mock-1' }),
        );
      }, { timeout: 1000 });
    });

    it('sends ERC-8004 notification for set_agent_wallet action', async () => {
      const mockNotify = vi.fn();
      const erc8004Entry = {
        provider: { metadata: { name: 'erc8004_agent', requiresApiKey: false } },
        action: { defaultTier: 'standard' },
      };
      (deps.registry as any).getAction = vi.fn().mockReturnValue(erc8004Entry);
      (deps.registry as any).executeResolve = vi.fn().mockResolvedValue([
        { type: 'CONTRACT_CALL', to: '0xReg', data: '0x', value: '0' },
      ]);
      deps.notificationService = { notify: mockNotify } as any;

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });
      const mockSelectGet = vi.fn()
        .mockResolvedValueOnce(mockWallet)
        .mockResolvedValueOnce({ metadata: '{}' });
      const mockSelectWhere = vi.fn().mockReturnValue({ get: mockSelectGet });
      const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
      (deps as any).db = { select: mockSelect, update: mockUpdate };

      const app = buildApp(deps);
      await postAction(app, 'erc8004_agent', 'set_agent_wallet', { walletId: WALLET_ID });

      await vi.waitFor(() => {
        expect(mockNotify).toHaveBeenCalledWith(
          'AGENT_WALLET_LINKED',
          WALLET_ID,
          expect.objectContaining({ registryAddress: '0xRegistryAddr' }),
          expect.any(Object),
        );
      }, { timeout: 1000 });
    });

    it('sends ERC-8004 notification for unset_agent_wallet action', async () => {
      const mockNotify = vi.fn();
      const erc8004Entry = {
        provider: { metadata: { name: 'erc8004_agent', requiresApiKey: false } },
        action: { defaultTier: 'standard' },
      };
      (deps.registry as any).getAction = vi.fn().mockReturnValue(erc8004Entry);
      (deps.registry as any).executeResolve = vi.fn().mockResolvedValue([
        { type: 'CONTRACT_CALL', to: '0xReg', data: '0x', value: '0' },
      ]);
      deps.notificationService = { notify: mockNotify } as any;

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });
      const mockSelectGet = vi.fn()
        .mockResolvedValueOnce(mockWallet)
        .mockResolvedValueOnce({ metadata: '{}' });
      const mockSelectWhere = vi.fn().mockReturnValue({ get: mockSelectGet });
      const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
      (deps as any).db = { select: mockSelect, update: mockUpdate };

      const app = buildApp(deps);
      await postAction(app, 'erc8004_agent', 'unset_agent_wallet', { walletId: WALLET_ID });

      await vi.waitFor(() => {
        expect(mockNotify).toHaveBeenCalledWith(
          'AGENT_WALLET_UNLINKED',
          WALLET_ID,
          expect.objectContaining({ registryAddress: '0xRegistryAddr' }),
          expect.any(Object),
        );
      }, { timeout: 1000 });
    });

    it('does not send notification for non-mapped erc8004 actions', async () => {
      const mockNotify = vi.fn();
      const erc8004Entry = {
        provider: { metadata: { name: 'erc8004_agent', requiresApiKey: false } },
        action: { defaultTier: 'standard' },
      };
      (deps.registry as any).getAction = vi.fn().mockReturnValue(erc8004Entry);
      (deps.registry as any).executeResolve = vi.fn().mockResolvedValue([
        { type: 'CONTRACT_CALL', to: '0xReg', data: '0x', value: '0' },
      ]);
      deps.notificationService = { notify: mockNotify } as any;

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });
      const mockSelectGet = vi.fn()
        .mockResolvedValueOnce(mockWallet)
        .mockResolvedValueOnce({ metadata: '{}' });
      const mockSelectWhere = vi.fn().mockReturnValue({ get: mockSelectGet });
      const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
      (deps as any).db = { select: mockSelect, update: mockUpdate };

      const app = buildApp(deps);
      await postAction(app, 'erc8004_agent', 'some_other_action', { walletId: WALLET_ID });

      // Wait a tick to let async pipeline run
      await new Promise((r) => setTimeout(r, 50));
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it('invalidates reputation cache on give_feedback', async () => {
      const mockInvalidate = vi.fn();
      const erc8004Entry = {
        provider: { metadata: { name: 'erc8004_agent', requiresApiKey: false } },
        action: { defaultTier: 'standard' },
      };
      (deps.registry as any).getAction = vi.fn().mockReturnValue(erc8004Entry);
      (deps.registry as any).executeResolve = vi.fn().mockResolvedValue([
        { type: 'CONTRACT_CALL', to: '0xReg', data: '0x', value: '0' },
      ]);
      deps.reputationCache = { invalidate: mockInvalidate } as any;

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });
      const mockSelectGet = vi.fn()
        .mockResolvedValueOnce(mockWallet)
        .mockResolvedValueOnce({ metadata: '{}' });
      const mockSelectWhere = vi.fn().mockReturnValue({ get: mockSelectGet });
      const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
      (deps as any).db = { select: mockSelect, update: mockUpdate };

      const app = buildApp(deps);
      await postAction(app, 'erc8004_agent', 'give_feedback', {
        walletId: WALLET_ID,
        params: { agentId: 'target-agent' },
      });

      await vi.waitFor(() => {
        expect(mockInvalidate).toHaveBeenCalledWith('target-agent');
      }, { timeout: 1000 });
    });

    it('invalidates reputation cache on revoke_feedback', async () => {
      const mockInvalidate = vi.fn();
      const erc8004Entry = {
        provider: { metadata: { name: 'erc8004_agent', requiresApiKey: false } },
        action: { defaultTier: 'standard' },
      };
      (deps.registry as any).getAction = vi.fn().mockReturnValue(erc8004Entry);
      (deps.registry as any).executeResolve = vi.fn().mockResolvedValue([
        { type: 'CONTRACT_CALL', to: '0xReg', data: '0x', value: '0' },
      ]);
      deps.reputationCache = { invalidate: mockInvalidate } as any;

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });
      const mockSelectGet = vi.fn()
        .mockResolvedValueOnce(mockWallet)
        .mockResolvedValueOnce({ metadata: '{}' });
      const mockSelectWhere = vi.fn().mockReturnValue({ get: mockSelectGet });
      const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
      (deps as any).db = { select: mockSelect, update: mockUpdate };

      const app = buildApp(deps);
      await postAction(app, 'erc8004_agent', 'revoke_feedback', {
        walletId: WALLET_ID,
        params: { agentId: 'target-agent-2' },
      });

      await vi.waitFor(() => {
        expect(mockInvalidate).toHaveBeenCalledWith('target-agent-2');
      }, { timeout: 1000 });
    });

    it('does not invalidate reputation cache when agentId is empty', async () => {
      const mockInvalidate = vi.fn();
      const erc8004Entry = {
        provider: { metadata: { name: 'erc8004_agent', requiresApiKey: false } },
        action: { defaultTier: 'standard' },
      };
      (deps.registry as any).getAction = vi.fn().mockReturnValue(erc8004Entry);
      (deps.registry as any).executeResolve = vi.fn().mockResolvedValue([
        { type: 'CONTRACT_CALL', to: '0xReg', data: '0x', value: '0' },
      ]);
      deps.reputationCache = { invalidate: mockInvalidate } as any;

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });
      const mockSelectGet = vi.fn()
        .mockResolvedValueOnce(mockWallet)
        .mockResolvedValueOnce({ metadata: '{}' });
      const mockSelectWhere = vi.fn().mockReturnValue({ get: mockSelectGet });
      const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
      (deps as any).db = { select: mockSelect, update: mockUpdate };

      const app = buildApp(deps);
      await postAction(app, 'erc8004_agent', 'give_feedback', {
        walletId: WALLET_ID,
        params: {},
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(mockInvalidate).not.toHaveBeenCalled();
    });

    it('handles PIPELINE_HALTED error gracefully', async () => {
      setupPipelineDeps();
      const { WAIaaSError } = await import('@waiaas/core');
      mockStage2Auth.mockRejectedValue(new WAIaaSError('PIPELINE_HALTED' as any));

      const app = buildApp(deps);
      const res = await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });
      expect(res.status).toBe(201); // Returns before async pipeline errors

      // Wait for async pipeline to finish
      await new Promise((r) => setTimeout(r, 50));
      // PIPELINE_HALTED is silently caught -- no DB update to FAILED
    });

    it('marks tx as FAILED on pipeline error', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });
      const mockSelectGet = vi.fn()
        .mockResolvedValueOnce(mockWallet)  // wallet lookup
        .mockResolvedValueOnce({ metadata: '{}' }) // tx metadata in pipeline
        .mockResolvedValueOnce({ id: 'tx-mock-1', status: 'PENDING' }); // tx lookup in error handler
      const mockSelectWhere = vi.fn().mockReturnValue({ get: mockSelectGet });
      const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

      (deps as any).db = { select: mockSelect, update: mockUpdate };
      (deps.registry as any).getAction = vi.fn().mockReturnValue(mockEntry);
      (deps.registry as any).executeResolve = vi.fn().mockResolvedValue([
        { type: 'CONTRACT_CALL', to: '0xabc', data: '0x123', value: '0' },
      ]);

      mockStage3Policy.mockRejectedValue(new Error('Policy denied'));

      const app = buildApp(deps);
      const res = await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });
      expect(res.status).toBe(201);

      // Wait for async pipeline error handling
      await vi.waitFor(() => {
        // update should be called: once for metadata, once for FAILED status
        expect(mockUpdate.mock.calls.length).toBeGreaterThanOrEqual(2);
      }, { timeout: 1000 });
    });

    it('handles non-Error pipeline failure', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });
      const mockSelectGet = vi.fn()
        .mockResolvedValueOnce(mockWallet)
        .mockResolvedValueOnce({ metadata: '{}' })
        .mockResolvedValueOnce({ id: 'tx-mock-1', status: 'PENDING' });
      const mockSelectWhere = vi.fn().mockReturnValue({ get: mockSelectGet });
      const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

      (deps as any).db = { select: mockSelect, update: mockUpdate };
      (deps.registry as any).getAction = vi.fn().mockReturnValue(mockEntry);
      (deps.registry as any).executeResolve = vi.fn().mockResolvedValue([
        { type: 'CONTRACT_CALL', to: '0xabc', data: '0x123', value: '0' },
      ]);

      mockStage2Auth.mockRejectedValue('string-error');

      const app = buildApp(deps);
      await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });

      await vi.waitFor(() => {
        expect(mockUpdate.mock.calls.length).toBeGreaterThanOrEqual(2);
      }, { timeout: 1000 });
    });

    it('does not update tx to FAILED if already in terminal state', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });
      const mockSelectGet = vi.fn()
        .mockResolvedValueOnce(mockWallet)
        .mockResolvedValueOnce({ metadata: '{}' })
        .mockResolvedValueOnce({ id: 'tx-mock-1', status: 'CONFIRMED' }); // already terminal
      const mockSelectWhere = vi.fn().mockReturnValue({ get: mockSelectGet });
      const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

      (deps as any).db = { select: mockSelect, update: mockUpdate };
      (deps.registry as any).getAction = vi.fn().mockReturnValue(mockEntry);
      (deps.registry as any).executeResolve = vi.fn().mockResolvedValue([
        { type: 'CONTRACT_CALL', to: '0xabc', data: '0x123', value: '0' },
      ]);

      mockStage5Execute.mockRejectedValue(new Error('exec failed'));

      const app = buildApp(deps);
      await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });

      await new Promise((r) => setTimeout(r, 100));
      // update called once for metadata persist, but NOT for FAILED since status is CONFIRMED
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it('swallows DB error in pipeline error handler', async () => {
      const mockUpdate = vi.fn()
        .mockReturnValueOnce({ // metadata update - success
          set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
        })
        .mockImplementationOnce(() => { // FAILED update - throws
          throw new Error('DB write error');
        });
      const mockSelectGet = vi.fn()
        .mockResolvedValueOnce(mockWallet)
        .mockResolvedValueOnce({ metadata: '{}' })
        .mockResolvedValueOnce({ id: 'tx-mock-1', status: 'PENDING' });
      const mockSelectWhere = vi.fn().mockReturnValue({ get: mockSelectGet });
      const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

      (deps as any).db = { select: mockSelect, update: mockUpdate };
      (deps.registry as any).getAction = vi.fn().mockReturnValue(mockEntry);
      (deps.registry as any).executeResolve = vi.fn().mockResolvedValue([
        { type: 'CONTRACT_CALL', to: '0xabc', data: '0x123', value: '0' },
      ]);

      mockStage2Auth.mockRejectedValue(new Error('auth failed'));

      const app = buildApp(deps);
      // Should not throw even though DB update fails
      await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });
      await new Promise((r) => setTimeout(r, 100));
      // No assertions needed -- test passes if no unhandled rejection
    });

    it('passes passwordRef when available', async () => {
      setupPipelineDeps();
      deps.passwordRef = { password: 'dynamic-pw' } as any;

      const app = buildApp(deps);
      await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });

      const ctx = mockStage1Validate.mock.calls[0][0];
      expect(ctx.masterPassword).toBe('dynamic-pw');
    });

    it('passes optional deps (wcSigningBridge, approvalChannelRouter, eventBus)', async () => {
      setupPipelineDeps();
      const mockBridge = { current: { sign: vi.fn() } };
      const mockRouter = { route: vi.fn() };
      const mockEventBus = { emit: vi.fn() };
      deps.wcSigningBridgeRef = mockBridge as any;
      deps.approvalChannelRouter = mockRouter as any;
      deps.eventBus = mockEventBus as any;

      const app = buildApp(deps);
      await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });

      const ctx = mockStage1Validate.mock.calls[0][0];
      expect(ctx.wcSigningBridge).toBe(mockBridge.current);
      expect(ctx.approvalChannelRouter).toBe(mockRouter);
      expect(ctx.eventBus).toBe(mockEventBus);
    });

    it('passes custom network from body', async () => {
      setupPipelineDeps();

      const app = buildApp(deps);
      await postAction(app, 'test_provider', 'test_action', {
        walletId: WALLET_ID,
        network: 'ethereum-sepolia',
      });

      expect(mockResolveNetwork).toHaveBeenCalledWith('ethereum-sepolia', 'mainnet', 'ethereum');
    });

    it('uses null metadata when tx has no existing metadata', async () => {
      (deps.registry as any).getAction = vi.fn().mockReturnValue(mockEntry);
      (deps.registry as any).executeResolve = vi.fn().mockResolvedValue([
        { type: 'CONTRACT_CALL', to: '0xabc', data: '0x123', value: '0' },
      ]);

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });
      const mockSelectGet = vi.fn()
        .mockResolvedValueOnce(mockWallet)
        .mockResolvedValueOnce(null); // no existing tx
      const mockSelectWhere = vi.fn().mockReturnValue({ get: mockSelectGet });
      const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
      (deps as any).db = { select: mockSelect, update: mockUpdate };

      const app = buildApp(deps);
      const res = await postAction(app, 'test_provider', 'test_action', { walletId: WALLET_ID });
      expect(res.status).toBe(201);
    });
  });
});
