# ResolvedAction 타입 시스템 설계

> Phase 380, Plan 01 — ResolvedAction 3종 Zod discriminatedUnion 스키마 초안

---

## 1. 개요

### 목표

ActionProvider.resolve()가 on-chain 트랜잭션뿐 아니라 off-chain 서명 액션도 반환할 수 있도록 `kind` 필드 기반 3종 union 타입을 설계한다.

### 기존 한계

현재 `IActionProvider.resolve()`의 반환 타입은 다음으로 고정되어 있다:

```typescript
resolve(...): Promise<ContractCallRequest | ContractCallRequest[] | ApiDirectResult>
```

- `ContractCallRequest`: on-chain 트랜잭션만 표현 가능 (to, calldata, value 등)
- `ApiDirectResult`: Hyperliquid 등 off-chain DEX의 ad-hoc 결과 반환 (파이프라인 우회)

이 구조로는 EIP-712 off-chain order (CoW Protocol), HMAC-signed CEX API 호출, RSA-PSS signed HTTP request 등을 표현할 수 없다.

### 설계 원칙

1. **기존 13개 ActionProvider 무변경**: kind 없이 반환해도 registry가 정규화
2. **기존 파이프라인 무변경**: contractCall은 6-stage pipeline 그대로
3. **Zod SSoT**: Zod 스키마가 타입의 단일 진실 원천
4. **kind vs type 분리**: `type`은 트랜잭션 유형 (CONTRACT_CALL 등), `kind`는 파이프라인 라우팅용

---

## 2. ResolvedAction Zod discriminatedUnion 설계

### 2.1 kind 필드 기반 3종 분기

| kind | 설명 | 파이프라인 |
|------|------|-----------|
| `contractCall` | 기존 on-chain 트랜잭션 | 6-stage pipeline (무변경) |
| `signedData` | Off-chain 서명 데이터 (EIP-712, HMAC 등) | sign-message pipeline 확장 |
| `signedHttp` | 서명된 HTTP 요청 (ERC-8128 등) | ERC-8128 pipeline 통합 |

### 2.2 SignedDataAction 스키마

EIP-712 CLOB order, HMAC-signed CEX request, Ed25519 크로스체인 메시지 등 "데이터에 서명하여 외부 venue에 제출"하는 모든 액션을 표현한다.

```typescript
import { z } from 'zod';

// ── 공유 enum ──

export const SigningSchemeEnum = z.enum([
  'eip712',           // EIP-712 typed structured data
  'personal',         // EIP-191 personal sign
  'hmac-sha256',      // HMAC-SHA256 (CEX API)
  'rsa-pss',          // RSA-PSS (금융 API)
  'ecdsa-secp256k1',  // raw ECDSA secp256k1 (arbitrary bytes)
  'ed25519',          // Ed25519 (Solana native 등)
  'erc8128',          // ERC-8128 signed HTTP (RFC 9421 + EIP-191)
]);
export type SigningScheme = z.infer<typeof SigningSchemeEnum>;

// ── SignedDataAction ──

export const SignedDataActionTrackingSchema = z.object({
  trackerName: z.string(),            // IAsyncStatusTracker 구현체 이름
  metadata: z.record(z.unknown()),    // tracker-specific 메타데이터
}).strict();

export const SignedDataActionPolicyContextSchema = z.object({
  actionCategory: z.enum(['trade', 'withdraw', 'transfer', 'sign', 'deposit']).optional(),
  notionalUsd: z.number().nonnegative().optional(),     // 추정 USD 가치
  leverage: z.number().positive().optional(),            // 레버리지 배율
  expiry: z.string().datetime().optional(),              // 주문 만료 시각
  hasWithdrawCapability: z.boolean().optional(),         // venue에서 자금 인출 가능 여부
}).strict();

export const SignedDataActionSchema = z.object({
  kind: z.literal('signedData'),

  // ── 서명 설정 ──
  signingScheme: SigningSchemeEnum,
  payload: z.record(z.unknown()),      // 서명 대상 데이터 (scheme별 구조 상이)
  // eip712: { domain, types, primaryType, value }
  // hmac-sha256: { data: string (raw bytes hex) }
  // personal: { message: string }
  // ecdsa-secp256k1 / ed25519: { data: string (hex) }

  // ── venue 컨텍스트 ──
  venue: z.string().min(1),            // 외부 서비스 식별자 (예: 'cow-protocol', 'binance', 'polymarket')
  operation: z.string().min(1),        // 액션 이름 (예: 'place-order', 'cancel-order')

  // ── credential 참조 (optional) ──
  credentialRef: z.string().optional(),  // CredentialVault UUID 또는 {walletId}:{name}. 없으면 글로벌 fallback

  // ── 비동기 추적 (optional) ──
  tracking: SignedDataActionTrackingSchema.optional(),

  // ── 정책 평가 컨텍스트 (optional) ──
  policyContext: SignedDataActionPolicyContextSchema.optional(),

  // ── ActionProvider 메타데이터 (기존 패턴) ──
  actionProvider: z.string().optional(),
  actionName: z.string().optional(),
}).strict();

export type SignedDataAction = z.infer<typeof SignedDataActionSchema>;
```

**payload 구조 예시:**

| signingScheme | payload 구조 |
|---------------|-------------|
| `eip712` | `{ domain: {...}, types: {...}, primaryType: string, value: {...} }` |
| `hmac-sha256` | `{ data: string, timestamp: string, method: string, path: string }` |
| `personal` | `{ message: string }` |
| `ecdsa-secp256k1` | `{ data: string }` (hex-encoded bytes) |
| `ed25519` | `{ data: string }` (hex-encoded bytes) |

### 2.3 SignedHttpAction 스키마

기존 `SignHttpMessageParams`를 통합하되, `privateKey`/`chainId`/`address`는 제외한다 (ActionContext에서 주입). venue/operation 필드를 추가하여 정책 평가와 추적을 지원한다.

```typescript
export const SignedHttpActionSchema = z.object({
  kind: z.literal('signedHttp'),

  // ── HTTP 요청 명세 (기존 SignHttpMessageParams 통합) ──
  method: z.string().min(1),                           // HTTP 메서드 (GET, POST, PUT, DELETE)
  url: z.string().url(),                               // 대상 URL
  headers: z.record(z.string()),                       // HTTP 헤더
  body: z.string().optional(),                         // 요청 본문

  // ── 서명 설정 ──
  signingScheme: z.enum(['erc8128', 'hmac-sha256', 'rsa-pss']),  // HTTP 서명에 사용 가능한 scheme 제한
  coveredComponents: z.array(z.string()).optional(),    // RFC 9421 서명 대상 컴포넌트
  preset: z.enum(['minimal', 'standard', 'strict']).optional(),  // ERC-8128 preset
  ttlSec: z.number().int().positive().optional(),      // 서명 TTL (초)
  nonce: z.union([z.string(), z.literal(false)]).optional(),     // nonce (false = 비활성)

  // ── venue 컨텍스트 ──
  venue: z.string().min(1),            // 외부 서비스 식별자
  operation: z.string().min(1),        // 액션 이름

  // ── credential 참조 (optional) ──
  credentialRef: z.string().optional(),

  // ── 비동기 추적 (optional) ──
  tracking: SignedDataActionTrackingSchema.optional(),

  // ── 정책 평가 컨텍스트 (optional) ──
  policyContext: SignedDataActionPolicyContextSchema.optional(),

  // ── ActionProvider 메타데이터 ──
  actionProvider: z.string().optional(),
  actionName: z.string().optional(),
}).strict();

export type SignedHttpAction = z.infer<typeof SignedHttpActionSchema>;
```

**기존 SignHttpMessageParams와의 필드 매핑:**

| SignHttpMessageParams | SignedHttpAction | 비고 |
|----------------------|------------------|------|
| `method` | `method` | 동일 |
| `url` | `url` | 동일 |
| `headers` | `headers` | 동일 |
| `body` | `body` | 동일 |
| `privateKey` | _(제외)_ | ActionContext에서 주입 |
| `chainId` | _(제외)_ | ActionContext에서 주입 |
| `address` | _(제외)_ | ActionContext에서 주입 |
| `coveredComponents` | `coveredComponents` | 동일 |
| `preset` | `preset` | 동일 |
| `ttlSec` | `ttlSec` | 동일 |
| `nonce` | `nonce` | 동일 |
| _(없음)_ | `kind` | 신규: 파이프라인 라우팅용 |
| _(없음)_ | `venue` | 신규: venue 식별 |
| _(없음)_ | `operation` | 신규: 액션 이름 |
| _(없음)_ | `signingScheme` | 신규: 서명 방식 명시 |
| _(없음)_ | `credentialRef` | 신규: credential 참조 |
| _(없음)_ | `tracking` | 신규: 비동기 추적 |
| _(없음)_ | `policyContext` | 신규: 정책 평가 |

### 2.4 ContractCallRequest 확장

기존 `ContractCallRequestSchema`에 `kind?: 'contractCall'` optional 필드를 추가한다. 기존 type 필드(`z.literal('CONTRACT_CALL')`)와 별개로 kind는 파이프라인 라우팅 전용이다.

```typescript
// 기존 ContractCallRequestSchema 확장 (변경 최소화)
export const ContractCallRequestSchema = z.object({
  // ── 신규: kind 필드 (optional, 정규화 시 추가됨) ──
  kind: z.literal('contractCall').optional(),

  // ── 기존 필드 전부 유지 ──
  type: z.literal('CONTRACT_CALL'),
  to: z.string().min(1),
  calldata: z.string().optional(),
  abi: z.array(z.record(z.unknown())).optional(),
  value: z.string().regex(/^\d+$/).optional(),
  programId: z.string().optional(),
  instructionData: z.string().optional(),
  accounts: z.array(z.object({
    pubkey: z.string(),
    isSigner: z.boolean(),
    isWritable: z.boolean(),
  })).optional(),
  preInstructions: z.array(z.unknown()).optional(),
  network: z.string().optional(),  // NetworkTypeEnumWithLegacy
  actionProvider: z.string().optional(),
  actionName: z.string().optional(),
  gasCondition: z.unknown().optional(),  // GasConditionSchema
});

// 정규화 후 kind가 반드시 존재하는 버전
export const NormalizedContractCallSchema = ContractCallRequestSchema.extend({
  kind: z.literal('contractCall'),  // required (not optional)
});
export type NormalizedContractCall = z.infer<typeof NormalizedContractCallSchema>;
```

### 2.5 ResolvedAction discriminatedUnion

정규화 후에는 모든 멤버가 `kind`를 가지므로 정식 `z.discriminatedUnion`을 사용할 수 있다.

```typescript
// ── 정규화 후 ResolvedAction (kind 필수) ──

export const ResolvedActionSchema = z.discriminatedUnion('kind', [
  NormalizedContractCallSchema,    // kind: 'contractCall'
  SignedDataActionSchema,          // kind: 'signedData'
  SignedHttpActionSchema,          // kind: 'signedHttp'
]);
export type ResolvedAction = z.infer<typeof ResolvedActionSchema>;

// ── 정규화 전 raw 타입 (kind 없는 ContractCallRequest 허용) ──

export type RawResolvedAction =
  | ContractCallRequest         // kind 없을 수 있음 (기존 provider 반환)
  | SignedDataAction            // kind: 'signedData' (항상 존재)
  | SignedHttpAction;           // kind: 'signedHttp' (항상 존재)
```

---

## 3. 정규화 전략

### 3.1 normalizeResolvedAction() 함수 설계

`ActionProviderRegistry`에서 resolve() 결과를 정규화하는 함수. 기존 provider가 kind 없이 반환해도 안전하게 처리한다.

```typescript
/**
 * resolve() 결과를 정규화하여 ResolvedAction으로 변환한다.
 *
 * 정규화 규칙:
 * 1. kind 필드가 이미 존재하면 그대로 반환 (신규 provider)
 * 2. kind 없고 type === 'CONTRACT_CALL'이면 kind: 'contractCall' 추가 (기존 provider)
 * 3. __apiDirect === true이면 ApiDirectResult — ResolvedAction 밖이므로 정규화 대상 아님
 *
 * @param raw - resolve() 반환값 (kind 없을 수 있음)
 * @returns ResolvedAction (kind 필수)
 * @throws ZodError - 정규화 후 스키마 검증 실패 시
 */
export function normalizeResolvedAction(raw: RawResolvedAction): ResolvedAction {
  // Step 1: kind가 이미 있으면 그대로 파싱
  if ('kind' in raw && raw.kind != null) {
    return ResolvedActionSchema.parse(raw);
  }

  // Step 2: kind 없고 type === 'CONTRACT_CALL' → contractCall 정규화
  if ('type' in raw && raw.type === 'CONTRACT_CALL') {
    return ResolvedActionSchema.parse({ ...raw, kind: 'contractCall' });
  }

  // Step 3: 어디에도 해당하지 않으면 에러
  throw new Error(
    `Cannot normalize ResolvedAction: missing kind field and type is not CONTRACT_CALL`
  );
}

/**
 * resolve() 반환값 배열을 정규화한다.
 * ContractCallRequest[] (multi-step) → 각 요소에 kind: 'contractCall' 추가
 */
export function normalizeResolvedActions(
  raw: RawResolvedAction | RawResolvedAction[]
): ResolvedAction[] {
  const items = Array.isArray(raw) ? raw : [raw];
  return items.map(normalizeResolvedAction);
}
```

### 3.2 정규화 흐름도

```
ActionProvider.resolve() 반환
        │
        ▼
  isApiDirectResult()?  ──── YES ──→ 기존 ApiDirectResult 경로 (변경 없음)
        │ NO
        ▼
  normalizeResolvedAction()
        │
        ├── kind 있음? ──── YES ──→ ResolvedActionSchema.parse(raw)
        │
        ├── type === 'CONTRACT_CALL'? ── YES ──→ { ...raw, kind: 'contractCall' } → parse
        │
        └── 해당 없음 ──→ Error
        │
        ▼
  ResolvedAction (kind 필수)
        │
        ├── kind: 'contractCall' ──→ 6-stage pipeline (기존 경로)
        ├── kind: 'signedData'   ──→ sign-data pipeline (신규)
        └── kind: 'signedHttp'   ──→ sign-http pipeline (신규)
```

### 3.3 정규화 시점

정규화는 `ActionProviderRegistry.executeAction()` 내부에서 수행한다. resolve() 직후, 정책 평가 전에 실행된다:

```typescript
// ActionProviderRegistry.executeAction() 내부 (의사 코드)
async executeAction(provider, actionName, params, context) {
  const raw = await provider.resolve(actionName, params, context);

  // ApiDirectResult 분기 (기존 로직)
  if (isApiDirectResult(raw)) {
    return raw; // 기존 경로 유지
  }

  // 정규화 (신규)
  const actions = normalizeResolvedActions(raw);

  // kind별 파이프라인 라우팅 (Phase 383에서 상세 설계)
  for (const action of actions) {
    switch (action.kind) {
      case 'contractCall':
        // 기존 6-stage pipeline (변경 없음)
        break;
      case 'signedData':
        // sign-data pipeline (신규)
        break;
      case 'signedHttp':
        // sign-http pipeline (신규)
        break;
    }
  }
}
```

---

## 4. IActionProvider.resolve() 반환 타입 확장

### 4.1 기존 타입

```typescript
resolve(
  actionName: string,
  params: Record<string, unknown>,
  context: ActionContext,
): Promise<ContractCallRequest | ContractCallRequest[] | ApiDirectResult>;
```

### 4.2 확장 타입

```typescript
resolve(
  actionName: string,
  params: Record<string, unknown>,
  context: ActionContext,
): Promise<
  | ContractCallRequest          // 기존 on-chain (kind 없어도 됨)
  | ContractCallRequest[]        // multi-step on-chain
  | ApiDirectResult              // 기존 off-chain DEX (파이프라인 우회)
  | SignedDataAction             // 신규: off-chain signed data
  | SignedHttpAction             // 신규: signed HTTP request
  | ResolvedAction[]             // 신규: mixed-kind multi-step
>;
```

### 4.3 하위 호환 보장

- 기존 provider가 `ContractCallRequest`를 반환 → kind 없음 → `normalizeResolvedAction()`이 `kind: 'contractCall'` 추가
- 기존 provider가 `ContractCallRequest[]`를 반환 → 각 요소에 kind 추가
- 기존 provider가 `ApiDirectResult`를 반환 → `isApiDirectResult()` 먼저 분기, 정규화 대상 아님
- **기존 provider 코드 변경 0줄**

---

## 5. 하위 호환 분석

### 5.1 기존 13개 ActionProvider 현황

| # | Provider | 반환 타입 | kind 변경 필요 | 비고 |
|---|----------|----------|---------------|------|
| 1 | Jupiter Swap | `ContractCallRequest` | 불필요 | Solana on-chain |
| 2 | 0x EVM DEX | `ContractCallRequest` | 불필요 | EVM on-chain |
| 3 | LI.FI Bridge | `ContractCallRequest` + tracking | 불필요 | 크로스체인 on-chain |
| 4 | Lido Staking | `ContractCallRequest` | 불필요 | EVM on-chain |
| 5 | Jito Staking | `ContractCallRequest` | 불필요 | Solana on-chain |
| 6 | Aave V3 Lending | `ContractCallRequest` / `ContractCallRequest[]` | 불필요 | multi-step approve+supply |
| 7 | Kamino Lending | `ContractCallRequest` / `ContractCallRequest[]` | 불필요 | Solana multi-step |
| 8 | Pendle Yield | `ContractCallRequest` | 불필요 | EVM on-chain |
| 9 | Drift Perp | `ContractCallRequest` / `ContractCallRequest[]` | 불필요 | Solana on-chain |
| 10 | DCent Swap | `ContractCallRequest` | 불필요 | EVM aggregator |
| 11 | Hyperliquid | `ApiDirectResult` | 불필요 | off-chain DEX (EIP-712) |
| 12 | Across Bridge | `ContractCallRequest` + tracking | 불필요 | 크로스체인 on-chain |
| 13 | Polymarket | `ApiDirectResult` | 불필요 | off-chain CLOB (EIP-712) |

### 5.2 정규화 결과

| 반환 패턴 | 정규화 결과 | 기존 경로 |
|----------|-----------|----------|
| `ContractCallRequest` (kind 없음) | `{ ...result, kind: 'contractCall' }` | 6-stage pipeline 진입 |
| `ContractCallRequest[]` (kind 없음) | 각 요소에 `kind: 'contractCall'` 추가 | 순차 6-stage pipeline |
| `ApiDirectResult` | 정규화 대상 아님 (isApiDirectResult 분기) | 기존 ApiDirectResult 경로 |

### 5.3 주의사항

1. **ContractCallRequest[]는 multi-step 시나리오**: Aave approve+supply, Kamino SOL wrapping 등. 각 요소에 개별적으로 kind를 추가해야 함
2. **ApiDirectResult는 ResolvedAction union 밖**: isApiDirectResult() 먼저 체크 후 별도 분기
3. **기존 provider가 향후 kind를 명시적으로 추가해도 무방**: optional이므로 있으면 정규화 스킵

---

## 6. ApiDirectResult와의 관계

### 6.1 분리 원칙

`ApiDirectResult`는 `ResolvedAction` union에 포함하지 않는다. 이유:

1. **의미론적 차이**: ApiDirectResult는 "이미 실행 완료된 결과"이고, ResolvedAction은 "서명 대기 중인 액션"
2. **파이프라인 진입 여부**: ResolvedAction은 서명 파이프라인에 진입하지만, ApiDirectResult는 진입하지 않음
3. **정책 평가**: ResolvedAction은 서명 전 정책 평가가 필요하지만, ApiDirectResult는 provider가 자체 실행 완료

### 6.2 판별 흐름

```typescript
// isApiDirectResult() 타입 가드
export function isApiDirectResult(
  result: unknown
): result is ApiDirectResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    '__apiDirect' in result &&
    (result as ApiDirectResult).__apiDirect === true
  );
}

// 사용 예시
const result = await provider.resolve(actionName, params, context);
if (isApiDirectResult(result)) {
  // 기존 ApiDirectResult 경로 (변경 없음)
  return result;
}
// ResolvedAction 정규화 + 파이프라인 라우팅
const actions = normalizeResolvedActions(result);
```

### 6.3 향후 마이그레이션 가능성

현재 `ApiDirectResult`를 사용하는 provider (Hyperliquid, Polymarket)는 실제로 EIP-712 서명을 수행한다. 향후 이들을 `SignedDataAction`으로 마이그레이션하면:

- 서명이 WAIaaS 파이프라인을 통과 (키 관리 일원화)
- 정책 평가 가능 (venue 화이트리스트, 카테고리 한도)
- 비동기 추적 통합 (AsyncPollingService)

단, 이 마이그레이션은 본 마일스톤 범위 밖이며 별도 마일스톤에서 수행한다.

---

## 7. Pitfall 방지 체크리스트

- [ ] **kind 필드와 기존 type 필드 혼동 금지**: `type`은 트랜잭션 유형 (`CONTRACT_CALL`, `TRANSFER`, `TOKEN_TRANSFER` 등 8-type discriminatedUnion), `kind`는 파이프라인 라우팅 (`contractCall`, `signedData`, `signedHttp`). 두 필드는 완전히 독립적 네임스페이스
- [ ] **SignedDataAction.payload는 서명 방식에 따라 다른 구조**: EIP-712는 `{ domain, types, primaryType, value }`, HMAC은 `{ data, timestamp, method, path }`, personal은 `{ message }`. payload를 제네릭 `Record<string, unknown>`으로 두되 런타임에 scheme별 검증 추가 권장
- [ ] **credentialRef는 optional**: 없으면 글로벌 credential (SettingsService) fallback. per-wallet credential이 있으면 우선 사용
- [ ] **tracking은 optional**: 동기 완료 액션 (personal sign 등)은 tracking 불필요. 비동기 액션 (CLOB order, 브릿지 등)만 tracking 지정
- [ ] **policyContext는 optional**: 정책 평가에 필요한 추가 컨텍스트. provider가 notionalUsd, leverage 등을 알 수 있으면 제공. 없으면 정책 엔진이 기본값 사용
- [ ] **정규화는 registry에서만**: provider 내부에서 정규화하지 않음. provider는 kind를 명시할 수도, 생략할 수도 있음
- [ ] **Array 정규화 시 혼합 kind 가능**: `ResolvedAction[]`에서 contractCall + signedData가 혼재할 수 있음 (예: approve on-chain + sign off-chain order). 각 요소를 개별적으로 kind별 파이프라인에 라우팅
- [ ] **ApiDirectResult 배열 불가**: 현재 `ContractCallRequest[]`만 지원. ApiDirectResult는 단건 반환만 허용. 향후 SignedDataAction 마이그레이션으로 해결

---

## 부록: 설계 결정 요약

| # | 결정 | 근거 |
|---|------|------|
| D1 | kind 필드를 optional로 추가 (기존 ContractCallRequest) | 기존 13개 provider 코드 변경 0줄 보장 |
| D2 | 정규화를 registry에서만 수행 | 단일 정규화 지점으로 일관성 보장 |
| D3 | ApiDirectResult는 ResolvedAction union 밖 | 의미론적 분리 (실행 완료 vs 서명 대기) |
| D4 | SignedHttpAction의 signingScheme을 3종으로 제한 | HTTP 서명에 사용 가능한 scheme만 허용 (erc8128, hmac-sha256, rsa-pss) |
| D5 | payload를 Record<string, unknown>으로 | scheme별 구조가 상이하므로 런타임 검증으로 위임 |
| D6 | tracking/policyContext를 optional로 | 동기 액션과 비동기 액션 모두 수용 |

---

*Phase: 380-resolved-action-type-system, Plan: 01*
*작성일: 2026-03-11*
