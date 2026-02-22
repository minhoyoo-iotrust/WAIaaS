# 마일스톤 m27-03: 토큰별 지출 한도 정책

- **Status:** SHIPPED
- **Milestone:** v27.3
- **Completed:** 2026-02-22

## 목표

SPENDING_LIMIT 정책의 네이티브 금액 임계값(`instant_max`/`notify_max`/`delay_max`)이 raw 단위(lamports/wei)로 모든 토큰에 동일하게 적용되는 문제를 해결한다. USD 기반 임계값을 주 정책으로 유지하면서, 토큰별 사람 읽기 단위의 금액 한도를 선택적으로 추가할 수 있도록 확장한다.

---

## 배경

### 현재 한계

`instant_max`, `notify_max`, `delay_max`는 **required** 필드이며 raw 단위 문자열(`"1000000000"`)로 저장된다. 이 값은 토큰의 decimal을 고려하지 않고 BigInt 비교하므로, 동일 임계값이 체인/토큰별로 전혀 다른 금액을 의미한다:

| 토큰 | Decimals | `"1000000000"` 의미 | USD 환산 |
|------|----------|-------------------|---------|
| SOL | 9 | 1 SOL | ~$150 |
| ETH | 18 | 0.000000001 ETH | ~$0 |
| USDC (ERC-20) | 6 | 1,000 USDC | ~$1,000 |
| POL | 18 | 0.000000001 POL | ~$0 |

v1.5.3에서 USD 기반 임계값(`instant_max_usd` 등)을 추가하여 부분적으로 해결했으나, raw 단위 필드가 여전히 **required**이고 모든 정책 평가에서 `maxTier(네이티브, USD)`로 합산되므로:

1. **USD만 사용하고 싶어도** raw 필드를 반드시 채워야 한다
2. **토큰별 절대량 제한** 불가 — 가격 변동과 무관하게 "SOL은 건당 10개까지"를 설정할 수 없다
3. **Admin UI가 lamports/wei 입력**을 요구하여 관리자 실수 유발

### 관련 코드

| 위치 | 역할 |
|------|------|
| `core/schemas/policy.schema.ts:71-90` | SpendingLimitRulesSchema (Zod SSoT) |
| `daemon/pipeline/database-policy-engine.ts:1277-1306` | `evaluateSpendingLimit()` — 티어 결정 진입점 |
| `daemon/pipeline/database-policy-engine.ts:1311-1325` | `evaluateNativeTier()` — raw BigInt 비교 |
| `daemon/pipeline/database-policy-engine.ts:1339-1350` | `evaluateUsdTier()` — USD 비교 |
| `daemon/pipeline/database-policy-engine.ts:112-131` | `TransactionParam` 인터페이스 — 정책 평가 입력 (3곳 중복 정의) |
| `daemon/pipeline/stages.ts:177-189` | `TransactionParam` 인터페이스 (중복 #2) + `buildTransactionParam()` 구성 함수 |
| `daemon/pipeline/sign-only.ts:84-95` | `TransactionParam` 인터페이스 (중복 #3) + `mapOperationToParam()` |
| `daemon/pipeline/resolve-effective-amount-usd.ts:53-56` | `NATIVE_DECIMALS` 매핑 (solana:9, ethereum:18) |
| `adapters/evm/src/evm-chain-map.ts:19-28` | 네트워크별 `nativeSymbol` 매핑 (ETH, POL 등) |
| `core/schemas/transaction.schema.ts:55-60` | `TokenInfoSchema` — `decimals` 필드 (TOKEN_TRANSFER 요청) |
| `admin/components/policy-forms/spending-limit-form.tsx` | Admin UI 정책 폼 |

**`evaluateSpendingLimit()` 호출부 (3곳):**

| 위치 | 맥락 | 현재 시그니처 |
|------|------|-------------|
| `database-policy-engine.ts:256` | 단건 평가 (evaluateSingle) | `(resolved, transaction.amount)` — usdAmount 없음 |
| `database-policy-engine.ts:359` | BATCH 집계 평가 | `(resolved, totalNativeAmount.toString(), batchUsdAmount)` |
| `database-policy-engine.ts:569` | reserved amount + current | `(resolved, effectiveAmount.toString(), usdAmount)` |

---

## 설계

### 1. 스키마 변경

**기존 raw 필드를 optional로 전환하고, `token_limits` 필드를 추가한다.**

```typescript
// core/schemas/policy.schema.ts
const TokenLimitSchema = z.object({
  instant_max: z.string().regex(/^\d+(\.\d+)?$/),  // 사람 읽기 단위 (예: "1.5", "1000")
  notify_max: z.string().regex(/^\d+(\.\d+)?$/),
  delay_max: z.string().regex(/^\d+(\.\d+)?$/),
});

export const SpendingLimitRulesSchema = z.object({
  // --- 기존 raw 필드: optional로 전환 (하위 호환) ---
  instant_max: z.string().regex(/^\d+$/).optional(),   // deprecated
  notify_max: z.string().regex(/^\d+$/).optional(),     // deprecated
  delay_max: z.string().regex(/^\d+$/).optional(),      // deprecated

  // --- USD 기반 (주 정책, 변경 없음) ---
  instant_max_usd: z.number().nonnegative().optional(),
  notify_max_usd: z.number().nonnegative().optional(),
  delay_max_usd: z.number().nonnegative().optional(),
  daily_limit_usd: z.number().positive().optional(),
  monthly_limit_usd: z.number().positive().optional(),

  // --- 토큰별 한도 (신규) ---
  token_limits: z.record(            // 키: CAIP-19 asset ID 또는 "native:{chain}"
    z.string(),
    TokenLimitSchema,
  ).optional(),

  delay_seconds: z.number().int().min(60).default(900),
});
```

**`token_limits` 키 규칙 — CAIP-19 기반:**

v27.2에서 도입한 CAIP-19 자산 식별 체계와 일관성을 유지한다. `ALLOWED_TOKENS` 정책이 이미 CAIP-19 4-시나리오 매칭을 사용하므로, `token_limits`도 동일 체계를 채택한다.

| 키 형식 | 예시 | 의미 |
|---------|------|------|
| `"native:{chain}"` | `"native:solana"`, `"native:ethereum"` | 특정 체인의 네이티브 토큰 |
| `"native"` | `"native"` | 정책의 network가 단일 체인일 때 네이티브 토큰 (축약형) |
| CAIP-19 asset ID | `"solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"` | 특정 체인의 특정 토큰 |

- 금액은 **사람 읽기 단위** (decimal 적용 후) — `"1.5"` = 1.5 SOL, `"1000"` = 1,000 USDC
- `"native"` 축약형은 정책의 `network` 필드로 체인을 결정할 수 있을 때만 유효
- `network=null` (전체 네트워크) 정책에서 네이티브 한도를 설정하려면 `"native:{chain}"` 형식 사용
- CAIP-19 키를 사용하면 동일 주소가 다른 체인에서 다른 토큰을 가리키는 모호성 해소

**키 매칭 순서 (평가 시):**
```
1. 정확한 CAIP-19 asset ID 매칭
2. "native:{chain}" 매칭 (TRANSFER 시)
3. "native" 축약형 매칭 (TRANSFER 시, 정책에 network 설정됨)
4. 매칭 없음 → raw 필드 폴백
```

**superRefine 검증 규칙 (순수 검증만):**
- `instant_max_usd`/`notify_max_usd`/`delay_max_usd`, `token_limits`, `instant_max`/`notify_max`/`delay_max` 중 하나 이상은 설정되어야 한다
- `token_limits` 내 각 토큰의 `instant_max <= notify_max <= delay_max` 순서 검증
- `token_limits` 키가 `"native"`, `"native:{chain}"`, 또는 유효한 CAIP-19 형식인지 검증

### 2. 평가 로직 변경

**`TransactionParam` 인터페이스 확장:**

현재 `TransactionParam`에는 `tokenDecimals` 필드가 없다. `token_limits` 평가에 필요한 정보를 전달하기 위해 다음 필드를 추가한다:

```typescript
interface TransactionParam {
  // ... 기존 필드 ...
  /** Token decimals for token_limits human-readable conversion (TOKEN_TRANSFER/APPROVE only). */
  tokenDecimals?: number;
}
```

> **주의: `TransactionParam` 인터페이스가 3곳에 중복 정의되어 있으므로 모두 동기화해야 한다:**
> - `database-policy-engine.ts:112` — 정책 엔진 내부
> - `stages.ts:177` — 파이프라인 스테이지
> - `sign-only.ts:84` — 임의 서명 경로

**`TransactionParam` 구성부 변경:**

| 구성 함수 | 파일 | 변경 |
|----------|------|------|
| `buildTransactionParam()` | `stages.ts:191` | TOKEN_TRANSFER/APPROVE 케이스에서 `req.token.decimals`를 `tokenDecimals`로 전달 |
| `mapOperationToParam()` | `sign-only.ts:112` | TOKEN_TRANSFER 케이스에서 `op.decimals`를 `tokenDecimals`로 전달 (ParsedOperation에 decimals 정보가 없으면, token_limits 평가 시 CAIP-19 키 매칭만 수행하고 decimal 변환은 스킵) |

**`evaluateSpendingLimit()` 시그니처 확장:**

현재 시그니처 `(resolved, amount, usdAmount?)`에 트랜잭션 컨텍스트를 추가한다:

```typescript
private evaluateSpendingLimit(
  resolved: PolicyRow[],
  amount: string,
  usdAmount?: number,
  tokenContext?: {
    type: string;
    tokenAddress?: string;
    tokenDecimals?: number;
    chain?: string;
    assetId?: string;       // CAIP-19 asset ID (token_limits 키 매칭용)
    policyNetwork?: string; // 정책의 network 필드 ("native" 축약형 해석용)
  },
): PolicyEvaluation | null
```

**호출부별 tokenContext 전달:**

| 호출부 (line) | tokenContext 구성 |
|-------------|----------------|
| `:256` (단건) | `{ type: transaction.type, tokenAddress: transaction.tokenAddress, tokenDecimals: transaction.tokenDecimals, chain: transaction.chain, assetId: transaction.assetId, policyNetwork: spending.network }` |
| `:359` (BATCH) | `undefined` — BATCH는 token_limits 미적용 (시그니처 호환을 위해 4번째 인자 생략) |
| `:569` (reserved) | 단건과 동일한 tokenContext 전달 |

**평가 흐름:**

```
1. USD 티어 평가 (기존 로직 유지)
2. 토큰별 티어 평가 (evaluateTokenTier — 신규 함수):
   a. token_limits에서 해당 토큰 키 조회 (CAIP-19 매칭 순서):
      - TRANSFER → "native:{chain}" → "native" 폴백
      - TOKEN_TRANSFER → CAIP-19 asset ID 정확 매칭
      - APPROVE → CAIP-19 asset ID 정확 매칭 (승인 대상 토큰)
      - CONTRACT_CALL → token_limits 미적용 (amount는 네이티브 value)
      - BATCH → token_limits 미적용 (합산 금액에 대해 기존 raw/USD로만 평가)
   b. 매칭되는 token_limit 있으면:
      - 트랜잭션 raw amount를 decimal로 나눠 사람 읽기 단위로 변환
      - token_limit의 instant_max/notify_max/delay_max와 비교
   c. 매칭 없으면:
      - 기존 raw 필드(instant_max/notify_max/delay_max) 폴백 (있을 때만)
3. 최종 per-tx 티어 = maxTier(USD 티어, 토큰별 티어)
4. 누적 티어 평가는 별도 코드 블록 (line 575+)에서 수행 — 변경 없음
5. 최종 티어 = maxTier(per-tx 티어, 누적 티어)
```

**APPROVE_TIER_OVERRIDE와의 상호작용:**

현재 코드에서 `APPROVE_TIER_OVERRIDE`가 설정된 APPROVE 트랜잭션은 `evaluateSpendingLimit()`을 **건너뛴다** (line 250-252: `return approveTierResult; // FINAL result, skips SPENDING_LIMIT`). 따라서:

- `APPROVE_TIER_OVERRIDE` 있음 → **token_limits 무시됨** (기존 동작 유지, OVERRIDE가 최종 결과)
- `APPROVE_TIER_OVERRIDE` 없음 → token_limits 포함 SPENDING_LIMIT 정상 평가

이는 의도된 동작이다. APPROVE_TIER_OVERRIDE는 "모든 APPROVE에 강제 티어 부여"라는 목적으로 설계되었으므로, token_limits보다 우선하는 것이 올바르다.

**트랜잭션 타입별 token_limits 적용 규칙:**

| 타입 | token_limits 키 | decimal 소스 | 비고 |
|------|----------------|-------------|------|
| TRANSFER | `"native:{chain}"` or `"native"` | `NATIVE_DECIMALS[chain]` | 네이티브 전송 |
| TOKEN_TRANSFER | CAIP-19 asset ID | `TransactionParam.tokenDecimals` | 토큰 전송 |
| APPROVE | CAIP-19 asset ID | `TransactionParam.tokenDecimals` | 토큰 승인 금액 |
| CONTRACT_CALL | 미적용 | — | value는 네이티브, raw 폴백만 사용 |
| BATCH | 미적용 | — | 합산 금액에 대해 USD/raw만 평가 |

**decimal 정보 소스:**
- 네이티브 토큰: `NATIVE_DECIMALS` 매핑 (solana:9, ethereum:18) — 이미 존재
- 컨트랙트 토큰: `TransactionParam.tokenDecimals` — TOKEN_TRANSFER/APPROVE 시 요청의 `token.decimals`에서 전달

### 3. Admin UI 변경

**spending-limit-form.tsx 재구성:**

```
┌─ Spending Limit Policy ─────────────────────────────────┐
│                                                          │
│  ── USD Tiers (applies to all tokens) ──────────────     │
│  Instant Max USD  [100    ]                              │
│  Notify Max USD   [500    ]                              │
│  Delay Max USD    [5000   ]                              │
│                                                          │
│  ── Cumulative USD Limits ──────────────────────────     │
│  Daily Limit USD  [10000  ]  (24h rolling)               │
│  Monthly Limit USD [50000 ]  (30d rolling)               │
│                                                          │
│  ── Token-Specific Limits (Optional) ───────────────     │
│                                                          │
│  ┌ Native Token (SOL / ETH / POL) ─────────────────┐    │
│  │ Instant Max  [1.0   ] SOL                        │    │
│  │ Notify Max   [5.0   ] SOL                        │    │
│  │ Delay Max    [50.0  ] SOL                        │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  [+ Add Token Limit]                                     │
│  ┌ USDC (solana:.../token:EPjFWdd5...Dt1v) ──────────┐  │
│  │ Instant Max  [1000  ] USDC                 [✕]    │  │
│  │ Notify Max   [5000  ] USDC                        │  │
│  │ Delay Max    [50000 ] USDC                        │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ── Delay Duration ─────────────────────────────────     │
│  Delay Seconds    [900   ]  (min 60)                     │
│                                                          │
│  ── Legacy Native Tiers (deprecated) ───────────────     │
│  ⓘ These raw-unit fields are deprecated.                 │
│    Use Token-Specific Limits above instead.              │
│  Instant Max (lamports/wei)  [1000000000 ]               │
│  Notify Max (lamports/wei)   [10000000000]               │
│  Delay Max (lamports/wei)    [50000000000]               │
└──────────────────────────────────────────────────────────┘
```

**네이티브 토큰 심볼 표시:**
- 정책의 `network` 필드로 체인 판별 → `evm-chain-map.ts`의 `nativeSymbol` 참조
- `network === null` (전체 네트워크 적용) → "SOL / ETH / POL" 복수 표시
- Solana 네트워크 → "SOL"
- `ethereum-*` / `arbitrum-*` / `optimism-*` / `base-*` → "ETH"
- `polygon-*` → "POL"

**토큰 추가 UX:**
- "+ Add Token Limit" 버튼 → 토큰 레지스트리에서 선택 or CAIP-19 ID 직접 입력
- 토큰 레지스트리(`builtin-tokens.ts`)에 등록된 토큰은 심볼+이름 자동 표시, CAIP-19 ID 자동 생성
- 미등록 토큰은 CAIP-19 ID만 표시

### 4. 하위 호환 전략

| 단계 | 변경 | 기존 정책 영향 |
|------|------|--------------|
| **Zod 스키마** | `instant_max`/`notify_max`/`delay_max` → optional | 기존 값 유지, 신규 생성 시 미입력 가능 |
| **평가 로직** | `token_limits` 있으면 우선, 없으면 raw 폴백 | 기존 정책은 raw 폴백으로 동일 동작 |
| **Admin UI** | Legacy 섹션으로 이동, deprecated 안내 | 기존 값 편집 가능, 신규는 token_limits 유도 |
| **DB** | 변경 없음 | `rules` JSON 컬럼에 optional 필드 추가뿐 |
| **API** | 요청/응답 스키마에 `token_limits` optional 추가 | 기존 클라이언트 영향 없음 |

**런타임 평가 우선순위:**
```
1. token_limits에서 CAIP-19 키 매칭 → 사람 읽기 단위로 비교
2. token_limits 매칭 없음 + raw 필드 있음 → 기존 raw BigInt 비교 (폴백)
3. 둘 다 없음 → 네이티브 티어 평가 스킵, USD만으로 판정
```

---

## 수정 범위

### 1. Zod 스키마 (`packages/core`)

- `policy.schema.ts` — `TokenLimitSchema` 추가, raw 필드 optional 전환, superRefine 검증
- `policy.schema.ts` — `SpendingLimitRulesSchema` 타입 변경에 따른 export 갱신

### 2. 정책 엔진 + 파이프라인 (`packages/daemon`)

- `database-policy-engine.ts` — `TransactionParam` 인터페이스에 `tokenDecimals?: number` 추가
- `database-policy-engine.ts` — `evaluateSpendingLimit()` 시그니처 확장 (`tokenContext` 파라미터 추가) + token_limits CAIP-19 키 조회 + decimal 변환 로직
- `database-policy-engine.ts` — `evaluateSpendingLimit()` 호출부 3곳 (line 256, 359, 569)에서 `tokenContext` 전달
- `database-policy-engine.ts` — `evaluateNativeTier()`: raw 필드 없을 때 스킵 처리 (undefined 방어)
- `database-policy-engine.ts` — `evaluateTokenTier()`: 신규 함수, CAIP-19 키 매칭 + 사람 읽기 단위 비교
- `stages.ts` — `TransactionParam` 인터페이스에 `tokenDecimals?: number` 동기화
- `stages.ts` — `buildTransactionParam()` TOKEN_TRANSFER/APPROVE 케이스에서 `req.token.decimals` → `tokenDecimals` 전달
- `sign-only.ts` — `TransactionParam` 인터페이스에 `tokenDecimals?: number` 동기화
- `sign-only.ts` — `mapOperationToParam()` TOKEN_TRANSFER 케이스에서 decimals 전달 (가능한 경우)
- `resolve-effective-amount-usd.ts` — `NATIVE_DECIMALS`를 core 패키지로 이동 (공유 필요)

### 3. Admin UI (`packages/admin`)

- `spending-limit-form.tsx` — USD 우선 배치, token_limits 편집 UI (CAIP-19 키 기반), legacy 섹션 deprecated 표시
- `policies.tsx` — validation 로직: raw 필드 optional 전환, token_limits 검증 추가
- 네이티브 심볼 표시를 위한 네트워크→심볼 매핑 유틸리티

### 4. 스킬 파일

- `policies.skill.md` — SPENDING_LIMIT 정책의 token_limits 필드 설명 추가

### 영향 범위 요약

| 파일 | 변경 내용 |
|------|----------|
| `packages/core/src/schemas/policy.schema.ts` | TokenLimitSchema, raw optional, superRefine |
| `packages/daemon/src/pipeline/database-policy-engine.ts` | TransactionParam 확장, evaluateSpendingLimit 시그니처 변경, evaluateTokenTier (CAIP-19), 호출부 3곳 tokenContext 전달, evaluateNativeTier 방어 |
| `packages/daemon/src/pipeline/stages.ts` | TransactionParam 동기화, buildTransactionParam에 tokenDecimals 추가 |
| `packages/daemon/src/pipeline/sign-only.ts` | TransactionParam 동기화, mapOperationToParam에 tokenDecimals 추가 |
| `packages/daemon/src/pipeline/resolve-effective-amount-usd.ts` | NATIVE_DECIMALS 공유화 |
| `packages/admin/src/components/policy-forms/spending-limit-form.tsx` | 폼 재구성 (CAIP-19 키 입력 UX) |
| `packages/admin/src/pages/policies.tsx` | validation 갱신 |
| `skills/policies.skill.md` | token_limits 문서화 |

---

## 테스트 항목

### 단위 테스트 — 정책 엔진

1. `token_limits["native:solana"]` 설정 시 TRANSFER 트랜잭션이 사람 읽기 단위로 평가되는지 확인
2. `token_limits[CAIP-19 asset ID]` 설정 시 TOKEN_TRANSFER가 해당 토큰의 decimal 기준으로 평가되는지 확인
3. `token_limits`에 해당 토큰이 없을 때 기존 raw 필드로 폴백하는지 확인
4. raw 필드와 `token_limits` 모두 없을 때 네이티브 티어 평가가 스킵되고 USD만으로 판정되는지 확인
5. `maxTier(USD 티어, 토큰별 티어)` per-tx 합산 + 누적 티어 최종 합산이 정확한지 확인
6. SOL(9 decimals), ETH(18 decimals), USDC(6 decimals) 각각에 대해 decimal 변환이 정확한지 확인
7. `token_limits`의 `instant_max > notify_max` 순서 위반 시 Zod 검증 실패하는지 확인

### 단위 테스트 — CAIP-19 키 매칭

8. CAIP-19 asset ID 정확 매칭이 동작하는지 확인
9. `"native:solana"` 형식과 `"native"` 축약형이 각각 올바르게 매칭되는지 확인
10. `"native"` 축약형이 `network=null` 정책에서 매칭되지 않고 `"native:{chain}"` 형식만 매칭되는지 확인
11. 매칭 순서: CAIP-19 정확 매칭 → `"native:{chain}"` → `"native"` 축약형 → raw 폴백 순서 확인

### 단위 테스트 — 하위 호환

12. 기존 정책 (raw 필드만, `token_limits` 없음)이 변경 없이 동일하게 동작하는지 확인
13. raw 필드 미설정 + `token_limits` 미설정 + USD 필드만 있는 정책이 정상 동작하는지 확인
14. raw 필드와 `token_limits` 동시 존재 시 `token_limits`가 우선하는지 확인

### 단위 테스트 — Zod 스키마

15. `instant_max`/`notify_max`/`delay_max` 없이 `token_limits`만 있는 정책이 검증 통과하는지 확인
16. `instant_max_usd`/`token_limits`/raw 필드 모두 없는 정책이 검증 실패하는지 확인
17. `token_limits` 내 금액이 소수점 포함 문자열(`"1.5"`)로 검증 통과하는지 확인
18. `token_limits` 키가 유효하지 않은 형식일 때 검증 실패하는지 확인

### 단위 테스트 — Admin UI

19. USD 섹션이 최상단에 렌더링되는지 확인
20. token_limits 편집 UI에서 토큰 추가/삭제가 동작하는지 확인
21. 네이티브 토큰 심볼이 정책의 network에 따라 올바르게 표시되는지 확인 (SOL, ETH, POL)
22. network=null 정책에서 "SOL / ETH / POL" 복수 심볼이 표시되는지 확인
23. Legacy 섹션에 deprecated 안내가 표시되는지 확인
24. 신규 정책 생성 시 raw 필드 미입력으로 저장 가능한지 확인
25. 토큰 레지스트리에서 선택 시 CAIP-19 ID가 자동 생성되는지 확인

### 단위 테스트 — 타입별 token_limits 적용

26. APPROVE 트랜잭션에서 `token_limits[CAIP-19]`가 승인 금액에 적용되는지 확인
27. APPROVE + APPROVE_TIER_OVERRIDE 존재 시 token_limits가 무시되고 OVERRIDE가 우선하는지 확인
28. CONTRACT_CALL 트랜잭션에서 `token_limits`가 적용되지 않고 raw/USD만으로 평가되는지 확인
29. BATCH 트랜잭션에서 `token_limits`가 적용되지 않고 합산 금액에 대해 raw/USD만으로 평가되는지 확인

### 회귀 테스트

30. 기존 SPENDING_LIMIT 정책의 BATCH 트랜잭션 평가가 변경 없이 동작하는지 확인
31. 누적 한도(daily_limit_usd, monthly_limit_usd) 평가가 영향 받지 않는지 확인
32. Oracle 실패 시 USD 평가 스킵 + 토큰별/raw 폴백이 정상 동작하는지 확인
