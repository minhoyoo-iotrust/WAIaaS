# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 193 - Shared Component Tests

## Current Position

Phase: 193 of 193 (components-existing-threshold)
Plan: 5 of 5 total (1 of 2 in current phase)
Status: Executing
Last activity: 2026-02-19 -- Completed 193-01-PLAN.md

Progress: [#########.] 90%

## Performance Metrics

**Cumulative:** 42 milestones, 190 phases, 402 plans, 1,106 reqs, ~3,880 tests, ~146,464 LOC TS

**By Phase (v2.4.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 191 | 1/2 | 3min | 3min |
| 192 | 1/1 | 4min | 4min |
| 193 | 1/2 | 4min | 4min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full log in PROJECT.md and milestones/.

- v2.4.1: 커버리지 목표 70% (75% 이상은 과도, branches는 65% 유지)
- v2.4.1: 기능 변경 없이 순수 테스트 작성만 수행
- 191-01: Mock dirty-guard + unsaved-dialog for tab switching in security page tests
- 191-02: vi.useFakeTimers({ shouldAdvanceTime: true }) for polling tests
- 192-01: Modal confirm button via CSS selector (.modal-footer button.btn-danger) for ambiguous text
- 192-01: getAllByText for headings that also appear as form labels (Display Currency, Log Level)
- 193-01: Mock dirty-guard module in unsaved-dialog tests to isolate signal state
- 193-01: vi.useFakeTimers globally in settings-search tests for setTimeout handling
- 193-01: Mock settings-search-index with 3 entries covering tab/no-tab scenarios

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing 3 sessions.test.tsx failures -- not blocking

## Session Continuity

Last session: 2026-02-19
Stopped at: Completed 193-01-PLAN.md (shared component tests)
Resume file: None
