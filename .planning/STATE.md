# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-25)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v28.5 가스비 조건부 실행 -- Phase 258 complete, Phase 259 next

## Current Position

Phase: 259 of 259 (REST API + Admin + MCP + SDK 통합)
Plan: 259-01 of 2 (next: REST API gasCondition + Admin Settings + Admin UI)
Status: Phase 258 complete, ready for Phase 259
Last activity: 2026-02-25 -- 258-02 complete (GasConditionTracker + Worker + Settings + daemon lifecycle)

Progress: [█████░░░░░] 50%

## Performance Metrics

**Cumulative:** 62 milestones, 257 phases completed, 554 plans, 1,532 reqs, ~5,000+ tests, ~189,000 LOC TS

| Phase | Plan | Duration | Tasks | Files |
| ----- | ---- | -------- | ----- | ----- |
| 258   | 01   | 7min     | 5     | 11    |
| 258   | 02   | 25min    | 5     | 8     |

## Accumulated Context

### Decisions

- GAS_WAITING 상태는 v23 마이그레이션에서 이미 추가됨 -- DB 마이그레이션 불필요
- 가스 조건 평가는 Stage 3(정책 평가) 통과 후 수행 -- 정책 위반은 가스 대기 없이 즉시 거부
- GAS_WAITING 트랜잭션은 nonce를 실행 시점에 할당 (대기 진입 시 미할당)
- 배치 조회로 한 번의 RPC 호출로 가스 가격 확인 후 모든 대기 TX 일괄 평가
- Admin Settings(런타임) 5개 키로 운영 파라미터 조정 (config.toml 아님)
- gas_condition.* 설정 키가 미등록일 때 graceful fallback (try/catch + defaults) -- 258-02에서 등록 완료
- bridgeMetadata에 gasCondition 저장 (metadata 아님) -- AsyncPollingService의 tracker 라우팅 호환
- max_pending_count는 전역 GAS_WAITING 카운트 (지갑별 아님)
- GasConditionTracker는 raw JSON-RPC fetch 사용 (adapter 의존성 없음) -- rpcUrl은 bridgeMetadata에서 읽음
- 10s 가스 가격 캐시로 동일 폴링 사이클 내 중복 RPC 호출 방지
- gas-condition COMPLETED → GAS_WAITING→PENDING 전환 후 executeFromStage4로 파이프라인 재진입
- resumePipeline은 reservation 해제 안 함 -- 온체인 실행에 자금 필요
- executeFromStage4는 stage4Wait 건너뜀 -- 정책은 GAS_WAITING 진입 전 이미 평가됨

### Blockers/Concerns

- #164: IncomingTxMonitorService가 environment를 네트워크로 사용 -- 전체 네트워크 미구독 (MEDIUM)

## Session Continuity

Last session: 2026-02-25
Stopped at: Completed 258-02-PLAN.md (5 tasks, 5 commits)
Resume file: .planning/phases/258-gas-condition-core-pipeline/258-CONTEXT.md
Resume instructions: Phase 258 complete. Execute Phase 259 (REST API gasCondition + Admin Settings + MCP + SDK)
