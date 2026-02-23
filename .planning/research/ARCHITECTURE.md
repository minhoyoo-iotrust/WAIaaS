# Architecture Patterns: Jupiter Swap Action Provider (m28-01)

**Domain:** Jupiter Swap integration into WAIaaS IActionProvider framework
**Researched:** 2026-02-23
**Source:** Codebase analysis (packages/core, packages/daemon), 설계 문서 63, m28-01 objective

## Existing Architecture (Unchanged)

### IActionProvider Framework (v1.5)
```
IActionProvider {
  metadata: ActionProviderMetadata
  actions: readonly ActionDefinition[]
  resolve(actionName, params, context): Promise<ContractCallRequest>
}
```

### ActionProviderRegistry (packages/daemon)
- `register(provider)` — 메타데이터 Zod 검증 + 이름 충돌 확인
- `executeResolve(key, params, context)` — 입력 검증 → resolve() → 결과 재검증
- `getMcpExposedActions()` — mcpExpose=true 필터링
- `loadPlugins(dir)` — ESM 플러그인 동적 로드

### 6-Stage Pipeline
```
validate → resolve → policy → sign → submit → confirm
            ↑
   ContractCallRequest from ActionProvider.resolve()
```

### ContractCallRequest (Solana Fields)
```typescript
{
  type: 'CONTRACT_CALL',
  from: string,           // wallet address
  to: string,             // program address
  programId: string,      // Solana program
  instructionData: string, // Base64 instruction data
  accounts: Array<{
    pubkey: string,
    isSigner: boolean,
    isWritable: boolean,
  }>,
  network?: string,
}
```

## New Architecture Components

### 1. packages/actions/ (New Package)

```
packages/actions/
├── package.json          # @waiaas/actions, peer deps: @waiaas/core, zod
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts          # Re-export all built-in providers
    ├── providers/
    │   └── jupiter-swap/
    │       ├── index.ts              # JupiterSwapActionProvider class
    │       ├── jupiter-api-client.ts # JupiterApiClient (fetch wrapper)
    │       ├── schemas.ts            # Zod schemas (input, quote, swap-instructions)
    │       └── config.ts             # JupiterSwapConfig type + defaults
    └── __tests__/
        ├── jupiter-swap.test.ts      # Provider resolve() tests
        ├── jupiter-api-client.test.ts # API client tests (msw mocks)
        └── schemas.test.ts           # Schema validation tests
```

### 2. JupiterSwapActionProvider Resolve Flow

```
AI Agent: "swap 10 SOL to USDC"
    │
    ▼
POST /v1/actions/jupiter_swap/jupiter_swap
    │
    ▼
ActionProviderRegistry.executeResolve()
    │ input validation (JupiterSwapInputSchema.parse)
    ▼
JupiterSwapActionProvider.resolve()
    │
    ├── Step 1: 입력 검증 + 슬리피지 상한 적용
    │
    ├── Step 2: GET /swap/v1/quote
    │   → inputMint, outputMint, amount, slippageBps
    │   ← outAmount, priceImpactPct, routePlan
    │
    ├── Step 3: Quote 검증 (priceImpact ≤ 1%, outAmount > 0)
    │
    ├── Step 4: POST /swap/v1/swap-instructions
    │   → quoteResponse, userPublicKey, jitoTipLamports
    │   ← swapInstruction, computeBudgetInstructions, etc.
    │
    ├── Step 5: swapInstruction → ContractCallRequest 변환
    │   programId, instructionData(base64), accounts
    │
    └── Step 6: ContractCallRequestSchema.parse() (방어적 재검증)
    │
    ▼
ContractCallRequest → 기존 6-stage pipeline
    (policy → sign → submit → confirm)
```

### 3. JupiterApiClient

```typescript
class JupiterApiClient {
  constructor(config: JupiterSwapConfig)

  async getQuote(params: QuoteParams): Promise<JupiterQuoteResponse>
  // GET /swap/v1/quote + Zod parse

  async getSwapInstructions(params: SwapInstructionsParams): Promise<SwapInstructionsResponse>
  // POST /swap/v1/swap-instructions + Zod parse
}
```

**Design decisions:**
- native fetch (no axios/got) — Node.js 22 built-in
- AbortSignal.timeout(10s) — request timeout
- Zod response validation — API drift detection
- x-api-key header (optional) — rate limit relaxation

### 4. Built-in Provider Registration

```typescript
// packages/daemon/src/lifecycle/daemon.ts — Step 4f 확장

// After ESM plugin loading:
import { JupiterSwapActionProvider } from '@waiaas/actions'

const jupiterConfig = this.loadActionConfig('jupiter_swap')
if (jupiterConfig?.enabled !== false) {
  const jupiter = new JupiterSwapActionProvider(jupiterConfig)
  this.actionProviderRegistry.register(jupiter)
}
```

**Key:** Built-in providers are registered in daemon startup, before ESM plugins.

### 5. Integration Points (Modified Files)

| File | Change | Type |
|------|--------|------|
| packages/daemon/src/lifecycle/daemon.ts | Built-in provider registration (Step 4f) | Modified |
| packages/daemon/src/infrastructure/config/loader.ts | [actions.jupiter_swap] section parsing | Modified |
| packages/daemon/package.json | @waiaas/actions dependency | Modified |
| skills/transactions.skill.md | Jupiter Swap usage documentation | Modified |
| packages/mcp/src/tools/action-provider.ts | No change (auto-discovery works) | Unchanged |
| packages/daemon/src/api/routes/actions.ts | No change (generic handler works) | Unchanged |

### 6. Suggested Build Order

1. **Phase 246:** Core implementation
   - JupiterSwapConfig, JupiterSwapInputSchema, API response schemas
   - JupiterApiClient (fetch wrapper + Zod validation)
   - JupiterSwapActionProvider (resolve flow)
   - Unit tests with msw mocks

2. **Phase 247:** Integration + DX
   - Built-in provider registration in daemon
   - config.toml parsing
   - MCP tool verification
   - SDK test
   - Skill file update
   - Policy integration tests (CONTRACT_WHITELIST, SPENDING_LIMIT)
