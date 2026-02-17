# 설계 문서 68: Environment 데이터 모델 설계

> **Phase:** 105 (v1.4.5 -- 멀티체인 월렛 설계)
> **산출물:** EnvironmentType SSoT 정의 + 환경-네트워크 매핑 + WalletSchema 변경 + 키스토어 분석
> **참조 기반:** docs/25-sqlite-schema.md, packages/core/src/enums/chain.ts, 105-RESEARCH.md
> **작성일:** 2026-02-14

---

## 1. EnvironmentType Zod SSoT 파생 체인

### 1.1 정의

"1 월렛 = 1 체인 + 1 네트워크" 모델을 "1 월렛 = 1 체인 + 1 환경(testnet/mainnet)" 모델로 전환하기 위한 핵심 enum이다. EnvironmentType은 블록체인 네트워크를 testnet과 mainnet 두 가지 환경으로 분류한다. 제3 환경(예: staging, local)은 의도적으로 배제한다 (설계 결정 ENV-01).

### 1.2 Zod SSoT 파생 체인 (5단계)

기존 `CHAIN_TYPES`, `NETWORK_TYPES`와 동일한 패턴을 따른다.

**Step 1: TypeScript as-const 배열 (SSoT 원천)**

```typescript
// 파일: packages/core/src/enums/chain.ts
export const ENVIRONMENT_TYPES = ['testnet', 'mainnet'] as const;
```

**Step 2: Zod enum 스키마**

```typescript
// 파일: packages/core/src/enums/chain.ts
export const EnvironmentTypeEnum = z.enum(ENVIRONMENT_TYPES);
```

**Step 3: TypeScript 타입 파생**

```typescript
// 파일: packages/core/src/enums/chain.ts
export type EnvironmentType = (typeof ENVIRONMENT_TYPES)[number];
// 결과: type EnvironmentType = 'testnet' | 'mainnet'
```

**Step 4: DB CHECK 제약 (SQL)**

```sql
-- 파일: packages/daemon/src/infrastructure/database/migrate.ts (v6b 마이그레이션)
CHECK (environment IN ('testnet', 'mainnet'))
```

**Step 5: Drizzle ORM 스키마**

```typescript
// 파일: packages/daemon/src/infrastructure/database/schema.ts
import { ENVIRONMENT_TYPES } from '@waiaas/core';

// wallets 테이블에 적용
check('check_environment', buildCheckSql('environment', ENVIRONMENT_TYPES)),
```

### 1.3 파일 위치 및 exports 체인

```
packages/core/src/enums/chain.ts          (SSoT 정의)
  └─ ENVIRONMENT_TYPES, EnvironmentType, EnvironmentTypeEnum

packages/core/src/enums/index.ts          (barrel export 추가)
  └─ export { ENVIRONMENT_TYPES, type EnvironmentType, EnvironmentTypeEnum } from './chain.js';

packages/core/src/index.ts                (패키지 public API)
  └─ 기존 enums re-export에 포함
```

기존 `CHAIN_TYPES`, `NETWORK_TYPES`, `SOLANA_NETWORK_TYPES`, `EVM_NETWORK_TYPES`와 동일 파일(`chain.ts`)에 위치한다. 별도 파일 분리는 불필요하다 (설계 결정 ENV-02).

### 1.4 OpenAPI 파생

```typescript
// wallet.schema.ts 등에서 EnvironmentTypeEnum 참조
// OpenAPI spec 자동 생성 시 enum: ['testnet', 'mainnet']으로 노출
```

---

## 2. 환경-네트워크 매핑 테이블 (정적 매핑)

### 2.1 매핑 테이블

환경-네트워크 매핑은 순수 함수로 구현한다. DB 조회가 아닌 코드 내 상수로 하드코딩한다 (설계 결정 ENV-03).

| chain | environment | 허용 네트워크 | 기본 네트워크 |
|-------|-------------|-------------|-------------|
| solana | mainnet | `mainnet` | `mainnet` |
| solana | testnet | `devnet`, `testnet` | `devnet` |
| ethereum | mainnet | `ethereum-mainnet`, `polygon-mainnet`, `arbitrum-mainnet`, `optimism-mainnet`, `base-mainnet` | `ethereum-mainnet` |
| ethereum | testnet | `ethereum-sepolia`, `polygon-amoy`, `arbitrum-sepolia`, `optimism-sepolia`, `base-sepolia` | `ethereum-sepolia` |

### 2.2 13개 NETWORK_TYPES 전수 커버리지 검증

모든 `NETWORK_TYPES` 값이 매핑 테이블에 빠짐없이 포함되어 있는지 검증한다.

| # | NetworkType | chain | environment | 매핑 존재 |
|---|-------------|-------|-------------|---------|
| 1 | `mainnet` | solana | mainnet | YES |
| 2 | `devnet` | solana | testnet | YES |
| 3 | `testnet` | solana | testnet | YES |
| 4 | `ethereum-mainnet` | ethereum | mainnet | YES |
| 5 | `ethereum-sepolia` | ethereum | testnet | YES |
| 6 | `polygon-mainnet` | ethereum | mainnet | YES |
| 7 | `polygon-amoy` | ethereum | testnet | YES |
| 8 | `arbitrum-mainnet` | ethereum | mainnet | YES |
| 9 | `arbitrum-sepolia` | ethereum | testnet | YES |
| 10 | `optimism-mainnet` | ethereum | mainnet | YES |
| 11 | `optimism-sepolia` | ethereum | testnet | YES |
| 12 | `base-mainnet` | ethereum | mainnet | YES |
| 13 | `base-sepolia` | ethereum | testnet | YES |

**결과: 13/13 전수 커버. 누락 없음.**

### 2.3 상수 구현 의사코드

```typescript
// 파일: packages/core/src/enums/chain.ts

/**
 * Environment-network mapping: which networks are allowed in each environment.
 * Key format: `${chain}:${environment}`
 */
export const ENVIRONMENT_NETWORK_MAP: Record<
  `${ChainType}:${EnvironmentType}`,
  readonly NetworkType[]
> = {
  'solana:mainnet': ['mainnet'],
  'solana:testnet': ['devnet', 'testnet'],
  'ethereum:mainnet': [
    'ethereum-mainnet',
    'polygon-mainnet',
    'arbitrum-mainnet',
    'optimism-mainnet',
    'base-mainnet',
  ],
  'ethereum:testnet': [
    'ethereum-sepolia',
    'polygon-amoy',
    'arbitrum-sepolia',
    'optimism-sepolia',
    'base-sepolia',
  ],
} as const;

/**
 * Default network for each chain+environment combination.
 */
export const ENVIRONMENT_DEFAULT_NETWORK: Record<
  `${ChainType}:${EnvironmentType}`,
  NetworkType
> = {
  'solana:mainnet': 'mainnet',
  'solana:testnet': 'devnet',
  'ethereum:mainnet': 'ethereum-mainnet',
  'ethereum:testnet': 'ethereum-sepolia',
} as const;
```

---

## 3. 매핑 함수 4개 설계 (의사코드)

파일 위치: `packages/core/src/enums/chain.ts` (기존 `validateChainNetwork`과 동일 파일)

### 3.1 getNetworksForEnvironment

**시그니처:**
```typescript
export function getNetworksForEnvironment(
  chain: ChainType,
  env: EnvironmentType,
): readonly NetworkType[]
```

**의사코드:**
```typescript
export function getNetworksForEnvironment(
  chain: ChainType,
  env: EnvironmentType,
): readonly NetworkType[] {
  const key = `${chain}:${env}` as const;
  const networks = ENVIRONMENT_NETWORK_MAP[key];
  // TypeScript가 key의 유효성을 정적 검증하므로 런타임 오류 불가
  return networks;
}
```

**입출력 예시:**
| 입력 | 출력 |
|------|------|
| `('solana', 'mainnet')` | `['mainnet']` |
| `('solana', 'testnet')` | `['devnet', 'testnet']` |
| `('ethereum', 'mainnet')` | `['ethereum-mainnet', 'polygon-mainnet', 'arbitrum-mainnet', 'optimism-mainnet', 'base-mainnet']` |
| `('ethereum', 'testnet')` | `['ethereum-sepolia', 'polygon-amoy', 'arbitrum-sepolia', 'optimism-sepolia', 'base-sepolia']` |

**에러 케이스:** TypeScript 정적 타입으로 보호. 잘못된 chain/env 조합은 컴파일 시점에 차단.

### 3.2 getDefaultNetwork

**시그니처:**
```typescript
export function getDefaultNetwork(
  chain: ChainType,
  env: EnvironmentType,
): NetworkType
```

**의사코드:**
```typescript
export function getDefaultNetwork(
  chain: ChainType,
  env: EnvironmentType,
): NetworkType {
  const key = `${chain}:${env}` as const;
  return ENVIRONMENT_DEFAULT_NETWORK[key];
}
```

**입출력 예시:**
| 입력 | 출력 |
|------|------|
| `('solana', 'mainnet')` | `'mainnet'` |
| `('solana', 'testnet')` | `'devnet'` |
| `('ethereum', 'mainnet')` | `'ethereum-mainnet'` |
| `('ethereum', 'testnet')` | `'ethereum-sepolia'` |

**에러 케이스:** TypeScript 정적 타입으로 보호.

### 3.3 deriveEnvironment

**시그니처:**
```typescript
export function deriveEnvironment(network: NetworkType): EnvironmentType
```

**역할:** 네트워크 값에서 환경을 역파생한다. DB 마이그레이션(Plan 105-02)의 CASE WHEN 분기와 동일한 로직을 TypeScript로 구현.

**의사코드:**
```typescript
// Mainnet networks (exhaustive list)
const MAINNET_NETWORKS: readonly NetworkType[] = [
  'mainnet',           // Solana mainnet
  'ethereum-mainnet',
  'polygon-mainnet',
  'arbitrum-mainnet',
  'optimism-mainnet',
  'base-mainnet',
];

export function deriveEnvironment(network: NetworkType): EnvironmentType {
  if ((MAINNET_NETWORKS as readonly string[]).includes(network)) {
    return 'mainnet';
  }
  // 나머지는 모두 testnet: devnet, testnet, *-sepolia, *-amoy
  return 'testnet';
}
```

**입출력 예시:**
| 입력 | 출력 | 근거 |
|------|------|------|
| `'mainnet'` | `'mainnet'` | Solana mainnet |
| `'ethereum-mainnet'` | `'mainnet'` | EVM mainnet |
| `'polygon-mainnet'` | `'mainnet'` | EVM mainnet |
| `'arbitrum-mainnet'` | `'mainnet'` | EVM mainnet |
| `'optimism-mainnet'` | `'mainnet'` | EVM mainnet |
| `'base-mainnet'` | `'mainnet'` | EVM mainnet |
| `'devnet'` | `'testnet'` | Solana testnet |
| `'testnet'` | `'testnet'` | Solana testnet |
| `'ethereum-sepolia'` | `'testnet'` | EVM testnet |
| `'polygon-amoy'` | `'testnet'` | EVM testnet |
| `'arbitrum-sepolia'` | `'testnet'` | EVM testnet |
| `'optimism-sepolia'` | `'testnet'` | EVM testnet |
| `'base-sepolia'` | `'testnet'` | EVM testnet |

**에러 케이스:** `NetworkType`은 Zod enum으로 검증되므로, 유효하지 않은 network 값이 입력될 수 없다. 13개 전수 매핑으로 모든 경우가 커버된다.

**DB 마이그레이션 SQL 대응 (Plan 105-02에서 참조):**
```sql
CASE
  WHEN network IN ('mainnet', 'ethereum-mainnet', 'polygon-mainnet',
                   'arbitrum-mainnet', 'optimism-mainnet', 'base-mainnet')
  THEN 'mainnet'
  ELSE 'testnet'
END AS environment
```

### 3.4 validateNetworkEnvironment

**시그니처:**
```typescript
export function validateNetworkEnvironment(
  chain: ChainType,
  env: EnvironmentType,
  network: NetworkType,
): void  // throws Error on mismatch
```

**역할:** 주어진 chain + environment 조합에서 network가 허용되는지 검증한다. 기존 `validateChainNetwork(chain, network)` 패턴과 동일한 검증 스타일.

**의사코드:**
```typescript
export function validateNetworkEnvironment(
  chain: ChainType,
  env: EnvironmentType,
  network: NetworkType,
): void {
  const allowed = getNetworksForEnvironment(chain, env);
  if (!(allowed as readonly string[]).includes(network)) {
    throw new Error(
      `Invalid network '${network}' for chain '${chain}' in environment '${env}'. ` +
      `Valid: ${allowed.join(', ')}`,
    );
  }
}
```

**입출력 예시:**
| 입력 | 결과 |
|------|------|
| `('solana', 'mainnet', 'mainnet')` | pass (void) |
| `('solana', 'testnet', 'devnet')` | pass (void) |
| `('solana', 'testnet', 'testnet')` | pass (void) |
| `('ethereum', 'mainnet', 'ethereum-mainnet')` | pass (void) |
| `('ethereum', 'testnet', 'polygon-amoy')` | pass (void) |
| `('solana', 'mainnet', 'devnet')` | **throw Error** -- devnet은 solana mainnet에서 불허 |
| `('ethereum', 'testnet', 'ethereum-mainnet')` | **throw Error** -- mainnet 네트워크는 testnet 환경에서 불허 |
| `('solana', 'mainnet', 'ethereum-mainnet')` | **throw Error** -- EVM 네트워크는 solana에서 불허 |

**에러 메시지 형식:**
```
Invalid network 'devnet' for chain 'solana' in environment 'mainnet'. Valid: mainnet
Invalid network 'ethereum-mainnet' for chain 'ethereum' in environment 'testnet'. Valid: ethereum-sepolia, polygon-amoy, arbitrum-sepolia, optimism-sepolia, base-sepolia
```

**caller 변환:** 이 함수가 throw하는 `Error`는 daemon route에서 `WAIaaSError('VALIDATION_ERROR')`로 변환된다 (기존 `validateChainNetwork` 패턴과 동일).

---

## 4. WalletSchema 변경 설계

### 4.1 WalletSchema (현재 vs 변경)

**현재 (v1.4.4):**
```typescript
// packages/core/src/schemas/wallet.schema.ts
export const WalletSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  chain: ChainTypeEnum,
  network: NetworkTypeEnum,          // <-- 제거 대상
  publicKey: z.string(),
  status: WalletStatusEnum,
  ownerAddress: z.string().nullable(),
  ownerVerified: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
```

**변경 (v1.4.6 구현 예정):**
```typescript
export const WalletSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  chain: ChainTypeEnum,
  environment: EnvironmentTypeEnum,          // NEW: 'testnet' | 'mainnet'
  defaultNetwork: NetworkTypeEnum.nullable(), // NEW: 기본 네트워크 (nullable)
  publicKey: z.string(),
  status: WalletStatusEnum,
  ownerAddress: z.string().nullable(),
  ownerVerified: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
```

**변경 사항:**
1. `network: NetworkTypeEnum` 제거
2. `environment: EnvironmentTypeEnum` 추가 -- 필수, `'testnet' | 'mainnet'`
3. `defaultNetwork: NetworkTypeEnum.nullable()` 추가 -- nullable

### 4.2 default_network NULL 의미 정책 (설계 결정 ENV-07)

`default_network` 컬럼은 **nullable**로 정의한다.

| 값 | 의미 | 런타임 동작 |
|----|------|-----------|
| `NULL` | "환경 기본값 사용" | `getDefaultNetwork(chain, environment)`로 해결 |
| NOT NULL (예: `'polygon-amoy'`) | "사용자 지정 네트워크" | DB에 저장된 값을 그대로 사용 |

**마이그레이션 직후 상태:** 기존 `wallets.network` 값을 `default_network`에 그대로 복사하므로, 마이그레이션 직후에는 모든 행이 NOT NULL이다 (기존 데이터 100% 보존).

**향후 API 동작:**
- `PATCH /v1/wallets/:id { defaultNetwork: null }` -- 환경 기본값으로 리셋 허용
- `PATCH /v1/wallets/:id { defaultNetwork: 'polygon-amoy' }` -- 사용자 지정 네트워크 설정

**Zod 검증:**
```typescript
defaultNetwork: NetworkTypeEnum.nullable()
// NULL 또는 유효한 NetworkType만 허용
```

**DB CHECK 제약:**
```sql
CHECK (default_network IS NULL OR default_network IN ('mainnet', 'devnet', 'testnet',
  'ethereum-mainnet', 'ethereum-sepolia', 'polygon-mainnet', 'polygon-amoy',
  'arbitrum-mainnet', 'arbitrum-sepolia', 'optimism-mainnet', 'optimism-sepolia',
  'base-mainnet', 'base-sepolia'))
```

nullable이므로 `IS NULL` 분기가 필수이다.

**Plan 105-02 영향:**
- DDL: `default_network TEXT CHECK (default_network IS NULL OR default_network IN (...))` -- NOT NULL 제약 없음
- INSERT: `network AS default_network` -- 기존 값 그대로 보존, 마이그레이션 직후 NULL 행 없음

### 4.3 CreateWalletRequestSchema 변경

**현재 (v1.4.4):**
```typescript
export const CreateWalletRequestSchema = z.object({
  name: z.string().min(1).max(100),
  chain: ChainTypeEnum.default('solana'),
  network: NetworkTypeEnum.optional(),
});
```

**변경 (v1.4.6 구현 예정):**
```typescript
export const CreateWalletRequestSchema = z.object({
  name: z.string().min(1).max(100),
  chain: ChainTypeEnum.default('solana'),
  environment: EnvironmentTypeEnum.default('testnet'),  // NEW: 필수, 기본값 testnet
  network: NetworkTypeEnum.optional(),                   // KEEP: 초기 default_network 설정용
});
```

**변경 사항:**
1. `environment` 필드 추가 -- 기본값 `'testnet'` (기존 동작 호환)
2. `network` 필드 유지 -- optional, 지정 시 초기 `default_network`로 설정
3. `network` 미지정 시: `getDefaultNetwork(chain, environment)`로 자동 결정

**API 요청 예시:**
```json
// 최소 요청 (기존 동작과 호환)
{ "name": "my-wallet" }
// → chain='solana', environment='testnet', default_network='devnet' (자동)

// 명시적 환경 지정
{ "name": "prod-wallet", "chain": "ethereum", "environment": "mainnet" }
// → chain='ethereum', environment='mainnet', default_network='ethereum-mainnet' (자동)

// 명시적 네트워크 지정
{ "name": "polygon-wallet", "chain": "ethereum", "environment": "mainnet", "network": "polygon-mainnet" }
// → chain='ethereum', environment='mainnet', default_network='polygon-mainnet' (사용자 지정)
```

### 4.4 TransactionSchema 변경

**현재 (v1.4.4):**
```typescript
export const TransactionSchema = z.object({
  // ... 기존 필드들
  chain: ChainTypeEnum,
  // network 필드 없음
});
```

**변경 (v1.4.6 구현 예정):**
```typescript
export const TransactionSchema = z.object({
  // ... 기존 필드들
  chain: ChainTypeEnum,
  network: NetworkTypeEnum.nullable(),  // NEW: 실행된 네트워크 기록
});
```

**변경 사항:**
1. `network: NetworkTypeEnum.nullable()` 추가 -- 트랜잭션이 실행된 구체적 네트워크를 기록
2. nullable인 이유: DB 마이그레이션 시 기존 레코드의 network는 wallets 테이블에서 역참조로 채우지만, 만약을 위해 NULL 허용
3. 기존 레코드 호환: v6a 마이그레이션에서 `UPDATE transactions SET network = (SELECT w.network FROM wallets w WHERE w.id = transactions.wallet_id)` 로 채움

### 4.5 OpenAPI 스키마 변경 범위 요약

Phase 108에서 상세 설계 예정. 여기서는 범위만 나열한다.

| 엔드포인트 | 변경 내용 |
|-----------|---------|
| `POST /v1/wallets` | 요청: `environment` 추가, `network` 의미 변경 |
| `GET /v1/wallets` | 응답: `network` -> `environment` + `defaultNetwork` |
| `GET /v1/wallets/:id` | 응답: 동일 |
| `GET /v1/wallets/:id/balance` | 쿼리: `network` 파라미터 추가 (optional) |
| `POST /v1/wallets/:id/transactions` | 요청: `network` 파라미터 추가 (optional) |
| `GET /v1/wallets/:id/transactions` | 응답: `network` 필드 추가 |
| `PATCH /v1/wallets/:id` | 요청: `defaultNetwork` 필드 추가 |

---

## 5. 키스토어 영향 분석

### 5.1 분석 결과: 변경 불필요

키스토어 파일의 경로, 구조, 마이그레이션 모두 환경 모델 전환에 의한 변경이 불필요하다.

### 5.2 근거 코드 참조 3개

**1. keystorePath() -- 경로 결정:**
```typescript
// Source: packages/daemon/src/infrastructure/keystore/keystore.ts (line 336-338)
private keystorePath(walletId: string): string {
  return join(this.keystoreDir, `${walletId}.json`);
}
```
경로는 `walletId`만으로 결정된다. `network`나 `environment`는 경로에 관여하지 않는다.

**2. generateKeyPair() -- 키 생성:**
```typescript
// Source: packages/daemon/src/infrastructure/keystore/keystore.ts (line 88-105)
async generateKeyPair(
  walletId: string,
  chain: ChainType,
  network: string,      // 메타데이터로만 사용
  masterPassword: string,
): Promise<{ publicKey: string; encryptedPrivateKey: Uint8Array }>
```
`network` 파라미터는 `KeystoreFileV1.network` 메타데이터에 기록될 뿐, 키 생성 알고리즘(Ed25519/secp256k1)에 영향을 주지 않는다. 키 생성 알고리즘은 `chain` 파라미터에만 의존한다.

**3. decryptPrivateKey() -- 키 복호화:**
```typescript
// Source: packages/daemon/src/infrastructure/keystore/keystore.ts (line 231-259)
async decryptPrivateKey(walletId: string, masterPassword: string): Promise<Uint8Array>
```
복호화에 `network`나 `environment` 파라미터를 사용하지 않는다. `walletId`와 `masterPassword`만으로 키 파일을 찾아 복호화한다.

### 5.3 기존 키 파일 호환성

```json
// 기존 키 파일 예시 (변경 없이 유지)
{
  "version": 1,
  "chain": "ethereum",
  "network": "ethereum-sepolia",  // 메타데이터 -- 동작에 영향 없음
  "curve": "secp256k1",
  "publicKey": "0x...",
  "crypto": { ... }
}
```

기존 키 파일의 `"network": "ethereum-sepolia"` 메타데이터는 그대로 유지한다. 이 필드는 `decryptPrivateKey()`에서 읽히지 않으므로 값이 구버전 형태여도 동작에 전혀 영향이 없다.

### 5.4 향후 신규 키 파일 (선택 사항)

v1.4.6 구현 시 `KeystoreFileV1`에 `environment` 필드를 추가하는 것은 선택 사항이다. 추가하더라도 메타데이터에 불과하므로, KeystoreFileV2 포맷 도입 없이 기존 v1 포맷에 필드만 추가하면 된다. 이 결정은 v1.4.6 구현 시점에 확정한다.

### 5.5 결론

**키스토어 파일 경로/구조/마이그레이션 모두 변경 불필요.** Phase 106~108에서 키스토어 관련 설계가 불필요하다.

---

## 6. 설계 결정 요약표

| ID | 결정 내용 | 근거 | 영향 범위 |
|----|---------|------|---------|
| ENV-01 | EnvironmentType은 `'testnet' \| 'mainnet'` 2값만 허용. 제3 환경 배제 | 블록체인은 testnet/mainnet 이분법. 제3 환경은 불필요한 복잡도 (objectives에서 anti-feature로 명시) | 전체 시스템 |
| ENV-02 | EnvironmentType은 `chain.ts`에 추가 (별도 파일 분리 없음) | 기존 CHAIN_TYPES/NETWORK_TYPES와 동일 파일에 위치하여 관련 타입을 집중 관리. 환경 관련 매핑 함수도 동일 파일에 배치 | `packages/core/src/enums/chain.ts` |
| ENV-03 | 환경-네트워크 매핑은 순수 함수 (DB 조회 아님) | 네트워크 목록은 코드에 고정. DB에 저장하면 복잡도 증가 + Zod SSoT 원칙 위반 | `chain.ts` 매핑 상수 |
| ENV-04 | Solana testnet 기본 네트워크는 `devnet` (testnet 아님) | Solana devnet이 개발 표준. Solana testnet은 불안정하고 사용 빈도 낮음 | `getDefaultNetwork('solana', 'testnet')` |
| ENV-05 | `wallets.network` 제거, `environment` + `default_network`으로 대체 | 1:1 모델에서 1:N 모델로 전환. 트랜잭션 시점에 네트워크를 선택하는 유연성 확보 | DB 스키마, 모든 API, 파이프라인 |
| ENV-06 | `transactions.network` 컬럼 추가 (nullable) | 트랜잭션이 실행된 구체적 네트워크를 기록하여 감사/추적 지원. 기존 레코드 호환을 위해 nullable | DB 스키마, 트랜잭션 API |
| ENV-07 | `default_network`는 nullable. NULL = 환경 기본값, NOT NULL = 사용자 지정 | 향후 `PATCH /v1/wallets/:id { defaultNetwork: null }`로 환경 기본값 리셋 허용. 마이그레이션 직후에는 기존 값 보존으로 NOT NULL | WalletSchema, DB DDL, API |
| ENV-08 | 키스토어 파일 경로/구조/마이그레이션 모두 변경 불필요 | 경로는 walletId만 사용, network는 메타데이터, 복호화에 미사용. 코드 참조 3개로 확인 | `keystore.ts` -- 변경 없음 |

---

## 부록 A: 기존 validateChainNetwork과의 관계

v1.4.6 구현 시 `validateChainNetwork(chain, network)` 함수는 유지한다. 새 `validateNetworkEnvironment(chain, env, network)` 함수가 추가되어 환경 내 네트워크 검증을 담당한다.

- `validateChainNetwork`: chain-network 호환성 검증 (solana에 EVM 네트워크 불가)
- `validateNetworkEnvironment`: 환경 내 네트워크 허용 검증 (testnet에 mainnet 네트워크 불가)

두 함수는 보완적 관계이며, 트랜잭션 파이프라인에서 순차적으로 호출된다.

## 부록 B: Drizzle 스키마 변경 (schema.ts)

v1.4.6 구현 시 `packages/daemon/src/infrastructure/database/schema.ts`에 적용할 변경.

**현재:**
```typescript
export const wallets = sqliteTable(
  'wallets',
  {
    // ...
    network: text('network').notNull(),
    // ...
  },
  (table) => [
    index('idx_wallets_chain_network').on(table.chain, table.network),
    check('check_network', buildCheckSql('network', NETWORK_TYPES)),
  ],
);
```

**변경:**
```typescript
import { ENVIRONMENT_TYPES } from '@waiaas/core';

export const wallets = sqliteTable(
  'wallets',
  {
    // ...
    environment: text('environment').notNull(),     // NEW
    defaultNetwork: text('default_network'),         // NEW (nullable)
    // network 제거
    // ...
  },
  (table) => [
    index('idx_wallets_chain_environment').on(table.chain, table.environment),  // 인덱스 변경
    check('check_environment', buildCheckSql('environment', ENVIRONMENT_TYPES)), // CHECK 변경
    check(
      'check_default_network',
      sql.raw(
        `default_network IS NULL OR default_network IN (${NETWORK_TYPES.map((v) => `'${v}'`).join(', ')})`,
      ),
    ), // NEW: nullable CHECK
  ],
);
```

## 부록 C: wallet.network 참조 지점 (영향 범위)

v1.4.6 구현 시 변경이 필요한 `wallet.network` 참조 파일 목록.

| 파일 | 라인 | 용도 | 변경 방향 |
|------|------|------|---------|
| `daemon/src/api/routes/wallets.ts` | 236, 350 | 월렛 조회 응답 | `environment` + `defaultNetwork` 응답 |
| `daemon/src/api/routes/wallet.ts` | 125, 145, 149, 159, 186, 190, 201, 241 | 잔액/자산 조회 | 네트워크 해결 로직 추가 |
| `daemon/src/api/routes/transactions.ts` | 259, 263, 278 | 어댑터 해결 + 파이프라인 컨텍스트 | 트랜잭션별 network 해결 |
| `daemon/src/lifecycle/daemon.ts` | 628, 632, 647 | 데몬 내부 어댑터 해결 | 환경 기반 네트워크 해결 |
| `daemon/src/pipeline/pipeline.ts` | 73 | PipelineContext 생성 | 트랜잭션별 network 주입 |
