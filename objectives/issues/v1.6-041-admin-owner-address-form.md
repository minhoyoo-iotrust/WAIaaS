# v1.6-041: Admin UI 월렛 상세에서 Owner 주소 설정 불가 — REST API 의존

## 유형: MISSING

## 심각도: LOW

## 현상

Admin UI 월렛 상세 페이지에서 Owner Address와 Owner State가 표시되지만, Owner 주소를 설정/변경하는 폼이 없음. `PUT /v1/wallets/:id/owner` API는 구현 완료되어 있으나 Admin UI에서 호출하는 UI가 미구현이라 curl 또는 CLI로만 가능.

WalletConnect 연결(Connect Wallet 버튼)은 Admin UI에서 가능하지만, 그 전 단계인 Owner 주소 등록이 Admin UI에서 불가하여 DX 단절이 발생.

유사 사례: #013 (Admin UI에서 MCP 토큰 발급 불가 — CLI 의존) → v1.4.1에서 FIXED.

## 수정 방안

월렛 상세 페이지(`wallets.tsx` WalletDetailView)의 Owner Address 영역에 설정/변경 폼 추가:

1. Owner State가 `NONE` 또는 `GRACE`일 때 "Set Owner" 버튼 표시
2. 버튼 클릭 → 인라인 입력 폼 (EVM: `0x...` / Solana: Base58 주소 입력)
3. `PUT /v1/wallets/:id/owner` 호출 → ownerState 갱신 표시
4. `LOCKED` 상태에서는 비활성화 (변경 불가 안내)

### 변경 대상 파일

- `packages/admin/src/pages/wallets.tsx` — WalletDetailView 컴포넌트
- `packages/admin/src/__tests__/wallets.test.tsx` — Owner 설정 폼 테스트 추가

### 기존 패턴 참조

- 같은 페이지의 이름 편집 (`startEdit` / `handleSaveName`) 패턴 재사용
- MCP Setup 버튼 (`handleMcpSetup`) 패턴 참조

### 테스트 시나리오

| # | 시나리오 | 검증 방법 |
|---|---------|----------|
| 1 | NONE 상태에서 "Set Owner" 버튼 표시 | ownerState=NONE 월렛 렌더 → 버튼 존재 assert |
| 2 | 주소 입력 후 저장 → API 호출 | 폼 입력 + 클릭 → apiPut 호출 + ownerState GRACE 갱신 assert |
| 3 | GRACE 상태에서 주소 변경 가능 | ownerState=GRACE 월렛 렌더 → 버튼 존재 + 변경 성공 assert |
| 4 | LOCKED 상태에서 버튼 비활성화 | ownerState=LOCKED 월렛 렌더 → 버튼 미표시 또는 disabled assert |
| 5 | 잘못된 주소 입력 시 에러 표시 | 유효하지 않은 주소 입력 → API 400 → 에러 토스트 assert |

## 발견

- Owner + WalletConnect E2E 테스트 시 Admin UI만으로 전체 플로우를 완료할 수 없음을 확인
