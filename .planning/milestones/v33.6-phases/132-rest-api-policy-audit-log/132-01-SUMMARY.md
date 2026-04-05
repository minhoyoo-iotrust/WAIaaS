---
phase: 132-rest-api-policy-audit-log
plan: 01
subsystem: api, policy
tags: [x402, domain-matching, wildcard, config, zod]

# Dependency graph
requires:
  - phase: 130-db-schema-core-types
    provides: X402_ALLOWED_DOMAINS policy type in POLICY_TYPES, X402_PAYMENT transaction type
  - phase: 131-ssrf-guard-x402-handler-payment-signing
    provides: x402 handler, SSRF guard, payment signer modules
provides:
  - matchDomain 함수 (정확한 매칭 + 와일드카드 dot-boundary)
  - evaluateX402Domain 함수 (X402_ALLOWED_DOMAINS 정책 평가, 기본 거부)
  - config.toml [x402] 섹션 (enabled, request_timeout)
affects: [132-02, 132-03, x402-route-handler]

# Tech tracking
tech-stack:
  added: []
  patterns: [domain-wildcard-matching, x402-config-section]

key-files:
  created:
    - packages/daemon/src/services/x402/x402-domain-policy.ts
    - packages/daemon/src/__tests__/x402-domain-policy.test.ts
  modified:
    - packages/daemon/src/infrastructure/config/loader.ts

key-decisions:
  - "X402_ALLOWED_DOMAINS를 DatabasePolicyEngine 외부 독립 모듈로 구현 (TransactionParam에 domain 필드 없음)"
  - "PolicyRow를 로컬 타입으로 재정의 (DatabasePolicyEngine private 타입 import 불가)"
  - "와일드카드 dot-boundary: *.example.com이 example.com 자체를 매칭하지 않음 (보안)"

patterns-established:
  - "x402 도메인 정책: 기본 거부 원칙, ALLOWED_TOKENS와 동일 패턴"
  - "config.toml [x402] 섹션: DaemonConfigSchema + KNOWN_SECTIONS 확장 패턴"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 132 Plan 01: X402_ALLOWED_DOMAINS Summary

**matchDomain 와일드카드 도메인 매칭 + evaluateX402Domain 기본 거부 정책 평가 + config.toml [x402] 섹션 (enabled/request_timeout)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T12:45:33Z
- **Completed:** 2026-02-15T12:49:12Z
- **Tasks:** 3 (TDD RED + GREEN + config)
- **Files modified:** 3

## Accomplishments
- matchDomain 함수: 정확한 매칭, 와일드카드(*.example.com), dot-boundary 규칙, 대소문자 무시 구현
- evaluateX402Domain 함수: 정책 없음 시 기본 거부, 도메인 허용/불허 판별
- config.toml [x402] 섹션: enabled(기본 true), request_timeout(기본 30초, 5~120 범위) Zod 스키마 추가
- 19개 단위 테스트로 행동 명세 검증, 1227개 daemon 테스트 회귀 없음

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: x402 도메인 정책 테스트** - `cbdfb7a` (test)
2. **Task 1 GREEN: matchDomain + evaluateX402Domain 구현** - `9252c8d` (feat)
3. **Task 2: config.toml [x402] 섹션 추가** - `9763da9` (feat)

## Files Created/Modified
- `packages/daemon/src/services/x402/x402-domain-policy.ts` - matchDomain + evaluateX402Domain 함수
- `packages/daemon/src/__tests__/x402-domain-policy.test.ts` - 19개 도메인 정책 평가 테스트
- `packages/daemon/src/infrastructure/config/loader.ts` - DaemonConfigSchema x402 섹션 + KNOWN_SECTIONS 확장

## Decisions Made
- X402_ALLOWED_DOMAINS를 DatabasePolicyEngine 외부 독립 모듈로 구현: TransactionParam에 URL/domain 필드가 없어 evaluate() 내부에서 처리 불가 (Research Pitfall 1 참조)
- PolicyRow를 로컬 인터페이스로 재정의: DatabasePolicyEngine의 PolicyRow가 private이므로 import 불가, 동일 구조로 로컬 정의
- 와일드카드 dot-boundary 규칙 적용: `*.example.com`이 `example.com` 자체를 매칭하지 않도록 보안 강화

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- matchDomain + evaluateX402Domain이 132-02 (REST API 라우트) 및 132-03에서 사용 가능
- config.x402.enabled, config.x402.request_timeout이 라우트 핸들러에서 참조 가능
- WAIAAS_X402_ENABLED=false 환경변수 오버라이드로 x402 비활성화 가능

## Self-Check: PASSED

- All 3 created/modified files verified on disk
- All 3 task commits verified in git log (cbdfb7a, 9252c8d, 9763da9)
- 19 domain policy tests pass, 1227 daemon tests pass (0 regressions)
- TypeScript compilation clean (tsc --noEmit)

---
*Phase: 132-rest-api-policy-audit-log*
*Completed: 2026-02-15*
