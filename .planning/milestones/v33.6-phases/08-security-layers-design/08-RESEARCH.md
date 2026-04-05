# Phase 8: Security Layers Design - Research

**Researched:** 2026-02-05
**Domain:** 3-layer security (Time-Lock/Approval, Notification, Kill Switch), Owner wallet connection, Policy engine, EVM adapter
**Confidence:** MEDIUM (대부분 공식 문서 기반, 일부 아키텍처 패턴은 도메인 추론)

## Summary

Phase 8은 WAIaaS 보안의 핵심 계층인 Layer 2 (시간 지연 + 승인)와 Layer 3 (모니터링 + Kill Switch)를 설계한다. Phase 7에서 정의한 IPolicyEngine 인터페이스와 4-티어 보안 분류(INSTANT/NOTIFY/DELAY/APPROVAL)를 실제 정책 엔진으로 구현하는 설계, Owner 지갑 연결을 위한 WalletConnect v2 (Reown) 통합, 멀티 채널 알림(Telegram/Discord/ntfy.sh), Kill Switch 캐스케이드 프로토콜, 자동 정지 규칙 엔진을 상세 설계한다.

주요 발견사항: (1) WalletConnect은 Reown으로 리브랜딩 완료되었으며, `@reown/walletkit` v1.5.0이 현재 활성 패키지이다. 기존 `@walletconnect/*` 패키지는 2025-02-17 이후 지원이 중단되었다. (2) Tauri 2 WebView는 브라우저 익스텐션을 지원하지 않으므로, Owner 지갑 연결은 WalletConnect v2 QR 코드 방식이 유일하게 실용적인 경로이다. (3) 알림 채널 3종(Telegram Bot API, Discord Webhook, ntfy.sh)은 모두 단순 HTTP POST로 구현 가능하며 외부 라이브러리 의존 없이 fetch API만으로 충분하다. (4) TOCTOU 방지는 SQLite `BEGIN IMMEDIATE` 트랜잭션과 원자적 상태 전이를 결합하여 해결한다.

**Primary recommendation:** 알림 채널은 외부 라이브러리 없이 native fetch로 구현하고, Owner 지갑 연결은 Reown AppKit + WalletConnect v2 QR 방식을 사용하며, 정책 엔진은 Phase 7의 IPolicyEngine 인터페이스를 구현하는 DB-backed rule evaluator로 설계한다.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@reown/walletkit` | 1.5.0 | WalletConnect v2 프로토콜 (데몬 사이드 세션 관리) | WalletConnect -> Reown 공식 마이그레이션 패키지. 2025-02-17 이후 유일한 활성 패키지 |
| `@walletconnect/core` | latest | WalletKit 내부 의존성 (relay, crypto) | @reown/walletkit의 필수 peer dependency |
| `@walletconnect/utils` | latest | WalletConnect 유틸리티 (URI 파싱, 검증) | @reown/walletkit의 필수 peer dependency |
| `@reown/appkit` | latest | Owner UI에서 WalletConnect 모달 (Tauri WebView) | Reown 공식 프론트엔드 SDK. React/vanilla JS 지원 |
| `viem` | 2.45.x | EVM 체인 상호작용 (EVM Adapter stub) | ethers.js 대체, TypeScript-first, tree-shakable, 4000+ 프로젝트 사용 |
| `@web3auth/sign-in-with-solana` | latest | SIWS 서명 검증 (이미 Phase 7에서 도입) | SIWS 표준 구현, Owner 서명 검증에 재사용 |
| `siwe` | 3.x | SIWE 서명 검증 (이미 Phase 7에서 도입) | EIP-4361 표준, EVM Owner 서명 검증에 재사용 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Native `fetch` | Node.js 22+ built-in | Telegram/Discord/ntfy.sh HTTP API 호출 | 모든 알림 채널 전송. 외부 HTTP 라이브러리 불필요 |
| `tweetnacl` | 1.x (이미 도입) | Ed25519 서명 검증 | Owner Solana 서명 로우레벨 검증 |
| `better-sqlite3` | 12.6.x (이미 도입) | TOCTOU 방지 `BEGIN IMMEDIATE` 트랜잭션 | 정책 평가 + 상태 전이 원자적 처리 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native fetch (알림) | `node-telegram-bot-api`, `telegraf` | 불필요한 의존성. WAIaaS는 sendMessage만 사용하므로 전체 Bot 프레임워크 불필요 |
| Native fetch (Discord) | `discord-webhook-node` | 5년간 업데이트 없는 패키지. fetch POST 한 줄이면 충분 |
| `@reown/walletkit` | `@walletconnect/web3wallet` (deprecated) | 2025-02-17 이후 지원 중단. 반드시 Reown 패키지 사용 |
| `@reown/appkit` | `@phantom/browser-sdk` | Phantom 전용. 체인 무관 설계 원칙에 위배. AppKit은 Solana+EVM 모두 지원 |
| `viem` (EVM) | `ethers.js` v6 | ethers.js는 레거시 방향. viem이 TypeScript 타입 추론, bundle size, 성능 우월 |

**Installation:**
```bash
# Phase 8 신규 (Owner 지갑 연결용)
npm install @reown/walletkit @walletconnect/core @walletconnect/utils @reown/appkit

# EVM Adapter stub용
npm install viem

# 이미 설치된 패키지 (Phase 6-7)
# @web3auth/sign-in-with-solana, siwe, tweetnacl, better-sqlite3, jose, lru-cache
```

## Architecture Patterns

### Recommended Module Structure
```
packages/daemon/src/
├── domain/
│   ├── policy-engine.ts          # IPolicyEngine 구현 (DB-backed)
│   ├── security-tier.ts          # 4-티어 분류 로직
│   ├── auto-stop-rules.ts        # 자동 정지 규칙 엔진
│   └── kill-switch.ts            # Kill Switch 캐스케이드 프로토콜
├── services/
│   ├── notification-service.ts   # 멀티 채널 알림 오케스트레이터
│   ├── approval-service.ts       # Owner 승인 대기/처리
│   └── delay-queue-worker.ts     # DELAY 티어 쿨다운 워커
├── adapters/
│   ├── solana-adapter.ts         # (Phase 7, 기존)
│   ├── evm-adapter-stub.ts       # EVM Adapter 인터페이스 준수 스텁
│   └── notification/
│       ├── telegram-channel.ts   # Telegram Bot API
│       ├── discord-channel.ts    # Discord Webhook
│       └── ntfy-channel.ts       # ntfy.sh Push
├── middleware/
│   └── owner-auth.ts             # ownerAuth 미들웨어 (SIWS/SIWE 검증)
└── routes/
    └── owner-routes.ts           # /v1/owner/* 엔드포인트
```

### Pattern 1: Database-Backed Policy Engine (규칙 기반 정책 평가)
**What:** policies 테이블에서 에이전트별 + 글로벌 규칙을 로드하고, 우선순위 순으로 평가하여 PolicyDecision을 반환한다. Martin Fowler의 "narrow context rule engine" 원칙을 따른다.
**When to use:** 모든 거래 요청의 Stage 3 (POLICY CHECK)
**Example:**
```typescript
// Source: Phase 7 IPolicyEngine interface + rules engine pattern
class DatabasePolicyEngine implements IPolicyEngine {
  constructor(private db: DrizzleInstance) {}

  async evaluate(agentId: string, request: {
    type: string; amount: string; to: string; chain: string;
  }): Promise<PolicyDecision> {
    // 1. 에이전트별 + 글로벌(agentId=NULL) 활성 정책 로드
    const rules = await this.db.select()
      .from(policies)
      .where(and(
        or(eq(policies.agentId, agentId), isNull(policies.agentId)),
        eq(policies.enabled, true),
      ))
      .orderBy(desc(policies.priority))

    // 2. 순차 평가 (첫 DENY 즉시 반환)
    for (const rule of rules) {
      const result = this.evaluateRule(rule, request)
      if (!result.allowed) return result
    }

    // 3. 모든 규칙 통과 → 티어 결정
    return this.determineTier(rules, request)
  }

  private determineTier(rules: PolicyRow[], request: TxRequest): PolicyDecision {
    // SPENDING_LIMIT 규칙에서 금액 기반 티어 결정
    const spendingRule = rules.find(r => r.type === 'SPENDING_LIMIT')
    if (!spendingRule) return { allowed: true, tier: 'INSTANT' }

    const limits = JSON.parse(spendingRule.rules)
    const amount = BigInt(request.amount)

    if (amount <= BigInt(limits.instant_max)) return { allowed: true, tier: 'INSTANT' }
    if (amount <= BigInt(limits.notify_max)) return { allowed: true, tier: 'NOTIFY' }
    if (amount <= BigInt(limits.delay_max)) {
      return {
        allowed: true, tier: 'DELAY',
        delaySeconds: limits.delay_seconds ?? 300, // 기본 5분
      }
    }
    return {
      allowed: true, tier: 'APPROVAL',
      approvalTimeoutSeconds: limits.approval_timeout ?? 3600, // 기본 1시간
    }
  }
}
```

### Pattern 2: Notification Channel Abstraction (채널 추상화 + 폴백)
**What:** INotificationChannel 인터페이스로 채널을 추상화하고, priority 순으로 전송 시도. 실패 시 다음 채널로 폴백.
**When to use:** 모든 보안 이벤트 알림 (NOTIFY 티어, Kill Switch, 자동 정지 등)
**Example:**
```typescript
// Source: Domain pattern for multi-channel notification
interface INotificationChannel {
  readonly type: 'TELEGRAM' | 'DISCORD' | 'NTFY'
  send(message: NotificationMessage): Promise<NotificationResult>
  healthCheck(): Promise<boolean>
}

interface NotificationResult {
  success: boolean
  channelId: string
  error?: string
  retryAfter?: number  // Discord rate limit
}

class NotificationService {
  private channels: INotificationChannel[] // priority 순 정렬

  async notify(message: NotificationMessage): Promise<void> {
    let delivered = false
    for (const channel of this.channels) {
      if (!channel.enabled) continue
      const result = await channel.send(message)
      if (result.success) {
        delivered = true
        await this.recordSuccess(channel)
        break // 첫 성공 시 중단
      }
      await this.recordFailure(channel, result.error)
      // 폴백: 다음 채널 시도
    }
    if (!delivered) {
      // 모든 채널 실패 → audit_log critical
      await this.recordAllChannelsFailed(message)
    }
  }
}
```

### Pattern 3: TOCTOU-Safe State Transition (원자적 상태 전이)
**What:** 정책 평가와 상태 변경을 `BEGIN IMMEDIATE` 트랜잭션 내에서 원자적으로 수행하여 TOCTOU 취약점 방지.
**When to use:** DELAY 티어 쿨다운 만료 시 실행, APPROVAL 티어 승인 시 실행, Kill Switch 일괄 취소
**Example:**
```typescript
// Source: SQLite BEGIN IMMEDIATE + Phase 7 validateTransition()
function executeDelayedTransaction(
  sqlite: Database,
  txId: string,
): void {
  // better-sqlite3 transaction().immediate() = BEGIN IMMEDIATE
  sqlite.transaction(() => {
    // 1. 현재 상태 확인 (SELECT FOR UPDATE 역할)
    const tx = sqlite.prepare(
      'SELECT status, tier, queued_at FROM transactions WHERE id = ?'
    ).get(txId)

    // 2. 상태 검증 (TOCTOU 방지: 읽기와 쓰기가 같은 트랜잭션)
    if (tx.status !== 'QUEUED') throw new Error('Already processed')
    if (tx.tier !== 'DELAY') throw new Error('Not a DELAY transaction')

    // 3. 쿨다운 확인
    const cooldownExpired = Date.now() / 1000 - tx.queued_at >= delaySeconds
    if (!cooldownExpired) throw new Error('Cooldown not expired')

    // 4. 상태 전이 (원자적)
    sqlite.prepare(
      'UPDATE transactions SET status = ? WHERE id = ? AND status = ?'
    ).run('EXECUTING', txId, 'QUEUED')
    // WHERE status = 'QUEUED' 조건으로 이중 실행 방지
  }).immediate()
}
```

### Pattern 4: Kill Switch Cascade (캐스케이드 비상 정지)
**What:** Kill Switch 발동 시 정해진 순서로 시스템 전체를 안전하게 정지시키는 캐스케이드 프로토콜.
**When to use:** Owner 수동 발동, 자동 정지 규칙 트리거
**Example:**
```typescript
// Source: Phase 6 CORE-05 10-step shutdown cascade + emergency recovery pattern
async function executeKillSwitch(
  db: DrizzleInstance,
  sqlite: Database,
  keyStore: ILocalKeyStore,
  notificationService: NotificationService,
  reason: string,
): Promise<KillSwitchResult> {
  const timestamp = new Date()

  // Step 1: 모든 활성 세션 즉시 폐기
  await db.update(sessions)
    .set({ revokedAt: timestamp })
    .where(isNull(sessions.revokedAt))

  // Step 2: 모든 QUEUED 거래 취소
  sqlite.transaction(() => {
    sqlite.prepare(
      `UPDATE transactions SET status = 'CANCELLED', error = 'KILL_SWITCH'
       WHERE status IN ('PENDING', 'QUEUED')`
    ).run()
  }).immediate()

  // Step 3: 모든 에이전트 SUSPENDED
  await db.update(agents)
    .set({ status: 'SUSPENDED', suspendedAt: timestamp, suspensionReason: reason })
    .where(ne(agents.status, 'TERMINATED'))

  // Step 4: 키스토어 잠금 (개인키 메모리 제거)
  await keyStore.lock()

  // Step 5: 모든 채널로 긴급 알림
  await notificationService.notify({
    level: 'CRITICAL',
    title: 'Kill Switch Activated',
    body: `Reason: ${reason}\nAll sessions revoked, all pending transactions cancelled.`,
  })

  // Step 6: audit_log
  await insertAuditLog(db, {
    eventType: 'KILL_SWITCH_ACTIVATED',
    actor: 'owner',
    details: { reason, sessionsRevoked: true, txCancelled: true },
    severity: 'critical',
  })

  return { success: true, timestamp }
}
```

### Anti-Patterns to Avoid
- **Channel-specific logic in service layer:** 알림 채널별 HTTP 호출 세부사항을 서비스 레이어에 직접 작성하지 말 것. INotificationChannel 인터페이스로 추상화.
- **Polling-based approval without timeout:** APPROVAL 티어의 Owner 승인 대기에서 무한 대기하지 말 것. 반드시 타임아웃(기본 1시간) 후 EXPIRED 전이.
- **Kill Switch without audit:** Kill Switch 실행 결과를 audit_log에 기록하지 않으면 사후 분석 불가.
- **Policy evaluation outside transaction:** 정책 평가 결과와 상태 변경 사이에 gap이 있으면 TOCTOU 취약. 반드시 같은 SQLite 트랜잭션 내에서 수행.
- **Notification blocking pipeline:** 알림 전송이 거래 파이프라인을 블로킹하지 않도록. NOTIFY 티어는 거래 실행 후 비동기 알림.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WalletConnect v2 세션 관리 | 커스텀 WebSocket relay | `@reown/walletkit` + WalletConnect relay | Relay 프로토콜 암호화, 세션 페어링, 프로토콜 버전 관리 등 복잡도 |
| SIWS/SIWE 서명 검증 | 직접 nacl.sign.detached.verify 호출 | `@web3auth/sign-in-with-solana`, `siwe` | 메시지 포맷, nonce 검증, 도메인 바인딩 등 스펙 준수 필요 |
| EVM 트랜잭션 빌드/서명 | 직접 RLP 인코딩 | `viem` | Gas estimation, EIP-1559, chain ID 검증, 타입 안전성 |
| HTTP retry with backoff | setTimeout 루프 | 간단한 유틸리티 함수 (단, 외부 라이브러리 불필요) | 3채널 알림 정도면 단순 for-loop + delay면 충분 |
| QR 코드 생성 (WalletConnect URI) | canvas 직접 그리기 | `qrcode` npm 또는 Reown AppKit 내장 | AppKit 모달에 QR 자동 포함 |

**Key insight:** Phase 8의 알림 채널들(Telegram/Discord/ntfy.sh)은 모두 단순 HTTP POST이므로 외부 라이브러리 없이 native fetch로 충분하다. 복잡한 Bot 프레임워크는 불필요한 의존성만 추가한다.

## Common Pitfalls

### Pitfall 1: TOCTOU in Policy-to-Execution Gap
**What goes wrong:** 정책 엔진이 INSTANT으로 분류한 직후, 다른 세션에서 동일 에이전트로 거래를 동시 요청하면 누적 한도를 초과할 수 있다.
**Why it happens:** 정책 평가(Stage 3)와 usageStats 갱신(Stage 6 CONFIRMED) 사이에 시간 gap 존재.
**How to avoid:** (1) 정책 평가 시 `BEGIN IMMEDIATE` 트랜잭션 내에서 현재 usageStats를 읽고 "예약량(reserved)"을 즉시 기록. (2) CONFIRMED 시 예약량을 실제 사용량으로 전환. (3) FAILED/CANCELLED 시 예약량 롤백.
**Warning signs:** 동일 에이전트의 동시 거래 요청에서 한도 초과 거래가 통과됨.

### Pitfall 2: WalletConnect Relay Dependency
**What goes wrong:** WalletConnect relay 서버(`wss://relay.walletconnect.com`)가 다운되면 Owner 승인이 불가능해진다.
**Why it happens:** Self-hosted 데몬이지만 WalletConnect는 외부 relay에 의존.
**How to avoid:** (1) APPROVAL 티어에 반드시 타임아웃 설정 (기본 1시간). relay 장애 시 EXPIRED로 안전 전이. (2) Kill Switch는 WalletConnect 없이도 동작해야 함 (로컬 CLI `waiaas kill-switch`로 직접 발동 가능). (3) SIWS/SIWE 서명은 relay 불필요 (HTTP POST로 직접 전달).
**Warning signs:** Owner 승인 요청 후 응답 없이 장기간 대기.

### Pitfall 3: Notification Channel Rate Limiting
**What goes wrong:** Kill Switch나 대량 알림 시 Telegram/Discord rate limit에 걸려 알림이 누락된다.
**Why it happens:** Telegram Bot API는 초당 30메시지 제한, Discord Webhook은 5/5초 제한.
**How to avoid:** (1) 알림 서비스에 rate limiter 내장 (채널별 속도 제한 준수). (2) Kill Switch 등 critical 알림은 모든 채널에 동시 전송 (첫 성공이 아니라 전체 전송). (3) 알림 큐에 deduplication (동일 이벤트 중복 발송 방지).
**Warning signs:** audit_log에 `NOTIFICATION_FAILED` 이벤트 빈발.

### Pitfall 4: Tauri WebView의 Browser Extension 미지원
**What goes wrong:** Tauri 2 WebView에서 Phantom/Backpack 등 브라우저 익스텐션이 동작하지 않는다.
**Why it happens:** Tauri는 시스템 네이티브 WebView(WKWebView/WebView2/WebKitGTK)를 사용하며, Chrome Extension API를 지원하지 않는다.
**How to avoid:** (1) Owner 지갑 연결은 반드시 WalletConnect v2 QR 방식으로 설계. (2) Tauri WebView에서 Reown AppKit 모달을 띄우면 QR 코드가 표시되고, 모바일 지갑(Phantom 모바일 등)으로 스캔. (3) 향후 Phantom Embedded SDK (`@phantom/browser-sdk`)를 대안으로 검토 가능하나, 현재 체인 무관 설계 원칙에 따라 AppKit 우선.
**Warning signs:** Desktop 테스트에서 `window.solana` 또는 `window.ethereum` undefined.

### Pitfall 5: Kill Switch Recovery Without Proper Authentication
**What goes wrong:** Kill Switch 복구 절차가 너무 느슨하면 공격자가 재활성화할 수 있고, 너무 엄격하면 정당한 Owner가 복구할 수 없다.
**Why it happens:** 비상 상황에서 키스토어가 잠겨있으므로 일반적인 인증 경로가 작동하지 않을 수 있다.
**How to avoid:** (1) 복구는 반드시 Owner 지갑 서명(SIWS/SIWE) + 마스터 패스워드 이중 인증. (2) 복구 시 키스토어 재잠금 해제(마스터 패스워드) 필수. (3) 복구 후 모든 이전 세션은 여전히 폐기 상태 유지 (새 세션 필요). (4) 복구 이벤트도 audit_log critical로 기록.
**Warning signs:** Kill Switch 발동 후 Owner가 시스템에 접근할 수 없는 상태.

### Pitfall 6: DELAY 티어 Blockhash 만료
**What goes wrong:** DELAY 티어에서 쿨다운 대기(5분~) 중에 Solana blockhash가 만료되어 이전에 빌드한 트랜잭션을 사용할 수 없다.
**Why it happens:** Solana blockhash 수명은 ~60초. 5분 대기 후에는 반드시 새 blockhash가 필요.
**How to avoid:** (1) DELAY/APPROVAL 티어는 Stage 4에서 QUEUED로 전이하고 트랜잭션은 빌드하지 않음. (2) 쿨다운 만료 또는 Owner 승인 시점에 Stage 5a (buildTransaction)부터 재실행. Phase 7 TX-PIPE에서 이미 이 설계 결정이 반영되어 있음.
**Warning signs:** DELAY 티어 실행 시 `BLOCKHASH_EXPIRED` 오류.

## Code Examples

### Telegram Bot API sendMessage
```typescript
// Source: https://core.telegram.org/bots/api#sendmessage
// 외부 라이브러리 없이 native fetch 사용

class TelegramChannel implements INotificationChannel {
  readonly type = 'TELEGRAM' as const

  constructor(
    private botToken: string,
    private chatId: string,
  ) {}

  async send(message: NotificationMessage): Promise<NotificationResult> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: this.formatMessage(message),
        parse_mode: 'MarkdownV2',
      }),
      signal: AbortSignal.timeout(10_000), // 10초 타임아웃
    })

    const data = await response.json()
    return {
      success: data.ok === true,
      channelId: this.chatId,
      error: data.ok ? undefined : data.description,
    }
  }

  async healthCheck(): Promise<boolean> {
    const url = `https://api.telegram.org/bot${this.botToken}/getMe`
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    const data = await response.json()
    return data.ok === true
  }
}
```

### Discord Webhook sendMessage
```typescript
// Source: https://discord.com/developers/docs/resources/webhook#execute-webhook
// Discord Webhook은 인증 불필요 (URL 자체가 시크릿)

class DiscordChannel implements INotificationChannel {
  readonly type = 'DISCORD' as const

  constructor(private webhookUrl: string) {}

  async send(message: NotificationMessage): Promise<NotificationResult> {
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'WAIaaS Security',
        content: this.formatMessage(message),
        // embeds 사용 가능 (rich message)
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (response.status === 429) {
      // Discord rate limit
      const retryAfter = parseFloat(response.headers.get('retry-after') ?? '5')
      return { success: false, channelId: 'discord', retryAfter }
    }

    return {
      success: response.status === 204 || response.status === 200,
      channelId: 'discord',
      error: response.ok ? undefined : `HTTP ${response.status}`,
    }
  }
}
```

### ntfy.sh Push
```typescript
// Source: https://docs.ntfy.sh/publish/
// ntfy.sh는 가장 단순한 API -- topic URL에 POST body = 메시지

class NtfyChannel implements INotificationChannel {
  readonly type = 'NTFY' as const

  constructor(
    private serverUrl: string, // 'https://ntfy.sh' 또는 self-hosted URL
    private topic: string,
  ) {}

  async send(message: NotificationMessage): Promise<NotificationResult> {
    const url = `${this.serverUrl}/${this.topic}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Title': message.title,
        'Priority': this.mapPriority(message.level), // '5'=urgent, '3'=default
        'Tags': message.level === 'CRITICAL' ? 'rotating_light,skull' : 'warning',
      },
      body: message.body,
      signal: AbortSignal.timeout(10_000),
    })

    return {
      success: response.ok,
      channelId: this.topic,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    }
  }

  private mapPriority(level: string): string {
    switch (level) {
      case 'CRITICAL': return '5' // urgent
      case 'WARNING': return '4'  // high
      case 'INFO': return '3'     // default
      default: return '3'
    }
  }
}
```

### Owner Wallet Connection via WalletConnect v2
```typescript
// Source: https://docs.reown.com/advanced/api/sign/wallet-usage
// 데몬 사이드: WalletKit으로 세션 제안 수신 및 처리

import { Core } from '@walletconnect/core'
import { WalletKit } from '@reown/walletkit'

// 1. 초기화 (데몬 시작 시)
const core = new Core({
  projectId: config.walletConnect.projectId,
})

const walletKit = await WalletKit.init({
  core,
  metadata: {
    name: 'WAIaaS Daemon',
    description: 'Self-Hosted Wallet-as-a-Service',
    url: 'http://127.0.0.1:3100',
    icons: [],
  },
})

// 2. 세션 제안 처리 (Owner가 QR 스캔 시)
walletKit.on('session_proposal', async (proposal) => {
  const { requiredNamespaces } = proposal.params
  // Owner 지갑의 체인/메서드 확인
  const approvedNamespaces = buildApprovedNamespaces({
    proposal: proposal.params,
    supportedNamespaces: {
      solana: {
        chains: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'], // mainnet
        methods: ['solana_signMessage'],
        events: [],
        accounts: [`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${ownerPublicKey}`],
      },
    },
  })

  await walletKit.approveSession({
    id: proposal.id,
    namespaces: approvedNamespaces,
  })
})
```

### ownerAuth 미들웨어 패턴
```typescript
// Source: Phase 7 SESS-PROTO owner-verifier 유틸리티 재사용
// ownerAuth는 라우트 레벨 미들웨어 (Phase 7 결정)

import { verifySIWS, verifySIWE } from '../auth/owner-verifier.js'

async function ownerAuth(c: Context, next: Next): Promise<void> {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new WaiaasError('UNAUTHORIZED', 'Owner signature required', 401)
  }

  const token = authHeader.slice(7)

  // SIWS 또는 SIWE 서명 검증
  // 서명 메시지에는 action + timestamp + nonce 포함
  const payload = JSON.parse(
    Buffer.from(token.split('.')[0], 'base64url').toString()
  )

  const isValid = payload.chain === 'solana'
    ? await verifySIWS(payload)
    : await verifySIWE(payload)

  if (!isValid) {
    throw new WaiaasError('INVALID_SIGNATURE', 'Owner signature verification failed', 401)
  }

  // 에이전트의 ownerAddress와 서명자 주소 매칭 확인
  const agent = await getAgent(c.get('db'), payload.agentId)
  if (agent.ownerAddress !== payload.address) {
    throw new WaiaasError('OWNER_MISMATCH', 'Signer is not the owner', 403)
  }

  c.set('ownerAddress', payload.address)
  await next()
}
```

### EVM Adapter Stub (viem 기반)
```typescript
// Source: https://viem.sh/docs/getting-started
// CHAIN-03: IChainAdapter 인터페이스 준수 스텁

import { createPublicClient, createWalletClient, http } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import type { IChainAdapter, TransactionResult } from '@waiaas/core'

class EvmAdapterStub implements IChainAdapter {
  readonly chain = 'ethereum'

  async connect(config: AdapterConfig): Promise<void> {
    // v0.3에서 구현 예정
    throw new Error('EVM adapter not yet implemented (v0.3)')
  }

  async getBalance(address: string): Promise<string> {
    throw new Error('EVM adapter not yet implemented (v0.3)')
  }

  async buildTransaction(params: TxParams): Promise<unknown> {
    throw new Error('EVM adapter not yet implemented (v0.3)')
  }

  async simulateTransaction(tx: unknown): Promise<SimulationResult> {
    throw new Error('EVM adapter not yet implemented (v0.3)')
  }

  async signTransaction(tx: unknown, privateKey: Uint8Array): Promise<unknown> {
    throw new Error('EVM adapter not yet implemented (v0.3)')
  }

  async submitTransaction(signedTx: unknown): Promise<SubmitResult> {
    throw new Error('EVM adapter not yet implemented (v0.3)')
  }

  async waitForConfirmation(txHash: string, timeoutMs: number): Promise<ConfirmResult> {
    throw new Error('EVM adapter not yet implemented (v0.3)')
  }

  // ... 나머지 IChainAdapter 메서드들도 동일하게 stub
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@walletconnect/web3wallet` | `@reown/walletkit` v1.5.0 | 2024-09 (rebrand), 2025-02-17 (EOL) | 패키지명 변경, API는 호환. 반드시 마이그레이션 필요 |
| `@web3modal/*` | `@reown/appkit-*` | 2024-09 | 프론트엔드 모달도 Reown AppKit으로 이전 |
| `ethers.js` v6 | `viem` v2.45.x | 2023~ progressive | TypeScript 타입 추론, tree-shaking, 번들 크기 우월 |
| WalletConnect v1 | WalletConnect v2 (Sign Protocol) | 2023 | 완전히 다른 프로토콜. v1은 더 이상 작동하지 않음 |
| 단순 signMessage | SIWS/SIWE 표준 | 2023-2024 | 도메인 바인딩, nonce, 만료 시간 등 보안 강화 |
| 자체 Push 서비스 | ntfy.sh (self-hosted 가능) | 2022~ | HTTP PUT/POST만으로 push 알림. iOS/Android 앱 제공 |

**Deprecated/outdated:**
- `@walletconnect/web3wallet`: 2025-02-17 이후 업데이트 중단. `@reown/walletkit`으로 마이그레이션 필수
- `@web3modal/ethereum`, `@web3modal/react`: `@reown/appkit-*`으로 마이그레이션 필수
- `@walletconnect/sign-client`: 직접 사용 가능하나 WalletKit이 더 높은 수준의 추상화 제공
- `node-telegram-bot-api`: 기능은 동작하지만 WAIaaS는 sendMessage만 사용하므로 불필요

## Open Questions

1. **WalletConnect projectId 관리**
   - What we know: Reown Cloud에서 무료 projectId 발급 가능. 사용량 제한 있음.
   - What's unclear: Self-hosted 데몬에서 projectId를 config.toml에 저장하는 것이 적절한지, 아니면 사용자가 직접 발급받아야 하는지.
   - Recommendation: config.toml `[walletconnect]` 섹션에 projectId 설정. 기본값 없이 사용자가 직접 Reown Cloud에서 발급. `waiaas init` 시 안내 메시지 출력.

2. **Owner 지갑 연결의 UI 레이어**
   - What we know: Phase 8은 DESIGN 마일스톤이므로 프로토콜/플로우만 설계. 실제 UI는 Phase 9 (Tauri).
   - What's unclear: Tauri WebView에서 Reown AppKit 모달이 정상 동작하는지 검증 필요.
   - Recommendation: Phase 8에서는 시퀀스 다이어그램 + API 스펙만 정의. Tauri 통합은 Phase 9로 이연. CLI `waiaas owner connect` 커맨드로 QR 코드 터미널 출력도 대안으로 설계.

3. **알림 채널 설정 저장 보안**
   - What we know: Telegram Bot Token, Discord Webhook URL은 시크릿. notification_channels 테이블 config JSON에 저장.
   - What's unclear: config JSON의 시크릿을 암호화할지, 평문 저장할지.
   - Recommendation: config.toml 저장이 아닌 DB 저장이므로, 키스토어와 동일한 AES-256-GCM으로 암호화 저장 고려. 단, Phase 8은 설계만 하고 구현 복잡도는 v0.3으로 이연 가능. 우선은 평문 + 파일 권한 600으로 시작하되, 암호화 마이그레이션 경로를 문서화.

4. **EVM Adapter의 SIWE 기반 Owner 인증 상세**
   - What we know: SIWE(EIP-4361) 라이브러리 `siwe` v3.x 이미 도입. EVM Owner 서명 검증 가능.
   - What's unclear: EVM Adapter가 stub인 상태에서 EVM Owner가 에이전트를 관리하는 플로우가 의미있는지.
   - Recommendation: Phase 8에서는 SIWE 검증 로직만 설계하고, EVM-specific 플로우는 v0.3 (EVM Adapter 본구현) 시 상세화. ownerAuth 미들웨어가 chain 필드로 SIWS/SIWE를 분기하는 구조만 확정.

5. **자동 정지 규칙의 기본 세트 범위**
   - What we know: 연속 실패, 비정상 시간대, 한도 임계 등이 요구사항에 명시됨.
   - What's unclear: 기본 규칙 세트의 정확한 threshold 값들.
   - Recommendation: 보수적 기본값으로 설계. 연속 실패 3회, 시간대 제한 OFF (사용자 설정), 일일 한도 80% 경고 / 100% 정지. 모든 threshold는 policies 테이블에서 설정 가능하도록.

## Sources

### Primary (HIGH confidence)
- [Reown Deprecation Docs](https://docs.reown.com/advanced/walletconnect-deprecations) - WalletConnect -> Reown 마이그레이션 패키지 매핑 확인
- [Reown WalletKit npm](https://www.npmjs.com/package/@reown/walletkit) - v1.5.0 확인, 13일 전 배포
- [ntfy.sh Official Docs](https://docs.ntfy.sh/publish/) - HTTP API 전체 스펙 (URL, headers, priority, actions)
- [Telegram Bot API](https://core.telegram.org/bots/api) - sendMessage 파라미터, 응답 형식
- [viem Official Docs](https://viem.sh/) - v2.45.1, Wallet Client, signMessage, signTypedData
- [SIWS Official Docs](https://siws.web3auth.io/verify) - 서버 사이드 서명 검증 패턴

### Secondary (MEDIUM confidence)
- [Reown AppKit Docs](https://docs.reown.com/appkit/overview) - AppKit 개요, 지원 프레임워크
- [Solana Wallet Adapter GitHub](https://github.com/anza-xyz/wallet-adapter) - @solana/wallet-adapter-base v0.9.27
- [Discord Webhook Guide](https://inventivehq.com/blog/discord-webhooks-guide) - Webhook API, rate limiting, embeds
- [Wikipedia TOCTOU](https://en.wikipedia.org/wiki/Time-of-check_to_time-of-use) - TOCTOU 정의, 데이터베이스 컨텍스트
- [Martin Fowler Rules Engine](https://martinfowler.com/bliki/RulesEngine.html) - 규칙 엔진 설계 원칙
- [Tauri Localhost Plugin](https://v2.tauri.app/plugin/localhost/) - Tauri WebView 제약사항

### Tertiary (LOW confidence)
- [Tauri Discussion #2685](https://github.com/tauri-apps/tauri/discussions/2685) - WebView에서 브라우저 확장 미지원 확인 (커뮤니티)
- [Medium: Building Rule Engine TypeScript](https://benjamin-ayangbola.medium.com/building-a-rule-engine-with-typescript-1732d891385c) - TypeScript 규칙 엔진 패턴 (단일 블로그)

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - Reown/WalletKit은 공식 문서 확인, 알림 API는 공식 문서 확인. Tauri + WalletConnect 통합 패턴은 공식 문서 부재
- Architecture: MEDIUM - 정책 엔진, 알림 추상화, Kill Switch 패턴은 도메인 추론 + Phase 6-7 설계 패턴 계승
- Pitfalls: HIGH - TOCTOU, blockhash 만료, rate limiting은 Phase 6-7에서 이미 식별된 패턴. Tauri WebView 제약은 공식 문서 확인

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (30 days, 라이브러리 버전은 안정적)
