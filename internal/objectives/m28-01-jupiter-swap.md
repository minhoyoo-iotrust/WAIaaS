# 마일스톤 m28-01: Jupiter Swap (첫 번째 Action Provider 구현체)

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

v1.5에서 구축된 Action Provider 프레임워크 위에 Jupiter Swap을 첫 번째 내장 프로바이더로 구현하여, AI 에이전트가 Solana DEX 토큰 스왑을 정책 평가 하에 실행할 수 있는 상태.

---

## 배경

v1.5에서 IActionProvider 인터페이스, ActionProviderRegistry, MCP Tool 자동 변환이 구현된다. m28-01은 이 프레임워크의 **첫 번째 실 구현체**로서 Jupiter Aggregator를 연동한다.

Jupiter는 Solana 최대 DEX 애그리게이터(일 거래량 $1B+)로, 단일 API 호출로 최적 경로를 계산하고 스왑 instruction을 반환한다. AI 에이전트가 "SOL을 USDC로 교환해줘"라고 하면 Jupiter Quote → swap-instructions → ContractCallRequest → 기존 파이프라인으로 실행된다.

---

## 구현 대상 설계 문서

| 문서 | 이름 | 구현 범위 | 전체/부분 |
|------|------|----------|----------|
| 63 | swap-action-spec | JupiterSwapActionProvider 구현체, JupiterSwapConfig 설정 인터페이스(apiBaseUrl/apiKey/defaultSlippageBps/maxSlippageBps/maxPriceImpactPct/jitoTipLamports), JupiterSwapInputSchema Zod 스키마, Quote API v1 호출(https://api.jup.ag/swap/v1/quote), /swap-instructions API 호출->개별 instruction 획득, ContractCallRequest 변환(Solana programId/instructionData/accounts 매핑), 슬리피지 50bps 기본/500bps 상한, priceImpact 1% 초과 시 거부, Jito MEV 보호(tip amount 설정, Jito 블록 엔진 직접 전송), CONTRACT_WHITELIST 연동(Jupiter 프로그램 주소 화이트리스트 필수) | 전체 |

---

## 산출물

### 컴포넌트

| 컴포넌트 | 내용 |
|----------|------|
| JupiterSwapActionProvider | IActionProvider 구현체. Quote API v1 호출(inputMint/outputMint/amount/slippageBps) -> 최적 경로 획득 -> /swap-instructions API 호출 -> 개별 instruction 획득 -> ContractCallRequest 변환(programId=JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4, instructionData/accounts 매핑). priceImpact 1% 초과 시 PRICE_IMPACT_TOO_HIGH 에러로 거부 |
| JupiterApiClient | Jupiter REST API 래퍼. Quote API v1 + /swap-instructions 호출. native fetch 사용(SDK 미사용), 요청 타임아웃 10초(AbortController). 응답 Zod 스키마 검증으로 API 변경 감지 |
| 슬리피지 제어 | 기본 50bps(0.5%), 고변동 토큰 500bps(5%) 상한. config.toml [actions.jupiter_swap] 섹션에서 default_slippage_bps/max_slippage_bps 오버라이드 |
| Jito MEV 보호 | tip amount 기본 1000 lamports(max 100,000), Jito 블록 엔진 URL로 트랜잭션 직접 전송, 프론트러닝/샌드위치 공격 방지 |
| MCP 도구 | waiaas_jupiter_swap — ActionDefinition -> MCP Tool 자동 매핑(v1.5 프레임워크 활용). AI 에이전트가 MCP를 통해 토큰 스왑 요청 가능 |
| SDK 지원 | TS SDK executeAction('jupiter_swap', params) + Python SDK execute_action('jupiter_swap', params) |

### 파일/모듈 구조

```
packages/actions/src/
  providers/
    jupiter-swap/
      index.ts                   # JupiterSwapActionProvider
      jupiter-api-client.ts      # Jupiter REST API 래퍼
      schemas.ts                 # JupiterSwapInputSchema, QuoteResponse, SwapInstructionsResponse Zod 스키마
      config.ts                  # JupiterSwapConfig 타입 + 기본값
  index.ts                       # 내장 프로바이더 export

packages/daemon/src/services/
  action/
    built-in-providers.ts        # 내장 프로바이더(jupiter_swap) 로드 로직

skills/
  transactions.skill.md          # Jupiter Swap 사용법 추가
```

### config.toml

```toml
[actions.jupiter_swap]
enabled = true
api_base_url = "https://api.jup.ag/swap/v1"  # 기본값
# api_key = ""                                 # Jupiter API 키 (선택)
default_slippage_bps = 50                      # 0.5%
max_slippage_bps = 500                         # 5%
max_price_impact_pct = 1.0                     # 1% 초과 시 거부
jito_tip_lamports = 1000                       # Jito MEV 보호 tip
# jito_block_engine_url = ""                   # Jito 블록 엔진 URL (선택)
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | Jupiter API 호출 방식 | fetch 직접 호출 (SDK 미사용) | Jupiter JS SDK는 추가 의존성 + 번들 크기 증가. Quote API/swap-instructions는 단순 REST 호출이므로 native fetch로 충분. 요청 타임아웃 10초, AbortController 사용 |
| 2 | 슬리피지 기본값 config 위치 | [actions.jupiter_swap] 섹션 | config.toml 평탄화 원칙(v0.7) 준수. default_slippage_bps, max_slippage_bps 키로 오버라이드 |
| 3 | MEV 보호 방식 | Jito 블록 엔진 직접 전송 | Solana DEX 스왑은 MEV 공격(프론트러닝, 샌드위치) 타겟. Jito tip을 통한 블록 엔진 직접 전송으로 공개 mempool 노출 방지. tip 비용은 미미(1000 lamports ≈ $0.0002) |
| 4 | CONTRACT_WHITELIST 연동 | Jupiter 프로그램 주소 필수 화이트리스트 | 기본 거부 정책과 일관성. Owner가 Jupiter 프로그램 주소를 CONTRACT_WHITELIST에 등록해야 스왑 실행 가능. 미등록 시 정책 엔진에서 거부 |
| 5 | 패키지 구조 | packages/actions/ 독립 패키지 | 코어/데몬과 분리하여 선택적 설치 가능. 향후 추가 프로바이더(Uniswap, Compound 등)도 동일 패키지에 포함 |

---

## E2E 검증 시나리오

**자동화 비율: 95%+ -- `[HUMAN]` 1건**

### Jupiter Swap resolve + execute

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | jupiter-swap resolve -> ContractCallRequest 반환 | mock Jupiter Quote API + /swap-instructions 응답 -> JupiterSwapActionProvider.resolve() -> ContractCallRequest 반환 + programId=JUP6 assert | [L0] |
| 2 | jupiter-swap execute -> 파이프라인 Stage 1-5 실행 | mock Jupiter API + mock SolanaAdapter -> resolve() -> ContractCallRequest -> 파이프라인 실행 -> 상태 전이 assert | [L0] |
| 3 | MCP: waiaas_jupiter_swap 도구 자동 노출 | jupiter_swap 프로바이더(mcpExpose=true) 등록 -> MCP tool 목록에 waiaas_jupiter_swap 포함 assert | [L0] |

### 슬리피지/MEV

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 4 | 슬리피지: 기본 50bps 적용 확인 | JupiterSwapActionProvider 기본 설정 -> Quote API 호출 시 slippageBps=50 파라미터 assert | [L0] |
| 5 | 슬리피지: config.toml 오버라이드 적용 | [actions.jupiter_swap] default_slippage_bps=100 설정 -> slippageBps=100 적용 assert | [L0] |
| 6 | 슬리피지: max_slippage_bps 초과 요청 -> 상한 적용 | 사용자 slippageBps=1000 요청 -> max 500 적용 assert | [L0] |
| 7 | priceImpact 1% 초과 -> PRICE_IMPACT_TOO_HIGH 에러 거부 | mock Quote API priceImpactPct=2.5 반환 -> resolve() PRICE_IMPACT_TOO_HIGH 에러 assert | [L0] |
| 8 | Jito MEV 보호: tip 포함 트랜잭션 빌드 확인 | mock /swap-instructions -> ContractCallRequest에 Jito tip instruction 포함 assert | [L0] |

### 정책 연동

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 9 | CONTRACT_WHITELIST에 Jupiter 프로그램 미등록 -> 정책 거부 | Jupiter 주소 미화이트리스트 + 스왑 요청 -> 정책 엔진 CONTRACT_WHITELIST 거부 assert | [L0] |
| 10 | CONTRACT_WHITELIST에 Jupiter 프로그램 등록 + 스왑 -> 정상 실행 | Jupiter 주소 화이트리스트 등록 + 스왑 요청 -> 정책 통과 + 실행 assert | [L0] |
| 11 | 스왑 금액 USD 환산 -> SPENDING_LIMIT 정책 평가 | mock oracle + 10 SOL -> $1500 스왑 -> SPENDING_LIMIT APPROVAL 격상 assert | [L0] |

### 외부 API 실 호출

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 12 | Jupiter API 실 호출 Devnet 검증 | Solana Devnet에서 Jupiter Quote API v1 실 호출 -> SOL/USDC 견적 조회 성공 확인 (CI nightly 또는 수동) | [HUMAN] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| v1.5 (가격 오라클 + Action Provider 프레임워크) | IActionProvider 인터페이스, ActionProviderRegistry, MCP Tool 자동 변환, POST /v1/actions/:provider/:action 엔드포인트가 v1.5에서 구현됨. JupiterSwapActionProvider는 이 프레임워크 위에서 동작 |
| v1.4 (토큰 + 컨트랙트 확장) | ContractCallRequest 인터페이스, CONTRACT_WHITELIST 정책, 파이프라인 Stage 5가 v1.4에서 구현됨 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | Jupiter API 버전 변경 (v6 -> v7 마이그레이션 가능성) | API 엔드포인트/응답 포맷 변경 시 Swap Action 파손 | JupiterApiClient 래퍼로 추상화. 버전 변경 시 래퍼만 수정. Quote/swap-instructions 응답 Zod 스키마로 런타임 검증 |
| 2 | Jupiter /swap-instructions 응답 포맷 변경 | instruction 구조 변경 시 ContractCallRequest 변환 실패 | 응답 Zod 스키마 검증으로 런타임 감지. 파싱 실패 시 ACTION_API_ERROR 에러 코드 반환 + 감사 로그 |
| 3 | Jito 블록 엔진 가용성 | Jito 서비스 장애 시 MEV 보호 없이 일반 RPC로 전송됨 | Jito 전송 실패 시 일반 RPC fallback. 감사 로그에 JITO_FALLBACK 기록. Jito URL 미설정 시 처음부터 일반 RPC 사용 |
| 4 | Solana 토큰만 지원 | EVM DEX(Uniswap 등)는 별도 프로바이더 필요 | Jupiter는 Solana 전용으로 명확히 범위 한정. EVM DEX는 별도 마일스톤(m28-02+)에서 UniswapActionProvider로 추가 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 2개 (JupiterSwapActionProvider + API Client 1 / MCP+SDK+정책연동+스킬 1) |
| 신규/수정 파일 | 10-15개 |
| 테스트 | 12-18개 |
| DB 마이그레이션 | 없음 |

---

*생성일: 2026-02-15*
*선행: v1.5 (가격 오라클 + Action Provider 프레임워크)*
*관련: 설계 문서 63 (swap-action-spec), v1.4 (ContractCallRequest, CONTRACT_WHITELIST)*
