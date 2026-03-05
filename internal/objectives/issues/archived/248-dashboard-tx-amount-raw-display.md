# #248 Admin 대시보드 Recent Activity 트랜잭션 금액이 raw 단위로 표시

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **발견일:** 2026-03-04
- **마일스톤:** —
- **상태:** RESOLVED

## 현상

Admin 대시보드의 **Recent Activity** 테이블에서 트랜잭션 금액이 블록체인 최소 단위(wei, lamports)로 표시된다.

- 예시: `10000000000000000000 ($20.09)` → 사람이 읽기 어려움
- 지갑 상세 페이지의 트랜잭션 내역에서는 `10 ETH` 같은 사람 친화적 포맷으로 표시됨

## 원인

### 백엔드 (`packages/daemon/src/api/routes/admin.ts`)

- `GET /admin/status` 엔드포인트의 `recentTxRows` 쿼리가 `chain`, `tokenMint`, `contractAddress` 필드를 조회하지 않음
- `recentTransactions` 매핑에서 `formatTxAmount()` 호출 없이 raw `amount`만 반환
- 반면 `GET /admin/wallets/{id}/transactions`에서는 `formatTxAmount()`를 호출하여 `formattedAmount` 필드를 포함

### 프론트엔드 (`packages/admin/src/pages/dashboard.tsx`)

- `buildTxColumns()` 함수 (line ~172)에서 `tx.amount`를 그대로 표시하고 USD 변환값만 괄호 추가
- `formattedAmount` 필드가 없어서 포맷된 금액 표시 불가

## 해결 방안

### 1. 백엔드 수정 (`admin.ts` — `GET /admin/status`)

- `recentTxRows` select에 `chain`, `tokenMint`, `contractAddress` 필드 추가
- `recentTransactions` 매핑에서 `formatTxAmount()` 호출하여 `formattedAmount` 필드 추가

### 2. 프론트엔드 수정 (`dashboard.tsx`)

- `buildTxColumns()`의 amount 렌더러에서 `tx.formattedAmount ?? tx.amount` 사용
- 지갑 상세 페이지(`wallets.tsx` line ~895)와 동일한 패턴 적용

## 예상 결과

| Before | After |
|--------|-------|
| `10000000000000000000 ($20.09)` | `10 ETH ($20.09)` |
| `1239950203599823 ($2.49)` | `0.001239 ETH ($2.49)` |
| `4870000000000000000 ($9.92)` | `4.87 ETH ($9.92)` |

## 테스트 항목

- [ ] 대시보드 Recent Activity에서 네이티브 전송(ETH, SOL)이 사람 친화적 단위로 표시
- [ ] 토큰 전송(ERC-20, SPL)도 심볼 포함 포맷 표시 (예: `100 USDC`)
- [ ] `formatTxAmount()` 실패 시 raw amount 폴백 동작 확인
- [ ] 지갑 상세 트랜잭션 내역과 동일한 포맷 출력 확인
