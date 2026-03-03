# 229 — 지갑 앱 알림 글로벌 토글이 System 페이지에 숨겨져 있어 발견 불가

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **발견:** v29.10
- **상태:** OPEN

## 증상

Human Wallet Apps 페이지에서 앱을 등록하고 Alerts ON을 켰지만 지갑 앱으로 알림이 오지 않음. 원인은 `signing_sdk.notifications_enabled` 글로벌 토글이 `false`인데, 이 설정이 System 페이지의 Signing SDK 섹션 하단에 숨겨져 있어 사용자가 발견할 수 없음.

## 현재 구조 (문제)

지갑 앱 알림이 작동하려면 **3개 설정 모두 true**여야 함:

| 설정 | 위치 | 역할 |
|------|------|------|
| `signing_sdk.enabled` | System > Signing SDK | 글로벌 — SDK 전체 ON/OFF |
| `signing_sdk.notifications_enabled` | System > Signing SDK (하단) | 글로벌 — 지갑 앱 알림 ON/OFF |
| `alerts_enabled` (앱별) | Human Wallet Apps | 앱별 — 개별 앱의 알림 수신 여부 |

사용자 동선: Human Wallet Apps 에서 앱 등록 + Alerts ON → 알림이 올 거라 기대 → 실제로는 System 페이지의 별도 글로벌 토글을 찾아서 켜야 함.

## 수정 방안

**Human Wallet Apps 페이지에서 지갑 앱 알림 관련 설정을 모두 관리할 수 있도록 통합.**

### 1. Human Wallet Apps 페이지에 글로벌 토글 이동
- `signing_sdk.notifications_enabled` 토글을 Human Wallet Apps 페이지 상단에 배치
- "Wallet App Notifications" 섹션으로 구분하여 글로벌 활성화 + 앱별 설정을 한 곳에서 관리

### 2. System > Signing SDK 섹션에서 알림 토글 제거
- Signing SDK 설정은 서명 관련 설정(enabled, preferred_channel, preferred_wallet, topic prefix)만 유지
- 알림 토글은 Human Wallet Apps로 완전 이동

### 3. 자동 활성화 또는 경고 표시
- 앱 Alerts ON인데 글로벌 토글이 꺼져 있으면 경고 배너 표시
- 예: "⚠️ Wallet App Notifications is disabled. Enable it to receive alerts."
- 또는: 첫 앱의 Alerts를 켤 때 글로벌 토글도 자동 활성화

### 4. 지갑 앱 알림 테스트 버튼
- Human Wallet Apps 페이지에 앱별 "Test Notification" 버튼 추가
- 클릭 시 해당 앱의 `notify_topic`으로 테스트 알림 발송
- 결과(성공/실패)를 즉시 표시하여 설정이 올바른지 확인 가능
- 백엔드: `POST /v1/admin/wallet-apps/:name/test-notification` 엔드포인트 추가

## 영향 범위

- `packages/admin/src/pages/settings.tsx` — Signing SDK 섹션에서 알림 토글 제거
- `packages/admin/src/pages/wallet-apps.tsx` (또는 해당 페이지) — 글로벌 알림 토글 추가 + 경고 배너 + 테스트 버튼
- `packages/daemon/src/api/routes/admin.ts` — 테스트 알림 발송 엔드포인트 추가
- `packages/admin/src/utils/settings-search-index.ts` — 검색 인덱스 경로 갱신

## 테스트 항목

- [ ] Human Wallet Apps 페이지에서 글로벌 알림 토글이 표시되고 저장되는지 확인
- [ ] 토글 OFF 상태에서 앱 Alerts ON일 때 경고 배너가 표시되는지 확인
- [ ] System > Signing SDK 섹션에서 알림 토글이 제거되었는지 확인
- [ ] 글로벌 토글 ON + 앱 Alerts ON 상태에서 실제 알림이 도착하는지 확인
- [ ] 테스트 알림 버튼 클릭 시 해당 앱의 notify_topic으로 알림이 발송되는지 확인
- [ ] 테스트 알림 발송 실패 시 에러 메시지가 표시되는지 확인
- [ ] settings-search-index에서 변경된 경로로 검색 가능한지 확인
