# Phase 41: 정책 엔진 완결 - Research

**Researched:** 2026-02-09
**Domain:** 설계 문서 교차 참조 정리 (PolicyRuleSchema, Owner 상태 전이, APPROVAL 타임아웃)
**Confidence:** HIGH

## Summary

Phase 41은 구현 착수 전 정책 엔진 관련 설계 문서 3개(25-sqlite, 33-time-lock, 34-owner)의 교차 참조 미비점을 해소하는 **설계 보완 Phase**이다. 코드 구현이 아닌 Markdown 문서 수정이 산출물이다.

핵심 미비점 3건:
1. **PLCY-01:** 25-sqlite 4.4의 `rules` 컬럼 설명에 "LOCK-MECH (Phase 8)에서 확정"이라는 이연 표기가 남아있어, 구현자가 33-time-lock 2.2의 PolicyRuleSchema를 SSoT로 인식하지 못할 수 있다
2. **PLCY-02:** 34-owner 10에 GRACE 기간 지속 정책(무기한)과 LOCKED 전이 트리거(ownerAuth Step 8.5 단일)가 명시적으로 기술되어 있지 않고, 33-time-lock 11.6 다운그레이드와의 SSoT 우선순위가 미정의
3. **PLCY-03:** 33-time-lock 4 evaluate()에서 APPROVAL 타임아웃 결정 시 정책별 approval_timeout, 글로벌 config, 하드코딩 3600초 간의 우선순위가 미정의

**Primary recommendation:** 세 설계 문서를 순서대로 수정하되, 기존 설계 구조를 변경하지 않고 이연 표기 제거/교차 참조 추가/누락 명시 사항 보완에 집중한다.

## Standard Stack

이 Phase는 설계 문서 보완이므로 라이브러리 스택이 아닌 **대상 문서와 관련 기술 스택**을 정리한다.

### 대상 설계 문서

| 문서 | 위치 | 수정 범위 | 요구사항 |
|------|------|-----------|---------|
| 25-sqlite-schema.md | `.planning/deliverables/25-sqlite-schema.md` | 4.4 rules 컬럼 설명 | PLCY-01 |
| 33-time-lock-approval-mechanism.md | `.planning/deliverables/33-time-lock-approval-mechanism.md` | 4 evaluate(), 11.6 다운그레이드 | PLCY-02, PLCY-03 |
| 34-owner-wallet-connection.md | `.planning/deliverables/34-owner-wallet-connection.md` | 10 Owner 생명주기 | PLCY-02 |

### 참조 문서 (읽기 전용)

| 문서 | 위치 | 참조 사유 |
|------|------|----------|
| 24-monorepo-data-directory.md | `.planning/deliverables/24-monorepo-data-directory.md` | config.toml [security] 섹션의 `policy_defaults_approval_timeout` 키 확인 |
| 52-auth-model-redesign.md | `.planning/deliverables/52-auth-model-redesign.md` | config.toml [security] approval_timeout 초기 정의 확인 |
| v0.10 목표 문서 | `objectives/v0.10-pre-implementation-design-completion.md` | Phase A 확정 내용 참조 |

### 관련 기술 스택 (구현 시 사용, 본 Phase는 설계만)

| 기술 | 버전 | 역할 |
|------|------|------|
| Zod | - | PolicyRuleSchema discriminatedUnion 정의 (33-time-lock 2.2 SSoT) |
| Drizzle ORM | 0.45.x | policies 테이블 ORM 정의 (25-sqlite) |
| config.toml | - | [security].policy_defaults_approval_timeout 글로벌 설정 |

## Architecture Patterns

### Pattern 1: SSoT(Single Source of Truth) 교차 참조

**What:** 동일한 정보가 여러 문서에 존재할 때, 하나를 SSoT로 지정하고 나머지는 "SSoT: [문서] [섹션]" 형식으로 참조만 남긴다.

**When to use:** 이 Phase의 모든 수정에 적용

**적용 예시:**

```markdown
<!-- 25-sqlite 4.4 rules 컬럼 -- 수정 후 -->
| `rules` | TEXT (JSON) | NOT NULL | - | 정책별 규칙 JSON. **SSoT: 33-time-lock 2.2 PolicyRuleSchema** |
```

### Pattern 2: 이연 표기 제거 패턴

**What:** "Phase X에서 확정" 같은 이연 표기를 실제 SSoT 참조로 교체

**Before:**
```
정책별 규칙 JSON. LOCK-MECH (Phase 8)에서 각 type별 JSON 구조 확정
```

**After:**
```
정책별 규칙 JSON. SSoT: 33-time-lock-approval-mechanism.md 2.2 PolicyRuleSchema (10개 PolicyType의 Zod discriminatedUnion)
```

### Pattern 3: 확정 값 명시 패턴

**What:** 미정의/모호 사항을 확정 값으로 명시하되 근거를 함께 기술

**Example:**
```markdown
| GRACE 기간 | **무기한** (시간 제한 없음) | 타이머 기반은 불확실성 유발. Owner가 스스로 ownerAuth를 사용할 때 전이하는 것이 명확 |
```

### Pattern 4: 우선순위 체계 명시 패턴

**What:** 여러 소스에서 같은 설정이 올 수 있을 때, 결정 순서를 명확히 정의

**Example:**
```
타임아웃 결정 순서:
1. 해당 SPENDING_LIMIT 정책의 approval_timeout (정책별)
2. config.toml [security].policy_defaults_approval_timeout (글로벌 기본값)
3. 하드코딩 기본값: 3600초 (1시간)
```

### Anti-Patterns to Avoid

- **이연 표기 잔존:** "Phase X에서 확정" 표기를 남겨두면 구현자가 SSoT를 찾지 못한다
- **순환 참조:** A문서가 B를 참조하고 B가 다시 A를 참조하면 SSoT가 불명확해진다. 한 문서를 SSoT로 지정하고 나머지는 단방향 참조
- **암묵적 확정:** GRACE 기간 무기한 같은 중요 결정을 문서에 명시하지 않고 코드에서만 구현하면 설계-구현 괴리 발생
- **JSON 예시와 Zod 스키마 불일치:** 25-sqlite의 JSON 예시와 33-time-lock의 Zod 스키마가 필드명/구조에서 일치해야 함

## Don't Hand-Roll

이 Phase는 설계 문서 보완이므로 "라이브러리 대신 직접 구현하지 마라" 패턴이 아닌, **이미 존재하는 설계를 재발명하지 마라** 패턴을 정의한다.

| 문제 | 하지 말 것 | 대신 참조할 것 | 이유 |
|------|-----------|--------------|------|
| rules JSON 구조 정의 | 25-sqlite에서 새로 정의 | 33-time-lock 2.2 PolicyRuleSchema | 이미 10개 타입 Zod 스키마가 완전 정의됨 |
| GRACE 기간 정책 | 별도 타이머/크론 설계 | 34-owner 10의 resolveOwnerState() | 상태는 DB 컬럼이 아닌 순수 함수로 산출 |
| 다운그레이드 로직 | 34-owner 문서에 정책 평가 로직 추가 | 33-time-lock 11.6 Step 9.5 | 정책 평가는 33-time-lock이 SSoT |
| 타임아웃 결정 | 새로운 타임아웃 체계 설계 | config.toml [security].policy_defaults_approval_timeout | v0.7에서 이미 평탄화된 설정 키가 존재 |

**Key insight:** Phase 41은 새로운 설계를 추가하는 것이 아니라, v0.2~v0.9에서 이미 확정된 설계 결정을 명시적으로 문서화하고 교차 참조를 정리하는 작업이다.

## Common Pitfalls

### Pitfall 1: 25-sqlite의 JSON 예시 블록 미수정

**What goes wrong:** rules 컬럼 설명만 수정하고, 486행의 "rules JSON 구조 예시 (Phase 8 LOCK-MECH에서 확정, v0.6 확장)" 블록 헤더를 수정하지 않으면 이연 표기가 잔존
**Why it happens:** 컬럼 설명(480행)과 JSON 예시 블록 헤더(486행) 두 곳에 이연 표기가 있음
**How to avoid:** 두 곳 모두 수정 필수. 480행의 컬럼 설명 + 486행의 블록 헤더
**Warning signs:** "Phase 8" 또는 "LOCK-MECH에서 확정" 문구가 25-sqlite 어디에든 남아있으면 미완료

### Pitfall 2: 33-time-lock과 34-owner 간 SSoT 혼란

**What goes wrong:** 다운그레이드 로직의 SSoT가 불명확하여 구현자가 34-owner에서 정책 평가 로직을 찾으려 한다
**Why it happens:** 34-owner 10은 상태 전이를, 33-time-lock 11.6은 정책 평가를 각각 담당하는데, 이 분리가 명시적이지 않다
**How to avoid:** 34-owner 10에 "정책 평가 로직(다운그레이드 포함)의 SSoT: 33-time-lock 11.6" 명시 + 33-time-lock 11.6에 "Owner 상태 전이의 SSoT: 34-owner 10" 명시
**Warning signs:** 두 문서를 읽은 구현자가 "다운그레이드 결정 로직이 어디에 있는지" 묻는다면 참조가 불충분

### Pitfall 3: APPROVAL 타임아웃 우선순위 미반영 -- 코드 예시 불일치

**What goes wrong:** 33-time-lock 4 evaluate()의 기존 코드에서 `config.approval_timeout`만 사용하고 글로벌 config fallback이 없다
**Why it happens:** 현재 코드(913행)는 `approvalTimeoutSeconds: config.approval_timeout`만 반환. config.toml fallback이 누락
**How to avoid:** evaluate()의 APPROVAL 반환 코드에 3단계 우선순위를 반영한 의사코드 또는 코멘트 추가
**Warning signs:** `config.approval_timeout`만 단독으로 사용되고 글로벌 config 참조가 없다

### Pitfall 4: config.toml 키 이름 불일치

**What goes wrong:** 52-auth-redesign에서는 `[security].approval_timeout`으로 정의했으나, v0.7에서 config.toml이 평탄화되어 `[security].policy_defaults_approval_timeout`으로 변경됨
**Why it happens:** v0.7 Phase 30에서 config.toml 키를 평탄화(17키)했으나, 이전 문서의 참조가 갱신되지 않았을 수 있음
**How to avoid:** 33-time-lock에 타임아웃 우선순위를 명시할 때, 반드시 v0.7 이후 키 이름 `policy_defaults_approval_timeout`을 사용
**Warning signs:** `approval_timeout`이라는 키가 config.toml의 [security] 섹션에서 단독으로 사용되면 오류 (올바른 키: `policy_defaults_approval_timeout`)

### Pitfall 5: GRACE 무기한 정책의 암묵적 전제 누락

**What goes wrong:** "GRACE 기간은 무기한"이라고만 명시하고, GRACE->LOCKED 전이 트리거가 유일한 경로(ownerAuth Step 8.5 markOwnerVerified())임을 명시하지 않으면, 구현자가 추가 트리거를 상상할 수 있음
**Why it happens:** 34-owner 10.2 전이 #3에 "ownerAuth 첫 사용(자동)"으로 이미 기술되어 있지만, "이것이 유일한 트리거"라는 배타적 표현이 누락
**How to avoid:** "GRACE->LOCKED 전이 트리거: ownerAuth 미들웨어 Step 8.5 markOwnerVerified() **단일**. 타이머/크론/수동 전이 없음" 명시
**Warning signs:** "다른 조건에서도 LOCKED로 전이하나요?"라는 질문이 나오면 명시 부족

## Code Examples

### Example 1: 25-sqlite 4.4 rules 컬럼 -- 수정 전후 비교

**수정 전 (현재, 480행):**
```markdown
| `rules` | TEXT (JSON) | NOT NULL | - | 정책별 규칙 JSON. LOCK-MECH (Phase 8)에서 각 type별 JSON 구조 확정 |
```

**수정 후:**
```markdown
| `rules` | TEXT (JSON) | NOT NULL | - | 정책별 규칙 JSON. **SSoT: 33-time-lock-approval-mechanism.md 2.2 PolicyRuleSchema** (10개 PolicyType의 Zod discriminatedUnion). 각 type별 JSON 구조와 필드 제약을 정의 |
```

### Example 2: 25-sqlite 4.4 JSON 예시 블록 -- 수정 전후 비교

**수정 전 (현재, 486행):**
```markdown
**rules JSON 구조 예시 (Phase 8 LOCK-MECH에서 확정, v0.6 확장):**
```

**수정 후:**
```markdown
**rules JSON 구조 예시 (SSoT: 33-time-lock 2.2 PolicyRuleSchema, v0.6에서 10개 타입 확장):**
```

### Example 3: 34-owner 10 -- GRACE 기간 정책 추가 문구

10.1 섹션의 상태별 상세 테이블 이후에 추가:

```markdown
**GRACE 기간 정책:**

- GRACE 기간은 **무기한**이다 (시간 제한 없음, 타이머/크론 기반 자동 전이 없음)
- GRACE->LOCKED 전이 트리거는 **ownerAuth 미들웨어 Step 8.5 markOwnerVerified() 단일**이다
  - approve 또는 recover 엔드포인트에서 ownerAuth 서명 검증 성공 시 자동 전이
  - 이 외의 전이 경로는 존재하지 않음
- GRACE 상태에서 APPROVAL 티어 거래는 DELAY로 다운그레이드된다 (33-time-lock 11.6 Step 9.5 SSoT)
- **정책 평가 로직(다운그레이드 포함)의 SSoT: 33-time-lock-approval-mechanism.md 11.6**
```

### Example 4: 33-time-lock + 34-owner 간 SSoT 우선순위 명시

34-owner 10에 추가:

```markdown
**33-time-lock 11.6 다운그레이드와의 우선순위:**

| 관심사 | SSoT 문서 | 섹션 |
|--------|----------|------|
| Owner 상태 전이 (NONE/GRACE/LOCKED) | 34-owner-wallet-connection.md | 10 |
| 정책 평가 내 다운그레이드 로직 | 33-time-lock-approval-mechanism.md | 11.6 (Step 9.5) |
| resolveOwnerState() 함수 | 34-owner-wallet-connection.md | 10.1 |
| evaluate() 알고리즘 | 33-time-lock-approval-mechanism.md | 3.2, 3.3 |

> 34-owner 10은 Owner 상태 전이와 인증 요건을 정의한다. 33-time-lock 11.6 Step 9.5는 evaluate() 내부에서 resolveOwnerState() 결과를 사용하여 APPROVAL->DELAY 다운그레이드를 결정한다. 다운그레이드 정책 결정의 SSoT는 33-time-lock 11.6이다.
```

### Example 5: 33-time-lock 4 -- APPROVAL 타임아웃 결정 순서

evaluate() SPENDING_LIMIT 평가 섹션(3.2)의 APPROVAL 반환 부분에 추가:

```typescript
// APPROVAL: amount > delay_max
// 타임아웃 결정 순서 (v0.10 확정):
// 1. 정책별: SPENDING_LIMIT rules의 approval_timeout
// 2. 글로벌: config.toml [security].policy_defaults_approval_timeout
// 3. 하드코딩: 3600초 (1시간)
const approvalTimeout = config.approval_timeout    // 1. 정책별 (Zod default: 3600)
  ?? this.globalConfig.policy_defaults_approval_timeout  // 2. 글로벌 config
  ?? 3600                                          // 3. 하드코딩 fallback

return {
  allowed: true,
  tier: 'APPROVAL',
  approvalTimeoutSeconds: approvalTimeout,
}
```

> **참고:** SpendingLimitRuleSchema에서 `approval_timeout`은 `.default(3600)`으로 정의되어 있으므로, Zod 파싱 후에는 항상 값이 존재한다. 그러나 글로벌 config fallback 체계를 명시적으로 문서화하여, 향후 정책별 approval_timeout을 optional로 변경할 때의 설계 의도를 보존한다.

### Example 6: Stage 4 APPROVAL 큐잉의 타임아웃 결정 (4.3 보완)

```typescript
// Stage 4 APPROVAL 큐잉 시 타임아웃 결정
case 'APPROVAL':
  validateTransition('PENDING', 'QUEUED')
  // decision.approvalTimeoutSeconds는 evaluate()에서 이미 3단계 우선순위로 결정됨
  // 1. 정책별 approval_timeout → 2. 글로벌 config → 3. 3600초
  const resolvedTimeout = decision.approvalTimeoutSeconds ?? 3600  // evaluate() 결과 사용
  await db.update(transactions).set({
    tier,
    status: 'QUEUED',
    queuedAt: now,
    metadata: JSON.stringify({
      expiresAt: Math.floor(now.getTime() / 1000) + resolvedTimeout,
      approvalTimeoutSeconds: resolvedTimeout,
    }),
  }).where(eq(transactions.id, txId))
```

## State of the Art

| 항목 | 현재 상태 | 본 Phase 이후 상태 | 영향 |
|------|----------|-------------------|------|
| 25-sqlite rules 컬럼 | "LOCK-MECH Phase 8에서 확정" 이연 표기 | "SSoT: 33-time-lock 2.2 PolicyRuleSchema" 참조 | 구현자가 즉시 SSoT를 찾을 수 있음 |
| GRACE 기간 정책 | 미정의 (무기한인지 유기한인지 불명) | 무기한 확정 + 전이 트리거 단일 명시 | 구현자가 타이머 로직을 불필요하게 구현하지 않음 |
| 다운그레이드 SSoT | 33-time-lock과 34-owner 간 암묵적 분리 | 명시적 SSoT 테이블로 우선순위 확정 | 문서 간 해석 충돌 제거 |
| APPROVAL 타임아웃 | 정책별 approval_timeout만 사용 | 3단계 우선순위 명시 (정책별 > 글로벌 config > 하드코딩) | 글로벌 기본값 활용 가능 |

## Detailed Findings per Requirement

### PLCY-01: PolicyRuleSchema 교차 참조 정리

**현황 분석 (HIGH confidence -- 직접 문서 확인):**

25-sqlite 4.4에서 수정이 필요한 정확한 위치:

| 위치 | 행번호 | 현재 텍스트 | 문제 |
|------|--------|-----------|------|
| 컬럼 설명 테이블 | 480 | "정책별 규칙 JSON. LOCK-MECH (Phase 8)에서 각 type별 JSON 구조 확정" | 이연 표기 |
| JSON 예시 블록 헤더 | 486 | "rules JSON 구조 예시 (Phase 8 LOCK-MECH에서 확정, v0.6 확장)" | 이연 표기 |

33-time-lock 2.2 PolicyRuleSchema 현황:
- 10개 PolicyType의 Zod discriminatedUnion이 완전 정의됨 (175-388행)
- SpendingLimitRuleSchema: instant_max, notify_max, delay_max, delay_seconds, approval_timeout + USD optional 필드
- 나머지 9개 타입도 완전한 Zod 스키마 정의 완료
- evaluate() 11단계 알고리즘의 필드 접근과 1:1 대응 확인됨

25-sqlite의 동일 섹션(25-sqlite 2.4, 33-time-lock 2.1)에도 policies 테이블 정의가 존재하지만:
- 25-sqlite 2.4: `rules: text('rules').notNull()` -- 컬럼 정의만 (JSON 구조 미정의, 올바른 분리)
- 33-time-lock 2.1: policies 테이블 전체 구조 + Zod 스키마 (SSoT)
- 두 곳의 테이블 구조(컬럼, 타입, 인덱스)는 일치함

**수정 범위:** 25-sqlite 4.4 컬럼 설명(480행)과 JSON 예시 블록 헤더(486행) 2곳만 수정. 33-time-lock 2.2는 변경 없음.

### PLCY-02: Owner 상태 전이 확정 + 다운그레이드 우선순위

**현황 분석 (HIGH confidence -- 직접 문서 확인):**

34-owner 10 현재 상태:
- 10.1: 3-State 상태 머신(NONE/GRACE/LOCKED) 다이어그램 + resolveOwnerState() 코드 완비
- 10.2: 6가지 전이 조건표 완비 (전이 #3이 GRACE->LOCKED)
- 10.2 전이 #3 설명: "ownerAuth 미들웨어 Step 8.5에서 markOwnerVerified()를 자동 호출"
- **누락 사항:** "GRACE 기간은 무기한"이라는 명시적 기술 없음. "이것이 유일한 전이 트리거"라는 배타적 표현 없음

33-time-lock 11.6 현재 상태:
- Step 9.5 의사코드 완비 (2436-2456행)
- `ownerState !== 'LOCKED'` 조건으로 NONE/GRACE 모두 다운그레이드
- 핵심 설계 사항 테이블 완비 (2460-2471행)
- **누락 사항:** 34-owner 10과의 SSoT 우선순위 명시 없음

**보완 필요 사항:**

1. 34-owner 10.1에 GRACE 기간 정책 추가:
   - "GRACE 기간은 무기한(시간 제한 없음)"
   - "GRACE->LOCKED 전이 트리거: ownerAuth 미들웨어 Step 8.5 markOwnerVerified() **단일**"
   - "GRACE 상태에서 APPROVAL 거래는 DELAY로 다운그레이드 (SSoT: 33-time-lock 11.6)"

2. 34-owner 10에 SSoT 우선순위 테이블 추가:
   - Owner 상태 전이 -> 34-owner 10 (SSoT)
   - 정책 평가 다운그레이드 -> 33-time-lock 11.6 (SSoT)

3. 33-time-lock 11.6에 역방향 참조 추가:
   - "Owner 상태 전이의 SSoT: 34-owner 10"

### PLCY-03: APPROVAL 타임아웃 결정 순서

**현황 분석 (HIGH confidence -- 직접 문서 확인):**

현재 타임아웃 결정의 분산 상태:

| 소스 | 위치 | 키 이름 | 기본값 | 비고 |
|------|------|---------|--------|------|
| 정책별 | 33-time-lock 2.2 SpendingLimitRuleSchema | `approval_timeout` | 3600 (Zod .default) | 각 SPENDING_LIMIT 정책마다 설정 가능 |
| 글로벌 config | 24-monorepo [security] | `policy_defaults_approval_timeout` | 3600 | v0.7 평탄화된 키 |
| 글로벌 config (구버전 참조) | 52-auth-redesign | `approval_timeout` | 3600 | v0.7 이전 키 이름 (평탄화 전) |
| 하드코딩 | 33-time-lock Stage 4 (1113-1114행) | `decision.approvalTimeoutSeconds ?? 3600` | 3600 | 코드 내 fallback |

**문제점:**
1. 33-time-lock 4 evaluate() 내에 3단계 우선순위가 명시되어 있지 않음
2. evaluate()의 SPENDING_LIMIT 평가 함수(879-915행)에서 `config.approval_timeout`만 반환하고 글로벌 config를 참조하지 않음
3. Stage 4(1105-1117행)에서 `decision.approvalTimeoutSeconds ?? 3600` fallback이 있으나, 이것이 의도적 3단계 체계인지 우발적 방어인지 불명확

**확정할 내용 (v0.10 목표 문서에서 이미 결정됨):**

```
APPROVAL 타임아웃 결정 순서:
1. 해당 거래에 매칭된 SPENDING_LIMIT 정책의 approval_timeout (정책별)
2. config.toml [security].policy_defaults_approval_timeout (글로벌 기본값)
3. 하드코딩 기본값: 3600초 (1시간)

우선순위: 정책별 > 글로벌 config > 하드코딩
```

**수정 범위:**
- 33-time-lock 3.2 evaluate() 내 SPENDING_LIMIT 평가의 APPROVAL 반환 부분에 3단계 우선순위 코멘트/의사코드 추가
- 33-time-lock 4 (또는 적절한 섹션)에 타임아웃 결정 순서 테이블 추가

**주의:** SpendingLimitRuleSchema의 `approval_timeout`은 `.default(3600)`으로 정의되어 있으므로, Zod 파싱 후에는 항상 값이 존재한다. 따라서 현재 구조에서는 "정책별 approval_timeout이 없는" 상황이 발생하지 않는다. 그러나:
- 글로벌 config fallback 체계를 **명시적으로 문서화**하는 것이 설계 의도 보존에 중요
- 향후 approval_timeout을 optional로 변경할 가능성 대비
- evaluate() 내부에서 글로벌 config를 주입받는 방법(생성자 주입 등)을 명시해야 함

## Open Questions

### 1. SpendingLimitRuleSchema의 approval_timeout Zod default와 글로벌 config의 관계

- **What we know:** SpendingLimitRuleSchema에서 `approval_timeout: z.number().int().min(300).max(86400).default(3600)`으로 정의됨. Zod `.default(3600)`이 적용되므로, 정책 JSON에 approval_timeout이 누락되어도 파싱 후에는 3600이 들어감
- **What's unclear:** Zod default와 글로벌 config가 모두 3600일 때, 실질적으로 3단계 우선순위가 동작하는 시나리오가 있는가? (Zod default가 이미 값을 채우므로 2, 3단계에 도달하지 않는 구조)
- **Recommendation:** 문서에 "현재 SpendingLimitRuleSchema의 Zod default(3600)가 항상 값을 채우므로, 사실상 정책별 값이 항상 존재한다. 글로벌 config는 향후 approval_timeout을 optional로 변경할 때 fallback으로 사용된다"는 설명을 추가. 또는 DatabasePolicyEngine 생성자에 globalConfig를 주입하는 패턴을 명시

### 2. 52-auth-redesign의 config 키 이름 갱신 여부

- **What we know:** 52-auth-redesign(v0.5)에서 `[security].approval_timeout`으로 정의했으나, 24-monorepo(v0.7)에서 `[security].policy_defaults_approval_timeout`으로 평탄화됨
- **What's unclear:** 52-auth-redesign 문서 자체를 수정해야 하는지, 아니면 33-time-lock에서 새 키 이름만 참조하면 충분한지
- **Recommendation:** Phase 41의 scope는 25-sqlite, 33-time-lock, 34-owner 3개 문서이므로, 52-auth-redesign 수정은 범위 외. 33-time-lock에서 v0.7 이후 키 이름(`policy_defaults_approval_timeout`)을 사용하고, "v0.7 평탄화 이후 키 이름. 24-monorepo [security] 섹션 참조" 주석을 추가

## Sources

### Primary (HIGH confidence)

- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/25-sqlite-schema.md` -- rules 컬럼 정의(480행), JSON 예시(486-561행), policies 테이블 전체
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/33-time-lock-approval-mechanism.md` -- PolicyRuleSchema(175-388행), evaluate() 알고리즘(560-916행), Step 9.5 다운그레이드(2420-2515행), Stage 4 APPROVAL 큐잉(1105-1117행)
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/34-owner-wallet-connection.md` -- Owner 생명주기(1661-1756행), resolveOwnerState()(1721-1739행), 전이 조건표(1741-1756행)
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/24-monorepo-data-directory.md` -- config.toml [security] policy_defaults_approval_timeout(863행, 986행, 1103행)
- `/Users/minho.yoo/dev/wallet/WAIaaS/objectives/v0.10-pre-implementation-design-completion.md` -- Phase A 확정 내용(55-109행)

### Secondary (MEDIUM confidence)

- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/52-auth-model-redesign.md` -- approval_timeout 초기 정의(430-449행). v0.7에서 키 이름이 변경되었으므로, 현재 키 이름은 24-monorepo를 참조

## Metadata

**Confidence breakdown:**
- PLCY-01 (PolicyRuleSchema 교차 참조): HIGH -- 25-sqlite와 33-time-lock 직접 확인, 수정 위치와 내용이 명확
- PLCY-02 (Owner 상태 전이 확정): HIGH -- 34-owner 10과 33-time-lock 11.6 직접 확인, v0.10 목표 문서에 확정 값 존재
- PLCY-03 (APPROVAL 타임아웃 우선순위): HIGH -- 관련 문서 4개 교차 확인, config.toml 키 이름까지 추적 완료

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (설계 문서 보완이므로 안정적)
