# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-21)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 226 - Monitor Service + Resilience

## Current Position

Phase: 226 (3 of 6 in v27.1) (Monitor Service + Resilience)
Plan: 2 of 4 in current phase
Status: In Progress
Last activity: 2026-02-22 -- Completed 226-02 (SubscriptionMultiplexer connection sharing + reconnection)

Progress: [#######_________] 44% (7/16 plans)

## Performance Metrics

**Cumulative:** 51 milestones, 223 phases, 478 plans, 1,301 reqs, 4,396+ tests, ~145,704 LOC TS

**v27.1 Scope:** 6 phases, 16 plans, 30 requirements

## Accumulated Context

### Decisions

Recent from v27.0 design:
- IChainSubscriber는 IChainAdapter와 완전 분리 (stateless vs stateful)
- 큐 레벨 Map 기반 중복 제거는 필수 (설계 문서 "optional" 표기는 오류)
- EVM은 폴링 우선, Solana는 WebSocket 우선 (비대칭 전략)

From 224-01:
- IncomingTransaction: interface (chain-subscriber.types.ts) + Zod schema (incoming-transaction.schema.ts) 이중 정의 -- interface는 코드 계약, Zod는 검증/OpenAPI SSoT
- IncomingTransactionDto alias로 schemas/index.ts에서 이름 충돌 방지

From 224-02:
- v21 migration은 CREATE TABLE IF NOT EXISTS 사용 (pushSchema DDL 실행 순서와 호환)
- New table migrations use IF NOT EXISTS pattern (기존 v4, v5, v15, v16과 일관)

From 225-01:
- getTransaction requires explicit encoding: 'jsonParsed' in @solana/kit 6.0.1 TypeScript types
- generateId injected via constructor (DI) -- crypto.randomUUID() default, UUID v7 from Phase 226
- address() mocked as passthrough in subscriber tests for synthetic test addresses

From 225-02:
- EVM polling-first strategy: connect() no-op, waitForDisconnect() never-resolving Promise (D-06)
- 10-block cap per poll cycle (MAX_BLOCK_RANGE = 10n) prevents RPC provider limits
- Per-wallet error isolation in pollAll() -- console.warn on failure, continue other wallets

From 225-03:
- Duck-typed subscriber parameter (connect/waitForDisconnect) avoids circular dependency with IChainSubscriber
- 100ms floor clamp on calculateDelay prevents zero/negative delays from rounding

From 226-02:
- IChainSubscriber.subscribe() takes 4 params (walletId, address, network, onTransaction) -- plan's pseudo-code had 3 params
- reconnectLoop starts after initial waitForDisconnect resolves -- avoids double-connect on addWallet
- State change guard checks entry identity before updating -- prevents stale updates after removeWallet

### Blockers/Concerns

- @solana/kit logsNotifications reconnection 동작 미검증 (Phase 226에서 경험적 확인 필요)

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 226-02-PLAN.md
Resume file: None
