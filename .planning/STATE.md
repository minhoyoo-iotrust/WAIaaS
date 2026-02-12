# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-13)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 91 - 데몬 API + JWT + Config (v1.4.2 용어 변경)

## Current Position

Phase: 91 (3 of 6 in v1.4.2) — 데몬 API + JWT + Config
Plan: 1 of 2 complete
Status: Executing
Last activity: 2026-02-13 — Plan 91-01 complete (27 files renamed, tsc passes)

Progress: [████░░░░░░] 40%

## Performance Metrics

**Cumulative:** 21 milestones, 88 phases, 197 plans, 552 reqs, 1,313+ tests, 65,074 LOC

**v1.4.2 Velocity:**
- Total plans completed: 4
- Total plans: 10

| Phase | Plan | Duration | Tasks | Files |
| ----- | ---- | -------- | ----- | ----- |
| 89    | 01   | 8min     | 2     | 4     |
| 90    | 01   | 4min     | 2     | 19    |
| 90    | 02   | 2min     | 2     | 2     |
| 91    | 01   | 20min    | 2     | 27    |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full log in PROJECT.md.
Recent decisions for v1.4.2:
- 엔티티 이름 `wallet` 확정 (서비스명 WaaS와 일치)
- API v1 유지 (외부 소비자 없음, breaking change 허용)
- 하위 호환 shim 미제공 (깔끔하게 일괄 변경)
- MCP 기존 토큰 폐기 + 재설정 안내 (JWT claim 변경으로 무효화)
- DDL uses latest names (wallets/wallet_id), pushSchema records LATEST_SCHEMA_VERSION for fresh DBs
- SQLite ALTER TABLE RENAME does not rename indexes -- explicit DROP INDEX required
- AGENT_STATUSES import kept in schema.ts (Phase 90 renames) -- DONE in 90-01
- wallets as agents backward-compat alias in index.ts (removed Phase 91)
- i18n en/ko updated: wallet not found/suspended/terminated messages
- Notification template uses {walletId} placeholder (all 21 events updated)
- Core tests (5 files, 137 tests) all updated to wallet terminology
- Korean particle correction: 지갑 {walletId}이 (consonant ending)
- Error code count comment fixed 67 -> 68 in i18n files
- walletCrudRoutes naming avoids collision with existing walletRoutes function
- Core interfaces (ILocalKeyStore, IPolicyEngine, NotificationPayload) keep agentId -- daemon maps at boundary
- PipelineContext.agent field renamed to .wallet for consistency
- error-hints.ts: AGENT_NOT_FOUND -> WALLET_NOT_FOUND, /v1/agents -> /v1/wallets

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing e2e-errors.test.ts failure -- OpenAPIHono side effect

## Session Continuity

Last session: 2026-02-13
Stopped at: Completed 91-01-PLAN.md (daemon API/JWT/config wallet rename)
Resume file: None
