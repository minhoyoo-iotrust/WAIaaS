# Phase 246: Core Provider Implementation

## Goal
AI 에이전트가 Jupiter Swap을 요청하면 안전한 ContractCallRequest로 변환되어 기존 파이프라인에 진입할 수 있다.

## Plans

### Plan 246-01: packages/actions 패키지 기반 + 공통 유틸리티
**Files:**
- CREATE `packages/actions/package.json`
- CREATE `packages/actions/tsconfig.json`
- CREATE `packages/actions/tsconfig.build.json`
- CREATE `packages/actions/src/common/action-api-client.ts` — ActionApiClient base (fetch + AbortController + Zod)
- CREATE `packages/actions/src/common/slippage.ts` — SlippageBps/SlippagePct branded types + clamp
- CREATE `packages/actions/src/common/errors.ts` — DeFi ChainError codes
- EDIT `packages/core/src/errors/chain-error.ts` — 4개 DeFi 에러 코드 추가 (ACTION_API_ERROR, ACTION_API_TIMEOUT, ACTION_RATE_LIMITED, PRICE_IMPACT_TOO_HIGH)
- EDIT `packages/core/src/__tests__/chain-error.test.ts` — 에러 코드 count 업데이트
- EDIT `pnpm-workspace.yaml` — packages/actions 추가
- EDIT `turbo.json` — actions 패키지 빌드 포함

### Plan 246-02: Jupiter API Client + Zod 스키마
**Files:**
- CREATE `packages/actions/src/providers/jupiter-swap/schemas.ts` — QuoteResponseSchema, SwapInstructionsResponseSchema, SwapInstructionSchema
- CREATE `packages/actions/src/providers/jupiter-swap/config.ts` — JupiterSwapConfig type + defaults
- CREATE `packages/actions/src/providers/jupiter-swap/jupiter-api-client.ts` — JupiterApiClient (extends ActionApiClient)
- EDIT `packages/daemon/src/__tests__/mocks/jupiter-msw-handlers.ts` — v6 → v1 URL 업데이트

### Plan 246-03: JupiterSwapActionProvider + 안전 장치
**Files:**
- CREATE `packages/actions/src/providers/jupiter-swap/index.ts` — JupiterSwapActionProvider implements IActionProvider
- CREATE `packages/actions/src/index.ts` — registerBuiltInProviders() + exports

### Plan 246-04: 단위 테스트
**Files:**
- CREATE `packages/actions/vitest.config.ts`
- CREATE `packages/actions/src/__tests__/slippage.test.ts`
- CREATE `packages/actions/src/__tests__/action-api-client.test.ts`
- CREATE `packages/actions/src/__tests__/jupiter-swap.test.ts` — JupiterSwapActionProvider 통합 테스트 (msw)

## Execution Order
246-01 → 246-02 → 246-03 → 246-04

## Requirements Coverage
- SWAP-01~06: Plan 246-02, 246-03
- SAFE-01~05: Plan 246-02, 246-03
