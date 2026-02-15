# Phase 127: USD Policy Integration - Research

**Researched:** 2026-02-15
**Domain:** USD 가격 환산 기반 정책 평가 (resolveEffectiveAmountUsd + SpendingLimitRuleSchema USD 확장 + PriceResult 3-state + graceful fallback)
**Confidence:** HIGH

## Summary

Phase 127은 Phase 125-126에서 구축한 IPriceOracle/OracleChain 인프라를 실제 트랜잭션 파이프라인의 Stage 3 정책 평가에 통합하는 핵심 단계이다. 현재 DatabasePolicyEngine의 SPENDING_LIMIT 평가는 네이티브 금액(lamports/wei)만 사용하며, USD 기준 임계값이 없다. SpendingLimitRules는 TypeScript interface로만 존재하고 Zod 검증이 없는 상태이다. 또한 OracleChain이 daemon index.ts에 아직 wired되지 않아 PipelineContext에 priceOracle 의존성이 없다.

이 페이즈의 핵심 도전은 다음과 같다. (1) evaluateAndReserve()가 better-sqlite3 동기 트랜잭션(.transaction().immediate()) 내에서 실행되므로, Oracle HTTP 호출(비동기)은 이 트랜잭션 진입 전에 완료해야 한다. (2) PriceResult를 success/oracleDown/notListed 3-state discriminated union으로 설계하여 "가격 불명 != 가격 0" 보안 원칙을 구현해야 한다. (3) 가격 불명 토큰(notListed)은 최소 NOTIFY로 격상하되, CoinGecko 키 미설정 시 최초 1회만 힌트를 포함해야 한다.

설계 문서 61 섹션 6.2-6.6에서 resolveEffectiveAmountUsd()와 evaluateSpendingLimitUsd()의 상세 의사코드가 이미 제공되어 있으며, Phase 125-126의 IPriceOracle/OracleChain/InMemoryPriceCache 인프라가 완비되어 있으므로 구현 방향이 명확하다.

**Primary recommendation:** resolveEffectiveAmountUsd()를 Stage 3 policy 평가 직전(evaluateAndReserve 진입 전)에 호출하여 PriceResult를 얻고, 그 결과에 따라 evaluateAndReserve/evaluateSpendingLimit에 USD 금액을 전달하는 패턴을 사용하라. PriceResult 3-state union과 SpendingLimitRuleSchema Zod SSoT는 core 패키지에, resolveEffectiveAmountUsd()는 daemon pipeline 디렉토리에 배치한다.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.x (기존) | SpendingLimitRuleSchema Zod SSoT 정의, PriceResult 타입 | 프로젝트 Zod SSoT 원칙 |
| OracleChain | Phase 126 산출물 | IPriceOracle 구현체 (Pyth -> CoinGecko fallback) | Phase 126에서 구현 완료, getPrice/getNativePrice/getCacheStats |
| InMemoryPriceCache | Phase 125 산출물 | 5분 TTL + LRU 128 + stampede prevention | Phase 125에서 구현 완료 |
| PriceNotAvailableError | Phase 125 산출물 | 가격 조회 실패 에러 클래스 | OracleChain에서 모든 소스 실패 시 throw |
| DatabasePolicyEngine | v1.2 기존 | SPENDING_LIMIT 4-tier 평가 | 네이티브 금액 기준 평가에 USD 분기 추가 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| SettingsService | v1.4.4 | CoinGecko 키 설정 여부 확인 (힌트 표시 조건) | USDPL-06 CoinGecko 키 안내 힌트 조건 판단 |
| audit_log (Drizzle) | v1.2 기존 | UNLISTED_TOKEN_TRANSFER 감사 로그 기록 | USDPL-04 감사 로그 삽입 |
| NotificationService | v1.3.4 기존 | 알림 발송 (힌트 포함) | USDPL-06 힌트 포함 알림 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PriceResult discriminated union (plain object) | Zod discriminatedUnion | 단순 타입 분기에 Zod validation은 과도. plain TypeScript discriminated union이 더 적합 |
| Stage 3 직전 Oracle 호출 | Stage 3 내부 (evaluateAndReserve) Oracle 호출 | better-sqlite3 동기 트랜잭션 내 비동기 호출 불가. 반드시 진입 전 완료 |
| DatabasePolicyEngine 직접 수정 | 별도 wrapper 함수 | 기존 코드 변경 최소화를 위해 evaluateSpendingLimit 내부에 USD 분기를 추가하는 것이 자연스러움 |

**Installation:**
```bash
# 신규 npm 패키지 없음 (v1.5 제약)
```

## Architecture Patterns

### Recommended File Structure

```
packages/core/src/schemas/
  policy.schema.ts               # [기존, 확장] SpendingLimitRuleSchema 추가 + POLICY_RULES_SCHEMAS 등록

packages/daemon/src/pipeline/
  resolve-effective-amount-usd.ts # [신규] resolveEffectiveAmountUsd() + PriceResult 타입
  database-policy-engine.ts      # [기존, 확장] evaluateSpendingLimit USD 분기 추가
  stages.ts                      # [기존, 확장] stage3Policy에 Oracle 호출 + PriceResult 처리

packages/daemon/src/index.ts     # [기존, 확장] OracleChain DI 연결 + PipelineContext에 priceOracle 추가

packages/daemon/src/__tests__/
  resolve-effective-amount-usd.test.ts  # [신규] resolveEffectiveAmountUsd 단위 테스트
  database-policy-engine.test.ts        # [기존, 확장] USD SPENDING_LIMIT 테스트 추가
  pipeline-stage1-stage3.test.ts        # [기존, 확장] Stage 3 USD 통합 테스트 추가
```

### Pattern 1: PriceResult 3-state Discriminated Union

**What:** 가격 조회 결과를 success/oracleDown/notListed 3가지 상태로 구분하는 discriminated union
**When to use:** resolveEffectiveAmountUsd() 반환값
**Why:** "가격 불명 != 가격 0" 보안 원칙. 오라클 장애(일시적)와 토큰 미등록(지속적)을 다르게 처리

```typescript
// packages/daemon/src/pipeline/resolve-effective-amount-usd.ts

/** success: USD 환산 성공 */
interface PriceResultSuccess {
  type: 'success';
  usdAmount: number;
  isStale: boolean;
}

/** oracleDown: 오라클 전체 장애 -> 네이티브 금액만으로 평가 */
interface PriceResultOracleDown {
  type: 'oracleDown';
}

/** notListed: 해당 토큰 가격 정보 없음 -> 최소 NOTIFY 격상 */
interface PriceResultNotListed {
  type: 'notListed';
  tokenAddress: string;
  chain: string;
}

type PriceResult = PriceResultSuccess | PriceResultOracleDown | PriceResultNotListed;
```

### Pattern 2: Oracle 호출을 evaluateAndReserve 진입 전에 배치

**What:** Stage 3에서 Oracle HTTP 호출(비동기)을 better-sqlite3 동기 트랜잭션 진입 전에 완료
**When to use:** stage3Policy() 내에서 evaluateAndReserve() 호출 전
**Why:** v1.5 사전 결정 -- better-sqlite3 동기 트랜잭션 내 비동기 호출 불가

```typescript
// stages.ts -- stage3Policy() 확장
export async function stage3Policy(ctx: PipelineContext): Promise<void> {
  const req = ctx.request;
  const txType = ('type' in req && req.type) ? req.type : 'TRANSFER';
  const txParam = buildTransactionParam(req, txType, ctx.wallet.chain);
  txParam.network = ctx.resolvedNetwork;

  // [Phase 127] Oracle HTTP 호출 (evaluateAndReserve 진입 전 완료)
  let priceResult: PriceResult | undefined;
  if (ctx.priceOracle) {
    priceResult = await resolveEffectiveAmountUsd(
      req, txType, ctx.wallet.chain, ctx.priceOracle,
    );
  }

  // evaluateAndReserve (동기 트랜잭션) -- priceResult를 인자로 전달
  if (ctx.policyEngine instanceof DatabasePolicyEngine && ctx.sqlite) {
    evaluation = ctx.policyEngine.evaluateAndReserve(
      ctx.walletId, txParam, ctx.txId, priceResult,
    );
  }
  // ...
}
```

### Pattern 3: SpendingLimitRuleSchema Zod SSoT

**What:** 기존 TypeScript interface를 Zod 스키마로 전환하고 USD 필드 추가
**When to use:** SPENDING_LIMIT 정책 생성/업데이트 시 rules 검증
**Why:** CLAUDE.md Zod SSoT 원칙. 현재 `rules: z.record(z.unknown())`로 비검증 상태

```typescript
// packages/core/src/schemas/policy.schema.ts에 추가
const SpendingLimitRulesSchema = z.object({
  // 기존 네이티브 금액 기준 (하위 호환)
  instant_max: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다'),
  notify_max: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다'),
  delay_max: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다'),
  // Phase 127: USD 금액 기준 (optional, 미설정 시 네이티브만 사용)
  instant_max_usd: z.number().nonnegative().optional(),
  notify_max_usd: z.number().nonnegative().optional(),
  delay_max_usd: z.number().nonnegative().optional(),
  // 시간 파라미터
  delay_seconds: z.number().int().min(60).default(900),
});

// POLICY_RULES_SCHEMAS에 등록
SPENDING_LIMIT: SpendingLimitRulesSchema,
```

### Pattern 4: evaluateSpendingLimit USD 분기

**What:** 기존 네이티브 기준 evaluateSpendingLimit에 USD 분기를 추가
**When to use:** SPENDING_LIMIT 정책이 USD 임계값을 포함할 때
**Why:** 네이티브 + USD 병행 평가 후 더 높은(보수적) 티어 채택

```typescript
// database-policy-engine.ts -- evaluateSpendingLimit 확장
private evaluateSpendingLimit(
  resolved: PolicyRow[],
  amount: string,
  usdAmount?: number, // Phase 127 추가
): PolicyEvaluation | null {
  const spending = resolved.find((p) => p.type === 'SPENDING_LIMIT');
  if (!spending) return null;

  const rules: SpendingLimitRules = JSON.parse(spending.rules);

  // 1. 네이티브 기준 티어 (기존 로직)
  const nativeTier = this.evaluateNativeTier(BigInt(amount), rules);

  // 2. USD 기준 티어 (Phase 127)
  let usdTier: PolicyTier | undefined;
  if (usdAmount !== undefined && usdAmount > 0 && this.hasUsdThresholds(rules)) {
    usdTier = this.evaluateUsdTier(usdAmount, rules);
  }

  // 3. 보수적 선택: 두 티어 중 더 높은(보수적) 티어
  const tier = usdTier ? maxTier(nativeTier, usdTier) : nativeTier;
  // ...
}
```

### Pattern 5: notListed NOTIFY 격상 + UNLISTED_TOKEN_TRANSFER 감사 로그

**What:** PriceResult.notListed 시 최소 NOTIFY 격상 + 감사 로그 기록
**When to use:** stage3Policy에서 priceResult.type === 'notListed'일 때
**Why:** "가치를 모른다 != 가치가 없다" 보안 원칙

```typescript
// stage3Policy 내부 -- PriceResult 처리
if (priceResult?.type === 'notListed') {
  // 감사 로그 기록
  await ctx.db.insert(auditLog).values({
    timestamp: new Date(Math.floor(Date.now() / 1000) * 1000),
    eventType: 'UNLISTED_TOKEN_TRANSFER',
    actor: ctx.sessionId ?? 'system',
    walletId: ctx.walletId,
    txId: ctx.txId,
    details: JSON.stringify({
      tokenAddress: priceResult.tokenAddress,
      chain: priceResult.chain,
    }),
    severity: 'warning',
  });

  // 정책 평가 결과와 NOTIFY 중 높은 티어 적용
  tier = maxTier(tier, 'NOTIFY');
}
```

### Pattern 6: CoinGecko 키 안내 힌트 (최초 1회)

**What:** 가격 불명 토큰 + CoinGecko 키 미설정 시 알림에 최초 1회 힌트 포함
**When to use:** notListed + CoinGecko 키 미설정 + 해당 토큰 최초 발생
**Why:** 사용자가 CoinGecko 키를 설정하면 롱테일 토큰 커버리지 확보 가능

```typescript
// In-memory Set으로 힌트 발송 이력 관리 (데몬 재시작 시 리셋 OK)
const hintedTokens = new Set<string>();

if (priceResult.type === 'notListed') {
  const cacheKey = `${priceResult.chain}:${priceResult.tokenAddress}`;
  const coingeckoKey = settingsService.get('oracle.coingecko_api_key');
  const shouldShowHint = !coingeckoKey && !hintedTokens.has(cacheKey);

  if (shouldShowHint) {
    hintedTokens.add(cacheKey);
    // 알림에 힌트 포함
  }
}
```

### Anti-Patterns to Avoid

- **evaluateAndReserve 내부에서 Oracle 호출**: better-sqlite3 동기 트랜잭션 내에서 비동기 함수(fetch) 호출 불가. 반드시 트랜잭션 진입 전에 Oracle 호출 완료
- **PriceResult를 단일 null/number로 표현**: oracleDown(일시적)과 notListed(지속적)의 구분이 사라져 보안 정책 분기가 불가능
- **USD 환산 실패를 $0으로 처리**: USD 한도를 완전히 우회하는 보안 취약점. notListed는 최소 NOTIFY 격상으로 처리
- **SpendingLimitRules를 Zod 없이 TypeScript interface로 유지**: 현재 `rules: z.record(z.unknown())`으로 비검증 상태. Zod SSoT 원칙 위반
- **CoinGecko 힌트를 매번 표시**: 동일 토큰 반복 전송 시 스팸. 최초 1회만 표시 (in-memory Set)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 가격 조회 | 직접 HTTP 호출 | OracleChain.getPrice()/getNativePrice() | Phase 126에서 구현 완료, fallback/교차 검증/캐시 포함 |
| 가격 나이 판정 | Date.now() 직접 비교 | classifyPriceAge() | Phase 125에서 구현 완료, FRESH/AGING/STALE 3단계 |
| 티어 비교/max | if-else 체인 | maxTier() 헬퍼 | 이미 doc 61에 의사코드 제공, evaluateBatch에서도 유사 패턴 사용 중 |
| CoinGecko 키 조회 | config.toml 직접 파싱 | SettingsService.get('oracle.coingecko_api_key') | 암호화 저장, hot-reload 지원 |
| 감사 로그 삽입 | 커스텀 로깅 | db.insert(auditLog) | 기존 테이블 + 인덱스 완비, NotificationService에서 동일 패턴 사용 |

**Key insight:** Phase 127의 핵심은 Phase 125-126의 오라클 인프라와 기존 DatabasePolicyEngine을 "연결"하는 것이다. 새로운 인프라를 만드는 것이 아니라, 기존 인프라 간의 통합 코드를 작성한다.

## Common Pitfalls

### Pitfall 1: evaluateAndReserve 내부 비동기 호출 불가

**What goes wrong:** evaluateAndReserve()는 better-sqlite3의 `.transaction().immediate()` 내에서 실행되는 동기 함수. Oracle HTTP 호출(비동기)을 내부에서 하면 작동하지 않음.
**Why it happens:** better-sqlite3는 동기 API. `sqlite.transaction(() => { await fetch(...) })` 형태가 불가능.
**How to avoid:** Oracle 호출을 stage3Policy()에서 evaluateAndReserve() 호출 전에 완료하고, 결과(PriceResult)를 evaluateAndReserve에 인자로 전달. evaluateAndReserve 내부에서는 전달받은 usdAmount만 사용.
**Warning signs:** `transaction().immediate()` 내에서 Promise를 사용하려고 하면 TypeError 발생.

### Pitfall 2: SpendingLimitRules USD 필드 optional 처리

**What goes wrong:** instant_max_usd 등 USD 필드가 optional인데, undefined 체크 없이 비교하면 undefined <= 10 이 true가 됨 (NaN 비교).
**Why it happens:** JavaScript에서 undefined <= number 비교는 false를 반환하지만, 분기 로직이 의도와 다를 수 있음.
**How to avoid:** hasUsdThresholds() 헬퍼로 USD 필드 존재 여부를 먼저 확인한 후 USD 평가 진행. 개별 필드 비교 시에도 !== undefined 가드.
**Warning signs:** USD 필드 미설정 상태에서 SPENDING_LIMIT 평가가 비정상 동작.

### Pitfall 3: BATCH 타입에서 개별 instruction USD 합산 실패 처리

**What goes wrong:** BATCH 내 일부 instruction의 USD 환산이 실패하면 전체 usdAmount가 불완전. 이를 0으로 처리하면 보안 취약.
**Why it happens:** BATCH 내 TOKEN_TRANSFER instruction의 토큰이 미등록(notListed)일 수 있음.
**How to avoid:** 설계 문서 61 섹션 6.2의 BATCH 로직 따르기: 일부 instruction USD 변환 실패 시 failedCount > 0이면 최소 NOTIFY 격상. 전체 실패(oracleDown)이면 네이티브 금액만으로 평가.
**Warning signs:** BATCH 내 미등록 토큰이 있는데 INSTANT 티어로 통과.

### Pitfall 4: evaluateAndReserve와 evaluate의 USD 로직 이중 구현

**What goes wrong:** evaluateAndReserve()와 evaluate() 모두 SPENDING_LIMIT 평가를 수행. USD 분기를 한 곳에만 추가하면 다른 경로에서 누락.
**Why it happens:** evaluateAndReserve()는 동기 트랜잭션 내부에서 직접 SPENDING_LIMIT 평가 (private evaluateSpendingLimit과 별도 코드). evaluate()는 private evaluateSpendingLimit() 호출.
**How to avoid:** evaluateSpendingLimit()에 usdAmount 파라미터를 추가하고, evaluateAndReserve()와 evaluate() 모두 이 메서드를 사용. evaluateAndReserve() 내부의 인라인 SPENDING_LIMIT 코드를 evaluateSpendingLimit() 호출로 대체.
**Warning signs:** evaluate()에서 USD 평가가 동작하는데 evaluateAndReserve()에서는 네이티브만 평가.

### Pitfall 5: notListed vs oracleDown 혼동

**What goes wrong:** PriceNotAvailableError를 모두 oracleDown으로 처리하면 "가격 불명 토큰"과 "오라클 장애"를 구분할 수 없음.
**Why it happens:** OracleChain이 모든 소스 실패 시 PriceNotAvailableError를 throw. 이것이 Pyth에 feedId가 없는 토큰(notListed) 때문인지, API 장애(oracleDown) 때문인지 구분이 필요.
**How to avoid:** resolveEffectiveAmountUsd()에서 구분 로직: (1) TRANSFER/네이티브 토큰은 항상 가격 조회 가능하므로, PriceNotAvailableError = oracleDown. (2) TOKEN_TRANSFER에서 PriceNotAvailableError = notListed (토큰 미등록). 네이티브 가격도 실패하면 oracleDown.
**Warning signs:** 네이티브 SOL 전송에서 "notListed" 결과가 나오면 로직 오류.

### Pitfall 6: OracleChain이 daemon index.ts에 미연결

**What goes wrong:** Phase 126에서 OracleChain 구현체를 만들었지만 daemon index.ts에 wired되지 않음. PipelineContext에 priceOracle이 없으면 USD 평가가 전혀 동작하지 않음.
**Why it happens:** Phase 126은 구현체 자체에만 집중하고, 통합은 Phase 127 범위.
**How to avoid:** daemon index.ts에서 OracleChain 인스턴스를 생성하고 PipelineContext.priceOracle에 주입. AdminRouteDeps.priceOracle에도 동일 인스턴스 전달 (admin oracle-status가 이미 이것을 기대).
**Warning signs:** admin oracle-status가 모든 값 0/false를 반환하면 OracleChain 미연결.

## Code Examples

### resolveEffectiveAmountUsd() -- 5-type 분기

```typescript
// packages/daemon/src/pipeline/resolve-effective-amount-usd.ts
// Source: docs/61-price-oracle-spec.md 섹션 6.2

import type { IPriceOracle } from '@waiaas/core';
import type { SendTransactionRequest, TransactionRequest } from '@waiaas/core';
import { PriceNotAvailableError } from '../infrastructure/oracle/oracle-errors.js';

// PriceResult 3-state discriminated union
export type PriceResult =
  | { type: 'success'; usdAmount: number; isStale: boolean }
  | { type: 'oracleDown' }
  | { type: 'notListed'; tokenAddress: string; chain: string };

const NATIVE_DECIMALS: Record<string, number> = {
  solana: 9,
  ethereum: 18,
};

export async function resolveEffectiveAmountUsd(
  request: SendTransactionRequest | TransactionRequest,
  txType: string,
  chain: string,
  priceOracle: IPriceOracle,
): Promise<PriceResult> {
  try {
    switch (txType) {
      case 'TRANSFER': {
        const req = request as { amount: string };
        const nativePrice = await priceOracle.getNativePrice(
          chain as 'solana' | 'ethereum',
        );
        const decimals = NATIVE_DECIMALS[chain] ?? 18;
        const humanAmount = Number(req.amount) / Math.pow(10, decimals);
        return {
          type: 'success',
          usdAmount: humanAmount * nativePrice.usdPrice,
          isStale: nativePrice.isStale,
        };
      }

      case 'TOKEN_TRANSFER': {
        const req = request as {
          amount: string;
          token: { address: string; decimals: number; symbol: string };
        };
        try {
          const tokenPrice = await priceOracle.getPrice({
            address: req.token.address,
            decimals: req.token.decimals,
            chain: chain as 'solana' | 'ethereum',
          });
          const humanAmount =
            Number(req.amount) / Math.pow(10, req.token.decimals);
          return {
            type: 'success',
            usdAmount: humanAmount * tokenPrice.usdPrice,
            isStale: tokenPrice.isStale,
          };
        } catch (err) {
          if (err instanceof PriceNotAvailableError) {
            return {
              type: 'notListed',
              tokenAddress: req.token.address,
              chain,
            };
          }
          throw err; // 다른 에러는 외부 catch에서 oracleDown으로 처리
        }
      }

      case 'CONTRACT_CALL': {
        const req = request as { value?: string };
        if (!req.value || req.value === '0') {
          return { type: 'success', usdAmount: 0, isStale: false };
        }
        const nativePrice = await priceOracle.getNativePrice(
          chain as 'solana' | 'ethereum',
        );
        const decimals = NATIVE_DECIMALS[chain] ?? 18;
        const humanAmount = Number(req.value) / Math.pow(10, decimals);
        return {
          type: 'success',
          usdAmount: humanAmount * nativePrice.usdPrice,
          isStale: nativePrice.isStale,
        };
      }

      case 'APPROVE': {
        // APPROVE는 APPROVE_TIER_OVERRIDE가 SPENDING_LIMIT과 독립
        // usdAmount는 감사 로그 참고용
        return { type: 'success', usdAmount: 0, isStale: false };
      }

      case 'BATCH': {
        // 개별 instruction USD 합산 (별도 함수에서 처리)
        // ... BATCH 로직
      }

      default:
        return { type: 'oracleDown' };
    }
  } catch {
    return { type: 'oracleDown' };
  }
}
```

### SpendingLimitRulesSchema Zod SSoT

```typescript
// packages/core/src/schemas/policy.schema.ts에 추가
// Source: docs/61-price-oracle-spec.md 섹션 6.3

/** SPENDING_LIMIT: 금액 기반 4-티어 보안 분류. */
const SpendingLimitRulesSchema = z.object({
  /** INSTANT 티어 최대 금액 (lamports/wei 문자열) */
  instant_max: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다'),
  /** NOTIFY 티어 최대 금액 */
  notify_max: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다'),
  /** DELAY 티어 최대 금액 */
  delay_max: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다'),
  /** INSTANT 티어 최대 USD 금액 (optional) */
  instant_max_usd: z.number().nonnegative().optional(),
  /** NOTIFY 티어 최대 USD 금액 (optional) */
  notify_max_usd: z.number().nonnegative().optional(),
  /** DELAY 티어 최대 USD 금액 (optional) */
  delay_max_usd: z.number().nonnegative().optional(),
  /** DELAY 티어 쿨다운 시간 (초) */
  delay_seconds: z.number().int().min(60).default(900),
});

// POLICY_RULES_SCHEMAS에 등록
const POLICY_RULES_SCHEMAS: Partial<Record<string, z.ZodTypeAny>> = {
  // ... 기존 6개 타입
  SPENDING_LIMIT: SpendingLimitRulesSchema,  // Phase 127 추가
};
```

### maxTier 헬퍼 함수

```typescript
// Source: docs/61-price-oracle-spec.md 섹션 6.5

const TIER_ORDER: PolicyTier[] = ['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'];

function maxTier(a: PolicyTier, b: PolicyTier): PolicyTier {
  const aIdx = TIER_ORDER.indexOf(a);
  const bIdx = TIER_ORDER.indexOf(b);
  return TIER_ORDER[Math.max(aIdx, bIdx)]!;
}
```

### OracleChain DI 연결 (daemon index.ts)

```typescript
// daemon index.ts에서 OracleChain 인스턴스 생성
import { InMemoryPriceCache } from './infrastructure/oracle/price-cache.js';
import { PythOracle } from './infrastructure/oracle/pyth-oracle.js';
import { CoinGeckoOracle } from './infrastructure/oracle/coingecko-oracle.js';
import { OracleChain } from './infrastructure/oracle/oracle-chain.js';

// Setup
const priceCache = new InMemoryPriceCache();
const pythOracle = new PythOracle();
const coingeckoApiKey = settingsService.get('oracle.coingecko_api_key');
const coingeckoOracle = coingeckoApiKey
  ? new CoinGeckoOracle(settingsService)
  : undefined;
const threshold = Number(
  settingsService.get('oracle.cross_validation_threshold'),
);

const priceOracle = new OracleChain({
  primary: pythOracle,
  fallback: coingeckoOracle,
  cache: priceCache,
  crossValidationThreshold: threshold,
});

// PipelineContext에 priceOracle 주입
// AdminRouteDeps에 priceOracle 주입
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SpendingLimitRules TypeScript interface (검증 없음) | SpendingLimitRulesSchema Zod SSoT | Phase 127 | 정책 생성 시 Zod 검증, USD 필드 포함 |
| 네이티브 금액만으로 SPENDING_LIMIT 평가 | 네이티브 + USD 병행 평가 (보수적 선택) | Phase 127 | 모든 토큰의 실제 가치 기반 정책 평가 |
| TOKEN_TRANSFER 네이티브 금액 0 -> NOTIFY 고정 | USD 환산 성공 시 4-tier 동적 분류 | Phase 127 | USDC $5 전송이 INSTANT으로 분류 가능 |
| 가격 조회 결과를 단일 null/number로 처리 | PriceResult 3-state discriminated union | Phase 127 | oracleDown/notListed 구분으로 보안 정책 차별화 |

**Deprecated/outdated:**
- `evaluateAndReserve` 내부의 인라인 SPENDING_LIMIT 코드: evaluateSpendingLimit() 호출로 통일 (코드 중복 제거)
- TOKEN_TRANSFER의 무조건 NOTIFY 고정: USD 환산으로 4-tier 동적 분류로 전환

## Integration Points (Critical)

### 1. daemon index.ts -- OracleChain DI 연결

현재 OracleChain이 daemon index.ts에 wired되지 않음. Phase 127에서 반드시 연결해야 함.

**연결 지점:**
- PipelineContext에 `priceOracle?: IPriceOracle` 필드 추가
- AdminRouteDeps.priceOracle에 동일 인스턴스 전달 (이미 필드 존재, 값만 주입)
- send-transaction route handler에서 PipelineContext 생성 시 priceOracle 포함

### 2. evaluateAndReserve -- usdAmount 파라미터 추가

evaluateAndReserve()의 시그니처 변경이 필요. priceResult에서 추출한 usdAmount를 전달.

**현재:**
```typescript
evaluateAndReserve(walletId: string, transaction: TransactionParam, txId: string): PolicyEvaluation
```

**Phase 127 후:**
```typescript
evaluateAndReserve(walletId: string, transaction: TransactionParam, txId: string, usdAmount?: number): PolicyEvaluation
```

### 3. evaluateBatch -- USD 합산 확장

evaluateBatch()의 Phase B(합산 금액 평가)에서도 USD 금액을 사용해야 함.

### 4. NOTIFICATION_EVENT_TYPES에 새 이벤트 타입 추가 여부

UNLISTED_TOKEN_TRANSFER는 감사 로그(audit_log)에만 기록하고, 기존 POLICY_VIOLATION 알림에 힌트를 추가하는 방식이 적합. 새 NotificationEventType을 추가하면 21개 -> 22개로 변경 시 i18n 메시지/테스트 모두 수정 필요. audit_log.eventType은 enum 제약이 없으므로 자유롭게 사용 가능.

**결정: UNLISTED_TOKEN_TRANSFER는 audit_log에만 기록. 알림은 기존 이벤트 타입 활용.**

## Open Questions

1. **evaluateAndReserve 내 인라인 SPENDING_LIMIT 코드를 evaluateSpendingLimit 호출로 통일할지**
   - What we know: evaluateAndReserve() 내부 라인 526-576에 인라인 SPENDING_LIMIT 평가 코드가 있고, evaluate()는 private evaluateSpendingLimit()을 호출
   - What's unclear: evaluateAndReserve의 인라인 코드를 evaluateSpendingLimit으로 대체하면 reserved_amount 계산 로직과의 결합이 복잡해질 수 있음
   - Recommendation: evaluateAndReserve에서 effectiveAmount를 계산한 후 evaluateSpendingLimit()을 호출하되, reserved_amount 로직은 별도 유지. usdAmount 파라미터를 evaluateSpendingLimit에 추가하면 두 경로 모두 동일 USD 로직 적용.

2. **BATCH 타입의 USD 합산을 evaluateBatch Phase B에서 처리할지, stage3Policy에서 처리할지**
   - What we know: 현재 evaluateBatch Phase B는 네이티브 금액만 합산 (TRANSFER.amount만). USD 합산은 resolveEffectiveAmountUsd BATCH 분기에서 처리 가능.
   - What's unclear: evaluateBatch에 priceResult를 전달할지, BATCH용 resolveEffectiveAmountUsd를 stage3Policy에서 호출할지
   - Recommendation: stage3Policy에서 BATCH 타입일 때 resolveEffectiveAmountUsd를 호출하고, 결과를 evaluateBatch에 전달. evaluateBatch Phase B에 usdAmount 파라미터 추가.

3. **notListed 격상과 건별 결과의 max 처리 시점**
   - What we know: v1.5 E2E 시나리오 5-2에서 "건별 결과가 DELAY -> DELAY 유지 (NOTIFY보다 높으므로)"
   - What's unclear: notListed NOTIFY 격상은 policy evaluation 후에 적용해야 함 (policy가 DELAY를 반환할 수 있으므로)
   - Recommendation: stage3Policy에서 policy evaluation 완료 후, priceResult.type === 'notListed'이면 최종 tier = maxTier(evaluation.tier, 'NOTIFY')

## Sources

### Primary (HIGH confidence)
- 코드베이스 직접 조사: `database-policy-engine.ts` (907줄), `stages.ts` (750줄), `policy.schema.ts` (125줄), `oracle-chain.ts` (212줄), `oracle-errors.ts` (36줄)
- 설계 문서 61 섹션 6.2-6.6 (`docs/61-price-oracle-spec.md`) -- resolveEffectiveAmountUsd, SpendingLimitRuleSchema, evaluateSpendingLimitUsd 상세 의사코드
- v1.5 목표 문서 (`objectives/v1.5-defi-price-oracle.md`) -- USDPL-01~06 요구사항, E2E 검증 시나리오
- Phase 126 VERIFICATION (`126-VERIFICATION.md`) -- OracleChain/PythOracle/CoinGeckoOracle 구현 완료 확인
- Phase 125 RESEARCH (`125-RESEARCH.md`) -- IPriceOracle 인터페이스, InMemoryPriceCache 구현 패턴

### Secondary (MEDIUM confidence)
- 기존 코드 패턴: `notification-service.ts` audit_log 삽입 패턴, `setting-keys.ts` oracle 카테고리 설정

### Tertiary (LOW confidence)
- 없음. 모든 결정은 설계 문서와 코드베이스에서 직접 검증됨

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 모든 의존성이 기존 코드베이스 내부 (Phase 125-126 산출물 + 기존 DatabasePolicyEngine)
- Architecture: HIGH - 설계 문서 61 섹션 6.2-6.6이 상세 의사코드 제공, evaluateAndReserve 비동기 제약은 v1.5 사전 결정으로 확정
- Pitfalls: HIGH - evaluateAndReserve 동기 제약, SpendingLimitRules optional 처리, notListed/oracleDown 구분 등 코드베이스 직접 확인
- Integration: HIGH - daemon index.ts, stages.ts, database-policy-engine.ts 연결 지점 정확히 파악

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (내부 코드베이스 기반, 외부 변동 영향 없음)
