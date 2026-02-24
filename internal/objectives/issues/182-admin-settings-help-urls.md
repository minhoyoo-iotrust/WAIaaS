# #182 Admin Settings 외부 서비스 도움 URL 추가

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** —
- **상태:** OPEN

---

## 증상

Admin Settings 페이지에서 외부 API 키, 프로젝트 ID, 봇 토큰 등을 설정할 때 해당 값을 어디서 발급/확인할 수 있는지 안내가 없음.

- WalletConnect만 `docsUrl`이 있고, 나머지 섹션은 도움 링크가 전혀 없음
- 사용자가 Ntfy, Telegram Bot Token, CoinGecko API Key, 0x API Key, LI.FI API Key 등의 값을 어디서 얻는지 별도로 검색해야 함

---

## 대상 섹션

| 섹션 | 설정 항목 | 필요한 도움 URL |
|------|-----------|-----------------|
| Notifications — Ntfy | Server URL, Topic | ntfy 공식 문서 |
| Notifications — Telegram | Bot Token, Chat ID | Telegram BotFather 가이드 |
| Notifications — Slack | Webhook URL | Slack Incoming Webhooks 가이드 |
| Actions — 0x Swap | API Key | 0x Dashboard |
| Actions — LI.FI | API Key | LI.FI Developer Portal |
| Actions — CoinGecko | API Key | CoinGecko API 대시보드 |
| Wallets — WalletConnect | Project ID | (이미 있음 — 기준 참고) |
| Push Relay | Relay URL | Push Relay 배포 가이드 |

---

## 수정 방안

### 1. ActionProviderMetadataSchema에 `docsUrl` 필드 추가

- `packages/core/src/actions/` 내 ActionProviderMetadataSchema에 `docsUrl?: string` 추가
- 각 프로바이더 메타데이터에 공식 문서 URL 기입
- GET /v1/actions/providers 응답에 docsUrl 포함

### 2. Admin UI 각 설정 섹션에 info-box 안내 링크 추가

- 외부 서비스 자격증명 입력 필드 위에 info-box 컴포넌트 배치
- "이 값은 [서비스명]에서 발급받을 수 있습니다. [가이드 보기 ↗]" 형식
- `target="_blank" rel="noopener noreferrer"` 속성 필수

### 3. 알림 채널 설정 섹션에도 동일 패턴 적용

- Ntfy, Telegram, Slack 각 섹션에 설정 가이드 링크 추가

---

## 관련 파일

- `packages/core/src/actions/types.ts` — ActionProviderMetadataSchema
- `packages/core/src/actions/registry.ts` — ActionProviderRegistry
- `packages/admin/src/pages/actions.tsx` — Actions 설정 페이지
- `packages/admin/src/pages/notifications.tsx` — 알림 채널 설정
- `packages/admin/src/pages/wallets.tsx` — WalletConnect 설정 (기존 docsUrl 참고)
- `packages/admin/src/pages/system.tsx` — Push Relay 설정

---

## 테스트 항목

- [ ] ActionProviderMetadataSchema에 docsUrl 옵셔널 필드 추가 후 기존 스키마 계약 테스트 통과
- [ ] GET /v1/actions/providers 응답에 docsUrl 포함 확인 (API 응답 테스트)
- [ ] docsUrl 미설정 프로바이더에서 undefined 반환 확인 (하위 호환성)
- [ ] Admin UI Actions 페이지에서 docsUrl 있는 프로바이더에 info-box 렌더링 확인
- [ ] Admin UI Notifications 각 채널(Ntfy, Telegram, Slack)에 도움 링크 렌더링 확인
- [ ] 모든 외부 링크에 `target="_blank"` + `rel="noopener noreferrer"` 속성 확인
- [ ] 도움 URL이 없는 섹션에서 info-box 미표시 확인 (조건부 렌더링)
