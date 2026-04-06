# Phase 42: 에러 처리 체계 완결 - Research

**Researched:** 2026-02-09
**Domain:** Error handling system completion (HTTP error mapping, ChainError categorization, PolicyType validation)
**Confidence:** HIGH

## Summary

Phase 42는 세 가지 독립적인 설계 미비점을 해소한다: (1) 64개 에러 코드의 HTTP status + retryable + backoff 통합 매트릭스 생성, (2) ChainError의 PERMANENT/TRANSIENT/STALE 3-카테고리 분류 및 복구 전략 정의, (3) 37-rest-api의 PolicyType enum을 4개에서 10개로 확장하고 type별 rules JSON 검증 분기를 명시하는 것이다.

이 Phase의 핵심 성격은 **기존 설계 문서의 누락 구간을 채우는 작업**이다. 새로운 인터페이스나 아키텍처를 추가하지 않고, 이미 개별 섹션에 흩어져 있는 에러 코드/복구 전략/정책 타입 정보를 통합 테이블과 명시적 로직으로 정리한다. Phase 41에서 정리한 PolicyRuleSchema SSoT(33-time-lock SS2.2)가 ERRH-03의 전제이며, ERRH-02의 ChainError category는 Phase 43(Stage 5 에러 분기)의 전제이다.

**Primary recommendation:** 세 요구사항(ERRH-01, ERRH-02, ERRH-03)은 서로 독립적이므로 3개 plan으로 분리하여 병렬 실행 가능하게 구성한다. 각 plan은 대상 문서의 특정 섹션을 수정/확장하는 작업이다.

## Standard Stack

이 Phase는 순수 설계 문서 수정 작업이므로 라이브러리 설치가 불필요하다. 문서에서 참조하는 기술 스택만 기록한다.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zod | 3.x | 런타임 스키마 검증 (PolicyType rules 검증) | 프로젝트 SSoT: Zod -> TS -> OpenAPI -> Drizzle -> DB CHECK |
| Hono | 4.x | HTTP 에러 응답 처리 | 프로젝트 API 프레임워크 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `z.discriminatedUnion()` | Zod 3.x | PolicyRuleSchema 10-type 유니온 | type별 rules 검증 분기 |
| `z.superRefine()` | Zod 3.x | CreatePolicyRequest의 type-rules 교차 검증 | POST /v1/owner/policies 요청 검증 시 |

### Alternatives Considered

해당 없음 -- 기존 스택 유지, 설계 문서 수정만 수행.

## Architecture Patterns

### 현재 에러 처리 아키텍처

```
[ChainError] ── 어댑터 레벨 ── code + chain + retryable + details
      ↓ 매핑
[ErrorResponse] ── HTTP 레벨 ── code + message + hint + details + requestId + retryable
      ↓ 전달
[HTTP Response] ── 헤더 ── Status Code + Retry-After + X-RateLimit-*
```

### Pattern 1: 에러 코드 통합 매트릭스

**What:** 64개(+@) 에러 코드를 단일 테이블로 통합하여 HTTP status, retryable, backoff 전략을 한 눈에 파악
**When to use:** 구현자가 에러 응답을 구현할 때 즉시 참조
**Key insight:** 현재 에러 코드는 9개 도메인별 개별 테이블(37-rest-api SS10.2~10.10)에 분산되어 있고, backoff 전략이 누락됨. `ROTATION_TOO_RECENT`처럼 SS10에 미포함된 코드도 존재

### Pattern 2: ChainError 3-카테고리 분류

**What:** 모든 ChainError를 PERMANENT/TRANSIENT/STALE로 분류하여 파이프라인 Stage 5의 재시도 로직을 결정론적으로 만듦
**When to use:** Stage 5에서 catch한 ChainError의 복구 전략을 결정할 때
**Current state:** 27-chain-adapter SS4.5에 에러 코드 매핑 테이블이 있으나, `category` 필드가 없고 "조건부" 재시도만 기술됨. v0.10 objectives가 `category: 'PERMANENT' | 'TRANSIENT' | 'STALE'` 필드를 ChainError에 추가하도록 지시

### Pattern 3: type-discriminated rules 검증

**What:** `POST /v1/owner/policies`의 `rules` 필드를 `type`에 따라 서로 다른 Zod 스키마로 검증
**When to use:** 정책 생성/수정 시 type과 rules의 일관성을 런타임에 보장
**Current state:** 37-rest-api SS8.9의 `rules: z.unknown()`으로 정의되어 검증이 없음. 33-time-lock SS2.2의 `PolicyRuleSchema`가 10개 타입별 Zod 스키마를 이미 정의함

### Anti-Patterns to Avoid

- **에러 코드 중복 정의:** 에러 코드를 개별 엔드포인트 에러 테이블과 통합 매트릭스 양쪽에서 정의하면 drift 발생. 통합 매트릭스가 SSoT, 개별 테이블은 참조로 전환해야 함
- **category 없는 retryable 플래그:** `retryable: true`만으로는 재시도 전략(즉시 vs 백오프 vs 재빌드)을 결정할 수 없음. category가 전략을 결정하고 retryable은 클라이언트 hint
- **rules를 z.unknown()으로 두기:** 서버 측에서 검증하지 않으면 무효한 rules JSON이 DB에 저장되어 evaluate() 런타임 오류 유발

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| type-rules 교차 검증 | if-else 수동 분기 | Zod `.superRefine()` + `PolicyRuleSchema` | 33-time-lock SS2.2에 이미 10개 타입별 스키마 정의됨. superRefine으로 위임하면 SSoT 단일화 |
| 재시도 백오프 계산 | 커스텀 타이머 | 카테고리별 복구 전략 테이블 참조 | Stage 5 의사코드(v0.10 objectives)가 이미 패턴 정의: TRANSIENT=지수 백오프, STALE=즉시 재빌드 |
| HTTP status 결정 | switch-case 64개 분기 | 통합 매트릭스 조회 | 도메인별 테이블 9개를 일일이 참조하는 대신 단일 Map/Object |

**Key insight:** 이 Phase의 모든 산출물은 구현 시 "1번 참조하면 답이 나오는 테이블"을 만드는 것이다. 구현자가 여러 문서를 교차 참조해야 하는 현재 상태가 문제의 핵심.

## Common Pitfalls

### Pitfall 1: 에러 코드 수 불일치

**What goes wrong:** SS10.11에서 64개로 집계하지만, 개별 엔드포인트 에러 테이블에 추가 코드(`ROTATION_TOO_RECENT` 등)가 존재할 수 있음
**Why it happens:** v0.7에서 추가한 에러 코드가 SS10 도메인별 테이블에 반영되지 않았음
**How to avoid:** 통합 매트릭스 작성 시 SS10.2~10.10 뿐 아니라 개별 엔드포인트 에러 테이블(SS5~9의 에러 블록)을 전수 조사하여 누락 코드 발굴
**Warning signs:** 통합 매트릭스의 코드 수가 64개와 다른 경우

### Pitfall 2: ChainError와 REST API 에러 코드 매핑 혼동

**What goes wrong:** 27-chain-adapter의 ChainError 코드(어댑터 레벨)와 37-rest-api의 에러 코드(HTTP 레벨)가 이름은 비슷하나 계층이 다름
**Why it happens:** `INSUFFICIENT_BALANCE`가 ChainErrorCode에도 있고 TX 도메인 에러에도 있음. 동일 이름이지만 전자는 어댑터 throw, 후자는 HTTP 응답 코드
**How to avoid:** 통합 매트릭스에서 "소스 계층(adapter/api/middleware)" 열을 추가하여 어디서 발생하는 에러인지 명시
**Warning signs:** 같은 코드명이 두 문서에서 다른 HTTP status로 매핑된 경우

### Pitfall 3: PolicyType enum 동기화 누락

**What goes wrong:** 37-rest-api SS8.9의 CreatePolicyRequestSchema와 PolicySummarySchema 양쪽 모두 업데이트해야 하나 하나만 수정
**Why it happens:** 요청 스키마만 10개로 확장하고 응답 스키마는 4개로 남겨두면 응답이 확장된 타입을 반환할 수 없음
**How to avoid:** 두 스키마 모두 동시 업데이트. `PolicyTypeEnum`을 별도 const로 추출하여 공유하는 패턴 명시
**Warning signs:** CreatePolicyRequest와 PolicySummary의 `type` enum이 다른 경우

### Pitfall 4: STALE 카테고리의 재시도 전략 혼동

**What goes wrong:** STALE을 TRANSIENT처럼 "동일 요청으로 재시도"하면 blockhash 만료나 nonce 충돌이 해결되지 않음
**Why it happens:** 두 카테고리 모두 retryable이지만 복구 방법이 다름 (STALE=재빌드, TRANSIENT=대기 후 재시도)
**How to avoid:** 카테고리별 복구 전략 테이블에서 "재시도 시작 단계"를 명시 (STALE: Stage 5a부터, TRANSIENT: 실패 단계에서)
**Warning signs:** STALE 에러 재시도 시 같은 에러 반복

## Code Examples

### 에러 코드 통합 매트릭스 형식 (37-rest-api SS3.3에 추가할 구조)

```markdown
| # | 에러 코드 | 도메인 | HTTP | retryable | backoff | hint |
|---|----------|--------|------|-----------|---------|------|
| 1 | INVALID_TOKEN | AUTH | 401 | false | - | O |
| 2 | TOKEN_EXPIRED | AUTH | 401 | false | - | O |
| ... |
| 8 | SYSTEM_LOCKED | AUTH | 503 | false | - | O |
| 9 | SESSION_NOT_FOUND | SESSION | 404 | false | - | O |
| ... |
| 64+ | ... | ... | ... | ... | ... | ... |
```

backoff 전략 열의 값 유형:
- `-`: retryable=false, 재시도 불필요
- `Retry-After`: 429 응답, 서버가 제공하는 대기 시간
- `exp(1,2,4)`: 지수 백오프 1초/2초/4초
- `rebuild`: STALE 에러, 재빌드 후 재시도

### ChainError category 추가 (27-chain-adapter SS4.4에 추가할 구조)

```typescript
class ChainError extends Error {
  readonly code: ChainErrorCode | SolanaErrorCode | EVMErrorCode
  readonly chain: ChainType
  readonly details?: Record<string, unknown>
  readonly retryable: boolean
  readonly category: 'PERMANENT' | 'TRANSIENT' | 'STALE'  // [v0.10] 추가
  // ... constructor
}
```

### ChainError 카테고리 분류 테이블 (27-chain-adapter SS5에 추가)

```markdown
| 에러 코드 | 카테고리 | 재시도 횟수 | 백오프 | 재시도 시작 단계 | 복구 방법 |
|-----------|---------|:----------:|--------|:---------------:|----------|
| INSUFFICIENT_BALANCE | PERMANENT | 0 | - | - | 잔액 충전 후 새 요청 |
| INVALID_ADDRESS | PERMANENT | 0 | - | - | 주소 수정 후 새 요청 |
| TRANSACTION_FAILED | PERMANENT | 0 | - | - | 원인 분석 후 새 요청 |
| SOLANA_PROGRAM_ERROR | PERMANENT | 0 | - | - | 프로그램 에러 분석 |
| EVM_REVERT | PERMANENT | 0 | - | - | revert reason 분석 |
| RPC_ERROR | TRANSIENT | 3 | exp(1,2,4) | 실패 단계 | 대기 후 동일 호출 재시도 |
| NETWORK_ERROR | TRANSIENT | 3 | exp(1,2,4) | 실패 단계 | 네트워크 복구 대기 |
| SIMULATION_FAILED | TRANSIENT | 3 | exp(1,2,4) | 실패 단계 | 재시도 |
| TRANSACTION_EXPIRED | STALE | 1 | 즉시 | Stage 5a | buildTransaction() 재실행 |
| SOLANA_BLOCKHASH_EXPIRED | STALE | 1 | 즉시 | Stage 5a | buildTransaction() 재실행 |
| SOLANA_BLOCKHASH_STALE | STALE | 1 | 즉시 | refreshBlockhash | refreshBlockhash() 후 re-sign |
| EVM_NONCE_TOO_LOW | STALE | 1 | 즉시 | Stage 5a | nonce 재조회 후 재빌드 |
| EVM_GAS_TOO_LOW | TRANSIENT | 1 | 즉시 | Stage 5a | gas limit 상향 후 재빌드 |
```

### PolicyType superRefine 패턴 (37-rest-api SS8.9에 추가할 구조)

```typescript
// CreatePolicyRequest의 rules 필드 검증
// SSoT: 33-time-lock-approval-mechanism.md §2.2 PolicyRuleSchema
const CreatePolicyRequestSchema = z.object({
  agentId: z.string().uuid().optional(),
  type: PolicyTypeEnum,  // 10개 enum
  rules: z.unknown(),     // 1차: 타입 무관 수용
  priority: z.number().int().optional().default(0),
  enabled: z.boolean().optional().default(true),
}).superRefine((data, ctx) => {
  // 2차: type에 따른 rules 스키마 분기 검증
  const schemaMap: Record<string, ZodSchema> = {
    SPENDING_LIMIT: SpendingLimitRuleSchema,
    WHITELIST: WhitelistRuleSchema,
    TIME_RESTRICTION: TimeRestrictionRuleSchema,
    RATE_LIMIT: RateLimitRuleSchema,
    ALLOWED_TOKENS: AllowedTokensRuleSchema,
    CONTRACT_WHITELIST: ContractWhitelistRuleSchema,
    METHOD_WHITELIST: MethodWhitelistRuleSchema,
    APPROVED_SPENDERS: ApprovedSpendersRuleSchema,
    APPROVE_AMOUNT_LIMIT: ApproveAmountLimitRuleSchema,
    APPROVE_TIER_OVERRIDE: ApproveTierOverrideRuleSchema,
  }
  const schema = schemaMap[data.type]
  if (!schema) return  // enum 검증에서 이미 걸림
  const result = schema.safeParse(data.rules)
  if (!result.success) {
    result.error.issues.forEach(issue => {
      ctx.addIssue({
        ...issue,
        path: ['rules', ...issue.path],
      })
    })
  }
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 에러 코드 도메인별 분산 테이블 (SS10.2~10.10) | 통합 매트릭스 (SS3.3 또는 SS10.12) | v0.10 Phase 42 | 구현자가 1개 테이블만 참조하면 됨 |
| ChainError에 retryable만 존재 | category 3분류 추가 | v0.10 Phase 42 | Stage 5 재시도 로직이 결정론적 |
| PolicyType 4개 (37-rest-api) vs 10개 (33-time-lock) | 10개 동기화 + superRefine | v0.10 Phase 42 | 무효한 rules JSON DB 저장 방지 |

**Deprecated/outdated:**
- 37-rest-api SS8.9의 `type: z.enum(['SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT'])` -- v0.6에서 10개로 확장되었으나 이 섹션만 미반영

## Detailed Findings per Requirement

### ERRH-01: 64개 에러 코드 통합 매트릭스

**Current state analysis:**

1. **37-rest-api SS10.2~10.10:** 9개 도메인별 에러 코드 테이블 존재 (AUTH 8, SESSION 8, TX 20, POLICY 4, OWNER 5, SYSTEM 6, AGENT 3, WITHDRAW 4, ACTION 7 = 합계 65)
2. **SS10.11 집계:** "64개"로 표기 -- OWNER가 4로 카운트된 것으로 추정 (OWNER_NOT_FOUND가 v0.7에서 추가되어 5개이나 v0.8 집계에서 4로 기록)
3. **누락 에러 코드:** `ROTATION_TOO_RECENT`가 SS9.3에만 존재하고 SS10 도메인 테이블에 미포함
4. **backoff 전략 누락:** 현재 테이블은 `retryable` boolean만 있고, 재시도 전략(대기 시간, 백오프 방식)이 없음
5. **429 응답 포맷:** 29-api-framework SS7.5에 정의되어 있으나 37-rest-api에는 공통 응답 헤더(SS2.4)에 `Retry-After` 한 줄만 있음

**Section placement:** v0.10 objectives는 "37-rest-api SS3.3 확장"을 지시하나, 현재 SS3.3은 Master Password 인증 섹션이다. 통합 매트릭스는 에러 코드 체계(SS10) 내에 SS10.12로 추가하거나, 혹은 objectives의 지시대로 SS3.3 뒤에 SS3.5로 삽입하는 방안이 있다. **Recommendation:** objectives의 지시를 존중하되, 실제로는 SS10에 SS10.12를 추가하는 것이 논리적으로 적합하다. objectives의 "SS3.3"은 문서 구조 변경 전 가번호일 가능성이 높다. 실제 작업 시 최적의 위치에 삽입하고, success criteria에서 "통합 매트릭스가 존재한다"가 핵심 검증 포인트임을 유의한다.

**429 응답 포맷 확정 필요 사항:**
- `Retry-After` 헤더(초 단위) -- 이미 29-api-framework SS7.5에 정의
- 본문 `details.retryAfter` 필드 -- 이미 29-api-framework 코드 예시에 존재
- 429를 사용하는 에러 코드: `RATE_LIMIT_EXCEEDED`(POLICY), `MASTER_PASSWORD_LOCKED`(AUTH), `ROTATION_TOO_RECENT`(SYSTEM/ADMIN)
- `MASTER_PASSWORD_LOCKED`는 retryable=false로 정의됨 (30분 lockout이므로 재시도 무의미) -- backoff: "30분 대기"
- `RATE_LIMIT_EXCEEDED`는 retryable=true -- backoff: `Retry-After` 헤더 참조

**Action items:**
1. 9개 도메인별 에러를 단일 매트릭스로 통합 (코드, 도메인, HTTP, retryable, backoff, hint 유무)
2. `ROTATION_TOO_RECENT`를 SYSTEM 도메인에 정식 등록 또는 별도 ADMIN 도메인 생성
3. SS10.11 집계를 실제 코드 수로 정정
4. 429 응답 포맷 통합 (헤더 + 본문) 명시

### ERRH-02: ChainError 3-카테고리 분류

**Current state analysis:**

1. **27-chain-adapter SS4.1~4.3:** 공통 7개 + Solana 3개 + EVM 3개 = 13개 ChainError 코드 정의
2. **SS4.4 ChainError 클래스:** `code`, `chain`, `details`, `retryable` 필드. `category` 필드 없음
3. **SS4.5 매핑 테이블:** 24개 행 (v0.6 추가 포함). "재시도" 열이 O/X/조건부로 표기. 백오프 전략 없음
4. **v0.10 objectives B-2:** `category: 'PERMANENT' | 'TRANSIENT' | 'STALE'` 필드를 ChainError에 추가하도록 명시

**Section placement:** objectives는 "27-chain-adapter SS5"를 지시. 현재 SS5는 AdapterRegistry 설계 섹션이다. 에러 관련은 SS4. **Recommendation:** SS4에 SS4.6 "에러 카테고리 분류 및 복구 전략"을 추가하거나, SS4.4 ChainError 클래스를 확장하고 SS4.5 매핑 테이블에 category 열을 추가한다. objectives의 "SS5"는 가번호일 가능성이 높다.

**카테고리 분류 기준:**

| 카테고리 | 정의 | 재시도 가능 | 재시도 전략 |
|----------|------|:-----------:|------------|
| PERMANENT | 입력 수정 없이 재시도해도 동일 결과. 클라이언트 수정 필요 | No | 재시도 불가 |
| TRANSIENT | 일시적 외부 장애. 동일 요청으로 재시도 시 성공 가능 | Yes | 지수 백오프 (1s, 2s, 4s), max 3회 |
| STALE | 데이터 유효기간 만료. 새 데이터로 재빌드 후 재시도 | Yes (1회) | 즉시, Stage 5a 재실행 |

**카테고리별 에러 분류 (전체 13+11=24개):**

PERMANENT (재시도 불가):
- `INSUFFICIENT_BALANCE` -- 잔액 충전 필요
- `INVALID_ADDRESS` -- 주소 수정 필요
- `TRANSACTION_FAILED` -- 원인 분석 필요
- `SOLANA_PROGRAM_ERROR` -- 프로그램 에러 분석
- `EVM_REVERT` -- revert reason 분석
- v0.6 추가: `TOKEN_NOT_FOUND`, `TOKEN_NOT_ALLOWED`, `INSUFFICIENT_TOKEN_BALANCE`, `CONTRACT_NOT_WHITELISTED`, `METHOD_NOT_WHITELISTED`, `SPENDER_NOT_APPROVED`, `UNLIMITED_APPROVE_BLOCKED`, `BATCH_NOT_SUPPORTED`, `BATCH_SIZE_EXCEEDED`, `BATCH_INSTRUCTION_INVALID`

TRANSIENT (지수 백오프 재시도):
- `RPC_ERROR` -- RPC 일시 장애
- `NETWORK_ERROR` -- 네트워크 일시 장애
- `SIMULATION_FAILED` -- 시뮬레이션 인프라 일시 장애
- `CONTRACT_CALL_FAILED` -- (v0.6) 조건부, 일시적일 수 있음
- `EVM_GAS_TOO_LOW` -- gas limit 상향 후 재빌드 (1회)

STALE (즉시 재빌드 재시도):
- `TRANSACTION_EXPIRED` -- 새 트랜잭션 빌드
- `SOLANA_BLOCKHASH_EXPIRED` -- buildTransaction() 재실행
- `SOLANA_BLOCKHASH_STALE` -- refreshBlockhash() 후 re-sign
- `EVM_NONCE_TOO_LOW` -- nonce 재조회 후 재빌드

**Note:** v0.6에서 추가된 에러 코드(SS4.5 매핑 테이블의 token/contract/approve/batch 관련)는 대부분 PERMANENT이다 (정책 설정 변경 없이는 재시도 무의미).

**Action items:**
1. SS4.4 ChainError 클래스에 `category` 필드 추가
2. SS4.5 매핑 테이블에 `category` 열 추가, 모든 에러 코드를 3-카테고리로 분류
3. SS4에 카테고리별 복구 전략 테이블 신설 (재시도 횟수, 백오프 방식, 재시도 시작 단계)
4. Phase 43(CONC-01)에서 이 카테고리를 사용하는 Stage 5 의사코드와의 연동 명시

### ERRH-03: PolicyType enum 10개 확장 + rules 검증 분기

**Current state analysis:**

1. **37-rest-api SS8.9 CreatePolicyRequestSchema:** `type: z.enum(['SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT'])` -- 4개만
2. **37-rest-api SS8.9 PolicySummarySchema:** 동일하게 4개 enum
3. **33-time-lock SS2.2 PolicyRuleSchema:** 이미 10개 타입의 `z.discriminatedUnion` 완전 정의
4. **45-enum SS2.5:** PolicyType 10개 enum 정의 완료
5. **25-sqlite SS4.4:** `type` 컬럼 CHECK 제약이 이미 10개
6. **rules 검증:** 현재 `rules: z.unknown()` -- 런타임 검증 없음

**Gap:** 37-rest-api SS8.9만 4개로 남아 있고, 나머지 모든 문서(33-time-lock, 45-enum, 25-sqlite)는 이미 10개로 확장됨. SS8.9의 업데이트가 누락된 것.

**superRefine 필요성:**
- `CreatePolicyRequest`의 `rules: z.unknown()`을 `type`에 따라 33-time-lock SS2.2의 개별 스키마(SpendingLimitRuleSchema, WhitelistRuleSchema 등)로 검증
- `z.discriminatedUnion`은 최상위 스키마에서 `type` 필드가 있어야 하므로, `rules` 필드 내부가 아닌 `type+rules` 교차 검증에는 `.superRefine()`이 적합
- 검증 실패 시 Zod 에러를 `rules` 경로에 매핑하여 어느 rules 필드가 잘못되었는지 클라이언트에 전달

**Action items:**
1. `PolicyTypeEnum` 상수를 10개로 확장 (SSoT: 45-enum SS2.5)
2. `CreatePolicyRequestSchema`의 `type` enum을 10개로 교체
3. `PolicySummarySchema`의 `type` enum을 10개로 교체
4. `CreatePolicyRequestSchema`에 `.superRefine()` 로직 추가 -- type별 rules 검증 분기
5. `UpdatePolicyRequestSchema`에도 동일한 superRefine 패턴 적용 (rules 변경 시)
6. 33-time-lock SS2.2 PolicyRuleSchema를 SSoT로 참조하는 교차 참조 추가

## Open Questions

1. **에러 코드 총 수 정정**
   - What we know: SS10.11은 "64개"로 표기. 실제 SS10.2~10.10 합산은 8+8+20+4+5+6+3+4+7=65. `ROTATION_TOO_RECENT` 포함 시 66.
   - What's unclear: 정확한 집계가 64인지 65인지 (OWNER 도메인이 4인지 5인지). `ROTATION_TOO_RECENT`를 SS10 정식 도메인에 포함할지.
   - Recommendation: 통합 매트릭스 작성 시 전수 조사하여 정확한 수로 정정. `ROTATION_TOO_RECENT`는 SYSTEM 또는 ADMIN 도메인에 정식 추가. 이 계수는 plan 실행 시 최종 확정.

2. **통합 매트릭스 배치 위치 (SS3.3 vs SS10.12)**
   - What we know: objectives는 "SS3.3"을 지시하나 현재 SS3.3은 masterAuth 섹션
   - What's unclear: objectives의 SS3.3이 가번호인지, 실제 SS3.3 아래에 삽입하라는 것인지
   - Recommendation: SS10의 에러 코드 체계 섹션 내에 SS10.12로 추가하는 것이 논리적. success criteria는 "존재 여부"만 검증하므로 위치보다 내용이 중요.

3. **v0.6 추가 ChainError 코드의 카테고리**
   - What we know: SS4.5에 v0.6 추가 에러 코드 11개가 있으나 이들은 정책 에러 성격 (TOKEN_NOT_FOUND 등)
   - What's unclear: 이들이 ChainError로 throw되는지, 아니면 정책 엔진에서 직접 판단하는지
   - Recommendation: SS4.5 매핑 테이블에 이미 포함되어 있으므로 그대로 카테고리 분류. 대부분 PERMANENT. 실제 구현에서 어느 레이어에서 throw되는지는 Phase 43에서 정리.

## Sources

### Primary (HIGH confidence)
- `.planning/deliverables/37-rest-api-complete-spec.md` SS10 -- 에러 코드 체계 9개 도메인, 64+개 코드
- `.planning/deliverables/27-chain-adapter-interface.md` SS4 -- ChainError 클래스, 에러 코드 매핑 테이블
- `.planning/deliverables/33-time-lock-approval-mechanism.md` SS2.2 -- PolicyRuleSchema 10개 타입 Zod 스키마
- `.planning/deliverables/29-api-framework-design.md` SS7 -- Rate Limiter 2-Stage, 429 응답 포맷
- `objectives/v0.10-pre-implementation-design-completion.md` Phase B -- ERRH-01/02/03 설계 지시사항
- `.planning/deliverables/45-enum-unified-mapping.md` SS2.5 -- PolicyType 10개 enum SSoT
- `.planning/phases/41-policy-engine-completion/41-VERIFICATION.md` -- Phase 41 완료 확인, PolicyRuleSchema SSoT 정리 완료

### Secondary (MEDIUM confidence)
- `.planning/deliverables/43-error-code-mapping.md` -- v0.1->v0.2 에러 코드 매핑 (레거시 참조용)
- `.planning/deliverables/55-dx-improvement-spec.md` SS2 -- errorHintMap (hint 매핑 현황)

### Tertiary (LOW confidence)
- 없음 -- 모든 정보가 프로젝트 내 1차 소스에서 확인됨

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 새 라이브러리 없음, 기존 Zod 패턴 활용
- Architecture: HIGH -- v0.10 objectives에 상세 지시 존재, 현재 문서 상태와 목표 상태 간 gap 명확
- Pitfalls: HIGH -- 문서 구조/카운트 불일치 등 구체적 위험 식별 완료

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (설계 문서 수정 작업이므로 외부 의존 없음)
