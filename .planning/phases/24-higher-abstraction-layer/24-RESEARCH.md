# Phase 24: 상위 추상화 레이어 설계 - Research

**Researched:** 2026-02-08
**Domain:** 가격 오라클, Action Provider 아키텍처, DeFi 추상화, MCP 도구 변환
**Confidence:** HIGH

## Summary

Phase 24는 두 가지 핵심 추상화 레이어를 설계한다: (1) IPriceOracle -- 토큰 가격을 USD로 변환하여 기존 정책 엔진의 SPENDING_LIMIT을 토큰 종류 무관하게 동적 4-티어로 적용, (2) IActionProvider -- DeFi 프로토콜 지식을 IChainAdapter에서 분리하여 resolve-then-execute 패턴으로 기존 파이프라인에 주입.

가격 오라클은 CoinGecko Demo API(무료, 30 calls/min)를 기본 구현체로, Pyth Hermes(무료, 30 req/10s)를 Solana 전용 대안으로, Chainlink(온체인 RPC 읽기)를 EVM 전용 대안으로 설계한다. 5분 TTL 인메모리 캐시와 stale 데이터 fallback 전략으로 외부 API 장애에 대비한다.

Action Provider는 IActionProvider 인터페이스(resolve/actions/metadata)와 ActionDefinition Zod 스키마를 정의하고, resolve()가 ContractCallRequest를 반환하여 기존 6단계 파이프라인의 정책 평가를 거치는 패턴을 명세한다. ActionDefinition에서 MCP Tool로의 자동 변환은 기존 @waiaas/mcp의 server.tool(name, description, zodSchema, handler) 패턴과 동일한 구조로 매핑한다. 첫 번째 구현체인 Jupiter Swap Action Provider는 Quote API v1 -> ContractCallRequest 변환 -> 파이프라인 주입 흐름을 설계한다.

**Primary recommendation:** CoinGecko Demo API를 기본 가격 소스로 사용하고, IPriceOracle 인터페이스로 추상화하여 Pyth/Chainlink/Jupiter Price API를 플러그인으로 교체 가능하게 설계한다. Action Provider는 resolve()가 반드시 ContractCallRequest를 반환하도록 강제하여, 모든 DeFi 작업이 기존 정책 엔진을 우회하지 못하게 보장한다.

## Standard Stack

Phase 24는 설계 문서 산출이므로 새로운 라이브러리를 추가하지 않는다. 아래는 설계에서 참조하는 외부 API와 기존 스택이다.

### 외부 가격 API (설계 참조)

| API | 용도 | 무료 티어 | 갱신 주기 | 인증 |
|-----|------|----------|----------|------|
| CoinGecko Simple Price API v3 | 기본 가격 소스 (Solana+EVM) | Demo: 30 calls/min | 1-5분 | x-cg-demo-api-key 헤더 |
| CoinGecko Token Price API v3 | 컨트랙트 주소 기반 조회 | Demo: 30 calls/min | 1-5분 | x-cg-demo-api-key 헤더 |
| Pyth Hermes REST API | Solana 전용 대안 | 30 req/10s (공개) | 서브초 | 없음 (공개 인스턴스) |
| Chainlink AggregatorV3 | EVM 전용 대안 (온체인 RPC) | RPC 비용만 | 블록당 | 없음 (RPC 읽기) |
| Jupiter Price API v3 | Solana DEX 기반 가격 | 무료 (API 키 필요) | 실시간 | x-api-key 헤더 |

### 외부 스왑 API (설계 참조)

| API | 용도 | 체인 | 인증 |
|-----|------|------|------|
| Jupiter Swap API v1 | Solana 스왑 | Solana | x-api-key (선택) |
| 0x Swap API v2 | EVM 스왑 (향후 확장용) | Ethereum, Polygon, etc. | 0x-api-key 헤더 |

### 기존 프로젝트 스택 (Phase 24에서 활용)

| 라이브러리 | 버전 | 용도 |
|----------|------|------|
| zod | ^3.25.0 | ActionDefinition 스키마, IPriceOracle 응답 스키마 |
| @modelcontextprotocol/sdk | ^1.0.0 | MCP Tool 자동 변환 대상 (server.tool() API) |
| @waiaas/core | workspace | Zod SSoT, PolicyEvaluationInput 확장 |
| viem | ^2.x | Chainlink AggregatorV3 ABI 읽기 (EVM) |

## Architecture Patterns

### 가격 오라클 아키텍처

```
┌─────────────────────────────────────────────────────┐
│  IPriceOracle 인터페이스                              │
│                                                      │
│  getPrice(token: TokenRef, chain): PriceInfo          │
│  getPrices(tokens: TokenRef[], chain): PriceInfo[]    │
│  getSupportedTokens(chain): TokenRef[]               │
└───────┬────────────────┬──────────────┬─────────────┘
        │                │              │
   ┌────┴────┐    ┌──────┴──────┐  ┌───┴──────────┐
   │CoinGecko│    │Pyth Hermes  │  │Chainlink RPC │
   │Impl     │    │Impl         │  │Impl          │
   │(기본)    │    │(Solana 대안)│  │(EVM 대안)     │
   └────┬────┘    └──────┬──────┘  └───┬──────────┘
        │                │              │
   ┌────┴────────────────┴──────────────┴─────────────┐
   │  PriceCache (인메모리)                             │
   │  - 5분 TTL                                        │
   │  - staleWhileRevalidate: true                     │
   │  - Map<cacheKey, { price, fetchedAt, expiresAt }> │
   └──────────────────────────────────────────────────┘
```

### 가격 오라클 -> 정책 엔진 통합 지점

```
기존 파이프라인 (Phase 22-23):
  Stage 3: evaluate(input) -> resolveEffectiveAmount(input) -> evaluateSpendingLimit()
    TOKEN_TRANSFER: return 0n (NOTIFY 고정)
    APPROVE: return 0n (TIER_OVERRIDE 독립)

Phase 24 확장:
  Stage 3: evaluate(input) -> resolveEffectiveAmountUsd(input, priceOracle) -> evaluateSpendingLimitUsd()
    TOKEN_TRANSFER: priceOracle.getPrice(token) * amount -> USD 금액 -> 동적 4-티어
    APPROVE: priceOracle.getPrice(token) * approveAmount -> USD 참고값 (TIER_OVERRIDE 우선)
    BATCH: 개별 USD 합산 -> 합산 USD 금액 -> 동적 4-티어
    CONTRACT_CALL: value의 USD 변환 (네이티브 토큰 가격) -> SPENDING_LIMIT 반영
    TRANSFER: 네이티브 토큰 가격 * amount -> USD (기존 네이티브 기준과 병행)
```

**핵심 변경점:**
1. `PolicyEvaluationInput`에 `usdAmount?: number` 필드 추가
2. `resolveEffectiveAmount()` -> `resolveEffectiveAmountUsd()` 확장 (USD 변환 실패 시 기존 네이티브 기준 fallback)
3. `SpendingLimitRuleSchema`에 USD 임계값 필드 추가: `instant_max_usd`, `notify_max_usd`, `delay_max_usd`
4. 기존 네이티브 금액 임계값과 USD 임계값 병행 -- USD 우선, USD 변환 실패 시 네이티브 fallback

### Action Provider 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│  IActionProvider 인터페이스                                 │
│                                                           │
│  metadata: ActionProviderMetadata                          │
│  actions: ActionDefinition[]                              │
│  resolve(action, params): ContractCallRequest             │
└──────┬────────────────────────────────────────────────────┘
       │
  ┌────┴────────────────────────────────────────────┐
  │  ActionProviderRegistry                          │
  │  - register(provider: IActionProvider)           │
  │  - getProvider(name): IActionProvider            │
  │  - getAllActions(): ActionDefinition[]           │
  │  - loadPlugins(dir: string): void               │
  └──────┬──────────────────────────────┬───────────┘
         │                              │
    ┌────┴──────────┐           ┌───────┴──────────┐
    │JupiterSwap    │           │향후 확장:          │
    │ActionProvider │           │UniswapSwap,       │
    │(built-in)     │           │AaveSupply, etc.   │
    └────┬──────────┘           └──────────────────┘
         │
         │ resolve('jupiter_swap', { inputMint, outputMint, amount, slippageBps })
         │
         ▼
    ┌─────────────────────────────────────────────┐
    │ 1. Jupiter Quote API 호출                     │
    │ 2. Quote -> ContractCallRequest 변환          │
    │ 3. 기존 파이프라인에 주입 (Stage 1-6)           │
    │    → Stage 3 정책 평가 (CONTRACT_WHITELIST)    │
    │    → Stage 4 보안 티어 분류                    │
    │    → Stage 5 빌드/서명/제출                    │
    └─────────────────────────────────────────────┘
```

### resolve-then-execute 패턴 상세

```typescript
// 1. 에이전트 (또는 MCP Tool)가 Action 요청
const params = { inputMint: 'So11...', outputMint: 'EPjF...', amount: '1000000', slippageBps: 50 }

// 2. ActionProvider.resolve() -- DeFi 프로토콜 지식을 캡슐화
const contractCall: ContractCallRequest = await jupiterProvider.resolve('jupiter_swap', params)
// => { from, to: 'JUP6...', programId: 'JUP6...', instructionData: '...', accounts: [...] }

// 3. 기존 파이프라인에 주입 -- 정책 엔진이 ContractCallRequest를 평가
// Stage 1: type='CONTRACT_CALL' 검증
// Stage 2: 세션 allowedContracts 검증 (Jupiter 프로그램 주소)
// Stage 3: CONTRACT_WHITELIST, SPENDING_LIMIT(USD) 정책 평가
// Stage 4: 보안 티어 분류
// Stage 5: IChainAdapter.buildContractCall() -> 서명 -> 제출
// Stage 6: 온체인 확정 대기
```

### ActionDefinition -> MCP Tool 자동 변환

```typescript
// ActionDefinition (Zod 기반)
const jupiterSwapAction: ActionDefinition = {
  name: 'jupiter_swap',
  description: 'Swap tokens on Solana via Jupiter aggregator',
  chain: 'solana',
  inputSchema: z.object({
    inputMint: z.string().describe('Input token mint address (Base58)'),
    outputMint: z.string().describe('Output token mint address (Base58)'),
    amount: z.string().describe('Amount to swap in smallest unit'),
    slippageBps: z.number().int().min(1).max(5000).default(50)
      .describe('Slippage tolerance in basis points (50 = 0.5%)'),
  }),
  riskLevel: 'high',   // MCP tool description에 포함
  requiresApproval: true, // CONTRACT_CALL 기본 APPROVAL
}

// 자동 변환 결과 -- server.tool() 호출
server.tool(
  'jupiter_swap',                                    // name 직접 매핑
  'Swap tokens on Solana via Jupiter aggregator. ' +  // description 매핑
  'Risk level: high. Requires owner approval.',       // riskLevel 부가
  jupiterSwapAction.inputSchema,                      // Zod 스키마 직접 전달
  async (params) => {                                 // handler: resolve -> pipeline
    const contractCall = await jupiterProvider.resolve('jupiter_swap', params)
    const result = await transactionService.submit({ type: 'CONTRACT_CALL', ...contractCall })
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  },
)
```

### 플러그인 로드 메커니즘

```
~/.waiaas/
├── config.toml
├── data/
└── actions/                          # 플러그인 디렉토리
    ├── jupiter-swap/
    │   ├── package.json              # { "type": "module", "main": "index.js" }
    │   └── index.js                  # export default class JupiterSwapProvider implements IActionProvider
    └── custom-action/
        ├── package.json
        └── index.js
```

```typescript
// ActionProviderRegistry.loadPlugins()
async function loadPlugins(actionsDir: string): Promise<void> {
  const entries = await readdir(actionsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const pluginPath = join(actionsDir, entry.name, 'index.js')

    // 1. 존재 확인
    if (!existsSync(pluginPath)) continue

    // 2. ESM dynamic import
    const module = await import(pathToFileURL(pluginPath).href)

    // 3. IActionProvider 인터페이스 검증
    const provider = module.default
    validateActionProvider(provider)  // metadata, actions, resolve 존재 확인

    // 4. 보안 검증
    validateProviderSecurity(provider)  // chain 범위, 허용 컨트랙트 등

    // 5. 등록
    registry.register(provider)
  }
}
```

### Anti-Patterns to Avoid

- **IChainAdapter에 DeFi 지식 추가 금지:** swap(), stake() 같은 고수준 메서드를 IChainAdapter에 넣지 않는다. IChainAdapter는 저수준 실행 엔진으로 유지한다.
- **Action Provider가 정책 평가를 우회하는 것을 허용 금지:** resolve()는 반드시 ContractCallRequest를 반환하고, 이것이 기존 파이프라인의 Stage 3 정책 평가를 거친다.
- **가격 캐시 없이 외부 API 직접 호출 금지:** 매 트랜잭션마다 CoinGecko를 호출하면 rate limit에 즉시 걸린다. 반드시 5분 TTL 캐시를 사용한다.
- **단일 가격 소스 의존 금지:** CoinGecko 장애 시 fallback으로 stale 데이터 또는 대안 소스를 사용한다.
- **USD 변환 실패 시 트랜잭션 거부 금지:** 오라클 장애로 USD 가격을 조회할 수 없을 때, 기존 Phase 22-23 과도기 전략(NOTIFY 기본)으로 fallback한다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DEX 라우팅 | 직접 AMM 풀 쿼리 | Jupiter Quote API / 0x Quote API | 150+ 소스 최적 경로, 가격 영향 계산, 슬리피지 보호 포함 |
| 가격 집계 | 직접 DEX 가격 평균 | CoinGecko/Pyth/Jupiter Price API | 아웃라이어 제거, 다중 소스 교차 검증 이미 구현 |
| MEV 보호 | 직접 private mempool 구현 | Jupiter Jito 통합 (jitoTipLamports) | Jito 블록 엔진 직접 전송, 프론트러닝 차단 |
| ABI 인코딩 | 직접 calldata 바이너리 구성 | viem encodeFunctionData | 타입 안전 인코딩, 에러 핸들링 내장 |
| Zod -> JSON Schema 변환 | 직접 JSON Schema 생성 | MCP SDK 내장 변환 (zodToJsonSchema) | MCP SDK가 Zod peer dep으로 이미 변환 기능 내장 |

## Common Pitfalls

### Pitfall 1: 가격 조작 공격 (Price Oracle Manipulation)

**What goes wrong:** 공격자가 DEX 유동성 풀을 조작하여 토큰 가격을 일시적으로 변동시킨 후, 변동된 가격으로 SPENDING_LIMIT을 우회한다.
**Why it happens:** 단일 DEX 가격 소스에 의존하거나, 캐시가 너무 짧아서 조작된 가격이 즉시 반영될 때.
**How to avoid:**
- 다중 소스 교차 검증 (CoinGecko + Pyth 불일치 시 보수적 판단)
- 급격한 가격 변동 감지 (이전 캐시 대비 +-50% 변동 시 경고)
- 5분 TTL 캐시로 순간 조작 완화
**Warning signs:** 짧은 시간 내 동일 토큰의 대량 거래 시도

### Pitfall 2: 오라클 장애 시 전체 시스템 중단

**What goes wrong:** CoinGecko API 장애 시 모든 토큰 트랜잭션이 처리 불가해진다.
**Why it happens:** 가격 조회를 동기적 필수 단계로 설계하고, fallback이 없을 때.
**How to avoid:**
- stale 데이터 허용 전략: TTL 만료 후에도 stale 가격으로 정책 평가 허용 (staleMaxAge: 30분)
- 오라클 장애 시 Phase 22-23 과도기 전략으로 fallback (TOKEN_TRANSFER = NOTIFY)
- 네이티브 토큰(SOL/ETH)은 가격 없이도 네이티브 기준 SPENDING_LIMIT 적용 가능
**Warning signs:** PriceOracle.getPrice() 연속 실패, 캐시 히트율 급감

### Pitfall 3: resolve()가 서명된 트랜잭션을 직접 제출 (정책 우회)

**What goes wrong:** Action Provider가 resolve()에서 ContractCallRequest 대신 이미 서명된 트랜잭션을 반환하거나, 직접 RPC에 제출한다.
**Why it happens:** 플러그인 개발자가 편의상 Jupiter의 swapTransaction(Base64 직렬화된 트랜잭션)을 그대로 반환하려 할 때.
**How to avoid:**
- resolve() 반환 타입을 ContractCallRequest로 강제 (Zod 런타임 검증)
- 직렬화된 트랜잭션(Base64 문자열)이 반환되면 reject
- 플러그인에 네트워크 접근 권한 부여하되, 서명/제출 권한은 미부여
**Warning signs:** resolve() 결과가 ContractCallRequestSchema 검증 실패

### Pitfall 4: MCP Tool 과다 등록

**What goes wrong:** 플러그인마다 5-10개 Action을 등록하면 MCP Tool이 50+개로 폭증하여 LLM 컨텍스트를 소모한다.
**Why it happens:** 38-sdk-mcp-interface.md에서 이미 경고한 "Tool 과다 등록 방지"를 무시할 때.
**How to avoid:**
- ActionProviderMetadata에 mcpExpose 플래그로 MCP 노출 여부 선택
- 기본 내장 Action만 MCP에 노출, 커스텀 플러그인은 REST API만
- MCP Tool 등록 상한 설정 (기존 6개 + Action 최대 10개 = 16개 상한 권장)
**Warning signs:** MCP Tool 목록이 20개 초과

### Pitfall 5: Jupiter swapTransaction을 ContractCallRequest로 변환 불가

**What goes wrong:** Jupiter POST /swap이 반환하는 swapTransaction은 이미 직렬화된 전체 트랜잭션(Base64)이라서, ContractCallRequest의 programId/instructionData/accounts 형태로 분해할 수 없다.
**Why it happens:** Jupiter API가 instruction 수준이 아닌 전체 트랜잭션 수준으로 응답하기 때문.
**How to avoid:**
- Jupiter Quote API의 routePlan에서 개별 instruction을 추출하는 방법 조사
- 또는 Jupiter의 /swap-instructions 엔드포인트 활용 (개별 instruction 반환)
- 최악의 경우, swapTransaction을 역직렬화하여 instruction 분해 (VersionedTransaction.deserialize)
**Warning signs:** POST /swap 응답의 swapTransaction이 단일 Base64 문자열로만 제공

### Pitfall 6: 슬리피지 설정 부재로 샌드위치 공격 노출

**What goes wrong:** 슬리피지가 너무 높게 설정되면 MEV 봇이 프론트러닝으로 이익을 취한다.
**Why it happens:** 기본 slippageBps가 너무 높거나, 사용자 입력 없이 높은 슬리피지로 실행할 때.
**How to avoid:**
- 기본 slippageBps = 50 (0.5%) -- Jupiter 기본값과 동일
- 최대 slippageBps 상한 설정 (예: 500 = 5%)
- dynamicSlippage 활용 (Jupiter가 시장 상황에 따라 자동 조정)
- Jito MEV 보호 활성화 (jitoTipLamports로 직접 블록 엔진 전송)
**Warning signs:** priceImpactPct > 1% 인 quote 결과

## Code Examples

### IPriceOracle 인터페이스 설계 (Confidence: HIGH)

```typescript
// packages/core/src/interfaces/price-oracle.types.ts

import { z } from 'zod'

/**
 * 토큰 참조 (가격 조회용).
 * 체인별 포맷에 따라 address 또는 symbol로 조회.
 */
export const TokenRefSchema = z.object({
  /** 토큰 주소 (Solana: Base58 mint, EVM: 0x hex contract) */
  address: z.string(),
  /** 토큰 심볼 (CoinGecko fallback용) */
  symbol: z.string().optional(),
  /** 소수점 자릿수 */
  decimals: z.number().int().min(0).max(18),
  /** 체인 */
  chain: z.enum(['solana', 'ethereum']),
})

export type TokenRef = z.infer<typeof TokenRefSchema>

/**
 * 가격 정보 응답.
 */
export const PriceInfoSchema = z.object({
  /** USD 가격 (소수점 포함) */
  usdPrice: z.number().positive(),
  /** 가격 신뢰도 (Pyth의 confidence interval 개념) */
  confidence: z.number().min(0).max(1).optional(),
  /** 가격 소스 */
  source: z.enum(['coingecko', 'pyth', 'chainlink', 'jupiter', 'cache']),
  /** 가격 조회 시점 (UNIX timestamp ms) */
  fetchedAt: z.number(),
  /** 캐시 만료 시점 */
  expiresAt: z.number(),
  /** stale 여부 (TTL 만료 후 캐시 데이터인 경우) */
  isStale: z.boolean().default(false),
})

export type PriceInfo = z.infer<typeof PriceInfoSchema>

/**
 * IPriceOracle 인터페이스.
 *
 * 단일 가격 조회와 배치 가격 조회를 지원한다.
 * 캐시는 구현체 내부에서 관리한다.
 */
export interface IPriceOracle {
  /**
   * 단일 토큰의 USD 가격 조회.
   * 캐시 히트 시 캐시된 가격, 캐시 미스 시 외부 API 호출.
   *
   * @throws PriceNotAvailableError - 가격 조회 불가 (오라클 장애 + stale 없음)
   */
  getPrice(token: TokenRef): Promise<PriceInfo>

  /**
   * 다수 토큰의 USD 가격 배치 조회.
   * CoinGecko의 comma-separated 쿼리로 최적화 가능.
   *
   * 일부 토큰 가격 실패 시 성공한 것만 반환 (Map).
   */
  getPrices(tokens: TokenRef[]): Promise<Map<string, PriceInfo>>

  /**
   * 네이티브 토큰(SOL/ETH)의 USD 가격 조회.
   * 별도 메서드로 분리하여 getPrice()와 구분.
   */
  getNativePrice(chain: 'solana' | 'ethereum'): Promise<PriceInfo>

  /**
   * 캐시 통계 (모니터링용).
   */
  getCacheStats(): { hits: number; misses: number; staleHits: number; size: number }
}
```

### CoinGecko 구현체 핵심 로직 (Confidence: HIGH)

```typescript
// packages/daemon/src/services/price-oracle/coingecko-oracle.ts (설계 참조)

class CoinGeckoOracle implements IPriceOracle {
  private cache: Map<string, CacheEntry> = new Map()
  private readonly TTL_MS = 5 * 60 * 1000      // 5분
  private readonly STALE_MAX_MS = 30 * 60 * 1000 // 30분 (stale 허용 최대)
  private readonly BASE_URL = 'https://api.coingecko.com/api/v3'  // Demo
  // Pro: 'https://pro-api.coingecko.com/api/v3'

  // CoinGecko 체인 ID 매핑
  private readonly PLATFORM_IDS: Record<string, string> = {
    solana: 'solana',
    ethereum: 'ethereum',
  }

  async getPrice(token: TokenRef): Promise<PriceInfo> {
    const cacheKey = `${token.chain}:${token.address}`
    const cached = this.cache.get(cacheKey)

    // 1. 캐시 히트 (fresh)
    if (cached && Date.now() < cached.expiresAt) {
      return { ...cached.price, source: 'cache', isStale: false }
    }

    // 2. 외부 API 호출
    try {
      const platformId = this.PLATFORM_IDS[token.chain]
      const url = `${this.BASE_URL}/simple/token_price/${platformId}` +
        `?contract_addresses=${token.address}` +
        `&vs_currencies=usd` +
        `&include_last_updated_at=true`

      const res = await fetch(url, {
        headers: { 'x-cg-demo-api-key': this.apiKey },
        signal: AbortSignal.timeout(5000),
      })

      if (!res.ok) throw new Error(`CoinGecko API ${res.status}`)

      const data = await res.json()
      const price = data[token.address.toLowerCase()]?.usd
      if (!price) throw new PriceNotAvailableError(token)

      const priceInfo: PriceInfo = {
        usdPrice: price,
        source: 'coingecko',
        fetchedAt: Date.now(),
        expiresAt: Date.now() + this.TTL_MS,
        isStale: false,
      }

      this.cache.set(cacheKey, { price: priceInfo, expiresAt: priceInfo.expiresAt })
      return priceInfo

    } catch (error) {
      // 3. Fallback: stale 캐시 허용
      if (cached && Date.now() < cached.expiresAt + this.STALE_MAX_MS) {
        return { ...cached.price, source: 'cache', isStale: true }
      }
      throw new PriceNotAvailableError(token, error)
    }
  }
}
```

### USD 기준 정책 평가 확장 (Confidence: HIGH)

```typescript
// 기존 resolveEffectiveAmount() -> resolveEffectiveAmountUsd() 확장

async function resolveEffectiveAmountUsd(
  input: PolicyEvaluationInput,
  priceOracle: IPriceOracle,
): Promise<{ usdAmount: number; fallbackToNative: boolean }> {
  try {
    switch (input.type) {
      case 'TRANSFER': {
        // 네이티브 토큰 -> USD 변환
        const nativePrice = await priceOracle.getNativePrice(input.chain)
        const usdAmount = Number(input.amount) / (10 ** nativeDecimals(input.chain)) * nativePrice.usdPrice
        return { usdAmount, fallbackToNative: false }
      }
      case 'TOKEN_TRANSFER': {
        // Phase 24 핵심: 토큰 -> USD 변환
        if (!input.tokenAddress) return { usdAmount: 0, fallbackToNative: true }
        const tokenPrice = await priceOracle.getPrice({
          address: input.tokenAddress,
          decimals: input.tokenDecimals ?? 9,
          chain: input.chain,
        })
        const usdAmount = Number(input.amount) / (10 ** (input.tokenDecimals ?? 9)) * tokenPrice.usdPrice
        return { usdAmount, fallbackToNative: false }
      }
      case 'CONTRACT_CALL': {
        // value의 USD 변환 (네이티브 토큰 첨부량)
        if (input.amount === 0n) return { usdAmount: 0, fallbackToNative: false }
        const nativePrice = await priceOracle.getNativePrice(input.chain)
        const usdAmount = Number(input.amount) / (10 ** nativeDecimals(input.chain)) * nativePrice.usdPrice
        return { usdAmount, fallbackToNative: false }
      }
      case 'BATCH': {
        // 개별 instruction USD 합산
        // ... 각 instruction의 USD 합산 로직
        return { usdAmount: totalUsd, fallbackToNative: false }
      }
      case 'APPROVE':
        return { usdAmount: 0, fallbackToNative: false } // TIER_OVERRIDE 독립
      default:
        return { usdAmount: 0, fallbackToNative: true }
    }
  } catch {
    // 오라클 장애: Phase 22-23 과도기 전략으로 fallback
    return { usdAmount: 0, fallbackToNative: true }
  }
}

// SpendingLimitRuleSchema 확장
const SpendingLimitRuleSchema = z.object({
  // 기존 네이티브 금액 기준 (하위 호환)
  instant_max: z.string(),
  notify_max: z.string(),
  delay_max: z.string(),
  // Phase 24: USD 금액 기준 (추가)
  instant_max_usd: z.number().optional(),  // 예: 10 (=$10)
  notify_max_usd: z.number().optional(),   // 예: 100 (=$100)
  delay_max_usd: z.number().optional(),    // 예: 1000 (=$1000)
  // USD 미설정 시 네이티브 기준 사용 (하위 호환)
  delay_seconds: z.number().int().min(60).default(900),
  approval_timeout: z.number().int().min(300).default(3600),
})
```

### IActionProvider 인터페이스 설계 (Confidence: HIGH)

```typescript
// packages/core/src/interfaces/action-provider.types.ts

/**
 * Action Provider 메타데이터.
 */
export interface ActionProviderMetadata {
  /** 고유 이름 (snake_case) */
  name: string
  /** 사람이 읽을 수 있는 설명 */
  description: string
  /** 버전 */
  version: string
  /** 지원 체인 */
  chains: Array<'solana' | 'ethereum'>
  /** MCP Tool로 노출할지 여부 */
  mcpExpose: boolean
  /** 필요한 외부 API (설정 안내용) */
  requiredApis?: string[]
}

/**
 * Action 정의.
 * Zod 스키마 기반으로 MCP Tool 자동 변환 가능.
 */
export interface ActionDefinition {
  /** 액션 이름 (snake_case, MCP tool name으로 매핑) */
  name: string
  /** 액션 설명 (MCP tool description으로 매핑) */
  description: string
  /** 지원 체인 */
  chain: 'solana' | 'ethereum'
  /** 입력 파라미터 Zod 스키마 (MCP tool inputSchema로 매핑) */
  inputSchema: z.ZodObject<any>
  /** 위험도 (MCP description에 부가) */
  riskLevel: 'low' | 'medium' | 'high'
  /** 예상 기본 보안 티어 */
  defaultTier: 'INSTANT' | 'NOTIFY' | 'DELAY' | 'APPROVAL'
}

/**
 * IActionProvider 인터페이스.
 *
 * resolve-then-execute 패턴:
 * 1. resolve()로 고수준 DeFi 의도를 ContractCallRequest로 변환
 * 2. ContractCallRequest가 기존 파이프라인 (Stage 1-6)을 거침
 * 3. 정책 엔진이 CONTRACT_WHITELIST, SPENDING_LIMIT 등으로 평가
 */
export interface IActionProvider {
  /** 프로바이더 메타데이터 */
  readonly metadata: ActionProviderMetadata

  /** 지원하는 액션 목록 */
  readonly actions: ActionDefinition[]

  /**
   * 고수준 DeFi 의도를 ContractCallRequest로 변환.
   *
   * @param actionName - 실행할 액션 이름
   * @param params - 액션 입력 파라미터 (inputSchema 기반)
   * @param context - 실행 컨텍스트 (에이전트 주소, 체인 등)
   * @returns ContractCallRequest -- 기존 파이프라인에 주입
   *
   * @throws ActionNotFoundError - 존재하지 않는 액션
   * @throws ActionValidationError - 입력 파라미터 검증 실패
   * @throws ActionResolveError - 외부 API 호출 실패 (Quote API 등)
   */
  resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest>
}

export interface ActionContext {
  /** 에이전트 지갑 주소 */
  walletAddress: string
  /** 체인 */
  chain: 'solana' | 'ethereum'
  /** 에이전트 ID */
  agentId: string
}
```

### Jupiter Swap Action Provider (Confidence: MEDIUM)

```typescript
// packages/actions/src/providers/jupiter-swap.ts (설계 참조)

class JupiterSwapActionProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata = {
    name: 'jupiter_swap',
    description: 'Jupiter DEX aggregator for Solana token swaps',
    version: '1.0.0',
    chains: ['solana'],
    mcpExpose: true,
    requiredApis: ['Jupiter Quote API (https://api.jup.ag)'],
  }

  readonly actions: ActionDefinition[] = [{
    name: 'jupiter_swap',
    description: 'Swap tokens on Solana via Jupiter aggregator. ' +
      'Fetches optimal route across 20+ DEXs, applies slippage protection, ' +
      'and returns a ContractCallRequest for the existing pipeline.',
    chain: 'solana',
    inputSchema: z.object({
      inputMint: z.string().describe('Input token mint address (Base58)'),
      outputMint: z.string().describe('Output token mint address (Base58)'),
      amount: z.string().describe('Amount to swap in smallest unit (lamports)'),
      slippageBps: z.number().int().min(1).max(500).default(50)
        .describe('Slippage tolerance in basis points (50 = 0.5%)'),
    }),
    riskLevel: 'high',
    defaultTier: 'APPROVAL',
  }]

  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest> {
    // 1. 입력 검증
    const input = this.actions[0].inputSchema.parse(params)

    // 2. Jupiter Quote API 호출
    const quoteUrl = `https://api.jup.ag/swap/v1/quote` +
      `?inputMint=${input.inputMint}` +
      `&outputMint=${input.outputMint}` +
      `&amount=${input.amount}` +
      `&slippageBps=${input.slippageBps}` +
      `&restrictIntermediateTokens=true`

    const quoteRes = await fetch(quoteUrl)
    if (!quoteRes.ok) throw new ActionResolveError('Jupiter quote failed')
    const quote = await quoteRes.json()

    // 3. 가격 영향 검증
    if (parseFloat(quote.priceImpactPct) > 1.0) {
      throw new ActionResolveError(
        `Price impact too high: ${quote.priceImpactPct}%. Max allowed: 1%.`
      )
    }

    // 4. Jupiter Swap Instructions API 호출 (개별 instruction 획득)
    //    POST /swap-instructions로 instruction 수준 데이터 획득
    //    POST /swap은 직렬화된 전체 트랜잭션을 반환하므로 부적합
    const swapInstructionsRes = await fetch('https://api.jup.ag/swap/v1/swap-instructions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: context.walletAddress,
        prioritizationFeeLamports: {
          jitoTipLamports: 1000,  // 최소 Jito 팁 (MEV 보호)
        },
      }),
    })

    // 5. instruction 데이터 -> ContractCallRequest 변환
    const swapInstructions = await swapInstructionsRes.json()

    // Jupiter 프로그램 주소
    const jupiterProgramId = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'

    return {
      from: context.walletAddress,
      to: jupiterProgramId,
      programId: jupiterProgramId,
      instructionData: swapInstructions.swapInstruction.data,  // Base64
      accounts: swapInstructions.swapInstruction.accounts.map(
        (acc: any) => ({
          address: acc.pubkey,
          isSigner: acc.isSigner,
          isWritable: acc.isWritable,
        })
      ),
    }
  }
}
```

## State of the Art

| 영역 | 이전 접근 | 현재 접근 | 변경 시점 | 영향 |
|------|----------|----------|----------|------|
| Jupiter API | v6 (quote-api.jup.ag) | v1 (api.jup.ag/swap/v1) | 2025 Q4 | 엔드포인트 URL 변경, 파라미터 구조 변경 |
| Jupiter Price API | v2 (lite-api.jup.ag) | v3 (api.jup.ag/price/v3) | 2025 Q4 | v2 2026-01-31 deprecated, API 키 필요 |
| CoinGecko Free Tier | Public (5-15 calls/min) | Demo (30 calls/min, 키 필요) | 2025 | 안정적 rate limit, 무료 가입 |
| MCP SDK | v1.0 stable | v2 pre-alpha (v1 권장) | 2026 Q1 | Zod v4 peer dep, server.tool() API 안정 |
| Pyth Hermes | /api/latest_price_feeds | /v2/updates/price/latest | 2025 | v2 엔드포인트, 30 req/10s |
| 0x API | v1 | v2 (Permit2/AllowanceHolder) | 2025 | EVM 스왑 표준 변경, taker 필수 |

**Deprecated/Outdated:**
- Jupiter lite-api.jup.ag: 2026-01-31부로 deprecated. api.jup.ag로 마이그레이션 필요.
- CoinGecko Public API (키 없음): 5-15 calls/min으로 불안정. Demo 키 사용 권장.
- Pyth v1 API (/api/latest_price_feeds): v2 (/v2/updates/price/latest) 사용 권장.

## Open Questions

1. **Jupiter swap-instructions 엔드포인트 가용성**
   - What we know: Jupiter POST /swap은 직렬화된 전체 트랜잭션을 반환한다. POST /swap-instructions 엔드포인트가 존재하며 개별 instruction을 반환한다.
   - What's unclear: /swap-instructions의 정확한 응답 스키마와 instruction 분해 수준.
   - Recommendation: 설계에서 /swap-instructions 사용을 기본으로 하되, 불가 시 VersionedTransaction.deserialize()로 instruction 추출하는 fallback 경로도 명세.

2. **CoinGecko Solana 플랫폼 ID**
   - What we know: Ethereum은 'ethereum'으로 확인. CoinGecko가 Solana 토큰을 지원한다.
   - What's unclear: /simple/token_price/{id}에서 Solana의 정확한 플랫폼 ID (아마 'solana'이지만 공식 확인 미완).
   - Recommendation: 설계에서 'solana'로 가정하고, 구현 시 /asset_platforms 엔드포인트로 확인.

3. **플러그인 보안 경계**
   - What we know: Node.js ESM dynamic import는 full access를 부여한다. vm.Module은 실험적이다.
   - What's unclear: 적절한 보안 경계 수준. 완전 샌드박스(vm) vs 검증 후 신뢰(validate-then-trust).
   - Recommendation: v0.6은 설계 문서이므로 "validate-then-trust" 패턴 채택 (IActionProvider 인터페이스 준수 검증 + resolve() 반환값 Zod 검증). 완전 샌드박스는 향후 확장으로 기록.

4. **BATCH 내 TOKEN_TRANSFER의 USD 합산**
   - What we know: Phase 23에서 BATCH 합산 금액 = 네이티브 금액 합산 (TOKEN_TRANSFER/APPROVE = 0n).
   - What's unclear: Phase 24에서 배치 내 서로 다른 토큰의 USD 합산 시, 하나만 가격 실패하면 전체 배치를 어떻게 처리할지.
   - Recommendation: 개별 instruction의 USD 변환이 하나라도 실패하면 해당 instruction만 네이티브 fallback(0n)으로 처리하되, 전체 배치 USD 합산에는 성공한 것만 포함. 보수적으로 "USD 변환 실패한 instruction 포함 시 NOTIFY 이상" 강제.

## Sources

### Primary (HIGH confidence)
- CoinGecko Simple Price API: https://docs.coingecko.com/reference/simple-price -- 엔드포인트, 파라미터, 인증
- CoinGecko Token Price API: https://docs.coingecko.com/reference/simple-token-price -- 컨트랙트 주소 기반 조회
- Jupiter Swap API v1 Quote: https://dev.jup.ag/api-reference/swap/quote -- 파라미터, 응답 스키마
- Jupiter Swap API Build: https://dev.jup.ag/docs/swap-api/build-swap-transaction -- POST /swap 요청/응답
- Jupiter Swap Send: https://dev.jup.ag/docs/swap-api/send-swap-transaction -- Jito 팁, priority fee, MEV 보호
- Jupiter Price API v3: https://dev.jup.ag/docs/price/v3 -- 가격 엔드포인트, 인증
- Pyth Hermes: https://docs.pyth.network/price-feeds/core/how-pyth-works/hermes -- 엔드포인트, 응답
- Pyth Rate Limits: https://docs.pyth.network/price-feeds/core/rate-limits -- 30 req/10s
- MCP SDK: https://github.com/modelcontextprotocol/typescript-sdk -- server.tool() API, Zod peer dep
- 0x Swap API v2: https://0x.org/docs/0x-swap-api/guides/swap-tokens-with-0x-swap-api -- EVM 스왑 엔드포인트

### Secondary (MEDIUM confidence)
- Chainlink Price Feeds: https://docs.chain.link/data-feeds/using-data-feeds -- AggregatorV3Interface, 온체인 RPC 읽기
- Jupiter Price API V3 Beta 응답 형태: WebSearch 결과 교차 검증
- CoinGecko Demo Plan 30 calls/min: https://support.coingecko.com/hc/en-us/articles/4538771776153

### Tertiary (LOW confidence)
- Jupiter /swap-instructions 엔드포인트 상세 응답 스키마: WebSearch만, 공식 문서 미확인
- CoinGecko Solana 플랫폼 ID 'solana': 추론 기반, /asset_platforms 확인 필요
- Node.js ESM 플러그인 보안 경계 패턴: 일반 지식, WAIaaS 특화 검증 미완

## Metadata

**Confidence breakdown:**
- 가격 오라클 (IPriceOracle, CoinGecko API): HIGH -- 공식 문서에서 직접 확인
- 캐싱 전략 (5분 TTL, stale fallback): HIGH -- 프로젝트 요구사항에서 직접 명시
- USD 정책 통합 (SpendingLimitRuleSchema 확장): HIGH -- Phase 22-23 설계 문서 기반 직접 도출
- Jupiter Swap API (Quote/Swap/Jito): HIGH -- 공식 문서에서 직접 확인
- Action Provider 아키텍처 (IActionProvider, resolve-then-execute): HIGH -- v0.6 핵심 결정에서 직접 도출
- MCP Tool 자동 변환 (ActionDefinition -> server.tool()): HIGH -- 38-sdk-mcp-interface.md 기존 패턴 기반
- 플러그인 로드 (~/.waiaas/actions/): MEDIUM -- ESM dynamic import 일반 패턴, 보안 경계 미확정
- Jupiter /swap-instructions 상세: MEDIUM -- 엔드포인트 존재 확인, 상세 스키마 미확인

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (30일 -- 외부 API는 7일 내 재확인 권장)
