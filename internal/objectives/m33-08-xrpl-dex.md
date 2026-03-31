# 마일스톤 m33-08: XRPL DEX 지원

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

XRPL 내장 DEX(오더북)를 Action Provider로 구현하여, AI 에이전트가 XRPL에서 네이티브 토큰 스왑(XRP ↔ IOU, IOU ↔ IOU)을 오더북 기반으로 실행할 수 있는 상태.

---

## 배경

### XRPL 내장 DEX 특성

XRPL은 프로토콜 레벨에서 **오더북 DEX**를 내장하고 있다. 별도의 스마트 컨트랙트나 외부 프로토콜 없이 네이티브 트랜잭션 타입으로 거래한다.

| 항목 | XRPL DEX | 일반 DEX (Uniswap 등) |
|------|----------|----------------------|
| 실행 방식 | 온레저 오더북 매칭 | AMM 풀 기반 |
| 트랜잭션 | OfferCreate / OfferCancel | 스마트 컨트랙트 호출 |
| 슬리피지 | 오더북 깊이에 따라 | 풀 크기에 따라 |
| 수수료 | 네트워크 수수료만 (~0.00001 XRP) | 가스비 + 프로토콜 수수료 |
| 부분 체결 | 지원 (잔여 오퍼 유지) | 해당 없음 |

### 유동성 현황 (2026-03 기준)

- **TVL**: ~$35.5M
- **일일 거래량**: $2M ~ $13M (30일 평균 ~$6.1M/day)
- **주요 프로토콜**: XRPL DEX (98%+), Sologenic (2%)

### WAIaaS 통합 패턴

XRPL DEX는 컨트랙트 호출이 아닌 **네이티브 트랜잭션 타입**을 사용하므로, 기존 `ContractCallRequest` 패턴과 다르다. RippleAdapter가 OfferCreate/OfferCancel 트랜잭션을 직접 빌드하고 파이프라인이 서명/제출하는 구조로 구현한다.

---

## 범위

### 포함

1. **XrplDexProvider**: IActionProvider 구현
   - `swap` — 즉시 실행 스왑 (OfferCreate with tfImmediateOrCancel)
   - `limit_order` — 지정가 주문 (OfferCreate, 오더북에 잔류)
   - `cancel_order` — 주문 취소 (OfferCancel)
   - `get_orderbook` — 오더북 조회 (book_offers RPC)
   - `get_offers` — 내 활성 주문 조회 (account_offers RPC)
2. **호가 조회**: book_offers RPC로 매수/매도 오더북 깊이 제공
3. **슬리피지 보호**: 즉시 스왑 시 tfImmediateOrCancel + 최소 수량 검증
4. **부분 체결 처리**: 지정가 주문의 부분 체결 상태 추적
5. **MCP/SDK 도구**: xrpl_dex_swap, xrpl_dex_limit_order, xrpl_dex_cancel, xrpl_dex_orderbook
6. **Admin UI**: XRPL DEX 활성화 설정, 거래 내역 표시

### 제외

- AMM 풀 기반 스왑 → m33-10
- 크로스체인 스왑 → m33-12
- 자동 오더북 메이킹/마켓 메이킹 전략

---

## 기술 설계 포인트

### OfferCreate 트랜잭션 구조

```
{
  TransactionType: "OfferCreate",
  Account: "rXXX...",
  TakerGets: { currency: "USD", issuer: "rYYY...", value: "100" },  // 내가 내놓는 것
  TakerPays: "50000000",  // 내가 받는 것 (drops)
  Flags: tfImmediateOrCancel | tfFillOrKill  // 스왑 모드
}
```

### Action Provider resolve() 반환 타입

XRPL DEX는 컨트랙트 호출이 아니므로, RippleAdapter에서 직접 트랜잭션을 빌드하는 패턴이 필요하다. resolve()가 XRPL 네이티브 트랜잭션 파라미터를 반환하고, 파이프라인이 이를 RippleAdapter.buildTransaction()으로 전달하는 구조를 설계해야 한다.

---

## 선행 마일스톤

- **m33-06**: XRP 메인넷 지원 (RippleAdapter, Trust Line 기반)

## 후속 마일스톤

- **m33-10**: XRPL AMM (DEX + AMM 이중 유동성 경로)
