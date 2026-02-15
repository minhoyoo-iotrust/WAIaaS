# Phase 130: Core 타입 + CAIP-2 매핑 + DB 마이그레이션 - Research

**Researched:** 2026-02-15
**Domain:** x402 타입 시스템, CAIP-2 네트워크 매핑, SQLite CHECK 제약 마이그레이션
**Confidence:** HIGH

## Summary

Phase 130은 v1.5.1 x402 클라이언트 기능의 기반 타입 시스템과 데이터베이스를 준비하는 단계이다. 7개 요구사항(X4CORE-01~07)을 2개 플랜으로 구현한다.

핵심 작업은 네 가지이다: (1) @waiaas/core에 @x402/core v2.3.1 의존성을 추가하고 Zod 스키마를 import, (2) TransactionType에 'X402_PAYMENT'(현재 6개에서 7번째), PolicyType에 'X402_ALLOWED_DOMAINS'(현재 11개에서 12번째)를 추가, (3) CAIP-2 식별자와 WAIaaS NetworkType 간의 양방향 매핑 테이블 정의, (4) DB 마이그레이션 v12로 transactions/policies CHECK 제약 확장 + 8개 x402 전용 에러 코드 정의 + i18n 템플릿 추가.

기존 코드베이스 조사 결과, 모든 변경은 기존 패턴을 정확히 따른다. enum 추가는 `as const` 배열에 값 추가 -> Zod enum 자동 파생, DB 마이그레이션은 12-step 테이블 재생성 패턴(v9 선례), 에러 코드 추가는 ERROR_CODES 객체에 엔트리 추가 + i18n en/ko 파일 동기화. 신규 파일은 `packages/core/src/interfaces/x402.types.ts` 1개뿐이다.

**Primary recommendation:** 기존 패턴을 정확히 모방하되, 현재 테스트 카운트 불일치(enums.test.ts에서 TransactionType 5개로 테스트하지만 실제 6개, ERROR_CODES 69개로 테스트하지만 실제 76개)를 이번 phase에서 함께 수정한다.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@x402/core` | ^2.3.1 | x402 v2 프로토콜 타입 + Zod 스키마 (PaymentRequired, PaymentPayload, PaymentRequirements) | Coinbase 공식 패키지. Apache-2.0. 유일한 런타임 의존성 zod ^3.24.2 (WAIaaS zod ^3.24.0과 호환). 자체 스키마 정의 대비 스펙 추종 비용 제거 |
| `zod` | ^3.24.0 (기존) | Zod SSoT 스키마 정의 | 프로젝트 핵심 의존성. @x402/core와 버전 호환 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `better-sqlite3` | 기존 | DB 마이그레이션 실행 | migrate.ts에서 12-step 테이블 재생성 |
| `vitest` | 기존 | 테스트 | enum 카운트 검증, 마이그레이션 체인 테스트 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @x402/core Zod 스키마 import | 자체 Zod 스키마 정의 | x402 스펙 변경 시 수동 업데이트 필요. @x402/core가 이미 Zod 제공하므로 불필요한 중복 |
| `caip` npm 패키지 | 상수 매핑 테이블 | CAIP-2 파싱은 `string.indexOf(':')` 수준으로 단순. 13개 네트워크 유한 집합. 불필요한 의존성 |
| ALTER CHECK (불가) | 12-step 테이블 재생성 | SQLite는 ALTER CHECK 미지원. 12-step이 유일한 방법 |

**Installation:**

```bash
cd packages/core && pnpm add @x402/core@^2.3.1
```

## Architecture Patterns

### Recommended File Structure

```
packages/core/src/
  enums/
    transaction.ts           # TRANSACTION_TYPES에 'X402_PAYMENT' 추가 (7번째)
    policy.ts                # POLICY_TYPES에 'X402_ALLOWED_DOMAINS' 추가 (12번째)
  interfaces/
    x402.types.ts            # [신규] X402FetchRequest/Response 스키마 + CAIP-2 매핑
    index.ts                 # x402.types.ts re-export 추가
  errors/
    error-codes.ts           # X402 도메인 에러 코드 8개 추가
  i18n/
    en.ts                    # x402 에러 메시지 8개 추가 (영어)
    ko.ts                    # x402 에러 메시지 8개 추가 (한국어)
  index.ts                   # x402 타입 re-export 추가
  __tests__/
    enums.test.ts            # TransactionType 7개, PolicyType 12개 카운트 업데이트
    errors.test.ts           # 에러 코드 카운트 업데이트 + X402 도메인 테스트
    i18n.test.ts             # en/ko 키 일치 검증 (기존 테스트가 자동 커버)
    x402-types.test.ts       # [신규] CAIP-2 매핑 + X402FetchRequest 스키마 테스트

packages/daemon/src/
  infrastructure/database/
    migrate.ts               # v12 마이그레이션 추가 (12-step transactions + policies 재생성)
  __tests__/
    migration-chain.test.ts  # v12 마이그레이션 체인 테스트 추가
```

### Pattern 1: Enum SSoT 확장 (as const + Zod 자동 파생)

**What:** `as const` 배열에 값 추가 -> `z.enum()` 자동 파생 -> TypeScript 타입 자동 파생 -> DB CHECK 제약에서 SSoT 배열 참조

**When to use:** 새 TransactionType/PolicyType 추가 시

**Example (현재 코드베이스의 정확한 패턴):**

```typescript
// packages/core/src/enums/transaction.ts -- 현재 상태
export const TRANSACTION_TYPES = [
  'TRANSFER',
  'TOKEN_TRANSFER',
  'CONTRACT_CALL',
  'APPROVE',
  'BATCH',
  'SIGN',           // v1.4.7에서 추가 (6번째)
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export const TransactionTypeEnum = z.enum(TRANSACTION_TYPES);

// 변경: 'X402_PAYMENT' 추가 (7번째)
export const TRANSACTION_TYPES = [
  'TRANSFER',
  'TOKEN_TRANSFER',
  'CONTRACT_CALL',
  'APPROVE',
  'BATCH',
  'SIGN',
  'X402_PAYMENT',   // v1.5.1 x402 결제 기록용
] as const;
// TransactionType, TransactionTypeEnum은 자동으로 새 값을 포함
```

```typescript
// packages/core/src/enums/policy.ts -- 현재 상태 (11개)
export const POLICY_TYPES = [
  'SPENDING_LIMIT',
  'WHITELIST',
  'TIME_RESTRICTION',
  'RATE_LIMIT',
  'ALLOWED_TOKENS',
  'CONTRACT_WHITELIST',
  'METHOD_WHITELIST',
  'APPROVED_SPENDERS',
  'APPROVE_AMOUNT_LIMIT',
  'APPROVE_TIER_OVERRIDE',
  'ALLOWED_NETWORKS',      // 11번째
] as const;

// 변경: 'X402_ALLOWED_DOMAINS' 추가 (12번째)
// 배열 끝에 추가하면 됨
```

### Pattern 2: 에러 코드 추가 (ERROR_CODES + i18n 동기화)

**What:** ERROR_CODES 객체에 새 도메인 에러 추가 -> en.ts/ko.ts에 메시지 추가 -> ErrorDomain 타입에 도메인 추가

**When to use:** 새 에러 코드 정의 시

**Example (현재 코드베이스의 정확한 패턴):**

```typescript
// packages/core/src/errors/error-codes.ts
export type ErrorDomain =
  | 'AUTH' | 'SESSION' | 'TX' | 'POLICY' | 'OWNER'
  | 'SYSTEM' | 'WALLET' | 'WITHDRAW' | 'ACTION' | 'ADMIN'
  | 'X402';  // 신규 도메인 추가 (11번째)

export const ERROR_CODES = {
  // ... 기존 76개 ...

  // --- X402 domain (8) ---
  X402_DISABLED: {
    code: 'X402_DISABLED',
    domain: 'X402',
    httpStatus: 403,
    retryable: false,
    message: 'x402 payments are disabled',
  },
  // ... 나머지 7개 ...
} as const satisfies Record<string, ErrorCodeEntry>;
```

```typescript
// packages/core/src/i18n/en.ts -- errors 객체에 추가
X402_DISABLED: 'x402 payments are disabled',
X402_DOMAIN_NOT_ALLOWED: 'Domain not allowed for x402 payments',
// ... 나머지 6개 ...

// packages/core/src/i18n/ko.ts -- errors 객체에 추가
X402_DISABLED: 'x402 결제가 비활성화되어 있습니다',
X402_DOMAIN_NOT_ALLOWED: 'x402 결제에 허용되지 않은 도메인입니다',
// ... 나머지 6개 ...
```

### Pattern 3: DB 마이그레이션 12-step 테이블 재생성 (v9 선례)

**What:** SQLite CHECK 제약 변경이 필요할 때 테이블을 재생성하는 패턴. `managesOwnTransaction: true`로 PRAGMA foreign_keys=OFF 관리.

**When to use:** transactions/policies CHECK 제약에 새 enum 값 추가 시

**Example (v9 마이그레이션과 동일 패턴):**

```typescript
// packages/daemon/src/infrastructure/database/migrate.ts
MIGRATIONS.push({
  version: 12,
  description: 'Add X402_PAYMENT to transactions and X402_ALLOWED_DOMAINS to policies CHECK constraints',
  managesOwnTransaction: true,
  up: (sqlite) => {
    sqlite.exec('BEGIN');
    try {
      // transactions 테이블 재생성 (CHECK 제약 확장)
      sqlite.exec(`CREATE TABLE transactions_new (...)`);
      sqlite.exec('INSERT INTO transactions_new ... SELECT ... FROM transactions');
      sqlite.exec('DROP TABLE transactions');
      sqlite.exec('ALTER TABLE transactions_new RENAME TO transactions');
      // 인덱스 재생성 (8개)
      // policies 테이블 재생성 (CHECK 제약 확장)
      sqlite.exec(`CREATE TABLE policies_new (...)`);
      sqlite.exec('INSERT INTO policies_new ... SELECT ... FROM policies');
      sqlite.exec('DROP TABLE policies');
      sqlite.exec('ALTER TABLE policies_new RENAME TO policies');
      // 인덱스 재생성 (3개)
      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
    sqlite.pragma('foreign_keys = ON');
    const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
    if (fkErrors.length > 0) {
      throw new Error(`FK integrity violation after v12: ${JSON.stringify(fkErrors)}`);
    }
  },
});
```

### Pattern 4: CAIP-2 매핑 상수 테이블

**What:** x402 CAIP-2 네트워크 식별자(`eip155:1`, `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`)와 WAIaaS NetworkType 간의 양방향 매핑

**When to use:** x402 PaymentRequirements의 network 필드를 WAIaaS 내부 타입으로 변환할 때

**Example:**

```typescript
// packages/core/src/interfaces/x402.types.ts
import type { ChainType, NetworkType } from '../enums/chain.js';

export const CAIP2_TO_NETWORK: Record<string, { chain: ChainType; network: NetworkType }> = {
  // EVM
  'eip155:1':        { chain: 'ethereum', network: 'ethereum-mainnet' },
  'eip155:11155111': { chain: 'ethereum', network: 'ethereum-sepolia' },
  'eip155:137':      { chain: 'ethereum', network: 'polygon-mainnet' },
  'eip155:80002':    { chain: 'ethereum', network: 'polygon-amoy' },
  'eip155:42161':    { chain: 'ethereum', network: 'arbitrum-mainnet' },
  'eip155:421614':   { chain: 'ethereum', network: 'arbitrum-sepolia' },
  'eip155:10':       { chain: 'ethereum', network: 'optimism-mainnet' },
  'eip155:11155420': { chain: 'ethereum', network: 'optimism-sepolia' },
  'eip155:8453':     { chain: 'ethereum', network: 'base-mainnet' },
  'eip155:84532':    { chain: 'ethereum', network: 'base-sepolia' },
  // Solana
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': { chain: 'solana', network: 'mainnet' },
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1':  { chain: 'solana', network: 'devnet' },
  'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z':  { chain: 'solana', network: 'testnet' },
};
```

### Anti-Patterns to Avoid

- **TransactionRequestSchema discriminatedUnion에 X402_PAYMENT 추가하지 않는다:** X402_PAYMENT은 DB 기록용이며 API 요청 스키마에는 포함하지 않는다. x402 결제는 별도 핸들러 파이프라인으로 처리된다. 요구사항에 "기존 discriminatedUnion과 별도, DB 기록용"으로 명시됨.
- **`caip` npm 패키지를 사용하지 않는다:** 13개 네트워크 유한 집합의 상수 매핑으로 충분. 불필요한 의존성.
- **LATEST_SCHEMA_VERSION을 12로 업데이트하지 않는 실수를 방지:** v12 마이그레이션 추가 시 `LATEST_SCHEMA_VERSION`도 11 -> 12로 변경해야 fresh DB에서 마이그레이션이 스킵된다.
- **DDL CREATE TABLE에 CHECK 제약을 업데이트하지 않는 실수를 방지:** migrate.ts의 getCreateTableStatements() 내 transactions/policies DDL은 SSoT 배열을 참조하므로 enum 추가 시 자동 반영되지만, v12 마이그레이션 코드에서도 동일 SSoT 배열을 사용해야 한다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| x402 v2 타입 검증 | 자체 Zod 스키마 | @x402/core/schemas의 PaymentRequiredV2Schema, PaymentPayloadV2Schema | 스펙 변경 시 @x402/core만 업데이트하면 됨. 이미 Zod로 정의되어 WAIaaS SSoT 패턴과 동일 |
| CAIP-2 파싱 라이브러리 | `caip` npm 패키지 | `string.indexOf(':')` + 상수 테이블 | 13개 네트워크 유한 집합. namespace:reference 분리만 필요 |
| CHECK 제약 ALTER | ALTER TABLE MODIFY CONSTRAINT | 12-step 테이블 재생성 | SQLite 한계. 기존 v2/v3/v7/v8/v9 마이그레이션에서 동일 패턴 반복 사용 |

**Key insight:** 이 phase의 모든 구현은 기존 코드베이스의 정확한 패턴 반복이다. 새로운 아키텍처 결정이 필요한 부분이 없다.

## Common Pitfalls

### Pitfall 1: 테스트 카운트 불일치 (기존 버그)

**What goes wrong:** 현재 enums.test.ts는 `TransactionType has 5 values`로 테스트하지만 실제 TRANSACTION_TYPES에는 6개(SIGN 포함). errors.test.ts는 69개로 테스트하지만 실제 ERROR_CODES에는 76개. package-exports.test.ts도 69개.

**Why it happens:** v1.4.7(SIGN 추가)과 후속 마일스톤에서 enum/에러 값을 추가하면서 테스트 assertion 카운트를 업데이트하지 않았을 가능성.

**How to avoid:** 이번 phase에서 X402_PAYMENT/X402_ALLOWED_DOMAINS/에러 8개 추가 시 테스트 카운트를 정확히 맞춘다. 현재 상태를 기준으로:
- TransactionType: 현재 6 -> 7 (X402_PAYMENT 추가)
- PolicyType: 현재 11 -> 12 (X402_ALLOWED_DOMAINS 추가)
- ERROR_CODES: 현재 76 -> 84 (X402 8개 추가)
- ErrorDomain: 현재 10 -> 11 (X402 추가)

**Warning signs:** `pnpm test` 실행 시 enums.test.ts나 errors.test.ts가 이미 실패하고 있을 수 있음. 현재 상태에서 먼저 테스트를 실행하여 baseline을 확인해야 한다.

### Pitfall 2: LATEST_SCHEMA_VERSION 미업데이트

**What goes wrong:** v12 마이그레이션을 추가했지만 LATEST_SCHEMA_VERSION을 11에서 12로 업데이트하지 않으면, fresh DB에서 pushSchema() 후 마이그레이션이 불필요하게 실행된다.

**Why it happens:** migrate.ts에서 LATEST_SCHEMA_VERSION은 별도 상수이므로 MIGRATIONS.push() 시 자동으로 업데이트되지 않는다.

**How to avoid:** v12 마이그레이션 추가 시 반드시 `export const LATEST_SCHEMA_VERSION = 12;`로 변경.

### Pitfall 3: 마이그레이션에서 SSoT 배열 대신 하드코딩

**What goes wrong:** v12 마이그레이션 코드에서 CHECK 제약을 문자열 하드코딩하면 enum 추가 시 마이그레이션 코드도 수정해야 한다.

**Why it happens:** 12-step 마이그레이션 코드 작성 시 편의를 위해 문자열을 직접 작성하는 유혹.

**How to avoid:** 기존 마이그레이션(v2, v3, v7, v8, v9)과 동일하게 `inList(TRANSACTION_TYPES)`, `inList(POLICY_TYPES)` 유틸리티 함수를 사용하여 SSoT 배열에서 CHECK 제약 생성.

### Pitfall 4: transactions 12-step에서 FK self-reference

**What goes wrong:** transactions 테이블은 `parent_id TEXT REFERENCES transactions(id)` 자기 참조 FK가 있다. 12-step 재생성 시 `transactions_new`를 참조해야 한다.

**Why it happens:** 자기 참조 FK를 잊고 기존 `transactions` 테이블을 참조하면 DROP TABLE 시 에러.

**How to avoid:** v9 마이그레이션에서 `parent_id TEXT REFERENCES transactions_new(id) ON DELETE CASCADE`로 작성한 선례를 정확히 따른다.

### Pitfall 5: @x402/core import path

**What goes wrong:** @x402/core의 export는 subpath로 분리되어 있다. `@x402/core`(기본), `@x402/core/types`, `@x402/core/schemas` 등.

**Why it happens:** package.json exports 맵이 subpath별로 다른 entry를 가리킨다.

**How to avoid:** 연구에서 확인된 올바른 import:
- Zod 스키마: `import { PaymentRequiredV2Schema, PaymentPayloadV2Schema } from '@x402/core/schemas';`
- TypeScript 타입: `import type { PaymentRequired, PaymentPayload, PaymentRequirements } from '@x402/core/types';`
- subpath가 동작하지 않으면 `import { ... } from '@x402/core';` 기본 export를 사용

### Pitfall 6: X402FetchResponse 스키마에 payment 필드 누락

**What goes wrong:** X402FetchResponse에 결제 정보(결제 금액, 네트워크, 토큰)를 포함하지 않으면 후속 Phase에서 감사 로그/알림에 필요한 정보가 없다.

**Why it happens:** 외부 API 응답만 패스스루하려는 유혹.

**How to avoid:** X402FetchResponse에 `payment?: { amount, asset, network, payTo, txId }` 필드를 포함하여 402 결제가 발생한 경우 결제 정보를 반환.

## Code Examples

### @x402/core Zod 스키마 import 패턴

```typescript
// packages/core/src/interfaces/x402.types.ts
// Source: @x402/core v2.3.1 패키지 구조 + v1.5.1 연구 확인

import { z } from 'zod';
import type { ChainType, NetworkType } from '../enums/chain.js';

// @x402/core에서 Zod 스키마 import (v2 전용)
// Note: subpath exports 확인 필요. 기본 export 사용 가능
import { PaymentRequiredV2Schema, PaymentPayloadV2Schema } from '@x402/core/schemas';
import type {
  PaymentRequired,
  PaymentPayload,
  PaymentRequirements,
} from '@x402/core/types';

// ─── CAIP-2 매핑 ────────────────────────────────────────────

export const CAIP2_TO_NETWORK: Record<string, { chain: ChainType; network: NetworkType }> = {
  'eip155:1':        { chain: 'ethereum', network: 'ethereum-mainnet' },
  'eip155:11155111': { chain: 'ethereum', network: 'ethereum-sepolia' },
  'eip155:137':      { chain: 'ethereum', network: 'polygon-mainnet' },
  'eip155:80002':    { chain: 'ethereum', network: 'polygon-amoy' },
  'eip155:42161':    { chain: 'ethereum', network: 'arbitrum-mainnet' },
  'eip155:421614':   { chain: 'ethereum', network: 'arbitrum-sepolia' },
  'eip155:10':       { chain: 'ethereum', network: 'optimism-mainnet' },
  'eip155:11155420': { chain: 'ethereum', network: 'optimism-sepolia' },
  'eip155:8453':     { chain: 'ethereum', network: 'base-mainnet' },
  'eip155:84532':    { chain: 'ethereum', network: 'base-sepolia' },
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': { chain: 'solana', network: 'mainnet' },
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1':  { chain: 'solana', network: 'devnet' },
  'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z':  { chain: 'solana', network: 'testnet' },
};

// 역방향 매핑 (WAIaaS NetworkType -> CAIP-2)
export const NETWORK_TO_CAIP2 = Object.fromEntries(
  Object.entries(CAIP2_TO_NETWORK).map(([caip2, { network }]) => [network, caip2]),
) as Record<NetworkType, string>;

// CAIP-2 파싱
export function parseCaip2(caip2Network: string): { namespace: string; reference: string } {
  const colonIndex = caip2Network.indexOf(':');
  if (colonIndex === -1) throw new Error(`Invalid CAIP-2 identifier: ${caip2Network}`);
  return {
    namespace: caip2Network.slice(0, colonIndex),
    reference: caip2Network.slice(colonIndex + 1),
  };
}

// x402 네트워크 -> WAIaaS 매핑
export function resolveX402Network(caip2: string): { chain: ChainType; network: NetworkType } {
  const resolved = CAIP2_TO_NETWORK[caip2];
  if (!resolved) throw new Error(`Unsupported x402 network: ${caip2}`);
  return resolved;
}

// ─── WAIaaS 전용 요청/응답 스키마 ────────────────────────────

export const X402FetchRequestSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
});
export type X402FetchRequest = z.infer<typeof X402FetchRequestSchema>;

export const X402PaymentInfoSchema = z.object({
  amount: z.string(),
  asset: z.string(),
  network: z.string(),
  payTo: z.string(),
  txId: z.string(),
});
export type X402PaymentInfo = z.infer<typeof X402PaymentInfoSchema>;

export const X402FetchResponseSchema = z.object({
  status: z.number().int(),
  headers: z.record(z.string()),
  body: z.string(),
  payment: X402PaymentInfoSchema.optional(),
});
export type X402FetchResponse = z.infer<typeof X402FetchResponseSchema>;

// @x402/core 타입 re-export
export { PaymentRequiredV2Schema, PaymentPayloadV2Schema };
export type { PaymentRequired, PaymentPayload, PaymentRequirements };
```

### x402 에러 코드 8개

```typescript
// packages/core/src/errors/error-codes.ts -- X402 도메인 추가

// --- X402 domain (8) ---
X402_DISABLED: {
  code: 'X402_DISABLED',
  domain: 'X402',
  httpStatus: 403,
  retryable: false,
  message: 'x402 payments are disabled',
},
X402_DOMAIN_NOT_ALLOWED: {
  code: 'X402_DOMAIN_NOT_ALLOWED',
  domain: 'X402',
  httpStatus: 403,
  retryable: false,
  message: 'Domain not allowed for x402 payments',
},
X402_SSRF_BLOCKED: {
  code: 'X402_SSRF_BLOCKED',
  domain: 'X402',
  httpStatus: 403,
  retryable: false,
  message: 'Request blocked: target resolves to private/reserved IP',
},
X402_UNSUPPORTED_SCHEME: {
  code: 'X402_UNSUPPORTED_SCHEME',
  domain: 'X402',
  httpStatus: 400,
  retryable: false,
  message: 'Unsupported x402 payment scheme or network',
},
X402_PAYMENT_REJECTED: {
  code: 'X402_PAYMENT_REJECTED',
  domain: 'X402',
  httpStatus: 402,
  retryable: false,
  message: 'x402 payment was rejected by the resource server',
},
X402_DELAY_TIMEOUT: {
  code: 'X402_DELAY_TIMEOUT',
  domain: 'X402',
  httpStatus: 408,
  retryable: true,
  message: 'x402 payment exceeds request timeout (DELAY tier)',
},
X402_APPROVAL_REQUIRED: {
  code: 'X402_APPROVAL_REQUIRED',
  domain: 'X402',
  httpStatus: 403,
  retryable: false,
  message: 'x402 payment requires owner approval (amount too high)',
},
X402_SERVER_ERROR: {
  code: 'X402_SERVER_ERROR',
  domain: 'X402',
  httpStatus: 502,
  retryable: true,
  message: 'Resource server error after x402 payment',
},
```

### DB 마이그레이션 v12 핵심 구조

```typescript
// v12는 v9와 동일 패턴: transactions + policies 12-step 재생성
// 차이점: v12는 transactions AND policies 모두 재생성 (v9는 transactions만)

MIGRATIONS.push({
  version: 12,
  description: 'Add X402_PAYMENT to transactions and X402_ALLOWED_DOMAINS to policies CHECK constraints',
  managesOwnTransaction: true,
  up: (sqlite) => {
    sqlite.exec('BEGIN');
    try {
      // ── Part 1: transactions 테이블 재생성 ──
      // (v9과 동일 DDL, TRANSACTION_TYPES SSoT에 X402_PAYMENT이 이미 포함됨)
      sqlite.exec(`CREATE TABLE transactions_new (...CHECK (type IN (${inList(TRANSACTION_TYPES)}))...)`);
      sqlite.exec('INSERT INTO transactions_new ... SELECT ... FROM transactions');
      sqlite.exec('DROP TABLE transactions');
      sqlite.exec('ALTER TABLE transactions_new RENAME TO transactions');
      // 인덱스 재생성 (8개)

      // ── Part 2: policies 테이블 재생성 ──
      // (v8과 동일 DDL, POLICY_TYPES SSoT에 X402_ALLOWED_DOMAINS이 이미 포함됨)
      sqlite.exec(`CREATE TABLE policies_new (...CHECK (type IN (${inList(POLICY_TYPES)}))...)`);
      sqlite.exec('INSERT INTO policies_new ... SELECT ... FROM policies');
      sqlite.exec('DROP TABLE policies');
      sqlite.exec('ALTER TABLE policies_new RENAME TO policies');
      // 인덱스 재생성 (3개)

      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }

    sqlite.pragma('foreign_keys = ON');
    const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
    if (fkErrors.length > 0) {
      throw new Error(`FK integrity violation after v12: ${JSON.stringify(fkErrors)}`);
    }
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 하드코딩 CHECK 제약 | SSoT 배열 참조 `inList(TRANSACTION_TYPES)` | v1.4 (migrate.ts) | enum 추가 시 마이그레이션이 자동으로 최신 값 포함 |
| 개별 ALTER TABLE | 12-step 테이블 재생성 | v1.4 (SQLite 한계) | CHECK 제약 변경의 유일한 방법 |
| 타입별 i18n 파일 | 단일 Messages 인터페이스 (en.ts/ko.ts) | v1.3 | ErrorCode 키 변경 시 TypeScript 컴파일 에러로 감지 |

**Deprecated/outdated:**
- x402 v1 (legacy): WAIaaS는 x402 v2만 지원. v1의 네트워크 식별자 형식은 다름.

## Open Questions

1. **@x402/core subpath exports 동작 확인**
   - What we know: @x402/core v2.3.1의 package.json exports에 `./schemas`, `./types` subpath가 정의됨
   - What's unclear: WAIaaS의 TypeScript/Node.js 설정에서 subpath imports가 정상 동작하는지
   - Recommendation: 구현 시 `@x402/core/schemas` import를 먼저 시도하고, 실패하면 `@x402/core` 기본 export에서 스키마를 가져오는 fallback 전략. 실제 pnpm install 후 즉시 import 테스트 필요.

2. **기존 테스트 카운트 불일치 처리 방침**
   - What we know: enums.test.ts가 TransactionType 5개, errors.test.ts가 ERROR_CODES 69개로 assertion하지만 실제 값은 6개/76개
   - What's unclear: 이 테스트가 현재 CI에서 실패하는지 아니면 실행되지 않는지
   - Recommendation: Phase 130에서 enum/에러 추가와 함께 테스트 카운트를 현재 실제 값 기준으로 수정 (TransactionType 7개, PolicyType 12개, ERROR_CODES 84개, ErrorDomain 11개). 구현 전 `pnpm test` baseline 확인 필수.

3. **X402_PAYMENT_REJECTED HTTP 상태 코드**
   - What we know: 요구사항에서 에러 코드명은 지정했지만 HTTP 상태 코드는 미지정
   - What's unclear: 402를 반환하는 것이 적절한지 (클라이언트가 다시 402를 받으면 혼동 가능)
   - Recommendation: 402를 사용. WAIaaS 에러 응답 JSON body에 `code: 'X402_PAYMENT_REJECTED'`가 포함되므로 x402 프로토콜의 402와 구분 가능.

## Sources

### Primary (HIGH confidence)

- **@x402/core npm registry** - v2.3.1 확인, 의존성 zod ^3.24.2, Apache-2.0
  - https://registry.npmjs.org/@x402/core/latest
- **코드베이스 직접 검증** (아래 파일 모두 직접 읽음):
  - `packages/core/src/enums/transaction.ts` - TRANSACTION_TYPES 6개 (SIGN 포함)
  - `packages/core/src/enums/policy.ts` - POLICY_TYPES 11개
  - `packages/core/src/enums/chain.ts` - NETWORK_TYPES 13개, ChainType 2개
  - `packages/core/src/errors/error-codes.ts` - ERROR_CODES 76개, ErrorDomain 10개
  - `packages/core/src/i18n/en.ts` / `ko.ts` - Messages 인터페이스 + 에러/알림 템플릿
  - `packages/core/src/schemas/transaction.schema.ts` - discriminatedUnion 5-type
  - `packages/core/src/schemas/policy.schema.ts` - PolicyType별 rules 스키마
  - `packages/core/src/index.ts` - 패키지 re-export 구조
  - `packages/daemon/src/infrastructure/database/migrate.ts` - v2~v11 마이그레이션 전체
  - `packages/daemon/src/infrastructure/database/schema.ts` - Drizzle ORM 스키마 11 테이블
  - `packages/core/src/__tests__/enums.test.ts` - enum 카운트 검증 패턴
  - `packages/core/src/__tests__/errors.test.ts` - 에러 코드 카운트/도메인 검증 패턴
  - `packages/daemon/src/__tests__/migration-chain.test.ts` - 마이그레이션 체인 테스트 패턴
  - `packages/core/package.json` - @waiaas/core 의존성 (현재 zod만)

### Secondary (MEDIUM confidence)

- **v1.5.1 연구 파일** (이전 phase에서 작성):
  - `.planning/research/v1.5.1-x402-client-STACK.md` - 기술 스택 6개 영역 분석
  - `.planning/research/v1.5.1-x402-client-ARCHITECTURE.md` - 아키텍처 패턴
  - `.planning/research/v1.5.1-x402-client-SUMMARY.md` - 연구 요약
- **x402 스펙 참조**:
  - https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md
  - https://docs.cdp.coinbase.com/x402/network-support (CAIP-2 네트워크 목록)
  - https://standards.chainagnostic.org/CAIPs/caip-2 (CAIP-2 표준)
- **마일스톤 정의**:
  - `objectives/v1.5.1-x402-client.md` - 컴포넌트 정의, 기술 결정 9개

### Tertiary (LOW confidence)

- 없음. 모든 발견은 코드베이스 직접 검증 또는 공식 소스에서 확인됨.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - @x402/core v2.3.1 npm 확인, 기존 코드베이스 직접 검증
- Architecture: HIGH - 모든 패턴이 기존 코드베이스의 정확한 반복 (enum 추가, 에러 코드, 12-step 마이그레이션)
- Pitfalls: HIGH - 기존 테스트 카운트 불일치 발견, 12-step 자기참조 FK 선례 확인, LATEST_SCHEMA_VERSION 패턴 확인

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (안정적 패턴 기반, @x402/core minor 업데이트만 영향)
