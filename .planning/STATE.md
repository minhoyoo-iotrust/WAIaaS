# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v28.4 Phase 255 -- Jito Solana Staking Provider

## Current Position

Phase: 255 (2 of 3 in v28.4) (Jito Solana Staking Provider)
Plan: 0 of 2 in current phase
Status: Planned, ready to execute
Last activity: 2026-02-24 -- Phase 254 complete (gap fixed: environment key), Phase 255 planned (2 plans, verified)

Progress: [███░░░░░░░] 33%

## Performance Metrics

**Cumulative:** 61 milestones, 253 phases completed, 544 plans, 1,485 reqs, ~5,000+ tests, ~189,000 LOC TS

**This milestone:** 3 phases, 7 plans (estimated), 25 requirements -- 2 plans complete

## Accumulated Context

### Decisions

- IAsyncStatusTracker + AsyncPollingService DB 기반 폴링 스케줄러 available (v28.3)
- resolve() 배열 순차 파이프라인 -- ContractCallRequest[] 지원 (v28.2)
- provider-trust 정책 바이패스 -- actionProvider 태그 시 CONTRACT_WHITELIST skip (v28.2)
- SettingsService SSoT -- Admin Settings > Actions 페이지에서 빌트인 프로바이더 런타임 설정 (v28.2)
- AsyncPollingService uses sequential processing (no Promise.all) to respect external API rate limits (v28.3)
- Lido manual ABI encoding (no viem at provider level) following zerox-swap pattern (v28.4)
- parseEthAmount decimal-to-wei via string split + BigInt for precise arithmetic (v28.4)
- Lido environment-based address switching: rpc.evm_default_network + deriveEnvironment() for mainnet/Holesky (v28.4 — fixed from settingsReader.get('environment') which throws for unknown key)
- Lido admin override pattern: empty string default falls back to environment-derived address (v28.4)

### Blockers/Concerns

- #164: IncomingTxMonitorService가 environment를 네트워크로 사용 -- 전체 네트워크 미구독 (MEDIUM)

## Session Continuity

Last session: 2026-02-24
Stopped at: Phase 255 planned and verified (2 plans in 2 waves). Next: execute Phase 255, then plan+execute Phase 256, then milestone audit.
Resume file: None
Resume instructions: /gsd:execute-phase 255, then /gsd:plan-phase 256, then /gsd:execute-phase 256, then /gsd:audit-milestone
