---
phase: 137-cumulative-admin-sdk
plan: "02"
subsystem: sdk, docs, mcp
tags: [spending-limit, cumulative, sdk, skill-file, documentation]
dependency-graph:
  requires:
    - "136-01: SpendingLimitRulesSchema daily_limit_usd/monthly_limit_usd Zod 확장"
    - "136-02: 누적 USD 집계 + APPROVAL 격상 엔진"
  provides:
    - "policies.skill.md SPENDING_LIMIT 누적 한도 문서 (MCP 에이전트 참조)"
    - "TS SDK SpendingLimitRules 인터페이스 + PolicyType 유니온"
    - "Python SDK SpendingLimitRules Pydantic 모델"
  affects:
    - "packages/mcp (skills.ts가 policies.skill.md를 서빙 -> 자동 반영)"
tech-stack:
  added: []
  patterns:
    - "SDK 참조 타입 패턴: core Zod SSoT -> SDK standalone 타입 (의존성 없음)"
key-files:
  created: []
  modified:
    - skills/policies.skill.md
    - packages/sdk/src/types.ts
    - python-sdk/waiaas/models.py
decisions:
  - "SDK에 policy CRUD 메서드 미추가 (스코프 외) -- 참조 타입만 제공"
  - "X402_ALLOWED_DOMAINS 타입 섹션 추가 (12 Types 정합성 보완)"
  - "approval_timeout 필드 제거 (Zod 스키마에 존재하지 않는 phantom 필드)"
  - "delay_seconds 기본값 300->900 정정 (Zod 스키마 .default(900) 기준)"
metrics:
  duration: "173s"
  completed: "2026-02-16"
  tasks: 2
  files-modified: 3
---

# Phase 137 Plan 02: SDK/MCP 누적 한도 문서화 + 타입 Summary

policies.skill.md에 SPENDING_LIMIT 누적 한도 필드(daily_limit_usd/monthly_limit_usd)를 문서화하고, TS/Python SDK에 SpendingLimitRules 참조 타입을 추가하여 프로그래밍 방식으로 누적 한도 정책을 다룰 수 있게 함

## Tasks Completed

### Task 1: policies.skill.md 누적 한도 필드 문서화

**Commit:** `921a3e0`

- SPENDING_LIMIT rules JSON 예시에 USD 티어 + 누적 한도 필드 추가
- Rules 테이블에 instant_max_usd, notify_max_usd, delay_max_usd, daily_limit_usd, monthly_limit_usd 행 추가
- "Cumulative limit evaluation" 설명 단락 추가
- curl 예시에 daily_limit_usd/monthly_limit_usd 포함
- Common Workflows에 "Set daily/monthly cumulative spending limits" 워크플로우 추가
- version 1.4.6 -> 1.5.3 업데이트
- "11 Types" -> "12 Types" 정정
- X402_ALLOWED_DOMAINS 타입 섹션 추가 (12번째 타입 누락 보완)
- approval_timeout 필드 제거, delay_seconds 기본값 정정

### Task 2: TS SDK 타입 힌트 + Python SDK 모델 + 빌드 검증

**Commit:** `f9bcd70`

- TS SDK types.ts에 SpendingLimitRules 인터페이스 추가 (JSDoc 포함)
- TS SDK에 PolicyType 유니온 타입 추가 (12개 타입 전체)
- Python SDK models.py에 SpendingLimitRules Pydantic 모델 추가
- TS SDK 빌드 성공 (`npx turbo build --filter=@waiaas/sdk`)
- Python SDK import 검증 성공 (`from waiaas.models import SpendingLimitRules`)
- 전체 모노레포 빌드 성공 (`npx turbo build` 8/8 패키지)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] X402_ALLOWED_DOMAINS 타입 섹션 추가**
- **Found during:** Task 1
- **Issue:** policies.skill.md가 "12 Types"로 정정되었으나, X402_ALLOWED_DOMAINS 섹션이 누락되어 실제 11개만 문서화
- **Fix:** l. X402_ALLOWED_DOMAINS 섹션 추가 (rules.domains 배열, 기본 거부 패턴)
- **Files modified:** skills/policies.skill.md
- **Commit:** 921a3e0

**2. [Rule 1 - Bug] approval_timeout phantom 필드 제거 + delay_seconds 기본값 정정**
- **Found during:** Task 1
- **Issue:** 기존 skill 파일에 `approval_timeout` 필드가 있었으나 Zod 스키마에 존재하지 않음. `delay_seconds` 기본값이 300으로 문서화되었으나 실제 Zod .default(900)
- **Fix:** approval_timeout 제거, delay_seconds 설명을 "Min 60, default: 900"으로 정정
- **Files modified:** skills/policies.skill.md
- **Commit:** 921a3e0

## Verification Results

1. `grep -c "daily_limit_usd" skills/policies.skill.md` -> 5 (pass, >= 3)
2. `grep "monthly_limit_usd" skills/policies.skill.md` -> 5 occurrences (pass)
3. `grep "Cumulative limit evaluation" skills/policies.skill.md` -> found (pass)
4. `grep "1.5.3" skills/policies.skill.md` -> found (pass)
5. `npx turbo build --filter=@waiaas/sdk` -> 1 successful (pass)
6. `grep "daily_limit_usd" packages/sdk/src/types.ts` -> found (pass)
7. `grep "daily_limit_usd" python-sdk/waiaas/models.py` -> found (pass)
8. Python SDK `SpendingLimitRules(daily_limit_usd=500)` -> 500.0 (pass)
9. `npx turbo build` -> 8/8 successful (pass)

## Self-Check: PASSED

- skills/policies.skill.md: FOUND
- packages/sdk/src/types.ts: FOUND
- python-sdk/waiaas/models.py: FOUND
- .planning/phases/137-cumulative-admin-sdk/137-02-SUMMARY.md: FOUND
- Commit 921a3e0: FOUND
- Commit f9bcd70: FOUND
