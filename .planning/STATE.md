# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-25)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v28.5 가스비 조건부 실행 -- Phase 258 GasCondition 코어 파이프라인

## Current Position

Phase: 258 of 259 (GasCondition 코어 파이프라인)
Plan: 258-02 of 2 (next: GasConditionTracker + Worker + Settings)
Status: Executing phase 258
Last activity: 2026-02-25 -- 258-01 complete (pipeline stage 3.5 + tests), 258-02 next

Progress: [██░░░░░░░░] 25%

## Performance Metrics

**Cumulative:** 62 milestones, 257 phases completed, 552 plans, 1,532 reqs, ~5,000+ tests, ~189,000 LOC TS

## Accumulated Context

### Decisions

- GAS_WAITING 상태는 v23 마이그레이션에서 이미 추가됨 -- DB 마이그레이션 불필요
- 가스 조건 평가는 Stage 3(정책 평가) 통과 후 수행 -- 정책 위반은 가스 대기 없이 즉시 거부
- GAS_WAITING 트랜잭션은 nonce를 실행 시점에 할당 (대기 진입 시 미할당)
- 배치 조회로 한 번의 RPC 호출로 가스 가격 확인 후 모든 대기 TX 일괄 평가
- Admin Settings(런타임) 5개 키로 운영 파라미터 조정 (config.toml 아님)
- gas_condition.* 설정 키가 미등록일 때 graceful fallback (try/catch + defaults) -- 258-02에서 등록 예정
- bridgeMetadata에 gasCondition 저장 (metadata 아님) -- AsyncPollingService의 tracker 라우팅 호환
- max_pending_count는 전역 GAS_WAITING 카운트 (지갑별 아님)

### Blockers/Concerns

- #164: IncomingTxMonitorService가 environment를 네트워크로 사용 -- 전체 네트워크 미구독 (MEDIUM)

## Session Continuity

Last session: 2026-02-25
Stopped at: Completed 258-01-PLAN.md (5 tasks, 3 commits)
Resume file: .planning/phases/258-gas-condition-core-pipeline/258-CONTEXT.md
Resume instructions: Execute 258-02 (GasConditionTracker + AsyncPolling + Settings 5 keys + daemon lifecycle)
