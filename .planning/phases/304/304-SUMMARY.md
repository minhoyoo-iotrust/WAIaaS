---
phase: 304
plan: "304-01, 304-02"
subsystem: api, pipeline
tags: [dry-run, simulation, zod, openapi, sdk, mcp, policy-engine]

# Dependency graph
requires: []
provides:
  - DryRunSimulationResult Zod schema design
  - PipelineContext dryRun branch design with side-effect isolation
  - POST /v1/transactions/simulate endpoint spec (OpenAPI level)
  - SDK simulate() method spec
  - MCP simulate_transaction tool spec
  - Design doc update notes for docs 32, 33, 37, 38
affects: [Phase 308 (TX stats reference)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DryRunCollector pattern: collect stage results into intermediate object, assemble final response"
    - "Separate executeDryRun() method instead of dryRun flag in existing stages"
    - "HTTP 200 for all simulation results (business outcome in success field)"

key-files:
  created:
    - .planning/phases/304/PLAN-304-01.md
    - .planning/phases/304/PLAN-304-02.md
    - .planning/phases/304/DESIGN-SPEC.md
  modified: []

key-decisions:
  - "SIM-D01: Separate executeDryRun() method (not dryRun flag in existing stages) for code isolation"
  - "SIM-D02: Simulation failure converted to warning (partial results returned)"
  - "SIM-D03: Existing SimulationResult (chain-adapter.types.ts) unchanged"
  - "SIM-D10: Reuse TransactionRequestSchema for simulate input (copy-paste workflow)"
  - "SIM-D11: Policy denial returns HTTP 200 with success=false (separate HTTP status from business result)"
  - "SIM-D12: MCP tool named simulate_transaction (consistent with send_token pattern)"
  - "SIM-D16: Endpoint path /v1/transactions/simulate (namespace consistency)"

patterns-established:
  - "DryRunCollector: intermediate result collector for multi-stage pipeline simulation"
  - "HTTP 200 + success field: separate HTTP transport status from business outcome"

requirements-completed: [SIM-01, SIM-02, SIM-03, SIM-04]

# Metrics
duration: 10min
completed: 2026-03-03
---

# Phase 304: Transaction Dry-Run 설계 Summary

**DryRunSimulationResult 스키마 설계 (12 warning codes, policy/fee/balanceChanges/warnings 4-axis), PipelineContext dry-run Stage 1'->2'->3'->5a->5b 분기 + 부수 효과 격리, POST /v1/transactions/simulate OpenAPI 스펙, SDK simulate() + MCP simulate_transaction tool 확장 스펙**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-03T08:00:29Z
- **Completed:** 2026-03-03T08:10:08Z
- **Tasks:** 3 (PLAN-304-01, PLAN-304-02, DESIGN-SPEC)
- **Files created:** 3

## Accomplishments

- DryRunSimulationResultSchema Zod 스키마 설계 완료: policy(tier/allowed/reason), fee(estimatedFee/feeUsd), balanceChanges(asset/currentBalance/afterBalance), warnings(12 codes), simulation(logs/unitsConsumed), meta(chain/network/durationMs)
- PipelineContext dryRun 분기 설계: Stage 1'(validate only)→2'(auth check)→3'(evaluate only)→5a(build)→5b(simulate) 경로, 12가지 부수 효과 격리 보장 (DB/signing/notification/audit/EventBus)
- REST API POST /v1/transactions/simulate OpenAPI 수준 스펙: 요청(TransactionRequest 5-type 재사용), 응답(HTTP 200 고정, success 필드로 정책 결과 분리), 에러 코드(SIMULATION_TIMEOUT 신규)
- SDK simulate() 메서드: sendToken과 동일한 파라미터/사전검증, SimulateResponse 타입
- MCP simulate_transaction tool: send_token과 동일한 입력 구조, DryRunSimulationResult JSON 출력

## Task Commits

Each task was committed atomically:

1. **PLAN-304-01: SimulationResult schema + PipelineContext dryRun branch** - `8d95354e` (docs)
2. **PLAN-304-02: REST API + SDK/MCP extension specs** - `10ae2e9e` (docs -- note: actual hash is f7f52624)
3. **DESIGN-SPEC: Consolidated design specification** - `e965243d` (docs)

## Files Created

- `.planning/phases/304/PLAN-304-01.md` - SimulationResult Zod 스키마 + PipelineContext dryRun 분기 설계 (SIM-01, SIM-02)
- `.planning/phases/304/PLAN-304-02.md` - REST API + SDK/MCP 확장 스펙 + 설계 문서 갱신 사항 (SIM-03, SIM-04)
- `.planning/phases/304/DESIGN-SPEC.md` - 통합 설계 스펙 (전체 스키마, 인터페이스, 흐름, 에러, 테스트 시나리오)

## Decisions Made

1. **별도 executeDryRun() 메서드** (SIM-D01): 기존 executeSend() 코드 경로에 dryRun 분기를 넣는 대신 별도 메서드 추가. 기존 코드 비파괴, 테스트 격리, 동기 응답 패턴 차이.
2. **시뮬레이션 실패를 경고로 변환** (SIM-D02): 온체인 시뮬레이션이 실패해도 정책/잔액 정보는 유효하므로 부분 결과 반환.
3. **정책 거부도 HTTP 200** (SIM-D11): 시뮬레이션 요청 자체의 성공(HTTP status)과 트랜잭션 실행 가능 여부(success field)를 분리.
4. **TransactionRequestSchema 재사용** (SIM-D10): 에이전트가 sendToken 바디를 그대로 simulate에 전달 가능.
5. **Stage 3.5(Gas Condition) 완전 스킵** (SIM-D06): 가스 조건은 실행 시점 판단이므로 사전 시뮬레이션에서 무의미.
6. **SIMULATION_TIMEOUT만 신규 에러 코드** (SIM-D15): 기존 에러 코드 최대한 재사용.
7. **MCP tool 이름 simulate_transaction** (SIM-D12): 기존 send_token, sign_transaction 패턴 일관성.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required (design milestone).

## Next Phase Readiness

- Phase 304 설계 완료. 구현 마일스톤의 입력으로 사용 가능.
- Phase 305 (Audit Log Query API 설계)는 Phase 304에 대한 의존성 없음 -- 즉시 진행 가능.
- Phase 308 (Admin Stats + AutoStop Plugin)이 Phase 304의 TX 통계를 참조하므로 설계 스펙 참조 필요.

---
*Phase: 304*
*Completed: 2026-03-03*
