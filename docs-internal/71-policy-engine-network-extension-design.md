# 설계 문서 71: 정책 엔진 네트워크 확장 설계

> **Phase:** 107 (v1.4.5 -- 멀티체인 월렛 설계)
> **산출물:** ALLOWED_NETWORKS 11번째 PolicyType + 네트워크 스코프 정책 + policies 테이블 v8 마이그레이션
> **참조 기반:** docs-internal/68-environment-model-design.md, docs-internal/69-db-migration-v6-design.md, docs-internal/70-pipeline-network-resolve-design.md, 107-RESEARCH.md
> **작성일:** 2026-02-14

---

## 1. 개요 + 설계 범위

### 1.1 목적

Phase 107은 정책 엔진(DatabasePolicyEngine)에 네트워크 인식 기능을 추가하는 설계를 수행한다. 현재 정책 엔진은 10개 PolicyType을 월렛(wallet-specific) 또는 글로벌(walletId=NULL) 스코프로 평가하지만, 네트워크 차원의 분리가 없다. 이로 인해 다음 문제가 발생한다:

1. 동일 월렛이 polygon-amoy와 ethereum-sepolia를 사용할 때 동일한 SPENDING_LIMIT가 적용됨
2. 특정 네트워크만 허용/차단하는 정책이 존재하지 않음
3. 네트워크별 차등 정책(예: L2에서는 높은 한도, L1에서는 낮은 한도)을 설정할 수 없음

**핵심 과제 3개:**

| ID | 과제 | 설계 대상 |
|----|------|---------|
| PLCY-01 | ALLOWED_NETWORKS PolicyType | 11번째 PolicyType 스키마 + 평가 로직 + 평가 순서 |
| PLCY-02 | 네트워크 스코프 정책 | policies.network 필드 + 4단계 override 우선순위 + 인터페이스 확장 |
| PLCY-03 | policies 테이블 v8 마이그레이션 | 12-step 재생성 + pushSchema DDL + Drizzle 스키마 동기화 |

### 1.2 변경 대상 정리

| 변경 대상 | 현재 상태 | 변경 내용 |
|----------|---------|---------|
| `POLICY_TYPES` SSoT 배열 | 10개 PolicyType | `ALLOWED_NETWORKS` 추가 (11개) |
| `POLICY_RULES_SCHEMAS` 맵 | 6개 타입 Zod 검증 | `ALLOWED_NETWORKS: AllowedNetworksRulesSchema` 추가 |
| `CreatePolicyRequestSchema` | `network` 필드 없음 | `network: NetworkTypeEnum.optional()` 추가 |
| `DatabasePolicyEngine` | 네트워크 미인식, 2단계 override | `evaluateAllowedNetworks()` 추가, 4단계 override |
| `IPolicyEngine.evaluate()` | `transaction.network` 없음 | `network?: string` 필드 추가 |
| `TransactionParam` | `network` 필드 없음 | `network?: string` 추가 |
| `policies` 테이블 | 8컬럼, network 없음 | `network TEXT` nullable 컬럼 추가 (v8) |
| `evaluateAndReserve()` raw SQL | network 필터 없음 | `AND (network = ? OR network IS NULL)` 추가 |
| Stage 3 평가 순서 | WHITELIST -> ALLOWED_TOKENS -> ... | WHITELIST -> **ALLOWED_NETWORKS** -> ALLOWED_TOKENS -> ... |

### 1.3 참조 문서

| 문서 | 참조 내용 |
|------|---------|
| docs/68 (환경 데이터 모델) | EnvironmentType, ENVIRONMENT_NETWORK_MAP, 환경-네트워크 매핑 순수 함수 |
| docs/69 (DB 마이그레이션 v6) | v6a(version 6) + v6b(version 7) 마이그레이션 패턴, 12-step 재생성 선례, `inList()` 유틸 |
| docs/70 (파이프라인 리졸브) | PipelineContext.resolvedNetwork, Stage 3 policyEngine.evaluate()에서 ctx.resolvedNetwork 참조 계획, ENVIRONMENT_NETWORK_MISMATCH 에러 |

### 1.4 Before/After 아키텍처 비교

**Before (v1.4.4 -- 현재):**

```
policies 테이블:
  id | wallet_id | type (10개) | rules | priority | enabled | created_at | updated_at

PolicyType: SPENDING_LIMIT, WHITELIST, TIME_RESTRICTION, RATE_LIMIT,
            ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST,
            APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE

resolveOverrides():
  typeMap[row.type] = row  (wallet-specific > global, 2단계)

evaluate():
  WHITELIST -> ALLOWED_TOKENS -> CONTRACT_WHITELIST -> METHOD_WHITELIST
  -> APPROVED_SPENDERS -> APPROVE_AMOUNT_LIMIT -> APPROVE_TIER_OVERRIDE
  -> SPENDING_LIMIT
```

**After (v1.4.6 -- 설계 대상):**

```
policies 테이블:
  id | wallet_id | type (11개) | rules | priority | enabled | network | created_at | updated_at

PolicyType: SPENDING_LIMIT, WHITELIST, TIME_RESTRICTION, RATE_LIMIT,
            ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST,
            APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE,
            ALLOWED_NETWORKS                                      <-- NEW (11번째)

resolveOverrides():
  4단계 우선순위:
    1순위: wallet+network  (walletId=W, network=N)
    2순위: wallet+null     (walletId=W, network=NULL)
    3순위: global+network  (walletId=NULL, network=N)
    4순위: global+null     (walletId=NULL, network=NULL)

evaluate():
  WHITELIST -> ALLOWED_NETWORKS -> ALLOWED_TOKENS -> ...          <-- NEW 위치
  -> CONTRACT_WHITELIST -> METHOD_WHITELIST -> APPROVED_SPENDERS
  -> APPROVE_AMOUNT_LIMIT -> APPROVE_TIER_OVERRIDE -> SPENDING_LIMIT
```

---

## 2. ALLOWED_NETWORKS PolicyType 설계 (PLCY-01)

### 2.1 AllowedNetworksRulesSchema Zod 정의

Research Pattern 1 기반으로 ALLOWED_NETWORKS의 rules JSON 스키마를 정의한다.

```typescript
// packages/core/src/schemas/policy.schema.ts

import { NetworkTypeEnum } from '../enums/chain.js';

/** ALLOWED_NETWORKS: rules.networks array (permitted networks for wallet). */
const AllowedNetworksRulesSchema = z.object({
  networks: z.array(z.object({
    network: NetworkTypeEnum,         // 'devnet', 'polygon-amoy' 등 (SSoT 검증)
    name: z.string().optional(),      // 사람 읽기용 이름 (선택, 예: "Polygon Amoy Testnet")
  })).min(1, 'At least one network required'),
});
```

**rules JSON 예시:**

```json
{
  "networks": [
    { "network": "ethereum-sepolia", "name": "Ethereum Sepolia" },
    { "network": "polygon-amoy", "name": "Polygon Amoy" }
  ]
}
```

### 2.2 POLICY_TYPES SSoT 배열 확장

```typescript
// packages/core/src/enums/policy.ts

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
  'ALLOWED_NETWORKS',        // NEW: 11번째 PolicyType
] as const;
export type PolicyType = (typeof POLICY_TYPES)[number];
export const PolicyTypeEnum = z.enum(POLICY_TYPES);
```

**자동 파생 체인:**

```
POLICY_TYPES 배열 (11개)
  -> PolicyType 타입 (union)
  -> PolicyTypeEnum Zod (enum)
  -> CreatePolicyRequestSchema.type (enum validation)
  -> DB CHECK (inList(POLICY_TYPES)) -- pushSchema DDL + v8 마이그레이션
```

### 2.3 POLICY_RULES_SCHEMAS 맵 확장

```typescript
// packages/core/src/schemas/policy.schema.ts

const POLICY_RULES_SCHEMAS: Partial<Record<string, z.ZodTypeAny>> = {
  ALLOWED_TOKENS: AllowedTokensRulesSchema,
  CONTRACT_WHITELIST: ContractWhitelistRulesSchema,
  METHOD_WHITELIST: MethodWhitelistRulesSchema,
  APPROVED_SPENDERS: ApprovedSpendersRulesSchema,
  APPROVE_AMOUNT_LIMIT: ApproveAmountLimitRulesSchema,
  APPROVE_TIER_OVERRIDE: ApproveTierOverrideRulesSchema,
  ALLOWED_NETWORKS: AllowedNetworksRulesSchema,    // NEW: 7번째 rules 검증
};
```

기존 `superRefine` 로직이 `POLICY_RULES_SCHEMAS[data.type]`으로 lookup하므로, 맵에 추가만 하면 `POST /v1/policies { type: "ALLOWED_NETWORKS" }` 요청 시 rules 자동 검증이 활성화된다.

### 2.4 evaluateAllowedNetworks() 평가 의사코드

```typescript
// packages/daemon/src/pipeline/database-policy-engine.ts

/**
 * Evaluate ALLOWED_NETWORKS policy.
 *
 * Logic:
 * - Applies to ALL 5 transaction types (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH)
 * - If no ALLOWED_NETWORKS policy exists: return null (permissive default -- all networks allowed)
 * - If policy exists: check if resolvedNetwork is in rules.networks[].network
 *   -> If found: return null (continue to next evaluation)
 *   -> If not found: deny with reason 'Network not in allowed list'
 * - Comparison: case-insensitive (toLowerCase)
 * - Tier: INSTANT (즉시 거부)
 *
 * Returns PolicyEvaluation if denied, null if allowed (or no policy).
 */
private evaluateAllowedNetworks(
  resolved: PolicyRow[],
  resolvedNetwork: string,
): PolicyEvaluation | null {
  const policy = resolved.find((p) => p.type === 'ALLOWED_NETWORKS');

  // 미설정 시 환경 내 전체 허용 (permissive default)
  // -> 기존 월렛에 ALLOWED_NETWORKS 정책이 없으므로, 모든 네트워크 트랜잭션이 정상 통과
  if (!policy) return null;

  // Parse rules
  const rules: { networks: Array<{ network: string; name?: string }> } =
    JSON.parse(policy.rules);

  // Case-insensitive comparison (EVM 주소 비교 패턴과 일관)
  const isAllowed = rules.networks.some(
    (n) => n.network.toLowerCase() === resolvedNetwork.toLowerCase(),
  );

  if (!isAllowed) {
    const allowedList = rules.networks.map((n) => n.network).join(', ');
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: `Network '${resolvedNetwork}' not in allowed networks list. Allowed: ${allowedList}`,
    };
  }

  return null; // Network allowed, continue evaluation
}
```

### 2.5 ALLOWED_NETWORKS vs 기존 default deny 정책 비교

| 정책 | 적용 대상 | 미설정 시 동작 | 설정 시 동작 | 근거 |
|------|---------|-------------|------------|------|
| ALLOWED_TOKENS | TOKEN_TRANSFER만 | **deny** | 목록 외 토큰 deny | 토큰 전송은 명시적 허용 필요 |
| CONTRACT_WHITELIST | CONTRACT_CALL만 | **deny** | 목록 외 컨트랙트 deny | 컨트랙트 호출은 명시적 허용 필요 |
| APPROVED_SPENDERS | APPROVE만 | **deny** | 목록 외 spender deny | approve는 명시적 허용 필요 |
| **ALLOWED_NETWORKS** | **모든 5-type** | **allow (permissive)** | **목록 외 네트워크 deny** | **기존 월렛 하위호환 (정책 없이 동작해야 함)** |

**permissive default 근거:**

1. 기존 모든 월렛에 ALLOWED_NETWORKS 정책이 없으므로, default deny로 하면 모든 기존 트랜잭션이 차단됨
2. ALLOWED_TOKENS/CONTRACT_WHITELIST/APPROVED_SPENDERS는 "특정 기능을 활성화"하는 정책이므로 default deny가 합리적
3. ALLOWED_NETWORKS는 "이미 사용 가능한 네트워크를 제한"하는 정책이므로 default allow가 합리적
4. Phase 105/106에서 환경 격리(ENVIRONMENT_NETWORK_MISMATCH)를 이미 Route Handler에서 수행하므로, ALLOWED_NETWORKS는 "환경 내" 추가 제한을 위한 것

### 2.6 Stage 3 평가 순서

**현재 (10개 PolicyType):**

```
Step 4:  WHITELIST (address filtering)
Step 4b: ALLOWED_TOKENS (token whitelist, default deny)
Step 4c: CONTRACT_WHITELIST (contract whitelist, default deny)
Step 4d: METHOD_WHITELIST (method restriction, optional)
Step 4e: APPROVED_SPENDERS (spender whitelist, default deny)
Step 4f: APPROVE_AMOUNT_LIMIT (amount cap)
Step 4g: APPROVE_TIER_OVERRIDE (forced tier, FINAL for APPROVE)
Step 5:  SPENDING_LIMIT (tier classification)
```

**변경 (11개 PolicyType):**

```
Step 4:    WHITELIST (address filtering)
Step 4a.5: ALLOWED_NETWORKS (network whitelist, permissive default)    <-- NEW
Step 4b:   ALLOWED_TOKENS (token whitelist, default deny)
Step 4c:   CONTRACT_WHITELIST (contract whitelist, default deny)
Step 4d:   METHOD_WHITELIST (method restriction, optional)
Step 4e:   APPROVED_SPENDERS (spender whitelist, default deny)
Step 4f:   APPROVE_AMOUNT_LIMIT (amount cap)
Step 4g:   APPROVE_TIER_OVERRIDE (forced tier, FINAL for APPROVE)
Step 5:    SPENDING_LIMIT (tier classification)
```

**WHITELIST 직후 (Step 4a.5) 배치 근거:**

1. ALLOWED_NETWORKS는 "이 트랜잭션이 이 네트워크에서 실행되어도 되는가?"라는 기본적인 허용 검사
2. 네트워크 자체가 허용되지 않으면 토큰/컨트랙트/spender 검사는 무의미
3. WHITELIST(주소 필터링)보다는 뒤에 배치 -- 주소가 허용되지 않으면 네트워크 검사도 무의미

**evaluate() 메서드 변경 의사코드:**

```typescript
async evaluate(
  walletId: string,
  transaction: TransactionParam,
): Promise<PolicyEvaluation> {
  // Step 1-3: 기존과 동일 (load, check empty, resolveOverrides)
  const rows = await this.db.select()...;
  if (rows.length === 0) return { allowed: true, tier: 'INSTANT' };
  const resolved = this.resolveOverrides(rows as PolicyRow[], walletId, transaction.network);

  // Step 4: WHITELIST (기존)
  const whitelistResult = this.evaluateWhitelist(resolved, transaction.toAddress);
  if (whitelistResult !== null) return whitelistResult;

  // Step 4a.5: ALLOWED_NETWORKS (NEW)
  if (transaction.network) {
    const allowedNetworksResult = this.evaluateAllowedNetworks(resolved, transaction.network);
    if (allowedNetworksResult !== null) return allowedNetworksResult;
  }

  // Step 4b~5: 기존과 동일
  // ...
}
```

---

## 3. 네트워크 스코프 정책 설계 (PLCY-02)

### 3.1 policies.network 필드 의미

| network 값 | 의미 | 적용 범위 | 예시 |
|------------|------|---------|------|
| `NULL` | 모든 네트워크에 적용 | 기존 동작과 동일 | 글로벌 SPENDING_LIMIT |
| `'polygon-amoy'` | polygon-amoy 트랜잭션에만 적용 | 해당 네트워크로 리졸브된 트랜잭션만 | polygon-amoy 전용 높은 한도 |
| `'ethereum-sepolia'` | ethereum-sepolia 트랜잭션에만 적용 | 해당 네트워크로 리졸브된 트랜잭션만 | ethereum-sepolia 전용 낮은 한도 |

### 3.2 CreatePolicyRequestSchema 확장

```typescript
// packages/core/src/schemas/policy.schema.ts

import { NetworkTypeEnum } from '../enums/chain.js';

export const CreatePolicyRequestSchema = z.object({
  walletId: z.string().uuid().optional(),
  type: PolicyTypeEnum,
  rules: z.record(z.unknown()),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
  network: NetworkTypeEnum.optional(),    // NEW: null = all networks
}).superRefine((data, ctx) => {
  const schema = POLICY_RULES_SCHEMAS[data.type];
  if (!schema) return;
  const result = schema.safeParse(data.rules);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({ ...issue, path: ['rules', ...issue.path] });
    }
  }
});
```

**API 요청 예시:**

```json
// 글로벌 SPENDING_LIMIT (기존과 동일, network 미지정)
POST /v1/policies
{
  "type": "SPENDING_LIMIT",
  "rules": { "instant_max": "1000000", "notify_max": "5000000", "delay_max": "10000000", "delay_seconds": 300 }
}

// polygon-amoy 전용 SPENDING_LIMIT (높은 한도)
POST /v1/policies
{
  "type": "SPENDING_LIMIT",
  "network": "polygon-amoy",
  "walletId": "w_01abc...",
  "rules": { "instant_max": "10000000", "notify_max": "50000000", "delay_max": "100000000", "delay_seconds": 300 }
}

// 특정 월렛의 허용 네트워크 제한
POST /v1/policies
{
  "type": "ALLOWED_NETWORKS",
  "walletId": "w_01abc...",
  "rules": { "networks": [{ "network": "ethereum-sepolia" }, { "network": "polygon-amoy" }] }
}
```

### 3.3 4단계 override 우선순위

| 우선순위 | walletId | network | 설명 | 예시 |
|---------|----------|---------|------|------|
| 1 (최고) | W | N | 월렛 W + 네트워크 N 전용 정책 | "월렛 A의 polygon-amoy SPENDING_LIMIT" |
| 2 | W | NULL | 월렛 W 전체 네트워크 정책 | "월렛 A의 전체 SPENDING_LIMIT" |
| 3 | NULL | N | 글로벌 + 네트워크 N 전용 정책 | "모든 월렛의 polygon-amoy SPENDING_LIMIT" |
| 4 (최저) | NULL | NULL | 글로벌 전체 네트워크 정책 | "모든 월렛의 전체 SPENDING_LIMIT" (기존) |

**override 동작 예시:**

```
시나리오: 월렛 W가 polygon-amoy에서 TRANSFER 실행
정책 DB:
  P1: SPENDING_LIMIT, walletId=NULL, network=NULL, instant_max=1000
  P2: SPENDING_LIMIT, walletId=W,    network=NULL, instant_max=5000
  P3: SPENDING_LIMIT, walletId=NULL, network='polygon-amoy', instant_max=2000
  P4: SPENDING_LIMIT, walletId=W,    network='polygon-amoy', instant_max=10000

resolveOverrides() 결과:
  SPENDING_LIMIT -> P4 (1순위: wallet+network)

만약 P4가 없으면:
  SPENDING_LIMIT -> P2 (2순위: wallet+null)

만약 P4, P2가 없으면:
  SPENDING_LIMIT -> P3 (3순위: global+network)

만약 P4, P2, P3가 없으면:
  SPENDING_LIMIT -> P1 (4순위: global+null) -- 기존과 동일
```

### 3.4 resolveOverrides() 확장 의사코드

```typescript
// packages/daemon/src/pipeline/database-policy-engine.ts

/**
 * Resolve policy overrides with 4-level priority:
 *   1. wallet-specific + network-specific (highest)
 *   2. wallet-specific + all-networks
 *   3. global + network-specific
 *   4. global + all-networks (lowest)
 *
 * For each policy type, one policy is selected.
 * Lower priority entries are inserted first, higher priority entries overwrite.
 * Key: typeMap[row.type] (same as current -- no composite key needed)
 *
 * Backward compat: when all policies have network=NULL,
 * phases 2+4 collapse into current 2-level (wallet > global) behavior.
 */
private resolveOverrides(
  rows: PolicyRow[],
  walletId: string,
  resolvedNetwork?: string,
): PolicyRow[] {
  const typeMap = new Map<string, PolicyRow>();

  // Phase 1: global + all-networks (4순위, 가장 낮은 우선순위)
  for (const row of rows) {
    if (row.walletId === null && row.network === null) {
      typeMap.set(row.type, row);
    }
  }

  // Phase 2: global + network-specific (3순위)
  if (resolvedNetwork) {
    for (const row of rows) {
      if (row.walletId === null && row.network === resolvedNetwork) {
        typeMap.set(row.type, row);
      }
    }
  }

  // Phase 3: wallet-specific + all-networks (2순위)
  for (const row of rows) {
    if (row.walletId === walletId && row.network === null) {
      typeMap.set(row.type, row);
    }
  }

  // Phase 4: wallet-specific + network-specific (1순위, 가장 높은 우선순위)
  if (resolvedNetwork) {
    for (const row of rows) {
      if (row.walletId === walletId && row.network === resolvedNetwork) {
        typeMap.set(row.type, row);
      }
    }
  }

  return Array.from(typeMap.values());
}
```

**핵심 설계 결정: `typeMap[type]` 단일 키 유지 (복합키 불필요)**

- 복합키 `type:network`를 사용하면 같은 type의 network=NULL 정책과 network='polygon-amoy' 정책이 모두 남아 2개가 평가됨
- 단일 키 `type`을 사용하면 4단계 우선순위에 따라 하나만 남음 -- 이것이 올바른 동작
- 낮은 우선순위부터 삽입하고 높은 우선순위가 덮어쓰는 패턴으로, 기존 `resolveOverrides()`의 "wallet-specific overrides global" 패턴과 일관

### 3.5 하위호환 증명

**명제:** 기존 모든 정책이 `network=NULL`일 때, 4단계 resolveOverrides()는 기존 2단계와 동일한 결과를 반환한다.

**증명:**

```
기존 정책: 모든 row에서 row.network = NULL

Phase 1: global + all-networks (walletId=NULL, network=NULL)
  -> 기존 global 정책이 typeMap에 삽입됨

Phase 2: global + network-specific (walletId=NULL, network=resolvedNetwork)
  -> 해당하는 row 없음 (모든 network=NULL이므로 매칭 안 됨)
  -> typeMap 변경 없음

Phase 3: wallet-specific + all-networks (walletId=W, network=NULL)
  -> 기존 wallet-specific 정책이 typeMap에 삽입됨 (global을 덮어씀)

Phase 4: wallet-specific + network-specific (walletId=W, network=resolvedNetwork)
  -> 해당하는 row 없음 (모든 network=NULL이므로 매칭 안 됨)
  -> typeMap 변경 없음

최종 결과: typeMap = { type: wallet-specific 또는 global }
  = 기존 resolveOverrides()와 동일한 결과 QED
```

---

## 4. 인터페이스 확장 설계

### 4.1 TransactionParam에 network 추가

```typescript
// packages/daemon/src/pipeline/database-policy-engine.ts

/** Transaction parameter for policy evaluation. */
interface TransactionParam {
  type: string;
  amount: string;
  toAddress: string;
  chain: string;
  network?: string;           // NEW: resolvedNetwork for ALLOWED_NETWORKS + network scoping
  /** Token address for ALLOWED_TOKENS evaluation (TOKEN_TRANSFER only). */
  tokenAddress?: string;
  /** Contract address for CONTRACT_WHITELIST evaluation (CONTRACT_CALL only). */
  contractAddress?: string;
  /** Function selector for METHOD_WHITELIST evaluation (CONTRACT_CALL only). */
  selector?: string;
  /** Spender address for APPROVED_SPENDERS evaluation (APPROVE only). */
  spenderAddress?: string;
  /** Approve amount for APPROVE_AMOUNT_LIMIT evaluation (APPROVE only). */
  approveAmount?: string;
}
```

### 4.2 IPolicyEngine.evaluate() 시그니처 확장

```typescript
// packages/core/src/interfaces/IPolicyEngine.ts

export interface IPolicyEngine {
  /** Evaluate a transaction against policies. */
  evaluate(
    walletId: string,
    transaction: {
      type: string;
      amount: string;
      toAddress: string;
      chain: string;
      network?: string;       // NEW: for ALLOWED_NETWORKS + network scoping
    },
  ): Promise<PolicyEvaluation>;
}
```

`network`을 optional로 추가하므로 기존 호출부가 network 없이 호출해도 타입 오류 없이 동작한다. 기존 테스트 25개가 수정 없이 통과한다.

### 4.3 buildTransactionParam() 변경

```typescript
// packages/daemon/src/pipeline/stages.ts

function buildTransactionParam(
  req: SendTransactionRequest | TransactionRequest,
  txType: string,
  chain: string,
  network?: string,           // NEW: resolvedNetwork 전달
): TransactionParam {
  switch (txType) {
    case 'TOKEN_TRANSFER': {
      const r = req as { to: string; amount: string; token: { address: string } };
      return {
        type: 'TOKEN_TRANSFER',
        amount: r.amount,
        toAddress: r.to,
        chain,
        network,              // NEW
        tokenAddress: r.token.address,
      };
    }
    case 'CONTRACT_CALL': {
      const r = req as { to: string; calldata?: string; value?: string };
      return {
        type: 'CONTRACT_CALL',
        amount: r.value ?? '0',
        toAddress: r.to,
        chain,
        network,              // NEW
        contractAddress: r.to,
        selector: r.calldata?.slice(0, 10),
      };
    }
    case 'APPROVE': {
      const r = req as { spender: string; amount: string };
      return {
        type: 'APPROVE',
        amount: r.amount,
        toAddress: r.spender,
        chain,
        network,              // NEW
        spenderAddress: r.spender,
        approveAmount: r.amount,
      };
    }
    case 'TRANSFER':
    default: {
      const r = req as { to: string; amount: string };
      return {
        type: 'TRANSFER',
        amount: r.amount,
        toAddress: r.to,
        chain,
        network,              // NEW
      };
    }
  }
}
```

**Stage 3 호출부 변경:**

```typescript
// stage3Policy() 내부
const txParam = buildTransactionParam(
  ctx.request,
  txType,
  ctx.wallet.chain,
  ctx.resolvedNetwork,        // NEW: Phase 106에서 추가된 PipelineContext.resolvedNetwork
);
```

### 4.4 evaluateAndReserve() raw SQL 변경

현재 evaluateAndReserve()는 raw SQL로 정책을 직접 쿼리하므로, network 필터 조건을 SQL에 추가해야 한다.

**현재 SQL:**

```sql
SELECT id, wallet_id AS walletId, type, rules, priority, enabled
FROM policies
WHERE (wallet_id = ? OR wallet_id IS NULL)
  AND enabled = 1
ORDER BY priority DESC
```

**변경 SQL:**

```sql
SELECT id, wallet_id AS walletId, type, rules, priority, enabled, network
FROM policies
WHERE (wallet_id = ? OR wallet_id IS NULL)
  AND (network = ? OR network IS NULL)
  AND enabled = 1
ORDER BY priority DESC
```

**바인딩:** `[walletId, resolvedNetwork]`

**변경 의사코드:**

```typescript
// packages/daemon/src/pipeline/database-policy-engine.ts

evaluateAndReserve(
  walletId: string,
  transaction: TransactionParam,
  txId: string,
): PolicyEvaluation {
  // ...
  const sqlite = this.sqlite;

  const txn = sqlite.transaction(() => {
    // Step 1: Load enabled policies with network filter
    const policyRows = sqlite
      .prepare(
        `SELECT id, wallet_id AS walletId, type, rules, priority, enabled, network
         FROM policies
         WHERE (wallet_id = ? OR wallet_id IS NULL)
           AND (network = ? OR network IS NULL)
           AND enabled = 1
         ORDER BY priority DESC`,
      )
      .all(walletId, transaction.network ?? null) as PolicyRow[];

    // Step 2-5: 기존과 동일하되 resolveOverrides에 network 전달
    if (policyRows.length === 0) {
      return { allowed: true, tier: 'INSTANT' as PolicyTier };
    }

    const resolved = this.resolveOverrides(policyRows, walletId, transaction.network);

    // Step 4: WHITELIST
    // ...

    // Step 4a.5: ALLOWED_NETWORKS (NEW)
    if (transaction.network) {
      const allowedNetworksResult = this.evaluateAllowedNetworks(resolved, transaction.network);
      if (allowedNetworksResult !== null) return allowedNetworksResult;
    }

    // Step 4b~5: 기존과 동일
    // ...
  });

  return txn.immediate();
}
```

### 4.5 evaluateBatch() 동일 변경 패턴

```typescript
// evaluateBatch() 메서드 변경 의사코드

async evaluateBatch(
  walletId: string,
  instructions: TransactionParam[],
): Promise<PolicyEvaluation> {
  // Step 1: Load policies with network filter
  // instructions[0]?.network을 기준으로 필터 (BATCH 내 모든 instruction은 동일 네트워크)
  const resolvedNetwork = instructions[0]?.network;

  const rows = await this.db
    .select()
    .from(policies)
    .where(
      and(
        or(eq(policies.walletId, walletId), isNull(policies.walletId)),
        or(
          resolvedNetwork ? eq(policies.network, resolvedNetwork) : isNull(policies.network),
          isNull(policies.network),
        ),
        eq(policies.enabled, true),
      ),
    )
    .orderBy(desc(policies.priority))
    .all();

  // ...resolveOverrides with network
  const resolved = this.resolveOverrides(rows as PolicyRow[], walletId, resolvedNetwork);

  // ALLOWED_NETWORKS evaluation before Phase A
  if (resolvedNetwork) {
    const allowedNetworksResult = this.evaluateAllowedNetworks(resolved, resolvedNetwork);
    if (allowedNetworksResult !== null) return allowedNetworksResult;
  }

  // Phase A + Phase B: 기존과 동일
  // ...
}
```

### 4.6 PolicyRow 인터페이스 확장

```typescript
// packages/daemon/src/pipeline/database-policy-engine.ts

interface PolicyRow {
  id: string;
  walletId: string | null;
  type: string;
  rules: string;
  priority: number;
  enabled: boolean | null;
  network: string | null;     // NEW: nullable (NULL = all networks)
}
```

---

## 5. 설계 결정 로그

### PLCY-D01: ALLOWED_NETWORKS permissive default (not default deny)

| 항목 | 내용 |
|------|------|
| **결정** | ALLOWED_NETWORKS 정책이 미설정일 때 환경 내 전체 네트워크를 허용 (permissive default) |
| **근거** | 기존 모든 월렛에 ALLOWED_NETWORKS 정책이 없으므로, default deny로 하면 기존 트랜잭션이 전부 차단됨. ALLOWED_TOKENS(TOKEN_TRANSFER만 대상, 특정 기능 활성화)와 달리 ALLOWED_NETWORKS는 모든 5-type에 적용되므로 영향 범위가 훨씬 큼 |
| **대안** | default deny (ALLOWED_TOKENS/CONTRACT_WHITELIST 패턴) |
| **기각 이유** | 하위호환 파괴. 배포 직후 모든 기존 월렛의 트랜잭션이 실패하는 치명적 장애 발생 |

### PLCY-D02: Stage 3 평가 순서 WHITELIST 직후 (Step 4a.5)

| 항목 | 내용 |
|------|------|
| **결정** | ALLOWED_NETWORKS를 WHITELIST(Step 4) 직후, ALLOWED_TOKENS(Step 4b) 직전에 배치 |
| **근거** | 네트워크 미허용 시 세부 정책(토큰/컨트랙트/spender) 평가가 무의미. "이 트랜잭션이 이 네트워크에서 실행되어도 되는가?"는 기본적인 허용 검사이므로 초기에 수행 |
| **대안** | SPENDING_LIMIT 직전에 배치 |
| **기각 이유** | 허용되지 않는 네트워크에서 ALLOWED_TOKENS/CONTRACT_WHITELIST 등을 평가하는 것은 불필요한 연산 + 혼란스러운 에러 메시지 |

### PLCY-D03: resolveOverrides() 4단계는 typeMap[type] 단일 키 유지

| 항목 | 내용 |
|------|------|
| **결정** | 4단계 override에서도 기존 `typeMap[type]` 단일 키를 유지하고, 복합키 `type:network`를 사용하지 않음 |
| **근거** | 단일 키 유지 시 같은 type에서 하나의 정책만 남음 (올바른 동작). 복합키를 사용하면 network=NULL 정책과 network='polygon-amoy' 정책이 모두 남아 2개가 평가됨 -- 이중 SPENDING_LIMIT 평가는 부정확. 낮은 우선순위부터 삽입/높은 우선순위 덮어쓰기 패턴으로 자연스러운 확장 |
| **하위호환 증명** | 섹션 3.5 참조. 기존 network=NULL 정책만 존재하면 Phase 2/4가 no-op이므로 기존 2단계와 100% 동일 |

### PLCY-D04: policies.network을 DB 컬럼으로 (rules JSON 내부가 아닌)

| 항목 | 내용 |
|------|------|
| **결정** | policies 테이블에 `network TEXT` 독립 컬럼으로 추가 (rules JSON 내부에 포함하지 않음) |
| **근거** | SQL 쿼리에서 `WHERE network = ? OR network IS NULL` 조건으로 DB 레벨 필터링 가능. 인덱스(`idx_policies_network`) 활용으로 쿼리 성능 최적화. rules JSON 내부에 포함하면 모든 정책을 로드한 후 애플리케이션 레벨 필터링이 필요 |
| **대안** | `rules.network` JSON 필드 |
| **기각 이유** | SQL 쿼리 최적화 불가, 인덱스 불가, 모든 정책 로드 후 필터링 필요 |

### PLCY-D05: evaluateAndReserve() raw SQL에 network 필터 추가

| 항목 | 내용 |
|------|------|
| **결정** | evaluateAndReserve()의 raw SQL에 `AND (network = ? OR network IS NULL)` 조건을 직접 추가 |
| **근거** | evaluateAndReserve()는 TOCTOU 방지를 위해 raw SQL로 `BEGIN IMMEDIATE` 트랜잭션을 사용. ORM이 아닌 raw SQL이므로 조건을 직접 변경해야 함. Drizzle ORM의 evaluate()와 동일한 네트워크 필터링 결과를 보장 |
| **대안** | evaluateAndReserve() 내부에서 모든 정책을 로드한 후 애플리케이션 레벨 필터링 |
| **기각 이유** | 불필요한 데이터 로드, IMMEDIATE 트랜잭션 안에서 처리 시간 증가 |

---

## 6. policies 테이블 v8 마이그레이션 설계 (PLCY-03)

### 6.1 마이그레이션 전략

| 항목 | 값 |
|------|---|
| version | 8 |
| description | `Add network column to policies and ALLOWED_NETWORKS type support` |
| managesOwnTransaction | `true` (12-step 재생성) |
| 실행 순서 | v6a(6) -> v6b(7) -> **v8(8)** |

**12-step 재생성 선택 근거:**

1. network 컬럼 추가 + type CHECK에 ALLOWED_NETWORKS 추가 + network CHECK 추가를 **원자적으로 처리**
2. SQLite의 `ALTER TABLE ADD COLUMN`은 컬럼 추가는 가능하지만, **기존 CHECK 제약(type IN (...))을 변경할 수 없음**
3. v6b에서 policies 테이블의 type CHECK는 POLICY_TYPES 10개만 포함 -- ALLOWED_NETWORKS가 없음
4. 12-step 재생성으로 (1) network 컬럼 추가 + (2) type CHECK 업데이트 + (3) network CHECK 추가를 한 번에 처리
5. v6b 선례가 있으므로 패턴이 검증됨. policies에 FK dependent 테이블이 없어 v6b보다 단순

**v6b와의 차이:**

| 비교 항목 | v6b (version 7) | v8 (version 8) |
|----------|----------------|----------------|
| 대상 테이블 | wallets + FK dependent 4개 | policies만 |
| 데이터 변환 | CASE WHEN 13분기 (network->environment) | `SELECT *, NULL FROM policies` (network=NULL 삽입) |
| FK dependent | sessions, transactions, policies, audit_log | 없음 (policies는 FK 참조 대상이 아님) |
| 인덱스 | 기존 재생성 + idx_wallets_chain_environment 신규 | 기존 재생성 + idx_policies_network 신규 |
| CHECK 변경 | wallets: chain/environment/default_network | policies: type(ALLOWED_NETWORKS 추가)/network |

### 6.2 12-Step 재생성 상세 SQL

**Step 1: PRAGMA foreign_keys=OFF**

```sql
-- managesOwnTransaction: true이므로 runMigrations()가 자동 설정
PRAGMA foreign_keys = OFF
```

**Step 2: BEGIN TRANSACTION**

```sql
BEGIN
```

**Step 3: CREATE TABLE policies_new**

```sql
CREATE TABLE policies_new (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (${inList(POLICY_TYPES)})),
  rules TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES)})),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
```

- `type CHECK`: POLICY_TYPES에 `ALLOWED_NETWORKS`가 포함되어 있으므로 11개 값 모두 허용
- `network CHECK`: NULL 허용 + NETWORK_TYPES 13개 값만 허용
- 기존 8컬럼 + `network TEXT` = 9컬럼

**Step 4: INSERT INTO policies_new**

```sql
INSERT INTO policies_new (
  id, wallet_id, type, rules, priority, enabled, network, created_at, updated_at
)
SELECT
  id, wallet_id, type, rules, priority, enabled, NULL, created_at, updated_at
FROM policies
```

- 기존 정책의 `network` 값은 모두 `NULL`로 설정 (전체 네트워크 적용)
- 기존 동작 100% 보존

**Step 5: DROP TABLE policies**

```sql
DROP TABLE policies
```

**Step 6: ALTER TABLE policies_new RENAME TO policies**

```sql
ALTER TABLE policies_new RENAME TO policies
```

**Step 7: 기존 인덱스 재생성**

```sql
CREATE INDEX idx_policies_wallet_enabled ON policies(wallet_id, enabled);
CREATE INDEX idx_policies_type ON policies(type);
```

**Step 8: 신규 인덱스 생성**

```sql
CREATE INDEX idx_policies_network ON policies(network);
```

네트워크별 정책 쿼리 최적화를 위한 인덱스이다. `evaluateAndReserve()` raw SQL의 `AND (network = ? OR network IS NULL)` 조건에서 활용된다.

**Step 9: FK dependent 테이블 재생성 없음**

policies 테이블은 FK 참조 대상이 아니다(wallets(id)를 참조하는 쪽). 따라서 FK dependent 테이블 재생성이 불필요하다.

```
wallets <-- policies.wallet_id (REFERENCES wallets(id))
policies <-- (없음 -- 다른 테이블이 policies를 참조하지 않음)
```

**Step 10: PRAGMA foreign_key_check**

```sql
PRAGMA foreign_key_check
```

policies.wallet_id의 FK 무결성을 검증한다.

**Step 11: COMMIT**

```sql
COMMIT
```

**Step 12: PRAGMA foreign_keys=ON**

```sql
-- managesOwnTransaction: true이므로 up() 내부에서 복원
PRAGMA foreign_keys = ON
```

### 6.3 v8 마이그레이션 의사코드

```typescript
// packages/daemon/src/infrastructure/database/migrate.ts

MIGRATIONS.push({
  version: 8,
  description: 'Add network column to policies and ALLOWED_NETWORKS type support',
  managesOwnTransaction: true,
  up: (sqlite) => {
    // Step 2: Begin transaction
    sqlite.exec('BEGIN');

    try {
      // Step 3: Create policies_new with network column + updated CHECK
      sqlite.exec(`CREATE TABLE policies_new (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (${inList(POLICY_TYPES)})),
  rules TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES)})),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

      // Step 4: Copy existing policies with network=NULL
      sqlite.exec(`INSERT INTO policies_new (
  id, wallet_id, type, rules, priority, enabled, network, created_at, updated_at
)
SELECT
  id, wallet_id, type, rules, priority, enabled, NULL, created_at, updated_at
FROM policies`);

      // Step 5: Drop old table
      sqlite.exec('DROP TABLE policies');

      // Step 6: Rename new table
      sqlite.exec('ALTER TABLE policies_new RENAME TO policies');

      // Step 7: Recreate existing indexes
      sqlite.exec('CREATE INDEX idx_policies_wallet_enabled ON policies(wallet_id, enabled)');
      sqlite.exec('CREATE INDEX idx_policies_type ON policies(type)');

      // Step 8: Create new network index
      sqlite.exec('CREATE INDEX idx_policies_network ON policies(network)');

      // Step 11: Commit
      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }

    // Step 12: Re-enable foreign keys and verify integrity
    sqlite.pragma('foreign_keys = ON');
    const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
    if (fkErrors.length > 0) {
      throw new Error(`FK integrity violation after v8: ${JSON.stringify(fkErrors)}`);
    }
  },
});
```

---

## 7. pushSchema DDL + Drizzle 스키마 동기화

### 7.1 pushSchema DDL 업데이트

**policies 테이블 DDL 변경:**

```typescript
// packages/daemon/src/infrastructure/database/migrate.ts
// getCreateTableStatements() 내부

// 현재 (v7):
`CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (${inList(POLICY_TYPES)})),
  rules TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`

// 변경 (v8):
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
```

변경 사항:
- `network TEXT CHECK (...)` 컬럼 추가 (enabled과 created_at 사이)
- `type CHECK`는 `POLICY_TYPES`에 ALLOWED_NETWORKS가 포함되어 자동으로 11개 값 허용

**LATEST_SCHEMA_VERSION 변경:**

```typescript
// 현재:
export const LATEST_SCHEMA_VERSION = 7;  // v6b 완료 후

// 변경:
export const LATEST_SCHEMA_VERSION = 8;  // v8 완료 후
```

**getCreateIndexStatements() 변경:**

```typescript
// 현재:
'CREATE INDEX IF NOT EXISTS idx_policies_wallet_enabled ON policies(wallet_id, enabled)',
'CREATE INDEX IF NOT EXISTS idx_policies_type ON policies(type)',

// 변경 (추가):
'CREATE INDEX IF NOT EXISTS idx_policies_wallet_enabled ON policies(wallet_id, enabled)',
'CREATE INDEX IF NOT EXISTS idx_policies_type ON policies(type)',
'CREATE INDEX IF NOT EXISTS idx_policies_network ON policies(network)',  // NEW
```

### 7.2 Drizzle ORM 스키마 변경

```typescript
// packages/daemon/src/infrastructure/database/schema.ts

export const policies = sqliteTable(
  'policies',
  {
    id: text('id').primaryKey(),
    walletId: text('wallet_id').references(() => wallets.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    rules: text('rules').notNull(),
    priority: integer('priority').notNull().default(0),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    network: text('network'),                          // NEW: nullable (NULL = all networks)
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('idx_policies_wallet_enabled').on(table.walletId, table.enabled),
    index('idx_policies_type').on(table.type),
    index('idx_policies_network').on(table.network),   // NEW: 네트워크별 쿼리 최적화
    check('check_policy_type', buildCheckSql('type', POLICY_TYPES)),  // ALLOWED_NETWORKS 자동 포함
    check(
      'check_policy_network',
      sql.raw(
        `network IS NULL OR network IN (${NETWORK_TYPES.map((v) => `'${v}'`).join(', ')})`,
      ),
    ),  // NEW: nullable CHECK
  ],
);
```

### 7.3 policies CREATE route 변경

```typescript
// packages/daemon/src/api/routes/policies.ts

// 현재:
deps.db.insert(policies).values({
  id,
  walletId: parsed.walletId ?? null,
  type: parsed.type,
  rules: JSON.stringify(parsed.rules),
  priority: parsed.priority,
  enabled: parsed.enabled,
  createdAt: now,
  updatedAt: now,
}).run();

// 변경:
deps.db.insert(policies).values({
  id,
  walletId: parsed.walletId ?? null,
  type: parsed.type,
  rules: JSON.stringify(parsed.rules),
  priority: parsed.priority,
  enabled: parsed.enabled,
  network: parsed.network ?? null,     // NEW: network 필드 추가
  createdAt: now,
  updatedAt: now,
}).run();
```

### 7.4 pushSchema() 동작 확인

`pushSchema()`는 기존 패턴 그대로 동작한다:

1. 새 DB: DDL(v8 최신) 실행 -> version 1~8 기록 -> `runMigrations()` 호출 시 모두 스킵
2. 기존 DB (v7): DDL(IF NOT EXISTS -- 이미 존재) -> `runMigrations()` 호출 -> v8 실행

코드 변경은 `getCreateTableStatements()`, `getCreateIndexStatements()`, `LATEST_SCHEMA_VERSION`만 해당. `pushSchema()` 함수 자체는 변경 불필요.

---

## 8. 통합 검증 + 참조 관계

### 8.1 Phase 105/106/107 설계 통합 다이어그램

```
Phase 105 (환경 데이터 모델)          Phase 106 (파이프라인 리졸브)         Phase 107 (정책 엔진 확장)
  |                                    |                                   |
  docs/68                              docs/70                             docs/71
  ├─ EnvironmentType (2값)             ├─ resolveNetwork() 순수 함수        ├─ ALLOWED_NETWORKS PolicyType
  ├─ ENVIRONMENT_NETWORK_MAP           ├─ PipelineContext.resolvedNetwork   ├─ evaluateAllowedNetworks()
  ├─ getDefaultNetwork()               ├─ ENVIRONMENT_NETWORK_MISMATCH     ├─ resolveOverrides() 4단계
  └─ validateNetworkEnvironment()      └─ Stage 1 INSERT network           ├─ policies.network 컬럼
                                                                           └─ evaluateAndReserve() SQL
  docs/69                                    |
  ├─ v6a (version 6): transactions.network   |
  └─ v6b (version 7): wallets 재생성         |
                                             v
                                       docs/71 v8 (version 8): policies 재생성
```

**참조 체인:**

| 참조 | 방향 | 설명 |
|------|------|------|
| docs/71 -> docs/70 | Stage 3에서 `ctx.resolvedNetwork`를 ALLOWED_NETWORKS 평가에 전달 | `transaction.network = ctx.resolvedNetwork` |
| docs/71 -> docs/69 | v6b(version 7) 이후 v8(version 8) 마이그레이션 순서 | v6b에서 policies 재생성 -> v8에서 policies 재생성 (network 추가) |
| docs/71 -> docs/68 | ENVIRONMENT_NETWORK_MAP으로 네트워크 유효성 검증 | Zod 레벨에서 NetworkTypeEnum으로 검증 |
| docs/70 -> docs/71 | 섹션 7.2 "Phase 107에서 정책 평가 시 resolvedNetwork 직접 참조" 예고 | 이 문서에서 구현 |

### 8.2 마이그레이션 실행 순서

```
v1~v5 (기존)
  |
  v
v6a (version 6) -- transactions.network ADD COLUMN + wallets.network 역참조
  |
  v
v6b (version 7) -- wallets 12-step 재생성 (network -> environment + default_network)
  |                + sessions/transactions/policies/audit_log FK 재연결
  |
  v
v8  (version 8) -- policies 12-step 재생성 (network 컬럼 추가 + type CHECK 업데이트)
```

**의존성 관계:**

- v6a는 v6b보다 먼저 실행 (wallets.network 역참조가 v6b에서 삭제되기 전 수행)
- v6b는 v8보다 먼저 실행 (v6b에서 policies를 FK 재연결한 후 v8에서 재생성)
- v8은 v6b의 policies 스키마(8컬럼)를 기반으로 9컬럼으로 확장

### 8.3 테스트 전략

**1. ALLOWED_NETWORKS 평가 테스트:**

| # | 테스트 케이스 | 기대 결과 |
|---|-------------|---------|
| 1 | ALLOWED_NETWORKS 정책 미설정 + 임의 네트워크 | `null` (permissive default, 통과) |
| 2 | ALLOWED_NETWORKS 설정 + resolvedNetwork가 목록에 있음 | `null` (통과) |
| 3 | ALLOWED_NETWORKS 설정 + resolvedNetwork가 목록에 없음 | `{ allowed: false, tier: 'INSTANT', reason: '...' }` |
| 4 | ALLOWED_NETWORKS + case-insensitive 비교 | 대소문자 무관 매칭 |
| 5 | ALLOWED_NETWORKS + 모든 5-type에서 평가 | TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH 모두 평가 |

**2. resolveOverrides 4단계 테스트:**

| # | 테스트 케이스 | 기대 결과 |
|---|-------------|---------|
| 1 | 기존 정책만 (모든 network=NULL) | 기존 2단계와 동일한 결과 (하위호환) |
| 2 | wallet+network > wallet+null override | 1순위 정책 적용 |
| 3 | global+network > global+null override | 3순위 정책 적용 |
| 4 | wallet+null > global+network override | 2순위가 3순위보다 높음 |
| 5 | 4단계 모두 존재할 때 1순위 선택 | wallet+network 정책 적용 |
| 6 | 1순위 없을 때 2순위 fallback | wallet+null 정책 적용 |

**3. v8 마이그레이션 테스트:**

| # | 테스트 케이스 | 기대 결과 |
|---|-------------|---------|
| 1 | 빈 policies 테이블에서 v8 마이그레이션 | policies_new 생성 + 빈 테이블 + CHECK 제약 존재 |
| 2 | 기존 정책 데이터 보존 | 기존 정책의 network=NULL, 나머지 필드 동일 |
| 3 | type CHECK에 ALLOWED_NETWORKS 포함 | `INSERT type='ALLOWED_NETWORKS'` 성공 |
| 4 | network CHECK 검증 | 유효한 네트워크 INSERT 성공, 잘못된 값 INSERT 실패 |
| 5 | FK 무결성 | PRAGMA foreign_key_check = empty |
| 6 | idx_policies_network 인덱스 존재 | sqlite_master에서 확인 |

**4. 하위호환 테스트:**

| # | 테스트 케이스 | 기대 결과 |
|---|-------------|---------|
| 1 | 기존 policy-engine 테스트 25개 | v8 마이그레이션 + 코드 변경 후 모두 통과 |
| 2 | evaluateAndReserve()에 network 미전달 | 기존과 동일한 결과 (network=null이면 모든 정책 로드) |
| 3 | evaluateBatch()에 network 미전달 | 기존과 동일한 결과 |

### 8.4 Phase 108 인터페이스로의 이행 포인트

Phase 107에서 설계한 내부 구조를 외부 인터페이스로 노출하는 Phase 108 변경 사항:

| 인터페이스 | 변경 내용 | 참조 |
|----------|---------|------|
| REST API: `POST /v1/policies` | request body에 `network?: NetworkType` 필드 추가 | CreatePolicyRequestSchema.network |
| REST API: `GET /v1/policies` | response에 `network` 필드 포함 | PolicySchema.network |
| REST API: `PUT /v1/policies/:id` | UpdatePolicyRequestSchema에 `network` 필드 추가 | UpdatePolicyRequestSchema.network |
| MCP: `create_policy` 도구 | `network` 파라미터 추가 | CreatePolicyRequestSchema 재활용 |
| MCP: `list_policies` 도구 | response에 `network` 필드 포함 | PolicySchema 재활용 |
| SDK: `sdk.createPolicy()` | `network` 옵션 추가 | TypeScript SDK 메서드 시그니처 |
| Admin UI: 정책 생성 폼 | 네트워크 선택 드롭다운 추가 | Preact 컴포넌트 |
| Skill files | `policies.skill.md` 네트워크 스코프 정책 설명 추가 | skills/ 동기화 |
