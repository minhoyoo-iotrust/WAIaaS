# #414 — Pendle buy_pt API 응답 스키마 불일치 (6회차 재발)

- **유형**: BUG
- **심각도**: HIGH
- **영향 시나리오**: defi-09
- **컴포넌트**: `packages/actions/src/providers/pendle/schemas.ts`, `pendle-api-client.ts`
- **선행 이슈**: #373 → #398 → #403 → #407 (모두 FIXED, 모두 재발)
- **상태**: OPEN
- **재현 확인**: 2026-03-19 v2.12.0-rc (6회차 동일 패턴)

## 현상

`POST /v1/actions/pendle_yield/buy_pt?dryRun=true` 호출 시:
```json
{
  "code": "ACTION_RESOLVE_FAILED",
  "message": "Action resolve failed: [{ \"code\": \"invalid_union\", \"unionErrors\": [
    { \"issues\": [{ \"code\": \"invalid_type\", \"expected\": \"array\", \"received\": \"object\" }] },
    { \"issues\": [{ \"code\": \"invalid_union\", \"unionErrors\": [
      { \"issues\": [{ \"expected\": \"array\", \"received\": \"undefined\", \"path\": [\"results\"] }] },
      { \"issues\": [{ \"expected\": \"array\", \"received\": \"undefined\", \"path\": [\"data\"] }] }
    ]}] }
  ]}]"
}
```

## 실행 경로

```
POST /v1/actions/pendle_yield/buy_pt?dryRun=true
  → PendleYieldProvider.resolve('buy_pt', params, context)
    [packages/actions/src/providers/pendle/index.ts:116-156]
  → PendleYieldProvider.resolveBuyPT(params, context)
    [index.ts:137-157]
  → PendleApiClient.convert({tokensIn, amountsIn, tokensOut, slippage, receiver})
    [pendle-api-client.ts:56-72]
  → ActionApiClient.get('v2/sdk/{chainId}/convert', PendleConvertResponseSchema, params)
    [action-api-client.ts:23-62]
    → fetch(url)                                          [line 30]
    → data = await res.json()                             [line 42]
    → this.logger?.debug(...)                             [line 43] — raw response 로깅
    → schema.parse(data)                                  [line 45] ← ERROR HERE
    → catch: this.logger?.error(... { response: data })   [lines 47-50]
```

## 원인 분석

### Pendle API 엔드포인트

**Base URL**: `https://api-v2.pendle.finance/core` (config.ts:20)

**실제 호출 URL**:
```
GET https://api-v2.pendle.finance/core/v2/sdk/{chainId}/convert
  ?tokensIn={tokenAddress}
  &amountsIn={amount}
  &tokensOut={ptAddress}
  &slippage={decimal}
  &receiver={walletAddress}
```

### 현재 스키마 (schemas.ts:60-73)

```typescript
const PendleConvertObjectSchema = z.object({
  tx: z.object({
    to: z.string(),
    data: z.string().describe('hex-encoded calldata'),
    value: z.string().describe('native token value (wei)'),
  }).passthrough(),       // extra tx fields 허용 (gasLimit, chainId 등)
  amountOut: z.string(),
}).passthrough();          // extra root fields 허용 (priceImpact, route 등)

export const PendleConvertResponseSchema = z.union([
  PendleConvertObjectSchema,           // 단일 객체
  z.array(PendleConvertObjectSchema).min(1),  // 배열
]);
```

**union이 수용하는 2가지 형식**:
1. `{ tx: { to, data, value }, amountOut: "..." }`
2. `[{ tx: { to, data, value }, amountOut: "..." }]`

### 에러 메시지 분석

Zod `invalid_union` 에러의 3개 분기 실패:
1. **첫 번째 분기** (direct array): `Expected array, received object` — 응답이 배열이 아닌 객체
2. **두 번째 분기** (object): 실패 → **중첩 union 재실패**:
   - `path: ["results"]` → `results` 필드 없음
   - `path: ["data"]` → `data` 필드 없음

**핵심**: 첫 번째 분기(PendleConvertObjectSchema)가 실패한다는 것은 **응답이 `{ tx: {...}, amountOut: "..." }` 형태가 아님**을 의미. `tx` 또는 `amountOut` 필드가 없거나 타입이 다름.

### 가설 (실제 API 응답 미캡처 — 확인 필요)

| 가설 | 예상 응답 | 스키마 실패 이유 |
|------|----------|-----------------|
| A. `data` wrapper | `{ data: { tx: {...}, amountOut: "..." } }` | root에 `tx`/`amountOut` 없음 |
| B. `tx.value`가 number | `{ tx: { to: "...", data: "...", value: 0 }, ... }` | `z.string()` vs number |
| C. `amountOut`가 number | `{ tx: {...}, amountOut: 1000000 }` | `z.string()` vs number |
| D. 필드명 변경 | `{ transaction: {...}, outputAmount: "..." }` | `tx`/`amountOut` 없음 |
| E. 중첩 `results` | `{ results: [{ tx: {...}, amountOut: "..." }] }` | root에 `tx`/`amountOut` 없음 |

### 6회 반복 실패 패턴

| 이슈 | 수정 내용 | 결과 |
|------|----------|------|
| #373 | 객체 응답 핸들링 추가 | 재발 |
| #398 | 배열 응답 핸들링 추가 | 재발 |
| #403 | union 스키마 + 정규화 | 재발 |
| #407 | `.passthrough()` 추가 | 재발 |
| #414 | (미수정) | 6회차 |

**근본 원인**: mock 기반 테스트만으로 수정 → mock이 실제 API 응답과 다름 → 테스트 통과하지만 실 API에서 실패.

### 테스트 mock vs 실제 API 괴리

**mock 데이터** (pendle-api-client.test.ts:38-45):
```typescript
const CONVERT_RESPONSE = {
  tx: { to: '0xPendleRouter', data: '0xabcdef1234567890', value: '0' },
  amountOut: '1000000000000000000',
};
```

**extra fields mock** (test:232-264):
```typescript
{
  tx: { to: '...', data: '...', value: '0', gasLimit: '350000', chainId: 1, type: 2 },
  amountOut: '500',
  priceImpact: 0.002,
  route: { steps: 3 },
}
```

**문제**: extra fields만 테스트하고, **필드 누락/타입 변경/wrapper 구조 변경은 테스트하지 않음**.

### 로깅 포인트 (디버그 확인 방법)

`ActionApiClient.get()` (action-api-client.ts)에 2개 로그 포인트 존재:

1. **정상 응답 시** (line 43): `this.logger?.debug('GET v2/sdk/1/convert → 200', { response: data })`
2. **스키마 실패 시** (lines 47-50): `this.logger?.error('GET ... schema validation failed', { response: data, error: ... })`

**문제**: 데몬 로그 레벨이 debug 이상이어야 raw response가 기록됨. #416(로그 레벨 무시) 이슈와 연관.

## 수정 방향

### 1단계: 실제 Pendle API 응답 캡처 (최우선)

```typescript
// action-api-client.ts의 get()에서 스키마 실패 시 raw response를 파일로 덤프
catch (zodErr) {
  this.logger?.error(`Schema validation failed for ${path}`, {
    rawResponse: JSON.stringify(data, null, 2),  // 전체 응답 구조
    error: zodErr instanceof Error ? zodErr.message : String(zodErr),
  });
  throw zodErr;
}
```

또는 curl로 직접 캡처:
```bash
curl -s 'https://api-v2.pendle.finance/core/v2/sdk/1/convert?tokensIn=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&amountsIn=1000000&tokensOut={PT_ADDRESS}&slippage=0.01&receiver={WALLET}'
```

### 2단계: 캡처된 응답 기반으로 스키마 재정의

실제 응답 구조에 맞게 `PendleConvertResponseSchema` 재작성. 가능한 wrapper 패턴 모두 수용:

```typescript
export const PendleConvertResponseSchema = z.union([
  PendleConvertObjectSchema,                                    // 직접 객체
  z.array(PendleConvertObjectSchema).min(1),                   // 배열
  z.object({ data: PendleConvertObjectSchema }).passthrough(),  // data wrapper
  z.object({ results: z.array(PendleConvertObjectSchema).min(1) }).passthrough(),  // results wrapper
]);
```

### 3단계: tx.value 타입 유연화

```typescript
tx: z.object({
  to: z.string(),
  data: z.string(),
  value: z.union([z.string(), z.number()]).transform(String),  // string|number 모두 수용
}).passthrough(),
```

### 4단계: 테스트에 실제 API 응답 fixture 추가

캡처된 실제 응답을 `__fixtures__/pendle-convert-response.json`으로 저장하고 테스트에 사용.

## 테스트 항목

- [ ] 실제 Pendle API 응답 구조 캡처 및 문서화
- [ ] 캡처된 응답으로 PendleConvertResponseSchema 검증 통과
- [ ] buy_pt dryRun 호출 시 메인넷에서 정상 시뮬레이션 성공
- [ ] tx.value가 number(0)인 경우 string으로 변환되어 처리
- [ ] 예상치 못한 wrapper 구조일 때 명확한 에러 메시지 + raw response 로깅
- [ ] 기존 mock 기반 테스트(object/array/extra fields)도 여전히 통과
