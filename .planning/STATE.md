---
gsd_state_version: 1.0
milestone: v29.3
milestone_name: 기본 지갑/기본 네트워크 개념 제거
status: ready_to_plan
last_updated: "2026-02-27T12:00:00.000Z"
progress:
  total_phases: 282
  completed_phases: 279
  total_plans: 381
  completed_plans: 373
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v29.3 기본 지갑/기본 네트워크 개념 제거 -- Phase 280

## Current Position

Phase: 280 of 282 (JWT/인증 + API 엔드포인트 + 파이프라인/인프라 + Admin Settings)
Plan: 2 of 3 in current phase
Status: Executing
Last activity: 2026-02-27 -- Plan 280-02 complete (API route endpoints deleted, defaultNetwork/isDefault removed)

Progress: [==============================░░] 95%

## Performance Metrics

**Cumulative:** 68 milestones (67 shipped + 1 in progress), 278 phases completed, ~600 plans, ~1,696 reqs, ~5,000+ tests, ~180,194 LOC TS

## Accumulated Context

### Decisions

- D1: 단일 지갑 세션 walletId 생략 허용 (자동 해석, DX 우선)
- D2: Solana 단일 네트워크 자동 해석, EVM 필수 (환경당 네트워크 수 기반)
- D3: WALLET_ID_REQUIRED / NETWORK_REQUIRED 전용 에러 코드 (VALIDATION_ERROR와 구분)
- D4: JWT wlt claim 제거 (기본 지갑 불필요, 토큰 크기 절감)
- D5: 하위 호환 레이어 없이 깔끔한 제거 (pre-release 단계)
- D6: getDefaultNetwork -> getSingleNetwork 리네임 + EVM null 반환
- D7: BalanceMonitor 전체 네트워크 순회 (IncomingTxMonitor 패턴)
- [Phase 279]: Migration v27 uses 12-step table recreation for both session_wallets and wallets
- [Phase 279]: resolveWalletId queries session_wallets at resolution time (not JWT-cached)
- [Phase 279]: resolveNetwork 4->3 param signature change (breaking, callers fixed Phase 280)
- [Phase 280-02]: Wallet creation uses getSingleNetwork ?? first network for key generation
- [Phase 280-02]: NETWORK_REQUIRED error for EVM balance/assets queries without network param
- [Phase 280-02]: Cascade defense simplified (no isDefault promotion on wallet termination)

### Research Flags

None -- 이 마일스톤은 기존 기능 제거이므로 연구 불필요.

### Blockers/Concerns

- #164: IncomingTxMonitorService 환경 기본 네트워크만 구독 (MEDIUM, 기존 이슈)

## Session Continuity

Last session: 2026-02-27
Stopped at: Completed 280-02-PLAN.md
Resume file: None
