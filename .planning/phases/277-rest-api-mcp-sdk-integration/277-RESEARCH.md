# Phase 277: REST API + MCP + SDK Integration - Research

**Researched:** 2026-02-27
**Domain:** REST API endpoints, MCP tool auto-registration, TS/Python SDK extension for DeFi Lending positions
**Confidence:** HIGH

## Summary

Phase 277 integrates the Lending framework (Phase 275) and Aave V3 provider (Phase 276) into the three external interfaces: REST API, MCP tools, and TS/Python SDKs. The codebase already has well-established patterns for each layer -- the challenge is additive integration following existing conventions, not new architecture.

Two new REST endpoints are needed: `GET /v1/wallets/:id/positions` (DeFi positions with USD amounts) and `GET /v1/wallets/:id/health-factor` (health factor with severity classification). MCP tool registration for Aave actions is already handled automatically by the existing `registerActionProviderTools()` mechanism since AaveV3LendingProvider has `mcpExpose: true`. A 5th MCP tool for position queries (`action_aave_v3_aave_positions`) needs manual registration or a custom MCP tool. SDK extension adds convenience methods `getPositions()` and `getHealthFactor()` to both TS and Python clients.

**Primary recommendation:** Follow existing route/schema/test patterns exactly. The REST endpoints should be added to the `wallets.ts` route file (they operate on `/v1/wallets/:id/*` paths under masterAuth). For SDK, add convenience wrapper methods that call the new endpoints. The MCP positions tool should be added as a dedicated tool in `packages/mcp/src/tools/` since position queries are read-only (not action-provider resolves).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| API-01 | GET /v1/wallets/:id/positions -- DeFi 포지션 목록 조회 | New OpenAPIHono route in wallets.ts or separate defi-positions.ts; reads from defi_positions table (Phase 274/275); follows walletDetailRoute pattern with masterAuth. Response includes USD amounts from DB cache or live ILendingProvider.getPosition(). |
| API-02 | GET /v1/wallets/:id/health-factor -- 헬스 팩터 조회 | New endpoint returning raw factor + decimal + SAFE/WARNING/DANGER/CRITICAL classification. Uses AaveV3LendingProvider.getHealthFactor() via registry lookup. Zod response schema derived from HealthFactorSchema in core. |
| API-03 | MCP 도구 5개 (aave_supply/borrow/repay/withdraw/positions) 자동 등록 | Supply/borrow/repay/withdraw: ALREADY auto-registered via registerActionProviderTools() in packages/mcp/src/tools/action-provider.ts because mcpExpose=true. Positions tool: add new dedicated MCP tool in packages/mcp/src/tools/ that calls GET /v1/wallets/:id/positions. |
| API-04 | TS/Python SDK executeAction('aave_supply', params) + getPositions()/getHealthFactor() | executeAction() ALREADY works via existing client.executeAction('aave_v3', 'aave_supply', { params }). Need to add getPositions(walletId) and getHealthFactor(walletId) convenience methods to both TS WAIaaSClient and Python WAIaaSClient. |
| API-05 | 포지션 조회 API가 USD 환산 금액 포함 | defi_positions.amount_usd column populated by PositionTracker (Phase 275). REST endpoint reads from DB cache. For live queries, ILendingProvider.getPosition() returns amountUsd from on-chain oracle (Aave base currency is USD/8-decimal). |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @hono/zod-openapi | 4.x | OpenAPI route definitions with Zod SSoT | Already used for all 21+ route files in the daemon |
| @modelcontextprotocol/sdk | (current) | MCP tool registration | Already used for 23 built-in + N dynamic action tools |
| @waiaas/core | workspace | HealthFactorSchema, LendingPositionSummarySchema, ILendingProvider types | SSoT types from Phase 274 |
| httpx | (Python) | Python SDK HTTP client | Already used by python-sdk/waiaas/client.py |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-sqlite3 | (current) | Direct SQL for defi_positions queries | When Drizzle ORM adds unnecessary overhead for read queries |
| drizzle-orm | (current) | Wallet lookup, type-safe queries | Wallet existence checks |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate defi-positions.ts route file | Add to wallets.ts | Separate file is cleaner for maintainability given wallets.ts is already 1200+ lines |
| Dedicated MCP positions tool | Dynamic action provider tool | Position queries are read-only, not action resolves. A dedicated tool provides better MCP schema (no params/gasCondition fields) |
| Session-auth for positions endpoint | Master-auth (current wallets pattern) | Positions endpoint serves both Admin UI (masterAuth) and agent queries. Use dual-auth pattern like GET /v1/actions/providers |

## Architecture Patterns

### Recommended Project Structure
```
packages/daemon/src/api/routes/
  defi-positions.ts          # NEW: GET /v1/wallets/:id/positions, /health-factor
  openapi-schemas.ts         # ADD: DeFiPositionSchema, HealthFactorResponseSchema

packages/mcp/src/tools/
  get-defi-positions.ts      # NEW: waiaas_get_defi_positions MCP tool
  get-health-factor.ts       # NEW: waiaas_get_health_factor MCP tool

packages/mcp/src/server.ts   # MODIFY: register 2 new tools

packages/sdk/src/
  client.ts                  # MODIFY: add getPositions(), getHealthFactor()
  types.ts                   # MODIFY: add DeFiPosition, HealthFactorResponse types

python-sdk/waiaas/
  client.py                  # MODIFY: add get_positions(), get_health_factor()
  models.py                  # MODIFY: add DeFiPosition, HealthFactorResponse models
```

### Pattern 1: OpenAPIHono Route with createRoute + Zod SSoT
**What:** Define route with createRoute(), Zod schema for request/response, register on OpenAPIHono router
**When to use:** Every new REST endpoint
**Example:**
```typescript
// Source: packages/daemon/src/api/routes/wallets.ts (existing pattern)
const defiPositionsRoute = createRoute({
  method: 'get',
  path: '/wallets/{id}/positions',
  tags: ['DeFi'],
  summary: 'Get DeFi positions for wallet',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'DeFi positions with USD amounts',
      content: { 'application/json': { schema: DeFiPositionsResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});
```

### Pattern 2: MCP Tool Registration (Dedicated Read-Only Tool)
**What:** Register a static MCP tool that calls the REST API (not via action-provider auto-conversion)
**When to use:** Read-only queries that don't go through the pipeline
**Example:**
```typescript
// Source: packages/mcp/src/tools/get-balance.ts (existing pattern)
export function registerGetDefiPositions(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'waiaas_get_defi_positions',
    withWalletPrefix('Get DeFi lending positions with USD amounts', walletContext?.walletName),
    {
      wallet_id: z.string().optional().describe('Target wallet ID. Omit for default wallet.'),
    },
    async (args) => {
      // Resolve wallet ID from context or args
      const res = await apiClient.get(`/v1/wallets/${walletId}/positions`);
      return toToolResult(res);
    },
  );
}
```

### Pattern 3: SDK Convenience Method (TS)
**What:** Add typed wrapper method that calls REST endpoint with retry
**When to use:** Every new endpoint that agents frequently call
**Example:**
```typescript
// Source: packages/sdk/src/client.ts (existing pattern for getBalance, etc.)
async getPositions(walletId: string): Promise<DeFiPositionsResponse> {
  return withRetry(
    () => this.http.get<DeFiPositionsResponse>(
      `/v1/wallets/${walletId}/positions`,
      this.authHeaders(),
    ),
    this.retryOptions,
  );
}
```

### Pattern 4: Python SDK Convenience Method
**What:** Add typed wrapper using Pydantic model_validate
**When to use:** Mirror every TS SDK convenience method
**Example:**
```python
# Source: python-sdk/waiaas/client.py (existing pattern)
async def get_positions(self, wallet_id: str) -> DeFiPositionsResponse:
    """GET /v1/wallets/:id/positions -- Get DeFi positions."""
    resp = await self._request("GET", f"/v1/wallets/{wallet_id}/positions")
    return DeFiPositionsResponse.model_validate(resp.json())
```

### Pattern 5: Auth for Wallet Sub-Endpoints
**What:** `/v1/wallets/:id/*` routes are masterAuth-protected at server.ts level
**When to use:** Position/health-factor endpoints under wallets path
**Key insight:** The server.ts already registers masterAuth for `/v1/wallets/:id` and specific sub-paths. New sub-paths under `/v1/wallets/:id/positions` and `/v1/wallets/:id/health-factor` need to be added to the masterAuth middleware exclusion list or use the same dual-auth pattern for agent access.

**Decision needed:** These endpoints should support dual-auth (masterAuth for Admin, sessionAuth for agents). The cleanest approach: mount them on a sessionAuth-protected path like `/v1/wallet/positions` (singular, like `/v1/wallet/staking`) OR add dual-auth similar to GET `/v1/actions/providers`. The staking route pattern (`/v1/wallet/staking`) using session's default wallet + optional `wallet_id` query param is the established DeFi query pattern in this codebase.

### Anti-Patterns to Avoid
- **Don't add positions endpoint to `/v1/wallets/:id/positions`:** This path is masterAuth-only. Agent queries need sessionAuth. Use `/v1/wallet/positions` pattern like staking.
- **Don't create a 5th action for "positions" in AaveV3LendingProvider:** Position queries are reads, not ContractCallRequest resolves. Keep them separate from the action pipeline.
- **Don't hand-roll health-factor severity classification:** Use the enum from `HealthFactorSchema` (`safe/warning/danger/critical`) already defined in `@waiaas/core`.
- **Don't skip updating skill files:** CLAUDE.md mandates skill file updates when REST API, SDK, or MCP interfaces change.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Health factor severity classification | Custom severity logic | AaveV3LendingProvider.getHealthFactor() returns status field | Already classifies safe/warning/danger/critical with proper thresholds |
| Position USD amounts | Custom price oracle calls | Read from defi_positions.amount_usd column | PositionTracker (Phase 275) already populates this via IPositionProvider sync |
| MCP tool for Aave actions | Dedicated MCP tools for supply/borrow/repay/withdraw | registerActionProviderTools() auto-conversion | Already works since mcpExpose=true. Tool names: action_aave_v3_aave_supply, etc. |
| Wallet ID resolution in SDK | Manual JWT parsing or separate API call | getAddress() returns walletId | Already available; positions endpoint needs explicit walletId |
| OpenAPI error responses | Manual error JSON construction | buildErrorResponses() + WAIaaSError | Consistent error format across all routes |

**Key insight:** Most of the MCP tool work is already done by the auto-registration mechanism. Only read-only position/health-factor queries need manual MCP tool registration.

## Common Pitfalls

### Pitfall 1: Auth Middleware Path Mismatch
**What goes wrong:** New `/v1/wallets/:id/positions` endpoint gets wrong auth middleware
**Why it happens:** `server.ts` has complex middleware routing with explicit path matching for sub-paths
**How to avoid:** Follow the staking route pattern: use `/v1/wallet/positions` (singular) which is covered by `app.use('/v1/wallet/*', sessionAuth)` wildcard. Add optional `wallet_id` query param for multi-wallet sessions.
**Warning signs:** 401 errors when agent tries to query positions; 403 when admin tries.

### Pitfall 2: MCP Tool Name Collision
**What goes wrong:** Registering a "positions" MCP tool that conflicts with the auto-registered action tools
**Why it happens:** registerActionProviderTools() creates tools named `action_aave_v3_aave_*`. A new tool named similarly could conflict.
**How to avoid:** Name the positions tool `waiaas_get_defi_positions` (following `waiaas_get_balance` convention) and health-factor tool `waiaas_get_health_factor`.
**Warning signs:** MCP client sees duplicate tool names or confusing tool list.

### Pitfall 3: Python SDK Missing Pydantic Model
**What goes wrong:** Python SDK method returns raw dict instead of typed model
**Why it happens:** Forgetting to add Pydantic model to `models.py` and validate response
**How to avoid:** Always define Pydantic model first (in `models.py`), then use `model_validate()` in client method.
**Warning signs:** Mypy type errors, missing autocomplete in IDE.

### Pitfall 4: SDK Type Isolation Violation
**What goes wrong:** SDK imports from `@waiaas/core`
**Why it happens:** Convenient to reuse HealthFactorSchema, but SDK has zero dependency on core
**How to avoid:** Define standalone TS types in `packages/sdk/src/types.ts`. The comment at top of types.ts explicitly says "The SDK has zero dependency on @waiaas/core -- types are standalone."
**Warning signs:** Build failure in SDK package; tsconfig paths not resolving @waiaas/core.

### Pitfall 5: Stale DB Cache vs Live Query
**What goes wrong:** GET /positions returns outdated data from 5-minute-old cache
**Why it happens:** PositionTracker syncs every 5 minutes; endpoint reads from DB
**How to avoid:** For the REST endpoint, reading from DB cache is the designed behavior (PositionTracker is the canonical sync source). Document that data may be up to 5 minutes stale. Optionally add `?refresh=true` query param to trigger PositionTracker.syncCategory('LENDING') before reading.
**Warning signs:** Users report positions not reflecting recent transactions.

### Pitfall 6: Health Factor Endpoint Without RPC Caller
**What goes wrong:** Health factor always returns `{ factor: Infinity, status: 'safe' }` (default fallback)
**Why it happens:** AaveV3LendingProvider was registered without `rpcCaller` injection (the Phase 276 TODO: "rpcCaller injection deferred to Phase 277")
**How to avoid:** Phase 277 MUST inject an IRpcCaller into AaveV3LendingProvider during daemon lifecycle registration. The existing `registerBuiltInProviders()` factory has a comment: "NOTE: rpcCaller injection deferred to Phase 277". Need to create an IRpcCaller adapter that uses AdapterPool's EVM RPC.
**Warning signs:** Health factor always returns safe with 0 collateral and 0 debt.

## Code Examples

### REST Route: Positions Endpoint (following staking.ts pattern)
```typescript
// Source: packages/daemon/src/api/routes/staking.ts (adapted)
const getPositionsRoute = createRoute({
  method: 'get',
  path: '/wallet/positions',
  tags: ['DeFi'],
  summary: 'Get DeFi lending positions',
  request: {
    query: z.object({
      wallet_id: z.string().uuid().optional(),
    }),
  },
  responses: {
    200: {
      description: 'DeFi positions with USD amounts',
      content: { 'application/json': { schema: DeFiPositionsResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});
```

### Reading Positions from DB Cache
```typescript
// Source: PositionWriteQueue upsert SQL (existing pattern)
const positions = sqlite
  .prepare(
    "SELECT id, wallet_id, category, provider, chain, network, asset_id, amount, amount_usd, metadata, status, opened_at, closed_at, last_synced_at FROM defi_positions WHERE wallet_id = ? AND status = 'ACTIVE' ORDER BY category, provider"
  )
  .all(walletId) as PositionRow[];
```

### Health Factor with Provider Lookup
```typescript
// Source: AaveV3LendingProvider.getHealthFactor() (Phase 276)
// Need to look up ILendingProvider from ActionProviderRegistry
const aaveProvider = actionProviderRegistry.getProviderByName('aave_v3') as ILendingProvider;
const healthFactor = await aaveProvider.getHealthFactor(walletId, {
  walletAddress: wallet.publicKey,
  chain: 'ethereum',
  walletId,
});
// healthFactor: { factor: 2.5, totalCollateralUsd: 10000, totalDebtUsd: 4000, currentLtv: 0.4, status: 'safe' }
```

### MCP Tool: Positions Query
```typescript
// Source: packages/mcp/src/tools/get-balance.ts (adapted)
server.tool(
  'waiaas_get_defi_positions',
  withWalletPrefix('Get DeFi lending positions with health factor and USD amounts', walletContext?.walletName),
  {
    wallet_id: z.string().optional().describe('Target wallet ID. Omit for default wallet.'),
  },
  async (args) => {
    const walletId = args.wallet_id;
    const params = walletId ? `?wallet_id=${walletId}` : '';
    const res = await apiClient.get(`/v1/wallet/positions${params}`);
    return toToolResult(res);
  },
);
```

### SDK: TypeScript getPositions()
```typescript
// packages/sdk/src/client.ts (new method)
async getPositions(options?: { walletId?: string }): Promise<DeFiPositionsResponse> {
  const query = new URLSearchParams();
  if (options?.walletId) query.set('wallet_id', options.walletId);
  const qs = query.toString();
  return withRetry(
    () => this.http.get<DeFiPositionsResponse>(
      `/v1/wallet/positions${qs ? `?${qs}` : ''}`,
      this.authHeaders(),
    ),
    this.retryOptions,
  );
}
```

### SDK: Python get_positions()
```python
# python-sdk/waiaas/client.py (new method)
async def get_positions(
    self,
    *,
    wallet_id: Optional[str] = None,
) -> DeFiPositionsResponse:
    """GET /v1/wallet/positions -- Get DeFi lending positions."""
    params: dict[str, Any] = {}
    if wallet_id is not None:
        params["wallet_id"] = wallet_id
    resp = await self._request("GET", "/v1/wallet/positions", params=params or None)
    return DeFiPositionsResponse.model_validate(resp.json())
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| v28.4 staking route: aggregate from tx metadata | Phase 275 PositionTracker: periodic sync to defi_positions DB | v29.2 (Phase 274-275) | Positions endpoint reads from dedicated table, not tx aggregation |
| AaveV3LendingProvider without rpcCaller | Phase 277 must inject rpcCaller | v29.2 (noted in Phase 276) | Health factor and position queries require live RPC |
| Single wallet endpoint pattern | Dual-auth (masterAuth + sessionAuth) for DeFi queries | v28.4+ | Both Admin UI and agents need to query positions |

**Deprecated/outdated:**
- The staking position endpoint (`/v1/wallet/staking`) uses tx-aggregation; the new positions endpoint uses the defi_positions table (better for multi-protocol positions)

## Open Questions

1. **IRpcCaller Injection into AaveV3LendingProvider**
   - What we know: Phase 276 deferred rpcCaller injection. The registerBuiltInProviders() factory creates AaveV3LendingProvider without rpcCaller. The provider gracefully degrades (returns empty/default values).
   - What's unclear: How to create an IRpcCaller adapter from the daemon's AdapterPool. IRpcCaller.call({ to, data, chainId }) needs to make eth_call via viem/HTTP.
   - Recommendation: Create a simple adapter class `AdapterPoolRpcCaller implements IRpcCaller` in the daemon lifecycle that delegates to AdapterPool's resolve + raw eth_call. This is essential for health-factor and position queries to work.

2. **Positions Endpoint Path: `/v1/wallets/:id/positions` vs `/v1/wallet/positions`**
   - What we know: `/v1/wallets/:id/*` is masterAuth-only. `/v1/wallet/*` is sessionAuth (agent access). The success criteria says "GET /v1/wallets/:id/positions" but agents need sessionAuth.
   - Recommendation: Use `/v1/wallet/positions` (sessionAuth, like staking) with optional `wallet_id` query param. This matches the staking route pattern and works for both agents (session default wallet) and multi-wallet sessions. If Admin UI also needs it, add a masterAuth mirror endpoint or use the same dual-auth pattern.

3. **Skill File Updates**
   - What we know: CLAUDE.md mandates updating skill files when REST API, SDK, or MCP interfaces change.
   - Recommendation: Update `skills/wallet.skill.md` (new positions/health-factor endpoints), `skills/actions.skill.md` (Aave actions documentation). Possibly create `skills/defi.skill.md` if the domain is large enough.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `packages/daemon/src/api/routes/wallets.ts` -- route pattern (1200 lines reviewed)
- Codebase analysis: `packages/daemon/src/api/routes/staking.ts` -- DeFi position endpoint pattern
- Codebase analysis: `packages/daemon/src/api/routes/actions.ts` -- action provider REST integration
- Codebase analysis: `packages/mcp/src/tools/action-provider.ts` -- MCP auto-registration mechanism
- Codebase analysis: `packages/mcp/src/server.ts` -- 23 built-in MCP tool registration pattern
- Codebase analysis: `packages/sdk/src/client.ts` -- TS SDK method pattern (22 methods)
- Codebase analysis: `python-sdk/waiaas/client.py` -- Python SDK method pattern
- Codebase analysis: `packages/actions/src/providers/aave-v3/index.ts` -- AaveV3LendingProvider implementation
- Codebase analysis: `packages/actions/src/index.ts` -- registerBuiltInProviders() with rpcCaller TODO
- Codebase analysis: `packages/core/src/interfaces/lending-provider.types.ts` -- ILendingProvider, HealthFactorSchema
- Codebase analysis: `packages/daemon/src/services/defi/position-tracker.ts` -- PositionTracker DB queries

### Secondary (MEDIUM confidence)
- Codebase analysis: `packages/daemon/src/api/server.ts` -- auth middleware routing (complex path matching)
- Codebase analysis: `packages/daemon/src/api/routes/openapi-schemas.ts` -- Zod schema patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use; no new dependencies needed
- Architecture: HIGH - all patterns established by existing routes/tools/SDK methods
- Pitfalls: HIGH - identified from direct codebase analysis of auth middleware, provider registration, SDK isolation constraints

**Research date:** 2026-02-27
**Valid until:** 2026-03-30 (stable internal codebase patterns)
