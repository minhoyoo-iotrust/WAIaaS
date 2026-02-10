# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-10)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 57 통합 테스트

## Current Position

Phase: 57 (6 of 6 in v1.2) (통합 테스트)
Plan: 1 of 2 in current phase
Status: In progress
Last activity: 2026-02-10 -- Completed 57-01-PLAN.md (auth/policy audit + CLI E2E harness fix)

Progress: [████████████░] 92% (12/13 plans)

## Performance Metrics

**Cumulative:** 13 milestones, 55 phases, 139 plans, 332 reqs, 444 tests, ~14,500 LOC

**v1.2 Velocity:**
- Total plans completed: 12
- Average duration: 5.8min
- Total execution time: 69min

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 52 | 2/2 | 16min | 8min |
| 53 | 2/2 | 10min | 5min |
| 54 | 2/2 | 11min | 5.5min |
| 55 | 3/3 | 12min | 4min |
| 56 | 2/2 | 17min | 8.5min |
| 57 | 1/2 | 6min | 6min |

## Accumulated Context

### Decisions

Full log in PROJECT.md. Recent decisions affecting v1.2:

- [v1.1]: Hono createMiddleware DI pattern (typed c.set/c.get + createApp(deps) factory)
- [v1.1]: Async pipeline fire-and-forget (Stage 1 sync 201, stages 2-6 async)
- [v1.1]: MockChainAdapter for E2E (CI에서 실제 RPC 없이 전 구간 테스트)
- [v0.5]: masterAuth/ownerAuth 책임 분리 (Owner 서명 = 자금 영향 시에만)
- [v0.5]: 세션 낙관적 갱신 (에이전트 자율성 + Owner 사후 거부)
- [52-01]: jose for JWT (ESM-native HS256, Buffer.from(hex, 'hex') as symmetric key)
- [52-01]: key_value_store for JWT secrets (jwt_secret_current/previous keys, no new tables)
- [52-01]: wai_sess_ token prefix for visual identification + format validation
- [52-01]: JwtSecretManager in-memory cache + DB persistence, dual-key 5-min rotation window
- [52-01]: sessionAuth factory pattern with JwtSecretManager + DB deps injection
- [52-02]: Server-level auth middleware (app.use() at createApp level, not sub-router use('*'))
- [52-02]: ownerAuth uses sodium-native createRequire + inline base58 decode (Ed25519 only for v1.2)
- [52-02]: masterPasswordHash in CreateAppDeps (Argon2id hash injected, not raw password for auth)
- [52-02]: No X-Agent-Id fallback -- wallet/tx routes exclusively use sessionAuth context agentId
- [53-01]: masterAuth on /v1/sessions (session CRUD = admin operation, not agent self-service)
- [53-01]: Token hash via sha256 (raw JWT never persisted in DB)
- [53-01]: 30-day absolute session lifetime (absoluteExpiresAt hardcoded)
- [53-01]: Idempotent DELETE /sessions/:id (re-revoke returns 200 with message)
- [53-01]: GET /sessions excludes revoked (runtime ACTIVE/EXPIRED status from expiresAt)
- [53-02]: sessionAuth on /v1/sessions/:id/renew (session renews itself, not admin operation)
- [53-02]: Conditional masterAuth bypass via path.endsWith('/renew') in middleware wrapper
- [53-02]: CAS double-check: pre-read + WHERE clause for concurrent renewal race prevention
- [53-02]: Token TTL preserved across renewals, expiresAt clamped by absoluteExpiresAt
- [54-01]: BigInt for all amount comparisons (string -> BigInt, no floating point for on-chain amounts)
- [54-01]: WHITELIST evaluated before SPENDING_LIMIT (deny-first ordering)
- [54-01]: Empty allowed_addresses = whitelist inactive (prevents accidental lockout)
- [54-01]: Case-insensitive address comparison via toLowerCase() (EVM checksum compat)
- [54-01]: resolveOverrides deduplicates by type, agent-specific preferred over global
- [54-02]: POLICY_NOT_FOUND error code added to POLICY domain (5 codes total)
- [54-02]: masterAuth on /v1/policies and /v1/policies/:id (explicit per-path registration)
- [54-02]: evaluateAndReserve is synchronous (better-sqlite3 is sync, no async wrapper needed)
- [54-02]: reserved_amount as TEXT column (consistent with amount for BigInt string representation)
- [54-02]: SUM(CAST(reserved_amount AS INTEGER)) for SQLite aggregation within BEGIN IMMEDIATE
- [55-01]: delaySeconds stored in metadata JSON (reuses existing column, no schema change)
- [55-01]: JSON_EXTRACT for expired query (queued_at + delaySeconds <= now in single SELECT)
- [55-01]: processExpired CAS guard (WHERE status = 'QUEUED' prevents double-processing)
- [55-01]: cancelDelay clears reserved_amount inline (single UPDATE for CANCELLED + NULL)
- [55-02]: ApprovalWorkflow uses raw sqlite (not Drizzle ORM) for all queries -- BEGIN IMMEDIATE requires sync raw SQL
- [55-02]: expired != rejected: processExpiredApprovals does NOT set rejectedAt, only tx EXPIRED
- [55-02]: reserved_amount cleared on all 3 exit paths (approve, reject, expire)
- [55-03]: resolveOwnerState is a pure function (no DB, no side effects) -- reusable anywhere
- [55-03]: ownerAuth success auto-triggers markOwnerVerified (GRACE->LOCKED, no separate endpoint)
- [55-03]: LOCKED returns 409 OWNER_ALREADY_CONNECTED on PUT /agents/:id/owner (conflict, not auth error)
- [55-03]: cancel uses sessionAuth (agent self-service), approve/reject use ownerAuth (owner action)
- [55-03]: sqlite dep added to CreateAppDeps for raw DB access in route sub-routers
- [56-01]: instanceof DatabasePolicyEngine for evaluateAndReserve path selection (backward compatible with DefaultPolicyEngine)
- [56-01]: sessionId FK constraint requires valid session record (or null) in transactions table
- [56-01]: downgradeIfNoOwner integrated directly in stage3Policy (not a separate stage)
- [56-02]: PIPELINE_HALTED as WAIaaSError (domain TX, httpStatus 409) for intentional pipeline halt
- [56-02]: Backward-compatible fallback: missing delayQueue/approvalWorkflow -> treat DELAY/APPROVAL as INSTANT
- [56-02]: executeFromStage5 uses dynamic imports to avoid circular deps in daemon.ts
- [56-02]: Workflow instances (DelayQueue, ApprovalWorkflow) created in daemon Step 4b after DB + config available
- [57-01]: JwtSecretManager + DatabasePolicyEngine exported from @waiaas/daemon (E2E harness needs them)
- [57-01]: argon2 as CLI devDependency (pnpm strict isolation)
- [57-01]: DB expires_at NOT checked by sessionAuth (JWT exp is authoritative, DB expires_at for admin listing only)
- [57-01]: Coverage audit tests in separate files (not appended to existing test files)

### Blockers/Concerns

- ~~jose (JWT) 패키지 미설치~~ -- RESOLVED in 52-01
- ~~SIWS/SIWE 검증 라이브러리 미설치~~ -- RESOLVED in 52-02 (sodium-native Ed25519 for Solana, SIWE deferred to v1.4)
- ~~Pre-existing CLI E2E test failures (4 tests)~~ -- RESOLVED in 57-01 (harness fixed with jwtSecretManager + masterPasswordHash)
- Pre-existing flaky lifecycle.test.ts (timer-sensitive BackgroundWorkers test) -- not blocking, unrelated to policy engine

## Session Continuity

Last session: 2026-02-10
Stopped at: Completed 57-01-PLAN.md
Resume file: None
