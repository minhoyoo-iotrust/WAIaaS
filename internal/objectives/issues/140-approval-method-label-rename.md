# #140 Approval Method 라벨에서 "SDK" 용어를 "Wallet App"으로 변경

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** v27.1
- **상태:** OPEN

## 증상

Admin UI 지갑 상세의 Approval Method 선택지에 "SDK via ntfy", "SDK via Telegram"으로 표시되어 사용자가 의미를 직관적으로 이해하기 어렵다. 또한 Telegram이 "SDK via Telegram"과 "Telegram Bot" 두 곳에 등장하여 혼동을 준다.

## 수정 방향

사용자 관점의 라벨로 변경:

| 현재 | 변경 | 설명 변경 |
|------|------|-----------|
| SDK via ntfy | **Wallet App (ntfy)** | Push sign request to wallet app via ntfy |
| SDK via Telegram | **Wallet App (Telegram)** | Send sign request to wallet app via Telegram link |
| Telegram Bot | Telegram Bot (유지) | — |
| WalletConnect | WalletConnect (유지) | — |
| REST API | REST API (유지) | — |

Auto (Global Fallback)의 우선순위 설명도 동일하게 갱신:
- 변경 전: `SDK ntfy > SDK Telegram > WalletConnect > Telegram Bot > REST`
- 변경 후: `Wallet App (ntfy) > Wallet App (Telegram) > WalletConnect > Telegram Bot > REST`

### 수정 대상 파일

- `packages/admin/src/pages/wallets.tsx` — `APPROVAL_METHOD_OPTIONS` 라벨/설명 변경
- `packages/daemon/src/services/signing-sdk/approval-channel-router.ts` — 주석 갱신
- 관련 테스트 파일의 스냅샷/문자열 갱신

### 변경하지 않는 것

- DB 값(`sdk_ntfy`, `sdk_telegram`) 및 API 응답의 `approval_method` enum — 내부 식별자는 유지
- `ApprovalMethod` 타입 정의 — 코드 레벨 변경 없음

## 테스트 항목

- [ ] Admin UI Approval Method 라디오 버튼에 변경된 라벨이 표시되는지 확인 (wallets 컴포넌트 테스트)
- [ ] Auto 모드 설명 텍스트에 변경된 우선순위 명칭이 반영되는지 확인
- [ ] API 응답의 approval_method 값이 기존과 동일한지 확인 (하위 호환)
