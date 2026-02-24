# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v28.4 Phase 256 -- Staking API Async Tracking Interface Integration

## Current Position

Phase: 256 (3 of 3 in v28.4) (Staking API Async Tracking Interface Integration)
Plan: 1 of 3 in current phase
Status: Plan 256-01 complete
Last activity: 2026-02-24 -- Plan 256-01 complete (LidoWithdrawalTracker + JitoEpochTracker + dynamic notification events)

Progress: [███████░░░] 67%

## Performance Metrics

**Cumulative:** 61 milestones, 253 phases completed, 544 plans, 1,485 reqs, ~5,000+ tests, ~189,000 LOC TS

**This milestone:** 3 phases, 7 plans (estimated), 25 requirements -- 6 plans complete

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
- Pure mathematical Ed25519 on-curve check (crypto.subtle importKey unreliable for on-curve validation in Node.js 22) (v28.4)
- parseSolAmount 9-decimal SOL->lamports conversion via string split + BigInt (v28.4)
- Zero external Solana SDK deps for PDA derivation, base58, ATA -- pure TypeScript (v28.4)
- Jito mainnet-only addresses, testnet falls back to mainnet (v28.4)
- Jito registration mainnet-only: getJitoAddresses('mainnet') always, no environment switching unlike Lido (v28.4)
- Jito admin override: empty string default falls back to JITO_MAINNET_ADDRESSES (v28.4)
- Dynamic notificationEvent in AsyncPollingService: tracker details.notificationEvent overrides hardcoded event names, with fallback to BRIDGE_* defaults (v28.4)
- Metadata-based v1 tracking: Lido/Jito trackers use metadata.status field, not on-chain queries, for COMPLETED detection (v28.4)
- Staking trackers use TIMEOUT terminal transition (no two-phase monitoring unlike bridge trackers) (v28.4)

### Blockers/Concerns

- #164: IncomingTxMonitorService가 environment를 네트워크로 사용 -- 전체 네트워크 미구독 (MEDIUM)

## Session Continuity

Last session: 2026-02-24
Stopped at: Completed 256-01-PLAN.md (LidoWithdrawalTracker + JitoEpochTracker + notification events + dynamic dispatch). Next: 256-02 (Staking REST API), then 256-03 (MCP + Admin UI).
Resume file: None
Resume instructions: Execute plans 256-02 and 256-03, then milestone audit.
