# Phase 19: 인증 모델 + Owner 주소 재설계 - Research

**Researched:** 2026-02-07
**Domain:** Authentication architecture redesign (masterAuth/ownerAuth/sessionAuth 3-tier)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**masterAuth 정의와 범위**
- 마스터 패스워드(Argon2id) 기반 인증 유지
- 패스워드 입력은 데이몬 시작 시 1회만 -- 이후 데이몬 실행 중에는 메모리에 유지되어 masterAuth는 "데이몬이 이미 인증된 상태"로 동작
- masterAuth 적용 범위: 세션 생성, 에이전트 CRUD, 정책(policies) CRUD, 설정 변경 등 시스템 관리 영역 전반
- Kill Switch 복구: dual-auth 유지 (masterAuth + ownerAuth 둘 다 필요)
- 전달 방식: Claude 재량 (보안과 호환성 분석하여 결정)

**ownerAuth 서명 방식과 CLI 수동 승인**
- 서명 메시지 포맷: SIWS(Solana) / SIWE(EVM) 표준 유지
- CLI 수동 승인 플로우: Claude 재량 (보안과 DX 균형 분석하여 결정)
- APPROVAL 타임아웃: 설정 가능으로 변경 (기존 1시간 고정에서 Owner가 범위 내에서 설정)
- CLI fallback: WalletConnect 연결 여부와 무관하게 항상 CLI 수동 승인이 대안으로 존재 -- WC는 순수 편의 기능
- ownerAuth 적용 범위: 거래 승인(APPROVAL 티어) + Kill Switch 복구 2곳으로 한정

**Owner 주소 등록과 변경 정책**
- owner_address는 에이전트 생성 시 필수 -- `agent create --owner <address>` 없이는 에이전트 생성 불가
- 에이전트당 단일 Owner만 허용 (1:1 바인딩)
- 동일 Owner 주소로 여러 에이전트 소유 가능 (1:N 관계)
- Owner 주소 변경: masterAuth 단일 트랙으로 단순화 -- 서명 이력 유무와 무관하게 masterAuth만으로 변경 가능 (AUTH-04를 단일 트랙으로 결정)
- config.toml [owner] 섹션 제거, owner_wallets -> wallet_connections 전환

**인증 맵 재배치 기준**
- 배치 원칙: 자금 영향 기준 -- 자금 이동/동결에 직접 영향 = ownerAuth, 그 외 = masterAuth 또는 sessionAuth
- ownerAuth 최소화: 거래 승인(APPROVAL 티어) + Kill Switch 복구 2곳만
- 조회 권한: GET /health만 인증 없이 공개, 나머지 모든 조회 엔드포인트는 sessionAuth 필요
- 정책 관리(policies CRUD): masterAuth -- 티어 임계값이 자금 영향을 결정하지만, 정책 자체는 시스템 관리자 영역
- 보안 비다운그레이드 검증: Claude 재량 (v0.2 vs v0.5 매핑표 형식 등)

### Claude's Discretion

- masterAuth의 HTTP 전달 방식 (X-Master-Password 헤더 vs Authorization: Basic 등)
- masterAuth 적용 엔드포인트의 세부 범위 결정 (요구사항과 보안 수준 기반 분석)
- CLI 수동 서명 플로우의 구체적 UX (메시지 복사-붙여넣기 vs CLI 커맨드 등)
- APPROVAL 타임아웃 설정 가능 범위 (최소/최대값)
- v0.2 vs v0.5 보안 비다운그레이드 검증 문서화 방식

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope
</user_constraints>

## Summary

Phase 19 redesigns the WAIaaS authentication model from its current v0.2 design (where ownerAuth is the dominant auth for 17+ endpoints) to a 3-tier model (masterAuth/ownerAuth/sessionAuth) with clearly separated responsibilities. The core architectural change is: ownerAuth shrinks from "Owner manages everything" to "Owner approves fund movements only" (2 endpoints), while masterAuth absorbs system administration tasks. Simultaneously, the Owner address concept migrates from a global system-level config (owner_wallets table + config.toml [owner]) to a per-agent attribute (agents.owner_address column), and WalletConnect becomes purely optional.

This is a **design document phase** (no code), requiring modifications to 5 existing design documents (37-rest-api-complete-spec.md, 25-sqlite-schema.md, 34-owner-wallet-connection.md, 30-session-token-protocol.md, 29-api-framework-design.md) and producing a new unified authentication architecture document. The fundamental pattern shift is: masterAuth represents "the daemon operator has already proven identity at startup" (implicit auth state), ownerAuth represents "prove you own the wallet that controls this agent's funds" (per-request signature), and sessionAuth represents "this agent was authorized to act within constraints" (JWT bearer token).

**Primary recommendation:** Model masterAuth as an implicit daemon-level state (not per-request header authentication) for all system management endpoints, use `X-Master-Password` header only for initial keystore unlock and Kill Switch recovery, and define the complete 31-endpoint auth map with the "fund impact" criterion as the sole discriminator between ownerAuth and masterAuth/sessionAuth.

## Standard Stack

### Core (unchanged from v0.2)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `jose` | 6.x | JWT HS256 sign/verify for sessionAuth | Already decided in SESS-PROTO, zero-dep ESM |
| `@web3auth/sign-in-with-solana` | latest | SIWS message parsing | Already used in owner-verifier |
| `siwe` | 3.x | SIWE message parsing + signature recovery | Already used, requires ethers v6 peer |
| `tweetnacl` | latest | Ed25519 signature verification (Solana) | Already used in owner-verifier |
| `argon2` | latest | Argon2id password hashing for masterAuth | Already decided in CORE-03 |
| `hono` | 4.x | OpenAPIHono middleware framework | Already decided in CORE-06 |
| `drizzle-orm` | 0.45.x | SQLite ORM for schema changes | Already decided in CORE-02 |

### Supporting (no new libraries needed)

This phase is design-only and does not introduce new libraries. All authentication primitives (Argon2id, SIWS/SIWE, JWT HS256) are already specified in v0.2 design documents.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `X-Master-Password` header | `Authorization: Basic` (RFC 7617) | Basic auth is well-supported but encodes user:password, which is misleading when there is no "user" -- WAIaaS has a single master password, not user accounts. Custom header is clearer for the localhost-only daemon context. |
| `X-Master-Password` header | `Authorization: Bearer <masterToken>` | Would require a separate token issuance flow for master auth, adding complexity. Since masterAuth is implicit (daemon authenticated at start), a simple header for the few explicit cases is preferable. |
| Per-request masterAuth header | Implicit daemon-authenticated state | The locked decision specifies masterAuth means "daemon is already authenticated." This eliminates per-request password transmission for most endpoints. |

## Architecture Patterns

### Pattern 1: Implicit masterAuth (Daemon-Authenticated State)

**What:** The daemon authenticates via master password at startup (keystore unlock). After that, the daemon process itself is the authentication context. Any request reaching the daemon via localhost is implicitly masterAuth-authorized for system management operations.

**When to use:** All system management endpoints (agent CRUD, policy CRUD, session creation, settings changes).

**Rationale from locked decisions:**
- "패스워드 입력은 데이몬 시작 시 1회만 -- 이후 데이몬 실행 중에는 메모리에 유지되어 masterAuth는 '데이몬이 이미 인증된 상태'로 동작"
- This means masterAuth endpoints do NOT require per-request password headers. The daemon running = masterAuth passed.
- The localhost-only binding (127.0.0.1 Zod literal) provides the network-level security boundary.

**Design implications:**
- Remove `X-Master-Password` header requirement from most endpoints
- Keep `X-Master-Password` only for Kill Switch recovery (explicit dual-auth requirement) and POST /v1/admin/* endpoints (CLI admin commands that bypass the implicit state)
- The middleware chain becomes: for masterAuth endpoints, check that the daemon is in "authenticated" state (which it always is after startup) -- effectively a no-op guard
- For Admin API (POST /v1/admin/kill-switch, POST /v1/admin/shutdown), retain `X-Master-Password` header because these are CLI-initiated commands that should require explicit re-confirmation

**Recommendation:** Distinguish between two masterAuth modes:
1. **Implicit masterAuth** -- daemon is authenticated at startup. Used for: session creation, agent CRUD, policy CRUD, settings. No additional header needed. Security relies on localhost binding.
2. **Explicit masterAuth** -- requires `X-Master-Password` header. Used for: Admin API kill-switch, admin shutdown, Kill Switch recovery (in combination with ownerAuth). Provides defense-in-depth for destructive operations.

### Pattern 2: Scoped ownerAuth (Per-Agent Verification)

**What:** ownerAuth now verifies against `agents.owner_address` instead of the global `owner_wallets` table. The SIWS/SIWE signature is verified, then the signer address is compared against the specific agent's owner_address.

**When to use:** APPROVAL tier transaction approval, Kill Switch recovery only.

**Design change from v0.2:**
- v0.2: ownerAuth Step 5 checks `owner_wallets.address` (global single Owner)
- v0.5: ownerAuth Step 5 checks `agents.owner_address` for the relevant agent
- For transaction approval: the txId maps to an agentId, which maps to an owner_address
- For Kill Switch recovery: must check that the signer owns at least one registered agent

```
v0.2 ownerAuth flow:
  signature -> verify -> owner_wallets.address match -> pass

v0.5 ownerAuth flow:
  signature -> verify -> resolve agentId from context -> agents.owner_address match -> pass
```

### Pattern 3: Three-Tier Authentication Middleware Architecture

**What:** Replace the current 2-middleware system (sessionAuth global + ownerAuth route-level) with a 3-tier system.

**Current v0.2 middleware chain (from 29-api-framework-design.md):**
```
requestId -> logger -> shutdownGuard -> secureHeaders -> hostValidation -> cors -> rateLimiter -> killSwitchGuard -> sessionAuth/ownerAuth/masterAuth
```

**Proposed v0.5 middleware chain:**
```
requestId -> logger -> shutdownGuard -> secureHeaders -> hostValidation -> cors -> rateLimiter -> killSwitchGuard -> authRouter
```

Where `authRouter` dispatches to one of:
- `publicAuth` (no auth) -- GET /health, GET /v1/nonce
- `sessionAuth` (JWT) -- agent API endpoints (wallet, transactions, session list/details)
- `masterAuth` (implicit daemon state, or explicit header for admin) -- agent CRUD, policy CRUD, session creation, settings
- `ownerAuth` (SIWS/SIWE signature) -- APPROVAL approve/reject
- `dualAuth` (ownerAuth + masterAuth explicit) -- Kill Switch recovery

### Pattern 4: owner_address as NOT NULL FK-less Column

**What:** The `agents.owner_address` column changes from nullable (current v0.2 schema: "Phase 8에서 연결") to NOT NULL required at agent creation.

**Schema change:**
```sql
-- v0.2 (current)
owner_address TEXT,  -- nullable, connected later via POST /v1/owner/connect

-- v0.5 (new)
owner_address TEXT NOT NULL,  -- required at agent creation
```

**Index addition:**
```sql
CREATE INDEX idx_agents_owner_address ON agents(owner_address);
```

This index supports:
- Lookup of all agents owned by a specific address (1:N relationship)
- ownerAuth verification: given txId -> agentId -> agents.owner_address check
- Owner address change: UPDATE agents SET owner_address = ? WHERE owner_address = ?

### Pattern 5: wallet_connections Table (WC Push Signing Only)

**What:** The `owner_wallets` table is renamed/repurposed to `wallet_connections` and stripped of its authentication role. It becomes a pure WalletConnect session cache for convenience-based push signing.

**Schema change:**
```sql
-- v0.2 (current): owner_wallets -- authentication source
CREATE TABLE owner_wallets (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  chain TEXT NOT NULL,
  wc_session_topic TEXT,
  ...
);

-- v0.5 (new): wallet_connections -- WC push convenience only
CREATE TABLE wallet_connections (
  id TEXT PRIMARY KEY,
  owner_address TEXT NOT NULL,  -- matches agents.owner_address
  chain TEXT NOT NULL,
  wc_session_topic TEXT,
  wc_pairing_topic TEXT,
  connected_at INTEGER NOT NULL,
  last_active_at INTEGER,
  metadata TEXT,
);
```

Key differences:
- No longer the source of truth for owner identity (agents.owner_address is)
- Absence of a wallet_connections record does NOT block ownerAuth
- ownerAuth always works via CLI manual signature regardless of WC connection status

### Anti-Patterns to Avoid

- **Anti-pattern: Sending master password on every request.** The locked decision says masterAuth means "daemon is authenticated." Requiring X-Master-Password on every system management call would degrade DX and increase secret exposure surface.
- **Anti-pattern: Making ownerAuth the default for management.** The v0.2 design put 17 endpoints under ownerAuth, requiring wallet signatures for routine operations like viewing agents or checking settings. The v0.5 redesign explicitly minimizes ownerAuth to fund-impacting operations only.
- **Anti-pattern: Coupling WalletConnect availability to ownerAuth.** WalletConnect is optional. ownerAuth MUST work without it via CLI manual signature.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Argon2id password verification | Custom hash comparison | `argon2.verify()` from argon2 npm | Timing-safe comparison built in |
| SIWS message parsing | Custom string parser | `@web3auth/sign-in-with-solana` | EIP-4361 format is complex with edge cases |
| SIWE message verification | Custom ecrecover | `siwe` library SiweMessage.verify() | Handles EIP-191 recovery, checksum validation |
| JWT token handling | Custom token format | `jose` v6 SignJWT/jwtVerify | Constant-time HMAC comparison, standard claims |
| Address format validation | Regex patterns | Chain-specific validation (bs58 decode for Solana, ethers.getAddress for EVM) | Base58 checksum, EIP-55 checksum validation |

**Key insight:** All cryptographic primitives are already specified in v0.2 design docs. Phase 19 reorganizes authentication responsibilities, not cryptographic implementations.

## Common Pitfalls

### Pitfall 1: Auth Downgrade in the Reorganization

**What goes wrong:** Moving endpoints from ownerAuth to masterAuth/sessionAuth could accidentally remove security guarantees. For example, if DELAY tier cancellation moves from ownerAuth to sessionAuth, an AI agent could cancel its own pending transactions.

**Why it happens:** The 31-endpoint auth map is complex, and the "fund impact" criterion has edge cases (e.g., does viewing transaction history reveal fund information?).

**How to avoid:** Produce a v0.2 -> v0.5 comparison table for all 31 endpoints. For each endpoint, explicitly state: (1) v0.2 auth, (2) v0.5 auth, (3) whether this is an upgrade, same level, or downgrade, (4) justification if changed.

**Warning signs:** Any endpoint moving from higher auth (ownerAuth) to lower auth (sessionAuth or none) without explicit justification.

### Pitfall 2: Kill Switch Recovery Dual-Auth Complexity

**What goes wrong:** The recovery endpoint requires both ownerAuth (SIWS/SIWE signature) AND masterAuth (password). But under Kill Switch ACTIVATED state, killSwitchGuard blocks most requests. The guard must explicitly allow the recovery path with its special dual-auth flow.

**Why it happens:** The killSwitchGuard runs before auth middleware, so it cannot know whether the request is properly authenticated for recovery.

**How to avoid:** The allowedPaths in killSwitchGuard must include `/v1/owner/recover`. The recover handler must independently verify both auth factors. Current v0.2 design already handles this correctly (36-killswitch-autostop-evm.md section 2.4).

**Warning signs:** Recovery endpoint blocked by killSwitchGuard, or recovery bypassing one of the two auth factors.

### Pitfall 3: Agent-Scoped ownerAuth Resolution

**What goes wrong:** When ownerAuth verifies a signature for transaction approval, it needs to know which agent's owner_address to check against. The txId -> agentId -> owner_address resolution chain has a race condition if the owner_address changes between transaction creation and approval.

**Why it happens:** Owner address changes are now allowed via masterAuth (single track decision).

**How to avoid:** Record the owner_address at transaction creation time in the transaction metadata. At approval time, verify against the recorded address, not the current agents.owner_address. Alternatively, if owner_address changes, all pending APPROVAL transactions for that agent should be cancelled (safer approach).

**Warning signs:** An owner_address change leaving orphaned APPROVAL-pending transactions that the new owner cannot approve (old owner's address is in the pending approval).

### Pitfall 4: Session Creation Auth Change

**What goes wrong:** In v0.2, session creation (POST /v1/sessions) requires Owner SIWS/SIWE signature in the request body. In v0.5, session creation moves to masterAuth (implicit daemon authenticated state). This means any localhost process can create sessions without wallet signatures.

**Why it happens:** The locked decision places session creation under masterAuth scope.

**How to avoid:** This is an intentional design change. Sessions have constraints (maxAmount, allowedOperations, etc.) that limit their scope. The daemon operator (who provided the master password at startup) is trusted to create appropriately constrained sessions. Document this explicitly as a conscious security tradeoff with clear justification: the session constraint model provides the safety net, not the creation-time auth ceremony.

**Warning signs:** Session creation without any constraints, allowing unlimited fund access. The system should enforce minimum constraints or warn when creating unconstrained sessions.

### Pitfall 5: Migration of owner_wallets to wallet_connections

**What goes wrong:** Existing data in owner_wallets needs to be migrated. The address from owner_wallets should be copied to agents.owner_address for all existing agents. If this migration is not atomic, there could be a window where agents have no owner_address.

**Why it happens:** Schema migration for SQLite requires careful handling (limited ALTER TABLE support).

**How to avoid:** This is a design phase, not implementation. But the design document should specify the migration strategy: (1) Add owner_address NOT NULL with a default to agents table, (2) UPDATE agents SET owner_address = (SELECT address FROM owner_wallets LIMIT 1) for existing records, (3) Rename owner_wallets to wallet_connections, (4) Remove the address uniqueness constraint from wallet_connections.

### Pitfall 6: Implicit masterAuth Means No Audit Trail for Who Initiated

**What goes wrong:** If masterAuth is implicit (no per-request credential), audit logs cannot distinguish who performed system management actions. In v0.2, ownerAuth signs each request, providing cryptographic proof of who performed each action.

**Why it happens:** Implicit auth means the actor is always "daemon/system" rather than a specific wallet address.

**How to avoid:** Accept this tradeoff explicitly. For a Self-Hosted single-operator daemon, the operator IS the only administrator. Audit logs record the action and timestamp. For ownerAuth endpoints (fund movements), cryptographic proof (signature) is still recorded. Document the audit trail implications: masterAuth operations log actor='master', ownerAuth operations log actor='owner:<address>'.

## Code Examples

### masterAuth Middleware (Implicit Mode)

```typescript
// Source: Derived from CORE-06 middleware pattern + locked decision
// This middleware is effectively a no-op when the daemon is running
// (because the daemon only runs after master password authentication)

export function masterAuthMiddleware() {
  return createMiddleware<AppBindings>(async (c, next) => {
    // The daemon is running = master password was provided at startup
    // This middleware documents the auth requirement, not enforces it
    // Actual security: localhost binding (127.0.0.1 forced)
    c.set('authType', 'master')
    c.set('actor', 'master')
    await next()
  })
}
```

### masterAuth Middleware (Explicit Mode for Admin API)

```typescript
// Source: Derived from v0.2 37-rest-api-complete-spec.md section 3.3
export function explicitMasterAuthMiddleware(
  verifyPassword: (password: string) => Promise<boolean>,
) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const password = c.req.header('X-Master-Password')
    if (!password) {
      throw new WaiaasError('MASTER_PASSWORD_REQUIRED', 401)
    }
    // Argon2id verification
    const valid = await verifyPassword(password)
    if (!valid) {
      throw new WaiaasError('INVALID_MASTER_PASSWORD', 401)
    }
    c.set('authType', 'master-explicit')
    c.set('actor', 'admin')
    await next()
  })
}
```

### Per-Agent ownerAuth Verification

```typescript
// Source: Derived from 34-owner-wallet-connection.md ownerAuth Step 5 (modified)
// v0.5 change: verify against agents.owner_address instead of owner_wallets

// Step 5 in ownerAuth middleware:
const agentId = resolveAgentIdFromContext(c) // from txId or request param
const agent = await db.select()
  .from(agents)
  .where(eq(agents.id, agentId))
  .get()

if (!agent || agent.ownerAddress !== payload.address) {
  throw new WaiaasError('OWNER_MISMATCH', 403)
}
```

### Agent Creation with Required owner_address

```typescript
// Source: Derived from locked decision "agent create --owner <address>"
const AgentCreateSchema = z.object({
  name: z.string().min(1).max(100),
  chain: z.enum(['solana', 'ethereum']),
  network: z.string(),
  ownerAddress: z.string().min(1), // Required, NOT optional
})
```

### CLI Manual Signature Flow for ownerAuth

```typescript
// Source: Derived from 34-owner-wallet-connection.md section 8.2 + locked decision
// CLI approval flow when WalletConnect is not available

// Step 1: CLI fetches nonce
const { nonce } = await fetch('http://127.0.0.1:3100/v1/nonce').then(r => r.json())

// Step 2: CLI constructs SIWS/SIWE message and displays it
const message = constructSIWSMessage({
  domain: 'localhost:3100',
  address: ownerAddress,
  statement: 'WAIaaS Owner Action: approve_tx',
  nonce,
  issuedAt: new Date().toISOString(),
  expirationTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
})
console.log('Sign this message with your wallet:')
console.log(message)

// Step 3: Owner signs offline (e.g., using solana CLI or hardware wallet)
const signature = await promptInput('Paste signature (base58): ')

// Step 4: CLI constructs payload and calls API
const payload = { chain, address: ownerAddress, action: 'approve_tx', nonce, timestamp, message, signature }
const token = Buffer.from(JSON.stringify(payload)).toString('base64url')
await fetch(`http://127.0.0.1:3100/v1/owner/approve/${txId}`, {
  headers: { 'Authorization': `Bearer ${token}` },
})
```

## Discretion Recommendations

### 1. masterAuth HTTP Transmission Method

**Recommendation: Keep `X-Master-Password` custom header for explicit masterAuth only.**

Analysis:
- `Authorization: Basic` (RFC 7617): Encodes `user:password` as base64. Misleading because there is no "user" concept in WAIaaS. Also, Basic auth triggers browser credential dialogs, which is irrelevant for localhost API but could confuse tooling.
- `Authorization: Bearer <masterToken>`: Would require a token issuance flow, adding unnecessary complexity. The master password is already available in daemon memory.
- `X-Master-Password` header (current v0.2): Simple, explicit, self-documenting. Already used in v0.2 design (37-rest-api-complete-spec.md section 2.3 and 3.3). No RFC conflict.

Since the locked decision makes masterAuth implicit for most endpoints, X-Master-Password is only needed for 3 endpoints:
1. `POST /v1/admin/kill-switch` (CLI kill switch)
2. `POST /v1/admin/shutdown` (graceful shutdown)
3. `POST /v1/owner/recover` (Kill Switch recovery, combined with ownerAuth)

For these 3 endpoints, `X-Master-Password` is appropriate: it is explicit, defense-in-depth, and already established in v0.2.

### 2. masterAuth Endpoint Scope (Detailed Classification)

**Recommendation: Apply the following classification to all 31 endpoints.**

| # | Endpoint | v0.2 Auth | v0.5 Auth | Justification |
|---|----------|-----------|-----------|---------------|
| 1 | GET /health | None | None | Public healthcheck |
| 2 | GET /doc | None | None | OpenAPI spec (debug only) |
| 3 | GET /v1/nonce | None | None | Pre-auth nonce generation |
| 4 | GET /v1/wallet/balance | sessionAuth | sessionAuth | Agent reads own balance |
| 5 | GET /v1/wallet/address | sessionAuth | sessionAuth | Agent reads own address |
| 6 | POST /v1/transactions/send | sessionAuth | sessionAuth | Agent sends transaction (policy engine governs) |
| 7 | GET /v1/transactions | sessionAuth | sessionAuth | Agent reads own tx history |
| 8 | GET /v1/transactions/pending | sessionAuth | sessionAuth | Agent reads own pending txs |
| 9 | POST /v1/sessions | ownerAuth (body sig) | masterAuth (implicit) | Session creation = system management. Constraints limit scope. |
| 10 | GET /v1/sessions | ownerAuth | sessionAuth | Agent/SDK reads own sessions |
| 11 | DELETE /v1/sessions/:id | ownerAuth | masterAuth (implicit) | Session revocation = system management |
| 12 | POST /v1/owner/connect | None (localhost) | None (localhost) | WC connection setup, optional |
| 13 | DELETE /v1/owner/disconnect | ownerAuth | masterAuth (implicit) | WC disconnection = system management |
| 14 | POST /v1/owner/approve/:txId | ownerAuth | **ownerAuth** | Fund movement approval (KEPT) |
| 15 | POST /v1/owner/reject/:txId | ownerAuth | masterAuth (implicit) | Rejection = preventing fund movement = safe to be masterAuth |
| 16 | POST /v1/owner/kill-switch | ownerAuth | masterAuth (implicit) | Kill switch = system emergency stop |
| 17 | POST /v1/owner/recover | ownerAuth + masterAuth | **ownerAuth + masterAuth (explicit)** | Dual-auth for recovery (KEPT) |
| 18 | GET /v1/owner/pending-approvals | ownerAuth | masterAuth (implicit) | View pending = no fund impact |
| 19 | POST /v1/owner/policies | ownerAuth | masterAuth (implicit) | Policy management = system admin |
| 20 | PUT /v1/owner/policies/:policyId | ownerAuth | masterAuth (implicit) | Policy management = system admin |
| 21 | GET /v1/owner/sessions | ownerAuth | masterAuth (implicit) | Session management view |
| 22 | DELETE /v1/owner/sessions/:id | ownerAuth | masterAuth (implicit) | Session management = same as #11 |
| 23 | GET /v1/owner/agents | ownerAuth | masterAuth (implicit) | Agent list = system admin view |
| 24 | GET /v1/owner/agents/:id | ownerAuth | masterAuth (implicit) | Agent detail = system admin view |
| 25 | GET /v1/owner/settings | ownerAuth | masterAuth (implicit) | Settings view = system admin |
| 26 | PUT /v1/owner/settings | ownerAuth | masterAuth (implicit) | Settings change = system admin |
| 27 | GET /v1/owner/dashboard | ownerAuth | masterAuth (implicit) | Dashboard view = system admin |
| 28 | GET /v1/owner/status | ownerAuth | masterAuth (implicit) | Owner connection status |
| 29 | POST /v1/admin/kill-switch | masterAuth (explicit) | masterAuth (explicit) | CLI admin command (KEPT) |
| 30 | POST /v1/admin/shutdown | masterAuth (explicit) | masterAuth (explicit) | CLI admin command (KEPT) |
| 31 | GET /v1/admin/status | masterAuth (explicit) | masterAuth (explicit) | CLI admin query (KEPT) |

**ownerAuth endpoints in v0.5: exactly 2**
- POST /v1/owner/approve/:txId (fund movement)
- POST /v1/owner/recover (dual-auth with masterAuth explicit)

**New agent CRUD endpoints (implicit masterAuth):**
- POST /v1/agents (create agent with required owner_address)
- GET /v1/agents (list agents)
- GET /v1/agents/:id (agent detail)
- PUT /v1/agents/:id (update agent, including owner_address change)
- DELETE /v1/agents/:id (terminate agent)

Note: These agent CRUD endpoints may need to be designed as new endpoints or may overlap with existing owner/* endpoints. The v0.5 design should consolidate agent management under a dedicated /v1/agents path with masterAuth.

### 3. CLI Manual Signature Flow UX

**Recommendation: "Message display + paste signature" approach.**

Three options analyzed:

1. **Message copy-paste + external signing tool**: CLI displays the SIWS/SIWE message, user signs it with their wallet (Phantom CLI, solana-keygen, Ledger CLI), and pastes the base58/hex signature back.
   - Pros: Works with any signing tool, hardware wallet compatible, no dependencies
   - Cons: Multi-step UX, error-prone copy-paste

2. **CLI local keyfile signing**: CLI reads a local keyfile (Solana keypair JSON, Ethereum keystore) and signs automatically.
   - Pros: Single command, no copy-paste
   - Cons: Requires private key on disk (security risk), defeats purpose of hardware wallet

3. **Interactive QR + mobile sign**: CLI shows QR code for WalletConnect, phone signs.
   - Pros: Good UX
   - Cons: This IS WalletConnect -- the locked decision says CLI must work WITHOUT WC

**Recommendation: Option 1 (message display + paste signature)** with the following DX improvements:
- CLI saves the message to a temp file for easy piping: `waiaas owner sign-message > /tmp/msg.txt`
- CLI accepts signature from stdin: `echo "<signature>" | waiaas owner approve <txId>`
- CLI provides clear step-by-step instructions in the terminal
- Future enhancement (Phase 21 DX): integrate solana CLI signing as an optional convenience

### 4. APPROVAL Timeout Configurable Range

**Recommendation: min 5 minutes, max 24 hours, default 1 hour.**

| Setting | Value | Rationale |
|---------|-------|-----------|
| Minimum | 300 seconds (5 minutes) | Same as session minimum. Prevents accidental near-zero timeouts. |
| Maximum | 86400 seconds (24 hours) | Balances between "Owner might be away" and "funds locked too long." Beyond 24h, the transaction should be resubmitted. |
| Default | 3600 seconds (1 hour) | Current v0.2 fixed value preserved as default. Familiar to existing documentation. |

Storage: policies table rule JSON or config.toml `[security].approval_timeout`.

### 5. Security Non-Downgrade Verification Method

**Recommendation: Side-by-side comparison table in the design document.**

Format:
```markdown
| Endpoint | v0.2 Auth | v0.5 Auth | Change | Fund Impact | Verdict |
|----------|-----------|-----------|--------|-------------|---------|
| POST /v1/owner/approve/:txId | ownerAuth | ownerAuth | Same | Direct | SAFE |
| POST /v1/sessions | ownerAuth | masterAuth | Downgrade | Indirect | JUSTIFIED: session constraints limit scope |
```

Each "Downgrade" entry must include explicit justification with the compensating control (e.g., constraints, localhost binding, daemon startup auth).

Produce as a dedicated section in the deliverable document, not as a separate file.

## State of the Art

| Old Approach (v0.2) | Current Approach (v0.5) | When Changed | Impact |
|----------------------|------------------------|--------------|--------|
| ownerAuth for 17+ endpoints | ownerAuth for 2 endpoints | v0.5 | Dramatically reduces WalletConnect dependency |
| Global owner_wallets table | Per-agent agents.owner_address | v0.5 | Enables multi-agent multi-owner isolation |
| config.toml [owner] section | No config.toml owner concept | v0.5 | Owner is per-agent, not per-daemon |
| WalletConnect required for Owner ops | WalletConnect optional (CLI fallback always) | v0.5 | Removes external dependency for critical ops |
| POST /v1/sessions requires SIWS/SIWE | POST /v1/sessions requires masterAuth (implicit) | v0.5 | Simpler DX for SDK/MCP session creation |
| Single Owner per daemon | Single Owner per agent (1:1), multiple agents per Owner (1:N) | v0.5 | Supports multi-tenant scenarios |

## Open Questions

1. **Endpoint Path Consolidation**
   - What we know: v0.2 has `/v1/owner/*` paths for Owner-authenticated endpoints. In v0.5, most move to masterAuth.
   - What's unclear: Should endpoints like GET /v1/owner/agents move to GET /v1/agents (new masterAuth path), or stay at /v1/owner/agents with just the auth changed? Path reorganization is a breaking API change.
   - Recommendation: Keep existing paths for v0.5 to minimize API surface changes. Document the auth change. Path reorganization can be a v1.0 concern.

2. **Transaction Rejection Auth Level**
   - What we know: POST /v1/owner/reject/:txId currently uses ownerAuth. The locked decision says ownerAuth is for "fund movement/freezing." Rejection prevents fund movement.
   - What's unclear: Is "preventing fund movement" the same as "fund impact"? Rejection is a safe action (funds stay in wallet).
   - Recommendation: Move to masterAuth (implicit). Rejection is a protective action, not a fund-moving action. The owner approved the policy that created the APPROVAL tier; rejecting within that tier is administrative.

3. **Kill Switch Activation Auth Level**
   - What we know: POST /v1/owner/kill-switch uses ownerAuth in v0.2. It freezes all funds (indirect fund impact).
   - What's unclear: The locked decision says ownerAuth = "fund movement/freezing" yet Kill Switch is listed separately (dual-auth for recovery only, kill-switch activation not mentioned under ownerAuth scope).
   - Recommendation: Kill Switch activation = masterAuth (implicit) since it is a protective/emergency action, not a fund transfer. This matches the existing CLI path (POST /v1/admin/kill-switch uses masterAuth explicit). Keep dual-auth only for recovery (restoring fund access).

## Sources

### Primary (HIGH confidence)
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/37-rest-api-complete-spec.md` -- Full 31-endpoint API specification with v0.2 auth map
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/25-sqlite-schema.md` -- Current DB schema including agents.owner_address (nullable), owner_wallets table
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/30-session-token-protocol.md` -- JWT session protocol, sessionAuth middleware 2-stage
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/34-owner-wallet-connection.md` -- ownerAuth 8-step middleware, owner_wallets table, WalletConnect protocol
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/29-api-framework-design.md` -- Hono middleware chain, 9-stage middleware order
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/36-killswitch-autostop-evm.md` -- Kill Switch 3-state machine, dual-auth recovery
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/24-monorepo-data-directory.md` -- config.toml structure, monorepo layout
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/phases/19-auth-owner-redesign/19-CONTEXT.md` -- User locked decisions and discretion areas

### Secondary (MEDIUM confidence)
- [HTTP authentication - MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Authentication) -- HTTP authentication schemes reference
- [Sign In With Ethereum - Reown Docs](https://docs.reown.com/appkit/react/core/siwe) -- SIWE integration patterns
- [Phantom sign-in-with-solana](https://github.com/phantom/sign-in-with-solana) -- SIWS reference implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries already decided in v0.2, no new dependencies
- Architecture: HIGH -- Patterns derived directly from existing design docs + locked user decisions
- Pitfalls: HIGH -- Identified from careful analysis of v0.2 -> v0.5 transition points

**Research date:** 2026-02-07
**Valid until:** 2026-03-09 (30 days -- stable design domain, no fast-moving dependencies)
