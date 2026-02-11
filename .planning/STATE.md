# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-11)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v1.3.2 Admin Web UI 구현 — Phase 67 complete

## Current Position

Phase: 67 of 70 (인증 + API 클라이언트 + 컴포넌트)
Plan: 2 of 2 in current phase
Status: Phase complete
Last activity: 2026-02-11 — Completed 67-02-PLAN.md (Layout + Components)

Progress: [████░░░░░░] 40%

## Performance Metrics

**Cumulative:** 16 milestones, 67 phases, 158 plans, 434 reqs, 784 tests, 33,929 LOC

**v1.3.2 Plan:**
- 5 phases (66-70), 10 plans, 22 requirements
- Target: Preact SPA 5 pages + 22 tests
- Completed: 4/10 plans

## Accumulated Context

### Decisions

Full log in PROJECT.md. v1.3.1 설계 결정 13건:
- Phase 64 (5건): masterAuth only, admin_timeout via status response, build artifacts git-ignored, CSP default-src 'none', no CSRF token
- Phase 65 (8건): 30s polling, inline forms, token one-time display, tier visualization, shutdown overlay priority, Zod-free validation, 68 error code mapping, CSS Variables dark mode ready

v1.3.2 구현 결정:
- Phase 66-01 (4건): All Preact/Vite deps as devDependencies, modulePreload polyfill disabled for CSP, base path /admin/, turbo explicit task overrides for build ordering
- Phase 66-02 (5건): CSP default-src 'none' strictest policy, ADMIN_STATIC_ROOT absolute path via import.meta.url, createRequire for version JSON import, admin_ui=false skips route registration (404), Kill Switch bypasses /admin and /admin/*
- Phase 67-01 (3건): Login uses direct fetch (not apiCall) to avoid circular auth store dependency, inline style objects for Preact components, module-level signals for single-instance Login form state
- Phase 67-02 (3건): Custom hash routing via signal + hashchange (no preact-router), Toast module-level signal vs CopyButton useSignal for per-instance state, error messages standalone duplicate for frontend independence

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing e2e-errors.test.ts failure -- OpenAPIHono side effect
- Kill switch state in-memory only (v1.3 DB 미저장)
- Pre-existing daemon build TS errors in notification-service.test.ts -- not blocking admin development

## Session Continuity

Last session: 2026-02-11T07:23:54Z
Stopped at: Completed 67-02-PLAN.md (Layout + Components)
Resume file: None
