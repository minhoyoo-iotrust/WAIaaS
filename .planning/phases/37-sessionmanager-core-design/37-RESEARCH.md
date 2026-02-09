# Phase 37: SessionManager 핵심 설계 - Research

**Researched:** 2026-02-09
**Domain:** MCP Server 내장 SessionManager 클래스 설계 -- 토큰 로드, 자동 갱신, 실패 처리, lazy 401 reload
**Confidence:** HIGH

## Summary

Phase 37은 v0.9의 핵심 설계 대상인 SessionManager 클래스의 인터페이스, 토큰 로드 전략, 자동 갱신 스케줄, 5종 갱신 실패 대응, lazy 401 reload 메커니즘을 구현 가능한 수준으로 정의하는 페이즈이다. Phase 36에서 확정된 토큰 파일 인프라(getMcpTokenPath/writeMcpToken/readMcpToken)와 SESSION_EXPIRING_SOON 알림을 기반으로, MCP Server 프로세스 내부에서 세션 수명을 자동 관리하는 핵심 로직을 설계한다.

SessionManager는 `@modelcontextprotocol/sdk`와 독립적으로 구현된다. MCP SDK v1.x에는 세션/인증 lifecycle hook이 없으므로, SessionManager를 독립 클래스로 설계하고 tool handler에서 `getToken()`을 참조하는 composition 패턴을 사용한다. 새로운 외부 라이브러리 추가 없이, 기존 스택(Node.js 22 내장 setTimeout/fs, jose decodeJwt, @waiaas/core token-file.ts)만으로 전체 설계가 가능하다.

핵심 기술적 고려 사항은 (1) setTimeout 32-bit 정수 오버플로우 방어를 위한 safeSetTimeout 래퍼, (2) 서버 응답 기반 드리프트 보정으로 누적 타이머 오차 제거, (3) 갱신-파일쓰기-메모리교체의 순서 보장(파일 우선 쓰기), (4) JWT payload 무검증 디코딩의 보안 한계와 방어적 파싱이다.

**Primary recommendation:** SessionManager를 `packages/mcp/src/session-manager.ts`에 단일 클래스로 설계하되, 내부 상태(token, sessionId, expiresAt, renewalCount, timer 등)와 3개 public 메서드(getToken/start/dispose) + 내부 메서드(loadToken/scheduleRenewal/renew/handleRenewalError/lazyReloadOnUnauthorized)의 인터페이스를 확정한다. 자동 갱신 스케줄은 60% TTL 경과 시점에 safeSetTimeout으로 설정하고, 갱신 성공 시 서버 응답의 expiresAt 기준으로 다음 스케줄을 재계산(드리프트 보정)한다.

---

## Standard Stack

Phase 37은 설계 마일스톤이므로 새로운 라이브러리 추가가 없다. 기존 스택의 API를 활용한다.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `timers` | 22.x built-in | `setTimeout`/`clearTimeout` 갱신 타이머 | 내장 API. 단일 타이머에 외부 스케줄러 불필요 |
| Node.js `fs` | 22.x built-in | `readFileSync` 토큰 파일 읽기 | Phase 36 확정. readMcpToken 동기 API 사용 |
| `jose` | 6.1.x | `decodeJwt()` JWT payload 무검증 디코딩 | 프로젝트 기존 의존성. `jwt-decode` 추가 불필요 |
| `@waiaas/core` | workspace:* | `readMcpToken()`, `writeMcpToken()`, `getMcpTokenPath()` | Phase 36-01 확정 공유 유틸리티 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `process` | 22.x built-in | `process.env.WAIAAS_SESSION_TOKEN` 환경변수 fallback | 토큰 파일 미존재 시 |
| Node.js `process` | 22.x built-in | `process.on('SIGTERM')` graceful shutdown | dispose() 연동 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `setTimeout` 내장 | `safe-timers` npm | 외부 의존성 추가. 기본 7일 TTL에서 오버플로우 없음. safeSetTimeout 래퍼 10줄로 충분 |
| `jose` decodeJwt | 수동 base64url 디코딩 | 에러 처리, 패딩, 타입 안전성 누락 위험. jose가 이미 의존성 |
| 단일 setTimeout | `setInterval` | setInterval은 갱신 후 새 expiresIn 반영이 불편. nested setTimeout이 유연 |
| Composition 패턴 | MCP SDK hook | SDK v1.x에 세션 관리 hook 없음. 독립 클래스가 유일한 선택 |

**Installation:**
```bash
# 새로운 패키지 설치 없음. 기존 스택만 활용.
```

---

## Architecture Patterns

### Recommended File Structure

```
packages/mcp/src/
├── index.ts                # MCP Server 엔트리포인트 (SessionManager 초기화 추가)
├── server.ts               # McpServer 초기화 + tool/resource 등록
├── session-manager.ts      # [Phase 37 신규] SessionManager 클래스
├── tools/                  # 기존 6개 tool handler
├── resources/              # 기존 3개 resource handler
└── internal/
    ├── api-client.ts       # [Phase 38에서 리팩토링 예정] localhost API 호출 래퍼
    └── config.ts           # 환경변수, 설정
```

### Pattern 1: SessionManager 단일 클래스 (Single Responsibility)

**What:** 세션 토큰의 로드, 갱신 스케줄링, 실패 처리, 파일 영속화를 하나의 클래스에 캡슐화한다. MCP SDK와 완전히 독립적이다.

**When to use:** MCP Server 프로세스 시작 시 생성, tool handler에서 getToken() 참조.

**Example:**
```typescript
// packages/mcp/src/session-manager.ts

import { decodeJwt } from 'jose'
import { readMcpToken, writeMcpToken, getMcpTokenPath } from '@waiaas/core/utils/token-file.js'

// 상수
const RENEWAL_RATIO = 0.6             // TTL의 60% 경과 시점에 갱신
const MAX_TIMEOUT_MS = 2_147_483_647  // setTimeout 32-bit 상한 (2^31 - 1)
const TOKEN_PREFIX = 'wai_sess_'

interface SessionManagerOptions {
  baseUrl?: string            // 데몬 베이스 URL (기본: http://127.0.0.1:3100)
  dataDir?: string            // 데이터 디렉토리 (기본: ~/.waiaas)
  envToken?: string           // 환경변수 토큰 (WAIAAS_SESSION_TOKEN)
}

class SessionManager {
  // ── 내부 상태 ──
  private token: string = ''
  private sessionId: string = ''
  private expiresAt: number = 0       // epoch ms
  private expiresIn: number = 0       // original TTL (ms), 서버 응답 기반 갱신
  private renewalCount: number = 0
  private maxRenewals: number = 0
  private timer: NodeJS.Timeout | null = null
  private tokenFilePath: string
  private baseUrl: string
  private isRenewing: boolean = false
  private renewPromise: Promise<void> | null = null
  private state: 'active' | 'expired' | 'error' = 'active'

  constructor(options: SessionManagerOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'http://127.0.0.1:3100').replace(/\/$/, '')
    this.tokenFilePath = getMcpTokenPath(options.dataDir)
  }

  /** 현재 유효한 토큰 반환. 모든 tool handler가 이 메서드를 사용 */
  getToken(): string { return this.token }

  /** 갱신 스케줄러 시작. 프로세스 시작 시 1회 호출 */
  async start(): Promise<void> { /* loadToken + scheduleRenewal */ }

  /** 정리 (타이머 해제). 프로세스 종료 시 호출 */
  dispose(): void { /* clearTimeout + timer = null */ }
}
```

**Source:** v0.9 objectives 섹션 1.2 (SessionManager 인터페이스), v0.9-STACK.md Question 4 (Composition 패턴)

### Pattern 2: 토큰 로드 우선순위 (File > Env Var)

**What:** 프로세스 시작 시 토큰을 파일에서 우선 로드하고, 파일이 없으면 환경변수에서 로드한다. JWT payload를 서명 검증 없이 디코딩하여 sessionId, exp, iat을 추출한다.

**When to use:** SessionManager.start() 내부의 loadToken() 메서드.

**Example:**
```typescript
// SessionManager 내부 메서드
private loadToken(): void {
  // 1. 파일 우선 로드
  let rawToken = readMcpToken(this.tokenFilePath)

  // 2. 파일 없으면 환경변수 fallback
  if (!rawToken) {
    rawToken = process.env.WAIAAS_SESSION_TOKEN ?? null
  }

  if (!rawToken) {
    throw new Error('[waiaas-mcp] No session token found in file or environment variable')
  }

  // 3. JWT payload base64url 디코딩 (서명 검증 없이)
  const jwt = rawToken.startsWith(TOKEN_PREFIX)
    ? rawToken.slice(TOKEN_PREFIX.length)
    : rawToken

  const payload = decodeJwt(jwt)

  // 4. 필수 claim 추출 + 검증
  const sid = (payload as Record<string, unknown>).sid as string
  const aid = (payload as Record<string, unknown>).aid as string
  const exp = payload.exp   // epoch seconds
  const iat = payload.iat   // epoch seconds

  if (!sid || !exp || !iat) {
    throw new Error('[waiaas-mcp] Invalid JWT payload: missing sid, exp, or iat')
  }

  // 5. 만료 여부 확인
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (exp <= nowSeconds) {
    this.state = 'expired'
    throw new Error(`[waiaas-mcp] Session token already expired at ${new Date(exp * 1000).toISOString()}`)
  }

  // 6. 내부 상태 설정
  this.token = rawToken
  this.sessionId = sid
  this.expiresAt = exp * 1000  // epoch ms
  this.expiresIn = (exp - iat) * 1000  // original TTL (ms)
  this.state = 'active'
}
```

**Source:** v0.9 objectives 섹션 1.3 (토큰 로드 전략), v0.9-STACK.md Question 3 (jose decodeJwt)

### Pattern 3: safeSetTimeout 래퍼 (32-bit Overflow 방지)

**What:** Node.js setTimeout의 32-bit 정수 상한(2,147,483,647ms, 약 24.85일)을 초과하는 딜레이를 안전하게 처리하는 래퍼 함수. 체이닝 방식으로 긴 딜레이를 분할한다.

**When to use:** SessionManager.scheduleRenewal() 내부.

**Example:**
```typescript
function safeSetTimeout(callback: () => void, delayMs: number): NodeJS.Timeout {
  if (delayMs > MAX_TIMEOUT_MS) {
    // 체이닝: MAX_TIMEOUT_MS만큼 대기 후 남은 시간으로 재스케줄
    return setTimeout(() => {
      safeSetTimeout(callback, delayMs - MAX_TIMEOUT_MS)
    }, MAX_TIMEOUT_MS)
  }
  return setTimeout(callback, Math.max(delayMs, 0))
}
```

**Source:** v0.9-PITFALLS.md C-01 (setTimeout 32비트 정수 오버플로우), Node.js Timers docs

### Pattern 4: 서버 응답 기반 드리프트 보정 (Self-Correcting Timer)

**What:** 갱신 성공 시 서버 응답의 expiresAt을 기준으로 다음 갱신 시점을 재계산하여, setTimeout의 누적 드리프트를 매 갱신마다 0으로 리셋한다.

**When to use:** SessionManager.renew() 성공 후 scheduleRenewal() 호출.

**Example:**
```typescript
// 갱신 성공 후 다음 갱신 스케줄
private scheduleRenewal(): void {
  if (this.timer) clearTimeout(this.timer)

  const now = Date.now()
  // 서버 expiresAt 기반 절대 시간 계산 (드리프트 보정)
  const renewAtMs = this.expiresAt - (this.expiresIn * (1 - RENEWAL_RATIO))
  const delayMs = Math.max(renewAtMs - now, 0)

  this.timer = safeSetTimeout(() => this.renew(), delayMs)
  this.timer.unref()  // 프로세스 종료를 막지 않음
}
```

**Source:** v0.9-PITFALLS.md H-01 (setTimeout 타이머 드리프트), 53-session-renewal-protocol.md 섹션 5.5

### Pattern 5: Lazy 401 Reload (파일 재로드 + 토큰 비교)

**What:** API 호출이 401을 반환하면 토큰 파일을 재로드하고, 파일의 토큰이 현재 메모리 토큰과 다르면 교체 후 API를 재시도한다. 같으면 진짜 만료로 판단하여 에러 상태에 진입한다.

**When to use:** tool handler의 API 호출이 401을 반환할 때.

**Example:**
```typescript
// SessionManager 내부 메서드
async handleUnauthorized(): Promise<boolean> {
  // 1. 파일 재로드
  const fileToken = readMcpToken(this.tokenFilePath)

  // 2. 파일 없음 → 에러 상태
  if (!fileToken) {
    this.state = 'error'
    return false
  }

  // 3. 파일 토큰 == 현재 토큰 → 진짜 만료
  if (fileToken === this.token) {
    this.state = 'expired'
    return false
  }

  // 4. 파일 토큰 != 현재 토큰 → 외부에서 갱신됨 (Telegram/CLI)
  //    새 토큰으로 교체 + 갱신 스케줄 재설정
  const jwt = fileToken.startsWith(TOKEN_PREFIX)
    ? fileToken.slice(TOKEN_PREFIX.length) : fileToken
  const payload = decodeJwt(jwt)
  const exp = payload.exp ?? 0
  const iat = payload.iat ?? 0
  const sid = (payload as Record<string, unknown>).sid as string

  this.token = fileToken
  this.sessionId = sid
  this.expiresAt = exp * 1000
  this.expiresIn = (exp - iat) * 1000
  this.state = 'active'
  this.scheduleRenewal()

  return true  // 재시도 가능
}
```

**Source:** v0.9 objectives 섹션 4.1 (전략: 만료 감지 + 파일 재로드)

### Anti-Patterns to Avoid

- **fs.watch로 파일 변경 감시:** macOS FSEvents race condition, Linux NFS 미동작 등 플랫폼별 불안정. lazy 401 reload로 대체 (v0.9 objectives에서 확정).
- **setInterval로 주기적 갱신:** 갱신 후 새 expiresIn 반영이 불편하고, 실패 시 재시도 로직이 복잡해짐. nested setTimeout(각 갱신 후 새 타이머)이 유연함.
- **MCP SDK hook에 의존:** SDK v1.x에 세션 관리 hook이 없음. 독립 클래스로 설계.
- **토큰 갱신 시 메모리 먼저 교체 후 파일 쓰기:** 프로세스 kill 시 메모리 토큰 유실. 반드시 파일 먼저 쓰고 메모리를 교체(v0.9-PITFALLS.md H-02).
- **서버 응답 무시하고 로컬 타이머만 사용:** 누적 드리프트로 절대 수명 접근 시 예상치 못한 갱신 실패 발생.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT payload 디코딩 | base64url 수동 파싱 + JSON.parse | `jose` `decodeJwt()` | base64url 패딩 처리, 타입 안전성, 에러 처리. 10+ 엣지 케이스 |
| 32-bit timeout 방지 | `setTimeout` 직접 사용만 | `safeSetTimeout` 래퍼 함수 (10줄) | 오버플로우 시 즉시 실행되어 무한 RENEWAL_TOO_EARLY 루프 |
| 토큰 파일 읽기/쓰기 | 직접 fs 호출 | `@waiaas/core` readMcpToken/writeMcpToken | Phase 36 확정. symlink 거부, 형식 검증, 원자적 쓰기 패턴 내장 |
| 갱신 API 호출 | raw fetch 직접 | ApiClient 또는 내부 renewApi 메서드 | 401 처리, 에러 파싱, 타임아웃 등 반복 로직 |

**Key insight:** SessionManager의 핵심 가치는 기존 API(jose, token-file utils, daemon renewal API)를 올바른 순서와 에러 처리로 조합하는 것이다. 새 알고리즘이 아닌 상태 관리와 에러 복구가 설계의 핵심이다.

---

## Common Pitfalls

### Pitfall 1: setTimeout 32-bit 정수 오버플로우 (C-01)

**What goes wrong:** `setTimeout`에 2,147,483,647ms(약 24.85일) 초과 딜레이를 전달하면 즉시 실행된다.

**Why it happens:** Node.js 내부적으로 signed 32-bit 정수 사용. 기본 7일 TTL의 60%=4.2일은 안전하지만, config.toml에서 expiresIn을 42일 이상으로 설정하면 오버플로우 발생.

**How to avoid:** `safeSetTimeout` 래퍼 함수로 MAX_TIMEOUT_MS 초과 시 체이닝. 설계 문서에 래퍼 함수 명세 포함. SessionManager.start() 시 계산된 딜레이를 로그에 기록하고, MAX_TIMEOUT_MS 초과 시 WARN 출력.

**Warning signs:** 프로세스 시작 직후 RENEWAL_TOO_EARLY 반복, expiresIn이 42일 이상인 세션에서만 발생.

### Pitfall 2: 타이머 드리프트 누적 (H-01)

**What goes wrong:** setTimeout은 최소 딜레이만 보장하고 GC pause, event loop 바쁨 등으로 실제 실행이 지연된다. 30회 갱신 x 수분 드리프트 = 절대 수명 접근 시 수시간 오차.

**Why it happens:** setTimeout은 정밀 타이머가 아님. OS 스케줄링 + Node.js event loop 지연.

**How to avoid:** 갱신 성공 시 서버 응답의 `expiresAt`을 기준으로 다음 갱신 시점을 절대 시간으로 재계산(self-correcting timer). 로컬 상대 시간 대신 서버-클라이언트 간 시간 동기화 효과.

**Warning signs:** 갱신 로그의 실제 시각이 예정 시각보다 계속 뒤로 밀림, 절대 수명 만료 1-2일 전 갱신 실패.

### Pitfall 3: 갱신 inflight 중 프로세스 kill (H-02)

**What goes wrong:** PUT /renew 200 OK 수신 후, 파일 쓰기 전 SIGTERM이 오면 새 토큰이 유실된다. 데몬 DB에서는 token_hash가 교체되어 구 토큰은 영구 무효.

**Why it happens:** Claude Desktop이 MCP Server 자식 프로세스에 SIGTERM을 보냄. 갱신 API 호출은 비동기이므로 응답 처리와 파일 쓰기 사이에 kill 가능.

**How to avoid:** 반드시 "파일 먼저 쓰기 -> 메모리 교체" 순서. SIGTERM 핸들러에서 inflight 갱신 완료 대기(최대 5초). 설계 문서에 쓰기 순서를 명시적으로 정의.

**Warning signs:** MCP Server 재시작 후 첫 API 호출이 항상 AUTH_TOKEN_INVALID, lazy reload에서 "파일 토큰 == 현재 토큰" -> 에러 상태.

### Pitfall 4: JWT payload 무검증 디코딩의 보안 한계 (C-03)

**What goes wrong:** 조작된 토큰이 mcp-token 파일에 심어지면, SessionManager가 잘못된 exp/sid를 기반으로 갱신 스케줄링. 실제 API 호출은 데몬에서 거부되지만 SessionManager 내부 상태가 오염.

**Why it happens:** MCP Server에 JWT 서명 비밀키가 없어 서명 검증 불가. payload만 디코딩하여 사용.

**How to avoid:** (1) 방어적 파싱: 필수 claim(sid, aid, exp, iat) 존재 확인 + exp 범위 검증(과거 10년~미래 1년). (2) start() 시 데몬에 1회 유효성 확인 API 호출(GET /v1/sessions/:sid 또는 갱신 시도). (3) 토큰 파일의 symlink 거부는 Phase 36에서 이미 확정.

**Warning signs:** SessionManager가 갱신을 스케줄하지 않는데 API 호출이 401, mcp-token 파일의 exp와 데몬 DB의 expires_at 불일치.

### Pitfall 5: 갱신 중 tool 호출과의 동시성

**What goes wrong:** renew() 진행 중 tool handler가 getToken()을 호출하면, 구 토큰이 반환되어 API 호출이 실행된다. 갱신이 완료되면 DB에서 구 토큰 해시가 교체되어, inflight API 호출이 도중에 실패할 수 있다.

**Why it happens:** 토큰 로테이션(53-session-renewal-protocol.md 섹션 5.3)은 구 token_hash를 즉시 교체하므로 구 토큰이 자동 무효화된다.

**How to avoid:** (1) 갱신 중에도 getToken()은 현재(구) 토큰을 반환 -- 갱신 API 자체가 구 토큰의 sessionAuth를 사용하므로 inflight 호출과 갱신이 동일 토큰 사용. (2) 갱신 완료 후 다음 getToken() 호출부터 새 토큰 반환. (3) 이 설계는 v0.9 objectives 섹션 1.6에 이미 명시: "갱신 중 tool 호출이 발생하면 현재(이전) 토큰이 사용된다. 갱신 완료 후 다음 tool 호출부터 새 토큰이 사용된다."

**Warning signs:** 갱신 직후 1-2개 tool 호출이 AUTH_TOKEN_INVALID로 실패(구 토큰 사용), 이후 정상 복귀.

---

## Code Examples

### SessionManager 전체 클래스 인터페이스

```typescript
// packages/mcp/src/session-manager.ts
// Source: v0.9 objectives 섹션 1.2, v0.9-STACK.md Question 4

import { decodeJwt } from 'jose'
import { readMcpToken, writeMcpToken, getMcpTokenPath } from '@waiaas/core/utils/token-file.js'

const RENEWAL_RATIO = 0.6
const MAX_TIMEOUT_MS = 2_147_483_647
const TOKEN_PREFIX = 'wai_sess_'

// 내부 상태 타입
type SessionState = 'active' | 'expired' | 'error'

interface SessionManagerOptions {
  baseUrl?: string
  dataDir?: string
  envToken?: string
}

class SessionManager {
  // ── Public Interface ──
  getToken(): string
  async start(): Promise<void>
  dispose(): void

  // ── 내부 상태 ──
  private token: string
  private sessionId: string
  private expiresAt: number           // epoch ms
  private expiresIn: number           // original TTL (ms)
  private renewalCount: number
  private maxRenewals: number
  private timer: NodeJS.Timeout | null
  private tokenFilePath: string
  private baseUrl: string
  private isRenewing: boolean
  private renewPromise: Promise<void> | null
  private state: SessionState

  // ── 내부 메서드 ──
  private loadToken(): void
  private scheduleRenewal(): void
  private async renew(): Promise<void>
  private handleRenewalError(error: RenewalError): void
  async handleUnauthorized(): Promise<boolean>  // lazy 401 reload
}
```

### 토큰 로드 + JWT 디코딩

```typescript
// Source: v0.9 objectives 섹션 1.3, v0.9-STACK.md Question 3

private loadToken(): void {
  // 1. 파일 우선 로드 (Phase 36 readMcpToken 사용)
  let rawToken = readMcpToken(this.tokenFilePath)

  // 2. 파일 없으면 환경변수 fallback
  if (!rawToken) {
    rawToken = process.env.WAIAAS_SESSION_TOKEN ?? null
  }

  if (!rawToken) {
    throw new Error('[waiaas-mcp] No session token found')
  }

  // 3. jose decodeJwt로 payload 디코딩 (서명 검증 없이)
  const jwt = rawToken.startsWith(TOKEN_PREFIX)
    ? rawToken.slice(TOKEN_PREFIX.length)
    : rawToken
  const payload = decodeJwt(jwt)

  // 4. 필수 claim 추출
  const sid = (payload as Record<string, unknown>).sid as string
  const exp = payload.exp  // epoch seconds
  const iat = payload.iat  // epoch seconds

  if (!sid || typeof exp !== 'number' || typeof iat !== 'number') {
    throw new Error('[waiaas-mcp] Invalid JWT: missing sid/exp/iat')
  }

  // 5. 방어적 범위 검증 (C-03 대응)
  const nowSec = Math.floor(Date.now() / 1000)
  if (exp < nowSec - 315_360_000 || exp > nowSec + 31_536_000) {
    throw new Error('[waiaas-mcp] JWT exp out of reasonable range')
  }

  // 6. 만료 확인
  if (exp <= nowSec) {
    this.state = 'expired'
    throw new Error(`[waiaas-mcp] Token expired: ${new Date(exp * 1000).toISOString()}`)
  }

  // 7. 상태 설정
  this.token = rawToken
  this.sessionId = sid
  this.expiresAt = exp * 1000
  this.expiresIn = (exp - iat) * 1000
  this.state = 'active'
}
```

### safeSetTimeout 래퍼

```typescript
// Source: v0.9-PITFALLS.md C-01

const MAX_TIMEOUT_MS = 2_147_483_647  // 2^31 - 1

function safeSetTimeout(callback: () => void, delayMs: number): NodeJS.Timeout {
  if (delayMs > MAX_TIMEOUT_MS) {
    return setTimeout(() => {
      safeSetTimeout(callback, delayMs - MAX_TIMEOUT_MS)
    }, MAX_TIMEOUT_MS)
  }
  return setTimeout(callback, Math.max(delayMs, 0))
}
```

### 자동 갱신 스케줄 + 드리프트 보정

```typescript
// Source: v0.9-PITFALLS.md H-01, v0.9 objectives 섹션 1.4

private scheduleRenewal(): void {
  if (this.timer) clearTimeout(this.timer)

  const now = Date.now()
  // 절대 시간 기준 갱신 시점 계산 (드리프트 보정)
  // expiresAt에서 잔여 40% 구간의 시작점
  const renewAtMs = this.expiresAt - (this.expiresIn * (1 - RENEWAL_RATIO))
  const delayMs = Math.max(renewAtMs - now, 0)

  if (delayMs === 0) {
    // 이미 갱신 시점 경과 → 즉시 갱신
    setImmediate(() => this.renew())
    return
  }

  this.timer = safeSetTimeout(() => this.renew(), delayMs)
  this.timer.unref()  // 프로세스 종료를 막지 않음
}
```

### 갱신 실행 + 파일 우선 쓰기

```typescript
// Source: v0.9 objectives 섹션 1.6, v0.9-PITFALLS.md H-02

private async renew(): Promise<void> {
  if (this.isRenewing) return  // 중복 갱신 방지
  this.isRenewing = true

  this.renewPromise = (async () => {
    try {
      const res = await fetch(
        `${this.baseUrl}/v1/sessions/${this.sessionId}/renew`,
        {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${this.token}` },
        }
      )

      if (res.ok) {
        const data = await res.json()
        // 순서 중요: 파일 먼저, 메모리 나중 (H-02 방어)
        await writeMcpToken(this.tokenFilePath, data.token)
        this.token = data.token
        this.expiresAt = new Date(data.expiresAt).getTime()
        this.renewalCount = data.renewalCount
        this.maxRenewals = data.maxRenewals
        // 서버 응답 기준 expiresIn 재계산 (드리프트 보정)
        this.expiresIn = this.expiresAt - Date.now()
        this.scheduleRenewal()
      } else {
        const errorData = await res.json().catch(() => ({}))
        this.handleRenewalError({
          status: res.status,
          code: errorData?.error?.code ?? 'UNKNOWN',
        })
      }
    } catch (err) {
      this.handleRenewalError({ status: 0, code: 'NETWORK_ERROR' })
    } finally {
      this.isRenewing = false
      this.renewPromise = null
    }
  })()

  return this.renewPromise
}
```

### 5종 갱신 실패 에러 대응

```typescript
// Source: v0.9 objectives 섹션 1.5, 53-session-renewal-protocol.md 섹션 3.7

interface RenewalError {
  status: number
  code: string
}

private handleRenewalError(error: RenewalError): void {
  switch (error.code) {
    case 'RENEWAL_TOO_EARLY':
      // 서버 시간 차이. 30초 후 1회 재시도
      this.timer = safeSetTimeout(() => this.renew(), 30_000)
      this.timer.unref()
      break

    case 'RENEWAL_LIMIT_REACHED':
      // 갱신 포기. 현재 토큰으로 만료까지 사용
      // 데몬이 SESSION_EXPIRING_SOON 알림 자동 발송 (NOTI-01)
      console.error('[waiaas-mcp] Renewal limit reached. Session will expire naturally.')
      // 갱신 스케줄 중단 (재시도 없음)
      break

    case 'SESSION_ABSOLUTE_LIFETIME_EXCEEDED':
      // 절대 수명 초과. 갱신 포기
      // 데몬이 SESSION_EXPIRING_SOON 알림 자동 발송 (NOTI-01)
      console.error('[waiaas-mcp] Absolute lifetime exceeded. Session will expire naturally.')
      break

    case 'NETWORK_ERROR':
      // 데몬 미응답. 60초 후 재시도, 최대 3회
      this.retryRenewal(60_000, 3)
      break

    default:
      // AUTH_TOKEN_EXPIRED 또는 기타 인증 실패
      if (error.status === 401) {
        // 이미 만료. 파일에서 새 토큰 확인 시도 (lazy reload)
        this.handleUnauthorized().then(canRetry => {
          if (!canRetry) {
            this.state = 'expired'
            console.error('[waiaas-mcp] Session expired. Waiting for external token refresh.')
          }
        })
      }
      break
  }
}

private retryRenewal(delayMs: number, maxRetries: number, attempt: number = 0): void {
  if (attempt >= maxRetries) {
    console.error(`[waiaas-mcp] Renewal failed after ${maxRetries} retries.`)
    this.state = 'error'
    return
  }
  this.timer = safeSetTimeout(() => {
    this.renew().catch(() => {
      this.retryRenewal(delayMs, maxRetries, attempt + 1)
    })
  }, delayMs)
  this.timer.unref()
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 환경변수 1회 전달 (WAIAAS_SESSION_TOKEN) | 파일 기반 + 자동 갱신 (SessionManager) | v0.9 설계 | 토큰 로테이션이 MCP 프로세스 내부에서 투명하게 처리 |
| MCP 프로세스 재시작으로 토큰 교체 | lazy 401 reload로 무중단 토큰 전환 | v0.9 설계 | Claude Desktop 대화 맥락 보존 |
| 수동 세션 재발급 (CLI 필요) | Telegram /newsession + 파일 자동 감지 | v0.9 설계 | Owner 물리적 위치 무관 |

**MCP SDK v2 참고:**
- MCP SDK v2(pre-alpha)가 main 브랜치에서 개발 중이나 프로덕션 사용은 v1.x 권장
- v2에서 세션/인증 lifecycle hook 추가 가능성이 있으나 현재 확인 불가
- v0.9 설계는 v1.x 기준. SessionManager가 독립 클래스이므로 v2 마이그레이션 시 영향 최소

---

## Open Questions

1. **갱신 성공 시 expiresIn 재계산 방법**
   - What we know: 서버 응답에 `expiresAt`이 ISO 8601로 제공됨. `renewalCount`, `maxRenewals`도 포함.
   - What's unclear: 서버의 `expiresAt`과 클라이언트 `Date.now()` 사이의 시간 차이를 expiresIn으로 사용할 때, 응답 전송 지연(수십 ms)이 누적되는지.
   - Recommendation: expiresIn = expiresAt - now 로 계산하되, 응답 지연은 무시 가능(ms 단위 vs 시간 단위 갱신 주기). 설계 문서에 이 결정을 명시.

2. **start() 시 데몬 유효성 확인 API 호출 여부**
   - What we know: C-03(JWT 무검증 디코딩) 방어로 start() 시 데몬에 1회 확인 호출 권장(v0.9-PITFALLS.md).
   - What's unclear: 데몬이 아직 기동 중이지 않을 때(MCP 프로세스가 먼저 시작될 수 있음) 어떻게 처리할지.
   - Recommendation: start()에서 데몬 확인은 optional. 실패해도 로컬 JWT exp 기준으로 동작하고, 첫 tool 호출에서 데몬이 검증. 설계 문서에 "데몬 미기동 시 graceful degradation" 명시.

3. **renewalCount/maxRenewals 초기값**
   - What we know: 토큰 로드 시 JWT payload에 renewalCount/maxRenewals가 포함되지 않음(JWT claims은 sid, aid, exp, iat만 포함).
   - What's unclear: start() 시점에 이 값을 어떻게 초기화할지.
   - Recommendation: renewalCount/maxRenewals는 첫 갱신 성공 시 서버 응답에서 획득. start() 시점에는 0/Infinity로 초기화하고, 갱신 응답에서 업데이트. 설계 문서에 이 초기화 전략을 명시.

---

## Sources

### Primary (HIGH confidence)
- v0.9 objectives (`objectives/v0.9-session-management-automation.md`) -- SessionManager 인터페이스, 토큰 로드 전략, 갱신 스케줄, 실패 처리, lazy reload 원본 설계
- 53-session-renewal-protocol.md (`.planning/deliverables/53-session-renewal-protocol.md`) -- PUT /renew API 스펙, 5종 안전 장치, 에러 코드, 토큰 회전 메커니즘
- 30-session-token-protocol.md (`.planning/deliverables/30-session-token-protocol.md`) -- JWT claims 구조(sid, aid, exp, iat, jti), wai_sess_ 접두사, HS256
- 38-sdk-mcp-interface.md (`.planning/deliverables/38-sdk-mcp-interface.md`) -- MCP Server 패키지 구조, tool handler 패턴, WAIAAS_SESSION_TOKEN 환경변수
- v0.9-STACK.md (`.planning/research/v0.9-STACK.md`) -- 6개 기술 질문 답변, setTimeout 32-bit 한계, jose decodeJwt, MCP SDK hook 부재
- v0.9-PITFALLS.md (`.planning/research/v0.9-PITFALLS.md`) -- C-01(setTimeout overflow), C-03(JWT 무검증), H-01(드리프트), H-02(inflight kill)
- Phase 36 deliverables -- 토큰 파일 인프라(readMcpToken/writeMcpToken/getMcpTokenPath), SESSION_EXPIRING_SOON 알림

### Secondary (MEDIUM confidence)
- [jose v6.x decodeJwt docs](https://github.com/panva/jose/blob/main/docs/util/decode_jwt/functions/decodeJwt.md) -- `decodeJwt<PayloadType>(jwt: string): PayloadType & JWTPayload`
- [Node.js Timers documentation](https://nodejs.org/api/timers.html) -- setTimeout 32-bit signed integer limit, unref() behavior
- [Node.js Issue #22860](https://github.com/nodejs/node/issues/22860) -- 32-bit overflow 시 즉시 실행 동작 확인
- [MDN setTimeout](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout) -- delay parameter 32-bit limitation

### Tertiary (LOW confidence)
- [safetimeout npm (archived)](https://github.com/JamesMGreene/node-safetimeout) -- deprecated, 자체 safeSetTimeout 래퍼로 대체
- [safe-timers npm](https://www.npmjs.com/package/safe-timers) -- Inactive maintenance. 92K weekly downloads이지만 외부 의존성 추가 불필요

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 새 라이브러리 추가 없음. 모든 API(jose decodeJwt, setTimeout, fs, @waiaas/core token-file)가 공식 문서에서 확인됨
- Architecture: HIGH -- v0.9 objectives에 SessionManager 인터페이스, 토큰 로드 전략, 갱신 스케줄, 실패 처리, lazy reload 모두 정의됨. Phase 36 토큰 파일 인프라 확정. Composition 패턴은 MCP SDK v1.x의 유일한 선택지
- Pitfalls: HIGH -- v0.9-PITFALLS.md에서 12개 함정 분석 완료. C-01(setTimeout), C-03(JWT), H-01(drift), H-02(inflight kill) 4개가 Phase 37 직접 관련. 모두 구체적 방어 코드 패턴 확보

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days, stable domain)
