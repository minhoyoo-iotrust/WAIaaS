# 마일스톤 m27-03: 토큰별 지출 한도 정책

- **Status:** PLANNED
- **Milestone:** v27.2

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
| `daemon/pipeline/database-policy-engine.ts:112-131` | `TransactionParam` 인터페이스 — 정책 평가 입력 |
| `daemon/pipeline/resolve-effective-amount-usd.ts:53-56` | `NATIVE_DECIMALS` 매핑 (solana:9, ethereum:18) |
| `adapters/evm/src/evm-chain-map.ts:19-28` | 네트워크별 `nativeSymbol` 매핑 (ETH, POL 등) |
| `core/schemas/transaction.schema.ts:55-60` | `TokenInfoSchema` — `decimals` 필드 (TOKEN_TRANSFER 요청) |
| `admin/components/policy-forms/spending-limit-form.tsx` | Admin UI 정책 폼 |

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
  token_limits: z.record(            // 키: "native" 또는 토큰 컨트랙트 주소
    z.string(),
    TokenLimitSchema,
  ).optional(),

  delay_seconds: z.number().int().min(60).default(900),
});
```

**`token_limits` 키 규칙:**
- `"native"` — 해당 네트워크의 네이티브 토큰 (SOL, ETH, POL 등)
- 컨트랙트 주소 — 특정 토큰 (예: `"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"` = USDC on Solana)
- 금액은 **사람 읽기 단위** (decimal 적용 후) — `"1.5"` = 1.5 SOL, `"1000"` = 1,000 USDC

**superRefine 검증 추가:**
- `instant_max_usd`/`notify_max_usd`/`delay_max_usd`, `token_limits`, `instant_max`/`notify_max`/`delay_max` 중 하나 이상은 설정되어야 한다
- raw 필드와 `token_limits` 동시 존재 시 `token_limits` 우선 (raw는 폴백)
- `token_limits` 내 각 토큰의 `instant_max ≤ notify_max ≤ delay_max` 순서 검증

### 2. 평가 로직 변경

**`TransactionParam` 인터페이스 확장:**

현재 `TransactionParam`에는 `tokenDecimals` 필드가 없다. `token_limits` 평가에 필요한 정보를 전달하기 위해 다음 필드를 추가한다:

```typescript
interface TransactionParam {
  // ... 기존 필드 ...
  /** Token decimals for token_limits human-readable conversion (TOKEN_TRANSFER only). */
  tokenDecimals?: number;
}
```

호출부에서 요청의 `token.decimals` 값을 `TransactionParam.tokenDecimals`로 전달한다.

**`evaluateSpendingLimit()` 시그니처 확장:**

현재 시그니처 `(resolved, amount, usdAmount?)`에 트랜잭션 컨텍스트를 추가한다:

```typescript
private evaluateSpendingLimit(
  resolved: PolicyRow[],
  amount: string,
  usdAmount?: number,
  tokenContext?: { type: string; tokenAddress?: string; tokenDecimals?: number; chain?: string },
): PolicyEvaluation | null
```

**평가 흐름:**

```
1. USD 티어 평가 (기존 로직 유지)
2. 토큰별 티어 평가:
   a. token_limits에서 해당 토큰 키 조회
      - TRANSFER → "native"
      - TOKEN_TRANSFER → tokenAddress
      - APPROVE → tokenAddress (승인 대상 토큰)
      - CONTRACT_CALL → token_limits 미적용 (amount는 네이티브 value)
      - BATCH → 서브 트랜잭션별 개별 평가 아님, 합산 amount에 대해 기존 raw/USD로만 평가
   b. 매칭되는 token_limit 있으면:
      - 트랜잭션 raw amount를 decimal로 나눠 사람 읽기 단위로 변환
      - token_limit의 instant_max/notify_max/delay_max와 비교
   c. 매칭 없으면:
      - 기존 raw 필드(instant_max/notify_max/delay_max) 폴백 (있을 때만)
3. 최종 티어 = maxTier(USD 티어, 토큰별 티어, 누적 티어)
```

**트랜잭션 타입별 token_limits 적용 규칙:**

| 타입 | token_limits 키 | decimal 소스 | 비고 |
|------|----------------|-------------|------|
| TRANSFER | `"native"` | `NATIVE_DECIMALS[chain]` | 네이티브 전송 |
| TOKEN_TRANSFER | `tokenAddress` | `TransactionParam.tokenDecimals` | 토큰 전송 |
| APPROVE | `tokenAddress` | `TransactionParam.tokenDecimals` | 토큰 승인 금액 |
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
│  ┌ USDC (EPjFWdd5...Dt1v) ─────────────────────────┐    │
│  │ Instant Max  [1000  ] USDC                 [✕]   │    │
│  │ Notify Max   [5000  ] USDC                       │    │
│  │ Delay Max    [50000 ] USDC                       │    │
│  └──────────────────────────────────────────────────┘    │
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
- "+ Add Token Limit" 버튼 → 토큰 주소 입력 or 등록된 토큰 목록에서 선택
- 토큰 레지스트리(`builtin-tokens.ts`)에 등록된 토큰은 심볼+이름 자동 표시
- 미등록 토큰은 주소만 표시

### 4. 하위 호환 전략

| 단계 | 변경 | 기존 정책 영향 |
|------|------|--------------|
| **Zod 스키마** | `instant_max`/`notify_max`/`delay_max` → optional | 기존 값 유지, 신규 생성 시 미입력 가능 |
| **평가 로직** | `token_limits` 있으면 우선, 없으면 raw 폴백 | 기존 정책은 raw 폴백으로 동일 동작 |
| **Admin UI** | Legacy 섹션으로 이동, deprecated 안내 | 기존 값 편집 가능, 신규는 token_limits 유도 |
| **DB** | 변경 없음 | `rules` JSON 컬럼에 optional 필드 추가뿐 |
| **API** | 요청/응답 스키마에 `token_limits` optional 추가 | 기존 클라이언트 영향 없음 |

**평가 우선순위:**
```
1. token_limits[토큰키] 있음 → 사람 읽기 단위로 비교
2. token_limits 없음 + raw 필드 있음 → 기존 raw BigInt 비교 (폴백)
3. 둘 다 없음 → 네이티브 티어 평가 스킵, USD만으로 판정
```

---

## 수정 범위

### 1. Zod 스키마 (`packages/core`)

- `policy.schema.ts` — `TokenLimitSchema` 추가, raw 필드 optional 전환, superRefine 검증
- `policy.schema.ts` — `SpendingLimitRulesSchema` 타입 변경에 따른 export 갱신

### 2. 정책 엔진 (`packages/daemon`)

- `database-policy-engine.ts` — `TransactionParam` 인터페이스에 `tokenDecimals?: number` 추가
- `database-policy-engine.ts` — `evaluateSpendingLimit()` 시그니처 확장 (`tokenContext` 파라미터 추가) + token_limits 조회 + decimal 변환 로직
- `database-policy-engine.ts` — `evaluateSpendingLimit()` 호출부 (TRANSFER, TOKEN_TRANSFER, APPROVE, BATCH)에서 `tokenContext` 전달
- `database-policy-engine.ts` — `evaluateNativeTier()`: raw 필드 없을 때 스킵 처리 (undefined 방어)
- `database-policy-engine.ts` — `evaluateTokenTier()`: 신규 함수, 사람 읽기 단위 비교
- `resolve-effective-amount-usd.ts` — `NATIVE_DECIMALS`를 core 패키지로 이동 (공유 필요)

### 3. Admin UI (`packages/admin`)

- `spending-limit-form.tsx` — USD 우선 배치, token_limits 편집 UI, legacy 섹션 deprecated 표시
- `policies.tsx` — validation 로직: raw 필드 optional 전환, token_limits 검증 추가
- 네이티브 심볼 표시를 위한 네트워크→심볼 매핑 유틸리티

### 4. 스킬 파일

- `policies.skill.md` — SPENDING_LIMIT 정책의 token_limits 필드 설명 추가

### 영향 범위 요약

| 파일 | 변경 내용 |
|------|----------|
| `packages/core/src/schemas/policy.schema.ts` | TokenLimitSchema, raw optional, superRefine |
| `packages/daemon/src/pipeline/database-policy-engine.ts` | TransactionParam 확장, evaluateSpendingLimit 시그니처 변경, evaluateTokenTier, 호출부 tokenContext 전달, 폴백 로직 |
| `packages/daemon/src/pipeline/resolve-effective-amount-usd.ts` | NATIVE_DECIMALS 공유화 |
| `packages/admin/src/components/policy-forms/spending-limit-form.tsx` | 폼 재구성 |
| `packages/admin/src/pages/policies.tsx` | validation 갱신 |
| `skills/policies.skill.md` | token_limits 문서화 |

---

## 테스트 항목

### 단위 테스트 — 정책 엔진

1. `token_limits.native` 설정 시 TRANSFER 트랜잭션이 사람 읽기 단위로 평가되는지 확인
2. `token_limits[contractAddress]` 설정 시 TOKEN_TRANSFER가 해당 토큰의 decimal 기준으로 평가되는지 확인
3. `token_limits`에 해당 토큰이 없을 때 기존 raw 필드로 폴백하는지 확인
4. raw 필드와 `token_limits` 모두 없을 때 네이티브 티어 평가가 스킵되고 USD만으로 판정되는지 확인
5. `maxTier(USD 티어, 토큰별 티어, 누적 티어)` 합산이 정확한지 확인
6. SOL(9 decimals), ETH(18 decimals), USDC(6 decimals) 각각에 대해 decimal 변환이 정확한지 확인
7. `token_limits`의 `instant_max > notify_max` 순서 위반 시 Zod 검증 실패하는지 확인

### 단위 테스트 — 하위 호환

8. 기존 정책 (raw 필드만, `token_limits` 없음)이 변경 없이 동일하게 동작하는지 확인
9. raw 필드 미설정 + `token_limits` 미설정 + USD 필드만 있는 정책이 정상 동작하는지 확인
10. raw 필드와 `token_limits` 동시 존재 시 `token_limits`가 우선하는지 확인

### 단위 테스트 — Zod 스키마

11. `instant_max`/`notify_max`/`delay_max` 없이 `token_limits`만 있는 정책이 검증 통과하는지 확인
12. `instant_max_usd`/`token_limits`/raw 필드 모두 없는 정책이 검증 실패하는지 확인
13. `token_limits` 내 금액이 소수점 포함 문자열(`"1.5"`)로 검증 통과하는지 확인

### 단위 테스트 — Admin UI

14. USD 섹션이 최상단에 렌더링되는지 확인
15. token_limits 편집 UI에서 토큰 추가/삭제가 동작하는지 확인
16. 네이티브 토큰 심볼이 정책의 network에 따라 올바르게 표시되는지 확인 (SOL, ETH, POL)
17. network=null 정책에서 "SOL / ETH / POL" 복수 심볼이 표시되는지 확인
18. Legacy 섹션에 deprecated 안내가 표시되는지 확인
19. 신규 정책 생성 시 raw 필드 미입력으로 저장 가능한지 확인

### 단위 테스트 — 타입별 token_limits 적용

20. APPROVE 트랜잭션에서 `token_limits[tokenAddress]`가 승인 금액에 적용되는지 확인
21. CONTRACT_CALL 트랜잭션에서 `token_limits`가 적용되지 않고 raw/USD만으로 평가되는지 확인
22. BATCH 트랜잭션에서 `token_limits`가 적용되지 않고 합산 금액에 대해 raw/USD만으로 평가되는지 확인

### 회귀 테스트

23. 기존 SPENDING_LIMIT 정책의 BATCH 트랜잭션 평가가 변경 없이 동작하는지 확인
24. 누적 한도(daily_limit_usd, monthly_limit_usd) 평가가 영향 받지 않는지 확인
25. Oracle 실패 시 USD 평가 스킵 + 토큰별/raw 폴백이 정상 동작하는지 확인
