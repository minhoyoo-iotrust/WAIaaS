---
phase: 15-security-test-scenarios
plan: 02
status: complete
started: 2026-02-06T12:32:09Z
completed: 2026-02-06T12:40:12Z
duration: ~8min
subsystem: security-test-scenarios
tags: [layer2, layer3, policy-bypass, killswitch, autostop, TOCTOU, attack-scenarios]
dependencies:
  requires:
    - "Phase 14 (테스트 기반 정의) -- Mock 경계, 인터페이스 스펙"
    - "Phase 8 (보안 계층 설계) -- LOCK-MECH, KILL-AUTO-EVM, OWNR-CONN, NOTI-ARCH"
  provides:
    - "SEC-02: Layer 2 정책 우회 공격 시나리오 9건"
    - "SEC-03: Layer 3 Kill Switch/AutoStop 공격 시나리오 8건"
  affects:
    - "Phase 15 Plan 03 (경계값 + 연쇄 공격 시나리오)"
    - "v0.4 구현 -- Security 테스트 스위트 작성 시 참조"
tech-stack:
  added: []
  patterns: ["Given-When-Then 공격 시나리오", "TOCTOU Integration 테스트 패턴", "Kill Switch 3-state 전이 검증"]
key-files:
  created:
    - docs/v0.4/44-layer2-policy-bypass-attacks.md
    - docs/v0.4/45-layer3-killswitch-recovery-attacks.md
  modified: []
decisions:
  - id: SEC02-TOCTOU-INTEGRATION
    decision: "TOCTOU 테스트는 Integration 레벨에서 실제 SQLite + BEGIN IMMEDIATE로 검증 (Unit 불가)"
    reason: "단일 스레드에서 실제 동시성을 재현할 수 없음 (Research Pitfall 3)"
  - id: SEC03-CASCADE-SPLIT
    decision: "Kill Switch 캐스케이드 테스트를 Step 1-3 원자적 + Step 4-6 best-effort로 분리"
    reason: "설계 문서의 원자성 범위를 정확히 반영 (Research Pitfall 5)"
  - id: SEC03-AUTOSTOP-COVERAGE
    decision: "AutoStop 5규칙 중 CONSECUTIVE_FAILURES만 상세 시나리오, 나머지 4규칙은 SEC-05 경계값 문서로 이연"
    reason: "Layer 2 정책 테스트와 유사한 패턴이므로 중복 최소화"
metrics:
  duration: ~8min
  completed: 2026-02-06
---

# Phase 15 Plan 02: Layer 2/3 공격 시나리오 Summary

Layer 2 정책 우회 9건 + Layer 3 Kill Switch/AutoStop 8건 = 17건의 공격 시나리오를 Given-When-Then 테스트 케이스 수준으로 정의

## What Was Built

WAIaaS 3계층 보안의 Layer 2(정책 엔진 + Time-Lock + Approval)와 Layer 3(Kill Switch + AutoStop) 방어선을 대상으로 한 공격 시나리오 17건을 문서화했다. 각 시나리오에 Critical/High/Medium 우선순위, Given-When-Then 테스트 케이스, Mock 설정(FakeClock, FakeOwnerSigner, MockChainAdapter, MockKeyStore, MockDb)을 명시하여 구현 시 바로 Security 테스트를 작성할 수 있도록 했다.

SEC-02는 TOCTOU 동시 거래 한도 초과, 금액 티어 경계값 조작, WHITELIST/TIME_RESTRICTION/RATE_LIMIT 우회, DELAY 쿨다운 조기 실행, APPROVAL 타임아웃 후 승인을 포함한다. SEC-03는 Kill Switch ACTIVATED/RECOVERING 상태 API 우회, 복구 brute-force/서명 위조, AutoStop 연속 실패 트리거, 캐스케이드 부분 실패, 복구 E2E 흐름까지 포함한다.

## Task Results

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Layer 2 정책 우회 공격 시나리오 9건 정의 (SEC-02) | Done | 00ecd82 |
| 2 | Layer 3 Kill Switch/AutoStop 공격 시나리오 8건 정의 (SEC-03) | Done | 7ec1f18 |

## Key Artifacts

### SEC-02 (Layer 2 정책 우회) -- 9건

| ID | 공격명 | 우선순위 | 테스트 레벨 |
|----|--------|---------|-----------|
| SEC-02-01 | TOCTOU 동시 거래 한도 초과 | Critical | Integration |
| SEC-02-02 | 금액 티어 경계값 조작 | High | Unit |
| SEC-02-03 | WHITELIST 대소문자 우회 | High | Unit |
| SEC-02-04 | TIME_RESTRICTION 시간대 경계 | High | Unit |
| SEC-02-05 | RATE_LIMIT 시간 윈도우 경계 | High | Unit |
| SEC-02-06 | DELAY 쿨다운 조기 실행 | High | Unit |
| SEC-02-07 | APPROVAL 타임아웃 후 승인 | High | Unit |
| SEC-02-08 | 에이전트별 오버라이드 우회 | Medium | Unit |
| SEC-02-09 | 정책 미설정 기본 동작 | Medium | Unit |

### SEC-03 (Layer 3 Kill Switch/AutoStop) -- 8건

| ID | 공격명 | 우선순위 | 테스트 레벨 |
|----|--------|---------|-----------|
| SEC-03-01 | ACTIVATED 상태 API 접근 | Critical | Unit |
| SEC-03-02 | 복구 brute-force 마스터 패스워드 | High | Unit |
| SEC-03-03 | 복구 시 Owner 서명 위조 | Critical | Unit |
| SEC-03-04 | AutoStop CONSECUTIVE_FAILURES | High | Unit |
| SEC-03-05 | Kill Switch 이중 발동 | Medium | Unit |
| SEC-03-06 | 복구 후 세션 재사용 | High | Unit |
| SEC-03-07 | 캐스케이드 부분 실패 | Medium | Unit |
| SEC-03-08 | RECOVERING 상태 API 접근 | High | Unit |

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **SEC02-TOCTOU-INTEGRATION:** TOCTOU 테스트는 Integration 레벨에서 실제 SQLite + BEGIN IMMEDIATE로 검증 (Unit에서 실제 동시성 불가)
2. **SEC03-CASCADE-SPLIT:** Kill Switch 캐스케이드 테스트를 Step 1-3 원자적 + Step 4-6 best-effort로 분리하여 원자성 경계 명확화
3. **SEC03-AUTOSTOP-COVERAGE:** AutoStop 5규칙 중 CONSECUTIVE_FAILURES만 본 문서에서 상세 검증, 나머지 4규칙은 SEC-05(경계값 + 연쇄) 문서로 이연

## Next Phase Readiness

- Phase 15 Plan 03 (경계값 + 연쇄 공격 시나리오)에서 SEC-02/03의 시나리오를 조합한 E2E 공격 체인 정의 예정
- AutoStop의 TIME_RESTRICTION, DAILY_LIMIT_THRESHOLD, HOURLY_RATE, ANOMALY_PATTERN 4규칙은 SEC-05 경계값 테스트에서 통합 커버
- 17건의 시나리오 모두 Given-When-Then + Mock 설정이 완비되어 v0.4 구현 시 Security 테스트 바로 작성 가능

## Self-Check: PASSED
