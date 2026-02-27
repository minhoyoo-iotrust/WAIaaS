---
gsd_state_version: 1.0
milestone: v29.3
milestone_name: 기본 지갑/기본 네트워크 개념 제거
status: defining_requirements
last_updated: "2026-02-27T06:00:00.000Z"
progress:
  total_phases: 278
  completed_phases: 278
  total_plans: 371
  completed_plans: 371
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v29.3 기본 지갑/기본 네트워크 개념 제거

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-27 — Milestone v29.3 started

## Performance Metrics

**Cumulative:** 68 milestones (67 shipped + 1 archived), 278 phases completed, ~600 plans, ~1,696 reqs, ~5,000+ tests, ~180,194 LOC TS

## Accumulated Context

### Decisions

- D1: manual hex ABI encoding (Lido 패턴 준수, viem ABI 의존 없음)
- D2: IRpcCaller DI for testability (Provider 클래스에 주입)
- D3: 적응형 폴링 (HF < 1.5 → 1분, otherwise 5분)
- D4: 비지출 분류 (supply/repay/withdraw → SPENDING_LIMIT 미차감)
- D5: SESSION_IDLE 알림 전환 (#204, 세션 해지 대신 알림)

### Research Flags

- C1: ERC-20 approve race condition -- USDT-like tokens require zero-first approve; multi-step resolve must annotate both elements with actionProvider
- C2: HF 18-decimal precision -- bigint comparisons only (1_200_000_000_000_000_000n), never Number conversion for safety-critical checks
- C3: Position sync drift -- DB is cache of on-chain truth, force sync after Stage 6 confirms lending tx
- C4: CONTRACT_WHITELIST bypass -- both elements of [approveReq, actionReq] must carry actionProvider metadata
- M6: SPENDING_LIMIT classification -- supply/repay/withdraw are non-spending; only borrow counts

### Blockers/Concerns

- #164: IncomingTxMonitorService 환경 기본 네트워크만 구독 (MEDIUM, 기존 이슈)

## Session Continuity

Last session: 2026-02-27
Stopped at: Starting milestone v29.3
Resume file: None
