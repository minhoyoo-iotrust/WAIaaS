# 가격 오라클 스펙 (CHAIN-EXT-06)

**문서 ID:** CHAIN-EXT-06
**작성일:** 2026-02-08
**상태:** 완료
**Phase:** 24 (상위 추상화 레이어 설계)
**참조:** CHAIN-EXT-03 (58-contract-call-spec.md), CHAIN-EXT-01 (56-token-transfer-extension-spec.md), CHAIN-EXT-04 (59-approve-management-spec.md), CHAIN-EXT-05 (60-batch-transaction-spec.md), LOCK-MECH (33-time-lock-approval-mechanism.md), TX-PIPE (32-transaction-pipeline-api.md), ENUM-MAP (45-enum-unified-mapping.md), 24-RESEARCH.md
**요구사항:** ORACLE-01 (IPriceOracle 인터페이스), ORACLE-02 (캐싱/fallback), ORACLE-03 (USD 기준 정책 확장), ORACLE-04 (테스트/보안 시나리오)

---

## 1. 개요

### 1.1 목적

이 문서는 WAIaaS 트랜잭션 파이프라인의 **가격 오라클(Price Oracle)** 서비스를 설계하는 정식 스펙이다. Phase 22-23에서 과도기 처리한 토큰 금액 기반 정책 평가를 해소하여, 토큰 종류와 무관하게 **USD 기준으로 동일한 4-tier 분류(INSTANT/NOTIFY/DELAY/APPROVAL)**를 적용한다.

Phase 22-23의 과도기 상태:
- `TOKEN_TRANSFER`: `resolveEffectiveAmount()` = `0n` -> 기본 NOTIFY 고정
- `APPROVE`: `resolveEffectiveAmount()` = `0n` -> APPROVE_TIER_OVERRIDE 독립
- `CONTRACT_CALL`: `value`(네이티브 토큰 첨부량)만 SPENDING_LIMIT 반영
- `BATCH`: 네이티브 금액 합산만 반영, TOKEN_TRANSFER/APPROVE = `0n`

Phase 24에서 해소하는 목표 상태:
- **모든 TransactionType의 금액을 USD로 변환하여 SPENDING_LIMIT 정책을 일관 적용**
- USD 변환 실패 시 Phase 22-23 과도기 전략으로 graceful fallback

### 1.2 요구사항 매핑

| 요구사항 | 커버리지 | 섹션 |
|---------|---------|------|
| ORACLE-01 | IPriceOracle 인터페이스 (4개 메서드) + CoinGecko/Pyth/Chainlink 3개 구현체 | 섹션 2, 3 |
| ORACLE-02 | 5분 TTL 캐싱 전략 + stale 30분 허용 + 3단계 fallback | 섹션 4, 5 |
| ORACLE-03 | USD 기준 정책 평가 확장 (resolveEffectiveAmountUsd, SpendingLimitRuleSchema USD 필드) | 섹션 6 |
| ORACLE-04 | 가격 변동 감지/보안 + 테스트 레벨/Mock/보안 시나리오 10+ | 섹션 7, 8 |

### 1.3 핵심 설계 원칙

| # | 원칙 | 설명 | 적용 |
|---|------|------|------|
| 1 | **캐시 없이 외부 API 직접 호출 금지** | 매 트랜잭션마다 CoinGecko를 호출하면 rate limit 즉시 도달. 5분 TTL 캐시 필수 | 섹션 4 |
| 2 | **단일 소스 의존 금지** | CoinGecko 장애 시 Pyth/Chainlink fallback, 최종 stale 캐시 허용 | 섹션 5 |
| 3 | **USD 변환 실패 시 트랜잭션 거부 금지** | 오라클 장애로 USD 가격을 조회할 수 없을 때, Phase 22-23 과도기 전략으로 fallback | 섹션 5, 6 |
| 4 | **IChainAdapter와 독립** | 오라클은 서비스 레이어에 위치. IChainAdapter 저수준 유지 원칙 유지 | 섹션 2 |
| 5 | **보수적 판단 원칙** | stale 가격, 가격 급변동, 부분 실패 시 항상 높은(보수적) 티어 적용 | 섹션 5, 7 |

### 1.4 v0.6 핵심 결정 인용

> "USD 기준 정책 평가 (토큰 종류 무관한 티어 분류)" -- v0.6 핵심 결정

> "IChainAdapter는 저수준 실행 엔진으로 유지 (DeFi 지식은 Action Provider에 분리)" -- v0.6 핵심 결정

### 1.5 서비스 아키텍처 위치

```
┌────────────────────────────────────────────────────────────────────┐
│  TransactionService (서비스 레이어)                                  │
│                                                                     │
│  Stage 3: DatabasePolicyEngine.evaluate()                           │
│    ├── 기존 11단계 정책 평가 (CHAIN-EXT-03)                          │
│    └── [Phase 24] resolveEffectiveAmountUsd(input, priceOracle)     │
│              │                                                      │
│              ▼                                                      │
│  ┌───────────────────────────────────────────────────────┐          │
│  │  IPriceOracle (서비스 레이어 의존성)                     │          │
│  │                                                        │          │
│  │  getPrice(token) -> PriceInfo                          │          │
│  │  getPrices(tokens) -> Map<string, PriceInfo>           │          │
│  │  getNativePrice(chain) -> PriceInfo                    │          │
│  │  getCacheStats() -> CacheStats                         │          │
│  └──────┬────────────────┬──────────────┬────────────────┘          │
│         │                │              │                           │
│    ┌────┴────┐    ┌──────┴──────┐  ┌───┴──────────┐                │
│    │CoinGecko│    │Pyth Hermes  │  │Chainlink RPC │                │
│    │(기본)    │    │(Solana 대안)│  │(EVM 대안)     │                │
│    └─────────┘    └─────────────┘  └──────────────┘                │
└────────────────────────────────────────────────────────────────────┘
         │                                │
         ▼                                ▼
  IChainAdapter (저수준 실행)      SQLite (정책 저장)
```

**핵심:** IPriceOracle은 IChainAdapter와 같은 레벨이 아니라, TransactionService 내부에서 정책 평가 시 주입되는 서비스 의존성이다. IChainAdapter는 가격 정보를 알 필요가 없다.

---

## 2. IPriceOracle 인터페이스 (ORACLE-01)

### 2.1 TokenRef Zod 스키마

```typescript
// packages/core/src/interfaces/price-oracle.types.ts

import { z } from 'zod'

/**
 * 토큰 참조 (가격 조회용).
 * 체인별 포맷에 따라 address로 조회하고, symbol은 CoinGecko fallback에 사용한다.
 *
 * CHAIN-EXT-01 TokenInfo와의 관계:
 * - TokenInfo: TransferRequest에서 전송할 토큰 정보 (address, decimals, symbol)
 * - TokenRef: 가격 조회용 토큰 참조 (address, symbol?, decimals, chain)
 * - TokenRef는 chain 필드를 포함하여 가격 소스 선택에 사용한다
 */
export const TokenRefSchema = z.object({
  /** 토큰 주소 (Solana: Base58 mint, EVM: 0x hex contract) */
  address: z.string().min(1, '토큰 주소는 필수'),

  /** 토큰 심볼 (CoinGecko fallback용, 선택) */
  symbol: z.string().optional(),

  /** 소수점 자릿수 (USD 변환 시 amount / 10^decimals 계산용) */
  decimals: z.number().int().min(0).max(18),

  /** 체인 (가격 소스 선택 + CoinGecko platformId 결정) */
  chain: z.enum(['solana', 'ethereum']),
})

export type TokenRef = z.infer<typeof TokenRefSchema>
```

### 2.2 PriceInfo Zod 스키마

```typescript
/**
 * 가격 정보 응답.
 * 모든 가격 조회 결과는 이 스키마를 따른다.
 */
export const PriceInfoSchema = z.object({
  /** USD 가격 (소수점 포함). 예: SOL = 150.25, USDC = 1.0001 */
  usdPrice: z.number().nonnegative(),

  /**
   * 가격 신뢰도 (0~1 범위, 선택).
   * Pyth의 confidence interval 개념을 활용한다.
   * - 1.0: 매우 신뢰 (CoinGecko 집계 가격)
   * - 0.8+: 신뢰 (Pyth 낮은 confidence interval)
   * - 0.5 미만: 주의 필요 (높은 변동성 또는 유동성 부족)
   *
   * CoinGecko/Chainlink는 confidence를 제공하지 않으므로 undefined.
   */
  confidence: z.number().min(0).max(1).optional(),

  /** 가격 소스 식별자 */
  source: z.enum(['coingecko', 'pyth', 'chainlink', 'jupiter', 'cache']),

  /** 가격이 조회된 시점 (Unix timestamp milliseconds) */
  fetchedAt: z.number().int().positive(),

  /** 캐시 만료 시점 (Unix timestamp milliseconds) */
  expiresAt: z.number().int().positive(),

  /**
   * stale 여부.
   * true: TTL 만료 후 캐시 데이터를 반환한 경우.
   * stale 가격으로 INSTANT 판정 시 NOTIFY로 상향하는 보수적 판단에 사용.
   */
  isStale: z.boolean().default(false),
})

export type PriceInfo = z.infer<typeof PriceInfoSchema>
```

### 2.3 CacheStats 타입

```typescript
/**
 * 캐시 통계 (모니터링/헬스체크용).
 */
export interface CacheStats {
  /** 캐시 히트 횟수 (TTL 이내 응답) */
  hits: number
  /** 캐시 미스 횟수 (외부 API 호출 필요) */
  misses: number
  /** stale 히트 횟수 (TTL 만료 후 stale 데이터 반환) */
  staleHits: number
  /** 현재 캐시 항목 수 */
  size: number
  /** LRU eviction 횟수 */
  evictions: number
}
```

### 2.4 IPriceOracle 인터페이스

```typescript
/**
 * IPriceOracle 인터페이스.
 *
 * 토큰 가격을 USD로 조회하는 서비스 인터페이스.
 * 캐싱, fallback, 다중 소스 전략은 구현체 내부에서 관리한다.
 *
 * 사용 위치:
 * - DatabasePolicyEngine.evaluate() Stage 11 (SPENDING_LIMIT)에서
 *   resolveEffectiveAmountUsd()를 통해 호출
 * - GET /v1/admin/oracle-status 헬스체크 엔드포인트에서 getCacheStats() 호출
 *
 * 구현체:
 * - CoinGeckoOracle (기본): Demo API, Solana + EVM 범용
 * - PythOracle (Solana 대안): Hermes REST API, 서브초 갱신
 * - ChainlinkOracle (EVM 대안): AggregatorV3Interface 온체인 RPC 읽기
 * - OracleChain: 다중 소스 순차 시도 (Primary -> Fallback -> stale cache)
 */
export interface IPriceOracle {
  /**
   * 단일 토큰의 USD 가격 조회.
   * 캐시 히트 시 캐시된 가격, 캐시 미스 시 외부 API 호출.
   *
   * @param token - 조회할 토큰 참조
   * @returns PriceInfo - USD 가격 정보
   * @throws PriceNotAvailableError - 모든 소스 실패 + stale 캐시 없음
   */
  getPrice(token: TokenRef): Promise<PriceInfo>

  /**
   * 다수 토큰의 USD 가격 배치 조회.
   * CoinGecko의 comma-separated 쿼리로 네트워크 호출 최적화.
   * 일부 토큰 가격 실패 시 성공한 것만 반환 (Map).
   *
   * @param tokens - 조회할 토큰 참조 배열
   * @returns Map<cacheKey, PriceInfo> - 성공한 토큰의 가격 정보
   */
  getPrices(tokens: TokenRef[]): Promise<Map<string, PriceInfo>>

  /**
   * 네이티브 토큰(SOL/ETH)의 USD 가격 조회.
   * 별도 메서드로 분리하여 getPrice()와 구분.
   * CoinGecko /simple/price 엔드포인트 사용 (token_price가 아닌).
   *
   * @param chain - 'solana' (SOL) 또는 'ethereum' (ETH)
   * @returns PriceInfo - 네이티브 토큰 USD 가격
   * @throws PriceNotAvailableError - 가격 조회 불가
   */
  getNativePrice(chain: 'solana' | 'ethereum'): Promise<PriceInfo>

  /**
   * 캐시 통계 (모니터링용).
   * GET /v1/admin/oracle-status 헬스체크에서 사용.
   */
  getCacheStats(): CacheStats
}
```

### 2.5 에러 타입

```typescript
/**
 * 가격 조회 불가 에러.
 * 모든 소스 실패 + stale 캐시 없음 시 발생.
 *
 * resolveEffectiveAmountUsd()에서 이 에러를 catch하여
 * Phase 22-23 과도기 전략으로 fallback한다.
 */
export class PriceNotAvailableError extends Error {
  readonly code = 'PRICE_NOT_AVAILABLE' as const
  readonly token: TokenRef | { chain: string }
  readonly cause?: Error

  constructor(token: TokenRef | { chain: string }, cause?: Error) {
    const id = 'address' in token ? token.address : token.chain
    super(`Price not available for ${id}`)
    this.name = 'PriceNotAvailableError'
    this.token = token
    this.cause = cause
  }
}

/**
 * 가격 stale 경고.
 * TTL 만료 후 stale 데이터를 반환할 때 로깅용으로 발생.
 * 에러가 아닌 경고이므로 throw하지 않고 로그에 기록한다.
 */
export class PriceStaleWarning {
  readonly code = 'PRICE_STALE' as const
  readonly token: TokenRef | { chain: string }
  readonly staleSince: number  // TTL 만료 시점 (ms)
  readonly age: number  // stale 경과 시간 (ms)

  constructor(token: TokenRef | { chain: string }, staleSince: number) {
    this.token = token
    this.staleSince = staleSince
    this.age = Date.now() - staleSince
  }
}

/**
 * 급격한 가격 변동 경고.
 * 이전 캐시 대비 +-50% 변동 감지 시 발생.
 */
export class PriceSpikeWarning {
  readonly code = 'PRICE_SPIKE_DETECTED' as const
  readonly token: TokenRef | { chain: string }
  readonly previousPrice: number
  readonly currentPrice: number
  readonly changePercent: number

  constructor(
    token: TokenRef | { chain: string },
    previousPrice: number,
    currentPrice: number,
  ) {
    this.token = token
    this.previousPrice = previousPrice
    this.currentPrice = currentPrice
    this.changePercent = ((currentPrice - previousPrice) / previousPrice) * 100
  }
}
```

### 2.6 네이티브 토큰 별도 처리 근거

| 항목 | getPrice(token) | getNativePrice(chain) |
|------|----------------|----------------------|
| **대상** | SPL/ERC-20 토큰 | SOL, ETH |
| **CoinGecko 엔드포인트** | `/simple/token_price/{platformId}` | `/simple/price` |
| **조회 키** | contract_addresses (토큰 주소) | ids (solana, ethereum) |
| **분리 이유** | 네이티브 토큰은 컨트랙트 주소가 없음 | 네이티브 토큰은 CoinGecko coin ID로 조회 |
| **안정성** | 토큰에 따라 가격 미존재 가능 | SOL/ETH는 항상 가격 존재 (안정적) |

---

## 3. 구현체 설계 (ORACLE-01)

### 3.1 CoinGeckoOracle (기본 구현체)

**역할:** CoinGecko Demo API를 사용하는 기본 가격 오라클. Solana와 EVM 모두 지원.

| 항목 | 값 |
|------|------|
| **API 티어** | Demo (무료, 30 calls/min) |
| **인증** | `x-cg-demo-api-key` 헤더 |
| **네이티브 토큰** | `/simple/price?ids=solana,ethereum&vs_currencies=usd` |
| **SPL/ERC-20 토큰** | `/simple/token_price/{platformId}?contract_addresses={addr}&vs_currencies=usd` |
| **Solana platformId** | `solana` |
| **EVM platformId** | `ethereum` |
| **타임아웃** | 5초 (AbortSignal.timeout) |
| **응답 포맷** | `{ "solana": { "usd": 150.25 } }` |

```typescript
// packages/daemon/src/services/price-oracle/coingecko-oracle.ts (설계 참조)

class CoinGeckoOracle implements IPriceOracle {
  private cache: PriceCache
  private readonly BASE_URL = 'https://api.coingecko.com/api/v3'
  private readonly apiKey: string  // 환경변수 COINGECKO_API_KEY 또는 config.toml

  // CoinGecko 체인 ID 매핑
  private readonly PLATFORM_IDS: Record<string, string> = {
    solana: 'solana',
    ethereum: 'ethereum',
  }

  // CoinGecko native coin ID 매핑
  private readonly NATIVE_COIN_IDS: Record<string, string> = {
    solana: 'solana',
    ethereum: 'ethereum',
  }

  constructor(apiKey: string, cache: PriceCache) {
    this.apiKey = apiKey
    this.cache = cache
  }

  async getPrice(token: TokenRef): Promise<PriceInfo> {
    const cacheKey = `${token.chain}:${token.address}`

    // 1. 캐시 조회
    const cached = this.cache.get(cacheKey)
    if (cached && !cached.isExpired) {
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
      if (price === undefined || price === null) {
        throw new PriceNotAvailableError(token)
      }

      const now = Date.now()
      const priceInfo: PriceInfo = {
        usdPrice: price,
        source: 'coingecko',
        fetchedAt: now,
        expiresAt: now + this.cache.TTL_MS,
        isStale: false,
      }

      // 3. 가격 급변동 감지
      if (cached) {
        this.detectPriceSpike(token, cached.price.usdPrice, price)
      }

      // 4. 캐시 저장
      this.cache.set(cacheKey, priceInfo)
      return priceInfo

    } catch (error) {
      // 5. Fallback: stale 캐시 허용
      if (cached && cached.isWithinStaleAge) {
        const stalePrice = { ...cached.price, source: 'cache' as const, isStale: true }
        // stale 경고 로깅
        this.logStaleWarning(token, cached.price.expiresAt)
        return stalePrice
      }
      throw new PriceNotAvailableError(token, error as Error)
    }
  }

  async getPrices(tokens: TokenRef[]): Promise<Map<string, PriceInfo>> {
    const result = new Map<string, PriceInfo>()

    // 캐시 히트 필터
    const cacheMisses: TokenRef[] = []
    for (const token of tokens) {
      const cacheKey = `${token.chain}:${token.address}`
      const cached = this.cache.get(cacheKey)
      if (cached && !cached.isExpired) {
        result.set(cacheKey, { ...cached.price, source: 'cache', isStale: false })
      } else {
        cacheMisses.push(token)
      }
    }

    if (cacheMisses.length === 0) return result

    // 체인별 그룹화 후 배치 요청
    const byChain = new Map<string, TokenRef[]>()
    for (const token of cacheMisses) {
      const group = byChain.get(token.chain) ?? []
      group.push(token)
      byChain.set(token.chain, group)
    }

    for (const [chain, chainTokens] of byChain) {
      try {
        const platformId = this.PLATFORM_IDS[chain]
        const addresses = chainTokens.map(t => t.address).join(',')
        const url = `${this.BASE_URL}/simple/token_price/${platformId}` +
          `?contract_addresses=${addresses}` +
          `&vs_currencies=usd` +
          `&include_last_updated_at=true`

        const res = await fetch(url, {
          headers: { 'x-cg-demo-api-key': this.apiKey },
          signal: AbortSignal.timeout(10000),
        })

        if (!res.ok) continue  // 실패 시 해당 체인 건너뜀

        const data = await res.json()
        const now = Date.now()

        for (const token of chainTokens) {
          const price = data[token.address.toLowerCase()]?.usd
          if (price !== undefined && price !== null) {
            const cacheKey = `${token.chain}:${token.address}`
            const priceInfo: PriceInfo = {
              usdPrice: price,
              source: 'coingecko',
              fetchedAt: now,
              expiresAt: now + this.cache.TTL_MS,
              isStale: false,
            }
            this.cache.set(cacheKey, priceInfo)
            result.set(cacheKey, priceInfo)
          }
        }
      } catch {
        // 체인별 실패는 무시, 성공한 토큰만 반환
      }
    }

    return result
  }

  async getNativePrice(chain: 'solana' | 'ethereum'): Promise<PriceInfo> {
    const cacheKey = `${chain}:native`

    // 1. 캐시 조회
    const cached = this.cache.get(cacheKey)
    if (cached && !cached.isExpired) {
      return { ...cached.price, source: 'cache', isStale: false }
    }

    // 2. /simple/price 엔드포인트 (네이티브 토큰 전용)
    try {
      const coinId = this.NATIVE_COIN_IDS[chain]
      const url = `${this.BASE_URL}/simple/price` +
        `?ids=${coinId}` +
        `&vs_currencies=usd` +
        `&include_last_updated_at=true`

      const res = await fetch(url, {
        headers: { 'x-cg-demo-api-key': this.apiKey },
        signal: AbortSignal.timeout(5000),
      })

      if (!res.ok) throw new Error(`CoinGecko API ${res.status}`)

      const data = await res.json()
      const price = data[coinId]?.usd
      if (!price) throw new PriceNotAvailableError({ chain })

      const now = Date.now()
      const priceInfo: PriceInfo = {
        usdPrice: price,
        source: 'coingecko',
        fetchedAt: now,
        expiresAt: now + this.cache.TTL_MS,
        isStale: false,
      }

      this.cache.set(cacheKey, priceInfo)
      return priceInfo

    } catch (error) {
      if (cached && cached.isWithinStaleAge) {
        return { ...cached.price, source: 'cache' as const, isStale: true }
      }
      throw new PriceNotAvailableError({ chain }, error as Error)
    }
  }

  getCacheStats(): CacheStats {
    return this.cache.getStats()
  }

  private detectPriceSpike(
    token: TokenRef | { chain: string },
    previousPrice: number,
    currentPrice: number,
  ): void {
    if (previousPrice === 0) return
    const changePercent = Math.abs((currentPrice - previousPrice) / previousPrice) * 100
    if (changePercent >= 50) {
      const warning = new PriceSpikeWarning(token, previousPrice, currentPrice)
      // audit_log 기록 + 경고 로깅
      logger.warn('Price spike detected', {
        code: warning.code,
        previousPrice,
        currentPrice,
        changePercent: warning.changePercent.toFixed(2) + '%',
      })
    }
  }

  private logStaleWarning(
    token: TokenRef | { chain: string },
    expiredAt: number,
  ): void {
    const warning = new PriceStaleWarning(token, expiredAt)
    logger.warn('Returning stale price', {
      code: warning.code,
      staleSince: new Date(expiredAt).toISOString(),
      ageMs: warning.age,
    })
  }
}
```

### 3.2 PythOracle (Solana 대안)

**역할:** Pyth Network Hermes REST API를 사용하는 Solana 전용 대안 오라클. 서브초 갱신 주기와 confidence interval을 제공한다.

| 항목 | 값 |
|------|------|
| **엔드포인트** | `https://hermes.pyth.network/v2/updates/price/latest` |
| **Rate Limit** | 30 req/10s (공개 인스턴스) |
| **인증** | 없음 (공개) |
| **응답 포맷** | `{ parsed: [{ id, price: { price, expo, conf }, ema_price }] }` |
| **지원 체인** | Solana (EVM도 가능하나 Chainlink가 더 안정적) |
| **특장점** | confidence interval (가격 신뢰 구간) 제공 |

```typescript
// packages/daemon/src/services/price-oracle/pyth-oracle.ts (설계 참조)

/**
 * Pyth Feed ID 매핑.
 * Pyth는 토큰 주소가 아닌 고유 feed ID로 가격을 조회한다.
 * 설정 파일 또는 하드코딩으로 매핑을 관리한다.
 *
 * 참고: https://pyth.network/price-feeds
 */
const PYTH_FEED_IDS: Record<string, string> = {
  // Solana 네이티브
  'solana:native': '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',  // SOL/USD
  // USDC (Solana)
  'solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v':
    '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',  // USDC/USD
  // USDT (Solana)
  'solana:Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB':
    '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b',  // USDT/USD
  // 추가 토큰은 config.toml에서 확장 가능
}

class PythOracle implements IPriceOracle {
  private cache: PriceCache
  private readonly BASE_URL = 'https://hermes.pyth.network'

  async getPrice(token: TokenRef): Promise<PriceInfo> {
    const cacheKey = `${token.chain}:${token.address}`
    const feedId = PYTH_FEED_IDS[cacheKey]

    if (!feedId) {
      throw new PriceNotAvailableError(token)  // feed ID 매핑 없음
    }

    // 캐시 조회 (생략 -- CoinGeckoOracle과 동일 패턴)
    const cached = this.cache.get(cacheKey)
    if (cached && !cached.isExpired) {
      return { ...cached.price, source: 'cache', isStale: false }
    }

    try {
      const url = `${this.BASE_URL}/v2/updates/price/latest` +
        `?ids[]=${feedId}` +
        `&parsed=true`

      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      })

      if (!res.ok) throw new Error(`Pyth API ${res.status}`)

      const data = await res.json()
      const priceFeed = data.parsed?.[0]

      if (!priceFeed?.price) {
        throw new PriceNotAvailableError(token)
      }

      // Pyth 가격 변환: price * 10^expo
      // 예: price=15025, expo=-2 -> $150.25
      const rawPrice = Number(priceFeed.price.price)
      const expo = priceFeed.price.expo
      const usdPrice = rawPrice * Math.pow(10, expo)

      // confidence interval 변환 (동일 expo 적용)
      const rawConf = Number(priceFeed.price.conf)
      const confUsd = rawConf * Math.pow(10, expo)
      const confidence = usdPrice > 0 ? Math.max(0, 1 - (confUsd / usdPrice)) : undefined

      const now = Date.now()
      const priceInfo: PriceInfo = {
        usdPrice,
        confidence,
        source: 'pyth',
        fetchedAt: now,
        expiresAt: now + this.cache.TTL_MS,
        isStale: false,
      }

      this.cache.set(cacheKey, priceInfo)
      return priceInfo

    } catch (error) {
      if (cached && cached.isWithinStaleAge) {
        return { ...cached.price, source: 'cache' as const, isStale: true }
      }
      throw new PriceNotAvailableError(token, error as Error)
    }
  }

  async getNativePrice(chain: 'solana' | 'ethereum'): Promise<PriceInfo> {
    // native 토큰도 feed ID로 조회
    const token: TokenRef = { address: 'native', chain, decimals: chain === 'solana' ? 9 : 18 }
    return this.getPrice(token)
  }

  // getPrices(), getCacheStats()는 CoinGeckoOracle과 동일 패턴
  async getPrices(tokens: TokenRef[]): Promise<Map<string, PriceInfo>> {
    const result = new Map<string, PriceInfo>()
    // Pyth는 한 번에 여러 feed ID를 조회 가능: ?ids[]=id1&ids[]=id2
    // 배치 최적화 구현 (생략 -- CoinGecko와 유사)
    for (const token of tokens) {
      try {
        const price = await this.getPrice(token)
        result.set(`${token.chain}:${token.address}`, price)
      } catch {
        // 개별 실패 무시
      }
    }
    return result
  }

  getCacheStats(): CacheStats {
    return this.cache.getStats()
  }
}
```

### 3.3 ChainlinkOracle (EVM 대안)

**역할:** Chainlink AggregatorV3Interface를 EVM RPC로 읽는 온체인 가격 오라클. 외부 HTTP API가 아닌 블록체인 RPC를 통해 가격을 조회한다.

| 항목 | 값 |
|------|------|
| **인터페이스** | AggregatorV3Interface.latestRoundData() |
| **접근 방식** | viem readContract (온체인 RPC 읽기) |
| **비용** | RPC 호출 비용만 (오라클 자체 무료) |
| **갱신 주기** | 블록당 (보통 12초 for Ethereum) |
| **정밀도** | 8 decimals (대부분의 USD 피드) |
| **지원 체인** | EVM (Ethereum Mainnet, 기타 EVM 체인은 피드 주소 별도 매핑) |

```typescript
// packages/daemon/src/services/price-oracle/chainlink-oracle.ts (설계 참조)

import { parseAbi } from 'viem'

/**
 * Chainlink AggregatorV3Interface ABI (필요한 함수만).
 */
const AGGREGATOR_V3_ABI = parseAbi([
  'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() external view returns (uint8)',
])

/**
 * Chainlink 가격 피드 주소 매핑 (Ethereum Mainnet).
 * 체인별로 별도 매핑 테이블이 필요하다.
 *
 * 참고: https://docs.chain.link/data-feeds/price-feeds/addresses
 */
const CHAINLINK_FEEDS: Record<string, string> = {
  // Ethereum Mainnet
  'ethereum:native':
    '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',  // ETH/USD
  'ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48':
    '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6',  // USDC/USD
  'ethereum:0xdAC17F958D2ee523a2206206994597C13D831ec7':
    '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D',  // USDT/USD
  // 추가 피드는 config.toml에서 확장
}

class ChainlinkOracle implements IPriceOracle {
  private cache: PriceCache
  private readonly publicClient: PublicClient  // viem PublicClient

  async getPrice(token: TokenRef): Promise<PriceInfo> {
    if (token.chain !== 'ethereum') {
      throw new PriceNotAvailableError(token)  // EVM 전용
    }

    const cacheKey = `${token.chain}:${token.address}`
    const feedAddress = CHAINLINK_FEEDS[cacheKey]

    if (!feedAddress) {
      throw new PriceNotAvailableError(token)  // 피드 매핑 없음
    }

    const cached = this.cache.get(cacheKey)
    if (cached && !cached.isExpired) {
      return { ...cached.price, source: 'cache', isStale: false }
    }

    try {
      // 1. decimals 조회 (대부분 8)
      const feedDecimals = await this.publicClient.readContract({
        address: feedAddress as `0x${string}`,
        abi: AGGREGATOR_V3_ABI,
        functionName: 'decimals',
      })

      // 2. 최신 가격 조회
      const [, answer, , updatedAt] = await this.publicClient.readContract({
        address: feedAddress as `0x${string}`,
        abi: AGGREGATOR_V3_ABI,
        functionName: 'latestRoundData',
      })

      // 3. 가격 변환: answer / 10^decimals
      const usdPrice = Number(answer) / Math.pow(10, Number(feedDecimals))

      // 4. updatedAt 신선도 검증 (1시간 이상 미갱신이면 stale)
      const updatedAtMs = Number(updatedAt) * 1000
      const isStale = Date.now() - updatedAtMs > 3600_000

      const now = Date.now()
      const priceInfo: PriceInfo = {
        usdPrice,
        source: 'chainlink',
        fetchedAt: now,
        expiresAt: now + this.cache.TTL_MS,
        isStale,
      }

      this.cache.set(cacheKey, priceInfo)
      return priceInfo

    } catch (error) {
      if (cached && cached.isWithinStaleAge) {
        return { ...cached.price, source: 'cache' as const, isStale: true }
      }
      throw new PriceNotAvailableError(token, error as Error)
    }
  }

  async getNativePrice(chain: 'solana' | 'ethereum'): Promise<PriceInfo> {
    if (chain !== 'ethereum') {
      throw new PriceNotAvailableError({ chain })
    }
    const token: TokenRef = { address: 'native', chain, decimals: 18 }
    return this.getPrice(token)
  }

  // getPrices(), getCacheStats() -- 동일 패턴 (생략)
  async getPrices(tokens: TokenRef[]): Promise<Map<string, PriceInfo>> {
    const result = new Map<string, PriceInfo>()
    for (const token of tokens) {
      try {
        const price = await this.getPrice(token)
        result.set(`${token.chain}:${token.address}`, price)
      } catch { /* 개별 실패 무시 */ }
    }
    return result
  }

  getCacheStats(): CacheStats {
    return this.cache.getStats()
  }
}
```

### 3.4 구현체 비교

| 항목 | CoinGecko | Pyth Hermes | Chainlink |
|------|-----------|-------------|-----------|
| **접근 방식** | HTTP REST API | HTTP REST API | 온체인 RPC (viem) |
| **비용** | 무료 (Demo 30 calls/min) | 무료 (30 req/10s) | RPC 호출 비용만 |
| **지원 체인** | Solana + EVM | 주로 Solana | EVM 전용 |
| **갱신 주기** | 1-5분 | 서브초 | 블록당 (~12초) |
| **토큰 범위** | 수천 개 (CoinGecko 등록 기준) | Pyth 피드 등록 기준 (~수백) | Chainlink 피드 등록 기준 (~수십) |
| **신뢰 구간** | 없음 | confidence interval 제공 | 없음 |
| **오프라인 내성** | API 장애 시 불가 | API 장애 시 불가 | RPC 장애 시 불가 |
| **설정 복잡도** | API 키 1개 | 없음 | RPC URL + 피드 주소 매핑 |

### 3.5 기본 조합 권장

```
기본 구성:
  CoinGecko (Primary) -> Pyth Hermes (Solana Fallback) + Chainlink (EVM Fallback) -> Stale Cache

Solana 토큰 조회 경로:
  CoinGecko /simple/token_price/solana -> Pyth Hermes -> Stale Cache

EVM 토큰 조회 경로:
  CoinGecko /simple/token_price/ethereum -> Chainlink RPC -> Stale Cache

네이티브 토큰 조회 경로:
  CoinGecko /simple/price -> Pyth(SOL) 또는 Chainlink(ETH) -> Stale Cache
```

### 3.6 OracleChain 패턴

다중 소스를 순차 시도하는 체인 패턴:

```typescript
// packages/daemon/src/services/price-oracle/oracle-chain.ts (설계 참조)

/**
 * OracleChain: 다중 가격 소스를 순차 시도하는 래퍼.
 *
 * Primary 실패 시 Fallback1, 그 다음 Fallback2, 최종 stale cache 순으로 시도.
 * 순환 참조 방지: OracleChain 내부에 OracleChain을 중첩하지 않는다.
 */
class OracleChain implements IPriceOracle {
  private readonly oracles: IPriceOracle[]
  private readonly sharedCache: PriceCache

  constructor(oracles: IPriceOracle[], sharedCache: PriceCache) {
    this.oracles = oracles
    this.sharedCache = sharedCache
  }

  /**
   * [v0.10] 교차 검증이 동기적으로 인라인된 getPrice().
   *
   * 기존: Primary 성공 시 즉시 반환, 교차 검증은 비동기 백그라운드
   * 변경: Primary 성공 후 Fallback으로 동기적 교차 검증 수행
   *
   * 교차 검증 플로우:
   * 1. Primary(CoinGecko) 조회
   * 2. Primary 성공 + Fallback 존재 → Fallback으로 교차 검증
   * 3. 10% 초과 괴리 → 높은 가격 채택 (보수적) + 감사 로그 + 알림
   * 4. 10% 이내 또는 Fallback 실패 → Primary 가격 채택
   */
  async getPrice(token: TokenRef): Promise<PriceInfo> {
    let lastError: Error | undefined
    let primaryPrice: PriceInfo | undefined

    for (let i = 0; i < this.oracles.length; i++) {
      try {
        const price = await this.oracles[i].getPrice(token)

        if (i === 0) {
          // Primary 성공: 교차 검증 시도
          primaryPrice = price

          if (this.oracles.length > 1) {
            try {
              const fallbackPrice = await this.oracles[1].getPrice(token)
              const deviation = Math.abs(
                (price.usdPrice - fallbackPrice.usdPrice) / price.usdPrice
              ) * 100

              if (deviation > 10) {
                // 10% 초과 괴리: 높은 가격 채택 (보수적)
                // 높은 가격 = 정책 평가에서 더 높은 USD 금액 = 더 높은 보안 티어
                const conservativePrice = price.usdPrice >= fallbackPrice.usdPrice
                  ? price : fallbackPrice

                // 감사 로그 기록
                await this.auditLog.record({
                  event: 'PRICE_DEVIATION_WARNING',
                  details: {
                    token: `${token.chain}:${token.address}`,
                    primarySource: price.source,
                    primaryPrice: price.usdPrice,
                    fallbackSource: fallbackPrice.source,
                    fallbackPrice: fallbackPrice.usdPrice,
                    deviationPercent: deviation.toFixed(2),
                    adoptedSource: conservativePrice.source,
                    adoptedPrice: conservativePrice.usdPrice,
                  },
                })

                // SYSTEM_WARNING 알림 이벤트 발송
                this.notifier?.emit('SYSTEM_WARNING', {
                  type: 'PRICE_DEVIATION',
                  message: `Price deviation ${deviation.toFixed(1)}% detected for ${token.chain}:${token.address}`,
                })

                return conservativePrice
              }
            } catch {
              // 교차 검증 실패 (Fallback 소스 장애): Primary 신뢰
              // Fallback 호출 타임아웃(5초)은 각 오라클 구현체에서 설정
            }
          }

          return price
        }

        // i > 0: Primary 실패 후 Fallback 성공
        return price
      } catch (error) {
        lastError = error as Error
        continue
      }
    }

    // 모든 소스 실패: stale 캐시 최종 시도
    const cacheKey = `${token.chain}:${token.address}`
    const stale = this.sharedCache.getStale(cacheKey)
    if (stale) {
      return { ...stale.price, source: 'cache', isStale: true }
    }

    throw new PriceNotAvailableError(token, lastError)
  }

  async getNativePrice(chain: 'solana' | 'ethereum'): Promise<PriceInfo> {
    let lastError: Error | undefined

    for (const oracle of this.oracles) {
      try {
        return await oracle.getNativePrice(chain)
      } catch (error) {
        lastError = error as Error
        continue
      }
    }

    const cacheKey = `${chain}:native`
    const stale = this.sharedCache.getStale(cacheKey)
    if (stale) {
      return { ...stale.price, source: 'cache', isStale: true }
    }

    throw new PriceNotAvailableError({ chain }, lastError)
  }

  async getPrices(tokens: TokenRef[]): Promise<Map<string, PriceInfo>> {
    // Primary에서 최대한 조회 후, 실패한 토큰만 Fallback으로 재시도
    const result = new Map<string, PriceInfo>()
    let remaining = [...tokens]

    for (const oracle of this.oracles) {
      if (remaining.length === 0) break
      const partial = await oracle.getPrices(remaining)
      for (const [key, price] of partial) {
        result.set(key, price)
      }
      remaining = remaining.filter(t => !result.has(`${t.chain}:${t.address}`))
    }

    return result
  }

  getCacheStats(): CacheStats {
    return this.sharedCache.getStats()
  }
}

// 팩토리 함수: 기본 OracleChain 생성
function createDefaultOracleChain(config: OracleConfig): IPriceOracle {
  const cache = new PriceCache({
    ttlMs: 300_000,       // 5분
    staleMaxMs: 1_800_000, // 30분
    maxEntries: 1000,
  })

  const coingecko = new CoinGeckoOracle(config.coingeckoApiKey, cache)
  const pyth = new PythOracle(cache)
  const chainlink = new ChainlinkOracle(cache, config.evmRpcUrl)

  // Solana: CoinGecko -> Pyth -> stale
  // EVM: CoinGecko -> Chainlink -> stale
  // OracleChain은 getPrice() 내부에서 체인별 fallback이 자동 처리됨
  return new OracleChain([coingecko, pyth, chainlink], cache)
}
```

> **[v0.10 변경] 교차 검증 동기 전환 근거:** 기존 §7.1.1의 비동기 백그라운드 교차 검증을 동기적 인라인으로 전환했다. 보수적 가격 채택을 getPrice() 반환값에 반영하려면, 교차 검증 결과가 반환 전에 확정되어야 한다. Fallback 호출 타임아웃(5초)은 각 오라클 구현체에 이미 설정되어 있어, 최악의 경우 추가 5초의 latency가 발생한다. 이는 트랜잭션 파이프라인의 전체 타임아웃(INSTANT/NOTIFY=30초)에 비해 허용 범위이다.

---

## 4. 캐싱 전략 (ORACLE-02)

### 4.1 PriceCache 설계

```typescript
// packages/daemon/src/services/price-oracle/price-cache.ts (설계 참조)

/**
 * 인메모리 가격 캐시.
 * Map<cacheKey, CacheEntry> 구조, LRU eviction 적용.
 */
interface PriceCacheConfig {
  /** TTL: 5분 (300,000ms) -- 이 기간 내 캐시는 fresh */
  ttlMs: number
  /** stale 허용 최대 시간: 30분 (1,800,000ms) -- TTL 만료 후에도 이 기간 내 stale 허용 */
  staleMaxMs: number
  /** 최대 캐시 항목 수 (LRU eviction) */
  maxEntries: number
}

interface CacheEntry {
  /** 캐시된 가격 정보 */
  price: PriceInfo
  /** 캐시 저장 시점 */
  cachedAt: number
  /** TTL 만료 시점 */
  expiresAt: number
  /** stale 허용 만료 시점 */
  staleExpiresAt: number
}

class PriceCache {
  readonly TTL_MS: number
  private readonly STALE_MAX_MS: number
  private readonly MAX_ENTRIES: number
  private readonly cache: Map<string, CacheEntry>
  private stats: CacheStats

  constructor(config: PriceCacheConfig) {
    this.TTL_MS = config.ttlMs
    this.STALE_MAX_MS = config.staleMaxMs
    this.MAX_ENTRIES = config.maxEntries
    this.cache = new Map()
    this.stats = { hits: 0, misses: 0, staleHits: 0, size: 0, evictions: 0 }
  }

  /**
   * 캐시 조회.
   * 완전 만료(staleMaxAge 초과)된 항목은 반환하지 않는다.
   */
  get(key: string): (CacheEntry & { isExpired: boolean; isWithinStaleAge: boolean }) | null {
    const entry = this.cache.get(key)
    if (!entry) {
      this.stats.misses++
      return null
    }

    const now = Date.now()

    // 완전 만료 (staleMaxAge 초과)
    if (now > entry.staleExpiresAt) {
      this.cache.delete(key)
      this.stats.size = this.cache.size
      this.stats.misses++
      return null
    }

    const isExpired = now > entry.expiresAt
    if (isExpired) {
      this.stats.staleHits++
    } else {
      this.stats.hits++
    }

    // LRU: Map에서 삭제 후 재삽입하여 최신 접근으로 이동
    this.cache.delete(key)
    this.cache.set(key, entry)

    return {
      ...entry,
      isExpired,
      isWithinStaleAge: now <= entry.staleExpiresAt,
    }
  }

  /**
   * stale 데이터 조회 (OracleChain 최종 fallback용).
   */
  getStale(key: string): CacheEntry | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    if (Date.now() > entry.staleExpiresAt) {
      this.cache.delete(key)
      this.stats.size = this.cache.size
      return null
    }
    this.stats.staleHits++
    return entry
  }

  /**
   * 캐시 저장.
   * maxEntries 초과 시 LRU(가장 오래 접근하지 않은) 항목 삭제.
   */
  set(key: string, price: PriceInfo): void {
    // LRU eviction: Map 순서에서 가장 오래된(first) 항목 삭제
    if (this.cache.size >= this.MAX_ENTRIES && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
        this.stats.evictions++
      }
    }

    const now = Date.now()
    this.cache.set(key, {
      price,
      cachedAt: now,
      expiresAt: now + this.TTL_MS,
      staleExpiresAt: now + this.TTL_MS + this.STALE_MAX_MS,
    })
    this.stats.size = this.cache.size
  }

  getStats(): CacheStats {
    return { ...this.stats, size: this.cache.size }
  }
}
```

### 4.2 캐시 키 규칙

| 토큰 유형 | cacheKey 포맷 | 예시 |
|-----------|-------------|------|
| Solana 네이티브 (SOL) | `solana:native` | `solana:native` |
| Ethereum 네이티브 (ETH) | `ethereum:native` | `ethereum:native` |
| Solana SPL 토큰 | `solana:{mintAddress}` | `solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| EVM ERC-20 토큰 | `ethereum:{contractAddress}` | `ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |

**주의:** EVM 주소는 lowercase로 정규화한다 (CoinGecko 응답이 lowercase). `cacheKey` 생성 시 `address.toLowerCase()` 적용.

### 4.3 캐시 파라미터

| 파라미터 | 값 | 근거 |
|---------|------|------|
| **TTL** | 5분 (300,000ms) | CoinGecko 갱신 주기 1-5분과 일치. 5분 이내 동일 가격 보장 |
| **staleMaxAge** | 30분 (1,800,000ms) | TTL 만료 후 추가 30분간 stale 데이터 허용. 오라클 장애 시 30분간 서비스 지속 |
| **maxEntries** | 1,000 | 일반 운영에서 100-200 토큰, 대규모 사용 시 최대 1000 토큰. LRU eviction으로 메모리 관리 |
| **staleWhileRevalidate** | true | TTL 만료 시 stale 데이터를 즉시 반환하면서 백그라운드에서 갱신 시도 |

### 4.4 배치 조회 최적화

`getPrices(tokens)` 호출 시 캐시 최적화 흐름:

```
tokens: [USDC, USDT, BONK, RAY, JUP]
    │
    ▼ 캐시 조회
  캐시 히트: [USDC (fresh), USDT (fresh)]
  캐시 미스: [BONK, RAY, JUP]
    │
    ▼ 체인별 그룹화
  solana: [BONK, RAY, JUP]
    │
    ▼ CoinGecko 배치 요청 (1 API 호출)
  /simple/token_price/solana?contract_addresses=BONK_addr,RAY_addr,JUP_addr&vs_currencies=usd
    │
    ▼ 응답 파싱 + 캐시 저장
  결과: [USDC, USDT, BONK, RAY, JUP] -- 5 토큰, 1 API 호출
```

**효과:** 5개 토큰 조회에 개별 호출이면 5 API 호출 -> 배치 최적화로 1 API 호출. CoinGecko 30 calls/min rate limit 내에서 훨씬 많은 토큰 처리 가능.

---

## 5. Fallback 전략 (ORACLE-02)

### 5.1 3단계 Fallback 경로

```
가격 조회 요청
    │
    ▼
[1단계] Primary 소스 (CoinGecko)
    │── 성공 → 가격 반환 (fresh)
    │── 실패 ↓
    │
    ▼
[2단계] Fallback 소스 (Pyth/Chainlink)
    │── 성공 → 가격 반환 (fresh)
    │── 실패 ↓
    │
    ▼
[3단계] Stale 캐시
    │── staleMaxAge 이내 → stale 가격 반환 (isStale=true)
    │── staleMaxAge 초과 ↓
    │
    ▼
[완전 장애] Phase 22-23 과도기 전략 fallback
    │── TOKEN_TRANSFER → NOTIFY 강제
    │── APPROVE → TIER_OVERRIDE 독립 (가격 불필요)
    │── CONTRACT_CALL → value 기준 네이티브 SPENDING_LIMIT + APPROVAL 기본 유지
    │── BATCH → 개별 instruction 정책 (네이티브 금액만 합산)
    │── TRANSFER → 네이티브 기준 SPENDING_LIMIT (가격 불필요)
```

### 5.2 Stale 데이터 허용 조건

| 조건 | 허용 여부 | 동작 |
|------|----------|------|
| TTL 이내 (fresh) | 정상 | 캐시 가격 반환, `isStale=false` |
| TTL 만료 + staleMaxAge 이내 | stale 허용 | 캐시 가격 반환, `isStale=true` |
| TTL 만료 + staleMaxAge 초과 | stale 거부 | 캐시 삭제, PriceNotAvailableError |

### 5.2.1 가격 나이별 3단계 정책 평가 동작 [v0.10]

| 상태 | 가격 나이 | USD 평가 | 정책 평가 동작 | 로그/알림 |
|------|----------|---------|---------------|---------|
| **FRESH** | < 5분 | 정상 수행 | resolveEffectiveAmountUsd() 정상 실행 | 없음 |
| **AGING** | 5분~30분 | 정상 수행 + 보수적 상향 | resolveEffectiveAmountUsd() 실행 + adjustTierForStalePrice() (INSTANT→NOTIFY) | PRICE_STALE 경고 로그 |
| **STALE** | > 30분 | **스킵** | resolveEffectiveAmountUsd() → PriceNotAvailableError → applyFallbackStrategy() → 네이티브 금액만으로 티어 결정 | PRICE_UNAVAILABLE 감사 로그 |
| **UNAVAILABLE** | 오라클 전체 실패 | **스킵** | applyFallbackStrategy() → 네이티브 금액만으로 티어 결정 (§5.4 Phase 22-23 과도기 전략) | PRICE_UNAVAILABLE 감사 로그 + 알림 |

> **FRESH vs AGING vs STALE 구분:** "stale"이라는 용어가 5분(TTL 만료)과 30분(staleMaxAge 초과) 양쪽에 사용되어 혼동될 수 있다. 5분~30분 구간은 **AGING**(가격을 사용하되 보수적 상향)이고, 30분 초과는 **STALE**(가격 자체를 버리고 네이티브 전용 평가)이다. 구현 시 `isStale` 플래그는 TTL 만료(>5분) 시 true가 되지만, **STALE(>30분) 처리는 PriceNotAvailableError를 통해** 별도로 처리된다 (staleMaxAge 초과 시 캐시에서 삭제 → 조회 실패).

> **[v0.10] STALE(>30분) 가격 USD 평가 스킵 근거:** stale 가격으로 잘못된 INSTANT 판정을 내리는 것보다, USD 평가를 스킵하고 네이티브 금액 기준으로만 평가하는 것이 더 안전하다. 네이티브 금액 기준 SPENDING_LIMIT는 항상 유효하므로 최소한의 보호를 보장한다.

### 5.3 Stale 가격 사용 시 보수적 판단

**원칙:** stale 가격으로 INSTANT 티어가 판정되면, 최소 NOTIFY로 상향한다.

```typescript
/**
 * stale 가격 사용 시 보수적 티어 상향.
 * INSTANT -> NOTIFY (stale 가격 신뢰도 제한)
 * NOTIFY, DELAY, APPROVAL -> 변경 없음 (이미 보수적)
 */
function adjustTierForStalePrice(tier: TransactionTier, isStale: boolean): TransactionTier {
  if (isStale && tier === 'INSTANT') {
    return 'NOTIFY'  // 보수적 상향
  }
  return tier
}
```

**근거:** stale 가격은 5-30분 전 가격이므로, 그 사이에 급격한 변동이 있었을 수 있다. 소액(INSTANT)이라고 판단했지만 실제로는 가격 하락으로 더 많은 USD 가치일 수 있으므로, 최소 NOTIFY로 Owner에게 알린다.

### 5.4 완전 장애 시 Phase 22-23 과도기 전략

모든 소스 실패 + stale 캐시도 없는 완전 장애 시:

| TransactionType | 과도기 전략 | 근거 |
|----------------|-----------|------|
| `TRANSFER` | 네이티브 기준 SPENDING_LIMIT 사용 | 네이티브 토큰은 USD 변환 없이도 기존 lamports/wei 기준 임계값 적용 가능 |
| `TOKEN_TRANSFER` | NOTIFY 강제 | Phase 22 과도기 전략 유지. 토큰 금액 비교 불가하므로 안전 마진 |
| `CONTRACT_CALL` | value 기준 네이티브 SPENDING_LIMIT + APPROVAL 기본 유지 | Phase 23 과도기 전략 유지. value=0이면 APPROVAL 기본 |
| `APPROVE` | APPROVE_TIER_OVERRIDE 독립 적용 | Approve는 원래 가격 기반이 아닌 독립 정책 |
| `BATCH` | 개별 instruction 정책 (네이티브 금액만 합산) | Phase 23 과도기: TOKEN_TRANSFER=0n, APPROVE=0n으로 합산 |

```typescript
/**
 * 완전 장애 시 과도기 fallback 적용.
 * resolveEffectiveAmountUsd()에서 PriceNotAvailableError catch 시 호출.
 */
function applyFallbackStrategy(input: PolicyEvaluationInput): PolicyDecision {
  switch (input.type) {
    case 'TRANSFER':
      // 네이티브 기준 SPENDING_LIMIT 그대로 적용
      return evaluateSpendingLimit(input.amount, policies)

    case 'TOKEN_TRANSFER':
      // 고정 NOTIFY 반환
      return { allowed: true, tier: 'NOTIFY', reason: 'ORACLE_FALLBACK_TOKEN_TRANSFER' }

    case 'CONTRACT_CALL':
      // value 기준 평가 (value=0이면 SPENDING_LIMIT에서 INSTANT, 하지만 기본 APPROVAL)
      return evaluateSpendingLimit(input.amount, policies)
      // 주: CONTRACT_CALL의 기본 티어는 APPROVAL이므로
      // evaluateSpendingLimit 결과와 APPROVAL 중 높은 티어 적용

    case 'APPROVE':
      // APPROVE_TIER_OVERRIDE 독립 (가격 불필요)
      return { allowed: true, tier: 'APPROVAL', reason: 'APPROVE_TIER_OVERRIDE' }

    case 'BATCH':
      // Phase 23 과도기: 네이티브 금액만 합산
      return evaluateSpendingLimit(input.batchTotalAmount ?? 0n, policies)
  }
}
```

### 5.5 급격한 가격 변동 감지

| 감지 조건 | 임계값 | 동작 |
|----------|--------|------|
| 이전 캐시 대비 변동폭 | +-50% | PriceSpikeWarning 발생 + 보수적 티어 상향 |
| 보수적 상향 규칙 | INSTANT -> NOTIFY | 급변동 시 소액도 Owner 알림 |
| 보수적 상향 규칙 | NOTIFY -> DELAY | 급변동 시 중액도 쿨다운 적용 |

```typescript
/**
 * 급격한 가격 변동 감지 시 보수적 티어 상향.
 */
function adjustTierForPriceSpike(
  tier: TransactionTier,
  previousPrice: number | undefined,
  currentPrice: number,
): TransactionTier {
  if (!previousPrice || previousPrice === 0) return tier

  const changePercent = Math.abs((currentPrice - previousPrice) / previousPrice) * 100

  if (changePercent >= 50) {
    // 한 단계 상향
    const tierOrder: TransactionTier[] = ['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL']
    const currentIndex = tierOrder.indexOf(tier)
    if (currentIndex < tierOrder.length - 1) {
      return tierOrder[currentIndex + 1]
    }
  }

  return tier
}
```

---

## 6. USD 기준 정책 평가 확장 (ORACLE-03)

> **[v0.8] 정책 다운그레이드 교차 참조:** v0.8의 APPROVAL -> DELAY 다운그레이드 결정(33-time-lock-approval-mechanism.md §11.6 Step 9.5)에서 거래 금액 USD 평가에 `resolveEffectiveAmountUsd()`를 통한 IPriceOracle을 활용한다. `maxTier(nativeTier, usdTier)` 산출 후 APPROVAL이면 OwnerState에 따라 다운그레이드 여부를 결정한다. USD 변환 실패 시 네이티브 기준 fallback이 적용되므로, IPriceOracle 미주입 환경에서도 다운그레이드 로직은 정상 동작한다.

### 6.1 PolicyEvaluationInput 확장

CHAIN-EXT-03에서 정의한 PolicyEvaluationInput에 USD 관련 필드를 추가한다:

```typescript
// packages/core/src/interfaces/policy-engine.types.ts (Phase 24 확장)

interface PolicyEvaluationInput {
  // --- 기존 필드 (Phase 22-23) ---
  type: TransactionType  // 'TRANSFER' | 'TOKEN_TRANSFER' | 'CONTRACT_CALL' | 'APPROVE' | 'BATCH'
  amount: bigint
  to: string
  chain: 'solana' | 'ethereum'
  walletId: string
  tokenAddress?: string       // TOKEN_TRANSFER, APPROVE 시
  tokenDecimals?: number      // TOKEN_TRANSFER, APPROVE 시
  contractAddress?: string    // CONTRACT_CALL 시
  methodSignature?: string    // CONTRACT_CALL + EVM
  spender?: string            // APPROVE 시
  approveAmount?: bigint      // APPROVE 시
  batchTotalAmount?: bigint   // BATCH 시
  batchInstructions?: InstructionRequest[]  // BATCH 시

  // --- Phase 24 추가 필드 ---
  /** USD 환산 금액 (resolveEffectiveAmountUsd()에서 설정) */
  usdAmount?: number
  /** USD 변환 성공 여부 (false면 네이티브 기준 fallback) */
  usdResolved?: boolean
  /** 가격 stale 여부 (보수적 티어 상향 판단용) */
  priceIsStale?: boolean
  /** 가격 급변동 감지 여부 (보수적 티어 상향 판단용) */
  priceSpikeDetected?: boolean
}
```

### 6.2 resolveEffectiveAmountUsd() 함수

Phase 22-23의 `resolveEffectiveAmount()`를 확장하여 USD 변환을 수행한다:

```typescript
// packages/daemon/src/services/policy/resolve-usd.ts (설계 참조)

/**
 * 5개 TransactionType별 USD 변환 로직.
 *
 * 이 함수는 DatabasePolicyEngine.evaluate()의 11단계 중
 * Stage 11(SPENDING_LIMIT) 직전에 호출되어, usdAmount를 설정한다.
 *
 * @returns 변환 결과. fallbackToNative=true면 기존 네이티브 기준 사용
 */
async function resolveEffectiveAmountUsd(
  input: PolicyEvaluationInput,
  priceOracle: IPriceOracle,
): Promise<{ usdAmount: number; fallbackToNative: boolean; isStale: boolean }> {
  try {
    switch (input.type) {
      case 'TRANSFER': {
        // 네이티브 토큰(SOL/ETH) -> USD 변환
        const nativePrice = await priceOracle.getNativePrice(input.chain)
        const decimals = nativeDecimals(input.chain)  // solana=9, ethereum=18
        const humanAmount = Number(input.amount) / Math.pow(10, decimals)
        const usdAmount = humanAmount * nativePrice.usdPrice
        return { usdAmount, fallbackToNative: false, isStale: nativePrice.isStale }
      }

      case 'TOKEN_TRANSFER': {
        // Phase 24 핵심: 토큰 -> USD 변환 (Phase 22-23의 0n 해소)
        if (!input.tokenAddress) {
          return { usdAmount: 0, fallbackToNative: true, isStale: false }
        }
        const tokenPrice = await priceOracle.getPrice({
          address: input.tokenAddress,
          decimals: input.tokenDecimals ?? 9,
          chain: input.chain,
        })
        const humanAmount = Number(input.amount) / Math.pow(10, input.tokenDecimals ?? 9)
        const usdAmount = humanAmount * tokenPrice.usdPrice
        return { usdAmount, fallbackToNative: false, isStale: tokenPrice.isStale }
      }

      case 'CONTRACT_CALL': {
        // value(네이티브 토큰 첨부량)의 USD 변환
        if (input.amount === 0n) {
          return { usdAmount: 0, fallbackToNative: false, isStale: false }
        }
        const nativePrice = await priceOracle.getNativePrice(input.chain)
        const decimals = nativeDecimals(input.chain)
        const humanAmount = Number(input.amount) / Math.pow(10, decimals)
        const usdAmount = humanAmount * nativePrice.usdPrice
        return { usdAmount, fallbackToNative: false, isStale: nativePrice.isStale }
      }

      case 'APPROVE': {
        // APPROVE: 참고용 USD 변환 (TIER_OVERRIDE 우선, 감사 로그 기록용)
        // APPROVE는 APPROVE_TIER_OVERRIDE가 SPENDING_LIMIT과 독립이므로
        // usdAmount는 참고값으로만 사용하고, 티어 결정에는 사용하지 않는다
        if (!input.tokenAddress || !input.approveAmount) {
          return { usdAmount: 0, fallbackToNative: false, isStale: false }
        }
        try {
          const tokenPrice = await priceOracle.getPrice({
            address: input.tokenAddress,
            decimals: input.tokenDecimals ?? 9,
            chain: input.chain,
          })
          const humanAmount = Number(input.approveAmount) / Math.pow(10, input.tokenDecimals ?? 9)
          const usdAmount = humanAmount * tokenPrice.usdPrice
          // 감사 로그에 기록 (정책 결정에는 미사용)
          return { usdAmount, fallbackToNative: false, isStale: tokenPrice.isStale }
        } catch {
          // APPROVE는 가격 실패해도 TIER_OVERRIDE로 동작
          return { usdAmount: 0, fallbackToNative: false, isStale: false }
        }
      }

      case 'BATCH': {
        // 개별 instruction USD 합산
        let totalUsd = 0
        let anyStale = false
        let failedCount = 0

        if (!input.batchInstructions) {
          return { usdAmount: 0, fallbackToNative: true, isStale: false }
        }

        for (const instr of input.batchInstructions) {
          try {
            const instrResult = await resolveInstructionUsd(instr, input.chain, priceOracle)
            totalUsd += instrResult.usdAmount
            if (instrResult.isStale) anyStale = true
          } catch {
            failedCount++
            // 실패한 instruction은 0으로 처리 (보수적: NOTIFY 이상 강제)
          }
        }

        // 일부 instruction USD 변환 실패 시 NOTIFY 이상 강제 (섹션 6.4에서 적용)
        const forceNotify = failedCount > 0

        return {
          usdAmount: totalUsd,
          fallbackToNative: forceNotify,
          isStale: anyStale,
        }
      }

      default:
        return { usdAmount: 0, fallbackToNative: true, isStale: false }
    }
  } catch {
    // 오라클 완전 장애 또는 STALE(>30분) 가격:
    // PriceNotAvailableError 발생 → Phase 22-23 과도기 전략으로 fallback
    // → applyFallbackStrategy() (§5.4) → 네이티브 금액만으로 티어 결정
    // [v0.10] §5.2.1 가격 나이별 3단계 참조
    return { usdAmount: 0, fallbackToNative: true, isStale: false }
  }
}

/**
 * 배치 내 개별 instruction의 USD 변환.
 */
async function resolveInstructionUsd(
  instr: InstructionRequest,
  chain: string,
  priceOracle: IPriceOracle,
): Promise<{ usdAmount: number; isStale: boolean }> {
  switch (instr.type) {
    case 'TRANSFER': {
      const nativePrice = await priceOracle.getNativePrice(chain as 'solana' | 'ethereum')
      const decimals = nativeDecimals(chain)
      const humanAmount = Number(BigInt(instr.amount)) / Math.pow(10, decimals)
      return { usdAmount: humanAmount * nativePrice.usdPrice, isStale: nativePrice.isStale }
    }
    case 'TOKEN_TRANSFER': {
      const tokenPrice = await priceOracle.getPrice({
        address: instr.token.address,
        decimals: instr.token.decimals,
        chain: chain as 'solana' | 'ethereum',
      })
      const humanAmount = Number(BigInt(instr.amount)) / Math.pow(10, instr.token.decimals)
      return { usdAmount: humanAmount * tokenPrice.usdPrice, isStale: tokenPrice.isStale }
    }
    case 'CONTRACT_CALL': {
      if (!instr.value || instr.value === '0') return { usdAmount: 0, isStale: false }
      const nativePrice = await priceOracle.getNativePrice(chain as 'solana' | 'ethereum')
      const decimals = nativeDecimals(chain)
      const humanAmount = Number(BigInt(instr.value)) / Math.pow(10, decimals)
      return { usdAmount: humanAmount * nativePrice.usdPrice, isStale: nativePrice.isStale }
    }
    case 'APPROVE':
      return { usdAmount: 0, isStale: false }  // APPROVE는 합산 금액에 미포함
    default:
      return { usdAmount: 0, isStale: false }
  }
}

/**
 * 체인별 네이티브 토큰 소수점 자릿수.
 */
function nativeDecimals(chain: string): number {
  switch (chain) {
    case 'solana': return 9    // SOL: 10^9 lamports = 1 SOL
    case 'ethereum': return 18  // ETH: 10^18 wei = 1 ETH
    default: return 18
  }
}
```

### 6.3 SpendingLimitRuleSchema 확장

LOCK-MECH에서 정의한 SpendingLimitRuleSchema에 USD 필드를 추가한다:

```typescript
// packages/core/src/schemas/policy-rules.schema.ts (Phase 24 확장)

/**
 * SPENDING_LIMIT: 금액 기반 4-티어 보안 분류.
 *
 * Phase 24 확장: USD 기준 임계값 추가.
 * - instant_max_usd, notify_max_usd, delay_max_usd (optional)
 * - USD 필드가 설정된 경우 USD 우선 적용
 * - USD 미설정 시 기존 네이티브 기준 (하위 호환)
 */
export const SpendingLimitRuleSchema = z.object({
  // --- 기존 네이티브 금액 기준 (하위 호환) ---
  /** INSTANT 티어 최대 금액 (lamports/wei 문자열) */
  instant_max: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다'),
  /** NOTIFY 티어 최대 금액 */
  notify_max: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다'),
  /** DELAY 티어 최대 금액 */
  delay_max: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다'),

  // --- Phase 24 추가: USD 금액 기준 ---
  /** INSTANT 티어 최대 USD 금액 (예: 10 = $10). 미설정 시 네이티브 기준 */
  instant_max_usd: z.number().nonnegative().optional(),
  /** NOTIFY 티어 최대 USD 금액 (예: 100 = $100). 미설정 시 네이티브 기준 */
  notify_max_usd: z.number().nonnegative().optional(),
  /** DELAY 티어 최대 USD 금액 (예: 1000 = $1000). 미설정 시 네이티브 기준 */
  delay_max_usd: z.number().nonnegative().optional(),

  // --- 기존 시간 파라미터 ---
  /** DELAY 티어 쿨다운 시간 (초). 최소 60, 기본 900 (15분) */
  delay_seconds: z.number().int().min(60).default(900),
  /** APPROVAL 티어 승인 대기 시간 (초). 최소 300, 기본 3600 (1시간) */
  approval_timeout: z.number().int().min(300).default(3600),
})
```

### 6.4 기본 USD 임계값 예시

```typescript
// waiaas init 시 생성되는 기본 정책 (Phase 24 확장)
const defaultSpendingLimit = {
  // 기존 SOL 기준 (하위 호환)
  instant_max:  '1000000000',     // 1 SOL (~$150)
  notify_max:   '10000000000',    // 10 SOL (~$1500)
  delay_max:    '50000000000',    // 50 SOL (~$7500)

  // Phase 24: USD 기준 (모든 토큰에 적용)
  instant_max_usd: 10,     // $10 이하 즉시 실행
  notify_max_usd: 100,     // $100 이하 즉시 + 알림
  delay_max_usd: 1000,     // $1000 이하 쿨다운 후 실행
  // $1000 초과 → APPROVAL (Owner 승인)

  delay_seconds: 900,       // 15분
  approval_timeout: 3600,   // 1시간
}
```

### 6.5 evaluateSpendingLimitUsd() 알고리즘

기존 `evaluateSpendingLimit()`과 병행하여 USD 기준 평가를 수행한다:

```typescript
/**
 * USD 기준 SPENDING_LIMIT 평가.
 * 기존 네이티브 기준과 병행 적용.
 *
 * 평가 우선순위:
 * 1. USD 임계값이 설정된 경우 → USD 기준 평가 우선
 * 2. USD 미설정 시 → 기존 네이티브 기준 사용
 * 3. 두 기준 모두 적용 가능한 경우 → 더 높은(보수적) 티어 채택
 */
function evaluateSpendingLimitUsd(
  input: PolicyEvaluationInput,
  nativeAmount: bigint,
  usdAmount: number | undefined,
  rules: SpendingLimitRule,
): TransactionTier {
  // 1. 네이티브 기준 티어 (기존 로직)
  const nativeTier = evaluateNativeTier(nativeAmount, rules)

  // 2. USD 기준 티어 (Phase 24)
  let usdTier: TransactionTier | undefined
  if (usdAmount !== undefined && usdAmount > 0 && hasUsdThresholds(rules)) {
    usdTier = evaluateUsdTier(usdAmount, rules)
  }

  // 3. 보수적 선택: 두 티어 중 더 높은(보수적) 티어
  if (usdTier) {
    return maxTier(nativeTier, usdTier)
  }

  return nativeTier
}

/**
 * USD 임계값 기반 티어 결정.
 */
function evaluateUsdTier(usdAmount: number, rules: SpendingLimitRule): TransactionTier {
  if (rules.instant_max_usd !== undefined && usdAmount <= rules.instant_max_usd) {
    return 'INSTANT'
  }
  if (rules.notify_max_usd !== undefined && usdAmount <= rules.notify_max_usd) {
    return 'NOTIFY'
  }
  if (rules.delay_max_usd !== undefined && usdAmount <= rules.delay_max_usd) {
    return 'DELAY'
  }
  return 'APPROVAL'
}

/**
 * 네이티브 임계값 기반 티어 결정 (기존 로직).
 */
function evaluateNativeTier(amount: bigint, rules: SpendingLimitRule): TransactionTier {
  if (amount <= BigInt(rules.instant_max)) return 'INSTANT'
  if (amount <= BigInt(rules.notify_max)) return 'NOTIFY'
  if (amount <= BigInt(rules.delay_max)) return 'DELAY'
  return 'APPROVAL'
}

/**
 * USD 임계값이 하나라도 설정되어 있는지 확인.
 */
function hasUsdThresholds(rules: SpendingLimitRule): boolean {
  return rules.instant_max_usd !== undefined
    || rules.notify_max_usd !== undefined
    || rules.delay_max_usd !== undefined
}

/**
 * 두 티어 중 더 높은(보수적) 티어 반환.
 */
function maxTier(a: TransactionTier, b: TransactionTier): TransactionTier {
  const order: Record<TransactionTier, number> = {
    INSTANT: 0,
    NOTIFY: 1,
    DELAY: 2,
    APPROVAL: 3,
  }
  return order[a] >= order[b] ? a : b
}
```

### 6.6 DatabasePolicyEngine.evaluate() Stage 3 확장 지점

CHAIN-EXT-03에서 정의한 11단계 알고리즘의 Stage 11을 확장한다:

```typescript
// DatabasePolicyEngine.evaluate() -- Phase 24 확장

async function evaluate(input: PolicyEvaluationInput): Promise<PolicyDecision> {
  // 1~10단계: 기존과 동일 (CHAIN-EXT-03 참조)
  // ...

  // ═══════════════════════════════════════════════════
  // 11단계: SPENDING_LIMIT 평가 (Phase 24 확장)
  // ═══════════════════════════════════════════════════

  // 11a. 기존 네이티브 기준 금액 결정
  const nativeAmount = resolveEffectiveAmount(input)

  // 11b. [Phase 24] USD 기준 금액 결정
  let usdResult: { usdAmount: number; fallbackToNative: boolean; isStale: boolean }
  try {
    usdResult = await resolveEffectiveAmountUsd(input, this.priceOracle)
    // PolicyEvaluationInput에 USD 정보 설정 (감사 로그용)
    input.usdAmount = usdResult.usdAmount
    input.usdResolved = !usdResult.fallbackToNative
    input.priceIsStale = usdResult.isStale
  } catch {
    usdResult = { usdAmount: 0, fallbackToNative: true, isStale: false }
  }

  // 11c. SPENDING_LIMIT 평가 (네이티브 + USD 병행)
  const spendingPolicies = policies.filter(p => p.type === 'SPENDING_LIMIT')
  if (spendingPolicies.length === 0) {
    return { allowed: true, tier: 'INSTANT' }  // SPENDING_LIMIT 미설정 시 INSTANT
  }

  const rules = JSON.parse(spendingPolicies[0].rules) as SpendingLimitRule
  let tier: TransactionTier

  if (usdResult.fallbackToNative) {
    // Phase 22-23 과도기 전략
    tier = evaluateNativeTier(nativeAmount, rules)

    // TOKEN_TRANSFER 과도기: 네이티브 금액 0이면 NOTIFY 강제
    if (input.type === 'TOKEN_TRANSFER' && nativeAmount === 0n) {
      tier = maxTier(tier, 'NOTIFY')
    }
  } else {
    // Phase 24: USD + 네이티브 병행 평가
    tier = evaluateSpendingLimitUsd(input, nativeAmount, usdResult.usdAmount, rules)
  }

  // 11d. stale 가격 보수적 상향
  if (usdResult.isStale) {
    tier = adjustTierForStalePrice(tier, true)
  }

  // 11e. 가격 급변동 보수적 상향
  if (input.priceSpikeDetected) {
    tier = adjustTierForPriceSpike(tier, undefined, 0)
    // 실제 구현에서는 이전 가격 정보를 전달
  }

  return { allowed: true, tier }
}
```

### 6.7 기존 문서 확장 지점 요약

| 기존 문서 | 확장 대상 | Phase 24 변경 |
|----------|----------|--------------|
| 33-time-lock (LOCK-MECH) | SpendingLimitRuleSchema | instant_max_usd, notify_max_usd, delay_max_usd 추가 |
| 33-time-lock (LOCK-MECH) | DatabasePolicyEngine.evaluate() | 11단계 Stage 11을 11a~11e로 세분화 |
| 32-transaction-pipeline (TX-PIPE) | Stage 3 Policy Check | resolveEffectiveAmountUsd() 호출 지점 추가 |
| 58-contract-call (CHAIN-EXT-03) | resolveEffectiveAmount() | resolveEffectiveAmountUsd()와 병행 |
| 56-token-transfer (CHAIN-EXT-01) | TOKEN_TRANSFER NOTIFY 고정 | USD 기준 동적 4-tier로 전환 |
| 60-batch-transaction (CHAIN-EXT-05) | BATCH 합산 금액 | USD 합산으로 확장 |

---

## 7. 가격 변동 감지 + 보안 (ORACLE-04)

### 7.1 가격 조작 공격 방어

#### 7.1.1 다중 소스 교차 검증

> **[v0.10] 교차 검증은 §3.6 OracleChain.getPrice()에 동기적으로 인라인됨. 이 섹션의 비동기 백그라운드 검증은 폐기.** 아래 코드는 v0.10 이전 설계의 참고 기록으로 유지한다.

```typescript
// [v0.10 폐기] 비동기 백그라운드 교차 검증 (§3.6 인라인으로 대체됨)

/**
 * [v0.10 폐기] 다중 소스 교차 검증.
 * Primary 소스(CoinGecko) 가격과 Fallback 소스(Pyth/Chainlink) 가격이
 * +-10% 이내에서 일치하는지 확인한다.
 *
 * 불일치 시 보수적 판단: 더 높은 가격을 채택 (더 높은 USD 금액 -> 더 높은 티어).
 * [v0.10 폐기] 교차 검증은 비동기 백그라운드에서 수행하여 레이턴시에 영향 없음.
 * → v0.10부터 §3.6 getPrice()에서 동기적으로 수행. 보수적 가격 채택이 반환값에 반영됨.
 */
async function crossValidatePrice(
  token: TokenRef,
  primaryPrice: PriceInfo,
  fallbackOracle: IPriceOracle,
): Promise<{ validated: boolean; discrepancy?: number }> {
  try {
    const fallbackPrice = await fallbackOracle.getPrice(token)

    const discrepancy = Math.abs(
      (primaryPrice.usdPrice - fallbackPrice.usdPrice) / primaryPrice.usdPrice
    ) * 100

    if (discrepancy > 10) {
      // +-10% 초과 불일치
      logger.warn('Price cross-validation failed', {
        token: token.address,
        primarySource: primaryPrice.source,
        primaryPrice: primaryPrice.usdPrice,
        fallbackSource: fallbackPrice.source,
        fallbackPrice: fallbackPrice.usdPrice,
        discrepancy: discrepancy.toFixed(2) + '%',
      })

      // 감사 로그 기록
      await insertAuditLog({
        eventType: 'PRICE_CROSS_VALIDATION_FAILED',
        severity: 'warning',
        details: {
          token: token.address,
          chain: token.chain,
          primaryPrice: primaryPrice.usdPrice,
          fallbackPrice: fallbackPrice.usdPrice,
          discrepancy,
        },
      })

      return { validated: false, discrepancy }
    }

    return { validated: true, discrepancy }
  } catch {
    // Fallback 소스 조회 실패 -- 교차 검증 불가, Primary 신뢰
    return { validated: true }
  }
}
```

#### 7.1.2 급격한 가격 변동 감지

- **임계값:** 이전 캐시 대비 +-50% 변동
- **동작:** PriceSpikeWarning 발생 + 보수적 티어 한 단계 상향
- **설계 단순화:** VWAP(Volume Weighted Average Price) 개념은 도입하지 않는다. 5분 TTL 캐시로 순간 조작을 충분히 완화한다.

#### 7.1.3 0가격 토큰 처리

```typescript
/**
 * usdPrice가 0인 토큰 처리 (스캠/죽은 토큰).
 * CoinGecko가 0을 반환하거나 매우 작은 값을 반환하는 경우.
 *
 * 0가격 토큰은 SPENDING_LIMIT에서 $0으로 평가되므로 INSTANT 티어가 된다.
 * 이것이 보안 문제가 되지 않는 이유:
 * - 0가격 토큰 전송은 실제로 가치가 없으므로 INSTANT이 합리적
 * - 가치 있는 토큰이 0으로 잘못 보고되는 경우는 교차 검증에서 감지
 */
function handleZeroPrice(price: PriceInfo, token: TokenRef): PriceInfo {
  if (price.usdPrice === 0) {
    logger.info('Zero-price token detected', {
      token: token.address,
      chain: token.chain,
      source: price.source,
    })
  }
  return price  // 그대로 반환 (0가격도 유효한 가격)
}
```

### 7.2 오라클 장애 대응

#### 7.2.1 헬스체크 엔드포인트

```typescript
/**
 * GET /v1/admin/oracle-status
 *
 * 가격 오라클의 상태를 확인한다.
 * 인증: 관리자 토큰 필요 (기존 admin 인증 체계).
 */
// Response:
{
  status: 'healthy' | 'degraded' | 'unavailable',
  cache: {
    hits: number,
    misses: number,
    staleHits: number,
    size: number,
    evictions: number,
    hitRate: string,       // "85.3%"
    staleHitRate: string,  // "2.1%"
  },
  sources: {
    coingecko: {
      status: 'up' | 'down' | 'rate_limited',
      lastSuccessAt: string | null,   // ISO 8601
      consecutiveFailures: number,
    },
    pyth: {
      status: 'up' | 'down' | 'not_configured',
      lastSuccessAt: string | null,
      consecutiveFailures: number,
    },
    chainlink: {
      status: 'up' | 'down' | 'not_configured',
      lastSuccessAt: string | null,
      consecutiveFailures: number,
    },
  },
  lastPriceUpdate: string | null,  // 가장 최근 가격 갱신 시점
}
```

#### 7.2.2 장애 판단 기준

| 상태 | 조건 | 영향 |
|------|------|------|
| `healthy` | Primary 소스 정상, 캐시 히트율 > 50% | 정상 운영 |
| `degraded` | Primary 실패 + Fallback 정상, 또는 stale 히트율 > 30% | 서비스 지속, 보수적 판단 강화 |
| `unavailable` | 모든 소스 실패 + stale 캐시 소진 | Phase 22-23 과도기 전략 적용 |

### 7.3 에러 코드

| 코드 | HTTP | 설명 | 사용 위치 |
|------|------|------|----------|
| `PRICE_NOT_AVAILABLE` | - (내부) | 가격 조회 완전 실패 (모든 소스 + stale 없음) | PriceNotAvailableError |
| `PRICE_STALE` | - (로그) | TTL 만료 후 stale 가격 반환 | PriceStaleWarning |
| `PRICE_SPIKE_DETECTED` | - (로그) | 이전 캐시 대비 +-50% 변동 감지 | PriceSpikeWarning |

**참고:** 이 에러 코드들은 REST API 에러 응답으로 노출되지 않는다. 내부 로깅과 감사 추적에만 사용된다. USD 변환 실패 시 트랜잭션은 거부되지 않고, fallback 전략으로 처리된다.

### 7.4 네이티브 토큰 가격 실패 처리

네이티브 토큰(SOL/ETH)은 CoinGecko, Pyth, Chainlink 모두 안정적으로 지원하므로 가격 실패 확률이 매우 낮다. 그럼에도 실패하는 경우:

| 상황 | 동작 |
|------|------|
| SOL/ETH 가격 실패 + TRANSFER | 네이티브 기준 SPENDING_LIMIT 사용 (USD 변환 불필요) |
| SOL/ETH 가격 실패 + TOKEN_TRANSFER | TOKEN_TRANSFER의 USD 변환에만 영향. 과도기 NOTIFY 적용 |
| SOL/ETH 가격 실패 + CONTRACT_CALL | value 기준 네이티브 SPENDING_LIMIT (USD 변환 불필요) |

**핵심:** TRANSFER와 CONTRACT_CALL(value)은 네이티브 금액 기준 SPENDING_LIMIT이 이미 lamports/wei로 설정되어 있으므로, 네이티브 토큰 가격 실패가 정책 평가 자체를 차단하지 않는다.

---

## 8. 테스트 레벨 / Mock / 보안 시나리오 (ORACLE-04)

### 8.1 테스트 레벨

| 레벨 | 대상 | Mock 범위 | 목적 |
|------|------|----------|------|
| **단위 테스트** | PriceCache, resolveEffectiveAmountUsd, evaluateSpendingLimitUsd | MockPriceOracle (고정 가격 반환) | 캐시 로직, USD 변환 로직, 티어 판정 로직 검증 |
| **통합 테스트** | CoinGeckoOracle + HTTP Mock | nock/msw로 CoinGecko API 응답 모킹 | API 파싱, 에러 핸들링, rate limit 동작 검증 |
| **교차 검증 테스트** | OracleChain + 다중 소스 Mock | 각 소스별 Mock | fallback 경로, 교차 검증, stale 처리 검증 |
| **정책 통합 테스트** | DatabasePolicyEngine + MockPriceOracle | 실 DB + Mock 오라클 | USD 기준 정책 평가 end-to-end 검증 |

### 8.2 MockPriceOracle

```typescript
/**
 * 테스트용 Mock 오라클.
 * 고정 가격을 반환하며, 에러/stale 시뮬레이션을 지원한다.
 */
class MockPriceOracle implements IPriceOracle {
  private prices: Map<string, number> = new Map()
  private shouldFail: boolean = false
  private shouldReturnStale: boolean = false

  /** 고정 가격 설정 */
  setPrice(cacheKey: string, usdPrice: number): void {
    this.prices.set(cacheKey, usdPrice)
  }

  /** 네이티브 토큰 가격 설정 */
  setNativePrice(chain: string, usdPrice: number): void {
    this.prices.set(`${chain}:native`, usdPrice)
  }

  /** 전체 실패 모드 */
  setFailMode(fail: boolean): void {
    this.shouldFail = fail
  }

  /** stale 반환 모드 */
  setStaleMode(stale: boolean): void {
    this.shouldReturnStale = stale
  }

  async getPrice(token: TokenRef): Promise<PriceInfo> {
    if (this.shouldFail) throw new PriceNotAvailableError(token)

    const key = `${token.chain}:${token.address}`
    const price = this.prices.get(key)
    if (price === undefined) throw new PriceNotAvailableError(token)

    return {
      usdPrice: price,
      source: 'coingecko',
      fetchedAt: Date.now(),
      expiresAt: Date.now() + 300_000,
      isStale: this.shouldReturnStale,
    }
  }

  async getPrices(tokens: TokenRef[]): Promise<Map<string, PriceInfo>> {
    const result = new Map<string, PriceInfo>()
    for (const token of tokens) {
      try {
        const price = await this.getPrice(token)
        result.set(`${token.chain}:${token.address}`, price)
      } catch { /* skip */ }
    }
    return result
  }

  async getNativePrice(chain: 'solana' | 'ethereum'): Promise<PriceInfo> {
    if (this.shouldFail) throw new PriceNotAvailableError({ chain })

    const price = this.prices.get(`${chain}:native`)
    if (price === undefined) throw new PriceNotAvailableError({ chain })

    return {
      usdPrice: price,
      source: 'coingecko',
      fetchedAt: Date.now(),
      expiresAt: Date.now() + 300_000,
      isStale: this.shouldReturnStale,
    }
  }

  getCacheStats(): CacheStats {
    return { hits: 0, misses: 0, staleHits: 0, size: 0, evictions: 0 }
  }
}
```

### 8.3 보안 시나리오 (12개)

| # | 카테고리 | 시나리오 | 기대 결과 | 검증 방법 |
|---|---------|---------|----------|----------|
| S1 | 가격 조작 | 급격한 가격 변동 감지 (+60% 스파이크) 후 보수적 티어 적용 | INSTANT -> NOTIFY 상향 | MockPriceOracle에 이전=100, 현재=160 설정, 티어 상향 확인 |
| S2 | 가격 조작 | 다중 소스 교차 검증 실패 (CoinGecko=$100, Pyth=$80, 불일치 20%) | 보수적 가격 채택 + 감사 로그 기록 | 두 Mock 소스에 불일치 가격 설정, 경고 로그 확인 |
| S3 | 오라클 장애 | 전체 오라클 장애 (CoinGecko + Pyth + Chainlink 모두 실패) | Phase 22-23 과도기 전략 적용 | 모든 Mock 소스 failMode, TOKEN_TRANSFER가 NOTIFY 반환 확인 |
| S4 | 캐시 오염 | stale 데이터로 장기 운영 (30분 stale 한계 도달) | stale 만료 후 PriceNotAvailableError -> fallback | TTL 만료 + staleMaxAge 초과 시뮬레이션, fallback 동작 확인 |
| S5 | USD 변환 | USD 변환 실패 시 과도기 전략 동작 (TOKEN_TRANSFER) | NOTIFY 강제 반환 | getPrice() 실패 모킹, resolveEffectiveAmountUsd() fallback 확인 |
| S6 | 네이티브 가격 | 네이티브 토큰 가격 실패 + TOKEN_TRANSFER | TOKEN_TRANSFER는 NOTIFY, TRANSFER는 네이티브 기준 | getNativePrice() 실패 모킹, type별 fallback 분기 확인 |
| S7 | fallback 체인 | fallback 체인에서 순환 참조 없음 확인 | OracleChain이 유한 시간 내 완료 | OracleChain에 3개 소스 모두 실패, 타임아웃 내 완료 확인 |
| S8 | 0가격 토큰 | usdPrice=0 (스캠/죽은 토큰) 전송 | $0 평가 -> INSTANT 티어 | MockPriceOracle에 price=0 설정, INSTANT 반환 확인 |
| S9 | 극단적 가격 | BTC $100,000+ 또는 밈코인 $0.000001 정밀도 | 정밀도 손실 없이 올바른 USD 금액 계산 | 극단적 가격으로 resolveEffectiveAmountUsd() 호출, 결과 비교 |
| S10 | 배치 부분 실패 | 다중 토큰 배치에서 일부만 가격 조회 성공 (3/5 성공) | 성공분만 합산 + NOTIFY 이상 강제 | BATCH 5 instructions, 2개 가격 실패 모킹, 합산 USD + NOTIFY 강제 확인 |
| S11 | Rate Limit | CoinGecko rate limit 도달 시 degradation | Pyth/Chainlink fallback 또는 stale 캐시 사용 | CoinGecko Mock에 429 응답, fallback 경로 동작 확인 |
| S12 | stale 상향 | stale 가격으로 INSTANT 판정 시 NOTIFY 상향 | adjustTierForStalePrice() 적용 | isStale=true + INSTANT 입력, NOTIFY 반환 확인 |

### 8.4 CoinGecko Rate Limit 시뮬레이션

```typescript
// 통합 테스트: CoinGecko rate limit 429 응답 처리
describe('CoinGeckoOracle rate limit handling', () => {
  it('should fallback to stale cache on 429 Too Many Requests', async () => {
    // 1. 정상 가격 캐시에 저장
    mockHttp.get('/simple/token_price/solana')
      .reply(200, { 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { usd: 1.0001 } })

    await oracle.getPrice(usdcToken)  // 캐시에 저장됨

    // 2. TTL 경과 시뮬레이션
    advanceTime(300_001)  // 5분 + 1ms

    // 3. 429 응답 모킹
    mockHttp.get('/simple/token_price/solana')
      .reply(429, { status: { error_code: 429, error_message: 'Too Many Requests' } })

    // 4. stale 캐시 반환 확인
    const price = await oracle.getPrice(usdcToken)
    expect(price.isStale).toBe(true)
    expect(price.usdPrice).toBe(1.0001)
    expect(price.source).toBe('cache')
  })
})
```

---

## 9. Phase 25 수정 가이드

### 9.1 수정 필요 문서 목록

| # | 문서 | 문서 ID | 수정 내용 | 우선순위 |
|---|------|---------|----------|---------|
| 1 | 33-time-lock-approval-mechanism.md | LOCK-MECH | SpendingLimitRuleSchema USD 필드 추가, evaluate() 11단계 Stage 11 세분화(11a~11e), resolveEffectiveAmountUsd() 통합 | HIGH |
| 2 | 32-transaction-pipeline-api.md | TX-PIPE | Stage 3 Policy Check에 IPriceOracle 주입 지점 추가, resolveEffectiveAmountUsd() 호출 흐름 반영 | HIGH |
| 3 | 45-enum-unified-mapping.md | ENUM-MAP | PriceSource enum 추가 가능 (coingecko, pyth, chainlink, jupiter, cache) -- 별도 Enum이 아닌 Zod enum이므로 등록 선택적 |MEDIUM |
| 4 | 56-token-transfer-extension-spec.md | CHAIN-EXT-01 | TOKEN_TRANSFER 과도기 NOTIFY 고정 -> USD 기준 동적 4-tier 전환 주석 업데이트 | LOW |
| 5 | 58-contract-call-spec.md | CHAIN-EXT-03 | resolveEffectiveAmount() 주석에 resolveEffectiveAmountUsd() 병행 참조 추가 | LOW |
| 6 | 59-approve-management-spec.md | CHAIN-EXT-04 | APPROVE USD 참고값 감사 로그 기록 추가 | LOW |
| 7 | 60-batch-transaction-spec.md | CHAIN-EXT-05 | BATCH USD 합산 로직 참조 추가, 부분 실패 시 NOTIFY 강제 명시 | LOW |

### 9.2 수정 범위 요약

**HIGH (정책 엔진 핵심):**
- SpendingLimitRuleSchema: 3개 USD 필드 추가 (`instant_max_usd`, `notify_max_usd`, `delay_max_usd`)
- DatabasePolicyEngine.evaluate(): Stage 11을 11a(네이티브)~11e(보수적 상향)로 세분화
- PolicyEvaluationInput: `usdAmount`, `usdResolved`, `priceIsStale`, `priceSpikeDetected` 필드 추가

**MEDIUM (Enum 추적):**
- PriceSource는 PriceInfoSchema 내부 Zod enum이므로 45-enum에 등록은 선택적

**LOW (참조 주석 업데이트):**
- Phase 22-23 문서의 과도기 전략 주석에 "Phase 24에서 해소됨" 주석 추가

---

## 부록 A: CoinGecko API 레퍼런스

### A.1 /simple/price 엔드포인트 (네이티브 토큰)

| 항목 | 값 |
|------|------|
| **URL** | `GET https://api.coingecko.com/api/v3/simple/price` |
| **파라미터** | `ids=solana,ethereum` `vs_currencies=usd` `include_last_updated_at=true` |
| **인증** | `x-cg-demo-api-key: {API_KEY}` 헤더 |
| **Rate Limit** | Demo: 30 calls/min |

**응답 예시:**
```json
{
  "solana": {
    "usd": 150.25,
    "last_updated_at": 1707350400
  },
  "ethereum": {
    "usd": 2850.50,
    "last_updated_at": 1707350400
  }
}
```

### A.2 /simple/token_price/{platformId} 엔드포인트 (토큰)

| 항목 | 값 |
|------|------|
| **URL** | `GET https://api.coingecko.com/api/v3/simple/token_price/{platformId}` |
| **platformId** | `solana` (Solana SPL), `ethereum` (EVM ERC-20) |
| **파라미터** | `contract_addresses={addr1},{addr2}` `vs_currencies=usd` `include_last_updated_at=true` |
| **인증** | `x-cg-demo-api-key: {API_KEY}` 헤더 |
| **Rate Limit** | Demo: 30 calls/min (전체 API 공유) |

**응답 예시 (Solana USDC):**
```json
{
  "epjfwdd5aufqssqem2qn1xzybapC8g4weggkzwytdt1v": {
    "usd": 1.0001,
    "last_updated_at": 1707350400
  }
}
```

**주의:** 응답의 키는 입력 주소의 **lowercase** 버전이다. EVM 주소도 lowercase로 반환된다.

### A.3 에러 응답

| HTTP 상태 | 의미 | 대응 |
|----------|------|------|
| 200 | 성공 | 정상 처리 |
| 429 | Rate Limit 초과 | Fallback 소스 또는 stale 캐시 사용 |
| 500/502/503 | 서버 에러 | Fallback 소스 또는 stale 캐시 사용 |
| 404 | 토큰 미존재 | PriceNotAvailableError (캐시하지 않음) |

---

## 부록 B: 기존 문서 변경 영향 분석

### B.1 영향 요약

| 기존 문서 | 영향도 | 변경 유형 | 상세 |
|----------|--------|----------|------|
| 33-time-lock-approval-mechanism.md | **HIGH** | 스키마 확장 + 알고리즘 세분화 | SpendingLimitRuleSchema USD 필드 3개, evaluate() Stage 11 세분화 |
| 32-transaction-pipeline-api.md | **HIGH** | Stage 3 확장 | IPriceOracle DI 지점, resolveEffectiveAmountUsd() 호출 추가 |
| 56-token-transfer-extension-spec.md | LOW | 주석 업데이트 | 과도기 NOTIFY 고정 -> "Phase 24에서 해소" 주석 |
| 58-contract-call-spec.md | LOW | 주석 업데이트 | resolveEffectiveAmount()에 USD 병행 참조 추가 |
| 59-approve-management-spec.md | LOW | 주석 업데이트 | APPROVE USD 참고값 감사 로그 참조 |
| 60-batch-transaction-spec.md | LOW | 주석 업데이트 | BATCH USD 합산 참조, 부분 실패 NOTIFY 강제 |

### B.2 하위 호환성

| 변경 | 하위 호환 | 설명 |
|------|----------|------|
| SpendingLimitRuleSchema USD 필드 | 호환 | 모든 USD 필드는 optional. 미설정 시 기존 네이티브 기준 |
| PolicyEvaluationInput 확장 필드 | 호환 | 모든 Phase 24 필드는 optional |
| evaluate() 11단계 세분화 | 호환 | 기존 11단계 순서 변경 없음. Stage 11 내부만 세분화 |
| PriceNotAvailableError catch | 호환 | IPriceOracle 미주입 시 fallbackToNative=true로 동작 |

---

*문서 작성일: 2026-02-08*
*Phase 24 Plan 01 산출물*
*다음 단계: Phase 25에서 기존 문서 8개에 v0.6 변경 반영*
