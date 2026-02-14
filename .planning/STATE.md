# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 121 — MCP 안정성

## Current Position

Phase: 121 (2 of 5 in v1.4.8) — MCP 안정성
Plan: 1 of 1 in current phase
Status: Phase 121 complete
Last activity: 2026-02-15 — Phase 121 complete (MCP 안정성, 1/1 plans, 10 tests added)

Progress: [██░░░░░░░░] 25% (2/8 plans)

## Performance Metrics

**Cumulative:** 27 milestones, 119 phases, 259 plans, 711 reqs, 1,669 tests, ~175,480 LOC

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 120 | 01 | 6min | 1 (TDD) | 2 |
| 121 | 01 | 2min | 1 (TDD) | 4 |

## Accumulated Context

### Decisions

Full log in PROJECT.md.
- pushSchema 순서를 테이블 -> 마이그레이션 -> 인덱스 3단계로 분리 (MIGR-01 해결)
- v1 DB agents 테이블 존재 시 wallets 생성 스킵 (v3 마이그레이션 충돌 방지, MIGR-01b)
- shutdown 로직을 createShutdownHandler() 팩토리로 추출하여 DI 기반 테스트 가능하게 함
- shutdown 핸들러를 server.connect() 이전에 등록 -- stdin 즉시 닫힘 대비

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing 3 CLI E2E failures (E-07~09) -- daemon-harness adapter: param
- Pre-existing settings-service.test.ts (SETTING_DEFINITIONS count 32 vs 35)
- ~~MIGR-01 (pushSchema 순서) is HIGH priority -- 기존 DB에서 데몬 시작 차단~~ RESOLVED in 120-01

## Session Continuity

Last session: 2026-02-15
Stopped at: Phase 121 complete, ready to plan Phase 122
Resume file: None
