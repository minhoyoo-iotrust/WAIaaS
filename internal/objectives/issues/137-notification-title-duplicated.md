# #137 알림 메시지 제목 중복 표시

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v27.1
- **상태:** FIXED

## 증상

모든 알림 채널(Telegram, Discord, Slack, ntfy)에서 메시지 제목이 두 번 표시된다.

## 원인

`NotificationService.notify()`에서 `NotificationPayload.message`를 `${title}\n${body}`로 조합하여 title이 message에 포함된다. 각 채널은 자체적으로도 제목을 생성하므로 제목이 중복된다.

### 채널별 중복 양상

| 채널 | 자체 제목 | 본문 | 중복 양상 |
|------|----------|------|----------|
| **Telegram** | `message` 첫 줄을 볼드 추출 | `message` 전체 (title+body) | 같은 텍스트가 2번 |
| **Discord** | `eventType` → embed title | `message` (title+body) → description | eventType 제목 + message 안 title |
| **Slack** | `eventType` → attachment title | `message` (title+body) → text | eventType 제목 + message 안 title |
| **ntfy** | `eventType` → HTTP Title 헤더 | `message` (title+body) → body | eventType 제목 + message 안 title |

## 수정 방향

1. `NotificationPayload`에 `title`과 `body` 필드를 분리 추가 (기존 `message`는 하위 호환용 유지 또는 제거)
2. `NotificationService.notify()`에서 `title`과 `body`를 별도 필드로 전달
3. 각 채널의 `send()` 구현에서 `payload.title`을 자체 제목 위치에, `payload.body`를 본문 위치에 사용
4. `notification_logs` 저장 시 `message` 필드에는 `${title}\n${body}` 형태로 유지 (로그 가독성)

### 수정 대상 파일

- `packages/core/src/types/notification.ts` — `NotificationPayload` 타입에 `title`, `body` 추가
- `packages/daemon/src/notifications/notification-service.ts` — payload 조합 방식 변경
- `packages/daemon/src/notifications/channels/telegram.ts` — `payload.title` 볼드, `payload.body` 본문
- `packages/daemon/src/notifications/channels/discord.ts` — embed title에 `payload.title`, description에 `payload.body`
- `packages/daemon/src/notifications/channels/slack.ts` — attachment title에 `payload.title`, text에 `payload.body`
- `packages/daemon/src/notifications/channels/ntfy.ts` — Title 헤더에 `payload.title`, body에 `payload.body`
- 관련 테스트 파일 갱신

## 테스트 항목

- [ ] 각 채널(Telegram, Discord, Slack, ntfy) 메시지에서 제목이 1번만 표시되는지 확인
- [ ] `notification_logs` 테이블의 `message` 컬럼에 title+body가 정상 저장되는지 확인
- [ ] `INotificationChannel` 인터페이스 변경 시 contract test 통과 확인
- [ ] Admin UI 알림 테스트 발송이 정상 동작하는지 확인
