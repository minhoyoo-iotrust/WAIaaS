# Swap Action 상세 설계 (CHAIN-EXT-08)

**문서 ID:** CHAIN-EXT-08
**작성일:** 2026-02-08
**상태:** 완료
**Phase:** 24 (상위 추상화 레이어 설계)
**참조:** CHAIN-EXT-07 (62-action-provider-architecture.md), CHAIN-EXT-03 (58-contract-call-spec.md), CHAIN-SOL (31-solana-adapter-detail.md), TX-PIPE (32-transaction-pipeline-api.md), 24-RESEARCH.md
**요구사항:** ACTION-04 (Jupiter Swap Action Provider), ACTION-05 (테스트/보안 시나리오)

---

## 1. 개요

### 1.1 목적

이 문서는 WAIaaS Action Provider 아키텍처(CHAIN-EXT-07)의 **첫 번째 구현체**인 **JupiterSwapActionProvider**를 상세 설계한다. Jupiter DEX 집계기(Aggregator)를 통해 Solana 토큰 스왑을 수행하며, Quote API -> /swap-instructions -> ContractCallRequest 변환 전체 흐름을 명세한다.

이 설계는 IActionProvider 인터페이스의 참조 구현(reference implementation)으로서, 향후 다른 DeFi Action Provider (0x Swap, Marinade Stake 등)가 동일한 패턴을 따르는 기준점 역할을 한다.

### 1.2 요구사항 매핑

| 요구사항 | 커버리지 | 섹션 |
|---------|---------|------|
| ACTION-04 | JupiterSwapActionProvider 구현체, Quote API -> ContractCallRequest 변환 | 섹션 2, 3 |
| ACTION-05 | Jupiter Swap 관련 테스트/보안 시나리오 | 섹션 9 |

### 1.3 핵심 설계 원칙

| # | 원칙 | 설명 | 적용 |
|---|------|------|------|
| 1 | **resolve-then-execute 패턴 준수** | resolve()는 ContractCallRequest만 반환. 서명/제출 수행 금지 | CHAIN-EXT-07 원칙 |
| 2 | **/swap-instructions 사용** | /swap은 직렬화된 전체 트랜잭션을 반환하므로 부적합. /swap-instructions로 개별 instruction 획득 | 24-RESEARCH.md Pitfall 5 |
| 3 | **보수적 슬리피지 기본값** | 50bps (0.5%) 기본, 500bps (5%) 상한. priceImpact 1% 초과 시 거부 | 24-RESEARCH.md Pitfall 6 |
| 4 | **Jito MEV 보호** | 프론트러닝/샌드위치 공격 방지를 위해 Jito 블록 엔진에 직접 전송 | Jupiter 권장 |
| 5 | **CONTRACT_WHITELIST 연동** | Jupiter 프로그램 주소가 화이트리스트에 있어야 스왑 실행 가능 | CHAIN-EXT-03 정책 |

### 1.4 참조 문서 관계

```
┌──────────────────────────────────────────────────────────────┐
│  CHAIN-EXT-07 (62-action-provider-architecture.md)            │
│  IActionProvider 인터페이스, ActionProviderRegistry            │
│  resolve-then-execute 패턴 정의                               │
└──────────────────────────┬───────────────────────────────────┘
                           │ implements IActionProvider
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  CHAIN-EXT-08 (63-swap-action-spec.md) <-- 이 문서            │
│  JupiterSwapActionProvider                                    │
│  Quote API -> /swap-instructions -> ContractCallRequest       │
└──────────────────────────┬───────────────────────────────────┘
                           │ resolve() 반환
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  CHAIN-EXT-03 (58-contract-call-spec.md)                      │
│  ContractCallRequest Zod 스키마                               │
│  Solana ContractCall 빌드 (pipe, AccountRole)                 │
└──────────────────────────────────────────────────────────────┘

     참조                              참조
┌────────────────┐              ┌──────────────────┐
│ CHAIN-SOL (31) │              │ Jupiter API v1   │
│ SolanaAdapter  │              │ api.jup.ag/swap/  │
│ pipe 트랜잭션  │              │ v1/quote          │
│ 빌드 패턴     │              │ v1/swap-instrs    │
└────────────────┘              └──────────────────┘
```

---

## 2. JupiterSwapActionProvider 구현체 (ACTION-04)

### 2.1 메타데이터

```typescript
// packages/actions/src/providers/jupiter-swap.ts

import { z } from 'zod'
import type {
  IActionProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
} from '@waiaas/core'
import type { ContractCallRequest } from '@waiaas/core'

/**
 * Jupiter Swap Action Provider.
 *
 * Solana 토큰 스왑을 Jupiter DEX 집계기를 통해 수행한다.
 * 20+ DEX에서 최적 경로를 찾아 스왑을 실행한다.
 *
 * 외부 API 의존:
 * - Jupiter Quote API v1: https://api.jup.ag/swap/v1/quote
 * - Jupiter Swap Instructions API: https://api.jup.ag/swap/v1/swap-instructions
 */
export class JupiterSwapActionProvider implements IActionProvider {

  /** Jupiter 프로그램 메인 주소 (v6 AMM) */
  static readonly JUPITER_PROGRAM_ID = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'

  /** Jupiter API 기본 URL */
  private readonly apiBaseUrl: string

  /** Jupiter API 키 (선택적, rate limit 완화용) */
  private readonly apiKey?: string

  /** 설정값 */
  private readonly config: JupiterSwapConfig

  constructor(config?: Partial<JupiterSwapConfig>) {
    this.config = {
      apiBaseUrl: config?.apiBaseUrl ?? 'https://api.jup.ag',
      apiKey: config?.apiKey,
      defaultSlippageBps: config?.defaultSlippageBps ?? 50,
      maxSlippageBps: config?.maxSlippageBps ?? 500,
      maxPriceImpactPct: config?.maxPriceImpactPct ?? 1.0,
      jitoTipLamports: config?.jitoTipLamports ?? 1000,
      maxJitoTipLamports: config?.maxJitoTipLamports ?? 100_000,
      requestTimeoutMs: config?.requestTimeoutMs ?? 10_000,
    }
    this.apiBaseUrl = this.config.apiBaseUrl
    this.apiKey = this.config.apiKey
  }

  readonly metadata: ActionProviderMetadata = {
    name: 'jupiter_swap',
    description: 'Jupiter DEX aggregator for Solana token swaps. ' +
      'Routes across 20+ DEXs (Raydium, Orca, Meteora, etc.) for optimal pricing.',
    version: '1.0.0',
    chains: ['solana'],
    mcpExpose: true,
    requiredApis: ['Jupiter Quote API (https://api.jup.ag/swap/v1/quote)'],
  }

  readonly actions: readonly ActionDefinition[] = [
    {
      name: 'jupiter_swap',
      description: 'Swap tokens on Solana via Jupiter aggregator. ' +
        'Fetches optimal route across 20+ DEXs, applies slippage protection, ' +
        'and returns a ContractCallRequest for the existing pipeline. ' +
        'Input amount is in the smallest unit of the input token (e.g., lamports for SOL).',
      chain: 'solana',
      inputSchema: JupiterSwapInputSchema,
      riskLevel: 'high',
      defaultTier: 'APPROVAL',
    },
  ]

  // resolve() -- 섹션 3에서 상세 설계
  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest> {
    // 섹션 3 참조
    throw new Error('Implementation in section 3')
  }
}
```

### 2.2 설정 인터페이스

```typescript
/**
 * Jupiter Swap 설정.
 * config.toml의 [actions.jupiter_swap] 섹션에서 로드한다.
 */
interface JupiterSwapConfig {
  /** Jupiter API 기본 URL (기본: https://api.jup.ag) */
  apiBaseUrl: string

  /** Jupiter API 키 (선택적, rate limit 완화용) */
  apiKey?: string

  /** 기본 슬리피지 (basis points). 기본: 50 (0.5%) */
  defaultSlippageBps: number

  /** 최대 슬리피지 상한 (basis points). 기본: 500 (5%) */
  maxSlippageBps: number

  /** 가격 영향 상한 (%). 기본: 1.0 */
  maxPriceImpactPct: number

  /** Jito MEV 보호 팁 (lamports). 기본: 1000 */
  jitoTipLamports: number

  /** Jito MEV 보호 팁 상한 (lamports). 기본: 100000 */
  maxJitoTipLamports: number

  /** 외부 API 요청 타임아웃 (밀리초). 기본: 10000 */
  requestTimeoutMs: number
}
```

### 2.3 입력 스키마

```typescript
/**
 * Jupiter Swap 입력 스키마.
 *
 * AI 에이전트가 MCP Tool 또는 REST API로 전달하는 파라미터.
 * Zod 스키마 기반이므로 MCP SDK가 JSON Schema로 자동 변환한다.
 */
export const JupiterSwapInputSchema = z.object({
  /**
   * 입력 토큰 민트 주소 (Base58).
   * 예: SOL = 'So11111111111111111111111111111111111111112'
   *     USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
   */
  inputMint: z.string()
    .min(32, 'Solana 주소는 최소 32자')
    .max(44, 'Solana 주소는 최대 44자')
    .describe('Input token mint address (Base58). e.g., So11... for SOL'),

  /**
   * 출력 토큰 민트 주소 (Base58).
   */
  outputMint: z.string()
    .min(32, 'Solana 주소는 최소 32자')
    .max(44, 'Solana 주소는 최대 44자')
    .describe('Output token mint address (Base58). e.g., EPjF... for USDC'),

  /**
   * 스왑 입력 금액 (최소 단위 문자열).
   * 예: 1 SOL = '1000000000' (10^9 lamports)
   *     100 USDC = '100000000' (10^6, USDC decimals=6)
   *
   * bigint 호환을 위해 문자열로 전달.
   */
  amount: z.string()
    .regex(/^\d+$/, '양의 정수 문자열이어야 합니다')
    .refine((val) => BigInt(val) > 0n, '금액은 0보다 커야 합니다')
    .describe('Amount to swap in smallest unit (lamports for SOL, base units for SPL tokens)'),

  /**
   * 슬리피지 허용 범위 (basis points).
   * 1 bps = 0.01%.
   * 기본: 50 (0.5%), 최대: 500 (5%).
   *
   * AI 에이전트가 지정하지 않으면 기본값 50이 적용된다.
   */
  slippageBps: z.number()
    .int()
    .min(1, '슬리피지는 최소 1 bps')
    .max(500, '슬리피지는 최대 500 bps (5%)')
    .default(50)
    .describe('Slippage tolerance in basis points. 50 = 0.5% (default). Max: 500 = 5%.'),
})

export type JupiterSwapInput = z.infer<typeof JupiterSwapInputSchema>
```

### 2.4 주요 설계 결정

| 결정 | 선택 | 대안 | 근거 |
|------|------|------|------|
| inputMint/outputMint 형식 | Base58 문자열 | symbol (SOL, USDC) | 민트 주소가 모호함 없이 토큰을 식별. symbol은 동명 토큰 충돌 위험 |
| amount 형식 | 문자열 (최소 단위) | 숫자 (사람 단위) | bigint 정밀도 보존. 소수점 연산 오류 방지. 기존 TransferRequest와 일관 |
| slippageBps 상한 | 500 (5%) | 무제한 | 5% 초과 슬리피지는 MEV 공격에 과도하게 노출. Jupiter 기본값도 50bps |
| riskLevel | high | medium | 토큰 스왑은 자산 변환을 수반. 슬리피지/MEV 위험. DeFi 상호작용 |
| defaultTier | APPROVAL | DELAY | DeFi 컨트랙트 호출은 Owner 승인이 기본. CONTRACT_CALL 기본 티어와 일치 |

---

## 3. resolve() 상세 흐름 (ACTION-04)

### 3.1 전체 6단계 흐름

```
┌──────────────────────────────────────────────────────────────┐
│  Step 1: 입력 검증 (inputSchema.parse)                        │
│  inputMint, outputMint, amount, slippageBps 검증             │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Step 2: Jupiter Quote API 호출                               │
│  GET /swap/v1/quote?inputMint=...&outputMint=...&amount=...  │
│  응답: outAmount, priceImpactPct, routePlan                  │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Step 3: Quote 결과 검증                                      │
│  - priceImpactPct <= 1.0% 확인                               │
│  - outAmount > 0 확인                                        │
│  - routePlan이 비어있지 않은지 확인                            │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Step 4: Jupiter /swap-instructions API 호출                  │
│  POST /swap/v1/swap-instructions                             │
│  요청: quoteResponse, userPublicKey, jitoTipLamports          │
│  응답: swapInstruction, computeBudgetInstructions, etc.       │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Step 5: ContractCallRequest 변환                             │
│  swapInstruction -> { programId, instructionData, accounts }  │
│  from = context.walletAddress                                │
│  to = Jupiter 프로그램 주소                                    │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Step 6: ContractCallRequestSchema Zod 검증                   │
│  반환 전 최종 스키마 검증 (방어적 프로그래밍)                   │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 상세 구현

```typescript
async resolve(
  actionName: string,
  params: Record<string, unknown>,
  context: ActionContext,
): Promise<ContractCallRequest> {
  if (actionName !== 'jupiter_swap') {
    throw new ActionNotFoundError(actionName, this.metadata.name)
  }

  // ── Step 1: 입력 검증 ──
  const input = JupiterSwapInputSchema.parse(params)

  // 슬리피지 상한 적용 (config.maxSlippageBps)
  const effectiveSlippage = Math.min(input.slippageBps, this.config.maxSlippageBps)

  // inputMint === outputMint 방지
  if (input.inputMint === input.outputMint) {
    throw new ActionValidationError('jupiter_swap', new z.ZodError([{
      code: 'custom',
      path: ['outputMint'],
      message: 'inputMint과 outputMint이 동일합니다. 다른 토큰을 지정하세요.',
    }]))
  }

  // ── Step 2: Jupiter Quote API 호출 ──
  const quote = await this.fetchQuote(input, effectiveSlippage)

  // ── Step 3: Quote 결과 검증 ──
  this.validateQuote(quote, input)

  // ── Step 4: Jupiter /swap-instructions API 호출 ──
  const swapInstructions = await this.fetchSwapInstructions(quote, context)

  // ── Step 5: ContractCallRequest 변환 ──
  const contractCall = this.buildContractCallRequest(swapInstructions, context)

  // ── Step 6: Zod 검증 (방어적) ──
  // 실제로는 ActionProviderRegistry.executeResolve()에서도 검증하지만,
  // 프로바이더 자체에서도 사전 검증하여 디버깅을 용이하게 한다.
  return ContractCallRequestSchema.parse(contractCall)
}
```

### 3.3 Step 2: Jupiter Quote API 호출

```typescript
/**
 * Jupiter Quote API v1 호출.
 *
 * 엔드포인트: GET /swap/v1/quote
 * 문서: https://dev.jup.ag/api-reference/swap/quote
 *
 * 주요 파라미터:
 * - inputMint: 입력 토큰 민트 주소
 * - outputMint: 출력 토큰 민트 주소
 * - amount: 입력 금액 (최소 단위)
 * - slippageBps: 슬리피지 허용 범위
 * - restrictIntermediateTokens: true (안전한 중간 토큰만 사용)
 */
private async fetchQuote(
  input: JupiterSwapInput,
  slippageBps: number,
): Promise<JupiterQuoteResponse> {
  const url = new URL(`${this.apiBaseUrl}/swap/v1/quote`)
  url.searchParams.set('inputMint', input.inputMint)
  url.searchParams.set('outputMint', input.outputMint)
  url.searchParams.set('amount', input.amount)
  url.searchParams.set('slippageBps', String(slippageBps))
  url.searchParams.set('restrictIntermediateTokens', 'true')

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  }
  if (this.apiKey) {
    headers['x-api-key'] = this.apiKey
  }

  const response = await fetch(url.toString(), {
    headers,
    signal: AbortSignal.timeout(this.config.requestTimeoutMs),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new ActionResolveError(
      'jupiter_swap',
      `Jupiter Quote API 실패 (HTTP ${response.status}): ${errorBody}`,
    )
  }

  const data = await response.json()
  return JupiterQuoteResponseSchema.parse(data)
}
```

### 3.4 Step 3: Quote 결과 검증

```typescript
/**
 * Quote 결과 검증.
 *
 * 검증 항목:
 * 1. outAmount > 0 (스왑 결과가 존재)
 * 2. priceImpactPct <= maxPriceImpactPct (가격 영향 상한)
 * 3. routePlan이 비어있지 않음 (라우트 존재)
 */
private validateQuote(
  quote: JupiterQuoteResponse,
  input: JupiterSwapInput,
): void {
  // 1. outAmount 검증
  if (BigInt(quote.outAmount) === 0n) {
    throw new ActionResolveError(
      'jupiter_swap',
      `스왑 결과 금액이 0입니다. 유동성이 부족하거나 토큰 페어가 지원되지 않습니다. ` +
      `inputMint: ${input.inputMint}, outputMint: ${input.outputMint}`,
    )
  }

  // 2. priceImpactPct 검증
  const priceImpact = parseFloat(quote.priceImpactPct)
  if (priceImpact > this.config.maxPriceImpactPct) {
    throw new ActionResolveError(
      'jupiter_swap',
      `가격 영향이 너무 높습니다: ${quote.priceImpactPct}% (상한: ${this.config.maxPriceImpactPct}%). ` +
      `더 작은 금액으로 나누어 스왑하거나, 유동성이 더 큰 토큰 페어를 사용하세요.`,
    )
  }

  // 3. priceImpactPct가 음수인 경우 (유리한 가격 차이) -- 허용
  // 양수만 위험 (불리한 가격 차이)

  // 4. routePlan 존재 검증
  if (!quote.routePlan || quote.routePlan.length === 0) {
    throw new ActionResolveError(
      'jupiter_swap',
      `스왑 라우트를 찾을 수 없습니다. 토큰 페어가 지원되지 않을 수 있습니다.`,
    )
  }
}
```

### 3.5 Step 4: Jupiter /swap-instructions API 호출

```typescript
/**
 * Jupiter /swap-instructions API 호출.
 *
 * **왜 /swap 대신 /swap-instructions를 사용하는가:**
 *
 * /swap 엔드포인트는 완전히 직렬화된 트랜잭션(Base64)을 반환한다.
 * 이 직렬화된 트랜잭션은:
 * 1. 이미 feePayer가 설정되어 있음 (userPublicKey)
 * 2. 이미 recentBlockhash가 설정되어 있음 (서버 측에서 조회)
 * 3. ContractCallRequest의 programId/instructionData/accounts 형태로 분해 불가
 *
 * resolve-then-execute 패턴에서는 ContractCallRequest를 반환해야 하므로,
 * 개별 instruction을 제공하는 /swap-instructions를 사용한다.
 *
 * /swap-instructions의 장점:
 * - instruction 수준 데이터 제공 (programId, data, accounts)
 * - 데몬이 자체적으로 트랜잭션 빌드 (recentBlockhash, feePayer 설정)
 * - IChainAdapter.buildContractCall()의 pipe 패턴과 호환
 * - computeBudget, setup, cleanup instruction을 선택적으로 추가 가능
 *
 * 엔드포인트: POST /swap/v1/swap-instructions
 */
private async fetchSwapInstructions(
  quote: JupiterQuoteResponse,
  context: ActionContext,
): Promise<JupiterSwapInstructionsResponse> {
  const url = `${this.apiBaseUrl}/swap/v1/swap-instructions`

  // Jito 팁 검증
  const jitoTip = Math.min(this.config.jitoTipLamports, this.config.maxJitoTipLamports)

  const requestBody = {
    quoteResponse: quote,
    userPublicKey: context.walletAddress,
    prioritizationFeeLamports: {
      jitoTipLamports: jitoTip,
    },
    // dynamicComputeUnitLimit: true,  // Jupiter가 CU 자동 최적화
    // dynamicSlippage: false,          // 명시적 슬리피지 사용 (dynamicSlippage는 quote에서 이미 적용)
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
  if (this.apiKey) {
    headers['x-api-key'] = this.apiKey
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(this.config.requestTimeoutMs),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new ActionResolveError(
      'jupiter_swap',
      `Jupiter Swap Instructions API 실패 (HTTP ${response.status}): ${errorBody}`,
    )
  }

  const data = await response.json()
  return JupiterSwapInstructionsResponseSchema.parse(data)
}
```

### 3.6 Step 5: ContractCallRequest 변환

```typescript
/**
 * Jupiter swap instruction -> ContractCallRequest 변환.
 *
 * swapInstruction은 Jupiter의 핵심 스왑 instruction이다.
 * 이를 CHAIN-EXT-03에서 정의한 ContractCallRequest 형태로 변환한다.
 *
 * 변환 매핑:
 * - programId (Jupiter swapInstruction.programId) -> ContractCallRequest.programId + to
 * - data (Base64) -> ContractCallRequest.instructionData
 * - accounts (pubkey/isSigner/isWritable) -> ContractCallRequest.accounts
 * - context.walletAddress -> ContractCallRequest.from
 *
 * 주의: setupInstructions, computeBudgetInstructions, cleanupInstruction은
 * ContractCallRequest에 포함하지 않는다. 이들은 IChainAdapter.buildContractCall()에서
 * 파이프라인 빌드 시 자동으로 추가된다 (computeUnit, priorityFee 등).
 *
 * 향후 확장: 여러 instruction을 BatchRequest로 변환하는 방안도 고려 가능하나,
 * v0.6에서는 핵심 swapInstruction만 ContractCallRequest로 변환한다.
 */
private buildContractCallRequest(
  swapInstructions: JupiterSwapInstructionsResponse,
  context: ActionContext,
): ContractCallRequest {
  const { swapInstruction } = swapInstructions

  // programId 검증: Jupiter 프로그램 주소 확인
  if (swapInstruction.programId !== JupiterSwapActionProvider.JUPITER_PROGRAM_ID) {
    // Jupiter API가 예상과 다른 프로그램을 반환한 경우
    // 보안 경고: 중간자 공격 또는 API 변조 가능성
    throw new ActionResolveError(
      'jupiter_swap',
      `예상하지 않은 프로그램 주소: ${swapInstruction.programId}. ` +
      `예상: ${JupiterSwapActionProvider.JUPITER_PROGRAM_ID}. ` +
      `Jupiter API 응답이 변조되었을 수 있습니다.`,
    )
  }

  return {
    from: context.walletAddress,
    to: swapInstruction.programId,
    programId: swapInstruction.programId,
    instructionData: swapInstruction.data,  // Base64 인코딩
    accounts: swapInstruction.accounts.map((acc) => ({
      address: acc.pubkey,
      isSigner: acc.isSigner,
      isWritable: acc.isWritable,
    })),
  }
}
```

### 3.7 /swap 엔드포인트 미사용 이유 상세

| 비교 항목 | POST /swap | POST /swap-instructions |
|----------|-----------|----------------------|
| 반환 형태 | `swapTransaction` (Base64 직렬화 전체 트랜잭션) | `swapInstruction` (개별 instruction 데이터) |
| ContractCallRequest 변환 | 불가능 (역직렬화 필요) | 직접 변환 가능 |
| feePayer | Jupiter 서버가 설정 | 데몬이 직접 설정 |
| recentBlockhash | Jupiter 서버가 조회 | 데몬이 직접 조회 |
| 정책 평가 호환성 | 낮음 (직렬화 상태에서 컨트랙트 주소 추출 어려움) | 높음 (programId 직접 접근) |
| 트랜잭션 커스터마이징 | 불가능 | 가능 (computeUnit, 추가 instruction 등) |

**결론:** `/swap-instructions`가 resolve-then-execute 패턴과 완벽히 호환된다.

### 3.8 Fallback 경로

```
정상 경로:
  Quote API -> /swap-instructions -> ContractCallRequest -> 파이프라인

Fallback 경로 (향후 v0.7+, 현재 미구현):
  Quote API -> /swap -> swapTransaction(Base64)
    -> VersionedTransaction.deserialize()
    -> instruction 추출
    -> ContractCallRequest 재구성

현재 v0.6에서는 /swap-instructions 단일 경로만 지원한다.
Fallback 경로는 /swap-instructions 엔드포인트 장애 시 대안으로 설계해두되,
직렬화된 트랜잭션 역직렬화의 복잡성과 보안 위험 때문에 v0.6에서는 구현하지 않는다.
```

---

## 4. 슬리피지 보호

### 4.1 슬리피지 개요

슬리피지(slippage)는 주문 시점의 예상 가격과 실제 체결 가격 간의 차이다. DEX에서는 AMM(자동 시장 메이커) 풀의 유동성과 거래 크기에 따라 발생한다.

```
예상 가격: 1 SOL = 150 USDC
슬리피지 50bps (0.5%):
  최소 수령량: 150 * (1 - 0.005) = 149.25 USDC
  이보다 적게 받으면 트랜잭션 실패 (온체인 revert)
```

### 4.2 3단계 슬리피지 보호 체계

```
┌────────────────────────────────────────────┐
│ Layer 1: inputSchema 검증                    │
│ slippageBps: min(1) max(500) default(50)    │
│ → 에이전트가 비합리적 슬리피지 설정 방지      │
└────────────────────┬───────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────┐
│ Layer 2: Quote API priceImpactPct 검증       │
│ priceImpactPct <= 1.0% 상한                  │
│ → 유동성 부족으로 인한 과도한 가격 영향 방지  │
└────────────────────┬───────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────┐
│ Layer 3: 온체인 슬리피지 보호               │
│ Jupiter instruction에 minimumOutAmount 포함 │
│ → 실제 체결 시 최소 수령량 미달하면 revert   │
└────────────────────────────────────────────┘
```

### 4.3 슬리피지 설정 가이드

| 시나리오 | 권장 slippageBps | 근거 |
|---------|-----------------|------|
| SOL <-> USDC (메이저 페어) | 50 (0.5%) | 높은 유동성, 낮은 슬리피지 |
| USDC <-> USDT (스테이블 페어) | 10 (0.1%) | 페그 유지, 매우 낮은 변동 |
| 소규모 밈코인 | 100-300 (1-3%) | 낮은 유동성, 높은 변동성 |
| 대규모 거래 (>100 SOL) | 100 (1%) | 가격 영향이 클 수 있음 |

### 4.4 priceImpactPct 상한 설정

```typescript
// priceImpactPct = (시장 가격 대비 실제 체결 가격의 차이 %)
//
// 예: 시장 가격 1 SOL = 150 USDC
//     실제 체결: 1 SOL = 147 USDC
//     priceImpactPct = (150 - 147) / 150 * 100 = 2.0%
//
// 상한: 1.0%
// 근거:
// - 1% 초과 가격 영향은 유동성 부족 또는 비정상 시장 상태를 의미
// - MEV 봇의 샌드위치 공격 시 가격 영향이 급증
// - 대규모 거래는 분할 실행(DCA)을 권장

// config.toml에서 설정 가능
// [actions.jupiter_swap]
// max_price_impact_pct = 1.0
```

### 4.5 슬리피지 조작 시나리오 방어

| 공격 | 방어 | 레이어 |
|------|------|--------|
| 에이전트가 5000bps (50%) 슬리피지 설정 | inputSchema max(500) + config.maxSlippageBps | Layer 1 |
| MEV 봇 프론트러닝 | Jito MEV 보호 (섹션 5) | Layer 3 |
| 유동성 풀 조작 후 스왑 유도 | priceImpactPct 1% 상한 | Layer 2 |
| dynamicSlippage 악용 | 명시적 slippageBps 사용 (dynamic 미사용) | Layer 1 |

---

## 5. MEV 보호

### 5.1 MEV 공격 유형

Solana DEX 스왑에서 발생할 수 있는 MEV(Maximal Extractable Value) 공격:

| 공격 유형 | 설명 | 피해 |
|----------|------|------|
| **프론트러닝** | 사용자 트랜잭션 전에 동일 방향 거래 삽입 | 가격 상승 후 사용자가 높은 가격에 매수 |
| **백러닝** | 사용자 트랜잭션 후에 반대 방향 거래 삽입 | 가격 차익 추출 |
| **샌드위치 공격** | 프론트러닝 + 백러닝 조합 | 사용자가 최악의 가격에 체결 |

### 5.2 Jito 통합

Jito는 Solana의 MEV 인프라 프로바이더로, 블록 엔진을 통해 트랜잭션을 직접 밸리데이터에게 전송하여 공개 mempool을 우회한다.

```typescript
// Jupiter /swap-instructions 요청 시 Jito 팁 설정
const requestBody = {
  quoteResponse: quote,
  userPublicKey: context.walletAddress,
  prioritizationFeeLamports: {
    jitoTipLamports: 1000,  // Jito 팁 (lamports)
  },
}
```

**Jito 통합의 동작 원리:**

```
일반 경로 (MEV 취약):
  트랜잭션 → 공개 mempool → 밸리데이터
  (mempool에서 MEV 봇이 프론트러닝)

Jito 경로 (MEV 보호):
  트랜잭션 → Jito 블록 엔진 → 밸리데이터 (직접 전달)
  (공개 mempool 미경유, 프론트러닝 불가)
```

### 5.3 Jito 팁 설정

```typescript
// Jito 팁 = 밸리데이터에게 직접 지불하는 수수료
// 높을수록 트랜잭션 포함 우선순위 상승

// 기본값: 1000 lamports (0.000001 SOL = ~$0.0002)
// 상한: 100000 lamports (0.0001 SOL = ~$0.02)

// config.toml에서 설정 가능
// [actions.jupiter_swap]
// jito_tip_lamports = 1000        # 기본 팁
// max_jito_tip_lamports = 100000  # 팁 상한
```

| 팁 수준 | lamports | SOL | 용도 |
|---------|----------|-----|------|
| 최소 | 1,000 | 0.000001 | 일반 스왑 |
| 중간 | 10,000 | 0.00001 | 대규모 스왑 |
| 높음 | 100,000 | 0.0001 | 긴급 스왑 (블록 포함 보장) |
| 상한 초과 | >100,000 | >0.0001 | **거부** (비용 대비 이익 없음) |

### 5.4 config.toml 설정과의 연동

```toml
[actions.jupiter_swap]
# Jito MEV 보호
jito_tip_lamports = 1000        # 기본 Jito 팁 (lamports)
max_jito_tip_lamports = 100000  # Jito 팁 상한 (lamports)
```

팁 상한(`max_jito_tip_lamports`)은 악의적 에이전트가 과도한 팁을 설정하여 불필요한 비용을 발생시키는 것을 방지한다.

---

## 6. 보안 가이드라인

### 6.1 Jupiter 프로그램 주소 화이트리스트

JupiterSwapActionProvider가 반환하는 ContractCallRequest의 `to` (= `programId`)는 항상 Jupiter 프로그램 주소여야 한다.

```typescript
// Jupiter v6 AMM 프로그램 주소
const JUPITER_PROGRAM_ID = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'

// 추가로 알려진 Jupiter 관련 프로그램
const JUPITER_RELATED_PROGRAMS = {
  JUPITER_V6: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  JUPITER_LIMIT_ORDER: 'jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu',
  JUPITER_DCA: 'DCA265Vj8a9CEuX1eb1LWRnDT7uK6q1xMipnNyatn23M',
}
```

**CONTRACT_WHITELIST 설정 예시:**

에이전트가 Jupiter 스왑을 사용하려면, Owner가 해당 에이전트의 CONTRACT_WHITELIST 정책에 Jupiter 프로그램 주소를 추가해야 한다.

```json
{
  "type": "CONTRACT_WHITELIST",
  "rules": {
    "allowed_contracts": [
      {
        "address": "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
        "label": "Jupiter v6 AMM",
        "chain": "solana"
      }
    ]
  }
}
```

### 6.2 연속 스왑 감지

동일 에이전트가 짧은 시간 내에 반복적으로 스왑을 요청하는 패턴은 워시 트레이딩(wash trading) 또는 자동화된 공격의 징후일 수 있다.

```typescript
// 연속 스왑 감지 규칙 (AutoStopEngine 확장, CHAIN-EXT-08 참고)
//
// 규칙: 5분 내 동일 에이전트의 jupiter_swap 3회 초과 시 경고
// 규칙: 10분 내 동일 토큰 페어 역방향 스왑 감지 시 경고
//   예: SOL->USDC, USDC->SOL 연속 실행 = 워시 트레이딩 의심
//
// 이 규칙은 AutoStopEngine(36-killswitch-autostop-evm.md)의
// velocity 규칙 유형으로 구현할 수 있다.
//
// Phase 25에서 상세 설계.
```

### 6.3 API 키 보안

Jupiter API 키는 config.toml에 저장된다. 보안 고려사항:

| 위험 | 대응 |
|------|------|
| config.toml에 평문 API 키 | 파일 권한 600 (소유자만 읽기), ~/.waiaas/ 디렉토리 권한 700 |
| API 키 유출 시 | Jupiter API 키 재발급 (무료). 과금 없는 API이므로 재정적 위험 낮음 |
| API 키 없이 사용 | 가능. rate limit이 더 엄격할 수 있으나 기본 사용에는 충분 |

### 6.4 resolve() 반환값 보안 검증 체크리스트

| 검증 항목 | 검증 주체 | 위치 |
|----------|----------|------|
| ContractCallRequestSchema 구조 | resolve() 내부 + Registry | Step 6, CHAIN-EXT-07 섹션 2.6 |
| from === walletAddress | Registry.validateResolveResult() | CHAIN-EXT-07 섹션 2.6 |
| programId === JUPITER_PROGRAM_ID | resolve() 내부 | Step 5 |
| 파이프라인 CONTRACT_WHITELIST | DatabasePolicyEngine Stage 3 | CHAIN-EXT-03 섹션 4 |
| 세션 allowedContracts | 파이프라인 Stage 2 | TX-PIPE 섹션 3 |

---

## 7. 에러 처리

### 7.1 Jupiter Swap 전용 에러 코드

기존 Action Provider 에러 코드(CHAIN-EXT-07 섹션 7)에 추가하여, Jupiter Swap 전용 에러 상세를 정의한다.

| 에러 코드 | HTTP | 설명 | 재시도 |
|----------|------|------|--------|
| `JUPITER_QUOTE_FAILED` | 502 | Jupiter Quote API 호출 실패 | O |
| `JUPITER_SWAP_INSTRUCTIONS_FAILED` | 502 | Jupiter /swap-instructions 호출 실패 | O |
| `JUPITER_PRICE_IMPACT_TOO_HIGH` | 400 | priceImpactPct > maxPriceImpactPct | X |
| `JUPITER_NO_ROUTE` | 400 | 스왑 라우트 없음 (유동성 부족 또는 토큰 미지원) | X |
| `JUPITER_PROGRAM_MISMATCH` | 500 | 반환된 programId가 Jupiter 주소와 불일치 (보안 위험) | X |

### 7.2 에러 코드 매핑

```typescript
// ACTION_RESOLVE_FAILED의 하위 에러로 매핑

// 기존 에러 체계:
//   ACTION_RESOLVE_FAILED (502) -- 일반적인 외부 API 실패
//
// Jupiter 전용 상세:
//   JUPITER_QUOTE_FAILED: ACTION_RESOLVE_FAILED의 특수 케이스
//   JUPITER_SWAP_INSTRUCTIONS_FAILED: ACTION_RESOLVE_FAILED의 특수 케이스
//   JUPITER_PRICE_IMPACT_TOO_HIGH: ACTION_VALIDATION_FAILED의 특수 케이스 (입력이 아닌 결과 검증)
//   JUPITER_NO_ROUTE: ACTION_VALIDATION_FAILED의 특수 케이스
//   JUPITER_PROGRAM_MISMATCH: ACTION_RETURN_INVALID의 특수 케이스 (보안)

// REST API 응답 예시
{
  "error": {
    "code": "ACTION_RESOLVE_FAILED",
    "message": "액션 'jupiter_swap' 실행 실패: Jupiter Quote API 실패 (HTTP 429)",
    "details": {
      "actionName": "jupiter_swap",
      "reason": "Jupiter Quote API 실패 (HTTP 429)",
      "jupiterError": "JUPITER_QUOTE_FAILED"
    }
  }
}
```

### 7.3 에러 발생 시점과 복구 전략

| 에러 | 발생 시점 | 복구 전략 |
|------|----------|----------|
| JUPITER_QUOTE_FAILED | Step 2 (Quote API) | 재시도 (최대 2회, 5초 간격) |
| JUPITER_SWAP_INSTRUCTIONS_FAILED | Step 4 (/swap-instructions) | 재시도 (최대 2회, 5초 간격) |
| JUPITER_PRICE_IMPACT_TOO_HIGH | Step 3 (검증) | 금액 축소 후 재시도 권장 |
| JUPITER_NO_ROUTE | Step 3 (검증) | 다른 토큰 페어 사용 권장 |
| JUPITER_PROGRAM_MISMATCH | Step 5 (변환) | 재시도 불가. 관리자에게 보고 |

---

## 8. 향후 확장 (0x Swap EVM)

### 8.1 0x Swap Action Provider 개요

향후 EVM 체인 스왑을 위한 0x Swap API v2 기반 Action Provider를 추가할 수 있다.

```typescript
// 향후: packages/actions/src/providers/0x-swap.ts (참고용)

class ZeroXSwapActionProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata = {
    name: '0x_swap',
    description: '0x DEX aggregator for EVM token swaps',
    version: '1.0.0',
    chains: ['ethereum'],  // polygon, arbitrum 등 추가 가능
    mcpExpose: true,
    requiredApis: ['0x Swap API v2 (https://api.0x.org)'],
  }

  readonly actions: readonly ActionDefinition[] = [{
    name: '0x_swap',
    description: 'Swap tokens on Ethereum via 0x aggregator.',
    chain: 'ethereum',
    inputSchema: z.object({
      sellToken: z.string().describe('Token address to sell (0x hex)'),
      buyToken: z.string().describe('Token address to buy (0x hex)'),
      sellAmount: z.string().describe('Amount to sell in smallest unit (wei)'),
      slippagePercentage: z.number().min(0.001).max(0.05).default(0.01)
        .describe('Slippage percentage (0.01 = 1%)'),
    }),
    riskLevel: 'high',
    defaultTier: 'APPROVAL',
  }]

  async resolve(actionName, params, context): Promise<ContractCallRequest> {
    // 1. 0x Quote API 호출
    // GET https://api.0x.org/swap/permit2/quote?...

    // 2. Permit2/AllowanceHolder 패턴
    // 0x v2는 Permit2 기반 토큰 승인 사용

    // 3. ContractCallRequest 변환
    // return {
    //   from: context.walletAddress,
    //   to: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',  // 0x Exchange Proxy
    //   calldata: quote.data,  // ABI 인코딩된 호출 데이터
    //   value: quote.value ?? 0n,
    // }
    throw new Error('Not implemented in v0.6')
  }
}
```

### 8.2 Jupiter vs 0x 비교

| 항목 | Jupiter (Solana) | 0x (EVM) |
|------|-----------------|----------|
| API | api.jup.ag/swap/v1 | api.0x.org/swap/v2 |
| 라우팅 | 20+ Solana DEXs | 100+ EVM DEXs |
| 인증 | x-api-key (선택) | 0x-api-key (필수, 무료 티어) |
| 슬리피지 | bps (basis points) | percentage (소수) |
| 토큰 승인 | Solana delegate 모델 | Permit2/AllowanceHolder |
| MEV 보호 | Jito 통합 | Flashbots Protect (별도) |
| instruction | /swap-instructions | /swap/permit2/quote |
| 결과 | instruction 수준 | calldata (0x hex) |

### 8.3 구현 시 고려사항

0x Swap Action Provider 구현 시 추가로 고려해야 할 사항:

1. **Permit2 토큰 승인**: 0x v2는 Permit2 패턴을 사용. APPROVE 트랜잭션이 선행되어야 할 수 있음
2. **AllowanceHolder**: 일부 토큰은 AllowanceHolder 컨트랙트를 통한 승인 필요
3. **EVM gas 추정**: calldata 기반 gas 추정이 Jupiter보다 정확도 높음
4. **MEV 보호**: Flashbots Protect를 별도로 통합해야 함 (Jupiter의 Jito와 다른 패턴)

---

## 9. 테스트 / 보안 시나리오

### 9.1 테스트 레벨 분류

| 레벨 | 범위 | Mock 경계 | 예시 |
|------|------|----------|------|
| **Unit** | resolve() 각 단계 | Jupiter API Mock | Quote 검증, instruction 변환 |
| **Unit** | inputSchema 검증 | 없음 | Zod 스키마 테스트 |
| **Integration** | resolve() -> 파이프라인 | ChainAdapter Mock | 전체 흐름 |
| **E2E** | 에이전트 -> MCP -> 스왑 | Solana Devnet + Jupiter | 실제 토큰 스왑 |

### 9.2 Jupiter API Mock 전략

```typescript
// 테스트에서 Jupiter API를 Mock하는 전략

// 방법 1: fetch Mock (msw 또는 undici mock)
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

const jupiterMockServer = setupServer(
  // Quote API Mock
  http.get('https://api.jup.ag/swap/v1/quote', ({ request }) => {
    const url = new URL(request.url)
    const inputMint = url.searchParams.get('inputMint')
    const outputMint = url.searchParams.get('outputMint')
    const amount = url.searchParams.get('amount')

    return HttpResponse.json({
      inputMint,
      outputMint,
      inAmount: amount,
      outAmount: String(BigInt(amount!) * 150n),  // 1:150 비율
      priceImpactPct: '0.12',
      routePlan: [{
        swapInfo: { ammKey: 'MockAMM...', label: 'Raydium' },
        percent: 100,
      }],
    })
  }),

  // /swap-instructions Mock
  http.post('https://api.jup.ag/swap/v1/swap-instructions', () => {
    return HttpResponse.json({
      swapInstruction: {
        programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
        data: 'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',  // Base64 mock
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
```

### 9.3 보안 시나리오

#### 시나리오 1: 슬리피지 500bps 초과 시도

```typescript
test('slippageBps가 500을 초과하면 inputSchema 검증 실패', async () => {
  await expect(registry.executeResolve('jupiter_swap', {
    inputMint: 'So11111111111111111111111111111111111111112',
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: '1000000000',
    slippageBps: 5000,  // 50% -- 상한 초과
  }, context)).rejects.toThrow(ActionValidationError)
})
```

#### 시나리오 2: priceImpact 1% 초과

```typescript
test('priceImpactPct > 1%이면 ActionResolveError', async () => {
  // Jupiter Quote Mock: priceImpactPct = 2.5%
  mockJupiterQuote({ priceImpactPct: '2.5' })

  await expect(provider.resolve('jupiter_swap', validParams, context))
    .rejects.toThrow(ActionResolveError)
  // message: "가격 영향이 너무 높습니다: 2.5%"
})
```

#### 시나리오 3: inputMint === outputMint (동일 토큰 스왑)

```typescript
test('inputMint과 outputMint이 같으면 ActionValidationError', async () => {
  await expect(provider.resolve('jupiter_swap', {
    inputMint: 'So11111111111111111111111111111111111111112',
    outputMint: 'So11111111111111111111111111111111111111112',  // 동일
    amount: '1000000000',
  }, context)).rejects.toThrow(ActionValidationError)
})
```

#### 시나리오 4: Jupiter API 응답의 programId가 Jupiter 주소가 아님

```typescript
test('programId가 Jupiter 주소와 불일치하면 ActionResolveError (보안 경고)', async () => {
  // /swap-instructions Mock: 악의적 programId 반환
  mockJupiterSwapInstructions({
    swapInstruction: {
      programId: 'MaliciousProgram11111111111111111111111111',  // 위조
      data: 'AAAA',
      accounts: [],
    },
  })

  await expect(provider.resolve('jupiter_swap', validParams, context))
    .rejects.toThrow(ActionResolveError)
  // message: "예상하지 않은 프로그램 주소: MaliciousProgram..."
})
```

#### 시나리오 5: Jupiter API 타임아웃

```typescript
test('Jupiter API가 10초 내 응답하지 않으면 타임아웃', async () => {
  mockJupiterQuoteTimeout(15_000)  // 15초 지연

  await expect(provider.resolve('jupiter_swap', validParams, context))
    .rejects.toThrow()  // AbortError 또는 ActionResolveError
})
```

#### 시나리오 6: 유동성 부족 (outAmount = 0)

```typescript
test('outAmount가 0이면 ActionResolveError', async () => {
  mockJupiterQuote({ outAmount: '0', routePlan: [] })

  await expect(provider.resolve('jupiter_swap', validParams, context))
    .rejects.toThrow(ActionResolveError)
  // message: "스왑 결과 금액이 0입니다"
})
```

#### 시나리오 7: Jupiter API 429 (rate limit)

```typescript
test('Jupiter API 429 응답 시 ActionResolveError (retryable)', async () => {
  mockJupiterQuoteError(429, 'Rate limit exceeded')

  const error = await provider.resolve('jupiter_swap', validParams, context)
    .catch(e => e)

  expect(error).toBeInstanceOf(ActionResolveError)
  expect(error.code).toBe('ACTION_RESOLVE_FAILED')
  // retryable: true (502 상태 코드)
})
```

#### 시나리오 8: 정상 스왑 흐름 (성공 경로)

```typescript
test('정상 스왑: SOL -> USDC 성공', async () => {
  mockJupiterQuote({
    inputMint: 'So11111111111111111111111111111111111111112',
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    inAmount: '1000000000',
    outAmount: '150000000',
    priceImpactPct: '0.12',
    routePlan: [{ percent: 100 }],
  })

  mockJupiterSwapInstructions({
    swapInstruction: {
      programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
      data: 'AQAAAA==',
      accounts: [
        { pubkey: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', isSigner: false, isWritable: false },
      ],
    },
  })

  const result = await provider.resolve('jupiter_swap', {
    inputMint: 'So11111111111111111111111111111111111111112',
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: '1000000000',
    slippageBps: 50,
  }, context)

  // ContractCallRequest 검증
  expect(result.from).toBe(context.walletAddress)
  expect(result.to).toBe('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4')
  expect(result.programId).toBe('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4')
  expect(result.instructionData).toBeDefined()
  expect(result.accounts).toBeDefined()
  expect(result.accounts!.length).toBeGreaterThan(0)

  // Zod 스키마 검증 통과
  expect(() => ContractCallRequestSchema.parse(result)).not.toThrow()
})
```

#### 시나리오 9: 금액이 음수 또는 0

```typescript
test('amount가 0이면 inputSchema 검증 실패', async () => {
  await expect(registry.executeResolve('jupiter_swap', {
    inputMint: 'So11111111111111111111111111111111111111112',
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: '0',
    slippageBps: 50,
  }, context)).rejects.toThrow(ActionValidationError)
})
```

#### 시나리오 10: CONTRACT_WHITELIST에 Jupiter 주소 미등록

```typescript
test('Jupiter 프로그램 주소가 CONTRACT_WHITELIST에 없으면 파이프라인 Stage 3 거부', async () => {
  // resolve() 자체는 성공
  const contractCall = await provider.resolve('jupiter_swap', validParams, context)

  // 파이프라인 제출 시 Stage 3에서 거부
  const result = await transactionService.submit({
    type: 'CONTRACT_CALL',
    ...contractCall,
  })

  expect(result.status).toBe('CANCELLED')
  expect(result.error).toBe('CONTRACT_NOT_WHITELISTED')
})
```

### 9.4 테스트 시나리오 요약 매트릭스

| # | 시나리오 | 분류 | 검증 포인트 | 예상 결과 |
|---|---------|------|-----------|----------|
| 1 | 슬리피지 초과 | Unit | inputSchema max(500) | ActionValidationError |
| 2 | priceImpact 초과 | Unit | validateQuote() | ActionResolveError |
| 3 | 동일 토큰 스왑 | Unit | inputMint !== outputMint | ActionValidationError |
| 4 | programId 위조 | Security | JUPITER_PROGRAM_ID 검증 | ActionResolveError |
| 5 | API 타임아웃 | Integration | AbortSignal.timeout() | 타임아웃 에러 |
| 6 | 유동성 부족 | Unit | outAmount === 0 | ActionResolveError |
| 7 | API rate limit | Integration | HTTP 429 | ActionResolveError (retryable) |
| 8 | 정상 스왑 | Integration | 전체 흐름 | ContractCallRequest 반환 |
| 9 | 금액 0 | Unit | amount > 0 | ActionValidationError |
| 10 | 화이트리스트 미등록 | Integration | Stage 3 정책 | CANCELLED |

---

## 부록 A: Jupiter API 스키마

### A.1 Quote API 응답 스키마

```typescript
// Jupiter Quote API v1 응답

export const JupiterQuoteResponseSchema = z.object({
  /** 입력 토큰 민트 주소 */
  inputMint: z.string(),

  /** 출력 토큰 민트 주소 */
  outputMint: z.string(),

  /** 입력 금액 (최소 단위 문자열) */
  inAmount: z.string(),

  /** 예상 출력 금액 (최소 단위 문자열) */
  outAmount: z.string(),

  /** 가격 영향 (퍼센트 문자열, 예: "0.12") */
  priceImpactPct: z.string(),

  /** 슬리피지 적용 후 최소 수령량 (최소 단위 문자열) */
  otherAmountThreshold: z.string().optional(),

  /** 스왑 모드 */
  swapMode: z.enum(['ExactIn', 'ExactOut']).default('ExactIn'),

  /** 슬리피지 (basis points) */
  slippageBps: z.number(),

  /** 라우트 계획 */
  routePlan: z.array(z.object({
    swapInfo: z.object({
      ammKey: z.string(),
      label: z.string().optional(),
      inputMint: z.string(),
      outputMint: z.string(),
      inAmount: z.string(),
      outAmount: z.string(),
      feeAmount: z.string(),
      feeMint: z.string(),
    }).optional(),
    percent: z.number(),
  })),

  /** 플랫폼 수수료 */
  platformFee: z.object({
    amount: z.string(),
    feeBps: z.number(),
  }).optional(),
})

export type JupiterQuoteResponse = z.infer<typeof JupiterQuoteResponseSchema>
```

### A.2 /swap-instructions 응답 스키마

```typescript
// Jupiter /swap-instructions 응답

const JupiterInstructionSchema = z.object({
  /** 프로그램 주소 (Base58) */
  programId: z.string(),

  /** instruction 데이터 (Base64) */
  data: z.string(),

  /** 계정 목록 */
  accounts: z.array(z.object({
    pubkey: z.string(),
    isSigner: z.boolean(),
    isWritable: z.boolean(),
  })),
})

export const JupiterSwapInstructionsResponseSchema = z.object({
  /** 핵심 스왑 instruction */
  swapInstruction: JupiterInstructionSchema,

  /** Compute Budget instructions (CU 설정) */
  computeBudgetInstructions: z.array(JupiterInstructionSchema).optional().default([]),

  /** Setup instructions (ATA 생성 등) */
  setupInstructions: z.array(JupiterInstructionSchema).optional().default([]),

  /** Cleanup instruction (임시 계정 정리) */
  cleanupInstruction: JupiterInstructionSchema.nullable().optional().default(null),

  /** Address Lookup Table 주소 목록 */
  addressLookupTableAddresses: z.array(z.string()).optional().default([]),
})

export type JupiterSwapInstructionsResponse = z.infer<typeof JupiterSwapInstructionsResponseSchema>
```

---

## 부록 B: ContractCallRequest 변환 매핑

### B.1 Jupiter swapInstruction -> ContractCallRequest

```
Jupiter swapInstruction          ContractCallRequest (CHAIN-EXT-03)
─────────────────────            ─────────────────────────────────
programId                   →    to (= programId)
programId                   →    programId
data (Base64)               →    instructionData
accounts[].pubkey           →    accounts[].address
accounts[].isSigner         →    accounts[].isSigner
accounts[].isWritable       →    accounts[].isWritable
(context.walletAddress)     →    from
(없음, SOL 직접 첨부 없음)  →    value (undefined, 기본 0n)
(없음, EVM 전용)            →    calldata (undefined)
(없음, EVM 전용)            →    abi (undefined)
```

### B.2 변환 코드 요약

```typescript
function jupiterInstructionToContractCallRequest(
  instruction: JupiterInstruction,
  walletAddress: string,
): ContractCallRequest {
  return {
    from: walletAddress,
    to: instruction.programId,
    programId: instruction.programId,
    instructionData: instruction.data,
    accounts: instruction.accounts.map(acc => ({
      address: acc.pubkey,
      isSigner: acc.isSigner,
      isWritable: acc.isWritable,
    })),
  }
}
```

### B.3 setupInstructions 처리 방안

Jupiter의 setupInstructions에는 주로 ATA(Associated Token Account) 생성 instruction이 포함된다. 현재 v0.6에서는 setupInstructions를 ContractCallRequest에 포함하지 않는다.

```
향후 확장 방안:

방안 1: BatchRequest로 변환
  setupInstructions + swapInstruction을 BatchRequest로 묶어 파이프라인에 제출
  장점: 원자적 실행 보장 (ATA 생성 + 스왑이 하나의 트랜잭션)
  단점: BatchRequest(CHAIN-EXT-05)가 Solana 전용이므로 호환

방안 2: IChainAdapter.buildContractCall() 내부에서 자동 처리
  ContractCallRequest에 additionalInstructions 필드 추가
  장점: Action Provider가 단일 ContractCallRequest만 반환
  단점: ContractCallRequest 스키마 확장 필요

현재 v0.6에서는 방안 미선택. 구현 시 결정.
이유: ATA는 대부분 이미 존재하거나, 어댑터가 자동 생성할 수 있음.
```

---

## 부록 C: 설계 결정 기록

### C.1 /swap-instructions를 사용하기로 한 이유

24-RESEARCH.md Pitfall 5에서 식별된 문제:

> "/swap이 반환하는 swapTransaction은 이미 직렬화된 전체 트랜잭션(Base64)이라서, ContractCallRequest의 programId/instructionData/accounts 형태로 분해할 수 없다."

**대안 검토:**

| 방안 | 설명 | 채택 여부 |
|------|------|----------|
| /swap-instructions 사용 | 개별 instruction 수준 데이터 제공 | **채택** |
| /swap + VersionedTransaction.deserialize() | Base64 -> instruction 분해 | 미채택 (복잡, 보안 위험) |
| /swap + 전체 트랜잭션 그대로 제출 | 정책 평가 우회 | **미채택** (보안 원칙 위반) |

### C.2 priceImpactPct 상한을 1%로 설정한 이유

- 1% 미만: 대부분의 일반적 스왑에서 발생하는 정상 범위
- 1-5%: 유동성 부족 또는 대규모 거래로 인한 비정상 가격 영향
- 5% 초과: MEV 공격 또는 조작된 유동성 풀의 강한 징후

보수적으로 1%를 상한으로 설정하여, 비정상 가격 영향이 발생하는 스왑을 사전에 차단한다. config.toml에서 조정 가능하다.

### C.3 Jito 통합을 기본으로 한 이유

Jupiter 공식 문서에서 Jito MEV 보호를 권장한다. Jito 팁 1000 lamports (~$0.0002)의 비용으로 프론트러닝/샌드위치 공격을 방지할 수 있다. 비용 대비 보안 이점이 압도적이므로 기본 활성화로 설정했다.

---

*문서 끝. 작성일: 2026-02-08. CHAIN-EXT-08 Swap Action 상세 설계.*
