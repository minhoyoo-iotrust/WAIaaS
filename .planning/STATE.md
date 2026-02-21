# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-21)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 225 - Chain Subscriber Implementations

## Current Position

Phase: 225 (2 of 6 in v27.1) (Chain Subscriber Implementations)
Plan: 3 of 3 in current phase
Status: In Progress
Last activity: 2026-02-22 -- Completed 225-03 (ConnectionState 3-state machine + reconnectLoop)

Progress: [#####___________] 31% (5/16 plans)

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

From 225-03:
- Duck-typed subscriber parameter (connect/waitForDisconnect) avoids circular dependency with IChainSubscriber
- 100ms floor clamp on calculateDelay prevents zero/negative delays from rounding

### Blockers/Concerns

- @solana/kit logsNotifications reconnection 동작 미검증 (Phase 226에서 경험적 확인 필요)

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 225-03-PLAN.md
Resume file: None
