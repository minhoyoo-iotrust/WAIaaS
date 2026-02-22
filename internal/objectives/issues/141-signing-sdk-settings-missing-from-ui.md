# #141 Signing SDK 설정이 리뉴얼된 Admin UI에서 접근 불가

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v27.1
- **상태:** OPEN

## 증상

Admin UI 메뉴 재구성(v2.3) 이후 `/settings` 페이지가 제거되고 `/system`으로 대체되었으나, Signing SDK 설정 섹션이 `/system`에 포함되지 않아 UI에서 접근할 수 없다.

접근 불가한 설정:

- `signing_sdk.enabled` — SDK 활성화 토글
- `signing_sdk.request_expiry_min` — 서명 요청 만료 시간
- `signing_sdk.preferred_channel` — 선호 채널 (ntfy / telegram)
- `signing_sdk.preferred_wallet` — 선호 지갑 앱
- `signing_sdk.ntfy_request_topic_prefix` — ntfy 요청 토픽 프리픽스
- `signing_sdk.ntfy_response_topic_prefix` — ntfy 응답 토픽 프리픽스
- `signing_sdk.notifications_enabled` — 지갑 앱 알림 활성화
- `signing_sdk.notify_categories` — 알림 카테고리 필터

## 원인

`/settings` 페이지(`settings.tsx`)에 `SigningSDKSettings` 컴포넌트가 존재하지만, 라우터(`layout.tsx:71`)가 `/settings` 접근 시 `/dashboard`로 리다이렉트한다. `/system` 페이지(`system.tsx`)에는 해당 섹션이 포함되지 않았다.

## 수정 방향

Signing SDK 설정을 적절한 페이지에 배치:

- **Wallets 페이지** — 지갑 오너 승인과 직접 관련되므로 Wallets 페이지의 탭 또는 섹션으로 이동 검토
- **Notifications 페이지** — Wallet App Notifications 하위 그룹은 알림 설정이므로 Notifications 페이지로 이동 검토
- **System 페이지** — 현재 system.tsx에 섹션 추가

### 수정 대상 파일

- `packages/admin/src/pages/system.tsx` 또는 해당 페이지 — Signing SDK 설정 섹션 추가
- `packages/admin/src/pages/settings.tsx` — 데드 코드 정리 검토

## 테스트 항목

- [ ] Signing SDK 설정이 Admin UI에서 조회/수정 가능한지 확인
- [ ] Wallet App Notifications 카테고리 필터가 UI에서 설정 가능한지 확인
- [ ] 설정 변경 후 Save → hot-reload가 정상 동작하는지 확인
