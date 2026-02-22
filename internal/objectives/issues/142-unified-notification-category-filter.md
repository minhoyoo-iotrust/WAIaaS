# #142 알림 카테고리 필터 통합 — 일반 채널 + 지갑 앱 채널 단일 설정

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v27.1
- **상태:** OPEN

## 현재 상태

- 지갑 앱(Signing SDK) 알림에만 카테고리 필터가 존재 (`signing_sdk.notify_categories`)
- 일반 알림 채널(Telegram, Discord, Slack, ntfy)은 모든 이벤트를 무조건 발송
- 사용자가 받고 싶은 알림 종류를 선택할 수 없음

## 수정 방향

1. `signing_sdk.notify_categories`를 `notifications.notify_categories`로 통합
2. 일반 채널과 지갑 앱 채널 모두 동일한 필터 적용
3. `NotificationService.notify()`에서 `EVENT_CATEGORY_MAP` 기반으로 카테고리 필터링 수행
4. Admin UI Notifications 페이지에 카테고리 선택 UI 추가

### 6개 카테고리 (기존 EVENT_CATEGORY_MAP 그대로 활용)

| 카테고리 | 이벤트 |
|----------|--------|
| Transaction | TX_REQUESTED, TX_QUEUED, TX_SUBMITTED, TX_CONFIRMED, TX_FAILED, TX_CANCELLED, TX_DOWNGRADED_DELAY, TX_APPROVAL_REQUIRED, TX_APPROVAL_EXPIRED, TX_INCOMING |
| Policy | POLICY_VIOLATION, CUMULATIVE_LIMIT_WARNING |
| Security Alert | WALLET_SUSPENDED, KILL_SWITCH_ACTIVATED, KILL_SWITCH_RECOVERED, KILL_SWITCH_ESCALATED, AUTO_STOP_TRIGGERED, TX_INCOMING_SUSPICIOUS |
| Session | SESSION_EXPIRING_SOON, SESSION_EXPIRED, SESSION_CREATED, SESSION_WALLET_ADDED, SESSION_WALLET_REMOVED |
| Owner | OWNER_SET, OWNER_REMOVED, OWNER_VERIFIED |
| System | DAILY_SUMMARY, LOW_BALANCE, APPROVAL_CHANNEL_SWITCHED, UPDATE_AVAILABLE |

### 수정 대상 파일

- `packages/daemon/src/infrastructure/settings/setting-keys.ts` — `notifications.notify_categories` 키 추가, `signing_sdk.notify_categories` 제거
- `packages/daemon/src/notifications/notification-service.ts` — `notify()`에 카테고리 필터링 추가
- `packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts` — `signing_sdk.notify_categories` → `notifications.notify_categories` 참조 변경
- `packages/admin/src/pages/notifications.tsx` — 카테고리 선택 UI 추가
- `packages/admin/src/pages/settings.tsx` — `signing_sdk.notify_categories` UI 데드 코드 제거 (#141과 연계)
- 관련 테스트 파일 갱신

### 동작 규칙

- 빈 배열(`[]`) = 모든 카테고리 수신 (기존 동작 유지)
- 특정 카테고리 선택 시 해당 카테고리만 수신
- BROADCAST_EVENTS(KILL_SWITCH_ACTIVATED 등)는 카테고리 필터와 무관하게 항상 발송

## 테스트 항목

- [ ] 카테고리 필터 설정 시 해당 카테고리 이벤트만 발송되는지 확인 (notification-service 테스트)
- [ ] 빈 배열일 때 모든 이벤트가 발송되는지 확인
- [ ] BROADCAST_EVENTS는 필터와 무관하게 항상 발송되는지 확인
- [ ] 지갑 앱 채널도 동일한 필터를 적용하는지 확인 (wallet-notification-channel 테스트)
- [ ] Admin UI Notifications 페이지에서 카테고리 선택/해제가 정상 동작하는지 확인
- [ ] hot-reload로 카테고리 변경 시 즉시 반영되는지 확인
