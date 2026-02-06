# Telegram 인터랙티브 봇 + Docker 배포 스펙 (TGBOT-DOCK)

**문서 ID:** TGBOT-DOCK
**작성일:** 2026-02-05
**상태:** 완료
**참조:** API-SPEC (37-rest-api-complete-spec.md), NOTI-ARCH (35-notification-architecture.md), OWNR-CONN (34-owner-wallet-connection.md), KILL-AUTO-EVM (36-killswitch-autostop-evm.md), CORE-05 (28-daemon-lifecycle-cli.md), CORE-01 (24-monorepo-data-directory.md)
**요구사항:** TGBOT-01 (인라인 키보드 거래 승인/거부), TGBOT-02 (봇 명령어), DOCK-01 (Docker 이미지 + docker-compose)

---

## 1. 문서 개요

### 1.1 목적

WAIaaS의 Telegram 인터랙티브 봇과 Docker 배포 스펙을 구현 가능한 수준으로 설계한다. Telegram Bot은 Owner가 모바일에서 WAIaaS를 관리하는 채널이며, Docker는 CLI 사용자를 위한 간편 배포 경로를 제공한다.

이 문서는 두 가지 독립적이지만 밀접한 주제를 다룬다:

1. **Telegram 인터랙티브 봇** (섹션 2-7): Long Polling 아키텍처, 8개 명령어, 인라인 키보드 거래 승인/거부, 2-Tier 인증 모델
2. **Docker 배포 스펙** (섹션 8-15): Multi-stage Dockerfile, docker-compose, named volume, Docker Secrets, 보안 고려사항

### 1.2 요구사항 매핑

| 요구사항 | 설명 | 충족 섹션 |
|---------|------|-----------|
| TGBOT-01 | 인라인 키보드 거래 승인/거부 | 섹션 5 (인라인 키보드) + 섹션 6 (2-Tier 인증) |
| TGBOT-02 | 봇 명령어 체계 (관리 + 조회) | 섹션 4 (8개 명령어) |
| DOCK-01 | Docker 이미지 + docker-compose | 섹션 8-9 (Dockerfile + docker-compose) |

### 1.3 v0.1 -> v0.2 핵심 변경

| 항목 | v0.1 (Cloud) | v0.2 (Self-Hosted) | 근거 |
|------|-------------|-------------------|------|
| Telegram 알림 | Webhook 수신 서버 | **Long Polling** (getUpdates) | Self-Hosted에 외부 Webhook URL 불필요 |
| 봇 프레임워크 | telegraf/grammY 검토 | **native fetch 전용** | Phase 8 NOTI-ARCH 결정: 외부 Bot 프레임워크 불필요 |
| 거래 승인 | API Key 기반 직접 승인 | **2-Tier 모델** (chatId + ownerAuth) | Telegram에서 지갑 서명 불가 |
| Docker | Cloud 배포 (ECS/Fargate) | **docker-compose + named volume** | Self-Hosted 로컬/서버 단일 컨테이너 |
| 시크릿 | AWS Secrets Manager | **Docker Secrets + `_FILE` 패턴** | 중앙 서버 미사용 |

### 1.4 참조 문서 관계

```
┌──────────────────────────────────────────────────────────────┐
│  NOTI-ARCH (35-notification-architecture.md)                  │
│  TelegramChannel: 알림 전송 전용 (sendMessage)                │
│  INotificationChannel 인터페이스 구현                          │
└──────────────┬───────────────────────────────────────────────┘
               │ 확장
               ▼
┌──────────────────────────────────────────────────────────────┐
│  TGBOT-DOCK (40-telegram-bot-docker.md) <-- 이 문서           │
│  TelegramBotService: 알림 수신 + 명령 처리 + 인라인 키보드     │
│  Docker: Dockerfile + docker-compose + named volume + secrets │
└──────────────┬──────────────┬────────────────────────────────┘
               │              │
               ▼              ▼
┌────────────────┐  ┌──────────────────────┐
│  API-SPEC      │  │  OWNR-CONN           │
│  Owner API     │  │  ownerAuth 인증 모델  │
│  31 endpoints  │  │  2-Tier 인증 갭 해결   │
└────────────────┘  └──────────────────────┘
```

---

## 2. TelegramBotService 아키텍처

### 2.1 서비스 위치 및 역할

```
packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts
```

TelegramBotService는 NOTI-ARCH에서 정의한 `TelegramChannel` (알림 발송 전용)을 확장하여 **명령 수신 + 인터랙션 처리** 기능을 추가한다.

| 기능 | 담당 클래스 | 설명 |
|------|-----------|------|
| 알림 발송 | `TelegramChannel` (NOTI-ARCH) | `INotificationChannel.send()` 구현, 단방향 푸시 |
| 명령 수신 | `TelegramBotService` (이 문서) | Long Polling + Command Handler, 양방향 인터랙션 |

### 2.2 클래스 구조

```typescript
// packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts

import type { TelegramChannel } from '../notifications/telegram-channel.js'

/**
 * Telegram Bot 인터랙티브 서비스.
 * Long Polling으로 Owner 명령을 수신하고, 인라인 키보드를 통한 거래 승인/거부를 처리한다.
 *
 * TelegramChannel (NOTI-ARCH)을 내부적으로 참조하여 알림 발송 + 명령 수신을 통합 관리한다.
 */
export class TelegramBotService {
  private readonly botToken: string
  private readonly baseUrl: string
  private readonly ownerChatId: string
  private running = false
  private offset = 0

  // 서비스 의존성 (DI)
  private readonly sessionService: SessionService
  private readonly transactionService: TransactionService
  private readonly killSwitchService: KillSwitchService
  private readonly healthService: HealthService
  private readonly notificationChannel: TelegramChannel  // NOTI-ARCH 알림 발송 재사용

  // Command Handler Registry
  private readonly commandHandlers: Map<string, CommandHandler>

  // Auth code store (for /auth command)
  private readonly authCodes: Map<string, { chatId: string; expiresAt: number }>

  constructor(config: TelegramBotConfig, services: ServiceDependencies) {
    this.botToken = config.botToken
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`
    this.ownerChatId = config.ownerChatId
    // ... service injection
    this.commandHandlers = this.registerCommands()
  }

  /** 봇 시작 -- Long Polling 루프 진입 */
  async start(): Promise<void> { /* 섹션 3 상세 */ }

  /** 봇 정지 -- Graceful shutdown */
  async stop(): Promise<void> { /* running = false, 현재 폴링 완료 대기 */ }

  /** 수신한 메시지에서 명령어 추출 + 핸들러 실행 */
  private async handleCommand(message: TelegramMessage): Promise<void> { /* 섹션 4 상세 */ }

  /** 인라인 키보드 콜백 쿼리 처리 */
  private async handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> { /* 섹션 5 상세 */ }

  /** 등록된 Owner chatId 검증 */
  private isAuthorizedOwner(chatId: number): boolean {
    return String(chatId) === this.ownerChatId
  }
}
```

### 2.3 서비스 구조 다이어그램

```
TelegramBotService
├── Long Polling Loop (getUpdates)
│   ├── offset 관리 (마지막 update_id + 1)
│   ├── timeout 30초 (Telegram long poll)
│   └── 에러 핸들링 (재시도 + 백오프)
├── Command Handler Registry
│   ├── /start  -> 소개 메시지
│   ├── /auth   -> chatId 등록 플로우
│   ├── /status -> 시스템 상태 요약
│   ├── /sessions -> 활성 세션 목록
│   ├── /revoke -> 세션 폐기
│   ├── /killswitch -> Kill Switch 발동
│   ├── /pending -> 대기 거래 목록
│   └── /help   -> 명령어 안내
├── Callback Query Handler
│   ├── approve:{txId} -> 거래 사전 승인 (Tier 1)
│   ├── reject:{txId}  -> 거래 거부
│   ├── revoke:{sessionId} -> 세션 폐기
│   ├── killswitch_confirm -> Kill Switch 확인
│   └── killswitch_cancel  -> Kill Switch 취소
├── Message Formatter (MarkdownV2)
│   └── TelegramChannel.formatMessage() 재사용
└── TelegramNotificationChannel (NOTI-ARCH 구현)
    └── 승인 요청 시 인라인 키보드 첨부 알림 발송
```

### 2.4 TelegramBotService와 TelegramChannel의 관계

```
┌─────────────────────────────────────────────────────────┐
│  TelegramBotService                                      │
│                                                          │
│  ┌────────────────────────┐  ┌────────────────────────┐ │
│  │ Long Polling (수신)     │  │ TelegramChannel (발송)  │ │
│  │ getUpdates -> 핸들링    │  │ INotificationChannel    │ │
│  │ 명령어 파싱 + 실행      │  │ send() -> sendMessage   │ │
│  │ 콜백 쿼리 처리          │  │ healthCheck() -> getMe  │ │
│  └────────────────────────┘  └────────────────────────┘ │
│                                                          │
│  공통: botToken, chatId, baseUrl, MarkdownV2 포맷터      │
└─────────────────────────────────────────────────────────┘
```

- `TelegramChannel`: NOTI-ARCH에서 정의. `INotificationChannel` 인터페이스 구현. **알림 발송 전용.**
- `TelegramBotService`: 이 문서에서 정의. `TelegramChannel`을 내부적으로 참조하면서, **명령 수신 + 인터랙션** 기능을 추가.
- 알림 발송 시 인라인 키보드 첨부가 필요하면 `TelegramBotService`가 `sendMessage`를 직접 호출 (reply_markup 파라미터 포함).
- 일반 알림 (키보드 불필요)은 `TelegramChannel.send()`로 위임.

### 2.5 TelegramBotConfig 타입

```typescript
// packages/core/src/schemas/config.schema.ts (확장)

const TelegramBotConfigSchema = z.object({
  /** 봇 활성화 여부 */
  enabled: z.boolean().default(false),
  /** BotFather에서 발급한 Bot Token */
  bot_token: z.string().default(''),
  /** 등록된 Owner chat ID (자동 등록 via /auth) */
  owner_chat_id: z.string().default(''),
  /** Telegram에서 소액 거래 직접 승인 허용 */
  direct_approve_enabled: z.boolean().default(false),
  /** 직접 승인 허용 임계값 (SOL 단위, 문자열) */
  direct_approve_threshold: z.string().default('0'),
})

// config.toml [telegram_bot] 섹션
```

```toml
# ~/.waiaas/config.toml

[telegram_bot]
enabled = false                    # 봇 활성화 (기본: 비활성)
bot_token = ""                     # BotFather에서 발급 (환경변수: WAIAAS_TELEGRAM_BOT_TOKEN)
owner_chat_id = ""                 # /auth 명령으로 자동 등록
direct_approve_enabled = false     # 소액 Telegram 직접 승인 (기본: 비활성)
direct_approve_threshold = "0"     # 직접 승인 임계값 (SOL 단위)
```

---

## 3. Long Polling 설계

### 3.1 Telegram Bot API getUpdates

Long Polling은 Telegram Bot API의 `getUpdates` 메서드를 사용하여 새 업데이트를 가져오는 방식이다. Webhook과 달리 외부에서 접근 가능한 URL이 필요 없어 Self-Hosted 환경에 적합하다.

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| `offset` | 마지막 `update_id + 1` | 이미 처리한 업데이트 건너뛰기 |
| `timeout` | `30` (초) | Long poll 대기 시간 (0 = short poll) |
| `allowed_updates` | `['message', 'callback_query']` | 수신할 업데이트 타입 제한 |
| `limit` | `100` (기본값) | 한 번에 가져올 최대 업데이트 수 |

### 3.2 폴링 루프 구현

```typescript
// packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts

async start(): Promise<void> {
  if (!this.botToken || !this.ownerChatId) {
    logger.warn('TelegramBotService: bot_token or owner_chat_id not configured, skipping')
    return
  }

  this.running = true
  logger.info('TelegramBotService: Long Polling started')

  let consecutiveErrors = 0

  while (this.running) {
    try {
      const response = await fetch(`${this.baseUrl}/getUpdates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offset: this.offset,
          timeout: 30,
          allowed_updates: ['message', 'callback_query'],
        }),
        signal: AbortSignal.timeout(35_000), // 30s long poll + 5s 네트워크 마진
      })

      const data = await response.json() as TelegramResponse<TelegramUpdate[]>

      if (!data.ok) {
        throw new Error(`Telegram API error: ${data.description ?? 'unknown'}`)
      }

      consecutiveErrors = 0  // 성공 시 리셋

      for (const update of data.result) {
        try {
          if (update.message?.text?.startsWith('/')) {
            await this.handleCommand(update.message)
          }
          if (update.callback_query) {
            await this.handleCallbackQuery(update.callback_query)
          }
        } catch (handlerError) {
          logger.error('TelegramBotService: handler error', {
            updateId: update.update_id,
            error: handlerError instanceof Error ? handlerError.message : 'unknown',
          })
          // 개별 핸들러 에러는 폴링 루프를 중단하지 않음
        }

        this.offset = update.update_id + 1
      }

    } catch (error) {
      consecutiveErrors++
      const message = error instanceof Error ? error.message : 'unknown'
      logger.error(`TelegramBotService: polling error (${consecutiveErrors}/3)`, { error: message })

      if (consecutiveErrors >= 3) {
        // 3회 연속 실패: 30초 대기 후 재시도
        logger.warn('TelegramBotService: 3 consecutive errors, waiting 30s')
        await this.sleep(30_000)
        consecutiveErrors = 0
      } else {
        // 일반 에러: 5초 대기 후 재시도
        await this.sleep(5_000)
      }
    }
  }

  logger.info('TelegramBotService: Long Polling stopped')
}

async stop(): Promise<void> {
  this.running = false
  // 현재 진행 중인 getUpdates 요청은 timeout 후 자연 종료
  // SIGTERM 수신 시 데몬 graceful shutdown에 의해 호출됨
}

private sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

### 3.3 에러 핸들링 전략

| 상황 | 대응 | 대기 시간 |
|------|------|----------|
| 네트워크 에러 (fetch 실패) | 재시도 | 5초 |
| Telegram API 에러 (ok=false) | 재시도 | 5초 |
| 3회 연속 실패 | 경고 로그 + 긴 대기 | 30초 |
| HTTP 429 (Rate Limit) | Retry-After 값 대기 | 서버 지정 값 |
| 개별 핸들러 에러 | 해당 업데이트 건너뛰기 | 없음 (계속 진행) |
| 데몬 종료 (SIGTERM) | `running = false` | 현재 요청 완료 후 종료 |

### 3.4 데몬 라이프사이클 통합

```
데몬 시작 시:
  Step 6 (BackgroundWorkers) 이후 -> TelegramBotService.start() 비동기 실행
  (폴링 루프는 별도 Promise로 실행, 데몬 시작을 블로킹하지 않음)

데몬 종료 시:
  Step 2 (진행 중 작업 완료) -> TelegramBotService.stop()
  현재 getUpdates 요청의 timeout(30초) 대기 또는 AbortSignal로 즉시 중단
```

### 3.5 Telegram API 타입 정의

```typescript
// packages/daemon/src/infrastructure/telegram/types.ts

/** Telegram API 공통 응답 래퍼 */
interface TelegramResponse<T> {
  ok: boolean
  result: T
  description?: string
  parameters?: {
    retry_after?: number
  }
}

/** Telegram Update 객체 */
interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

/** Telegram Message 객체 */
interface TelegramMessage {
  message_id: number
  from: TelegramUser
  chat: TelegramChat
  date: number
  text?: string
}

/** Telegram Callback Query 객체 */
interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  message?: TelegramMessage
  data?: string  // callback_data (최대 64바이트)
}

/** Telegram User 객체 */
interface TelegramUser {
  id: number       // chat ID (Owner 식별)
  is_bot: boolean
  first_name: string
  username?: string
}

/** Telegram Chat 객체 */
interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
}

/** 인라인 키보드 마크업 */
interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][]
}

/** 인라인 키보드 버튼 */
interface InlineKeyboardButton {
  text: string
  callback_data: string  // 최대 64바이트
}
```

---

## 4. 봇 명령어 체계 (TGBOT-02)

### 4.1 명령어 요약

| # | 명령어 | 동작 | 인증 | Tier |
|---|--------|------|------|------|
| 1 | `/start` | 봇 소개 + 인증 안내 | 없음 | - |
| 2 | `/auth` | chatId 등록 플로우 | 없음 (코드 검증) | - |
| 3 | `/status` | 시스템 상태 요약 | chatId | Tier 1 |
| 4 | `/sessions` | 활성 세션 목록 | chatId | Tier 1 |
| 5 | `/revoke [id]` | 세션 폐기 | chatId | Tier 1 |
| 6 | `/killswitch` | Kill Switch 발동 | chatId + 확인 | Tier 1 |
| 7 | `/pending` | 대기 거래 목록 + 인라인 키보드 | chatId | Tier 1 |
| 8 | `/help` | 명령어 목록 안내 | 없음 | - |

### 4.2 명령어 1: /start

```typescript
// 동작: 봇 소개 메시지 + Owner 인증 안내
async handleStart(message: TelegramMessage): Promise<void> {
  const text = [
    '*WAIaaS Wallet Bot*',
    '',
    'AI 에이전트 지갑 관리를 위한 Telegram 봇입니다\\.',
    '',
    '시작하려면 /auth 명령으로 계정을 연결하세요\\.',
    '',
    '사용 가능한 명령어: /help',
  ].join('\n')

  await this.sendMessage(message.chat.id, text)
}
```

**응답 예시:**

```
*WAIaaS Wallet Bot*

AI 에이전트 지갑 관리를 위한 Telegram 봇입니다.

시작하려면 /auth 명령으로 계정을 연결하세요.

사용 가능한 명령어: /help
```

### 4.3 명령어 2: /auth

**목적:** Owner의 Telegram chatId를 WAIaaS 데몬에 안전하게 등록한다.

**문제:** Telegram Bot API만으로는 "이 chatId가 진짜 Owner인가"를 검증할 수 없다. 누구나 봇에게 `/auth`를 보낼 수 있다.

**해결:** 6자리 인증 코드 기반 교차 검증.

```
┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
│ Telegram App  │    │ WAIaaS 데몬      │    │ Desktop/CLI      │
│ (Owner 모바일)│    │ TelegramBotSvc  │    │ (Owner PC)       │
└──────┬───────┘    └────────┬────────┘    └────────┬─────────┘
       │                     │                      │
       │  /auth              │                      │
       │────────────────────>│                      │
       │                     │ 1. 6자리 코드 생성    │
       │                     │    메모리 저장        │
       │                     │    (5분 TTL)          │
       │  "코드: 847291"     │                      │
       │<────────────────────│                      │
       │                     │                      │
       │                     │   코드 847291 입력    │
       │                     │<─────────────────────│
       │                     │                      │
       │                     │ 2. 코드 매칭 확인     │
       │                     │    chatId 등록        │
       │                     │    config 업데이트     │
       │                     │                      │
       │  "연결 완료!"        │  "연결 완료!"         │
       │<────────────────────│─────────────────────>│
```

```typescript
async handleAuth(message: TelegramMessage): Promise<void> {
  // 이미 등록된 Owner인 경우
  if (this.isAuthorizedOwner(message.from.id)) {
    await this.sendMessage(message.chat.id,
      'Already connected as Owner\\. Use /status to check system state\\.')
    return
  }

  // 6자리 인증 코드 생성
  const code = String(Math.floor(100000 + Math.random() * 900000))

  // 메모리에 5분 TTL로 저장
  this.authCodes.set(code, {
    chatId: String(message.from.id),
    expiresAt: Date.now() + 5 * 60 * 1000,
  })

  // 만료된 코드 정리
  for (const [key, value] of this.authCodes) {
    if (value.expiresAt < Date.now()) {
      this.authCodes.delete(key)
    }
  }

  const text = [
    '*WAIaaS Telegram Authentication*',
    '',
    `Verification code: \`${this.escapeMarkdownV2(code)}\``,
    '',
    'Enter this code in WAIaaS Desktop Settings or CLI:',
    '```',
    `waiaas telegram verify ${code}`,
    '```',
    '',
    '_Code expires in 5 minutes\\._',
  ].join('\n')

  await this.sendMessage(message.chat.id, text)
}

/**
 * Desktop/CLI에서 코드 검증 시 호출되는 내부 메서드.
 * TelegramBotService.verifyAuthCode(code) -> chatId 반환 -> config 저장
 */
verifyAuthCode(code: string): { chatId: string } | null {
  const entry = this.authCodes.get(code)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    this.authCodes.delete(code)
    return null
  }

  this.authCodes.delete(code)
  // config.toml [telegram_bot].owner_chat_id 업데이트
  // notification_channels 테이블에 Telegram 채널 등록/업데이트
  return { chatId: entry.chatId }
}
```

### 4.4 명령어 3: /status

```typescript
async handleStatus(message: TelegramMessage): Promise<void> {
  if (!this.isAuthorizedOwner(message.from.id)) {
    await this.sendUnauthorized(message.chat.id)
    return
  }

  // 내부 서비스 직접 호출 (HTTP 불필요)
  const health = await this.healthService.getHealth()
  const dashboard = await this.dashboardService.getSummary()

  const killSwitchStatus = dashboard.killSwitchStatus ?? 'NORMAL'
  const statusEmoji = killSwitchStatus === 'NORMAL' ? '🟢' : '🔴'

  const text = [
    '*WAIaaS Status*',
    '',
    `State: ${statusEmoji} \`${this.escapeMarkdownV2(killSwitchStatus)}\``,
    `Balance: \`${this.escapeMarkdownV2(dashboard.totalBalance)} SOL\``,
    `Active Sessions: \`${dashboard.activeSessions}\``,
    `Active Agents: \`${dashboard.activeAgents}\``,
    `Pending Approvals: \`${dashboard.pendingApprovals}\``,
    `Uptime: \`${this.escapeMarkdownV2(this.formatUptime(health.uptime))}\``,
    '',
    `_Last updated: ${this.escapeMarkdownV2(new Date().toISOString())}_`,
  ].join('\n')

  await this.sendMessage(message.chat.id, text)
}
```

**응답 예시:**

```
*WAIaaS Status*

State: 🟢 `NORMAL`
Balance: `1.5 SOL`
Active Sessions: `2`
Active Agents: `1`
Pending Approvals: `1`
Uptime: `2h 30m`

_Last updated: 2026-02-05T13:00:00Z_
```

### 4.5 명령어 4: /sessions

```typescript
async handleSessions(message: TelegramMessage): Promise<void> {
  if (!this.isAuthorizedOwner(message.from.id)) {
    await this.sendUnauthorized(message.chat.id)
    return
  }

  const sessions = await this.sessionService.listActive()

  if (sessions.length === 0) {
    await this.sendMessage(message.chat.id, 'No active sessions\\.')
    return
  }

  const lines: string[] = ['*Active Sessions*', '']

  for (const session of sessions) {
    const agentName = this.escapeMarkdownV2(session.agentName ?? session.agentId.slice(0, 8))
    const expiresAt = this.escapeMarkdownV2(
      new Date(session.expiresAt).toLocaleString('en-US', { timeZone: 'UTC' })
    )
    lines.push(`• \`${agentName}\` \\- expires ${expiresAt}`)
  }

  // 각 세션에 Revoke 인라인 버튼
  const keyboard: InlineKeyboardButton[][] = sessions.map(session => [{
    text: `Revoke: ${session.agentName ?? session.agentId.slice(0, 8)}`,
    callback_data: `revoke:${session.id}`,  // revoke: + UUID v7 (36자) = 43자 < 64바이트
  }])

  await this.sendMessageWithKeyboard(message.chat.id, lines.join('\n'), {
    inline_keyboard: keyboard,
  })
}
```

### 4.6 명령어 5: /revoke [sessionId]

```typescript
async handleRevoke(message: TelegramMessage): Promise<void> {
  if (!this.isAuthorizedOwner(message.from.id)) {
    await this.sendUnauthorized(message.chat.id)
    return
  }

  const args = message.text?.split(' ').slice(1) ?? []
  const sessionId = args[0]

  if (!sessionId) {
    // 인자 없이 호출: 세션 목록을 인라인 키보드로 표시
    await this.handleSessions(message)
    return
  }

  try {
    await this.sessionService.revoke(sessionId)
    await this.sendMessage(message.chat.id,
      `Session \`${this.escapeMarkdownV2(sessionId.slice(0, 8))}\\.\\.\\.\` revoked\\.`)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'unknown error'
    await this.sendMessage(message.chat.id,
      `Failed to revoke session: ${this.escapeMarkdownV2(errorMsg)}`)
  }
}
```

### 4.7 명령어 6: /killswitch

Kill Switch는 시스템 전체를 비상 정지하는 중대한 작업이다. 따라서 **확인 단계** (인라인 키보드)를 거친다.

```typescript
async handleKillSwitch(message: TelegramMessage): Promise<void> {
  if (!this.isAuthorizedOwner(message.from.id)) {
    await this.sendUnauthorized(message.chat.id)
    return
  }

  // 이미 ACTIVATED 상태인 경우
  const currentStatus = await this.killSwitchService.getStatus()
  if (currentStatus !== 'NORMAL') {
    await this.sendMessage(message.chat.id,
      `Kill Switch is already \`${this.escapeMarkdownV2(currentStatus)}\`\\.\n` +
      'Recovery requires Desktop or CLI \\(dual authentication\\)\\.')
    return
  }

  // 확인 키보드 표시
  const text = [
    '🚨 *Kill Switch Activation*',
    '',
    'This will immediately:',
    '• Revoke all active sessions',
    '• Cancel all pending transactions',
    '• Suspend all agents',
    '• Lock the keystore',
    '',
    '⚠️ *Recovery requires Desktop/CLI with wallet signature \\+ master password\\.*',
    '',
    'Are you sure\\?',
  ].join('\n')

  await this.sendMessageWithKeyboard(message.chat.id, text, {
    inline_keyboard: [[
      { text: '🔴 Confirm Kill Switch', callback_data: 'killswitch_confirm' },
      { text: '❌ Cancel', callback_data: 'killswitch_cancel' },
    ]],
  })
}
```

### 4.8 명령어 7: /pending

```typescript
async handlePending(message: TelegramMessage): Promise<void> {
  if (!this.isAuthorizedOwner(message.from.id)) {
    await this.sendUnauthorized(message.chat.id)
    return
  }

  const pendingTxs = await this.transactionService.listPending()

  if (pendingTxs.length === 0) {
    await this.sendMessage(message.chat.id, 'No pending transactions\\.')
    return
  }

  for (const tx of pendingTxs) {
    const amountStr = this.escapeMarkdownV2(tx.amount)
    const toAddr = this.escapeMarkdownV2(tx.to.slice(0, 8) + '...' + tx.to.slice(-4))
    const agentName = this.escapeMarkdownV2(tx.agentName ?? tx.agentId.slice(0, 8))
    const tier = this.escapeMarkdownV2(tx.tier)
    const expiresIn = this.formatRemainingTime(tx.expiresAt)

    const text = [
      `*Transaction ${this.escapeMarkdownV2(tx.status)}*`,
      '',
      `Amount: \`${amountStr} SOL\``,
      `To: \`${toAddr}\``,
      `Agent: \`${agentName}\``,
      `Tier: \`${tier}\``,
      '',
      `_Expires in ${this.escapeMarkdownV2(expiresIn)}_`,
    ].join('\n')

    // DELAY 티어: Reject만 가능 (Telegram Tier 1)
    // APPROVAL 티어: Approve(Pre-approve) + Reject 가능
    const buttons: InlineKeyboardButton[] = []

    if (tx.tier === 'APPROVAL') {
      buttons.push({ text: '✅ Approve', callback_data: `approve:${tx.id}` })
    }
    buttons.push({ text: '❌ Reject', callback_data: `reject:${tx.id}` })

    await this.sendMessageWithKeyboard(message.chat.id, text, {
      inline_keyboard: [buttons],
    })
  }
}
```

### 4.9 명령어 8: /help

```typescript
async handleHelp(message: TelegramMessage): Promise<void> {
  const text = [
    '*WAIaaS Bot Commands*',
    '',
    '/start \\- Introduction and setup guide',
    '/auth \\- Link your Telegram account',
    '/status \\- System status summary',
    '/sessions \\- List active sessions',
    '/revoke \\[id\\] \\- Revoke a session',
    '/killswitch \\- Emergency Kill Switch',
    '/pending \\- Pending transactions with approve/reject',
    '/help \\- This message',
    '',
    '_Tier 1 actions \\(Telegram\\): reject, revoke, kill switch, read\\-only_',
    '_Tier 2 actions \\(Desktop/CLI\\): approve, recover, create, settings_',
  ].join('\n')

  await this.sendMessage(message.chat.id, text)
}
```

### 4.10 Command Handler Registry 구현

```typescript
type CommandHandler = (message: TelegramMessage) => Promise<void>

private registerCommands(): Map<string, CommandHandler> {
  const handlers = new Map<string, CommandHandler>()

  handlers.set('/start',      this.handleStart.bind(this))
  handlers.set('/auth',       this.handleAuth.bind(this))
  handlers.set('/status',     this.handleStatus.bind(this))
  handlers.set('/sessions',   this.handleSessions.bind(this))
  handlers.set('/revoke',     this.handleRevoke.bind(this))
  handlers.set('/killswitch', this.handleKillSwitch.bind(this))
  handlers.set('/pending',    this.handlePending.bind(this))
  handlers.set('/help',       this.handleHelp.bind(this))

  return handlers
}

private async handleCommand(message: TelegramMessage): Promise<void> {
  if (!message.text) return

  // 명령어 추출: "/revoke abc123" -> command="/revoke"
  const command = message.text.split(' ')[0].split('@')[0].toLowerCase()

  const handler = this.commandHandlers.get(command)
  if (handler) {
    await handler(message)
  } else {
    await this.sendMessage(message.chat.id,
      'Unknown command\\. Use /help for available commands\\.')
  }
}
```

### 4.11 BotFather 명령어 등록

BotFather에서 `/setcommands`로 등록할 명령어 목록:

```
start - Introduction and setup guide
auth - Link your Telegram account
status - System status summary
sessions - List active sessions
revoke - Revoke a session
killswitch - Emergency Kill Switch
pending - Pending transactions
help - Available commands
```

---

## 5. 인라인 키보드 거래 승인/거부 (TGBOT-01)

### 5.1 승인 요청 알림 (Push)

APPROVAL 티어 거래가 파이프라인 Stage 4에서 `PENDING_APPROVAL` 상태로 전이될 때, `NotificationService`가 `TelegramBotService`에 승인 요청 알림을 전달한다.

**기존 `TelegramChannel.send()`와의 차이:** 승인 요청에는 인라인 키보드(`reply_markup`)가 필요하므로, `TelegramBotService`가 직접 `sendMessage`를 호출한다.

```typescript
/**
 * APPROVAL 거래에 대해 인라인 키보드 포함 알림을 전송한다.
 * NotificationService -> TelegramBotService.sendApprovalRequest()
 */
async sendApprovalRequest(tx: PendingTransaction): Promise<void> {
  const amountStr = this.escapeMarkdownV2(tx.amount)
  const toAddr = this.escapeMarkdownV2(tx.to.slice(0, 8) + '...' + tx.to.slice(-4))
  const agentName = this.escapeMarkdownV2(tx.agentName ?? tx.agentId.slice(0, 8))
  const expiresIn = this.formatRemainingTime(tx.expiresAt)

  const text = [
    '🔔 *Transaction Approval Required*',
    '',
    `Amount: \`${amountStr} SOL\``,
    `To: \`${toAddr}\``,
    `Agent: \`${agentName}\``,
    `Tier: \`APPROVAL\``,
    '',
    `_Expires in ${this.escapeMarkdownV2(expiresIn)}_`,
  ].join('\n')

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [[
      { text: '✅ Approve', callback_data: `approve:${tx.id}` },
      { text: '❌ Reject', callback_data: `reject:${tx.id}` },
    ]],
  }

  await this.sendMessageWithKeyboard(Number(this.ownerChatId), text, keyboard)
}
```

### 5.2 callback_data 포맷

| 액션 | callback_data | 바이트 수 | 설명 |
|------|--------------|----------|------|
| 거래 승인 | `approve:{txId}` | `approve:` (8) + UUID v7 (36) = 44 | < 64바이트 |
| 거래 거부 | `reject:{txId}` | `reject:` (7) + UUID v7 (36) = 43 | < 64바이트 |
| 세션 폐기 | `revoke:{sessionId}` | `revoke:` (7) + UUID v7 (36) = 43 | < 64바이트 |
| Kill Switch 확인 | `killswitch_confirm` | 19 | < 64바이트 |
| Kill Switch 취소 | `killswitch_cancel` | 18 | < 64바이트 |

**주의:** callback_data 최대 64바이트. UUID v7은 36자 (하이픈 포함), 접두사와 합쳐도 안전하게 64바이트 이내.

### 5.3 Callback Query 처리

```typescript
private async handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
  const callbackData = query.data
  if (!callbackData) return

  // 1. 항상 먼저 answerCallbackQuery 호출 (Telegram 로딩 표시 제거)
  await this.answerCallbackQuery(query.id)

  // 2. chatId 인증 검증
  if (!this.isAuthorizedOwner(query.from.id)) {
    await this.answerCallbackQuery(query.id, 'Unauthorized. Use /auth to register.')
    return
  }

  // 3. callback_data 파싱
  const [action, ...idParts] = callbackData.split(':')
  const targetId = idParts.join(':')  // UUID v7에 ':'가 없으므로 안전

  try {
    switch (action) {
      case 'approve':
        await this.handleApproveCallback(query, targetId)
        break
      case 'reject':
        await this.handleRejectCallback(query, targetId)
        break
      case 'revoke':
        await this.handleRevokeCallback(query, targetId)
        break
      case 'killswitch_confirm':
        await this.handleKillSwitchConfirmCallback(query)
        break
      case 'killswitch_cancel':
        await this.handleKillSwitchCancelCallback(query)
        break
      default:
        logger.warn(`TelegramBotService: unknown callback action: ${action}`)
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'unknown error'
    logger.error('TelegramBotService: callback handler error', { action, error: errorMsg })
    await this.editMessage(query.message, `Error: ${errorMsg}`)
  }
}
```

### 5.4 Approve Callback 처리 (2-Tier 모델 적용)

```typescript
private async handleApproveCallback(
  query: TelegramCallbackQuery,
  txId: string,
): Promise<void> {
  // 1. DB에서 거래 상태 확인
  const tx = await this.transactionService.findById(txId)

  if (!tx) {
    await this.editMessage(query.message, '❌ Transaction not found\\.')
    return
  }

  if (tx.status !== 'PENDING_APPROVAL' && tx.status !== 'TELEGRAM_PRE_APPROVED') {
    await this.editMessage(query.message,
      `This transaction has already been processed \\(${this.escapeMarkdownV2(tx.status)}\\)\\.`)
    return
  }

  // 2. 직접 승인 설정 확인 (소액 Telegram 직접 승인)
  if (this.config.directApproveEnabled) {
    const amount = parseFloat(tx.amount)
    const threshold = parseFloat(this.config.directApproveThreshold)
    if (amount <= threshold && threshold > 0) {
      // Tier 1 직접 승인 허용 (소액)
      await this.transactionService.approve(txId, {
        actor: 'owner_telegram',
        method: 'telegram_direct',
      })
      await this.editMessage(query.message,
        `✅ Transaction APPROVED \\(direct, ${this.escapeMarkdownV2(tx.amount)} SOL\\)`)
      return
    }
  }

  // 3. 기본 동작: TELEGRAM_PRE_APPROVED 상태로 전이
  await this.transactionService.setPreApproved(txId, {
    actor: 'owner_telegram',
    preApprovedAt: new Date().toISOString(),
  })

  const remaining = this.formatRemainingTime(tx.expiresAt)

  await this.editMessage(query.message, [
    '📋 *Approval Noted*',
    '',
    `Transaction \`${this.escapeMarkdownV2(txId.slice(0, 8))}\\.\\.\\.\``,
    '',
    'Please confirm with your wallet signature in Desktop or CLI',
    `within ${this.escapeMarkdownV2(remaining)}\\.`,
    '',
    '_Status: TELEGRAM\\_PRE\\_APPROVED_',
  ].join('\n'))
}
```

### 5.5 Reject Callback 처리

```typescript
private async handleRejectCallback(
  query: TelegramCallbackQuery,
  txId: string,
): Promise<void> {
  const tx = await this.transactionService.findById(txId)

  if (!tx) {
    await this.editMessage(query.message, '❌ Transaction not found\\.')
    return
  }

  // DELAY, PENDING_APPROVAL, TELEGRAM_PRE_APPROVED 모두 거부 가능 (Tier 1)
  const rejectableStatuses = ['PENDING_DELAY', 'PENDING_APPROVAL', 'TELEGRAM_PRE_APPROVED']
  if (!rejectableStatuses.includes(tx.status)) {
    await this.editMessage(query.message,
      `Cannot reject: transaction is \`${this.escapeMarkdownV2(tx.status)}\`\\.`)
    return
  }

  await this.transactionService.reject(txId, {
    actor: 'owner_telegram',
    reason: 'Rejected via Telegram',
  })

  await this.editMessage(query.message,
    `❌ Transaction \`${this.escapeMarkdownV2(txId.slice(0, 8))}\\.\\.\\.\` REJECTED\\.`)
}
```

### 5.6 Telegram API 헬퍼 메서드

```typescript
/** 메시지 전송 (MarkdownV2) */
private async sendMessage(chatId: number | string, text: string): Promise<void> {
  await fetch(`${this.baseUrl}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
    }),
    signal: AbortSignal.timeout(10_000),
  })
}

/** 인라인 키보드 포함 메시지 전송 */
private async sendMessageWithKeyboard(
  chatId: number | string,
  text: string,
  replyMarkup: InlineKeyboardMarkup,
): Promise<void> {
  await fetch(`${this.baseUrl}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      reply_markup: replyMarkup,
    }),
    signal: AbortSignal.timeout(10_000),
  })
}

/** 기존 메시지 편집 (콜백 처리 후 결과 표시) */
private async editMessage(
  message: TelegramMessage | undefined,
  text: string,
): Promise<void> {
  if (!message) return

  await fetch(`${this.baseUrl}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: message.chat.id,
      message_id: message.message_id,
      text,
      parse_mode: 'MarkdownV2',
    }),
    signal: AbortSignal.timeout(10_000),
  })
}

/** 콜백 쿼리 응답 (로딩 표시 제거) */
private async answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  await fetch(`${this.baseUrl}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
      show_alert: !!text,  // 텍스트가 있으면 alert 팝업
    }),
    signal: AbortSignal.timeout(10_000),
  })
}

/** 미인가 사용자 응답 */
private async sendUnauthorized(chatId: number | string): Promise<void> {
  await this.sendMessage(chatId,
    'Unauthorized\\. Use /auth to link your Telegram account\\.')
}
```

---

## 6. Telegram 거래 승인 인증 갭 해결 -- 2-Tier 모델

### 6.1 인증 갭 분석

OWNR-CONN에서 정의한 `ownerAuth`는 **per-request SIWS/SIWE 서명**을 요구한다. 모든 Owner API 호출에는 지갑 서명이 필요하다.

그러나 Telegram 앱 환경에서는:
- Phantom/MetaMask 지갑 앱을 직접 호출할 수 없음
- WalletConnect DeepLink은 Telegram 인앱 브라우저에서 불안정
- 따라서 Telegram에서의 "승인"은 ownerAuth를 직접 충족할 수 없음

**결론:** Telegram에서 허용하는 동작과 Desktop/CLI에서만 허용하는 동작을 명확히 구분하는 2-Tier 인증 모델이 필요하다.

### 6.2 2-Tier 승인 모델

```
┌─────────────────────────────────────────────────────────────┐
│  Tier 1: Telegram 허용 (chatId 인증)                         │
│                                                              │
│  ✅ DELAY 티어 거래 reject (정책 허가 완료 거래의 취소)        │
│  ✅ APPROVAL 티어 거래 reject (승인 대기 거래의 거부)          │
│  ✅ 세션 revoke (기존 세션 폐기 -- 방어적 동작)               │
│  ✅ Kill Switch activate (긴급 정지 -- 방어적 동작)           │
│  ✅ /status, /sessions, /pending (읽기 전용)                  │
│                                                              │
│  인증: 등록된 Owner chatId와 callback_query.from.id 일치     │
│  원칙: "파괴적이지 않거나 방어적인 동작만 허용"                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Tier 2: Desktop/CLI 필수 (ownerAuth SIWS/SIWE 서명)        │
│                                                              │
│  🔒 APPROVAL 티어 거래 approve (자금 이동 최종 승인)          │
│  🔒 Kill Switch recover (시스템 복구 -- 이중 인증 필수)       │
│  🔒 세션 생성 (새 에이전트 권한 부여)                         │
│  🔒 설정 변경 (보안 설정 수정)                                │
│  🔒 정책 변경 (임계값, 규칙 수정)                             │
│                                                              │
│  인증: ownerAuth 미들웨어 (SIWS/SIWE per-request 서명)       │
│  원칙: "자금 이동/시스템 복구/권한 부여는 지갑 서명 필수"      │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Tier 판별 기준

| 동작 | 위험도 | 근거 | Tier |
|------|--------|------|------|
| DELAY reject | 낮음 | 정책 엔진이 이미 허가한 거래의 취소. Owner가 "실행하지 마라"고 하는 것 | Tier 1 |
| APPROVAL reject | 낮음 | 승인 대기 거래의 거부. 자금 이동 차단 | Tier 1 |
| Session revoke | 낮음 | 기존 세션 폐기. 에이전트 접근 차단 (방어적) | Tier 1 |
| Kill Switch activate | 낮음 | 시스템 긴급 정지. 모든 활동 중단 (방어적) | Tier 1 |
| 읽기 전용 조회 | 없음 | 정보 노출만 (localhost 범위 내) | Tier 1 |
| APPROVAL approve | **높음** | 자금 이동 최종 승인. Telegram chatId만으로 불충분 | **Tier 2** |
| Kill Switch recover | **높음** | 잠긴 시스템 복구. 이중 인증 (서명 + 마스터 패스워드) | **Tier 2** |
| Session create | **중간** | 새 에이전트에 지갑 접근 권한 부여 | **Tier 2** |
| Settings change | **중간** | 보안 임계값/정책 변경 | **Tier 2** |

### 6.4 TELEGRAM_PRE_APPROVED 상태

Telegram에서 [Approve]를 누르면, 거래가 바로 승인되지 않고 **TELEGRAM_PRE_APPROVED** 중간 상태로 전이한다.

```
거래 상태 흐름 (APPROVAL 티어):

PENDING_APPROVAL  ──[Telegram Approve]──>  TELEGRAM_PRE_APPROVED
                                             │
                                             ├──[Desktop/CLI ownerAuth 서명]──>  APPROVED
                                             │
                                             ├──[Telegram Reject]──>  REJECTED
                                             │
                                             └──[Timeout 만료]──>  EXPIRED
```

**DB 변경 (transactions 테이블 status enum 확장):**

```typescript
// 기존 TX-PIPE 상태에 TELEGRAM_PRE_APPROVED 추가
export type TransactionStatus =
  | 'QUEUED'
  | 'PENDING_DELAY'
  | 'PENDING_APPROVAL'
  | 'TELEGRAM_PRE_APPROVED'  // 신규: Telegram에서 사전 승인됨
  | 'APPROVED'
  | 'BUILDING'
  | 'SIMULATED'
  | 'SIGNING'
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'FAILED'
  | 'EXPIRED'
  | 'REJECTED'
  | 'CANCELLED'
```

**TELEGRAM_PRE_APPROVED 상태의 의미:**
- Owner가 Telegram에서 "이 거래를 승인할 의향이 있다"고 표시함
- 그러나 최종 승인 (자금 이동)에는 지갑 서명이 필요함
- Desktop/CLI에서 Owner가 ownerAuth 서명을 제출하면 APPROVED로 전이
- APPROVAL 타임아웃 워커는 이 상태도 만료 대상으로 포함

### 6.5 Telegram 직접 승인 (선택 옵션)

소액 APPROVAL 거래에 대해 Telegram chatId 인증만으로 직접 승인을 허용하는 **선택적** 설정이다.

```toml
# ~/.waiaas/config.toml
[telegram_bot]
direct_approve_enabled = false    # 기본: 비활성 (보안 최우선)
direct_approve_threshold = "0.5"  # SOL 단위: 0.5 SOL 이하 직접 승인
```

| 설정 | 기본값 | 설명 |
|------|--------|------|
| `direct_approve_enabled` | `false` | 활성화 시 소액 직접 승인 허용 |
| `direct_approve_threshold` | `"0"` | 직접 승인 허용 임계값 (SOL 단위) |

**활성화 시 경고:**

```
[WARN] Telegram direct approve enabled.
Transactions under 0.5 SOL can be approved without wallet signature.
This reduces security for convenience. Use at your own risk.
```

**직접 승인 흐름:**

```
PENDING_APPROVAL  ──[Telegram Approve + amount <= threshold]──>  APPROVED (직접)
PENDING_APPROVAL  ──[Telegram Approve + amount > threshold]──>  TELEGRAM_PRE_APPROVED (서명 필요)
```

### 6.6 chatId 인증 구현

```typescript
/**
 * chatId 인증.
 * Telegram Bot API가 from.id를 서버 측에서 검증하므로,
 * 봇 토큰이 안전한 범위 내에서 from.id는 신뢰할 수 있다.
 *
 * 스푸핑 방지: Telegram Bot API의 getUpdates 응답에 포함된 from.id는
 * Telegram 서버가 검증한 값이다. 클라이언트가 임의로 변경할 수 없다.
 * (단, 봇 토큰 자체가 유출되면 모든 보안이 무의미해짐)
 */
private isAuthorizedOwner(chatId: number): boolean {
  return String(chatId) === this.ownerChatId
}
```

**chatId 스푸핑 위협 분석:**

| 위협 | 가능성 | 대응 |
|------|--------|------|
| 임의 사용자가 봇에 명령 전송 | 높음 | chatId 검증으로 차단 |
| from.id 위조 (Telegram API 우회) | 거의 불가능 | Telegram 서버가 서명 검증 |
| Bot 토큰 유출 | 낮음 (Docker Secrets 보호) | 토큰 유출 = 봇 전체 탈취, 토큰 재발급 필요 |
| 중간자 공격 (Telegram API HTTPS) | 거의 불가능 | TLS 보호 |

### 6.7 인증 레벨 비교

| 인증 방법 | 보안 수준 | 사용 위치 | 적합한 동작 |
|----------|----------|----------|------------|
| chatId 검증 | 중간 | Telegram Bot | 방어적/읽기 전용 (Tier 1) |
| ownerAuth (SIWS/SIWE) | 높음 | Desktop/CLI | 자금 이동/시스템 복구 (Tier 2) |
| 이중 인증 (서명 + 마스터 패스워드) | 최고 | Desktop/CLI | Kill Switch 복구 |

---

## 7. Bot 관리 인터페이스

### 7.1 Bot 활성화/비활성화

TelegramBotService는 데몬 시작 시 `config.toml [telegram_bot].enabled`에 따라 자동으로 시작/건너뛰기한다.

```typescript
// packages/daemon/src/lifecycle/daemon.ts (확장)

// Step 6 이후: Telegram Bot 시작
if (config.telegram_bot.enabled) {
  if (!config.telegram_bot.bot_token) {
    logger.warn('Telegram bot enabled but bot_token not set, skipping')
  } else {
    const telegramBot = new TelegramBotService(config.telegram_bot, services)
    telegramBot.start()  // 비동기 (데몬 시작 블로킹 안 함)
    lifecycle.registerShutdownHook('telegram-bot', () => telegramBot.stop())
  }
}
```

### 7.2 런타임 API (Owner 설정)

Owner API `PUT /v1/owner/settings`를 통해 런타임에 봇 설정을 변경할 수 있다 (API-SPEC 참조).

```typescript
// 설정 변경 가능 항목
{
  telegram_bot: {
    enabled: boolean,                 // 봇 활성화/비활성화
    direct_approve_enabled: boolean,  // 직접 승인 토글
    direct_approve_threshold: string, // 임계값 변경
  }
}
```

**주의:** `bot_token`과 `owner_chat_id`는 API로 변경 불가. 보안 민감 설정은 config.toml 직접 편집 또는 Docker Secrets로만 관리.

### 7.3 Bot 토큰 보안

| 항목 | 방식 |
|------|------|
| 저장 | `notification_channels` 테이블 (NOTI-ARCH) + config.toml |
| API 응답 | 마지막 4자만 노출 (`...xxxx`) -- NOTI-ARCH 시크릿 마스킹 정책 |
| 로그 | `[REDACTED]` -- NOTI-ARCH 로깅 정책 |
| Docker | Docker Secrets (`/run/secrets/telegram_bot_token`) -- 섹션 11 |
| 환경변수 | `WAIAAS_TELEGRAM_BOT_TOKEN` 또는 `WAIAAS_TELEGRAM_BOT_TOKEN_FILE` |

### 7.4 Bot 상태 모니터링

`GET /v1/admin/status` 응답에 Telegram Bot 상태를 포함한다:

```typescript
{
  telegramBot: {
    enabled: boolean,
    connected: boolean,      // Long Polling 활성 여부
    ownerRegistered: boolean, // owner_chat_id 등록 여부
    lastPollAt: string | null, // 마지막 폴링 시각
    consecutiveErrors: number, // 연속 에러 횟수
  }
}
```

---

## 8. Docker 배포 아키텍처 (DOCK-01)

### 8.1 Docker 이미지 설계

| 항목 | 값 | 근거 |
|------|-----|------|
| Base image | `node:22-alpine` | Node.js 22 LTS, Alpine으로 최소 크기 (~180MB) |
| Build 전략 | Multi-stage (2단계) | 빌드 도구/devDependencies 제외로 이미지 크기 최소화 |
| 실행 사용자 | `waiaas` (uid 1001) | Non-root 최소 권한 원칙 |
| Expose 포트 | `3100` | CORE-06 기본 포트 |
| Healthcheck | `wget /health` 30s 주기 | CORE-06 헬스 엔드포인트 |
| 예상 이미지 크기 | ~250-350MB | Alpine + Node.js + native addons (sodium-native, better-sqlite3) |

### 8.2 Dockerfile 상세

```dockerfile
# ═══════════════════════════════════════════════════════════
# WAIaaS Daemon Docker Image
# Multi-stage build: builder -> production
# ═══════════════════════════════════════════════════════════

# ── Stage 1: Builder ──────────────────────────────────────
FROM node:22-alpine AS builder

# Native addon 빌드에 필요한 도구
RUN apk add --no-cache python3 make g++

WORKDIR /app

# pnpm 활성화
RUN corepack enable && corepack prepare pnpm@latest --activate

# 의존성 먼저 설치 (캐시 레이어)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/daemon/package.json ./packages/daemon/
COPY packages/adapters/solana/package.json ./packages/adapters/solana/
COPY packages/adapters/evm/package.json ./packages/adapters/evm/

RUN pnpm install --frozen-lockfile

# 소스 복사 + 빌드
COPY packages/ ./packages/
RUN pnpm --filter @waiaas/core build
RUN pnpm --filter @waiaas/daemon build

# Production 의존성만 재설치 (devDependencies 제거)
RUN pnpm install --frozen-lockfile --prod

# ── Stage 2: Production ──────────────────────────────────
FROM node:22-alpine AS production

# 최소 런타임 의존성 (sodium-native가 libstdc++ 필요)
RUN apk add --no-cache libstdc++

# Non-root 사용자 생성
RUN addgroup -g 1001 -S waiaas && \
    adduser -S waiaas -u 1001 -G waiaas

# 앱 디렉토리
WORKDIR /app

# 빌드 산출물 복사
COPY --from=builder --chown=waiaas:waiaas /app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=waiaas:waiaas /app/packages/core/package.json ./packages/core/
COPY --from=builder --chown=waiaas:waiaas /app/packages/daemon/dist ./packages/daemon/dist
COPY --from=builder --chown=waiaas:waiaas /app/packages/daemon/package.json ./packages/daemon/
COPY --from=builder --chown=waiaas:waiaas /app/packages/adapters/ ./packages/adapters/
COPY --from=builder --chown=waiaas:waiaas /app/node_modules ./node_modules
COPY --from=builder --chown=waiaas:waiaas /app/package.json ./

# entrypoint 스크립트
COPY --chown=waiaas:waiaas docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Non-root로 전환
USER waiaas

# 데이터 디렉토리 (named volume 마운트 포인트)
RUN mkdir -p /home/waiaas/.waiaas

# 포트 선언 (실제 바인딩은 docker-compose에서)
EXPOSE 3100

# 헬스체크
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3100/health || exit 1

# 엔트리포인트
ENTRYPOINT ["/app/entrypoint.sh"]
```

### 8.3 Entrypoint 스크립트

```bash
#!/bin/sh
# docker/entrypoint.sh
# WAIaaS 데몬 Docker 엔트리포인트

set -e

DATA_DIR="/home/waiaas/.waiaas"

# ── 마스터 패스워드 로드 ──
if [ -n "$WAIAAS_MASTER_PASSWORD_FILE" ] && [ -f "$WAIAAS_MASTER_PASSWORD_FILE" ]; then
  export WAIAAS_MASTER_PASSWORD=$(cat "$WAIAAS_MASTER_PASSWORD_FILE" | tr -d '\n')
fi

# ── Telegram Bot 토큰 로드 ──
if [ -n "$WAIAAS_TELEGRAM_BOT_TOKEN_FILE" ] && [ -f "$WAIAAS_TELEGRAM_BOT_TOKEN_FILE" ]; then
  export WAIAAS_TELEGRAM_BOT_TOKEN=$(cat "$WAIAAS_TELEGRAM_BOT_TOKEN_FILE" | tr -d '\n')
fi

# ── 초기 설정 ──
if [ ! -f "$DATA_DIR/config.toml" ]; then
  echo "First run detected. Initializing WAIaaS..."
  node packages/daemon/dist/cli.js init \
    --non-interactive \
    --data-dir "$DATA_DIR"
  echo "Initialization complete."
fi

# ── 데몬 시작 ──
echo "Starting WAIaaS daemon..."
exec node packages/daemon/dist/index.js \
  --data-dir "$DATA_DIR"
```

### 8.4 Native Addon 고려사항

| 패키지 | 설명 | Alpine 빌드 필요 |
|--------|------|-----------------|
| `sodium-native` | libsodium 바인딩 (키스토어 암호화) | `python3 make g++` (builder stage) |
| `better-sqlite3` | SQLite 네이티브 바인딩 | 동일 (builder stage) |
| `argon2` | Argon2id KDF | 동일 (builder stage) |

**런타임 의존성:** `libstdc++` (Alpine에서 sodium-native 실행에 필요)

### 8.5 .dockerignore

```
node_modules
.git
.planning
*.md
!README.md
.env
.env.*
secrets/
docker-compose*.yml
Dockerfile
.dockerignore
.github
.vscode
*.log
coverage
.turbo
dist
```

---

## 9. docker-compose.yml 스펙

### 9.1 기본 구성

```yaml
# docker-compose.yml
# WAIaaS Self-Hosted Daemon

services:
  waiaas:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    container_name: waiaas-daemon
    restart: unless-stopped

    # ── 포트: 호스트 측 localhost만 바인딩 (호스트 포트 매핑에서 0.0.0.0 금지) ──
    # 컨테이너 내부는 WAIAAS_DAEMON_HOSTNAME=0.0.0.0으로 모든 인터페이스에서 수신하지만,
    # 호스트 측은 127.0.0.1로 제한하여 외부 접근을 차단한다.
    ports:
      - "127.0.0.1:3100:3100"

    # ── 볼륨: named volume (bind mount 금지) ──
    volumes:
      - waiaas-data:/home/waiaas/.waiaas

    # ── 환경변수 ──
    environment:
      - NODE_ENV=production
      - WAIAAS_DAEMON_PORT=3100
      - WAIAAS_DAEMON_HOSTNAME=0.0.0.0  # 컨테이너 내부 모든 인터페이스에서 수신. 호스트 측은 ports에서 127.0.0.1로 제한
      - WAIAAS_MASTER_PASSWORD_FILE=/run/secrets/master_password
      - WAIAAS_LOG_LEVEL=${WAIAAS_LOG_LEVEL:-info}
      - WAIAAS_WALLETCONNECT_PROJECT_ID=${WALLETCONNECT_PROJECT_ID:-}

    # ── Docker Secrets ──
    secrets:
      - master_password

    # ── 헬스체크 ──
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:3100/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s

    # ── 리소스 제한 (선택) ──
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

    # ── 보안 옵션 (선택) ──
    security_opt:
      - no-new-privileges:true

# ── Named Volumes ──
volumes:
  waiaas-data:
    driver: local

# ── Docker Secrets ──
secrets:
  master_password:
    file: ./secrets/master_password.txt
```

### 9.2 Telegram Bot 포함 구성

```yaml
# docker-compose.telegram.yml (override)
# 사용: docker compose -f docker-compose.yml -f docker-compose.telegram.yml up -d

services:
  waiaas:
    environment:
      - WAIAAS_TELEGRAM_BOT_TOKEN_FILE=/run/secrets/telegram_bot_token
      - WAIAAS_TELEGRAM_BOT_ENABLED=true
    secrets:
      - telegram_bot_token

secrets:
  telegram_bot_token:
    file: ./secrets/telegram_bot_token.txt
```

### 9.3 프리빌트 이미지 사용

```yaml
# docker-compose.prebuilt.yml (Docker Hub / GHCR 이미지 사용 시)

services:
  waiaas:
    image: ghcr.io/waiaas/daemon:0.2.0
    # build 섹션 제거, 나머지 동일
```

---

## 10. 볼륨 + 데이터 영속화

### 10.1 Named Volume 구조

| 호스트 경로 | 컨테이너 경로 | 데이터 |
|-----------|--------------|--------|
| Docker managed | `/home/waiaas/.waiaas/` | 전체 데이터 디렉토리 |

**Named Volume 내부 구조:**

```
/home/waiaas/.waiaas/
├── config.toml          # 설정 파일
├── wallet.db            # SQLite 메인 DB
├── wallet.db-wal        # WAL 파일
├── wallet.db-shm        # 공유 메모리
├── keystores/           # 에이전트 키스토어 파일
│   └── {agentId}.json   # AES-256-GCM 암호화된 키 파일
└── logs/                # 데몬 로그 (파일 로깅)
    └── daemon.log
```

### 10.2 Named Volume 필수 이유

| 마운트 방식 | SQLite WAL 호환 | macOS Docker Desktop | 추천 |
|-----------|----------------|---------------------|------|
| **Named volume** | 호환 | VirtioFS 안전 | **권장** |
| Bind mount | 불안정 | VirtioFS `mmap()` 문제 | 비추천 |
| tmpfs | WAL 안전하지만 비영속 | N/A | 불가 |

**09-RESEARCH Pitfall 6:** Docker bind mount에서 SQLite WAL 모드가 정상 동작하지 않을 수 있다. 특히 macOS Docker Desktop의 VirtioFS는 `mmap()` 지원이 불완전하여 `-shm` 파일 접근에 문제가 발생한다. Named volume은 Docker가 관리하는 Linux ext4 파일시스템을 사용하므로 이 문제가 없다.

### 10.3 백업

```bash
# 볼륨 백업 (tar.gz)
docker run --rm \
  -v waiaas-data:/data:ro \
  -v "$(pwd)/backups":/backup \
  alpine tar czf /backup/waiaas-backup-$(date +%Y%m%d).tar.gz -C /data .

# 볼륨 복원
docker run --rm \
  -v waiaas-data:/data \
  -v "$(pwd)/backups":/backup \
  alpine sh -c "cd /data && tar xzf /backup/waiaas-backup-20260205.tar.gz"
```

**자동 백업 (cron 예시):**

```bash
# crontab -e
# 매일 02:00에 백업
0 2 * * * docker run --rm -v waiaas-data:/data:ro -v /backups/waiaas:/backup alpine tar czf /backup/waiaas-$(date +\%Y\%m\%d).tar.gz -C /data . 2>&1 | logger -t waiaas-backup
```

**주의:** 백업 실행 시 SQLite WAL checkpoint를 먼저 수행하는 것이 권장된다. 데몬이 실행 중이면 WAL 파일에 미적용 데이터가 있을 수 있다.

```bash
# 백업 전 WAL checkpoint 강제 실행
docker exec waiaas-daemon node -e "
  const db = require('better-sqlite3')('/home/waiaas/.waiaas/wallet.db');
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
"
```

### 10.4 초기 설정 (첫 실행)

Entrypoint 스크립트(섹션 8.3)가 `config.toml` 존재 여부를 확인한다:

1. **config.toml 미존재:** `waiaas init --non-interactive` 자동 실행
   - 기본 config.toml 생성
   - SQLite DB 초기화 + 마이그레이션
   - 키스토어 디렉토리 생성
2. **config.toml 존재:** 바로 데몬 시작

---

## 11. Docker Secrets + 환경변수 관리

### 11.1 Docker Secrets

Docker Secrets는 민감한 데이터를 컨테이너에 안전하게 전달하는 메커니즘이다. 환경변수와 달리 `docker inspect`에 노출되지 않는다.

| Secret | 파일 | 컨테이너 내부 경로 | 필수 |
|--------|------|-------------------|------|
| `master_password` | `./secrets/master_password.txt` | `/run/secrets/master_password` | **Yes** |
| `telegram_bot_token` | `./secrets/telegram_bot_token.txt` | `/run/secrets/telegram_bot_token` | No |

**Secret 파일 생성:**

```bash
mkdir -p secrets
echo -n "your-strong-master-password" > secrets/master_password.txt
chmod 600 secrets/master_password.txt

# Telegram Bot (선택)
echo -n "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" > secrets/telegram_bot_token.txt
chmod 600 secrets/telegram_bot_token.txt
```

**`_FILE` 환경변수 패턴:**

데몬은 `WAIAAS_MASTER_PASSWORD_FILE` 환경변수를 인식하여 해당 경로의 파일 내용을 읽는다:

```typescript
// packages/daemon/src/infrastructure/config/loader.ts (확장)

function loadSecret(envVar: string, fileEnvVar: string): string | undefined {
  // 1. 직접 환경변수 (비추천, docker inspect 노출)
  if (process.env[envVar]) {
    logger.warn(`${envVar} set directly. Prefer ${fileEnvVar} for security.`)
    return process.env[envVar]
  }

  // 2. 파일 경로 환경변수 (추천)
  const filePath = process.env[fileEnvVar]
  if (filePath && existsSync(filePath)) {
    return readFileSync(filePath, 'utf-8').trim()
  }

  return undefined
}

// 사용
const masterPassword = loadSecret('WAIAAS_MASTER_PASSWORD', 'WAIAAS_MASTER_PASSWORD_FILE')
const telegramToken = loadSecret('WAIAAS_TELEGRAM_BOT_TOKEN', 'WAIAAS_TELEGRAM_BOT_TOKEN_FILE')
```

### 11.2 환경변수 참조 테이블

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `NODE_ENV` | No | `production` | Node.js 환경 |
| `WAIAAS_DAEMON_PORT` | No | `3100` | 데몬 포트 |
| `WAIAAS_DAEMON_HOSTNAME` | No | `127.0.0.1` | 바인딩 주소 (Docker: `0.0.0.0` 필수, 호스트 포트 매핑에서 127.0.0.1 제한) |
| `WAIAAS_MASTER_PASSWORD_FILE` | **Yes** | - | 마스터 패스워드 파일 경로 |
| `WAIAAS_MASTER_PASSWORD` | No | - | 마스터 패스워드 직접 (비추천) |
| `WAIAAS_WALLETCONNECT_PROJECT_ID` | No | `""` | WalletConnect 프로젝트 ID |
| `WAIAAS_TELEGRAM_BOT_TOKEN_FILE` | No | - | Telegram Bot 토큰 파일 경로 |
| `WAIAAS_TELEGRAM_BOT_TOKEN` | No | - | Telegram Bot 토큰 직접 (비추천) |
| `WAIAAS_TELEGRAM_BOT_ENABLED` | No | `false` | Telegram Bot 활성화 |
| `WAIAAS_LOG_LEVEL` | No | `info` | 로그 레벨 (debug/info/warn/error) |
| `WAIAAS_DATA_DIR` | No | `~/.waiaas` | 데이터 디렉토리 (Docker에서는 볼륨 경로) |

### 11.3 .env 파일 예시

```bash
# .env (docker-compose에서 자동 로드)
# 주의: 민감 정보는 secrets/ 디렉토리에 별도 관리

WALLETCONNECT_PROJECT_ID=abc123def456
WAIAAS_LOG_LEVEL=info
```

**주의:** `.env` 파일에 마스터 패스워드나 Bot 토큰을 넣지 않는다. 이들은 Docker Secrets로만 관리한다.

---

## 12. Docker 네트워킹 + 보안

### 12.1 포트 바인딩

```yaml
ports:
  - "127.0.0.1:3100:3100"   # localhost만 바인딩
```

**호스트 포트 매핑에서 0.0.0.0 금지:**

```yaml
# 이것은 WAIaaS 보안 모델을 파괴한다 (호스트 측에서 외부 네트워크에 노출)
ports:
  - "0.0.0.0:3100:3100"   # 호스트의 모든 인터페이스에 노출 -- 금지
  - "3100:3100"            # 기본 0.0.0.0 -- 금지
```

**컨테이너 내부 바인딩과 호스트 포트 매핑의 관계:**

컨테이너 내부에서 `WAIAAS_DAEMON_HOSTNAME=0.0.0.0`으로 설정하면 컨테이너 내 모든 네트워크 인터페이스에서 요청을 수신한다. 이는 Docker 포트 매핑이 동작하기 위해 필요하다 (컨테이너 내부 127.0.0.1 바인딩은 Docker bridge 네트워크를 통한 포트 매핑이 불가). 호스트 측에서는 `ports: "127.0.0.1:3100:3100"` 설정으로 localhost만 접근 가능하도록 제한한다.

```
[호스트] 127.0.0.1:3100 <-- Docker port mapping --> [컨테이너] 0.0.0.0:3100 (Hono 서버)
```

### 12.2 외부 접근 시나리오

Self-Hosted 서버에서 원격으로 WAIaaS에 접근해야 하는 경우:

**방법 1: SSH 터널 (추천)**

```bash
# 로컬 PC에서 원격 서버의 WAIaaS에 접근
ssh -L 3100:127.0.0.1:3100 user@remote-server

# 이후 로컬에서 http://127.0.0.1:3100으로 접근 가능
```

**방법 2: Reverse Proxy (Nginx + TLS)**

```nginx
# /etc/nginx/sites-available/waiaas.conf
# 주의: TLS + 클라이언트 인증서 필수
server {
    listen 443 ssl http2;
    server_name waiaas.example.com;

    ssl_certificate /etc/letsencrypt/live/waiaas.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/waiaas.example.com/privkey.pem;

    # 클라이언트 인증서 (mTLS)
    ssl_client_certificate /etc/nginx/certs/ca.crt;
    ssl_verify_client on;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**주의:** Reverse Proxy를 사용하면 WAIaaS의 Host 헤더 검증(CORE-06)이 실패할 수 있다. Proxy 환경에서는 `Host: 127.0.0.1:3100` 헤더를 프록시가 설정하도록 구성해야 한다.

### 12.3 Docker 네트워크

```yaml
# 기본 bridge 네트워크 사용 (다른 컨테이너와 통신 불필요)
# 별도 network 설정 없음
```

WAIaaS는 단일 컨테이너 애플리케이션이다. 외부 데이터베이스, 캐시, 메시지 큐가 없으므로 다른 컨테이너와의 통신이 불필요하다.

### 12.4 Telegram Bot과 Docker 네트워킹

Telegram Bot Long Polling은 **outbound HTTPS 요청만** 필요하다:

```
컨테이너 -> api.telegram.org (outbound, port 443)
```

- 인바운드 포트 추가 불필요 (Webhook 미사용)
- Docker 기본 네트워크에서 outbound HTTPS 자동 허용
- 방화벽 설정: outbound 443 허용 필요 (보통 기본 허용)

---

## 13. Docker 라이프사이클

### 13.1 일상 운영 명령어

| 작업 | 명령어 | 설명 |
|------|--------|------|
| 시작 | `docker compose up -d` | 백그라운드 시작 |
| 중지 | `docker compose down` | Graceful shutdown (SIGTERM) |
| 로그 | `docker compose logs -f waiaas` | 실시간 로그 |
| 상태 | `docker compose ps` | 컨테이너 상태 |
| 재시작 | `docker compose restart waiaas` | 컨테이너 재시작 |
| 업데이트 | `docker compose pull && docker compose up -d` | 이미지 업데이트 (named volume 유지) |

### 13.2 Graceful Shutdown

`docker compose down`은 SIGTERM을 전송한다. WAIaaS 데몬은 CORE-05에서 정의한 10단계 graceful shutdown을 수행한다:

```
SIGTERM 수신
  -> Step 1: Signal 수신, 종료 시작 로그
  -> Step 2: HTTP 서버 신규 요청 거부 + 진행 중 요청 완료 대기 (30초 타임아웃)
  -> Step 3: TelegramBotService.stop() (Long Polling 종료)
  -> Step 4: BackgroundWorkers 정지
  -> Step 5: AdapterRegistry 연결 해제
  -> Step 6: WAL checkpoint (TRUNCATE)
  -> Step 7: KeyStore lock (sodium_memzero)
  -> Step 8: Database close
  -> Step 9: PID 파일 삭제
  -> Step 10: 종료 로그 + process.exit(0)
```

**Docker stop timeout:** 기본 10초. WAIaaS graceful shutdown은 최대 30초 필요하므로:

```yaml
# docker-compose.yml
services:
  waiaas:
    stop_grace_period: 35s  # 30초 shutdown + 5초 마진
```

> **Shutdown 타임라인 검증:** 30초 강제 타이머 + 10단계 합산 시간의 관계 검증은 28-daemon-lifecycle-cli.md 구현 노트 참조.

### 13.3 자동 재시작

```yaml
restart: unless-stopped
```

| 시나리오 | 동작 |
|---------|------|
| 크래시 (exit code != 0) | 자동 재시작 |
| `docker compose down` | 재시작 안 함 |
| `docker compose stop` | 재시작 안 함 |
| Docker Desktop 재시작 | 자동 재시작 |
| 호스트 OS 재부팅 | Docker 서비스 시작 시 자동 재시작 |

### 13.4 헬스체크

```yaml
healthcheck:
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:3100/health"]
  interval: 30s       # 30초 주기
  timeout: 5s         # 5초 타임아웃
  retries: 3          # 3회 실패 시 unhealthy
  start_period: 15s   # 시작 후 15초간 실패 무시 (초기화 대기)
```

**healthcheck에 curl 대신 wget 사용:**

- Alpine 이미지에 `wget`이 기본 포함 (busybox)
- `curl`은 추가 설치 필요 (이미지 크기 증가)

### 13.5 업데이트 절차

```bash
# 1. 새 이미지 가져오기
docker compose pull

# 2. 컨테이너 재생성 (named volume 유지)
docker compose up -d

# 3. 이전 이미지 정리
docker image prune -f
```

Named volume은 `docker compose down`이나 `up -d`에 영향받지 않는다. 데이터는 안전하게 유지된다.

---

## 14. Telegram Bot + Docker 통합 시나리오

### 14.1 기본 설정 (Telegram Bot 없이)

```bash
# 1. 시크릿 생성
mkdir -p secrets
echo -n "my-strong-password" > secrets/master_password.txt
chmod 600 secrets/master_password.txt

# 2. .env 생성
echo "WALLETCONNECT_PROJECT_ID=your-project-id" > .env

# 3. 시작
docker compose up -d

# 4. 로그 확인
docker compose logs -f waiaas
```

### 14.2 Telegram Bot 활성화

```bash
# 1. BotFather에서 Bot 생성 -> 토큰 획득
# /newbot -> WAIaaS Bot -> @your_waiaas_bot

# 2. 시크릿에 토큰 저장
echo -n "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" > secrets/telegram_bot_token.txt
chmod 600 secrets/telegram_bot_token.txt

# 3. Telegram 오버라이드로 시작
docker compose -f docker-compose.yml -f docker-compose.telegram.yml up -d

# 4. Telegram에서 봇에게 /start -> /auth
# 5. 표시된 6자리 코드를 Desktop/CLI에서 검증
# waiaas telegram verify 847291
```

### 14.3 전체 설정 (docker-compose.full.yml)

```yaml
# docker-compose.full.yml
# Telegram Bot + 모든 기능 활성화

services:
  waiaas:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    container_name: waiaas-daemon
    restart: unless-stopped
    stop_grace_period: 35s
    ports:
      - "127.0.0.1:3100:3100"
    volumes:
      - waiaas-data:/home/waiaas/.waiaas
    environment:
      - NODE_ENV=production
      - WAIAAS_DAEMON_PORT=3100
      - WAIAAS_DAEMON_HOSTNAME=0.0.0.0
      - WAIAAS_MASTER_PASSWORD_FILE=/run/secrets/master_password
      - WAIAAS_TELEGRAM_BOT_TOKEN_FILE=/run/secrets/telegram_bot_token
      - WAIAAS_TELEGRAM_BOT_ENABLED=true
      - WAIAAS_WALLETCONNECT_PROJECT_ID=${WALLETCONNECT_PROJECT_ID:-}
      - WAIAAS_LOG_LEVEL=${WAIAAS_LOG_LEVEL:-info}
    secrets:
      - master_password
      - telegram_bot_token
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:3100/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
    security_opt:
      - no-new-privileges:true
    deploy:
      resources:
        limits:
          memory: 512M

volumes:
  waiaas-data:
    driver: local

secrets:
  master_password:
    file: ./secrets/master_password.txt
  telegram_bot_token:
    file: ./secrets/telegram_bot_token.txt
```

---

## 15. 보안 고려사항

### 15.1 컨테이너 보안

| 항목 | 설정 | 근거 |
|------|------|------|
| Non-root 사용자 | `waiaas` (uid 1001) | 최소 권한 원칙. 컨테이너 탈출 시 영향 최소화 |
| No new privileges | `security_opt: no-new-privileges:true` | 프로세스가 추가 권한 획득 불가 |
| Read-only FS (선택) | `read_only: true` + tmpfs | 파일 시스템 변조 방지 |
| Memory 제한 | `deploy.resources.limits.memory: 512M` | DoS 방지 |

**Read-only 파일시스템 (옵션):**

```yaml
services:
  waiaas:
    read_only: true
    tmpfs:
      - /tmp:size=64M
    volumes:
      - waiaas-data:/home/waiaas/.waiaas  # 데이터만 쓰기 가능
```

### 15.2 시크릿 보안

| 항목 | 방식 |
|------|------|
| 마스터 패스워드 | Docker Secrets (`/run/secrets/`) - tmpfs 저장, 디스크 기록 안 됨 |
| Bot 토큰 | Docker Secrets (`/run/secrets/`) |
| 시크릿 파일 권한 | `chmod 600` (owner read only) |
| 환경변수 직접 전달 | 비추천 (`docker inspect`에 노출) |
| `.env` 파일 | 비밀번호/토큰 포함 금지 (프로젝트 ID 등 비민감 설정만) |

### 15.3 이미지 보안

| 항목 | 도구/방법 | 설명 |
|------|----------|------|
| 취약점 스캔 | Trivy / Snyk | CI에서 이미지 빌드 후 자동 스캔 |
| 이미지 서명 | Docker Content Trust (DCT) 또는 cosign | 이미지 무결성 검증 |
| Base image 업데이트 | Dependabot / Renovate | Alpine 보안 패치 자동 추적 |
| 최소 Base image | `node:22-alpine` | 불필요한 패키지 없음 |

**Trivy 스캔 예시:**

```bash
# 로컬 이미지 스캔
trivy image waiaas-daemon:latest

# CI 파이프라인 (high/critical만 실패)
trivy image --severity HIGH,CRITICAL --exit-code 1 waiaas-daemon:latest
```

### 15.4 Named Volume 암호화

Docker named volume 자체는 암호화 기능을 제공하지 않는다. 데이터 보호는 다음 레이어에 의존한다:

| 레이어 | 방식 | 설명 |
|--------|------|------|
| 애플리케이션 | AES-256-GCM (키스토어) | 에이전트 개인키는 항상 암호화 저장 |
| OS | 전체 디스크 암호화 (LUKS/FileVault) | 호스트 OS 레벨 보호 |
| Docker | Volume driver (선택) | 암호화 volume driver 사용 가능 (예: `docker volume create --driver ...`) |

**WAIaaS 키스토어는 항상 AES-256-GCM으로 암호화되어 있으므로**, 볼륨 레벨 암호화 없이도 개인키는 보호된다. 그러나 config.toml (JWT Secret 포함), SQLite DB (거래 내역)는 평문이므로 OS 레벨 디스크 암호화를 **강력 권장**한다.

### 15.5 네트워크 보안 체크리스트

- [ ] `ports: "127.0.0.1:3100:3100"` 확인 (호스트 포트 매핑에서 0.0.0.0 아닌지)
- [ ] 방화벽에서 3100 포트 외부 접근 차단
- [ ] SSH 터널 사용 시 SSH 키 기반 인증
- [ ] Reverse Proxy 사용 시 TLS + mTLS 설정
- [ ] Docker API (docker.sock) 외부 노출 안 됨
- [ ] `docker-compose.yml`에 `network_mode: host` 사용 안 함

---

## 16. 구현 노트

> Phase 13 (v0.3 MEDIUM 구현 노트)에서 추가. 기존 설계를 변경하지 않으며, 구현 시 참고할 주의사항을 정리한다.

### 16.1 Telegram Tier 2 인증과 SIWS 서명 대체 방안 (NOTE-07)

**배경:** 섹션 6에서 정의한 2-Tier 인증 모델에서, Tier 2(ownerAuth: SIWS/SIWE per-request 서명)는 Telegram 환경에서 직접 수행이 불가능하다. 구현 시 이 제약과 대체 패턴을 명확히 이해해야 한다.

**v0.2 결정:** Telegram에서 Tier 2(SIWS/SIWE) 서명을 미지원한다. UX 복잡도(Telegram Mini App + WalletConnect QR + 외부 지갑 서명 -> Bot 전달)가 높아 실용성이 부족하다.

**대체 패턴 (TELEGRAM_PRE_APPROVED):**

```
1. Telegram에서 [Pre-Approve] 버튼 클릭 (Tier 1 chatId 인증)
2. 트랜잭션 상태: QUEUED -> PENDING_APPROVAL -> TELEGRAM_PRE_APPROVED (중간 상태)
3. Desktop/CLI 알림: "Telegram에서 사전 승인된 거래가 있습니다"
4. Desktop/CLI에서 ownerAuth(SIWS/SIWE 서명) 수행 -> APPROVED -> EXECUTING
```

**Tier별 동작 분류:**

| 동작 | 필요 인증 | Telegram 수행 | Desktop/CLI 필수 |
|------|----------|-------------|-----------------|
| reject (거부) | Tier 1 (chatId) | 가능 | - |
| revoke (세션 취소) | Tier 1 (chatId) | 가능 | - |
| kill switch activate (긴급 중지) | Tier 1 (chatId) | 가능 | - |
| 읽기 전용 조회 | Tier 1 (chatId) | 가능 | - |
| approve (승인) | Tier 2 (ownerAuth) | 불가 -> Pre-Approve만 | Desktop/CLI에서 최종 승인 |
| recover (Kill Switch 복구) | Tier 2 (ownerAuth) | 불가 | Desktop/CLI 필수 |
| create (에이전트/세션 생성) | Tier 2 (ownerAuth) | 불가 | Desktop/CLI 필수 |
| settings (설정 변경) | Tier 2 (ownerAuth) | 불가 | Desktop/CLI 필수 |

**보안 근거:** 자금 이동(approve)과 시스템 복구(recover)는 지갑 서명 필수 원칙을 유지한다. Telegram은 "알림 + 방어적 동작" 채널로 위치한다. 방어적 동작(reject, revoke, kill switch)은 자금 유출 방지에 해당하므로 Tier 1으로 충분하다.

**v0.3+ 확장 후보:** Telegram Mini App + WalletConnect DeepLink 연동으로 Tier 2 직접 수행 검토. Mini App에서 WalletConnect QR을 표시하고, Phantom/MetaMask로 서명 후 결과를 Bot에 전달하는 흐름이 가능하나 추가 개발 범위가 크다.

**참조:** 섹션 6 (2-Tier 인증 모델), 부록 B (트랜잭션 상태 흐름), TAURI-DESK (39-tauri-desktop-architecture.md) 구현 노트에서 Desktop 측 최종 승인 흐름 참조.

---

## 부록 A: Telegram Bot API 참조

| API 메서드 | 용도 | 섹션 |
|-----------|------|------|
| `getUpdates` | Long Polling 업데이트 수신 | 3 |
| `sendMessage` | 메시지 전송 (MarkdownV2 + 인라인 키보드) | 4, 5 |
| `editMessageText` | 기존 메시지 편집 (콜백 결과 표시) | 5 |
| `answerCallbackQuery` | 콜백 쿼리 응답 (로딩 표시 제거) | 5 |
| `getMe` | 봇 정보 조회 (healthCheck) | NOTI-ARCH |

## 부록 B: 트랜잭션 상태 흐름 (Telegram 확장)

```
QUEUED
  │
  ├── [INSTANT tier] ──> BUILDING -> SIMULATED -> SIGNING -> SUBMITTED -> CONFIRMED
  │
  ├── [DELAY tier] ──> PENDING_DELAY
  │     │
  │     ├── [cooldown 만료] ──> BUILDING -> ... -> CONFIRMED
  │     └── [Telegram Reject (Tier 1)] ──> REJECTED
  │
  └── [APPROVAL tier] ──> PENDING_APPROVAL
        │
        ├── [Desktop/CLI ownerAuth] ──> APPROVED -> BUILDING -> ... -> CONFIRMED
        │
        ├── [Telegram Approve] ──> TELEGRAM_PRE_APPROVED
        │     │
        │     ├── [Desktop/CLI ownerAuth] ──> APPROVED -> BUILDING -> ... -> CONFIRMED
        │     ├── [Telegram Reject] ──> REJECTED
        │     └── [Timeout] ──> EXPIRED
        │
        ├── [Telegram Reject (Tier 1)] ──> REJECTED
        │
        ├── [Telegram Direct Approve (소액, 설정 활성화)] ──> APPROVED -> ...
        │
        └── [Timeout] ──> EXPIRED
```

## 부록 C: 설계 결정 요약

| # | 결정 | 근거 |
|---|------|------|
| 1 | Long Polling (Webhook 아님) | Self-Hosted에 외부 접근 가능 URL 불필요 |
| 2 | native fetch (프레임워크 미사용) | NOTI-ARCH 결정 유지, 의존성 최소화 |
| 3 | 2-Tier 인증 모델 | Telegram에서 지갑 서명 불가, 방어적 동작만 Tier 1 |
| 4 | TELEGRAM_PRE_APPROVED 상태 | 사용자 의향 표시 + 지갑 서명 최종 확인 분리 |
| 5 | 6자리 코드 인증 (/auth) | chatId를 안전하게 교차 검증하는 유일한 경로 |
| 6 | Named volume (bind mount 아님) | SQLite WAL + macOS Docker Desktop 호환성 |
| 7 | Docker Secrets + `_FILE` 패턴 | docker inspect 노출 방지 |
| 8 | Non-root (waiaas:1001) | 컨테이너 최소 권한 원칙 |
| 9 | Multi-stage build | 이미지 크기 최소화 (빌드 도구 제외) |
| 10 | wget healthcheck (curl 아님) | Alpine 기본 포함 (추가 설치 불필요) |
| 11 | stop_grace_period: 35s | 데몬 30초 graceful shutdown + 5초 마진 |
| 12 | direct_approve 기본 비활성 | 보안 최우선, 편의 기능은 명시적 활성화 |
