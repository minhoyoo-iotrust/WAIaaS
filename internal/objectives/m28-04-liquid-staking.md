# 마일스톤 m28-04: Liquid Staking (Lido + Jito)

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

v1.5 Action Provider 프레임워크 위에 Lido(ETH)와 Jito(SOL) Liquid Staking을 ActionProvider로 구현하여, AI 에이전트가 유휴 ETH/SOL을 정책 평가 하에 스테이킹하고 유동성 토큰(stETH/JitoSOL)을 받을 수 있는 상태.

---

## 배경

m28-01~m28-03에서 스왑과 브릿지가 지원되지만, 월렛의 유휴 자산 활용은 불가능하다. Liquid Staking은 AI 에이전트가 **사용하지 않는 ETH/SOL을 스테이킹하여 수익을 창출**하면서도, 유동성 토큰(stETH, JitoSOL)을 통해 언제든 DeFi에 활용하거나 출금할 수 있게 한다.

### 사용 시나리오

```
AI 에이전트: "유휴 SOL 10개를 JitoSOL로 스테이킹해줘"

1. Jito Stake Pool: deposit(10 SOL)
2. JitoSOL 수령 (≈9.85 JitoSOL, 환율 반영)
3. JitoSOL은 DeFi에서 활용 가능 + 스테이킹 수익 자동 누적
```

```
Owner: "보유 ETH의 50%를 Lido에 스테이킹"

1. Lido: submit(5 ETH) → stETH 5개 수령
2. stETH는 Aave 담보, Curve LP 등에 활용 가능
3. 일일 ~0.003 ETH 스테이킹 리워드 자동 반영 (stETH 리베이스)
```

---

## 구현 대상

### 컴포넌트

| 컴포넌트 | 내용 |
|----------|------|
| LidoStakingActionProvider | IActionProvider 구현체 (EVM). 2개 액션: stake(ETH→stETH), unstake(stETH→ETH). Lido 컨트랙트 ABI 직접 호출. stake는 `submit()` 한 함수. unstake는 Withdrawal Queue 사용(1~5일 소요) |
| JitoStakingActionProvider | IActionProvider 구현체 (Solana). 2개 액션: stake(SOL→JitoSOL), unstake(JitoSOL→SOL). SPL Stake Pool 프로그램 호출. stake는 즉시, unstake는 에포크 경계 대기(~2일) |
| LidoContractHelper | Lido 컨트랙트 ABI 인코딩. viem `encodeFunctionData()` 사용. stETH 컨트랙트: `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` (Ethereum mainnet). Withdrawal Queue: `0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1` |
| JitoStakeHelper | Jito SPL Stake Pool 프로그램 호출 헬퍼. Pool: `Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb`, JitoSOL Mint: `J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn` |
| 스테이킹 상태 조회 | GET /v1/wallets/:id/staking — 월렛별 스테이킹 포지션 조회 (stETH/JitoSOL 잔고, 현재 APY, USD 환산). Admin 대시보드에도 표시 |
| MCP 도구 | waiaas_lido_stake, waiaas_lido_unstake, waiaas_jito_stake, waiaas_jito_unstake |
| SDK 지원 | TS/Python SDK: executeAction('lido_stake', params), executeAction('jito_stake', params) |

### 입력 스키마

```typescript
// Lido Stake
const LidoStakeInputSchema = z.object({
  amount: z.string(),           // ETH 수량 (예: "5.0")
});

// Lido Unstake
const LidoUnstakeInputSchema = z.object({
  amount: z.string(),           // stETH 수량 (예: "5.0")
});

// Jito Stake
const JitoStakeInputSchema = z.object({
  amount: z.string(),           // SOL 수량 (예: "10.0")
});

// Jito Unstake
const JitoUnstakeInputSchema = z.object({
  amount: z.string(),           // JitoSOL 수량 (예: "9.85")
});
```

### 파일/모듈 구조

```
packages/actions/src/
  providers/
    lido/
      index.ts                   # LidoStakingActionProvider
      lido-contract.ts           # Lido 컨트랙트 ABI + 주소
      schemas.ts                 # 입력 Zod 스키마
      config.ts                  # LidoConfig 타입 + 기본값
    jito/
      index.ts                   # JitoStakingActionProvider
      jito-stake-pool.ts         # Jito SPL Stake Pool 호출 헬퍼
      schemas.ts                 # 입력 Zod 스키마
      config.ts                  # JitoConfig 타입 + 기본값
  index.ts                       # 내장 프로바이더 export 업데이트

packages/daemon/src/routes/
  wallets.ts                     # GET /v1/wallets/:id/staking 추가
```

### config.toml

```toml
[actions.lido]
enabled = true
# Ethereum mainnet 기본값, testnet은 환경에 따라 자동 전환
steth_address = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84"
withdrawal_queue_address = "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1"

[actions.jito]
enabled = true
# Solana mainnet 기본값, testnet은 환경에 따라 자동 전환
stake_pool = "Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb"
jitosol_mint = "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn"
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | ETH Liquid Staking | Lido (stETH) | TVL $35B(DeFi 최대), `submit()` 한 함수로 스테이킹, REST API + SDK 완비. stETH는 DeFi에서 가장 널리 지원되는 LST |
| 2 | SOL Liquid Staking | Jito (JitoSOL) | TVL $3B(Solana 최대 LST), MEV 수익 공유, 14.3M SOL staked. SPL Stake Pool 표준 사용으로 안정적 |
| 3 | 통합 방식 — Lido | 컨트랙트 ABI 직접 호출 (viem) | Lido 스테이킹은 `submit()` 한 함수. REST API/SDK 의존 없이 ABI 인코딩만으로 충분. 외부 의존성 최소화 |
| 4 | 통합 방식 — Jito | SPL Stake Pool 프로그램 호출 | Jito는 SPL Stake Pool 표준(`SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy`) 사용. @solana/kit의 instruction 빌더로 구현 |
| 5 | unstake 비동기 처리 | 트랜잭션 기록 + 알림 | Lido unstake는 1~5일, Jito는 ~2일 소요. 요청 즉시 트랜잭션 기록 + unstake 완료 시 알림 발송. 상태 폴링은 m28-03 브릿지 상태 추적 패턴 재사용 |
| 6 | Lido vs Rocket Pool | Lido 우선 | Lido가 TVL 10배+, stETH DeFi 호환성 최고. Rocket Pool(rETH)은 탈중앙화 장점이 있으나 Tier 2+에서 추가 가능 |
| 7 | wstETH vs stETH | stETH 직접 사용 | stETH는 리베이스 토큰(잔고 자동 증가), wstETH는 non-rebasing 래퍼. stETH가 직관적이고 Lido `submit()` 기본 반환값. L2에서는 wstETH 브릿지 필요 시 별도 처리 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

### Lido (ETH Staking)

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | Lido stake resolve -> ContractCallRequest 반환 | LidoStakingActionProvider.resolve('stake', {amount: "5.0"}) -> ContractCallRequest(to=stETH contract, value=5 ETH, data=submit() calldata) assert | [L0] |
| 2 | Lido stake execute -> stETH 수령 | mock EvmAdapter -> resolve() -> 파이프라인 실행 -> 상태 전이 assert | [L0] |
| 3 | Lido unstake resolve -> Withdrawal Queue 호출 | resolve('unstake', {amount: "5.0"}) -> ContractCallRequest(to=WithdrawalQueue, data=requestWithdrawals() calldata) assert | [L0] |
| 4 | ETH 잔고 부족 -> 명확한 에러 | 10 ETH 스테이킹 요청 + 잔고 3 ETH -> INSUFFICIENT_BALANCE 에러 assert | [L0] |

### Jito (SOL Staking)

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 5 | Jito stake resolve -> instruction 반환 | JitoStakingActionProvider.resolve('stake', {amount: "10.0"}) -> ContractCallRequest(Stake Pool deposit instruction) assert | [L0] |
| 6 | Jito stake execute -> JitoSOL 수령 | mock SolanaAdapter -> resolve() -> 파이프라인 실행 -> 상태 전이 assert | [L0] |
| 7 | Jito unstake resolve -> withdraw instruction | resolve('unstake', {amount: "9.85"}) -> ContractCallRequest(Stake Pool withdraw instruction) assert | [L0] |
| 8 | SOL 잔고 부족 -> 명확한 에러 | 100 SOL 스테이킹 요청 + 잔고 5 SOL -> INSUFFICIENT_BALANCE 에러 assert | [L0] |

### 정책 연동

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 9 | 스테이킹 금액 USD 환산 -> SPENDING_LIMIT 평가 | mock oracle(ETH=$3000) + 5 ETH stake -> $15,000 -> SPENDING_LIMIT APPROVAL 격상 assert | [L0] |
| 10 | CONTRACT_WHITELIST 미등록 -> 정책 거부 | Lido 컨트랙트 미화이트리스트 + stake 요청 -> 정책 거부 assert | [L0] |

### 스테이킹 상태 조회

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 11 | GET /v1/wallets/:id/staking -> 포지션 반환 | stETH 잔고 5.0 + JitoSOL 잔고 9.85 -> 스테이킹 포지션 목록 + USD 환산 + APY 포함 assert | [L0] |
| 12 | 스테이킹 포지션 없음 -> 빈 배열 반환 | stETH/JitoSOL 잔고 0 -> 빈 positions 배열 반환 assert | [L0] |

### MCP

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 13 | MCP: waiaas_lido_stake, waiaas_jito_stake 도구 노출 | lido + jito 프로바이더 등록 -> MCP tool 목록에 4개 도구 포함 assert | [L0] |

### Admin UI

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 14 | Admin 대시보드에 스테이킹 포지션 표시 | stETH 5.0 ($15,000) + JitoSOL 9.85 ($1,478) -> 대시보드에 스테이킹 섹션 렌더링 assert | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| v1.5 (Action Provider 프레임워크) | IActionProvider, ActionProviderRegistry, MCP Tool 자동 변환 |
| v1.5 (가격 오라클) | stETH/JitoSOL의 USD 환산에 IPriceOracle 필요 |
| v1.4 (EVM + Solana 인프라) | EvmAdapter(viem), SolanaAdapter(@solana/kit), ContractCallRequest |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | unstake 대기 시간 | Lido 1~5일, Jito ~2일. 사용자가 즉시 출금 기대 가능 | unstake 요청 시 예상 대기 시간 명시. "즉시 출금이 필요하면 DEX에서 stETH/JitoSOL을 직접 판매하세요" 안내 |
| 2 | stETH 리베이스 추적 | stETH는 일일 리베이스로 잔고가 자동 증가. 정책 평가 시 이전 잔고와 불일치 가능 | 스테이킹 포지션 조회 시 실시간 잔고 확인. 리베이스 증분은 수익이므로 정책 평가 대상 아님 |
| 3 | Jito Stake Pool 환율 변동 | SOL:JitoSOL 환율이 에포크마다 변동. 예상 수량과 실제 수량 차이 발생 | 견적(예상 JitoSOL 수량) 조회 후 실제 실행. 슬리피지 0.1% 이내로 변동폭 작음 |
| 4 | 테스트넷 컨트랙트 주소 차이 | Lido Goerli/Sepolia, Jito Devnet 주소가 mainnet과 다름 | EnvironmentType SSoT(v1.4.5)에 따라 컨트랙트 주소 자동 전환. config.toml은 mainnet 기본, testnet은 hardcoded 매핑 |
| 5 | Lido L2 지원 | L2(Arbitrum, Base 등)에서는 stETH가 아닌 wstETH 브릿지 사용 | m28-04는 Ethereum mainnet 우선. L2 Lido 스테이킹은 향후 확장 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 2-3개 (Lido ActionProvider 1 / Jito ActionProvider 1 / 스테이킹 상태 API + Admin UI 1) |
| 신규/수정 파일 | 15-20개 |
| 테스트 | 14-20개 |
| DB 마이그레이션 | 없음 (stETH/JitoSOL은 일반 토큰 잔고로 조회) |

---

*생성일: 2026-02-15*
*선행: m28-02 (0x EVM DEX Swap)*
*관련: Lido (https://docs.lido.fi/), Jito (https://www.jito.network/docs/), v1.4.6 (멀티체인 월렛)*
