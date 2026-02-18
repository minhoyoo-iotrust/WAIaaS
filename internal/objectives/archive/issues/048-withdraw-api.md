# v1.6-048: Owner 자산 회수(Withdraw) API 미구현

- **유형:** MISSING
- **심각도:** HIGH
- **마일스톤:** v1.6
- **상태:** OPEN
- **등록일:** 2026-02-17

## 현상

`IChainAdapter.sweepAll()` 인터페이스, `SweepResult` 타입, `WITHDRAW` 에러 도메인(4개 코드)이 정의되어 있으나, 이를 호출하는 REST API 엔드포인트가 미구현. Owner 주소로 자산을 회수하는 방법이 없음.

#047에서 TERMINATED 가드를 적용하면 일반 트랜잭션도 차단되므로, TERMINATED 상태에서 자산을 빼올 수 있는 유일한 경로가 필요.

## 기존 정의 현황

| 항목 | 위치 | 상태 |
|------|------|------|
| `IChainAdapter.sweepAll()` | `core/src/interfaces/IChainAdapter.ts:113` | 인터페이스 정의됨 |
| `SweepResult` 타입 | `core/src/interfaces/chain-adapter.types.ts:142-155` | 타입 정의됨 |
| `NO_OWNER` 에러 | `core/src/errors/error-codes.ts:529` | 정의됨 (httpStatus 404) |
| `WITHDRAW_LOCKED_ONLY` 에러 | `core/src/errors/error-codes.ts:536` | 정의됨 (httpStatus 403) |
| `SWEEP_TOTAL_FAILURE` 에러 | `core/src/errors/error-codes.ts:543` | 정의됨 (httpStatus 500) |
| `INSUFFICIENT_FOR_FEE` 에러 | `core/src/errors/error-codes.ts:549` | 정의됨 (httpStatus 400) |
| REST API 엔드포인트 | — | **미구현** |
| Admin UI | — | **미구현** |
| MCP 도구 | — | **미구현** |
| SDK 메서드 | — | **미구현** |

## 수정 방안

### 1. REST API

```
POST /v1/wallets/{id}/withdraw
Authorization: masterAuth
```

**요청**: body 없음 (Owner 주소로 전체 자산 sweep)

**응답**:
```json
{
  "total": 3,
  "succeeded": 2,
  "failed": 1,
  "results": [
    { "asset": "SOL", "amount": "1.5", "txHash": "...", "status": "success" },
    { "asset": "USDC", "amount": "100.0", "txHash": "...", "status": "success" },
    { "asset": "USDT", "amount": "50.0", "error": "insufficient for fee", "status": "failed" }
  ]
}
```

**접근 조건**:
- Owner 상태 LOCKED 필수 (`WITHDRAW_LOCKED_ONLY`)
- Owner 미설정 시 `NO_OWNER`
- **TERMINATED, SUSPENDED 상태에서도 허용** (TERMINATED 가드 예외)

### 2. sessionAuth 엔드포인트

```
POST /v1/wallet/withdraw
Authorization: sessionAuth (JWT)
```

동일 로직, walletId는 JWT에서 추출.

### 3. Admin UI

월렛 상세 페이지에 Withdraw 섹션/버튼 추가:

- Owner 상태가 LOCKED일 때만 버튼 활성화
- 클릭 시 확인 모달: "Owner 주소(0x...)로 전체 자산을 회수합니다. 계속하시겠습니까?"
- 실행 후 결과 테이블 표시 (자산별 성공/실패/txHash)
- TERMINATED 상태에서도 사용 가능 (종료된 월렛의 잔여 자산 회수 시나리오)

### 4. MCP 도구 + SDK

| 인터페이스 | 도구/메서드 |
|-----------|------------|
| MCP | `withdraw_all` 도구 추가 |
| SDK (TypeScript) | `client.withdrawAll(walletId)` |
| SDK (Python) | `client.withdraw_all(wallet_id)` |

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `packages/daemon/src/api/routes/wallets.ts` | `POST /wallets/{id}/withdraw` 라우트 추가 |
| `packages/daemon/src/api/routes/wallet.ts` | `POST /wallet/withdraw` 라우트 추가 |
| `packages/daemon/src/api/routes/openapi-schemas.ts` | WithdrawResponse 스키마 |
| `packages/admin/src/pages/wallets.tsx` | 월렛 상세에 Withdraw 버튼 + 결과 표시 |
| `packages/mcp/src/tools/` | `withdraw_all` 도구 |
| `packages/sdk/src/` | `withdrawAll()` 메서드 |
| `skills/wallet.skill.md` | withdraw 가이드 추가 |

## 테스트

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| T-048-01 | Owner LOCKED + ACTIVE 월렛에서 withdraw | sweepAll 실행, SweepResult 반환 |
| T-048-02 | Owner NONE 상태에서 withdraw | 404 `NO_OWNER` |
| T-048-03 | Owner GRACE 상태에서 withdraw | 403 `WITHDRAW_LOCKED_ONLY` |
| T-048-04 | TERMINATED + Owner LOCKED에서 withdraw | 200 성공 (TERMINATED 가드 예외) |
| T-048-05 | SUSPENDED + Owner LOCKED에서 withdraw | 200 성공 (SUSPENDED 가드 예외) |
| T-048-06 | 잔액 0인 월렛에서 withdraw | 200 + total: 0, succeeded: 0 |
| T-048-07 | 네이티브 + 토큰 3종 보유 월렛에서 withdraw | 4개 자산 sweep 시도, 개별 결과 반환 |
| T-048-08 | 수수료 부족으로 일부 토큰 sweep 실패 | SWEEP_TOTAL_FAILURE 또는 부분 성공 반환 |
| T-048-09 | Admin UI에서 Withdraw 버튼 클릭 → 확인 → 결과 표시 | 모달 확인 후 결과 테이블 렌더링 |
| T-048-10 | Admin UI에서 Owner NONE/GRACE 상태일 때 Withdraw 버튼 | 비활성화(disabled) 상태 |

## 의존 관계

- **#047** (TERMINATED 가드): withdraw 엔드포인트를 가드 예외로 지정해야 함
- **#041** (Owner 주소 설정 폼): Owner가 설정되지 않으면 withdraw 불가
