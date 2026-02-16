# Phase 150: Admin UI + DX - Research

**Researched:** 2026-02-16
**Domain:** Admin UI (Preact), MCP Tools, TypeScript/Python SDK, Skill Files -- WalletConnect DX integration
**Confidence:** HIGH

## Summary

Phase 150 adds WalletConnect (WC) session management across all developer-facing interfaces: a dedicated Admin UI page (or enhanced section), MCP tools, TypeScript/Python SDK methods, and updated skill files. The previous phases (146-149) built the core WC infrastructure (WcSessionService, REST API, signing bridge, Telegram fallback) and a basic WC section in the wallet detail view. Phase 150 extends this to all DX surfaces.

A critical architectural finding is that all WC REST endpoints (`/v1/wallets/:id/wc/*`) require **masterAuth** (X-Master-Password header), while MCP tools and SDK clients use **sessionAuth** (Bearer token). This means Phase 150 must either add session-scoped WC endpoints (`/v1/wallet/wc/*`) or the MCP/SDK WC operations will need to use an alternative auth mechanism. The simplest approach is to add session-scoped WC endpoints that mirror the existing masterAuth endpoints, following the same pattern as `/v1/wallet/balance` (sessionAuth) vs `/v1/wallets/:id/balance` (masterAuth).

**Primary recommendation:** Add session-scoped `/v1/wallet/wc/*` REST endpoints for MCP/SDK access, create a dedicated WC management page in Admin UI with full session lifecycle controls, add 3 MCP tools (wc_connect, wc_status, wc_disconnect), and add corresponding SDK methods in both TypeScript and Python SDKs.

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Preact | 10.x | Admin UI framework | Project standard since v1.3.2 |
| @preact/signals | latest | State management | Project standard reactive pattern |
| Vite | 6.x | Build tool | Project standard |
| @modelcontextprotocol/sdk | latest | MCP server framework | Project MCP infrastructure |
| zod | latest | Schema validation | SSoT pattern per CLAUDE.md |
| httpx | latest | Python SDK HTTP client | Project standard for Python |
| pydantic | 2.x | Python SDK models | Project standard for Python |
| vitest | latest | Test framework | Project standard |
| @testing-library/preact | latest | Admin UI testing | Project standard |

### No New Dependencies Required
Phase 150 uses only existing project dependencies. No new packages needed.

## Architecture Patterns

### Pattern 1: Admin UI Page Structure

The Admin UI uses hash-based routing defined in `layout.tsx`. Pages are registered in:
1. `NAV_ITEMS` array for sidebar navigation
2. `PAGE_TITLES` record for header display
3. `PageRouter` function for route matching

**Current pages:** dashboard, wallets, sessions, policies, notifications, telegram-users, settings (7 pages).

**Decision needed for DX-01:** Either:
- **(A) Dedicated WC page** -- Add `walletconnect.tsx` to pages, register `/walletconnect` route. Shows all wallets' WC sessions in a unified view.
- **(B) Enhanced wallet detail section** -- Phase 147 already added a WC section in `wallets.tsx` WalletDetailView (lines 572-601). Enhance it with more controls.

**Recommendation: Option A (Dedicated page)** -- A unified WC management page provides a better overview when managing multiple wallets. The existing wallet detail section can remain as a quick-access view.

**File locations:**
```
packages/admin/src/
├── pages/
│   ├── walletconnect.tsx     # NEW: Dedicated WC management page
│   └── wallets.tsx           # EXISTING: Already has WC section in detail view
├── api/
│   └── endpoints.ts          # ADD: WC endpoint constants (already has 3)
├── components/
│   └── layout.tsx            # MODIFY: Add WC to NAV_ITEMS + PageRouter
└── __tests__/
    └── walletconnect.test.tsx # NEW: Tests for WC page
```

### Pattern 2: MCP Tool Registration

Each MCP tool follows the pattern in `packages/mcp/src/tools/`:
1. Export a `registerXxx` function
2. Function takes `(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext)`
3. Uses `server.tool(name, description, zodSchema, handler)`
4. Handler calls `apiClient.get/post/put` and returns `toToolResult(result)`
5. Register function imported in `server.ts` and called in `createMcpServer`

**Critical finding:** The MCP `ApiClient` currently only has `get`, `post`, `put` methods -- **no `delete` method**. The WC disconnect endpoint uses `DELETE /v1/wallet/wc/session`. Phase 150 must add a `delete` method to `ApiClient`.

**Also critical:** MCP uses sessionAuth, but WC endpoints require masterAuth. Need new session-scoped endpoints.

```
packages/mcp/src/
├── tools/
│   ├── wc-connect.ts         # NEW: wc_connect tool
│   ├── wc-status.ts          # NEW: wc_status tool
│   └── wc-disconnect.ts      # NEW: wc_disconnect tool
├── api-client.ts             # MODIFY: Add delete() method
├── server.ts                 # MODIFY: Register 3 WC tools (15 -> 18)
└── __tests__/
    └── tools.test.ts          # MODIFY: Add WC tool tests
```

### Pattern 3: TypeScript SDK Method Pattern

SDK methods in `packages/sdk/src/client.ts` follow:
1. Define method on `WAIaaSClient` class
2. Use `withRetry(() => this.http.verb<ResponseType>(path, headers), this.retryOptions)`
3. Types defined in `types.ts` (standalone, no core dependency)
4. Exported from `index.ts`

**Note:** The SDK `HttpClient` (in `internal/http.ts`) already has a `delete` method (line 100-102). The `WAIaaSClient` class just needs to add public methods that call `this.http.delete()`.

```
packages/sdk/src/
├── client.ts                 # MODIFY: Add wcConnect, wcStatus, wcDisconnect
├── types.ts                  # MODIFY: Add WC response types
├── index.ts                  # MODIFY: Export new types
└── __tests__/
    └── client.test.ts         # MODIFY: Add WC method tests
```

### Pattern 4: Python SDK Method Pattern

Python SDK methods in `python-sdk/waiaas/client.py` follow:
1. Define async method on `WAIaaSClient` class
2. Use `await self._request("METHOD", path)` with optional `json_body`/`params`
3. Return `Model.model_validate(resp.json())`
4. Models defined in `models.py` using Pydantic v2 with `Field(alias=...)` for camelCase
5. Exported from `__init__.py`

**Note:** Python SDK `_request` method is generic and passes method string to `self._client.request()`, so `"DELETE"` works without changes to the internal plumbing.

```
python-sdk/waiaas/
├── client.py                 # MODIFY: Add wc_connect, wc_status, wc_disconnect
├── models.py                 # MODIFY: Add WC response models
├── __init__.py               # MODIFY: Export new models
└── tests/
    └── test_client.py         # MODIFY: Add WC method tests
```

### Pattern 5: Skill Files

Skill files in `skills/` are markdown files with YAML frontmatter. They document API endpoints with curl examples, MCP tool references, and SDK method examples.

WC-related content should go in `wallet.skill.md` (wallet management context) or a new `walletconnect.skill.md`.

**Recommendation:** Add WC section to `wallet.skill.md` since WC is a wallet-level feature (each session is per-wallet). Keep it consolidated rather than creating a separate skill file.

### Pattern 6: Session-Scoped vs Admin-Scoped REST Endpoints

The project has a clear pattern of dual endpoints:
- **Admin (masterAuth):** `/v1/wallets/:id/*` -- uses `X-Master-Password` header, wallet ID in path
- **Session (sessionAuth):** `/v1/wallet/*` -- uses `Bearer` token, wallet ID extracted from JWT

**Existing dual-endpoint examples:**
| Admin Endpoint | Session Endpoint |
|----------------|------------------|
| `GET /v1/wallets/:id` | `GET /v1/wallet/address` |
| `PUT /v1/wallets/:id/default-network` | `PUT /v1/wallet/default-network` |

**WC endpoints needed:**
| Admin (exists) | Session (NEW) |
|----------------|---------------|
| `POST /v1/wallets/:id/wc/pair` | `POST /v1/wallet/wc/pair` |
| `GET /v1/wallets/:id/wc/session` | `GET /v1/wallet/wc/session` |
| `DELETE /v1/wallets/:id/wc/session` | `DELETE /v1/wallet/wc/session` |
| `GET /v1/wallets/:id/wc/pair/status` | `GET /v1/wallet/wc/pair/status` |

### Anti-Patterns to Avoid
- **Duplicating WC section across wallet detail AND dedicated page without sharing logic:** Extract shared data-fetching hooks or utility functions.
- **Adding MCP tools that call masterAuth endpoints:** MCP uses sessionAuth. Must use session-scoped endpoints.
- **Not adding `delete` method to MCP ApiClient:** Will cause runtime errors when trying to disconnect WC sessions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| QR code generation | Client-side QR rendering | Existing server-side QR generation via `/wc/pair` endpoint | Server already returns base64 data URL in `qrCode` field |
| WC pairing status polling | Custom WebSocket | Existing setInterval polling pattern from wallets.tsx | Already battle-tested in Phase 147, 3-second interval is appropriate |
| MCP tool result formatting | Custom JSON formatting | `toToolResult()` from api-client.ts | Standard error handling with isError flag |

## Common Pitfalls

### Pitfall 1: MCP ApiClient Missing DELETE Method
**What goes wrong:** WC disconnect tool cannot call `DELETE /v1/wallet/wc/session`.
**Why it happens:** The `ApiClient` class was designed around GET/POST/PUT verbs only. No prior tool needed DELETE.
**How to avoid:** Add `async delete<T>(path: string): Promise<ApiResult<T>>` to ApiClient before implementing WC tools.
**Warning signs:** TypeScript compilation error when trying to call `apiClient.delete()`.

### Pitfall 2: Auth Mismatch Between MCP/SDK and WC REST Endpoints
**What goes wrong:** MCP tools and SDK methods fail with 401 because WC endpoints require masterAuth but MCP/SDK use sessionAuth.
**Why it happens:** Phase 147 only created admin-scoped WC endpoints.
**How to avoid:** Add session-scoped `/v1/wallet/wc/*` endpoints in the daemon routes. Wire them through sessionAuth middleware. Reuse the same WcSessionService methods.
**Warning signs:** 401 errors in MCP tool tests.

### Pitfall 3: Admin UI Navigation Not Updated
**What goes wrong:** New WC page exists but is inaccessible from the sidebar.
**Why it happens:** Forgetting to update `NAV_ITEMS`, `PAGE_TITLES`, and `PageRouter` in `layout.tsx`.
**How to avoid:** Always update all three arrays/functions together when adding a page.
**Warning signs:** Page only accessible by manually typing hash URL.

### Pitfall 4: Python SDK Missing Model Exports
**What goes wrong:** Python SDK users can't import WC types.
**Why it happens:** New models added to `models.py` but not exported from `__init__.py`.
**How to avoid:** Always update `__init__.py` and `__all__` list when adding new models.
**Warning signs:** `ImportError` in user code.

### Pitfall 5: Skill File Version Not Updated
**What goes wrong:** Skill file still shows old version, AI agents may not discover WC features.
**Why it happens:** Skill file frontmatter `version` field not bumped.
**How to avoid:** Update version in YAML frontmatter and add WC section to skill content.

### Pitfall 6: WC Connect MCP Tool Returns QR Code Base64 String
**What goes wrong:** MCP tool returns a large base64-encoded QR image that Claude can't use.
**Why it happens:** The server returns a `qrCode` field as a base64 data URL for rendering in HTML.
**How to avoid:** The MCP tool should return the WC URI string instead of (or in addition to) the QR code. The AI agent can share the URI with the user, who can paste it into their wallet app.
**Warning signs:** Overly large tool response that Claude can't interpret visually.

## Code Examples

### Admin UI: New Page Registration (layout.tsx pattern)

```typescript
// Source: packages/admin/src/components/layout.tsx (existing pattern)
import WalletConnectPage from '../pages/walletconnect';

const PAGE_TITLES: Record<string, string> = {
  // ... existing
  '/walletconnect': 'WalletConnect',
};

const NAV_ITEMS = [
  // ... existing
  { path: '/walletconnect', label: 'WalletConnect' },
];

function PageRouter() {
  const path = currentPath.value;
  // ... existing
  if (path === '/walletconnect') return <WalletConnectPage />;
  // ...
}
```

### MCP Tool: WC Status (tool registration pattern)

```typescript
// Source: follows packages/mcp/src/tools/get-balance.ts pattern
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerWcStatus(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'wc_status',
    withWalletPrefix(
      'Get WalletConnect session status for this wallet.',
      walletContext?.walletName,
    ),
    {},
    async () => {
      const result = await apiClient.get('/v1/wallet/wc/session');
      return toToolResult(result);
    },
  );
}
```

### MCP ApiClient: Adding DELETE Method

```typescript
// Source: packages/mcp/src/api-client.ts (add alongside existing get/post/put)
async delete<T>(path: string): Promise<ApiResult<T>> {
  return this.request<T>('DELETE', path);
}
```

### TypeScript SDK: WC Methods

```typescript
// Source: follows packages/sdk/src/client.ts pattern
// Note: HttpClient.delete() already exists in internal/http.ts (line 100-102)

async wcConnect(): Promise<WcPairingResponse> {
  return withRetry(
    () => this.http.post<WcPairingResponse>('/v1/wallet/wc/pair', {}, this.authHeaders()),
    this.retryOptions,
  );
}

async wcStatus(): Promise<WcSessionResponse> {
  return withRetry(
    () => this.http.get<WcSessionResponse>('/v1/wallet/wc/session', this.authHeaders()),
    this.retryOptions,
  );
}

async wcDisconnect(): Promise<WcDisconnectResponse> {
  return withRetry(
    () => this.http.delete<WcDisconnectResponse>('/v1/wallet/wc/session', this.authHeaders()),
    this.retryOptions,
  );
}
```

### Python SDK: WC Methods

```python
# Source: follows python-sdk/waiaas/client.py pattern
async def wc_connect(self) -> WcPairingResponse:
    """POST /v1/wallet/wc/pair -- Start WalletConnect pairing."""
    resp = await self._request("POST", "/v1/wallet/wc/pair")
    return WcPairingResponse.model_validate(resp.json())

async def wc_status(self) -> WcSessionResponse:
    """GET /v1/wallet/wc/session -- Get WalletConnect session status."""
    resp = await self._request("GET", "/v1/wallet/wc/session")
    return WcSessionResponse.model_validate(resp.json())

async def wc_disconnect(self) -> WcDisconnectResponse:
    """DELETE /v1/wallet/wc/session -- Disconnect WalletConnect session."""
    resp = await self._request("DELETE", "/v1/wallet/wc/session")
    return WcDisconnectResponse.model_validate(resp.json())
```

### Session-Scoped WC Routes (daemon pattern)

```typescript
// Source: follows packages/daemon/src/api/routes/wc.ts pattern
// New file or extension for session-scoped routes

// SessionAuth middleware extracts walletId from JWT:
// c.get('walletId') -> wallet UUID

router.openapi(wcPairSessionRoute, async (c) => {
  const walletId = c.get('walletId'); // from sessionAuth JWT
  const wallet = getWallet(db, walletId);
  const network = wallet.default_network ?? wallet.environment;
  const result = await wcSessionService.createPairing(walletId, network, wallet.chain);
  return c.json({ uri: result.uri, qrCode: result.qrDataUrl, expiresAt: result.expiresAt }, 200);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WC in wallet detail only | Dedicated WC page + wallet detail section | Phase 150 | Better multi-wallet WC management |
| masterAuth-only WC endpoints | Session-scoped + masterAuth endpoints | Phase 150 | Enables MCP/SDK WC access |
| 15 MCP tools | 18 MCP tools (+ 3 WC tools) | Phase 150 | AI agents can manage WC sessions |

## Existing WC Features (from Phases 146-149)

### Already Implemented
| Feature | Location | Phase |
|---------|----------|-------|
| WcSessionService (SignClient lifecycle) | `daemon/src/services/wc-session-service.ts` | 146 |
| WcSigningBridge (approval request forwarding) | `daemon/src/services/wc-signing-bridge.ts` | 148 |
| wc_sessions DB table (v16) | `daemon/src/infrastructure/database/migrate.ts` | 146 |
| REST API (4 endpoints, masterAuth) | `daemon/src/api/routes/wc.ts` | 147 |
| Admin UI WC section in wallet detail | `admin/src/pages/wallets.tsx` (lines 572-692) | 147 |
| QR code modal with 3s polling | `admin/src/pages/wallets.tsx` | 147 |
| CLI owner connect/disconnect/status | `cli/src/commands/owner.ts` | 147 |
| Telegram fallback for WC | `daemon/src/notifications/notification-service.ts` | 149 |
| Admin endpoints.ts WC constants | `admin/src/api/endpoints.ts` (lines 29-31) | 147 |

### What Phase 150 Adds
| Feature | Location | Requirement |
|---------|----------|-------------|
| Dedicated WC management page | `admin/src/pages/walletconnect.tsx` | DX-01 |
| Session-scoped WC REST endpoints | `daemon/src/api/routes/wc.ts` or new file | Prerequisite for DX-02/03 |
| 3 MCP tools (wc_connect/status/disconnect) | `mcp/src/tools/wc-*.ts` | DX-02 |
| ApiClient.delete() method | `mcp/src/api-client.ts` | Prerequisite for DX-02 |
| TypeScript SDK WC methods (3 new) | `sdk/src/client.ts` | DX-03 |
| TypeScript SDK WC types | `sdk/src/types.ts` | DX-03 |
| Python SDK WC methods (3 new) | `python-sdk/waiaas/client.py` | DX-03 |
| Python SDK WC models | `python-sdk/waiaas/models.py` | DX-03 |
| Skill file WC section | `skills/wallet.skill.md` | DX-04 |

**Note:** SDK `HttpClient.delete()` already exists (`packages/sdk/src/internal/http.ts` line 100-102). Python SDK `_request()` is generic and supports any HTTP method. No internal HTTP plumbing changes needed for either SDK.

## Open Questions

1. **Dedicated WC page vs enhanced wallet detail section**
   - What we know: Phase 147 already added a WC section in wallet detail view with full QR modal + connect/disconnect functionality. DX-01 requires "WC 세션 관리 페이지."
   - What's unclear: Whether DX-01 means a separate top-level page or just improving the existing section.
   - Recommendation: Create a dedicated page (`/walletconnect`) that shows ALL wallets' WC sessions in a unified table view, with connect/disconnect actions. Keep the existing wallet detail WC section as-is for quick access.

2. **Session-scoped WC endpoints for MCP/SDK**
   - What we know: WC REST endpoints require masterAuth. MCP/SDK use sessionAuth.
   - What's unclear: Whether to add new session-scoped endpoints or modify auth requirements.
   - Recommendation: Add session-scoped `/v1/wallet/wc/*` endpoints mirroring the existing admin ones. This follows the established `wallet` (session) vs `wallets/:id` (admin) pattern.

## Sources

### Primary (HIGH confidence)
- `packages/admin/src/components/layout.tsx` -- Routing pattern, NAV_ITEMS, PageRouter
- `packages/admin/src/pages/wallets.tsx` -- Existing WC section (lines 67-88 interfaces, 195-201 signals, 306-368 handlers, 572-692 JSX)
- `packages/admin/src/api/endpoints.ts` -- Existing WC endpoint constants (lines 29-31)
- `packages/admin/src/api/client.ts` -- apiGet/apiPost/apiPut/apiDelete helpers
- `packages/mcp/src/server.ts` -- MCP tool registration pattern (15 tools currently)
- `packages/mcp/src/api-client.ts` -- ApiClient class (only get/post/put, no delete)
- `packages/mcp/src/tools/x402-fetch.ts` -- Latest tool registration pattern
- `packages/sdk/src/client.ts` -- TypeScript SDK method pattern (14 methods)
- `packages/sdk/src/types.ts` -- TypeScript SDK type definitions
- `packages/sdk/src/internal/http.ts` -- HttpClient has delete() method (line 100-102)
- `python-sdk/waiaas/client.py` -- Python SDK method pattern (generic _request supports any HTTP verb)
- `python-sdk/waiaas/models.py` -- Python SDK Pydantic models
- `packages/daemon/src/api/routes/wc.ts` -- WC REST routes (masterAuth, 4 endpoints)
- `packages/daemon/src/api/server.ts` -- Auth middleware wiring (line 182: masterAuth for WC)
- `packages/daemon/src/services/wc-session-service.ts` -- WcSessionService interface + types
- `skills/wallet.skill.md` -- Skill file format and content
- `.planning/phases/147-qr-pairing/147-02-SUMMARY.md` -- Phase 147 deliverables

### Secondary (MEDIUM confidence)
- `objectives/v1.6.1-walletconnect-owner-approval.md` -- WC milestone objectives and architecture
- `packages/admin/src/__tests__/wallets.test.tsx` -- Admin UI test patterns
- `packages/mcp/src/__tests__/tools.test.ts` -- MCP tool test patterns
- `python-sdk/tests/test_client.py` -- Python SDK test patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All dependencies already in project, no new packages needed
- Architecture: HIGH -- All patterns verified by reading actual source files
- Pitfalls: HIGH -- Auth mismatch and missing MCP ApiClient.delete() confirmed by source inspection
- WC endpoint pattern: HIGH -- Dual admin/session endpoint pattern well-established in codebase

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable patterns, unlikely to change)
