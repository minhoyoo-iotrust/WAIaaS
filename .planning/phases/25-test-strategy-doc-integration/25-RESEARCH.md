# Phase 25: 테스트 전략 통합 + 기존 문서 반영 - Research

**Researched:** 2026-02-08
**Domain:** 테스트 전략 확장 (Mock 경계, EVM 테스트 환경, 커버리지) + 문서 통합
**Confidence:** HIGH

---

## Summary

Phase 25는 두 가지 축으로 구성된다: (1) Phase 22-24에서 설계한 8개 확장 기능(CHAIN-EXT-01~08)의 테스트 전략을 v0.4 테스트 프레임워크(docs/v0.4/41~51)에 통합하고, (2) 기존 설계 문서 8개(27, 25, 31, 33, 32, 37, 38, 45)에 v0.6 변경사항을 반영하여 문서 간 일관성을 확보한다.

v0.4에서 확립된 테스트 프레임워크는 6개 테스트 레벨, 9개 모듈 x 6개 레벨 매트릭스, 5개 Mock 경계(블록체인 RPC, 알림 채널, 파일시스템, IClock, IOwnerSigner), 5개 인터페이스 Contract Test를 정의하고 있다. Phase 25에서는 여기에 5개 신규 Mock 경계(Aggregator/Jupiter API, CoinGecko/Pyth/Chainlink 가격 API, 온체인 오라클, IPriceOracle, IActionProvider)를 추가하고, EVM 로컬 테스트 환경(Hardhat/Anvil)을 정식 설계에 포함하며, @waiaas/actions 등 확장 패키지의 커버리지 기준을 재설정해야 한다.

기존 문서 통합은 v0.5 Phase 21에서 확립된 "인라인 마킹 패턴"(기존 구조 유지 + v0.6 변경/추가/제거 주석)을 따른다. Phase 22-24의 8개 설계 문서(56-63)는 각각 "기존 문서 변경 요약" 또는 "Phase 25 수정 가이드" 섹션을 포함하고 있어, 변경 항목이 이미 상세히 기술되어 있다.

**Primary recommendation:** Phase 22-24 문서에 이미 기술된 변경 가이드(총 ~80개 변경 항목)를 체계적으로 취합하여 테스트 문서 1개(CHAIN-EXT-09) + 기존 문서 8개 수정으로 분류 실행한다.

---

## Standard Stack

### Core (v0.4 기존 확립 -- 변경 없음)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Jest | 30 | 테스트 프레임워크 | v0.4에서 확정, @swc/jest 기반 |
| @swc/jest | 최신 | TypeScript 변환기 | ts-jest 대비 ~40% CI 시간 절감 |
| jest-mock-extended | 4.x | 타입 안전 Mock | 인터페이스 기반 Mock 생성 |
| memfs | 최신 | 메모리 파일시스템 | Unit 테스트 FS Mock |

### v0.6 신규 추가 (Phase 25에서 테스트 전략에 반영)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| msw (Mock Service Worker) | 2.x | HTTP API Mock | Jupiter API, CoinGecko API, Pyth API Mock (63-swap-action-spec에서 이미 사용) |
| Hardhat | 2.x | EVM 로컬 노드 + fork | ERC-20 배포/approve/Uniswap fork 테스트 (TEST-02) |
| @nomicfoundation/hardhat-viem | 최신 | Hardhat + viem 통합 | viem 기반 EVM 어댑터와 일관된 테스트 |
| solana-bankrun | 최신 | Solana 인메모리 테스트 | SPL ApproveChecked/배치 트랜잭션 검증 (59/60에서 언급) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hardhat | Anvil (Foundry) | Anvil이 더 빠르나(Rust), WAIaaS는 TypeScript 에코시스템이므로 Hardhat이 통합이 자연스러움. 향후 Anvil 전환 가능 |
| msw | nock | msw가 fetch API를 직접 가로채므로 Node.js native fetch와 호환성 우수. 61-price-oracle-spec에서 nock/msw 중 하나로 언급 |
| solana-bankrun | solana-test-validator | Bankrun이 ~100x 빠름(인메모리). 59-approve-spec에서 Bankrun 사용으로 확정 |

---

## Architecture Patterns

### 신규 Mock 경계 5개 (TEST-01)

v0.4에서 5개 Mock 경계를 정의했다. Phase 25에서 5개를 추가해야 한다:

| # | Mock 대상 | Mock 방식 | 사용 레벨 | 소스 문서 |
|---|----------|----------|----------|----------|
| 1 | **Aggregator (Jupiter API)** | msw로 `/quote`, `/swap-instructions` Mock | Unit, Integration | 63-swap-action-spec 섹션 9.2 |
| 2 | **가격 API (CoinGecko/Pyth/Chainlink)** | msw로 HTTP 응답 Mock + 429/500 에러 시뮬레이션 | Unit, Integration | 61-price-oracle-spec 섹션 8.4 |
| 3 | **온체인 오라클 (Pyth on-chain)** | MockPriceOracle + 가격 피드 계정 Mock | Unit, Chain Mock | 61-price-oracle-spec 섹션 8.2 |
| 4 | **IPriceOracle** | MockPriceOracle (setPrice, setFailMode, setStaleMode) | Unit, Integration, Policy | 61-price-oracle-spec 섹션 8.2 -- 설계 완료 |
| 5 | **IActionProvider** | mockProvider 객체 (고정 resolve 반환) | Unit, Integration, Security | 62-action-provider-architecture 섹션 9.2 -- 설계 완료 |

### Mock 경계 매트릭스 확장 (v0.4 테이블 확장)

v0.4의 5x6 매트릭스를 10x6으로 확장:

```
기존 5개: 블록체인 RPC, 알림 채널, 파일시스템, IClock, IOwnerSigner
신규 5개: Aggregator, 가격 API, 온체인 오라클, IPriceOracle, IActionProvider
```

| Mock 대상 | Unit | Integration | E2E | Chain Integration | Security | Platform |
|-----------|------|-------------|-----|-------------------|----------|----------|
| Aggregator (Jupiter) | msw Mock | msw Mock | msw Mock | 실제 Jupiter API (수동) | msw Mock | 환경에 따라 |
| 가격 API (CoinGecko) | MockPriceOracle | msw Mock (HTTP 레벨) | MockPriceOracle | 실제 API (nightly) | MockPriceOracle | MockPriceOracle |
| 온체인 오라클 | MockPriceOracle | MockPriceOracle | MockPriceOracle | 실제 Pyth (nightly) | MockPriceOracle | MockPriceOracle |
| IPriceOracle | MockPriceOracle | MockPriceOracle 또는 CoinGeckoOracle+msw | MockPriceOracle | 실제 구현체 | MockPriceOracle | MockPriceOracle |
| IActionProvider | Mock Provider | Mock Provider | Mock Provider | 실제 Jupiter (수동) | 악성 Mock Provider | Mock Provider |

### EVM 테스트 환경 (TEST-02)

v0.4에서는 EVM이 EvmAdapterStub(CHAIN_NOT_SUPPORTED throw)이므로 EVM 테스트 환경이 불필요했다. v0.6에서 ERC-20 빌드 로직(56), 컨트랙트 호출(58), approve(59)가 설계되어 EVM 로컬 테스트가 필수가 되었다.

**Hardhat 환경 설계 내용:**

| 항목 | 설명 |
|------|------|
| 로컬 노드 | Hardhat Network (인메모리 EVM) |
| Fork 모드 | Ethereum Mainnet fork (Alchemy RPC) -- Uniswap 컨트랙트 사전 배포 상태 활용 |
| 테스트 ERC-20 | Hardhat에서 TestERC20 배포 (mint 가능, 6 decimals) |
| Uniswap fork | mainnet fork로 실제 Uniswap V3 Router + Pool 사용 |
| viem 통합 | @nomicfoundation/hardhat-viem으로 viem 클라이언트 직접 사용 |
| 실행 환경 | Level 3 Chain Mock (nightly/릴리스) |
| 시나리오 | ET-TOKEN-01~08 (57-spec), C1~C2 (59-spec), 58-spec Level 3 |

**환경 구조:**
```
packages/adapters/evm/
├── hardhat.config.ts       # Hardhat 설정 (fork, viem plugin)
├── contracts/
│   └── TestERC20.sol       # 테스트용 ERC-20
└── test/
    ├── erc20-transfer.test.ts   # ET-TOKEN-01~08
    ├── approve.test.ts          # C1~C2 (EVM approve)
    └── contract-call.test.ts    # 컨트랙트 호출 Level 3
```

### Solana 테스트 환경 확장

v0.4에서 Solana 3단계(Mock RPC / Local Validator / Devnet)가 확립되었다. v0.6에서 확장:

| 기존 (v0.4) | v0.6 추가 |
|-------------|----------|
| SOL 전송만 | SPL 토큰 전송 + Token-2022 감지/거부 |
| - | Bankrun으로 SPL ApproveChecked 테스트 |
| - | 배치 트랜잭션 (다중 instruction) |
| - | Jupiter swap instruction 빌드 검증 |

### 모듈 테스트 매트릭스 확장 (v0.4 9개 -> 11개)

| Module | Unit | Integration | E2E | Chain Integration | Security | Platform |
|--------|------|-------------|-----|-------------------|----------|----------|
| @waiaas/core | O | O | - | - | O | - |
| @waiaas/daemon | O | O | O | - | O | - |
| @waiaas/adapter-solana | O | O | - | O | - | - |
| @waiaas/adapter-evm | O | O | - | O | - | - |
| @waiaas/cli | - | O | - | - | - | O |
| @waiaas/sdk | O | O | - | - | - | - |
| @waiaas/mcp | O | O | - | - | - | - |
| Python SDK | O | O | - | - | - | - |
| Desktop App | - | - | - | - | - | O |
| **@waiaas/actions (NEW)** | **O** | **O** | **-** | **-** | **O** | **-** |
| **@waiaas/oracle (NEW)** | **O** | **O** | **-** | **O** | **O** | **-** |

### 커버리지 재설정 (TEST-03)

v0.4에서 9개 패키지 커버리지를 정의했다. v0.6에서 추가/변경:

| Package | v0.4 Target | v0.6 Target | Tier | Rationale |
|---------|-------------|-------------|------|-----------|
| @waiaas/core | 90%+ | 90%+ (유지) | Critical | TransactionType 5개, PolicyType 10개 Zod 스키마 추가됨 |
| @waiaas/adapter-evm | 50%+ (Stub) | **80%+** (변경) | High | Stub -> 실제 ERC-20/approve/call 빌드 로직 구현 대상 |
| @waiaas/adapter-solana | 80%+ | 80%+ (유지) | High | SPL/Token-2022/approve/batch 빌드 로직 추가 |
| @waiaas/actions (NEW) | - | **80%+** | High | Jupiter resolve() + 보안 검증이 핵심. 플러그인 로드 포함 |
| @waiaas/oracle (NEW) | - | **80%+** | High | 가격 데이터 정확성이 정책 평가에 직결 |
| @waiaas/daemon | 하위 모듈별 | 하위 모듈별 (확장) | Critical~Normal | 정책 엔진에 USD 평가 추가, 파이프라인 type 분기 확장 |

**daemon 서브모듈 추가:**
```
services/policy-engine:  90%+ (유지) -- evaluateSpendingLimitUsd, 11단계 알고리즘 추가
services/transaction-service:  90%+ (유지) -- 5-type discriminatedUnion 분기 추가
server/routes/:  80%+ (유지) -- /v1/actions/ 4개 엔드포인트 + /v1/wallet/assets 추가
```

### v0.5 문서 통합 패턴 (INTEG-01, INTEG-02)

Phase 21에서 확립된 패턴을 v0.6에서도 동일하게 사용:

**인라인 마킹 패턴:**
- 기존 구조 유지 + `(v0.6 변경/추가/제거)` 인라인 주석
- 섹션 헤더에 v0.6 변경 요약 블록쿼트
- 새로운 섹션이 필요한 경우 기존 섹션 뒤에 추가

**변경 항목 취합 (총 ~80개):**

| 소스 문서 | 대상 문서 수 | 변경 항목 수 |
|----------|------------|------------|
| 56-token-transfer-extension | 8개 | 32개 |
| 57-asset-query-fee-estimation | 6개 | 12개 |
| 58-contract-call-spec | 6개 | ~15개 |
| 59-approve-management | (58과 공동) | ~5개 (정책 추가) |
| 60-batch-transaction | (58과 공동) | ~5개 (정책/에러) |
| 61-price-oracle | 7개 | ~10개 |
| 62-action-provider | 8개 | ~12개 |
| 63-swap-action | (62과 공동) | ~3개 |

### 대상 문서별 변경 범위 요약

| # | 대상 문서 | 주요 변경 | 변경 규모 |
|---|----------|----------|----------|
| 1 | **27-chain-adapter-interface** | TokenInfo 추가, getAssets() 14번째 메서드, buildContractCall/buildApprove/buildBatch 3개 메서드, FeeEstimate 반환 타입, DeFi 미추가 원칙 명시, 에러 코드 | HIGH (~20개 변경) |
| 2 | **25-sqlite-schema** | TransactionType CHECK 5개, PolicyType CHECK 10개, 감사 컬럼 4개, 인덱스 2개, transactions.metadata actionSource | HIGH (~15개 변경) |
| 3 | **31-solana-adapter-detail** | SPL 정식화, Token-2022 지원, getAssets() 구현, 분기 교체, approve/batch 빌드 참조 | HIGH (~15개 변경) |
| 4 | **33-time-lock-approval-mechanism** | PolicyType 4->10개, evaluate() 11단계, 5개 신규 정책 스키마, SpendingLimitRuleSchema USD 필드, CONTRACT_CALL 기본 APPROVAL | HIGH (~20개 변경) |
| 5 | **32-transaction-pipeline-api** | Stage 1 discriminatedUnion 5-type, Stage 2 allowedContracts/allowedSpenders, Stage 3 evaluate() 11단계, Stage 4/5 type 분기, IPriceOracle 주입, actionSource 메타 | HIGH (~20개 변경) |
| 6 | **37-rest-api-complete-spec** | discriminatedUnion 요청 스키마, /v1/wallet/assets, /v1/actions/ 4개, 에러 코드 20개+, 엔드포인트 수 갱신 | HIGH (~15개 변경) |
| 7 | **38-sdk-mcp-interface** | MCP Tool Action 변환 섹션, MCP_TOOL_MAX=16, SDK에 Action/Oracle 메서드 추가 | MEDIUM (~8개 변경) |
| 8 | **45-enum-unified-mapping** | TransactionType 5개 신규, PolicyType 4->10개, ActionErrorCode 7개, PriceSource 선택적 | HIGH (~15개 변경) |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 테스트 시나리오 발굴 | 처음부터 시나리오 도출 | Phase 22-24 문서 내 테스트 섹션 취합 | 56-63 각 문서에 이미 상세 테스트 시나리오가 정의됨 (총 ~130개) |
| Mock 인터페이스 설계 | 새로 설계 | Phase 24 문서 내 Mock 설계 활용 | MockPriceOracle(61 섹션 8.2), Mock IActionProvider(62 섹션 9.2) 이미 설계 완료 |
| 변경 항목 도출 | 문서 비교 분석 | Phase 22-24 "기존 문서 변경 요약" 섹션 | 56 섹션 9, 57 섹션 9, 58 섹션 10, 61 섹션 9, 62 섹션 10에 변경 목록 이미 존재 |
| EVM 테스트 시나리오 | 처음부터 작성 | 57 섹션 8.4, 59 섹션 9.4 | ET-TOKEN-01~08, C1~C2 등 이미 정의됨 |
| Jupiter Mock 전략 | 새로 설계 | 63 섹션 9.2 msw 패턴 | setupServer() + http.get/http.post 패턴 이미 코드 수준으로 정의됨 |

**Key insight:** Phase 22-24의 각 설계 문서가 자체 테스트 시나리오와 기존 문서 변경 목록을 이미 포함하고 있으므로, Phase 25의 핵심 작업은 "취합+통합+정리"이지 "새로운 도출"이 아니다.

---

## Common Pitfalls

### Pitfall 1: 변경 항목 중복 적용
**What goes wrong:** 56-63 여러 문서가 동일 대상 문서(예: 33-time-lock)에 대해 각각 변경 항목을 기술. 중복 적용하면 일관성 깨짐.
**Why it happens:** CHAIN-EXT-03(58)에서 PolicyType 10개를 정의하고, CHAIN-EXT-04(59)에서도 같은 PolicyType을 참조.
**How to avoid:** 대상 문서별로 모든 소스 문서의 변경 항목을 먼저 취합한 후, 중복을 제거하고 한 번에 적용. 특히 45-enum은 INTEG-02에서 단일 작업으로 처리.
**Warning signs:** PolicyType이 10개를 넘거나, TransactionType이 5개를 넘으면 중복 적용된 것.

### Pitfall 2: 테스트 시나리오 번호 충돌
**What goes wrong:** Phase 22-24 문서마다 독립적으로 시나리오 번호를 매김 (U1, S1 등). CHAIN-EXT-09에 통합할 때 번호 충돌.
**Why it happens:** 각 문서가 독립적으로 작성됨.
**How to avoid:** CHAIN-EXT-09에서 도메인별 접두어 체계를 사용. 예: TOK-U01 (토큰 Unit), APR-S01 (Approve Security), ORC-S01 (오라클 Security).
**Warning signs:** 동일 번호 S1이 여러 다른 시나리오를 의미.

### Pitfall 3: @waiaas/adapter-evm 커버리지 불일치
**What goes wrong:** v0.4에서 Low(50%+) Stub이었으나 v0.6에서 실제 빌드 로직이 추가됨. 커버리지 목표를 갱신하지 않으면 보안 핵심 코드(approve, calldata 빌드)가 낮은 커버리지로 방치.
**Why it happens:** v0.4 기준을 그대로 유지.
**How to avoid:** EVM 어댑터를 High(80%+)로 상향. Hardhat 테스트 환경 도입과 함께 커버리지 목표 재설정.
**Warning signs:** EVM approve/call 빌드 로직이 있는데 커버리지 목표가 50%.

### Pitfall 4: 기존 문서 구조 파괴
**What goes wrong:** v0.6 변경을 반영할 때 기존 문서의 섹션 구조를 대폭 변경하여 기존 참조가 깨짐.
**Why it happens:** 변경 항목이 많아서 문서를 재작성하고 싶은 유혹.
**How to avoid:** v0.5에서 확립된 인라인 마킹 패턴을 엄격히 따름. 기존 섹션 번호/구조 유지, 변경/추가 표시만 추가.
**Warning signs:** 기존 섹션 번호가 바뀌거나, 다른 문서에서의 참조(예: "33 섹션 3.2 참조")가 깨짐.

### Pitfall 5: Contract Test 확장 누락
**What goes wrong:** v0.4에서 5개 인터페이스에 Contract Test를 정의했으나, v0.6 신규 인터페이스(IPriceOracle, IActionProvider)에 대한 Contract Test를 누락.
**Why it happens:** 기존 Contract Test 전략 문서만 참조하고, 신규 인터페이스를 간과.
**How to avoid:** CHAIN-EXT-09에 IPriceOracle + IActionProvider Contract Test 전략을 명시적으로 추가. MockPriceOracle/MockProvider가 Contract Test를 통과하는지 검증.
**Warning signs:** MockPriceOracle이 사용되지만 Contract Test 스위트가 없음.

---

## Code Examples

### MockPriceOracle (61-price-oracle-spec 섹션 8.2에서 발췌)

```typescript
// Source: 61-price-oracle-spec.md 섹션 8.2
class MockPriceOracle implements IPriceOracle {
  private prices: Map<string, number> = new Map()
  private shouldFail: boolean = false
  private shouldReturnStale: boolean = false

  setPrice(cacheKey: string, usdPrice: number): void
  setNativePrice(chain: string, usdPrice: number): void
  setFailMode(fail: boolean): void
  setStaleMode(stale: boolean): void

  async getPrice(token: TokenRef): Promise<PriceInfo>
  async getPrices(tokens: TokenRef[]): Promise<Map<string, PriceInfo>>
  async getNativePrice(chain: 'solana' | 'ethereum'): Promise<PriceInfo>
  getCacheStats(): CacheStats
}
```

### Mock IActionProvider (62-action-provider-architecture 섹션 9.2에서 발췌)

```typescript
// Source: 62-action-provider-architecture.md 섹션 9.2
const mockProvider: IActionProvider = {
  metadata: { name: 'mock_provider', description: 'Mock', version: '1.0.0', chains: ['solana'], mcpExpose: false },
  actions: [{ name: 'mock_action', description: 'Mock action', chain: 'solana',
              inputSchema: z.object({ amount: z.string() }), riskLevel: 'low', defaultTier: 'INSTANT' }],
  resolve: async (actionName, params, context) => ({
    from: context.walletAddress,
    to: 'MockProgram111111111111111111111111111111111',
    programId: 'MockProgram111111111111111111111111111111111',
    instructionData: 'AAAA',
    accounts: [{ address: context.walletAddress, isSigner: true, isWritable: true }],
  }),
}
```

### Jupiter API Mock (63-swap-action-spec 섹션 9.2에서 발췌)

```typescript
// Source: 63-swap-action-spec.md 섹션 9.2
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

const jupiterMockServer = setupServer(
  http.get('https://api.jup.ag/swap/v1/quote', ({ request }) => {
    const url = new URL(request.url)
    return HttpResponse.json({
      inputMint: url.searchParams.get('inputMint'),
      outputMint: url.searchParams.get('outputMint'),
      inAmount: url.searchParams.get('amount'),
      outAmount: String(BigInt(url.searchParams.get('amount')!) * 150n),
      priceImpactPct: '0.12',
      routePlan: [{ swapInfo: { ammKey: 'MockAMM...', label: 'Raydium' }, percent: 100 }],
    })
  }),
  http.post('https://api.jup.ag/swap/v1/swap-instructions', () => {
    return HttpResponse.json({
      swapInstruction: {
        programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
        data: 'AQAAAA==',
        accounts: [/* ... */],
      },
      computeBudgetInstructions: [],
      setupInstructions: [],
      cleanupInstruction: null,
      addressLookupTableAddresses: [],
    })
  }),
)
```

### CoinGecko Rate Limit 테스트 (61-price-oracle-spec 섹션 8.4에서 발췌)

```typescript
// Source: 61-price-oracle-spec.md 섹션 8.4
describe('CoinGeckoOracle rate limit handling', () => {
  it('should fallback to stale cache on 429 Too Many Requests', async () => {
    mockHttp.get('/simple/token_price/solana')
      .reply(200, { 'EPjFWdd...': { usd: 1.0001 } })
    await oracle.getPrice(usdcToken)  // 캐시에 저장

    advanceTime(300_001)  // 5분 + 1ms (TTL 경과)

    mockHttp.get('/simple/token_price/solana')
      .reply(429, { status: { error_code: 429 } })

    const price = await oracle.getPrice(usdcToken)
    expect(price.isStale).toBe(true)
    expect(price.usdPrice).toBe(1.0001)
  })
})
```

---

## 테스트 시나리오 총 취합 (Phase 22-24 문서에서)

Phase 22-24의 8개 문서에 이미 정의된 테스트 시나리오를 도메인별로 분류:

| 도메인 | 소스 문서 | Unit | Integration | Chain Mock | Security | 합계 |
|--------|---------|------|-------------|------------|----------|------|
| 토큰 전송 (SPL/ERC-20) | 56, 57 | ~10 | ~5 | VT-01~08, ET-01~08 | SEC-TOKEN-01~08 | ~39 |
| 컨트랙트 호출 | 58 | ~5 | ~3 | Level 3 | ~5 | ~13 |
| Approve 관리 | 59 | 10 | 3 | C1~C3 | S1~S6 | 22 |
| 배치 트랜잭션 | 60 | ~4 | N1~N3 | L3 | S1~S3 | 14 |
| 가격 오라클 | 61 | ~5 | ~3 | ~2 | S1~S12 | ~22 |
| Action Provider | 62 | ~5 | ~3 | - | 시나리오 1~12 | ~20 |
| Jupiter Swap | 63 | ~5 | ~3 | E2E | 시나리오 1~10 | ~18 |
| **합계** | | **~44** | **~23** | **~21** | **~56** | **~148** |

이 시나리오들은 CHAIN-EXT-09에서 통합/재분류되어야 한다.

---

## State of the Art

| Old (v0.4) | Current (v0.6) | When Changed | Impact |
|------------|----------------|--------------|--------|
| Mock 경계 5개 | Mock 경계 10개 | Phase 22-24 | 5개 신규 경계 추가 설계 필요 |
| EVM = Stub (테스트 없음) | EVM = 실제 빌드 로직 | Phase 22-23 | Hardhat 환경 + 커버리지 상향 |
| 모듈 9개 | 모듈 11개 | Phase 24 | @waiaas/actions, @waiaas/oracle 추가 |
| PolicyType 4개 | PolicyType 10개 | Phase 22-23 | 테스트 정책 fixture 대폭 확장 |
| TransactionType 없음 (암묵적) | TransactionType 5개 | Phase 22-23 | discriminatedUnion 테스트 필요 |
| 네이티브 금액 기준 정책 | USD 기준 정책 평가 | Phase 24 | MockPriceOracle + 환율 기반 테스트 |
| 보안 시나리오 71건 (v0.4) | + ~148건 (v0.6) | Phase 22-24 | CHAIN-EXT-09에 통합 |

---

## 계획 구조 권장

### Plan 25-01: 확장 기능 테스트 전략 (CHAIN-EXT-09)

CHAIN-EXT-09 문서 1개를 산출물로 생성. 내용:

1. **Mock 경계 5개 추가 설계** (TEST-01)
   - MockPriceOracle 인터페이스 + Contract Test
   - Mock IActionProvider + Contract Test
   - Jupiter API msw Mock 전략
   - CoinGecko/Pyth/Chainlink HTTP Mock 전략
   - 온체인 오라클 Mock 전략

2. **EVM 로컬 테스트 환경** (TEST-02)
   - Hardhat 설정 (fork + viem plugin)
   - TestERC20 배포 시나리오
   - Uniswap fork 시나리오 (approve + swap)
   - Solana Bankrun SPL 테스트 확장

3. **커버리지 재설정** (TEST-03)
   - @waiaas/actions 80%+ (High)
   - @waiaas/oracle 80%+ (High)
   - @waiaas/adapter-evm 50% -> 80% (Low -> High)
   - daemon 서브모듈 커버리지 재검토
   - Jest coverageThreshold 확장 설정

4. **테스트 시나리오 통합** (추가)
   - Phase 22-24의 ~148개 시나리오를 도메인별 통합
   - 시나리오 번호 체계 통일 (도메인 접두어)
   - v0.4 보안 시나리오(71건)와의 교차 참조

### Plan 25-02: 기존 설계 문서 8개 v0.6 통합

8개 문서를 순서대로 수정. 내용:

1. **45-enum-unified-mapping** (INTEG-02) -- 가장 먼저 (SSoT)
   - TransactionType 5개 신규 등록
   - PolicyType 4개 -> 10개 확장
   - ActionErrorCode 7개 추가
   - PriceSource enum 선택적 등록

2. **27-chain-adapter-interface** -- 인터페이스 SSoT
   - TokenInfo, AssetInfo, FeeEstimate 타입 추가
   - getAssets() 14번째 메서드
   - buildContractCall/buildApprove/buildBatch 3개 메서드
   - DeFi 메서드 미추가 원칙 명시
   - 에러 코드 확장

3. **25-sqlite-schema** -- 데이터 SSoT
   - TransactionType CHECK 5개
   - PolicyType CHECK 10개
   - 감사 컬럼 4개, 인덱스 2개
   - transactions.metadata 스키마 확장

4. **33-time-lock-approval-mechanism** -- 정책 SSoT
   - PolicyType 10개 확장
   - 6개 신규 정책 규칙 스키마 (ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE)
   - evaluate() 11단계 알고리즘
   - SpendingLimitRuleSchema USD 필드

5. **32-transaction-pipeline-api** -- 파이프라인 SSoT
   - Stage 1 discriminatedUnion 5-type
   - Stage 3 evaluate() 11단계 + IPriceOracle 주입
   - Stage 4/5 type별 분기
   - actionSource 메타데이터

6. **31-solana-adapter-detail** -- Solana 구현 SSoT
   - SPL 정식화 + Token-2022
   - getAssets() 구현 설계
   - approve/batch 빌드 참조

7. **37-rest-api-complete-spec** -- API SSoT
   - discriminatedUnion 요청 스키마
   - /v1/wallet/assets + /v1/actions/ 엔드포인트
   - 에러 코드 20개+ 추가
   - 엔드포인트 총수 갱신

8. **38-sdk-mcp-interface** -- SDK/MCP SSoT
   - MCP Tool Action 변환
   - MCP_TOOL_MAX=16
   - SDK Action/Oracle 메서드 추가

---

## Open Questions

1. **@waiaas/oracle은 독립 패키지인가?**
   - 61-price-oracle-spec에서 패키지 구조를 명시적으로 정의하지 않음
   - 62-action-provider-architecture 섹션 10.2에서 `@waiaas/actions` 패키지를 정의함
   - Oracle은 daemon 내부 모듈 vs 독립 패키지 결정 필요
   - 권장: daemon 내부 모듈 (infrastructure/oracle/). 외부 API 의존이라 actions처럼 독립할 필요는 낮음
   - 커버리지 설정에서 `daemon/src/infrastructure/oracle/` 경로로 세분화

2. **36-killswitch-autostop-evm.md는 INTEG-01 대상이 아닌데 변경이 있는가?**
   - 56 섹션 9.3과 57 섹션 9.1에서 36 문서에 대한 변경을 기술
   - 그러나 INTEG-01 대상 8개 문서(27, 25, 31, 33, 32, 37, 38, 45)에 36은 포함되지 않음
   - 권장: 36에 대한 변경은 참조 링크 추가 수준이므로 scope out. INTEG-01 대상 8개에 집중

3. **v0.6 문서(56-63) 자체의 상호 참조 업데이트는 필요한가?**
   - 61 섹션 9.1에서 "56, 58, 59, 60 문서의 과도기 전략 주석에 Phase 24에서 해소됨 주석 추가" 언급
   - 이는 LOW 우선순위로 분류됨
   - 권장: Phase 25 scope에 포함하되 Plan 25-02 마지막에 선택적 태스크로 처리

---

## Sources

### Primary (HIGH confidence)
- docs/v0.4/41-test-levels-matrix-coverage.md -- 6개 테스트 레벨, 커버리지 목표
- docs/v0.4/42-mock-boundaries-interfaces-contracts.md -- Mock 경계 5개, Contract Test 전략
- docs/v0.4/48-blockchain-test-environment-strategy.md -- Solana 3단계 테스트 환경
- docs/56-token-transfer-extension-spec.md 섹션 9 -- 기존 문서 변경 32건
- docs/57-asset-query-fee-estimation-spec.md 섹션 8, 9 -- EVM/Solana 테스트 시나리오, 변경 12건
- docs/58-contract-call-spec.md 섹션 9, 10 -- 테스트 시나리오, 기존 문서 영향 분석
- docs/59-approve-management-spec.md 섹션 9 -- 22개 테스트 시나리오 (Approve)
- docs/60-batch-transaction-spec.md 섹션 7 -- 14개 테스트 시나리오 (Batch)
- docs/61-price-oracle-spec.md 섹션 8, 9 -- MockPriceOracle, 12개 보안 시나리오, Phase 25 수정 가이드
- docs/62-action-provider-architecture.md 섹션 9, 10 -- 12개 보안 시나리오, Phase 25 수정 가이드
- docs/63-swap-action-spec.md 섹션 9 -- Jupiter Mock 전략, 10개 보안 시나리오
- .planning/deliverables/45-enum-unified-mapping.md -- 현재 Enum SSoT (9개 Enum, PolicyType 4개)

### Secondary (MEDIUM confidence)
- v0.5 Phase 21 통합 패턴 (21-03-SUMMARY.md) -- 인라인 마킹 패턴 검증됨
- v0.4 ROADMAP.md -- Mock RPC 13개 시나리오, TOCTOU 테스트 전략 등

### Tertiary (LOW confidence)
- Hardhat fork testing patterns (WebSearch) -- Mainnet fork + viem plugin 패턴
- Solana Bankrun SPL testing (WebSearch) -- solana-bankrun + spl-token-bankrun
- Anvil as alternative to Hardhat (WebSearch) -- 향후 전환 가능성

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- v0.4 프레임워크가 확립되어 있고, v0.6 문서에서 도구 선택이 이미 이루어짐
- Architecture (Mock 경계): HIGH -- 61, 62, 63 문서에서 Mock 설계가 코드 수준으로 완료됨
- Architecture (문서 통합): HIGH -- Phase 22-24 문서에서 변경 목록이 상세히 기술됨
- Pitfalls: HIGH -- v0.5 통합 경험에서 패턴이 검증됨
- EVM 테스트 환경: MEDIUM -- Hardhat 사용은 확정이나 세부 설정은 구현 시 조정 필요

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (안정적인 설계 문서 기반이므로 30일 유효)
