# 024: Admin UI 월렛 상세 페이지에 잔액 및 트랜잭션 내역 미표시

## 심각도

**MEDIUM** — 관리자가 월렛의 잔액과 트랜잭션 내역을 확인하려면 REST API를 직접 호출하거나 MCP/CLI를 사용해야 한다. Admin UI 월렛 상세 페이지에서 핵심 정보가 누락되어 있다.

## 증상

- Admin UI에서 월렛 상세를 열면 ID, 공개키, 체인, 환경, 상태만 표시
- 잔액(네이티브 + 토큰)을 확인할 수 없음
- 트랜잭션 내역을 확인할 수 없음
- 관리자가 월렛 운영 현황을 파악하려면 별도 도구(curl, CLI, MCP)를 사용해야 함

## 현재 월렛 상세 페이지 구성

```
WalletDetailView
  ├─ 기본 정보 (ID, Public Key, Chain, Environment, Status, Owner)
  ├─ Available Networks (기본 네트워크 변경)
  └─ MCP Setup (토큰 발급)

  ❌ 잔액 없음
  ❌ 트랜잭션 내역 없음
```

## 수정안

월렛 상세 페이지에 잔액 섹션과 트랜잭션 내역 섹션을 추가한다. 백엔드 수정 없이 기존 REST API를 호출하여 프론트엔드만 추가한다.

### 1. 잔액 섹션

기본 정보 아래에 잔액 섹션을 추가한다.

```
Balance
  ├─ Native: 0.5 ETH (ethereum-sepolia)
  └─ Tokens
       ├─ USDC  1,250.00
       └─ WETH  0.03
```

| 항목 | API | 설명 |
|------|-----|------|
| 네이티브 잔액 | `GET /v1/wallet/balance` | SOL 또는 ETH 잔액 |
| 토큰 잔액 | `GET /v1/wallet/assets` | SPL / ERC-20 토큰 목록 |

- 멀티체인 환경에서는 기본 네트워크의 잔액을 기본 표시
- 이슈 021(`network=all`) 구현 후에는 전체 네트워크 잔액 표시로 확장 가능

### 2. 트랜잭션 내역 섹션

Available Networks 아래에 최근 트랜잭션 테이블을 추가한다.

```
Recent Transactions
  | Time       | Type           | To          | Amount   | Status    | Network         |
  |------------|----------------|-------------|----------|-----------|-----------------|
  | 2026-02-14 | TRANSFER       | 0xAbC...789 | 0.01 ETH | CONFIRMED | ethereum-sepolia|
  | 2026-02-14 | TOKEN_TRANSFER | 0xDeF...012 | 100 USDC | CONFIRMED | polygon-amoy    |
  | 2026-02-13 | APPROVE        | 0x123...456 | ∞ USDC   | CONFIRMED | ethereum-sepolia|
```

| 항목 | API | 설명 |
|------|-----|------|
| 트랜잭션 목록 | `GET /v1/transactions` | 최근 트랜잭션 페이징 조회 |

- 기존 `Table` 컴포넌트 재사용
- 컬럼: Time, Type, To, Amount, Status, Network
- Status에 `Badge` 컴포넌트 활용 (CONFIRMED=success, PENDING=warning, FAILED=danger)
- 행 클릭 시 트랜잭션 상세 (txHash, 온체인 링크 등) 표시
- 기본 10건 표시, 페이징 또는 "Load more" 버튼

### 변경 후 페이지 구성

```
WalletDetailView
  ├─ 기본 정보 (ID, Public Key, Chain, Environment, Status, Owner)
  ├─ Balance (네이티브 + 토큰)          ← 신규
  ├─ Available Networks (기본 네트워크 변경)
  ├─ Recent Transactions (최근 내역)    ← 신규
  └─ MCP Setup (토큰 발급)
```

## 재발 방지 테스트

### T-1: 잔액 표시

월렛 상세 페이지 로드 시 네이티브 잔액이 표시되는지 검증. API 모킹으로 `GET /v1/wallet/balance` 응답을 반환하고 DOM에 잔액 값이 렌더링되는지 확인.

### T-2: 토큰 잔액 표시

토큰이 있는 월렛의 상세 페이지에서 토큰 목록(심볼, 잔액)이 표시되는지 검증.

### T-3: 토큰 없는 월렛

토큰이 없는 월렛에서 "No tokens" 빈 상태가 표시되는지 검증.

### T-4: 트랜잭션 내역 표시

트랜잭션이 있는 월렛에서 테이블에 Type, To, Amount, Status, Network 컬럼이 표시되는지 검증.

### T-5: 트랜잭션 없는 월렛

트랜잭션이 없는 월렛에서 "No transactions yet" 빈 상태가 표시되는지 검증.

### T-6: 트랜잭션 상태 뱃지

CONFIRMED, PENDING, FAILED 상태에 따라 올바른 Badge variant(success, warning, danger)가 적용되는지 검증.

## 영향 범위

| 항목 | 내용 |
|------|------|
| 수정 파일 | `packages/admin/src/pages/wallets.tsx` |
| 신규 API | 없음 — 기존 `GET /v1/wallet/balance`, `GET /v1/wallet/assets`, `GET /v1/transactions` 재사용 |
| 테스트 | Admin UI 컴포넌트 테스트 6건 추가 |
| 백엔드 변경 | 없음 |
| 하위호환 | 기존 페이지에 섹션 추가, 기존 기능 변경 없음 |

---

*발견일: 2026-02-14*
*마일스톤: v1.4.6*
*상태: OPEN*
*유형: ENHANCEMENT*
*관련: Admin UI 월렛 상세 (`packages/admin/src/pages/wallets.tsx`), 이슈 021 (network=all)*
