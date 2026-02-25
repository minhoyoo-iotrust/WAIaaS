# 154 — Balance Monitoring 설정을 Notifications 페이지로 이동

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** FIXED
- **마일스톤:** v28.1

## 설명

Balance Monitoring 설정이 현재 **Wallets > Monitoring 탭**에 위치하는데, 잔액 부족 알림과 직접 관련된 기능이므로 **Notifications 페이지의 탭**으로 이동하는 것이 더 직관적이다.

## 현재 동작

- **Wallets > Monitoring 탭**에 5개 설정 존재:
  - `monitoring.enabled` — 모니터링 ON/OFF
  - `monitoring.check_interval_sec` — 잔액 확인 주기 (60~86,400초)
  - `monitoring.low_balance_threshold_sol` — SOL 임계값
  - `monitoring.low_balance_threshold_eth` — ETH 임계값
  - `monitoring.cooldown_hours` — 재알림 쿨다운 (1~168시간)
- 잔액 부족 시 `LOW_BALANCE` 이벤트가 Notification 채널(Telegram, Slack 등)을 통해 발송됨
- 사용자가 알림 관련 설정을 찾을 때 Wallets 페이지에 있을 것이라 직관적으로 예상하기 어려움

## 기대 동작

- **Notifications 페이지에 "Balance Monitor" 탭** 추가 (기존 Channels & Logs / Telegram Users / Settings 옆)
- Wallets 페이지에서 Monitoring 탭 제거
- 기존 5개 설정 필드를 그대로 이동
- dirty guard, hot-reload 동작 유지
- Settings Search 인덱스 경로 업데이트 (`/wallets` → `/notifications`, tab: `'monitoring'` → `'balance'`)

## 변경 대상 파일

| 파일 | 작업 |
|------|------|
| `pages/notifications.tsx` | Balance Monitor 탭 추가, 설정 UI 이동 |
| `pages/wallets.tsx` | Monitoring 탭 제거 |
| `utils/settings-search-index.ts` | monitoring 5항목 경로 변경 |
| `__tests__/wallets-coverage.test.tsx` | monitoring 관련 테스트 제거/이동 |
| `__tests__/notifications.test.tsx` | Balance Monitor 탭 테스트 추가 |

모든 파일은 `packages/admin/src/` 기준.

## 테스트 항목

1. Notifications 페이지에 "Balance Monitor" 탭 렌더링 확인
2. 5개 설정 필드 정상 표시 및 저장
3. dirty guard 동작 (탭 전환 시 미저장 경고)
4. hot-reload 동작 (저장 후 즉시 반영)
5. Wallets 페이지에서 Monitoring 탭 제거 확인
6. Settings Search에서 balance monitoring 검색 시 Notifications 페이지로 이동
