# Phase 126: Oracle Implementations - Research

**Researched:** 2026-02-15
**Domain:** Price Oracle (Pyth Hermes REST API + CoinGecko Demo API + OracleChain fallback)
**Confidence:** HIGH

## Summary

Phase 126은 PythOracle, CoinGeckoOracle, OracleChain 세 구현체를 만들어 Phase 125에서 완성한 IPriceOracle 인터페이스, InMemoryPriceCache, classifyPriceAge 위에 쌓는 단계이다. Pyth Hermes REST API는 공개 인스턴스(https://hermes.pyth.network)에서 API 키 없이 380+ 크립토 가격 피드를 제공하며, `/v2/updates/price/latest?ids[]=0x...&parsed=true` 엔드포인트로 price/conf/expo/publish_time을 반환한다. CoinGecko Demo API는 `https://api.coingecko.com/api/v3` 베이스 URL에 `x-cg-demo-api-key` 헤더로 인증하며, `/simple/token_price/{platformId}` (SPL/ERC-20)과 `/simple/price` (네이티브 토큰)로 가격을 조회한다. 두 API 모두 native fetch()로 호출 가능하여 신규 npm 의존성 0개 제약을 충족한다.

OracleChain은 Pyth(Primary) -> CoinGecko(Fallback, 키 설정 시) -> Stale Cache 3단계 fallback을 구현하고, CoinGecko 키가 설정된 경우에만 교차 검증을 수행하여 편차>5%이면 STALE로 격하한다. GET /v1/admin/oracle-status 엔드포인트는 기존 admin.ts 라우터에 추가하여 캐시 통계와 소스별 상태를 반환한다. 모든 구현체가 Phase 125의 InMemoryPriceCache를 공유하며, getOrFetch()로 stampede prevention을 활용한다.

**Primary recommendation:** Pyth feed ID는 주요 토큰(SOL/ETH/USDC/USDT/BTC 등)을 하드코딩 맵으로 관리하되, `/v2/price_feeds?query=SYMBOL&asset_type=crypto` 엔드포인트로 동적 검색 fallback을 제공한다. CoinGecko platformId는 WAIaaS가 지원하는 체인별로 정적 매핑한다.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| native fetch() | Node.js 22 built-in | HTTP calls to Pyth/CoinGecko APIs | v1.5 제약: 신규 npm 의존성 0개. Node 22에서 안정적으로 동작 |
| AbortSignal.timeout(5000) | Node.js 22 built-in | 5초 요청 타임아웃 | 기존 admin.ts test-rpc에서 동일 패턴 사용 중 |
| InMemoryPriceCache | Phase 125 산출물 | 5분 TTL + 30분 staleMax + LRU 128 + stampede prevention | Phase 125에서 구현 완료, getOrFetch() 포함 |
| classifyPriceAge | Phase 125 산출물 | FRESH/AGING/STALE 3단계 판정 | Phase 125에서 구현 완료, 테스트 포함 |
| buildCacheKey | Phase 125 산출물 | `chain:address` 형태 캐시 키 생성 | EVM lowercase 정규화 포함 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @waiaas/core IPriceOracle | Phase 125 | 인터페이스 계약 | PythOracle, CoinGeckoOracle, OracleChain이 구현 |
| @waiaas/core TokenRefSchema | Phase 125 | 토큰 참조 Zod 검증 | getPrice() 입력 검증 시 |
| @waiaas/core PriceInfoSchema | Phase 125 | 가격 정보 Zod 검증 | API 응답 변환 후 검증 시 |
| SettingsService | v1.4.4 | CoinGecko API 키 + 교차검증 임계값 저장/조회 | 런타임 설정 관리 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| native fetch() | @pythnetwork/hermes-client | npm 패키지 추가 금지 제약 위반. Hermes REST API가 충분히 단순하여 직접 호출로 충분 |
| 하드코딩 feed ID 맵 | Pyth /v2/price_feeds 동적 조회만 | 매번 2회 API 호출(검색+가격) 필요. 주요 토큰 하드코딩이 성능/안정성 우월 |
| InMemoryPriceCache.getOrFetch | 각 oracle 내부 캐시 로직 | Phase 125의 stampede prevention을 활용해야 하므로 getOrFetch 패턴 사용 |

**Installation:**
```bash
# 신규 npm 패키지 없음 (v1.5 제약)
```

## Architecture Patterns

### Recommended File Structure

```
packages/daemon/src/infrastructure/oracle/
  price-cache.ts           # [Phase 125 기존] InMemoryPriceCache
  price-age.ts             # [Phase 125 기존] classifyPriceAge
  pyth-oracle.ts           # [Phase 126 신규] PythOracle implements IPriceOracle
  coingecko-oracle.ts      # [Phase 126 신규] CoinGeckoOracle implements IPriceOracle
  oracle-chain.ts          # [Phase 126 신규] OracleChain fallback + 교차 검증
  pyth-feed-ids.ts         # [Phase 126 신규] Feed ID 하드코딩 맵 + 동적 검색
  coingecko-platform-ids.ts # [Phase 126 신규] platformId + nativeCoinId 매핑
  index.ts                 # [Phase 125 기존, 확장] barrel export

packages/daemon/src/api/routes/
  admin.ts                 # [기존, 확장] GET /admin/oracle-status 추가
  openapi-schemas.ts       # [기존, 확장] OracleStatusResponseSchema 추가

packages/daemon/src/infrastructure/settings/
  setting-keys.ts          # [기존, 확장] oracle.* 설정 키 추가
```

### Pattern 1: PythOracle - Hermes REST API 호출

**What:** Pyth Hermes `/v2/updates/price/latest` 엔드포인트로 가격 조회
**When to use:** getPrice(), getPrices(), getNativePrice() 호출 시

```typescript
// Pyth 가격 변환 공식 (검증 완료)
// 응답: { parsed: [{ price: { price: "18413602312", conf: "17716632", expo: -8 } }] }
// 가격 = Number(price) * 10^expo
// 예: 18413602312 * 10^(-8) = 184.13602312 USD

const rawPrice = Number(priceFeed.price.price);  // string -> number
const expo = priceFeed.price.expo;                // -8
const usdPrice = rawPrice * Math.pow(10, expo);   // 실제 USD 가격

// confidence interval -> 0-1 비율 변환
const rawConf = Number(priceFeed.price.conf);
const confUsd = rawConf * Math.pow(10, expo);
const confidence = usdPrice > 0 ? Math.max(0, 1 - (confUsd / usdPrice)) : undefined;
```

### Pattern 2: CoinGecko Demo API 호출

**What:** CoinGecko `/simple/token_price/{platformId}` 또는 `/simple/price` 엔드포인트
**When to use:** SPL/ERC-20 토큰 또는 네이티브 토큰(SOL/ETH) 가격 조회

```typescript
// SPL/ERC-20 토큰 가격 조회
const url = `https://api.coingecko.com/api/v3/simple/token_price/${platformId}` +
  `?contract_addresses=${addresses}` +
  `&vs_currencies=usd` +
  `&include_last_updated_at=true`;

const res = await fetch(url, {
  headers: { 'x-cg-demo-api-key': apiKey },
  signal: AbortSignal.timeout(5000),
});

// 응답: { "0xaddr_lowercase": { "usd": 1.0001, "last_updated_at": 1711356300 } }
// 주의: EVM 주소는 항상 lowercase로 반환됨 -> buildCacheKey()와 일치

// 네이티브 토큰 가격 조회 (별도 엔드포인트)
const nativeUrl = `https://api.coingecko.com/api/v3/simple/price` +
  `?ids=${coinId}` + // 'solana' 또는 'ethereum'
  `&vs_currencies=usd` +
  `&include_last_updated_at=true`;

// 응답: { "solana": { "usd": 150.25, "last_updated_at": 1711356300 } }
```

### Pattern 3: OracleChain Fallback + 교차 검증

**What:** Pyth -> CoinGecko 순차 시도, 교차 검증 인라인
**When to use:** 프로덕션 가격 조회 (TransactionService에서 사용하는 주 진입점)

```typescript
// OracleChain.getPrice() 핵심 로직
// 1. Primary(Pyth) 조회
// 2. Primary 성공 + CoinGecko 키 설정 -> 교차 검증
//    - 편차 <= 5%: Pyth 가격 채택
//    - 편차 > 5%: isStale=true 격하 + PRICE_DEVIATION_WARNING 로그
//    - CoinGecko 실패: Pyth 가격 신뢰
// 3. Primary 실패 -> CoinGecko fallback (키 설정 시)
// 4. 모두 실패 -> stale cache (InMemoryPriceCache.getStale())
// 5. stale cache도 없음 -> PriceNotAvailableError throw

const deviation = Math.abs(
  (primaryPrice.usdPrice - fallbackPrice.usdPrice) / primaryPrice.usdPrice
) * 100;

if (deviation > CROSS_VALIDATION_THRESHOLD) {
  // STALE 격하: isStale=true로 설정
  return { ...primaryPrice, isStale: true };
}
```

### Pattern 4: Admin oracle-status 엔드포인트

**What:** GET /v1/admin/oracle-status 캐시 통계 + 소스별 상태 반환
**When to use:** Admin UI 모니터링

```typescript
// 기존 AdminRouteDeps에 oracle 의존성 추가
interface AdminRouteDeps {
  // ... 기존 deps
  priceOracle?: IPriceOracle;
}

// 응답 형태
{
  cache: { hits, misses, staleHits, size, evictions },
  sources: {
    pyth: { available: true, feedCount: N },
    coingecko: { available: boolean, apiKeyConfigured: boolean }
  },
  crossValidation: { enabled: boolean, threshold: number }
}
```

### Anti-Patterns to Avoid

- **oracle 내부에서 캐시 직접 관리**: 각 oracle이 독자 캐시를 가지면 OracleChain의 stale fallback이 동작하지 않음. 반드시 공유 InMemoryPriceCache를 사용
- **CoinGecko 개별 호출**: getPrices()에서 토큰별 개별 API 호출 시 30 calls/min rate limit 즉시 소진. 반드시 comma-separated 배치 조회 사용
- **Pyth feed ID 검색만 의존**: `/v2/price_feeds?query=` 매번 호출 시 불필요한 latency. 주요 토큰은 하드코딩, 미등록 토큰만 동적 검색
- **교차 검증에서 CoinGecko 실패를 에러 전파**: CoinGecko 조회 실패 시 교차 검증 스킵 후 Pyth 가격 신뢰, 에러를 throw하지 않음

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LRU 캐시 | 새 캐시 구현 | Phase 125 InMemoryPriceCache | 이미 LRU, TTL, staleMax, stampede prevention 완비 |
| 가격 나이 판정 | 새 로직 | Phase 125 classifyPriceAge() | FRESH/AGING/STALE 테스트 완료 |
| 캐시 키 생성 | 직접 문자열 조합 | Phase 125 buildCacheKey() | EVM lowercase 정규화 포함 |
| HTTP 타임아웃 | setTimeout + AbortController 직접 | AbortSignal.timeout(ms) | Node.js 22 built-in, 더 간결 |
| 설정 암호화 저장 | 직접 암호화 | SettingsService + setting-keys.ts | AES-GCM 암호화, fallback chain, hot-reload 완비 |

**Key insight:** Phase 125가 캐시/나이/키 생성 인프라를 완성했으므로, Phase 126은 HTTP API 호출 + 응답 파싱 + fallback 체인 조립에 집중한다.

## Common Pitfalls

### Pitfall 1: Pyth 가격 변환 정밀도

**What goes wrong:** Pyth price/conf 값이 string으로 반환되며, expo가 음수(-8 등)이다. Number()로 변환 시 큰 값에서 정밀도 손실 가능.
**Why it happens:** JavaScript Number는 IEEE 754 double (53-bit mantissa). Pyth price 필드가 10자리 이상이면 정밀도 문제.
**How to avoid:** WAIaaS는 USD 가격 비교용이므로 Number 정밀도(약 15자리)로 충분. BTC 가격($67,000 = 6700000000000 * 10^-8)도 13자리 이내. 만약 정밀도 문제 발생 시 BigInt + 수동 소수점 처리로 전환하되, v1.5에서는 Number로 충분.
**Warning signs:** 테스트에서 `usdPrice` 값이 소수점 이하 비정상적으로 길어지면 주의.

### Pitfall 2: CoinGecko EVM 주소 정규화

**What goes wrong:** CoinGecko API는 EVM 주소를 항상 lowercase로 반환한다. TokenRef.address가 checksum 형태(Mixed-case)면 캐시 미스 발생.
**Why it happens:** EIP-55 checksum address vs lowercase address 불일치.
**How to avoid:** buildCacheKey()가 이미 ethereum 체인에서 `address.toLowerCase()` 처리한다. CoinGecko 응답 파싱 시에도 동일한 buildCacheKey()로 키를 생성해야 한다.
**Warning signs:** 캐시 히트율이 비정상적으로 낮으면 키 정규화 문제 의심.

### Pitfall 3: Pyth Feed ID 매핑 누락

**What goes wrong:** 토큰 주소 -> Pyth feed ID 매핑이 없으면 PriceNotAvailableError가 즉시 발생하여 CoinGecko fallback도 동작하지 않음.
**Why it happens:** PythOracle.getPrice()에서 feedId 미발견 시 throw하면, OracleChain이 CoinGecko로 fallback 가능.
**How to avoid:** PythOracle에서 feedId 미발견 시 PriceNotAvailableError를 throw하되, OracleChain에서 이를 catch하고 CoinGecko fallback을 시도하도록 구현. feedId 없는 토큰 = Pyth 미지원 = 정상적 CoinGecko fallback 경로.
**Warning signs:** Pyth 미지원 토큰에서 "Price not available" 에러가 최종 사용자에게 노출되면 fallback 체인 문제.

### Pitfall 4: 교차 검증 시 CoinGecko 타임아웃으로 전체 지연

**What goes wrong:** 교차 검증은 동기적 인라인이므로, CoinGecko 5초 타임아웃이 전체 getPrice() latency에 추가됨.
**Why it happens:** 설계 결정: 교차 검증 결과가 반환값에 반영되어야 하므로 동기적.
**How to avoid:** 5초 타임아웃이 파이프라인 전체 타임아웃(30초)에 비해 허용 범위임을 확인. CoinGecko 타임아웃 발생 시 교차 검증 스킵 + Pyth 가격 신뢰. 캐시 히트 시 교차 검증이 발동하지 않으므로 대부분의 요청은 빠르게 처리.
**Warning signs:** 첫 번째 가격 조회에서만 느리고, 이후 5분간 빠르면 정상 (캐시 동작).

### Pitfall 5: CoinGecko platformId와 WAIaaS ChainType 불일치

**What goes wrong:** WAIaaS ChainType은 'solana' | 'ethereum'이지만, CoinGecko platformId는 체인마다 다름 (ethereum, polygon-pos, arbitrum-one 등).
**Why it happens:** WAIaaS v1.4.6에서 멀티체인 지원하면서 ethereum 체인이 여러 L2 네트워크를 포함.
**How to avoid:** CoinGecko platformId 매핑을 네트워크(NetworkType) 기반으로 구성. 현재 TokenRef에는 chain만 있으므로, v1.5에서는 chain='ethereum'일 때 기본 platformId='ethereum' 사용. L2 지원은 TokenRef에 network 필드 추가 시 확장. 현재 Pyth는 체인 무관(동일 feedId)이므로 Pyth에서는 문제 없음.
**Warning signs:** Polygon/Arbitrum 토큰 가격 조회 시 CoinGecko에서 결과 없음.

### Pitfall 6: getOrFetch()와 개별 oracle 캐시 로직 충돌

**What goes wrong:** 각 oracle 내부에서 cache.get()/set()을 직접 호출하면, OracleChain 레벨의 getOrFetch() stampede prevention과 충돌.
**Why it happens:** InMemoryPriceCache가 공유되므로, 누가 캐시를 관리하는지 명확히 해야 함.
**How to avoid:** **OracleChain이 캐시 관리의 단일 책임자**. 개별 oracle(PythOracle, CoinGeckoOracle)은 캐시를 직접 조작하지 않고, 순수하게 외부 API 호출 + PriceInfo 반환만 수행. OracleChain이 cache.getOrFetch()를 통해 캐시 조회/저장을 전담.
**Warning signs:** 캐시 히트인데도 외부 API 호출이 발생하면 캐시 관리 분리 문제.

## Code Examples

### Pyth Hermes API 호출 + 응답 파싱

```typescript
// Source: https://hermes.pyth.network/v2/updates/price/latest (실제 API 호출로 검증)

const HERMES_BASE_URL = 'https://hermes.pyth.network';

async function fetchPythPrice(feedId: string): Promise<PriceInfo> {
  const url = `${HERMES_BASE_URL}/v2/updates/price/latest` +
    `?ids[]=0x${feedId}` +
    `&parsed=true`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) throw new Error(`Pyth API ${res.status}`);

  const data = await res.json() as {
    parsed: Array<{
      id: string;
      price: { price: string; conf: string; expo: number; publish_time: number };
      ema_price: { price: string; conf: string; expo: number; publish_time: number };
    }>;
  };

  const feed = data.parsed?.[0];
  if (!feed?.price) throw new Error('No price data');

  const rawPrice = Number(feed.price.price);
  const expo = feed.price.expo;
  const usdPrice = rawPrice * Math.pow(10, expo);

  const rawConf = Number(feed.price.conf);
  const confUsd = rawConf * Math.pow(10, expo);
  const confidence = usdPrice > 0 ? Math.max(0, 1 - (confUsd / usdPrice)) : undefined;

  const now = Date.now();
  return {
    usdPrice,
    confidence,
    source: 'pyth' as const,
    fetchedAt: now,
    expiresAt: now + 300_000, // 5분 TTL
    isStale: false,
  };
}
```

### Pyth 배치 가격 조회

```typescript
// Pyth는 여러 feed ID를 한 번에 조회 가능: ?ids[]=id1&ids[]=id2
async function fetchPythPrices(feedIds: string[]): Promise<Map<string, PriceInfo>> {
  const params = feedIds.map(id => `ids[]=0x${id}`).join('&');
  const url = `${HERMES_BASE_URL}/v2/updates/price/latest?${params}&parsed=true`;

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Pyth API ${res.status}`);

  const data = await res.json();
  const result = new Map<string, PriceInfo>();

  for (const feed of data.parsed ?? []) {
    // feed.id -> 원래 feedId로 역매핑하여 cacheKey 결정
    const rawPrice = Number(feed.price.price);
    const expo = feed.price.expo;
    const usdPrice = rawPrice * Math.pow(10, expo);
    // ... PriceInfo 생성 후 result.set(cacheKey, priceInfo)
  }

  return result;
}
```

### CoinGecko 배치 토큰 가격 조회

```typescript
// Source: https://docs.coingecko.com/reference/simple-token-price

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

async function fetchCoinGeckoTokenPrices(
  platformId: string,
  addresses: string[],
  apiKey: string,
): Promise<Map<string, number>> {
  const url = `${COINGECKO_BASE_URL}/simple/token_price/${platformId}` +
    `?contract_addresses=${addresses.join(',')}` +
    `&vs_currencies=usd` +
    `&include_last_updated_at=true`;

  const res = await fetch(url, {
    headers: { 'x-cg-demo-api-key': apiKey },
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) throw new Error(`CoinGecko API ${res.status}`);

  // 응답: { "0xaddr": { "usd": 1.0001, "last_updated_at": 1711356300 } }
  const data = await res.json() as Record<string, { usd?: number; last_updated_at?: number }>;
  const result = new Map<string, number>();

  for (const [addr, info] of Object.entries(data)) {
    if (info.usd !== undefined && info.usd !== null) {
      result.set(addr.toLowerCase(), info.usd);
    }
  }

  return result;
}
```

### 교차 검증 편차 계산

```typescript
// Source: docs/61-price-oracle-spec.md 섹션 3.6

function calculateDeviation(primaryPrice: number, fallbackPrice: number): number {
  if (primaryPrice === 0) return 0;
  return Math.abs((primaryPrice - fallbackPrice) / primaryPrice) * 100;
}

// 사용:
// deviation = 20% -> STALE 격하
// deviation = 1.3% -> Primary 채택
```

### SettingsService 확장 (Oracle 설정 키)

```typescript
// setting-keys.ts에 추가할 oracle 카테고리 설정
// 패턴: 기존 notifications/rpc/security/daemon/walletconnect과 동일

{ key: 'oracle.coingecko_api_key', category: 'oracle', configPath: 'oracle.coingecko_api_key', defaultValue: '', isCredential: true },
{ key: 'oracle.cross_validation_threshold', category: 'oracle', configPath: 'oracle.cross_validation_threshold', defaultValue: '5', isCredential: false },
```

## Verified API Details

### Pyth Hermes REST API (HIGH confidence - 실제 API 호출로 검증)

| 항목 | 값 |
|------|------|
| Base URL | `https://hermes.pyth.network` |
| 가격 조회 | `GET /v2/updates/price/latest?ids[]=0x{feedId}&parsed=true` |
| 피드 검색 | `GET /v2/price_feeds?query={symbol}&asset_type=crypto` |
| Rate Limit | 30 req/10s (공개 인스턴스) |
| 인증 | 없음 (API 키 불필요) |
| 응답 형태 | `{ binary: { encoding, data[] }, parsed: [{ id, price: { price, conf, expo, publish_time }, ema_price, metadata }] }` |
| price/conf 타입 | string (Number()로 변환 필요) |
| expo 타입 | number (음수, 보통 -8) |

### 검증된 Pyth Feed IDs (HIGH confidence - /v2/price_feeds API로 확인)

| 토큰 | Feed ID (hex, 0x 없이) |
|------|----------------------|
| SOL/USD | `ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` |
| ETH/USD | `ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` |
| USDC/USD | `eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a` |
| USDT/USD | `2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b` |
| BTC/USD | `e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43` |

### CoinGecko Demo API (HIGH confidence - 공식 문서 검증)

| 항목 | 값 |
|------|------|
| Base URL | `https://api.coingecko.com/api/v3` |
| 토큰 가격 | `GET /simple/token_price/{platformId}?contract_addresses={addr}&vs_currencies=usd&include_last_updated_at=true` |
| 네이티브 가격 | `GET /simple/price?ids={coinId}&vs_currencies=usd&include_last_updated_at=true` |
| 인증 헤더 | `x-cg-demo-api-key: {apiKey}` |
| Rate Limit | 30 calls/min (Demo), 월 10,000 calls |
| 응답 형태 (토큰) | `{ "0xaddr_lowercase": { "usd": 1.0001, "last_updated_at": 1711356300 } }` |
| 응답 형태 (네이티브) | `{ "solana": { "usd": 150.25, "last_updated_at": 1711356300 } }` |

### CoinGecko Platform/Coin ID 매핑 (MEDIUM confidence - 일부 API 응답으로 확인)

| WAIaaS chain | CoinGecko platformId | CoinGecko nativeCoinId | 비고 |
|--------------|---------------------|----------------------|------|
| solana | `solana` | `solana` | SPL 토큰 조회용 |
| ethereum | `ethereum` | `ethereum` | ERC-20 토큰 조회용 |
| ethereum (Polygon) | `polygon-pos` | `matic-network` | v1.5 범위 외, 향후 확장 |
| ethereum (Arbitrum) | `arbitrum-one` | `ethereum` | v1.5 범위 외 |
| ethereum (Optimism) | `optimistic-ethereum` | `ethereum` | v1.5 범위 외 |
| ethereum (Base) | `base` | `ethereum` | v1.5 범위 외 |

**Note:** v1.5에서 TokenRef.chain은 'solana' | 'ethereum'만 지원. L2 네트워크별 platformId 매핑은 향후 TokenRef에 network 필드 추가 시 확장. 현재는 chain='ethereum'이면 platformId='ethereum' 사용.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Chainlink 온체인 Aggregator 직접 호출 | Pyth Hermes REST API (off-chain) | 2024 Pyth Hermes 출시 | API 키 불필요, 체인 무관, 구현 단순화 |
| CoinGecko 공개 API (키 없이) | Demo API 키 필수 (2023년 무료 공개 API 폐지) | 2023 | API 키 없이는 rate limit 매우 제한적, Demo 키 30 calls/min |
| 여러 체인별 oracle 구현 | Pyth 체인 무관 단일 feed ID | 2024 | SOL/EVM 모두 동일 feed ID, 구현 통합 |

**Deprecated/outdated:**
- CoinGecko 공개 API (키 없이 사용): 2023년 폐지, Demo 키 필요
- Pyth `/latest_price_feeds` v1 endpoint: deprecated, `/v2/updates/price/latest` 사용
- Pyth `/price_feed_ids` v1 endpoint: deprecated, `/v2/price_feeds` 사용

## Implementation Decisions for Phase 126

### Feed ID 매핑 전략 (ORACL-02 관련)

**결정: 하드코딩 맵 + 동적 검색 2단계**

1. **pyth-feed-ids.ts에 주요 토큰 하드코딩**: SOL, ETH, USDC, USDT, BTC 등 핵심 토큰의 feed ID를 캐시키 형태(`chain:address`)로 매핑. 네이티브 토큰은 `solana:native`, `ethereum:native` 키 사용.
2. **미등록 토큰은 PriceNotAvailableError**: Pyth feed ID가 없는 토큰은 PythOracle에서 즉시 실패 -> OracleChain이 CoinGecko fallback 시도.
3. **/v2/price_feeds 동적 검색은 v1.5 범위 외**: 런타임 symbol 기반 동적 검색은 구현 복잡도 대비 실용성이 낮음 (address -> symbol 역매핑 필요). 향후 Admin UI에서 feed ID 수동 추가 기능으로 확장 가능.

**근거:** 하드코딩 맵이 가장 안정적이고 API 호출을 최소화. 모든 주요 토큰(SOL/ETH/USDC/USDT/BTC)은 Pyth에서 지원. 롱테일 토큰은 CoinGecko fallback이 담당.

### 캐시 관리 책임 분리 (ORACL-04 관련)

**결정: OracleChain이 캐시 관리 전담**

- PythOracle, CoinGeckoOracle: 순수 HTTP API 호출 + PriceInfo 반환만 수행, 캐시 미접근
- OracleChain: InMemoryPriceCache.getOrFetch()를 통해 캐시 조회/저장 전담
- 교차 검증 시: OracleChain이 CoinGecko를 직접 호출 (캐시 우회)

**근거:** stampede prevention(getOrFetch)이 OracleChain 레벨에서만 동작해야 일관성 확보. 개별 oracle이 캐시를 조작하면 이중 캐싱/불일치 위험.

### SettingsService 확장 (ORACL-03, ORACL-07 관련)

**결정: 'oracle' 카테고리 신규 추가**

- `oracle.coingecko_api_key`: isCredential=true, AES-GCM 암호화 저장
- `oracle.cross_validation_threshold`: 기본값 '5' (%), 런타임 변경 가능

**근거:** CoinGecko API 키는 보안 자격증명이므로 SettingsService의 암호화 저장 활용. 교차 검증 임계값은 CLAUDE.md 규칙("런타임 변경이 유용한 설정은 Admin Settings에 노출")에 따라 Admin Settings에서 조정 가능하게 함.

### Admin oracle-status 엔드포인트 (ORACL-08 관련)

**결정: 기존 admin.ts 라우터에 추가**

- AdminRouteDeps에 `priceOracle?: IPriceOracle` 추가
- OracleStatusResponseSchema를 openapi-schemas.ts에 추가
- SettingsService에서 CoinGecko 키 설정 여부 확인하여 sources.coingecko.apiKeyConfigured 반환

## Open Questions

1. **Pyth feed ID 확장 메커니즘**
   - What we know: 하드코딩 맵으로 주요 토큰 커버, 나머지는 CoinGecko fallback
   - What's unclear: Admin UI에서 사용자가 커스텀 feed ID를 추가할 수 있어야 하는가?
   - Recommendation: v1.5에서는 하드코딩만. 커스텀 매핑 추가는 v1.5.x 이후 이슈로 등록. PYTH_FEED_IDS를 const가 아닌 기본값 + SettingsService 오버라이드 패턴으로 설계하면 향후 확장 용이.

2. **L2 네트워크의 CoinGecko platformId 매핑**
   - What we know: WAIaaS가 Polygon/Arbitrum/Optimism/Base 네트워크를 지원하며, CoinGecko platformId가 네트워크마다 다름
   - What's unclear: TokenRef에 network 필드가 없으므로 현재 L2 토큰의 정확한 platformId를 결정할 수 없음
   - Recommendation: v1.5에서는 chain='ethereum'이면 platformId='ethereum'으로 고정. L2 토큰은 Pyth(체인 무관)에서 대부분 커버. CoinGecko에서 L2 토큰 조회 실패는 PriceNotAvailableError -> 네이티브 fallback 경로로 처리.

3. **HotReloadOrchestrator 확장 범위**
   - What we know: oracle.coingecko_api_key 변경 시 OracleChain 재구성 필요 (CoinGecko oracle 추가/제거)
   - What's unclear: hot-reload로 OracleChain 런타임 재구성 시 진행 중인 가격 조회와 경합 가능
   - Recommendation: HotReloadOrchestrator에 oracle 카테고리 핸들러 추가. OracleChain 교체는 atomic reference swap 패턴으로 구현 (진행 중 요청은 이전 인스턴스로 완료, 새 요청부터 새 인스턴스 사용).

## Sources

### Primary (HIGH confidence)
- Pyth Hermes `/v2/updates/price/latest` - 실제 API 호출로 응답 구조 검증 (SOL/USD feed)
- Pyth Hermes `/v2/price_feeds?query=SOL&asset_type=crypto` - feed ID 검증 (SOL, ETH, USDC, USDT)
- CoinGecko `/simple/token_price` 공식 문서 - https://docs.coingecko.com/reference/simple-token-price
- CoinGecko `/simple/price` 공식 문서 - https://docs.coingecko.com/reference/simple-price
- CoinGecko Demo API 설정 가이드 - https://docs.coingecko.com/docs/setting-up-your-api-key
- docs/61-price-oracle-spec.md - WAIaaS 내부 설계 문서 (Pyth/CoinGecko 구현체 의사코드 포함)
- Phase 125 산출물 - price-oracle.types.ts, price-cache.ts, price-age.ts (코드베이스 직접 확인)

### Secondary (MEDIUM confidence)
- Pyth Developer Hub API Reference - https://docs.pyth.network/price-feeds/core/api-reference
- Pyth Hermes 문서 - https://docs.pyth.network/price-feeds/core/how-pyth-works/hermes
- CoinGecko asset_platforms 문서 - https://docs.coingecko.com/reference/asset-platforms-list
- CoinGecko API 가격 계획 - https://www.coingecko.com/en/api/pricing

### Tertiary (LOW confidence)
- CoinGecko L2 platformId (polygon-pos, arbitrum-one, optimistic-ethereum, base) - API 응답 일부 확인, 전체 목록은 미검증

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 모두 기존 코드베이스 패턴 + Node.js 22 내장 기능, 신규 의존성 없음
- Architecture: HIGH - docs/61-price-oracle-spec.md 의사코드가 상세하고, Phase 125 인프라가 완비
- API 상세: HIGH - Pyth Hermes API 실제 호출로 응답 구조 검증 완료, CoinGecko 공식 문서 확인
- Pitfalls: HIGH - 기존 코드베이스의 fetch 패턴, 캐시 로직, settings 패턴을 직접 확인
- L2 platformId: LOW - CoinGecko platformId 일부만 확인, v1.5 범위 외이므로 영향 낮음

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (Pyth/CoinGecko API는 안정적, 30일 유효)
