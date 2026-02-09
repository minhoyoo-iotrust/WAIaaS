# Phase 33: 정책 다운그레이드 + 알림 설계 - Research

**Researched:** 2026-02-09
**Domain:** 정책 엔진 다운그레이드 로직 + 알림 템플릿 설계 (설계 문서 반영 작업)
**Confidence:** HIGH

## Summary

Phase 33은 v0.8 Owner 선택적 등록 모델에서 핵심적인 "점진적 보안 해금"을 정책 엔진과 알림 시스템에 구체적으로 설계하는 단계이다. Owner 없는 에이전트의 APPROVAL 티어 거래를 차단하지 않고 DELAY로 다운그레이드하여 실행하되, 알림에 Owner 등록 안내를 포함시켜 자발적 보안 강화를 유도한다.

이 phase의 작업은 새로운 라이브러리 도입이나 외부 기술 연구가 필요하지 않다. 기존 설계 문서(33-time-lock-approval-mechanism.md, 35-notification-architecture.md, 32-transaction-pipeline-api.md)에 v0.8 다운그레이드 로직과 알림 템플릿을 반영하는 설계 작업이다. Phase 31에서 PolicyDecision 타입에 `downgraded`/`originalTier` optional 필드가 이미 추가되었고, Phase 31에서 `resolveOwnerState()` 유틸리티가 설계되었으므로, Phase 33은 이들을 소비하는 로직과 알림 분기를 명세한다.

**Primary recommendation:** evaluate() Step 9 이후 Step 9.5로 다운그레이드 삽입 지점을 명세하고, NotificationEventType에 TX_DOWNGRADED_DELAY를 추가하여 기존 TX_DELAY_QUEUED와 분리된 알림 템플릿으로 Owner 등록 안내를 포함시킨다.

## Standard Stack

이 phase는 설계 문서 반영 작업이므로 새로운 라이브러리가 필요하지 않다. 기존 프로젝트 스택을 그대로 활용한다.

### Core (기존 프로젝트 스택 -- 변경 없음)

| Library | Version | Purpose | 참조 |
|---------|---------|---------|------|
| Zod | 3.x | PolicyDecision 스키마 확장 | 45-enum-unified-mapping.md |
| better-sqlite3 | 11.x | BEGIN IMMEDIATE 트랜잭션 | 33-time-lock-approval-mechanism.md |
| lru-cache | 10.x | NotificationService 중복 방지 | 35-notification-architecture.md |

### Supporting (참조만 -- 직접 사용 안 함)

| Library | Purpose | When Referenced |
|---------|---------|----------------|
| Telegram Bot API | 알림 채널 어댑터 | 템플릿 포맷 설계 시 MarkdownV2 제약 반영 |
| Discord Webhook API | 알림 채널 어댑터 | Embed 구조 설계 시 필드/색상 반영 |
| ntfy.sh API | 알림 채널 어댑터 | Actions 헤더 설계 시 |

## Architecture Patterns

### Pattern 1: evaluate() Step 9 이후 다운그레이드 삽입 (Step 9.5)

**What:** DatabasePolicyEngine.evaluate()의 11단계 알고리즘에서 Step 9(SPENDING_LIMIT 금액 기반 티어 결정) 직후, Step 10(APPROVE_TIER_OVERRIDE) 전에 다운그레이드 로직을 삽입한다.

**When to use:** evaluate() 결과가 APPROVAL 티어이고 에이전트의 OwnerState가 NONE 또는 GRACE일 때

**Why Step 9 이후, Step 10 전:**
- Step 9가 금액 기반 최종 티어를 결정하는 시점이다 (nativeTier + usdTier의 maxTier)
- Step 10(APPROVE_TIER_OVERRIDE)은 APPROVE 트랜잭션 전용이므로, 다운그레이드는 Step 10 전에 수행해야 일반 TRANSFER/TOKEN_TRANSFER도 커버한다
- Step 10 이후에 삽입하면 APPROVE 트랜잭션의 TIER_OVERRIDE 결과와 충돌할 수 있다

**설계 상세:**

```typescript
// evaluate() 내부 -- Step 9 이후 삽입
// Step 9: 금액 기반 티어 결정
const tierResult = this.evaluateSpendingLimit(effectiveRules, request)

// [v0.8] Step 9.5: OwnerState 기반 APPROVAL -> DELAY 다운그레이드
if (tierResult.allowed && tierResult.tier === 'APPROVAL') {
  const ownerState = resolveOwnerState(agent)
  if (ownerState === 'NONE' || ownerState === 'GRACE') {
    // Owner가 없거나 검증 전이면 승인 불가 -> DELAY로 다운그레이드
    return {
      allowed: true,
      tier: 'DELAY',
      delaySeconds: tierResult.delaySeconds
        ?? this.getDefaultDelaySeconds(effectiveRules),
      downgraded: true,
      originalTier: 'APPROVAL',
    }
  }
}

// Step 10: APPROVE_TIER_OVERRIDE (기존 로직 유지)
```

**핵심 결정 사항:**

| 결정 | 값 | 근거 |
|------|-----|------|
| 다운그레이드 삽입 지점 | Step 9 이후, Step 10 전 | Step 9가 최종 tier를 결정하는 시점 |
| 다운그레이드 대상 OwnerState | NONE, GRACE | NONE은 Owner 미등록, GRACE는 ownerAuth 미사용(승인 불가) |
| delaySeconds 결정 | SPENDING_LIMIT의 delay_seconds 사용 | APPROVAL 규칙에 delay_seconds가 없을 수 있으므로 fallback 필요 |
| APPROVE 트랜잭션 처리 | 동일하게 다운그레이드 | APPROVE도 Owner 서명이 필요한 APPROVAL 티어면 다운그레이드 |
| BATCH 트랜잭션 처리 | 개별 instruction 평가 후 합산 티어에서 다운그레이드 | evaluateBatch()의 최종 결과에 Step 9.5 적용 |

### Pattern 2: PolicyDecision.downgraded 기반 알림 분기

**What:** Stage 4(Tier Classify)에서 PolicyDecision을 받아 알림을 전송할 때, `downgraded === true`이면 기존 TX_DELAY_QUEUED 대신 다운그레이드 전용 알림을 전송한다.

**분기 조건:**

```typescript
// Stage 4 확장 -- 알림 분기
if (decision.tier === 'DELAY') {
  if (decision.downgraded) {
    // 다운그레이드 알림 (Owner 등록 안내 포함)
    notificationService.notify({
      event: 'TX_DOWNGRADED_DELAY',  // 또는 기존 TX_DELAY_QUEUED + metadata.downgraded
      level: 'INFO',
      title: `대액 거래 대기 중 (APPROVAL -> DELAY 다운그레이드)`,
      body: `...Owner 등록 안내...`,
      metadata: {
        downgraded: true,
        originalTier: 'APPROVAL',
        ownerRegistrationCommand: `waiaas agent set-owner ${agentName} <address>`,
      },
    })
  } else {
    // 일반 DELAY 알림
    notificationService.notify({ event: 'TX_DELAY_QUEUED', ... })
  }
}
```

**설계 선택지 분석:**

| 접근 | 장점 | 단점 | 추천 |
|------|------|------|:----:|
| **A: 새 이벤트 타입 TX_DOWNGRADED_DELAY** | 알림 템플릿 완전 분리, 채널별 독립 포맷 | NotificationEventType enum 확장 필요 | O |
| B: 기존 TX_DELAY_QUEUED + metadata.downgraded | enum 변경 없음 | 채널 어댑터 내부에서 metadata 분기 필요, 복잡도 증가 | X |

**추천: 접근 A (TX_DOWNGRADED_DELAY 신규 이벤트)**
- 기존 TX_DELAY_QUEUED 템플릿을 변경하지 않으므로 하위 호환성 유지
- 채널 어댑터(Telegram/Discord/ntfy)가 이벤트 타입으로 포맷을 결정하므로 깔끔한 분기
- 단, 기존 15개 이벤트가 16개로 증가 (허용 가능한 수준)

### Pattern 3: APPROVAL 대기 알림의 [승인]/[거부] 버튼 명세

**What:** Owner 있는 에이전트의 APPROVAL 거래 대기 시, 알림에 승인/거부 액션 버튼을 채널별로 명세한다.

**채널별 버튼 구현 방식:**

| 채널 | 버튼 구현 | API 제약 |
|------|----------|----------|
| Telegram | InlineKeyboardMarkup (callback_data) | sendMessage의 reply_markup 파라미터 |
| Discord | Embed + Components (Button) | 단, Webhook은 components 미지원 -> Embed footer에 URL 안내 |
| ntfy.sh | Actions 헤더 (view/http) | `Actions: view, 승인 대시보드, {url}; http, 거부, {rejectUrl}` |

**중요:** Discord Webhook은 Interactive Components(Button)를 직접 지원하지 않는다. Discord Bot Token이 있어야 버튼을 사용할 수 있다. 현재 설계는 Webhook 전용이므로, Discord에서는 버튼 대신 Embed footer에 승인 URL을 텍스트로 안내한다.

### Pattern 4: Owner 등록 후 APPROVAL 정상 처리 흐름 명세

**What:** Owner 등록 후 동일 금액 거래가 정상 APPROVAL 티어로 처리되는 흐름을 명세한다.

**흐름:**
1. 에이전트에 Owner 등록 (set-owner) -> OwnerState: NONE -> GRACE
2. 동일 금액 거래 요청 -> evaluate() Step 9에서 APPROVAL 결정
3. Step 9.5: OwnerState === GRACE -> **여전히 다운그레이드** (ownerAuth 미사용이므로 승인 불가)
4. ownerAuth 최초 사용 (다른 경로, 예: 이전 거래 승인) -> GRACE -> LOCKED
5. 이후 동일 금액 거래 -> Step 9.5: OwnerState === LOCKED -> **다운그레이드 안 함** -> 정상 APPROVAL

**핵심:** POLICY-03 요구사항의 "Owner 등록 후 동일 금액 거래가 정상적으로 APPROVAL 티어로 처리된다"는 Owner 등록 + ownerAuth 검증 완료(LOCKED 상태) 이후에 성립한다. GRACE 상태에서는 여전히 다운그레이드된다.

### Anti-Patterns to Avoid

- **evaluate() 외부에서 다운그레이드:** 다운그레이드는 evaluate() 내부(Step 9.5)에서 수행한다. Stage 4에서 별도로 다운그레이드하면 PolicyDecision의 SSoT가 깨진다.
- **GRACE 상태에서 APPROVAL 허용:** GRACE는 ownerAuth 미사용 상태이므로 Owner 서명을 받을 수 없다. 반드시 다운그레이드해야 한다.
- **delaySeconds를 0으로 설정:** 다운그레이드 DELAY에서 delaySeconds가 0이면 사실상 INSTANT이 되어 보안 의미가 없다. 최소 60초(SPENDING_LIMIT 규칙의 delay_seconds 최소값)를 보장한다.
- **TX_DELAY_QUEUED 이벤트에 다운그레이드 로직 혼합:** 기존 DELAY 알림과 다운그레이드 알림은 메시지 내용이 근본적으로 다르다 (Owner 등록 안내 포함 여부). 이벤트 타입을 분리하여 채널 어댑터의 복잡도를 줄인다.
- **Telegram InlineKeyboard에 직접 승인 수행:** Telegram 버튼 callback은 승인 대시보드 URL로 연결해야 한다. 버튼 클릭만으로 승인을 수행하면 ownerAuth(SIWS/SIWE 서명) 검증이 불가능하다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OwnerState 산출 | 새 함수 정의 | resolveOwnerState() (33-time-lock 섹션 12) | Phase 31에서 이미 설계된 순수 함수 |
| PolicyDecision 타입 확장 | 새 인터페이스 | 기존 PolicyDecision + downgraded/originalTier (32-transaction-pipeline 섹션 3.1) | Phase 31에서 이미 optional 필드 추가 완료 |
| 알림 전송 | 직접 HTTP 호출 | NotificationService.notify() (35-notification 섹션 6) | 폴백 체인, rate limit, 중복 방지 내장 |
| DELAY 큐잉 | 새 큐잉 로직 | 기존 Stage 4 DELAY 큐잉 + DelayQueueWorker (33-time-lock 섹션 6) | 다운그레이드 DELAY도 동일 큐잉 경로 사용 |

**Key insight:** Phase 33의 모든 기반 타입과 인프라는 Phase 31/32에서 이미 설계되었다. Phase 33은 이들을 "연결"하는 설계이지, 새로운 인프라를 만드는 것이 아니다.

## Common Pitfalls

### Pitfall 1: delaySeconds fallback 누락

**What goes wrong:** SPENDING_LIMIT 규칙에 delay_seconds가 설정되어 있지만, APPROVAL 다운그레이드 시 이 값을 사용하지 않고 하드코딩된 기본값을 사용한다.
**Why it happens:** APPROVAL 티어는 원래 delay_seconds를 사용하지 않고 approval_timeout을 사용한다. 다운그레이드 시 delay_seconds가 PolicyDecision에 포함되지 않을 수 있다.
**How to avoid:** 다운그레이드 시 SPENDING_LIMIT 규칙의 delay_seconds를 명시적으로 읽어서 설정한다. 규칙이 없으면 300초(5분) 기본값을 사용한다.
**Warning signs:** 다운그레이드 DELAY의 delaySeconds가 undefined인 PolicyDecision이 반환된다.

### Pitfall 2: evaluateBatch()에서 다운그레이드 누락

**What goes wrong:** 개별 instruction 평가에서는 다운그레이드가 적용되지만, 합산 티어 결정(evaluateBatch의 최종 sumTierDecision)에서 다운그레이드를 적용하지 않는다.
**Why it happens:** evaluateBatch()는 개별 evaluate() 결과의 maxTier를 구한 뒤 별도로 합산 tiering을 수행한다. 이 합산 결과에도 Step 9.5를 적용해야 한다.
**How to avoid:** evaluateBatch()의 최종 PolicyDecision 반환 전에 동일한 다운그레이드 로직(Step 9.5)을 적용한다. 또는 다운그레이드를 evaluate()의 최종 반환 전에 일괄 적용하는 래퍼 함수를 사용한다.
**Warning signs:** BATCH 트랜잭션의 합산 금액이 APPROVAL 티어인데 Owner가 없는 에이전트에서 APPROVAL로 큐잉된다.

### Pitfall 3: 알림 이벤트 타입 enum 불일치

**What goes wrong:** TX_DOWNGRADED_DELAY 이벤트를 추가했지만, 35-notification-architecture.md의 이벤트-심각도 매핑 테이블, 알림 호출 포인트 테이블, NotificationEventType enum에 모두 반영하지 않는다.
**Why it happens:** 이벤트 타입이 여러 테이블에 걸쳐 정의되어 있다.
**How to avoid:** 35-notification-architecture.md에서 변경해야 할 3가지 위치를 체크리스트로 관리한다: (1) NotificationEventType enum, (2) 이벤트별 심각도 매핑 테이블, (3) 알림 호출 포인트 테이블.
**Warning signs:** 특정 테이블에만 이벤트가 추가되고 다른 테이블에는 누락된다.

### Pitfall 4: APPROVE 트랜잭션의 이중 다운그레이드

**What goes wrong:** APPROVE 트랜잭션에서 Step 9.5 다운그레이드 후 Step 10(APPROVE_TIER_OVERRIDE)이 다운그레이드된 DELAY를 다시 APPROVAL로 올린다.
**Why it happens:** Step 10은 APPROVE 트랜잭션의 티어를 재정의하는 로직이다. 다운그레이드 후에도 Step 10이 적용되면 다운그레이드가 무효화된다.
**How to avoid:** Step 9.5에서 다운그레이드가 적용되면 즉시 return하여 Step 10을 건너뛴다. 또는 Step 10에서 `downgraded === true`인 경우 OVERRIDE를 스킵한다.
**Warning signs:** APPROVE 트랜잭션이 Owner 없는 에이전트에서 APPROVAL로 큐잉된다.

### Pitfall 5: Discord Webhook에서 버튼 사용 시도

**What goes wrong:** APPROVAL 대기 알림에 Discord Inline Button(Component)을 사용하려고 설계한다.
**Why it happens:** Discord Bot과 Discord Webhook의 기능 차이를 혼동한다.
**How to avoid:** 현재 35-notification-architecture.md의 DiscordChannel은 Webhook 기반이다. Webhook은 Interactive Components(Button)를 지원하지 않으므로, Embed footer에 승인 URL을 텍스트로 안내한다.
**Warning signs:** Discord 알림에 `components` 필드를 포함하는 설계가 작성된다.

## Code Examples

### Example 1: evaluate() Step 9.5 다운그레이드 로직

```typescript
// 33-time-lock-approval-mechanism.md에 추가할 설계
// DatabasePolicyEngine.evaluate() 내부

// Step 9: 금액 기반 티어 결정 (기존)
const tierResult = this.evaluateSpendingLimit(effectiveRules, request)

// [v0.8] Step 9.5: OwnerState 기반 APPROVAL -> DELAY 다운그레이드
if (tierResult.allowed && tierResult.tier === 'APPROVAL') {
  const ownerState = resolveOwnerState(agent)
  if (ownerState !== 'LOCKED') {
    // NONE 또는 GRACE: Owner 승인 불가 -> DELAY로 다운그레이드
    const spendingRule = effectiveRules.find(r => r.type === 'SPENDING_LIMIT')
    const config = spendingRule ? JSON.parse(spendingRule.rules) : {}
    return {
      allowed: true,
      tier: 'DELAY',
      delaySeconds: config.delay_seconds ?? 300,  // SPENDING_LIMIT의 delay_seconds 사용
      downgraded: true,
      originalTier: 'APPROVAL',
    }
  }
}

// Step 10: APPROVE_TIER_OVERRIDE (기존 -- downgraded 시 도달하지 않음)
```

### Example 2: 다운그레이드 알림 템플릿 (Telegram MarkdownV2)

```
ℹ️ *대액 거래 대기 중 \(다운그레이드\)*

Agent "trading\-bot"의 15 SOL \(≈ $2,250\) 전송이
DELAY 큐에 대기합니다\.
수신: 9bKr\.\.\.TDxz
실행 예정: 5분 후

원래 티어: APPROVAL → DELAY로 자동 전환
\(Owner 미등록 에이전트\)

💡 *Owner 지갑을 등록하면 대액 거래에*
   *승인 정책을 적용할 수 있습니다\.*
   `waiaas agent set\-owner trading\-bot <address>`

TX: 0195\.\.\. \| Agent: 0195\.\.\.

_2026\-02\-09T14:30:00Z_
```

### Example 3: APPROVAL 대기 알림 템플릿 (Owner 있는 에이전트, Telegram)

```
⚠️ *거래 승인 요청*

Agent "trading\-bot"이 15 SOL \(≈ $2,250\) 전송을 요청했습니다\.
수신: 9bKr\.\.\.TDxz
타임아웃: 60분

TX: 0195\.\.\. \| Agent: 0195\.\.\.

_2026\-02\-09T14:30:00Z_
```

Telegram InlineKeyboardMarkup:
```json
{
  "reply_markup": {
    "inline_keyboard": [[
      { "text": "✅ 승인", "url": "http://127.0.0.1:3100/approve/{txId}?nonce={nonce}" },
      { "text": "❌ 거부", "url": "http://127.0.0.1:3100/reject/{txId}?nonce={nonce}" }
    ]]
  }
}
```

### Example 4: evaluateBatch() 다운그레이드 적용

```typescript
// 33-time-lock-approval-mechanism.md evaluateBatch()에 추가할 설계
async function evaluateBatch(
  agentId: string,
  instructions: TxRequest[],
): Promise<PolicyDecision> {
  // ... 기존 개별 instruction 평가 + 합산 tiering ...

  const sumTierDecision = this.evaluateSpendingLimit(effectiveRules, {
    amount: totalAmount.toString(),
    // ...
  })

  // [v0.8] 합산 결과에도 Step 9.5 다운그레이드 적용
  if (sumTierDecision.allowed && sumTierDecision.tier === 'APPROVAL') {
    const ownerState = resolveOwnerState(agent)
    if (ownerState !== 'LOCKED') {
      const spendingRule = effectiveRules.find(r => r.type === 'SPENDING_LIMIT')
      const config = spendingRule ? JSON.parse(spendingRule.rules) : {}
      return {
        allowed: true,
        tier: 'DELAY',
        delaySeconds: config.delay_seconds ?? 300,
        downgraded: true,
        originalTier: 'APPROVAL',
      }
    }
  }

  return sumTierDecision
}
```

## State of the Art

이 phase는 프로젝트 내부 설계 작업이므로 "state of the art"는 기존 설계 문서의 현재 상태를 의미한다.

| 문서 | 현재 상태 | Phase 33에서 변경할 내용 |
|------|----------|------------------------|
| 33-time-lock-approval-mechanism.md | v0.8 resolveOwnerState + markOwnerVerified 추가 완료 (Phase 31) | evaluate() Step 9.5 다운그레이드 로직 + evaluateBatch 다운그레이드 |
| 35-notification-architecture.md | v0.8 반영 없음 (원본 상태) | TX_DOWNGRADED_DELAY 이벤트 + 템플릿 + APPROVAL 버튼 명세 |
| 32-transaction-pipeline-api.md | PolicyDecision.downgraded/originalTier 추가 완료 (Phase 31) | Stage 4 다운그레이드 분기 상세화 (선택적) |

**Phase 31/32에서 이미 확보된 기반:**
- PolicyDecision 타입에 `downgraded?: boolean`, `originalTier?: 'APPROVAL'` 추가 완료
- resolveOwnerState() 유틸리티 설계 완료 (순수 함수, 3-state)
- agents 테이블에 owner_address nullable + owner_verified 컬럼 추가 완료
- OwnerLifecycleService, markOwnerVerified(), setOwner BEGIN IMMEDIATE 설계 완료

## Key Design Inputs (Phase 33 의존 정보)

### 1. evaluate() 11단계 현재 흐름 (33-time-lock §3.2)

```
Step 1:  정책 로드 (agent + global, priority DESC)
Step 2:  TransactionType 결정
Step 3:  ALLOWED_TOKENS (TOKEN_TRANSFER)
Step 4:  CONTRACT_WHITELIST (CONTRACT_CALL)
Step 5:  METHOD_WHITELIST (CONTRACT_CALL, EVM)
Step 6:  APPROVED_SPENDERS (APPROVE)
Step 7:  APPROVE_AMOUNT_LIMIT (APPROVE)
Step 8:  WHITELIST + TIME_RESTRICTION + RATE_LIMIT
Step 9:  SPENDING_LIMIT (금액 기반 티어 결정, USD dual 평가)
--- [v0.8] Step 9.5: APPROVAL -> DELAY 다운그레이드 삽입 지점 ---
Step 10: APPROVE_TIER_OVERRIDE (APPROVE 전용)
Step 11: 최종 PolicyDecision 반환
```

### 2. resolveOwnerState() 입출력 (33-time-lock §12)

```typescript
// 입력
interface AgentOwnerInfo {
  ownerAddress: string | null
  ownerVerified: boolean
}

// 출력
type OwnerState = 'NONE' | 'GRACE' | 'LOCKED'

// 로직
function resolveOwnerState(agent: AgentOwnerInfo): OwnerState {
  if (agent.ownerAddress === null) return 'NONE'
  if (!agent.ownerVerified) return 'GRACE'
  return 'LOCKED'
}
```

### 3. PolicyDecision v0.8 확장 (32-transaction-pipeline §3.1)

```typescript
interface PolicyDecision {
  allowed: boolean
  tier: 'INSTANT' | 'NOTIFY' | 'DELAY' | 'APPROVAL'
  reason?: string
  policyId?: string
  delaySeconds?: number
  approvalTimeoutSeconds?: number
  // [v0.8]
  downgraded?: boolean
  originalTier?: 'APPROVAL'
}
```

### 4. NotificationEventType 현재 목록 (35-notification §2.4)

현재 15개 이벤트:
TX_NOTIFY, TX_DELAY_QUEUED, TX_DELAY_EXECUTED, TX_APPROVAL_REQUEST, TX_APPROVAL_EXPIRED, TX_CONFIRMED, TX_FAILED, KILL_SWITCH_ACTIVATED, KILL_SWITCH_RECOVERED, AUTO_STOP_TRIGGERED, SESSION_CREATED, SESSION_REVOKED, SESSION_RENEWED, SESSION_RENEWAL_REJECTED, DAILY_SUMMARY

### 5. 기존 알림 템플릿 패턴 (35-notification §3.3, §11)

- Telegram: MarkdownV2 (특수문자 이스케이프 필수), 4096자 제한
- Discord: Embed JSON (title, description, color, fields, footer, timestamp), 4096자 제한
- ntfy.sh: Title/Priority/Tags/Actions 헤더 + plain text body

### 6. APPROVAL 승인 URL 패턴 (35-notification §12.3)

```
http://127.0.0.1:3100/v1/owner/approvals/{approvalId}?nonce={nonce}
```

### 7. Stage 4 현재 동작 (33-time-lock §4.3)

```typescript
// DELAY 큐잉 시
case 'DELAY':
  validateTransition('PENDING', 'QUEUED')
  await db.update(transactions).set({
    tier: 'DELAY',  // [v0.8] 다운그레이드 시에도 tier='DELAY'로 저장
    status: 'QUEUED',
    queuedAt: now,
    metadata: JSON.stringify({
      expiresAt: ...,
      delaySeconds: decision.delaySeconds ?? 300,
      // [v0.8] 다운그레이드 정보 추가
      downgraded: decision.downgraded ?? false,
      originalTier: decision.originalTier,
    }),
  }).where(eq(transactions.id, txId))
```

### 8. 감사 로그 이벤트 추가 필요 사항

다운그레이드 발생 시 audit_log에 기록할 이벤트:
- event_type: `TX_DOWNGRADED` (신규)
- details: `{ originalTier: 'APPROVAL', downgraded_tier: 'DELAY', ownerState: 'NONE'|'GRACE', reason: 'OWNER_NOT_LOCKED' }`
- severity: `info`

## Plan별 설계 대상 정리

### Plan 33-01: DatabasePolicyEngine 다운그레이드 로직 + PolicyDecision 확장 설계

**대상 문서:** 33-time-lock-approval-mechanism.md
**추가할 내용:**
1. evaluate() Step 9.5 다운그레이드 로직 (신규 섹션)
   - 삽입 지점: Step 9 이후, Step 10 전
   - resolveOwnerState() 호출 + NONE/GRACE 판별
   - delaySeconds fallback 로직
   - 즉시 return으로 Step 10 스킵 (APPROVE 트랜잭션 이중 다운그레이드 방지)
2. evaluateBatch()에 Step 9.5 적용
3. 다운그레이드 시 audit_log 기록 (TX_DOWNGRADED 이벤트)
4. evaluate()의 agent 파라미터 확장 (AgentOwnerInfo 접근 필요)
5. Owner 등록 후 동일 금액 거래 APPROVAL 정상 처리 흐름 명세

**evaluate() 시그니처 변경 필요 여부:**
- 현재: `evaluate(agentId: string, request: TxRequest): Promise<PolicyDecision>`
- 다운그레이드에 OwnerState가 필요하므로 agent 정보 접근 필요
- 선택지 A: 시그니처에 AgentOwnerInfo 추가 -> `evaluate(agentId, request, agent)`
- 선택지 B: DatabasePolicyEngine 생성자에 agent 조회 함수 주입
- **추천: 선택지 A** -- evaluate() 호출부(Stage 3)에서 이미 agent를 DB에서 로드하므로 전달이 자연스러움

### Plan 33-02: 다운그레이드/APPROVAL 알림 템플릿 + Owner 등록 안내 설계

**대상 문서:** 35-notification-architecture.md
**추가할 내용:**
1. NotificationEventType에 TX_DOWNGRADED_DELAY 추가 (15 -> 16개)
2. TX_DOWNGRADED_DELAY 이벤트-심각도 매핑: INFO
3. TX_DOWNGRADED_DELAY 알림 호출 포인트: Stage 4 QUEUED 전이 후 (downgraded === true 시)
4. 채널별 다운그레이드 알림 템플릿 (Telegram/Discord/ntfy.sh)
   - Owner 등록 안내 메시지 (`waiaas agent set-owner` 명령어 포함)
   - 원래 티어(APPROVAL) 및 다운그레이드 사유 표시
5. APPROVAL 대기 알림 (Owner 있는 에이전트)에 [승인]/[거부] 버튼 명세
   - Telegram: InlineKeyboardMarkup (url 기반 -- callback 아님)
   - Discord: Embed footer에 승인 URL 안내 (Webhook은 Button 미지원)
   - ntfy.sh: Actions 헤더에 view 액션
6. TX_APPROVAL_REQUEST 알림 호출 포인트 갱신 (Owner 있는 에이전트만)
7. 기존 TX_DELAY_QUEUED와 TX_DOWNGRADED_DELAY의 차이점 명시

## Open Questions

### 1. evaluate() 시그니처에 agent 정보 전달 방식

- **What we know:** 다운그레이드에 resolveOwnerState()가 필요하고, 이는 AgentOwnerInfo(ownerAddress + ownerVerified)를 입력으로 받는다. 현재 evaluate() 시그니처에는 agentId만 있다.
- **What's unclear:** IPolicyEngine 인터페이스를 변경하면 DefaultPolicyEngine도 영향받는다. Phase 7 호환성 유지가 필요하다.
- **Recommendation:** evaluate() 시그니처에 optional 파라미터로 agent를 추가하거나, DatabasePolicyEngine 구현체에서 내부적으로 agent를 조회한다. IPolicyEngine 인터페이스 자체는 변경하지 않고, DatabasePolicyEngine의 evaluate() 오버라이드에서 처리하는 것이 안전하다. 플랜에서 상세 설계 시 결정.

### 2. GRACE 상태에서 APPROVAL 허용 여부

- **What we know:** v0.8 objectives 문서는 "Owner 등록 후" APPROVAL이 해금된다고 기술한다. GRACE 상태는 Owner가 등록되었지만 ownerAuth를 사용한 적이 없는 상태이다.
- **What's unclear:** GRACE 상태에서 APPROVAL을 허용하면 Owner가 승인을 시도할 수 있지만, 첫 ownerAuth 사용이므로 동시에 LOCKED으로 전이된다. 이것이 의도된 동작인가?
- **Recommendation:** GRACE에서도 다운그레이드한다. 이유: (1) GRACE는 ownerAuth 미사용 상태이므로 승인 프로세스가 검증되지 않은 상태, (2) objectives에서 "Enhanced" 보안이 LOCKED에서만 완전 해금됨을 암시, (3) 보수적 접근이 안전하다. GRACE에서 APPROVAL을 첫 승인과 동시에 허용하는 것은 UX 개선이지만 복잡도가 증가한다. v0.9+ 고려 사항으로 분류.

### 3. TX_DOWNGRADED_DELAY vs TX_DELAY_QUEUED 감사 로그 분리

- **What we know:** 다운그레이드 DELAY와 일반 DELAY는 동일한 DelayQueueWorker에서 처리된다.
- **What's unclear:** 감사 로그에서 다운그레이드를 어떻게 구분할 것인가?
- **Recommendation:** Stage 4에서 audit_log INSERT 시 기존 TX_QUEUED 이벤트의 details에 `downgraded: true, originalTier: 'APPROVAL'`을 포함한다. 별도 TX_DOWNGRADED 이벤트를 추가하면 더 명확하다. 플랜에서 결정.

## Sources

### Primary (HIGH confidence)
- `.planning/deliverables/33-time-lock-approval-mechanism.md` -- evaluate() 11단계, SPENDING_LIMIT, resolveOwnerState(), markOwnerVerified()
- `.planning/deliverables/35-notification-architecture.md` -- NotificationEventType, 채널 어댑터, 템플릿 패턴, NotificationService
- `.planning/deliverables/32-transaction-pipeline-api.md` -- PolicyDecision v0.8 확장, Stage 3/4 파이프라인
- `.planning/deliverables/34-owner-wallet-connection.md` -- Owner 생명주기, OwnerLifecycleService
- `.planning/deliverables/52-auth-model-redesign.md` -- ownerAuth 미들웨어, Step 8.5
- `objectives/v0.8-optional-owner-progressive-security.md` -- 점진적 보안 해금 모델, 알림 예시
- `.planning/REQUIREMENTS.md` -- POLICY-01~03, NOTIF-01~02

### Secondary (HIGH confidence -- Phase 31/32 plans)
- `.planning/phases/31-데이터-모델-타입-기반-설계/31-01-PLAN.md` -- PolicyDecision 타입 확장 태스크
- `.planning/phases/31-데이터-모델-타입-기반-설계/31-02-PLAN.md` -- resolveOwnerState() 태스크
- `.planning/phases/32-owner-생명주기-설계/32-01-PLAN.md` -- OwnerLifecycleService 태스크
- `.planning/phases/32-owner-생명주기-설계/32-02-PLAN.md` -- 보안 공격 방어 태스크

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 새 라이브러리 불필요, 기존 프로젝트 스택 활용
- Architecture: HIGH -- 모든 기반 타입과 인터페이스가 Phase 31/32에서 설계 완료
- Pitfalls: HIGH -- 설계 문서 분석에서 구체적 충돌 지점 식별 완료
- 알림 템플릿: HIGH -- 35-notification-architecture.md의 기존 패턴을 확장

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (설계 문서 기반이므로 안정적)
