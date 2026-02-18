# 마일스톤 m29-05: EVM Lending 확장 (Morpho)

## 목표

m29-01 Lending 프레임워크 위에 Morpho Blue를 추가 Lending Provider로 구현하여, AI 에이전트가 Aave 외에 Morpho의 모듈형 대출 시장에서도 자산 예치/차입을 실행할 수 있는 상태.

---

## 배경

Morpho는 TVL ~$8B으로 Base 최대 대출 프로토콜이며, 12 EVM 체인을 지원한다. Aave(m29-01)와 달리 **모듈형 아키텍처**(Morpho Blue + MetaMorpho Vault)로, 커스텀 대출 시장을 생성할 수 있다.

### Aave vs Morpho

| 비교 | Aave V3 | Morpho Blue |
|------|---------|-------------|
| 아키텍처 | 모놀리식 풀 | 모듈형 개별 시장 |
| 시장 생성 | 거버넌스 승인 필요 | 퍼미션리스 (누구나 생성) |
| 이자율 | 거버넌스 설정 | 시장별 자유 설정 |
| Vault | 없음 | MetaMorpho (큐레이터 관리) |
| 강점 | 안정성, 유동성 | 자본 효율, 유연성 |

m29-01의 ILendingProvider 인터페이스를 그대로 구현하므로, Admin UI/정책/포지션 추적이 프로토콜 무관하게 동작한다.

---

## 구현 대상

### 컴포넌트

| 컴포넌트 | 내용 |
|----------|------|
| MorphoLendingProvider | ILendingProvider 구현체. Morpho Blue 컨트랙트 ABI 호출. 4개 표준 액션: supply, borrow, repay, withdraw. MetaMorpho Vault 예치/출금도 지원 |
| MorphoApiClient | Morpho REST API 래퍼. 시장 목록, APY, TVL, 포지션 데이터 조회 |
| MorphoContractHelper | Morpho Blue 컨트랙트 ABI 인코딩 (viem). Morpho Blue 코어 + MetaMorpho Vault 주소 매핑 |
| MCP 도구 | waiaas_morpho_supply, waiaas_morpho_borrow, waiaas_morpho_repay, waiaas_morpho_withdraw |
| SDK 지원 | TS/Python SDK: executeAction('morpho_supply', params) 등 |

### 입력 스키마

```typescript
const MorphoSupplyInputSchema = z.object({
  marketId: z.string(),         // Morpho Blue market ID
  asset: z.string(),            // 예치 자산 주소
  amount: z.string(),           // 예치 수량
});

// Vault 예치 (큐레이터 관리 전략)
const MorphoVaultDepositInputSchema = z.object({
  vault: z.string(),            // MetaMorpho Vault 주소
  amount: z.string(),           // 예치 수량
});
```

### config.toml

```toml
[actions.morpho]
enabled = true
api_base_url = "https://blue-api.morpho.org"   # 기본값
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 통합 방식 | REST API + 컨트랙트 ABI | Morpho REST API로 시장 데이터 조회, 컨트랙트 ABI로 트랜잭션 실행. Aave(m29-01)와 동일 패턴 |
| 2 | Vault 지원 | MetaMorpho Vault 포함 | Vault는 단일 자산 예치 → 큐레이터가 최적 시장 배분. ERC-4626 표준이라 deposit/withdraw 단순 |
| 3 | 시장 선택 | marketId 파라미터 | Morpho는 수천 개의 개별 시장이 존재. 사용자가 시장을 명시적으로 선택. 추천 시장은 MCP 도구 설명에 안내 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | Morpho supply resolve -> ContractCallRequest | MorphoLendingProvider.resolve('supply') -> Morpho Blue supply calldata assert | [L0] |
| 2 | Supply 실행 -> 포지션 생성 | mock 실행 -> positions 테이블에 Morpho SUPPLY 기록 assert | [L0] |
| 3 | Borrow/Repay/Withdraw 정상 동작 | 4개 액션 모두 올바른 calldata 생성 assert | [L0] |
| 4 | MetaMorpho Vault deposit -> ERC-4626 deposit calldata | vault deposit -> ERC-4626 deposit() calldata assert | [L0] |
| 5 | 포지션 조회 -> Aave+Morpho 통합 | GET /v1/wallets/:id/positions -> Aave + Morpho 포지션 모두 포함 assert | [L0] |
| 6 | 헬스 팩터 조회 -> Morpho market 기반 | getHealthFactor() -> Morpho 포지션 기반 계산 assert | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| m29-01 (Lending 프레임워크) | ILendingProvider, PositionTracker, HealthFactorMonitor, positions 테이블 |
| v1.5 (가격 오라클) | 포지션 USD 환산 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 시장 수 과다 | 수천 개 시장 중 적절한 시장 선택이 어려움 | 유동성 상위 시장만 MCP 도구에서 추천. 시장 조회 API로 APY/유동성 기준 필터링 제공 |
| 2 | 퍼미션리스 시장 위험 | 악의적/저유동성 시장에 예치 시 손실 가능 | 시장 화이트리스트 정책 지원. 유동성 최소 임계값 설정 가능 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 1-2개 |
| 신규/수정 파일 | 8-12개 |
| 테스트 | 6-10개 |
| DB 마이그레이션 | 없음 (m29-01 positions 테이블 재사용) |

---

*생성일: 2026-02-15*
*선행: m29-01 (Aave V3 + Lending 프레임워크)*
*관련: Morpho (https://docs.morpho.org/)*
