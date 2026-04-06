---
phase: 41-policy-engine-completion
plan: 01
subsystem: policy-engine
tags: [sqlite-schema, time-lock, ssot, cross-reference, policy-rule-schema]
dependency-graph:
  requires: []
  provides:
    - "25-sqlite §4.4 rules 컬럼 SSoT 교차 참조 (33-time-lock §2.2)"
    - "33-time-lock §3.2 APPROVAL 타임아웃 3단계 우선순위"
  affects:
    - "41-02 (같은 Phase, 34-owner GRACE/LOCKED 명시)"
    - "Phase 42 (PolicyType rules 검증 분기가 SSoT 정리된 PolicyRuleSchema에 의존)"
tech-stack:
  added: []
  patterns:
    - "SSoT 교차 참조 패턴: 이연 표기 -> 문서 §섹션 참조"
    - "3단계 우선순위 패턴: 정책별 -> 글로벌 config -> 하드코딩 fallback"
key-files:
  created: []
  modified:
    - ".planning/deliverables/25-sqlite-schema.md"
    - ".planning/deliverables/33-time-lock-approval-mechanism.md"
decisions:
  - id: PLCY-01-RESOLVED
    decision: "25-sqlite §4.4 rules 컬럼의 LOCK-MECH 이연 표기를 33-time-lock §2.2 PolicyRuleSchema SSoT 참조로 교체"
    rationale: "구현자가 rules JSON 구조를 즉시 찾을 수 있도록"
  - id: PLCY-03-RESOLVED
    decision: "APPROVAL 타임아웃 3단계 우선순위: 정책별 approval_timeout > 글로벌 config > 하드코딩 3600초"
    rationale: "구현자가 추측 없이 타임아웃 결정 로직을 구현할 수 있도록"
metrics:
  duration: "~3 minutes"
  completed: 2026-02-09
---

# Phase 41 Plan 01: PolicyRuleSchema 이연 표기 제거 + APPROVAL 타임아웃 우선순위 Summary

**One-liner:** 25-sqlite rules 컬럼의 Phase 8 이연 표기를 33-time-lock SSoT 참조로 교체하고, APPROVAL 타임아웃 3단계 우선순위(정책별 > 글로벌 config > 3600초)를 evaluate()에 명시

## Task Commits

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | 25-sqlite §4.4 rules 컬럼 이연 표기 제거 + SSoT 참조 추가 | `154a0a7` | 25-sqlite-schema.md: 컬럼 설명, JSON 헤더, SPENDING_LIMIT 주석 3곳 수정 |
| 2 | 33-time-lock §3.2 APPROVAL 타임아웃 3단계 우선순위 명시 | `9532481` | 33-time-lock: constructor globalConfig 추가, evaluate() 3단계 로직, Stage 4 주석 |

## Changes Made

### Task 1: 25-sqlite §4.4 rules 컬럼 이연 표기 제거 + SSoT 참조 추가

**25-sqlite-schema.md (3곳 수정):**

1. **컬럼 설명 테이블 (line 480):** `LOCK-MECH (Phase 8)에서 각 type별 JSON 구조 확정` -> `**SSoT: 33-time-lock-approval-mechanism.md §2.2 PolicyRuleSchema** (10개 PolicyType의 Zod discriminatedUnion). 각 type별 JSON 구조와 필드 제약을 정의`
2. **JSON 예시 헤더 (line 486):** `Phase 8 LOCK-MECH에서 확정, v0.6 확장` -> `SSoT: 33-time-lock §2.2 PolicyRuleSchema, v0.6에서 10개 타입 확장`
3. **SPENDING_LIMIT 주석 (line 489):** `Phase 8 기존 + v0.6 USD 확장` -> `v0.6 USD 확장 -- 전체 스키마: 33-time-lock §2.2 SpendingLimitRuleSchema`

### Task 2: 33-time-lock §3.2 APPROVAL 타임아웃 3단계 우선순위 명시

**33-time-lock-approval-mechanism.md (3곳 수정):**

1. **Constructor (line 559):** `globalConfig: { policy_defaults_approval_timeout?: number }` 파라미터 추가
2. **evaluateSpendingLimit() APPROVAL 반환부 (line 909-921):** 기존 `config.approval_timeout` 직접 반환을 3단계 nullish coalescing 체인으로 교체:
   ```typescript
   const approvalTimeout = config.approval_timeout        // 1. 정책별
     ?? this.globalConfig.policy_defaults_approval_timeout // 2. 글로벌
     ?? 3600                                               // 3. 하드코딩
   ```
3. **Stage 4 APPROVAL 큐잉 (line 1118):** `decision.approvalTimeoutSeconds`가 이미 3단계 우선순위로 결정되었음을 주석으로 명시

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| PLCY-01-RESOLVED | rules 컬럼 SSoT를 33-time-lock §2.2로 확정 | 이연 표기 제거로 구현자가 JSON 구조를 즉시 참조 가능 |
| PLCY-03-RESOLVED | 타임아웃 3단계: 정책별 > config > 3600초 | Zod default(3600)로 인해 1단계에서 항상 값이 있지만, 향후 optional 전환 시 fallback 체인 보존 |

## Deviations from Plan

None -- plan executed exactly as written.

**참고:** 25-sqlite-schema.md의 다른 섹션(§4.6 pending_approvals line 758, §4.8 notification_channels line 825)에도 `Phase 8에서 ... 확정` 이연 표기가 남아있으나, 이들은 §4.4 policies 테이블이 아닌 별도 테이블이며 본 plan의 scope(PLCY-01: rules 컬럼)에 포함되지 않는다. 향후 해당 테이블의 SSoT 정리 시 별도 처리 필요.

## Verification Results

| Check | Expected | Actual | Pass |
|-------|----------|--------|------|
| `LOCK-MECH.*확정` in 25-sqlite | 0건 | 0건 | PASS |
| `SSoT.*33-time-lock` in 25-sqlite | 2건+ | 2건 | PASS |
| `policy_defaults_approval_timeout` in 33-time-lock | 2건+ | 3건 | PASS |
| `3단계 우선순위` in 33-time-lock | 1건+ | 2건 | PASS |
| rules JSON 예시에 `Phase 8` 없음 | 없음 | 없음 | PASS |

## Success Criteria

- [x] PLCY-01 충족: 25-sqlite §4.4의 이연 표기 완전 제거, SSoT 참조 명시
- [x] PLCY-03 충족: 33-time-lock §3.2 evaluate()에 APPROVAL 타임아웃 3단계 우선순위 명시
- [x] Phase 41 Success Criteria 1 충족 (이연 표기 제거 + SSoT 참조)
- [x] Phase 41 Success Criteria 4 충족 (APPROVAL 타임아웃 결정 순서 명시)

## Next Phase Readiness

- Plan 41-02 (PLCY-02: 34-owner GRACE/LOCKED 명시)는 독립적으로 실행 가능
- Phase 42는 이 plan에서 정리한 PolicyRuleSchema SSoT에 의존하여 PolicyType별 rules 검증 분기를 설계

## Self-Check: PASSED
