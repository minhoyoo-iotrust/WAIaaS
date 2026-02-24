# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v28.4 — Liquid Staking (Lido + Jito)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-24 — Milestone v28.4 started

## Performance Metrics

**Cumulative:** 60 milestones, 253 phases completed, 544 plans, 1,485 reqs, ~5,000+ tests, ~189,000 LOC TS

**This milestone:** 0 phases, 0 plans, 0 requirements — Starting

## Accumulated Context

### Decisions

(New milestone — carry forward relevant decisions from v28.3)
- AsyncPollingService uses sequential processing (no Promise.all) to respect external API rate limits
- IAsyncStatusTracker 공통 인터페이스 + AsyncPollingService DB 기반 폴링 스케줄러 available (v28.3)
- resolve() 배열 순차 파이프라인 — ContractCallRequest[] 지원 (v28.2)
- provider-trust 정책 바이패스 — actionProvider 태그 시 CONTRACT_WHITELIST skip (v28.2)
- SettingsService SSoT — Admin Settings > Actions 페이지에서 빌트인 프로바이더 런타임 설정 (v28.2)

### Blockers/Concerns

- #164: IncomingTxMonitorService가 environment를 네트워크로 사용 — 전체 네트워크 미구독 (MEDIUM)

## Session Continuity

Last session: 2026-02-24
Stopped at: Milestone v28.4 initialized, defining requirements
Resume file: None
