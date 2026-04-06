---
phase: 34-자금-회수-보안-분기-설계
plan: 01
subsystem: api
tags: [withdraw, sweepAll, solana, rest-api, domain-service, partial-failure, http-207]

# Dependency graph
requires:
  - phase: 31-데이터-모델-타입-기반-설계
    provides: sweepAll 시그니처, SweepResult 타입, IChainAdapter 20 메서드
  - phase: 32-owner-생명주기-설계
    provides: OwnerState LOCKED 검증, H-02 withdraw 방어 메커니즘
  - phase: 33-정책-다운그레이드-알림-설계
    provides: 감사 로그 이벤트 패턴, Owner 관련 알림 구조
provides:
  - POST /v1/owner/agents/:agentId/withdraw API 완전 스펙 (37-rest-api)
  - WithdrawService 도메인 서비스 설계 (scope all/native 분기)
  - sweepAll Solana 4단계 실행 순서 상세 (27-chain-adapter)
  - scope native WithdrawService 로직 (getBalance - estimateFee)
  - WITHDRAW 도메인 에러 코드 4개 (NO_OWNER, WITHDRAW_LOCKED_ONLY, SWEEP_TOTAL_FAILURE, INSUFFICIENT_FOR_FEE)
  - 부분 실패 처리 (배치 -> 개별 fallback -> failed 배열 -> HTTP 207)
  - 감사 로그 이벤트 3종 (FUND_WITHDRAWN, FUND_PARTIALLY_WITHDRAWN, FUND_WITHDRAWAL_FAILED)
affects: [35-DX-CLI-설계, 구현 Phase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "WithdrawService 도메인 서비스: OwnerState 검증 -> scope 분기 -> sweepAll/sendNative -> HTTP 매핑"
    - "HTTP 207 Multi-Status 부분 실패 패턴: failed.length > 0 && transactions.length > 0"
    - "sweepAll 배치 실패 fallback: batch -> individual -> failed 배열"

key-files:
  created: []
  modified:
    - ".planning/deliverables/37-rest-api-complete-spec.md"
    - ".planning/deliverables/27-chain-adapter-interface.md"

key-decisions:
  - "withdraw API는 masterAuth(implicit)만 사용 -- 수신 주소 owner_address 고정으로 ownerAuth 불필요 (v0.8 §5.2)"
  - "scope 분기는 WithdrawService 수준 -- IChainAdapter.sweepAll에 scope 파라미터 추가하지 않음 (31-02 결정)"
  - "WITHDRAW_LOCKED_ONLY 에러 코드 신설 -- 유예 구간(GRACE) + Owner 없음(NONE) 모두 403 거부"
  - "WITHDRAW 도메인 에러 4개 신설 + AGENT 도메인 기존 코드 2개 재사용 (중복 정의 금지)"
  - "Kill Switch 상태 withdraw는 Open Question -- 방안 A(허용 목록 추가) vs 방안 B(CLI 직접 실행) 구현 시 결정"
  - "감사 로그 3종: FUND_WITHDRAWN(성공), FUND_PARTIALLY_WITHDRAWN(부분), FUND_WITHDRAWAL_FAILED(전체 실패)"

patterns-established:
  - "WithdrawService 도메인 서비스 패턴: OwnerLifecycleService와 동일한 서비스 레이어 구조"
  - "HTTP 207 Multi-Status 응답: SweepResult.failed.length > 0 이면 207, 전부 실패 시 500"
  - "sweepAll 4단계 실행: getAssets -> SPL 배치 -> closeAccount rent 회수 -> SOL 마지막"
  - "scope native: IChainAdapter 기존 메서드 3개 조합 (신규 메서드 없음)"

# Metrics
duration: 8min
completed: 2026-02-09
---

# Phase 34 Plan 01: Withdraw API + WithdrawService + sweepAll 실행 상세 Summary

**POST /v1/owner/agents/:agentId/withdraw API 완전 스펙(요청/응답/에러/인증) + WithdrawService 도메인 서비스(scope all/native 분기) + sweepAll Solana 4단계 실행 순서 + 부분 실패 HTTP 207 처리 설계**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-09T01:55:05Z
- **Completed:** 2026-02-09T02:03:09Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- POST /v1/owner/agents/:agentId/withdraw API 엔드포인트 완전 스펙 (Zod 요청/응답 스키마, HTTP 200/207/403/404/500, masterAuth implicit)
- WithdrawService 도메인 서비스 설계 (OwnerState LOCKED 검증 -> scope all/native 분기 -> IChainAdapter 호출 -> SweepResult->HTTP 매핑 -> 감사 로그)
- sweepAll Solana 4단계 실행 순서 상세화 (getAssets -> SPL 배치 transfer+closeAccount -> SOL 마지막 전송)
- 부분 실패 처리 체계 (배치 실패 -> 개별 fallback -> failed 배열 -> HTTP 207 Multi-Status)
- WITHDRAW 도메인 에러 코드 4개 신설 (NO_OWNER, WITHDRAW_LOCKED_ONLY, SWEEP_TOTAL_FAILURE, INSUFFICIENT_FOR_FEE)
- 감사 로그 이벤트 3종 정의 (FUND_WITHDRAWN, FUND_PARTIALLY_WITHDRAWN, FUND_WITHDRAWAL_FAILED)
- 인증 맵 업데이트 (37 -> 38 엔드포인트, masterAuth implicit)
- Kill Switch withdraw Open Question 문서화 (방안 A/B)

## Task Commits

Each task was committed atomically:

1. **Task 1: withdraw API endpoint + WithdrawService design in 37-rest-api** - `32b6dbd` (feat)
2. **Task 2: sweepAll Solana execution detail + scope native in 27-chain-adapter** - `561b7f7` (feat)

**Plan metadata:** `c9592f7` (docs: complete plan)

## Files Created/Modified

- `.planning/deliverables/37-rest-api-complete-spec.md` - withdraw API 엔드포인트 (§8.18), WithdrawService 서비스 설계 (§8.18.1), Kill Switch Open Question (§8.18.2), WITHDRAW 에러 코드 (§10.9), 인증 맵/엔드포인트 맵 업데이트
- `.planning/deliverables/27-chain-adapter-interface.md` - sweepAll Solana 4단계 실행 순서 (§6.11.1-6.11.4), scope native WithdrawService 로직 (§6.11.5), EVM sweepAll 참고 메모 (§6.11.6)

## Decisions Made

1. **withdraw API masterAuth(implicit)만 사용:** 수신 주소가 agents.owner_address로 고정되므로 ownerAuth 불필요. 공격자가 masterAuth를 탈취해도 자금은 Owner 지갑으로만 이동 (v0.8 §5.2 근거).

2. **scope 분기는 WithdrawService 수준:** IChainAdapter.sweepAll()은 항상 전량 회수하며 scope 파라미터를 받지 않는다. scope "native"는 WithdrawService에서 기존 getBalance+estimateFee+sendNative 조합으로 처리 (31-02 결정 준수).

3. **WITHDRAW 에러 코드 4개 신설:** NO_OWNER(404), WITHDRAW_LOCKED_ONLY(403), SWEEP_TOTAL_FAILURE(500), INSUFFICIENT_FOR_FEE(500). AGENT_NOT_FOUND, AGENT_SUSPENDED는 기존 AGENT 도메인 코드 재사용 (중복 정의 금지).

4. **Kill Switch withdraw 구현 이연:** 방안 A(killSwitchGuard 허용 목록 4->5개) vs 방안 B(CLI 직접 실행)을 문서화하고 구현 시 결정. Phase 35 DX에서 CLI withdraw 명령 설계 시 함께 결정.

5. **감사 로그 3종 분리:** FUND_WITHDRAWN(info, 전량 성공), FUND_PARTIALLY_WITHDRAWN(warning, 부분 성공), FUND_WITHDRAWAL_FAILED(error, 전체 실패). 기존 33-02 알림 이벤트 패턴과 일관.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Requirements Mapping

| 요구사항 | 충족 | 근거 |
|---------|------|------|
| WITHDRAW-01 | Yes | POST /v1/owner/agents/:agentId/withdraw API 스펙 (37 §8.18) |
| WITHDRAW-02 | Yes | 수신 주소 owner_address 고정 + ownerAuth 불필요 근거 (37 §8.18) |
| WITHDRAW-03 | Yes | scope "all" 전량 회수 (37 §8.18 + 27 §6.11.4) |
| WITHDRAW-04 | Yes | scope "native" 네이티브만 (37 §8.18 + 27 §6.11.5) |
| WITHDRAW-05 | Yes | HTTP 207 + failed 배열 (37 §8.18 에러 코드 매트릭스) |
| WITHDRAW-07 | Yes | SOL 마지막 전송 (27 §6.11.2 근거 명시) |
| WITHDRAW-08 | Yes | 유예 구간 비활성화 WITHDRAW_LOCKED_ONLY (37 §8.18 보안 근거) |

## Next Phase Readiness

- Plan 34-02 (Kill Switch Owner 분기 + 세션 갱신 Owner 분기) 실행 준비 완료
- withdraw API 스펙이 확정되었으므로 Phase 35 DX에서 CLI withdraw 명령 설계 가능
- Kill Switch withdraw Open Question은 Phase 35에서 CLI 명령 설계 시 함께 결정
- 총 에러 코드 64개 (v0.8 WITHDRAW 4개 추가)

## Self-Check: PASSED

---
*Phase: 34-자금-회수-보안-분기-설계*
*Completed: 2026-02-09*
