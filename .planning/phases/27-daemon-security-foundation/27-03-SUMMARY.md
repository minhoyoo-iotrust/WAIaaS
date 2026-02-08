---
phase: 27-daemon-security-foundation
plan: 03
subsystem: auth
tags: [argon2id, master-password, nonce, sqlite, session-auth, localhost]

# Dependency graph
requires:
  - phase: 27-02
    provides: Rate Limiter 분리 + killSwitchGuard 확정
  - phase: 21
    provides: v0.5 인증 모델 재설계 (52-auth-model-redesign.md 기반)
provides:
  - Master Password Argon2id 통일 + 메모리 캐시 메커니즘 (DAEMON-05 해소)
  - INonceStore 인터페이스 + Memory/SQLite 2종 구현 스펙 (DAEMON-06 해소)
  - nonces 테이블 DDL (선택적)
affects: [28-implementation, 29-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MasterAuthManager 메모리 캐시 패턴: 데몬 시작 시 argon2.hash() -> cachedHash, API 요청 시 argon2.verify(cachedHash, input)"
    - "INonceStore 인터페이스 추상화: Memory/SQLite 전략 패턴, createNonceStore 팩토리"
    - "SQLite INSERT OR IGNORE 원자적 소비 패턴: result.changes > 0으로 최초/중복 판별"

key-files:
  created: []
  modified:
    - .planning/deliverables/34-owner-wallet-connection.md
    - .planning/deliverables/37-rest-api-complete-spec.md
    - .planning/deliverables/52-auth-model-redesign.md
    - .planning/deliverables/30-session-token-protocol.md
    - .planning/deliverables/24-monorepo-data-directory.md
    - .planning/deliverables/25-sqlite-schema.md

key-decisions:
  - "Argon2id 해시 메모리 캐시: 데몬 시작 시 1회 hash, 이후 verify로 ~50ms 검증 (매번 hash 대비 수십 배)"
  - "X-Master-Password 평문 전송: localhost only 통신, SHA-256 클라이언트 해싱은 보안 이점 없음"
  - "INonceStore 인터페이스: consume(nonce, expiresAt)->boolean + cleanup()->void 최소 계약"
  - "SQLite nonce INSERT OR IGNORE 패턴: PK 중복 시 0 rows -> replay 감지, DELETE WHERE expires_at <= now"
  - "nonce_storage 기본값 memory: flock 단일 인스턴스 보장, sqlite는 선택적 2차 방어"

patterns-established:
  - "MasterAuthManager: initialize(password)->void, verify(input)->boolean 2-method 인터페이스"
  - "createNonceStore 팩토리: config 값 기반 전략 선택"
  - "선택적 테이블 패턴: CREATE TABLE IF NOT EXISTS, config 설정에 따른 조건부 생성"

# Metrics
duration: ~25min
completed: 2026-02-08
---

# Phase 27 Plan 03: Master Password Argon2id 통일 + SQLite Nonce 저장 옵션 Summary

**Argon2id 메모리 캐시 기반 Master Password 인증 통일(DAEMON-05) + INonceStore 인터페이스 추상화로 Memory/SQLite nonce 저장 전략 패턴 확립(DAEMON-06)**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-02-08T08:50:00Z
- **Completed:** 2026-02-08T09:15:35Z
- **Tasks:** 2/2
- **Files modified:** 6

## Accomplishments

- Master Password 인증이 6개 문서에서 Argon2id로 통일되고, MasterAuthManager 클래스 스펙으로 메모리 캐시 메커니즘 확립
- INonceStore 인터페이스 + MemoryNonceStore/SqliteNonceStore 2종 구현 스펙 정의
- nonces 테이블 DDL을 25-sqlite-schema.md에 선택적 테이블로 추가 (ERD 포함)
- config.toml에 nonce_storage 옵션 (memory/sqlite) 추가, Zod 스키마 + 환경변수 매핑 완료

## Task Commits

Each task was committed atomically:

1. **Task 1: Master Password Argon2id 통일 (DAEMON-05)** - `b1c1c27` (feat)
2. **Task 2: SQLite nonce 저장 옵션 (DAEMON-06)** - `eef0f8d` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `.planning/deliverables/34-owner-wallet-connection.md` - 섹션 8.4 MasterAuthManager 클래스 스펙 추가, Argon2id 캐시 보안 근거
- `.planning/deliverables/37-rest-api-complete-spec.md` - 섹션 3.3 masterAuth 검증 Argon2id 캐시 명시, [v0.7 보완] 주석
- `.planning/deliverables/52-auth-model-redesign.md` - Argon2id 해시 메모리 캐시 메커니즘 서브섹션, MasterAuthManager 코드 스펙
- `.planning/deliverables/30-session-token-protocol.md` - 섹션 4.2 INonceStore 인터페이스, Memory/SQLite 구현, createNonceStore 팩토리
- `.planning/deliverables/24-monorepo-data-directory.md` - [security] nonce_storage 설정, Zod enum, 환경변수 WAIAAS_SECURITY_NONCE_STORAGE
- `.planning/deliverables/25-sqlite-schema.md` - 섹션 2.9 nonces 테이블 DDL + Drizzle ORM, ERD 추가, 관계 요약

## Decisions Made

| 결정 | 근거 | Task |
|------|------|------|
| Argon2id 해시 메모리 캐시 (~50ms verify) | 매 요청 argon2.hash (~1-3s) 대비 수십 배 빠른 검증 | Task 1 |
| X-Master-Password 평문 헤더 | localhost only 통신, SHA-256 클라이언트 해싱은 보안 이점 없음 (해시가 비밀번호 역할) | Task 1 |
| INonceStore 최소 인터페이스 (consume + cleanup) | 전략 패턴으로 Memory/SQLite 교체 가능, DI 주입 | Task 2 |
| INSERT OR IGNORE + changes > 0 패턴 | SQLite 원자적 중복 검사, 별도 SELECT 불필요, TOCTOU 없음 | Task 2 |
| nonce_storage 기본값 "memory" | flock이 단일 인스턴스 보장하므로 대부분 memory 충분, sqlite는 2차 방어 | Task 2 |
| nonces 테이블 CREATE TABLE IF NOT EXISTS | 선택적 테이블로 런타임 초기화 시 조건부 생성 | Task 2 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SHA-256/X-Master-Password-Hash 이미 v0.5에서 제거됨**
- **Found during:** Task 1 (34, 37, 52 문서 조사)
- **Issue:** 플랜은 SHA-256 해시 전송 방식이 존재한다고 가정했으나, v0.5 인증 모델 재설계 시 이미 X-Master-Password(평문)으로 전환 완료됨
- **Fix:** SHA-256 제거 대신, 실제 누락된 Argon2id 메모리 캐시 메커니즘을 명시적으로 추가. MasterAuthManager 클래스 스펙 정의
- **Files modified:** 34-owner-wallet-connection.md, 37-rest-api-complete-spec.md, 52-auth-model-redesign.md
- **Verification:** X-Master-Password-Hash 전체 deliverables 검색 -> 0건 확인
- **Committed in:** b1c1c27

---

**Total deviations:** 1 auto-fixed (1 Bug/적응)
**Impact on plan:** SHA-256 제거 작업이 불필요해졌으나, 대신 실질적으로 필요한 Argon2id 캐시 메커니즘 명시에 집중. 플랜의 핵심 목적(보안 수준 통일) 달성.

## Issues Encountered

없음

## User Setup Required

없음 - 설계 문서 수정만 수행.

## Next Phase Readiness

- Phase 27 (데몬 보안 기반) 3/3 플랜 완료. DAEMON-01~06 전체 해소
- Phase 28로 진행 준비 완료
- 차단 요소 없음

## Self-Check: PASSED

---
*Phase: 27-daemon-security-foundation*
*Completed: 2026-02-08*
