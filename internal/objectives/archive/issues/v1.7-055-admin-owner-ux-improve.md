# v1.7-055: Admin UI Owner 지갑 UX 개선 — 가시성 및 안내 강화

## 유형: ENHANCEMENT
## 상태: FIXED

## 심각도: MEDIUM

## 현상

Owner 지갑 설정이 WAIaaS의 핵심 보안 기능임에도, Admin UI에서 충분히 눈에 띄지 않음:

1. **월렛 목록 페이지**: Owner 등록 상태를 확인할 수 없어 미등록 월렛 식별 불가
2. **월렛 상세 페이지**: Owner Address가 기본 정보 DetailRow에 편집 아이콘 하나로 끼어 있어 발견하기 어려움
3. **안내 부재**: Owner 지갑이 무엇인지, 왜 설정해야 하는지 사용자 안내가 없음

## 수정 방안

### 1. 월렛 목록 테이블에 Owner State 컬럼 추가

- `WALLET_COLUMNS`에 `ownerState` 컬럼 추가 (Badge 렌더)
- NONE/GRACE/LOCKED 상태를 색상 뱃지로 한눈에 확인 가능
- Owner Address는 상세 페이지에서 확인 (목록에는 상태만 표시)

**API 변경 필요**: `GET /v1/wallets` 응답에 `ownerAddress`, `ownerState` 필드 추가
- `WalletCrudResponseSchema`에 `ownerAddress: z.string().nullable()`, `ownerState: z.enum(['NONE', 'GRACE', 'LOCKED'])` 추가
- 목록 핸들러에서 `resolveOwnerState()` 호출하여 각 월렛의 ownerState 계산

### 2. 월렛 상세 페이지에서 Owner 섹션 분리 + WalletConnect 통합

현재 Owner Address/State가 기본 정보 DetailRow에 섞여 있고, WalletConnect가 별도 섹션으로 분리되어 있음. Owner 지갑 설정 → WalletConnect 연결이 하나의 플로우이므로 같은 섹션으로 통합:

```
<h3>Owner Wallet</h3>
┌─────────────────────────────────────────────┐
│  Address: 0x742d...5f2b  [Copy] [Edit]      │
│  State:   GRACE (뱃지)                       │
│  Verified: No                                │
│                                              │
│  WalletConnect                               │
│  Status: Connected (Peer: D'CENT)            │
│  Chain ID: eip155:11155111                   │
│  Expires: 2026-02-18 09:00                   │
│  [Disconnect]                                │
└─────────────────────────────────────────────┘
```

- 기본 정보 영역에서 Owner Address / Owner State 행 제거
- 기존 WalletConnect 섹션을 Owner 섹션 안의 하위 영역으로 이동
- 설정 동선: 주소 등록 → WalletConnect 연결이 위→아래로 자연스럽게 이어짐
- 좌측 메뉴의 WalletConnect 오버뷰 페이지(`/admin/walletconnect`)는 전체 월렛 WC 현황 조회용으로 별도 유지

### 3. Owner 미등록 시 안내 UI 추가

Owner State가 `NONE`일 때 info callout 표시:

```
ℹ️ Owner 지갑이란?
Owner 지갑을 등록하면 고액 전송 시 서명 승인(APPROVAL 정책)을 활성화할 수 있습니다.
WalletConnect로 D'CENT, MetaMask 등 외부 지갑을 연결하여 트랜잭션을 직접 승인하세요.
[Owner 주소 등록하기]
```

- `NONE` 상태에서만 표시 (GRACE/LOCKED에서는 숨김)
- 버튼 클릭 시 주소 입력 폼으로 전환
- TERMINATED 월렛에서는 표시하지 않음

### 변경 대상 파일

**API (백엔드):**
- `packages/daemon/src/api/routes/openapi-schemas.ts` — `WalletCrudResponseSchema`에 ownerAddress, ownerState 추가
- `packages/daemon/src/api/routes/wallets.ts` — 목록 핸들러에 resolveOwnerState 호출 및 응답 필드 추가

**Admin UI (프론트엔드):**
- `packages/admin/src/pages/wallets.tsx` — 목록 컬럼 추가, 상세 Owner 섹션 분리, 안내 callout 추가

**테스트:**
- `packages/admin/src/__tests__/wallets.test.tsx` — Owner 컬럼 렌더, 섹션 분리, NONE 안내 표시 테스트
- `packages/daemon/src/__tests__/api-contract.test.ts` — 목록 응답 스키마 변경 반영

### 테스트 시나리오

| # | 시나리오 | 검증 방법 |
|---|---------|----------|
| 1 | 목록에서 Owner State 뱃지 표시 | ownerState=NONE 월렛 렌더 → NONE 뱃지 존재 assert |
| 2 | 상세에서 Owner 섹션 별도 렌더 | 월렛 상세 렌더 → `<h3>` Owner 섹션 존재 assert |
| 6 | Owner 섹션 안에 WalletConnect 표시 | 월렛 상세 렌더 → Owner 섹션 내 WC 상태 존재 assert |
| 3 | NONE 상태에서 안내 callout 표시 | ownerState=NONE → info callout 존재 assert |
| 4 | GRACE 상태에서 안내 callout 미표시 | ownerState=GRACE → info callout 미존재 assert |
| 5 | 목록 API에 ownerState 포함 | GET /v1/wallets → items[0].ownerState 존재 assert |

## 발견

- WalletConnect 수동 테스트 중 Owner 설정 UI가 눈에 띄지 않아 발견
