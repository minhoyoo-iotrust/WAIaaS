# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-10)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v1.3 Phase 60 알림 시스템 완료 -> Phase 61 TypeScript SDK

## Current Position

Phase: 60 of 63 (알림 시스템)
Plan: 2 of 2 in current phase (phase complete)
Status: Phase complete
Last activity: 2026-02-11 -- Completed 60-02-PLAN.md (NotificationService orchestrator + lifecycle integration)

Progress: [██████░░░░] 55% (6/11 plans)

## Performance Metrics

**Cumulative:** 14 milestones, 60 phases, 146 plans, 367 reqs, 591 tests, 28,000+ LOC

**v1.3 Velocity:**
- Plans completed: 6
- Average duration: 9.7min
- Total execution time: 58min

**v1.2 Velocity (reference):**
- Total plans completed: 13
- Average duration: 5.7min
- Total execution time: 74min

## Accumulated Context

### Decisions

Full log in PROJECT.md. Key decisions for v1.3:

- OpenAPIHono 전면 전환 (@hono/zod-openapi): 기존 18 라우트 리팩터링 + 신규 15 작성
- getAssets() v1.3 선행 구현: doc 57에서 getAssets만 당김, estimateFee는 v1.4 유지
- TS SDK 0 외부 의존성 (Node.js 22 내장 fetch), Python SDK httpx + Pydantic v2
- MCP SessionManager eager init (서버 시작 시 즉시 토큰 로드 + 타이머 등록)
- 알림 채널 native fetch 전용 (외부 Bot 프레임워크 미사용)
- config.toml 알림 키 8개 추가 (17->25키): locale, rate_limit_rpm 포함
- Hard-coded SPL_TOKEN_PROGRAM_ID (avoids @solana-program/token dependency)
- AssetInfo.symbol/name empty for SPL tokens (Metaplex metadata = v1.4+)
- AssetInfoSchema.balance is string for JSON bigint serialization
- @hono/zod-openapi v0.19.10 선택 (v1.x는 zod@^4.0.0 필요, 프로젝트는 zod@3.x)
- openApiValidationHook defaultHook으로 WAIaaSError 포맷 보존
- Pending tx filter = PENDING + QUEUED (DELAYED/PENDING_APPROVAL 미존재)
- Cursor pagination uses UUID v7 ID column (not createdAt)
- Hono wildcard * does not match base path -- explicit sessionAuth on /v1/transactions required
- Error hint 32개 (31이 아닌 32): RATE_LIMIT_EXCEEDED 포함. AI agent self-recovery용 resolveHint()
- Admin 경로 (/v1/admin/*) kill switch guard bypass: 비상 관리 필수
- Kill switch state in-memory 관리 (v1.3에서는 DB 미저장)
- Drizzle timestamp 컬럼 비교 시 integer 직접 비교 (Date 객체 사용 시 SQLite 오류)
- Notification templates: {variable} 문자열 플레이스홀더 (JS 템플릿 리터럴 아님) for cross-language i18n safety
- Discord mock: Node.js Response constructor rejects 204+body, use status 200 in tests
- Fallback mode logCriticalFailure: errors field is 'All channels failed' (not individual errors)
- Config locale/rate_limit_rpm in DaemonConfigSchema.notifications (not core ConfigSchema)

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts (timer-sensitive BackgroundWorkers test) -- not blocking
- Pre-existing @waiaas/cli e2e-errors.test.ts failure (expects 404, gets 401) -- likely from 58-01 OpenAPIHono work

## Session Continuity

Last session: 2026-02-11
Stopped at: Completed 60-02-PLAN.md (NotificationService orchestrator + lifecycle integration)
Resume file: None
