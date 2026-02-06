---
phase: 12-high-schema-unification
plan: 02
outcome: success
subsystem: config-toml
tags: [config, session-ttl, jwt-secret, nonce-cache, kill-switch, auto-stop, rate-limit, zod]

requires:
  - phase-11 (CRITICAL 의사결정 완료, port 3100/hostname z.union 확정)

provides:
  - CONF-01 해결: session_ttl = 86400 (24시간) 통일
  - CONF-02 해결: jwt_secret 필드 추가 (Zod min(32), waiaas init 자동 생성)
  - CONF-03 해결: [security.auto_stop] consecutive_failures_threshold = 3 설정화
  - CONF-04 해결: nonce_cache_max = 1000, nonce_cache_ttl = 300 설정화
  - CONF-05 해결: [security.kill_switch] recovery_cooldown = 1800 설정화
  - 추가: rate_limit 3-level 구조 (global 100, session 300, tx 10 RPM)
  - 추가: [security.policy_defaults] delay_seconds = 300, approval_timeout = 3600

affects:
  - phase-12-03 (rate_limit 3-level이 API-04 해소에 기여)
  - phase-13 (config.toml SSoT 확립으로 구현 시 참조 기반 확보)

tech-stack:
  patterns:
    - TOML nested sections (security.auto_stop, security.kill_switch, security.policy_defaults)
    - Zod nested object schema with defaults
    - Environment variable mapping WAIAAS_{SECTION}_{KEY}

key-files:
  modified:
    - .planning/deliverables/24-monorepo-data-directory.md

decisions:
  - session_ttl 기본값 86400 (24시간) -- SESS-PROTO 확정 값 반영
  - jwt_secret Zod min(32) 검증 -- waiaas init 시 64자 hex 자동 생성
  - rate_limit 3-level 구조로 확장 (기존 단일 rate_limit_rpm = 60 제거)
  - config.toml 중첩 섹션 사용 (security.auto_stop, security.policy_defaults, security.kill_switch)
  - Zod 스키마 전체 섹션 명시 (기존 partial "// ... 나머지 섹션" 제거)

metrics:
  duration: ~2min
  completed: 2026-02-06
---

# Phase 12 Plan 02: config.toml 누락 설정 추가 Summary

config.toml(24-monorepo-data-directory.md)에 Phase 7-9에서 확정된 보안 설정 필드를 일괄 추가하고, session_ttl 기본값과 rate_limit 구조를 수정. 키-값 테이블, Zod 스키마, config.toml 예시, 환경변수 매핑 4곳 동시 수정으로 SSoT 정합성 확보.

---

## Task Commits

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | config.toml 누락 설정 추가 (CONF-01~05) | `3861370` | session_ttl 86400, jwt_secret, nonce_cache, auto_stop, kill_switch, policy_defaults, rate_limit 3-level. 4곳 동시 수정 (테이블, Zod, 예시, 환경변수) |

---

## Decisions Made

### session_ttl 86400 통일

- **결정**: session_ttl 기본값을 3600(1시간)에서 86400(24시간)으로 변경
- **근거**: Phase 7 SESS-PROTO에서 "기본 만료 86400초 (24시간)"으로 확정. v0.2 Key Decisions에 "default 24h" 기록
- **영향**: Zod 유효 범위도 300-86400에서 300-604800(7일)으로 확장 (SESS-PROTO "최대 7일" 반영)

### jwt_secret 필드 추가

- **결정**: [security] 섹션에 jwt_secret 필드 추가, Zod min(32) 검증
- **근거**: SESS-PROTO 섹션 2.7에서 config.toml [security].jwt_secret 명시, 환경변수 오버라이드 가능
- **구현**: waiaas init 시 crypto.randomBytes(32).toString('hex')로 64자 hex 자동 생성

### rate_limit 3-level 구조

- **결정**: 기존 단일 rate_limit_rpm = 60을 3-level로 교체 (global 100, session 300, tx 10)
- **근거**: CORE-06에서 3-level rate limiter 설계 확정 (전역 100, 세션 300, 거래 10 req/min)
- **영향**: 기존 rate_limit_rpm 환경변수 비호환 (WAIAAS_SECURITY_RATE_LIMIT_GLOBAL_RPM 등으로 변경)

### config.toml 중첩 섹션 구조

- **결정**: security.auto_stop, security.policy_defaults, security.kill_switch를 TOML 중첩 섹션으로 정의
- **근거**: RESEARCH의 "중첩 구조 사용 (관련 설정 그룹화, TOML 표준 활용)" 권장 반영
- **영향**: 환경변수 매핑이 WAIAAS_SECURITY_AUTO_STOP_CONSECUTIVE_FAILURES_THRESHOLD 등 길어지지만 명확

### Zod 스키마 전체 명시

- **결정**: 기존 `// ... 나머지 섹션` 주석을 모든 섹션(database, rpc, notifications, security) 전체 명시로 교체
- **근거**: config.toml SSoT 문서에서 Zod 스키마도 완전해야 참조 가치가 있음

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Zod 스키마 전체 섹션 명시**

- **Found during:** Task 1
- **Issue:** 기존 Zod 스키마가 daemon, keystore만 정의하고 `// ... 나머지 섹션`으로 생략되어 있어 새 security 필드 추가 시 불완전한 SSoT
- **Fix:** database, rpc, notifications, security 전체 섹션을 Zod 스키마로 명시. security 내부에 auto_stop, policy_defaults, kill_switch 중첩 객체 포함
- **Files modified:** 24-monorepo-data-directory.md
- **Commit:** 3861370

---

## Files Modified

| File | Changes |
|------|---------|
| `24-monorepo-data-directory.md` | [security] 테이블: session_ttl 86400, jwt_secret, nonce_cache_*, rate_limit 3-level 추가. 신규 테이블: [security.auto_stop], [security.policy_defaults], [security.kill_switch]. config.toml 예시: 모든 신규 필드 반영. Zod 스키마: 전체 섹션 명시. 환경변수 매핑: 11개 신규 항목 추가 |

---

## Verification Results

| Check | Result |
|-------|--------|
| session_ttl 86400 (4곳) | PASS |
| session_ttl 3600 잔존 없음 | PASS |
| jwt_secret 존재 (4곳: 테이블, Zod, 예시, 환경변수) | PASS |
| WAIAAS_SECURITY_JWT_SECRET | PASS |
| consecutive_failures_threshold (4곳) | PASS |
| nonce_cache_max (4곳) | PASS |
| nonce_cache_ttl (4곳) | PASS |
| recovery_cooldown 1800 (4곳) | PASS |
| rate_limit_global_rpm 100 (4곳) | PASS |
| rate_limit_session_rpm 300 (4곳) | PASS |
| rate_limit_tx_rpm 10 (4곳) | PASS |
| Phase 11 port 3100 보존 | PASS |
| Phase 11 hostname z.union 보존 | PASS |
| rate_limit_rpm (단일) 제거 완료 | PASS |
| delay_seconds, approval_timeout (4곳) | PASS |

---

## Next Phase Readiness

- Plan 12-03 (REST API <-> API Framework 스펙 통일) 진행 가능
- rate_limit 3-level 구조가 확립되어 API-04 (Rate Limiter 수치 통일)에서 config.toml 참조 가능
- config.toml이 모든 보안 설정의 SSoT로 확립됨

## Self-Check: PASSED
