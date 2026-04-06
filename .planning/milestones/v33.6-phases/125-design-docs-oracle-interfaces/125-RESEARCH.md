# Phase 125: Design Docs + Oracle Interfaces - Research

**Researched:** 2026-02-15
**Domain:** 설계 문서 수정 + IPriceOracle 인터페이스/캐시/가격 나이 분류기 구현
**Confidence:** HIGH

## Summary

Phase 125는 v1.5의 첫 번째 페이즈로, 두 가지 트랙으로 구성된다. (1) 설계 문서 61/62/38을 v1.5 아키텍처 결정에 맞게 수정하고, (2) IPriceOracle 인터페이스, InMemoryPriceCache, classifyPriceAge를 **외부 API 호출 없이** 동작하는 상태로 구현한다. 실제 Pyth/CoinGecko 구현체는 이 페이즈 범위 밖이며, 인터페이스와 인프라 계층만 구축한다.

설계 문서 수정은 명확한 diff 작업이다: doc 61에서 Chainlink 제거 + Pyth Primary/CoinGecko Fallback 구조 반영, doc 62/38에서 MCP 16개 상한 제거 + 현행 14개 도구 현행화. 코드 구현은 기존 `@waiaas/core` Zod SSoT 패턴을 따르며, 신규 외부 의존성 0개 원칙에 따라 LRU 캐시를 Map 기반으로 직접 구현한다.

**Primary recommendation:** Zod 스키마를 `packages/core/src/interfaces/price-oracle.types.ts`에 정의하고, InMemoryPriceCache와 classifyPriceAge를 `packages/daemon/src/infrastructure/oracle/`에 구현하라. 기존 daemon 디렉토리 컨벤션(`infrastructure/` 하위)을 따르되, 설계 문서 61에서 제시한 `services/` 대신 기존 패턴을 유지한다.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.x (기존) | IPriceOracle 타입의 SSoT 스키마 정의 | 프로젝트 Zod SSoT 원칙. TokenRef/PriceInfo/CacheStats 모두 Zod 스키마에서 파생 |
| vitest | 3.x (기존) | 단위 테스트 (InMemoryPriceCache, classifyPriceAge) | 기존 테스트 인프라와 동일 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js Map | 22.x 내장 | LRU 캐시 기반 자료구조 | ES2015+ Map은 삽입 순서를 보장하므로 LRU에 적합 |
| Date.now() | 내장 | 가격 나이 판정 타임스탬프 | FRESH/AGING/STALE 경계값 계산 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Map 기반 LRU | lru-cache npm 패키지 | v1.5 외부 의존성 0개 결정으로 불가. Map 기반으로 128항목 규모에 충분 |
| 자체 PriceAge enum | 문자열 리터럴 union | Zod enum이 타입 안전성과 런타임 검증을 동시에 제공 |

**Installation:**
```bash
# 신규 의존성 없음 (v1.5 결정: 외부 npm 의존성 0개)
```

## Architecture Patterns

### Recommended Project Structure
```
packages/core/src/interfaces/
  price-oracle.types.ts          # TokenRef, PriceInfo, CacheStats, PriceAge, IPriceOracle (Zod SSoT)

packages/daemon/src/infrastructure/oracle/
  index.ts                       # barrel export
  price-cache.ts                 # InMemoryPriceCache (LRU 128항목, 5분 TTL)
  price-age.ts                   # classifyPriceAge(), PriceAge enum, 상수 정의

packages/daemon/src/__tests__/
  price-cache.test.ts            # InMemoryPriceCache 단위 테스트
  price-age.test.ts              # classifyPriceAge 단위 테스트
```

**근거:**
- `packages/core/src/interfaces/`에 Zod 스키마 + 인터페이스 → 기존 IChainAdapter, IPolicyEngine과 동일 패턴
- `packages/daemon/src/infrastructure/oracle/`에 구현체 → 기존 `infrastructure/keystore/`, `infrastructure/settings/`, `infrastructure/token-registry/`와 동일 패턴. 설계 문서 61이 `services/`를 제안하지만, 코드베이스에 `services/` 디렉토리가 없으므로 기존 `infrastructure/` 컨벤션을 따른다
- `__tests__/` 최상위에 테스트 → 기존 daemon 테스트 패턴

### Pattern 1: Zod SSoT Interface Definition
**What:** Zod 스키마 → TypeScript 타입 → 인터페이스 순서로 정의
**When to use:** 새 도메인 타입(TokenRef, PriceInfo, CacheStats) 정의 시
**Example:**
```typescript
// packages/core/src/interfaces/price-oracle.types.ts
import { z } from 'zod';
import { ChainTypeEnum } from '../enums/chain.js';

// Step 1: Zod 스키마 (SSoT)
export const TokenRefSchema = z.object({
  address: z.string().min(1),
  symbol: z.string().optional(),
  decimals: z.number().int().min(0).max(18),
  chain: ChainTypeEnum,
});

// Step 2: TypeScript 타입 (z.infer)
export type TokenRef = z.infer<typeof TokenRefSchema>;

// Step 3: 인터페이스는 타입을 참조
export interface IPriceOracle {
  getPrice(token: TokenRef): Promise<PriceInfo>;
  // ...
}
```
**Source:** 기존 `packages/core/src/schemas/policy.schema.ts`, `transaction.schema.ts` 동일 패턴

### Pattern 2: Map-based LRU Cache
**What:** ES Map의 삽입 순서 보장을 활용한 LRU 퇴거
**When to use:** InMemoryPriceCache 구현
**Example:**
```typescript
// Map.keys().next().value = 가장 오래된(least recently used) 항목
// delete → set 순서로 접근 순서 갱신 (LRU touch)
class InMemoryPriceCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly maxEntries: number;

  get(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // LRU touch: delete 후 re-insert로 최신 위치로 이동
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }

  set(key: string, entry: CacheEntry): void {
    // 용량 초과 시 가장 오래된 항목(Map의 first key) 퇴거
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, entry);
  }
}
```
**Source:** 설계 문서 61 섹션 4.1 PriceCache 의사코드

### Pattern 3: Discriminated Union for PriceAge
**What:** classifyPriceAge가 FRESH/AGING/STALE 3가지 상태를 명확히 구분
**When to use:** 가격 나이 판정 후 정책 평가 분기
**Example:**
```typescript
export const PRICE_AGES = ['FRESH', 'AGING', 'STALE'] as const;
export type PriceAge = (typeof PRICE_AGES)[number];
export const PriceAgeEnum = z.enum(PRICE_AGES);

// 경계값 상수 (SSoT)
export const PRICE_AGE_THRESHOLDS = {
  FRESH_MAX_MS: 5 * 60 * 1000,   // 5분
  AGING_MAX_MS: 30 * 60 * 1000,  // 30분
} as const;

export function classifyPriceAge(fetchedAt: number, now?: number): PriceAge {
  const age = (now ?? Date.now()) - fetchedAt;
  if (age < PRICE_AGE_THRESHOLDS.FRESH_MAX_MS) return 'FRESH';
  if (age < PRICE_AGE_THRESHOLDS.AGING_MAX_MS) return 'AGING';
  return 'STALE';
}
```
**Source:** 설계 문서 61 섹션 5.2.1, v0.10 설계 결정 OPER-03

### Pattern 4: Cache Stampede Prevention
**What:** 동일 키에 대한 동시 요청이 모두 캐시 미스일 때 하나만 실제 fetch하는 패턴
**When to use:** InMemoryPriceCache에서 동시 캐시 미스 방지
**Example:**
```typescript
class InMemoryPriceCache {
  private readonly inflightRequests = new Map<string, Promise<PriceInfo>>();

  /**
   * Cache stampede 방지: 동일 키에 대한 동시 요청 중 하나만 실제 fetch
   * 나머지는 첫 번째 요청의 Promise를 공유
   */
  async getOrFetch(key: string, fetcher: () => Promise<PriceInfo>): Promise<PriceInfo> {
    // 1. 캐시 히트
    const cached = this.get(key);
    if (cached && !cached.isExpired) return cached.price;

    // 2. 이미 진행 중인 요청이 있으면 그것을 대기
    const inflight = this.inflightRequests.get(key);
    if (inflight) return inflight;

    // 3. 새 요청 시작
    const promise = fetcher().then(price => {
      this.set(key, price);
      return price;
    }).finally(() => {
      this.inflightRequests.delete(key);
    });

    this.inflightRequests.set(key, promise);
    return promise;
  }
}
```
**Source:** Success Criteria 4 "cache stampede를 방지한다"

### Anti-Patterns to Avoid
- **Cache에서 Date.now() 직접 호출:** 테스트 불가능. `now` 파라미터를 받아 주입 가능하게 하거나, 내부적으로 Date.now()를 사용하되 테스트에서 시간을 조작할 수 있도록 vi.useFakeTimers() 활용
- **PriceInfo에 source 필드를 'chainlink' 포함:** v1.5에서 Chainlink를 제거하므로 source enum에서 'chainlink' 제거 필요. 'jupiter'도 v1.5 범위 외
- **IPriceOracle 구현체를 core 패키지에 배치:** core는 인터페이스와 타입만 포함. 구현체는 daemon 패키지
- **LRU에서 doubly-linked list 사용:** 128항목 규모에서 Map의 delete+set이 O(1)이므로 linked list 불필요. 설계 문서 61이 "Map + doubly-linked list"를 언급하지만, Map만으로 충분

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 가격 나이 판정 | 매 호출마다 Date.now() 계산 | classifyPriceAge 유틸리티 함수 | 경계값(5분/30분) 상수가 한 곳에서 관리됨. 테스트 가능 |
| 캐시 키 생성 | 문자열 직접 조합 | `buildCacheKey(chain, address)` 함수 | EVM 주소 lowercase 정규화를 한 곳에서 보장 |
| LRU 퇴거 | 별도 자료구조 | Map 삽입 순서 활용 | Node.js Map이 ES spec 기반 삽입 순서를 보장 |

**Key insight:** 이 페이즈의 모든 구현은 외부 라이브러리 없이 Node.js 내장 기능만으로 가능하다. v1.5 "신규 외부 npm 의존성 0개" 결정에 완전히 부합한다.

## Common Pitfalls

### Pitfall 1: PriceInfo source enum의 v1.5 불일치
**What goes wrong:** 설계 문서 61의 PriceInfoSchema.source가 `['coingecko', 'pyth', 'chainlink', 'jupiter', 'cache']`로 정의되어 있지만, v1.5에서 Chainlink를 제거하고 Jupiter는 범위 밖
**Why it happens:** 설계 문서 61이 v0.6 시점에 작성되어 v1.5 결정 이전 상태
**How to avoid:** Plan 125-01(문서 수정)에서 source enum을 `['pyth', 'coingecko', 'cache']`로 수정. Plan 125-02(코드 구현)에서 새 enum 반영
**Warning signs:** 테스트에서 `source: 'chainlink'` 사용 시

### Pitfall 2: classifyPriceAge vs PriceCache의 isStale 혼동
**What goes wrong:** PriceCache의 `isExpired`(TTL 5분 초과)와 classifyPriceAge의 `STALE`(30분 초과)이 다른 개념인데 혼동
**Why it happens:** 설계 문서 61 섹션 5.2.1의 주석에서도 이 혼동을 경고: "isStale 플래그는 TTL 만료(>5분) 시 true가 되지만, STALE(>30분) 처리는 PriceNotAvailableError를 통해 별도로 처리"
**How to avoid:** PriceCache의 `isExpired`는 TTL 초과 여부(5분), classifyPriceAge는 FRESH/AGING/STALE 3단계(5분/30분 경계). 이름을 명확히 구분하고 JSDoc에 명시
**Warning signs:** `isStale === true`를 STALE(>30분)로 잘못 해석

### Pitfall 3: Cache key에서 EVM 주소 case 불일치
**What goes wrong:** CoinGecko API가 lowercase 주소를 반환하는데, 사용자 입력은 checksummed (mixed-case)일 수 있음
**Why it happens:** EVM 주소는 0x로 시작하며 hexadecimal이지만, EIP-55 checksum으로 대소문자가 혼합
**How to avoid:** cacheKey 생성 시 항상 `address.toLowerCase()` 적용 (설계 문서 61 섹션 4.2 명시)
**Warning signs:** 같은 토큰이 캐시에 다른 키로 중복 저장

### Pitfall 4: Cache stampede와 단순 Promise 공유의 미묘한 차이
**What goes wrong:** inflight Promise를 공유할 때 에러가 발생하면 모든 대기자에게 에러 전파
**Why it happens:** Promise.reject()가 모든 then/catch로 전파
**How to avoid:** 에러 시 inflight Map에서 제거(finally 블록)하여 다음 요청이 새로 시도하도록 함. stale 캐시 fallback은 각 호출자가 독립적으로 처리
**Warning signs:** 오라클 일시 장애 시 모든 동시 요청이 동시에 실패

### Pitfall 5: 설계 문서 38이 docs/ 디렉토리에 없음
**What goes wrong:** doc 38은 `.planning/deliverables/38-sdk-mcp-interface.md`에 위치하며, `docs/` 디렉토리에 없다
**Why it happens:** v0.5 이전 설계 문서가 deliverables 경로에 배치된 것으로 보임
**How to avoid:** 정확한 경로 `.planning/deliverables/38-sdk-mcp-interface.md`로 수정 작업 수행
**Warning signs:** `docs/38-*`로 검색하면 파일을 찾을 수 없음

## Code Examples

### IPriceOracle 인터페이스 (Phase 125 구현 대상)

```typescript
// packages/core/src/interfaces/price-oracle.types.ts
import { z } from 'zod';
import { ChainTypeEnum } from '../enums/chain.js';

// --- Zod SSoT: TokenRef ---
export const TokenRefSchema = z.object({
  address: z.string().min(1, 'Token address is required'),
  symbol: z.string().optional(),
  decimals: z.number().int().min(0).max(18),
  chain: ChainTypeEnum,
});
export type TokenRef = z.infer<typeof TokenRefSchema>;

// --- Zod SSoT: PriceInfo ---
export const PriceInfoSchema = z.object({
  usdPrice: z.number().nonnegative(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(['pyth', 'coingecko', 'cache']),   // v1.5: chainlink/jupiter 제거
  fetchedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  isStale: z.boolean().default(false),
});
export type PriceInfo = z.infer<typeof PriceInfoSchema>;

// --- CacheStats (plain interface, monitoring용) ---
export interface CacheStats {
  hits: number;
  misses: number;
  staleHits: number;
  size: number;
  evictions: number;
}

// --- IPriceOracle 인터페이스 ---
export interface IPriceOracle {
  getPrice(token: TokenRef): Promise<PriceInfo>;
  getPrices(tokens: TokenRef[]): Promise<Map<string, PriceInfo>>;
  getNativePrice(chain: 'solana' | 'ethereum'): Promise<PriceInfo>;
  getCacheStats(): CacheStats;
}
```

### InMemoryPriceCache 핵심 구현

```typescript
// packages/daemon/src/infrastructure/oracle/price-cache.ts

interface CacheEntry {
  price: PriceInfo;
  cachedAt: number;
  expiresAt: number;         // cachedAt + TTL
  staleExpiresAt: number;    // cachedAt + TTL + STALE_MAX
}

export class InMemoryPriceCache {
  static readonly DEFAULT_TTL_MS = 5 * 60 * 1000;         // 5분
  static readonly DEFAULT_STALE_MAX_MS = 30 * 60 * 1000;  // 30분
  static readonly DEFAULT_MAX_ENTRIES = 128;

  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflightRequests = new Map<string, Promise<PriceInfo>>();
  private stats = { hits: 0, misses: 0, staleHits: 0, size: 0, evictions: 0 };

  constructor(
    private readonly ttlMs = InMemoryPriceCache.DEFAULT_TTL_MS,
    private readonly staleMaxMs = InMemoryPriceCache.DEFAULT_STALE_MAX_MS,
    private readonly maxEntries = InMemoryPriceCache.DEFAULT_MAX_ENTRIES,
  ) {}

  // get(), set(), getStale(), getStats(), getOrFetch() ...
}
```

### classifyPriceAge 함수

```typescript
// packages/daemon/src/infrastructure/oracle/price-age.ts
import { z } from 'zod';

export const PRICE_AGES = ['FRESH', 'AGING', 'STALE'] as const;
export type PriceAge = (typeof PRICE_AGES)[number];
export const PriceAgeEnum = z.enum(PRICE_AGES);

export const PRICE_AGE_THRESHOLDS = {
  FRESH_MAX_MS: 5 * 60 * 1000,    // 5분 -- PriceCache TTL과 일치
  AGING_MAX_MS: 30 * 60 * 1000,   // 30분 -- PriceCache staleMaxAge와 일치
} as const;

/**
 * Classify the age of a price observation.
 *
 * @param fetchedAt - Unix timestamp (ms) when price was fetched
 * @param now - Current time (ms). Defaults to Date.now(). Inject for testing.
 * @returns PriceAge discriminant
 */
export function classifyPriceAge(fetchedAt: number, now?: number): PriceAge {
  const currentTime = now ?? Date.now();
  const ageMs = currentTime - fetchedAt;

  if (ageMs < PRICE_AGE_THRESHOLDS.FRESH_MAX_MS) return 'FRESH';
  if (ageMs < PRICE_AGE_THRESHOLDS.AGING_MAX_MS) return 'AGING';
  return 'STALE';
}
```

### 캐시 키 생성 유틸리티

```typescript
// packages/daemon/src/infrastructure/oracle/price-cache.ts (내부 함수)

/**
 * Build a normalized cache key for a token.
 * EVM addresses are lowercased for consistency with CoinGecko responses.
 */
export function buildCacheKey(chain: string, address: string): string {
  // EVM addresses: lowercase normalize
  const normalizedAddress = chain === 'ethereum'
    ? address.toLowerCase()
    : address;
  return `${chain}:${normalizedAddress}`;
}
```

## State of the Art

| Old Approach (설계 문서 61 현재) | v1.5 Target | When Changed | Impact |
|--------------------------------|-------------|--------------|--------|
| CoinGecko Primary + Pyth/Chainlink Fallback 3단계 | Pyth Primary + CoinGecko Fallback 2단계 | v1.5 결정 | Chainlink 구현체/매핑 테이블 전체 제거. Pyth가 체인 무관 380+ 피드로 Primary 승격 |
| MCP Tool 16개 상한 (기존 6개 + Action 10개) | 상한 없음, mcpExpose 플래그로 제어 | v1.5 결정 | McpToolLimitExceededError 제거, MCP_TOOL_MAX 상수 제거 |
| 기존 MCP 내장 도구 6개 | 현행 14개 | v1.3~v1.4.7 구현 완료 | doc 62/38의 "기존 6개" 참조를 "기존 14개"로 현행화 |
| OracleChain 교차 검증 편차 임계값 10% | 5% (v1.5 목표 문서) | v1.5 결정 | 교차 검증 조건: CoinGecko 키 설정 시에만 활성화, 편차>5%->STALE 격하 |
| PriceInfoSchema.source: 5가지 | 3가지 (pyth/coingecko/cache) | v1.5 결정 | chainlink/jupiter 소스 제거 |
| PriceCache maxEntries: 1,000 | 128 | v1.5 목표 문서 | LRU 128항목 상한으로 축소 |

**Deprecated/outdated:**
- **Chainlink Oracle**: v1.5에서 완전 제거. EVM 전용으로 커버리지 편향, Aggregator 주소 매핑 유지 부담
- **MCP 16개 상한**: MCP 프로토콜에 도구 수 제한 없음. mcpExpose 플래그로 충분히 제어 가능
- **PriceCache maxEntries 1000**: v1.5 목표 문서에서 128로 축소

## Codebase-Specific Findings

### 설계 문서 수정 대상 정확한 위치

| 문서 | 파일 경로 | 주요 수정 포인트 |
|------|----------|-----------------|
| doc 61 | `/Users/minho.yoo/dev/wallet/WAIaaS/docs/61-price-oracle-spec.md` | (1) 섹션 1.2 요구사항 매핑 (2) 섹션 1.5 아키텍처 다이어그램 (3) 섹션 2.2 PriceInfoSchema source enum (4) 섹션 2.4 IPriceOracle 주석 (5) 섹션 3.1 CoinGeckoOracle 역할 변경 (6) 섹션 3.2 PythOracle 역할 승격 (7) 섹션 3.3 ChainlinkOracle 전체 제거 (8) 섹션 3.4 구현체 비교표 (9) 섹션 3.5 기본 조합 권장 (10) 섹션 3.6 OracleChain 의사코드 교차 검증 편차 10%->5% (11) 섹션 4.3 maxEntries 1000->128 (12) 섹션 5.1 3단계→2단계 fallback 경로 |
| doc 62 | `/Users/minho.yoo/dev/wallet/WAIaaS/docs/62-action-provider-architecture.md` | (1) 섹션 1.3 원칙 #4 "기존 6개 + Action 최대 10개 = 16개 상한" 제거 (2) 섹션 2.5 에러 타입에서 MCP_TOOL_LIMIT_EXCEEDED 제거 (3) McpToolLimitExceededError 클래스 제거 (4) ActionProviderRegistry의 MCP_TOOL_MAX/MCP_BUILTIN_TOOLS 상수 및 상한 검사 제거 (5) 섹션 9 테스트 시나리오 6 제거 (6) 에러 코드 표에서 MCP_TOOL_LIMIT_EXCEEDED 행 제거 (7) 부록 C.3 전체 제거 (8) "기존 6개" → "기존 14개" 현행화 |
| doc 38 | `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/38-sdk-mcp-interface.md` | (1) MCP_TOOL_MAX=16 상수/의사코드 제거 (2) BUILT_IN_TOOL_COUNT=6 → 14로 현행화 (3) MCP Tool 현황 표 "최대 16" 행 제거 (4) 변환 프로세스 의사코드에서 MCP_TOOL_MAX 검사 분기 제거 (5) 기존 내장 Tool 목록 14개로 갱신 |

### 현행 MCP 14개 도구 목록 (doc 62/38 현행화용)

| # | 도구명 | 파일 | 설명 |
|---|--------|------|------|
| 1 | send_token | send-token.ts | 네이티브/토큰 전송 |
| 2 | get_balance | get-balance.ts | 잔액 조회 |
| 3 | get_address | get-address.ts | 주소 조회 |
| 4 | get_assets | get-assets.ts | 보유 자산 목록 |
| 5 | list_transactions | list-transactions.ts | 거래 이력 |
| 6 | get_transaction | get-transaction.ts | 거래 상세 |
| 7 | get_nonce | get-nonce.ts | EVM nonce |
| 8 | call_contract | call-contract.ts | 컨트랙트 호출 |
| 9 | approve_token | approve-token.ts | 토큰 승인 |
| 10 | send_batch | send-batch.ts | 배치 트랜잭션 |
| 11 | get_wallet_info | get-wallet-info.ts | 월렛 정보 |
| 12 | encode_calldata | encode-calldata.ts | ABI 인코딩 |
| 13 | sign_transaction | sign-transaction.ts | 트랜잭션 서명 |
| 14 | set_default_network | set-default-network.ts | 기본 네트워크 설정 |

### 기존 코드베이스 패턴 참조

| 패턴 | 기존 예시 | Phase 125 적용 |
|------|----------|---------------|
| Zod SSoT 인터페이스 | `packages/core/src/interfaces/chain-adapter.types.ts` | `price-oracle.types.ts`에 동일 패턴 적용 |
| 인터페이스 export | `packages/core/src/interfaces/index.ts` | IPriceOracle 타입 export 추가 |
| core index export | `packages/core/src/index.ts` | TokenRef, PriceInfo, CacheStats, IPriceOracle 타입 export 추가 |
| infrastructure 모듈 | `packages/daemon/src/infrastructure/token-registry/` | `oracle/` 디렉토리 동일 구조 |
| enum 정의 | `packages/core/src/enums/policy.ts` | PriceAge enum을 `price-oracle.types.ts` 또는 별도 파일에 정의 |
| 테스트 파일 | `packages/daemon/src/__tests__/token-registry.test.ts` | `price-cache.test.ts`, `price-age.test.ts` |

### Pyth Hermes API 조사 결과 (HIGH confidence)

| 항목 | 값 |
|------|------|
| **가격 조회 엔드포인트** | `GET https://hermes.pyth.network/v2/updates/price/latest?ids[]={feedId}&parsed=true` |
| **피드 목록 엔드포인트** | `GET https://hermes.pyth.network/v2/price_feeds?query={symbol}&asset_type=crypto` |
| **인증** | 없음 (공개 인스턴스) |
| **응답 구조** | `{ parsed: [{ id, price: { price, conf, expo, publish_time }, ema_price, metadata }] }` |
| **가격 변환** | `usdPrice = Number(price) * 10^expo` (예: price=8948367590, expo=-8 → $89.48) |
| **confidence** | `confUsd = Number(conf) * 10^expo`, confidence ratio = `1 - (confUsd / usdPrice)` |
| **배치 조회** | `?ids[]={id1}&ids[]={id2}` 형식으로 다수 피드 동시 조회 가능 |
| **피드 ID 구조** | bytes32 hex 문자열 (0x 접두어 없이 64자 hex) |
| **피드 검색** | `/v2/price_feeds` API의 `query` 파라미터로 심볼 기반 검색 가능 |
| **토큰 주소 매핑** | Pyth API에 토큰 주소→피드 ID 자동 매핑 없음. 하드코딩 맵 또는 `/v2/price_feeds` 검색 필요 |

**검증:** `GET /v2/updates/price/latest?ids[]=ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d&parsed=true`로 SOL/USD 가격을 실제 조회하여 응답 구조 확인 완료.

## Open Questions

1. **PriceAge 정의 위치**
   - What we know: FRESH/AGING/STALE 3단계는 classifyPriceAge 함수와 함께 daemon 패키지에서 사용. 다만 PriceAge 타입은 IPriceOracle 소비자(정책 엔진 등)도 참조할 수 있음
   - What's unclear: PriceAge를 core 패키지에 배치할지 daemon 패키지에 배치할지
   - Recommendation: **daemon 패키지 (`infrastructure/oracle/price-age.ts`)에 배치.** Phase 125에서 PriceAge를 소비하는 코드는 모두 daemon 내부(pipeline, policy engine). core에 추가하는 것은 후속 페이즈에서 필요 시 승격

2. **IPriceOracle의 ChainType 범위**
   - What we know: 현재 ChainType은 `'solana' | 'ethereum'`. TokenRef.chain과 getNativePrice의 chain 파라미터가 이를 사용
   - What's unclear: v1.4.6에서 추가된 멀티체인 EVM 네트워크(Polygon, Arbitrum 등)에서 가격 조회 시 chain이 여전히 'ethereum'인지, 네트워크별로 구분해야 하는지
   - Recommendation: **chain='ethereum'으로 통일.** Pyth/CoinGecko 가격은 체인 무관(ETH는 어느 체인에서나 동일 가격). EVM 토큰의 경우 contract address가 체인마다 다를 수 있지만, 가격 오라클 관점에서는 동일 토큰이면 동일 가격

3. **doc 38 수정 범위 vs 위치**
   - What we know: doc 38은 `docs/` 디렉토리가 아닌 `.planning/deliverables/38-sdk-mcp-interface.md`에 위치
   - What's unclear: 이 파일이 여전히 참조 문서로 유효한지, 혹은 이미 구현 완료로 아카이브 상태인지
   - Recommendation: **그대로 수정.** 목표 문서가 명시적으로 doc 38 수정을 요구하므로, 현재 위치에서 수정

## Sources

### Primary (HIGH confidence)
- 코드베이스 직접 조사: `packages/core/src/interfaces/`, `packages/daemon/src/infrastructure/`, `packages/mcp/src/server.ts` -- 현행 아키텍처 패턴 확인
- 설계 문서 61 (`docs/61-price-oracle-spec.md`) -- IPriceOracle 인터페이스, PriceCache, OracleChain 전체 설계
- 설계 문서 62 (`docs/62-action-provider-architecture.md`) -- MCP Tool 상한 관련 섹션 정확한 위치 확인
- 설계 문서 38 (`.planning/deliverables/38-sdk-mcp-interface.md`) -- MCP Tool 현황 표, BUILT_IN_TOOL_COUNT 위치 확인
- v1.5 목표 문서 (`objectives/v1.5-defi-price-oracle.md`) -- 요구사항, 결정 사항, 선행 수정 대상

### Secondary (MEDIUM confidence)
- Pyth Hermes API 실제 호출 검증: `GET /v2/updates/price/latest` 응답 구조 확인 -- [Pyth API Reference](https://docs.pyth.network/price-feeds/core/api-reference)
- Pyth `/v2/price_feeds` 검색 API: `query=SOL&asset_type=crypto`로 피드 목록 조회 -- [Pyth Price Feeds](https://docs.pyth.network/price-feeds/core/price-feeds)
- Pyth Hermes 아키텍처: [Hermes Documentation](https://docs.pyth.network/price-feeds/core/how-pyth-works/hermes)

### Tertiary (LOW confidence)
- 없음. 모든 주요 결정은 코드베이스와 설계 문서에서 직접 검증됨

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 외부 의존성 없음, 기존 코드베이스 패턴 100% 재사용
- Architecture: HIGH - 설계 문서 61이 상세한 의사코드 제공, 기존 infrastructure/ 패턴 확인 완료
- Pitfalls: HIGH - 설계 문서 61 자체가 isStale 혼동을 경고, EVM 주소 정규화 명시

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (안정적 -- 내부 코드베이스 기반, 외부 API 변동 영향 최소)
