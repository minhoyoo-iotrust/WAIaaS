# #168 Admin UI 트랜잭션 금액이 raw 단위(lamports/wei)로 표시

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v28.3
- **상태:** OPEN

---

## 증상

Admin UI Transactions 페이지에서 금액이 블록체인 최소 단위(lamports/wei)로 표시되어 사람이 읽기 불편하다.

| 현재 표시 | 기대 표시 |
|----------|----------|
| `5000000000` | `5 SOL` |
| `3000000000` | `3 SOL` |
| `20000000` | `0.02 SOL` |
| `1000000000000000000 ($19.05)` | `10 ETH ($19.05)` |
| `5000000` | `5 USDC` |
| `1000000` | `1 USDC` |

Outgoing(발송) + Incoming(수신) 모두 해당.

---

## 근본 원인

1. **Admin API가 raw amount만 반환:** `GET /admin/transactions` 및 `GET /admin/incoming` 응답에 `amount` (raw string)만 포함. 토큰 심볼/소수점 정보(`formattedAmount`) 미제공.
2. **Admin UI가 raw amount를 그대로 렌더링:** `transactions.tsx:663-676`에서 `row.amount`을 변환 없이 표시.
3. **토큰 메타데이터 미조회:** transactions 테이블에 `tokenMint`(Solana) / `contractAddress`(EVM) 컬럼이 있지만 admin API SELECT에서 조회하지 않음.

---

## 해결 방안

### 1. Admin API 응답에 `formattedAmount` 필드 추가

**파일:** `packages/daemon/src/api/routes/admin.ts`

- `GET /admin/transactions` SELECT에 `tokenMint`, `contractAddress` 추가
- `GET /admin/incoming`은 이미 `tokenAddress` 조회 중
- 각 row에 `formattedAmount` 계산:
  - 네이티브 전송 (TRANSFER 등): `chain` → decimals/symbol 결정 (solana=9/SOL, ethereum=18/ETH)
  - 토큰 전송 (TOKEN_TRANSFER/APPROVE): `tokenMint`/`contractAddress` + `network` → `token_registry` 테이블에서 decimals/symbol 조회
  - 수신 (incoming): `tokenAddress` null → 네이티브, non-null → token_registry 조회
  - 실패/amount 없음 시: `null` (폴백)

### 2. 포맷 헬퍼 함수 추가

```typescript
// admin.ts 내부 또는 공유 유틸
const NATIVE_DECIMALS: Record<string, number> = { solana: 9, ethereum: 18 };
const NATIVE_SYMBOLS: Record<string, string> = { solana: 'SOL', ethereum: 'ETH' };

function formatTxAmount(
  amount: string | null,
  chain: string,
  network: string | null,
  tokenAddress: string | null,
  db: BetterSQLite3Database<typeof schema>,
): string | null
```

- `@waiaas/core`의 기존 `formatAmount(bigint, decimals)` 유틸 재사용
- `stages.ts:135-136`의 `NATIVE_DECIMALS`/`NATIVE_SYMBOLS` 패턴 재사용
- token_registry 조회: `SELECT symbol, decimals FROM token_registry WHERE address = ? AND network = ? LIMIT 1`

### 3. Admin UI에서 `formattedAmount` 표시

**파일:** `packages/admin/src/pages/transactions.tsx`

- `TransactionItem` / `IncomingTxItem` 인터페이스에 `formattedAmount: string | null` 추가
- Amount 컬럼 렌더링 변경: `formattedAmount` 우선 표시, 없으면 raw amount 폴백
- USD 표시와 병행: `5 SOL ($323.03)` 형태

---

## 참고: 기존 재사용 가능 코드

| 코드 | 위치 | 용도 |
|------|------|------|
| `formatAmount(bigint, decimals)` | `packages/core/src/utils/format-amount.ts` | raw → 사람 친화적 숫자 변환 |
| `NATIVE_DECIMALS` / `NATIVE_SYMBOLS` | `packages/daemon/src/pipeline/stages.ts:135-136` | 네이티브 토큰 decimals/symbol 상수 |
| `formatNotificationAmount()` | `packages/daemon/src/pipeline/stages.ts:142-171` | 알림 메시지용 포맷 (동일 패턴) |
| `token_registry` 테이블 | `schema.ts` — address, symbol, decimals 컬럼 | 토큰 메타데이터 조회 |

---

## 수정 대상 파일

| # | 파일 | 변경 |
|---|------|------|
| 1 | `packages/daemon/src/api/routes/admin.ts` | `formatTxAmount()` 헬퍼 + GET /admin/transactions·incoming 응답에 formattedAmount 추가 + SELECT 확장 |
| 2 | `packages/admin/src/pages/transactions.tsx` | 인터페이스 + Amount 렌더링에서 formattedAmount 사용 |

---

## 테스트 항목

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 네이티브 SOL 전송 formattedAmount | amount='5000000000', chain='solana' → formattedAmount='5 SOL' assert | [L0] |
| 2 | 네이티브 ETH 전송 formattedAmount | amount='1000000000000000000', chain='ethereum' → formattedAmount='1 ETH' assert | [L0] |
| 3 | ERC-20 토큰 전송 formattedAmount | amount='1000000', contractAddress=USDC, token_registry에 decimals=6/symbol=USDC → formattedAmount='1 USDC' assert | [L0] |
| 4 | SPL 토큰 전송 formattedAmount | amount='100000000', tokenMint=USDC, token_registry에 decimals=6/symbol=USDC → formattedAmount='100 USDC' assert | [L0] |
| 5 | token_registry 미등록 토큰 → raw 폴백 | 미등록 contractAddress → formattedAmount=null, UI가 raw amount 표시 assert | [L0] |
| 6 | amount null → formattedAmount null | amount=null → formattedAmount=null assert | [L0] |
| 7 | Incoming 네이티브 수신 formattedAmount | tokenAddress=null, chain='solana', amount='3000000000' → formattedAmount='3 SOL' assert | [L0] |
| 8 | Incoming 토큰 수신 formattedAmount | tokenAddress=USDC addr → token_registry 조회 → formattedAmount='100 USDC' assert | [L0] |

---

*발견일: 2026-02-24*
*관련: #165 (알림 금액 포맷 — 동일 패턴), formatAmount() @waiaas/core, stages.ts formatNotificationAmount()*
