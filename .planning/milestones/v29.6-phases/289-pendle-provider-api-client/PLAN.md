# Phase 289: Pendle Provider + API Client

## Goal
AI 에이전트가 Pendle Finance에서 PT/YT 구매, PT 상환, LP 추가/제거를 수행할 수 있으며, Convert API로 calldata가 빌드되어 ContractCallRequest로 반환되는 상태

## Plans

### Plan 289-01: PendleApiClient (REST API v2 래퍼 + Zod 스키마)

**파일 작업:**

1. **`packages/actions/src/providers/pendle/config.ts`** — 신규 생성
   - PendleConfig 인터페이스: enabled, apiBaseUrl, apiKey, defaultSlippagePct, maturityWarningDays, requestTimeoutMs
   - PENDLE_DEFAULTS 상수: enabled=false, apiBaseUrl="https://api-v2.pendle.finance", defaultSlippagePct=0.01, etc.
   - ZeroEx/LiFi config.ts 패턴 참조

2. **`packages/actions/src/providers/pendle/schemas.ts`** — 신규 생성
   - PendleMarketSchema: address, name, expiry, pt, yt, sy, underlyingAsset, chainId, details(impliedApy, underlyingApy, liquidity)
   - PendleMarketsResponseSchema: z.array(PendleMarketSchema)
   - PendleConvertResponseSchema: tx(to, data, value), amountOut
   - `.passthrough()` 사용 (API 필드 확장 대응)
   - TypeScript types: z.infer 파생

3. **`packages/actions/src/providers/pendle/pendle-api-client.ts`** — 신규 생성
   - ActionApiClient 확장 (packages/actions/src/common/action-api-client.ts)
   - Constructor: PendleConfig → headers(Authorization Bearer if apiKey)
   - getMarkets(chainId): GET /v1/markets/all?chainId={chainId} → PendleMarketsResponseSchema
   - convert(chainId, params): GET /v2/sdk/{chainId}/convert?tokensIn&amountsIn&tokensOut&slippage&receiver → PendleConvertResponseSchema
   - getSwappingPrices(chainId, market): GET /v1/sdk/{chainId}/markets/{market}/swapping-prices

4. **`packages/actions/src/providers/pendle/__tests__/pendle-api-client.test.ts`** — 신규 생성
   - Zod 스키마 검증 테스트 (valid/invalid market 응답)
   - Convert 응답 스키마 검증 테스트
   - Mock fetch를 사용한 API 호출 테스트 (getMarkets, convert)

**의존성:** Phase 288 (IYieldProvider)
**검증:** typecheck + 테스트 통과

---

### Plan 289-02: PendleYieldProvider buyPT + buyYT 액션

**파일 작업:**

1. **`packages/actions/src/providers/pendle/index.ts`** — 신규 생성
   - PendleYieldProvider implements IYieldProvider, IPositionProvider
   - Constructor: PendleConfig → PendleApiClient 생성
   - metadata: name='pendle', chains=['ethereum'], mcpExpose=true, requiresApiKey=false
   - actions: buy_pt(medium/DELAY), buy_yt(high/DELAY), redeem_pt(low/NOTIFY), add_liquidity(medium/DELAY), remove_liquidity(low/NOTIFY)
   - resolve() switch dispatch
   - resolveBuyPT(): market → PT 토큰 resolve → Convert API(tokensIn=tokenIn, tokensOut=PT) → ContractCallRequest
   - resolveBuyYT(): market → YT 토큰 resolve → Convert API(tokensIn=tokenIn, tokensOut=YT) → ContractCallRequest
   - IYieldProvider: getMarkets(), getPosition(), getYieldForecast()
   - IPositionProvider: getPositions(), getProviderName()='pendle', getSupportedCategories()=['YIELD']

2. **`packages/actions/src/providers/pendle/input-schemas.ts`** — 신규 생성
   - PendleBuyPTInputSchema: market, tokenIn, amountIn, slippage?
   - PendleBuyYTInputSchema: market, tokenIn, amountIn, slippage?
   - PendleRedeemPTInputSchema: market, amount
   - PendleAddLiquidityInputSchema: market, tokenIn, amountIn, slippage?
   - PendleRemoveLiquidityInputSchema: market, amount, slippage?

3. **`packages/actions/src/providers/pendle/__tests__/pendle-provider.test.ts`** — 신규 생성
   - buyPT resolve → ContractCallRequest 반환 테스트
   - buyYT resolve → ContractCallRequest 반환 테스트
   - Mock PendleApiClient 사용
   - 유효하지 않은 market 시 에러 테스트

**의존성:** Plan 289-01
**검증:** typecheck + 테스트 통과

---

### Plan 289-03: PendleYieldProvider redeemPT + addLiquidity + removeLiquidity 액션

**파일 작업:**

1. **`packages/actions/src/providers/pendle/index.ts`** — 수정
   - resolveRedeemPT(): Convert API(tokensIn=PT, tokensOut=underlying). 만기 전/후 자동 감지 (DEC-YIELD-03)
   - resolveAddLiquidity(): Convert API(tokensIn=tokenIn, tokensOut=LP)
   - resolveRemoveLiquidity(): Convert API(tokensIn=LP, tokensOut=underlying)

2. **`packages/actions/src/providers/pendle/__tests__/pendle-redeem-lp.test.ts`** — 신규 생성
   - redeemPT 만기 후 → 상환 성공 테스트
   - redeemPT 만기 전 → 시장 매도 경로 자동 감지 테스트
   - addLiquidity → LP ContractCallRequest 반환 테스트
   - removeLiquidity → ContractCallRequest 반환 테스트

3. **`packages/actions/src/providers/pendle/index.ts`** — exports 정리
   - re-export from packages/actions/src/index.ts

**의존성:** Plan 289-02
**검증:** typecheck + 전체 테스트 통과

---

## CHAIN_ID_MAP

Pendle API는 chainId(숫자)를 사용. WAIaaS network → chainId 매핑:
- ethereum-mainnet → 1
- arbitrum-mainnet → 42161
- base-mainnet → 8453

## 검증 기준

1. ✅ PendleApiClient가 getMarkets/convert 호출 가능하고 Zod 검증 통과
2. ✅ buyPT/buyYT가 ContractCallRequest 반환
3. ✅ redeemPT가 만기 전/후 자동 감지
4. ✅ addLiquidity/removeLiquidity가 ContractCallRequest 반환
5. ✅ typecheck + lint 통과

## 실행 순서

289-01 → 289-02 → 289-03 (순차)
