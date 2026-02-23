# Technology Stack: Jupiter Swap Action Provider (m28-01)

**Project:** WAIaaS Jupiter Swap — 첫 번째 내장 Action Provider
**Researched:** 2026-02-23
**Overall confidence:** HIGH (설계 문서 63 + 코드베이스 분석 + Jupiter API 공식 문서 기반)

## Existing Stack (DO NOT ADD)

이미 구현된 프레임워크 — 새로 추가할 필요 없음:

| Technology | Version | Role |
|-----------|---------|------|
| Node.js | 22 LTS | Runtime (ESM-only) |
| Zod | 3.x | Schema validation SSoT |
| @waiaas/core | latest | IActionProvider, ContractCallRequest types |
| @waiaas/daemon | latest | ActionProviderRegistry, pipeline |
| @solana/kit | 6.x | Solana adapter (signing, submitting) |
| Vitest | latest | Testing framework |

## New Stack Additions

### Jupiter API v1 (External API — NO npm dependency)

**Endpoints:**
- `GET /swap/v1/quote` — Quote API (best route, price impact, expected output)
- `POST /swap/v1/swap-instructions` — Individual instruction decomposition

**Integration method:** native `fetch()` + `AbortSignal.timeout(10_000)` + Zod response validation.

**Why no Jupiter SDK:** Jupiter JS SDK (`@jup-ag/api`) adds unnecessary bundle size. The 2 REST endpoints are simple enough for native fetch. Zod schemas provide runtime API drift detection.

**API Key:** Optional `x-api-key` header for rate limit relaxation. Stored in ApiKeyStore (AES-256-GCM encrypted DB).

### Jito MEV Protection (External API — NO npm dependency)

**Integration:** Via Jupiter `/swap-instructions` `prioritizationFeeLamports.jitoTipLamports` parameter. Jupiter handles Jito block engine submission internally when tip is provided.

**No direct Jito SDK needed:** Jupiter API abstracts Jito integration. We just pass `jitoTipLamports` in the request body.

### packages/actions/ (New Package)

**New monorepo package:** `@waiaas/actions` — independent package for built-in Action Providers.

**Dependencies:**
- `@waiaas/core` (peer) — IActionProvider, ContractCallRequest types
- `zod` (peer) — Schema definitions

**No additional npm packages required.** The entire Jupiter integration uses native Node.js APIs (fetch, AbortController, URL).

## Config Additions

```toml
[actions.jupiter_swap]
enabled = true
api_base_url = "https://api.jup.ag"
default_slippage_bps = 50
max_slippage_bps = 500
max_price_impact_pct = 1.0
jito_tip_lamports = 1000
max_jito_tip_lamports = 100000
request_timeout_ms = 10000
```

## What NOT to Add

| Technology | Reason |
|-----------|--------|
| @jup-ag/api (Jupiter SDK) | 불필요한 의존성. native fetch로 충분 |
| @jup-ag/dca-sdk | DCA는 m28-01 범위 외 |
| jito-ts | Jupiter API가 Jito 통합을 추상화 |
| @solana/web3.js | 레거시. @solana/kit 6.x 사용 중 |
| Any Raydium/Orca SDK | Jupiter가 20+ DEX를 집계. 개별 DEX SDK 불필요 |

## Integration Points with Existing Stack

1. **IActionProvider interface** → JupiterSwapActionProvider implements resolve()
2. **ActionProviderRegistry** → Built-in provider registration at daemon startup
3. **ContractCallRequest schema** → Solana-specific fields (programId, instructionData, accounts)
4. **MCP auto-mapping** → mcpExpose=true → `action_jupiter_swap_jupiter_swap` tool
5. **ApiKeyStore** → Jupiter API key encrypted storage
6. **config.toml loader** → [actions.jupiter_swap] section parsing
7. **SettingsService** → Runtime-adjustable settings (slippage, price impact)
