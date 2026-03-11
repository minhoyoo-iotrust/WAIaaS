# REST API + MCP 도구 + SDK 메서드 off-chain action 인터페이스 설계

> Phase 383, Plan 02 — off-chain action 실행/조회 인터페이스 (REST, MCP, SDK, connect-info)

---

## 1. 개요

### 목표

기존 `POST /v1/actions/:provider/:action` 엔드포인트가 off-chain action 결과도 반환하도록 확장하고, MCP 도구와 SDK 메서드에서 off-chain action을 실행/조회할 수 있는 인터페이스를 설계한다.

### 별도 엔드포인트를 추가하지 않는 이유

1. **DX 일관성**: AI 에이전트는 action 실행 시 on-chain/off-chain을 구분할 필요 없이 동일한 엔드포인트를 사용
2. **ActionProvider 추상화**: provider가 내부적으로 어떤 kind를 반환하는지는 구현 세부사항. 인터페이스는 동일
3. **기존 패턴 재사용**: Hyperliquid(ApiDirectResult)도 동일 엔드포인트에서 처리됨. off-chain action도 같은 패턴

### Phase 381 설계와의 관계

credential 관리 인터페이스(REST 8개 엔드포인트, MCP 4도구, SDK 4메서드)는 Phase 381에서 완전히 설계되었다. 본 문서에서는 참조만 하고 중복 정의하지 않는다.

---

## 2. REST API 응답 스키마 확장 (PIPE-04)

### 2.1 기존 응답 스키마

```typescript
// 기존 POST /v1/actions/:provider/:action 응답
// contractCall 결과
{
  transactionId: string,   // UUID
  txHash: string | null,   // 블록체인 TX 해시
  status: string,          // 'SUBMITTED' | 'CONFIRMED' | 'FAILED'
}
```

### 2.2 확장 응답 Zod 스키마

```typescript
import { z } from 'zod';

// ── contractCall 결과 (기존, 무변경) ──

const ContractCallResultSchema = z.object({
  kind: z.literal('contractCall').default('contractCall'),
  transactionId: z.string(),
  txHash: z.string().nullable(),
  status: z.string(),
});

// ── signedData 결과 (신규) ──

const SignedDataResultSchema = z.object({
  kind: z.literal('signedData'),
  actionId: z.string(),                          // transactions 테이블 UUID
  venue: z.string(),                              // 외부 서비스 식별자
  operation: z.string(),                          // 액션 이름
  signature: z.string(),                          // 서명 결과
  metadata: z.record(z.unknown()).optional(),      // scheme별 메타데이터 (v, r, s 등)
  tracking: z.object({
    trackerName: z.string(),
    metadata: z.record(z.unknown()),
  }).optional(),
});

// ── signedHttp 결과 (신규) ──

const SignedHttpResultSchema = z.object({
  kind: z.literal('signedHttp'),
  actionId: z.string(),                          // transactions 테이블 UUID
  venue: z.string(),
  operation: z.string(),
  signature: z.string(),                          // 서명 값
  signedHeaders: z.record(z.string()).optional(),  // 서명이 포함된 헤더 세트
  signatureInput: z.string().optional(),           // RFC 9421 Signature-Input
  tracking: z.object({
    trackerName: z.string(),
    metadata: z.record(z.unknown()),
  }).optional(),
});

// ── ApiDirectResult 결과 (기존, 무변경) ──

const ApiDirectResultResponseSchema = z.object({
  kind: z.literal('apiDirect').default('apiDirect'),
  externalId: z.string(),
  status: z.enum(['success', 'partial', 'pending']),
  provider: z.string(),
  action: z.string(),
  data: z.record(z.unknown()),
  metadata: z.record(z.unknown()).optional(),
});

// ── 통합 응답 union ──

const ActionExecutionResultSchema = z.discriminatedUnion('kind', [
  ContractCallResultSchema,
  SignedDataResultSchema,
  SignedHttpResultSchema,
  ApiDirectResultResponseSchema,
]);

export type ActionExecutionResult = z.infer<typeof ActionExecutionResultSchema>;
```

### 2.3 하위 호환 전략

기존 API 소비자는 `kind` 필드 없이 `transactionId`, `txHash`, `status`만 기대한다.

**전략**: contractCall 결과에 `kind: 'contractCall'`을 추가하되, `kind`는 optional이므로 기존 소비자가 무시해도 무방하다.

```typescript
// 기존 소비자 코드 (변경 불필요)
const result = await fetch('/v1/actions/jupiter_swap/swap', { ... });
const { transactionId, txHash, status } = await result.json();
// kind 필드를 무시해도 정상 동작
```

### 2.4 multi-step 응답

mixed-kind 배열 실행 시 배열 응답:

```typescript
const MultiStepActionResultSchema = z.object({
  steps: z.array(ActionExecutionResultSchema),
  totalSteps: z.number(),
  completedSteps: z.number(),
});
```

단일 step이면 `ActionExecutionResult` 직접 반환, multi-step이면 `MultiStepActionResult` 반환.

---

## 3. off-chain action 조회 API

### 3.1 목록 조회 — 기존 API 확장

`GET /v1/wallets/:walletId/transactions`에 off-chain 레코드를 포함한다.

#### 필터 파라미터 추가

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| `actionKind` | string | (없음, 전체) | `contractCall`, `signedData`, `signedHttp` 필터 |
| `venue` | string | (없음) | 특정 venue 필터 (예: `binance`) |

```
GET /v1/wallets/:walletId/transactions?actionKind=signedData&venue=binance&limit=20
```

#### 응답 확장

기존 트랜잭션 목록 응답에 off-chain 필드를 추가한다:

```typescript
const TransactionListItemSchema = z.object({
  // ── 기존 필드 (무변경) ──
  id: z.string(),
  walletId: z.string(),
  chain: z.string(),
  txHash: z.string().nullable(),
  type: z.string(),
  amount: z.string(),
  toAddress: z.string().nullable(),
  status: z.string(),
  createdAt: z.number(),

  // ── off-chain 확장 필드 (신규, nullable) ──
  actionKind: z.enum(['contractCall', 'signedData', 'signedHttp']).default('contractCall'),
  venue: z.string().nullable().default(null),
  operation: z.string().nullable().default(null),
  externalId: z.string().nullable().default(null),
});
```

**하위 호환**: 기존 레코드는 `actionKind: 'contractCall'`, `venue: null`, `operation: null`로 반환된다.

### 3.2 상세 조회 — 기존 API 확장

`GET /v1/transactions/:id`에서 action_kind에 따라 추가 정보를 반환한다.

```typescript
// contractCall 상세 (기존)
{
  id: 'uuid',
  actionKind: 'contractCall',
  txHash: '0x...',
  // ... 기존 필드 ...
}

// signedData 상세 (신규)
{
  id: 'uuid',
  actionKind: 'signedData',
  txHash: null,
  venue: 'binance',
  operation: 'place-order',
  externalId: 'order-12345',
  metadata: {
    signature: '0x...',
    signingScheme: 'hmac-sha256',
  },
  // ... 기존 필드 ...
}

// signedHttp 상세 (신규)
{
  id: 'uuid',
  actionKind: 'signedHttp',
  txHash: null,
  venue: 'example-api',
  operation: 'create-order',
  metadata: {
    signature: '0x...',
    signingScheme: 'erc8128',
    signatureInput: '...',
  },
  // ... 기존 필드 ...
}
```

### 3.3 Admin 트랜잭션 검색 확장

`GET /v1/admin/transactions` (admin-monitoring.ts)에도 동일한 필터와 응답 확장을 적용한다.

```
GET /v1/admin/transactions?actionKind=signedData
GET /v1/admin/transactions?venue=cow-protocol
```

---

## 4. MCP 도구 확장 (PIPE-05)

### 4.1 기존 action-execute 도구 확장

기존 `action-execute` MCP 도구의 응답에 kind 정보를 추가한다.

```typescript
// MCP tool: action-execute (확장)
{
  name: 'action-execute',
  description: 'Execute an action from a registered ActionProvider (on-chain or off-chain)',
  inputSchema: {
    // ... 기존 입력 그대로 ...
    provider: z.string(),
    action: z.string(),
    params: z.record(z.unknown()),
    walletId: z.string(),
  },
  // 응답 확장
  outputSchema: {
    kind: z.enum(['contractCall', 'signedData', 'signedHttp', 'apiDirect']),
    // contractCall: { transactionId, txHash, status }
    // signedData: { actionId, venue, operation, signature, metadata? }
    // signedHttp: { actionId, venue, operation, signature, signedHeaders? }
    // apiDirect: { externalId, status, data }
  },
}
```

에이전트가 응답의 `kind`를 보고 on-chain/off-chain을 구분할 수 있다.

### 4.2 신규 도구: action-list-offchain

off-chain action 이력을 조회하는 MCP 도구.

```typescript
// MCP tool: action-list-offchain (신규)
{
  name: 'action-list-offchain',
  description: 'List off-chain action history for a wallet (signedData and signedHttp actions)',
  inputSchema: {
    walletId: z.string().describe('Target wallet ID'),
    venue: z.string().optional().describe('Filter by venue (e.g., binance, cow-protocol)'),
    limit: z.number().int().positive().max(100).default(20).describe('Max results'),
    offset: z.number().int().nonnegative().default(0).describe('Pagination offset'),
  },
  outputSchema: {
    actions: z.array(z.object({
      actionId: z.string(),
      kind: z.enum(['signedData', 'signedHttp']),
      venue: z.string(),
      operation: z.string(),
      status: z.string(),
      externalId: z.string().nullable(),
      createdAt: z.number(),
    })),
    total: z.number(),
  },
}
```

#### 구현 경로

```
MCP action-list-offchain
    --> REST API GET /v1/wallets/:walletId/transactions?actionKind=signedData,signedHttp
    --> 응답 변환 (MCP 형식)
```

### 4.3 기존 credential MCP 도구 (참조)

Phase 381에서 설계 완료된 credential 관련 MCP 도구 4개:

| 도구 | 용도 | 인증 |
|------|------|------|
| `credential-list` | credential 목록 조회 | sessionAuth |
| `credential-create` | credential 생성 | masterAuth |
| `credential-delete` | credential 삭제 | masterAuth |
| `credential-rotate` | credential 로테이션 | masterAuth |

이 도구들은 Phase 381 설계 그대로 구현한다. 본 문서에서 재정의하지 않는다.

---

## 5. SDK 메서드 확장 (PIPE-05)

### 5.1 executeAction() 반환 타입 확장

기존 `executeAction()` 메서드의 반환 타입을 kind별 union으로 확장한다.

```typescript
// ── 결과 타입 정의 ──

interface ContractCallResult {
  kind: 'contractCall';
  transactionId: string;
  txHash: string | null;
  status: string;
}

interface SignedDataResult {
  kind: 'signedData';
  actionId: string;
  venue: string;
  operation: string;
  signature: string;
  metadata?: Record<string, unknown>;
  tracking?: {
    trackerName: string;
    metadata: Record<string, unknown>;
  };
}

interface SignedHttpResult {
  kind: 'signedHttp';
  actionId: string;
  venue: string;
  operation: string;
  signature: string;
  signedHeaders?: Record<string, string>;
  signatureInput?: string;
  tracking?: {
    trackerName: string;
    metadata: Record<string, unknown>;
  };
}

interface ApiDirectResultResponse {
  kind: 'apiDirect';
  externalId: string;
  status: 'success' | 'partial' | 'pending';
  provider: string;
  action: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

type ActionResult =
  | ContractCallResult
  | SignedDataResult
  | SignedHttpResult
  | ApiDirectResultResponse;

// ── executeAction() 메서드 ──

class WAIaaSClient {
  /**
   * Execute an action from a registered ActionProvider.
   * Returns a kind-discriminated result.
   *
   * @example
   * const result = await client.executeAction('jupiter_swap', 'swap', { ... });
   * if (result.kind === 'contractCall') {
   *   console.log('TX hash:', result.txHash);
   * } else if (result.kind === 'signedData') {
   *   console.log('Signature:', result.signature);
   * }
   */
  async executeAction(
    provider: string,
    action: string,
    params: Record<string, unknown>,
  ): Promise<ActionResult>;
}
```

### 5.2 신규 메서드: listOffchainActions()

```typescript
interface OffchainActionListItem {
  actionId: string;
  kind: 'signedData' | 'signedHttp';
  venue: string;
  operation: string;
  status: string;
  externalId: string | null;
  createdAt: number;
}

interface ListOffchainActionsOptions {
  venue?: string;
  limit?: number;
  offset?: number;
}

class WAIaaSClient {
  /**
   * List off-chain action history for the current wallet.
   *
   * @example
   * const actions = await client.listOffchainActions(walletId, { venue: 'binance', limit: 10 });
   * for (const action of actions.actions) {
   *   console.log(`${action.venue}/${action.operation}: ${action.status}`);
   * }
   */
  async listOffchainActions(
    walletId: string,
    options?: ListOffchainActionsOptions,
  ): Promise<{ actions: OffchainActionListItem[]; total: number }>;
}
```

#### 구현 경로

```typescript
async listOffchainActions(
  walletId: string,
  options?: ListOffchainActionsOptions,
): Promise<{ actions: OffchainActionListItem[]; total: number }> {
  const params = new URLSearchParams();
  params.set('actionKind', 'signedData,signedHttp');
  if (options?.venue) params.set('venue', options.venue);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));

  const response = await this.fetch(
    `/v1/wallets/${walletId}/transactions?${params}`,
  );
  return response.json();
}
```

### 5.3 신규 메서드: getActionResult()

```typescript
class WAIaaSClient {
  /**
   * Get the result of a specific action (on-chain or off-chain).
   *
   * @example
   * const result = await client.getActionResult('action-uuid');
   * if (result.actionKind === 'signedData') {
   *   console.log('Venue:', result.venue, 'Operation:', result.operation);
   * }
   */
  async getActionResult(actionId: string): Promise<ActionDetailResult>;
}

interface ActionDetailResult {
  id: string;
  walletId: string;
  chain: string;
  txHash: string | null;
  type: string;
  amount: string;
  toAddress: string | null;
  status: string;
  createdAt: number;
  // off-chain 확장
  actionKind: 'contractCall' | 'signedData' | 'signedHttp';
  venue: string | null;
  operation: string | null;
  externalId: string | null;
  metadata: Record<string, unknown>;
}
```

### 5.4 기존 credential SDK 메서드 (참조)

Phase 381에서 설계 완료된 credential 관련 SDK 메서드 4개:

```typescript
listCredentials(walletId: string): Promise<CredentialMetadata[]>;
createCredential(walletId: string, params: CreateCredentialParams): Promise<CredentialMetadata>;
deleteCredential(walletId: string, ref: string): Promise<void>;
rotateCredential(walletId: string, ref: string, newValue: string): Promise<CredentialMetadata>;
```

본 문서에서 재정의하지 않는다.

---

## 6. connect-info 확장

### 6.1 externalActions capability

```typescript
// GET /v1/connect-info 응답 확장
{
  // ... 기존 필드 ...
  capabilities: {
    // ... 기존 capability 필드 ...
    externalActions: true,
    supportedVenues: ['jupiter_swap', 'zerox_swap', ...],  // 등록된 ActionProvider의 venue 목록
    // signing은 Phase 382에서 이미 설계됨
    signing: ['eip712', 'personal', 'erc8128', 'hmac-sha256', 'rsa-pss', 'ecdsa-secp256k1', 'ed25519'],
  }
}
```

### 6.2 supportedVenues 수집

```typescript
// connect-info handler (의사 코드)
const providers = actionProviderRegistry.listProviders();
const venues = new Set<string>();

for (const provider of providers) {
  // ActionProviderMetadata에 venue 필드가 있으면 수집
  // 없으면 provider.metadata.name을 venue로 사용
  venues.add(provider.metadata.name);
}

return {
  capabilities: {
    ...existingCapabilities,
    externalActions: true,
    supportedVenues: Array.from(venues),
  },
};
```

### 6.3 에이전트 자기 발견 흐름

```
AI Agent → connect-info 호출
    → capabilities.externalActions === true 확인
    → capabilities.supportedVenues에서 사용 가능한 venue 확인
    → capabilities.signing에서 지원되는 서명 방식 확인
    → 적절한 action 실행 요청
```

---

## 7. 인증 모델

### 7.1 인증 매트릭스

| 작업 | 인증 | 근거 |
|------|------|------|
| action 실행 (`POST /v1/actions/:provider/:action`) | sessionAuth | 기존 패턴. 에이전트 세션으로 실행 |
| 트랜잭션 목록 조회 (`GET /v1/wallets/:id/transactions`) | sessionAuth | 기존 패턴 |
| 트랜잭션 상세 조회 (`GET /v1/transactions/:id`) | sessionAuth | 기존 패턴 |
| credential 목록 조회 (`GET /v1/wallets/:id/credentials`) | sessionAuth | Phase 381 설계 |
| credential 생성 (`POST /v1/wallets/:id/credentials`) | masterAuth | Phase 381 설계 (보안 민감) |
| credential 삭제 (`DELETE /v1/wallets/:id/credentials/:ref`) | masterAuth | Phase 381 설계 |
| credential 로테이션 (`PUT /v1/wallets/:id/credentials/:ref/rotate`) | masterAuth | Phase 381 설계 |
| 글로벌 credential 관리 (`/v1/admin/credentials/*`) | masterAuth | Phase 381 설계 |
| connect-info (`GET /v1/connect-info`) | 인증 불필요 | 기존 패턴 (공개 정보) |

### 7.2 off-chain action 실행 인증 경로

```
에이전트 → POST /v1/actions/:provider/:action (sessionAuth)
    → ActionProviderRegistry.executeAction()
    → resolve() → kind별 파이프라인
    → signedData pipeline:
        → CredentialVault.get(ref, walletId)  ← 내부 호출 (인증 불필요)
        → sign()
        → DB 기록
    → 응답 반환
```

**핵심**: action 실행 자체는 sessionAuth로 인증된다. credential 조회는 파이프라인 내부에서 수행되므로 별도 인증이 필요하지 않다. credential의 **등록/삭제/로테이션**만 masterAuth가 필요하다.

### 7.3 Admin 경로

```
Admin → GET /v1/admin/transactions?actionKind=signedData (masterAuth)
    → off-chain action 포함 전체 트랜잭션 조회
```

---

## 8. 설계 결정 요약 테이블

| # | 결정 | 근거 |
|---|------|------|
| D1 | 별도 off-chain 엔드포인트를 추가하지 않고 기존 엔드포인트 확장 | DX 일관성. 에이전트는 on-chain/off-chain 구분 없이 동일 API 사용. ActionProvider 추상화 레벨 유지 |
| D2 | contractCall 응답에 `kind: 'contractCall'` 추가 (optional) | 기존 소비자가 kind를 무시해도 하위 호환. 신규 소비자는 kind로 결과 타입 구분 가능 |
| D3 | MCP action-list-offchain 신규 도구 추가 | 기존 MCP 도구 목록에서 off-chain 이력 조회 기능이 없으므로 별도 도구 필요 |
| D4 | SDK ActionResult를 kind-discriminated union으로 확장 | TypeScript에서 switch(result.kind)로 타입 안전한 분기 가능 |
| D5 | connect-info에 externalActions + supportedVenues 추가 | 에이전트 자기 발견 지원. 지원되지 않는 venue에 대한 사전 필터링 가능 |
| D6 | action 실행은 sessionAuth, credential 관리는 masterAuth | 기존 인증 패턴 일관성. credential 값 변경은 보안 민감 작업이므로 masterAuth 필수 |
| D7 | credential 관리 인터페이스는 Phase 381 설계 참조만 | 중복 정의 방지. Phase 381에서 REST 8개 + MCP 4개 + SDK 4개 완전 설계됨 |

---

## 9. Pitfall 방지 체크리스트

- [ ] **기존 action-execute 응답에 kind 필드 추가 시 하위 호환 확인**: 기존 SDK/MCP 코드가 kind 필드를 무시해도 정상 동작하는지 검증. kind는 optional로 추가하여 기존 소비자 코드 변경 불필요
- [ ] **actionKind 필터 파라미터의 다중 값 지원**: `?actionKind=signedData,signedHttp` 형태로 여러 kind를 동시 필터할 수 있어야 함. 쉼표 구분 파싱 구현 필요
- [ ] **off-chain action 목록에서 txHash=null 처리**: UI/SDK에서 txHash가 null인 레코드를 정상적으로 표시. 블록체인 익스플로러 링크를 생략하는 조건 분기
- [ ] **MCP action-list-offchain 도구에서 walletId 권한 검사**: 요청한 walletId가 현재 세션에 연결된 지갑인지 확인. 다른 지갑의 이력 접근 방지
- [ ] **SDK ActionResult union의 kind 필드 파싱**: REST API 응답에서 kind가 없으면(기존 contractCall) 기본값 'contractCall'로 처리하는 폴백 로직 필요
- [ ] **multi-step 응답과 단일 step 응답 구분**: 배열 응답(MultiStepActionResult)과 단일 응답(ActionExecutionResult)을 구분하는 로직. Array.isArray() 체크 또는 별도 wrapper 사용
- [ ] **connect-info supportedVenues가 동적 갱신**: ActionProvider가 런타임에 등록/해제될 때 connect-info 캐시 무효화 필요
- [ ] **off-chain action metadata에 credential 값 비포함**: DB에 저장되는 metadata에 signature는 포함하되 credential.value(HMAC secret 등)는 절대 포함하지 않음

---

*Phase: 383-pipeline-routing, Plan: 02*
*작성일: 2026-03-12*
