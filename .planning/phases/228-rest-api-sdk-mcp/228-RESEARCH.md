# Phase 228: REST API + SDK + MCP - Research

**Researched:** 2026-02-22
**Domain:** REST API endpoints, TypeScript/Python SDK methods, MCP tools for incoming transaction monitoring
**Confidence:** HIGH

## Summary

Phase 228 exposes the incoming transaction monitoring infrastructure (built in Phases 224-227) through all client interfaces: REST API, TypeScript SDK, Python SDK, and MCP tools. The implementation follows well-established patterns already present in the codebase -- no new libraries or architectural patterns are needed.

The core work involves: (1) two new REST API routes (`GET /v1/wallet/incoming` with cursor pagination and filters, `GET /v1/wallet/incoming/summary` with period-based aggregation), (2) extending `PATCH /v1/wallets/:id` to accept `monitorIncoming` field for per-wallet opt-in/opt-out, (3) adding corresponding SDK methods to both TypeScript and Python SDKs, (4) adding two MCP tools, and (5) updating `wallet.skill.md`.

**Primary recommendation:** Follow the exact patterns from `transactions.ts` (for route structure, cursor pagination, OpenAPI schemas) and `list-transactions.ts` (for MCP tool pattern). The cursor pagination for incoming transactions uses `(detectedAt, id)` composite cursor (per doc 76 design) instead of UUID-only cursor used by outbound transactions.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| API-01 | GET /v1/wallet/incoming with cursor pagination + chain/network/status/token filters | Doc 76 Section 7.1 defines exact query params, cursor format, and response schema. DB indexes `idx_incoming_tx_wallet_detected` and `idx_incoming_tx_status` support the query. Existing IncomingTransactionSchema Zod SSoT in `packages/core/src/schemas/incoming-transaction.schema.ts`. |
| API-02 | GET /v1/wallet/incoming/summary with period-based (daily/weekly/monthly) totals + USD | Doc 76 Section 7.6 defines exact SQL aggregation approach. BigInt sum in application layer (not SQL) to avoid integer overflow. PriceOracle for USD conversion. |
| API-03 | PATCH /v1/wallets/:id accepts monitorIncoming field for per-wallet monitoring toggle | Doc 76 Section 7.3 defines behavior. `wallets.monitorIncoming` column exists (DB v21). `syncSubscriptions()` already exists on `IncomingTxMonitorService`. No existing PATCH endpoint on wallets -- this is a new route. |
| API-04 | TypeScript SDK adds listIncomingTransactions() and getIncomingTransactionSummary() | Doc 76 Section 7.4 defines exact method signatures. Follows existing pattern in `packages/sdk/src/client.ts` (URLSearchParams + withRetry + authHeaders). |
| API-05 | Python SDK adds list_incoming_transactions() and get_incoming_transaction_summary() | Doc 76 Section 7.4 defines exact method signatures. Follows existing pattern in `python-sdk/waiaas/client.py` (params dict + `_request` + Pydantic model). |
| API-06 | MCP adds 2 tools (list_incoming_transactions, get_incoming_summary) bringing total to 22+ | Doc 76 Section 7.5 defines tool schemas. Follows existing pattern: separate file per tool in `packages/mcp/src/tools/`, register function, `server.tool()` API with Zod input schema. |
| API-07 | Skills wallet.skill.md updated with incoming transaction section | `packages/skills/skills/wallet.skill.md` needs new section documenting incoming TX endpoints, SDK methods, and MCP tools. |

</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @hono/zod-openapi | 4.x | OpenAPI route definitions with Zod validation | Already used by all 18+ routes in daemon |
| drizzle-orm | latest | Database queries with type safety | Already used throughout daemon |
| zod | 3.x | Schema validation SSoT | Project SSoT rule: Zod -> TypeScript -> OpenAPI |
| @modelcontextprotocol/sdk | latest | MCP tool registration | Already used by 21 existing tools |
| pydantic | v2 | Python SDK response models | Already used by Python SDK |
| httpx | latest | Python SDK HTTP client | Already used by Python SDK |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-sqlite3 | latest | Raw SQL for aggregation queries in summary endpoint | Used by IncomingTxMonitorService for performance-critical queries |

### Alternatives Considered

No alternatives needed -- all required libraries are already in the project.

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended File Structure

```
packages/daemon/src/api/routes/
  incoming.ts              # NEW: GET /v1/wallet/incoming, GET /v1/wallet/incoming/summary
  wallets.ts               # MODIFY: add PATCH /v1/wallets/:id with monitorIncoming
  openapi-schemas.ts       # MODIFY: add incoming TX response schemas
  index.ts                 # MODIFY: export incomingRoutes

packages/daemon/src/api/server.ts
  # MODIFY: mount incoming routes, add sessionAuth for /v1/wallet/incoming*

packages/sdk/src/
  client.ts                # MODIFY: add listIncomingTransactions(), getIncomingTransactionSummary()
  types.ts                 # MODIFY: add incoming TX types

packages/mcp/src/tools/
  list-incoming-transactions.ts  # NEW
  get-incoming-summary.ts        # NEW
packages/mcp/src/server.ts       # MODIFY: register 2 new tools

python-sdk/waiaas/
  client.py                # MODIFY: add 2 methods
  models.py                # MODIFY: add Pydantic models

packages/skills/skills/
  wallet.skill.md          # MODIFY: add incoming TX section
```

### Pattern 1: OpenAPI Route with Cursor Pagination (from transactions.ts)

**What:** Routes defined via `createRoute()` with Zod query params, handler uses `resolveWalletId()` + DB query + cursor logic.
**When to use:** All session-auth protected list endpoints.
**Example:**
```typescript
// Source: packages/daemon/src/api/routes/transactions.ts (listTransactionsRoute)
const listIncomingRoute = createRoute({
  method: 'get',
  path: '/wallet/incoming',
  tags: ['Wallet'],
  summary: 'List incoming transactions',
  request: {
    query: IncomingTransactionQuerySchema,
  },
  responses: {
    200: {
      description: 'Incoming transaction list',
      content: { 'application/json': { schema: IncomingTransactionListResponseSchema } },
    },
  },
});
```

### Pattern 2: MCP Tool Registration (from list-transactions.ts)

**What:** Each tool is a separate file exporting a `register*` function that calls `server.tool()` with Zod input schema.
**When to use:** All new MCP tools.
**Example:**
```typescript
// Source: packages/mcp/src/tools/list-transactions.ts
export function registerListIncomingTransactions(
  server: McpServer, apiClient: ApiClient, walletContext?: WalletContext
): void {
  server.tool(
    'list_incoming_transactions',
    withWalletPrefix('List incoming transaction history.', walletContext?.walletName),
    {
      limit: z.number().optional().describe('Max transactions to return'),
      cursor: z.string().optional().describe('Pagination cursor'),
      // ... more params
      wallet_id: z.string().optional().describe('Target wallet ID'),
    },
    async (args) => {
      const params = new URLSearchParams();
      // ... build query string
      const result = await apiClient.get(`/v1/wallet/incoming${qs ? `?${qs}` : ''}`);
      return toToolResult(result);
    },
  );
}
```

### Pattern 3: SDK Method (from client.ts TypeScript)

**What:** Method builds URLSearchParams, calls `this.http.get()` with `authHeaders()`, wraps with `withRetry()`.
**When to use:** All new SDK methods.
**Example:**
```typescript
// Source: packages/sdk/src/client.ts (listTransactions)
async listIncomingTransactions(
  params?: ListIncomingTransactionsParams,
): Promise<IncomingTransactionListResponse> {
  const query = new URLSearchParams();
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.limit) query.set('limit', String(params.limit));
  // ... more params
  const qs = query.toString();
  return withRetry(
    () => this.http.get<IncomingTransactionListResponse>(
      `/v1/wallet/incoming${qs ? `?${qs}` : ''}`,
      this.authHeaders(),
    ),
    this.retryOptions,
  );
}
```

### Pattern 4: Python SDK Method (from client.py)

**What:** Method builds params dict, calls `self._request()`, returns Pydantic model.
**When to use:** All new Python SDK methods.
**Example:**
```python
# Source: python-sdk/waiaas/client.py (list_transactions)
async def list_incoming_transactions(
    self,
    *,
    limit: int = 20,
    cursor: Optional[str] = None,
    status: Optional[str] = None,
    # ... more params
) -> IncomingTransactionList:
    params: dict[str, Any] = {"limit": limit}
    if cursor: params["cursor"] = cursor
    if status: params["status"] = status
    resp = await self._request("GET", "/v1/wallet/incoming", params=params)
    return IncomingTransactionList.model_validate(resp.json())
```

### Pattern 5: PATCH Route for Wallet Update (design decision)

**What:** The requirement specifies `PATCH /v1/wallets/:id` for monitorIncoming toggle. The existing `PUT /v1/wallets/:id` only updates the wallet name. The new PATCH endpoint needs masterAuth because it controls infrastructure behavior.
**When to use:** For monitorIncoming toggle.

**Design decision:** Use `PATCH /v1/wallets/:id` (not PUT) because:
1. PATCH semantics: partial update (only `monitorIncoming` field)
2. Existing `PUT /v1/wallets/:id` already handles name updates via sessionAuth
3. `monitorIncoming` toggle requires masterAuth (infrastructure control)
4. The existing session pattern in `sessions.ts` already uses PATCH (line 177)

**Side effect handling:** After updating `monitor_incoming` in DB, must call `syncSubscriptions()` asynchronously on IncomingTxMonitorService. This requires passing the monitor service reference to the route dependencies.

### Anti-Patterns to Avoid

- **SQL aggregation of amount fields:** Doc 76 explicitly warns that `CAST(amount AS INTEGER)` can overflow for ETH wei (10^18 > SQLite INTEGER max 2^63). Use SQL for COUNT/GROUP BY only, then BigInt sum in application layer.
- **Cursor as UUID-only:** Unlike outbound transactions that use UUID cursor, incoming TX uses composite cursor `(detectedAt, id)` encoded as Base64 JSON per doc 76 Section 7.1.
- **Blocking syncSubscriptions():** The `syncSubscriptions()` call after monitor toggle must be async (fire-and-forget) to avoid blocking the HTTP response.
- **Missing default status filter:** The success criteria states "default filter is status=CONFIRMED". Apply this default when no status filter is provided.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cursor pagination | Custom pagination logic | Follow existing `(detected_at, id)` composite cursor from doc 76 | Consistent with design doc, uses existing DB indexes |
| Route auth middleware | Custom auth logic | Use existing `sessionAuth`/`masterAuth` middleware registration in `server.ts` | Auth middleware is already configured at app level |
| Response schemas | Ad-hoc JSON shapes | Zod schemas in `openapi-schemas.ts` | Project SSoT rule |
| Wallet ID resolution | Manual JWT parsing | Use `resolveWalletId(c, deps.db)` helper | Handles 3-priority fallback + session access check |

**Key insight:** Every pattern needed for Phase 228 already exists in the codebase. The incoming TX routes are essentially a read-only version of the existing transaction routes with different filters and cursor strategy.

## Common Pitfalls

### Pitfall 1: Composite Cursor Encoding/Decoding

**What goes wrong:** If the cursor format is inconsistent between encoding (response) and decoding (query), pagination breaks silently -- returns duplicate items or skips items.
**Why it happens:** The composite cursor `{ detectedAt, id }` must be encoded as Base64(JSON) consistently.
**How to avoid:** Create helper functions `encodeCursor(detectedAt, id)` and `decodeCursor(cursor)` and use them exclusively. Write tests for edge cases (first page, last page, single item, empty results).
**Warning signs:** Items appearing on multiple pages or missing items in pagination.

### Pitfall 2: BigInt Overflow in Summary Aggregation

**What goes wrong:** Using SQL `SUM(amount)` produces incorrect results because ETH wei values (10^18 per token) exceed SQLite integer range.
**Why it happens:** SQLite integers are 64-bit signed (max ~9.2 * 10^18), but summing multiple ETH transactions easily overflows.
**How to avoid:** SQL does only `COUNT` and `GROUP BY`. Fetch individual amounts per period, then use JavaScript `BigInt` for summation in the application layer.
**Warning signs:** Negative or impossibly large totals in summary responses.

### Pitfall 3: Auth Middleware Registration Order in server.ts

**What goes wrong:** New routes don't get proper auth if middleware is not registered before the sub-router is mounted.
**Why it happens:** Hono processes middleware in registration order. Auth must be registered before route handlers.
**How to avoid:** Register `sessionAuth` for `/v1/wallet/incoming` and `/v1/wallet/incoming/*` in the same block as other `/v1/wallet/*` registrations. The existing pattern `app.use('/v1/wallet/*', sessionAuth)` should already cover `/v1/wallet/incoming*` because the wildcard matches.
**Warning signs:** 401 errors when sessionAuth should be applied, or routes accessible without auth.

### Pitfall 4: Missing HttpClient PATCH Method

**What goes wrong:** The TypeScript SDK's `HttpClient` and MCP's `ApiClient` don't have a `patch()` method -- only `get()`, `post()`, `put()`, `delete()`.
**Why it happens:** PATCH is rarely used in the existing API (only `sessions.ts` uses it at the daemon level).
**How to avoid:** For the TypeScript SDK, add a `patch()` method to `HttpClient` (or use the generic `request()` method directly). For MCP ApiClient, add `patch()` method. Alternatively, since `monitorIncoming` toggle is masterAuth (admin operation), SDK methods for it may not be needed in the initial phase -- the SDK is session-auth oriented.
**Warning signs:** TypeScript compilation errors when trying to call `this.http.patch()`.

### Pitfall 5: sessionAuth vs masterAuth for PATCH /v1/wallets/:id

**What goes wrong:** Applying wrong auth middleware to the new PATCH route.
**Why it happens:** Existing `PUT /v1/wallets/:id` uses sessionAuth (wallet name update), but `PATCH /v1/wallets/:id` for `monitorIncoming` should use masterAuth (infrastructure control).
**How to avoid:** The existing server.ts already registers masterAuth for `/v1/wallets/:id` on non-sub-path routes. However, the PATCH needs to share the masterAuth path. Verify that the existing `app.use('/v1/wallets/:id', ...)` middleware handles PATCH method correctly. The current middleware skips sub-paths like `/owner`, `/default-network`, etc. The PATCH on the base path should be covered.
**Warning signs:** 403 errors or unauthorized access on PATCH.

### Pitfall 6: Default Status Filter Omission

**What goes wrong:** Success criteria #1 states "default filter is status=CONFIRMED" but implementation returns all statuses.
**Why it happens:** Easy to forget the default when no status query param is provided.
**How to avoid:** In the route handler, if `status` query param is not provided, default to `'CONFIRMED'`. Document this clearly in OpenAPI schema description.
**Warning signs:** API returns DETECTED (unconfirmed) transactions by default, confusing users.

## Code Examples

### 1. Incoming Route File Structure (daemon)

```typescript
// packages/daemon/src/api/routes/incoming.ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq, and, lt, desc, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { incomingTransactions } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import { resolveWalletId } from '../helpers/resolve-wallet-id.js';
import {
  IncomingTxListQuerySchema,
  IncomingTxListResponseSchema,
  IncomingTxSummaryQuerySchema,
  IncomingTxSummaryResponseSchema,
  openApiValidationHook,
} from './openapi-schemas.js';
import type { IPriceOracle, IForexRateService } from '@waiaas/core';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';

export interface IncomingRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  sqlite?: SQLiteDatabase;
  priceOracle?: IPriceOracle;
  forexRateService?: IForexRateService;
  settingsService?: SettingsService;
}

// Cursor encoding/decoding helpers
function encodeCursor(detectedAt: number, id: string): string {
  return Buffer.from(JSON.stringify({ d: detectedAt, i: id })).toString('base64url');
}

function decodeCursor(cursor: string): { detectedAt: number; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return { detectedAt: parsed.d, id: parsed.i };
  } catch {
    return null;
  }
}
```

### 2. PATCH /v1/wallets/:id for monitorIncoming (daemon)

```typescript
// Added to packages/daemon/src/api/routes/wallets.ts
const patchWalletRoute = createRoute({
  method: 'patch',
  path: '/wallets/{id}',
  tags: ['Wallets'],
  summary: 'Update wallet settings',
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            monitorIncoming: z.boolean().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Wallet updated',
      content: { 'application/json': { schema: WalletPatchResponseSchema } },
    },
  },
});
```

### 3. TypeScript SDK Types for Incoming Transactions

```typescript
// Added to packages/sdk/src/types.ts
export interface IncomingTransactionItem {
  id: string;
  txHash: string;
  walletId: string;
  fromAddress: string;
  amount: string;
  tokenAddress: string | null;
  chain: string;
  network: string;
  status: string;
  blockNumber: number | null;
  detectedAt: number;
  confirmedAt: number | null;
}

export interface IncomingTransactionListResponse {
  data: IncomingTransactionItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ListIncomingTransactionsParams {
  cursor?: string;
  limit?: number;
  fromAddress?: string;
  token?: string;
  chain?: 'solana' | 'ethereum';
  status?: 'DETECTED' | 'CONFIRMED';
  since?: number;
  until?: number;
}

export interface IncomingSummaryEntry {
  date: string;
  totalCount: number;
  totalAmountNative: string;
  totalAmountUsd: number | null;
  suspiciousCount: number;
}

export interface IncomingTransactionSummaryResponse {
  period: string;
  entries: IncomingSummaryEntry[];
}
```

### 4. Python SDK Models for Incoming Transactions

```python
# Added to python-sdk/waiaas/models.py
class IncomingTransactionItem(BaseModel):
    id: str
    tx_hash: str = Field(alias="txHash")
    wallet_id: str = Field(alias="walletId")
    from_address: str = Field(alias="fromAddress")
    amount: str
    token_address: Optional[str] = Field(default=None, alias="tokenAddress")
    chain: str
    network: str
    status: str
    block_number: Optional[int] = Field(default=None, alias="blockNumber")
    detected_at: int = Field(alias="detectedAt")
    confirmed_at: Optional[int] = Field(default=None, alias="confirmedAt")
    model_config = {"populate_by_name": True}

class IncomingTransactionList(BaseModel):
    data: list[IncomingTransactionItem]
    next_cursor: Optional[str] = Field(default=None, alias="nextCursor")
    has_more: bool = Field(alias="hasMore")
    model_config = {"populate_by_name": True}

class IncomingSummaryEntry(BaseModel):
    date: str
    total_count: int = Field(alias="totalCount")
    total_amount_native: str = Field(alias="totalAmountNative")
    total_amount_usd: Optional[float] = Field(default=None, alias="totalAmountUsd")
    suspicious_count: int = Field(alias="suspiciousCount")
    model_config = {"populate_by_name": True}

class IncomingTransactionSummary(BaseModel):
    period: str
    entries: list[IncomingSummaryEntry]
    model_config = {"populate_by_name": True}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| UUID-only cursor pagination | Composite (timestamp, id) cursor | Doc 76 design | More efficient for time-ordered data, leverages DB indexes |
| SQL SUM for amounts | Application-layer BigInt summation | Doc 76 Section 7.6 | Avoids integer overflow with large wei values |
| Single wallet per session | Multi-wallet sessions | v26.4 | resolveWalletId supports wallet_id query param |

## Open Questions

1. **PATCH vs PUT for monitorIncoming**
   - What we know: Doc 76 Section 7.3 specifies `PATCH /v1/wallet/:id` (note: `/wallet/`, not `/wallets/`). However, the requirement says `PATCH /v1/wallet/:id`.
   - What's unclear: Whether to use the session-scoped path (`/v1/wallet/:id`) or admin path (`/v1/wallets/:id`). The session-scoped path doesn't take an `:id` param (wallet is inferred from session). The admin path takes `:id`.
   - Recommendation: Use `PATCH /v1/wallets/:id` with masterAuth (admin path), since monitoring is an infrastructure/admin operation. This is consistent with the requirement description "PATCH /v1/wallet/:id" being a typo for the admin path, and matches the design doc's intent of masterAuth control over monitoring configuration.

2. **Summary response field naming**
   - What we know: Doc 76 uses `data` array field name for list responses and `entries` for summary.
   - What's unclear: Whether to use `data` or `items` for the incoming list response. Existing transaction list uses `items`.
   - Recommendation: Use `data` as per doc 76 design to differentiate incoming TX responses from outbound TX responses. Alternatively use `items` for consistency. The doc 76 design is authoritative.

3. **Wallet ID parameter in MCP tools**
   - What we know: All existing MCP tools accept optional `wallet_id` for multi-wallet support.
   - What's unclear: Whether incoming TX tools should also accept `wallet_id`.
   - Recommendation: Yes, include `wallet_id` for consistency with all other tools.

4. **IncomingTxMonitorService reference in wallets route**
   - What we know: `PATCH /v1/wallets/:id` with `monitorIncoming` needs to call `syncSubscriptions()` on the monitor service.
   - What's unclear: How to pass the monitor service reference to the wallets route.
   - Recommendation: Add `incomingTxMonitorService?: IncomingTxMonitorService` to `WalletCrudRouteDeps` interface, pass it from `createApp()` dependencies. Call `syncSubscriptions()` fire-and-forget (void promise) after DB update.

## Sources

### Primary (HIGH confidence)
- `packages/daemon/src/api/routes/transactions.ts` -- cursor pagination pattern, route structure, OpenAPI schema registration
- `packages/daemon/src/api/routes/wallet.ts` -- session-scoped wallet routes pattern
- `packages/daemon/src/api/routes/wallets.ts` -- admin wallet routes pattern, CRUD dependencies
- `packages/daemon/src/api/routes/openapi-schemas.ts` -- Zod response schema pattern
- `packages/daemon/src/api/routes/sessions.ts` -- PATCH route pattern (line 177)
- `packages/daemon/src/api/server.ts` -- route mounting and auth middleware registration
- `packages/daemon/src/api/helpers/resolve-wallet-id.ts` -- wallet ID resolution helper
- `packages/sdk/src/client.ts` -- TypeScript SDK method patterns (19 methods)
- `packages/sdk/src/types.ts` -- TypeScript SDK type definitions
- `packages/sdk/src/internal/http.ts` -- HttpClient with get/post/put/delete (no patch)
- `python-sdk/waiaas/client.py` -- Python SDK method patterns
- `python-sdk/waiaas/models.py` -- Pydantic model patterns
- `packages/mcp/src/tools/list-transactions.ts` -- MCP tool registration pattern
- `packages/mcp/src/tools/get-transaction.ts` -- MCP tool with query params pattern
- `packages/mcp/src/server.ts` -- MCP server tool registration (21 tools currently)
- `packages/mcp/src/api-client.ts` -- ApiClient with get/post/put/delete (no patch)
- `packages/core/src/schemas/incoming-transaction.schema.ts` -- Zod SSoT for incoming TX
- `packages/core/src/interfaces/chain-subscriber.types.ts` -- IncomingTransaction interface (13 fields)
- `packages/core/src/enums/incoming-tx.ts` -- DETECTED/CONFIRMED status enum
- `packages/daemon/src/infrastructure/database/schema.ts` -- Drizzle schema for incomingTransactions table (13 cols, 4 indexes)
- `packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts` -- syncSubscriptions() method
- `packages/skills/skills/wallet.skill.md` -- skill file structure and content
- `internal/design/76-incoming-transaction-monitoring.md` -- Section 7 (REST API + SDK/MCP spec)

### Secondary (MEDIUM confidence)
- `packages/mcp/src/__tests__/tools.test.ts` -- MCP tool testing pattern (mock ApiClient)
- `packages/sdk/src/__tests__/client.test.ts` -- SDK testing pattern (mock fetch)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- all patterns directly copied from existing codebase, doc 76 provides exact specifications
- Pitfalls: HIGH -- identified from concrete code analysis (BigInt overflow, cursor format, auth middleware, missing PATCH methods)

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable -- internal project patterns don't change frequently)
