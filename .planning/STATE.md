# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-13)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 94 - Design Docs Verification (v1.4.2 용어 변경)

## Current Position

Phase: 94 (6 of 6 in v1.4.2) — Design Docs Verification
Plan: 2 of 2 complete
Status: Phase Complete
Last activity: 2026-02-13 — Plan 94-02 complete (IPolicyEngine/owner-state walletId rename + verification, 14 files)

Progress: [██████████] 100%

## Performance Metrics

**Cumulative:** 21 milestones, 88 phases, 197 plans, 552 reqs, 1,313+ tests, 65,074 LOC

**v1.4.2 Velocity:**
- Total plans completed: 12
- Total plans: 12

| Phase | Plan | Duration | Tasks | Files |
| ----- | ---- | -------- | ----- | ----- |
| 89    | 01   | 8min     | 2     | 4     |
| 90    | 01   | 4min     | 2     | 19    |
| 90    | 02   | 2min     | 2     | 2     |
| 91    | 01   | 20min    | 2     | 27    |
| 91    | 02   | 18min    | 2     | 38    |
| 91    | 03   | 6min     | 2     | 10    |
| 92    | 01   | 7min     | 2     | 21    |
| 92    | 02   | 3min     | 2     | 9     |
| 93    | 01   | 8min     | 2     | 15    |
| 94    | 01   | 16min    | 2     | 16    |
| 94    | 02   | 12min    | 2     | 14    |

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
- Core interfaces ILocalKeyStore + NotificationPayload now use walletId (IPolicyEngine still uses agentId)
- PipelineContext.agent field renamed to .wallet for consistency
- error-hints.ts: AGENT_NOT_FOUND -> WALLET_NOT_FOUND, /v1/agents -> /v1/wallets
- database-policy-engine.ts raw SQL agent_id -> wallet_id (missed in 91-01, fixed in 91-02)
- Notification test assertions use payload.walletId (core interface updated in 91-03)
- migration-runner.test.ts excluded from rename (tests v3 migration DDL correctness)
- Python __init__.py docstring kept as-is (service name WaaS, not entity name)
- Python conftest.py AGENT_ID -> WALLET_ID constant rename
- TS SDK error.test.ts AGENT_NOT_FOUND -> WALLET_NOT_FOUND for daemon consistency
- MCP: AgentContext -> WalletContext, withAgentPrefix -> withWalletPrefix
- MCP entrypoint: WAIAAS_AGENT_ID -> WAIAAS_WALLET_ID, WAIAAS_AGENT_NAME -> WAIAAS_WALLET_NAME
- CLI: --agent -> --wallet, /v1/agents -> /v1/wallets, fetchAgents -> fetchWallets
- slug.ts fallback 'agent' -> 'wallet'
- Admin UI wallet terminology matches backend /v1/wallets API (zero shimming)
- AI agent concept references preserved in design docs -- only code identifiers renamed
- Korean 에이전트 -> 지갑 where referring to managed entity, preserved where describing AI agent concept
- v1.4.2 project stats updated in README: 65,074 LOC, 1,313+ tests, 197 plans
- migrate.ts AGENT_SUSPENDED/AGENT_TERMINATED SQL strings are intentional migration code (excluded from sweep)
- schema.ts agent_id comment is intentional v1.4.2 migration history doc (excluded from sweep)
- dist/ directories contain stale compiled output -- source code is authoritative
- 3 CLI E2E failures pre-existing (daemon-harness uses old adapter: param, not adapterPool:)

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing e2e-errors.test.ts failure -- OpenAPIHono side effect

## Session Continuity

Last session: 2026-02-13
Stopped at: Completed 94-02-PLAN.md (Code verification + remaining renames — Phase 94 COMPLETE, v1.4.2 COMPLETE)
Resume file: None
