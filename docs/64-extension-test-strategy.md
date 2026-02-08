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
