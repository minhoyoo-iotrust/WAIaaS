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
  completed_plans: 665
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-01)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 299 -- Integration (registerBuiltInProviders, Admin UI, skill.md)

## Current Position

Phase: 299 of 299 (Integration)
Plan: 1 of 2 in current phase
Status: Plan 299-01 complete
Last activity: 2026-03-02 -- Completed 299-01-PLAN.md (DriftPerpProvider registration + hot-reload)

Progress: [████████░░] 86% (6/7 plans)

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
- v29.8: DriftInstruction uses same structure as KaminoInstruction for SDK wrapper consistency
- v29.8: Mock instruction data uses UTF-8 encoding for string amounts (Drift uses strings, not bigint)
- v29.8: DriftSdkWrapper stores rpcUrl + subAccount for future real SDK integration
- v29.8: DriftPerpProvider config is readonly public (not private) to satisfy noUnusedLocals
- v29.8: marginRatioToStatus thresholds 0.30/0.15/0.10 match MarginMonitor from 297-02
- v29.8: DriftMarketData is separate class for testability (thin IDriftSdkWrapper wrapper)
- v29.8: IPositionProvider.getPositions uses assetId=null for perp positions (m29-00 section 5.3)
- v29.8: 81 unit tests for Drift provider -- follows kamino-provider.test.ts patterns exactly
- v29.8: DriftConfig factory uses only enabled+subAccount (policy keys consumed by MarginMonitor/PerpPolicyEvaluator, not provider)
- v29.8: pendle_yield missing from BUILTIN_NAMES was pre-existing bug, fixed alongside drift_perp addition

### Pending Todos

None.

### Blockers/Concerns

- #164: IncomingTxMonitorService 환경 기본 네트워크만 구독 (MEDIUM, 별도 마일스톤)
- STO-03: Confirmation Worker RPC 콜백 미주입 (별도 마일스톤)
- @drift-labs/sdk가 @solana/web3.js 1.x 의존 -- @solana/kit 6.x 코드베이스와 타입 호환성 격리 필요

## Session Continuity

Last session: 2026-03-02
Stopped at: Completed 299-01-PLAN.md -- DriftPerpProvider registration + hot-reload BUILTIN_NAMES
Resume command: /gsd:execute-phase 299
