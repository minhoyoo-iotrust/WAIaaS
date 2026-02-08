---
phase: 27-daemon-security-foundation
verified: 2026-02-08T09:20:35Z
status: passed
score: 4/4 must-haves verified
---

# Phase 27: 데몬 보안 기반 확립 Verification Report

**Phase Goal:** 데몬 프로세스의 보안 메커니즘이 구현 시 경쟁 조건이나 보안 수준 불일치 없이 동작하는 상태를 만든다  
**Verified:** 2026-02-08T09:20:35Z  
**Status:** PASSED  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | JWT Secret이 current/previous dual-key 구조로 5분 전환 윈도우를 가지며, rotate CLI와 API가 정의되어, 로테이션 시 기존 세션이 즉시 무효화되지 않는다 | ✓ VERIFIED | 30-session-token-protocol.md 섹션 2.7: JwtSecretManager 인터페이스, TRANSITION_WINDOW_MS 5분, rotateJwtSecret() 함수, system_state 3개 키, dual-key 검증 순서 완전 정의. 28-daemon-lifecycle-cli.md: `waiaas secret rotate` CLI. 37-rest-api-complete-spec.md: `POST /v1/admin/rotate-secret` API (엔드포인트 #32) |
| 2 | 데몬 인스턴스 잠금이 flock 기반(Windows Named Mutex fallback)으로 전환되어, PID 파일 경쟁 조건이 제거되고, DAEMON-06의 nonce replay 방지를 위한 SQLite nonce 저장 옵션이 추가되었다 | ✓ VERIFIED | 28-daemon-lifecycle-cli.md 섹션 2.2: acquireDaemonLock() 함수 완전 정의 (flock exclusive non-blocking, daemon.lock fd 유지, Windows fallback 포트 바인딩). 섹션 5.0: daemon.lock 스펙 테이블, 비정상 종료 OS 자동 해제. 30-session-token-protocol.md 섹션 4.2: INonceStore, SqliteNonceStore, MemoryNonceStore. 24-monorepo: nonce_storage 옵션. 25-sqlite: nonces 테이블 DDL + 인덱스 |
| 3 | Rate Limiter가 globalRateLimit(#3.5, IP 1000/min)과 sessionRateLimit(#9, authRouter 후)로 2단계 분리되어, 미인증 공격자가 인증 사용자의 rate limit을 소진할 수 없다 | ✓ VERIFIED | 29-api-framework-design.md 섹션 2.1: 10단계 미들웨어 순서 (#3.5 globalRateLimit + #9 sessionRateLimit). 섹션 7.2: 2-Stage 속도 제한 테이블 (Stage 1 IP 1000/min, Stage 2 sessionId 300/min). registerMiddleware() 코드 갱신. 37-rest-api-complete-spec.md 섹션 4.1: 10단계 순서 동일 반영. 24-monorepo: rate_limit_global_ip_rpm = 1000 |
| 4 | killSwitchGuard 허용 엔드포인트 4개(health/status/recover/kill-switch)가 확정되고 503 SYSTEM_LOCKED 응답이 정의되었으며, Master Password 인증이 전체 Argon2id로 통일되었다 | ✓ VERIFIED | 36-killswitch-autostop-evm.md 섹션 2.4: KILL_SWITCH_ALLOWED_PATHS 배열 4개 항목, HTTP 503, SYSTEM_LOCKED 응답 완전 정의. 37-rest-api-complete-spec.md 섹션 4.2 + 10.7: 허용 목록 4개, SYSTEM_LOCKED 503 에러 코드. 52-auth-model-redesign.md 섹션 3.1: masterAuth explicit Argon2id, X-Master-Password 평문, cachedHash 메모리 캐시 메커니즘. 34-owner-wallet-connection.md 섹션 8.4: X-Master-Password 평문, Argon2id 검증 |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/deliverables/30-session-token-protocol.md` | JwtSecretManager 인터페이스, dual-key 검증 순서, system_state 저장, 5분 전환 윈도우, INonceStore 인터페이스 | ✓ VERIFIED | 섹션 2.7: 1577줄 문서 내 JwtSecretManager 클래스, TRANSITION_WINDOW_MS 상수, rotateJwtSecret() 함수, initializeJwtSecret() 초기화 로직, dual-key 검증 순서(current->previous 5분 윈도우) 완전 정의. 섹션 4.2: INonceStore 인터페이스, MemoryNonceStore, SqliteNonceStore 클래스 스펙 |
| `.planning/deliverables/28-daemon-lifecycle-cli.md` | flock 기반 daemon.lock 잠금, acquireDaemonLock 함수, closeSync(lockFd), waiaas secret rotate CLI | ✓ VERIFIED | 섹션 2.2: acquireDaemonLock() 함수 (flock exclusive non-blocking, fd 유지), Windows fallback (포트 바인딩). 섹션 3 Step 10: closeSync(lockFd). 섹션 5.0: daemon.lock 파일 스펙 완전 정의 (경로, 잠금 방식, 비정상 종료 처리). 섹션 6.11: waiaas secret rotate CLI 상세 |
| `.planning/deliverables/37-rest-api-complete-spec.md` | POST /v1/admin/rotate-secret 엔드포인트, 10단계 미들웨어 순서, SYSTEM_LOCKED 에러 코드 | ✓ VERIFIED | 섹션 9.3: POST /v1/admin/rotate-secret 엔드포인트 스펙 (masterAuth explicit, previousExpiry 응답, 429 연속 로테이션 방지). 섹션 4.1: 10단계 미들웨어 순서 (#3.5 globalRateLimit, #7 killSwitchGuard, #8 authRouter, #9 sessionRateLimit). 섹션 10.7: SYSTEM_LOCKED 503 에러 코드 |
| `.planning/deliverables/29-api-framework-design.md` | 10단계 미들웨어 순서, globalRateLimit + sessionRateLimit 분리 설계 | ✓ VERIFIED | 섹션 2.1: 10단계 미들웨어 순서 테이블 (#3.5 globalRateLimit IP 1000/min, #9 sessionRateLimit session 300/min). 섹션 2.2: registerMiddleware() 코드 갱신. 섹션 7: Rate Limiter 전면 재구성 (2-Stage 분리, Stage 1/2 코드 패턴, lru-cache 구현) |
| `.planning/deliverables/36-killswitch-autostop-evm.md` | KILL_SWITCH_ALLOWED_PATHS 4개, HTTP 503 | ✓ VERIFIED | 섹션 2.4: KILL_SWITCH_ALLOWED_PATHS 배열 정의 (health/status/recover/kill-switch 4개), HTTP 503 SYSTEM_LOCKED 응답 코드 블록, recover 경로 /v1/admin/recover 변경 반영 |
| `.planning/deliverables/52-auth-model-redesign.md` | masterAuth explicit Argon2id 확인/보강, 해시 메모리 캐시 명시 | ✓ VERIFIED | 섹션 3.1: masterAuth explicit, X-Master-Password 헤더 (평문), argon2.verify(cachedHash, inputPassword). 섹션 3.1 하위: MasterAuthManager 클래스, initialize() 해시 생성, verify() 검증 메서드, 메모리 캐시 메커니즘 완전 정의 |
| `.planning/deliverables/34-owner-wallet-connection.md` | CLI kill-switch 인증 Argon2id 전환, X-Master-Password 평문 | ✓ VERIFIED | 섹션 8.4: masterAuth(explicit) Argon2id 통일, X-Master-Password 헤더 평문 전송, localhost only 보안 근거, 서버 argon2.verify 검증 |
| `.planning/deliverables/24-monorepo-data-directory.md` | jwt_secret 초기값 전용 명시, rate_limit_global_ip_rpm 설정, nonce_storage 옵션 | ✓ VERIFIED | 섹션 3.2.1: jwt_secret 설명 "[v0.7 보완] 초기값 전용. waiaas init 시 생성하여 config 기록. 이후 DB system_state에서 관리. waiaas secret rotate 시 config.toml 갱신 안 함". rate_limit_global_ip_rpm = 1000 (기존 rate_limit_global_rpm에서 이름/값 변경). nonce_storage = "memory" (타입: "memory"\|"sqlite") |
| `.planning/deliverables/25-sqlite-schema.md` | nonces 테이블 DDL | ✓ VERIFIED | nonces 테이블 DDL 정의: CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, created_at INTEGER, expires_at INTEGER), idx_nonces_expires_at 인덱스 정의, "선택적 테이블 (nonce_storage='sqlite')" 명시 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| 30-session-token-protocol.md (JwtSecretManager) | 28-daemon-lifecycle-cli.md (waiaas secret rotate) | CLI가 rotateJwtSecret() 호출하여 system_state 갱신 | ✓ WIRED | 28-daemon 섹션 6.11에서 waiaas secret rotate CLI가 POST /v1/admin/rotate-secret API 호출하는 구조 명시. 30-session 섹션 2.7에서 rotateJwtSecret() 함수가 system_state 3개 키 갱신 |
| 37-rest-api-complete-spec.md (rotate-secret API) | 30-session-token-protocol.md (JwtSecretManager) | API 엔드포인트가 동일한 rotateJwtSecret() 호출 | ✓ WIRED | 37-rest-api 섹션 9.3: POST /v1/admin/rotate-secret 엔드포인트가 masterAuth explicit 인증 후 rotateJwtSecret() 호출. 30-session 섹션 2.7: rotateJwtSecret() 함수 스펙과 API 응답 { previousExpiry } 일치 |
| 28-daemon-lifecycle-cli.md (acquireDaemonLock) | 28-daemon-lifecycle-cli.md (finalCleanup) | lockFd가 시작 시 획득되어 종료 시 closeSync로 해제 | ✓ WIRED | 섹션 2.2: acquireDaemonLock() 함수가 lockFd 반환. 섹션 3 Step 10: closeSync(lockFd) 명시적 해제. 주석으로 "OS 자동 해제하지만 명시적 정리" 근거 설명 |
| 29-api-framework-design.md (#3.5 globalRateLimit) | 37-rest-api-complete-spec.md (미들웨어 순서) | 두 문서의 미들웨어 순서/번호가 동일해야 함 | ✓ WIRED | 29-api 섹션 2.1: 10단계 순서 (#3.5 globalRateLimit, #7 killSwitchGuard, #8 authRouter, #9 sessionRateLimit). 37-rest-api 섹션 4.1: 동일한 10단계 순서 반영. 번호 일치 확인 |
| 36-killswitch-autostop-evm.md (허용 목록) | 52-auth-model-redesign.md (killSwitchGuard) | 두 문서의 허용 경로 목록이 동일해야 함 | ✓ WIRED | 36-killswitch 섹션 2.4: KILL_SWITCH_ALLOWED_PATHS 4개 (health/status/recover/kill-switch), /v1/admin/recover. 52-auth 섹션 7.4에도 동일한 허용 목록 반영 |
| 24-monorepo-data-directory.md (rate_limit_global_ip_rpm) | 29-api-framework-design.md (globalRateLimit config) | config 키명이 코드에서 참조하는 이름과 동일 | ✓ WIRED | 24-monorepo 섹션 3.2.1: rate_limit_global_ip_rpm = 1000. 29-api 섹션 2.2: globalRateLimitMiddleware({ maxRpm: config.security.rate_limit_global_ip_rpm }). 섹션 7.4: config.toml 키명 동일 |
| 30-session-token-protocol.md (INonceStore) | 25-sqlite-schema.md (nonces 테이블) | SqliteNonceStore가 nonces 테이블을 사용 | ✓ WIRED | 30-session 섹션 4.2: SqliteNonceStore.consume() 구현에서 "INSERT OR IGNORE INTO nonces ..." 쿼리 명시. 25-sqlite: nonces 테이블 DDL (nonce PK, expires_at, 인덱스) 정의 |
| 24-monorepo-data-directory.md (nonce_storage) | 30-session-token-protocol.md (INonceStore) | config 값에 따라 MemoryNonceStore 또는 SqliteNonceStore 생성 | ✓ WIRED | 24-monorepo: nonce_storage = "memory" (타입: "memory"\|"sqlite"). 30-session 섹션 4.2: createNonceStore(config.nonce_storage) 팩토리 패턴, 'memory'면 MemoryNonceStore, 'sqlite'면 SqliteNonceStore 반환 |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| DAEMON-01: JWT Secret dual-key rotation | ✓ SATISFIED | - |
| DAEMON-02: flock 기반 인스턴스 잠금 | ✓ SATISFIED | - |
| DAEMON-03: Rate Limiter 2단계 분리 | ✓ SATISFIED | - |
| DAEMON-04: killSwitchGuard 허용 목록 확정 | ✓ SATISFIED | - |
| DAEMON-05: Master Password Argon2id 통일 | ✓ SATISFIED | - |
| DAEMON-06: SQLite nonce 저장 옵션 | ✓ SATISFIED | - |

### Anti-Patterns Found

No blocking anti-patterns detected. All design documents include `[v0.7 보완]` tags for traceability as required.

### Human Verification Required

None. All success criteria are structurally verifiable through design document content and cross-document consistency checks.

---

## Detailed Verification Evidence

### Truth 1: JWT Secret dual-key rotation with 5-minute transition window

**Evidence from 30-session-token-protocol.md:**
- Line 160: `JwtSecretManager` interface definition with `{ current, previous?, rotatedAt? }`
- Line 176: `TRANSITION_WINDOW_MS = 5 * 60 * 1000` constant (5 minutes)
- Line 178-228: `JwtSecretManager` class with dual-key verification logic (try current, fallback to previous if within 5-minute window)
- Line 234-303: `rotateJwtSecret()` function spec (BEGIN IMMEDIATE transaction, current->previous move, new secret generation, audit_log SECRET_ROTATED, 5-minute cooldown enforcement)
- Line 308-340: `initializeJwtSecret()` daemon startup initialization (check rotatedAt, clear previous if > 5 minutes elapsed)
- Line 232: config.toml relationship clarified ("초기값 전용. waiaas init 시 초기값으로만 사용. 이후 DB system_state에서 관리")

**Evidence from 28-daemon-lifecycle-cli.md:**
- Line 2066: `waiaas secret rotate` CLI command definition
- Line 2068-2095: CLI spec (masterAuth explicit, X-Master-Password header, POST to /v1/admin/rotate-secret, previousExpiry output)

**Evidence from 37-rest-api-complete-spec.md:**
- Line 2647-2680: `POST /v1/admin/rotate-secret` endpoint spec (masterAuth explicit, previousExpiry ISO8601 response, 429 on rapid rotation)
- Line 3179: Endpoint #32 in endpoint table

**Evidence from 24-monorepo-data-directory.md:**
- Line 755: `jwt_secret` config entry with "[v0.7 보완] 초기값 전용" comment
- Line 884: config.toml template with jwt_secret init-only comment

### Truth 2: flock-based daemon instance lock + SQLite nonce storage option

**Evidence from 28-daemon-lifecycle-cli.md:**
- Line 208-212: Step 1 environment validation modified to use `acquireDaemonLock(dataDir)` instead of PID file check
- Line 229-282: `acquireDaemonLock()` function complete spec (openSync daemon.lock, flockSync exclusive non-blocking, fd retention, EWOULDBLOCK handling)
- Line 285-295: Windows fallback (port binding as single-instance guarantee)
- Line 829: Graceful shutdown Step 10: `closeSync(lockFd)` added
- Line 1017-1042: daemon.lock file spec table (path, flock fd-based locking, PID content as auxiliary info, OS auto-release on abnormal termination)
- Line 1038-1042: status command process check order (lock fd attempt -> health check)

**Evidence from 30-session-token-protocol.md:**
- Line 741-747: `INonceStore` interface definition (consume(), cleanup() methods)
- Line 760-796: `MemoryNonceStore` implementation spec (LRU cache based)
- Line 798-851: `SqliteNonceStore` implementation spec (INSERT OR IGNORE pattern, nonces table usage)
- Line 859-869: `createNonceStore()` factory pattern (config.nonce_storage determines Memory vs SQLite)

**Evidence from 24-monorepo-data-directory.md:**
- Line 660: WAIAAS_SECURITY_NONCE_STORAGE env var mapping
- Line 758: `nonce_storage = "memory"` config entry with "[v0.7 보완]" tag and type `"memory"|"sqlite"`
- Line 887: config.toml template with nonce_storage option

**Evidence from 25-sqlite-schema.md:**
- Line 896-902: nonces table DDL (CREATE TABLE IF NOT EXISTS, PK on nonce, created_at/expires_at columns, idx_nonces_expires_at index)
- Line 904: "IF NOT EXISTS 사용 근거: 선택적 테이블 (nonce_storage='sqlite')" comment

### Truth 3: Rate Limiter 2-stage separation (global IP + session)

**Evidence from 29-api-framework-design.md:**
- Line 176: Middleware order changed from 9 to 10 stages, with `[v0.7 보완]` tag
- Line 183: #3.5 `globalRateLimit` (IP 1000/min, 전체 적용)
- Line 189: #9 `sessionRateLimit` (session 300/min, 인증 완료 후)
- Line 191-197: DAEMON-03 resolution rationale (2-stage separation prevents unauthenticated attackers from exhausting authenticated users' session limits)
- Line 230-233: registerMiddleware() code: globalRateLimitMiddleware with config.security.rate_limit_global_ip_rpm
- Line 263-265: sessionRateLimitMiddleware with sessionRpm/txRpm config
- Line 452-463: globalRateLimit middleware spec (IP key, 1000 req/min, lru-cache)
- Line 514-525: sessionRateLimit middleware spec (sessionId key, 300 req/min, 인증 완료 후)
- Line 1807-1808: 2-Stage table (Stage 1 globalRateLimit IP 1000/min, Stage 2 sessionRateLimit sessionId 300/min)
- Line 1832-1880: Stage 1 code pattern (globalRateLimitMiddleware implementation)
- Line 1894-1956: Stage 2 code pattern (sessionRateLimitMiddleware, 공개 엔드포인트 skip logic)

**Evidence from 37-rest-api-complete-spec.md:**
- Line 281: 10단계 미들웨어 순서 (9->10 stages)
- Line 288: #3.5 globalRateLimit (IP 1000/min)
- Line 292: #7 killSwitchGuard (기존 #8->#7)
- Line 293: #8 authRouter (기존 #9->#8)
- Line 294: #9 sessionRateLimit (세션 300/min, tx 10/min)

**Evidence from 24-monorepo-data-directory.md:**
- Line 663: WAIAAS_SECURITY_RATE_LIMIT_GLOBAL_IP_RPM env var
- Line 761: `rate_limit_global_ip_rpm = 1000` with "[v0.7 보완]" tag (기존 rate_limit_global_rpm=100에서 이름/값 변경)
- Line 890: config.toml template with rate_limit_global_ip_rpm = 1000

### Truth 4: killSwitchGuard allowed endpoints + 503 SYSTEM_LOCKED + Argon2id unification

**Evidence from 36-killswitch-autostop-evm.md:**
- Line 160-206: killSwitchGuard middleware code block with `[v0.7 보완]` annotations
- Line 176-181: `KILL_SWITCH_ALLOWED_PATHS` array with 4 entries (health, status, recover, kill-switch)
- Line 191-204: HTTP 503 response with SYSTEM_LOCKED error code, details, hint
- Line 216-220: 변경 사항 요약 (허용 목록 3->4개, recover 경로 /v1/admin/recover, 401->503)

**Evidence from 37-rest-api-complete-spec.md:**
- Line 300-311: killSwitchGuard 허용 목록 4개 (health/status/recover/kill-switch)
- Line 311-320: 503 SYSTEM_LOCKED 응답 JSON
- Line 2819: SYSTEM_LOCKED 503 에러 코드 in error table

**Evidence from 52-auth-model-redesign.md:**
- Line 48: `X-Master-Password` 헤더 (기존 X-Master-Password-Hash에서 변경)
- Line 72: "마스터 패스워드(Argon2id) 기반 인증"
- Line 100: `X-Master-Password` 헤더 필수 (explicit mode)
- Line 104: "Argon2id verify 수행"
- Line 109-138: explicitMasterAuthMiddleware 코드 (X-Master-Password 헤더 검증, argon2.verify(cachedHash, password))
- Line 164-189: MasterAuthManager 클래스 (initialize() 메모리 해시 캐시, verify() 검증)
- Line 166: `argon2.hash(masterPassword, { type: argon2.argon2id })` 메모리 캐시 생성
- Line 188: `argon2.verify(this.cachedHash, inputPassword)` 검증

**Evidence from 34-owner-wallet-connection.md:**
- Line 1360: "X-Master-Password 헤더로 **마스터 패스워드 평문**을 전송하며, 서버에서 **Argon2id 검증**을 수행"
- Line 1365: `X-Master-Password: <평문 패스워드>` 인증 흐름

---

## Summary

Phase 27 goal fully achieved. All 4 success criteria verified:

1. **JWT Secret dual-key rotation**: JwtSecretManager with current/previous keys, 5-minute transition window, rotate CLI/API, system_state storage — **COMPLETE**
2. **flock-based daemon lock**: acquireDaemonLock() with fd retention, Windows fallback, PID file race condition eliminated, SQLite nonce storage option — **COMPLETE**
3. **2-stage Rate Limiter**: globalRateLimit (#3.5, IP 1000/min) + sessionRateLimit (#9, session 300/min), unauthenticated/authenticated separation — **COMPLETE**
4. **killSwitchGuard + Argon2id**: 4 allowed endpoints confirmed, 503 SYSTEM_LOCKED defined, Master Password unified to Argon2id with memory cache — **COMPLETE**

All 6 requirements (DAEMON-01 through DAEMON-06) satisfied. Cross-document consistency verified across 9 design documents. All modifications tagged with `[v0.7 보완]` for traceability.

**구현 장애 요소 해소 완료**: 데몬 프로세스의 6가지 CRITICAL/HIGH 보안 장애 요소가 설계 수준에서 완전히 해소되어, 구현 시 경쟁 조건이나 보안 수준 불일치 없이 동작하는 설계를 확보했다.

---

_Verified: 2026-02-08T09:20:35Z_  
_Verifier: Claude (gsd-verifier)_
