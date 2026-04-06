# Phase 27: 데몬 보안 기반 확립 - Research

**Researched:** 2026-02-08
**Domain:** JWT key rotation, OS-level process locking, two-tier rate limiting, kill switch middleware, Argon2id password verification, nonce replay prevention
**Confidence:** HIGH

## Summary

Phase 27은 데몬 프로세스의 보안 메커니즘 6건(DAEMON-01~06)을 기존 설계 문서 직접 수정으로 해소하는 DESIGN-ONLY phase이다. 수정 대상은 30-session-token-protocol.md (JWT dual-key rotation), 28-daemon-lifecycle-cli.md (flock 잠금), 29-api-framework-design.md (2단계 Rate Limiter, 미들웨어 순서 변경), 37-rest-api-complete-spec.md (killSwitchGuard 허용 목록, Rate Limiter 반영), 36-killswitch-autostop-evm.md (killSwitchGuard 허용 목록 확장, 503 응답), 34-owner-wallet-connection.md (Master Password Argon2id 통일), 24-monorepo-data-directory.md (nonce_storage 옵션) 등 7개 이상의 기존 문서이다.

연구 결과, 현재 설계에 다음 6개 gap이 존재한다: (1) JWT Secret 변경 시 모든 세션이 즉시 무효화되는 전환 절차 부재, (2) PID 파일 기반 인스턴스 잠금의 check-then-act 경쟁 조건, (3) 단일 rateLimiter(#7)가 인증 전 위치하여 미인증 공격자가 인증 사용자 한도 소진 가능, (4) killSwitchGuard 허용 목록이 3개로 불완전(kill-switch 상태 조회 누락)하고 HTTP 상태 코드가 401로 부적절(503이어야 함), (5) Kill Switch CLI 인증이 SHA-256 단순 해시로 Argon2id와 보안 수준 불일치, (6) 인메모리 LRU nonce 캐시가 다중 인스턴스 시 replay attack에 취약.

**Primary recommendation:** 기존 설계 문서 7개를 [v0.7 보완] 태그로 직접 수정하며, 새 문서는 생성하지 않는다. 3개 plan으로 논리적 그룹핑: (1) JWT rotation + flock, (2) Rate Limiter + killSwitchGuard, (3) Master Password + nonce storage.

## Standard Stack

이 phase는 설계 문서 수정만 수행하므로 새로운 라이브러리 도입이 거의 없다. 기존 설계에서 참조하는 스택과, 설계 변경에 필요한 최소 추가 의존성을 확인한다.

### Core (기존 설계 참조)
| Library | Version | Purpose | 참조 문서 |
|---------|---------|---------|-----------|
| `jose` | v6.x | JWT SignJWT/jwtVerify, HS256 | 30-session-token-protocol.md |
| `argon2` | latest | Argon2id 키 파생 + 비밀번호 검증 | 26-keystore-spec.md |
| `lru-cache` | latest | nonce 캐시, Rate Limiter 저장소 | 29-api-framework-design.md, 30-session-token-protocol.md |
| `hono` | 4.x | HTTP 서버, 미들웨어 체인 | 29-api-framework-design.md |
| `better-sqlite3` | latest | SQLite 접근 (nonce 저장 옵션) | 25-sqlite-schema.md |

### 설계 변경에 참조할 추가 의존성
| Library | Version | Purpose | 선택 근거 |
|---------|---------|---------|-----------|
| `proper-lockfile` | 4.1.x | 크로스 플랫폼 파일 잠금 (mkdir 기반, stale 감지) | flock 대안. 네이티브 addon 불필요, 크로스 플랫폼 |
| `fs-ext` (대안) | 2.x | POSIX flock(2) 바인딩 | 네이티브 addon 필요, macOS/Linux 전용 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `proper-lockfile` (mkdir 기반) | `fs-ext` flockSync (POSIX flock) | flock은 진정한 OS 레벨 잠금이지만 네이티브 addon. proper-lockfile은 순수 JS이지만 polling 기반 |
| `proper-lockfile` | `os-lock` (fcntl/LockFileEx) | os-lock은 OS 네이티브이지만 유지보수 불확실. proper-lockfile은 성숙하고 안정적 |
| 인메모리 LRU nonce | SQLite nonce 테이블 | SQLite는 프로세스 재시작 시에도 지속되지만 성능 오버헤드. LRU는 빠르지만 휘발성 |

**설계 의사결정: 잠금 방식**

objectives 파일에는 "`fs-ext` 또는 `proper-lockfile` 중 택 1"이라고 되어 있다. 설계 수준에서의 추천:

- **추천: Node.js `fs.open()` + POSIX flock 시맨틱 직접 구현** -- `openSync(lockPath, 'wx')` (O_EXCL)로 원자적 생성 + fd를 데몬 수명 동안 유지. 프로세스 종료 시 fd 자동 해제로 stale lock 문제 원천 차단. 이 패턴은 외부 라이브러리 없이 구현 가능하다.
- **Windows fallback:** `@vscode/windows-mutex` 패턴 참조하되, 기존 28-daemon-lifecycle-cli.md의 Windows HTTP API shutdown 방식과 일관되게 "HTTP 포트 바인딩 자체가 단일 인스턴스 보장" 패턴으로 대체 가능.
- **proper-lockfile은 보조 옵션:** stale 감지 + 주기적 mtime 갱신이 과잉이며, 데몬 프로세스의 fd 유지 패턴이 더 단순하고 신뢰성 높음.

**Confidence: HIGH** -- fd 기반 잠금은 POSIX 표준이며, Node.js `openSync('wx')` + fd 유지는 검증된 패턴.

## Architecture Patterns

### 현재 미들웨어 순서 (v0.5)
```
#1 requestId -> #2 requestLogger -> #3 shutdownGuard -> #4 secureHeaders
-> #5 hostValidation -> #6 cors -> #7 rateLimiter -> #8 killSwitchGuard -> #9 authRouter
```

### 변경 후 미들웨어 순서 (v0.7)
```
#1 requestId -> #2 requestLogger -> #3 shutdownGuard -> #3.5 globalRateLimit(IP, 1000/min)
-> #4 secureHeaders -> #5 hostValidation -> #6 cors -> #7 killSwitchGuard
-> #8 authRouter -> #9 sessionRateLimit(session 300/min, tx 10/min)
```

**변경 요약:**
1. 기존 #7 `rateLimiter` 단일 미들웨어가 `#3.5 globalRateLimit` + `#9 sessionRateLimit` 2단계로 분리
2. `killSwitchGuard`가 #8에서 #7로 이동 (rateLimiter 분리로 자연스러운 재배치)
3. `authRouter`는 #9에서 #8로 이동
4. `sessionRateLimit`이 새로운 #9로 추가 (authRouter 직후)

### Pattern 1: JWT Dual-Key Rotation
**What:** JWT Secret 변경 시 current/previous 2개 키를 5분간 병행 운영하여 기존 세션의 즉시 무효화를 방지한다.
**Why needed:** 현재 설계(30-session-token-protocol.md 2.7.5)는 "Secret 변경 시 모든 세션 즉시 무효화"를 의도된 동작으로 기술하나, 프로덕션에서 모든 AI 에이전트가 동시 인증 실패하는 것은 운영 장애이다.
**Confidence:** HIGH (jose jwtVerify는 try-catch로 다중 키 검증이 가능하며, 이는 표준 key rotation 패턴)

```typescript
// 설계 스펙 (30-session-token-protocol.md에 추가할 내용)
interface JwtSecretManager {
  current: Uint8Array          // 새 토큰 발급 + 1차 검증
  previous?: Uint8Array        // 2차 검증 전용 (5분 윈도우)
  rotatedAt?: number           // 로테이션 시각 (Unix epoch ms)
}

// 검증 로직
async function verifySessionToken(token: string, secrets: JwtSecretManager): Promise<JwtPayload> {
  try {
    return await jwtVerify(token, secrets.current, { issuer: 'waiaas' })
  } catch (err) {
    // current 검증 실패 시, previous가 존재하고 5분 이내이면 재시도
    if (secrets.previous && secrets.rotatedAt &&
        Date.now() - secrets.rotatedAt < 5 * 60 * 1000) {
      return await jwtVerify(token, secrets.previous, { issuer: 'waiaas' })
    }
    throw err  // 둘 다 실패 시 원래 에러 전파
  }
}
```

**Key decisions for planner:**
- 로테이션 시 config.toml이 아닌 **SQLite system_state 테이블**에서 secret 관리 (objectives에 명시)
- config.toml의 `security.jwt_secret`은 **초기값**(init 시점) 전용. 이후 DB에서 관리
- 자동 로테이션은 **지원하지 않음** (운영자 명시적 실행만)
- 전환 윈도우: 5분 (고정값, config 불가)
- CLI 명령: `waiaas secret rotate`
- API: `POST /v1/admin/rotate-secret` (masterAuth explicit)
- audit_log: `SECRET_ROTATED` 이벤트

### Pattern 2: flock 기반 인스턴스 잠금
**What:** PID 파일 기반 잠금을 OS 레벨 파일 디스크립터 잠금으로 교체하여 경쟁 조건을 제거한다.
**Why needed:** 현재 설계(28-daemon-lifecycle-cli.md 5.2)의 `isProcessRunning(pid)` 확인과 `unlinkSync(pidPath)` 사이에 TOCTOU 경쟁 조건이 존재한다.
**Confidence:** HIGH (POSIX fd 기반 잠금은 프로세스 종료 시 자동 해제되어 stale lock 문제가 없음)

```typescript
// 설계 스펙 (28-daemon-lifecycle-cli.md Step 1에 교체할 내용)
import { openSync, writeSync } from 'node:fs'

function acquireDaemonLock(dataDir: string): number {
  const lockPath = path.join(dataDir, 'daemon.lock')

  // O_WRONLY | O_CREAT: 파일 생성/열기
  // 'w' 모드 = O_WRONLY | O_CREAT | O_TRUNC
  const fd = openSync(lockPath, 'w')

  try {
    // POSIX flock: exclusive, non-blocking
    // Node.js에서 직접 flock syscall은 fs-ext 필요
    // 대안: lockf(fd, F_TLOCK, 0) 또는 fcntl(F_SETLK)
    flockSync(fd, 'exnb')  // fs-ext flockSync
  } catch (err) {
    if (err.code === 'EWOULDBLOCK' || err.code === 'EAGAIN') {
      closeSync(fd)
      throw new DaemonError('ALREADY_RUNNING',
        'Another daemon instance is running. Use "waiaas stop" first.')
    }
    throw err
  }

  // PID를 lock 파일에 기록 (보조 정보)
  writeSync(fd, String(process.pid))

  // fd를 열어둔 채로 반환 -- 프로세스 종료 시 OS가 자동 해제
  return fd
}
```

**Key decisions for planner:**
- lock 파일 경로: `~/.waiaas/daemon.lock` (PID 파일과 별도)
- PID 파일(`daemon.pid`)은 **보조 정보로 유지** (status 명령용)
- 잠금 판단에는 lock 파일의 fd만 사용
- fd는 데몬 수명 동안 유지, Graceful Shutdown Step 10에서 closeSync(fd) 추가
- **Windows fallback:** HTTP 포트 바인딩 자체가 단일 인스턴스 보장 (기존 28-daemon-lifecycle-cli.md Windows 방식과 일관)

### Pattern 3: 2단계 Rate Limiter
**What:** 단일 rateLimiter를 globalRateLimit(IP 기반, 인증 전) + sessionRateLimit(세션 기반, 인증 후)으로 분리한다.
**Why needed:** 현재 설계에서 rateLimiter(#7)가 authRouter(#8) 전에 위치하여, 미인증 공격자가 대량 요청으로 IP 기반 rate limit을 소진하면 동일 IP의 인증된 사용자도 차단된다.
**Confidence:** HIGH (Hono에서 미들웨어를 위치별로 분리 적용하는 것은 표준 패턴)

```
Stage 1: globalRateLimit (#3.5, shutdownGuard 직후)
- 키: IP 주소 (localhost이므로 사실상 '127.0.0.1' 고정)
- 한도: 1000 req/min (기존 100에서 상향 -- DoS 방어용 느슨한 제한)
- 저장소: lru-cache (인메모리)
- 목적: 대량 요청 DoS 방어

Stage 2: sessionRateLimit (#9, authRouter 직후)
- 키: sessionId (세션 토큰에서 추출) 또는 authType (masterAuth)
- 한도: 세션당 300 req/min, 거래 전송 10 req/min
- 저장소: lru-cache (인메모리)
- 목적: 인증된 사용자별 세분화 제한
```

**Key decisions for planner:**
- 기존 config.toml의 `rate_limit_global_rpm = 100` -> 의미 변경: globalRateLimit 1000/min (IP DoS 방어)
- 새 config 옵션: `rate_limit_global_ip_rpm = 1000` (새로 추가)
- 기존 `rate_limit_session_rpm = 300`, `rate_limit_tx_rpm = 10`은 sessionRateLimit으로 이동
- 엔드포인트별 오버라이드는 sessionRateLimit에서만 적용
- globalRateLimit은 health 엔드포인트 포함 모든 요청에 적용

### Pattern 4: killSwitchGuard 허용 목록 확정
**What:** ACTIVATED/RECOVERING 상태에서 허용하는 엔드포인트를 3개에서 4개로 확장하고, HTTP 상태 코드를 401에서 503으로 변경한다.
**Why needed:** 현재 설계(36-killswitch-autostop-evm.md 2.4)에는 `GET /v1/admin/kill-switch` (Kill Switch 상태 조회)가 허용 목록에 없어, 관리자가 kill switch 상태를 확인할 수 없다. 또한 HTTP 401은 인증 실패를 의미하지만, SYSTEM_LOCKED는 서비스 불가 상태이므로 503이 적절하다.
**Confidence:** HIGH (objectives에 4개 확정 명시, HTTP 503 = Service Unavailable이 의미적으로 정확)

```typescript
// v0.7 보완 내용
const KILL_SWITCH_ALLOWED_PATHS = [
  { method: 'GET',  path: '/v1/health' },              // 헬스체크 (무인증)
  { method: 'GET',  path: '/v1/admin/status' },        // 상태 확인 (masterAuth)
  { method: 'POST', path: '/v1/admin/recover' },       // 복구 (dualAuth) -- 경로 변경 /v1/owner/recover -> /v1/admin/recover
  { method: 'GET',  path: '/v1/admin/kill-switch' },   // Kill Switch 상태 조회 (masterAuth) -- v0.7 신규
]

// HTTP 상태 코드 변경: 401 -> 503
throw new WaiaasError(
  'SYSTEM_LOCKED',
  'System is in kill switch mode.',
  503,  // 변경: 401 -> 503 Service Unavailable
  {
    hint: 'Use POST /v1/admin/recover to restore normal operation.',
    activatedAt: ...,
    reason: ...,
  }
)
```

**주의사항:**
- objectives에서 허용 목록은 `health/status/recover/kill-switch` 4개로 확정
- 기존 36-killswitch-autostop-evm.md의 `/v1/owner/recover` 경로가 objectives에서는 `/v1/admin/recover`로 변경될 수 있음 -- 기존 52-auth-model-redesign.md의 dualAuth 경로(`POST /v1/owner/recover`)와 정합성 확인 필요
- planner는 경로 통일 여부를 결정해야 함 (objectives는 `/v1/admin/recover` 시사, 기존 설계는 `/v1/owner/recover`)
- 본 연구에서는 objectives의 B-4 해결책에서 명시한 경로(`POST /v1/admin/recover`)를 따름

### Pattern 5: Master Password Argon2id 통일
**What:** Kill Switch CLI 인증의 SHA-256 해시 전송을 폐기하고, 전체 시스템에서 Master Password 검증을 Argon2id로 통일한다.
**Why needed:** 34-owner-wallet-connection.md 8.3의 CLI kill-switch 인증이 SHA-256 단순 해시를 사용하여, 동일 시스템 내에서 Argon2id(키스토어)와 보안 수준 불일치가 발생한다.
**Confidence:** HIGH (52-auth-model-redesign.md에서 이미 explicitMasterAuth가 Argon2id 기반으로 설계됨. 통일은 자연스러운 확장)

**Key decisions:**
- `X-Master-Password-Hash` 헤더명 폐기 -> `X-Master-Password` (평문, localhost only)
- 서버 측에서 `argon2.verify(storedHash, password)` 실행
- 데몬 시작 시 마스터 패스워드의 Argon2id 해시를 SQLite system_state에 저장 (또는 키스토어 파일의 kdfparams와 동일 salt/params 활용)
- **핵심:** 키스토어 잠금 해제에 성공한 패스워드 = 마스터 패스워드. 별도 해시 저장이 아니라 키스토어 복호화 시도로 검증하는 옵션도 있으나, 매번 Argon2id 실행(~1-3초)은 API 응답 지연 초래. 따라서 **해시값을 메모리에 캐시**하고 `argon2.verify()`로 빠르게 검증하는 것이 실용적.

### Pattern 6: SQLite nonce 저장 옵션
**What:** 인메모리 LRU nonce 캐시의 대안으로 SQLite 기반 nonce 저장소를 config 옵션으로 추가한다.
**Why needed:** 다중 데몬 인스턴스 방지(flock)가 1차 방어이지만, 만약 방어가 실패하는 시나리오에서 nonce replay 공격을 방지하는 2차 방어가 필요하다.
**Confidence:** HIGH (단순 테이블 추가이며, 기존 SQLite 인프라 활용)

```sql
-- nonces 테이블 DDL (선택적 활성화)
CREATE TABLE IF NOT EXISTS nonces (
  nonce TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_nonces_expires_at ON nonces(expires_at);
```

**Key decisions:**
- 기본값: `security.nonce_storage = "memory"` (인메모리 LRU, 기존 동작)
- 옵션: `security.nonce_storage = "sqlite"` (SQLite 저장)
- SQLite 저장 시 만료 nonce 정리: 데몬 시작 시 + 1시간 주기 (BackgroundWorkers에 추가)
- 두 저장소 모두 INonceStore 인터페이스로 추상화

## Don't Hand-Roll

이 phase는 설계 문서 수정이므로 실제 구현은 없다. 그러나 향후 구현 시 주의할 점:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Argon2id 해시 생성/검증 | 자체 Argon2 구현 | `argon2` npm 패키지 | 이미 키스토어에서 사용 중. 동일 패키지 재활용 |
| JWT 서명/검증 | 자체 JWT 라이브러리 | `jose` v6.x | 이미 세션 프로토콜에서 사용 중 |
| Rate Limiter sliding window | 자체 타이머 기반 구현 | `lru-cache` TTL 기반 timestamp 배열 | 이미 현재 설계에서 사용 중인 패턴 |
| 파일 잠금 | 자체 lock 파일 + polling | `openSync('wx')` + fd 유지 | OS가 프로세스 종료 시 자동 해제 보장 |

**Key insight:** 이 phase의 모든 변경은 기존 라이브러리/패턴의 재조합이다. 새로운 라이브러리 도입을 최소화하고, 기존 스택(jose, argon2, lru-cache, better-sqlite3)의 활용 범위를 확장하는 설계가 핵심.

## Common Pitfalls

### Pitfall 1: JWT Dual-Key 전환 윈도우 중 경쟁 조건
**What goes wrong:** rotate 명령 실행과 previous 자동 삭제 사이에 데몬이 재시작되면, DB에 저장된 previous가 영구 잔존하거나 전환 윈도우가 리셋된다.
**Why it happens:** rotatedAt 시각이 DB에 저장되어 있지만, 데몬 시작 시 이를 확인하는 로직이 없으면 5분이 이미 지났는데도 previous로 검증을 시도할 수 있다.
**How to avoid:** 데몬 시작 시 system_state에서 rotatedAt을 확인하여, 5분이 지났으면 previous를 즉시 삭제하는 초기화 로직을 포함한다.
**Warning signs:** 테스트에서 데몬 재시작 후에도 이전 secret으로 검증이 되는 경우.

### Pitfall 2: globalRateLimit의 키가 항상 127.0.0.1
**What goes wrong:** localhost 전용 데몬이므로 모든 요청의 IP가 `127.0.0.1`이다. IP 기반 globalRateLimit이 사실상 전체 요청에 단일 버킷을 적용하게 된다.
**Why it happens:** 로컬 데몬 환경에서 IP 기반 구분이 무의미한 상황.
**How to avoid:** globalRateLimit의 목적을 "IP별 분리"가 아닌 "전체 요청 속도 상한" (absolute ceiling)으로 정의한다. 1000 req/min은 정상 운영에서는 절대 도달하지 않고, DDoS 방어용 안전망이다. Docker(`0.0.0.0` 바인딩)에서는 IP가 다를 수 있으므로 IP 키를 유지하되, localhost에서는 사실상 global ceiling이라는 점을 문서화한다.
**Warning signs:** 정상 운영 중 갑자기 429가 발생하면 globalRateLimit 한도가 너무 낮은 것.

### Pitfall 3: killSwitchGuard에서 경로 매칭 불일치
**What goes wrong:** 허용 목록의 경로가 실제 라우팅 경로와 불일치. 예: `/v1/owner/recover` vs `/v1/admin/recover`.
**Why it happens:** v0.2 설계(36-killswitch-autostop-evm.md)에서 `/v1/owner/recover`, v0.5 설계(52-auth-model-redesign.md)에서 `/v1/owner/recover`, objectives(v0.7)에서 `/v1/admin/recover`로 경로가 변경 가능성이 있다.
**How to avoid:** 허용 목록을 정의할 때 실제 라우트 등록과 정확히 동일한 경로를 사용한다. 기존 52-auth-model-redesign.md의 dualAuth 경로를 변경할지 여부를 명시적으로 결정한다.
**Warning signs:** Kill Switch ACTIVATED 후 복구 API 호출이 503으로 거부되는 경우.

### Pitfall 4: Master Password 검증 지연
**What goes wrong:** 매 API 호출마다 Argon2id verify를 실행하면 ~1-3초 지연이 발생한다.
**Why it happens:** Argon2id는 의도적으로 느리게 설계된 KDF. API 응답 시간에 직접 영향.
**How to avoid:** 데몬 시작 시 마스터 패스워드로 Argon2id 해시를 생성하여 메모리에 캐시한다. 이후 explicitMasterAuth에서는 `argon2.verify(cachedHash, inputPassword)`를 사용한다. argon2.verify()는 해시에 내장된 salt/params를 사용하므로 별도 salt 관리 불필요.
**Warning signs:** explicitMasterAuth 적용 엔드포인트의 응답 시간이 2초 이상인 경우.

### Pitfall 5: flock + PID 파일 이중 관리 혼란
**What goes wrong:** lock 파일과 PID 파일이 별도로 존재하면, status 명령에서 PID 파일만 확인하여 "running"으로 표시하지만 실제로는 lock이 없는 상태가 발생할 수 있다.
**Why it happens:** flock과 PID 파일의 생명주기가 다르다.
**How to avoid:** lock 파일 안에 PID를 기록하여 단일 파일로 통합하거나, status 명령이 lock 파일 + PID + HTTP health check 3중 확인을 수행한다.
**Warning signs:** `waiaas status`가 "running"이지만 실제 데몬이 응답하지 않는 경우.

### Pitfall 6: SQLite nonce 저장소의 성능 영향
**What goes wrong:** SQLite nonce 저장을 활성화하면 모든 nonce 생성/검증이 DB I/O를 수반하여 ownerAuth 검증 지연이 증가한다.
**Why it happens:** 인메모리 LRU 캐시는 ~1us이지만 SQLite INSERT/SELECT는 ~100-500us.
**How to avoid:** SQLite nonce 저장은 "선택적 2차 방어"로 명시한다. 기본값은 인메모리 LRU이며, flock이 단일 인스턴스를 보장하므로 대부분의 경우 SQLite 저장은 불필요하다.
**Warning signs:** nonce_storage=sqlite 설정 후 ownerAuth 응답 시간 증가.

## Code Examples

### JWT Secret Rotation - system_state 저장
```typescript
// Source: 30-session-token-protocol.md에 추가할 스펙

// system_state 키-값
// key: 'jwt_secret_current' -> hex string
// key: 'jwt_secret_previous' -> hex string | null
// key: 'jwt_secret_rotated_at' -> Unix epoch ms | null

async function rotateJwtSecret(db: DrizzleInstance): Promise<void> {
  const currentSecret = getSystemState(db, 'jwt_secret_current')
  const newSecret = crypto.randomBytes(32).toString('hex')

  db.transaction(() => {
    // current -> previous
    setSystemState(db, 'jwt_secret_previous', currentSecret)
    setSystemState(db, 'jwt_secret_rotated_at', String(Date.now()))
    // new -> current
    setSystemState(db, 'jwt_secret_current', newSecret)
  })()

  auditLog({
    eventType: 'SECRET_ROTATED',
    actor: 'admin',
    severity: 'warn',
    details: {
      previousExpiry: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
  })
}
```

### flock 기반 잠금 - fd 유지 패턴
```typescript
// Source: 28-daemon-lifecycle-cli.md Step 1에 교체할 스펙

// 데몬 시작 시
const lockFd = acquireDaemonLock(dataDir)

// Graceful Shutdown Step 10에 추가
function finalCleanup(lockFd: number, pidPath: string): void {
  db.close()
  unlinkSync(pidPath)   // PID 파일 삭제 (보조 정보)
  closeSync(lockFd)     // lock 파일 해제 (OS가 자동 해제하지만 명시적)
}
```

### 2단계 Rate Limiter 등록
```typescript
// Source: 29-api-framework-design.md 미들웨어 등록 코드에 추가할 스펙

function registerMiddleware(app: OpenAPIHono, deps: AppContext): void {
  app.use('*', requestIdMiddleware())
  app.use('*', requestLoggerMiddleware(deps.logger))
  app.use('*', shutdownGuardMiddleware(deps.lifecycle))

  // v0.7 추가: #3.5 globalRateLimit (IP 기반, DoS 방어)
  app.use('*', globalRateLimitMiddleware({
    maxRpm: deps.config.security.rate_limit_global_ip_rpm,  // 1000
    windowMs: 60_000,
  }))

  app.use('*', secureHeaders({ ... }))
  app.use('*', hostValidationMiddleware(deps.config))
  app.use('*', corsMiddleware(deps.config))

  // v0.7 변경: killSwitchGuard가 #7 위치 (기존 #8에서 이동)
  app.use('*', killSwitchGuardMiddleware(deps.db))

  // authRouter가 #8 위치 (기존 #9에서 이동)
  app.use('*', authRouter(deps))

  // v0.7 추가: #9 sessionRateLimit (세션 기반, 인증 후)
  app.use('/v1/*', sessionRateLimitMiddleware({
    sessionRpm: deps.config.security.rate_limit_session_rpm,  // 300
    txRpm: deps.config.security.rate_limit_tx_rpm,             // 10
    endpointOverrides: deps.config.security.rate_limit_overrides,
  }))
}
```

### killSwitchGuard 보완
```typescript
// Source: 36-killswitch-autostop-evm.md 2.4에 교체할 스펙

async function killSwitchGuard(c: Context, next: Next): Promise<void> {
  const status = getSystemState(c.get('db'), 'kill_switch_status')

  if (status === 'NORMAL') {
    return next()
  }

  const method = c.req.method
  const path = c.req.path

  // v0.7 확정: 허용 엔드포인트 4개
  const ALLOWED = [
    { method: 'GET',  path: '/v1/health' },
    { method: 'GET',  path: '/v1/admin/status' },
    { method: 'POST', path: '/v1/admin/recover' },     // v0.7: 경로 확정
    { method: 'GET',  path: '/v1/admin/kill-switch' },  // v0.7 신규
  ]

  if (ALLOWED.some(a => a.method === method && path === a.path)) {
    return next()
  }

  // v0.7 변경: 401 -> 503
  return c.json({
    error: {
      code: 'SYSTEM_LOCKED',
      message: 'System is in kill switch mode.',
      hint: 'Use POST /v1/admin/recover to restore normal operation.',
      details: {
        activatedAt: getSystemState(c.get('db'), 'kill_switch_activated_at'),
        reason: getSystemState(c.get('db'), 'kill_switch_reason'),
      },
      requestId: c.get('requestId'),
    },
  }, 503)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 단일 JWT Secret | Dual-key rotation | v0.7 | Secret 변경 시 서비스 중단 방지 |
| PID 파일 잠금 | flock/fd 기반 잠금 | v0.7 | TOCTOU 경쟁 조건 제거 |
| 단일 Rate Limiter | 2단계 (global + session) | v0.7 | 미인증 공격자의 인증 사용자 한도 소진 방지 |
| killSwitchGuard 401 | killSwitchGuard 503 | v0.7 | HTTP 의미론 정합 |
| SHA-256 해시 전송 | Argon2id 통일 | v0.7 | 보안 수준 통일 |
| 인메모리 nonce only | 인메모리 + SQLite 옵션 | v0.7 | 2차 replay 방어 |

**Deprecated/outdated:**
- `X-Master-Password-Hash` 헤더: 폐기. `X-Master-Password` (평문, localhost only)로 통일
- PID 파일 기반 인스턴스 감지: 보조 정보로 격하. 잠금 판단에 사용하지 않음
- 단일 Rate Limiter (#7): 2단계로 분리 (#3.5 + #9)
- killSwitchGuard HTTP 401: 503으로 변경

## 수정 대상 문서 상세 매핑

각 요구사항(DAEMON-01~06)이 수정해야 할 기존 설계 문서의 정확한 섹션을 매핑한다.

### DAEMON-01: JWT Secret dual-key rotation
| 문서 | 섹션 | 변경 내용 |
|------|------|-----------|
| 30-session-token-protocol.md | 2.7 (JWT Secret 관리) | dual-key 구조, JwtSecretManager 인터페이스, 검증 순서, system_state 저장 |
| 30-session-token-protocol.md | 2.7.5 (Secret 변경의 영향) | 즉시 무효화 -> 5분 전환 윈도우 |
| 28-daemon-lifecycle-cli.md | CLI 커맨드 | `waiaas secret rotate` 명령 추가 |
| 37-rest-api-complete-spec.md | Admin API | `POST /v1/admin/rotate-secret` 엔드포인트 추가 |
| 24-monorepo-data-directory.md | config.toml | `security.jwt_secret`이 초기값 전용임을 명시 |

### DAEMON-02: flock 기반 인스턴스 잠금
| 문서 | 섹션 | 변경 내용 |
|------|------|-----------|
| 28-daemon-lifecycle-cli.md | 2.2 Step 1 (환경 검증) | PID 감지 -> flock 잠금으로 교체 |
| 28-daemon-lifecycle-cli.md | 5 (프로세스 관리) | PID 파일 스펙을 보조 정보로 격하, daemon.lock 스펙 추가 |
| 28-daemon-lifecycle-cli.md | 3 (종료 시퀀스) | Step 10에 closeSync(lockFd) 추가 |

### DAEMON-03: Rate Limiter 2단계 분리
| 문서 | 섹션 | 변경 내용 |
|------|------|-----------|
| 29-api-framework-design.md | 2.1 (미들웨어 실행 순서) | 9단계 -> 10단계, #3.5 globalRateLimit + #9 sessionRateLimit |
| 29-api-framework-design.md | 2.2 (미들웨어 등록 코드) | registerMiddleware 함수 갱신 |
| 29-api-framework-design.md | 7 (Rate Limiter 섹션) | 3-level -> 2-stage로 전면 재구성 |
| 37-rest-api-complete-spec.md | 4.1 (9단계 미들웨어 순서) | 번호/위치 갱신 |
| 24-monorepo-data-directory.md | config.toml [security] | rate_limit_global_ip_rpm 추가 |

### DAEMON-04: killSwitchGuard 허용 목록 확정
| 문서 | 섹션 | 변경 내용 |
|------|------|-----------|
| 36-killswitch-autostop-evm.md | 2.4 (ACTIVATED API 동작) | 허용 목록 3개 -> 4개, HTTP 401 -> 503 |
| 37-rest-api-complete-spec.md | 4.2 (killSwitchGuard 동작) | 허용 목록 갱신, SYSTEM_LOCKED 503 응답 |
| 52-auth-model-redesign.md | 7.4 (killSwitchGuard 허용 목록) | 허용 목록 갱신 |

### DAEMON-05: Master Password Argon2id 통일
| 문서 | 섹션 | 변경 내용 |
|------|------|-----------|
| 34-owner-wallet-connection.md | 8.3 (CLI kill-switch 인증) | SHA-256 -> Argon2id, X-Master-Password 평문 |
| 37-rest-api-complete-spec.md | 3.3 (Admin API 인증) | X-Master-Password-Hash -> X-Master-Password |
| 52-auth-model-redesign.md | 3.1 (masterAuth explicit) | 이미 Argon2id 기반이므로 확인/보강만 |

### DAEMON-06: 단일 인스턴스 SQLite nonce 옵션
| 문서 | 섹션 | 변경 내용 |
|------|------|-----------|
| 30-session-token-protocol.md | 4.2 (nonce 저장소) | INonceStore 인터페이스, SQLite 구현 옵션 추가 |
| 24-monorepo-data-directory.md | config.toml [security] | `nonce_storage = "memory" | "sqlite"` 옵션 추가 |
| 25-sqlite-schema.md | — | nonces 테이블 DDL (선택적) |

## Open Questions

1. **recover 경로 통일 여부**
   - What we know: 기존 설계는 `/v1/owner/recover` (52-auth-model-redesign.md), objectives B-4는 `/v1/admin/recover` 사용
   - What's unclear: v0.7에서 경로를 변경할 것인지, 기존 유지할 것인지
   - Recommendation: dualAuth(ownerAuth + masterAuth explicit)가 적용되는 경로이므로, `/v1/owner/recover` 유지가 기존 설계와 정합. objectives의 `/v1/admin/recover`는 표기 오류 가능성이 있으나, **planner가 명시적으로 결정**해야 함. 본 연구에서는 objectives에서 허용 목록에 명시된 4개 경로를 그대로 따르되, 기존 라우트 등록과의 정합성을 plan 단계에서 확인하도록 권장.

2. **Master Password 해시 저장 위치**
   - What we know: 키스토어 파일에 Argon2id params가 있고, 52-auth-model-redesign.md에서 explicitMasterAuth가 `verifyPassword()` 콜백 사용
   - What's unclear: 마스터 패스워드 해시를 별도로 SQLite에 저장할지, 키스토어 복호화 시도로 검증할지, 메모리 캐시만 할지
   - Recommendation: 데몬 시작 시 키스토어 잠금 해제에 성공한 패스워드의 Argon2id 해시를 메모리에 캐시하고, API 요청 시 `argon2.verify(cachedHash, inputPassword)`로 검증. 이 방식이 가장 빠르고 별도 저장소 불필요.

3. **globalRateLimit config 키 이름**
   - What we know: 기존 `rate_limit_global_rpm = 100`이 있음
   - What's unclear: 기존 키를 의미 변경(100 -> 1000)할지, 새 키를 추가할지
   - Recommendation: 기존 `rate_limit_global_rpm`을 `rate_limit_global_ip_rpm`으로 이름 변경하고 기본값 1000으로 변경. 기존 `rate_limit_global_rpm`은 deprecated.

## Sources

### Primary (HIGH confidence)
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/30-session-token-protocol.md` -- JWT Secret 관리, nonce 캐시
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/29-api-framework-design.md` -- 미들웨어 순서, Rate Limiter
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/28-daemon-lifecycle-cli.md` -- PID 파일, 데몬 라이프사이클
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/36-killswitch-autostop-evm.md` -- Kill Switch 상태 머신, killSwitchGuard
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/52-auth-model-redesign.md` -- 3-tier 인증, killSwitchGuard 허용 목록
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/34-owner-wallet-connection.md` -- ownerAuth, CLI kill-switch 인증
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/26-keystore-spec.md` -- Argon2id 파라미터
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/24-monorepo-data-directory.md` -- config.toml, 환경변수
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/37-rest-api-complete-spec.md` -- API 엔드포인트, 미들웨어, 에러 코드
- `/Users/minho.yoo/dev/wallet/WAIaaS/objectives/v0.7-implementation-blockers-resolution.md` -- Phase B 요구사항 전문

### Secondary (MEDIUM confidence)
- [jose npm](https://www.npmjs.com/package/jose) -- JWT 라이브러리 공식 페이지
- [proper-lockfile npm](https://www.npmjs.com/package/proper-lockfile) -- 파일 잠금 라이브러리
- [hono-rate-limiter](https://github.com/rhinobase/hono-rate-limiter) -- Hono Rate Limiter 참고
- [os-lock](https://github.com/mohd-akram/os-lock) -- 크로스 플랫폼 파일 잠금

### Tertiary (LOW confidence)
- [windows-mutex](https://github.com/microsoft/node-windows-mutex) -- Windows Named Mutex 바인딩 (필요 시 참고)

## Metadata

**Confidence breakdown:**
- JWT dual-key rotation: HIGH -- jose jwtVerify의 try-catch 패턴은 공식 문서에서 지원하며, key rotation은 표준 보안 관행
- flock 인스턴스 잠금: HIGH -- POSIX fd 기반 잠금은 수십 년간 검증된 패턴, Node.js에서도 `openSync('wx')` + fd 유지로 구현 가능
- Rate Limiter 2단계: HIGH -- Hono 미들웨어 위치별 분리 적용은 표준 패턴, lru-cache 기반 구현은 기존 설계에서 검증
- killSwitchGuard: HIGH -- 허용 목록 4개는 objectives에서 명시적으로 확정, HTTP 503은 의미론적으로 정확
- Master Password Argon2id: HIGH -- 이미 52-auth-model-redesign.md에서 Argon2id 기반 explicitMasterAuth가 설계됨
- SQLite nonce: HIGH -- 단순 테이블 추가이며, 기존 SQLite 인프라 활용

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (안정적 설계 변경이므로 30일)
