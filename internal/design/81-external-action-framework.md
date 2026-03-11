# External Action Framework 설계 (doc-81)

> v31.11 설계 마일스톤 통합 문서
> Phase 380~384의 10개 설계 문서를 단일 참조로 통합

---

## 0. 개요

### 목표

ActionProvider 프레임워크를 on-chain 트랜잭션 전용에서 off-chain 액션(CEX API, EIP-712 CLOB, ERC-8128 서명 HTTP)을 포괄하는 통합 액션 모델로 확장한다. 본 문서는 구현 마일스톤(m31-12)에서 하나의 참조 문서만으로 전체 External Action 프레임워크를 구현할 수 있도록 한다.

### 설계 원칙

1. **기존 13개 ActionProvider 무변경**: kind 없이 반환해도 registry가 contractCall로 정규화
2. **Zod SSoT**: Zod 스키마가 타입의 단일 진실 원천 (Zod -> TypeScript -> OpenAPI -> Drizzle -> DB)
3. **kind vs type 분리**: `type`은 트랜잭션 유형 (8-type discriminatedUnion), `kind`는 파이프라인 라우팅용
4. **credential 간접 참조**: credentialRef로 CredentialVault UUID를 참조, 원문은 sign() 직전에만 노출
5. **정책 일원화**: 기존 DatabasePolicyEngine.evaluate() 시그니처를 확장하여 off-chain 정책도 동일 평가 체인

### 전체 아키텍처 다이어그램

```
ActionProvider.resolve()
        |
        v
  isApiDirectResult()?  ---- YES --> 기존 ApiDirectResult 경로 (변경 없음)
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
        |   [정책 평가] --> [6-stage pipeline (기존, 무변경)] --> [DB: action_kind='contractCall']
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

### 기존 파이프라인 무변경 원칙

- **6-stage pipeline**: contractCall kind는 기존 경로 그대로 진입 (Stage 1~6 무변경)
- **sign-message pipeline**: 기존 `POST /v1/wallets/:id/sign-message` 경로 무변경
- **sign-http pipeline**: 기존 `POST /v1/wallets/:id/sign-http` 경로 무변경
- **새 경로**: `POST /v1/actions/:provider/:action`에서만 kind별 분기 수행

기존 경로의 코드는 ISignerCapability를 import하지 않으며, 새 경로의 코드는 sign-message.ts를 직접 호출하지 않는다. 두 경로는 완전히 독립적이다.

---

## D1. ResolvedAction 타입 시스템

> 이 섹션은 Phase 380, Plan 01의 설계를 통합한다.

### D1.1 kind 필드 기반 3종 분기

| kind | 설명 | 파이프라인 |
|------|------|-----------|
| `contractCall` | 기존 on-chain 트랜잭션 | 6-stage pipeline (무변경) |
| `signedData` | Off-chain 서명 데이터 (EIP-712, HMAC 등) | sign-data pipeline (신규) |
| `signedHttp` | 서명된 HTTP 요청 (ERC-8128 등) | sign-http pipeline (신규) |

### D1.2 SigningSchemeEnum

```typescript
import { z } from 'zod';

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
```

### D1.3 SignedDataAction 스키마

```typescript
export const SignedDataActionTrackingSchema = z.object({
  trackerName: z.string(),
  metadata: z.record(z.unknown()),
}).strict();

export const SignedDataActionPolicyContextSchema = z.object({
  actionCategory: z.enum(['trade', 'withdraw', 'transfer', 'sign', 'deposit']).optional(),
  notionalUsd: z.number().nonnegative().optional(),
  leverage: z.number().positive().optional(),
  expiry: z.string().datetime().optional(),
  hasWithdrawCapability: z.boolean().optional(),
}).strict();

export const SignedDataActionSchema = z.object({
  kind: z.literal('signedData'),
  signingScheme: SigningSchemeEnum,
  payload: z.record(z.unknown()),
  venue: z.string().min(1),
  operation: z.string().min(1),
  credentialRef: z.string().optional(),
  tracking: SignedDataActionTrackingSchema.optional(),
  policyContext: SignedDataActionPolicyContextSchema.optional(),
  actionProvider: z.string().optional(),
  actionName: z.string().optional(),
}).strict();

export type SignedDataAction = z.infer<typeof SignedDataActionSchema>;
```

**payload 구조 (scheme별):**

| signingScheme | payload 구조 |
|---------------|-------------|
| `eip712` | `{ domain, types, primaryType, value }` |
| `hmac-sha256` | `{ data, timestamp, method, path }` |
| `personal` | `{ message }` |
| `ecdsa-secp256k1` | `{ data }` (hex-encoded bytes) |
| `ed25519` | `{ data }` (hex-encoded bytes) |

### D1.4 SignedHttpAction 스키마

```typescript
export const SignedHttpActionSchema = z.object({
  kind: z.literal('signedHttp'),
  method: z.string().min(1),
  url: z.string().url(),
  headers: z.record(z.string()),
  body: z.string().optional(),
  signingScheme: z.enum(['erc8128', 'hmac-sha256', 'rsa-pss']),
  coveredComponents: z.array(z.string()).optional(),
  preset: z.enum(['minimal', 'standard', 'strict']).optional(),
  ttlSec: z.number().int().positive().optional(),
  nonce: z.union([z.string(), z.literal(false)]).optional(),
  venue: z.string().min(1),
  operation: z.string().min(1),
  credentialRef: z.string().optional(),
  tracking: SignedDataActionTrackingSchema.optional(),
  policyContext: SignedDataActionPolicyContextSchema.optional(),
  actionProvider: z.string().optional(),
  actionName: z.string().optional(),
}).strict();

export type SignedHttpAction = z.infer<typeof SignedHttpActionSchema>;
```

### D1.5 ContractCallRequest 확장

기존 `ContractCallRequestSchema`에 `kind?: 'contractCall'` optional 필드만 추가한다.

```typescript
export const ContractCallRequestSchema = z.object({
  kind: z.literal('contractCall').optional(),
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
  network: z.string().optional(),
  actionProvider: z.string().optional(),
  actionName: z.string().optional(),
  gasCondition: z.unknown().optional(),
});

export const NormalizedContractCallSchema = ContractCallRequestSchema.extend({
  kind: z.literal('contractCall'),
});
export type NormalizedContractCall = z.infer<typeof NormalizedContractCallSchema>;
```

### D1.6 ResolvedAction discriminatedUnion

```typescript
export const ResolvedActionSchema = z.discriminatedUnion('kind', [
  NormalizedContractCallSchema,
  SignedDataActionSchema,
  SignedHttpActionSchema,
]);
export type ResolvedAction = z.infer<typeof ResolvedActionSchema>;

export type RawResolvedAction =
  | ContractCallRequest
  | SignedDataAction
  | SignedHttpAction;
```

### D1.7 정규화 전략

```typescript
export function normalizeResolvedAction(raw: RawResolvedAction): ResolvedAction {
  if ('kind' in raw && raw.kind != null) {
    return ResolvedActionSchema.parse(raw);
  }
  if ('type' in raw && raw.type === 'CONTRACT_CALL') {
    return ResolvedActionSchema.parse({ ...raw, kind: 'contractCall' });
  }
  throw new Error(
    `Cannot normalize ResolvedAction: missing kind field and type is not CONTRACT_CALL`
  );
}

export function normalizeResolvedActions(
  raw: RawResolvedAction | RawResolvedAction[]
): ResolvedAction[] {
  const items = Array.isArray(raw) ? raw : [raw];
  return items.map(normalizeResolvedAction);
}
```

정규화 시점: `ActionProviderRegistry.executeAction()` 내부, resolve() 직후, 정책 평가 전.

### D1.8 IActionProvider.resolve() 반환 타입 확장

```typescript
resolve(
  actionName: string,
  params: Record<string, unknown>,
  context: ActionContext,
): Promise<
  | ContractCallRequest
  | ContractCallRequest[]
  | ApiDirectResult
  | SignedDataAction
  | SignedHttpAction
  | ResolvedAction[]
>;
```

### D1.9 ApiDirectResult 분리 원칙

`ApiDirectResult`는 `ResolvedAction` union에 포함하지 않는다. 의미론적 차이: ApiDirectResult는 "이미 실행 완료된 결과"이고, ResolvedAction은 "서명 대기 중인 액션"이다. `isApiDirectResult()` 체크를 정규화 전에 수행한다.

향후 Hyperliquid/Polymarket을 `SignedDataAction`으로 마이그레이션하면 서명이 파이프라인을 통과하고 정책 평가가 가능해지나, 본 마일스톤 범위 밖.

---

## D2. ISignerCapability + SigningSchemeEnum

> 이 섹션은 Phase 380 Plan 02, Phase 382 Plan 01, Phase 382 Plan 02의 설계를 통합한다.

### D2.1 ISignerCapability 인터페이스

```typescript
export interface ISignerCapability {
  readonly scheme: SigningScheme;
  canSign(params: SigningParams): boolean;
  sign(params: SigningParams): Promise<SigningResult>;
}
```

### D2.2 SigningParams (scheme별 discriminated union)

```typescript
interface BaseSigningParams {
  scheme: SigningScheme;
}

export interface Eip712SigningParams extends BaseSigningParams {
  scheme: 'eip712';
  domain: {
    name?: string; version?: string; chainId?: number;
    verifyingContract?: string; salt?: string;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  value: Record<string, unknown>;
  privateKey: `0x${string}`;
}

export interface PersonalSigningParams extends BaseSigningParams {
  scheme: 'personal';
  message: string;
  privateKey: `0x${string}`;
}

export interface HmacSigningParams extends BaseSigningParams {
  scheme: 'hmac-sha256';
  data: string;
  secret: string;
  encoding?: 'hex' | 'base64';
}

export interface RsaPssSigningParams extends BaseSigningParams {
  scheme: 'rsa-pss';
  data: string;
  privateKey: string;
  saltLength?: number;
}

export interface EcdsaSecp256k1SigningParams extends BaseSigningParams {
  scheme: 'ecdsa-secp256k1';
  data: string;
  privateKey: `0x${string}`;
  hashData?: boolean;
}

export interface Ed25519SigningParams extends BaseSigningParams {
  scheme: 'ed25519';
  data: string;
  privateKey: Uint8Array;
}

export interface Erc8128SigningParams extends BaseSigningParams {
  scheme: 'erc8128';
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  privateKey: `0x${string}`;
  chainId: number;
  address: string;
  coveredComponents?: string[];
  preset?: 'minimal' | 'standard' | 'strict';
  ttlSec?: number;
  nonce?: string | false;
}

export type SigningParams =
  | Eip712SigningParams
  | PersonalSigningParams
  | HmacSigningParams
  | RsaPssSigningParams
  | EcdsaSecp256k1SigningParams
  | Ed25519SigningParams
  | Erc8128SigningParams;
```

### D2.3 SigningResult + SigningError

```typescript
export interface SigningResult {
  signature: string | Uint8Array;
  metadata?: Record<string, unknown>;
}

export class SigningError extends Error {
  constructor(
    message: string,
    public readonly scheme: SigningScheme,
    public readonly code: SigningErrorCode,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'SigningError';
  }
}

export type SigningErrorCode =
  | 'INVALID_KEY'
  | 'INVALID_PARAMS'
  | 'CREDENTIAL_MISSING'
  | 'SIGNING_FAILED'
  | 'KEY_NOT_SUPPORTED'
  | 'CAPABILITY_NOT_FOUND';
```

### D2.4 7종 Capability 구현체

| # | 구현체 | scheme | 래핑 대상 | import 관계 | registry 등록 |
|---|--------|--------|----------|-------------|--------------|
| 1 | Eip712SignerCapability | `eip712` | viem signTypedData | 독립 호출 | O |
| 2 | PersonalSignCapability | `personal` | viem signMessage | 독립 호출 | O |
| 3 | Erc8128SignerCapability | `erc8128` | HttpMessageSigner | 예외적 import (RFC 9421 복잡도) | O |
| 4 | HmacSignerCapability | `hmac-sha256` | node:crypto createHmac | 독립 호출 | O |
| 5 | RsaPssSignerCapability | `rsa-pss` | node:crypto sign (RSA-PSS) | 독립 호출 | O |
| 6 | EcdsaSignBytesCapability | `ecdsa-secp256k1` | viem sign / @noble | 독립 호출 | O |
| 7 | Ed25519SignBytesCapability | `ed25519` | @solana/kit signBytes | 독립 호출 | O |

TransactionSignerCapability는 참조용으로만 존재하며 registry에 등록하지 않는다 (기존 6-stage pipeline 사용).

**어댑터 설계 원칙:**
- Eip712/Personal은 viem 함수 직접 호출 (sign-message.ts import 없음)
- Erc8128만 기존 HttpMessageSigner 모듈 import 허용 (RFC 9421 구현이 ~200줄로 복잡)
- EcdsaSignBytes는 hashData 옵션 (기본 true=keccak256), Ed25519는 내부 SHA-512 수행으로 외부 해시 불필요

### D2.5 SignerCapabilityRegistry

```typescript
export interface ISignerCapabilityRegistry {
  register(capability: ISignerCapability): void;
  get(scheme: SigningScheme): ISignerCapability | undefined;
  resolve(action: SignedDataAction | SignedHttpAction): ISignerCapability;
  listSchemes(): readonly SigningScheme[];
}
```

**내부 구현:** `Map<SigningScheme, ISignerCapability>` — singleton, daemon 부팅 시 7종 자동 등록.

**resolve() 설계 결정:** resolve()에서는 canSign()을 호출하지 않는다. 이유: resolve() 시점에는 credential이 아직 주입되지 않았으므로 secret/privateKey 필드가 없어 canSign()이 false를 반환할 수 있다. canSign() 검사는 credential 주입 후 sign() 직전에 파이프라인이 수행한다.

### D2.6 daemon 부팅 등록

```typescript
function bootstrapSignerCapabilities(registry: ISignerCapabilityRegistry): void {
  registry.register(new Eip712SignerCapability());
  registry.register(new PersonalSignCapability());
  registry.register(new Erc8128SignerCapability());
  registry.register(new HmacSignerCapability());
  registry.register(new RsaPssSignerCapability());
  registry.register(new EcdsaSignBytesCapability());
  registry.register(new Ed25519SignBytesCapability());
}
```

### D2.7 connect-info 확장

```typescript
capabilities: {
  signing: ['eip712', 'personal', 'erc8128', 'hmac-sha256', 'rsa-pss', 'ecdsa-secp256k1', 'ed25519'],
}
```

---

## D3. CredentialVault 인프라

> 이 섹션은 Phase 381 Plan 01, Phase 381 Plan 02의 설계를 통합한다.

### D3.1 ICredentialVault 인터페이스

```typescript
export const CredentialTypeEnum = z.enum([
  'api-key', 'hmac-secret', 'rsa-private-key', 'session-token', 'custom',
]);
export type CredentialType = z.infer<typeof CredentialTypeEnum>;

export interface CreateCredentialParams {
  type: CredentialType;
  name: string;
  value: string;
  metadata?: Record<string, unknown>;
  expiresAt?: number;
}

export interface CredentialMetadata {
  id: string;
  walletId: string | null;
  type: CredentialType;
  name: string;
  metadata: Record<string, unknown>;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface DecryptedCredential extends CredentialMetadata {
  value: string;
}

export interface ICredentialVault {
  create(walletId: string | null, params: CreateCredentialParams): Promise<CredentialMetadata>;
  get(ref: string, walletId?: string): Promise<DecryptedCredential>;
  list(walletId?: string): Promise<CredentialMetadata[]>;
  delete(ref: string): Promise<void>;
  rotate(ref: string, newValue: string): Promise<CredentialMetadata>;
}
```

### D3.2 스코프 모델

| 스코프 | wallet_id | 접근 범위 | 등록 권한 |
|--------|-----------|----------|----------|
| per-wallet | 지갑 ID | 해당 지갑 세션만 | masterAuth |
| 글로벌 | null | 모든 지갑에서 접근 가능 | masterAuth |

조회 우선순위: per-wallet -> 글로벌 fallback -> CREDENTIAL_NOT_FOUND

### D3.3 credentialRef 간접 참조

| 형태 | 예시 | 해소 방법 |
|------|------|----------|
| UUID | `"550e8400-..."` | `wallet_credentials.id`로 직접 조회 |
| 이름 | `"{walletId}:{name}"` | walletId + name으로 조회 |

### D3.4 wallet_credentials DB 스키마 (v55)

```sql
CREATE TABLE wallet_credentials (
  id             TEXT    NOT NULL PRIMARY KEY,
  wallet_id      TEXT,
  type           TEXT    NOT NULL,
  name           TEXT    NOT NULL,
  encrypted_value BLOB   NOT NULL,
  iv             BLOB    NOT NULL,
  auth_tag       BLOB    NOT NULL,
  metadata       TEXT    NOT NULL DEFAULT '{}',
  expires_at     INTEGER,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
  CHECK (type IN ('api-key', 'hmac-secret', 'rsa-private-key', 'session-token', 'custom'))
);

CREATE UNIQUE INDEX idx_wallet_credentials_wallet_name
  ON wallet_credentials(wallet_id, name) WHERE wallet_id IS NOT NULL;
CREATE UNIQUE INDEX idx_wallet_credentials_global_name
  ON wallet_credentials(name) WHERE wallet_id IS NULL;
CREATE INDEX idx_wallet_credentials_wallet_id ON wallet_credentials(wallet_id);
CREATE INDEX idx_wallet_credentials_expires_at
  ON wallet_credentials(expires_at) WHERE expires_at IS NOT NULL;
```

### D3.5 Drizzle 스키마 초안

```typescript
export const walletCredentials = sqliteTable('wallet_credentials', {
  id: text('id').primaryKey(),
  walletId: text('wallet_id').references(() => wallets.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  name: text('name').notNull(),
  encryptedValue: blob('encrypted_value', { mode: 'buffer' }).notNull(),
  iv: blob('iv', { mode: 'buffer' }).notNull(),
  authTag: blob('auth_tag', { mode: 'buffer' }).notNull(),
  metadata: text('metadata').notNull().default('{}'),
  expiresAt: integer('expires_at'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
}, (table) => ({
  walletNameIdx: uniqueIndex('idx_wallet_credentials_wallet_name')
    .on(table.walletId, table.name).where(sql`wallet_id IS NOT NULL`),
  globalNameIdx: uniqueIndex('idx_wallet_credentials_global_name')
    .on(table.name).where(sql`wallet_id IS NULL`),
  walletIdIdx: index('idx_wallet_credentials_wallet_id').on(table.walletId),
  expiresAtIdx: index('idx_wallet_credentials_expires_at')
    .on(table.expiresAt).where(sql`expires_at IS NOT NULL`),
}));
```

### D3.6 암호화 전략

- **알고리즘**: AES-256-GCM (node:crypto, sodium-native 아님)
- **키 파생**: HKDF-SHA256, salt `"credential-vault"`, info `"waiaas-credential-encryption"` (기존 지갑 키 암호화와 도메인 분리)
- **IV**: per-record 12 bytes (GCM 표준)
- **AAD**: `{credentialId}:{walletId|global}:{type}` (cipher text 재배치 공격 방지)
- **auth_tag**: 별도 컬럼 분리 (디버깅 용이성)

### D3.7 re-encrypt / backup 통합

- Master Password 변경 시 wallet_credentials 전 레코드 re-encrypt (트랜잭션 내 원자적 수행)
- backup export에 wallet_credentials 테이블 포함 (encrypted_value는 이미 암호화 상태)
- restore 후 master key가 다르면 re-encrypt 필수

### D3.8 Credential Lifecycle

- **생성**: create() -> UUID v7 할당 -> HKDF subkey 파생 -> AES-256-GCM 암호화 -> DB INSERT
- **로테이션**: rotate() -> 새 IV 생성 -> 새 값 암호화 -> UPDATE (이력 보존 v1 생략)
- **만료**: get() 시점 lazy evaluation (`expiresAt < now` -> CREDENTIAL_EXPIRED)
- **삭제**: hard delete, cascade 없음

### D3.9 인증 모델

| 작업 | per-wallet | 글로벌 |
|------|-----------|--------|
| list | sessionAuth | masterAuth |
| get (내부 전용) | sessionAuth | 파이프라인 내부 |
| create / delete / rotate | masterAuth | masterAuth |

### D3.10 REST API 엔드포인트

```
Per-wallet:
  GET    /v1/wallets/:walletId/credentials        (sessionAuth) -> CredentialMetadata[]
  POST   /v1/wallets/:walletId/credentials        (masterAuth)  -> CredentialMetadata
  DELETE /v1/wallets/:walletId/credentials/:ref   (masterAuth)  -> 204
  PUT    /v1/wallets/:walletId/credentials/:ref/rotate (masterAuth) -> CredentialMetadata

Global:
  GET    /v1/admin/credentials                     (masterAuth) -> CredentialMetadata[]
  POST   /v1/admin/credentials                     (masterAuth) -> CredentialMetadata
  DELETE /v1/admin/credentials/:ref                (masterAuth) -> 204
  PUT    /v1/admin/credentials/:ref/rotate         (masterAuth) -> CredentialMetadata
```

REST API 응답에서 복호화된 credential 값은 **절대 반환하지 않는다**.

### D3.11 Admin UI Credentials 탭

- **지갑별 탭**: `/wallets/:id` -> Credentials 탭 (per-wallet)
- **글로벌 페이지**: `/admin/credentials` (Admin 메뉴)
- **원문 비노출**: API 레벨에서 value 필드 미포함
- **등록 모달**: Type(5종), Name, Value(password input), Metadata(JSON), ExpiresAt
- **삭제**: 이름 타이핑 확인 + masterAuth
- **로테이션**: 새 값 입력 + masterAuth

### D3.12 MCP 도구 (4종)

| 도구 | 인증 | 용도 |
|------|------|------|
| credential-list | sessionAuth | credential 목록 조회 |
| credential-create | masterAuth | credential 생성 |
| credential-delete | masterAuth | credential 삭제 |
| credential-rotate | masterAuth | credential 로테이션 |

### D3.13 SDK 메서드 (4종)

```typescript
listCredentials(walletId: string): Promise<CredentialMetadata[]>;
createCredential(walletId: string | null, params: CreateCredentialParams): Promise<CredentialMetadata>;
deleteCredential(walletId: string, ref: string): Promise<void>;
rotateCredential(walletId: string, ref: string, newValue: string): Promise<CredentialMetadata>;
```

---

## D4. 파이프라인 라우팅

> 이 섹션은 Phase 383 Plan 01, Phase 383 Plan 02의 설계를 통합한다.

### D4.1 3-way 파이프라인 라우팅

```typescript
async executeAction(providerName, actionName, params, context) {
  const raw = await provider.resolve(actionName, params, context);

  if (isApiDirectResult(raw)) return this.handleApiDirectResult(raw, context);

  const actions = normalizeResolvedActions(raw);

  const results = [];
  for (const action of actions) {
    const result = await this.routeByKind(action, context);
    results.push(result);
  }
  return this.assembleResult(results);
}
```

### D4.2 signedData 5-stage 파이프라인

1. **Stage 1 — credentialRef 해소**: CredentialVault.get(ref, walletId) -> DecryptedCredential
2. **Stage 2 — SigningParams 조립**: scheme별 discriminated union 매핑, credential.value 또는 context.privateKey 주입
3. **Stage 3 — canSign() 사전 검증**: credential 주입 후 완전한 params로 검증
4. **Stage 4 — sign() 실행**: SignerCapabilityRegistry.resolve(action) -> capability.sign(params)
5. **Stage 5 — 결과 처리**: DB 기록, credential 메모리 클리어, 응답 조립

**키 출처 분류:**

| signingScheme | 키 출처 | credentialRef 필요 |
|---------------|---------|-------------------|
| eip712, personal, ecdsa-secp256k1, ed25519, erc8128 | ActionContext.privateKey | 불필요 (wallet key) |
| hmac-sha256, rsa-pss | CredentialVault | 필수 |

### D4.3 signedHttp 6-stage 파이프라인

signedData와 유사하나 HTTP 서명 특화:
1. credentialRef 해소
2. 서명 생성 (HTTP 메시지 서명용 SigningParams 조립)
3. 서명 실행
4. 서명된 헤더 조립 (ERC-8128: signedHeaders + signatureInput)
5. DB 기록
6. 결과 반환

**설계 결정**: signedHttp 파이프라인은 서명만 반환하고 HTTP 발송(fetch)은 수행하지 않는다. 관심사 분리: HTTP 요청의 성공/실패/재시도는 ActionProvider 책임.

### D4.4 mixed-kind 배열 처리

`ResolvedAction[]`에서 contractCall + signedData가 혼재할 수 있다 (예: approve on-chain + sign off-chain order). 순차 실행, 선행 step 실패 시 중단.

### D4.5 off-chain action DB 기록 (v56)

#### 신규 컬럼

| 컬럼 | 타입 | DEFAULT | 설명 |
|------|------|---------|------|
| `action_kind` | TEXT NOT NULL | `'contractCall'` | 파이프라인 kind |
| `venue` | TEXT | NULL | 외부 서비스 식별자 |
| `operation` | TEXT | NULL | 액션 이름 |
| `external_id` | TEXT | NULL | 외부 서비스 반환 ID |

#### DB 마이그레이션 v56

```sql
ALTER TABLE transactions ADD COLUMN action_kind TEXT NOT NULL DEFAULT 'contractCall';
ALTER TABLE transactions ADD COLUMN venue TEXT;
ALTER TABLE transactions ADD COLUMN operation TEXT;
ALTER TABLE transactions ADD COLUMN external_id TEXT;

CREATE INDEX idx_transactions_action_kind ON transactions(action_kind);
CREATE INDEX idx_transactions_venue ON transactions(venue);
CREATE INDEX idx_transactions_external_id ON transactions(external_id)
  WHERE external_id IS NOT NULL;

UPDATE schema_version SET version = 56;
```

#### Drizzle 스키마 확장

```typescript
actionKind: text('action_kind').notNull().default('contractCall'),
venue: text('venue'),
operation: text('operation'),
externalId: text('external_id'),
```

**기존 레코드 호환**: `action_kind` DEFAULT가 `'contractCall'`이므로 기존 레코드 자동 호환.

**txHash 상태**: 이미 nullable (`text('tx_hash')`, notNull 미호출). 대부분 코드 null-safe. 1곳(`wallets.ts` `r.txHash ? 'success' : 'failed'`) action_kind 기반으로 수정 필요.

### D4.6 정책 평가 시점 보장

모든 kind에서 동일: resolve() 후 서명 전.

```typescript
if (action.kind === 'signedData' || action.kind === 'signedHttp') {
  const policyResult = await this.evaluatePolicy(action, context);
  if (policyResult.denied) throw new PolicyDeniedError(policyResult.reason);
}
// contractCall은 6-stage pipeline 내부에서 정책 평가 (기존)
```

### D4.7 REST API 응답 확장

```typescript
const ActionExecutionResultSchema = z.discriminatedUnion('kind', [
  ContractCallResultSchema,   // { kind: 'contractCall', transactionId, txHash, status }
  SignedDataResultSchema,     // { kind: 'signedData', actionId, venue, operation, signature, metadata?, tracking? }
  SignedHttpResultSchema,     // { kind: 'signedHttp', actionId, venue, operation, signature, signedHeaders?, signatureInput? }
  ApiDirectResultResponseSchema, // { kind: 'apiDirect', externalId, status, data }
]);
```

하위 호환: contractCall 응답에 `kind: 'contractCall'` 추가, 기존 소비자가 무시해도 무방.

### D4.8 MCP 도구 확장

- 기존 `action-execute` 응답에 kind 정보 추가
- 신규 `action-list-offchain` 도구: off-chain action 이력 조회

### D4.9 SDK 메서드 확장

```typescript
// 기존 executeAction() 반환 타입을 kind-discriminated union으로 확장
type ActionResult = ContractCallResult | SignedDataResult | SignedHttpResult | ApiDirectResultResponse;

// 신규 메서드
listOffchainActions(walletId: string, options?): Promise<{ actions: OffchainActionListItem[]; total: number }>;
getActionResult(actionId: string): Promise<ActionDetailResult>;
```

### D4.10 connect-info 확장

```typescript
capabilities: {
  externalActions: true,
  supportedVenues: ['jupiter_swap', 'zerox_swap', ...],
  signing: ['eip712', 'personal', ...],
}
```

---

## D5. 정책 확장

> 이 섹션은 Phase 384, Plan 01의 설계를 통합한다.

### D5.1 TransactionParam 확장

```typescript
interface TransactionParam {
  // -- 기존 필드 전부 유지 --

  // -- off-chain action 전용 확장 --
  venue?: string;
  actionCategory?: 'trade' | 'withdraw' | 'transfer' | 'sign' | 'deposit';
  notionalUsd?: number;
  leverage?: number;
  expiry?: string;
  hasWithdrawCapability?: boolean;
}
```

```typescript
export const ActionCategoryEnum = z.enum([
  'trade', 'withdraw', 'transfer', 'sign', 'deposit',
]);
```

### D5.2 VENUE_WHITELIST 정책

CONTRACT_WHITELIST 패턴을 그대로 활용하는 default-deny 화이트리스트.

```typescript
export const VenueWhitelistRulesSchema = z.object({
  venues: z.array(z.object({
    id: z.string().min(1).transform(v => v.toLowerCase()),
    name: z.string().optional(),
  })).min(1),
});
```

**평가 규칙:**
- contractCall (venue 없음) -> 항상 통과
- VENUE_WHITELIST 미등록 + venue 있음 -> DENY (default-deny)
- `policy.venue_whitelist_enabled = false` (Admin Settings, 기본값) -> 정책 비활성

### D5.3 ACTION_CATEGORY_LIMIT 정책

```typescript
export const ActionCategoryLimitRulesSchema = z.object({
  category: ActionCategoryEnum,
  daily_limit_usd: z.number().nonnegative().optional(),
  monthly_limit_usd: z.number().nonnegative().optional(),
  per_action_limit_usd: z.number().nonnegative().optional(),
  tier_on_exceed: PolicyTierEnum.default('DELAY'),
}).refine(
  data => data.daily_limit_usd != null
       || data.monthly_limit_usd != null
       || data.per_action_limit_usd != null,
  { message: 'At least one limit must be set' }
);
```

**누적 합산 쿼리:**

```sql
SELECT COALESCE(SUM(
  CAST(json_extract(metadata, '$.notionalUsd') AS REAL)
), 0) AS total_notional_usd
FROM transactions
WHERE wallet_id = :walletId
  AND action_kind IN ('signedData', 'signedHttp')
  AND json_extract(metadata, '$.actionCategory') = :category
  AND created_at >= :windowStart
  AND status != 'FAILED';
```

**SPENDING_LIMIT과 완전 독립**: on-chain(amount) vs off-chain(notionalUsd), 이중 차감 없음.

### D5.4 ActionDefinition riskLevel

```typescript
interface ActionDefinition {
  // 기존 필드 유지
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  defaultTier?: PolicyTier;
  requiresVenueWhitelist?: boolean;
  requiresOwnerApproval?: boolean;
}
```

**riskLevel -> defaultTier 자동 매핑:**

| riskLevel | defaultTier | 근거 |
|-----------|-------------|------|
| `low` | `INSTANT` | 자금 이동 위험 없음 |
| `medium` | `NOTIFY` | 제한된 자금 관여 |
| `high` | `DELAY` | 대규모 자금 관여 |
| `critical` | `APPROVAL` | 자금 인출, 설정 변경 |

### D5.5 평가 체인 순서

```
기존: 4a~4i-c (ALLOWED_TOKENS ... PERP_MAX_POSITION_USD)
신규: 4j. VENUE_WHITELIST
      4k. ACTION_CATEGORY_LIMIT
```

---

## D6. 비동기 추적 확장

> 이 섹션은 Phase 384, Plan 02의 설계를 통합한다.

### D6.1 AsyncTrackingResult.state 9종

```typescript
export const AsyncTrackingStateEnum = z.enum([
  'PENDING', 'COMPLETED', 'FAILED', 'TIMEOUT',
  'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'SETTLED', 'EXPIRED',
]);
```

| state | 설명 | 폴링 계속 |
|-------|------|----------|
| `PENDING` | 초기 상태 | 계속 |
| `PARTIALLY_FILLED` | 부분 체결 | 계속 |
| `COMPLETED` | on-chain 완료 | 종료 |
| `FILLED` | off-chain 완전 체결 | 종료 |
| `SETTLED` | 정산 완료 | 종료 |
| `CANCELED` | 취소 | 종료 |
| `EXPIRED` | 비즈니스 만료 (TIMEOUT과 구분) | 종료 |
| `FAILED` | 실패 | 종료 |
| `TIMEOUT` | 폴링 초과 (시스템 제한) | 종료 |

### D6.2 상태 저장 위치

**결정: bridge_status/bridge_metadata 재사용** (별도 테이블 아님). AsyncPollingService 기존 인프라 100% 재사용.

- tracking 있는 off-chain action: `bridge_status = 'PENDING'`, `bridge_metadata = { trackerName, venue, ... }`
- tracking 없는 off-chain action: `bridge_status = NULL` (폴링 대상 제외)

### D6.3 AsyncPollingService 쿼리 확장

```sql
SELECT * FROM transactions
WHERE bridge_status IN ('PENDING', 'BRIDGE_MONITORING', 'PARTIALLY_FILLED')
   OR status = 'GAS_WAITING';
```

**resolveTrackerName() 확장:** `trackerName` 우선 참조, `tracker` fallback.

### D6.4 tracker 메타데이터 확장

```typescript
interface ExtendedBridgeMetadata {
  tracker?: string;         // 기존 호환
  trackerName?: string;     // 신규 우선
  venue?: string;
  operation?: string;
  externalId?: string;
  notionalUsd?: number;
  actionCategory?: string;
  fillPercentage?: number;  // PARTIALLY_FILLED 시 0~100
  trackerSpecific?: Record<string, unknown>;
}
```

### D6.5 DB 마이그레이션 v57

```sql
CREATE INDEX IF NOT EXISTS idx_transactions_bridge_status
  ON transactions(bridge_status) WHERE bridge_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_action_kind_bridge_status
  ON transactions(action_kind, bridge_status) WHERE bridge_status IS NOT NULL;

UPDATE schema_version SET version = 57;
```

### D6.6 알림 이벤트 6종

| 이벤트 | bridge_status 변경 | 카테고리 | 우선도 |
|--------|-------------------|---------|-------|
| `external_action_partially_filled` | -> PARTIALLY_FILLED | defi | normal |
| `external_action_filled` | -> FILLED | defi | normal |
| `external_action_settled` | -> SETTLED | defi | normal |
| `external_action_canceled` | -> CANCELED | defi | high |
| `external_action_expired` | -> EXPIRED | defi | normal |
| `external_action_failed` | -> FAILED | defi | high |

### D6.7 기존 tracker 영향

기존 5종 tracker(LiFi, Across, Lido, Jito, GasCondition)는 변경 불필요. 기존 4종 state만 사용하며 신규 state는 신규 tracker에서만 사용.

---

## 7. DB 마이그레이션 요약

| 버전 | 테이블 | 변경 내용 | 출처 |
|------|--------|----------|------|
| v55 | wallet_credentials (신규) | per-wallet 암호화 자격증명 저장소 | D3 |
| v56 | transactions (확장) | action_kind, venue, operation, external_id + 인덱스 | D4 |
| v57 | transactions (인덱스) | (action_kind, bridge_status) 복합 인덱스 | D6 |

실행 순서: v55 -> v56 -> v57 (순차적, 기존 데이터 무손실).

---

## 8. 전체 설계 결정 통합 테이블

| # | 결정 | 근거 | Phase |
|---|------|------|-------|
| 1 | kind 필드를 optional로 추가 (기존 ContractCallRequest) | 기존 13개 provider 코드 변경 0줄 보장 | 380 |
| 2 | 정규화를 registry에서만 수행 | 단일 정규화 지점으로 일관성 보장 | 380 |
| 3 | ApiDirectResult는 ResolvedAction union 밖 | 의미론적 분리 (실행 완료 vs 서명 대기) | 380 |
| 4 | SignedHttpAction의 signingScheme을 3종으로 제한 | HTTP 서명에 사용 가능한 scheme만 허용 | 380 |
| 5 | payload를 Record<string, unknown>으로 | scheme별 구조 상이, 런타임 검증으로 위임 | 380 |
| 6 | SigningParams를 scheme별 discriminated union으로 | 타입 안전성, IDE 자동완성, 컴파일 타임 검증 | 380 |
| 7 | credential 주입 시점: sign() 직전 | resolve() 시점 불필요, 노출 최소화 | 380 |
| 8 | TransactionSignerCapability를 registry에 등록하지 않음 | contractCall은 기존 6-stage pipeline 사용 | 380 |
| 9 | auth_tag을 별도 DB 컬럼으로 분리 | Node.js crypto GCM getAuthTag() 별도 반환, 디버깅 용이 | 381 |
| 10 | node:crypto 사용 (sodium-native 아님) | credential 암호화에는 표준 AES-256-GCM으로 충분 | 381 |
| 11 | AAD에 credentialId 포함 | cipher text 재배치 공격 방지 | 381 |
| 12 | credential 이력 보존은 v1에서 생략 | 초기 구현 복잡도 감소, 필요 시 마이그레이션 추가 | 381 |
| 13 | 만료 체크는 get() 시점 lazy evaluation | stale credential 사용 방지 | 381 |
| 14 | Admin UI Credentials 탭 per-wallet + 글로벌 두 진입점 | 컨텍스트 명확성 + 전체 관리 분리 | 381 |
| 15 | Erc8128만 기존 모듈 import 허용 | RFC 9421 구현 복잡도 ~200줄, 중복 불가 | 382 |
| 16 | EcdsaSignBytes hashData 옵션 (기본 true=keccak256) | raw data vs 이미 해시된 데이터 구분 | 382 |
| 17 | Ed25519는 외부 해시 불필요 | 알고리즘 내부 SHA-512 수행 | 382 |
| 18 | HMAC signing target 조합은 ActionProvider 책임 | 거래소마다 prehash 구성 상이 | 382 |
| 19 | resolve()에서 canSign() 미호출 | credential 미주입 시점이므로 false 반환 가능 | 382 |
| 20 | CAPABILITY_NOT_FOUND 에러 코드 추가 | 기존 5종 + 1종 = 6종, 미등록 scheme 명확 구분 | 382 |
| 21 | SignerCapabilityRegistry singleton | daemon 전역 1 인스턴스, DI container 등록 | 382 |
| 22 | signedHttp 파이프라인은 서명만 반환, fetch 미수행 | 관심사 분리, HTTP 재시도는 ActionProvider 책임 | 383 |
| 23 | txHash는 이미 nullable | Drizzle 스키마 확인 완료, wallets.ts 1곳만 수정 필요 | 383 |
| 24 | action_kind DEFAULT 'contractCall' | 기존 레코드 자동 호환, 데이터 변환 불필요 | 383 |
| 25 | off-chain action 상태를 즉시 CONFIRMED로 기록 | 서명 즉시 완료, 비동기 추적은 bridge_status로 | 383 |
| 26 | 별도 off-chain 엔드포인트 없이 기존 엔드포인트 확장 | DX 일관성, ActionProvider 추상화 레벨 유지 | 383 |
| 27 | MCP action-list-offchain 신규 도구 | off-chain 이력 조회 기능 필요 | 383 |
| 28 | connect-info에 externalActions + supportedVenues 추가 | 에이전트 자기 발견 지원 | 383 |
| 29 | VENUE_WHITELIST는 default-deny + Admin Settings 비활성화 가능 | off-chain 도입 초기 유연성 | 384 |
| 30 | ACTION_CATEGORY_LIMIT와 SPENDING_LIMIT 완전 독립 | on-chain(amount) vs off-chain(notionalUsd) | 384 |
| 31 | notionalUsd를 metadata JSON에 저장 | 스키마 변경 최소화, json_extract()로 조회 | 384 |
| 32 | riskLevel 4등급 자동 매핑 | low->INSTANT, medium->NOTIFY, high->DELAY, critical->APPROVAL | 384 |
| 33 | bridge_status/bridge_metadata 재사용 (별도 테이블 아님) | AsyncPollingService 인프라 100% 재사용 | 384 |
| 34 | AsyncTrackingResult.state 9종 확장 | CLOB/CEX order 부분 체결, 취소, 정산, 만료 표현 | 384 |
| 35 | tracking 없는 off-chain action은 bridge_status NULL | 동기 완료 액션은 비동기 추적 불필요 | 384 |
| 36 | DB 마이그레이션 v57 (복합 인덱스) | off-chain action 폴링 최적화 | 384 |

---

## 9. 구현 우선순위 권장

| Wave | 내용 | 의존성 | DB |
|------|------|--------|-----|
| Wave 1 | 타입 시스템 + Signer (D1 + D2) | 없음 | 없음 |
| Wave 2 | CredentialVault (D3) | D1, D2 | v55 |
| Wave 3 | 파이프라인 라우팅 (D4) | D1, D2, D3 | v56 |
| Wave 4 | 정책 + 추적 (D5 + D6) | D4 | v57 |

**Wave 1**: ResolvedAction Zod union, SigningSchemeEnum, ISignerCapability 인터페이스, 7종 capability 구현, SignerCapabilityRegistry. 의존성 없이 독립 구현 가능.

**Wave 2**: wallet_credentials 테이블 (v55), ICredentialVault 구현, 암호화/복호화, credentialRef 해소, REST API 8개, Admin UI Credentials 탭.

**Wave 3**: 3-way 라우팅 분기, signedData/signedHttp 파이프라인, off-chain DB 기록 (v56), ActionExecutionResult 확장, MCP/SDK 인터페이스.

**Wave 4**: VENUE_WHITELIST, ACTION_CATEGORY_LIMIT, riskLevel 자동 매핑, AsyncTrackingResult 확장, 복합 인덱스 (v57), 알림 이벤트 6종.

---

## 10. Pitfall 방지 통합 체크리스트

### 타입 시스템

- [ ] kind 필드와 기존 type 필드 혼동 금지 (type=트랜잭션 유형, kind=파이프라인 라우팅)
- [ ] SignedDataAction.payload는 scheme별 구조 상이 — 런타임 scheme별 검증 추가 권장
- [ ] credentialRef는 optional — 없으면 글로벌 credential fallback
- [ ] 정규화는 registry에서만 — provider 내부에서 정규화하지 않음
- [ ] Array 정규화 시 혼합 kind 가능 — 각 요소 개별 라우팅
- [ ] ApiDirectResult 배열 불가 — 단건 반환만 허용

### 서명

- [ ] canSign() 검사를 credential 주입 후에 수행 (resolve() 시점에는 false 가능)
- [ ] EcdsaSignBytes hashData 기본 true (keccak256 적용), false면 32 bytes 직접 서명
- [ ] Ed25519는 외부 해시 불필요 (내부 SHA-512)
- [ ] HMAC signing target 조합은 ActionProvider 책임 (거래소마다 prehash 상이)
- [ ] privateKey 메모리 클리어: Uint8Array는 fill(0), hex string은 GC 의존

### Credential

- [ ] encrypted_value는 blob으로 저장 (text가 아님)
- [ ] HKDF info를 "waiaas-credential-encryption"으로 설정 (기존 지갑 키 암호화와 충돌 방지)
- [ ] credentialRef 해소 시 walletId 권한 검사 필수
- [ ] rotate() 시 IV 반드시 재생성 (GCM 보안 필수)
- [ ] REST API 응답에서 복호화된 credential 값 절대 비반환
- [ ] 글로벌 credential의 wallet_id IS NULL 조건을 인덱스 WHERE 절에 정확히 반영
- [ ] backup restore 시 master key가 다르면 re-encrypt 필수

### 파이프라인

- [ ] isApiDirectResult() 검사를 normalizeResolvedActions() 전에 수행
- [ ] credential 메모리 클리어를 sign() 완료 후 즉시 수행
- [ ] mixed-kind 배열에서 선행 step 실패 시 후행 step 중단
- [ ] action_kind DEFAULT 'contractCall'로 기존 레코드 호환
- [ ] wallets.ts의 txHash 기반 상태 판단 -> action_kind 기반으로 수정
- [ ] 정책 평가 시점 누락 방지 (signedData/signedHttp 서명 전 반드시 수행)
- [ ] off-chain action type 필드에 새 값 추가하지 않음 (action_kind로 구분)

### 정책

- [ ] contractCall에서 VENUE_WHITELIST/ACTION_CATEGORY_LIMIT 건너뜀 보장 (venue==null)
- [ ] notionalUsd가 없는 off-chain action은 누적에 0 더함
- [ ] VENUE_WHITELIST 빈 venues 배열 금지 (.min(1))
- [ ] ACTION_CATEGORY_LIMIT daily/monthly/per_action 중 최소 1개 필수
- [ ] metadata JSON 파싱 실패 시 graceful 처리 (NULL->0)
- [ ] leverage와 perpLeverage 혼동 방지 (off-chain vs on-chain)
- [ ] riskLevel 없는 기존 ActionDefinition은 INSTANT 반환 (무변경)

### 추적

- [ ] PARTIALLY_FILLED에서 bridge_metadata fillPercentage 업데이트 누락 방지
- [ ] BRIDGE_STATUS_VALUES에 신규 5종 값 추가 동기화
- [ ] 기존 tracker가 신규 state를 반환하지 않도록 타입 레벨 검증
- [ ] tracking 없는 off-chain action의 bridge_status가 NULL인지 확인
- [ ] TIMEOUT vs EXPIRED 혼동 방지 (시스템 제한 vs 비즈니스 만료)
- [ ] v57 마이그레이션에서 CREATE INDEX IF NOT EXISTS 사용

---

## 부록 A: 기존 13개 ActionProvider 하위 호환 매트릭스

| # | Provider | 반환 타입 | kind 변경 필요 | 정규화 결과 |
|---|----------|----------|---------------|-----------|
| 1 | Jupiter Swap | ContractCallRequest | 불필요 | { ...result, kind: 'contractCall' } |
| 2 | 0x EVM DEX | ContractCallRequest | 불필요 | { ...result, kind: 'contractCall' } |
| 3 | LI.FI Bridge | ContractCallRequest + tracking | 불필요 | { ...result, kind: 'contractCall' } |
| 4 | Lido Staking | ContractCallRequest | 불필요 | { ...result, kind: 'contractCall' } |
| 5 | Jito Staking | ContractCallRequest | 불필요 | { ...result, kind: 'contractCall' } |
| 6 | Aave V3 Lending | ContractCallRequest / [] | 불필요 | 각 요소에 kind 추가 |
| 7 | Kamino Lending | ContractCallRequest / [] | 불필요 | 각 요소에 kind 추가 |
| 8 | Pendle Yield | ContractCallRequest | 불필요 | { ...result, kind: 'contractCall' } |
| 9 | Drift Perp | ContractCallRequest / [] | 불필요 | 각 요소에 kind 추가 |
| 10 | DCent Swap | ContractCallRequest | 불필요 | { ...result, kind: 'contractCall' } |
| 11 | Hyperliquid | ApiDirectResult | 불필요 | 정규화 대상 아님 |
| 12 | Across Bridge | ContractCallRequest + tracking | 불필요 | { ...result, kind: 'contractCall' } |
| 13 | Polymarket | ApiDirectResult | 불필요 | 정규화 대상 아님 |

**기존 provider 코드 변경 0줄.** kind 없이 반환해도 registry가 contractCall로 정규화. ApiDirectResult는 정규화 전에 isApiDirectResult()로 분기.

---

## 부록 B: Zod 스키마 전체 목록 (구현 시 참조)

| 스키마 | 위치 | 용도 |
|--------|------|------|
| SigningSchemeEnum | D1 | 서명 방식 7종 enum |
| SignedDataActionSchema | D1 | off-chain 서명 데이터 액션 |
| SignedDataActionTrackingSchema | D1 | 비동기 추적 설정 |
| SignedDataActionPolicyContextSchema | D1 | 정책 평가 컨텍스트 |
| SignedHttpActionSchema | D1 | 서명된 HTTP 요청 액션 |
| ContractCallRequestSchema (확장) | D1 | 기존 + kind optional |
| NormalizedContractCallSchema | D1 | 정규화 후 kind 필수 |
| ResolvedActionSchema | D1 | 3종 kind discriminatedUnion |
| CredentialTypeEnum | D3 | credential 5종 enum |
| TransactionParamSchema (확장) | D5 | 정책 평가 파라미터 |
| ActionCategoryEnum | D5 | 액션 카테고리 5종 |
| VenueWhitelistRulesSchema | D5 | venue 화이트리스트 규칙 |
| ActionCategoryLimitRulesSchema | D5 | 카테고리별 한도 규칙 |
| RiskLevelEnum | D5 | 위험도 4등급 |
| ActionDefinitionSchema (확장) | D5 | riskLevel/defaultTier 포함 |
| AsyncTrackingStateEnum | D6 | 추적 상태 9종 |
| AsyncTrackingResultSchema | D6 | 추적 결과 |
| ExtendedBridgeMetadataSchema | D6 | 확장된 bridge 메타데이터 |
| ActionExecutionResultSchema | D4 | REST API 응답 4종 union |

---

## 부록 C: REST API 엔드포인트 전체 목록

### 기존 (확장)

| 메서드 | 경로 | 변경 |
|--------|------|------|
| POST | /v1/actions/:provider/:action | 응답에 kind 추가, off-chain 결과 지원 |
| GET | /v1/wallets/:walletId/transactions | actionKind/venue 필터 추가 |
| GET | /v1/transactions/:id | off-chain 필드 포함 |
| GET | /v1/admin/transactions | actionKind/venue 필터 추가 |
| GET | /v1/connect-info | externalActions, supportedVenues, signing 추가 |

### 신규 (Credential)

| 메서드 | 경로 | 인증 |
|--------|------|------|
| GET | /v1/wallets/:walletId/credentials | sessionAuth |
| POST | /v1/wallets/:walletId/credentials | masterAuth |
| DELETE | /v1/wallets/:walletId/credentials/:ref | masterAuth |
| PUT | /v1/wallets/:walletId/credentials/:ref/rotate | masterAuth |
| GET | /v1/admin/credentials | masterAuth |
| POST | /v1/admin/credentials | masterAuth |
| DELETE | /v1/admin/credentials/:ref | masterAuth |
| PUT | /v1/admin/credentials/:ref/rotate | masterAuth |

---

*작성일: 2026-03-12*
*출처: Phase 380~384 (10개 설계 문서 통합)*
*문서 번호: doc-81*
