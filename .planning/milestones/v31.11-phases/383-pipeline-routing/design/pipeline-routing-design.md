# 3-way 파이프라인 라우팅 + DB 스키마 + 정책 평가 시점 설계

> Phase 383, Plan 01 — ResolvedAction kind별 파이프라인 분기, off-chain action DB 기록, 정책 평가 시점 보장

---

## 1. 개요

### 목표

Phase 380에서 설계한 ResolvedAction 3종 union 타입(contractCall/signedData/signedHttp)이 실제 파이프라인에서 어떻게 분기되는지, off-chain 액션이 DB에 어떻게 기록되는지, 정책 평가가 모든 경로에서 보장되는지 상세 설계한다.

### Phase 380~382 설계 연결점

| Phase | 산출물 | 본 설계에서 활용 |
|-------|--------|----------------|
| 380 | ResolvedAction 3종 Zod union + normalizeResolvedAction() | kind별 분기 입력 타입 |
| 381 | ICredentialVault + resolveCredentialRef() | credentialRef 해소 단계 |
| 382 | SignerCapabilityRegistry + 7종 ISignerCapability | sign() 실행 위임 |

### 기존 파이프라인 무변경 원칙

- **6-stage pipeline**: contractCall kind는 기존 경로 그대로 진입 (Stage 1~6 무변경)
- **sign-only pipeline**: 기존 REST API `POST /v1/wallets/:id/sign-transaction` 경로 무변경
- **sign-message pipeline**: 기존 REST API `POST /v1/wallets/:id/sign-message` 경로 무변경
- **sign-http pipeline**: 기존 REST API `POST /v1/wallets/:id/sign-http` 경로 무변경
- **새 경로**: `POST /v1/actions/:provider/:action`에서만 kind별 분기 수행

---

## 2. 3-way 파이프라인 라우팅 (PIPE-01)

### 2.1 ActionProviderRegistry.executeAction() 내부 흐름

```typescript
// ActionProviderRegistry.executeAction() 의사 코드
async executeAction(
  providerName: string,
  actionName: string,
  params: Record<string, unknown>,
  context: ActionContext,
): Promise<ActionExecutionResult> {
  const provider = this.getProvider(providerName);
  const raw = await provider.resolve(actionName, params, context);

  // ── Step 0: ApiDirectResult 분기 (기존 로직, 정규화 전) ──
  if (isApiDirectResult(raw)) {
    return this.handleApiDirectResult(raw, context);
  }

  // ── Step 1: 정규화 (Phase 380) ──
  const actions = normalizeResolvedActions(raw);

  // ── Step 2: kind별 순차 실행 ──
  const results: ActionStepResult[] = [];
  for (const action of actions) {
    const result = await this.routeByKind(action, context);
    results.push(result);
  }

  return this.assembleResult(results);
}
```

### 2.2 kind별 라우팅 분기

```typescript
// routeByKind() 의사 코드
private async routeByKind(
  action: ResolvedAction,
  context: ActionContext,
): Promise<ActionStepResult> {
  switch (action.kind) {
    case 'contractCall':
      return this.executeContractCall(action, context);

    case 'signedData':
      return this.executeSignedData(action, context);

    case 'signedHttp':
      return this.executeSignedHttp(action, context);
  }
}
```

### 2.3 contractCall 경로

기존 6-stage pipeline에 직접 진입한다. **변경 없음**.

```typescript
private async executeContractCall(
  action: NormalizedContractCall,
  context: ActionContext,
): Promise<ActionStepResult> {
  // kind 필드를 제거하고 기존 ContractCallRequest 형태로 변환
  const { kind, ...contractCallRequest } = action;

  // 기존 6-stage pipeline 진입 (Stage 1~6)
  const result = await this.pipeline.execute(contractCallRequest, context);

  return {
    kind: 'contractCall',
    transactionId: result.txId,
    txHash: result.txHash,
    status: result.status,
  };
}
```

### 2.4 signedData 경로 (신규)

Phase 381 CredentialVault + Phase 382 SignerCapabilityRegistry를 활용하는 새로운 파이프라인.

```typescript
private async executeSignedData(
  action: SignedDataAction,
  context: ActionContext,
): Promise<ActionStepResult> {
  // Phase 383 signedData pipeline (섹션 3에서 상세 설계)
  return this.signedDataPipeline.execute(action, context);
}
```

### 2.5 signedHttp 경로 (신규)

서명된 HTTP 요청 파이프라인. 서명만 수행하고 HTTP 발송은 ActionProvider 책임으로 분리.

```typescript
private async executeSignedHttp(
  action: SignedHttpAction,
  context: ActionContext,
): Promise<ActionStepResult> {
  // Phase 383 signedHttp pipeline (섹션 4에서 상세 설계)
  return this.signedHttpPipeline.execute(action, context);
}
```

### 2.6 mixed-kind 배열 처리

`ResolvedAction[]`에서 contractCall + signedData가 혼재할 수 있다 (예: approve on-chain + sign off-chain order).

```
예시: Aave supply + CEX hedge order
  actions[0] = { kind: 'contractCall', type: 'CONTRACT_CALL', ... }  // approve
  actions[1] = { kind: 'contractCall', type: 'CONTRACT_CALL', ... }  // supply
  actions[2] = { kind: 'signedData', signingScheme: 'hmac-sha256', venue: 'binance', ... }  // hedge
```

**처리 규칙:**
- 배열 내 순서대로 순차 실행 (선행 step 실패 시 중단)
- 각 step의 결과를 개별 DB 기록
- mixed-kind의 경우 전체 결과를 배열로 반환

### 2.7 전체 흐름도

```
ActionProvider.resolve() 반환
        |
        v
  isApiDirectResult()?  ---- YES --> 기존 ApiDirectResult 경로 (DB 기록 포함, 변경 없음)
        | NO
        v
  normalizeResolvedActions(raw)
        |
        v
  ResolvedAction[] (kind 필수)
        |
        v
  for (action of actions):
        |
        +-- kind: 'contractCall'
        |       |
        |       v
        |   [정책 평가] --> [6-stage pipeline (기존)] --> [DB: action_kind='contractCall']
        |
        +-- kind: 'signedData'
        |       |
        |       v
        |   [정책 평가] --> [credential 해소] --> [SigningParams 조립]
        |       --> [canSign() 검증] --> [sign() 실행] --> [DB: action_kind='signedData']
        |
        +-- kind: 'signedHttp'
                |
                v
            [정책 평가] --> [credential 해소] --> [서명 생성]
                --> [서명된 헤더 조립] --> [DB: action_kind='signedHttp']
```

---

## 3. signedData 파이프라인 상세

5단계 흐름으로 구성된다.

### 3.1 Stage 1: credentialRef 해소

Phase 381의 `resolveCredentialRef()` 함수를 활용한다.

```typescript
// credentialRef가 있는 경우
if (action.credentialRef) {
  const credential = await this.credentialVault.get(
    action.credentialRef,
    context.walletId,
  );
  // credential.value → 복호화된 비밀 값
}

// credentialRef가 없는 경우 (EIP-712 등)
// → wallet key를 ActionContext에서 직접 사용
// → context.privateKey (requiresSigningKey=true 시 주입됨)
```

**해소 우선순위 (Phase 381 설계):**
1. UUID 형태 → `wallet_credentials.id`로 직접 조회
2. `{walletId}:{name}` 형태 → walletId + name으로 조회
3. 이름만 → per-wallet 먼저 → 글로벌 fallback

### 3.2 Stage 2: SigningParams 조립

signingScheme별 discriminated union 매핑. Phase 382에서 설계한 `SigningParams` 타입에 맞춰 조립.

```typescript
function assembleSigningParams(
  action: SignedDataAction,
  credential: DecryptedCredential | null,
  context: ActionContext,
): SigningParams {
  switch (action.signingScheme) {
    case 'eip712':
      return {
        scheme: 'eip712',
        domain: action.payload.domain,
        types: action.payload.types,
        primaryType: action.payload.primaryType,
        value: action.payload.value,
        privateKey: context.privateKey!,  // ActionContext에서 주입
      } as Eip712SigningParams;

    case 'hmac-sha256':
      return {
        scheme: 'hmac-sha256',
        data: action.payload.data,
        secret: credential!.value,  // CredentialVault에서 주입
        encoding: action.payload.encoding,
      } as HmacSigningParams;

    case 'personal':
      return {
        scheme: 'personal',
        message: action.payload.message,
        privateKey: context.privateKey!,
      } as PersonalSigningParams;

    case 'ecdsa-secp256k1':
      return {
        scheme: 'ecdsa-secp256k1',
        data: action.payload.data,
        privateKey: context.privateKey!,
        hashData: action.payload.hashData,
      } as EcdsaSecp256k1SigningParams;

    case 'ed25519':
      return {
        scheme: 'ed25519',
        data: action.payload.data,
        privateKey: context.privateKey!,  // Uint8Array (Solana keypair)
      } as Ed25519SigningParams;

    case 'rsa-pss':
      return {
        scheme: 'rsa-pss',
        data: action.payload.data,
        privateKey: credential!.value,  // CredentialVault에서 PEM 주입
        saltLength: action.payload.saltLength,
      } as RsaPssSigningParams;

    default:
      throw new SigningError(`Unsupported scheme: ${action.signingScheme}`, action.signingScheme, 'INVALID_PARAMS');
  }
}
```

**키 출처 분류:**

| signingScheme | 키 출처 | credentialRef 필요 |
|---------------|---------|-------------------|
| `eip712` | ActionContext.privateKey | 불필요 (wallet key) |
| `personal` | ActionContext.privateKey | 불필요 (wallet key) |
| `ecdsa-secp256k1` | ActionContext.privateKey | 불필요 (wallet key) |
| `ed25519` | ActionContext.privateKey | 불필요 (wallet key) |
| `hmac-sha256` | CredentialVault | 필수 |
| `rsa-pss` | CredentialVault | 필수 |
| `erc8128` | ActionContext.privateKey | 불필요 (wallet key) |

### 3.3 Stage 3: canSign() 사전 검증

credential 주입 후 완전한 params로 검증한다.

```typescript
const capability = this.signerRegistry.resolve(action);
// resolve()는 scheme 매핑만 수행 (canSign 미호출 — Phase 382 설계)

const params = assembleSigningParams(action, credential, context);

// credential 주입 후 canSign() 검증
if (!capability.canSign(params)) {
  throw new SigningError(
    `Signer capability cannot sign with provided params`,
    action.signingScheme,
    'INVALID_PARAMS',
  );
}
```

### 3.4 Stage 4: sign() 실행

```typescript
const signingResult = await capability.sign(params);
// signingResult = { signature: string, metadata?: Record<string, unknown> }
```

### 3.5 Stage 5: 결과 처리

```typescript
// 1. DB 기록 (섹션 5 참조)
const actionId = await this.recordOffchainAction(action, signingResult, context);

// 2. credential 메모리 클리어
if (credential) {
  // string은 immutable이므로 Buffer 변환 후 fill
  const buf = Buffer.from(credential.value);
  buf.fill(0);
  credential.value = '';
}

// 3. 응답 조립
return {
  kind: 'signedData',
  actionId,
  venue: action.venue,
  operation: action.operation,
  signature: signingResult.signature,
  metadata: signingResult.metadata,
  tracking: action.tracking,
};
```

### 3.6 signedData 파이프라인 전체 흐름도

```
SignedDataAction 입력
        |
        v
  [Stage 1] credentialRef 해소
        |-- credentialRef 있음 --> CredentialVault.get(ref, walletId) --> DecryptedCredential
        |-- credentialRef 없음 --> null (wallet key 직접 사용)
        |
        v
  [Stage 2] SigningParams 조립
        |-- scheme별 discriminated union 매핑
        |-- credential.value 또는 context.privateKey 주입
        |
        v
  [Stage 3] canSign() 사전 검증
        |-- true  --> 다음 단계
        |-- false --> SigningError('INVALID_PARAMS')
        |
        v
  [Stage 4] sign() 실행
        |-- SignerCapabilityRegistry.resolve(action) --> ISignerCapability
        |-- capability.sign(params) --> SigningResult
        |
        v
  [Stage 5] 결과 처리
        |-- DB 기록 (transactions + action_kind='signedData')
        |-- credential 메모리 클리어
        |-- 응답 조립
```

---

## 4. signedHttp 파이프라인 상세

6단계 흐름. signedData와 유사하나 HTTP 서명 특화 로직이 추가된다.

### 4.1 Stage 1: credentialRef 해소

signedData와 동일한 로직. Phase 381 `resolveCredentialRef()` 활용.

### 4.2 Stage 2: 서명 생성

signingScheme에 따라 HTTP 메시지 서명을 생성한다.

```typescript
function assembleHttpSigningParams(
  action: SignedHttpAction,
  credential: DecryptedCredential | null,
  context: ActionContext,
): SigningParams {
  switch (action.signingScheme) {
    case 'erc8128':
      return {
        scheme: 'erc8128',
        method: action.method,
        url: action.url,
        headers: action.headers,
        body: action.body,
        coveredComponents: action.coveredComponents,
        preset: action.preset,
        ttlSec: action.ttlSec,
        nonce: action.nonce,
        privateKey: context.privateKey!,
        chainId: parseInt(context.chain),  // ActionContext.chain에서 추출
        address: context.walletAddress,
      } as Erc8128SigningParams;

    case 'hmac-sha256':
      // HTTP 요청 서명에 HMAC 사용 (일부 CEX API)
      return {
        scheme: 'hmac-sha256',
        data: action.body ?? '',  // 서명 대상 = body
        secret: credential!.value,
        encoding: 'hex',
      } as HmacSigningParams;

    case 'rsa-pss':
      return {
        scheme: 'rsa-pss',
        data: action.body ?? '',
        privateKey: credential!.value,
      } as RsaPssSigningParams;
  }
}
```

### 4.3 Stage 3: 서명 실행

```typescript
const capability = this.signerRegistry.resolve(action);
const params = assembleHttpSigningParams(action, credential, context);

if (!capability.canSign(params)) {
  throw new SigningError('Cannot sign HTTP request', action.signingScheme, 'INVALID_PARAMS');
}

const signingResult = await capability.sign(params);
```

### 4.4 Stage 4: 서명된 헤더 조립

```typescript
// ERC-8128의 경우 metadata에서 signedHeaders 추출
const signedHeaders = signingResult.metadata?.signedHeaders ?? {};
const signatureInput = signingResult.metadata?.signatureInput;

// HMAC/RSA-PSS의 경우 ActionProvider가 헤더 위치를 결정
// (기본: Authorization header에 삽입)
```

### 4.5 Stage 5: DB 기록

signedData와 동일한 DB 기록 경로. `action_kind='signedHttp'`.

### 4.6 Stage 6: 결과 반환

```typescript
return {
  kind: 'signedHttp',
  actionId,
  venue: action.venue,
  operation: action.operation,
  signature: signingResult.signature,
  signedHeaders,
  signatureInput,
  tracking: action.tracking,
};
```

### 4.7 설계 결정: fetch 수행 여부

**결정: signedHttp 파이프라인은 서명만 반환하고 HTTP 발송(fetch)은 수행하지 않는다.**

근거:
1. **관심사 분리**: 파이프라인은 서명 책임만 담당. HTTP 요청의 성공/실패/재시도는 ActionProvider 책임
2. **에러 책임 경계**: fetch 실패 시 retry, timeout, redirect 등의 복잡한 로직이 파이프라인에 유입되면 단일 책임 위반
3. **기존 ERC-8128 REST API 패턴**: 기존 `POST /v1/wallets/:id/sign-http`도 서명만 반환하고 fetch는 호출자 책임
4. **ActionProvider가 fetch를 수행하려면**: resolve()에서 ApiDirectResult를 반환하는 기존 패턴 사용 (Hyperliquid, Polymarket처럼)

**예외: ActionProvider가 fetch까지 수행하는 경우**
- resolve() 내부에서 자체적으로 HTTP 요청을 발송하고 `ApiDirectResult`를 반환
- 이 경우 signedHttp 파이프라인을 거치지 않음
- 향후 이런 provider를 `SignedHttpAction` + fetch 지원으로 마이그레이션할 수 있으나, 본 마일스톤 범위 밖

### 4.8 기존 ERC-8128 sign-http REST API와의 관계

| 경로 | 용도 | 변경 여부 |
|------|------|----------|
| `POST /v1/wallets/:id/sign-http` | 직접 HTTP 서명 요청 (REST API) | 무변경 |
| signedHttp pipeline (신규) | ActionProvider resolve() 결과의 signedHttp kind 처리 | 신규 |

두 경로는 완전히 독립적이다. 기존 sign-http REST API는 ISignerCapability를 사용하지 않는다.

---

## 5. off-chain action DB 기록 (PIPE-03)

### 5.1 transactions 테이블 확장

#### 신규 컬럼 추가

| 컬럼 | 타입 | DEFAULT | 설명 |
|------|------|---------|------|
| `action_kind` | TEXT NOT NULL | `'contractCall'` | 파이프라인 kind (contractCall/signedData/signedHttp) |
| `venue` | TEXT | NULL | 외부 서비스 식별자 (예: 'binance', 'cow-protocol') |
| `operation` | TEXT | NULL | 액션 이름 (예: 'place-order', 'cancel-order') |
| `external_id` | TEXT | NULL | 외부 서비스 반환 ID |

#### txHash nullable 전환 — 전수 조사 결과

**현재 상태**: transactions 테이블의 `tx_hash` 컬럼은 이미 `TEXT` (nullable)로 정의되어 있다.

Drizzle 스키마 확인 (`packages/daemon/src/infrastructure/database/schema.ts:171`):
```typescript
txHash: text('tx_hash'),  // nullable (notNull() 미호출)
```

마이그레이션 이력 확인:
- v14 이후 모든 마이그레이션에서 `tx_hash TEXT` (NOT NULL 없음)
- v27 `incoming_transactions` 테이블만 `tx_hash TEXT NOT NULL` (별도 테이블, 영향 없음)

**txHash 사용 패턴 분석:**

| 파일 | 패턴 | nullable 안전 여부 |
|------|------|-------------------|
| `openapi-schemas.ts` | `txHash: z.string().nullable()` | 안전 (이미 nullable) |
| `admin-wallets.ts` | `txHash: tx.txHash ?? null` | 안전 (null 처리 존재) |
| `admin-auth.ts` | `txHash: tx.txHash ?? null` | 안전 |
| `transactions.ts` | `txHash: result.txHash ?? null` | 안전 |
| `actions.ts` | `if (txHash) { ... }` | 안전 (null 가드) |
| `wallets.ts` | `status: r.txHash ? 'success' : 'failed'` | 주의: off-chain은 txHash 없어도 성공 가능 |
| `stages.ts` (pipeline) | `.set({ status: 'SUBMITTED', txHash: ... })` | 안전 (contractCall에서만 호출) |
| `webhook-service.ts` | `txHash: e.txHash` | 안전 (nullable 전달) |
| `admin-monitoring.ts` | `txHash LIKE pattern` 검색 | 안전 (NULL은 LIKE에서 매칭 안됨) |
| `sign-only.ts` | `txHash: signed.txHash ?? ''` | 안전 (empty string fallback) |

**결론: txHash는 이미 nullable이며 대부분의 코드가 null-safe하다.** 단, `wallets.ts`의 `r.txHash ? 'success' : 'failed'` 패턴은 off-chain 레코드에서 수정이 필요하다 (action_kind 기반 상태 판단으로 전환).

**영향받는 코드 1곳:**
- `packages/daemon/src/api/routes/wallets.ts:1399` — `status: r.txHash ? 'success' : 'failed'`
  - 수정 방향: `status: (r.actionKind !== 'contractCall') ? r.status : (r.txHash ? 'success' : 'failed')`

### 5.2 DB 마이그레이션 설계

wallet_credentials가 v55이므로 본 마이그레이션은 **v56**.

```sql
-- DB migration v56: transactions 테이블 off-chain action 지원

-- 1. action_kind 컬럼 추가
ALTER TABLE transactions ADD COLUMN action_kind TEXT NOT NULL DEFAULT 'contractCall';

-- 2. venue, operation, external_id 컬럼 추가
ALTER TABLE transactions ADD COLUMN venue TEXT;
ALTER TABLE transactions ADD COLUMN operation TEXT;
ALTER TABLE transactions ADD COLUMN external_id TEXT;

-- 3. 인덱스 추가
CREATE INDEX idx_transactions_action_kind ON transactions(action_kind);
CREATE INDEX idx_transactions_venue ON transactions(venue);
CREATE INDEX idx_transactions_external_id ON transactions(external_id)
  WHERE external_id IS NOT NULL;

-- 4. schema_version 업데이트
UPDATE schema_version SET version = 56;
```

### 5.3 Drizzle 스키마 초안

```typescript
// packages/daemon/src/infrastructure/database/schema.ts 확장

export const transactions = sqliteTable('transactions', {
  // ... 기존 필드 유지 ...

  // ── off-chain action 지원 (v56) ──
  actionKind: text('action_kind').notNull().default('contractCall'),
    // 'contractCall' | 'signedData' | 'signedHttp'
  venue: text('venue'),
    // 외부 서비스 식별자 (nullable, contractCall에서는 null)
  operation: text('operation'),
    // 액션 이름 (nullable)
  externalId: text('external_id'),
    // 외부 서비스 반환 ID (nullable)
}, (table) => ({
  // ... 기존 인덱스 유지 ...

  // ── 신규 인덱스 ──
  actionKindIdx: index('idx_transactions_action_kind').on(table.actionKind),
  venueIdx: index('idx_transactions_venue').on(table.venue),
  externalIdIdx: index('idx_transactions_external_id')
    .on(table.externalId)
    .where(sql`external_id IS NOT NULL`),
}));
```

### 5.4 off-chain action 레코드 삽입

```typescript
async function recordOffchainAction(
  action: SignedDataAction | SignedHttpAction,
  signingResult: SigningResult,
  context: ActionContext,
): Promise<string> {
  const txId = generateUUIDv7();

  await db.insert(transactions).values({
    id: txId,
    walletId: context.walletId,
    sessionId: context.sessionId,
    chain: context.chain,
    txHash: null,                            // off-chain은 txHash 없음
    type: 'CONTRACT_CALL',                   // 기존 type enum 재사용 (호환)
    amount: '0',
    toAddress: action.venue,                 // venue를 toAddress에도 저장 (검색 호환)
    status: 'CONFIRMED',                     // off-chain 서명은 즉시 확정
    tier: 'INSTANT',
    actionKind: action.kind,                 // 'signedData' | 'signedHttp'
    venue: action.venue,
    operation: action.operation,
    externalId: null,                        // 비동기 tracking 시 업데이트
    metadata: JSON.stringify({
      signature: signingResult.signature,
      signingScheme: action.signingScheme,
      ...(signingResult.metadata ?? {}),
    }),
    createdAt: Math.floor(Date.now() / 1000),
  });

  return txId;
}
```

### 5.5 기존 contractCall 레코드와의 공존

| 필드 | contractCall | signedData | signedHttp |
|------|-------------|------------|------------|
| `action_kind` | `'contractCall'` (DEFAULT) | `'signedData'` | `'signedHttp'` |
| `tx_hash` | 블록체인 TX 해시 | NULL | NULL |
| `venue` | NULL | 외부 서비스 | 외부 서비스 |
| `operation` | NULL | 액션 이름 | 액션 이름 |
| `external_id` | NULL | 외부 ID (optional) | 외부 ID (optional) |
| `type` | 8-type enum | `'CONTRACT_CALL'` (호환) | `'CONTRACT_CALL'` (호환) |
| `status` | Pipeline 상태 | `'CONFIRMED'` | `'CONFIRMED'` |

**기존 레코드 호환**: `action_kind` DEFAULT가 `'contractCall'`이므로 기존 레코드는 자동으로 contractCall로 분류된다.

---

## 6. 정책 평가 시점 보장 (PIPE-02)

### 6.1 기존 contractCall 정책 평가 위치

기존 6-stage pipeline에서 정책 평가는 **Stage 2: 정책 평가**에서 수행된다:

```
Stage 1: 입력 검증 → Stage 2: 정책 평가 → Stage 3: 가스 추정 → Stage 4: 서명 → Stage 5: 제출 → Stage 6: 확인
```

정책 평가는 resolve() 후, 서명 전에 위치한다.

### 6.2 signedData/signedHttp 경로의 정책 평가

동일한 시점(resolve() 후 서명 전)에서 정책 평가를 수행한다.

```typescript
// routeByKind() 내부 (확장)
private async routeByKind(
  action: ResolvedAction,
  context: ActionContext,
): Promise<ActionStepResult> {
  // ── 공통: 정책 평가 (resolve() 후 서명 전) ──
  if (action.kind === 'signedData' || action.kind === 'signedHttp') {
    const policyResult = await this.evaluatePolicy(action, context);
    if (policyResult.denied) {
      throw new PolicyDeniedError(policyResult.reason);
    }
  }
  // contractCall은 6-stage pipeline 내부에서 정책 평가 (기존)

  switch (action.kind) { /* ... */ }
}
```

### 6.3 policyContext → ActionPolicyParam 변환

```typescript
function toPolicyParam(
  action: SignedDataAction | SignedHttpAction,
  context: ActionContext,
): ActionPolicyParam {
  const pc = action.policyContext;

  return {
    // 기존 ActionPolicyParam 필드
    walletId: context.walletId,
    chain: context.chain,
    type: 'CONTRACT_CALL',        // 기존 type 체계 유지
    amount: '0',                  // off-chain은 금액 0

    // off-chain 확장 필드 (Phase 384에서 상세화)
    venue: action.venue,
    actionCategory: pc?.actionCategory,
    notionalUsd: pc?.notionalUsd,
    leverage: pc?.leverage,
    expiry: pc?.expiry,
    hasWithdrawCapability: pc?.hasWithdrawCapability,
  };
}
```

### 6.4 기존 PolicyService.evaluate() 호출 흐름 재사용

```typescript
// 정책 평가 호출
const policyParam = toPolicyParam(action, context);
const result = await this.policyService.evaluate(policyParam);

if (result.decision === 'DENY') {
  throw new PolicyDeniedError(result.reason, 'POLICY_DENIED');
}

if (result.decision === 'DELAY') {
  // 시간 지연 적용 (기존 DELAY 로직 재사용)
  await this.applyDelay(result.delaySeconds);
}

if (result.decision === 'APPROVAL') {
  // Owner 승인 대기 (기존 APPROVAL 로직 재사용)
  await this.awaitOwnerApproval(action, context);
}
```

### 6.5 정책 거부 시 동작

정책 평가가 DENY를 반환하면 서명하지 않고 에러를 반환한다.

```typescript
// 에러 응답 예시
{
  error: 'POLICY_DENIED',
  message: 'Action denied by policy: VENUE_WHITELIST',
  details: {
    venue: 'binance',
    policy: 'VENUE_WHITELIST',
    reason: 'Venue not in whitelist',
  }
}
```

### 6.6 Phase 384 placeholder

Phase 384에서 상세화될 정책 확장의 placeholder:

```typescript
// Phase 384에서 구현할 정책 타입 (placeholder)
interface VenueWhitelistPolicy {
  type: 'VENUE_WHITELIST';
  allowedVenues: string[];  // ['binance', 'cow-protocol', ...]
}

interface ActionCategoryLimitPolicy {
  type: 'ACTION_CATEGORY_LIMIT';
  category: 'trade' | 'withdraw' | 'transfer' | 'sign' | 'deposit';
  dailyLimitUsd: number;
  windowSeconds: number;
}
```

---

## 7. 에러 처리

### 7.1 kind별 에러 코드 매핑

| 에러 코드 | HTTP 상태 | 발생 파이프라인 | 출처 Phase |
|-----------|----------|----------------|-----------|
| `CREDENTIAL_NOT_FOUND` | 404 | signedData, signedHttp | Phase 381 |
| `CREDENTIAL_EXPIRED` | 410 | signedData, signedHttp | Phase 381 |
| `CREDENTIAL_ACCESS_DENIED` | 403 | signedData, signedHttp | Phase 381 |
| `CAPABILITY_NOT_FOUND` | 400 | signedData, signedHttp | Phase 382 |
| `SIGNING_FAILED` | 500 | signedData, signedHttp | Phase 382 |
| `INVALID_KEY` | 400 | signedData, signedHttp | Phase 382 |
| `INVALID_PARAMS` | 400 | signedData, signedHttp | Phase 382 |
| `POLICY_DENIED` | 403 | contractCall, signedData, signedHttp | 기존 |

### 7.2 에러 발생 시점

```
signedData pipeline:
  Stage 1 (credential 해소) → CREDENTIAL_NOT_FOUND, CREDENTIAL_EXPIRED, CREDENTIAL_ACCESS_DENIED
  Stage 2 (params 조립)     → INVALID_PARAMS (scheme 미지원)
  Stage 3 (canSign 검증)    → INVALID_PARAMS (params 불완전)
  Stage 4 (sign 실행)       → SIGNING_FAILED, INVALID_KEY
  정책 평가                   → POLICY_DENIED

signedHttp pipeline:
  동일 에러 매핑 + HTTP_REQUEST_FAILED (선택적, fetch 수행 시에만)
```

### 7.3 에러 응답 형식

기존 WAIaaS 에러 응답 형식을 그대로 사용한다:

```typescript
{
  error: string,        // 에러 코드 (CREDENTIAL_NOT_FOUND 등)
  message: string,      // human-readable 메시지
  details?: {            // 추가 컨텍스트 (선택적)
    venue?: string,
    signingScheme?: string,
    credentialRef?: string,
  }
}
```

---

## 8. 설계 결정 요약 테이블

| # | 결정 | 근거 |
|---|------|------|
| D1 | ApiDirectResult 분기를 정규화 전에 수행 | ApiDirectResult는 ResolvedAction union 밖 (Phase 380 D3). isApiDirectResult() 먼저 체크하여 정규화 대상에서 제외 |
| D2 | signedHttp 파이프라인은 서명만 반환, fetch 미수행 | 관심사 분리 원칙. HTTP 요청 성공/실패/재시도는 ActionProvider 책임. 기존 sign-http REST API 패턴과 일관 |
| D3 | mixed-kind 배열은 순차 실행 | 선행 step이 실패하면 후행 step 실행 불가 (예: approve 실패 시 order signing 불필요) |
| D4 | action_kind DEFAULT 'contractCall' | 기존 레코드 자동 호환. 별도 마이그레이션 데이터 변환 불필요 |
| D5 | off-chain type 컬럼에 기존 'CONTRACT_CALL' 재사용 | 기존 8-type discriminatedUnion 확장보다 action_kind로 on/off-chain 구분이 더 명확. type 확장은 향후 별도 결정 |
| D6 | 정책 평가 시점: resolve() 후 서명 전 (모든 kind 동일) | 기존 6-stage pipeline Stage 2와 동일 시점. off-chain 액션도 서명 전에 정책 체크하여 비인가 서명 방지 |
| D7 | DB 마이그레이션 v56 (wallet_credentials v55 다음) | 순차적 마이그레이션 번호 유지. ALTER TABLE 방식으로 기존 데이터 무손실 |
| D8 | txHash nullable — 전수 조사 결과 이미 nullable | Drizzle 스키마에서 `text('tx_hash')` (notNull 없음). 대부분의 코드에서 null-safe 처리 완료. 1곳(wallets.ts) 수정 필요 |
| D9 | off-chain action 상태를 즉시 CONFIRMED로 기록 | 서명은 즉시 완료되므로 PENDING/SUBMITTED 상태 불필요. 비동기 추적(tracking)이 있으면 Phase 384에서 상태 업데이트 경로 설계 |
| D10 | venue를 toAddress에도 저장 | 기존 검색/필터 쿼리가 toAddress를 사용하므로 off-chain 레코드도 검색 가능하게 보장 |

---

## 9. Pitfall 방지 체크리스트

- [ ] **isApiDirectResult() 검사를 normalizeResolvedActions() 전에 수행**: ApiDirectResult를 정규화하면 kind 필드 부재로 에러 발생. resolve() 반환 후 즉시 isApiDirectResult() 체크
- [ ] **credentialRef 해소 시 walletId 권한 검사**: 다른 지갑의 credential에 접근하면 CREDENTIAL_ACCESS_DENIED. Phase 381 resolveCredentialRef() 로직 재사용
- [ ] **canSign() 검사를 credential 주입 후에 수행**: resolve() 시점에는 credential 미주입이므로 canSign()이 false를 반환할 수 있음 (Phase 382 D5)
- [ ] **credential 메모리 클리어를 sign() 완료 후 즉시 수행**: Buffer.fill(0) + 참조 해제. string은 immutable이므로 GC 의존 (JavaScript 제약)
- [ ] **mixed-kind 배열에서 선행 step 실패 시 후행 step 중단**: 순차 실행이므로 for-loop에서 에러 발생 시 즉시 throw. 이미 실행된 step의 DB 기록은 유지 (롤백 불가)
- [ ] **action_kind DEFAULT 'contractCall'로 기존 레코드 호환**: 마이그레이션 시 기존 레코드의 action_kind가 자동으로 'contractCall'로 설정됨. 별도 UPDATE 불필요
- [ ] **wallets.ts의 txHash 기반 상태 판단 수정**: `r.txHash ? 'success' : 'failed'` 패턴을 action_kind 기반으로 전환하여 off-chain 레코드가 'failed'로 잘못 표시되는 것 방지
- [ ] **정책 평가 시점 누락 방지**: signedData/signedHttp 경로에서 정책 평가를 반드시 서명 전에 수행. 정책 평가 없이 서명이 진행되면 보안 위반
- [ ] **off-chain action type 필드에 새 값 추가하지 않음**: 기존 8-type discriminatedUnion은 on-chain 전용. off-chain은 action_kind로 구분. type 확장은 별도 마일스톤에서 결정
- [ ] **idx_transactions_tx_hash UNIQUE 인덱스와 NULL txHash**: SQLite에서 NULL은 UNIQUE 비교에서 항상 다른 값으로 취급되므로 txHash가 NULL인 여러 행이 존재해도 UNIQUE 제약 위반 없음
- [ ] **incoming_transactions 테이블 혼동 금지**: incoming_transactions의 tx_hash는 NOT NULL (수신 TX는 항상 해시 존재). transactions 테이블의 tx_hash와 다른 규칙

---

*Phase: 383-pipeline-routing, Plan: 01*
*작성일: 2026-03-12*
