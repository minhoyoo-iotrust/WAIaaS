# 446 — DELAY 티어 TX_QUEUED 알림에 Cancel 인라인 키보드가 포함되지 않음

- **유형:** BUG
- **심각도:** MEDIUM
- **등록일:** 2026-03-24
- **수정일:** 2026-03-24

## 현상

DELAY 티어 트랜잭션이 QUEUED 상태로 대기할 때, 텔레그램 알림에 Cancel 인라인 키보드 버튼이 표시되지 않는다. 알림 메시지는 정상적으로 전송되지만 취소 버튼이 없어 텔레그램에서 직접 취소할 수 없다.

## 원인

`buildCancelKeyboard` 함수가 `telegram-keyboard.ts`에 정의되어 있고 테스트(`cancel-ux.test.ts`)도 존재하지만, **실제 알림 전송 시 호출되는 곳이 없다.**

### 현재 상태

| 항목 | 상태 |
|------|------|
| `buildCancelKeyboard` 정의 | ✅ `telegram-keyboard.ts:69` |
| `buildCancelKeyboard` 테스트 | ✅ `cancel-ux.test.ts:193` |
| `buildCancelKeyboard` export (index.ts) | ❌ 누락 |
| `buildCancelKeyboard` import (bot-service) | ❌ 누락 |
| TX_QUEUED 알림에 keyboard 첨부 | ❌ 누락 |
| `handleCancel` 콜백 처리기 | ✅ `telegram-bot-service.ts:623` |
| `cancel:{txId}` 콜백 분기 | ✅ `telegram-bot-service.ts:344` |

키보드 함수와 콜백 처리기는 구현되어 있으나, 알림 메시지에 키보드를 첨부하는 연동이 빠져있다.

## 수정 방안

### 1. buildCancelKeyboard export 추가

```typescript
// infrastructure/telegram/index.ts
export { buildConfirmKeyboard, buildWalletSelectKeyboard, buildApprovalKeyboard, buildCancelKeyboard } from './telegram-keyboard.js';
```

### 2. TX_QUEUED 알림에 Cancel 키보드 첨부

TX_QUEUED 알림 발송 경로에서 텔레그램 메시지에 Cancel 인라인 키보드를 포함해야 한다. 두 가지 접근 가능:

**방법 A: NotificationService → 텔레그램 채널에서 키보드 첨부**

NotificationService가 TX_QUEUED 이벤트를 텔레그램으로 전송할 때, 추가 데이터(`txId`)를 기반으로 Cancel 키보드를 reply_markup으로 포함.

**방법 B: stage4-wait.ts에서 텔레그램 봇에 직접 메시지 전송**

현재 `stage4-wait.ts:35`에서 `notificationService.notify('TX_QUEUED', ...)`를 호출하는데, 별도로 텔레그램 봇 서비스에 Cancel 키보드 포함 메시지를 직접 전송.

### 3. APPROVAL 티어도 확인

APPROVAL 티어의 TX_APPROVAL_REQUIRED 알림에도 Approve/Reject 키보드가 첨부되는지 확인 필요. 같은 패턴의 누락이 있을 수 있음.

## 테스트 항목

### 단위 테스트
- TX_QUEUED 알림 전송 시 텔레그램 메시지에 Cancel 인라인 키보드가 포함되는지
- Cancel 버튼 콜백(`cancel:{txId}`)이 트랜잭션을 CANCELLED로 전환하는지 (이미 테스트됨)

### 통합 테스트 (UAT advanced-07)
- DELAY 티어 TX 생성 → 텔레그램에 Cancel 버튼 표시 → 버튼 터치 → CANCELLED 상태 확인
