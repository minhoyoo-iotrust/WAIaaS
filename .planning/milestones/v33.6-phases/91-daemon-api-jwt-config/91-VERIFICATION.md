---
phase: 91-daemon-api-jwt-config
verified: 2026-02-13T02:47:00Z
status: passed
score: 7/7 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 5/7
  gaps_closed:
    - "NotificationPayload interface uses walletId field, not agentId"
    - "ILocalKeyStore interface methods use walletId parameter name, not agentId"
  gaps_remaining: []
  regressions: []
---

# Phase 91: REST API 경로/응답/JWT 용어 변경 Verification Report

**Phase Goal:** REST API 경로/응답/JWT가 wallet 용어를 사용하여, 외부 소비자(SDK/MCP/Admin)가 walletId 기반으로 통신한다

**Verified:** 2026-02-13T02:47:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (91-03-PLAN.md)

## Goal Achievement

### Observable Truths

| #   | Truth                                                            | Status      | Evidence                                                                 |
| --- | ---------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------ |
| 1   | POST /v1/wallets endpoint exists and /v1/agents returns 404     | ✓ VERIFIED  | wallets.ts exists, agents.ts deleted (ls confirms)                      |
| 2   | All API response bodies use walletId not agentId                | ✓ VERIFIED  | 0 agentId in openapi-schemas.ts, 8 walletId references, NotificationPayload.walletId |
| 3   | JWT payload claim is wlt not agt                                | ✓ VERIFIED  | JwtPayload.wlt line 30, payload.wlt lines 212, 247                      |
| 4   | session-auth middleware sets walletId on Hono context           | ✓ VERIFIED  | c.set('walletId', payload.wlt) line 67, transactions.ts reads line 241 |
| 5   | config key is max_sessions_per_wallet                           | ✓ VERIFIED  | DaemonConfigSchema.security.max_sessions_per_wallet line 100            |
| 6   | OpenAPI spec (GET /doc) shows walletId fields, zero agentId     | ✓ VERIFIED  | openapi-schemas.ts: 0 agentId, 8 walletId field definitions             |
| 7   | tsc --noEmit passes for daemon package                          | ✓ VERIFIED  | TypeScript compilation clean, all 681 tests pass (0 failures)          |

**Score:** 7/7 truths verified (all success criteria met)

### Re-verification Summary

**Previous verification (2026-02-13T02:22:00Z):** 2 gaps found in @waiaas/core interfaces
**Gap closure plan:** 91-03-PLAN.md (10 files modified)
**Commits:** 488a119 (core interfaces), 2774e15 (tests)

**Gaps closed:**

1. ✅ **NotificationPayload.agentId → walletId** (packages/core/src/interfaces/INotificationChannel.ts)
   - Interface field renamed: `agentId: string;` → `walletId: string;`
   - All 3 notification channels updated: ntfy, telegram, discord use `payload.walletId`
   - notification-service.ts uses `walletId` parameter and DB mappings
   - Admin test payload uses `walletId: 'admin-test'`
   - grep verification: 0 matches for `payload.agentId` in daemon/src/

2. ✅ **ILocalKeyStore agentId parameters → walletId** (packages/core/src/interfaces/ILocalKeyStore.ts)
   - All 4 interface methods use `walletId: string` parameters
   - LocalKeyStore implementation (keystore.ts) uses walletId throughout (58 lines changed)
   - grep verification: 0 matches for agentId in keystore.ts

**Regressions:** None detected
- All 681 daemon tests pass (0 failures)
- TypeScript compilation clean for both core and daemon
- Previously verified items (API routes, JWT, config) remain intact

### Required Artifacts

| Artifact                                                     | Expected                                    | Status      | Details                                                      |
| ------------------------------------------------------------ | ------------------------------------------- | ----------- | ------------------------------------------------------------ |
| `packages/daemon/src/api/routes/wallets.ts`                 | Wallet CRUD route handlers (renamed)        | ✓ VERIFIED  | 253 lines, walletCrudRoutes function, /wallets paths        |
| `packages/daemon/src/api/routes/openapi-schemas.ts`         | WalletResponseSchema, walletId fields       | ✓ VERIFIED  | WalletCrudResponseSchema, all schemas use walletId (8x)     |
| `packages/daemon/src/infrastructure/jwt/jwt-secret-manager.ts` | JwtPayload with wlt claim                   | ✓ VERIFIED  | wlt: string (line 30), payload.wlt usage (lines 212, 247)   |
| `packages/daemon/src/api/middleware/session-auth.ts`        | c.set('walletId', payload.wlt)              | ✓ VERIFIED  | Line 67 sets walletId from wlt claim                         |
| `packages/daemon/src/infrastructure/config/loader.ts`       | max_sessions_per_wallet                     | ✓ VERIFIED  | Line 100 defines config key                                  |
| `packages/daemon/src/api/routes/transactions.ts`            | Uses c.get('walletId') from context         | ✓ VERIFIED  | Line 241 reads walletId from context (type assertion)        |
| `packages/core/src/interfaces/INotificationChannel.ts`      | NotificationPayload with walletId           | ✓ VERIFIED  | walletId: string (line 11), 0 agentId references             |
| `packages/core/src/interfaces/ILocalKeyStore.ts`            | Interface parameters use walletId           | ✓ VERIFIED  | All 4 methods use walletId: string parameters                |
| `packages/daemon/src/infrastructure/keystore/keystore.ts`   | LocalKeyStore with walletId parameter names | ✓ VERIFIED  | All methods use walletId throughout (58 lines changed)       |
| `packages/daemon/src/notifications/notification-service.ts` | notify() with walletId parameter            | ✓ VERIFIED  | walletId param, payload.walletId in DB mappings (3x)         |

### Key Link Verification

| From                            | To                         | Via                                  | Status     | Details                                          |
| ------------------------------- | -------------------------- | ------------------------------------ | ---------- | ------------------------------------------------ |
| session-auth.ts                 | transactions.ts            | c.get('walletId') context variable   | ✓ WIRED    | Line 67 sets, line 241 reads (type assertion)    |
| jwt-secret-manager.ts           | session-auth.ts            | payload.wlt JWT claim extraction     | ✓ WIRED    | JwtPayload.wlt line 30, extracted line 67        |
| server.ts                       | wallets.ts                 | walletCrudRoutes import and /v1 mount| ✓ WIRED    | Import + mount at /v1 prefix                     |
| wallets.ts                      | database schema            | wallets table operations             | ✓ WIRED    | Import + CRUD operations use wallets table       |
| INotificationChannel.ts         | notification-service.ts    | NotificationPayload.walletId         | ✓ WIRED    | payload.walletId in DB mappings (3x)             |
| INotificationChannel.ts         | channels/*.ts              | NotificationPayload.walletId         | ✓ WIRED    | ntfy, telegram, discord use payload.walletId     |
| ILocalKeyStore.ts               | keystore.ts                | walletId parameters                  | ✓ WIRED    | All 4 interface methods implemented with walletId|

### Requirements Coverage

Phase 91 requirements from ROADMAP.md:

| Requirement                                                  | Status      | Blocking Issue |
| ------------------------------------------------------------ | ----------- | -------------- |
| API-01: POST /v1/wallets 등 6개 엔드포인트 동작             | ✓ SATISFIED | None           |
| API-02: 모든 응답 body에 walletId 필드 존재                 | ✓ SATISFIED | None           |
| API-03: JWT payload claim이 wlt                             | ✓ SATISFIED | None           |
| API-04: GET /doc OpenAPI 스펙에서 walletId 존재             | ✓ SATISFIED | None           |
| API-05: max_sessions_per_wallet config 키 파싱              | ✓ SATISFIED | None           |

### Anti-Patterns Found

**None** — All previous anti-patterns resolved in gap closure:

| File                                           | Previous Issue        | Status      | Resolution                                       |
| ---------------------------------------------- | --------------------- | ----------- | ------------------------------------------------ |
| packages/core/src/interfaces/INotificationChannel.ts | agentId field         | ✓ RESOLVED  | Renamed to walletId (line 11)                    |
| packages/core/src/interfaces/ILocalKeyStore.ts | agentId parameter names | ✓ RESOLVED  | All methods use walletId: string                 |
| packages/daemon/src/api/routes/admin.ts        | agentId: 'admin-test' | ✓ RESOLVED  | Changed to walletId: 'admin-test' (line 437)     |
| packages/daemon/src/infrastructure/keystore/keystore.ts | agentId parameter/comments | ✓ RESOLVED | All references changed to walletId (58 lines)   |

**Note:** IPolicyEngine.ts line 30 contains `agentId: string` parameter, but this interface is out of scope for Phase 91 (focused on REST API/JWT/Config external terminology). Internal policy evaluation can be addressed in a future phase if needed.

### Human Verification Required

#### 1. OpenAPI /doc Endpoint Accessibility

**Test:** Start daemon and curl http://localhost:3773/doc
**Expected:** Returns valid OpenAPI 3.0 JSON with paths /v1/wallets, /v1/wallets/{id}, schemas show walletId fields
**Why human:** Daemon startup requires master password, config setup. Runtime verification needed.

#### 2. POST /v1/wallets Route Returns 404 for /v1/agents

**Test:** 
1. Start daemon
2. curl -X POST http://localhost:3773/v1/agents -H "X-Master-Password: test123" (should 404)
3. curl -X POST http://localhost:3773/v1/wallets -H "X-Master-Password: test123" -d '{"name":"test","chain":"solana","network":"devnet"}' (should succeed)

**Expected:** /v1/agents returns 404, /v1/wallets creates wallet
**Why human:** Requires daemon running with master password, HTTP client testing

#### 3. JWT Token Contains wlt Claim

**Test:**
1. Create wallet via POST /v1/wallets
2. Create session via POST /v1/sessions with walletId
3. Decode returned JWT token (jwt.io or base64)
4. Verify payload contains "wlt": "<wallet-id>" not "agt"

**Expected:** JWT payload has wlt claim, no agt claim
**Why human:** Requires session creation flow, JWT decoding

#### 4. Notification Channel Output Uses "Wallet:" Label

**Test:**
1. Configure notification channel (ntfy/telegram/discord)
2. Trigger a test notification via admin API
3. Check notification message content

**Expected:** Message shows "Wallet: <wallet-id>" not "Agent: <agent-id>"
**Why human:** Requires notification service configuration and external channel verification

### Verification Metrics

**Automated checks:**
- ✓ 10 files modified (91-03 plan)
- ✓ 2 commits verified (488a119, 2774e15)
- ✓ TypeScript compilation: 0 errors (core + daemon)
- ✓ Test suite: 681 tests, 0 failures
- ✓ grep agentId in core/interfaces/: 1 match (IPolicyEngine, out of scope)
- ✓ grep payload.agentId in daemon/src/: 0 matches
- ✓ grep agentId in notification files: 0 matches
- ✓ grep agentId in keystore.ts: 0 matches
- ✓ grep agentId in openapi-schemas.ts: 0 matches
- ✓ wallets.ts exists: 14234 bytes
- ✓ agents.ts deleted: file not found

**Coverage:**
- 91-01: 27 source files (daemon API/JWT/config)
- 91-02: 37 test files (daemon test suite)
- 91-03: 10 files (core interfaces + daemon consumers)
- Total: 74 files modified across 3 plans

---

_Verified: 2026-02-13T02:47:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification: Yes (gaps closed)_
