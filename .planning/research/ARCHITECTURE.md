# Architecture Patterns: ERC-8128 Signed HTTP Requests Integration

**Domain:** HTTP message signing for AI agent authentication (ERC-8128 + RFC 9421)
**Researched:** 2026-03-05
**Overall confidence:** HIGH (existing codebase patterns well-established, design decisions documented in m30-10 objective)

---

## Recommended Architecture

ERC-8128 integrates as a **dedicated route module** following the established x402 pattern, not through the 6-stage transaction pipeline. This is the correct architectural choice because ERC-8128 produces HTTP signature headers (not on-chain transactions), making the pipeline's parse-validate-policy-approve-execute-record stages inapplicable.

### Architecture Decision: Dedicated Route (x402 Pattern)

**Decision:** Use dedicated `POST /v1/erc8128/sign` and `POST /v1/erc8128/verify` routes, bypassing the 6-stage pipeline entirely.

**Why NOT the SIGN pipeline:**

| Concern | SIGN Pipeline | Dedicated Route (Chosen) |
|---------|---------------|--------------------------|
| Data flow | `signMessage(arbitrary_bytes)` -- single call | Multi-step: Content-Digest -> Signature-Input -> Signature Base -> signMessage -> header assembly |
| Policy type | Uses Stage 3 `DatabasePolicyEngine.evaluate()` | Domain policy (like X402_ALLOWED_DOMAINS), evaluated in route handler |
| Transaction record | Creates DB record in `transactions` table | No DB record needed (stateless signing, no financial risk) |
| Pipeline context | Requires `PipelineContext` with chain/network/amount fields | Needs HTTP request context (method, url, headers, body) |
| Covered Components | N/A | RFC 9421 specific: must build Signature-Input from covered components |

**Precedent:** x402 also uses a dedicated route (`POST /v1/x402/fetch`) with domain policy evaluation in the route handler, not in `DatabasePolicyEngine.evaluate()`. This is the WAIaaS pattern for domain-scoped features.

### Component Boundaries

| Component | Location | Responsibility | Communicates With |
|-----------|----------|---------------|-------------------|
| **Signing Engine** | `packages/core/src/erc8128/` | RFC 9421 signature construction, Content-Digest, Signature-Input building, EIP-191 signing, keyid management | Consumed by daemon route handler |
| **Route Handler** | `packages/daemon/src/api/routes/erc8128.ts` | Request validation, feature gate check, EVM chain verification, domain policy evaluation, orchestration | Calls signing engine + policy evaluator + SettingsService |
| **Domain Policy** | `packages/daemon/src/services/erc8128/erc8128-domain-policy.ts` | `ERC8128_ALLOWED_DOMAINS` evaluation (default-deny, wildcard, rate limit) | Called by route handler |
| **Policy Type** | `packages/core/src/enums/policy.ts` | `ERC8128_ALLOWED_DOMAINS` enum value (19th policy type) | Referenced by domain policy evaluator |
| **Admin Settings** | `packages/daemon/src/infrastructure/settings/setting-keys.ts` | 5 setting keys (`erc8128.*`) | Read by route handler, managed by SettingsService |
| **MCP Tools** | `packages/mcp/src/tools/erc8128-sign.ts`, `erc8128-verify.ts` | MCP tool wrappers calling REST API | Calls `POST /v1/erc8128/sign` via ApiClient |
| **SDK Methods** | `packages/sdk/src/client.ts` | `signHttpRequest()`, `verifyHttpSignature()`, `fetchWithErc8128()` | Calls REST API |
| **Notification Events** | `packages/core/src/enums/notification.ts` | 2 new event types | Emitted by route handler |
| **connect-info** | `packages/daemon/src/api/routes/connect-info.ts` | `capabilities.erc8128Support` | Reads `erc8128.enabled` from SettingsService |

### Data Flow

```
Agent -> POST /v1/erc8128/sign (sessionAuth)
         |
         v
    [1] Feature gate: SettingsService.get('erc8128.enabled') === 'true'
         |
         v
    [2] Wallet lookup + EVM chain verification (ERC-8128 is Ethereum-only)
         |
         v
    [3] Domain policy: load ERC8128_ALLOWED_DOMAINS from policies table
        -> evaluateErc8128Domain(policies, targetDomain, settingsService)
        -> default-deny if no policy configured
        -> wildcard matching (*.example.com)
        -> rate limit check (in-memory counter)
         |
         v
    [4] Signing engine (packages/core/src/erc8128/):
        a. Content-Digest: SHA-256 of body -> RFC 9530 header
        b. Signature-Input: covered components + params -> RFC 9421 Structured Fields
        c. Signature Base: canonical representation per RFC 9421 section 2.5
        d. EIP-191 signMessage(signatureBase) via keyStore
        e. Assemble Signature header
         |
         v
    [5] Return { headers: { Signature-Input, Signature, Content-Digest }, keyid, ... }
         |
         v
Agent -> Adds returned headers to original HTTP request -> External API
```

---

## Patterns to Follow

### Pattern 1: Domain Policy in Route Handler (x402 Pattern)

**What:** Evaluate `ERC8128_ALLOWED_DOMAINS` policy directly in the route handler, not in `DatabasePolicyEngine.evaluate()`.

**Why:** `DatabasePolicyEngine` operates on `TransactionParam` which has amount/toAddress/chain fields -- not URL/domain fields. Domain policies are a distinct concept from transaction policies.

**Implementation reference:** `packages/daemon/src/services/x402/x402-domain-policy.ts`

```typescript
// packages/daemon/src/services/erc8128/erc8128-domain-policy.ts
// Follows exact same pattern as evaluateX402Domain

export function evaluateErc8128Domain(
  resolved: PolicyRow[],
  targetDomain: string,
  settingsService?: SettingsReader,
): PolicyEvaluation | null {
  const policy = resolved.find((p) => p.type === 'ERC8128_ALLOWED_DOMAINS');

  // No policy -> default deny (always, no toggle)
  if (!policy) {
    return {
      allowed: false,
      tier: 'INSTANT' as PolicyTier,
      reason: 'ERC-8128 signing disabled: no ERC8128_ALLOWED_DOMAINS policy configured',
    };
  }

  const rules = JSON.parse(policy.rules);
  // ... wildcard matching + rate limit check ...
}
```

**Key difference from x402:** No `default_deny_erc8128_domains` toggle in settings. ERC-8128 domain policy is always default-deny (no opt-out). Rationale: signing HTTP requests with wallet keys is a sensitive operation; always require explicit domain whitelisting.

### Pattern 2: Feature Gate via SettingsService (Hot-Reload)

**What:** Check `erc8128.enabled` Admin Setting before processing requests, using SettingsService instead of config.toml for hot-reload support.

**Why:** x402 uses the older `deps.config.x402?.enabled` pattern (config.toml, requires restart). ERC-8128 should use the newer SettingsService pattern for hot-reload consistency, following CLAUDE.md guidance: "Prefer Admin Settings over config.toml."

```typescript
// In route handler
const enabled = deps.settingsService?.get('erc8128.enabled') === 'true';
if (!enabled) {
  throw new WAIaaSError('ERC8128_DISABLED', {
    message: 'ERC-8128 signed HTTP requests are disabled',
  });
}
```

### Pattern 3: Signing Engine as Pure Core Module

**What:** The RFC 9421 signing logic lives in `packages/core/src/erc8128/` as pure functions with no daemon dependencies.

**Why:** (1) SDK needs verification utilities, (2) testability -- pure functions are easy to unit test against RFC test vectors, (3) same pattern as `packages/core/src/interfaces/x402.types.ts` for type definitions.

```
packages/core/src/erc8128/
  index.ts                    # Public API exports
  http-message-signer.ts      # signHttpRequest() orchestrator
  signature-input-builder.ts  # RFC 9421 Structured Fields builder
  content-digest.ts           # RFC 9530 SHA-256 digest
  signature-base-builder.ts   # RFC 9421 section 2.5 canonical form
  keyid.ts                    # erc8128:<chainId>:<address> format
  verifier.ts                 # ecrecover-based verification
  types.ts                    # Zod schemas (SSoT)
  constants.ts                # Algorithm registry, covered component presets
```

### Pattern 4: MCP Tool as Thin REST Wrapper

**What:** MCP tools call the REST API via ApiClient, no business logic in MCP layer.

**Reference:** `packages/mcp/src/tools/x402-fetch.ts` -- 45 lines total, just maps args to API call.

```typescript
// packages/mcp/src/tools/erc8128-sign.ts
export function registerErc8128Sign(
  server: McpServer, apiClient: ApiClient, walletContext?: WalletContext,
): void {
  server.tool('erc8128_sign_request', ..., async (args) => {
    const result = await apiClient.post('/v1/erc8128/sign', {
      method: args.method,
      url: args.url,
      headers: args.headers,
      body: args.body,
      walletId: args.wallet_id,
      network: args.network,
      preset: args.preset,
    });
    return toToolResult(result);
  });
}
```

### Pattern 5: connect-info Capability Extension

**What:** Add `erc8128` to capabilities array when enabled.

**Reference:** x402 checks `deps.config.x402?.enabled`, erc8004 checks `Object.keys(identitiesMap).length > 0`.

```typescript
// In connect-info.ts, after existing capability checks:
if (deps.settingsService?.get('erc8128.enabled') === 'true') {
  capabilities.push('erc8128');
}
```

### Pattern 6: Route Registration in server.ts

**What:** Register ERC-8128 routes with sessionAuth middleware.

**Reference pattern from x402 and erc8004:**

```typescript
// In server.ts:
// Middleware
app.use('/v1/erc8128/*', sessionAuth);

// Route registration
app.route('/v1', erc8128Routes({
  db: deps.db,
  sqlite: deps.sqlite,
  keyStore: deps.keyStore,
  config: deps.config,
  notificationService: deps.notificationService,
  settingsService: deps.settingsService,
  passwordRef: deps.passwordRef,
  masterPassword: deps.masterPassword,
  eventBus: deps.eventBus,
}));
```

### Pattern 7: 4-Level Policy Override Resolution

**What:** Domain policies support 4-level override: wallet+network > wallet+null > global+network > global+null.

**Reference:** `resolveX402DomainPolicies()` in `packages/daemon/src/api/routes/x402.ts` (lines 614-667). ERC-8128 should reuse the exact same resolution logic.

```typescript
// Can extract resolveX402DomainPolicies as a shared utility:
// packages/daemon/src/services/shared/resolve-domain-policies.ts
export function resolveDomainPolicies(
  rows: PolicyRow[], walletId: string, policyType: string,
): PolicyRow[] { ... }
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Routing ERC-8128 Through SIGN Pipeline

**What:** Using the existing SIGN pipeline type to handle ERC-8128 requests.

**Why bad:** SIGN pipeline is `signMessage(arbitrary_data)` -- a single-step operation. ERC-8128 requires multi-step construction (Content-Digest -> Signature-Input -> Signature Base -> sign -> assemble headers). Forcing this through SIGN would require special-casing every pipeline stage with `if (isErc8128) { ... }` branching, violating the pipeline's single-responsibility design.

**Instead:** Dedicated route with signing engine, as x402 demonstrates.

### Anti-Pattern 2: Adding ERC-8128 to DatabasePolicyEngine.evaluate()

**What:** Inserting `ERC8128_ALLOWED_DOMAINS` evaluation into the Stage 3 policy evaluation sequence.

**Why bad:** `DatabasePolicyEngine.evaluate()` operates on `TransactionParam` (amount, toAddress, chain). ERC-8128 has no amount/toAddress -- it has URL/domain. Injecting URL-based evaluation into a transaction-oriented engine would pollute the interface.

**Instead:** Separate domain policy evaluator function called from the route handler (exact x402 pattern: `evaluateX402Domain()` in `x402-domain-policy.ts`).

### Anti-Pattern 3: Recording ERC-8128 Signatures in transactions Table

**What:** Creating a DB record for each ERC-8128 signing operation.

**Why bad:** ERC-8128 is a stateless, zero-financial-risk operation (signing HTTP headers, not spending funds). DB records would grow unboundedly with high-frequency API calls, add latency, and provide no security value.

**Instead:** Fire-and-forget notifications only (`ERC8128_SIGNATURE_CREATED` at low priority). Rate limiting via in-memory counter (resets on restart -- acceptable for non-financial operations).

### Anti-Pattern 4: Proxying External API Calls

**What:** Having the daemon fetch the external API on behalf of the agent (like x402 does).

**Why bad:** x402 proxies because it needs to intercept the 402 response and inject payment headers. ERC-8128 has no such requirement -- the agent just needs signature headers to add to its own request. Opening outbound network connections from the daemon increases attack surface unnecessarily.

**Instead:** Return signature headers only; agent performs the external API call directly.

### Anti-Pattern 5: Adding New discriminatedUnion Type

**What:** Adding `ERC8128_SIGN` to the 7-type discriminatedUnion (TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH/SIGN/X402_PAYMENT).

**Why bad:** Changes cascade through entire pipeline. Every stage validator, policy evaluator, and handler would need new case branches for a type that never enters the pipeline.

**Instead:** No new discriminatedUnion type. ERC-8128 is a dedicated route that directly uses the signing engine, completely outside the pipeline.

---

## Integration Points: New vs. Modified Components

### New Components (Create)

| # | File | Package | Purpose |
|---|------|---------|---------|
| 1 | `src/erc8128/index.ts` | core | Public API exports |
| 2 | `src/erc8128/http-message-signer.ts` | core | RFC 9421 signing orchestrator |
| 3 | `src/erc8128/signature-input-builder.ts` | core | Structured Fields builder |
| 4 | `src/erc8128/content-digest.ts` | core | RFC 9530 Content-Digest |
| 5 | `src/erc8128/signature-base-builder.ts` | core | RFC 9421 section 2.5 |
| 6 | `src/erc8128/keyid.ts` | core | keyid format utils |
| 7 | `src/erc8128/verifier.ts` | core | Signature verification |
| 8 | `src/erc8128/types.ts` | core | Zod schemas |
| 9 | `src/erc8128/constants.ts` | core | Algorithm registry, presets |
| 10 | `src/api/routes/erc8128.ts` | daemon | Route handler (sign + verify) |
| 11 | `src/services/erc8128/erc8128-domain-policy.ts` | daemon | Domain policy evaluator |
| 12 | `src/tools/erc8128-sign.ts` | mcp | MCP sign tool |
| 13 | `src/tools/erc8128-verify.ts` | mcp | MCP verify tool |
| 14 | `src/erc8128.ts` (or inline in client.ts) | sdk | `fetchWithErc8128()` helper |
| 15 | `__tests__/erc8128-*.test.ts` | core/daemon/mcp/sdk | Test files (~48 tests) |

### Modified Components (Update)

| # | File | Package | Change |
|---|------|---------|--------|
| 1 | `src/enums/policy.ts` | core | Add `'ERC8128_ALLOWED_DOMAINS'` (19th policy type) |
| 2 | `src/enums/notification.ts` | core | Add `ERC8128_SIGNATURE_CREATED`, `ERC8128_DOMAIN_BLOCKED` |
| 3 | `src/schemas/policy.schema.ts` | core | Add superRefine rules for ERC8128_ALLOWED_DOMAINS |
| 4 | `src/errors/error-codes.ts` | core | Add 5 error codes (ERC8128_DISABLED, ERC8128_DOMAIN_NOT_ALLOWED, INVALID_COVERED_COMPONENTS, BODY_REQUIRED_FOR_DIGEST, EVM_NETWORK_REQUIRED) |
| 5 | `src/index.ts` | core | Re-export erc8128 module |
| 6 | `src/api/server.ts` | daemon | Register erc8128 routes + `app.use('/v1/erc8128/*', sessionAuth)` |
| 7 | `src/api/routes/openapi-schemas.ts` | daemon | Add ERC8128 error responses to `buildErrorResponses` |
| 8 | `src/api/routes/connect-info.ts` | daemon | Add `erc8128` to capabilities array |
| 9 | `src/infrastructure/settings/setting-keys.ts` | daemon | Add 5 `erc8128.*` setting definitions + `erc8128` to SETTING_CATEGORIES |
| 10 | `src/server.ts` | mcp | Register 2 new tools (`registerErc8128Sign`, `registerErc8128Verify`) |
| 11 | `src/client.ts` | sdk | Add `signHttpRequest()`, `verifyHttpSignature()` methods |
| 12 | `src/types.ts` | sdk | Add request/response types |
| 13 | Policy form component | admin | Add ERC8128_ALLOWED_DOMAINS form (domains list + rate_limit + default_deny) |
| 14 | System settings page | admin | Add ERC-8128 section (enabled toggle, preset, TTL, nonce) |
| 15 | `src/utils/settings-helpers.ts` | admin | Add erc8128 label mappings |
| 16 | `skills/wallet.skill.md` | skills | Add ERC-8128 signing section |
| 17 | `skills/policies.skill.md` | skills | Add ERC8128_ALLOWED_DOMAINS policy type |
| 18 | `skills/admin.skill.md` | skills | Add ERC-8128 settings documentation |
| 19 | `__tests__/enums.test.ts` | core | Update POLICY_TYPES count (18->19), NOTIFICATION_EVENT_TYPES count (49->51) |

### No Changes Required

| Component | Why Not |
|-----------|---------|
| `DatabasePolicyEngine` | Domain policy evaluated in route handler, not Stage 3 |
| `transactions` table / DB schema | No DB records for ERC-8128 (stateless, no financial risk) |
| 6-stage pipeline | ERC-8128 bypasses pipeline entirely |
| `discriminatedUnion` 7-type | No new transaction type added |
| Chain adapters (IChainAdapter) | ERC-8128 uses `signMessage()` directly via keyStore, not chain adapter |
| `DaemonConfig` / `config.toml` | All settings via SettingsService (hot-reload, per CLAUDE.md preference) |
| DB migration / schema version | No new tables or columns needed |

---

## Suggested Build Order

Build order follows dependency graph, enabling incremental testing at each phase.

### Phase 1: Core Signing Engine (SIG-01)

**Dependencies:** None (pure functions, no external deps)
**Output:** `packages/core/src/erc8128/` module with full unit test coverage
**Tests:** ~30 unit tests (S1-S8 from test matrix)

Build order within phase:
1. `types.ts` + `constants.ts` -- Zod schemas, presets, algorithm registry
2. `keyid.ts` -- keyid format generation/parsing
3. `content-digest.ts` -- RFC 9530 SHA-256
4. `signature-input-builder.ts` -- RFC 9421 Structured Fields
5. `signature-base-builder.ts` -- RFC 9421 section 2.5 canonical form
6. `http-message-signer.ts` -- orchestrates steps 2-5
7. `verifier.ts` -- ecrecover verification
8. `index.ts` -- public exports
9. Update `packages/core/src/index.ts` re-exports

**Rationale:** Core engine has zero external dependencies, enables all subsequent phases. Pure functions are highly testable without mocks.

### Phase 2: Policy + Error Codes + Settings + Notifications (SIG-03 + SIG-07)

**Dependencies:** Phase 1 (types only)
**Output:** Policy type enum, error codes, settings definitions, domain policy evaluator, notification events

Build order within phase:
1. `packages/core/src/enums/policy.ts` -- add `ERC8128_ALLOWED_DOMAINS` (18->19)
2. `packages/core/src/enums/notification.ts` -- add 2 event types (49->51)
3. `packages/core/src/errors/error-codes.ts` -- add 5 ERC8128 error codes
4. `packages/core/src/schemas/policy.schema.ts` -- add superRefine for `ERC8128_ALLOWED_DOMAINS` rules schema
5. `packages/daemon/src/infrastructure/settings/setting-keys.ts` -- add 5 `erc8128.*` keys + `erc8128` category
6. `packages/daemon/src/services/erc8128/erc8128-domain-policy.ts` -- domain policy evaluator (reuse `matchDomain` from x402)
7. Update enum tests (`enums.test.ts` count assertions, policy-superrefine tests)

**Rationale:** Route handler needs policy + settings + error codes to function. Notifications are simple enum additions.

### Phase 3: REST API Route (SIG-02 partial)

**Dependencies:** Phase 1 (signing engine), Phase 2 (policy, settings, errors)
**Output:** `POST /v1/erc8128/sign`, `POST /v1/erc8128/verify` endpoints
**Tests:** ~10 integration tests (S9-S11, S20-S22)

Build order within phase:
1. `packages/daemon/src/api/routes/erc8128.ts` -- route handler with sign + verify endpoints
2. `packages/daemon/src/api/server.ts` -- register routes + sessionAuth middleware
3. `packages/daemon/src/api/routes/openapi-schemas.ts` -- add error responses
4. `packages/daemon/src/api/routes/connect-info.ts` -- add `erc8128` capability
5. Integration tests (route tests, feature gate tests, domain policy integration)

**Rationale:** REST API is the foundation for MCP + SDK integration. Everything downstream wraps these endpoints.

### Phase 4: MCP + SDK (SIG-02 completion)

**Dependencies:** Phase 3 (REST API)
**Output:** 2 MCP tools, 3 SDK methods
**Tests:** ~8 tests (S16-S18)

Build order within phase:
1. `packages/mcp/src/tools/erc8128-sign.ts` -- MCP sign tool
2. `packages/mcp/src/tools/erc8128-verify.ts` -- MCP verify tool
3. `packages/mcp/src/server.ts` -- register 2 tools
4. `packages/sdk/src/types.ts` -- add request/response types
5. `packages/sdk/src/client.ts` -- add `signHttpRequest()`, `verifyHttpSignature()`
6. `packages/sdk/src/erc8128.ts` -- `fetchWithErc8128()` convenience helper
7. Tests (MCP tool tests, SDK client tests, fetchWithErc8128 E2E)

### Phase 5: Admin UI + Skills (SIG-05 + SIG-06)

**Dependencies:** Phase 2 (settings keys), Phase 3 (API endpoints)
**Output:** Admin UI sections, skill file updates
**Tests:** ~2 UI tests (S19)

Build order within phase:
1. `packages/admin/src/utils/settings-helpers.ts` -- add erc8128 label mappings
2. Admin UI: System page ERC-8128 settings section (enabled toggle, preset, TTL, nonce)
3. Admin UI: Policies page ERC8128_ALLOWED_DOMAINS form (domains list, rate_limit, default_deny)
4. Skill files: `wallet.skill.md`, `policies.skill.md`, `admin.skill.md`
5. UI render tests

---

## Scalability Considerations

| Concern | Current (Single Daemon) | Notes |
|---------|------------------------|-------|
| Rate limit counter | In-memory `Map<domain, {count, windowStart}>`, resets on restart | Acceptable: ERC-8128 is non-financial, counter is DX convenience not security boundary |
| Signing throughput | viem signMessage is synchronous crypto (~1ms per signature) | No bottleneck expected even at high frequency |
| Policy DB queries | 1 query per request (policies table, same indexes as x402) | No index changes needed |
| No DB writes | Stateless signing, no transactions table insertion | No growth in DB size from ERC-8128 usage |
| Memory overhead | 5 Admin Settings keys + 1 rate limit Map | Negligible |

---

## Sources

- Codebase analysis: `packages/daemon/src/api/routes/x402.ts` (x402 dedicated route pattern, 668 lines) -- HIGH confidence
- Codebase analysis: `packages/daemon/src/services/x402/x402-domain-policy.ts` (domain policy evaluation pattern, matchDomain reuse) -- HIGH confidence
- Codebase analysis: `packages/daemon/src/api/routes/connect-info.ts` (capabilities extension pattern, 408 lines) -- HIGH confidence
- Codebase analysis: `packages/daemon/src/api/server.ts` (route registration + sessionAuth middleware pattern) -- HIGH confidence
- Codebase analysis: `packages/core/src/enums/policy.ts` (18 existing policy types) -- HIGH confidence
- Codebase analysis: `packages/core/src/enums/notification.ts` (49 existing event types) -- HIGH confidence
- Codebase analysis: `packages/mcp/src/tools/x402-fetch.ts` (thin REST wrapper MCP tool pattern) -- HIGH confidence
- Codebase analysis: `packages/sdk/src/client.ts` (`x402Fetch()` method pattern) -- HIGH confidence
- Codebase analysis: `packages/daemon/src/infrastructure/settings/setting-keys.ts` (17 setting categories, definition structure) -- HIGH confidence
- Design document: `internal/objectives/m30-10-erc8128-signed-http-requests.md` (14 design decisions, 22 test scenarios) -- HIGH confidence
