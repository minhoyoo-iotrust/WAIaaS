# Phase 27 Plan 01: JWT Secret Dual-Key Rotation + flock 데몬 잠금 Summary

---
phase: 27
plan: 01
subsystem: daemon-security
tags: [jwt, secret-rotation, dual-key, flock, daemon-lock, pid, cli]
requires:
  - phase-07 (SESS-PROTO: JWT Secret 관리 원안)
  - phase-06 (CORE-05: 데몬 라이프사이클, PID 파일)
  - phase-09 (API-SPEC: REST API 엔드포인트)
provides:
  - JwtSecretManager dual-key 검증 인터페이스
  - rotateJwtSecret() 원자적 로테이션 함수
  - POST /v1/admin/rotate-secret API 엔드포인트
  - waiaas secret rotate CLI 커맨드
  - acquireDaemonLock() flock 기반 인스턴스 잠금
  - daemon.lock 파일 스펙
affects:
  - phase-28 (구현 시 JwtSecretManager + acquireDaemonLock 구현 필요)
  - phase-27-02 (system_state 테이블 참조)
  - phase-27-03 (sessionAuth Stage 1 dual-key 적용)
tech-stack:
  added: []
  patterns: [dual-key-rotation, flock-locking, transition-window]
key-files:
  created: []
  modified:
    - .planning/deliverables/30-session-token-protocol.md
    - .planning/deliverables/28-daemon-lifecycle-cli.md
    - .planning/deliverables/37-rest-api-complete-spec.md
    - .planning/deliverables/24-monorepo-data-directory.md
decisions:
  - "JWT Secret dual-key: current/previous 구조, 5분 전환 윈도우 (고정값, config 불가)"
  - "system_state 테이블에 jwt_secret_current/previous/rotated_at 저장"
  - "config.toml jwt_secret은 초기값 전용, 이후 DB에서 관리"
  - "flock exclusive non-blocking으로 인스턴스 잠금, PID 파일은 보조 정보로 격하"
  - "Windows에서 flock 미사용, HTTP 포트 바인딩으로 단일 인스턴스 보장"
  - "연속 로테이션 5분 이내 거부 (429 ROTATION_TOO_RECENT)"
  - "데몬 시작 시 rotatedAt 5분 초과 확인하여 previous 즉시 삭제"
metrics:
  duration: ~6분
  completed: 2026-02-08
---

## One-liner

JWT Secret dual-key rotation (5분 전환 윈도우, system_state 저장) + flock 기반 데몬 인스턴스 잠금 (PID TOCTOU 제거)

## Task Commits

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | JWT Secret dual-key rotation 설계 보완 (DAEMON-01) | 1967359 | 30-session: JwtSecretManager, rotateJwtSecret(), system_state 3키, 5분 윈도우. 37-rest-api: POST /v1/admin/rotate-secret. 24-monorepo: jwt_secret 초기값 전용 |
| 2 | flock 기반 데몬 인스턴스 잠금 전환 (DAEMON-02) | 68ca553 | 28-daemon: acquireDaemonLock(), daemon.lock, closeSync(lockFd), Windows fallback, PID 보조 격하, waiaas secret rotate CLI. 24-monorepo: daemon.lock 추가 |

## Changes Summary

### 30-session-token-protocol.md
- **섹션 2.7.5**: "즉시 무효화" -> "5분 전환 윈도우" 교체. JwtSecretManager 인터페이스 (current/previous/rotatedAt). dual-key 검증 순서 (current 우선, 전환 윈도우 내 previous 시도). system_state 테이블 3키 정의.
- **rotateJwtSecret()**: BEGIN IMMEDIATE 트랜잭션, current->previous 이동, 새 secret 생성, 연속 로테이션 5분 거부, audit_log SECRET_ROTATED.
- **데몬 시작 초기화**: rotatedAt 5분 초과 시 previous 즉시 null + PREVIOUS_SECRET_EXPIRED 로그. config.toml에서 system_state로 마이그레이션 로직.
- **섹션 9.1**: JWT Secret 수명주기 테이블 v0.7 갱신.

### 28-daemon-lifecycle-cli.md
- **Step 1**: PID 파일 기반 감지 -> acquireDaemonLock() flock 전환. lockFd 반환하여 데몬 수명 동안 유지.
- **acquireDaemonLock()**: flock exclusive non-blocking, EWOULDBLOCK/EAGAIN -> ALREADY_RUNNING, lock 파일에 PID 기록(보조). Windows fallback (포트 바인딩).
- **Step 10**: closeSync(lockFd) 추가 (db.close() -> closeSync(lockFd) -> unlinkSync(pidPath)).
- **섹션 5**: daemon.lock 파일 스펙 (5.0), PID 파일 보조 정보 격하 (5.1), status 명령 3단계 확인 순서.
- **CLI**: `waiaas secret rotate` 커맨드 추가 (HTTP POST /v1/admin/rotate-secret 호출, masterAuth explicit).

### 37-rest-api-complete-spec.md
- **섹션 9.3**: POST /v1/admin/rotate-secret 엔드포인트 추가. masterAuth(explicit), 빈 본문, 200 { previousExpiry }, 429 ROTATION_TOO_RECENT.
- **엔드포인트 총수**: 36 -> 37 (+1). Admin API: 3 -> 4.
- **인덱스 테이블**: 32번으로 삽입, 이후 번호 재조정.

### 24-monorepo-data-directory.md
- **[security].jwt_secret**: "초기값 전용" 명시 + system_state 참조 주석.
- **디렉토리 트리**: daemon.lock 파일 추가.
- **상세 테이블**: daemon.lock 행 추가, daemon.pid 보조 정보 격하.

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| 5분 전환 윈도우 고정값 | 24h JWT 만료 대비 짧아 보안 영향 최소, 에이전트 갱신에 충분한 시간. 운영 복잡성 방지 | 구현 시 하드코딩 상수 |
| system_state 테이블 저장 | config.toml은 파일 잠금 없이 수정 위험. DB 트랜잭션으로 원자성 보장 | system_state 테이블 필요 (이미 CORE-02에서 정의 가능) |
| 연속 로테이션 거부 | previous-이전 키 토큰 즉시 무효화 방지 | rotate API에 429 응답 추가 |
| flock + fd 유지 | OS 커널 수준 원자적 잠금, 비정상 종료 시 자동 해제 | fs-ext 패키지 또는 네이티브 addon 필요 |
| Windows 포트 바인딩 fallback | flock Windows 미지원. 포트 바인딩 실패(EADDRINUSE)가 자연스러운 중복 감지 | Windows에서 daemon.lock 미생성 |
| PID 파일 보조 격하 | flock이 주 잠금이므로 PID는 표시 목적만. check-then-act 경쟁 조건 완전 제거 | status 명령 로직 변경 필요 |

## Deviations from Plan

None - plan executed exactly as written.

## Cross-Document Consistency

### 3자 연결 검증
1. **rotate-secret API** (37-rest-api-complete-spec.md 섹션 9.3) -> `rotateJwtSecret()` 호출 명시
2. **rotateJwtSecret()** (30-session-token-protocol.md 섹션 2.7.5) -> system_state 갱신, audit_log SECRET_ROTATED
3. **waiaas secret rotate CLI** (28-daemon-lifecycle-cli.md 섹션 8.4) -> HTTP POST /v1/admin/rotate-secret 호출

### lockFd 수명 연결 검증
1. **acquireDaemonLock()** (28-daemon-lifecycle-cli.md Step 1) -> lockFd 획득, 반환
2. **finalCleanup()** (28-daemon-lifecycle-cli.md Step 10) -> closeSync(lockFd) 해제

### config.toml -> system_state 마이그레이션 연결
1. **24-monorepo-data-directory.md** jwt_secret "초기값 전용" 명시
2. **30-session-token-protocol.md** initializeJwtSecret()에서 config -> system_state 마이그레이션

## Next Phase Readiness

- **Phase 27-02** (system_state 테이블): jwt_secret_current/previous/rotated_at 키가 필요. 기존 CORE-02 system_state 설계와 정합 확인 필요.
- **Phase 27-03** (sessionAuth 보강): Stage 1에서 JwtSecretManager.verifyToken() 호출로 교체 필요.
- **구현 시**: fs-ext npm 패키지 (flockSync) 또는 Node.js native addon 의존성 추가 필요.

## Self-Check: PASSED
