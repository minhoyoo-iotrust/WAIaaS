# #139 telegram.enabled 미제거 — Approval Method가 Telegram Bot 비활성으로 판단

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v27.1
- **상태:** OPEN

## 증상

Telegram Bot이 정상 동작 중(알림 발송 확인)임에도 Admin UI 지갑 상세의 Approval Method에서 "Telegram bot is not enabled"로 표시되어 Telegram Bot / SDK via Telegram 선택 시 경고가 뜬다.

## 원인

이전에 알림 설정을 `notifications.enabled` 하나로 통합했지만, Telegram Bot 서비스의 `telegram.enabled` 설정키가 제거되지 않고 잔존한다.

- `setting-keys.ts:130` — `telegram.enabled` 키 정의 (defaultValue: `'false'`)
- `approval-channel-router.ts:188` — `telegram.enabled === 'true'` 체크
- `hot-reload.ts:384` — `telegram.enabled === 'true'` 체크
- `daemon.ts:600` — `telegram.enabled` 체크
- `wallets.tsx:549` — `telegramEnabled = result['telegram']?.['enabled'] === 'true'` 체크

`telegram.bot_token`이 설정되어 있어도 `telegram.enabled`가 `false`(기본값)이면 Telegram Bot이 비활성으로 판단된다.

## 수정 방향

1. `telegram.enabled` 설정키를 제거
2. Telegram Bot 활성화 조건을 **`telegram.bot_token` 존재 여부만으로** 판단
   - 알림(Notification)과 승인(Approval)은 분리된 시스템이지만 Telegram Bot은 `bot_token` 하나로 양쪽 모두 사용
   - `bot_token`이 설정되어 있으면 알림/승인 모두 가용한 상태로 간주
3. 영향받는 파일 모두 수정:
   - `packages/daemon/src/infrastructure/settings/setting-keys.ts` — `telegram.enabled` 키 제거
   - `packages/daemon/src/services/signing-sdk/approval-channel-router.ts` — `isTelegramBotConfigured()`를 `bot_token` 존재만 체크
   - `packages/daemon/src/infrastructure/settings/hot-reload.ts` — `bot_token` 존재만 체크
   - `packages/daemon/src/lifecycle/daemon.ts` — `bot_token` 존재만 체크
   - `packages/admin/src/pages/wallets.tsx` — `warningCondition`을 `bot_token` configured만 체크, `telegramEnabled` 제거
   - `packages/admin/src/pages/settings.tsx` — telegram.enabled 토글 UI 제거
   - `packages/admin/src/pages/notifications.tsx` — telegram.enabled 토글 UI 제거
4. 설정 마이그레이션: 기존 `telegram.enabled` 값이 있는 경우 무시 처리 (DB key_value_store 잔존 허용)

## 테스트 항목

- [ ] `telegram.bot_token` 설정 시 Telegram Bot 활성화 확인 (approval-channel-router 테스트)
- [ ] `telegram.bot_token` 미설정 시 Telegram Bot 비활성화 확인 (approval-channel-router 테스트)
- [ ] hot-reload로 `telegram.bot_token` 변경 시 Telegram Bot 상태 즉시 반영 확인 (hot-reload 테스트)
- [ ] Admin UI Approval Method warningCondition이 bot_token 기반으로 동작 확인 (wallets 컴포넌트 테스트)
- [ ] Global Fallback에서 bot_token 존재 시 Telegram Bot이 REST보다 우선 선택되는지 확인
