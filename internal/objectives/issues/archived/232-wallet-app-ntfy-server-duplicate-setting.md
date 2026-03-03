# #232 Human Wallet Apps 페이지 ntfy Server URL 중복 설정 제거

- **유형:** BUG
- **심각도:** MEDIUM
- **상태:** FIXED
- **마일스톤:** —

## 현상

Human Wallet Apps 페이지에 ntfy Server URL 설정 필드가 존재하지만, 존재하지 않는 설정 키(`signing_sdk.ntfy_server`)를 읽고 쓴다. 실제 데몬의 모든 서비스(NtfySigningChannel, WalletNotificationChannel, SignRequestBuilder, NtfyChannel)는 `notifications.ntfy_server` 키를 사용하므로, Human Wallet Apps에서 URL을 변경해도 실제 동작에 전혀 반영되지 않는다.

Notifications 페이지의 Settings 탭에서 동일 설정이 올바른 키(`notifications.ntfy_server`)로 이미 제공되고 있어 중복이다.

## 원인

- `human-wallet-apps.tsx`가 `signing_sdk.ntfy_server` (미등록 키)를 읽고 저장
- `wallet-apps.ts` test-notification 핸들러도 `signing_sdk.ntfy_server`를 참조
- SSoT 키는 `notifications.ntfy_server` (setting-keys.ts:65에 등록됨)

## 수정 범위

### 1. Admin UI (`packages/admin/src/pages/human-wallet-apps.tsx`)

- "Push Relay Server" 섹션 전체 제거 (ntfy Server URL 입력 + Save 버튼)
- 관련 상태 변수 제거: `ntfyServer`, `ntfyServerOriginal`, `ntfySaving`
- `handleSaveNtfyServer` 핸들러 제거
- `fetchSettings`에서 `signing_sdk.ntfy_server` 읽기 제거 (sdkEnabled, notificationsEnabled 읽기는 유지)
- 미사용 import 정리 (`SettingsData` 타입 등)

### 2. Daemon (`packages/daemon/src/api/routes/wallet-apps.ts`)

- test-notification 핸들러에서 `signing_sdk.ntfy_server` → `notifications.ntfy_server`로 변경 (line 236)

### 3. Admin 테스트 (`packages/admin/src/__tests__/human-wallet-apps.test.tsx`)

- T-HWUI-07 테스트 제거 (ntfy server URL displayed)
- T-HWUI-13 mock 데이터에서 `ntfy_server` 필드 제거
- T-HWUI-15 assertion에서 빈 body `{}` 제거 (이미 코드 수정 완료)
- `mockSettings`에서 `ntfy_server` 필드 제거

### 4. Daemon 테스트 (`packages/daemon/src/__tests__/wallet-app-test-notification.test.ts`)

- `mockSettingsService`에서 `signing_sdk.ntfy_server` → `notifications.ntfy_server`로 변경

## 테스트 항목

- [ ] Notifications 페이지에서 ntfy Server URL 변경 후 test-notification 발송 시 변경된 URL 사용 확인
- [ ] Human Wallet Apps 페이지에 ntfy Server URL 설정 섹션이 더 이상 표시되지 않음 확인
- [ ] test-notification 핸들러가 `notifications.ntfy_server` 키에서 URL을 읽는지 확인
- [ ] 기존 테스트 통과 (T-HWUI-12~16 등)
