# v0.6 확장 기능 테스트 전략 (CHAIN-EXT-09)

**문서 ID:** CHAIN-EXT-09
**작성일:** 2026-02-08
**상태:** 완료
**Phase:** 25 (테스트 전략 통합 + 기존 문서 반영)
**참조:** 41-test-levels-matrix-coverage.md (TLVL), 42-mock-boundaries-interfaces-contracts.md (MOCK), 48-blockchain-test-environment-strategy.md (CHAIN), 56~63 (CHAIN-EXT-01~08)
**요구사항:** TEST-01 (Mock 경계 확장), TEST-02 (EVM 로컬 테스트 환경), TEST-03 (커버리지 재설정)

---

## 목차

1. [개요](#1-개요)
2. [Mock 경계 확장 (TEST-01)](#2-mock-경계-확장-test-01)
3. [Contract Test 확장](#3-contract-test-확장)
4. [EVM 로컬 테스트 환경 (TEST-02)](#4-evm-로컬-테스트-환경-test-02)
5. [커버리지 재설정 (TEST-03)](#5-커버리지-재설정-test-03)
6. [테스트 시나리오 통합](#6-테스트-시나리오-통합)
7. [보안 시나리오 통합](#7-보안-시나리오-통합)
8. [부록](#8-부록)

---

## 1. 개요

### 1.1 v0.4 테스트 프레임워크 요약

v0.4(Phase 14-18)에서 확정한 테스트 프레임워크의 핵심 구성:

| 항목 | v0.4 기준 | 참조 |
|------|----------|------|
| 테스트 레벨 | 6개 (Unit, Integration, E2E, Chain Integration, Security, Platform) | 41-test-levels-matrix-coverage.md 섹션 1 |
| 모듈 매트릭스 | 9개 모듈 (7 패키지 + Python SDK + Desktop App) | 41-test-levels 섹션 2 |
| Mock 경계 | 5개 외부 의존성 (블록체인 RPC, 알림 채널, 파일시스템, 시간, Owner 서명) | 42-mock-boundaries 섹션 2 |
| Contract Test | 5개 인터페이스 (IChainAdapter, IPolicyEngine, INotificationChannel, IClock, IOwnerSigner) | 42-mock-boundaries 섹션 5 |
| 커버리지 Tier | 4단계 (Critical 90%+, High 80%+, Normal 70%+, Low 50%+) | 41-test-levels 섹션 3 |
| 블록체인 환경 | Solana 3단계 (Mock RPC / Local Validator / Devnet), EVM Stub only | 48-blockchain-test-environment 전체 |
| 인프라 | Jest 30 + @swc/jest, jest-mock-extended 4.x, v8 coverage | 41-test-levels 섹션 1.5 |

### 1.2 v0.6 확장 범위

Phase 22-24에서 8개 CHAIN-EXT 기능이 추가되면서 테스트 프레임워크 확장이 필요하다:

| 구분 | v0.4 | v0.6 확장 | 변경 |
|------|------|----------|------|
| Mock 경계 | 5개 | +5개 = **10개** | Aggregator, 가격 API, 온체인 오라클, IPriceOracle, IActionProvider |
| Contract Test 인터페이스 | 5개 | +2개 = **7개** | IPriceOracle, IActionProvider |
| 모듈 매트릭스 | 9개 | +2개 = **11개** | @waiaas/actions, @waiaas/oracle (daemon 서브모듈) |
| 블록체인 환경 | Solana 3단계 + EVM Stub | Solana 확장 (SPL/배치) + **EVM Hardhat** | EVM Stub -> 실제 빌드 로직 |
| 테스트 시나리오 | v0.4 기준 | **+~148개** (Phase 22-24 소스) | 도메인별 통합 분류 |
| 보안 시나리오 | 71건 (v0.4) | **+~56건** = **~127건** | v0.6 고유 위협 영역 |

### 1.3 이 문서의 역할

이 문서는 다음 3가지 역할을 수행한다:

1. **v0.4 42-mock-boundaries 확장:** 5개 -> 10개 Mock 경계, 5개 -> 7개 Contract Test
2. **v0.6 전용 테스트 시나리오 통합:** Phase 22-24의 8개 소스 문서에서 테스트 시나리오를 취합하여 통일된 번호 체계로 재분류
3. **커버리지 재설정:** EVM Stub에서 실제 빌드 로직 전환에 따른 커버리지 목표 갱신, 신규 모듈(@waiaas/actions, oracle) 커버리지 설정

**참조 관계:**

```
┌───────────────────────────────────────────────────────────┐
│ 64-extension-test-strategy.md (이 문서)                     │
│ v0.6 확장 기능 테스트 전략 (CHAIN-EXT-09)                    │
└───────┬──────────────┬──────────────┬─────────────────────┘
        │              │              │
   확장 ▼         참조 ▼         취합 ▼
┌──────────┐  ┌──────────┐  ┌──────────────┐
│ 42-mock  │  │ 41-test  │  │ 56~63        │
│ 5 -> 10  │  │ levels   │  │ CHAIN-EXT    │
│ 경계     │  │ matrix   │  │ 01~08        │
└──────────┘  └──────────┘  └──────────────┘
        │                          │
   확장 ▼                    참조 ▼
┌──────────┐            ┌──────────────┐
│ 48-block │            │ 43~47 v0.4   │
│ chain    │            │ 보안 71건     │
│ env      │            │              │
└──────────┘            └──────────────┘
```

---

## 2. Mock 경계 확장 (TEST-01)

### 2.1 v0.4 기존 Mock 경계 (5개)

42-mock-boundaries 섹션 2에서 정의한 5개 외부 의존성:

| # | Mock 대상 | Mock 방식 | 소스 문서 |
|---|----------|----------|----------|
| M1 | 블록체인 RPC | MockChainAdapter (canned responses) | 42-mock-boundaries 3.1 |
| M2 | 알림 채널 | MockNotificationChannel | 42-mock-boundaries 3.3 |
| M3 | 파일시스템 | memfs (Unit) / tmpdir (Integration) | 42-mock-boundaries 2.2 |
| M4 | 시간 (IClock) | FakeClock (DI) | 42-mock-boundaries 4.1 |
| M5 | Owner 서명 | FakeOwnerSigner (DI) | 42-mock-boundaries 4.2 |

### 2.2 v0.6 신규 Mock 경계 (5개)

Phase 22-24에서 도입된 외부 의존성에 대한 5개 신규 Mock을 추가한다.

#### M6: Aggregator (Jupiter API)

| 항목 | 내용 |
|------|------|
| **Mock 대상** | Jupiter Quote API (`GET /swap/v1/quote`), Swap Instructions API (`POST /swap/v1/swap-instructions`) |
| **Mock 방식** | msw 2.x `setupServer()` -- HTTP 인터셉터 |
| **사용 레벨** | Unit (resolve 로직), Integration (파이프라인 통합) |
| **소스 문서** | 63-swap-action-spec.md 섹션 9.2 |

```typescript
// packages/actions/test/fixtures/jupiter-mock.ts
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

export const jupiterMockServer = setupServer(
  // Quote API Mock
  http.get('https://api.jup.ag/swap/v1/quote', ({ request }) => {
    const url = new URL(request.url)
    const amount = url.searchParams.get('amount')

    return HttpResponse.json({
      inputMint: url.searchParams.get('inputMint'),
      outputMint: url.searchParams.get('outputMint'),
      inAmount: amount,
      outAmount: String(BigInt(amount!) * 150n),
      priceImpactPct: '0.12',
      routePlan: [{ swapInfo: { ammKey: 'MockAMM', label: 'Raydium' }, percent: 100 }],
    })
  }),

  // /swap-instructions Mock
  http.post('https://api.jup.ag/swap/v1/swap-instructions', () => {
    return HttpResponse.json({
      swapInstruction: {
        programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
        data: 'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
        accounts: [
          { pubkey: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', isSigner: false, isWritable: false },
          { pubkey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', isSigner: false, isWritable: false },
        ],
      },
      computeBudgetInstructions: [],
      setupInstructions: [],
      cleanupInstruction: null,
      addressLookupTableAddresses: [],
    })
  }),
)

// 에러 시뮬레이션 헬퍼
export function mockJupiterQuoteError(status: number, message: string): void {
  jupiterMockServer.use(
    http.get('https://api.jup.ag/swap/v1/quote', () => {
      return HttpResponse.json({ error: message }, { status })
    }),
  )
}

export function mockJupiterQuoteTimeout(delayMs: number): void {
  jupiterMockServer.use(
    http.get('https://api.jup.ag/swap/v1/quote', async () => {
      await new Promise(r => setTimeout(r, delayMs))
      return HttpResponse.json({})
    }),
  )
}
```

**에러 시뮬레이션 시나리오:**
- 429 Too Many Requests (rate limit)
- 500 Internal Server Error
- 응답 지연 (타임아웃)
- 악의적 programId 반환 (보안 시나리오 4)
- outAmount = 0 (유동성 부족)

#### M7: 가격 API (CoinGecko / Pyth HTTP / Chainlink HTTP)

| 항목 | 내용 |
|------|------|
| **Mock 대상** | CoinGecko `/simple/price`, `/simple/token_price/{platform}`, Pyth Hermes HTTP API, Chainlink HTTP API |
| **Mock 방식** | msw 2.x `setupServer()` -- HTTP 인터셉터 |
| **사용 레벨** | Unit (가격 파싱), Integration (OracleChain fallback) |
| **소스 문서** | 61-price-oracle-spec.md 섹션 8.4 |

```typescript
// packages/daemon/test/fixtures/price-api-mock.ts
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

export const priceApiMockServer = setupServer(
  // CoinGecko 네이티브 가격
  http.get('https://api.coingecko.com/api/v3/simple/price', () => {
    return HttpResponse.json({
      solana: { usd: 150.25, last_updated_at: 1707350400 },
      ethereum: { usd: 2850.50, last_updated_at: 1707350400 },
    })
  }),

  // CoinGecko 토큰 가격
  http.get('https://api.coingecko.com/api/v3/simple/token_price/:platformId', () => {
    return HttpResponse.json({
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { usd: 1.0001 },
    })
  }),
)

// 에러 시뮬레이션 헬퍼
export function mockCoinGeckoRateLimit(): void {
  priceApiMockServer.use(
    http.get('https://api.coingecko.com/api/v3/simple/*', () => {
      return HttpResponse.json(
        { status: { error_code: 429, error_message: 'Too Many Requests' } },
        { status: 429 },
      )
    }),
  )
}

export function mockCoinGeckoServerError(): void {
  priceApiMockServer.use(
    http.get('https://api.coingecko.com/api/v3/simple/*', () => {
      return HttpResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }),
  )
}
```

**에러 시뮬레이션 시나리오:**
- 429 Rate Limit (CoinGecko Demo: 30 calls/min)
- 500 Internal Server Error
- 잘못된 JSON 응답 (파싱 실패)
- 빈 응답 (토큰 미등록)
- 극단적 가격값 (BTC $100,000+, 밈코인 $0.000001)

#### M8: 온체인 오라클 (Pyth on-chain / Chainlink on-chain)

| 항목 | 내용 |
|------|------|
| **Mock 대상** | Pyth 가격 피드 계정 (Solana), Chainlink AggregatorV3 (EVM) |
| **Mock 방식** | Bankrun (Solana) -- 가격 피드 계정 Mock, Hardhat (EVM) -- AggregatorV3 Mock 배포 |
| **사용 레벨** | Chain Integration (Level 3, nightly/릴리스) |
| **소스 문서** | 61-price-oracle-spec.md 섹션 8.2 |

```typescript
// Solana: Bankrun에서 Pyth 가격 피드 계정 Mock
// Pyth 가격 피드 계정의 바이너리 레이아웃을 직접 생성
const mockPythPriceFeed = {
  magic: 0xa1b2c3d4,
  price: 15025000000n,      // $150.25 (exponent -8)
  conf: 1000000n,            // $0.01 신뢰 구간
  expo: -8,
  status: 1,                 // Trading
  publishTime: Date.now() / 1000,
}

// EVM: Hardhat에서 Chainlink AggregatorV3 Mock 배포
// MockV3Aggregator.sol 사용 (Chainlink 공식 Mock 컨트랙트)
```

**주의:** 온체인 오라클 Mock은 Level 3 (Chain Mock) 전용이다. Unit/Integration에서는 M7(HTTP API Mock) 또는 M9(IPriceOracle Mock)를 사용한다.

#### M9: IPriceOracle

| 항목 | 내용 |
|------|------|
| **Mock 대상** | IPriceOracle 인터페이스 (4개 메서드) |
| **Mock 방식** | MockPriceOracle 클래스 (DI 주입) |
| **사용 레벨** | Unit (정책 평가, USD 변환), Integration (파이프라인 통합) |
| **소스 문서** | 61-price-oracle-spec.md 섹션 8.2 |

```typescript
// packages/daemon/src/testing/MockPriceOracle.ts (또는 core/testing/)
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

  /** 전체 실패 모드 -- 모든 getPrice/getNativePrice가 PriceNotAvailableError throw */
  setFailMode(fail: boolean): void {
    this.shouldFail = fail
  }

  /** stale 반환 모드 -- isStale=true인 PriceInfo 반환 */
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

**제어 메서드 요약:**
- `setPrice(key, usd)`: 특정 토큰 가격 설정
- `setNativePrice(chain, usd)`: 네이티브 토큰 가격 설정
- `setFailMode(true)`: 모든 호출에서 PriceNotAvailableError throw
- `setStaleMode(true)`: isStale=true 반환 (stale 정책 상향 테스트)

#### M10: IActionProvider

| 항목 | 내용 |
|------|------|
| **Mock 대상** | IActionProvider 인터페이스 (metadata, actions, resolve) |
| **Mock 방식** | mockProvider 객체 (고정 resolve 반환) |
| **사용 레벨** | Unit (Registry, MCP 변환), Integration (resolve -> 파이프라인) |
| **소스 문서** | 62-action-provider-architecture.md 섹션 9.2 |

```typescript
// packages/actions/test/fixtures/mock-provider.ts
import { z } from 'zod'
import type { IActionProvider, ActionContext, ContractCallRequest } from '@waiaas/core'

export const mockProvider: IActionProvider = {
  metadata: {
    name: 'mock_provider',
    description: 'Mock provider for testing',
    version: '1.0.0',
    chains: ['solana'],
    mcpExpose: false,
  },
  actions: [{
    name: 'mock_action',
    description: 'Mock action for testing purposes',
    chain: 'solana',
    inputSchema: z.object({ amount: z.string() }),
    riskLevel: 'low',
    defaultTier: 'INSTANT',
  }],
  resolve: async (actionName: string, params: unknown, context: ActionContext): Promise<ContractCallRequest> => ({
    from: context.walletAddress,
    to: 'MockProgram111111111111111111111111111111111',
    programId: 'MockProgram111111111111111111111111111111111',
    instructionData: 'AAAA',
    accounts: [{ address: context.walletAddress, isSigner: true, isWritable: true }],
  }),
}

// 악성 프로바이더 팩토리 (보안 테스트용)
export function createMaliciousProvider(overrides: Partial<IActionProvider>): IActionProvider {
  return {
    ...mockProvider,
    metadata: { ...mockProvider.metadata, name: 'malicious_provider' },
    ...overrides,
  }
}

// 설정 가능한 Mock 프로바이더 팩토리
export function createMockProvider(
  actionName: string,
  options?: { providerName?: string; mcpExpose?: boolean },
): IActionProvider {
  return {
    metadata: {
      name: options?.providerName ?? `provider_${actionName}`,
      description: `Mock provider for ${actionName}`,
      version: '1.0.0',
      chains: ['solana'],
      mcpExpose: options?.mcpExpose ?? false,
    },
    actions: [{
      name: actionName,
      description: `Mock action ${actionName}`,
      chain: 'solana',
      inputSchema: z.object({}),
      riskLevel: 'low',
      defaultTier: 'INSTANT',
    }],
    resolve: mockProvider.resolve,
  }
}
```

**validate-then-trust 경계:**
- resolve()가 반환하는 ContractCallRequest는 Registry의 `validateResolveResult()`에서 검증한다.
- Mock Provider에서 반환하는 값도 동일한 검증을 거친다.
- 보안 테스트에서는 `createMaliciousProvider()`로 검증 경계를 의도적으로 위반하는 반환값을 생성한다.

### 2.3 Mock 경계 10x6 매트릭스

기존 5개(M1~M5) + 신규 5개(M6~M10)의 6개 테스트 레벨별 Mock 방식 통합 매트릭스:

| Mock 경계 | Unit | Integration | E2E | Chain Integration | Security | Platform |
|-----------|------|-------------|-----|-------------------|----------|----------|
| **M1: 블록체인 RPC** | MockChainAdapter (canned) | MockChainAdapter (canned) | MockChainAdapter (시나리오) | 실제 Devnet/Testnet | MockChainAdapter | 환경별 |
| **M2: 알림 채널** | MockNotificationChannel | MockNotificationChannel | MockNotificationChannel | MockNotificationChannel | MockNotificationChannel | MockNotificationChannel |
| **M3: 파일시스템** | memfs | tmpdir (실제 FS) | tmpdir (실제 FS) | tmpdir (실제 FS) | memfs | 실제 FS |
| **M4: 시간 (IClock)** | FakeClock (DI) | FakeClock/RealClock | RealClock | RealClock | FakeClock (DI) | RealClock |
| **M5: Owner 서명** | FakeOwnerSigner | FakeOwnerSigner | FakeOwnerSigner | 실제 지갑 (수동) | FakeOwnerSigner | FakeOwnerSigner |
| **M6: Aggregator (Jupiter)** | msw MockServer | msw MockServer | msw MockServer | 실제 Jupiter API | msw MockServer | 환경별 |
| **M7: 가격 API (CoinGecko 등)** | msw MockServer | msw MockServer | msw MockServer | 실제 CoinGecko | msw MockServer | 환경별 |
| **M8: 온체인 오라클** | N/A (M9 사용) | N/A (M9 사용) | N/A (M9 사용) | Bankrun/Hardhat Mock 계정 | N/A (M9 사용) | N/A |
| **M9: IPriceOracle** | MockPriceOracle (DI) | MockPriceOracle (DI) | MockPriceOracle (DI) | 실제 OracleChain | MockPriceOracle (DI) | MockPriceOracle |
| **M10: IActionProvider** | mockProvider (DI) | mockProvider (DI) | mockProvider (DI) | 실제 JupiterSwapActionProvider | mockProvider (DI) | mockProvider |

### 2.4 셀별 근거 (신규 Mock)

#### M6: Aggregator (Jupiter API)

| 레벨 | Mock 방식 | 근거 |
|------|----------|------|
| Unit/Integration/E2E | msw MockServer | Jupiter API 호출 없이 resolve() 로직 검증. Quote 응답 제어로 priceImpact 검증, 에러 시나리오 재현 |
| Chain Integration | 실제 Jupiter API | Solana Devnet에서 실제 토큰 스왑 호출. Jupiter Quote/Swap의 네트워크 호환성 검증 |
| Security | msw MockServer | 악의적 programId, outAmount=0, rate limit 등 공격/장애 시나리오 재현 |

#### M7: 가격 API

| 레벨 | Mock 방식 | 근거 |
|------|----------|------|
| Unit/Integration/E2E | msw MockServer | CoinGecko HTTP 호출 없이 가격 파싱/에러 매핑 검증. 429/500 에러 시뮬레이션 |
| Chain Integration | 실제 CoinGecko | 실제 API 응답 형식 호환성 검증 (nightly/릴리스, rate limit 주의) |
| Security | msw MockServer | 가격 조작(급변동), stale 데이터, rate limit 도달 시나리오 재현 |

#### M8: 온체인 오라클

| 레벨 | Mock 방식 | 근거 |
|------|----------|------|
| Unit~Security | N/A (M9 사용) | 온체인 오라클 계정은 Chain Integration에서만 의미. Unit~Security에서는 IPriceOracle(M9) Mock으로 대체 |
| Chain Integration | Bankrun/Hardhat | Bankrun: Pyth 가격 피드 계정 바이너리 생성. Hardhat: MockV3Aggregator.sol 배포 |

#### M9: IPriceOracle

| 레벨 | Mock 방식 | 근거 |
|------|----------|------|
| Unit | MockPriceOracle (DI) | resolveEffectiveAmountUsd(), evaluateSpendingLimitUsd() 등 정책 평가 로직 검증. 고정 가격 반환 |
| Integration | MockPriceOracle (DI) | 파이프라인 Stage 3에서 USD 기준 정책 평가 통합 검증. DB + Mock 오라클 조합 |
| Chain Integration | 실제 OracleChain | CoinGecko -> Pyth -> Chainlink fallback 체인 동작, stale 캐시, 교차 검증 |
| Security | MockPriceOracle (DI) | setFailMode/setStaleMode로 장애 시나리오, 가격 급변동 시 보수적 티어 상향 검증 |

#### M10: IActionProvider

| 레벨 | Mock 방식 | 근거 |
|------|----------|------|
| Unit | mockProvider (DI) | Registry register/getAction/executeResolve 로직 검증. validate-then-trust 경계 확인 |
| Integration | mockProvider (DI) | resolve() -> ContractCallRequest -> 파이프라인 Stage 1~5 통합 흐름 검증 |
| Chain Integration | 실제 JupiterSwapActionProvider | Devnet에서 실제 Jupiter Quote -> Swap Instructions -> 파이프라인 전체 흐름 |
| Security | createMaliciousProvider | 악성 resolve 반환값(타 지갑 from, 직렬화 트랜잭션, 체인 불일치) 방어 검증 |

---

## 3. Contract Test 확장

### 3.1 v0.4 Contract Test (5개 인터페이스)

42-mock-boundaries 섹션 5에서 정의한 5개 인터페이스 Contract Test:

| # | 인터페이스 | Mock 구현 | 실제 구현 | 테스트 스위트 |
|---|-----------|----------|----------|-------------|
| C1 | IChainAdapter | MockChainAdapter | SolanaAdapter, EvmAdapterStub | chainAdapterContractTests() |
| C2 | IPolicyEngine | MockPolicyEngine | DatabasePolicyEngine | policyEngineContractTests() |
| C3 | INotificationChannel | MockNotificationChannel | (전 레벨 Mock) | notificationChannelContractTests() |
| C4 | IClock | FakeClock | RealClock | clockContractTests() |
| C5 | IOwnerSigner | FakeOwnerSigner | (FakeOwnerSigner만) | ownerSignerContractTests() |

### 3.2 v0.6 신규 Contract Test (2개 인터페이스)

#### C6: IPriceOracle Contract Test

**인터페이스:** 4개 메서드 (getPrice, getPrices, getNativePrice, getCacheStats)
**참조:** 61-price-oracle-spec.md 섹션 3

```typescript
// packages/core/__tests__/contracts/price-oracle.contract.ts
import type { IPriceOracle, TokenRef, PriceInfo, CacheStats } from '../../src/interfaces/IPriceOracle'

export function priceOracleContractTests(
  factory: () => IPriceOracle | Promise<IPriceOracle>,
  options?: {
    /** 실제 네트워크 의존 테스트 건너뛰기 */
    skipNetworkTests?: boolean
    /** 테스트용 토큰 참조 (skipNetworkTests=false일 때 필수) */
    testToken?: TokenRef
    /** 테스트용 네이티브 체인 */
    testChain?: 'solana' | 'ethereum'
  }
): void
```

**테스트 케이스 구조:**

```typescript
priceOracleContractTests(factory, options?):

  describe('getPrice')
    test('유효한 토큰에 대해 PriceInfo를 반환해야 한다')
      // const price = await oracle.getPrice(testToken)
      // expect(typeof price.usdPrice).toBe('number')
      // expect(price.usdPrice).toBeGreaterThanOrEqual(0)
      // expect(typeof price.source).toBe('string')
      // expect(typeof price.fetchedAt).toBe('number')
      // expect(typeof price.expiresAt).toBe('number')
      // expect(typeof price.isStale).toBe('boolean')
    test('usdPrice는 0 이상이어야 한다')
      // expect(price.usdPrice).toBeGreaterThanOrEqual(0)
    test('expiresAt > fetchedAt 이어야 한다')
      // expect(price.expiresAt).toBeGreaterThan(price.fetchedAt)
    test('미등록 토큰에 대해 PriceNotAvailableError를 throw해야 한다')
      // await expect(oracle.getPrice(unknownToken)).rejects.toThrow()

  describe('getPrices')
    test('다수 토큰에 대해 Map을 반환해야 한다')
      // const prices = await oracle.getPrices([token1, token2])
      // expect(prices).toBeInstanceOf(Map)
    test('일부 실패해도 성공한 토큰은 Map에 포함해야 한다')
      // 미등록 + 등록 혼합 -> 등록 토큰만 Map에 존재
    test('빈 배열에 대해 빈 Map을 반환해야 한다')
      // const prices = await oracle.getPrices([])
      // expect(prices.size).toBe(0)

  describe('getNativePrice')
    test('네이티브 토큰 PriceInfo를 반환해야 한다')
      // const price = await oracle.getNativePrice('solana')
      // expect(price.usdPrice).toBeGreaterThan(0)
    test('PriceInfo 구조가 getPrice와 동일해야 한다')
      // 동일 PriceInfo 필드 존재 검증

  describe('getCacheStats')
    test('CacheStats 객체를 반환해야 한다')
      // const stats = oracle.getCacheStats()
      // expect(typeof stats.hits).toBe('number')
      // expect(typeof stats.misses).toBe('number')
      // expect(typeof stats.staleHits).toBe('number')
      // expect(typeof stats.size).toBe('number')
      // expect(typeof stats.evictions).toBe('number')
    test('모든 통계값이 0 이상이어야 한다')
      // expect(stats.hits).toBeGreaterThanOrEqual(0)
```

**실행 대상:**

| 구현체 | 실행 레벨 | skipNetworkTests | 비고 |
|--------|----------|-----------------|------|
| MockPriceOracle | Unit | true | setPrice로 고정 가격, setFailMode로 에러 시뮬레이션 |
| OracleChain (CoinGecko + Pyth) | Integration | false | msw로 HTTP Mock, 실제 fallback 로직 검증 |

#### C7: IActionProvider Contract Test

**인터페이스:** metadata (readonly), actions (readonly), resolve (async method)
**참조:** 62-action-provider-architecture.md 섹션 2

```typescript
// packages/core/__tests__/contracts/action-provider.contract.ts
import type { IActionProvider, ActionContext } from '../../src/interfaces/IActionProvider'

export function actionProviderContractTests(
  factory: () => IActionProvider | Promise<IActionProvider>,
  options?: {
    /** resolve()에 전달할 테스트 파라미터 */
    testParams?: Record<string, unknown>
    /** resolve()에 전달할 테스트 컨텍스트 */
    testContext?: ActionContext
  }
): void
```

**테스트 케이스 구조:**

```typescript
actionProviderContractTests(factory, options?):

  describe('metadata')
    test('metadata.name이 비어있지 않은 문자열이어야 한다')
      // expect(typeof provider.metadata.name).toBe('string')
      // expect(provider.metadata.name.length).toBeGreaterThan(0)
    test('metadata.version이 semver 형식이어야 한다')
      // expect(provider.metadata.version).toMatch(/^\d+\.\d+\.\d+$/)
    test('metadata.chains가 비어있지 않은 배열이어야 한다')
      // expect(Array.isArray(provider.metadata.chains)).toBe(true)
      // expect(provider.metadata.chains.length).toBeGreaterThan(0)
    test('metadata.mcpExpose가 boolean이어야 한다')
      // expect(typeof provider.metadata.mcpExpose).toBe('boolean')

  describe('actions')
    test('actions가 비어있지 않은 배열이어야 한다')
      // expect(Array.isArray(provider.actions)).toBe(true)
      // expect(provider.actions.length).toBeGreaterThan(0)
    test('각 action에 name, description, chain, inputSchema가 존재해야 한다')
      // for (const action of provider.actions) {
      //   expect(typeof action.name).toBe('string')
      //   expect(typeof action.description).toBe('string')
      //   expect(typeof action.chain).toBe('string')
      //   expect(action.inputSchema).toBeDefined()
      // }
    test('각 action의 riskLevel이 유효해야 한다')
      // expect(['low','medium','high']).toContain(action.riskLevel)
    test('각 action의 defaultTier가 유효해야 한다')
      // expect(['INSTANT','NOTIFY','DELAY','APPROVAL']).toContain(action.defaultTier)

  describe('resolve')
    test('resolve()가 ContractCallRequest를 반환해야 한다')
      // const result = await provider.resolve(actionName, testParams, testContext)
      // expect(typeof result.from).toBe('string')
      // expect(typeof result.to).toBe('string')
    test('반환된 from이 context.walletAddress와 일치해야 한다 (validate-then-trust)')
      // expect(result.from).toBe(testContext.walletAddress)
    test('반환된 ContractCallRequest가 Zod 스키마 검증을 통과해야 한다')
      // expect(() => ContractCallRequestSchema.parse(result)).not.toThrow()
    test('존재하지 않는 actionName에 대해 에러를 throw해야 한다')
      // await expect(provider.resolve('nonexistent', {}, context)).rejects.toThrow()
```

**validate-then-trust 경계 검증:**
Contract Test에서 가장 중요한 항목은 `result.from === context.walletAddress` 검증이다. 이는 악성 플러그인이 타 지갑 주소를 from으로 설정하는 공격을 방어하는 핵심 경계이다.

**실행 대상:**

| 구현체 | 실행 레벨 | 비고 |
|--------|----------|------|
| mockProvider | Unit | 고정 ContractCallRequest 반환 |
| JupiterSwapActionProvider | Unit (msw Mock) / Chain Integration (실제 API) | Jupiter API Mock/실제 |

### 3.3 Contract Test 매트릭스 (7개)

| # | 인터페이스 | Mock 구현 | 실제 구현 | Unit 실행 | Integration 실행 | Chain 실행 |
|---|-----------|----------|----------|----------|-----------------|-----------|
| C1 | IChainAdapter | MockChainAdapter | SolanaAdapter, EvmAdapter | O (Mock) | O (SolanaAdapter) | O (Devnet) |
| C2 | IPolicyEngine | MockPolicyEngine | DatabasePolicyEngine | O (Mock) | O (SQLite) | - |
| C3 | INotificationChannel | MockNotificationChannel | - | O (Mock) | - | - |
| C4 | IClock | FakeClock | RealClock | O (둘 다) | - | - |
| C5 | IOwnerSigner | FakeOwnerSigner | - | O (Mock) | - | - |
| **C6** | **IPriceOracle** | **MockPriceOracle** | **OracleChain** | **O (Mock)** | **O (msw)** | **-** |
| **C7** | **IActionProvider** | **mockProvider** | **JupiterSwapActionProvider** | **O (Mock)** | **O (msw)** | **O (Jupiter)** |

**Contract Test 파일 구조 확장:**

```
packages/core/__tests__/contracts/
  ├── chain-adapter.contract.ts           # C1 (v0.4)
  ├── policy-engine.contract.ts           # C2 (v0.4)
  ├── notification-channel.contract.ts    # C3 (v0.4)
  ├── clock.contract.ts                   # C4 (v0.4)
  ├── signer.contract.ts                  # C5 (v0.4)
  ├── price-oracle.contract.ts            # C6 (v0.6 NEW)
  ├── action-provider.contract.ts         # C7 (v0.6 NEW)
  ├── mock-price-oracle.contract.test.ts  # MockPriceOracle 검증 (v0.6 NEW)
  └── mock-action-provider.contract.test.ts # mockProvider 검증 (v0.6 NEW)
```

---

## 4. EVM 로컬 테스트 환경 (TEST-02)

### 4.1 배경

v0.4에서 EVM은 EvmAdapterStub(13개 메서드 전체 `CHAIN_NOT_SUPPORTED` throw)만 존재하여 EVM 테스트가 불필요했다. v0.6에서 다음 빌드 로직이 추가되면서 Hardhat 환경이 필수가 되었다:

- **ERC-20 buildTransaction:** `encodeFunctionData('transfer', [to, amount])` + viem `simulateContract` (56 섹션 4)
- **ERC-20 approve:** `encodeFunctionData('approve', [spender, amount])` + race condition 방지 2-step (59 섹션 3)
- **ERC-20 getAssets:** multicall `balanceOf/decimals/symbol` (57 섹션 5)
- **ERC-20 estimateFee:** `estimateGas` + `estimateFeesPerGas` (57 섹션 7)

### 4.2 Hardhat Network 인메모리 EVM 설정

```typescript
// packages/adapters/evm/hardhat.config.ts
import type { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-viem'  // viem 기반 어댑터와 일관

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      // 인메모리 EVM (별도 프로세스 불필요)
      chainId: 31337,
      gas: 'auto',
      gasPrice: 'auto',
      mining: { auto: true },  // 트랜잭션 즉시 마이닝
    },
    hardhat_fork: {
      // Ethereum Mainnet Fork 모드
      chainId: 31337,
      forking: {
        url: process.env.ALCHEMY_RPC_URL ?? 'https://eth-mainnet.g.alchemy.com/v2/demo',
        blockNumber: 19_000_000,  // 고정 블록 (결정적 테스트)
      },
    },
  },
  paths: {
    sources: './contracts',
    tests: './test/chain-integration',
    cache: './cache',
    artifacts: './artifacts',
  },
}

export default config
```

**@nomicfoundation/hardhat-viem 선택 근거:**
- WAIaaS의 EvmAdapter는 viem 기반으로 설계(36-killswitch-autostop-evm.md, 56 섹션 4)
- hardhat-viem 플러그인이 Hardhat Network와 viem 클라이언트를 브릿지
- ethers.js와의 혼용 없이 일관된 viem 타입 사용

### 4.3 TestERC20.sol 배포 시나리오

```solidity
// packages/adapters/evm/contracts/TestERC20.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * 테스트용 ERC-20 토큰.
 * - decimals 설정 가능 (6 또는 18)
 * - mint 함수 공개 (테스트 계정에 자유 발행)
 * - 표준 transfer/approve/transferFrom 동작
 */
contract TestERC20 is ERC20 {
    uint8 private _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

**배포 시나리오:**

| # | 토큰 | decimals | 용도 | 참조 시나리오 |
|---|------|----------|------|-------------|
| 1 | TestUSDC | 6 | ERC-20 표준 전송/조회/수수료 | ET-TOKEN-01~08 (57 섹션 8.4) |
| 2 | TestWETH | 18 | 18 decimals 정밀도 검증 | SEC-TOKEN-06 (decimals 불일치) |
| 3 | NonStandardERC20 | 6 | bool 미반환 토큰 (USDT 패턴) | ET-TOKEN-02 (비표준) |

### 4.4 Fork 모드: Uniswap V3 시나리오

Ethereum Mainnet fork를 사용하여 실제 Uniswap V3 컨트랙트와 상호작용한다:

| # | 시나리오 | Uniswap 컨트랙트 | 검증 |
|---|---------|----------------|------|
| 1 | ERC-20 approve + swap | SwapRouter02 (0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45) | approve -> router.exactInputSingle |
| 2 | approve allowance 확인 | ERC-20.allowance() | approve 후 allowance == amount |
| 3 | 2-step approve (race condition 방지) | ERC-20.approve(router, 0) -> ERC-20.approve(router, new) | 59 섹션 3.3, C1~C2 from approve spec |

**fork 모드 사용 시 주의:**
- `ALCHEMY_RPC_URL` 환경변수 필수 (CI에서 secret으로 관리)
- `blockNumber` 고정으로 결정적 테스트 보장
- fork 모드 테스트는 nightly/릴리스에서만 실행 (CI 시간 소요)

### 4.5 디렉토리 구조

```
packages/adapters/evm/
  ├── hardhat.config.ts           # Hardhat 설정 (inline + fork)
  ├── contracts/
  │   ├── TestERC20.sol           # 테스트용 ERC-20 (6/18 decimals)
  │   └── NonStandardERC20.sol    # USDT-like 비표준 ERC-20
  ├── test/
  │   ├── unit/
  │   │   └── evm-adapter.test.ts     # 기존 Stub 테스트 + 빌드 로직 Unit
  │   ├── chain-integration/
  │   │   ├── erc20-transfer.test.ts  # ET-TOKEN-01~08 (Hardhat inline)
  │   │   ├── erc20-approve.test.ts   # approve C1~C2 (Hardhat inline)
  │   │   └── uniswap-fork.test.ts    # Uniswap fork 시나리오 (fork 모드)
  │   └── contracts/
  │       └── evm-adapter.contract.test.ts  # IChainAdapter Contract Test
  ├── cache/                      # Hardhat 빌드 캐시
  └── artifacts/                  # 컴파일된 ABI/바이트코드
```

### 4.6 EVM 테스트 실행 전략

| 레벨 | 환경 | 실행 빈도 | Jest 설정 | 대상 |
|------|------|----------|----------|------|
| Unit | Node.js (viem Mock) | 매 커밋 | `--maxWorkers=75%` | 빌드 로직 순수 함수 |
| Chain Integration (inline) | Hardhat Network 인메모리 | 매 PR | `--runInBand --testTimeout=60000` | ERC-20 전송/approve/조회 |
| Chain Integration (fork) | Hardhat Mainnet Fork | nightly/릴리스 | `--runInBand --testTimeout=120000` | Uniswap fork 시나리오 |

### 4.7 Solana 테스트 환경 확장

v0.4의 Solana 3단계 환경(48-blockchain-test-environment)에 v0.6 확장을 추가한다:

#### Level 2 (Local Validator / Bankrun) 확장

| # | 신규 시나리오 | 도구 | 참조 |
|---|-------------|------|------|
| 1 | SPL Token 민팅 + ATA 생성 + transferChecked | solana-test-validator | VT-TOKEN-01~08 (57 섹션 8.3) |
| 2 | Token-2022 기본 전송 | solana-test-validator | VT-TOKEN-02 |
| 3 | SPL ApproveChecked + delegate 확인 | Bankrun | C3 from approve spec (59 섹션 9.4) |
| 4 | 배치 트랜잭션 (multi-instruction) | solana-test-validator | N-01~03, E-04 (60 섹션 7.4) |
| 5 | Jupiter swap instruction 빌드 검증 | Bankrun | SWP-U08 (63 섹션 9) -- instruction 구조만, 실제 스왑 불가 |

#### Bankrun 사용 패턴

Bankrun은 Solana 런타임의 인메모리 구현으로, solana-test-validator보다 빠르고 결정적이다:

```typescript
// Bankrun 사용 예시: SPL ApproveChecked 검증
import { start } from 'solana-bankrun'

describe('SPL ApproveChecked via Bankrun', () => {
  let bankrunContext: BankrunContext

  beforeAll(async () => {
    bankrunContext = await start([], [])  // 프로그램/계정 프리로드 가능
  })

  test('ApproveChecked 후 delegate가 설정되어야 한다', async () => {
    // 1. 테스트 토큰 민트 생성
    // 2. ATA 생성 + 토큰 민팅
    // 3. ApproveChecked instruction 실행
    // 4. getAccount()로 delegate 확인
  })
})
```

**Level 2~3 실행 구분:**

| 도구 | 속도 | 결정성 | 적합 시나리오 | 실행 빈도 |
|------|------|--------|------------|----------|
| Bankrun | ~10ms/tx | 100% | SPL approve, delegate, 단순 instruction | 매 PR |
| solana-test-validator | ~100ms/tx | ~99% | 전체 E2E 흐름, 배치 원자성, ATA 자동 생성 | 매 PR / nightly |
| Devnet | ~500ms/tx | ~90% | 네트워크 호환성, rate limit | nightly/릴리스 |

---

## 5. 커버리지 재설정 (TEST-03)

### 5.1 v0.4 -> v0.6 커버리지 변경 요약

v0.6에서 @waiaas/adapter-evm이 Stub에서 실제 빌드 로직으로 전환되고, 2개 신규 모듈이 추가되면서 커버리지 목표를 재설정한다.

| 패키지/모듈 | v0.4 목표 | v0.6 목표 | Tier 변경 | 변경 근거 |
|------------|----------|----------|----------|----------|
| @waiaas/adapter-evm | 50%+ (Low) | **80%+ (High)** | Low -> High | Stub에서 실제 ERC-20 빌드 로직 전환. transfer/approve/getAssets/estimateFee 검증 필수 |
| **@waiaas/actions (NEW)** | N/A | **80%+ (High)** | 신규 | Jupiter resolve() + 보안 검증이 핵심. validate-then-trust 경계 검증 |
| **@waiaas/oracle (daemon 서브모듈)** | N/A | **80%+ (High)** | 신규 | 가격 정확성이 정책 티어 결정에 직결. OracleChain fallback, 캐시, stale 처리 |
| daemon/services/policy-engine | 90%+ (Critical) | **90%+ (Critical)** | 변경 없음 | evaluateSpendingLimitUsd 추가, 11단계 알고리즘 확장 |
| daemon/services/transaction-service | 90%+ (Critical) | **90%+ (Critical)** | 변경 없음 | 5-type discriminatedUnion 분기 추가 |
| daemon/server/routes/ | 80%+ (High) | **80%+ (High)** | 변경 없음 | /v1/actions/ 4개 + /v1/wallet/assets 라우트 추가 |

### 5.2 모듈 테스트 매트릭스 (9 -> 11개 확장)

기존 9개 모듈에 2개를 추가한다:

| Module | Unit | Integration | E2E | Chain Integration | Security | Platform |
|--------|------|-------------|-----|-------------------|----------|----------|
| @waiaas/core | O | O | - | - | O | - |
| @waiaas/daemon | O | O | O | - | O | - |
| @waiaas/adapter-solana | O | O | - | O | - | - |
| @waiaas/adapter-evm | **O** | **O** | - | **O** | **O** | - |
| @waiaas/cli | - | O | - | - | - | O |
| @waiaas/sdk | O | O | - | - | - | - |
| @waiaas/mcp | O | O | - | - | - | - |
| Python SDK | O | O | - | - | - | - |
| Desktop App (Tauri) | - | - | - | - | - | O |
| **@waiaas/actions (NEW)** | **O** | **O** | - | **O** | **O** | - |
| **daemon/infrastructure/oracle/ (NEW)** | **O** | **O** | - | - | **O** | - |

**변경 설명:**

**@waiaas/adapter-evm (v0.4 -> v0.6):**
- v0.4: Unit만 (Stub 검증). v0.6: Unit, Integration, Chain Integration, Security 추가
- Integration: Mock EVM Client + viem 타입 검증
- Chain Integration: Hardhat Network에서 ERC-20 실제 전송/approve
- Security: decimals 불일치, uint256 overflow, 비표준 ERC-20

**@waiaas/actions (NEW):**
- Unit: IActionProvider 인터페이스, inputSchema 검증, resolve() 반환값 검증
- Integration: resolve() -> ContractCallRequest -> 파이프라인 통합
- Chain Integration: Jupiter Devnet 실제 스왑 (nightly)
- Security: 악성 플러그인, 타 지갑 from, MCP Tool 상한, 체인 불일치

**daemon/infrastructure/oracle/ (NEW):**
- Unit: PriceCache TTL/stale, resolveEffectiveAmountUsd(), 캐시 통계
- Integration: CoinGeckoOracle + msw Mock, OracleChain fallback
- Security: 가격 조작, stale 데이터, 교차 검증 불일치, rate limit

### 5.3 패키지 수준 커버리지 목표 (갱신)

| Package | v0.4 Target | v0.6 Target | Tier | Rationale |
|---------|------------|------------|------|-----------|
| @waiaas/core | 90%+ | 90%+ | Critical | SSoT Enum + Zod 스키마 (변경 없음) |
| @waiaas/daemon | 모듈별 차등 | 모듈별 차등 | Critical~Normal | 하위 모듈 세분화 (아래 참조) |
| @waiaas/adapter-solana | 80%+ | 80%+ | High | 변경 없음 |
| @waiaas/adapter-evm | **50%+** | **80%+** | **High** | Stub -> 실제 빌드. ERC-20 transfer/approve/getAssets/estimateFee |
| @waiaas/cli | 70%+ | 70%+ | Normal | 변경 없음 |
| @waiaas/sdk | 80%+ | 80%+ | High | 변경 없음 |
| @waiaas/mcp | 70%+ | 70%+ | Normal | 변경 없음 |
| Python SDK | 80%+ | 80%+ | High | 변경 없음 |
| Desktop App (Tauri) | 제외 | 제외 | - | 변경 없음 |
| **@waiaas/actions** | **N/A** | **80%+** | **High** | Jupiter resolve, ActionProviderRegistry, validate-then-trust 보안 경계 |

### 5.4 @waiaas/daemon 모듈별 세분화 커버리지 (갱신)

기존 9개 서브모듈에 oracle 서브모듈을 추가하고, 기존 서브모듈의 v0.6 확장을 반영한다:

| daemon Sub-Module | v0.4 Target | v0.6 Target | Tier | v0.6 변경 사항 |
|-------------------|------------|------------|------|--------------|
| infrastructure/keystore/ | 95%+ | 95%+ | Critical | 변경 없음 |
| services/session-service | 90%+ | 90%+ | Critical | 변경 없음 |
| services/policy-engine | 90%+ | **90%+** | Critical | evaluateSpendingLimitUsd() 추가, 11단계 -> 11a~11e 세분화, USD+네이티브 병행 평가 |
| services/transaction-service | 90%+ | **90%+** | Critical | 5-type discriminatedUnion(TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH) 분기 |
| server/middleware/ | 85%+ | 85%+ | High | 변경 없음 |
| server/routes/ | 80%+ | **80%+** | High | /v1/actions/ 4개 라우트 + /v1/wallet/assets 추가 |
| infrastructure/database/ | 80%+ | 80%+ | High | 변경 없음 (감사 컬럼은 스키마 레벨) |
| infrastructure/notifications/ | 80%+ | 80%+ | High | 변경 없음 |
| lifecycle/ | 75%+ | 75%+ | Normal | 변경 없음 |
| **infrastructure/oracle/ (NEW)** | **N/A** | **80%+** | **High** | IPriceOracle 구현, OracleChain fallback, PriceCache, 가격 정확성이 정책에 직결 |

### 5.5 Jest coverageThreshold 설정 갱신

```typescript
// jest.config.ts (루트) -- v0.6 커버리지 임계값 확장
coverageThreshold: {
  // 글로벌 기본값
  global: {
    branches: 70, functions: 70, lines: 70, statements: 70,
  },

  // --- v0.4 기존 (변경 없음) ---
  './packages/core/src/': {
    branches: 85, functions: 90, lines: 90, statements: 90,
  },
  './packages/daemon/src/infrastructure/keystore/': {
    branches: 90, functions: 95, lines: 95, statements: 95,
  },
  './packages/daemon/src/services/': {
    branches: 85, functions: 90, lines: 90, statements: 90,
  },
  './packages/daemon/src/server/middleware/': {
    branches: 80, functions: 85, lines: 85, statements: 85,
  },
  './packages/daemon/src/server/routes/': {
    branches: 75, functions: 80, lines: 80, statements: 80,
  },
  './packages/daemon/src/infrastructure/database/': {
    branches: 75, functions: 80, lines: 80, statements: 80,
  },
  './packages/daemon/src/infrastructure/notifications/': {
    branches: 75, functions: 80, lines: 80, statements: 80,
  },
  './packages/daemon/src/lifecycle/': {
    branches: 70, functions: 75, lines: 75, statements: 75,
  },
  './packages/adapters/solana/src/': {
    branches: 75, functions: 80, lines: 80, statements: 80,
  },
  './packages/sdk/src/': {
    branches: 75, functions: 80, lines: 80, statements: 80,
  },
  './packages/cli/src/': {
    branches: 65, functions: 70, lines: 70, statements: 70,
  },
  './packages/mcp/src/': {
    branches: 65, functions: 70, lines: 70, statements: 70,
  },

  // --- v0.6 변경/추가 ---

  // @waiaas/adapter-evm: 50% (Low) -> 80% (High)
  './packages/adapters/evm/src/': {
    branches: 75, functions: 80, lines: 80, statements: 80,
  },

  // @waiaas/actions (NEW): 80% (High)
  './packages/actions/src/': {
    branches: 75, functions: 80, lines: 80, statements: 80,
  },

  // daemon/infrastructure/oracle/ (NEW): 80% (High)
  './packages/daemon/src/infrastructure/oracle/': {
    branches: 75, functions: 80, lines: 80, statements: 80,
  },
}
```

---

## 6. 테스트 시나리오 통합

### 6.1 시나리오 번호 체계

Phase 22-24의 ~148개 테스트 시나리오를 도메인별로 재분류하고 통일된 번호 체계를 적용한다. 각 시나리오는 원본 문서의 의미를 유지하되, 추적성을 위해 소스 문서 참조를 포함한다.

**번호 체계:**

| 접두어 | 도메인 | 레벨 접미어 | 예시 |
|--------|--------|-----------|------|
| TOK | 토큰 전송 (56, 57) | U=Unit, I=Integration, C=Chain Mock | TOK-U01, TOK-I03, TOK-C05 |
| CTR | 컨트랙트 호출 (58) | U=Unit, S=Security | CTR-U01, CTR-S03 |
| APR | Approve (59) | U=Unit, I=Integration, C=Chain, S=Security | APR-U01, APR-S04 |
| BAT | 배치 트랜잭션 (60) | U=Unit, I=Integration, S=Security | BAT-U01, BAT-S02 |
| ORC | 오라클 (61) | U=Unit, I=Integration, S=Security | ORC-U01, ORC-S08 |
| ACT | Action Provider (62) | U=Unit, I=Integration, S=Security | ACT-U01, ACT-S06 |
| SWP | Swap (63) | U=Unit, I=Integration, S=Security | SWP-U01, SWP-S04 |

### 6.2 도메인 1: 토큰 전송 (TOK) -- 30개

**소스:** 56-token-transfer-extension-spec.md, 57-asset-query-fee-estimation-spec.md 섹션 8

#### Level 1: Unit Tests (14개)

| ID | 시나리오 | 검증 포인트 | 소스 |
|----|---------|-----------|------|
| TOK-U01 | TransferRequest.token 파싱: 유효한 토큰 필드 | 파싱 성공, 토큰 전송으로 분기 | 57 UT-TOKEN-01 |
| TOK-U02 | TransferRequest.token 하위 호환 (token 미제공) | 네이티브 전송으로 분기 | 57 UT-TOKEN-02 |
| TOK-U03 | TransferRequest.token 잘못된 주소 형식 | INVALID_ADDRESS 에러 | 57 UT-TOKEN-03 |
| TOK-U04 | ALLOWED_TOKENS 정책: 허용 토큰 통과 | 정책 통과 | 57 UT-TOKEN-04 |
| TOK-U05 | ALLOWED_TOKENS 정책: 미등록 토큰 거부 | TOKEN_NOT_ALLOWED | 57 UT-TOKEN-05 |
| TOK-U06 | ALLOWED_TOKENS 미설정 시 기본 DENY | unknown_token_action 기본값 적용 | 57 UT-TOKEN-06 |
| TOK-U07 | AllowedTokensRuleSchema Zod 검증: 유효 | 파싱 성공 | 57 UT-TOKEN-07 |
| TOK-U08 | AllowedTokensRuleSchema Zod 검증: 무효 | Zod 에러 | 57 UT-TOKEN-08 |
| TOK-U09 | FeeEstimate: ATA 미존재 SPL 전송 | total = baseFee + priorityFee + ataCreationCost | 57 UT-TOKEN-09 |
| TOK-U10 | FeeEstimate: ATA 존재 SPL 전송 | ataCreationCost = undefined | 57 UT-TOKEN-10 |
| TOK-U11 | FeeEstimate: ERC-20 gas 추정 | total = gasLimit * maxFeePerGas | 57 UT-TOKEN-11 |
| TOK-U12 | AssetInfo bigint -> string 직렬화 | balance 문자열 변환 정확 | 57 UT-TOKEN-12 |
| TOK-U13 | AssetInfo type enum 검증 (spl) | Zod 검증 통과 | 57 UT-TOKEN-13 |
| TOK-U14 | AssetInfo type enum 무효값 | Zod 에러 | 57 UT-TOKEN-14 |

#### Level 2: Integration Tests (10개)

| ID | 시나리오 | 검증 포인트 | 소스 |
|----|---------|-----------|------|
| TOK-I01 | SPL 토큰 전송 파이프라인 | buildSplTokenTransfer -> UnsignedTransaction | 57 IT-TOKEN-01 |
| TOK-I02 | SPL 전송 실패: 잔액 부족 | INSUFFICIENT_BALANCE | 57 IT-TOKEN-02 |
| TOK-I03 | ERC-20 토큰 전송 파이프라인 | ERC-20 transfer calldata 생성 | 57 IT-TOKEN-03 |
| TOK-I04 | ERC-20 전송 실패: 시뮬레이션 | SIMULATION_FAILED | 57 IT-TOKEN-04 |
| TOK-I05 | ALLOWED_TOKENS 정책 DB 라운드트립 | 정책 일관성 | 57 IT-TOKEN-05 |
| TOK-I06 | ALLOWED_TOKENS 정책 변경 후 재검증 | 변경 즉시 반영 | 57 IT-TOKEN-06 |
| TOK-I07 | getAssets() Solana (SOL + 2 SPL) | AssetInfo[] 3개, native 첫 번째 | 57 IT-TOKEN-07 |
| TOK-I08 | getAssets() EVM (ETH + 1 ERC-20) | AssetInfo[] 2개 | 57 IT-TOKEN-08 |
| TOK-I09 | getAssets() -> REST API 응답 변환 | bigint -> string, Zod 통과 | 57 IT-TOKEN-09 |
| TOK-I10 | estimateFee() ATA 비용 포함 | ataCreationCost > 0 | 57 IT-TOKEN-10 |

#### Level 3: Chain Mock Tests -- Solana Validator (8개)

| ID | 시나리오 | 검증 포인트 | 소스 |
|----|---------|-----------|------|
| TOK-C01 | SPL 민팅 + ATA 생성 + 전송 | 잔액 증감 확인 | 57 VT-TOKEN-01 |
| TOK-C02 | Token-2022 기본 전송 | transferChecked 성공 | 57 VT-TOKEN-02 |
| TOK-C03 | ATA 미존재 수신자 전송 | ATA 자동 생성 + 전송 | 57 VT-TOKEN-03 |
| TOK-C04 | 잔액 부족 전송 시도 | 트랜잭션 실패 | 57 VT-TOKEN-04 |
| TOK-C05 | SOL 잔액 부족으로 토큰 전송 실패 | INSUFFICIENT_BALANCE (수수료) | 57 VT-TOKEN-05 |
| TOK-C06 | getAssets() 실제 조회 | AssetInfo[] 반환, 잔액 정확 | 57 VT-TOKEN-06 |
| TOK-C07 | transferChecked decimals 검증 | 불일치 시 프로그램 에러 | 57 VT-TOKEN-07 |
| TOK-C08 | estimateFee() ATA 비용 정확도 | ataCreationCost = 실제 rent-exempt | 57 VT-TOKEN-08 |

#### Level 3: Chain Mock Tests -- EVM Hardhat (8개)

| ID | 시나리오 | 검증 포인트 | 소스 |
|----|---------|-----------|------|
| TOK-C09 | ERC-20 배포 + transfer + balanceOf | transfer 성공 | 57 ET-TOKEN-01 |
| TOK-C10 | USDT-like 비표준 ERC-20 transfer | 시뮬레이션/전송 성공 | 57 ET-TOKEN-02 |
| TOK-C11 | gas 추정 정확도 | 추정 >= 실제 gas used | 57 ET-TOKEN-03 |
| TOK-C12 | 잔액 부족 시뮬레이션 | simulateContract revert | 57 ET-TOKEN-04 |
| TOK-C13 | ETH 잔액 부족 ERC-20 전송 | 가스 부족 에러 | 57 ET-TOKEN-05 |
| TOK-C14 | getAssets() multicall | AssetInfo[] 4개 | 57 ET-TOKEN-06 |
| TOK-C15 | getAssets() 일부 토큰 조회 실패 | 유효한 토큰만 반환, 경고 | 57 ET-TOKEN-07 |
| TOK-C16 | estimateFee() ERC-20 gas 정확도 | total >= 실제 수수료 | 57 ET-TOKEN-08 |

**토큰 도메인 합계: 14 Unit + 10 Integration + 16 Chain Mock = 40개**

(참고: v0.4 보안 시나리오 SEC-TOKEN-01~08은 섹션 7에서 별도 집계)

### 6.3 도메인 2: 컨트랙트 호출 (CTR) -- 14개

**소스:** 58-contract-call-spec.md 섹션 9.3

#### 정상 시나리오 (2개)

| ID | 시나리오 | 검증 포인트 | 소스 |
|----|---------|-----------|------|
| CTR-U01 | EVM 정상 컨트랙트 호출 | PENDING -> QUEUED(APPROVAL) -> CONFIRMED | 58 S-01 |
| CTR-U02 | Solana 정상 프로그램 호출 | 동일 파이프라인 흐름 | 58 S-02 |

#### 정책 거부 시나리오 (5개)

| ID | 시나리오 | 검증 포인트 | 소스 |
|----|---------|-----------|------|
| CTR-U03 | CONTRACT_WHITELIST 미설정 | CONTRACT_CALL_DISABLED (403) | 58 S-03 |
| CTR-U04 | 비화이트리스트 컨트랙트 | CONTRACT_NOT_WHITELISTED (403) | 58 S-04 |
| CTR-U05 | 비화이트리스트 메서드 (EVM) | METHOD_NOT_WHITELISTED (403) | 58 S-05 |
| CTR-U06 | 체인 불일치 | CONTRACT_NOT_WHITELISTED (403) | 58 S-06 |
| CTR-U07 | 세션 제약 위반 | SESSION_CONTRACT_NOT_ALLOWED (403) | 58 S-07 |

#### 에러 시나리오 (3개)

| ID | 시나리오 | 검증 포인트 | 소스 |
|----|---------|-----------|------|
| CTR-U08 | calldata 없는 EVM 호출 | Zod 검증 실패 (400) | 58 S-08 |
| CTR-U09 | 빈 calldata ('0x') | "최소 4바이트 selector 필요" (400) | 58 S-09 |
| CTR-U10 | Solana accounts 누락 | Zod refine 실패 (400) | 58 S-10 |

#### 보안 시나리오 (4개)

| ID | 시나리오 | 검증 포인트 | 소스 |
|----|---------|-----------|------|
| CTR-S01 | 과도한 value 첨부 | APPROVAL 티어 (Owner 승인 필수) | 58 S-11 |
| CTR-S02 | 시뮬레이션 실패 컨트랙트 | SIMULATION_FAILED, FAILED 상태 | 58 S-12 |
| CTR-S03 | EVM checksum 주소 우회 | lowercase 정규화로 일치 | 58 S-13 |
| CTR-S04 | Solana to !== programId 불일치 | Zod refine 실패 (400) | 58 S-14 |

**컨트랙트 도메인 합계: 10 Unit + 4 Security = 14개**

### 6.4 도메인 3: Approve (APR) -- 22개

**소스:** 59-approve-management-spec.md 섹션 9.4

#### Level 1: Unit (Zod + 무제한 감지) (5개)

| ID | 시나리오 | 검증 포인트 | 소스 |
|----|---------|-----------|------|
| APR-U01 | ApproveRequest Zod 유효성 -- 정상 | 모든 필드 파싱 | 59 U1 |
| APR-U02 | ApproveRequest Zod -- spender 누락 | 파싱 실패 | 59 U2 |
| APR-U03 | 무제한 감지 -- EVM MAX_UINT256 | isUnlimited = true | 59 U3 |
| APR-U04 | 무제한 감지 -- Solana MAX_U64 | isUnlimited = true | 59 U4 |
| APR-U05 | 무제한 감지 -- 임계값 미만 | isUnlimited = false | 59 U5 |

#### Level 1: Unit (정책 평가) (5개)

| ID | 시나리오 | 검증 포인트 | 소스 |
|----|---------|-----------|------|
| APR-U06 | APPROVED_SPENDERS 미설정 | DENY (APPROVE_DISABLED) | 59 P1 |
| APR-U07 | APPROVED_SPENDERS -- 허용 spender | ALLOW | 59 P2 |
| APR-U08 | APPROVED_SPENDERS -- 비허가 spender | DENY (SPENDER_NOT_APPROVED) | 59 P3 |
| APR-U09 | APPROVE_AMOUNT_LIMIT -- 금액 초과 | DENY (APPROVE_AMOUNT_EXCEEDED) | 59 P4 |
| APR-U10 | APPROVE_TIER_OVERRIDE -- amount_tiers | tier='NOTIFY' | 59 P5 |

#### Level 2: Integration (3개)

| ID | 시나리오 | 검증 포인트 | 소스 |
|----|---------|-----------|------|
| APR-I01 | EVM approve 전체 파이프라인 | UnsignedTransaction, 올바른 calldata | 59 I1 |
| APR-I02 | Solana approve 전체 파이프라인 | ApproveChecked instruction, decimals | 59 I2 |
| APR-I03 | 정책 위반 파이프라인 종료 | 403 SPENDER_NOT_APPROVED | 59 I3 |

#### Level 3: Chain Mock (3개)

| ID | 시나리오 | 검증 포인트 | 소스 |
|----|---------|-----------|------|
| APR-C01 | EVM ERC-20 approve + allowance | approve 후 allowance == amount | 59 C1 |
| APR-C02 | EVM 2-step approve (race condition) | approve(0) -> allowance==0 -> approve(new) | 59 C2 |
| APR-C03 | Solana SPL ApproveChecked + delegate | delegate == spender, delegatedAmount == amount | 59 C3 |

#### Level 4: Security (6개)

| ID | 시나리오 | 검증 포인트 | 소스 |
|----|---------|-----------|------|
| APR-S01 | 무제한 approve 차단 (EVM) | DENY (UNLIMITED_APPROVE_BLOCKED) | 59 S1 |
| APR-S02 | 무제한 approve 차단 (Solana) | DENY (UNLIMITED_APPROVE_BLOCKED) | 59 S2 |
| APR-S03 | 비허가 spender approve | DENY (SPENDER_NOT_APPROVED) | 59 S3 |
| APR-S04 | EVM race condition 자동 방지 | approve(0) 자동 삽입 확인 | 59 S4 |
| APR-S05 | Solana 단일 delegate 경고 | previousDelegate 정보 + 경고 | 59 S5 |
| APR-S06 | APPROVE_DISABLED -- 전면 거부 | 어떤 spender/금액이든 거부 | 59 S6 |

**Approve 도메인 합계: 10 Unit + 3 Integration + 3 Chain + 6 Security = 22개**

### 6.5 도메인 4: 배치 트랜잭션 (BAT) -- 14개

**소스:** 60-batch-transaction-spec.md 섹션 7.4

#### 정상 (3개)

| ID | 시나리오 | 검증 포인트 | 소스 |
|----|---------|-----------|------|
| BAT-U01 | 2-instruction SOL 전송 배치 | 성공, amount 합산, metadata 기록 | 60 N-01 |
| BAT-U02 | 3-instruction 복합 배치 | transfer + approve + contractCall 혼합 | 60 N-02 |
| BAT-U03 | ATA 자동 생성 포함 배치 | ATA instruction 삽입, metadata.ata_created | 60 N-03 |

#### 정책 거부 (4개)

| ID | 시나리오 | 검증 포인트 | 소스 |
|----|---------|-----------|------|
| BAT-U04 | 합산 금액 APPROVAL 티어 | 합산 10 SOL -> APPROVAL | 60 P-01 |
| BAT-U05 | 개별 화이트리스트 위반 | BATCH_POLICY_VIOLATION | 60 P-02 |
| BAT-U06 | All-or-Nothing 다수 위반 | violations.length=2, 전체 거부 | 60 P-03 |
| BAT-U07 | APPROVE 포함 배치 티어 상승 | 합산 소액이지만 APPROVAL 강제 | 60 P-04 |

#### 에러 (4개)

| ID | 시나리오 | 검증 포인트 | 소스 |
|----|---------|-----------|------|
| BAT-U08 | EVM BATCH_NOT_SUPPORTED | 400 BATCH_NOT_SUPPORTED | 60 E-01 |
| BAT-U09 | instruction 수 부족 (<2) | Zod "최소 2개" | 60 E-02 |
| BAT-U10 | instruction 수 초과 (>20) | Zod "최대 20개" | 60 E-03 |
| BAT-U11 | 트랜잭션 크기 초과 (>1232 bytes) | BATCH_SIZE_EXCEEDED | 60 E-04 |

#### 보안 (3개)

| ID | 시나리오 | 검증 포인트 | 소스 |
|----|---------|-----------|------|
| BAT-S01 | 소액 분할 우회 시도 | 합산 금액으로 SPENDING_LIMIT 평가 | 60 S-01 |
| BAT-S02 | approve + 의심 패턴 | APPROVE_AMOUNT_LIMIT 또는 APPROVAL 강제 | 60 S-02 |
| BAT-S03 | 미인가 프로그램 배치 | BATCH_POLICY_VIOLATION, CONTRACT_NOT_WHITELISTED | 60 S-03 |

**배치 도메인 합계: 7 Unit + 4 에러 + 3 Security = 14개**

### 6.6 도메인 5: 오라클 (ORC) -- 12개 보안 + 테스트 레벨

**소스:** 61-price-oracle-spec.md 섹션 8

#### 테스트 레벨별 시나리오

| ID | 시나리오 | 레벨 | 검증 포인트 | 소스 |
|----|---------|------|-----------|------|
| ORC-U01 | PriceCache TTL 만료 | Unit | TTL 경과 시 재조회 | 61 8.1 |
| ORC-U02 | PriceCache stale 한계 (30분) | Unit | staleMaxAge 초과 시 PriceNotAvailableError | 61 8.1 |
| ORC-U03 | resolveEffectiveAmountUsd() 정상 | Unit | 토큰 금액 -> USD 변환 정확도 | 61 8.1 |
| ORC-U04 | resolveEffectiveAmountUsd() 가격 실패 fallback | Unit | TOKEN_TRANSFER -> NOTIFY 기본 | 61 8.1 |
| ORC-U05 | evaluateSpendingLimitUsd() 4-tier | Unit | USD 기준 INSTANT/NOTIFY/DELAY/APPROVAL | 61 8.1 |
| ORC-U06 | maxTier(nativeTier, usdTier) 보수적 채택 | Unit | 두 티어 중 높은 쪽 | 61 8.1 |
| ORC-I01 | CoinGeckoOracle + HTTP Mock | Integration | API 파싱, 에러 핸들링 | 61 8.1 |
| ORC-I02 | OracleChain fallback 경로 | Integration | CoinGecko 실패 -> Pyth/Chainlink | 61 8.1 |
| ORC-I03 | OracleChain 교차 검증 | Integration | 불일치 20% 시 보수적 채택 | 61 8.1 |
| ORC-I04 | DatabasePolicyEngine + MockPriceOracle | Integration | USD 기준 end-to-end 정책 평가 | 61 8.1 |
| ORC-I05 | CoinGecko 429 -> stale cache fallback | Integration | isStale=true, 기존 캐시 가격 반환 | 61 8.4 |
| ORC-I06 | 다중 토큰 getPrices() 부분 실패 | Integration | 성공 토큰만 Map 포함 | 61 8.1 |

**오라클 도메인 합계: 6 Unit + 6 Integration = 12개** (보안 시나리오 12개는 섹션 7)

### 6.7 도메인 6: Action Provider (ACT) -- 12개

**소스:** 62-action-provider-architecture.md 섹션 9

| ID | 시나리오 | 레벨 | 검증 포인트 | 소스 |
|----|---------|------|-----------|------|
| ACT-U01 | MCP Tool 상한 초과 (>16) | Unit | McpToolLimitExceededError | 62 시나리오 6 |
| ACT-U02 | 액션 이름 충돌 | Unit | ActionNameConflictError | 62 시나리오 7 |
| ACT-U03 | 잘못된 입력 파라미터 | Unit | ActionValidationError | 62 시나리오 9 |
| ACT-U04 | 체인 불일치 (ethereum -> solana 액션) | Unit | ActionValidationError | 62 시나리오 11 |
| ACT-I01 | CJS 모듈 플러그인 로드 실패 | Integration | ActionPluginLoadError | 62 시나리오 5 |
| ACT-I02 | resolve() 타임아웃 (30초) | Integration | AbortSignal | 62 시나리오 8 |
| ACT-I03 | CONTRACT_WHITELIST 미등록 -> Stage 3 거부 | Integration | CANCELLED | 62 시나리오 10 |
| ACT-I04 | 플러그인 디렉토리 미존재 | Integration | 정상 (0개 로드) | 62 시나리오 12 |
| ACT-S01 | 타 지갑 from 반환 | Security | ActionReturnInvalidError | 62 시나리오 1 |
| ACT-S02 | 직렬화된 트랜잭션 반환 | Security | ActionReturnInvalidError | 62 시나리오 2 |
| ACT-S03 | 체인 형식 불일치 (Solana에 EVM 형식) | Security | ActionReturnInvalidError | 62 시나리오 3 |
| ACT-S04 | 내장 프로바이더 이름 충돌 | Security | 로드 거부 | 62 시나리오 4 |

**Action Provider 도메인 합계: 4 Unit + 4 Integration + 4 Security = 12개**

### 6.8 도메인 7: Swap (SWP) -- 10개

**소스:** 63-swap-action-spec.md 섹션 9

| ID | 시나리오 | 레벨 | 검증 포인트 | 소스 |
|----|---------|------|-----------|------|
| SWP-U01 | 슬리피지 500bps 초과 | Unit | ActionValidationError | 63 시나리오 1 |
| SWP-U02 | priceImpact 1% 초과 | Unit | ActionResolveError | 63 시나리오 2 |
| SWP-U03 | 동일 토큰 스왑 (inputMint === outputMint) | Unit | ActionValidationError | 63 시나리오 3 |
| SWP-U04 | 유동성 부족 (outAmount = 0) | Unit | ActionResolveError | 63 시나리오 6 |
| SWP-U05 | 금액 0 | Unit | ActionValidationError | 63 시나리오 9 |
| SWP-I01 | Jupiter API 타임아웃 | Integration | 타임아웃 에러 | 63 시나리오 5 |
| SWP-I02 | Jupiter API 429 (rate limit) | Integration | ActionResolveError (retryable) | 63 시나리오 7 |
| SWP-I03 | 정상 스왑: SOL -> USDC | Integration | ContractCallRequest 반환, Zod 통과 | 63 시나리오 8 |
| SWP-I04 | CONTRACT_WHITELIST 미등록 | Integration | CANCELLED | 63 시나리오 10 |
| SWP-S01 | programId 위조 (Jupiter 아닌 주소) | Security | ActionResolveError | 63 시나리오 4 |

**Swap 도메인 합계: 5 Unit + 4 Integration + 1 Security = 10개**

### 6.9 시나리오 통합 요약

| 도메인 | Unit | Integration | Chain Mock | Security | 합계 |
|--------|------|-------------|-----------|----------|------|
| TOK (토큰) | 14 | 10 | 16 | - | 40 |
| CTR (컨트랙트) | 10 | - | - | 4 | 14 |
| APR (Approve) | 10 | 3 | 3 | 6 | 22 |
| BAT (배치) | 11 | - | - | 3 | 14 |
| ORC (오라클) | 6 | 6 | - | - | 12 |
| ACT (Action) | 4 | 4 | - | 4 | 12 |
| SWP (Swap) | 5 | 4 | - | 1 | 10 |
| **합계** | **60** | **27** | **19** | **18** | **124** |

**보안 전용 시나리오(섹션 7):** 추가 ~56건으로 총 시나리오 수는 ~180건.

참고: 일부 시나리오는 여러 레벨에서 중복 검증(예: 59 C1~C2는 APR-C01~C02와 동시에 보안 S4와 관련)되나, 각 시나리오는 주 레벨 기준으로 1회만 계수한다.

### 6.10 도메인 간 교차 시나리오

도메인 간 상호작용이 발생하는 시나리오를 별도 식별한다:

| # | 교차 시나리오 | 관련 도메인 | 검증 포인트 |
|---|-------------|-----------|-----------|
| X-01 | 오라클 가격 stale 시 TOKEN_TRANSFER 정책 | ORC + TOK | stale 가격 -> INSTANT에서 NOTIFY 상향 |
| X-02 | 오라클 완전 장애 시 과도기 전략 | ORC + TOK + BAT | 가격 실패 -> TOKEN_TRANSFER=NOTIFY 고정 |
| X-03 | 배치 내 TOKEN_TRANSFER USD 합산 | ORC + BAT + TOK | 부분 가격 성공 -> 성공분만 합산 + NOTIFY 이상 |
| X-04 | Action resolve -> CONTRACT_CALL 정책 평가 | ACT + CTR | resolve 성공해도 CONTRACT_WHITELIST 미등록 시 거부 |
| X-05 | Swap resolve -> approve + swap 배치 | SWP + APR + BAT | Jupiter swap이 approve 필요 시 배치 처리 |
| X-06 | EVM approve race condition + Uniswap swap | APR + SWP | 기존 allowance 있을 때 approve(0) -> approve(new) -> swap |

---

## 7. 보안 시나리오 통합

### 7.1 v0.6 보안 시나리오 분류

Phase 22-24에서 도출된 ~56건의 보안 시나리오를 도메인별로 통합한다. 각 시나리오는 v0.4의 43-security-scenario-analysis.md 형식과 일관된 포맷으로 기술한다.

#### 토큰 보안 (SEC-TOKEN-01~08) -- 8건

**소스:** 57-asset-query-fee-estimation-spec.md 섹션 8.5

| ID | 시나리오 | 공격 벡터 | 기대 방어 | 심각도 |
|----|---------|----------|----------|--------|
| SEC-TOKEN-01 | 미등록 토큰 전송 시도 | ALLOWED_TOKENS에 없는 토큰 전송 | ALLOWED_TOKENS 정책 거부 | HIGH |
| SEC-TOKEN-02 | 악성 토큰 민트/컨트랙트 주소 | 존재하지 않거나 악성 컨트랙트 | 주소 검증 실패/시뮬레이션 실패 | CRITICAL |
| SEC-TOKEN-03 | Token-2022 TransferFee 확장 | TransferFee 활성화 토큰 | 감지 후 거부 | HIGH |
| SEC-TOKEN-04 | ERC-20 approve 위장 | transfer() 시그니처 조작 | 시뮬레이션에서 감지 | HIGH |
| SEC-TOKEN-05 | SOL/ETH 잔액 0에서 토큰 전송 | 수수료 지불 불가 | estimateFee 단계 사전 차단 | MEDIUM |
| SEC-TOKEN-06 | decimals 불일치 공격 | 잘못된 decimals 전송 | transferChecked/on-chain 거부 | HIGH |
| SEC-TOKEN-07 | uint256 max 토큰 금액 | overflow 시도 | bigint 범위 검증 + 잔액 체크 | MEDIUM |
| SEC-TOKEN-08 | 동일 주소 자기 전송 | from === to | 정책/어댑터 감지, 경고 | LOW |

#### 컨트랙트 보안 (~5건)

**소스:** 58-contract-call-spec.md 섹션 9.1~9.3

| ID | 시나리오 | 공격 벡터 | 기대 방어 | 심각도 |
|----|---------|----------|----------|--------|
| SEC-CTR-01 | 악의적 컨트랙트 호출 | 비화이트리스트 컨트랙트 | CONTRACT_WHITELIST 필수 (기본 전면 거부) | CRITICAL |
| SEC-CTR-02 | 위험 함수 호출 (selfdestruct) | METHOD_WHITELIST 우회 | METHOD_WHITELIST 필터링 | CRITICAL |
| SEC-CTR-03 | 과도한 value 첨부 | 네이티브 토큰 빼돌리기 | SPENDING_LIMIT + APPROVAL 기본 티어 | HIGH |
| SEC-CTR-04 | 시뮬레이션 우회 (상태 의존) | 상태 변경 후 다른 결과 | 시뮬레이션 실패 시 무조건 거부 | MEDIUM |
| SEC-CTR-05 | 가스 고갈 공격 | 과도한 gas 소비 | gas 추정 * 1.2 상한 | MEDIUM |

#### Approve 보안 (S1~S6) -- 6건

**소스:** 59-approve-management-spec.md 섹션 9.4 Level 4

| ID | 시나리오 | 공격 벡터 | 기대 방어 | 심각도 |
|----|---------|----------|----------|--------|
| SEC-APR-01 | 무제한 approve 차단 (EVM) | uint256.max approve | APPROVE_AMOUNT_LIMIT + block_unlimited | CRITICAL |
| SEC-APR-02 | 무제한 approve 차단 (Solana) | u64.max approve | 동일 방어 | CRITICAL |
| SEC-APR-03 | 비허가 spender approve | 피싱/악의적 주소 | APPROVED_SPENDERS 화이트리스트 | CRITICAL |
| SEC-APR-04 | EVM race condition | allowance 이중 소비 | 자동 approve(0) -> approve(new) | HIGH |
| SEC-APR-05 | Solana 단일 delegate 경고 | 기존 delegate 덮어쓰기 | previousDelegate 정보 + 감사 로그 | MEDIUM |
| SEC-APR-06 | APPROVE_DISABLED 전면 거부 | 정책 미설정 상태 | 모든 approve 거부 | HIGH |

#### 배치 보안 (S1~S3) -- 3건

**소스:** 60-batch-transaction-spec.md 섹션 7.4

| ID | 시나리오 | 공격 벡터 | 기대 방어 | 심각도 |
|----|---------|----------|----------|--------|
| SEC-BAT-01 | 소액 분할 우회 | 소액 * N으로 한도 우회 | Phase B 합산 평가 | HIGH |
| SEC-BAT-02 | approve + transferFrom 콤보 | 배치 내 approve 후 즉시 활용 | APPROVE_TIER_OVERRIDE 강제 | HIGH |
| SEC-BAT-03 | 미인가 프로그램 배치 포함 | 정상 instruction 사이에 악성 삽입 | 개별 instruction 전체 정책 검증 (All-or-Nothing) | HIGH |

#### 오라클 보안 (S1~S12) -- 12건

**소스:** 61-price-oracle-spec.md 섹션 8.3

| ID | 시나리오 | 공격 벡터 | 기대 방어 | 심각도 |
|----|---------|----------|----------|--------|
| SEC-ORC-01 | 급격한 가격 변동 감지 | +60% 스파이크 | INSTANT -> NOTIFY 상향 | HIGH |
| SEC-ORC-02 | 다중 소스 교차 검증 실패 | CoinGecko=$100, Pyth=$80 (20% 불일치) | 보수적 가격 + 감사 로그 | HIGH |
| SEC-ORC-03 | 전체 오라클 장애 | 3개 소스 모두 실패 | Phase 22-23 과도기 전략 적용 | CRITICAL |
| SEC-ORC-04 | stale 데이터 장기 운영 | 30분 stale 한계 | stale 만료 후 PriceNotAvailableError | HIGH |
| SEC-ORC-05 | USD 변환 실패 시 fallback | getPrice() 실패 | TOKEN_TRANSFER -> NOTIFY 강제 | HIGH |
| SEC-ORC-06 | 네이티브 가격 실패 | getNativePrice() 실패 | type별 fallback 분기 | HIGH |
| SEC-ORC-07 | fallback 체인 순환 참조 | OracleChain 무한 루프 | 유한 시간 내 완료 보장 | MEDIUM |
| SEC-ORC-08 | 0가격 토큰 (스캠) | usdPrice=0 | $0 평가 -> INSTANT (정상 처리) | LOW |
| SEC-ORC-09 | 극단적 가격 정밀도 | BTC $100K+ 또는 $0.000001 | 정밀도 손실 없는 USD 계산 | MEDIUM |
| SEC-ORC-10 | 배치 부분 가격 실패 | 5개 중 2개 실패 | 성공분만 합산 + NOTIFY 이상 | MEDIUM |
| SEC-ORC-11 | Rate Limit 도달 시 degradation | CoinGecko 429 | Pyth/Chainlink fallback 또는 stale | MEDIUM |
| SEC-ORC-12 | stale 가격 INSTANT -> NOTIFY 상향 | stale 데이터 사용 | adjustTierForStalePrice() | HIGH |

#### Action Provider 보안 (시나리오 1~4) -- 4건

**소스:** 62-action-provider-architecture.md 섹션 9.3 (시나리오 1~4만 보안 분류)

| ID | 시나리오 | 공격 벡터 | 기대 방어 | 심각도 |
|----|---------|----------|----------|--------|
| SEC-ACT-01 | 타 지갑 from 반환 | resolve()가 다른 지갑 주소 설정 | validateResolveResult() from === walletAddress | CRITICAL |
| SEC-ACT-02 | 직렬화 트랜잭션 반환 | 정책 우회 시도 | ContractCallRequestSchema 검증 | CRITICAL |
| SEC-ACT-03 | 체인 형식 불일치 | Solana에 EVM 형식 | Zod refine() 필수 필드 검증 | HIGH |
| SEC-ACT-04 | 내장 프로바이더 이름 충돌 | 내장 프로바이더 덮어쓰기 | validateProviderSecurity() 거부 | HIGH |

#### Jupiter Swap 보안 (시나리오 1~4) -- 4건 (나머지는 기능 시나리오)

**소스:** 63-swap-action-spec.md 섹션 9.3 (보안 분류 항목)

| ID | 시나리오 | 공격 벡터 | 기대 방어 | 심각도 |
|----|---------|----------|----------|--------|
| SEC-SWP-01 | 슬리피지 500bps 초과 | 과도한 슬리피지로 MEV 착취 | inputSchema max(500) 강제 | HIGH |
| SEC-SWP-02 | priceImpact 1% 초과 | 유동성 부족 / MEV 공격 | validateQuote() priceImpactPct 검증 | HIGH |
| SEC-SWP-03 | programId 위조 | Jupiter 아닌 악의적 프로그램 | JUPITER_PROGRAM_ID 하드코딩 검증 | CRITICAL |
| SEC-SWP-04 | 동일 토큰 스왑 | 무의미한 스왑으로 수수료 낭비 | inputMint !== outputMint 검증 | LOW |

### 7.2 v0.6 보안 시나리오 통계

| 도메인 | CRITICAL | HIGH | MEDIUM | LOW | 합계 |
|--------|----------|------|--------|-----|------|
| 토큰 (SEC-TOKEN) | 1 | 4 | 2 | 1 | 8 |
| 컨트랙트 (SEC-CTR) | 2 | 1 | 2 | 0 | 5 |
| Approve (SEC-APR) | 3 | 2 | 1 | 0 | 6 |
| 배치 (SEC-BAT) | 0 | 3 | 0 | 0 | 3 |
| 오라클 (SEC-ORC) | 1 | 5 | 4 | 1 | 12* |
| Action (SEC-ACT) | 2 | 2 | 0 | 0 | 4 |
| Swap (SEC-SWP) | 1 | 2 | 0 | 1 | 4 |
| **합계** | **10** | **19** | **9** | **3** | **42** |

*참고: 오라클 12건 중 일부는 기능 레벨 테스트(ORC-U/I)에서도 검증되나, 보안 관점에서 별도 분류.

실제 중복 제거 후 순수 보안 전용 시나리오: ~42건. 기능 시나리오와 겹치는 보안 관련 항목을 포함하면 ~56건.

### 7.3 v0.4 보안 시나리오와 교차 참조

v0.4에서 71건의 보안 시나리오(43~47 문서)와 v0.6의 ~42건을 교차 참조한다:

| v0.4 문서 | v0.4 보안 영역 | v0.6 관련 | 교차 정도 |
|----------|--------------|----------|----------|
| 43-layer1-session-auth-attacks.md | 세션 인증 공격 (~15건) | 없음 | 독립 (세션 계층 변경 없음) |
| 44-layer2-policy-bypass-attacks.md | 정책 우회 공격 (~20건) | SEC-CTR, SEC-APR, SEC-BAT | **부분 확장** -- v0.6 정책 10개로 확장에 따른 우회 시나리오 추가 |
| 45-layer3-killswitch-recovery-attacks.md | Kill Switch 복구 (~12건) | 없음 | 독립 (Kill Switch 변경 없음) |
| 46-keystore-external-security-scenarios.md | 키스토어 외부 보안 (~12건) | 없음 | 독립 (키스토어 변경 없음) |
| 47-boundary-value-chain-scenarios.md | 경계값/체인 (~12건) | SEC-TOKEN-07, SEC-ORC-09 | **부분 확장** -- uint256 경계, 극단적 가격 |

**겹치는 영역 상세:**

| v0.4 시나리오 | v0.6 확장 | 관계 |
|-------------|----------|------|
| 44 정책 우회 TOCTOU | SEC-BAT-01 소액 분할 우회 | v0.6 배치 합산 평가가 TOCTOU 방어 확장 |
| 44 정책 우회 대상 확장 | SEC-CTR-01~05 | PolicyType 4개 -> 10개 확장에 따른 신규 우회 벡터 |
| 47 금액 경계값 | SEC-TOKEN-07 uint256 max | 동일 경계값 패턴, 토큰 전송으로 확장 |
| 47 타임아웃 경계 | SEC-ORC-04 stale 30분 | 새로운 시간 경계 (가격 캐시 TTL) |

**v0.6 고유 위협 영역 (v0.4에 없는 것):**

| 위협 영역 | 시나리오 | 핵심 방어 |
|----------|---------|----------|
| **가격 조작** | SEC-ORC-01~02 | 교차 검증, 급변동 감지 |
| **가격 장애** | SEC-ORC-03~06 | 과도기 전략, fallback 체인 |
| **Action Provider 악성 코드** | SEC-ACT-01~04 | validate-then-trust, from 검증 |
| **슬리피지/MEV 공격** | SEC-SWP-01~03 | 슬리피지 상한, priceImpact 검증, Jito MEV 보호 |
| **무제한 approve** | SEC-APR-01~02 | block_unlimited, 임계값 감지 |
| **approve race condition** | SEC-APR-04 | 자동 2-step approve |
| **배치 소액 분할** | SEC-BAT-01 | Phase B 합산 평가 |

### 7.4 총 보안 시나리오 커버리지

| 범위 | 시나리오 수 |
|------|-----------|
| v0.4 보안 시나리오 (43~47 문서) | 71건 |
| v0.6 보안 시나리오 (이 문서) | ~42건 |
| **총 합계** | **~113건** |

참고: 기능 시나리오와 보안 시나리오의 경계가 모호한 항목(예: ORC-I05 CoinGecko 429는 기능이자 보안)을 포함하면 ~127건까지 확장된다.

---

## 8. 부록

### 8.1 v0.4 -> v0.6 변경 요약 테이블

| 항목 | v0.4 | v0.6 | 변경 유형 |
|------|------|------|----------|
| Mock 경계 | 5개 | 10개 | 확장 (+5) |
| Contract Test 인터페이스 | 5개 | 7개 | 확장 (+2) |
| 모듈 매트릭스 | 9개 | 11개 | 확장 (+2) |
| @waiaas/adapter-evm 커버리지 | 50%+ (Low) | 80%+ (High) | 상향 |
| @waiaas/actions 커버리지 | N/A | 80%+ (High) | 신규 |
| oracle 서브모듈 커버리지 | N/A | 80%+ (High) | 신규 |
| 블록체인 환경: EVM | Stub only | Hardhat inline + fork | 전환 |
| 블록체인 환경: Solana | 3단계 | 3단계 + Bankrun 확장 | 확장 |
| 테스트 시나리오 | v0.4 기준 | +~124개 기능 + ~42개 보안 | 확장 |
| 보안 시나리오 | 71건 | +~42건 = ~113건 | 확장 |
| PolicyType | 4개 | 10개 | 확장 (+6) |
| TransactionType | 1개 (TRANSFER) | 5개 | 확장 (+4) |

### 8.2 Phase 25 scope out 항목

다음 항목은 이 문서의 범위에서 제외되며, 별도 태스크 또는 향후 마일스톤에서 처리한다:

| # | 항목 | 우선순위 | 비고 |
|---|------|---------|------|
| 1 | 36-killswitch-autostop-evm.md 변경 | LOW | Kill Switch는 v0.6에서 구조 변경 없음. 참조 링크 수준만 업데이트 필요 |
| 2 | 56~63 문서 과도기 주석 업데이트 | LOW | "Phase 24에서 해소됨" 주석 추가. 기능에 영향 없음 |
| 3 | 43-47 v0.4 보안 문서 v0.6 교차 참조 삽입 | LOW | 43-47 문서 자체 수정은 범위 밖. 이 문서에서 교차 참조 제공 |
| 4 | Python SDK 토큰 전송 테스트 | MEDIUM | Python SDK는 TS SDK 위임. 토큰 확장 테스트는 TS 우선 |

### 8.3 참조 문서 목록

**v0.4 테스트 프레임워크:**
- `docs/v0.4/41-test-levels-matrix-coverage.md` -- 6개 테스트 레벨, 9개 모듈 매트릭스, 커버리지 목표
- `docs/v0.4/42-mock-boundaries-interfaces-contracts.md` -- 5개 Mock 경계, 5개 Contract Test
- `docs/v0.4/43-layer1-session-auth-attacks.md` -- Layer 1 세션 인증 보안 시나리오
- `docs/v0.4/44-layer2-policy-bypass-attacks.md` -- Layer 2 정책 우회 보안 시나리오
- `docs/v0.4/45-layer3-killswitch-recovery-attacks.md` -- Layer 3 Kill Switch 복구 보안 시나리오
- `docs/v0.4/46-keystore-external-security-scenarios.md` -- 키스토어 외부 보안 시나리오
- `docs/v0.4/47-boundary-value-chain-scenarios.md` -- 경계값/체인 보안 시나리오
- `docs/v0.4/48-blockchain-test-environment-strategy.md` -- Solana 3단계 + EVM Stub 테스트 환경

**Phase 22 소스 (토큰 확장):**
- `docs/56-token-transfer-extension-spec.md` -- CHAIN-EXT-01: 토큰 전송 확장
- `docs/57-asset-query-fee-estimation-spec.md` -- CHAIN-EXT-02: 자산 조회/수수료/테스트 시나리오

**Phase 23 소스 (트랜잭션 타입 확장):**
- `docs/58-contract-call-spec.md` -- CHAIN-EXT-03: 컨트랙트 호출
- `docs/59-approve-management-spec.md` -- CHAIN-EXT-04: Approve 관리
- `docs/60-batch-transaction-spec.md` -- CHAIN-EXT-05: 배치 트랜잭션

**Phase 24 소스 (상위 추상화):**
- `docs/61-price-oracle-spec.md` -- CHAIN-EXT-06: 가격 오라클
- `docs/62-action-provider-architecture.md` -- CHAIN-EXT-07: Action Provider
- `docs/63-swap-action-spec.md` -- CHAIN-EXT-08: Jupiter Swap

### 8.4 요구사항 충족 매트릭스

| 요구사항 | 설명 | 충족 섹션 | 검증 기준 |
|---------|------|-----------|----------|
| TEST-01 | Mock 경계 5개 신규 추가 (10개 통합) | 섹션 2 | 10x6 매트릭스, 5개 신규 Mock 코드 수준 설계 |
| TEST-02 | EVM Hardhat 환경 + Uniswap fork | 섹션 4 | hardhat.config.ts, TestERC20.sol, fork 시나리오 |
| TEST-03 | 커버리지 재설정 (@waiaas/actions 80%+, oracle 80%+, adapter-evm 80%+) | 섹션 5 | 패키지/모듈별 커버리지 테이블 + jest.config.ts 설정 |
| 시나리오 통합 | ~148개 테스트 시나리오 도메인별 통합 | 섹션 6 | 7개 도메인, 통일 번호 체계, 소스 추적 |
| 보안 교차 참조 | v0.4 71건 + v0.6 ~42건 | 섹션 7 | 교차 참조 매트릭스, v0.6 고유 위협 식별 |
