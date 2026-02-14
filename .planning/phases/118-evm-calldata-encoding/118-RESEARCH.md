# Phase 118: EVM Calldata Encoding - Research

**Researched:** 2026-02-14
**Domain:** EVM ABI encoding utility endpoint + SDK/MCP integration
**Confidence:** HIGH

## Summary

Phase 118 adds a stateless utility endpoint `POST /v1/utils/encode-calldata` that wraps viem's `encodeFunctionData()`. AI agents send ABI + function name + arguments and receive hex-encoded calldata. This eliminates the need for agents to handle ABI encoding themselves before calling `call_contract`.

The implementation is straightforward because: (1) viem `^2.21.0` is already a direct dependency of `@waiaas/daemon`, (2) `encodeFunctionData` is already used in 4 places in `packages/adapters/evm/src/adapter.ts`, and (3) the endpoint is purely stateless with no DB, keystore, or chain adapter dependencies. The endpoint needs sessionAuth (consistent with other wallet API endpoints), a new `ABI_ENCODING_FAILED` error code in `@waiaas/core`, and integration across TS SDK, Python SDK, and MCP.

**Primary recommendation:** Create a new `api/routes/utils.ts` route file in the daemon, add `ABI_ENCODING_FAILED` to error codes, then add `encodeCalldata()` to both SDKs and `encode_calldata` MCP tool -- all calling the same REST endpoint.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| viem | ^2.21.0 | `encodeFunctionData()` for ABI encoding | Already imported in daemon + adapter-evm. Industry standard EVM library. |
| @hono/zod-openapi | (workspace) | OpenAPIHono route definition with Zod schemas | All 44 existing routes use this pattern. |
| zod | (workspace) | Request/response validation schemas | SSoT principle: Zod -> TypeScript -> OpenAPI. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| httpx | (python-sdk) | Python SDK HTTP client | Python SDK `encode_calldata()` method. |
| pydantic | v2 (python-sdk) | Python SDK request/response models | Python SDK `EncodeCalldataRequest/Response` models. |
| @modelcontextprotocol/sdk | (workspace) | MCP tool registration | `encode_calldata` MCP tool. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| viem `encodeFunctionData` | ethers.js `Interface.encodeFunctionData` | viem already a dependency; no reason to add ethers |
| Daemon-side encoding | Client-side encoding | Centralized = consistent, auditable, agents don't need ABI libraries |

**Installation:**
```bash
# No new dependencies needed -- viem is already in daemon's package.json
```

## Architecture Patterns

### Recommended Project Structure
```
packages/daemon/src/api/routes/
  utils.ts              # NEW: encode-calldata route
  openapi-schemas.ts    # ADD: EncodeCalldataRequest/Response schemas
  index.ts              # ADD: utilsRoutes export

packages/core/src/errors/
  error-codes.ts        # ADD: ABI_ENCODING_FAILED error code

packages/daemon/src/api/
  server.ts             # ADD: utils route registration (sessionAuth)
  error-hints.ts        # ADD: hint for ABI_ENCODING_FAILED

packages/sdk/src/
  client.ts             # ADD: encodeCalldata() method
  types.ts              # ADD: EncodeCalldataParams/Response types

packages/mcp/src/
  tools/encode-calldata.ts  # NEW: encode_calldata tool
  server.ts                 # ADD: registerEncodeCalldata import + call

python-sdk/waiaas/
  client.py             # ADD: encode_calldata() method
  models.py             # ADD: EncodeCalldataRequest/Response models

skills/
  transactions.skill.md # ADD: encode-calldata section
```

### Pattern 1: Stateless Utility Route (like nonce)
**What:** A route that doesn't depend on DB, keystore, or adapter pool -- just validates input and returns computed output.
**When to use:** For pure computation endpoints like calldata encoding.
**Example:**
```typescript
// Source: packages/daemon/src/api/routes/nonce.ts (existing pattern)
export function utilsRoutes(): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  router.openapi(encodeCalldataRoute, async (c) => {
    const { abi, functionName, args } = c.req.valid('json');
    try {
      const calldata = encodeFunctionData({ abi, functionName, args });
      const selector = calldata.slice(0, 10); // first 4 bytes = function selector
      return c.json({ calldata, selector, functionName }, 200);
    } catch (err) {
      throw new WAIaaSError('ABI_ENCODING_FAILED', {
        message: err instanceof Error ? err.message : 'ABI encoding failed',
      });
    }
  });

  return router;
}
```

### Pattern 2: OpenAPIHono Route Definition (existing project standard)
**What:** Routes use `createRoute()` with Zod schemas for automatic OpenAPI spec generation and request validation.
**When to use:** All routes in the daemon.
**Example:**
```typescript
// Source: packages/daemon/src/api/routes/tokens.ts (existing pattern)
const encodeCalldataRoute = createRoute({
  method: 'post',
  path: '/utils/encode-calldata',
  tags: ['Utils'],
  summary: 'Encode EVM function call into calldata hex',
  request: {
    body: {
      content: {
        'application/json': { schema: EncodeCalldataRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Encoded calldata',
      content: { 'application/json': { schema: EncodeCalldataResponseSchema } },
    },
    ...buildErrorResponses(['ABI_ENCODING_FAILED', 'ACTION_VALIDATION_FAILED']),
  },
});
```

### Pattern 3: MCP Tool Registration (existing project standard)
**What:** Each MCP tool is a separate file that exports a `registerXxx` function accepting `McpServer`, `ApiClient`, and optional `WalletContext`.
**When to use:** All MCP tools.
**Example:**
```typescript
// Source: packages/mcp/src/tools/call-contract.ts (existing pattern)
export function registerEncodeCalldata(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'encode_calldata',
    withWalletPrefix('Encode EVM function call into hex calldata...', walletContext?.walletName),
    {
      abi: z.array(z.record(z.unknown())).describe('ABI fragment (JSON array)'),
      functionName: z.string().describe('Function name to encode'),
      args: z.array(z.unknown()).describe('Function arguments'),
    },
    async (args) => {
      const result = await apiClient.post('/v1/utils/encode-calldata', {
        abi: args.abi,
        functionName: args.functionName,
        args: args.args,
      });
      return toToolResult(result);
    },
  );
}
```

### Pattern 4: SDK Method (existing project standard)
**What:** SDK methods call the HTTP client with typed parameters and return typed responses.
**When to use:** Every SDK method.
**Example:**
```typescript
// Source: packages/sdk/src/client.ts (existing pattern)
async encodeCalldata(params: EncodeCalldataParams): Promise<EncodeCalldataResponse> {
  return withRetry(
    () => this.http.post<EncodeCalldataResponse>(
      '/v1/utils/encode-calldata',
      params,
      this.authHeaders(),
    ),
    this.retryOptions,
  );
}
```

### Pattern 5: Python SDK Method (existing project standard)
**What:** Async methods using httpx, returning Pydantic models.
**When to use:** Every Python SDK method.
**Example:**
```python
# Source: python-sdk/waiaas/client.py (existing pattern)
async def encode_calldata(
    self,
    abi: list[dict[str, Any]],
    function_name: str,
    args: list[Any],
) -> EncodeCalldataResponse:
    """POST /v1/utils/encode-calldata -- Encode EVM function call."""
    request = EncodeCalldataRequest(abi=abi, function_name=function_name, args=args)
    body = request.model_dump(exclude_none=True, by_alias=True)
    resp = await self._request("POST", "/v1/utils/encode-calldata", json_body=body)
    return EncodeCalldataResponse.model_validate(resp.json())
```

### Anti-Patterns to Avoid
- **Routing through adapter-evm:** The daemon already has viem as a direct dependency. Don't import from `@waiaas/adapter-evm` -- import `encodeFunctionData` directly from `viem`.
- **Making the endpoint public (no auth):** Even though encoding is stateless, it should require sessionAuth for consistency and to prevent abuse. The research docs specify sessionAuth.
- **Adding DB or adapter pool dependencies:** This is a pure computation endpoint. No `deps.db`, `deps.adapterPool`, etc. should be required.
- **Passing ABI as a string:** ABI must be a JSON array of objects (matching viem's `Abi` type). Don't accept string or single-object.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ABI encoding | Custom hex encoder | `viem.encodeFunctionData()` | ABI encoding is complex (type packing, dynamic types, tuples). viem handles all edge cases. |
| Function selector extraction | Manual keccak256 | `calldata.slice(0, 10)` | The first 10 hex chars (0x + 4 bytes) of encodeFunctionData output IS the selector. No separate computation needed. |
| ABI type validation | Custom ABI parser | Let viem throw on invalid ABI | viem validates ABI structure, function existence, and argument types. Catch its errors and map to ABI_ENCODING_FAILED. |

**Key insight:** viem's `encodeFunctionData` does all the heavy lifting. The entire implementation is: validate input schema -> call viem -> extract selector from output -> return. Error handling is the only non-trivial part.

## Common Pitfalls

### Pitfall 1: ABI Function Overloads
**What goes wrong:** When an ABI has multiple functions with the same name but different parameters (overloads), viem may pick the wrong one or throw an ambiguous error.
**Why it happens:** Solidity supports function overloading. `encodeFunctionData({ abi, functionName: 'transfer' })` is ambiguous if two `transfer` functions exist.
**How to avoid:** viem resolves overloads via argument matching. Document that the caller should provide the specific ABI fragment for the desired overload, not the full contract ABI.
**Warning signs:** "ABI function not found" or "multiple matching functions" errors from viem.

### Pitfall 2: Type Coercion for BigInt Arguments
**What goes wrong:** AI agents send `"1000000"` (string) instead of `1000000` (number) or `1000000n` (bigint) for uint256 arguments. JSON doesn't support bigint.
**Why it happens:** JSON serialization loses bigint precision. Agents naturally use strings for large numbers.
**How to avoid:** viem `encodeFunctionData` handles string-to-bigint coercion for uint types automatically. Document that string numeric values are acceptable for uint/int types.
**Warning signs:** Type mismatch errors from viem when passing strings where numbers are expected.

### Pitfall 3: Missing Error Code Registration
**What goes wrong:** ABI_ENCODING_FAILED error code is not in ERROR_CODES, so WAIaaSError constructor throws at runtime.
**Why it happens:** Error codes must be added to `packages/core/src/errors/error-codes.ts` before the daemon can use them.
**How to avoid:** Add the error code in Plan 118-01 BEFORE implementing the route handler.
**Warning signs:** TypeScript compilation error: argument not assignable to ErrorCode type.

### Pitfall 4: Auth Middleware Registration for New Route Path
**What goes wrong:** The new `/v1/utils/*` path doesn't have sessionAuth registered, so requests reach the handler without authentication.
**Why it happens:** Auth middleware is registered per-path in `server.ts`, not globally. New paths must be explicitly added.
**How to avoid:** Add `app.use('/v1/utils/*', sessionAuth)` in `server.ts` alongside the existing sessionAuth registrations.
**Warning signs:** Requests succeed without Authorization header.

### Pitfall 5: OpenAPI Schema for `args` Array
**What goes wrong:** Zod schema `z.array(z.unknown())` doesn't provide useful OpenAPI documentation for the `args` field, and may reject valid inputs.
**Why it happens:** Function arguments are polymorphic -- they can be strings, numbers, addresses, tuples, etc. depending on the ABI.
**How to avoid:** Use `z.array(z.any())` or `z.array(z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown())]))` to allow common types. Let viem's internal validation handle type-specific checks.
**Warning signs:** 400 validation errors on valid function arguments.

## Code Examples

Verified patterns from the codebase:

### viem encodeFunctionData (already used in adapter-evm)
```typescript
// Source: packages/adapters/evm/src/adapter.ts lines 499-503
const transferData = encodeFunctionData({
  abi: ERC20_ABI,
  functionName: 'transfer',
  args: [toAddr, request.amount],
});
```

### viem encodeFunctionData Error Behavior
```typescript
// viem throws AbiFunctionNotFoundError when function name doesn't exist in ABI
// viem throws AbiEncodingArrayLengthMismatchError when arg count doesn't match
// viem throws AbiEncodingBytesSizeMismatchError for bytes type issues
// All extend BaseError from viem
import { encodeFunctionData, type Abi } from 'viem';

try {
  const calldata = encodeFunctionData({
    abi: abi as Abi,
    functionName,
    args,
  });
} catch (err) {
  // err.message contains descriptive text like:
  // "Function "nonexistent" not found on ABI"
  // "ABI encoding params/values length mismatch"
  throw new WAIaaSError('ABI_ENCODING_FAILED', {
    message: err instanceof Error ? err.message : 'ABI encoding failed',
  });
}
```

### New Error Code Registration Pattern
```typescript
// Source: packages/core/src/errors/error-codes.ts (existing pattern)
ABI_ENCODING_FAILED: {
  code: 'ABI_ENCODING_FAILED',
  domain: 'TX',
  httpStatus: 400,
  retryable: false,
  message: 'ABI encoding failed',
},
```

### Route Registration in server.ts Pattern
```typescript
// Source: packages/daemon/src/api/server.ts (existing pattern for stateless routes)
// Register nonce route (public, no auth required)
app.route('/v1', nonceRoutes());

// For utils route (requires sessionAuth):
if (deps.jwtSecretManager && deps.db) {
  const sessionAuth = createSessionAuth({ jwtSecretManager: deps.jwtSecretManager, db: deps.db });
  app.use('/v1/utils/*', sessionAuth);
}
app.route('/v1', utilsRoutes());
```

### SDK Method Pattern
```typescript
// Source: packages/sdk/src/client.ts (existing pattern for POST methods)
async encodeCalldata(params: EncodeCalldataParams): Promise<EncodeCalldataResponse> {
  return withRetry(
    () => this.http.post<EncodeCalldataResponse>(
      '/v1/utils/encode-calldata',
      params,
      this.authHeaders(),
    ),
    this.retryOptions,
  );
}
```

### MCP Tool Pattern
```typescript
// Source: packages/mcp/src/tools/call-contract.ts (existing pattern)
export function registerEncodeCalldata(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'encode_calldata',
    withWalletPrefix('Encode EVM function call into calldata hex. Provide ABI fragment, function name, and arguments. Returns hex calldata for use with call_contract.', walletContext?.walletName),
    {
      abi: z.array(z.record(z.unknown())).describe('ABI fragment array for the function'),
      functionName: z.string().describe('Function name to encode (e.g., "transfer")'),
      args: z.array(z.any()).describe('Function arguments (e.g., ["0xAddress", "1000000"])'),
    },
    async (args) => {
      const result = await apiClient.post('/v1/utils/encode-calldata', {
        abi: args.abi,
        functionName: args.functionName,
        args: args.args,
      });
      return toToolResult(result);
    },
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ethers.js Interface.encodeFunctionData | viem encodeFunctionData | viem 1.0+ (2023) | viem is already the project standard |
| Manual ABI encoding | Library-based encoding | Always | Never hand-roll ABI encoding |

**Deprecated/outdated:**
- ethers.js v5 `Interface.encodeFunctionData()`: Still works but project uses viem. No reason to add ethers dependency.

## Open Questions

1. **Auth: sessionAuth vs public?**
   - What we know: Research docs (ARCHITECTURE.md, FEATURES.md, STACK.md) all specify sessionAuth.
   - What's clear: The endpoint IS stateless and could theoretically be public, but sessionAuth is consistent with other API endpoints and prevents abuse.
   - Recommendation: Use sessionAuth as documented. The MCP tool handles auth transparently via its ApiClient.

2. **Response should include `functionName`?**
   - What we know: FEATURES.md response includes `functionName`, ARCHITECTURE.md does not. STACK.md includes it.
   - Recommendation: Include `functionName` in the response for AI agent usability (confirms which function was encoded).

3. **Should decode-calldata also be included?**
   - What we know: ARCHITECTURE.md mentions `POST /v1/utils/decode-calldata` as complementary. Phase 118 requirements (ENCODE-01 through ENCODE-05) only mention encoding.
   - Recommendation: Out of scope for Phase 118. Only encoding is in requirements. Decoding can be added later.

## Sources

### Primary (HIGH confidence)
- `packages/adapters/evm/src/adapter.ts` -- 4 uses of `encodeFunctionData` with viem, lines 24, 449, 499, 696
- `packages/daemon/package.json` -- `viem: "^2.21.0"` direct dependency confirmed
- `packages/daemon/src/api/routes/tokens.ts` -- Reference route pattern (OpenAPIHono + createRoute + Zod schemas)
- `packages/daemon/src/api/routes/nonce.ts` -- Stateless route pattern (no DB/adapter dependencies)
- `packages/daemon/src/api/server.ts` -- Route registration + auth middleware pattern (380 lines)
- `packages/core/src/errors/error-codes.ts` -- 69 existing error codes, ErrorCodeEntry interface
- `packages/sdk/src/client.ts` -- 10 SDK methods with typed params/responses
- `packages/mcp/src/tools/call-contract.ts` -- MCP tool pattern with ApiClient
- `python-sdk/waiaas/client.py` -- Python SDK async client pattern

### Secondary (HIGH confidence -- project research docs)
- `.planning/research/ARCHITECTURE.md` section 4.1-4.7 -- Encoding endpoint architecture design
- `.planning/research/FEATURES.md` DF-02 -- Feature specification with request/response examples
- `.planning/research/STACK.md` encode-calldata section -- Implementation code samples
- `.planning/REQUIREMENTS.md` ENCODE-01 through ENCODE-05 -- Requirements specification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - viem is already used, no new dependencies needed
- Architecture: HIGH - All patterns directly follow existing codebase patterns (routes, SDK, MCP, error codes)
- Pitfalls: HIGH - Identified from existing codebase patterns and viem's error behavior

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable -- viem API is mature, project patterns are established)
