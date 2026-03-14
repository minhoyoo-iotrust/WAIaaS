/**
 * Tests for GET /v1/actions/providers enhanced response.
 * Verifies enabledKey, category, isEnabled fields in provider listing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock deps before imports
const mockListProviders = vi.fn();
const mockListActions = vi.fn();
const mockGetAction = vi.fn();
const mockHasApiKey = vi.fn();
const mockGet = vi.fn();

const mockSettingsService = {
  hasApiKey: mockHasApiKey,
  get: mockGet,
  getAllMasked: vi.fn().mockReturnValue({}),
  getApiKeyMasked: vi.fn().mockReturnValue(null),
  getApiKeyUpdatedAt: vi.fn().mockReturnValue(null),
  setMany: vi.fn(),
  setApiKey: vi.fn(),
};

const mockRegistry = {
  listProviders: mockListProviders,
  listActions: mockListActions,
  getAction: mockGetAction,
  executeResolve: vi.fn(),
};

describe('GET /v1/actions/providers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('response includes enabledKey, category, isEnabled for each provider', async () => {
    mockListProviders.mockReturnValue([
      {
        name: 'jupiter_swap',
        description: 'Solana DEX aggregator for token swaps',
        version: '1.0.0',
        chains: ['solana'],
        mcpExpose: true,
        requiresApiKey: true,
        category: 'Swap',
        enabledKey: undefined,
      },
    ]);
    mockListActions.mockReturnValue([]);
    mockHasApiKey.mockReturnValue(true);
    mockGet.mockReturnValue('true');

    // Dynamically import to get fresh module
    const { actionRoutes } = await import('../api/routes/actions.js');
    const { OpenAPIHono } = await import('@hono/zod-openapi');

    const app = new OpenAPIHono();
    const router = actionRoutes({
      registry: mockRegistry as any,
      db: {} as any,
      adapterPool: {} as any,
      config: { daemon: { port: 3000 }, security: {} } as any,
      keyStore: {} as any,
      policyEngine: {} as any,
      masterPassword: 'test',
      settingsService: mockSettingsService as any,
    });
    app.route('/', router);

    const res = await app.request('/actions/providers');
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.providers).toHaveLength(1);
    const provider = body.providers[0];
    expect(provider).toHaveProperty('enabledKey');
    expect(provider).toHaveProperty('category');
    expect(provider).toHaveProperty('isEnabled');
    expect(provider.enabledKey).toBe('jupiter_swap');
    expect(provider.category).toBe('Swap');
    expect(provider.isEnabled).toBe(true);
  });

  it('isEnabled reflects actual settings state (disabled provider -> false)', async () => {
    mockListProviders.mockReturnValue([
      {
        name: 'lido_staking',
        description: 'ETH liquid staking with stETH',
        version: '1.0.0',
        chains: ['evm'],
        mcpExpose: false,
        requiresApiKey: false,
        category: 'Staking',
      },
    ]);
    mockListActions.mockReturnValue([]);
    mockHasApiKey.mockReturnValue(false);
    mockGet.mockReturnValue('false');

    const { actionRoutes } = await import('../api/routes/actions.js');
    const { OpenAPIHono } = await import('@hono/zod-openapi');

    const app = new OpenAPIHono();
    const router = actionRoutes({
      registry: mockRegistry as any,
      db: {} as any,
      adapterPool: {} as any,
      config: { daemon: { port: 3000 }, security: {} } as any,
      keyStore: {} as any,
      policyEngine: {} as any,
      masterPassword: 'test',
      settingsService: mockSettingsService as any,
    });
    app.route('/', router);

    const res = await app.request('/actions/providers');
    const body = await res.json() as any;

    expect(body.providers[0].isEnabled).toBe(false);
  });

  it('category defaults to "Other" when not set in metadata', async () => {
    mockListProviders.mockReturnValue([
      {
        name: 'custom_provider',
        description: 'A custom action provider for testing',
        version: '1.0.0',
        chains: ['evm'],
        mcpExpose: false,
        requiresApiKey: false,
        // no category field
      },
    ]);
    mockListActions.mockReturnValue([]);
    mockHasApiKey.mockReturnValue(false);
    mockGet.mockReturnValue(undefined);

    const { actionRoutes } = await import('../api/routes/actions.js');
    const { OpenAPIHono } = await import('@hono/zod-openapi');

    const app = new OpenAPIHono();
    const router = actionRoutes({
      registry: mockRegistry as any,
      db: {} as any,
      adapterPool: {} as any,
      config: { daemon: { port: 3000 }, security: {} } as any,
      keyStore: {} as any,
      policyEngine: {} as any,
      masterPassword: 'test',
      settingsService: mockSettingsService as any,
    });
    app.route('/', router);

    const res = await app.request('/actions/providers');
    const body = await res.json() as any;

    expect(body.providers[0].category).toBe('Other');
  });

  it('enabledKey defaults to provider name if not explicitly set', async () => {
    mockListProviders.mockReturnValue([
      {
        name: 'aave_v3',
        description: 'EVM lending protocol for supply and borrow',
        version: '1.0.0',
        chains: ['evm'],
        mcpExpose: false,
        requiresApiKey: false,
        category: 'Lending',
        // no enabledKey -> should default to name
      },
    ]);
    mockListActions.mockReturnValue([]);
    mockHasApiKey.mockReturnValue(false);
    mockGet.mockReturnValue('true');

    const { actionRoutes } = await import('../api/routes/actions.js');
    const { OpenAPIHono } = await import('@hono/zod-openapi');

    const app = new OpenAPIHono();
    const router = actionRoutes({
      registry: mockRegistry as any,
      db: {} as any,
      adapterPool: {} as any,
      config: { daemon: { port: 3000 }, security: {} } as any,
      keyStore: {} as any,
      policyEngine: {} as any,
      masterPassword: 'test',
      settingsService: mockSettingsService as any,
    });
    app.route('/', router);

    const res = await app.request('/actions/providers');
    const body = await res.json() as any;

    expect(body.providers[0].enabledKey).toBe('aave_v3');
  });

  it('Hyperliquid providers share enabledKey "hyperliquid"', async () => {
    mockListProviders.mockReturnValue([
      {
        name: 'hyperliquid_perp',
        description: 'Hyperliquid perpetual futures trading',
        version: '1.0.0',
        chains: ['evm'],
        mcpExpose: true,
        requiresApiKey: false,
        category: 'Perp',
        enabledKey: 'hyperliquid',
      },
      {
        name: 'hyperliquid_spot',
        description: 'Hyperliquid spot market trading buy sell',
        version: '1.0.0',
        chains: ['evm'],
        mcpExpose: true,
        requiresApiKey: false,
        category: 'Swap',
        enabledKey: 'hyperliquid',
      },
    ]);
    mockListActions.mockReturnValue([]);
    mockHasApiKey.mockReturnValue(false);
    mockGet.mockReturnValue('true');

    const { actionRoutes } = await import('../api/routes/actions.js');
    const { OpenAPIHono } = await import('@hono/zod-openapi');

    const app = new OpenAPIHono();
    const router = actionRoutes({
      registry: mockRegistry as any,
      db: {} as any,
      adapterPool: {} as any,
      config: { daemon: { port: 3000 }, security: {} } as any,
      keyStore: {} as any,
      policyEngine: {} as any,
      masterPassword: 'test',
      settingsService: mockSettingsService as any,
    });
    app.route('/', router);

    const res = await app.request('/actions/providers');
    const body = await res.json() as any;

    expect(body.providers[0].enabledKey).toBe('hyperliquid');
    expect(body.providers[1].enabledKey).toBe('hyperliquid');
  });
});
