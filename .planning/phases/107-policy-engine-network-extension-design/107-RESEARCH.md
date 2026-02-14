# Phase 107: 정책 엔진 네트워크 확장 설계 - Research

**Researched:** 2026-02-14
**Domain:** 정책 엔진 네트워크 스코프 확장 + ALLOWED_NETWORKS 신규 PolicyType + policies 테이블 마이그레이션
**Confidence:** HIGH

## Summary

Phase 107은 기존 정책 엔진(DatabasePolicyEngine)에 네트워크 인식 기능을 추가하는 설계를 수행한다. 현재 정책 엔진은 10개 PolicyType을 월렛(wallet-specific) 또는 글로벌(walletId=NULL) 스코프로 평가하지만, 네트워크 차원의 분리가 없다. 즉, 동일 월렛이 polygon-amoy와 ethereum-sepolia를 사용할 때 동일한 SPENDING_LIMIT가 적용되며, 특정 네트워크만 허용/차단하는 정책도 존재하지 않는다.

코드베이스 분석 결과 세 가지 핵심 발견이 있다. 첫째, 현재 `DatabasePolicyEngine.resolveOverrides()`는 `type` 기준으로만 중복을 제거하므로(같은 type의 wallet-specific이 global을 override), 네트워크 스코프를 추가하려면 override 키에 network을 포함하는 `type+network` 복합 키 전략이 필요하다. 둘째, `policies` 테이블에 `network` 컬럼을 추가하는 마이그레이션은 Phase 105의 v6b(version 7)에서 policies 테이블을 이미 재생성하므로, v8(version 8) 마이그레이션으로 `ALTER TABLE policies ADD COLUMN network TEXT`를 수행하는 것이 자연스럽다. 셋째, ALLOWED_NETWORKS는 기존 10개 PolicyType과 평가 패턴이 다르다 -- ALLOWED_TOKENS/CONTRACT_WHITELIST처럼 "미설정 시 default deny"가 아니라 "미설정 시 환경 내 전체 허용"이어야 하므로, 별도의 평가 로직 분기가 필요하다.

**Primary recommendation:** ALLOWED_NETWORKS를 11번째 PolicyType으로 추가하되, 미설정 시 동작을 "환경 내 전체 허용(permissive)"으로 설계한다. 기존 정책에 `network` 선택적 필드를 추가하여 네트워크 스코프 정책을 지원하고, 4단계 override 우선순위(네트워크 특정 > 월렛 전체 > 글로벌 네트워크 > 글로벌 전체)를 `resolveOverrides()` 확장으로 구현한다.

## Standard Stack

### Core (변경 없음 -- 기존 스택 활용)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.25.76 | AllowedNetworksRulesSchema 정의 + CreatePolicyRequestSchema network 필드 추가 | Zod SSoT 원칙: 스키마 -> 타입 -> DB CHECK |
| drizzle-orm | 0.45.1 | policies 테이블 network 컬럼 Drizzle 스키마 추가 | 기존 policies 테이블 스키마 확장 |
| better-sqlite3 | 12.6.2 | v8 마이그레이션 (ALTER TABLE policies ADD COLUMN network) | 기존 마이그레이션 패턴 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @waiaas/core | (internal) | POLICY_TYPES 배열에 ALLOWED_NETWORKS 추가, NetworkTypeEnum 참조 | PolicyType enum SSoT 확장 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| policies.network 컬럼 (단일 텍스트) | policies.networks JSON 배열 | 단일 네트워크 정책이 가장 흔한 유스케이스. JSON 배열은 쿼리 복잡도 증가 |
| resolveOverrides() 확장 | 별도 NetworkScopedPolicyEngine 클래스 | 기존 엔진 구조 재활용이 유지보수에 유리. 별도 클래스는 과도한 추상화 |
| ALLOWED_NETWORKS permissive default | ALLOWED_NETWORKS default deny | 기존 모델(1 wallet = 1 network)에서 전환 시 모든 기존 월렛이 정책 추가 없이 동작해야 함 |

### Installation

```bash
# 새 패키지 설치 없음. 기존 의존성 그대로 사용.
```

## Architecture Patterns

### 현재 정책 엔진 구조

```
policies 테이블 (현재):
  id TEXT PK
  wallet_id TEXT FK -> wallets(id) (nullable = 글로벌)
  type TEXT NOT NULL (10 PolicyTypes)
  rules TEXT NOT NULL (JSON)
  priority INTEGER
  enabled INTEGER
  created_at, updated_at

PolicyType (10개):
  SPENDING_LIMIT, WHITELIST, TIME_RESTRICTION, RATE_LIMIT,
  ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST,
  APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE

resolveOverrides():
  for each row (sorted by priority DESC):
    typeMap[row.type] = row  (wallet-specific > global for same type)
  return typeMap.values()
```

### 설계 대상 정책 엔진 구조 (After)

```
policies 테이블 (Phase 107):
  id TEXT PK
  wallet_id TEXT FK -> wallets(id) (nullable = 글로벌)
  type TEXT NOT NULL (11 PolicyTypes)            <-- ALLOWED_NETWORKS 추가
  rules TEXT NOT NULL (JSON)
  priority INTEGER
  enabled INTEGER
  network TEXT (nullable = 전체 네트워크)          <-- NEW
  created_at, updated_at

PolicyType (11개):
  SPENDING_LIMIT, WHITELIST, TIME_RESTRICTION, RATE_LIMIT,
  ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST,
  APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE,
  ALLOWED_NETWORKS                               <-- NEW (11번째)

resolveOverrides() 확장:
  복합 키: type + network
  4단계 우선순위:
    1순위: wallet-specific + network-specific (walletId=W, network=N)
    2순위: wallet-specific + all-networks   (walletId=W, network=NULL)
    3순위: global + network-specific        (walletId=NULL, network=N)
    4순위: global + all-networks            (walletId=NULL, network=NULL)
```

### Pattern 1: ALLOWED_NETWORKS PolicyType

**What:** 트랜잭션이 허용된 네트워크 목록을 정의하는 정책
**When to use:** 특정 월렛이 사용할 수 있는 네트워크를 제한할 때

```typescript
// ALLOWED_NETWORKS rules schema (의사코드)
const AllowedNetworksRulesSchema = z.object({
  networks: z.array(z.object({
    network: NetworkTypeEnum,
    name: z.string().optional(),  // display name
  })).min(1, 'At least one network required'),
});

// 평가 로직 의사코드
function evaluateAllowedNetworks(
  resolved: PolicyRow[],
  resolvedNetwork: string,
): PolicyEvaluation | null {
  const policy = resolved.find(p => p.type === 'ALLOWED_NETWORKS');

  // 미설정 시 환경 내 전체 허용 (permissive default)
  if (!policy) return null;

  const rules = JSON.parse(policy.rules);
  const isAllowed = rules.networks.some(
    n => n.network.toLowerCase() === resolvedNetwork.toLowerCase()
  );

  if (!isAllowed) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: `Network '${resolvedNetwork}' not in allowed networks list`,
    };
  }

  return null;  // Network allowed, continue evaluation
}
```

### Pattern 2: 네트워크 스코프 정책 (network 필드)

**What:** 기존 정책(SPENDING_LIMIT 등)에 network 필드를 추가하여 특정 네트워크에만 적용
**When to use:** polygon-amoy에서는 높은 한도, ethereum-sepolia에서는 낮은 한도를 설정할 때

```typescript
// CreatePolicyRequest에 network 필드 추가 (의사코드)
CreatePolicyRequestSchema = z.object({
  walletId: z.string().uuid().optional(),
  type: PolicyTypeEnum,
  rules: z.record(z.unknown()),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
  network: NetworkTypeEnum.optional(),  // NEW: null = all networks
});

// policies 테이블:
// network = NULL -> 전체 네트워크에 적용
// network = 'polygon-amoy' -> polygon-amoy에서만 적용
```

### Pattern 3: 4단계 override 우선순위

**What:** 네트워크 스코프 정책의 override 우선순위
**When to use:** 같은 type의 여러 정책이 존재할 때 어떤 것을 적용할지 결정

```typescript
// resolveOverrides() 확장 의사코드
function resolveOverrides(
  rows: PolicyRow[],
  walletId: string,
  resolvedNetwork: string,
): PolicyRow[] {
  const typeMap = new Map<string, PolicyRow>();

  // 4단계 우선순위 (낮은 순위부터 먼저 삽입, 높은 순위가 덮어씀)
  // Phase 1: global + all-networks (가장 낮은 우선순위)
  for (const row of rows) {
    if (row.walletId === null && row.network === null) {
      typeMap.set(row.type, row);
    }
  }
  // Phase 2: global + network-specific
  for (const row of rows) {
    if (row.walletId === null && row.network === resolvedNetwork) {
      typeMap.set(row.type, row);
    }
  }
  // Phase 3: wallet-specific + all-networks
  for (const row of rows) {
    if (row.walletId === walletId && row.network === null) {
      typeMap.set(row.type, row);
    }
  }
  // Phase 4: wallet-specific + network-specific (가장 높은 우선순위)
  for (const row of rows) {
    if (row.walletId === walletId && row.network === resolvedNetwork) {
      typeMap.set(row.type, row);
    }
  }

  return Array.from(typeMap.values());
}
```

### Pattern 4: DB 마이그레이션 v8 (ALTER TABLE policies ADD COLUMN network)

**What:** policies 테이블에 network nullable 컬럼 추가
**When to use:** Phase 105의 v6b(version 7) 이후, v8(version 8)로 추가

```typescript
// 마이그레이션 의사코드
MIGRATIONS.push({
  version: 8,
  description: 'Add network column to policies for network-scoped policies',
  managesOwnTransaction: false,  // 표준 마이그레이션
  up: (sqlite) => {
    // nullable TEXT -- 기존 정책은 network=NULL (전체 네트워크 적용)
    sqlite.exec('ALTER TABLE policies ADD COLUMN network TEXT');
    // CHECK 제약은 v6b에서 policies를 재생성할 때 추가하거나,
    // 별도 v9 12-step 재생성에서 추가
  },
});
```

### Anti-Patterns to Avoid

- **ALLOWED_NETWORKS를 default deny로 설계:** 기존 모든 월렛에 ALLOWED_NETWORKS 정책이 없으므로, default deny로 하면 기존 월렛의 트랜잭션이 모두 차단됨. 반드시 permissive default(미설정 시 환경 내 전체 허용)로 설계
- **network 필드를 rules JSON 내부에 포함:** `rules.network`으로 구현하면 SQL 쿼리에서 네트워크 필터링이 불가능. DB 컬럼으로 추가하여 인덱스/쿼리 최적화 가능
- **resolveOverrides()를 완전히 재작성:** 기존 2단계(wallet-specific > global) 로직을 4단계로 확장하되, 기존 동작(network=NULL인 경우)은 100% 하위호환을 유지
- **ALLOWED_NETWORKS 평가를 Stage 3 외부에서 수행:** Phase 106에서 이미 환경-네트워크 교차 검증(ENVIRONMENT_NETWORK_MISMATCH)을 Route Handler에서 수행. ALLOWED_NETWORKS는 정책 엔진 평가이므로 Stage 3에서 수행해야 함 (정책 관리 API로 동적 제어 가능)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 네트워크 유효성 검증 | 커스텀 네트워크 검증 | `validateChainNetwork()` + `validateNetworkEnvironment()` (Phase 105/106) | 이미 2중 검증 체계가 설계됨 |
| 네트워크 매핑 상수 | 인라인 네트워크 목록 | `NETWORK_TYPES`, `SOLANA_NETWORK_TYPES`, `EVM_NETWORK_TYPES` (chain.ts SSoT) | SSoT 배열이 이미 존재 |
| 정책 타입별 rules 검증 | 커스텀 JSON 검증 | `POLICY_RULES_SCHEMAS` 맵 + superRefine (policy.schema.ts) | 기존 6개 타입의 Zod superRefine 패턴을 따라 ALLOWED_NETWORKS 추가 |
| 마이그레이션 인프라 | 커스텀 마이그레이션 러너 | `runMigrations()` + MIGRATIONS 배열 (migrate.ts) | 기존 v1~v7 마이그레이션 인프라가 완벽하게 동작 |

**Key insight:** Phase 107의 핵심 설계는 기존 정책 엔진의 override 패턴(resolveOverrides)과 평가 패턴(evaluateXxx)을 네트워크 차원으로 확장하는 것이다. 새로운 아키텍처 패턴이나 인프라가 필요하지 않다.

## Common Pitfalls

### Pitfall 1: ALLOWED_NETWORKS default deny로 기존 월렛 파괴

**What goes wrong:** ALLOWED_NETWORKS를 ALLOWED_TOKENS/CONTRACT_WHITELIST와 동일하게 "정책 미설정 시 deny"로 설계하면, 기존 모든 월렛에 ALLOWED_NETWORKS 정책이 없으므로 모든 트랜잭션이 차단된다.

**Why it happens:** 기존 6개 default deny 정책(ALLOWED_TOKENS, CONTRACT_WHITELIST, APPROVED_SPENDERS)은 "해당 트랜잭션 타입이 아니면 스킵"하는 구조이지만, ALLOWED_NETWORKS는 모든 트랜잭션 타입에 적용되므로 영향 범위가 훨씬 크다.

**How to avoid:** ALLOWED_NETWORKS 미설정 시 "환경 내 전체 허용(permissive)"으로 설계한다. 정책이 존재할 때만 해당 네트워크 목록으로 제한한다. 이는 Phase 107의 Success Criteria 1에 명시된 "미설정 시 기본 동작(환경 내 전체 허용)"과 일치한다.

**Warning signs:** v1.4.6 배포 후 기존 월렛의 트랜잭션이 "Network not in allowed networks list" 에러로 전부 실패.

### Pitfall 2: resolveOverrides() 하위호환 파괴

**What goes wrong:** 4단계 override 우선순위를 구현할 때, 기존 2단계(wallet-specific > global) 동작이 변경되어 기존 정책의 평가 결과가 달라진다.

**Why it happens:** 기존 resolveOverrides()는 `typeMap[type]` 키로 중복 제거. network 차원을 추가할 때 키를 `type:network`로 변경하면, 기존 network=NULL 정책의 override 패턴이 변경될 수 있다.

**How to avoid:** network 필드가 NULL인 기존 정책에 대해서는 기존 2단계 override와 100% 동일하게 동작해야 한다. 테스트에서 "모든 정책이 network=NULL"인 경우의 결과가 기존과 동일한지 검증한다.

**Warning signs:** 기존 policy-engine 테스트(17개 + audit 8개 = 25개)가 network 컬럼 추가 후 실패.

### Pitfall 3: policies.network CHECK 제약 누락

**What goes wrong:** ALTER TABLE로 network 컬럼을 추가할 때 CHECK 제약을 빠뜨리면, 잘못된 네트워크 값이 DB에 삽입될 수 있다.

**Why it happens:** SQLite의 ALTER TABLE ADD COLUMN은 CHECK 제약을 포함할 수 있지만, 구현 시 누락하기 쉽다. 또한 v6b에서 policies를 이미 재생성했으므로, v8에서 다시 12-step 재생성을 할지 단순 ADD COLUMN으로 할지 결정이 필요하다.

**How to avoid:** (1) ALTER TABLE ADD COLUMN에 CHECK 포함: `ALTER TABLE policies ADD COLUMN network TEXT CHECK (network IS NULL OR network IN (...))`, 또는 (2) Zod 레이어에서 CreatePolicyRequestSchema의 network 필드에 NetworkTypeEnum 검증을 추가하여 API 레이어에서 차단. 두 방법을 모두 적용하면 안전하다.

**Warning signs:** `SELECT * FROM policies WHERE network NOT IN ({NETWORK_TYPES}) AND network IS NOT NULL` 결과가 존재.

### Pitfall 4: Stage 3에서 resolvedNetwork 참조 불가

**What goes wrong:** DatabasePolicyEngine.evaluate()에 resolvedNetwork 파라미터가 전달되지 않으면, ALLOWED_NETWORKS 평가와 네트워크 스코프 정책 매칭이 불가능하다.

**Why it happens:** 현재 IPolicyEngine.evaluate() 인터페이스에 network 필드가 없고, TransactionParam에도 network 필드가 없다.

**How to avoid:** (1) TransactionParam 인터페이스에 `network?: string` 필드를 추가하거나, (2) IPolicyEngine.evaluate()에 네트워크 파라미터를 추가한다. Stage 3의 `buildTransactionParam()`에서 `ctx.resolvedNetwork`를 전달하도록 변경한다.

**Warning signs:** ALLOWED_NETWORKS 정책이 존재하지만 평가가 스킵됨. 네트워크 스코프 정책이 네트워크와 무관하게 모두 적용됨.

### Pitfall 5: POLICY_TYPES SSoT 배열 미동기화

**What goes wrong:** `packages/core/src/enums/policy.ts`의 POLICY_TYPES에 'ALLOWED_NETWORKS'를 추가하지 않으면, policies 테이블의 CHECK 제약이 INSERT를 거부한다.

**Why it happens:** Zod SSoT 체계에서 POLICY_TYPES 배열 -> PolicyTypeEnum Zod -> DB CHECK 순서로 파생. POLICY_TYPES 배열 업데이트를 누락하면 CHECK 불일치.

**How to avoid:** POLICY_TYPES 배열에 'ALLOWED_NETWORKS' 추가 -> PolicyTypeEnum 자동 업데이트 -> CreatePolicyRequestSchema에서 'ALLOWED_NETWORKS' 선택 가능 -> DB CHECK에서 허용. DDL의 CHECK도 POLICY_TYPES에서 `inList()`로 생성하므로 자동 동기화.

**Warning signs:** `POST /policies { type: "ALLOWED_NETWORKS" }` -> 400 에러 또는 DB CHECK constraint failed.

## Code Examples

### 1. 현재 resolveOverrides() -- 2단계 override

```typescript
// Source: packages/daemon/src/pipeline/database-policy-engine.ts (line 559-575)
// 현재: type 기준으로만 deduplicate

private resolveOverrides(rows: PolicyRow[], walletId: string): PolicyRow[] {
  const typeMap = new Map<string, PolicyRow>();

  // Rows are already sorted by priority DESC.
  // For each type, prefer wallet-specific over global.
  for (const row of rows) {
    const existing = typeMap.get(row.type);
    if (!existing) {
      typeMap.set(row.type, row);
    } else if (row.walletId === walletId && existing.walletId !== walletId) {
      // Wallet-specific overrides global
      typeMap.set(row.type, row);
    }
  }

  return Array.from(typeMap.values());
}
```

### 2. 현재 POLICY_TYPES SSoT 배열

```typescript
// Source: packages/core/src/enums/policy.ts (line 3-14)
// 현재 10개 -- ALLOWED_NETWORKS 추가 필요

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
] as const;
```

### 3. 현재 evaluateAllowedTokens() -- default deny 패턴 참조

```typescript
// Source: packages/daemon/src/pipeline/database-policy-engine.ts (line 634-678)
// ALLOWED_TOKENS: 미설정 시 deny (TOKEN_TRANSFER만 대상)
// ALLOWED_NETWORKS: 미설정 시 ALLOW (모든 트랜잭션 대상) -- 패턴 차이 주의

private evaluateAllowedTokens(
  resolved: PolicyRow[],
  transaction: TransactionParam,
): PolicyEvaluation | null {
  if (transaction.type !== 'TOKEN_TRANSFER') return null;

  const allowedTokensPolicy = resolved.find((p) => p.type === 'ALLOWED_TOKENS');

  // No ALLOWED_TOKENS policy -> deny token transfers (default deny)
  if (!allowedTokensPolicy) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: 'Token transfer not allowed: no ALLOWED_TOKENS policy configured',
    };
  }
  // ...
}
```

### 4. 현재 policy CREATE route -- network 필드 추가 대상

```typescript
// Source: packages/daemon/src/api/routes/policies.ts (line 229-238)
// 현재: network 필드 없음

deps.db.insert(policies).values({
  id,
  walletId: parsed.walletId ?? null,
  type: parsed.type,
  rules: JSON.stringify(parsed.rules),
  priority: parsed.priority,
  enabled: parsed.enabled,
  createdAt: now,
  updatedAt: now,
  // network: parsed.network ?? null,  // <-- 추가 대상
}).run();
```

### 5. 현재 IPolicyEngine 인터페이스

```typescript
// Source: packages/core/src/interfaces/IPolicyEngine.ts (line 27-38)
// evaluate()에 network 파라미터가 없음 -- TransactionParam 확장 또는 파라미터 추가 필요

export interface IPolicyEngine {
  evaluate(
    walletId: string,
    transaction: {
      type: string;
      amount: string;
      toAddress: string;
      chain: string;
      // network?: string;  // <-- 추가 대상
    },
  ): Promise<PolicyEvaluation>;
}
```

### 6. 현재 Stage 3 buildTransactionParam() -- network 전달 필요

```typescript
// Source: packages/daemon/src/pipeline/stages.ts (line 120-169)
// 현재: chain만 전달, network 없음

function buildTransactionParam(
  req: SendTransactionRequest | TransactionRequest,
  txType: string,
  chain: string,
  // network?: string,  // <-- 추가 대상
): TransactionParam {
  // ...
  return { type: 'TRANSFER', amount, toAddress, chain /*, network */ };
}
```

### 7. 현재 policies 테이블 Drizzle 스키마

```typescript
// Source: packages/daemon/src/infrastructure/database/schema.ts (line 164-181)
// network 컬럼 없음

export const policies = sqliteTable(
  'policies',
  {
    id: text('id').primaryKey(),
    walletId: text('wallet_id').references(() => wallets.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    rules: text('rules').notNull(),
    priority: integer('priority').notNull().default(0),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    // network: text('network'),  // <-- 추가 대상
  },
  // ...
);
```

## Detailed Findings by Requirement

### PLCY-01: ALLOWED_NETWORKS 정책 타입 설계

**Confidence: HIGH** (기존 10개 PolicyType 구현 패턴 직접 분석)

**설계 방향:**

1. **Zod 스키마:**

```typescript
// AllowedNetworksRulesSchema
z.object({
  networks: z.array(z.object({
    network: NetworkTypeEnum,      // 'devnet', 'polygon-amoy' 등
    name: z.string().optional(),   // 사람 읽기용 이름 (선택)
  })).min(1, 'At least one network required'),
})
```

2. **평가 로직 (evaluateAllowedNetworks):**
   - **적용 대상:** 모든 트랜잭션 타입 (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH)
   - **평가 시점:** Stage 3에서 WHITELIST 평가 직후, ALLOWED_TOKENS 평가 직전 (Step 4a.5)
   - **미설정 시 동작:** `return null` (permissive -- 환경 내 전체 허용)
   - **설정 시 동작:** resolvedNetwork이 networks 목록에 없으면 deny
   - **비교 방식:** case-insensitive (EVM 주소 비교 패턴과 일관)

3. **미설정 시 기본 동작 근거:**
   - ALLOWED_TOKENS는 "특정 기능(TOKEN_TRANSFER)을 활성화"하는 정책이므로 default deny가 합리적
   - ALLOWED_NETWORKS는 "기본적으로 사용 가능한 네트워크를 제한"하는 정책이므로 default allow가 합리적
   - Phase 105에서 환경 격리(ENVIRONMENT_NETWORK_MISMATCH)를 이미 Route Handler에서 수행하므로, ALLOWED_NETWORKS는 "환경 내" 추가 제한을 위한 것

4. **에러 메시지:**

```
Network 'polygon-amoy' not in allowed networks list. Allowed: ethereum-sepolia, arbitrum-sepolia
```

5. **POLICY_TYPES 배열 확장:**

```typescript
export const POLICY_TYPES = [
  // ... 기존 10개
  'ALLOWED_NETWORKS',  // 11번째
] as const;
```

6. **POLICY_RULES_SCHEMAS 맵 확장:**

```typescript
const POLICY_RULES_SCHEMAS: Partial<Record<string, z.ZodTypeAny>> = {
  // ... 기존 6개
  ALLOWED_NETWORKS: AllowedNetworksRulesSchema,  // 추가
};
```

### PLCY-02: 네트워크 스코프 정책 설계

**Confidence: HIGH** (기존 resolveOverrides 로직 직접 분석)

**1. policies.network 필드 의미:**

| network 값 | 의미 | 적용 범위 |
|------------|------|---------|
| NULL | 모든 네트워크에 적용 | 기존 동작과 동일 |
| 'polygon-amoy' | polygon-amoy 트랜잭션에만 적용 | 해당 네트워크로 리졸브된 트랜잭션만 |
| 'ethereum-sepolia' | ethereum-sepolia 트랜잭션에만 적용 | 해당 네트워크로 리졸브된 트랜잭션만 |

**2. 4단계 override 우선순위:**

| 우선순위 | walletId | network | 설명 | 예시 |
|---------|----------|---------|------|------|
| 1 (최고) | W | N | 월렛 W + 네트워크 N 전용 정책 | "월렛 A의 polygon-amoy SPENDING_LIMIT" |
| 2 | W | NULL | 월렛 W 전체 네트워크 정책 | "월렛 A의 전체 SPENDING_LIMIT" |
| 3 | NULL | N | 글로벌 + 네트워크 N 전용 정책 | "모든 월렛의 polygon-amoy SPENDING_LIMIT" |
| 4 (최저) | NULL | NULL | 글로벌 전체 네트워크 정책 | "모든 월렛의 전체 SPENDING_LIMIT" (기존) |

**3. resolveOverrides() 확장 전략:**

기존 로직: `typeMap[type]`으로 중복 제거 (wallet-specific > global)

확장 로직:
1. 모든 행을 순회하면서 `type` 기준으로 그룹화
2. 각 type 그룹에서 가장 높은 우선순위의 행을 선택:
   - (walletId match + network match) > (walletId match + network=NULL) > (walletId=NULL + network match) > (walletId=NULL + network=NULL)
3. 기존 network=NULL 정책만 존재하는 경우, 기존 동작과 100% 동일

**4. 하위호환 보장:**

기존 모든 정책의 network=NULL이므로:
- 4단계 우선순위에서 항상 2순위(walletId=W, network=NULL) 또는 4순위(walletId=NULL, network=NULL)로 평가
- 기존 resolveOverrides()의 "wallet-specific > global" 로직과 동일한 결과
- network 파라미터 미지정 시(resolvedNetwork='devnet' 등) 기존 정책이 그대로 적용

**5. TransactionParam 확장:**

```typescript
interface TransactionParam {
  type: string;
  amount: string;
  toAddress: string;
  chain: string;
  network?: string;         // NEW: resolvedNetwork for policy matching
  // ... 기존 필드들
}
```

IPolicyEngine.evaluate() 인터페이스 변경:

```typescript
export interface IPolicyEngine {
  evaluate(
    walletId: string,
    transaction: {
      type: string;
      amount: string;
      toAddress: string;
      chain: string;
      network?: string;      // NEW: for ALLOWED_NETWORKS + network scoping
    },
  ): Promise<PolicyEvaluation>;
}
```

**6. buildTransactionParam() 변경:**

```typescript
// Stage 3에서 호출
const txParam = buildTransactionParam(req, txType, ctx.wallet.chain, ctx.resolvedNetwork);
```

### PLCY-03: policies 테이블 network 컬럼 + 마이그레이션

**Confidence: HIGH** (기존 마이그레이션 v1~v7 패턴 직접 분석)

**1. 마이그레이션 전략:**

| 항목 | 값 |
|------|---|
| version | 8 |
| description | 'Add network column to policies and ALLOWED_NETWORKS type' |
| managesOwnTransaction | false (표준 마이그레이션) |
| SQL | ALTER TABLE policies ADD COLUMN network TEXT |

**2. ALTER TABLE vs 12-step 재생성:**

Phase 105의 v6b(version 7)에서 policies 테이블을 이미 12-step으로 재생성했다. v8에서 다시 12-step은 과도하다.

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| ALTER TABLE ADD COLUMN | 간단, 안전, FK 영향 없음 | CHECK 제약이 ADD COLUMN에서만 가능 | **선택** |
| 12-step 재생성 | CHECK 포함 가능 | 불필요한 복잡도, v6b 직후에 다시 재생성은 과도 | 비추 |

**3. CHECK 제약 처리:**

SQLite는 `ALTER TABLE ADD COLUMN ... CHECK (...)` 문법을 지원한다. 따라서 12-step 재생성 없이도 CHECK를 포함할 수 있다:

```sql
ALTER TABLE policies ADD COLUMN network TEXT CHECK (
  network IS NULL OR network IN ('mainnet', 'devnet', 'testnet', ...)
)
```

**구현 시 참고:** CHECK의 값 목록은 `inList(NETWORK_TYPES)`로 동적 생성한다.

**4. POLICY_TYPES CHECK 제약 업데이트:**

v6b에서 policies 테이블의 `type` CHECK를 `POLICY_TYPES`에서 생성했으므로, ALLOWED_NETWORKS를 POLICY_TYPES에 추가하면:
- 새 DB(pushSchema): CHECK에 ALLOWED_NETWORKS 자동 포함
- 기존 DB(마이그레이션): **v6b의 CHECK에 ALLOWED_NETWORKS가 없음**

**해결 방안:**
- v8 마이그레이션에서 policies의 type CHECK를 업데이트하려면 12-step 재생성이 필요 (ALTER TABLE로 CHECK 변경 불가)
- **대안:** v8에서 network 컬럼만 ADD COLUMN하고, type CHECK 업데이트는 Zod 레이어(CreatePolicyRequestSchema)에서 검증. DB CHECK는 v6b 시점의 10개 타입만 허용하지만, 이후 마이그레이션에서 policies를 12-step 재생성할 때 CHECK를 업데이트. **또는** v8 자체를 12-step으로 설계하여 network 컬럼 + type CHECK 동시 업데이트
- **권장:** v8을 12-step 재생성으로 설계하여 (1) network 컬럼 추가 + (2) type CHECK에 ALLOWED_NETWORKS 추가를 원자적으로 처리. v6b 직후이므로 스키마가 명확하고 재생성 부담이 크지 않음

**5. Drizzle 스키마 변경:**

```typescript
export const policies = sqliteTable(
  'policies',
  {
    // ... 기존 컬럼
    network: text('network'),  // NEW: nullable (NULL = all networks)
  },
  (table) => [
    index('idx_policies_wallet_enabled').on(table.walletId, table.enabled),
    index('idx_policies_type').on(table.type),
    index('idx_policies_network').on(table.network),  // NEW: 네트워크별 쿼리 최적화
    check('check_policy_type', buildCheckSql('type', POLICY_TYPES)),  // ALLOWED_NETWORKS 포함
    check(
      'check_policy_network',
      sql.raw(
        `network IS NULL OR network IN (${NETWORK_TYPES.map((v) => `'${v}'`).join(', ')})`,
      ),
    ),  // NEW: nullable CHECK
  ],
);
```

**6. pushSchema DDL 동기화:**

```typescript
// getCreateTableStatements()에서 policies DDL 업데이트:
`CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (${inList(POLICY_TYPES)})),
  rules TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES)})),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`

// LATEST_SCHEMA_VERSION = 7 -> 8
```

**7. 인덱스 전략:**

- `idx_policies_network` 추가: 네트워크별 정책 쿼리 최적화
- `idx_policies_wallet_enabled` 기존 유지
- 복합 인덱스 고려: `idx_policies_wallet_network_enabled(wallet_id, network, enabled)` -- 4단계 override 쿼리 최적화

**8. DB 쿼리 변경 (evaluate 시):**

현재 정책 로딩 쿼리:
```sql
SELECT * FROM policies
WHERE (wallet_id = ? OR wallet_id IS NULL) AND enabled = 1
ORDER BY priority DESC
```

변경 후:
```sql
SELECT * FROM policies
WHERE (wallet_id = ? OR wallet_id IS NULL)
  AND (network = ? OR network IS NULL)
  AND enabled = 1
ORDER BY priority DESC
```

`network = ?`에 resolvedNetwork를 바인딩하여, 해당 네트워크 전용 정책 + 전체 네트워크 정책을 모두 로딩한다.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 네트워크 무관 정책 (10 PolicyTypes) | 네트워크 스코프 정책 (11 PolicyTypes) | v1.4.5 설계 | 네트워크별 차등 정책 가능 |
| resolveOverrides 2단계 | resolveOverrides 4단계 | v1.4.5 설계 | 네트워크 단위 정책 override |
| policies 테이블 (8 컬럼) | policies 테이블 (9 컬럼, network 추가) | v1.4.5 설계 | 네트워크 필터링 DB 레벨 지원 |

## Open Questions

### 1. v8 마이그레이션을 ALTER TABLE로 할지 12-step으로 할지

**What we know:**
- ALTER TABLE ADD COLUMN network TEXT CHECK (...)는 SQLite에서 지원됨
- 하지만 POLICY_TYPES CHECK(type IN (...))에 ALLOWED_NETWORKS를 추가하려면 12-step 재생성이 필요
- v6b에서 policies를 이미 재생성했으므로 스키마가 명확

**What's unclear:** ALTER TABLE로 network만 추가하고 type CHECK는 Zod에서만 검증할지, 12-step으로 둘 다 업데이트할지.

**Recommendation:** 12-step 재생성으로 설계한다. network 컬럼 추가 + type CHECK 업데이트 + network CHECK 추가 + 인덱스 추가를 원자적으로 처리. v6b 선례가 있으므로 패턴이 검증됨. 다만 ALTER TABLE ADD COLUMN도 유효한 대안이며, 이 경우 type CHECK는 Zod 레이어에서만 검증하고 DB CHECK는 향후 마이그레이션에서 업데이트.

### 2. evaluateAndReserve()에 network 전달 방법

**What we know:**
- `evaluateAndReserve()`는 raw SQL로 직접 정책을 쿼리하므로, network 필터 조건을 SQL에 추가해야 한다
- `evaluateBatch()`도 동일하게 네트워크 인식이 필요

**What's unclear:** evaluateAndReserve의 시그니처에 network을 추가할지, TransactionParam에 포함할지.

**Recommendation:** TransactionParam.network 필드를 추가하는 것이 인터페이스 변경을 최소화한다. evaluateAndReserve 내부의 raw SQL에서 `AND (network = ? OR network IS NULL)` 조건을 추가한다.

### 3. ALLOWED_NETWORKS 평가 순서 (Stage 3 내)

**What we know:**
- 현재 Stage 3 평가 순서: WHITELIST -> ALLOWED_TOKENS -> CONTRACT_WHITELIST -> METHOD_WHITELIST -> APPROVED_SPENDERS -> APPROVE_AMOUNT_LIMIT -> APPROVE_TIER_OVERRIDE -> SPENDING_LIMIT
- ALLOWED_NETWORKS는 모든 트랜잭션 타입에 적용됨

**What's unclear:** ALLOWED_NETWORKS를 WHITELIST 직후(Step 4a.5)에 배치할지, SPENDING_LIMIT 직전에 배치할지.

**Recommendation:** WHITELIST 직후 (Step 4a.5)에 배치한다. ALLOWED_NETWORKS는 "이 트랜잭션이 이 네트워크에서 실행되어도 되는가?"라는 기본적인 허용 검사이므로, 세부 정책(ALLOWED_TOKENS, CONTRACT_WHITELIST 등) 평가 전에 수행하는 것이 논리적이다. 네트워크 자체가 허용되지 않으면 토큰/컨트랙트 검사는 무의미하다.

## Sources

### Primary (HIGH confidence -- 코드베이스 직접 확인)

- `packages/daemon/src/pipeline/database-policy-engine.ts` -- DatabasePolicyEngine 전체 (1007줄), resolveOverrides, evaluate, evaluateAndReserve, 10개 평가 메서드
- `packages/core/src/enums/policy.ts` -- POLICY_TYPES 배열 (10개), PolicyTier, PolicyTypeEnum
- `packages/core/src/schemas/policy.schema.ts` -- PolicySchema, CreatePolicyRequestSchema, POLICY_RULES_SCHEMAS 맵 (6개 타입 Zod 검증)
- `packages/core/src/interfaces/IPolicyEngine.ts` -- IPolicyEngine 인터페이스, PolicyEvaluation 타입
- `packages/daemon/src/api/routes/policies.ts` -- POST/GET/PUT/DELETE /policies CRUD 라우트
- `packages/daemon/src/infrastructure/database/schema.ts` -- policies 테이블 Drizzle 스키마 (8 컬럼)
- `packages/daemon/src/infrastructure/database/migrate.ts` -- MIGRATIONS 배열, LATEST_SCHEMA_VERSION=5, runMigrations(), inList() 유틸
- `packages/daemon/src/pipeline/stages.ts` -- PipelineContext 인터페이스, stage3Policy, buildTransactionParam
- `packages/core/src/enums/chain.ts` -- NETWORK_TYPES (13개), NetworkTypeEnum, validateChainNetwork
- `packages/daemon/src/__tests__/database-policy-engine.test.ts` -- 정책 엔진 테스트 패턴 (insertPolicy, tx 헬퍼)
- `packages/daemon/src/__tests__/policy-engine-coverage-audit.test.ts` -- 정책 엔진 커버리지 감사 테스트 (8개)

### Secondary (HIGH confidence -- Phase 105/106 설계 문서)

- `docs/69-db-migration-v6-design.md` -- v6b policies 테이블 재생성 (Step 9), POLICY_TYPES CHECK, "policies.network은 Phase 107 범위" 명시 (섹션 3.2 Step 9 주의사항)
- `docs/70-pipeline-network-resolve-design.md` -- PipelineContext.resolvedNetwork 인터페이스, Stage 3 policyEngine.evaluate()에서 ctx.resolvedNetwork 참조 계획 (섹션 5.3, 7.2)
- `.planning/phases/106-pipeline-network-resolve-design/106-RESEARCH.md` -- PIPE-02 PipelineContext 확장, Stage 3 "Phase 107 범위" 언급
- `.planning/REQUIREMENTS.md` -- PLCY-01, PLCY-02, PLCY-03 요구사항 정의

### Tertiary (MEDIUM confidence -- 과거 설계 Phase 리서치)

- `.planning/phases/41-policy-engine-completion/41-RESEARCH.md` -- 정책 엔진 설계 보완 이력, SSoT 교차 참조 패턴

## Metadata

**Confidence breakdown:**
- PLCY-01 (ALLOWED_NETWORKS): HIGH -- 기존 10개 PolicyType 구현 패턴과 evaluateXxx() 메서드 직접 분석. ALLOWED_TOKENS와 유사하되 default 동작만 다름
- PLCY-02 (네트워크 스코프 정책): HIGH -- resolveOverrides() 로직 직접 분석. 4단계 우선순위 설계는 기존 2단계의 자연스러운 확장. TransactionParam/IPolicyEngine 인터페이스 변경 지점 식별 완료
- PLCY-03 (policies 테이블 마이그레이션): HIGH -- 기존 v1~v7 마이그레이션 코드 직접 분석. v6b에서 policies 재생성 패턴 확인. ALTER TABLE vs 12-step 트레이드오프 분석 완료

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (기존 스택 활용이므로 30일 유효)
