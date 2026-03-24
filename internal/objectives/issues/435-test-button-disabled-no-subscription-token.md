# 435 — Admin UI: Subscription Token 미설정 시 Test 버튼 사전 안내 부재

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** OPEN
- **등록일:** 2026-03-24
- **파일:** `packages/admin/src/pages/human-wallet-apps.tsx`

## 설명

지갑 앱에 Subscription Token이 설정되지 않은 상태에서 Test 버튼을 누르면 서버 에러가 반환된다.
(`"No device registered for this wallet app. Register a device first."`)
사용자는 버튼을 눌러보기 전까지 왜 테스트가 불가능한지 알 수 없다.

## 개선 방안

- Subscription Token이 미설정(`!app.subscription_token`)이면 Test 버튼을 비활성화(disabled)한다.
- 비활성화된 버튼에 툴팁 또는 인라인 힌트를 표시한다.
  - 예: `title="Set subscription token first"` 또는 버튼 옆에 안내 텍스트
- Push Relay URL 미설정 시에도 동일한 사전 안내를 적용한다.

## 테스트 항목

- [ ] Subscription Token 미설정 시 Test 버튼이 disabled 상태인지 확인
- [ ] 비활성 버튼에 마우스 호버 시 안내 툴팁이 표시되는지 확인
- [ ] Subscription Token 설정 후 Test 버튼이 활성화되는지 확인
- [ ] Push Relay URL 미설정 시에도 Test 버튼이 disabled되는지 확인
