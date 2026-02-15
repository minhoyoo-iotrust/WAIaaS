# 029: Admin UI 알림 테스트 시 대상 채널이 불명확 — 채널 선택 UI 없음

## 심각도

**LOW** — 알림 테스트 기능 자체에는 영향 없으나, 어떤 채널로 테스트 메시지가 전송되는지 관리자가 알 수 없다.

## 증상

- "Send Test" 버튼을 누르면 어떤 채널로 보내는지 사전 안내 없음
- 모든 활성 채널에 일괄 전송되지만 이를 명시하지 않음
- 특정 채널만 선택적으로 테스트할 수 없음

## 현재 동작

```
Send Test 클릭
  → POST /v1/admin/notifications/test (channel 미지정)
  → 서버: 모든 활성 채널에 일괄 전송
  → 응답: [{ channel: 'telegram', success: true }, { channel: 'discord', success: false }]
  → UI: 결과만 표시 (사전 안내 없음)
```

## 수정안

### 1. 채널별 개별 테스트 버튼

Channel Status 카드에 각 채널별 "Test" 버튼을 추가한다:

```
Channel Status
  ┌─────────────────────────────────────┐
  │ Telegram        Connected  [Test]   │
  ├─────────────────────────────────────┤
  │ Discord         Connected  [Test]   │
  ├─────────────────────────────────────┤
  │ ntfy            Not Configured      │
  └─────────────────────────────────────┘

  [Test All Channels]
```

| 버튼 | 동작 |
|------|------|
| 개별 [Test] | `POST /v1/admin/notifications/test` + `{ channel: 'telegram' }` |
| [Test All Channels] | `POST /v1/admin/notifications/test` + `{}` (기존 동작) |

### 2. 전송 전 대상 표시

"Test All Channels" 클릭 시 전송 전에 대상 채널을 표시:

```
Sending test to: Telegram, Discord
```

### 3. 백엔드 변경

변경 없음 — 서버는 이미 `channel` 파라미터로 개별 채널 테스트를 지원:

```typescript
// admin.ts:500-504 — 이미 구현됨
const body = await c.req.json().catch(() => ({})) as { channel?: string };
const allChannels = svc.getChannels();
const targetChannels = body.channel
  ? allChannels.filter((ch) => ch.name === body.channel)
  : allChannels;
```

## 재발 방지 테스트

### T-1: 개별 채널 테스트 버튼

Telegram 채널의 [Test] 버튼 클릭 시 Telegram 채널만 테스트되고 결과가 표시되는지 검증.

### T-2: 전체 채널 테스트

[Test All Channels] 버튼 클릭 시 모든 활성 채널에 테스트가 전송되는지 검증.

### T-3: 비활성 채널 테스트 버튼 미표시

"Not Configured" 상태의 채널에는 [Test] 버튼이 표시되지 않는지 검증.

## 영향 범위

| 항목 | 내용 |
|------|------|
| 수정 파일 | `packages/admin/src/pages/notifications.tsx` (채널별 테스트 버튼 + 대상 표시) |
| 백엔드 변경 | 없음 — 기존 `channel` 파라미터 활용 |
| 테스트 | 3건 추가 |
| 하위호환 | UI 변경만, 기존 기능 유지 |

---

*발견일: 2026-02-14*
*마일스톤: v1.4.6*
*상태: OPEN*
*유형: ENHANCEMENT*
*관련: Admin UI 알림 (`packages/admin/src/pages/notifications.tsx`), 이슈 028 (SYSTEM_LOCKED 에러)*
