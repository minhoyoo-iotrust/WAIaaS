# 025: 알림 로그에 실제 발송 메시지 내용 미저장 — Admin UI에서 확인 불가

## 심각도

**LOW** — 알림 발송 자체에는 영향 없으나, 관리자가 어떤 메시지가 전송되었는지 확인할 수 없다.

## 증상

- Admin UI Delivery Log에서 Event Type, Channel, Status, Time만 표시
- 실제 Telegram/Discord/ntfy로 전송된 메시지 내용을 확인할 수 없음
- 알림 발송 문제 디버깅 시 메시지 원문을 확인하려면 외부 채널에서 직접 확인해야 함

## 원인

`notification_logs` 테이블에 메시지 내용을 저장하는 컬럼이 없다:

```sql
-- 현재 스키마
notification_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  wallet_id TEXT,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,       -- sent / failed
  error TEXT,                 -- 실패 시 에러
  created_at INTEGER NOT NULL
  -- message 컬럼 없음
)
```

## 수정안: message 컬럼 추가

### 1. DB 마이그레이션

```sql
ALTER TABLE notification_logs ADD COLUMN message TEXT;
```

- 기존 레코드의 `message`는 `NULL` (마이그레이션 이전 로그)
- 신규 레코드부터 발송된 메시지 원문 저장

### 2. 알림 발송 로직 변경

알림을 전송할 때 실제 보낸 메시지 텍스트를 `notification_logs`에 함께 저장한다.

```typescript
// 변경 전
await insertNotificationLog({ eventType, walletId, channel, status });

// 변경 후
await insertNotificationLog({ eventType, walletId, channel, status, message: formattedMessage });
```

### 3. Admin UI 변경

Delivery Log 테이블에서 행 클릭 시 메시지 내용을 표시한다.

| 표시 방식 | 설명 |
|----------|------|
| 행 확장(expand) | 행 클릭 시 아래에 메시지 내용 펼침 |
| 모달 | 행 클릭 시 메시지 내용 모달 표시 |

행 확장 방식 채택 — 기존 Table 컴포넌트에 `expandable` 기능 추가 또는 별도 렌더링.

```
Delivery Log
  | Event Type            | Channel  | Status | Time       |
  |-----------------------|----------|--------|------------|
  | TRANSACTION_CONFIRMED | telegram | sent   | 2026-02-14 |
  └─ Message: "[WAIaaS] Transaction confirmed: 0.01 ETH sent to 0xAbC...789 (tx: 0x123...)"
  | LARGE_TRANSFER        | discord  | sent   | 2026-02-14 |
  └─ Message: "[WAIaaS] Large transfer detected: 500 USDC from wallet my-evm-wallet"
```

마이그레이션 이전 로그는 `message`가 `NULL`이므로 "Message not recorded" 표시.

### 4. API 변경

`GET /v1/admin/notifications/log` 응답에 `message` 필드 추가:

```json
{
  "id": "uuid",
  "eventType": "TRANSACTION_CONFIRMED",
  "walletId": "uuid",
  "channel": "telegram",
  "status": "sent",
  "error": null,
  "message": "[WAIaaS] Transaction confirmed: 0.01 ETH sent to 0xAbC...789",
  "createdAt": 1739520000
}
```

## 재발 방지 테스트

### T-1: 신규 알림 로그에 message 저장

알림 발송 후 `notification_logs` 테이블에서 해당 레코드의 `message` 컬럼이 실제 발송된 메시지 내용과 일치하는지 검증.

### T-2: API 응답에 message 포함

`GET /v1/admin/notifications/log` 응답의 각 항목에 `message` 필드가 포함되는지 검증.

### T-3: 마이그레이션 이전 로그 하위호환

마이그레이션 이전에 생성된 로그 레코드의 `message`가 `null`로 반환되고, Admin UI에서 "Message not recorded"로 표시되는지 검증.

### T-4: Admin UI 메시지 표시

Delivery Log 테이블에서 행 클릭 시 메시지 내용이 펼쳐지는지 검증.

## 영향 범위

| 항목 | 내용 |
|------|------|
| DB 마이그레이션 | `notification_logs`에 `message TEXT` 컬럼 추가 |
| 수정 파일 | 알림 발송 로직 (message 저장), Admin API (응답 필드), Admin UI (행 확장) |
| 테스트 | 4건 추가 |
| 하위호환 | 기존 로그는 `message = NULL`, 신규 로그부터 저장 |

---

*발견일: 2026-02-14*
*마일스톤: v1.4.6*
*상태: OPEN*
*유형: ENHANCEMENT*
*관련: Admin UI 알림 패널 (`packages/admin/src/pages/notifications.tsx`), `notification_logs` 테이블*
