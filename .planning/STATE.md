# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v28.4 Phase 256 -- Staking API Async Tracking Interface Integration

## Current Position

Phase: 256 (3 of 3 in v28.4) (Staking API Async Tracking Interface Integration)
Plan: 3 of 3 in current phase (COMPLETE)
Status: Phase 256 complete -- all 3 plans done
Last activity: 2026-02-24 -- Completed quick task 1: Phase 257 gap closure (bridge_status + metadata persistence)

Progress: [██████████] 100%

## Performance Metrics

**Cumulative:** 61 milestones, 253 phases completed, 544 plans, 1,485 reqs, ~5,000+ tests, ~189,000 LOC TS

**This milestone:** 3 phases, 8 plans total, 25 requirements -- 8 plans complete

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
- Staking API route at /v1/wallet/staking (singular, sessionAuth) following existing wallet query patterns (v28.4)
- v1 balance estimation via transactions metadata aggregation, not RPC calls (v28.4)
- Hardcoded APY for v1: Lido ~3.5%, Jito ~7.5% (v28.4)
- Pending unstake detection via bridge_status='PENDING' column + provider metadata match (v28.4)
- Admin staking endpoint at /v1/admin/wallets/:id/staking (masterAuth) mirrors sessionAuth staking data for admin UI (v28.4)
- [Phase 257]: GAP-2 metadata UPDATE after Stage 1 (synchronous) ensures metadata available immediately for staking position queries
- [Phase 257]: GAP-1 bridge_status enrollment after Stage 6 (inside fire-and-forget) ensures only confirmed unstakes enter async tracking

### Blockers/Concerns

- #164: IncomingTxMonitorService가 environment를 네트워크로 사용 -- 전체 네트워크 미구독 (MEDIUM)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Phase 257 gap closure: bridge_status recording + actionProvider metadata persistence for staking pipeline | 2026-02-24 | 094d68b6 | [1-phase-257-gap-closure-bridge-status-reco](./quick/1-phase-257-gap-closure-bridge-status-reco/) |

## Session Continuity

Last session: 2026-02-24
Stopped at: Completed quick task 1: Phase 257 gap closure (bridge_status + metadata persistence)
Resume file: None
Resume instructions: Re-audit milestone v28.4 to verify gaps closed, then complete milestone.
