---
phase: 127-usd-policy-integration
verified: 2026-02-15T08:14:05Z
status: passed
score: 5/5
---

# Phase 127: USD Policy Integration Verification Report

**Phase Goal:** 5-type 트랜잭션의 금액이 USD로 환산되어 정책 평가에 반영되고, 가격 불명 토큰이 안전하게 처리되며, 오라클 장애 시 graceful fallback이 동작하는 상태

**Verified:** 2026-02-15T08:14:05Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | resolveEffectiveAmountUsd가 TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH 5-type의 금액을 USD로 환산한다 | ✓ VERIFIED | `resolve-effective-amount-usd.ts` lines 74-154: switch문으로 5-type 모두 처리, BATCH는 resolveBatchUsd 호출 |
| 2 | SpendingLimitRuleSchema가 instant_max_usd/notify_max_usd/delay_max_usd 필드를 Zod SSoT로 검증하고 USD 기준 정책 평가가 동작한다 | ✓ VERIFIED | `policy.schema.ts` lines 77-81: Zod optional number fields, `database-policy-engine.ts` lines 1137-1140: hasUsdThresholds + evaluateUsdTier + maxTier |
| 3 | 가격 불명 토큰(notListed) 전송 시 최소 NOTIFY로 격상되고 UNLISTED_TOKEN_TRANSFER 감사 로그가 기록된다 | ✓ VERIFIED | `stages.ts` lines 356-370: audit_log insert + TIER_ORDER 비교로 NOTIFY 격상 확인, 테스트 통과 |
| 4 | 오라클 전체 장애(oracleDown) 시 네이티브 금액만으로 정책 평가가 계속된다 | ✓ VERIFIED | `stages.ts` line 403 comment + lines 314-322: usdAmount가 undefined일 때 evaluateAndReserve에 전달 안됨, 테스트 통과 |
| 5 | 가격 불명 토큰 + CoinGecko 키 미설정 시 키 안내 힌트가 최초 1회 포함된다 | ✓ VERIFIED | `stages.ts` lines 380-391: hintedTokens Set + coingeckoKey 체크 + 힌트 메시지, 테스트 2개 통과 (최초 1회 + 재전송 시 미포함) |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/daemon/src/pipeline/stages.ts` | Stage 3에서 resolveEffectiveAmountUsd 호출 + notListed 격상 + oracleDown fallback + 힌트 | ✓ VERIFIED | Lines 280-283: Oracle 호출, 310-322: usdAmount 전달, 356-401: notListed 처리 완비 |
| `packages/daemon/src/api/routes/transactions.ts` | TransactionRouteDeps.priceOracle + PipelineContext.priceOracle 주입 | ✓ VERIFIED | Lines 85-86: priceOracle/settingsService 필드, 355-356: PipelineContext 생성 시 전달 |
| `packages/daemon/src/lifecycle/daemon.ts` | OracleChain DI 생성 + createApp deps에 priceOracle 전달 | ✓ VERIFIED | Lines 361-388: Step 4e OracleChain 생성, 423: createApp에 전달 |
| `packages/daemon/src/api/server.ts` | CreateAppDeps.priceOracle + adminRoutes/transactionRoutes에 전달 | ✓ VERIFIED | Lines 96: CreateAppDeps 필드, 284: transactionRoutes 전달, 330: adminRoutes 전달 |
| `packages/daemon/src/__tests__/pipeline-stage1-stage3.test.ts` | Stage 3 USD 통합 테스트 | ✓ VERIFIED | Lines 679-900+: 9개 테스트 (success, notListed, oracleDown, 힌트, BATCH) 모두 PASS |
| `packages/core/src/schemas/policy.schema.ts` | SpendingLimitRuleSchema USD 필드 Zod 검증 | ✓ VERIFIED | Lines 77-81: instant_max_usd/notify_max_usd/delay_max_usd optional number fields |
| `packages/daemon/src/pipeline/database-policy-engine.ts` | evaluateSpendingLimit USD 분기 + maxTier 로직 | ✓ VERIFIED | Lines 1137-1140: USD 티어 평가 + maxTier, 1174-1194: hasUsdThresholds/evaluateUsdTier 메서드 |
| `packages/daemon/src/pipeline/resolve-effective-amount-usd.ts` | 5-type USD 환산 + PriceResult 3-state | ✓ VERIFIED | Lines 68-154: 5-type switch + 3-state return, 168-264: resolveBatchUsd 구현 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `daemon.ts` | `oracle-chain.ts` | new OracleChain() 생성 + createApp에 전달 | ✓ WIRED | Line 375: new OracleChain, 423: createApp priceOracle 인자 |
| `stages.ts` | `resolve-effective-amount-usd.ts` | resolveEffectiveAmountUsd 호출 | ✓ WIRED | Line 45: import, 280: 호출, PriceResult 타입 사용 |
| `stages.ts` | `schema.ts` | auditLog.insert for UNLISTED_TOKEN_TRANSFER | ✓ WIRED | Line 358-370: audit_log insert with UNLISTED_TOKEN_TRANSFER eventType |
| `server.ts` | `admin.ts` | adminRoutes deps에 priceOracle 전달 | ✓ WIRED | Line 330: priceOracle 전달 확인 (adminRoutes 호출) |
| `server.ts` | `transactions.ts` | transactionRoutes deps에 priceOracle 전달 | ✓ WIRED | Line 284-285: priceOracle + settingsService 전달 |
| `database-policy-engine.ts` | `policy.schema.ts` | SpendingLimitRules USD 필드 사용 | ✓ WIRED | Lines 55-57: interface 정의, 1174-1194: USD 필드 접근 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| N/A | N/A | N/A | N/A | No anti-patterns found |

**Anti-pattern scan:** 0 TODOs, 0 FIXMEs, 0 placeholders, 0 empty implementations in key files.

### Human Verification Required

None — all observable behaviors verified programmatically through automated tests.

**Test Coverage:**
- 9 Stage 3 USD integration tests covering all 5 truths
- 1,025 total daemon tests passed with no regressions
- TypeScript compilation clean for daemon + core packages

---

## Verification Details

### Truth 1: 5-type USD Resolution

**Verified files:**
- `packages/daemon/src/pipeline/resolve-effective-amount-usd.ts`

**Evidence:**
```typescript
// Lines 74-154
switch (txType) {
  case 'TRANSFER': {
    const nativePrice = await priceOracle.getNativePrice(chain as ChainType);
    return { type: 'success', usdAmount: humanAmount * nativePrice.usdPrice, isStale };
  }
  case 'TOKEN_TRANSFER': {
    const tokenPrice = await priceOracle.getPrice({ address, decimals, chain });
    return { type: 'success', usdAmount: humanAmount * tokenPrice.usdPrice, isStale };
    // PriceNotAvailableError -> notListed
  }
  case 'CONTRACT_CALL': {
    if (!req.value || req.value === '0') return { type: 'success', usdAmount: 0 };
    const nativePrice = await priceOracle.getNativePrice(chain);
    return { type: 'success', usdAmount: humanAmount * nativePrice.usdPrice, isStale };
  }
  case 'APPROVE': {
    return { type: 'success', usdAmount: 0, isStale: false };
  }
  case 'BATCH': {
    return await resolveBatchUsd(request, chain, priceOracle);
  }
}
```

**Test verification:**
- `priceOracle 있음 + TRANSFER + success: usdAmount가 evaluateAndReserve에 전달됨` ✓ PASS
- `BATCH + 일부 notListed: notListed 격상 + 감사 로그` ✓ PASS

### Truth 2: USD Policy Evaluation

**Verified files:**
- `packages/core/src/schemas/policy.schema.ts`
- `packages/daemon/src/pipeline/database-policy-engine.ts`

**Evidence:**
```typescript
// policy.schema.ts lines 77-81
export const SpendingLimitRulesSchema = z.object({
  instant_max: z.string().regex(/^\d+$/),
  notify_max: z.string().regex(/^\d+$/),
  delay_max: z.string().regex(/^\d+$/),
  instant_max_usd: z.number().nonnegative().optional(),
  notify_max_usd: z.number().nonnegative().optional(),
  delay_max_usd: z.number().nonnegative().optional(),
  delay_seconds: z.number().int().min(60).default(900),
});

// database-policy-engine.ts lines 1137-1140
const nativeTier = this.evaluateNativeTier(BigInt(amount), rules);
let finalTier = nativeTier;
if (usdAmount !== undefined && usdAmount > 0 && this.hasUsdThresholds(rules)) {
  const usdTier = this.evaluateUsdTier(usdAmount, rules);
  finalTier = maxTier(nativeTier, usdTier);  // 보수적 방향 (더 높은 티어)
}
```

**Test verification:**
- `priceOracle 있음 + TRANSFER + success: usdAmount가 evaluateAndReserve에 전달됨` ✓ PASS (4th arg 확인)

### Truth 3: notListed NOTIFY 격상 + 감사 로그

**Verified files:**
- `packages/daemon/src/pipeline/stages.ts`

**Evidence:**
```typescript
// Lines 356-370
if (priceResult?.type === 'notListed') {
  // 감사 로그: UNLISTED_TOKEN_TRANSFER
  await ctx.db.insert(auditLog).values({
    timestamp: new Date(Math.floor(Date.now() / 1000) * 1000),
    eventType: 'UNLISTED_TOKEN_TRANSFER',
    actor: ctx.sessionId ?? 'system',
    walletId: ctx.walletId,
    txId: ctx.txId,
    details: JSON.stringify({
      tokenAddress: priceResult.tokenAddress,
      chain: priceResult.chain,
      failedCount: priceResult.failedCount,
    }),
    severity: 'warning',
  });

  // 최소 NOTIFY 격상
  const TIER_ORDER: PolicyTier[] = ['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'];
  const currentIdx = TIER_ORDER.indexOf(tier);
  const notifyIdx = TIER_ORDER.indexOf('NOTIFY');
  if (currentIdx < notifyIdx) {
    tier = 'NOTIFY';
  }
}
```

**Test verification:**
- `priceOracle 있음 + TOKEN_TRANSFER + notListed: tier가 최소 NOTIFY로 격상 + audit_log 삽입` ✓ PASS
- `BATCH + 일부 notListed: notListed 격상 + 감사 로그` ✓ PASS

### Truth 4: oracleDown Graceful Fallback

**Verified files:**
- `packages/daemon/src/pipeline/stages.ts`
- `packages/daemon/src/pipeline/resolve-effective-amount-usd.ts`

**Evidence:**
```typescript
// stages.ts lines 314-322
const usdAmount = priceResult?.type === 'success' ? priceResult.usdAmount : undefined;

if (ctx.policyEngine instanceof DatabasePolicyEngine && ctx.sqlite) {
  evaluation = ctx.policyEngine.evaluateAndReserve(
    ctx.walletId,
    txParam,
    ctx.txId,
    usdAmount,  // undefined when oracleDown
  );
}

// resolve-effective-amount-usd.ts lines 150-153
} catch {
  // Any unhandled error -> oracleDown (safe fallback)
  return { type: 'oracleDown' };
}
```

**Test verification:**
- `priceOracle 있음 + oracleDown: 네이티브 금액만으로 평가 (usdAmount 미전달)` ✓ PASS
- `priceOracle 미설정 (undefined): 기존 네이티브 전용 평가 (하위 호환)` ✓ PASS

### Truth 5: CoinGecko 키 안내 힌트 최초 1회

**Verified files:**
- `packages/daemon/src/pipeline/stages.ts`

**Evidence:**
```typescript
// Lines 48-52
const hintedTokens = new Set<string>();
export { hintedTokens };

// Lines 380-391
const cacheKey = `${priceResult.chain}:${priceResult.tokenAddress}`;
const coingeckoKey = ctx.settingsService?.get('oracle.coingecko_api_key');
const shouldShowHint = !coingeckoKey && !hintedTokens.has(cacheKey);
if (shouldShowHint) {
  hintedTokens.add(cacheKey);
}

const hint = shouldShowHint
  ? 'CoinGecko API 키를 설정하면 이 토큰의 USD 가격을 조회할 수 있습니다. Admin Settings > Oracle에서 설정하세요.'
  : undefined;
```

**Test verification:**
- `notListed + CoinGecko 키 미설정: 힌트 포함 알림 발송 + hintedTokens 등록` ✓ PASS
- `notListed + 동일 토큰 재전송: 힌트가 두 번째에는 포함되지 않음 (최초 1회)` ✓ PASS
- `notListed + CoinGecko 키 설정됨: 힌트 포함되지 않음` ✓ PASS

---

## DI Chain Verification

**OracleChain → PipelineContext 전체 경로:**

1. `daemon.ts` Step 4e: OracleChain 생성 (Pyth + optional CoinGecko)
   - Lines 361-388
   - Fail-soft: 초기화 실패 시 undefined, 기존 네이티브 평가 유지

2. `daemon.ts` Step 5: createApp deps에 priceOracle 전달
   - Line 423

3. `server.ts` createApp: CreateAppDeps.priceOracle
   - Lines 96 (interface), 284-285 (transactionRoutes), 330 (adminRoutes)

4. `transactions.ts` transactionRoutes: TransactionRouteDeps.priceOracle
   - Lines 85-86 (interface), 355-356 (PipelineContext 생성)

5. `stages.ts` PipelineContext: priceOracle + settingsService
   - Lines 91-93 (interface)

6. `stages.ts` stage3Policy: resolveEffectiveAmountUsd 호출
   - Lines 280-283

**Status:** ✓ WIRED — 전체 DI 체인 연결 확인

---

## Test Summary

**Stage 3 USD Integration Tests (9 tests):**
1. ✓ priceOracle 있음 + TRANSFER + success: usdAmount가 evaluateAndReserve에 전달됨
2. ✓ priceOracle 있음 + TOKEN_TRANSFER + notListed: tier가 최소 NOTIFY로 격상 + audit_log 삽입
3. ✓ priceOracle 있음 + oracleDown: 네이티브 금액만으로 평가 (usdAmount 미전달)
4. ✓ priceOracle 미설정 (undefined): 기존 네이티브 전용 평가 (하위 호환)
5. ✓ notListed + CoinGecko 키 미설정: 힌트 포함 알림 발송 + hintedTokens 등록
6. ✓ notListed + 동일 토큰 재전송: 힌트가 두 번째에는 포함되지 않음 (최초 1회)
7. ✓ BATCH + 일부 notListed: notListed 격상 + 감사 로그
8. ✓ priceOracle 있음 + TRANSFER + success + INSTANT tier: 그대로 INSTANT 유지 (격상 불필요)
9. ✓ notListed + CoinGecko 키 설정됨: 힌트 포함되지 않음

**Daemon Test Suite:**
- Test Files: 64 passed
- Tests: 1,025 passed
- Duration: 32.79s
- No regressions

**TypeScript Compilation:**
- `@waiaas/daemon`: ✓ PASS
- `@waiaas/core`: ✓ PASS

---

## Conclusion

**Phase 127 goal fully achieved.**

All 5 observable truths verified:
1. ✓ 5-type USD resolution (TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH)
2. ✓ USD policy evaluation with Zod SSoT (instant_max_usd/notify_max_usd/delay_max_usd)
3. ✓ notListed NOTIFY upgrade + UNLISTED_TOKEN_TRANSFER audit log
4. ✓ oracleDown graceful fallback (native-only evaluation)
5. ✓ CoinGecko hint one-time per token

**Backward compatibility:** priceOracle는 optional이므로 미설정 시 기존 네이티브 전용 평가가 그대로 동작한다. (테스트 4번으로 검증)

**DI chain:** daemon.ts → createApp → transactionRoutes → PipelineContext → stage3Policy 전 경로 연결 확인.

**Next phase readiness:** Phase 128 (spending-limit-usd) 진행 가능. USD 기반 임계값 설정 기능 추가 예정.

---

_Verified: 2026-02-15T08:14:05Z_
_Verifier: Claude (gsd-verifier)_
