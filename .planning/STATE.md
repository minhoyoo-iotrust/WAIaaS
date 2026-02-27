---
gsd_state_version: 1.0
milestone: v29.3
milestone_name: 기본 지갑/기본 네트워크 개념 제거
status: complete
last_updated: "2026-02-27T14:00:00.000Z"
progress:
  total_phases: 282
  completed_phases: 282
  total_plans: 383
  completed_plans: 383
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v29.3 기본 지갑/기본 네트워크 개념 제거 -- COMPLETE

## Current Position

Phase: 282 of 282 (E2E 검증 + 기존 테스트 수정)
Plan: 2 of 2 in current phase
Status: Complete
Last activity: 2026-02-27 -- Phase 282 executed (12 E2E tests, 46 test files fixed, 3,397 tests pass)

Progress: [████████████████████████████████] 100%

## Performance Metrics

**Cumulative:** 68 milestones (68 shipped), 282 phases completed, ~610 plans, ~1,759 reqs, ~5,000+ tests, ~180,194 LOC TS

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
- [Phase 280]: JWT payload minimal: sub/iat/exp only, old wlt claims silently ignored
- [Phase 280-03]: BalanceMonitor dedup key: walletId:network (per-network tracking)
- [Phase 280-03]: ownerAuth two-pass lookup: wallets table first, then transactions table for tx approve/reject
- [Phase 280-03]: rpc.evm_default_network completely removed from settings/config/hot-reload
- [Phase 281-02]: get-tokens.ts has no wallet_id (network-scoped query, not wallet-scoped)
- [Phase 281-02]: sign-transaction.ts network pattern normalized from 'Omit to use wallet default' to standard pattern
- [Phase 281-01]: Clean removal without backward compat shims (pre-release stage)
- [Phase 281-01]: WalletNetworkInfo kept with only network field (still used by getWalletInfo)
- [Phase 281]: WalletDetail interface: removed defaultNetwork field (API no longer returns it)
- [Phase 281]: Skill files: standardized on 'Required for EVM wallets; auto-resolved for Solana' network pattern
- [Phase 282]: E2E tests verify all 8 behavioral changes end-to-end via full HTTP stack
- [Phase 282]: 46 existing test files cleaned: defaultNetwork, isDefault, is_default, default_network removed

### Research Flags

None -- 이 마일스톤은 기존 기능 제거이므로 연구 불필요.

### Blockers/Concerns

- #164: IncomingTxMonitorService 환경 기본 네트워크만 구독 (MEDIUM, 기존 이슈)

## Session Continuity

Last session: 2026-02-27
Stopped at: v29.3 milestone complete. All 4 phases (279-282) shipped. Ready for milestone archive + next milestone.
Resume file: None
Resume command: /gsd:complete-milestone
