# 432 — Admin UI: 등록된 지갑 앱의 Push Relay URL 수정 불가

- **유형:** MISSING
- **심각도:** LOW
- **상태:** OPEN
- **발견일:** 2026-03-24

## 현상

Admin UI의 Registered Apps 패널에서 이미 등록된 지갑 앱의 Push Relay URL이 읽기 전용 텍스트로만 표시되어 수정할 수 없다.

## 기대 동작

등록 후에도 Push Relay URL을 인라인 편집으로 변경할 수 있어야 한다. Subscription Token과 동일한 패턴(Edit/Clear/Set 버튼)으로 수정 가능해야 한다.

## 원인 분석

- 백엔드 PUT `/v1/admin/wallet-apps/:id` API는 이미 `push_relay_url` 필드 업데이트를 지원함 (`wallet-apps.ts:186`)
- Admin UI (`human-wallet-apps.tsx:423-431`)에서 Push Relay URL을 `<code>` 태그로 읽기 전용 표시만 하고 있음
- Subscription Token은 `subTokenEditing` / `subTokenSaving` 시그널과 인라인 편집 UI가 구현되어 있으나, Push Relay URL에는 동일 패턴이 적용되지 않음

## 수정 방안

1. `pushRelayEditing` / `pushRelaySaving` 시그널 추가
2. `handleSetPushRelayUrl` 핸들러 추가 (PUT API 호출)
3. Push Relay URL 표시 영역을 Subscription Token과 동일한 인라인 편집 UI로 교체:
   - URL이 있을 때: 현재 URL 표시 + Edit / Clear 버튼
   - 편집 중일 때: 텍스트 입력 + Save / Cancel 버튼
   - URL이 없을 때: "Not configured" + Set 버튼

## 영향 범위

- `packages/admin/src/pages/human-wallet-apps.tsx` — UI 수정
- `packages/admin/src/__tests__/human-wallet-apps.test.tsx` — 테스트 추가

## 테스트 항목

1. Push Relay URL이 설정된 앱에서 Edit 버튼 클릭 → 인라인 입력 폼 표시
2. 새 URL 입력 후 Save → PUT API 호출 및 UI 갱신 확인
3. Clear 버튼 클릭 → URL 제거 (빈 문자열로 업데이트)
4. URL 미설정 앱에서 Set 버튼 클릭 → 입력 폼 표시
5. Cancel 클릭 → 편집 취소, 원래 값 복원
