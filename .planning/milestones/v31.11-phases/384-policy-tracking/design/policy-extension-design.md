# off-chain Action 정책 확장 설계

> Phase 384, Plan 01 -- VENUE_WHITELIST + ACTION_CATEGORY_LIMIT + TransactionParam 확장 + ActionDefinition riskLevel

---

## 1. TransactionParam 확장 설계 (PLCY-01)

### 1.1 기존 TransactionParam 인터페이스

현재 `DatabasePolicyEngine`의 `TransactionParam`은 on-chain 트랜잭션 전용 필드만 보유한다:

```typescript
interface TransactionParam {
  type: string;
  amount: string;
  toAddress: string;
  chain: string;
  network?: string;
  tokenAddress?: string;
  assetId?: string;
  contractAddress?: string;
  selector?: string;
  spenderAddress?: string;
  approveAmount?: string;
  tokenDecimals?: number;
  actionProvider?: string;
  actionName?: string;
  perpLeverage?: number;
  perpSizeUsd?: number;
}
```

### 1.2 off-chain action 전용 확장 필드

Phase 380에서 설계한 `SignedDataActionPolicyContextSchema`의 필드를 `TransactionParam`으로 승격한다:

```typescript
interface TransactionParam {
  // -- 기존 필드 전부 유지 (생략) --

  // -- off-chain action 전용 확장 (Phase 384) --
  venue?: string;
  // 외부 서비스 식별자 (예: 'binance', 'cow-protocol', 'polymarket')
  // signedData/signedHttp에서 action.venue로 전달
  // contractCall에서는 undefined (VENUE_WHITELIST 평가 건너뜀)

  actionCategory?: 'trade' | 'withdraw' | 'transfer' | 'sign' | 'deposit';
  // off-chain action 카테고리. ACTION_CATEGORY_LIMIT 평가에 사용
  // 5종 카테고리:
  //   trade    -- 주문/체결 (CEX/DEX off-chain order)
  //   withdraw -- 자금 인출 (CEX withdrawal 등)
  //   transfer -- 내부 이체 (sub-account transfer 등)
  //   sign     -- 범용 서명 (인증 서명, 메시지 서명 등)
  //   deposit  -- 자금 입금 (vault deposit 등)

  notionalUsd?: number;
  // 추정 USD 가치. ACTION_CATEGORY_LIMIT 누적 한도 평가용
  // ActionProvider가 policyContext.notionalUsd에 설정
  // 0 이상의 값 (음수 불가)

  leverage?: number;
  // 레버리지 배율. off-chain perp 전용
  // 양수만 허용 (1 = 무레버리지)

  expiry?: string;
  // 주문 만료 시각 (ISO 8601). 정보성 필드 (정책 평가에 직접 사용하지 않음)

  hasWithdrawCapability?: boolean;
  // venue에서 자금 인출 가능 여부. riskLevel 산출에 활용
  // true면 위험도 상승 (자금 유출 가능)
}
```

### 1.3 Zod 스키마 초안

```typescript
import { z } from 'zod';

export const ActionCategoryEnum = z.enum([
  'trade', 'withdraw', 'transfer', 'sign', 'deposit',
]);
export type ActionCategory = z.infer<typeof ActionCategoryEnum>;

export const TransactionParamSchema = z.object({
  // -- 기존 필드 --
  type: z.string(),
  amount: z.string(),
  toAddress: z.string(),
  chain: z.string(),
  network: z.string().optional(),
  tokenAddress: z.string().optional(),
  assetId: z.string().optional(),
  contractAddress: z.string().optional(),
  selector: z.string().optional(),
  spenderAddress: z.string().optional(),
  approveAmount: z.string().optional(),
  tokenDecimals: z.number().optional(),
  actionProvider: z.string().optional(),
  actionName: z.string().optional(),
  perpLeverage: z.number().optional(),
  perpSizeUsd: z.number().optional(),

  // -- off-chain 확장 (Phase 384) --
  venue: z.string().optional(),
  actionCategory: ActionCategoryEnum.optional(),
  notionalUsd: z.number().nonnegative().optional(),
  leverage: z.number().positive().optional(),
  expiry: z.string().datetime().optional(),
  hasWithdrawCapability: z.boolean().optional(),
});
```

### 1.4 toPolicyParam() 변환 흐름

Phase 383에서 설계한 `toPolicyParam()` 함수가 확장 필드를 사용하는 경로:

```typescript
function toPolicyParam(
  action: SignedDataAction | SignedHttpAction,
  context: ActionContext,
): TransactionParam {
  const pc = action.policyContext;

  return {
    // 기존 필드 (off-chain은 최소값 설정)
    type: 'CONTRACT_CALL',       // 기존 type 체계 유지 (호환)
    amount: '0',                 // off-chain은 on-chain 금액 0
    toAddress: action.venue,     // venue를 toAddress에 매핑 (검색 호환)
    chain: context.chain,
    actionProvider: action.actionProvider,
    actionName: action.actionName,

    // off-chain 확장 필드 (Phase 384)
    venue: action.venue,
    actionCategory: pc?.actionCategory,
    notionalUsd: pc?.notionalUsd,
    leverage: pc?.leverage,
    expiry: pc?.expiry,
    hasWithdrawCapability: pc?.hasWithdrawCapability,
  };
}
```

### 1.5 기존 perpLeverage/perpSizeUsd와의 관계

| 필드 | 용도 | 사용 경로 |
|------|------|----------|
| `perpLeverage` | on-chain perp 레버리지 (Drift 등) | PERP_MAX_LEVERAGE 정책 |
| `perpSizeUsd` | on-chain perp 포지션 크기 | PERP_MAX_POSITION_USD 정책 |
| `leverage` | off-chain perp 레버리지 (Hyperliquid CEX 등) | ActionDefinition riskLevel 산출 |
| `notionalUsd` | off-chain 추정 가치 | ACTION_CATEGORY_LIMIT 누적 한도 |

**통합 방향**: on-chain perp는 기존 `perpLeverage`/`perpSizeUsd` 유지 (하위 호환). off-chain perp는 `leverage`/`notionalUsd` 사용. 향후 통합은 별도 마일스톤에서 검토.

---

## 2. VENUE_WHITELIST 정책 설계 (PLCY-02)

### 2.1 개요

기존 `CONTRACT_WHITELIST` 패턴을 그대로 활용하는 default-deny 화이트리스트 정책. off-chain 액션의 venue(외부 서비스)를 제어한다.

### 2.2 DB policies 테이블 확장

`policy_type` 컬럼에 `'VENUE_WHITELIST'` 값을 추가한다.

```sql
-- 기존 CHECK 제약 확장 (구현 시 ALTER TABLE)
-- policy_type IN (...기존 값..., 'VENUE_WHITELIST', 'ACTION_CATEGORY_LIMIT')
```

### 2.3 VenueWhitelistRules 인터페이스

CONTRACT_WHITELIST의 `contracts` 패턴과 동일한 구조:

```typescript
interface VenueWhitelistRules {
  venues: Array<{
    id: string;       // venue 식별자 (예: 'binance', 'cow-protocol')
    name?: string;    // 표시명 (UI용, 선택적)
  }>;
}
```

**CONTRACT_WHITELIST 패턴과의 대응:**

| CONTRACT_WHITELIST | VENUE_WHITELIST | 비고 |
|--------------------|-----------------|------|
| `contracts[].address` | `venues[].id` | 식별자 |
| `contracts[].name` | `venues[].name` | 표시명 |
| address toLowerCase 정규화 | id toLowerCase 정규화 | 대소문자 무관 |
| network scoping | network 무시 | venue는 네트워크 독립적 |

### 2.4 Zod 스키마 초안

```typescript
export const VenueWhitelistRulesSchema = z.object({
  venues: z.array(z.object({
    id: z.string().min(1).transform(v => v.toLowerCase()),
    name: z.string().optional(),
  })).min(1),  // 빈 배열 금지 (최소 1개 venue)
});
export type VenueWhitelistRules = z.infer<typeof VenueWhitelistRulesSchema>;
```

### 2.5 정책 평가 알고리즘

기존 `DatabasePolicyEngine.evaluate()` 체인에 **4j 단계**로 추가 (4i-c PERP_MAX_POSITION_USD 다음):

```
기존 평가 체인:
  4a. ALLOWED_TOKENS
  4b. ALLOWED_RECIPIENTS
  4c. CONTRACT_WHITELIST
  4d. APPROVED_SPENDERS
  4e. SPENDING_LIMIT
  4f. TOKEN_SPENDING_LIMIT
  4g. DAILY_SPENDING_LIMIT (누적)
  4h. MONTHLY_SPENDING_LIMIT (누적)
  4i-a. PERP_MAX_LEVERAGE
  4i-b. PERP_MAX_NOTIONAL_USD
  4i-c. PERP_MAX_POSITION_USD
  4j. VENUE_WHITELIST          <-- 신규
  4k. ACTION_CATEGORY_LIMIT    <-- 신규 (섹션 3)
```

평가 의사 코드:

```typescript
// 4j. VENUE_WHITELIST 평가
function evaluateVenueWhitelist(
  param: TransactionParam,
  rules: VenueWhitelistRules,
): PolicyDecision {
  // contractCall은 venue가 없으므로 항상 통과
  if (!param.venue) {
    return { decision: 'ALLOW' };
  }

  const normalizedVenue = param.venue.toLowerCase();
  const allowed = rules.venues.some(
    v => v.id.toLowerCase() === normalizedVenue
  );

  if (!allowed) {
    return {
      decision: 'DENY',
      reason: `Venue '${param.venue}' is not in the whitelist`,
      policy: 'VENUE_WHITELIST',
    };
  }

  return { decision: 'ALLOW' };
}
```

### 2.6 default-deny 동작

| 상황 | 결과 |
|------|------|
| VENUE_WHITELIST 정책 미등록 + venue 있음 | DENY (default-deny) |
| VENUE_WHITELIST 정책 등록 + venue 허용 | ALLOW |
| VENUE_WHITELIST 정책 등록 + venue 미허용 | DENY |
| VENUE_WHITELIST 정책 등록/미등록 + venue 없음 (contractCall) | ALLOW (건너뜀) |
| `policy.venue_whitelist_enabled = false` | ALLOW (정책 비활성) |

**중요**: `policy.venue_whitelist_enabled` Admin Settings 키로 전체 정책을 비활성화할 수 있다. 비활성 시 VENUE_WHITELIST가 등록되어 있어도 평가를 건너뛴다. 기본값은 `false` (off-chain action 도입 초기에는 유연하게 시작).

### 2.7 network scoping

VENUE_WHITELIST는 `network` 필드를 무시한다. 이유:

- venue는 네트워크에 독립적인 외부 서비스 식별자 (예: Binance는 모든 네트워크에서 동일)
- CONTRACT_WHITELIST는 네트워크별 컨트랙트 주소가 다르므로 network scoping이 필요하지만, venue는 네트워크 무관

### 2.8 Admin UI 정책 등록 UX

기존 CONTRACT_WHITELIST 폼 패턴을 재사용한다:

```
[VENUE_WHITELIST 정책 등록 폼]
+----------------------------------------------+
| Venue Whitelist                               |
+----------------------------------------------+
| Allowed Venues:                               |
|   [binance        ] [Binance Exchange  ] [-]  |
|   [cow-protocol   ] [CoW Protocol      ] [-]  |
|   [polymarket     ] [Polymarket        ] [-]  |
|   [+] Add Venue                               |
+----------------------------------------------+
| [ ] Enabled (policy.venue_whitelist_enabled)  |
+----------------------------------------------+
| [Save]  [Cancel]                              |
+----------------------------------------------+
```

- `id` 필드: 소문자 영숫자 + 하이픈 (slug 형식)
- `name` 필드: 자유 텍스트 (표시용)
- 최소 1개 venue 필수 (빈 목록으로 저장 시 모든 venue 거부)

### 2.9 Admin Settings 키

| 키 | 타입 | 기본값 | 설명 |
|----|------|--------|------|
| `policy.venue_whitelist_enabled` | boolean | `false` | VENUE_WHITELIST 정책 활성화 여부 |

비활성 시 venue 검사를 건너뛴다. off-chain action을 처음 도입하는 사용자가 VENUE_WHITELIST 설정 없이도 기능을 사용할 수 있도록 기본 비활성.

---

## 3. ACTION_CATEGORY_LIMIT 정책 설계 (PLCY-03)

### 3.1 개요

기존 `SPENDING_LIMIT`의 카테고리별 확장. off-chain 액션의 actionCategory별 USD 누적 한도를 제어한다.

### 3.2 ActionCategoryLimitRules 인터페이스

```typescript
interface ActionCategoryLimitRules {
  category: 'trade' | 'withdraw' | 'transfer' | 'sign' | 'deposit';
  // 대상 카테고리

  daily_limit_usd?: number;
  // 24시간 누적 USD 한도. 초과 시 tier_on_exceed 적용

  monthly_limit_usd?: number;
  // 30일 누적 USD 한도. 초과 시 tier_on_exceed 적용

  per_action_limit_usd?: number;
  // 단건 USD 한도. 초과 시 tier_on_exceed 적용

  tier_on_exceed: PolicyTier;
  // 한도 초과 시 적용할 tier: 'DELAY' | 'APPROVAL'
  // DENY는 별도 설정하지 않음 (APPROVAL = 사실상 Owner 결정)
}
```

### 3.3 Zod 스키마 초안

```typescript
export const PolicyTierEnum = z.enum(['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL']);

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
export type ActionCategoryLimitRules = z.infer<typeof ActionCategoryLimitRulesSchema>;
```

### 3.4 DB policies 테이블 등록

```
policy_type: 'ACTION_CATEGORY_LIMIT'
rules: JSON (ActionCategoryLimitRules)
```

동일 카테고리에 대해 여러 정책을 등록할 수 있다 (wallet-level + global-level). 기존 4-level priority override 패턴 적용:

1. wallet-specific ACTION_CATEGORY_LIMIT
2. global ACTION_CATEGORY_LIMIT
3. 정책 미등록 시 제한 없음 (default-allow)

**SPENDING_LIMIT과의 독립성:**
- `SPENDING_LIMIT`: on-chain 트랜잭션의 amount 기반 한도. `actionCategory`가 없는 트랜잭션에 적용
- `ACTION_CATEGORY_LIMIT`: off-chain 액션의 notionalUsd 기반 한도. `actionCategory`가 있는 액션에만 적용
- 중복 평가 없음: contractCall은 actionCategory가 null이므로 ACTION_CATEGORY_LIMIT 건너뜀

### 3.5 정책 평가 알고리즘

평가 체인 **4k 단계** (VENUE_WHITELIST 4j 다음):

```typescript
// 4k. ACTION_CATEGORY_LIMIT 평가
async function evaluateActionCategoryLimit(
  param: TransactionParam,
  rules: ActionCategoryLimitRules,
  walletId: string,
  db: Database,
): Promise<PolicyDecision> {
  // contractCall은 actionCategory가 없으므로 건너뜀
  if (!param.actionCategory) {
    return { decision: 'ALLOW' };
  }

  // 카테고리 불일치면 건너뜀
  if (param.actionCategory !== rules.category) {
    return { decision: 'ALLOW' };
  }

  // 1. 단건 한도 체크
  if (rules.per_action_limit_usd != null && param.notionalUsd != null) {
    if (param.notionalUsd > rules.per_action_limit_usd) {
      return {
        decision: rules.tier_on_exceed,
        reason: `Per-action limit exceeded: ${param.notionalUsd} USD > ${rules.per_action_limit_usd} USD`,
        policy: 'ACTION_CATEGORY_LIMIT',
      };
    }
  }

  // 2. 24시간 누적 한도 체크
  if (rules.daily_limit_usd != null) {
    const dailyTotal = await queryAccumulatedNotionalUsd(
      db, walletId, rules.category, 24 * 60 * 60,  // 24시간
    );
    const projected = dailyTotal + (param.notionalUsd ?? 0);
    if (projected > rules.daily_limit_usd) {
      return {
        decision: rules.tier_on_exceed,
        reason: `Daily category limit exceeded: ${projected} USD > ${rules.daily_limit_usd} USD`,
        policy: 'ACTION_CATEGORY_LIMIT',
      };
    }
  }

  // 3. 30일 누적 한도 체크
  if (rules.monthly_limit_usd != null) {
    const monthlyTotal = await queryAccumulatedNotionalUsd(
      db, walletId, rules.category, 30 * 24 * 60 * 60,  // 30일
    );
    const projected = monthlyTotal + (param.notionalUsd ?? 0);
    if (projected > rules.monthly_limit_usd) {
      return {
        decision: rules.tier_on_exceed,
        reason: `Monthly category limit exceeded: ${projected} USD > ${rules.monthly_limit_usd} USD`,
        policy: 'ACTION_CATEGORY_LIMIT',
      };
    }
  }

  return { decision: 'ALLOW' };
}
```

### 3.6 누적 합산 쿼리 설계

```sql
-- 카테고리별 누적 notionalUsd 쿼리
SELECT COALESCE(SUM(
  CAST(json_extract(metadata, '$.notionalUsd') AS REAL)
), 0) AS total_notional_usd
FROM transactions
WHERE wallet_id = :walletId
  AND action_kind IN ('signedData', 'signedHttp')
  AND venue IS NOT NULL
  AND json_extract(metadata, '$.actionCategory') = :category
  AND created_at >= :windowStart
  AND status != 'FAILED';
```

**notionalUsd 저장 위치 결정**: metadata JSON 내에 `notionalUsd` 필드로 저장한다.

근거:
- 스키마 변경 최소화 (별도 컬럼 추가 불필요)
- SQLite `json_extract()`로 효율적 조회 가능
- 기존 metadata 패턴과 일관성 유지 (bridge_metadata 등)
- 대량 조회 시 성능이 문제되면 향후 컬럼 승격 가능

**metadata 구조 확장:**

```typescript
// recordOffchainAction() 시 metadata에 저장
metadata: JSON.stringify({
  signature: signingResult.signature,
  signingScheme: action.signingScheme,
  notionalUsd: action.policyContext?.notionalUsd,     // 누적 한도 계산용
  actionCategory: action.policyContext?.actionCategory, // 카테고리 필터용
  leverage: action.policyContext?.leverage,
  ...(signingResult.metadata ?? {}),
}),
```

### 3.7 TOCTOU 방지: evaluateAndReserve() 패턴 재사용

기존 SPENDING_LIMIT의 BEGIN IMMEDIATE 패턴을 재사용한다:

```typescript
// DatabasePolicyEngine.evaluateAndReserve() 확장
async evaluateAndReserve(param: TransactionParam): Promise<PolicyResult> {
  return this.db.transaction(async (tx) => {
    // BEGIN IMMEDIATE (SQLite 단일 writer)

    // ... 기존 정책 평가 ...

    // 4j. VENUE_WHITELIST
    // 4k. ACTION_CATEGORY_LIMIT (누적 쿼리 + 예약)

    // ACTION_CATEGORY_LIMIT 누적 예약:
    // 현재 트랜잭션의 notionalUsd를 reserved_amounts에 기록
    // commit 전에 다른 트랜잭션이 동일 기간의 누적을 조회하면
    // IMMEDIATE 잠금으로 대기 -> TOCTOU 방지
  });
}
```

### 3.8 contractCall과의 분리

| 상황 | SPENDING_LIMIT | ACTION_CATEGORY_LIMIT |
|------|-----------------|----------------------|
| contractCall (on-chain) | 적용 (amount 기반) | 건너뜀 (actionCategory 없음) |
| signedData (off-chain) | 건너뜀 (amount='0') | 적용 (notionalUsd 기반) |
| signedHttp (off-chain) | 건너뜀 (amount='0') | 적용 (notionalUsd 기반) |

**양쪽 모두 해당하는 케이스 없음**: on-chain은 amount 기반, off-chain은 notionalUsd 기반. 이중 차감 위험 없음.

---

## 4. ActionDefinition riskLevel 확장 설계 (PLCY-04)

### 4.1 기존 ActionDefinition 인터페이스

```typescript
interface ActionDefinition {
  name: string;           // 액션 이름
  description: string;    // 설명
  params: ZodSchema;      // 입력 파라미터 스키마
  chains?: string[];      // 지원 체인
}
```

### 4.2 off-chain 위험도 필드 추가

```typescript
interface ActionDefinition {
  // -- 기존 필드 유지 --
  name: string;
  description: string;
  params: ZodSchema;
  chains?: string[];

  // -- off-chain 위험도 확장 (Phase 384) --
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  // 위험도 등급. 정책 미설정 시 defaultTier 자동 매핑에 사용
  // ActionProvider 개발자가 설정

  defaultTier?: PolicyTier;
  // 정책 미설정 시 기본 적용 tier
  // riskLevel이 있고 defaultTier가 없으면 자동 매핑 적용
  // 둘 다 없으면 INSTANT (기존 동작)

  requiresVenueWhitelist?: boolean;
  // true면 VENUE_WHITELIST 정책이 반드시 등록되어야 실행 가능
  // 미등록 시 DENY (venue_whitelist_enabled 무시)
  // 기본값: false

  requiresOwnerApproval?: boolean;
  // true면 항상 Owner 승인 필요 (APPROVAL tier 강제)
  // 기본값: false
}
```

### 4.3 Zod 스키마 초안

```typescript
export const RiskLevelEnum = z.enum(['low', 'medium', 'high', 'critical']);
export type RiskLevel = z.infer<typeof RiskLevelEnum>;

export const ActionDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  params: z.unknown(),  // ZodSchema (런타임)
  chains: z.array(z.string()).optional(),

  // off-chain 위험도 (Phase 384)
  riskLevel: RiskLevelEnum.optional(),
  defaultTier: PolicyTierEnum.optional(),
  requiresVenueWhitelist: z.boolean().optional(),
  requiresOwnerApproval: z.boolean().optional(),
});
```

### 4.4 riskLevel -> defaultTier 자동 매핑 규칙

| riskLevel | defaultTier | 근거 |
|-----------|-------------|------|
| `low` | `INSTANT` | 서명만, 자금 이동 위험 없음 (예: 인증 서명) |
| `medium` | `NOTIFY` | 제한된 자금 관여 (예: 소액 trade) |
| `high` | `DELAY` | 대규모 자금 관여 (예: leverage trade, large withdrawal) |
| `critical` | `APPROVAL` | 자금 인출, 계정 설정 변경 등 (예: CEX withdrawal) |

```typescript
function resolveDefaultTier(def: ActionDefinition): PolicyTier {
  // 명시적 defaultTier가 있으면 우선
  if (def.defaultTier) return def.defaultTier;

  // riskLevel 기반 자동 매핑
  if (def.riskLevel) {
    const mapping: Record<RiskLevel, PolicyTier> = {
      low: 'INSTANT',
      medium: 'NOTIFY',
      high: 'DELAY',
      critical: 'APPROVAL',
    };
    return mapping[def.riskLevel];
  }

  // 둘 다 없으면 INSTANT (기존 동작 유지)
  return 'INSTANT';
}
```

### 4.5 정책 미설정 시 defaultTier 적용 경로

기존 정책 평가 체인에서 "해당 정책 없음" 결과 시 ActionDefinition의 defaultTier로 대체:

```typescript
// DatabasePolicyEngine.evaluate() 확장
async evaluate(param: TransactionParam): Promise<PolicyResult> {
  const result = await this.evaluateChain(param);

  // 정책이 모두 ALLOW이고, actionDefinition이 있으면
  if (result.decision === 'ALLOW' && param.actionDefinition) {
    const tier = resolveDefaultTier(param.actionDefinition);
    if (tier !== 'INSTANT') {
      return {
        decision: tier,
        reason: `Default tier from ActionDefinition riskLevel: ${param.actionDefinition.riskLevel}`,
        policy: 'ACTION_DEFINITION_DEFAULT',
      };
    }
  }

  // requiresOwnerApproval 강제
  if (param.actionDefinition?.requiresOwnerApproval) {
    return {
      decision: 'APPROVAL',
      reason: 'Action requires owner approval (ActionDefinition.requiresOwnerApproval)',
      policy: 'ACTION_DEFINITION_REQUIRED',
    };
  }

  // requiresVenueWhitelist 강제
  if (param.actionDefinition?.requiresVenueWhitelist && !this.hasVenueWhitelistPolicy(param.walletId)) {
    return {
      decision: 'DENY',
      reason: 'Action requires VENUE_WHITELIST policy to be configured',
      policy: 'ACTION_DEFINITION_REQUIRED',
    };
  }

  return result;
}
```

### 4.6 ActionProvider.getActions() 반환 시 riskLevel 포함

```typescript
// 예시: HyperliquidPerpProvider
getActions(): ActionDefinition[] {
  return [
    {
      name: 'place-order',
      description: 'Place a perpetual futures order',
      params: PlaceOrderParamsSchema,
      riskLevel: 'high',          // 레버리지 거래
      defaultTier: 'DELAY',
      requiresVenueWhitelist: true,
    },
    {
      name: 'cancel-order',
      description: 'Cancel an existing order',
      params: CancelOrderParamsSchema,
      riskLevel: 'low',           // 자금 위험 없음
    },
    {
      name: 'withdraw',
      description: 'Withdraw funds from Hyperliquid',
      params: WithdrawParamsSchema,
      riskLevel: 'critical',      // 자금 인출
      requiresOwnerApproval: true,
      requiresVenueWhitelist: true,
    },
  ];
}
```

### 4.7 riskLevel 카테고리별 기준

| 카테고리 | low | medium | high | critical |
|----------|-----|--------|------|----------|
| trade | cancel, query | spot order | leverage order | - |
| withdraw | - | internal transfer | small withdrawal | large withdrawal |
| transfer | query balance | small transfer | - | large transfer |
| sign | auth signature | message sign | - | account binding |
| deposit | - | small deposit | large deposit | vault lock |

---

## 5. 설계 결정 요약 테이블

| # | 결정 | 근거 |
|---|------|------|
| D1 | venue/actionCategory를 TransactionParam에 직접 추가 (별도 인터페이스 아님) | 기존 DatabasePolicyEngine.evaluate() 시그니처 무변경. 필드 추가만으로 확장 |
| D2 | VENUE_WHITELIST는 default-deny + Admin Settings 비활성화 가능 | off-chain action 도입 초기 유연성 보장. 이후 보안 강화 시 활성화 |
| D3 | venue id는 toLowerCase 정규화 | CONTRACT_WHITELIST의 address toLowerCase 패턴 동일. 대소문자 혼란 방지 |
| D4 | VENUE_WHITELIST는 network 무시 | venue는 네트워크 독립적 서비스 식별자. CONTRACT_WHITELIST와 다른 점 |
| D5 | ACTION_CATEGORY_LIMIT와 SPENDING_LIMIT 독립 | on-chain(amount) vs off-chain(notionalUsd) 분리. 이중 차감 없음 |
| D6 | notionalUsd를 metadata JSON에 저장 | 스키마 변경 최소화. SQLite json_extract()로 효율적 조회. 향후 컬럼 승격 가능 |
| D7 | TOCTOU 방지에 기존 BEGIN IMMEDIATE 패턴 재사용 | SQLite 단일 writer 보장. 누적 한도 검사와 기록을 동일 트랜잭션 내 수행 |
| D8 | riskLevel -> defaultTier 자동 매핑 (4단계) | 정책 미설정 시에도 ActionProvider 개발자 의도 반영. INSTANT가 기본값이므로 기존 동작 무변경 |
| D9 | requiresVenueWhitelist는 venue_whitelist_enabled 무시 | ActionProvider가 "이 액션은 반드시 venue 검증 필요"로 표시하면 Admin Settings와 무관하게 강제 |
| D10 | per_action_limit_usd를 단건 한도로 분리 | 누적 한도와 별개로 단건 대량 거래 방지. SPENDING_LIMIT의 instant_max와 유사한 역할 |

---

## 6. Pitfall 방지 체크리스트

- [ ] **contractCall에서 VENUE_WHITELIST/ACTION_CATEGORY_LIMIT 건너뜀 보장**: `venue == null` 또는 `actionCategory == null`이면 해당 정책 평가를 건너뛴다. null 체크를 빠뜨리면 기존 on-chain 트랜잭션이 거부될 수 있음
- [ ] **notionalUsd가 없는 off-chain action**: policyContext.notionalUsd가 undefined면 ACTION_CATEGORY_LIMIT 누적 계산에서 0으로 처리. 한도 체크는 수행하되 누적에 0을 더함. 단건 한도(per_action_limit_usd)는 notionalUsd 없으면 건너뜀
- [ ] **VENUE_WHITELIST 빈 venues 배열 금지**: Zod `.min(1)`으로 강제. 빈 배열이면 모든 venue 거부인데, 의도치 않은 전체 차단 방지
- [ ] **ACTION_CATEGORY_LIMIT refine 검증**: daily/monthly/per_action 중 최소 1개 한도 필수. 모두 undefined면 의미 없는 정책
- [ ] **metadata JSON 파싱 실패 시 graceful 처리**: `json_extract(metadata, '$.notionalUsd')`가 NULL이면 0으로 처리. 기존 레코드에는 notionalUsd가 없으므로 NULL 반환
- [ ] **leverage 필드와 perpLeverage 혼동 방지**: off-chain은 `leverage`, on-chain은 `perpLeverage`. 정책 평가에서 각각 다른 정책 타입으로 분기하므로 혼선 없어야 함
- [ ] **riskLevel 없는 ActionDefinition**: 기존 모든 ActionDefinition은 riskLevel이 없다. `resolveDefaultTier()`는 INSTANT 반환 (기존 동작 무변경)
- [ ] **requiresOwnerApproval이 다른 정책 결과를 덮어쓰지 않음**: requiresOwnerApproval=true면 APPROVAL을 반환하되, 이미 DENY인 결과는 DENY 유지 (DENY > APPROVAL)
- [ ] **VENUE_WHITELIST enabled 상태에서 정책 미등록**: enabled=true인데 VENUE_WHITELIST 정책이 없으면 default-deny가 적용되어 모든 off-chain action 차단. Admin UI에서 경고 표시 권장

---

*Phase: 384-policy-tracking, Plan: 01*
*작성일: 2026-03-12*
