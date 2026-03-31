# 마일스톤 m33-10: XRPL AMM 지원

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

XRPL 네이티브 AMM(XLS-30)을 Action Provider로 구현하여, AI 에이전트가 XRPL AMM 풀에서 토큰 스왑, 유동성 공급/회수를 수행할 수 있는 상태.

---

## 배경

### XLS-30 AMM

2024년 XRPL 메인넷에 활성화된 네이티브 AMM으로, 프로토콜 레벨에서 CPMM(Constant Product Market Maker)을 지원한다. 외부 스마트 컨트랙트 없이 네이티브 트랜잭션으로 동작한다.

| 항목 | XRPL AMM (XLS-30) | Uniswap V2 |
|------|-------------------|------------|
| 실행 방식 | 네이티브 트랜잭션 | 스마트 컨트랙트 |
| 가격 모델 | CPMM (x * y = k) | CPMM |
| LP 토큰 | LP Token (네이티브) | ERC-20 LP |
| 수수료 | 풀별 가변 (투표로 결정) | 고정 0.3% |
| 옥션 메커니즘 | 슬롯 옥션 (수수료 할인) | 없음 |
| DEX 연동 | 오더북 + AMM 자동 라우팅 | 독립 |

### XRPL 자동 라우팅

XRPL은 Payment 트랜잭션 실행 시 **오더북과 AMM을 자동으로 최적 경로 탐색**한다. 따라서 m33-08(DEX)와 m33-10(AMM) 유동성이 합쳐져 전체적으로 더 나은 가격을 제공한다.

---

## 범위

### 포함

1. **XrplAmmProvider**: IActionProvider 구현
   - `amm_swap` — AMM 풀 직접 스왑 (AMMDeposit/AMMWithdraw 또는 Payment with 경로 지정)
   - `amm_deposit` — 유동성 공급 (AMMDeposit, 단일/이중 자산)
   - `amm_withdraw` — 유동성 회수 (AMMWithdraw, 단일/이중/LP 토큰 기준)
   - `amm_info` — 풀 정보 조회 (amm_info RPC)
   - `amm_vote` — 수수료 투표 (AMMVote, LP 보유자)
2. **LP 토큰 관리**: LP Token 잔액 조회, Trust Line 자동 설정
3. **풀 정보**: TVL, 수수료율, 자산 비율, 예상 슬리피지 계산
4. **DeFi 포지션 통합**: PositionQueryContext에 XRPL AMM LP 포지션 추가
5. **MCP/SDK 도구**: xrpl_amm_swap, xrpl_amm_deposit, xrpl_amm_withdraw, xrpl_amm_info
6. **Admin UI**: AMM 풀 포지션 표시, 유동성 관리 UI

### 제외

- 슬롯 옥션 참여 (고급 차익거래 기능)
- AMM 풀 생성 (AMMCreate) — 충분한 자본 필요, 에이전트 유스케이스에 부적합
- 자동 리밸런싱/전략

---

## 기술 설계 포인트

### AMM 트랜잭션 타입

```
AMMDeposit  — 유동성 공급 (LPTokenOut, Amount, Amount2, EPrice)
AMMWithdraw — 유동성 회수 (LPTokenIn, Amount, Amount2, EPrice)
AMMVote     — 수수료 투표 (FeeVal 0~1000, 0.001% 단위)
AMMBid      — 슬롯 옥션 입찰 (고급, 범위 밖)
```

### DEX + AMM 이중 라우팅

XRPL Payment는 자동으로 오더북과 AMM을 모두 탐색하므로, 단순 스왑의 경우 m33-08의 swap 액션이 이미 AMM 유동성을 활용한다. m33-10의 amm_swap은 **AMM 풀을 명시적으로 지정**하거나, **유동성 공급/회수**가 주 목적이다.

---

## 선행 마일스톤

- **m33-06**: XRP 메인넷 지원 (RippleAdapter, Trust Line)
- **m33-08**: XRPL DEX (오더북 기본 인프라, 선행 권장이나 필수는 아님)

## 후속 마일스톤

- 없음 (독립 완결)
