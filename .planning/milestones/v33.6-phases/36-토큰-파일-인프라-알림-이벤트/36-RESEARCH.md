# Phase 36: 토큰 파일 인프라 + 알림 이벤트 - Research

**Researched:** 2026-02-09
**Domain:** 파일 기반 토큰 영속화 사양, 원자적 쓰기 패턴, SESSION_EXPIRING_SOON 알림 이벤트
**Confidence:** HIGH

## Summary

Phase 36은 v0.9 MCP 세션 관리 자동화의 기반 인프라를 설계하는 페이즈이다. 두 가지 독립적인 설계 영역을 다룬다:

1. **토큰 파일 인프라 (Plan 36-01):** `~/.waiaas/mcp-token` 파일의 사양(경로, 포맷, 권한, 인코딩, symlink 거부)과 MCP/CLI/Telegram 3개 컴포넌트가 공유하는 원자적 쓰기 패턴(`write-then-rename`)을 `@waiaas/core`의 공유 유틸리티로 설계한다.

2. **SESSION_EXPIRING_SOON 이벤트 (Plan 36-02):** 기존 16개 NotificationEventType에 17번째 이벤트를 추가하고, 데몬 측 SessionService에서 갱신 API 응답 처리 시 잔여 갱신 횟수/절대 만료 시각을 기반으로 알림을 트리거하는 판단 로직을 설계한다.

이 두 설계는 Phase 37(SessionManager 핵심), Phase 38(MCP 통합), Phase 39(CLI+Telegram 연동)의 공통 기반이 된다. 특히 토큰 파일 유틸리티는 SessionManager, CLI, Telegram Bot 3개 컴포넌트 모두에서 사용되므로 최우선 설계 대상이다.

**Primary recommendation:** `@waiaas/core`의 `utils/token-file.ts`에 `getMcpTokenPath()`, `writeMcpToken()`, `readMcpToken()` 3개 함수를 정의하고, SESSION_EXPIRING_SOON은 데몬 SessionService의 갱신 응답 처리 경로에 트리거 조건을 삽입하는 방식으로 설계한다.

---

## Standard Stack

Phase 36은 설계 마일스톤이므로 새로운 라이브러리 추가가 없다. 기존 스택의 내장 API를 활용한다.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `fs/promises` | 22.x built-in | 파일 읽기/쓰기, lstat(symlink 감지), mkdir | 내장 API. 외부 파일 라이브러리 불필요 |
| Node.js `os` | 22.x built-in | `homedir()` 경로 해석 | 크로스 플랫폼 홈 디렉토리 해석 |
| Node.js `path` | 22.x built-in | 경로 결합, dirname | 크로스 플랫폼 경로 처리 |
| Node.js `crypto` | 22.x built-in | `randomBytes(4)` 임시 파일 접미사 | 파일명 충돌 방지 |
| `jose` | 6.1.x | `decodeJwt()` JWT payload 디코딩 (서명 미검증) | 이미 프로젝트 의존성. jwt-decode 추가 불필요 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 3.x | 토큰 파일 내용 검증 스키마 | readMcpToken 시 JWT 형식 유효성 검증 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 직접 write-then-rename | `write-file-atomic` npm | 1KB JWT 파일에 외부 의존성은 과잉. 직접 구현 10줄이면 충분 |
| `jose` decodeJwt | `jwt-decode` npm | jose가 이미 의존성. 동일 기능 중복 |
| 직접 lstat symlink 검사 | 없음 | Node.js 내장 API가 유일한 방법 |

**Installation:**
```bash
# 새로운 패키지 설치 없음. 기존 스택만 활용.
```

---

## Architecture Patterns

### Recommended File Structure

```
packages/core/src/
├── utils/
│   └── token-file.ts           # [Phase 36 신규] getMcpTokenPath, writeMcpToken, readMcpToken
├── domain/
│   └── notification.ts         # [Phase 36 수정] SESSION_EXPIRING_SOON 이벤트 타입 추가
└── schemas/
    └── notification.schema.ts  # [Phase 36 수정] SESSION_EXPIRING_SOON 알림 메시지 스키마

packages/daemon/src/
└── services/
    └── session-service.ts      # [Phase 36 수정] 갱신 응답 후 만료 임박 알림 트리거 조건 추가
```

### Pattern 1: 공유 토큰 파일 유틸리티 (Shared Utility)

**What:** `@waiaas/core`에 토큰 파일 조작 함수 3개를 정의하여, MCP SessionManager, CLI, Telegram Bot이 동일한 코드로 파일을 읽고 쓴다.

**When to use:** 토큰 파일에 접근하는 모든 컴포넌트에서 사용.

**Example:**
```typescript
// packages/core/src/utils/token-file.ts
import { writeFile, rename, unlink, lstat, mkdir, readFile } from 'node:fs/promises'
import { writeFileSync, renameSync, unlinkSync, lstatSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { randomBytes } from 'node:crypto'

export const MCP_TOKEN_FILENAME = 'mcp-token'

/**
 * 토큰 파일 경로 계산.
 * WAIAAS_DATA_DIR 환경변수 또는 ~/.waiaas/ 기본 경로 사용.
 */
export function getMcpTokenPath(dataDir?: string): string {
  const dir = dataDir
    ?? process.env.WAIAAS_DATA_DIR
    ?? join(homedir(), '.waiaas')
  return join(dir, MCP_TOKEN_FILENAME)
}

/**
 * 원자적 토큰 파일 쓰기.
 * write-then-rename 패턴으로 부분 쓰기 방지.
 * POSIX에서 rename은 원자적. Windows에서는 EPERM 재시도.
 */
export async function writeMcpToken(filePath: string, token: string): Promise<void> {
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true, mode: 0o700 })

  // symlink 방어: 기존 파일이 symlink이면 거부
  try {
    const stat = await lstat(filePath)
    if (stat.isSymbolicLink()) {
      throw new Error('[waiaas] mcp-token is a symbolic link. Refusing to write.')
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err
    // 파일 없음은 정상 (최초 생성)
  }

  const tmpPath = join(dir, `.mcp-token.${process.pid}.${randomBytes(4).toString('hex')}.tmp`)
  try {
    await writeFile(tmpPath, token, { encoding: 'utf-8', mode: 0o600 })
    await rename(tmpPath, filePath)  // POSIX atomic rename
  } catch (err) {
    try { await unlink(tmpPath) } catch {}  // cleanup on failure
    throw err
  }
}

/**
 * 토큰 파일 읽기.
 * symlink 거부, 형식 검증, null 반환 (파일 없음/무효).
 */
export function readMcpToken(filePath: string): string | null {
  try {
    const stat = lstatSync(filePath)
    if (stat.isSymbolicLink()) {
      console.error('[waiaas] mcp-token is a symbolic link. Refusing to load.')
      return null
    }
  } catch {
    return null  // 파일 없음
  }

  try {
    const content = readFileSync(filePath, 'utf-8').trim()
    if (!content.startsWith('wai_sess_')) return null
    // JWT 3-part 구조 확인
    const jwt = content.slice(9)  // 'wai_sess_' 제거
    if (jwt.split('.').length !== 3) return null
    return content
  } catch {
    return null
  }
}
```

**Source:** v0.9-ARCHITECTURE.md 섹션 2.3 + v0.9-STACK.md Question 1

### Pattern 2: 데몬 측 알림 트리거 (Event-driven Notification)

**What:** 데몬의 SessionService가 갱신 API 응답 처리 과정에서 잔여 갱신 횟수/절대 만료 시각을 검사하고, 조건 충족 시 NotificationService.notify()를 호출한다.

**When to use:** PUT /v1/sessions/:id/renew 200 OK 응답 처리 직후.

**Example:**
```typescript
// packages/daemon/src/services/session-service.ts (v0.9 보완)
async renewSession(sessionId: string): Promise<RenewalResult> {
  // ... 기존 갱신 로직 (Guard 1-3 검증, 토큰 회전, DB 업데이트) ...

  // [v0.9] 만료 임박 알림 판단
  const remainingRenewals = session.maxRenewals - newRenewalCount
  const timeToAbsoluteExpiry = session.absoluteExpiresAt - nowEpochSeconds
  const EXPIRING_THRESHOLD_SECONDS = 24 * 60 * 60  // 24시간
  const RENEWAL_THRESHOLD = 3

  if (remainingRenewals <= RENEWAL_THRESHOLD || timeToAbsoluteExpiry <= EXPIRING_THRESHOLD_SECONDS) {
    await this.notificationService.notify({
      eventType: 'SESSION_EXPIRING_SOON',
      severity: 'warning',
      data: {
        sessionId,
        agentName: agent.name,
        expiresAt: session.absoluteExpiresAt,
        remainingRenewals,
      },
    })
  }

  return result
}
```

**Source:** v0.9-ARCHITECTURE.md 섹션 2.7

### Pattern 3: 중복 알림 방지 (Deduplication)

**What:** SESSION_EXPIRING_SOON 알림은 조건 충족 후 갱신마다 반복 트리거될 수 있다. 동일 세션에 대해 알림을 1회만 발송하도록 중복 방지 로직을 설계한다.

**When to use:** 세션별 알림 발송 여부 추적.

**Example:**
```typescript
// 방법 1: 세션 테이블에 expiring_notified_at 컬럼 추가
// 방법 2: notification_log에서 같은 sessionId + SESSION_EXPIRING_SOON 조회
// 방법 3: 인메모리 Set<sessionId>로 런타임 중복 방지

// 추천: 방법 2 (notification_log 활용)
// 이유: DB 스키마 변경 최소화, 기존 알림 로그 인프라 활용
const alreadyNotified = await this.db.query.notificationLog.findFirst({
  where: and(
    eq(notificationLog.event, 'SESSION_EXPIRING_SOON'),
    eq(notificationLog.referenceId, sessionId),
    eq(notificationLog.status, 'sent'),
  ),
})
if (!alreadyNotified) {
  await this.notificationService.notify(/* ... */)
}
```

### Anti-Patterns to Avoid

- **토큰 파일에 JSON 메타데이터 포함:** v0.9 objectives에서 명시적으로 배제(AF-7). JWT 단일 문자열만 저장. 메타데이터는 JWT payload에서 추출.
- **fs.watch로 파일 변경 감시:** macOS FSEvents race condition, Linux NFS 미동작 등 플랫폼별 불안정. 401 lazy reload로 대체 (AF-1).
- **writeFileSync 직접 사용 (rename 없이):** 부분 쓰기 위험. write-then-rename 패턴 필수.
- **stat() 사용 (lstat() 대신):** `stat()`은 symlink를 따라가서 대상 파일 정보를 반환하므로 symlink를 감지하지 못한다. 반드시 `lstat()` 사용.
- **MCP 프로세스에서 직접 알림 발송:** MCP는 데몬 외부 프로세스이므로 NotificationService에 직접 접근 불가. 데몬 측 자동 판단 방식 사용.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT payload 디코딩 | base64url 수동 디코딩 + JSON.parse | `jose` `decodeJwt()` | 에러 처리, 타입 안전성, 표준 준수. base64url 패딩 처리 등 엣지 케이스 |
| 크로스 플랫폼 홈 디렉토리 | `$HOME` / `%USERPROFILE%` 수동 분기 | `os.homedir()` | Node.js가 플랫폼별 차이를 추상화 |
| 임시 파일명 생성 | `Date.now()` 기반 | `crypto.randomBytes(4)` | 충돌 방지. PID + random bytes 조합이 가장 안전 |
| 알림 중복 방지 | 커스텀 TTL 캐시 | `notification_log` 테이블 조회 | 기존 인프라 활용. 데몬 재시작에도 상태 유지 |

**Key insight:** Phase 36의 모든 기능은 Node.js 내장 API + 기존 프로젝트 인프라(jose, NotificationService, notification_log)로 구현 가능하다. 외부 의존성 추가 없이 10-20줄 수준의 유틸리티 함수로 충분하다.

---

## Common Pitfalls

### Pitfall 1: Windows에서 0o600 파일 권한이 무의미

**What goes wrong:** Node.js `fs.writeFile`의 mode 옵션이 Windows NTFS에서 제한적으로 동작한다. `0o600`을 지정해도 Windows에서는 읽기 전용(`0o444`) 또는 읽기/쓰기(`0o666`)만 설정 가능하며, 그룹/기타 사용자 구분이 불가능하다.

**Why it happens:** Windows는 POSIX 파일 권한 모델이 아닌 NTFS ACL을 사용한다. Node.js의 `chmod()`는 Windows에서 쓰기 권한만 제어할 수 있다.

**How to avoid:**
- POSIX(macOS/Linux): `0o600` 정상 적용. `readMcpToken()`에서 권한 검증 포함.
- Windows: 권한 검증 스킵, 경고 로그 출력. `%LOCALAPPDATA%\waiaas\mcp-token` 경로 사용으로 사용자 프로필 격리에 의존.
- 설계 문서에 Windows 제한 사항 명시적 문서화.

**Warning signs:** Windows에서 S-01 테스트가 항상 통과. `fs.statSync().mode & 0o777`이 `0o666` 반환.

**Source:** [Node.js fs.chmod Windows limitation](https://github.com/nodejs/node-v0.x-archive/issues/4812), v0.9-PITFALLS.md H-03

### Pitfall 2: 원자적 쓰기 시 Windows EPERM 에러

**What goes wrong:** Windows NTFS에서 두 프로세스가 동시에 같은 파일에 rename을 시도하면 `EPERM: operation not permitted` 에러가 발생할 수 있다.

**Why it happens:** POSIX에서 `rename()`은 원자적이지만 Windows NTFS에서는 파일이 다른 프로세스에 의해 열려 있을 때 rename이 실패할 수 있다.

**How to avoid:**
- Windows에서 retry-on-EPERM 패턴 적용 (10~50ms 랜덤 대기 후 최대 3회 재시도).
- `writeMcpToken()`에 플랫폼 분기 로직 포함.
- "마지막 쓰기 우선(Last-Writer-Wins)" 정책을 명시적으로 문서화.

**Warning signs:** Windows 환경에서 `EPERM` 에러 로그. mcp-token 파일 내용이 유효하지 않은 JWT.

**Source:** [npm/write-file-atomic#28](https://github.com/npm/write-file-atomic/issues/28), v0.9-PITFALLS.md C-02

### Pitfall 3: symlink 검사에 stat() 대신 lstat() 미사용

**What goes wrong:** `fs.stat()`은 심볼릭 링크를 따라가서 대상 파일의 정보를 반환한다. 따라서 `stat().isSymbolicLink()`는 항상 `false`를 반환한다.

**Why it happens:** POSIX 표준에서 `stat()`은 링크를 따라가고 `lstat()`은 링크 자체를 검사한다. Node.js도 이를 따른다.

**How to avoid:** 반드시 `lstatSync()` 또는 `lstat()` 사용. 코드 리뷰 시 `stat` vs `lstat` 확인.

**Warning signs:** 토큰 파일이 symlink인데 정상 로드됨.

**Source:** [Node.js fs documentation](https://nodejs.org/api/fs.html), v0.9-STACK.md Question 1

### Pitfall 4: SESSION_EXPIRING_SOON 중복 알림 발송

**What goes wrong:** 잔여 갱신 횟수가 3 이하가 된 후, 매 갱신마다 조건이 계속 충족되어 동일 세션에 대해 반복적으로 알림이 발송된다.

**Why it happens:** 갱신 API 응답 처리 시점마다 트리거 조건을 확인하므로, 잔여 3회 -> 2회 -> 1회 -> 0회 각각에서 알림이 발송된다.

**How to avoid:** `notification_log` 테이블에서 동일 세션의 `SESSION_EXPIRING_SOON` 발송 여부를 확인하여 1회만 발송. 또는 세션 테이블에 `expiring_notified_at` 타임스탬프 추가.

**Warning signs:** Owner가 동일 세션에 대해 여러 번 만료 임박 알림을 수신.

### Pitfall 5: 데이터 디렉토리 미존재 시 파일 쓰기 실패

**What goes wrong:** `waiaas init`을 실행하지 않고 `waiaas mcp setup`을 실행하면 `~/.waiaas/` 디렉토리가 존재하지 않아 토큰 파일 쓰기가 실패한다.

**Why it happens:** 데이터 디렉토리 생성은 `waiaas init` 명령어에서 수행된다. 토큰 파일 쓰기 시 디렉토리 존재를 가정하면 `ENOENT` 에러가 발생한다.

**How to avoid:** `writeMcpToken()`에서 `mkdir(dir, { recursive: true, mode: 0o700 })` 호출하여 디렉토리 자동 생성. 이미 존재하면 no-op.

---

## Code Examples

### 토큰 파일 사양 (Specification)

```typescript
// packages/core/src/utils/token-file.ts
// Source: v0.9 objectives 섹션 1.3, v0.9-ARCHITECTURE.md 섹션 2.3

/** 토큰 파일 사양 */
export const TOKEN_FILE_SPEC = {
  /** 파일명 */
  filename: 'mcp-token',
  /** 기본 디렉토리: ~/.waiaas/ (WAIAAS_DATA_DIR 환경변수로 오버라이드 가능) */
  defaultDir: '.waiaas',
  /** 파일 내용: wai_sess_ 접두어 + JWT 문자열 (개행 없음) */
  format: 'raw JWT string (wai_sess_ prefixed)',
  /** 인코딩: UTF-8 */
  encoding: 'utf-8' as const,
  /** POSIX 파일 권한: Owner read/write only */
  mode: 0o600,
  /** 디렉토리 권한 */
  dirMode: 0o700,
  /** symlink 거부 */
  rejectSymlink: true,
  /** Windows 대체 경로: %LOCALAPPDATA%\waiaas\mcp-token */
  windowsAlternativePath: '%LOCALAPPDATA%\\waiaas',
} as const
```

### NotificationEventType 확장 (16 -> 17)

```typescript
// packages/core/src/domain/notification.ts
// Source: v0.9 objectives 섹션 3.1, 35-notification-architecture.md 섹션 2.4

export const NotificationEventType = {
  // ── 거래 관련 (8개, 기존) ──
  TX_NOTIFY: 'TX_NOTIFY',
  TX_DELAY_QUEUED: 'TX_DELAY_QUEUED',
  TX_DELAY_EXECUTED: 'TX_DELAY_EXECUTED',
  TX_APPROVAL_REQUEST: 'TX_APPROVAL_REQUEST',
  TX_APPROVAL_EXPIRED: 'TX_APPROVAL_EXPIRED',
  TX_CONFIRMED: 'TX_CONFIRMED',
  TX_FAILED: 'TX_FAILED',
  TX_DOWNGRADED_DELAY: 'TX_DOWNGRADED_DELAY',     // v0.8

  // ── Kill Switch / 자동 정지 (3개, 기존) ──
  KILL_SWITCH_ACTIVATED: 'KILL_SWITCH_ACTIVATED',
  KILL_SWITCH_RECOVERED: 'KILL_SWITCH_RECOVERED',
  AUTO_STOP_TRIGGERED: 'AUTO_STOP_TRIGGERED',

  // ── 세션 관련 (5개, 기존 4 + v0.9 추가 1) ──
  SESSION_CREATED: 'SESSION_CREATED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  SESSION_RENEWED: 'SESSION_RENEWED',
  SESSION_RENEWAL_REJECTED: 'SESSION_RENEWAL_REJECTED',
  SESSION_EXPIRING_SOON: 'SESSION_EXPIRING_SOON',   // [v0.9] Phase 36 추가

  // ── 운영 (1개, 기존) ──
  DAILY_SUMMARY: 'DAILY_SUMMARY',
} as const
```

### SESSION_EXPIRING_SOON 알림 메시지 스키마

```typescript
// packages/core/src/schemas/notification.schema.ts
// Source: v0.9 objectives 섹션 3.2

export const SessionExpiringSoonDataSchema = z.object({
  sessionId: z.string().uuid(),
  agentName: z.string(),
  expiresAt: z.number().int(),        // 절대 만료 시각 (epoch seconds)
  remainingRenewals: z.number().int(), // 잔여 갱신 횟수
})
```

### 데몬 측 만료 임박 판단 로직

```typescript
// packages/daemon/src/services/session-service.ts
// Source: v0.9-ARCHITECTURE.md 섹션 2.7

/** 만료 임박 판단 상수 */
const EXPIRING_THRESHOLD_SECONDS = 24 * 60 * 60  // 24시간
const RENEWAL_THRESHOLD = 3                        // 잔여 3회 이하

/** 갱신 응답 처리 후 알림 트리거 판단 */
function shouldNotifyExpiringSession(
  remainingRenewals: number,
  absoluteExpiresAt: number,  // epoch seconds
  nowEpochSeconds: number,
): boolean {
  const timeToAbsoluteExpiry = absoluteExpiresAt - nowEpochSeconds
  return remainingRenewals <= RENEWAL_THRESHOLD
    || timeToAbsoluteExpiry <= EXPIRING_THRESHOLD_SECONDS
}
```

### 갱신 API 응답 구조 (참조용, 기존 53-renewal 설계)

```typescript
// PUT /v1/sessions/:id/renew -> 200 OK
// Source: 53-session-renewal-protocol.md 섹션 3.4
interface RenewSessionResponse {
  sessionId: string               // UUID v7
  token: string                   // 'wai_sess_' + 새 JWT
  expiresAt: string               // ISO 8601 (새 만료 시각)
  renewalCount: number            // 누적 갱신 횟수 (갱신 후 값)
  maxRenewals: number             // 최대 갱신 횟수
  absoluteExpiresAt: string       // ISO 8601 (절대 만료 시각)
}

// remainingRenewals = maxRenewals - renewalCount
// 이 값이 3 이하이면 SESSION_EXPIRING_SOON 트리거
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 환경변수 1회 주입 (정적) | 파일 기반 토큰 영속화 + lazy reload | v0.9 (설계) | MCP 프로세스 재시작 없이 토큰 교체 가능 |
| MCP 세션 만료 시 수동 재발급 | SessionManager 자동 갱신 + 알림 | v0.9 (설계) | 에이전트 서비스 연속성 보장 |
| 알림 16개 이벤트 | 17개 (SESSION_EXPIRING_SOON 추가) | v0.9 (설계) | 세션 만료 사전 알림으로 예방적 대응 가능 |
| 토큰 파일 쓰기: writeFile 직접 | write-then-rename 원자적 패턴 | v0.9 (설계) | 부분 쓰기 방지, 크래시 안전성 |

**Deprecated/outdated:**
- `write-file-atomic` npm 패키지: v0.9-STACK.md에서 불필요로 판단됨. 1KB JWT 파일에 외부 의존성은 과잉.
- `fs.watch` 기반 파일 감시: v0.9에서 명시적 배제 (AF-1). 401 lazy reload로 대체.

---

## Existing Design Constraints (from v0.9 Research)

### Locked Decisions (변경 불가)

다음은 v0.9 objectives와 기존 research에서 확정된 결정 사항이다. Phase 36 설계는 이 결정에 따라야 한다:

1. **토큰 파일 위치:** `~/.waiaas/mcp-token` (WAIAAS_DATA_DIR 오버라이드 가능)
2. **공유 유틸리티 위치:** `@waiaas/core` `utils/token-file.ts`
3. **원자적 쓰기:** write-then-rename 패턴 (외부 라이브러리 없이)
4. **알림 트리거:** 데몬 측 자동 판단 (MCP 측 아님)
5. **파일 권한:** `0o600` (POSIX), Windows 제한 문서화
6. **Symlink 거부:** `lstatSync` 검사
7. **Last-Writer-Wins 정책:** 동시 파일 쓰기 시 마지막 쓰기 승리
8. **토큰 파일 포맷:** raw JWT string (`wai_sess_` 접두어), UTF-8, 개행 없음
9. **알림 이벤트:** 17번째 이벤트, NotificationService 기존 인프라 활용
10. **새 라이브러리:** 추가 없음 (의존성 변경 제로)

### Claude's Discretion (자유 영역)

- 중복 알림 방지 메커니즘 선택 (notification_log 조회 vs 세션 컬럼 추가 vs 인메모리)
- Windows EPERM 재시도 전략의 세부 파라미터 (대기 시간, 최대 재시도 횟수)
- `readMcpToken()`의 동기/비동기 API 선택
- SESSION_EXPIRING_SOON Telegram 메시지 템플릿의 구체적 포맷
- 토큰 파일 경로 계산 시 Windows `%LOCALAPPDATA%` 사용 여부

### Deferred Ideas (범위 외)

- 다중 MCP 클라이언트 동시 접속 (AF-3)
- 에이전트별 토큰 파일 분리 (`~/.waiaas/mcp-tokens/<agent-id>.token`)
- OS 키체인 연동 (keytar/node-keychain)
- 토큰 파일에 JSON 메타데이터 포함 (AF-7)

---

## Phase 36 Requirements Analysis

### SMGR-02: 토큰 파일 영속화 사양 설계

**핵심 설계 항목:**

| 항목 | 사양 | 근거 |
|------|------|------|
| 경로 | `~/.waiaas/mcp-token` | 24-monorepo-data-directory.md의 데이터 디렉토리 체계 확장 |
| 포맷 | `wai_sess_` + JWT 문자열 (개행 없음) | 30-session-token-protocol.md 섹션 2.5 토큰 포맷 |
| 권한 | `0o600` (POSIX) | SSH keys, AWS credentials와 동일한 업계 표준 |
| 인코딩 | UTF-8 | JWT는 ASCII-safe base64url이지만 UTF-8로 명시 |
| symlink | 거부 (`lstatSync` 검사) | 보안 시나리오 S-04 |
| 최대 크기 | ~500 bytes (JWT ~300 bytes + prefix 9 bytes) | JWT Claims 설계(30-session-token-protocol.md 섹션 2.4) 기준 |

**기존 24-monorepo-data-directory.md와의 관계:**

현재 `~/.waiaas/` 디렉토리 트리에 `mcp-token` 파일이 없다. Phase 36에서 이 파일을 추가하는 사양을 정의하고, 24-monorepo에 반영한다:

```
~/.waiaas/                             # 데이터 루트 (700)
├── config.toml                        # 데몬 설정 파일 (600)
├── .master-password                   # 마스터 패스워드 파일 (600)
├── daemon.lock                        # 인스턴스 잠금 파일 (644)
├── mcp-token                          # [v0.9] MCP 세션 토큰 (600)  <-- 신규
├── data/
│   └── waiaas.db                      # SQLite 데이터베이스 (600)
├── keys/
│   ├── jwt-secret.key                 # JWT 서명 키 (600)
│   └── keystore.enc                   # 암호화된 키스토어 (600)
└── logs/
    └── daemon.log                     # 데몬 로그 (644)
```

### SMGR-07: 원자적 토큰 파일 쓰기 설계

**write-then-rename 패턴 상세:**

```
1. 임시 파일 생성: ${dir}/.mcp-token.${pid}.${random}.tmp
2. 임시 파일에 토큰 쓰기 (mode 0o600)
3. rename(임시, 대상): POSIX에서 원자적
4. 실패 시 임시 파일 삭제 (cleanup)
```

**플랫폼별 동작:**

| 플랫폼 | rename 원자성 | 파일 권한 | 추가 대응 |
|--------|:----------:|:---------:|----------|
| macOS (APFS/HFS+) | O | O (0o600) | 없음 |
| Linux (ext4/xfs) | O | O (0o600) | 없음 |
| Windows (NTFS) | 조건부 | X (제한적) | EPERM 재시도 + 경고 로그 |
| Docker (bind mount) | O (호스트 FS 의존) | O (호스트 FS 의존) | 없음 |

**3개 쓰기 주체 정리:**

| 컴포넌트 | 프로세스 | 쓰기 시점 | 사용 함수 |
|----------|---------|----------|----------|
| MCP SessionManager | Claude Desktop 자식 프로세스 | 갱신 성공 시 | `writeMcpToken()` |
| Telegram Bot | 데몬 메인 프로세스 | `/newsession` 시 | `writeMcpToken()` |
| CLI | 독립 프로세스 | `mcp setup`, `mcp refresh-token` | `writeMcpToken()` |

### NOTI-01: SESSION_EXPIRING_SOON 이벤트 사양

| 항목 | 값 | 근거 |
|------|-----|------|
| 이벤트 타입 | `SESSION_EXPIRING_SOON` | v0.9 objectives 섹션 3.1 |
| 심각도 | `WARNING` | Owner 행동 필요 (TX_APPROVAL_REQUEST와 동일 레벨) |
| 발생 조건 1 | 절대 수명 만료 24시간 전 | 인증서 만료 알림 업계 표준 참고 |
| 발생 조건 2 | 잔여 갱신 횟수 3회 이하 | maxRenewals 30 기준, 잔여 3회는 ~3일 |
| 발생 조건 논리 | 조건 1 **OR** 조건 2 | 어느 쪽이든 먼저 충족되면 발생 |
| 전송 방식 | `notify()` (표준, 우선순위 채널) | broadcast는 CRITICAL만. WARNING은 notify |
| 알림 내용 | sessionId, agentName, expiresAt, remainingRenewals | v0.9 objectives 섹션 3.2 |
| 중복 방지 | 동일 세션에 1회만 발송 | 갱신마다 반복 알림은 Owner에게 불필요한 노이즈 |

**알림 호출 포인트 추가 (35-notification-architecture.md 섹션 1.5 확장):**

| 호출 포인트 | 이벤트 | 전송 방식 | 트리거 위치 |
|------------|--------|----------|------------|
| 세션 갱신 후 만료 임박 판단 | SESSION_EXPIRING_SOON | notify() (표준) | SessionService.renewSession() 200 응답 후 (Phase 36 추가) |

### NOTI-02: 데몬 측 만료 임박 판단 로직

**트리거 지점:** `SessionService.renewSession()` 내부, 갱신 성공 후 응답 반환 직전.

**판단 데이터 소스:**

| 데이터 | 소스 | 설명 |
|--------|------|------|
| `remainingRenewals` | `session.maxRenewals - newRenewalCount` | 갱신 후 잔여 횟수 |
| `absoluteExpiresAt` | `session.absolute_expires_at` (DB) | 세션 생성 시 계산된 절대 만료 시각 |
| `now` | `Math.floor(Date.now() / 1000)` | 현재 시각 (epoch seconds) |

**로직 흐름:**

```
PUT /v1/sessions/:id/renew
  -> Guard 1-3 통과
  -> 토큰 회전 (새 JWT 발급, DB token_hash 교체)
  -> DB renewal_count++
  -> [v0.9] 만료 임박 판단:
     remainingRenewals = maxRenewals - renewalCount
     timeToExpiry = absoluteExpiresAt - now
     if (remainingRenewals <= 3 OR timeToExpiry <= 86400):
       if (!alreadyNotified(sessionId, 'SESSION_EXPIRING_SOON')):
         notificationService.notify(SESSION_EXPIRING_SOON, {
           sessionId, agentName, expiresAt, remainingRenewals
         })
  -> 200 OK 응답
```

**갱신 실패 경로에서의 알림:**

RENEWAL_LIMIT_REACHED 또는 SESSION_LIFETIME_EXCEEDED 403 에러 시에는 알림이 이미 이전 갱신에서 발송되었어야 한다 (잔여 3회 이하 시점에서). 만약 발송되지 않았다면 403 에러 경로에서도 알림을 발송한다:

```
PUT /v1/sessions/:id/renew
  -> Guard 1: RENEWAL_LIMIT_REACHED (403)
     -> [v0.9] if (!alreadyNotified):
          notify(SESSION_EXPIRING_SOON, { remainingRenewals: 0, ... })
     -> 403 응답

  -> Guard 2: SESSION_LIFETIME_EXCEEDED (403)
     -> [v0.9] if (!alreadyNotified):
          notify(SESSION_EXPIRING_SOON, { timeToExpiry: 0, ... })
     -> 403 응답
```

---

## Open Questions

1. **Windows 토큰 파일 경로 확정 필요**
   - What we know: macOS/Linux는 `~/.waiaas/mcp-token`. Windows에서 `os.homedir()`은 `C:\Users\username`을 반환하므로 `C:\Users\username\.waiaas\mcp-token`이 된다.
   - What's unclear: `%LOCALAPPDATA%\waiaas\mcp-token` (AppData\Local)이 더 적절할 수 있지만, 기존 24-monorepo 설계에서 `~/.waiaas/`를 사용한다.
   - Recommendation: 기존 설계를 따라 `os.homedir()` 기반 유지. Windows 전용 경로 분기는 v0.9 범위 외. WAIAAS_DATA_DIR 환경변수로 사용자가 오버라이드 가능.

2. **중복 알림 방지 메커니즘 최종 결정**
   - What we know: notification_log 조회, 세션 컬럼 추가, 인메모리 Set 3가지 옵션.
   - What's unclear: notification_log 조회 시 인덱스 성능. 세션 컬럼 추가 시 DB 스키마 변경 범위.
   - Recommendation: `notification_log` 조회 방식 사용 (기존 인프라 활용, DB 스키마 변경 최소화). 인덱스는 `(event, reference_id)` 복합 인덱스로 충분.

3. **SESSION_EXPIRING_SOON Telegram 메시지 내 /newsession 인라인 버튼 포함 여부**
   - What we know: v0.9 objectives 섹션 3.2에 `[Create New Session]` `[Details]` 버튼이 예시로 포함.
   - What's unclear: Phase 36에서 메시지 템플릿의 인라인 버튼까지 설계할지, Phase 39(CLI+Telegram 연동)에서 설계할지.
   - Recommendation: Phase 36에서는 알림 데이터 스키마(sessionId, agentName, expiresAt, remainingRenewals)만 정의. Telegram 메시지 템플릿의 인라인 버튼은 Phase 39에서 `/newsession` 플로우와 함께 설계. Phase 36에서는 "버튼 포함 가능" 정도의 방향만 명시.

---

## Sources

### Primary (HIGH confidence)

- v0.9 objectives (`objectives/v0.9-session-management-automation.md`) -- SessionManager 설계 원본, 토큰 파일 사양, 알림 이벤트 정의
- v0.9-ARCHITECTURE.md (`.planning/research/v0.9-ARCHITECTURE.md`) -- 토큰 파일 소유권 모델, 원자적 쓰기 패턴, SESSION_EXPIRING_SOON 통합
- v0.9-PITFALLS.md (`.planning/research/v0.9-PITFALLS.md`) -- 12 pitfalls (C-02 토큰 파일 경합, H-03 Windows 권한, C-03 JWT 무검증 디코딩)
- v0.9-STACK.md (`.planning/research/v0.9-STACK.md`) -- 6 technical questions (파일 영속화, setTimeout, decodeJwt, MCP SDK, fs.watch, InlineKeyboard)
- v0.9-FEATURES.md (`.planning/research/v0.9-FEATURES.md`) -- TS-1~7 Table Stakes, DF-1~5 Differentiators, AF-1~7 Anti-Features
- 35-notification-architecture.md (`.planning/deliverables/35-notification-architecture.md`) -- 기존 16개 NotificationEventType, 이벤트별 심각도, 알림 호출 포인트
- 53-session-renewal-protocol.md (`.planning/deliverables/53-session-renewal-protocol.md`) -- 갱신 API 응답 구조, 5종 안전 장치, RenewalResult 인터페이스
- 30-session-token-protocol.md (`.planning/deliverables/30-session-token-protocol.md`) -- JWT Claims, wai_sess_ 토큰 포맷, sessionAuth 2-stage
- 24-monorepo-data-directory.md (`.planning/deliverables/24-monorepo-data-directory.md`) -- 데이터 디렉토리 레이아웃, 경로 해석 로직, 환경변수

### Secondary (MEDIUM confidence)

- [Node.js File System Documentation](https://nodejs.org/api/fs.html) -- writeFile mode, lstat, rename
- [Node.js Timers Documentation](https://nodejs.org/api/timers.html) -- setTimeout 32-bit 상한
- [write-file-atomic npm](https://www.npmjs.com/package/write-file-atomic) -- 원자적 쓰기 패턴 참고
- [npm/write-file-atomic#28](https://github.com/npm/write-file-atomic/issues/28) -- Windows EPERM 문제
- [Node.js fs.chmod Windows limitation](https://github.com/nodejs/node-v0.x-archive/issues/4812) -- Windows POSIX 권한 제한

### Tertiary (LOW confidence)

- [fs-extra rename atomicity Issue #835](https://github.com/jprichardson/node-fs-extra/issues/835) -- rename 원자성 플랫폼 차이

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 새 라이브러리 없음, Node.js 내장 API만 사용, v0.9-STACK.md에서 검증 완료
- Architecture: HIGH - v0.9-ARCHITECTURE.md에서 통합 지점 분석 완료, 9개 설계 문서 교차 검증
- Pitfalls: HIGH - v0.9-PITFALLS.md에서 12 pitfalls 카탈로그 완료, Node.js 공식 문서 기반

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30일 -- 안정적 도메인, Node.js built-in API 기반)
