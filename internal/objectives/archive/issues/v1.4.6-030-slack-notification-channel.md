# 030: Slack 알림 채널 미지원

## 심각도

**LOW** — Telegram, Discord, ntfy 3개 채널은 지원하지만 Slack은 미지원. Slack을 주 커뮤니케이션 도구로 사용하는 환경에서 알림을 받을 수 없다.

## 현재 지원 채널

| 채널 | 방식 | 설정 키 |
|------|------|---------|
| Telegram | Bot API | `telegram_bot_token` + `telegram_chat_id` |
| Discord | Webhook URL | `discord_webhook_url` |
| ntfy | Topic URL | `ntfy_topic` |
| **Slack** | **미지원** | — |

## 수정안

### 1. SlackChannel 클래스 추가

기존 `INotificationChannel` 인터페이스를 구현하여 Slack Incoming Webhook으로 알림을 전송한다.

```typescript
// packages/daemon/src/notifications/channels/slack.ts
import type { INotificationChannel, NotificationPayload } from '@waiaas/core';

export class SlackChannel implements INotificationChannel {
  readonly name = 'slack';
  private webhookUrl = '';

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.webhookUrl = String(config.slack_webhook_url ?? '');
    if (!this.webhookUrl) {
      throw new Error('SlackChannel: slack_webhook_url required');
    }
  }

  async send(payload: NotificationPayload): Promise<void> {
    const color = this.getColor(payload.eventType);
    const fields = [
      { title: 'Wallet', value: payload.walletId, short: true },
      { title: 'Event', value: payload.eventType, short: true },
    ];

    if (payload.details) {
      for (const [key, value] of Object.entries(payload.details)) {
        fields.push({ title: key, value: String(value), short: true });
      }
    }

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attachments: [{
          color,
          title: payload.eventType.replace(/_/g, ' '),
          text: payload.message,
          fields,
          ts: payload.timestamp,
        }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SlackChannel: ${response.status} ${body}`);
    }
  }

  private getColor(eventType: string): string {
    if (eventType.includes('KILL_SWITCH') || eventType.includes('AUTO_STOP') || eventType.includes('SUSPENDED')) {
      return '#ff0000'; // Red
    }
    if (eventType.includes('FAILED') || eventType.includes('VIOLATION') || eventType.includes('EXPIRED')) {
      return '#ff8c00'; // Orange
    }
    if (eventType.includes('CONFIRMED') || eventType.includes('RECOVERED') || eventType.includes('VERIFIED')) {
      return '#00ff00'; // Green
    }
    return '#0099ff'; // Blue
  }
}
```

### 2. config.toml 설정 추가

```toml
[notifications]
enabled = true
slack_webhook_url = "https://hooks.slack.com/services/T.../B.../xxx"
```

### 3. 채널 등록

NotificationService 초기화 시 `slack_webhook_url`이 설정되어 있으면 SlackChannel을 등록한다. 기존 채널 등록 패턴과 동일.

### 4. Admin UI 반영

Channel Status 카드에 Slack이 자동으로 표시된다 (기존 `svc.getChannels()` 로직 재사용).

## Slack Webhook 설정 가이드

1. https://api.slack.com/apps → Create New App
2. Incoming Webhooks → Activate
3. Add New Webhook to Workspace → 채널 선택
4. Webhook URL 복사 → `config.toml`에 설정

## 재발 방지 테스트

### T-1: SlackChannel 초기화

`slack_webhook_url`이 설정되면 SlackChannel이 정상 초기화되는지 검증.

### T-2: SlackChannel 메시지 전송

모킹된 Webhook URL로 알림 전송 시 올바른 Slack attachment 형식이 전송되는지 검증.

### T-3: 이벤트별 색상 매핑

KILL_SWITCH → red, FAILED → orange, CONFIRMED → green, 기타 → blue 색상이 올바르게 적용되는지 검증.

### T-4: Admin UI Channel Status 표시

Slack이 설정되면 Channel Status에 "slack: Connected"로 표시되는지 검증.

### T-5: slack_webhook_url 미설정 시 무시

`slack_webhook_url`이 없으면 SlackChannel이 등록되지 않고, 기존 채널만 동작하는지 검증.

## 영향 범위

| 항목 | 내용 |
|------|------|
| 신규 파일 | `packages/daemon/src/notifications/channels/slack.ts` |
| 수정 파일 | NotificationService 채널 등록 로직, config 타입 |
| Admin UI | 변경 없음 — 자동 반영 |
| 테스트 | 5건 추가 |
| 하위호환 | 신규 채널 추가, 기존 동작 변경 없음 |

---

*발견일: 2026-02-14*
*마일스톤: v1.4.6*
*상태: OPEN*
*유형: ENHANCEMENT*
*관련: 알림 시스템 (`packages/daemon/src/notifications/`), INotificationChannel 인터페이스*
