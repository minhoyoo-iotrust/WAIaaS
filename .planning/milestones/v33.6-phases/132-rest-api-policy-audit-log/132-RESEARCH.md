# Phase 132: REST API + 정책 통합 + 감사 로그 - Research

**Researched:** 2026-02-15
**Domain:** x402 정책 평가 (X402_ALLOWED_DOMAINS, SPENDING_LIMIT 통합), REST API (POST /v1/x402/fetch), 트랜잭션 감사 로그 (type=X402_PAYMENT), 알림 트리거 연동
**Confidence:** HIGH

## Summary

Phase 132는 Phase 131에서 구현한 x402 핵심 모듈(x402-handler.ts, ssrf-guard.ts, payment-signer.ts)을 기존 WAIaaS 인프라에 통합하는 단계이다. 3개 영역을 다룬다: (1) X402_ALLOWED_DOMAINS 정책 평가 -- 기본 거부로 동작하는 도메인 화이트리스트 매칭(와일드카드 지원), (2) REST API -- POST /v1/x402/fetch 엔드포인트를 sessionAuth로 보호하고 OpenAPIHono createRoute 패턴으로 구현, (3) 감사 로그 -- x402 결제를 transactions 테이블에 type=X402_PAYMENT으로 기록하고 기존 알림 트리거(TX_REQUESTED/TX_CONFIRMED/TX_FAILED)를 연동.

12개 요구사항(X4POL-01~08, X4API-01~04)은 정책 평가와 API/감사 로그의 두 축으로 나뉜다. 정책 평가는 DatabasePolicyEngine의 기존 evaluateAndReserve 패턴을 재사용하되, x402 전용 로직(도메인 매칭, DELAY 타임아웃 대기, APPROVAL 즉시 거부)을 x402 라우트 핸들러에서 오케스트레이션한다. REST API는 기존 transactionRoutes, sign-only 패턴을 따르며, config.toml에 [x402] 섹션을 추가한다.

**Primary recommendation:** x402 정책 평가를 DatabasePolicyEngine에 X402_ALLOWED_DOMAINS 평가 메서드로 추가하고, SPENDING_LIMIT 평가는 기존 evaluateAndReserve()를 그대로 재사용한다. REST API 라우트 핸들러에서 도메인 검증 -> SPENDING_LIMIT 평가 -> DELAY/APPROVAL 분기 -> x402 핸들러 호출 -> 트랜잭션 기록 -> 알림 발송의 전체 흐름을 오케스트레이션한다.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@hono/zod-openapi` | 기존 | `OpenAPIHono`, `createRoute`, `z` -- REST API 라우트 정의 | 모든 기존 라우트가 이 패턴 사용 |
| `@waiaas/core` | 기존 | `WAIaaSError`, `X402FetchRequestSchema`, `X402FetchResponseSchema`, `POLICY_TYPES`, `TRANSACTION_TYPES` | Zod SSoT. X402_PAYMENT, X402_ALLOWED_DOMAINS 이미 등록됨 |
| `drizzle-orm` | 기존 | DB 쿼리 (transactions INSERT/UPDATE, policies SELECT) | 전 코드베이스 표준 |
| `better-sqlite3` | 기존 | `BEGIN IMMEDIATE` 트랜잭션 (evaluateAndReserve TOCTOU 방지) | 기존 정책 엔진 패턴 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 기존 | 단위 + 통합 테스트 | 모든 테스트 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DatabasePolicyEngine 확장 | 별도 X402PolicyEngine | 기존 평가 흐름(override resolution, evaluateAndReserve)을 재구현해야 함. 코드 중복 |
| x402 라우트 핸들러에서 오케스트레이션 | 기존 6-stage pipeline 확장 | v1.5.1 설계 결정: x402는 독립 파이프라인. 6-stage 확장 시 동기 HTTP 제약(DELAY 대기, APPROVAL 거부) 처리 복잡 |

**Installation:**

```bash
# 신규 의존성 없음. 모든 라이브러리가 기존 설치 상태
```

## Architecture Patterns

### Recommended Project Structure

```
packages/daemon/src/
  api/routes/
    x402.ts                    # POST /v1/x402/fetch 라우트 + OpenAPI 스키마
  services/x402/
    x402-handler.ts            # 기존 (Phase 131)
    payment-signer.ts          # 기존 (Phase 131)
    ssrf-guard.ts              # 기존 (Phase 131)
  pipeline/
    database-policy-engine.ts  # X402_ALLOWED_DOMAINS 평가 메서드 추가
  infrastructure/config/
    loader.ts                  # DaemonConfigSchema에 [x402] 섹션 추가
  __tests__/
    x402-policy.test.ts        # X402_ALLOWED_DOMAINS 정책 평가 테스트
    x402-route.test.ts         # POST /v1/x402/fetch 라우트 통합 테스트
```

### Pattern 1: X402_ALLOWED_DOMAINS 정책 평가

**What:** policies 테이블에 type='X402_ALLOWED_DOMAINS'로 저장된 도메인 화이트리스트를 검증한다. 기본 거부 -- 정책 미설정 시 x402 결제 불가.

**When to use:** POST /v1/x402/fetch 라우트 핸들러에서 x402-handler 호출 전 반드시 검증.

**Key design:**

```typescript
// X402_ALLOWED_DOMAINS rules JSON 구조
interface X402AllowedDomainsRules {
  domains: string[];  // 예: ["api.example.com", "*.coinbase.com"]
}

// DatabasePolicyEngine에 추가할 메서드
evaluateX402Domain(
  resolved: PolicyRow[],
  targetDomain: string,
): PolicyEvaluation | null {
  const policy = resolved.find((p) => p.type === 'X402_ALLOWED_DOMAINS');

  // 정책 없음 -> 기본 거부 (ALLOWED_TOKENS와 동일 패턴)
  if (!policy) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: 'x402 payments disabled: no X402_ALLOWED_DOMAINS policy configured',
    };
  }

  const rules: X402AllowedDomainsRules = JSON.parse(policy.rules);

  // 도메인 매칭 (정확한 매칭 + 와일드카드)
  const isAllowed = rules.domains.some((pattern) =>
    matchDomain(pattern, targetDomain),
  );

  if (!isAllowed) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: `Domain '${targetDomain}' not in allowed x402 domains list`,
    };
  }

  return null; // 도메인 허용, 다음 평가 계속
}
```

**와일드카드 도메인 매칭 (X4POL-02):**

```typescript
/**
 * Match a domain pattern against a target domain.
 *
 * Rules:
 * - "api.example.com" -> exact match only
 * - "*.example.com" -> matches sub.example.com, a.b.example.com
 *                       does NOT match example.com (dot-boundary)
 * - Case-insensitive comparison
 */
function matchDomain(pattern: string, target: string): boolean {
  const p = pattern.toLowerCase();
  const t = target.toLowerCase();

  if (p === t) return true;

  if (p.startsWith('*.')) {
    const suffix = p.slice(1); // ".example.com"
    return t.endsWith(suffix) && t.length > suffix.length;
  }

  return false;
}
```

### Pattern 2: POST /v1/x402/fetch 라우트 핸들러 오케스트레이션

**What:** 기존 transactionRoutes와 sign-only 패턴을 결합한 동기 파이프라인. x402 핸들러 호출 전에 정책 평가를 수행하고, 결과를 transactions 테이블에 기록한다.

**When to use:** AI 에이전트가 x402 유료 API에 접근할 때.

**전체 흐름:**

```typescript
// POST /v1/x402/fetch 핸들러의 오케스트레이션 흐름
async function handleX402FetchRoute(c: Context): Promise<Response> {
  // 0. config.x402.enabled 검증
  if (!config.x402?.enabled) {
    throw new WAIaaSError('X402_DISABLED');
  }

  // 1. sessionAuth에서 walletId 추출 (기존 패턴)
  const walletId = c.get('walletId');
  const sessionId = c.get('sessionId');

  // 2. 요청 바디 파싱 (X402FetchRequestSchema)
  const body = c.req.valid('json');
  const targetUrl = new URL(body.url);
  const targetDomain = targetUrl.hostname;

  // 3. 월렛 조회
  const wallet = await db.select().from(wallets).where(eq(wallets.id, walletId)).get();
  if (!wallet) throw new WAIaaSError('WALLET_NOT_FOUND');

  // 4. X402_ALLOWED_DOMAINS 정책 평가 (기본 거부)
  // policies 로드 -> resolveOverrides -> evaluateX402Domain
  const domainResult = evaluateX402Domain(resolved, targetDomain);
  if (domainResult && !domainResult.allowed) {
    throw new WAIaaSError('X402_DOMAIN_NOT_ALLOWED', {
      message: domainResult.reason,
    });
  }

  // 5. x402 핸들러 호출 (Phase 131 구현)
  //    handleX402Fetch가 402를 감지하면 PaymentRequirements에서 amount 추출
  //    -> 여기서 정책 평가 콜백을 주입

  // 5a. 트랜잭션 ID 생성 + DB INSERT (type=X402_PAYMENT, status=PENDING)
  const txId = generateId();
  await db.insert(transactions).values({
    id: txId,
    walletId,
    chain: resolvedChain,
    network: resolvedNetwork,
    type: 'X402_PAYMENT',
    status: 'PENDING',
    amount: paymentAmount,
    toAddress: payTo,
    sessionId,
    metadata: JSON.stringify({
      target_url: body.url,
      payment_amount: paymentAmount,
      network: caip2Network,
    }),
    createdAt: new Date(...),
  });

  // 5b. TX_REQUESTED 알림 (fire-and-forget)
  void notificationService?.notify('TX_REQUESTED', walletId, {
    amount: paymentAmount,
    to: payTo,
    type: 'X402_PAYMENT',
  }, { txId });

  // 5c. SPENDING_LIMIT 정책 평가 (evaluateAndReserve)
  //     USDC -> $1 직접 환산, 기타 토큰 -> IPriceOracle
  const evaluation = policyEngine.evaluateAndReserve(
    walletId,
    { type: 'TRANSFER', amount: paymentAmount, toAddress: payTo, chain, network },
    txId,
    usdAmount,
  );

  // 5d. 정책 결과 처리
  if (!evaluation.allowed) {
    await db.update(transactions)
      .set({ status: 'CANCELLED', tier: evaluation.tier, error: evaluation.reason })
      .where(eq(transactions.id, txId));
    throw new WAIaaSError('POLICY_DENIED');
  }

  // 5e. DELAY/APPROVAL 분기 (x402 전용 처리)
  if (evaluation.tier === 'APPROVAL') {
    await db.update(transactions)
      .set({ status: 'CANCELLED', tier: 'APPROVAL', error: 'X402_APPROVAL_REQUIRED' })
      .where(eq(transactions.id, txId));
    throw new WAIaaSError('X402_APPROVAL_REQUIRED');
  }

  if (evaluation.tier === 'DELAY') {
    const delaySeconds = evaluation.delaySeconds ?? config.security.policy_defaults_delay_seconds;
    const requestTimeout = config.x402?.request_timeout ?? 30;
    if (delaySeconds > requestTimeout) {
      await db.update(transactions)
        .set({ status: 'CANCELLED', tier: 'DELAY', error: 'X402_DELAY_TIMEOUT' })
        .where(eq(transactions.id, txId));
      throw new WAIaaSError('X402_DELAY_TIMEOUT');
    }
    // delaySeconds <= requestTimeout -> 대기 후 계속
    await sleep(delaySeconds * 1000);
  }

  // 5f. tier 업데이트
  await db.update(transactions)
    .set({ tier: evaluation.tier })
    .where(eq(transactions.id, txId));

  // 6. 결제 서명 + 재요청 실행 (handleX402Fetch)
  const result = await handleX402Fetch(body, deps);

  // 7. 성공: DB 업데이트 (CONFIRMED)
  await db.update(transactions)
    .set({ status: 'CONFIRMED', executedAt: new Date(...) })
    .where(eq(transactions.id, txId));

  // 8. TX_CONFIRMED 알림 (fire-and-forget)
  void notificationService?.notify('TX_CONFIRMED', walletId, {
    txHash: '',
    amount: paymentAmount,
    to: payTo,
  }, { txId });

  // 9. 응답 반환
  return c.json(result, 200);
}
```

### Pattern 3: 트랜잭션 기록 (type=X402_PAYMENT)

**What:** x402 결제를 기존 transactions 테이블에 기록한다. 기존 TRANSACTION_TYPES에 'X402_PAYMENT'이 이미 포함되어 있음 (Phase 130에서 추가됨).

**When to use:** x402 결제 시작 시 INSERT, 완료/실패 시 UPDATE.

**DB 레코드 구조:**

```typescript
// transactions INSERT 시
{
  id: generateId(),           // UUID v7
  walletId,
  chain: resolvedChain,       // 'ethereum' 또는 'solana'
  network: resolvedNetwork,   // WAIaaS NetworkType (e.g., 'base-mainnet')
  type: 'X402_PAYMENT',       // 기존 TRANSACTION_TYPES에 포함
  status: 'PENDING',          // PENDING -> CONFIRMED or FAILED
  amount: paymentAmount,      // 결제 금액 (raw units)
  toAddress: payTo,           // 수신자 주소
  sessionId,                  // 감사 추적
  metadata: JSON.stringify({
    target_url: requestUrl,   // 결제 대상 URL
    payment_amount: amount,   // 결제 금액 (원래 문자열)
    network: caip2Network,    // CAIP-2 네트워크 (e.g., 'eip155:8453')
    asset: assetAddress,      // 결제 토큰 주소
    scheme: 'exact',          // x402 결제 스킴
  }),
  createdAt: new Date(...),
}
```

### Pattern 4: config.toml [x402] 섹션 (X4API-03)

**What:** DaemonConfigSchema에 x402 섹션을 추가한다.

**구현:**

```typescript
// infrastructure/config/loader.ts DaemonConfigSchema에 추가
x402: z.object({
  enabled: z.boolean().default(true),
  request_timeout: z.number().int().min(5).max(120).default(30),
}).default({}),

// KNOWN_SECTIONS에 'x402' 추가
const KNOWN_SECTIONS = [
  'daemon', 'keystore', 'database', 'rpc',
  'notifications', 'security', 'walletconnect',
  'x402',  // 신규
] as const;
```

### Pattern 5: USDC USD 직접 환산 (X4POL-04)

**What:** x402 결제에서 USDC는 $1로 직접 환산하고, 기타 토큰은 IPriceOracle을 사용한다.

**구현:**

```typescript
/**
 * x402 결제 금액의 USD 환산.
 *
 * USDC/USDT (6 decimals 스테이블코인) -> $1 직접 환산
 * 기타 토큰 -> IPriceOracle.getPrice()
 */
function resolveX402UsdAmount(
  amount: string,
  asset: string,
  network: string,
  priceOracle?: IPriceOracle,
): number {
  // USDC 주소 확인 (USDC_DOMAINS 테이블에서 verifyingContract 비교)
  const usdcDomain = USDC_DOMAINS[network];
  if (usdcDomain && usdcDomain.verifyingContract.toLowerCase() === asset.toLowerCase()) {
    // USDC: 6 decimals, $1 직접 환산
    return Number(amount) / 1_000_000;
  }

  // 기타 토큰: IPriceOracle 사용 (없으면 0으로 간주 -> INSTANT 통과)
  // Phase 127의 resolveEffectiveAmountUsd 패턴 참조
  // ...
}
```

### Anti-Patterns to Avoid

- **DatabasePolicyEngine.evaluate() 내부에서 X402_ALLOWED_DOMAINS를 처리:** X402_ALLOWED_DOMAINS는 트랜잭션 정책이 아닌 x402 전용 도메인 정책이다. evaluate()의 TransactionParam에는 URL/도메인 정보가 없다. 라우트 핸들러에서 별도로 호출한다.
- **6-stage 파이프라인에 x402 로직 삽입:** v1.5.1 설계 결정에 따라 x402는 독립 파이프라인. stages.ts를 수정하지 않는다.
- **x402 결제마다 별도 세션 생성:** 기존 sessionAuth JWT를 그대로 사용한다. 세션의 walletId로 정책을 평가한다.
- **handleX402Fetch 내부에서 정책 평가:** 정책 평가는 handleX402Fetch 호출 전에 라우트 핸들러에서 수행한다. handleX402Fetch는 순수 HTTP 프록시 + 결제 서명 로직만 담당한다.
- **DELAY 대기를 delayQueue로 처리:** x402는 동기 HTTP 요청이므로 delayQueue(비동기 worker) 사용 불가. 라우트 핸들러에서 직접 sleep()으로 대기한다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SPENDING_LIMIT 평가 | x402 전용 지출 한도 | 기존 `evaluateAndReserve()` | TOCTOU 방지, 4-tier 분류, USD 평가 모두 이미 구현됨 |
| 도메인 URL 파싱 | 자체 URL 파서 | `new URL(url).hostname` | 표준 API. 포트, 프로토콜, path 분리 보장 |
| 트랜잭션 ID 생성 | 자체 UUID | `generateId()` (infrastructure/database/id.ts) | UUID v7 기반 ms-precision 시간 순서 보장 |
| 감사 로그 기록 | x402 전용 테이블 | 기존 `transactions` 테이블 (type=X402_PAYMENT) | 기존 알림 트리거, Admin UI, GET /transactions API 모두 호환 |
| 알림 발송 | x402 전용 알림 | 기존 `NotificationService.notify()` | TX_REQUESTED/TX_CONFIRMED/TX_FAILED 이벤트 이미 정의됨 |
| OpenAPI 스키마 | 자체 스키마 | `z.from(@hono/zod-openapi)` + `createRoute()` | 기존 라우트 패턴과 일관성 |
| 정책 override 해석 | 자체 override 로직 | DatabasePolicyEngine.resolveOverrides() | 4-level 우선순위 (wallet+network > wallet+null > global+network > global+null) 이미 구현 |

**Key insight:** Phase 132의 핵심은 "신규 구현"이 아닌 "기존 인프라 통합"이다. evaluateAndReserve, NotificationService, transactions 테이블, OpenAPIHono createRoute 모두 검증된 패턴이 존재하며, 이를 x402 흐름에 맞게 조합한다.

## Common Pitfalls

### Pitfall 1: X402_ALLOWED_DOMAINS 평가 위치

**What goes wrong:** DatabasePolicyEngine.evaluate() 내부에서 X402_ALLOWED_DOMAINS를 평가하려 하면, TransactionParam 인터페이스에 URL/도메인 필드가 없어 정보 전달이 불가능하다.

**Why it happens:** 기존 정책 평가 흐름은 트랜잭션 정보(type, amount, toAddress, chain)를 기반으로 하며, HTTP URL/도메인은 트랜잭션 속성이 아니다.

**How to avoid:** X402_ALLOWED_DOMAINS 평가를 DatabasePolicyEngine의 별도 public 메서드로 구현하거나, 라우트 핸들러에서 독립적으로 수행한다. policies 테이블에서 직접 조회하여 도메인 매칭을 수행한다. evaluate()/evaluateAndReserve()는 SPENDING_LIMIT 평가에만 사용한다.

**Warning signs:** TransactionParam에 `domain?: string` 필드를 추가하려는 시도.

### Pitfall 2: DELAY 타임아웃 계산 오류

**What goes wrong:** SPENDING_LIMIT에서 반환된 delaySeconds(예: 300초)가 x402 request_timeout(기본 30초)보다 긴 경우, 단순히 sleep(300000)을 호출하면 HTTP 타임아웃이 먼저 발생하여 클라이언트 측 에러가 된다.

**Why it happens:** 기존 DELAY 처리(stages.ts Stage 4)는 비동기 파이프라인에서 delayQueue를 사용하므로 HTTP 타임아웃이 문제되지 않는다. x402는 동기 HTTP이므로 request_timeout 내에서만 대기 가능하다.

**How to avoid:**
1. delaySeconds > request_timeout -> 즉시 X402_DELAY_TIMEOUT 거부
2. delaySeconds <= request_timeout -> sleep(delaySeconds * 1000) 후 계속
3. request_timeout은 config.x402.request_timeout에서 읽되, safeFetchWithRedirects의 timeout과는 별도 (safeFetch timeout은 외부 HTTP 요청 타임아웃, request_timeout은 DELAY 대기 허용 시간)

**Warning signs:** delaySeconds와 request_timeout 비교 없이 무조건 sleep하는 코드.

### Pitfall 3: evaluateAndReserve에서 x402 결제 금액의 TransactionParam.type 설정

**What goes wrong:** x402 결제를 evaluateAndReserve에 전달할 때 type='X402_PAYMENT'으로 설정하면, ALLOWED_TOKENS, CONTRACT_WHITELIST 등 type-specific 정책이 트리거되어 의도하지 않은 거부가 발생할 수 있다.

**Why it happens:** evaluateAllowedTokens()는 type='TOKEN_TRANSFER'에만 적용되고, evaluateContractWhitelist()는 type='CONTRACT_CALL'에만 적용된다. 'X402_PAYMENT'은 어떤 type-specific 정책에도 매칭되지 않으므로 WHITELIST와 SPENDING_LIMIT만 적용된다.

**How to avoid:** evaluateAndReserve에 전달하는 TransactionParam의 type을 'TRANSFER'로 설정한다. x402 결제의 본질은 "특정 주소로 특정 금액의 토큰을 전송"이므로 TRANSFER와 동일한 정책 경로를 탄다. 이렇게 하면 WHITELIST(toAddress 검증)와 SPENDING_LIMIT(금액 검증)만 적용되며, TOKEN_TRANSFER/CONTRACT_CALL 전용 정책은 건너뛴다.

**Warning signs:** type='X402_PAYMENT'으로 evaluateAndReserve를 호출하는 코드 (정상 동작하지만 의도와 다른 정책 경로 가능성).

### Pitfall 4: 리다이렉트 후 도메인 변경 시 X402_ALLOWED_DOMAINS 재검증 누락

**What goes wrong:** 초기 URL이 `api.example.com` (허용 도메인)이지만, 302 리다이렉트로 `evil.com`으로 이동한 경우, SSRF 가드는 통과하지만 도메인 정책은 재검증되지 않아 비허용 도메인에서 402 결제가 발생할 수 있다.

**Why it happens:** X402_ALLOWED_DOMAINS 검증은 라우트 핸들러에서 초기 URL에 대해서만 수행되고, safeFetchWithRedirects 내부의 리다이렉트는 SSRF 가드만 재검증한다.

**How to avoid:** 두 가지 접근이 가능하다:
1. **간단한 접근 (권장):** 첫 요청의 도메인만 검증한다. 리다이렉트는 SSRF 가드로 안전성을 보장하고, 402 응답이 리다이렉트 후 도메인에서 발생하더라도 결제는 원래 도메인에 대한 것이므로 허용한다.
2. **엄격한 접근:** safeFetchWithRedirects에 도메인 콜백을 주입하여 리다이렉트마다 X402_ALLOWED_DOMAINS를 재검증한다. 과도한 보안으로 사용성을 해칠 수 있다.

**Warning signs:** 리다이렉트 도메인 변경 시나리오에 대한 테스트가 없는 경우.

### Pitfall 5: reserved_amount 해제 누락

**What goes wrong:** evaluateAndReserve로 금액을 예약한 후 x402 결제가 실패(X402_PAYMENT_REJECTED, X402_SERVER_ERROR 등)하면, reserved_amount가 해제되지 않아 세션의 누적 지출이 영구적으로 증가한다.

**Why it happens:** 기존 6-stage 파이프라인에서는 FAILED 상태 전환 시 releaseReservation이 호출되지만, x402 독립 파이프라인에서는 이 로직이 명시적으로 구현되어야 한다.

**How to avoid:** x402 라우트 핸들러의 catch 블록에서 실패 시 반드시 `policyEngine.releaseReservation(txId)`를 호출한다. 또한 트랜잭션 상태를 FAILED로 업데이트하여 reserved_amount가 자연스럽게 무효화되도록 한다.

**Warning signs:** try-catch에서 에러 발생 시 reserved_amount 해제 코드가 없는 경우.

### Pitfall 6: handleX402Fetch 실행 전 vs 후의 정책 평가 순서

**What goes wrong:** handleX402Fetch를 먼저 호출하면 402 응답에서 결제 금액을 알 수 있지만, 이미 외부 HTTP 요청이 실행된 상태이므로 정책 거부 시에도 외부 서버에 요청이 전송된 것이다.

**Why it happens:** x402에서 결제 금액은 402 응답의 PaymentRequirements에서 알 수 있다. 따라서 SPENDING_LIMIT 평가는 402 응답 파싱 후에만 가능하다.

**How to avoid:** 2단계 접근:
1. **1단계 (결제 전):** X402_ALLOWED_DOMAINS 도메인 검증 + Kill Switch 검증
2. **2단계 (402 파싱 후):** PaymentRequirements에서 금액 추출 -> SPENDING_LIMIT evaluateAndReserve -> DELAY/APPROVAL 분기 -> 결제 서명 생성 + 재요청

이 순서는 handleX402Fetch를 2단계로 분리해야 함을 의미한다: (a) 초기 HTTP 요청 + 402 파싱, (b) 정책 평가 후 결제 서명 + 재요청. 또는 handleX402Fetch에 정책 평가 콜백을 주입한다.

**Warning signs:** handleX402Fetch가 내부에서 결제까지 모두 처리하고, 정책 평가 개입 지점이 없는 경우.

## Code Examples

### POST /v1/x402/fetch 라우트 정의 (OpenAPIHono createRoute)

```typescript
// Source: 기존 transactionRoutes, sign-only 패턴 참조
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { X402FetchRequestSchema, X402FetchResponseSchema } from '@waiaas/core';

const x402FetchRoute = createRoute({
  method: 'post',
  path: '/x402/fetch',
  tags: ['x402'],
  summary: 'Fetch URL with x402 auto-payment',
  description:
    'Proxy an HTTP request to an external URL. If the server responds with ' +
    'HTTP 402, automatically sign a payment and retry. Policy evaluation ' +
    '(X402_ALLOWED_DOMAINS, SPENDING_LIMIT) is applied before payment.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            url: z.string().url(),
            method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
            headers: z.record(z.string()).optional(),
            body: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Response from the external server (with optional payment info)',
      content: {
        'application/json': {
          schema: z.object({
            status: z.number().int(),
            headers: z.record(z.string()),
            body: z.string(),
            payment: z.object({
              amount: z.string(),
              asset: z.string(),
              network: z.string(),
              payTo: z.string(),
              txId: z.string(),
            }).optional(),
          }),
        },
      },
    },
    ...buildErrorResponses([
      'X402_DISABLED',
      'X402_DOMAIN_NOT_ALLOWED',
      'X402_SSRF_BLOCKED',
      'X402_UNSUPPORTED_SCHEME',
      'X402_PAYMENT_REJECTED',
      'X402_DELAY_TIMEOUT',
      'X402_APPROVAL_REQUIRED',
      'X402_SERVER_ERROR',
      'WALLET_NOT_FOUND',
      'POLICY_DENIED',
    ]),
  },
});
```

### server.ts에 x402 라우트 등록 패턴

```typescript
// Source: 기존 transactionRoutes 등록 패턴 (server.ts line 270-296)
import { x402Routes } from './routes/x402.js';

// sessionAuth 등록 (기존 패턴 확장)
if (deps.jwtSecretManager && deps.db) {
  const sessionAuth = createSessionAuth({ ... });
  app.use('/v1/x402/*', sessionAuth);
}

// x402 라우트 등록 (pipeline deps + x402 전용 deps)
if (deps.db && deps.keyStore && deps.masterPassword !== undefined && ...) {
  app.route('/v1', x402Routes({
    db: deps.db,
    sqlite: deps.sqlite,
    keyStore: deps.keyStore,
    policyEngine: deps.policyEngine,
    masterPassword: deps.masterPassword,
    config: deps.config,
    notificationService: deps.notificationService,
    priceOracle: deps.priceOracle,
    adapterPool: deps.adapterPool,
    settingsService: deps.settingsService,
  }));
}
```

### 알림 트리거 연동 패턴 (X4API-04)

```typescript
// Source: 기존 stages.ts TX_REQUESTED/TX_CONFIRMED/TX_FAILED 패턴

// 결제 시작 시 (트랜잭션 INSERT 직후)
void notificationService?.notify('TX_REQUESTED', walletId, {
  amount: paymentAmount,
  to: payTo,
  type: 'X402_PAYMENT',
}, { txId });

// 결제 성공 시 (handleX402Fetch 성공 후)
void notificationService?.notify('TX_CONFIRMED', walletId, {
  txHash: '', // x402는 클라이언트가 txHash를 모름 (facilitator가 정산)
  amount: paymentAmount,
  to: payTo,
}, { txId });

// 결제 실패 시 (catch 블록)
void notificationService?.notify('TX_FAILED', walletId, {
  reason: error.message,
  amount: paymentAmount,
}, { txId });

// 정책 거부 시 (도메인 거부 또는 SPENDING_LIMIT 거부)
void notificationService?.notify('POLICY_VIOLATION', walletId, {
  reason: evaluation.reason ?? 'Policy denied',
  amount: paymentAmount,
  to: payTo,
  policyType: 'X402_ALLOWED_DOMAINS',
}, { txId });
```

### handleX402Fetch 2단계 분리 패턴 (Pitfall 6 해결)

```typescript
// x402-handler.ts에서 1단계와 2단계를 분리하는 대안

// Option A: 콜백 주입 (권장)
export async function handleX402Fetch(
  request: X402FetchRequest,
  deps: X402HandlerDeps & {
    onPaymentRequired?: (requirement: PaymentRequirements) => Promise<void>;
  },
): Promise<X402FetchResponse> {
  // ... 초기 요청 + 402 파싱 ...

  // 402 감지 시 콜백 호출 (정책 평가)
  if (deps.onPaymentRequired) {
    await deps.onPaymentRequired(selected);
    // 콜백이 throw하면 결제 중단
  }

  // ... 결제 서명 + 재요청 ...
}

// Option B: 단계 함수 분리 (더 명시적)
// step1: 초기 요청 + 402 파싱 -> PaymentRequirements 반환
// step2: 정책 평가 (라우트 핸들러)
// step3: 결제 서명 + 재요청 -> X402FetchResponse 반환
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| x402 전용 지출 한도 | 기존 SPENDING_LIMIT 통합 | v1.5.1 설계 결정 | 정책 이중화 방지, 일관된 4-tier 체계 |
| config.toml 도메인 리스트 | DB 정책(X402_ALLOWED_DOMAINS) | v1.5.1 설계 결정 | 동적 관리(데몬 재시작 불필요), 월렛별 차별화 |
| 6-stage pipeline 확장 | 독립 파이프라인 + sign-only 패턴 | v1.5.1 설계 결정 | 동기 HTTP 제약에 맞는 DELAY/APPROVAL 처리 |

**Deprecated/outdated:**
- 없음 (Phase 131 결과물이 이미 최신 패턴 적용됨)

## Open Questions

1. **handleX402Fetch 정책 평가 삽입 지점의 구현 방식**
   - What we know: handleX402Fetch는 현재 모놀리식 구조. 402 파싱 후 정책 평가를 삽입하려면 함수를 분리하거나 콜백을 주입해야 한다.
   - What's unclear: 기존 handleX402Fetch를 수정해야 하는지, 라우트 핸들러에서 handleX402Fetch의 하위 함수(parse402Response, selectPaymentRequirement, signPayment)를 직접 호출하는 것이 나은지.
   - Recommendation: handleX402Fetch는 Phase 131 구현을 최대한 보존하고, 라우트 핸들러에서 2단계 오케스트레이션을 직접 구현한다. handleX402Fetch의 내부 함수(parse402Response, selectPaymentRequirement)가 이미 export되어 있으므로 이를 활용한다. [MEDIUM confidence]

2. **x402 결제의 txHash 처리**
   - What we know: x402에서 클라이언트는 on-chain txHash를 모른다. facilitator가 비동기로 정산하며, 정산 결과는 X-PAYMENT-RESPONSE 헤더로 반환될 수 있다.
   - What's unclear: 리소스 서버의 재요청 응답에서 X-PAYMENT-RESPONSE 헤더가 제공되는 경우 이를 파싱하여 txHash를 추출해야 하는지.
   - Recommendation: X-PAYMENT-RESPONSE 헤더가 있으면 파싱하여 metadata에 저장하지만, txHash 컬럼은 null로 유지한다. 트랜잭션 해시가 없어도 transactions 테이블의 기존 스키마(txHash nullable)와 호환된다. [HIGH confidence]

3. **Solana x402 결제 시 RPC 클라이언트 획득**
   - What we know: signSolanaTransferChecked는 rpc 파라미터(getLatestBlockhash)가 필요하다. 라우트 핸들러에서 AdapterPool.resolve()로 adapter를 얻을 수 있지만, adapter의 내부 RPC 클라이언트를 직접 노출하는 것은 캡슐화 위반이다.
   - What's unclear: SolanaAdapter에서 RPC 클라이언트를 가져오는 안전한 방법이 있는지, 또는 별도로 RPC 클라이언트를 생성해야 하는지.
   - Recommendation: SolanaAdapter가 사용하는 것과 동일한 RPC URL로 별도 RPC 클라이언트를 생성한다. AdapterPool.resolve()에서 반환된 adapter의 타입을 확인하여 Solana인 경우 RPC URL을 resolveRpcUrl로 별도 해석한다. [HIGH confidence]

## Sources

### Primary (HIGH confidence)

- **WAIaaS 코드베이스 직접 검증:**
  - `packages/daemon/src/pipeline/database-policy-engine.ts` -- evaluateAndReserve, resolveOverrides, 11개 정책 타입 평가 패턴
  - `packages/daemon/src/pipeline/stages.ts` -- 6-stage 파이프라인, stage3Policy 정책 평가, 알림 트리거 패턴
  - `packages/daemon/src/pipeline/sign-only.ts` -- 독립 파이프라인, DELAY/APPROVAL 즉시 거부 패턴
  - `packages/daemon/src/api/routes/transactions.ts` -- OpenAPIHono createRoute, sessionAuth, TransactionRouteDeps 패턴
  - `packages/daemon/src/api/server.ts` -- 라우트 등록, 미들웨어 순서, sessionAuth 경로 매핑
  - `packages/daemon/src/notifications/notification-service.ts` -- notify() API, 이벤트 타입, fire-and-forget 패턴
  - `packages/daemon/src/api/middleware/kill-switch-guard.ts` -- Kill Switch가 /v1/admin/ 제외 전체 차단
  - `packages/daemon/src/api/middleware/session-auth.ts` -- createSessionAuth factory, walletId/sessionId context 설정
  - `packages/daemon/src/infrastructure/config/loader.ts` -- DaemonConfigSchema, KNOWN_SECTIONS, 환경변수 오버라이드
  - `packages/daemon/src/infrastructure/database/schema.ts` -- transactions 테이블 스키마, type CHECK 제약
  - `packages/daemon/src/services/x402/x402-handler.ts` -- handleX402Fetch, parse402Response (export), selectPaymentRequirement (export)
  - `packages/daemon/src/services/x402/payment-signer.ts` -- signPayment, USDC_DOMAINS 상수
  - `packages/daemon/src/services/x402/ssrf-guard.ts` -- validateUrlSafety, safeFetchWithRedirects
  - `packages/core/src/enums/policy.ts` -- POLICY_TYPES에 'X402_ALLOWED_DOMAINS' 이미 포함
  - `packages/core/src/enums/transaction.ts` -- TRANSACTION_TYPES에 'X402_PAYMENT' 이미 포함
  - `packages/core/src/enums/notification.ts` -- NOTIFICATION_EVENT_TYPES 21개 (TX_REQUESTED, TX_CONFIRMED, TX_FAILED 포함)
  - `packages/core/src/errors/error-codes.ts` -- X402 도메인 에러 8개 (X402_DISABLED ~ X402_SERVER_ERROR) 이미 정의
  - `packages/core/src/interfaces/x402.types.ts` -- X402FetchRequestSchema, X402FetchResponseSchema, CAIP2_TO_NETWORK 매핑
  - `packages/daemon/src/pipeline/resolve-effective-amount-usd.ts` -- USD 환산 패턴, USDC $1 직접 환산 참조

- **Phase 131 연구:**
  - `.planning/phases/131-ssrf-guard-x402-handler-payment-signing/131-RESEARCH.md` -- SSRF 가드, x402 핸들러, 결제 서명 연구

- **v1.5.1 마일스톤 문서:**
  - `objectives/v1.5.1-x402-client.md` -- 기술 결정 9개, E2E 검증 시나리오 23개, 파일 구조

### Secondary (MEDIUM confidence)

- **v1.5.1 연구 파일:**
  - `.planning/research/v1.5.1-x402-client-STACK.md` -- 기술 스택 분석
  - `.planning/research/v1.5.1-x402-client-ARCHITECTURE.md` -- 아키텍처 결정
  - `.planning/research/v1.5.1-x402-client-PITFALLS.md` -- 15개 함정

### Tertiary (LOW confidence)

- 없음

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 모든 라이브러리가 기존 설치/사용 중. 신규 의존성 없음.
- Architecture: HIGH -- 기존 코드 패턴(transactionRoutes, sign-only, DatabasePolicyEngine)을 직접 검증하고, x402 흐름에 맞게 조합 방법을 도출.
- Pitfalls: HIGH -- 코드베이스의 실제 구현을 기반으로 x402 통합 시 발생할 수 있는 구체적 문제를 식별. evaluateAndReserve의 TransactionParam 구조, DELAY/APPROVAL 처리 차이, reserved_amount 해제 등.
- Code examples: HIGH -- 기존 코드(transactions.ts, stages.ts, sign-only.ts, database-policy-engine.ts)에서 직접 추출한 패턴에 x402 맥락을 적용.

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (x402 프로토콜 자체는 안정적이나, WAIaaS 코드베이스 변경 시 재검증 필요)
