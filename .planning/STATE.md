---
gsd_state_version: 1.0
milestone: v29.8
milestone_name: Solana Perp DEX (Drift) + Perp 프레임워크
status: active
last_updated: "2026-03-02"
progress:
  total_phases: 299
  completed_phases: 296
  total_plans: 666
  completed_plans: 661
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-01)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 297 -- Perp 프레임워크 (IPerpProvider, PerpPositionTracker, MarginMonitor, PerpPolicyEvaluator)

## Current Position

Phase: 297 of 299 (Perp 프레임워크)
Plan: 2 of 2 in current phase (COMPLETE)
Status: Phase 297 complete
Last activity: 2026-03-02 -- Completed 297-02-PLAN.md (MarginMonitor + PerpPolicyEvaluator)

Progress: [██░░░░░░░░] 28% (2/7 plans)

## Performance Metrics

**Cumulative:** 74 milestones shipped, 296 phases completed, ~659 plans, ~1,877 reqs, ~5,595+ tests, ~225,248 LOC TS

## Accumulated Context

### Decisions

- v29.8 roadmap: 3 phases (Framework -> Provider -> Integration), follows Lending/Yield 프레임워크 패턴
- v29.8: @drift-labs/sdk @solana/web3.js 1.x 호환성은 DriftSdkWrapper에서 격리 (DRIFT-08)
- v29.8: DB migration 불필요 (defi_positions category='PERP' 이미 지원)
- v29.8: MarginMonitor는 기존 HealthFactorMonitor/IDeFiMonitor 패턴 재사용
- v29.8: Perp rules interfaces exported to satisfy noUnusedLocals (Plan 02 will consume)
- v29.8: close_position/add_margin classified as NON_SPENDING (returns user's own funds)
- v29.8: MarginMonitor uses marginRatio thresholds 0.30/0.15/0.10 (lower = more dangerous)
- v29.8: PERP_ALLOWED_MARKETS enforces default-deny for all 5 perp actions via suffix matching
- v29.8: PERP_MAX_LEVERAGE/PERP_MAX_POSITION_USD support DELAY tier for warning zones

### Pending Todos

None.

### Blockers/Concerns

- #164: IncomingTxMonitorService 환경 기본 네트워크만 구독 (MEDIUM, 별도 마일스톤)
- STO-03: Confirmation Worker RPC 콜백 미주입 (별도 마일스톤)
- @drift-labs/sdk가 @solana/web3.js 1.x 의존 -- @solana/kit 6.x 코드베이스와 타입 호환성 격리 필요

## Session Continuity

Last session: 2026-03-02
Stopped at: Completed 297-02-PLAN.md -- Phase 297 complete, ready for Phase 298
Resume command: /gsd:execute-phase 298
