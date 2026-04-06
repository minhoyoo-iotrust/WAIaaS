---
phase: 23-transaction-type-extension
plan: 02
subsystem: api, security
tags: [approve, spender, allowance, erc-20, spl-token, race-condition, delegate, whitelist, zod, policy-engine]

# Dependency graph
requires:
  - phase: 23-transaction-type-extension
    plan: 01
    provides: 파이프라인 Stage 3 순서 8-10 예약, DB 감사 컬럼 (spender_address, token_address), REST API APPROVE variant, 에러 코드 4개, 부록 A 예비 Zod 스키마
  - phase: 22-token-extension
    provides: TokenInfo 인터페이스, ALLOWED_TOKENS 정책 패턴
provides:
  - ApproveRequest 독립 인터페이스 (EVM ERC-20 approve + Solana SPL ApproveChecked)
  - APPROVED_SPENDERS 정책 (기본 전면 거부 opt-in, spender 화이트리스트)
  - APPROVE_AMOUNT_LIMIT 정책 (무제한 approve 감지 + 차단, block_unlimited)
  - APPROVE_TIER_OVERRIDE 정책 (SPENDING_LIMIT 독립, 기본 APPROVAL 티어)
  - EVM race condition 자동 방지 (approve(0) -> approve(new) 2단계)
  - Solana 단일 delegate 제약 + 기존 delegate 경고 로직
  - 감사 로그: 2-step approve 그룹 추적, delegate 교체 추적
  - 보안 테스트 시나리오 22개
affects:
  - 23-03 (배치 트랜잭션 스펙 -- BATCH 내 APPROVE instruction 정책 적용)
  - 25 (테스트 전략 통합 + 기존 문서 반영)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "approve(0)->approve(new) 2단계 패턴: EVM race condition 자동 방지, approveGroupId로 2-step 연결"
    - "단일 delegate 경고 패턴: approve 전 getAccount() 조회, previousDelegate 응답 포함"
    - "APPROVE_TIER_OVERRIDE 독립 티어: SPENDING_LIMIT과 분리, resolveEffectiveAmount(APPROVE) = 0n"
    - "opt-in 전면 거부 패턴: APPROVED_SPENDERS 미설정 = APPROVE_DISABLED 에러"

key-files:
  created:
    - docs/59-approve-management-spec.md
  modified: []

key-decisions:
  - "ApproveRequest를 ContractCallRequest와 독립 타입으로 설계 (시맨틱 차이: 권한 위임 vs 실행)"
  - "EVM race condition 방지는 어댑터에서 자동 처리 (에이전트에게 보안 지식 요구하지 않음)"
  - "APPROVE_TIER_OVERRIDE가 SPENDING_LIMIT과 독립 (approve는 실제 자금 소모가 아닌 권한 위임)"
  - "무제한 임계값 = 체인별 MAX / 2 (EVM: 2^256/2, Solana: 2^64/2)"
  - "Solana 단일 delegate 경고: 자동 차단하지 않고 previousDelegate 정보 + 감사 로그 기록"

patterns-established:
  - "approve 독립 정책 카테고리: 전송(Transfer)과 권한 위임(Approve)은 별개 보안 모델로 관리"
  - "2-step approve 감사 그룹화: approveGroupId(UUID v7)로 approve(0) + approve(new) 연결 추적"

# Metrics
duration: 8min
completed: 2026-02-08
---

# Phase 23 Plan 02: Approve 관리 스펙 Summary

**ApproveRequest(EVM ERC-20 + Solana SPL) 독립 타입 + APPROVED_SPENDERS/APPROVE_AMOUNT_LIMIT/APPROVE_TIER_OVERRIDE 3중 정책 + race condition 자동 방지 + 단일 delegate 경고 + 보안 시나리오 22개**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-07T23:40:03Z
- **Completed:** 2026-02-07T23:47:59Z
- **Tasks:** 1/1
- **Files created:** 1

## Accomplishments

- ApproveRequest 인터페이스가 ContractCallRequest와 독립 타입으로 EVM ERC-20 approve와 Solana SPL ApproveChecked를 모두 표현
- APPROVED_SPENDERS 정책이 기본 전면 거부(opt-in)로 동작하고, 미설정 시 APPROVE_DISABLED 반환
- APPROVE_AMOUNT_LIMIT 정책이 무제한 approve(uint256.max, u64.max)를 감지하여 차단 (block_unlimited=true)
- APPROVE_TIER_OVERRIDE 정책이 SPENDING_LIMIT과 독립적으로 approve 보안 티어를 결정 (기본 APPROVAL)
- EVM approve race condition 방지를 어댑터가 approve(0) -> approve(new) 패턴으로 자동 처리
- Solana SPL 단일 delegate 제약이 문서화되고, 기존 delegate 경고 로직(previousDelegate)이 설계됨
- 감사 로그: 2-step approve 그룹 추적(approveGroupId), delegate 교체 추적
- 보안 테스트 시나리오 22개 (Unit 10 + Integration 3 + Chain Mock 3 + Security 6)
- CHAIN-EXT-03 크로스커팅 확장 포인트 8개를 정식화

## Task Commits

Each task was committed atomically:

1. **Task 1: ApproveRequest 인터페이스 + approve 정책 3종 + 체인별 빌드 로직 설계** - `62764ac` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `docs/59-approve-management-spec.md` - CHAIN-EXT-04 Approve 관리 스펙 (~1696줄, 9 섹션 + 3 부록)

## Decisions Made

1. **ApproveRequest 독립 타입** -- ContractCallRequest의 특수 케이스가 아닌 완전 독립 타입. approve는 "실행"이 아니라 "권한 위임"이며, 지속적 위험(spender가 언제든 토큰 탈취 가능)이 일회성 실행과 근본적으로 다르다.

2. **EVM race condition 어댑터 자동 처리** -- approve(0) -> approve(new) 2단계를 어댑터에서 자동 실행. 에이전트에게 race condition 보안 지식을 요구하지 않는 DX 원칙.

3. **APPROVE_TIER_OVERRIDE SPENDING_LIMIT 독립** -- approve 금액을 SPENDING_LIMIT에 반영하면 이중 계산(approve + transferFrom) 문제가 발생하고, 토큰 단위와 네이티브 단위 불일치 문제가 있으므로 독립 결정.

4. **무제한 임계값 = MAX / 2** -- EVM (2^256-1)/2, Solana (2^64-1)/2 이상이면 무제한으로 간주. DeFi 프로토콜이 MAX - 1 등 유사한 큰 값을 사용할 수 있으므로 절반 기준.

5. **Solana 단일 delegate 경고 (차단하지 않음)** -- 기존 delegate가 있을 때 새 approve로 덮어쓰는 것은 정상 동작이므로, previousDelegate 정보를 응답과 감사 로그에 포함하되 자동 차단하지 않음.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 23-03(배치 트랜잭션 스펙)가 참조할 APPROVE 확장 포인트 준비 완료: ApproveRequest 타입, 3중 정책 스키마/평가 로직, BATCH 내 APPROVE instruction 정책 적용 방안 (부록 B)
- Phase 25에서 기존 문서 수정 시 CHAIN-EXT-04 반영 범위 식별 완료 (33-time-lock-approval-mechanism.md PolicyType 3개 추가)

## Self-Check: PASSED
