---
phase: 119-sdk-mcp-notifications-skill-resources
plan: 03
subsystem: notifications, api
tags: [pipeline, notifications, policy-violation, i18n, skill-docs, sign-only]

# Dependency graph
requires:
  - phase: 115-sign-only-parsing
    provides: "sign-only 파이프라인, ParsedOperationType 5종"
  - phase: 118-evm-calldata-encoding
    provides: "encode-calldata 엔드포인트, transactions.skill.md 섹션 10"
provides:
  - "extractPolicyType 헬퍼: 정책 거부 reason에서 정책 유형 추출"
  - "POLICY_VIOLATION 알림 vars: policyType, tokenAddress, contractAddress, adminLink"
  - "transactions.skill.md sign-only API 섹션 (POST /v1/transactions/sign)"
affects: [admin-ui, mcp, sdk, notifications]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "extractPolicyType: reason 문자열 패턴 매칭으로 정책 유형 추출"
    - "notify vars 확장: notification payload metadata로 추가 컨텍스트 전달"

key-files:
  created: []
  modified:
    - "packages/daemon/src/pipeline/stages.ts"
    - "packages/core/src/i18n/en.ts"
    - "packages/core/src/i18n/ko.ts"
    - "packages/daemon/src/__tests__/pipeline-notification.test.ts"
    - "skills/transactions.skill.md"

key-decisions:
  - "txParam을 stage3Policy 함수 스코프로 호이스팅 (BATCH/non-BATCH 공통 접근)"
  - "tokenAddress/contractAddress는 body에 미포함 (빈 값 방지), vars metadata로만 전달"
  - "sign-only 섹션을 10번으로 삽입, encode-calldata를 11번으로 리넘버링"

patterns-established:
  - "extractPolicyType: reason 문자열 includes 체크로 정책 유형 역추론"

# Metrics
duration: 4min
completed: 2026-02-15
---

# Phase 119 Plan 03: POLICY_VIOLATION Notification Enrichment + Sign-Only Skill Docs Summary

**POLICY_VIOLATION 알림에 policyType/tokenAddress/contractAddress/adminLink vars 추가 + transactions.skill.md sign-only API 문서화**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-14T17:06:33Z
- **Completed:** 2026-02-14T17:11:25Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- extractPolicyType 헬퍼로 정책 거부 reason에서 8종 정책 유형 자동 추출
- POLICY_VIOLATION 알림에 policyType, tokenAddress, contractAddress, adminLink 필드 추가
- i18n en.ts/ko.ts 템플릿에 {policyType} + {adminLink} 포함
- transactions.skill.md에 POST /v1/transactions/sign 섹션 추가 (요청/응답/에러/SDK 사용법)

## Task Commits

Each task was committed atomically:

1. **Task 1: POLICY_VIOLATION 알림 보강** - `5544963` (feat)
2. **Task 2: transactions.skill.md sign-only API 섹션** - `f7c928d` (docs)

## Files Created/Modified

- `packages/daemon/src/pipeline/stages.ts` - extractPolicyType 헬퍼 + POLICY_VIOLATION notify vars 확장 + txParam 호이스팅
- `packages/core/src/i18n/en.ts` - POLICY_VIOLATION body에 policyType + adminLink 추가
- `packages/core/src/i18n/ko.ts` - POLICY_VIOLATION body에 정책 + 관리 링크 추가
- `packages/daemon/src/__tests__/pipeline-notification.test.ts` - enriched vars 어서션 업데이트
- `skills/transactions.skill.md` - sign-only API 섹션 10 추가, encode-calldata 11로 리넘버링

## Decisions Made

- txParam을 stage3Policy 함수 최상위로 호이스팅하여 BATCH/non-BATCH 양쪽에서 notification vars 접근 가능하게 함
- tokenAddress/contractAddress는 notification body 템플릿에 미포함 (빈 값일 경우 어색한 출력 방지) -- vars metadata로만 전달
- sign-only 섹션을 encode-calldata 앞 10번에 삽입 (API 호출 순서 흐름에 맞춤)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] txParam 스코프 문제 해결**
- **Found during:** Task 1 (POLICY_VIOLATION notify vars 확장)
- **Issue:** txParam이 else 블록 내 로컬 변수로 선언되어 if (!evaluation.allowed) 블록에서 접근 불가
- **Fix:** txParam 선언을 stage3Policy 함수 최상위로 호이스팅, BATCH 분기 전에 buildTransactionParam 호출
- **Files modified:** packages/daemon/src/pipeline/stages.ts
- **Verification:** 빌드 성공 + 24개 테스트 통과
- **Committed in:** 5544963

**2. [Rule 1 - Bug] 테스트 어서션 업데이트**
- **Found during:** Task 1 verification
- **Issue:** pipeline-notification.test.ts가 기존 3-field POLICY_VIOLATION vars를 기대하여 테스트 실패
- **Fix:** enriched 7-field vars (policyType, tokenAddress, contractAddress, adminLink 추가) 어서션으로 업데이트
- **Files modified:** packages/daemon/src/__tests__/pipeline-notification.test.ts
- **Verification:** 24개 테스트 모두 통과
- **Committed in:** 5544963

---

**Total deviations:** 2 auto-fixed (2 Rule 1 - Bug)
**Impact on plan:** 스코프 문제와 테스트 어서션은 코드 변경의 필연적 결과. 계획 의도에서 벗어나지 않음.

**Note:** i18n en.ts/ko.ts 변경은 plan 119-02 실행 시 이미 커밋됨 (cd25b43). 이 플랜에서는 stages.ts + 테스트 + skill 문서만 새로 커밋.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- POLICY_VIOLATION 알림이 풍부한 컨텍스트를 포함하여 Admin UI에서 즉시 원인 파악 가능
- transactions.skill.md가 sign-only + encode-calldata 모두 포함하여 AI 에이전트 참조 완전
- Phase 119 전체 완료 대기 (plans 01, 02 상태 확인 필요)

## Self-Check: PASSED

- FOUND: packages/daemon/src/pipeline/stages.ts (extractPolicyType, policyType vars)
- FOUND: packages/core/src/i18n/en.ts ({policyType}, {adminLink})
- FOUND: packages/core/src/i18n/ko.ts ({policyType}, {adminLink})
- FOUND: skills/transactions.skill.md (/v1/transactions/sign)
- FOUND: commit 5544963 (Task 1)
- FOUND: commit f7c928d (Task 2)
- FOUND: 119-03-SUMMARY.md

---
*Phase: 119-sdk-mcp-notifications-skill-resources*
*Completed: 2026-02-15*
