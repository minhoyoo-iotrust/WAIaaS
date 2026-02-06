---
phase: 15-security-test-scenarios
plan: 01
status: complete
started: 2026-02-06T12:31:36Z
completed: 2026-02-06T12:35:36Z
duration: 4m
subsystem: security-test-scenarios
tags: [security, session-auth, jwt, ownerAuth, attack-scenarios, given-when-then]
dependency-graph:
  requires:
    - phase-14 (테스트 기반 정의 -- FakeClock, FakeOwnerSigner, Mock 경계)
    - v0.2 deliverables (30-session-token-protocol, 34-owner-wallet-connection, 45-enum-unified-mapping)
  provides:
    - SEC-01 요구사항 충족 -- Layer 1 세션 인증 공격 시나리오 20건
    - 구현 단계 Security 테스트 작성 기준
  affects:
    - 15-02 (Layer 2 정책 우회 공격 시나리오 -- ownerAuth 교차 참조)
    - 15-03 (경계값 + 연쇄 공격 체인 -- Layer 1 시나리오 참조)
    - v0.5 구현 (Security 테스트 코드 직접 변환)
tech-stack:
  patterns:
    - Given-When-Then 테스트 케이스 수준 시나리오 정의
    - Phase 14 Mock 인프라(FakeClock, FakeOwnerSigner) DI 기반 공격 재현
    - REST API SSoT(37-rest-api) + 내부 코드(30-session-proto) 에러 코드 병기
key-files:
  created:
    - docs/v0.4/43-layer1-session-auth-attacks.md
  modified: []
decisions:
  - id: SEC-01-ERROR-DUAL-REFERENCE
    description: "에러 코드를 REST API SSoT(INVALID_TOKEN, TOKEN_EXPIRED)와 내부 코드(AUTH_TOKEN_INVALID, AUTH_TOKEN_EXPIRED) 양측 병기하여 구현 시 매핑 혼동 방지"
  - id: SEC-01-NONCE-PATH-SSOT
    description: "/v1/auth/nonce(원본) vs /v1/nonce(API SSoT) 경로 차이를 인증 제외 경로 섹션에 명시"
metrics:
  scenarios: 20
  critical: 7
  high: 9
  medium: 4
---

# Phase 15 Plan 01: Layer 1 세션 인증 공격 시나리오 Summary

Layer 1 sessionAuth 2-stage 및 ownerAuth 8-step의 모든 공격 시나리오 20건을 Given-When-Then 테스트 케이스 수준으로 정의하여, 구현 시 Security 테스트를 바로 작성할 수 있는 상태를 확보했다.

## What Was Built

Layer 1 세션 인증 공격 시나리오 문서(43-layer1-session-auth-attacks.md)를 작성하여 SEC-01 요구사항을 충족했다. sessionAuth 미들웨어 12건(JWT 위조/만료/폐기/탈취 Critical 4건, 세션 제약 5종+Nonce Replay High 6건, 토큰 형식 Medium 2건)과 ownerAuth 8단계 공격 벡터 8건(서명 위조/nonce replay/replay attack Critical 3건, timestamp/주소/action High 3건, 파싱/도메인 Medium 2건)을 포함한 총 20건의 시나리오를 정의했다. 모든 Given절에 Phase 14 Mock 구현체(FakeClock, FakeOwnerSigner)를 명시하고, 에러 코드는 REST API SSoT와 내부 코드를 병기했다.

## Task Results

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Layer 1 세션 인증 공격 시나리오 12건 정의 (SEC-01) | done | 5e8a0cc |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] 에러 코드 매핑 병기**

- **Found during:** Task 1
- **Issue:** 30-session-token-protocol.md의 내부 에러 코드(AUTH_TOKEN_MISSING, AUTH_TOKEN_INVALID 등)와 37-rest-api-complete-spec.md의 API SSoT 코드(INVALID_TOKEN, TOKEN_EXPIRED 등)가 불일치
- **Fix:** 시나리오별로 양측 코드를 병기하여 구현 시 매핑 혼동을 방지. 문서 헤더에 에러 코드 참조 표 추가
- **Files modified:** docs/v0.4/43-layer1-session-auth-attacks.md
- **Commit:** 5e8a0cc

**2. [Rule 2 - Missing Critical] nonce 엔드포인트 경로 SSoT 명시**

- **Found during:** Task 1
- **Issue:** 30-session-token-protocol.md는 `/v1/auth/nonce`를 정의하나, 45-enum-unified-mapping.md 섹션 4에서 `/v1/nonce`로 SSoT 경로 확정됨
- **Fix:** 인증 제외 경로 검증 섹션에서 SSoT 경로(`/v1/nonce`)를 사용하고, 원본 경로와의 관계를 주석으로 명시
- **Files modified:** docs/v0.4/43-layer1-session-auth-attacks.md
- **Commit:** 5e8a0cc

## Decisions Made

| Decision | Context | Outcome |
|----------|---------|---------|
| 에러 코드 이중 참조 | REST API SSoT vs 내부 코드 불일치 | 양측 병기하여 구현 시 매핑 가이드 제공 |
| nonce 경로 SSoT 채택 | `/v1/auth/nonce` vs `/v1/nonce` | 45-enum-unified-mapping.md 기준 `/v1/nonce` 사용 |
| ownerAuth 배치 | Layer 1 vs Layer 3 | Layer 1 문서에 요약 표로 포함, Kill Switch 상세는 Layer 3 문서로 위임 |

## Verification

- [x] SEC-01-01 ~ SEC-01-12 시나리오 12건 모두 존재 (12 headings 확인)
- [x] Critical 4건 (01~04), High 6건 (05~10), Medium 2건 (11~12) 분포 정확
- [x] 각 시나리오에 우선순위, 테스트 레벨, Given-When-Then 포함
- [x] ownerAuth 공격 벡터 8건 요약 표 존재 (SEC-01-OA-01 ~ OA-08)
- [x] 인증 제외 경로 검증 섹션 존재 (/health, /doc, /v1/nonce, POST /v1/sessions)
- [x] Phase 14 Mock 참조(FakeClock, FakeOwnerSigner)가 Given절에 명시
- [x] 문서 695줄 (>= 150줄 요구)

## Self-Check: PASSED
