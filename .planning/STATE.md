# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v2.4 npm Trusted Publishing 전환 -- Phase 188 완료, Phase 189 준비

## Current Position

Phase: 188 of 190 (사전 준비 -- 완료)
Plan: 1 of 1 in current phase (complete)
Status: Phase 188 complete, ready for Phase 189
Last activity: 2026-02-19 — Phase 188 Plan 01 executed

Progress: [███░░░░░░░] 33%

## Performance Metrics

**Cumulative:** 41 milestones, 188 phases, 399 plans, 1,094 reqs, ~3,880 tests, ~145,784 LOC TS

**v2.4 Scope:** 3 phases, 4 plans (estimated), 12 requirements

## Accumulated Context

### Decisions

Full log in PROJECT.md and milestones/.

- v2.4: npm publish 직접 호출 (pnpm 위임 대신) -- OIDC 토큰 전달 경로 확실성
- v2.4: NPM_TOKEN은 OIDC 검증 완료 후에만 제거 -- 롤백 가능성 유지
- v2.4: publish-check 잡에서 --provenance 사용 금지 -- dry-run + provenance 비호환
- v2.4: homepage 필드는 provenance 범위 밖으로 유지 -- repository.url만 Sigstore에 사용
- v2.4: publish-check 잡에 npm 업그레이드 스텝 미추가 -- dry-run에 provenance 불필요

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing 3 sessions.test.tsx failures -- not blocking
- OIDC-01 (npmjs.com Trusted Publisher 등록)은 수동 웹 UI 작업 -- 코드 자동화 불가

## Session Continuity

Last session: 2026-02-19
Stopped at: Completed 188-01-PLAN.md
Resume file: .planning/phases/188-pre-setup/188-01-SUMMARY.md
