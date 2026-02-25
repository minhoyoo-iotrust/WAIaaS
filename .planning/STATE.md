# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-25)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 267 -- Push Relay Payload Transform

## Current Position

Phase: 3 of 3 (Push Relay Payload Transform)
Plan: 0 of 2 in current phase
Status: Ready to plan
Last activity: 2026-02-26 -- Phase 266 completed (Auto-Setup Orchestration + Admin UI)

Progress: [██████░░░░] 67%

## Performance Metrics

**Cumulative:** 64 milestones, 266 phases completed, ~564 plans, ~1,592 reqs, ~5,000+ tests, ~190,000 LOC TS

## Accumulated Context

### Decisions

- BUILTIN_PRESETS registry in @waiaas/core with D'CENT preset (approval_method: walletconnect)
- DB v24 migration adds wallet_type nullable TEXT column to wallets table
- wallet_type Zod validation rejects unknown presets at schema level (400 error)
- Preset approval_method overrides manual approval_method when both provided (with warning)
- WalletLinkRegistry created in server.ts (not daemon.ts) to avoid restructuring lifecycle
- Auto-setup is optional (deps.settingsService && deps.walletLinkRegistry guard) for backward compat
- WalletConnect approval method skips preferred_channel setting (WC is not a signing SDK channel)
- WALLET_PRESETS defined as static constant in Admin SPA (cannot import @waiaas/core directly)
- Dropdown only shown when ownerState is NONE (first registration, not address edits)

### Blockers/Concerns

- #164: IncomingTxMonitorService 환경 기본 네트워크만 구독 (MEDIUM, 기존 이슈)

## Session Continuity

Last session: 2026-02-26
Stopped at: Phase 266 complete. Phase 267 ready to plan.
Resume file: None
