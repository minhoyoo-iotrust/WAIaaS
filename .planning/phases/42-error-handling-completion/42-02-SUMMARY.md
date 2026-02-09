---
phase: 42-error-handling-completion
plan: 02
subsystem: api-spec
tags: [error-codes, http-mapping, retryable, backoff, 429-format, policy-type, super-refine, zod]
dependency-graph:
  requires:
    - "Phase 41 (PolicyRuleSchema SSoT 정리 -> PolicyType rules 검증 분기 전제)"
  provides:
    - "37-rest-api SS10.12 에러 코드 통합 매트릭스 (66개, SSoT)"
    - "37-rest-api 429 응답 포맷 확정 (Retry-After + retryAfter + stage)"
    - "37-rest-api SS8.9 PolicyType 10개 확장 + superRefine 검증"
  affects:
    - "Phase 43 (ChainError category -> Stage 5 에러 분기)"
    - "Phase 44 (25-sqlite parent_id/batch_index 추가와 동일 문서)"
    - "구현 시 에러 응답 매핑 참조"
tech-stack:
  added: []
  patterns:
    - "통합 매트릭스 SSoT 패턴: 도메인별 분산 테이블 -> 단일 통합 테이블이 SSoT"
    - "superRefine 교차 검증 패턴: type에 따라 rules를 별도 스키마로 검증"
    - "PolicyTypeEnum 공통 상수 추출 패턴: Request/Response 스키마에서 공유"
key-files:
  created: []
  modified:
    - ".planning/deliverables/37-rest-api-complete-spec.md"
decisions:
  - id: ERRH-01-RESOLVED
    decision: "통합 매트릭스를 SS10.12에 배치 (objectives의 SS3.3이 아닌 에러 코드 체계 SS10 내)"
    rationale: "현재 SS3.3은 masterAuth 섹션이며, 에러 코드 체계 SS10 내가 논리적으로 적합"
  - id: ERRH-01-COUNT
    decision: "에러 코드 합계 64->66 정정 (OWNER 4->5, ADMIN 1 신설)"
    rationale: "OWNER_NOT_FOUND가 v0.7 추가되었으나 v0.8 통계 누락, ROTATION_TOO_RECENT가 SS9.3에만 존재"
  - id: ERRH-01-ADMIN
    decision: "ROTATION_TOO_RECENT를 ADMIN 도메인으로 독립 등록 (SYSTEM 편입 대신)"
    rationale: "SS9.3 rotate-secret 전용 에러이므로 ADMIN 도메인이 명확성 확보에 적합. 도메인 수 9->10"
  - id: ERRH-03-RESOLVED
    decision: "PolicyTypeEnum 공통 상수 추출 + superRefine으로 type별 rules 검증"
    rationale: "z.discriminatedUnion은 최상위 type 필드 필요하므로 부적합, superRefine이 type+rules 교차 검증에 적합"
metrics:
  duration: "~4 minutes"
  completed: 2026-02-09
---

# Phase 42 Plan 02: 에러 코드 통합 매트릭스 + PolicyType 10개 확장 Summary

**66개 에러 코드 통합 매트릭스(HTTP/retryable/backoff SSoT) + 429 응답 포맷 확정 + PolicyType 4->10개 확장 + superRefine type별 rules 검증 분기**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-09T11:43:07Z
- **Completed:** 2026-02-09T11:46:37Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- SS10.12에 66개 에러 코드 통합 매트릭스를 SSoT로 구축 (에러코드/도메인/HTTP/retryable/backoff/hint)
- 429 응답 포맷 확정 (Retry-After 헤더 + 본문 retryAfter + stage)
- SS10.11 에러 코드 합계를 64->66으로 정정 (OWNER 4->5, ADMIN 1 신설)
- SS8.9 PolicyType enum을 4->10개로 확장하고 PolicyTypeEnum 공통 상수 추출
- CreatePolicyRequestSchema에 .superRefine() type별 rules 검증 분기 추가
- PolicySummarySchema도 10개 enum으로 동기화
- UpdatePolicyRequest의 서비스 계층 rules 검증 가이드 추가
- type별 rules 스키마 요약 테이블 추가 (33-time-lock SS2.2 SSoT 참조)

## Task Commits

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | 에러 코드 통합 매트릭스 + 429 응답 포맷 (ERRH-01) | `dd7def4` | SS10.12 신설 (66개 매트릭스), SS10.11 정정, 429 포맷, v0.10 메타데이터 |
| 2 | PolicyType enum 10개 확장 + superRefine 검증 분기 (ERRH-03) | `8d93ae9` | PolicyTypeEnum 추출, superRefine 코드, rules 요약 테이블, UpdatePolicy 가이드 |

## Files Created/Modified

- `.planning/deliverables/37-rest-api-complete-spec.md` -- SS10.12 통합 매트릭스 추가, SS10.11 정정, SS8.9 PolicyType/superRefine 확장, SS8.10 서비스 계층 검증 가이드

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| ERRH-01-RESOLVED | SS10.12에 통합 매트릭스 배치 | objectives의 SS3.3은 masterAuth 섹션, SS10이 논리적 적합 |
| ERRH-01-COUNT | 에러 코드 64->66 정정 | OWNER_NOT_FOUND v0.7 추가 누락 + ROTATION_TOO_RECENT SS10 미등록 |
| ERRH-01-ADMIN | ROTATION_TOO_RECENT -> ADMIN 도메인 독립 등록 | rotate-secret 전용 에러, SYSTEM 편입보다 명확 |
| ERRH-03-RESOLVED | PolicyTypeEnum + superRefine 패턴 채택 | discriminatedUnion 부적합, superRefine이 type+rules 교차 검증에 적합 |

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 42의 남은 plan(42-01: ChainError 3-카테고리 분류)은 독립적으로 실행 가능
- Phase 43(CONC-01: Stage 5 에러 분기)은 42-01의 ChainError category 분류에 의존
- 이 plan의 산출물(통합 매트릭스, PolicyType 확장)은 구현 단계에서 즉시 참조 가능

## Verification Results

| Check | Expected | Actual | Pass |
|-------|----------|--------|------|
| SS10.12 통합 매트릭스 존재 | 있음 | 있음 (line 3383) | PASS |
| 429 응답 포맷 (retryAfter + stage) | 있음 | 있음 (line 3466-3467) | PASS |
| SS10.11 합계=66 | 66 | 66 | PASS |
| PolicyTypeEnum 정의+사용 | 3건+ | 3건 | PASS |
| superRefine | 2건+ | 4건 | PASS |
| APPROVE_TIER_OVERRIDE | 2건+ | 3건 | PASS |
| 33-time-lock/PolicyRuleSchema SSoT 참조 | 3건+ | 4건 | PASS |
| 기존 4-enum 제거 | 0건 | 0건 | PASS |

## Success Criteria

- [x] SS10.12에 66개 에러 코드 통합 매트릭스가 SSoT로 존재
- [x] 429 응답 포맷(Retry-After 헤더 + 본문 retryAfter + stage)이 확정
- [x] SS10.11 합계가 66개로 정정
- [x] SS8.9 PolicyType enum이 10개(PolicyTypeEnum)로 확장
- [x] CreatePolicyRequestSchema에 .superRefine() type별 rules 검증 분기 명시
- [x] PolicySummarySchema도 PolicyTypeEnum 공유
- [x] type별 rules 요약 테이블이 33-time-lock SS2.2를 SSoT로 참조

## Self-Check: PASSED

---
*Phase: 42-error-handling-completion*
*Completed: 2026-02-09*
