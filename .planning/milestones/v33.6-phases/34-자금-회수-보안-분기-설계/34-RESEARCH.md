# Phase 34: 자금 회수 + 보안 분기 설계 - Research

**Researched:** 2026-02-09
**Domain:** Withdraw API + WithdrawService 설계, Kill Switch Owner 유무 분기, 세션 갱신 Owner 분기
**Confidence:** HIGH

## Summary

Phase 34는 v0.8 마일스톤의 핵심 설계 phase로서, (1) Owner가 등록된 에이전트에서 자금을 전량 회수하는 withdraw API와 WithdrawService 설계, (2) Owner 유무에 따른 Kill Switch 복구 대기 시간 분기(24h vs 30min), (3) Owner 유무에 따른 세션 갱신 거부 윈도우 분기 및 [거부하기] 버튼 알림 설계를 다룬다.

선행 phase(31, 32, 33)에서 데이터 모델(agents.owner_address nullable, owner_verified), 타입(OwnerState, SweepResult), 인터페이스(IChainAdapter.sweepAll), 생명주기(OwnerLifecycleService), 정책 다운그레이드, 알림 이벤트 등 모든 기반 설계가 완료되었다. Phase 34는 이 기반 위에서 withdraw API 스펙, WithdrawService 비즈니스 로직, Kill Switch 복구 시간 분기, 세션 갱신 Owner 분기를 설계 문서에 반영하는 것이 목적이다.

본 phase는 새로운 외부 라이브러리 도입 없이 기존 설계 문서(27, 31, 34, 35, 36, 37, 52, 53)의 v0.8 보완으로 완성된다. 핵심은 objectives/v0.8에 이미 정의된 설계를 구체적 API 스펙, 서비스 코드 패턴, 에러 코드, HTTP 상태 코드, 알림 템플릿으로 확정하는 것이다.

**Primary recommendation:** Plan 34-01에서 withdraw API + WithdrawService + sweepAll Solana 실행 설계를 37-rest-api-complete-spec.md와 27-chain-adapter-interface.md에 반영하고, Plan 34-02에서 Kill Switch Owner 분기를 36-killswitch-autostop-evm.md에, 세션 갱신 Owner 분기 + [거부하기] 버튼을 53-session-renewal-protocol.md와 35-notification-architecture.md에 반영한다.

## Standard Stack

본 phase는 **설계 문서 수정**이 산출물이므로 새로운 라이브러리가 추가되지 않는다. 참조되는 기존 기술 스택:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono 4.x | 4.x | REST API 프레임워크 | CORE-06 확정 |
| @hono/zod-openapi | latest | Zod SSoT -> OpenAPI | v0.2 확정 |
| better-sqlite3 | latest | SQLite 동기 드라이버 | CORE-02 확정 |
| @solana/kit 3.x | 3.x | Solana RPC + tx 빌드 | CHAIN-SOL 확정 |
| jose | latest | JWT HS256 | SESS-PROTO 확정 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| viem 2.x | 2.x | EVM RPC (sweepAll은 v0.8에서 미구현) | EVM 지원 시 |

## Architecture Patterns

### Pattern 1: WithdrawService 도메인 서비스
**What:** 자금 회수 비즈니스 로직을 캡슐화하는 도메인 서비스. OwnerLifecycleService 패턴을 따른다.
**When to use:** POST /v1/owner/agents/:agentId/withdraw 핸들러에서 호출.

**핵심 책임:**
1. OwnerState 검증 (LOCKED에서만 활성화)
2. scope 분기 ("all" vs "native")
3. IChainAdapter.sweepAll() 또는 sendNative() 호출
4. SweepResult -> HTTP 200/207/404 매핑
5. 감사 로그 기록

```typescript
// packages/daemon/src/services/withdraw-service.ts
class WithdrawService {
  async withdraw(agentId: string, scope: 'all' | 'native'): Promise<WithdrawResult> {
    // 1. 에이전트 조회 + OwnerState 검증
    const agent = await this.getAgent(agentId)
    if (!agent.ownerAddress) {
      throw new NotFoundError('NO_OWNER', 'Owner가 등록되지 않은 에이전트입니다')
    }
    if (resolveOwnerState(agent) !== 'LOCKED') {
      throw new ForbiddenError('WITHDRAW_LOCKED_ONLY',
        '자금 회수는 Owner가 잠금 상태(LOCKED)에서만 가능합니다')
    }

    // 2. scope 분기
    if (scope === 'all') {
      return this.sweepAll(agent)
    } else {
      return this.sweepNative(agent)
    }
  }
}
```

### Pattern 2: scope 분기 (WithdrawService 수준)
**What:** sweepAll 메서드 자체는 항상 전량 회수. scope 분기는 WithdrawService에서 처리.
**When to use:** scope="native"이면 sendNative(), scope="all"이면 sweepAll() 호출.

```typescript
// scope: "all" -- IChainAdapter.sweepAll() 호출 (정책 엔진 우회)
// scope: "native" -- 네이티브 자산만 전송 (토큰/rent 미포함)
```

**설계 근거:** IChainAdapter.sweepAll()은 항상 전량 회수하므로 scope 파라미터가 없다 (31-02 결정). scope="native"는 WithdrawService에서 별도 sendNative 로직으로 처리한다.

### Pattern 3: HTTP 207 Multi-Status 부분 실패 패턴
**What:** sweepAll에서 일부 토큰 전송이 실패해도 나머지는 성공으로 처리.
**When to use:** SweepResult.failed 배열이 비어있지 않을 때.

```typescript
// SweepResult -> HTTP 응답 매핑
if (result.failed.length === 0) {
  return c.json(result, 200)  // 전량 성공
} else if (result.transactions.length > 0) {
  return c.json(result, 207)  // 부분 성공
} else {
  throw new InternalError('SWEEP_TOTAL_FAILURE', '전체 회수 실패')
}
```

### Pattern 4: Kill Switch 복구 대기 시간 분기
**What:** Owner 유무에 따라 복구 대기 시간을 분기하는 패턴.
**When to use:** POST /v1/admin/recover 호출 시.

```typescript
// Owner 유무별 복구 대기 시간 결정
const agents = getAllAgents(db)
const hasAnyOwner = agents.some(a => a.ownerAddress !== null)

const recoveryConfig = hasAnyOwner
  ? { waitSeconds: 1800, requireOwnerAuth: true }    // 30min + ownerAuth
  : { waitSeconds: 86400, requireOwnerAuth: false }   // 24h + masterAuth only
```

### Pattern 5: 세션 갱신 Owner 분기
**What:** Owner 유무에 따라 세션 갱신 후 알림 내용을 분기하는 패턴.
**When to use:** PUT /v1/sessions/:id/renew 성공 후 알림 전송 시.

```typescript
// 갱신 후 알림 분기
const ownerState = resolveOwnerState(agent)
if (ownerState === 'LOCKED') {
  // Owner 있음: [거부하기] 버튼 포함 알림
  notify(SESSION_RENEWED, { ...context, rejectButton: true })
} else {
  // Owner 없음: 정보성 알림만 (즉시 확정)
  notify(SESSION_RENEWED, { ...context, rejectButton: false })
}
```

### Anti-Patterns to Avoid
- **sweepAll에 scope 파라미터 추가:** IChainAdapter는 저수준 인터페이스이므로 scope 분기를 넣지 않는다. WithdrawService가 scope를 처리한다. (31-02 결정)
- **withdraw에서 ownerAuth 요구:** 수신 주소가 owner_address로 고정이므로 masterAuth만으로 안전하다. ownerAuth를 요구하면 DX만 악화된다. (v0.8 결정)
- **Kill Switch 복구 시 에이전트별 Owner 유무 분기:** 복구는 시스템 전체 동작이므로, "시스템에 Owner가 있는 에이전트가 하나라도 있는가"로 판단한다. 에이전트별 분기는 복잡도만 증가시킨다.
- **GRACE 상태에서 withdraw 허용:** 공격자가 masterAuth를 탈취 -> set-owner(자기 주소) -> withdraw로 자금 탈취 가능. LOCKED에서만 활성화 (H-02 방어).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SweepResult 타입 정의 | 새 타입 | 25-sqlite-schema.md 섹션 4.12.2에 이미 정의된 SweepResult | 중복 정의 금지 |
| sweepAll 메서드 시그니처 | 새 인터페이스 | 27-chain-adapter-interface.md 섹션 3.2에 이미 정의 | Phase 31에서 확정 |
| OwnerState 산출 | DB 컬럼 | resolveOwnerState() 순수 함수 (31-02 확정) | SSoT 유지 |
| 알림 이벤트 구조 | 커스텀 알림 | 35-notification-architecture.md INotificationChannel 인터페이스 | 기존 14개 이벤트와 동일 패턴 |
| 세션 갱신 거부 | 별도 API | 기존 DELETE /v1/sessions/:id 재활용 (53 섹션 6.1) | 엔드포인트 최소화 |

**Key insight:** Phase 34의 모든 구성 요소는 이미 설계된 인터페이스/타입/패턴의 조합이다. 새로운 인터페이스나 타입을 만들지 않고, 기존 설계를 구체적 API 스펙과 서비스 로직으로 확정한다.

## Common Pitfalls

### Pitfall 1: Kill Switch 복구에서 Owner 유무 판단 시점 혼동
**What goes wrong:** Kill Switch ACTIVATED 상태에서 Owner 유무를 판단할 때, 발동 전 시점의 Owner 상태를 사용해야 하는지 현재 시점을 사용해야 하는지 혼동.
**Why it happens:** Kill Switch 발동 시 세션이 모두 폐기되고, 에이전트가 정지되므로 "현재 상태"가 비정상.
**How to avoid:** Kill Switch 발동과 Owner 등록은 독립적이다. agents.owner_address와 owner_verified는 Kill Switch에 의해 변경되지 않는다. 복구 시점에서 agents 테이블의 현재 값을 읽으면 된다.
**Warning signs:** Kill Switch 캐스케이드 6단계(36-killswitch §3)를 확인 -- owner_address/owner_verified는 영향받지 않음.

### Pitfall 2: withdraw와 Kill Switch 상태 충돌
**What goes wrong:** Kill Switch ACTIVATED 상태에서 withdraw를 허용하려다 killSwitchGuard 허용 목록 관리가 복잡해짐.
**Why it happens:** v0.8 objectives §5.5에서 "Kill Switch 상태에서도 회수가 가능해야 한다"고 명시했지만, "구현 시 결정"으로 이연.
**How to avoid:** v0.8은 설계 마일스톤이므로, Kill Switch 상태에서의 withdraw는 두 가지 방안을 제시하고 구현 시 결정하도록 이연한다. 방안 A: killSwitchGuard 허용 목록 추가, 방안 B: CLI 직접 실행 (API 우회).
**Warning signs:** killSwitchGuard 허용 목록이 4개에서 무분별하게 증가하면 Kill Switch의 보안 의미가 약화된다.

### Pitfall 3: scope="native"에서 tx fee 미고려
**What goes wrong:** scope="native"로 네이티브만 회수할 때, 잔액 전량을 전송하면 tx fee를 지불할 SOL이 없어 실패.
**Why it happens:** scope="all"은 sweepAll 내부에서 SOL을 마지막에 전송하며 fee를 자동 차감. scope="native"는 별도 로직이 필요.
**How to avoid:** scope="native"도 `잔액 - estimatedFee`를 전송하도록 WithdrawService에서 fee 추정 후 차감.
**Warning signs:** scope="native" 테스트에서 "insufficient funds for transaction fee" 에러.

### Pitfall 4: 세션 갱신 알림에서 agentId -> Owner 매핑 누락
**What goes wrong:** 세션 갱신 알림 전송 시 해당 에이전트의 OwnerState를 조회하지 않아 Owner 없는 에이전트에도 [거부하기] 버튼이 표시됨.
**Why it happens:** 세션 갱신은 sessionAuth로 인증되므로 Owner 정보가 인증 컨텍스트에 없음.
**How to avoid:** renewSession() 내부에서 session.agent_id로 에이전트를 조회하고, resolveOwnerState()로 Owner 유무를 판단하여 알림 내용을 분기.
**Warning signs:** Owner 없는 에이전트의 갱신 알림에 [거부하기] 버튼이 보이면 UX 혼란.

### Pitfall 5: Kill Switch 복구 대기 시간 구현 방식
**What goes wrong:** 대기 시간을 API 요청 처리 중 sleep으로 구현하면 HTTP 타임아웃 발생.
**Why it happens:** 24시간 대기를 단일 HTTP 요청 내에서 처리할 수 없음.
**How to avoid:** 복구 요청 시 `recovery_eligible_at`을 system_state에 기록하고, RECOVERING 상태에서 대기. 대기 시간 경과 후 두 번째 recover 요청에서 실제 복구 수행. 또는 "복구 요청 접수 -> 대기 -> 자동 복구" 패턴.
**Warning signs:** 복구 API의 HTTP 타임아웃 설정이 대기 시간보다 짧음.

## Code Examples

### Withdraw API 엔드포인트 (Hono + Zod-OpenAPI)

```typescript
// Source: 37-rest-api-complete-spec.md 패턴 + v0.8 objectives §5.1
import { createRoute, z } from '@hono/zod-openapi'

const WithdrawRequestSchema = z.object({
  scope: z.enum(['all', 'native']).default('all').openapi({
    description: '"all" = 네이티브+SPL+rent 전량, "native" = 네이티브만',
  }),
}).openapi('WithdrawRequest')

const WithdrawResponseSchema = z.object({
  totalTransactions: z.number().int().nonnegative(),
  nativeRecovered: z.string(),
  tokensRecovered: z.array(z.object({
    symbol: z.string(),
    amount: z.string(),
    mint: z.string(),
  })),
  rentRecovered: z.string().optional(),
  failed: z.array(z.object({
    mint: z.string(),
    error: z.string(),
  })),
}).openapi('WithdrawResponse')

export const withdrawRoute = createRoute({
  method: 'post',
  path: '/v1/owner/agents/{agentId}/withdraw',
  tags: ['Owner'],
  operationId: 'withdrawFunds',
  summary: '에이전트 자금 회수',
  description: 'Owner 주소로 에이전트 자금을 전량 회수합니다.',
  security: [],  // masterAuth(implicit)
  request: {
    params: z.object({
      agentId: z.string().uuid(),
    }),
    body: { content: { 'application/json': { schema: WithdrawRequestSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: WithdrawResponseSchema } },
      description: '전량 회수 성공',
    },
    207: {
      content: { 'application/json': { schema: WithdrawResponseSchema } },
      description: '부분 회수 성공 (failed 배열 비어있지 않음)',
    },
    403: { description: 'WITHDRAW_LOCKED_ONLY | AGENT_SUSPENDED' },
    404: { description: 'AGENT_NOT_FOUND | NO_OWNER' },
  },
})
```

### Kill Switch 복구 대기 시간 분기 패턴

```typescript
// Source: v0.8 objectives §6 + 36-killswitch-autostop-evm.md §4
// POST /v1/admin/recover 내부 로직 확장

async recover(masterPassword: string, ownerSignature?: OwnerSignaturePayload): Promise<RecoverResult> {
  const status = getSystemState(db, 'kill_switch_status')
  if (status === 'NORMAL') throw conflict('KILL_SWITCH_NOT_ACTIVE')

  // Owner 유무 판단: 시스템 내 Owner 등록된 에이전트 존재 여부
  const hasOwner = db.prepare(
    'SELECT 1 FROM agents WHERE owner_address IS NOT NULL LIMIT 1'
  ).get() !== undefined

  if (hasOwner) {
    // Owner 있음: ownerAuth + masterAuth + 30분 대기
    if (!ownerSignature) throw unauthorized('OWNER_AUTH_REQUIRED')
    const waitSeconds = 1800  // 30분
    // ... 대기 시간 검증 ...
  } else {
    // Owner 없음: masterAuth + 24시간 강제 대기
    const waitSeconds = 86400  // 24시간
    // ... 대기 시간 검증 ...
  }
}
```

### 세션 갱신 Owner 분기 + [거부하기] 버튼

```typescript
// Source: 53-session-renewal-protocol.md §6 + v0.8 objectives §7
// renewSession() 내부 알림 분기

const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(session.agent_id)
const ownerState = resolveOwnerState({
  ownerAddress: agent.owner_address,
  ownerVerified: !!agent.owner_verified,
})

if (ownerState === 'LOCKED') {
  // Owner 있음 + LOCKED: [거부하기] 버튼 포함 알림
  notificationService.notify({
    type: 'SESSION_RENEWED',
    severity: 'INFO',
    context: {
      sessionId, agentName: agent.name,
      renewalCount, maxRenewals,
      remainingAbsoluteLife,
      rejectWindowExpiry,
      rejectButton: true,  // 채널별 [거부하기] 버튼 렌더링 트리거
    },
  })
} else {
  // Owner 없음 또는 GRACE: 정보성 알림만 (거부자 없음)
  notificationService.notify({
    type: 'SESSION_RENEWED',
    severity: 'INFO',
    context: {
      sessionId, agentName: agent.name,
      renewalCount, maxRenewals,
      remainingAbsoluteLife,
      rejectButton: false,
    },
  })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Kill Switch 복구: ownerAuth + masterAuth 고정 | Owner 유무별 분기 (24h vs 30min) | v0.8 | Owner 없는 에이전트 시나리오 지원 |
| 세션 갱신: 무조건 [거부하기] 버튼 | Owner 유무별 분기 | v0.8 | Owner 없는 에이전트에서 불필요한 버튼 제거 |
| sweepAll 미정의 | IChainAdapter 20번째 메서드 | v0.8 (Phase 31) | 자금 회수 인터페이스 확정 |

## Plan 34-01 설계 대상 (withdraw API + WithdrawService)

### 34-01에서 반영할 설계 문서: 37-rest-api-complete-spec.md

**추가할 내용:**
1. POST /v1/owner/agents/:agentId/withdraw 엔드포인트 완전 스펙
   - 요청 스키마 (WithdrawRequestSchema: scope enum)
   - 응답 스키마 (WithdrawResponseSchema: nativeRecovered, tokensRecovered, rentRecovered, failed)
   - HTTP 상태 코드 (200/207/403/404)
   - 에러 코드 매트릭스 (WITHDRAW_LOCKED_ONLY, NO_OWNER, AGENT_NOT_FOUND, AGENT_SUSPENDED, SWEEP_TOTAL_FAILURE)
   - 인증: masterAuth(implicit) -- 수신 주소 고정이므로 ownerAuth 불필요
   - 인증 맵 테이블에 추가 (현재 36개 -> 37개 엔드포인트)
2. WithdrawService 서비스 설계 (서비스 코드 패턴)
   - OwnerState 검증 (LOCKED만 허용)
   - scope 분기 ("all" -> sweepAll, "native" -> sendNative)
   - SweepResult -> HTTP 응답 매핑 로직
   - 감사 로그 이벤트: FUND_WITHDRAWN (성공), FUND_WITHDRAWAL_FAILED (실패)
3. sweepAll Solana 실행 순서 상세 (27-chain-adapter-interface.md 보완)
   - scope "all": getAssets -> SPL 배치 전송 + closeAccount -> SOL 마지막
   - scope "native": 잔액 - fee 전송
   - 부분 실패 시 fallback (배치 실패 -> 개별 전송)

### 34-01에서 참조할 기존 설계:
- 27-chain-adapter-interface.md §3.2: sweepAll 시그니처 (Phase 31 확정)
- 27-chain-adapter-interface.md §6.11: SolanaAdapter.sweepAll 구현 지침 (Phase 31 확정)
- 25-sqlite-schema.md §4.12.2: SweepResult 타입 (Phase 31 확정)
- 34-owner-wallet-connection.md §10.7: H-02 withdraw 방어 (Phase 32 확정)
- v0.8 objectives §5: 자금 회수 전체 설계

## Plan 34-02 설계 대상 (Kill Switch + 세션 갱신 Owner 분기)

### 34-02에서 반영할 설계 문서: 36-killswitch-autostop-evm.md

**추가할 내용:**
1. POST /v1/admin/recover Owner 유무 분기
   - Owner 없음: masterAuth + 24시간 강제 대기 -> RECOVERING 상태에서 대기
   - Owner 있음: ownerAuth + masterAuth + 30분 대기
   - 대기 시간 구현 패턴: recovery_eligible_at system_state 키
   - RECOVERING 상태에서 대기 시간 미경과 시 에러 코드: RECOVERY_WAIT_REQUIRED
   - RecoverRequest 스키마 변경: ownerAuth를 Optional로 (Owner 없는 에이전트 시나리오)
2. Owner 유무 판단 기준: 시스템 내 agents.owner_address IS NOT NULL 존재 여부
3. 대기 시간 config.toml 설정 가능 여부 결정

### 34-02에서 반영할 설계 문서: 53-session-renewal-protocol.md

**추가할 내용:**
1. 세션 갱신 후 알림 Owner 분기
   - Owner 없음 (NONE): 정보성 알림만, [거부하기] 버튼 없음, 즉시 확정
   - Owner 있음 (GRACE): 정보성 알림만 (GRACE에서는 아직 거부 기능 비활성)
   - Owner 있음 (LOCKED): [거부하기] 버튼 포함 알림, 거부 윈도우 활성
2. SESSION_RENEWED 알림 context에 rejectButton 플래그 추가
3. 거부 메커니즘 변경 없음 확인: 기존 DELETE /v1/sessions/:id 재활용

### 34-02에서 반영할 설계 문서: 35-notification-architecture.md

**추가할 내용:**
1. SESSION_RENEWED 이벤트 Owner 분기 템플릿
   - Owner LOCKED: [거부하기] 버튼 포함 (Telegram/Discord/ntfy.sh 채널별)
   - Owner 없음/GRACE: 버튼 없이 정보만
2. [거부하기] 버튼 채널별 구현
   - Telegram: InlineKeyboardButton url 기반 (33-02에서 확정된 패턴)
   - Discord: Embed markdown 링크 (Webhook Button 미지원)
   - ntfy.sh: Actions view 타입
3. [거부하기] URL 패턴: DELETE /v1/sessions/:id 호출을 위한 대시보드 URL

## 요구사항 -> 설계 문서 매핑

| 요구사항 | 설계 문서 | Plan | 상세 |
|---------|----------|------|------|
| WITHDRAW-01 | 37-rest-api-complete-spec.md | 34-01 | POST /v1/owner/agents/:agentId/withdraw 스펙 |
| WITHDRAW-02 | 37-rest-api-complete-spec.md | 34-01 | 수신 주소 owner_address 고정 (요청에 to 파라미터 없음) |
| WITHDRAW-03 | 37-rest-api-complete-spec.md | 34-01 | scope: "all" 전량 회수 명세 |
| WITHDRAW-04 | 37-rest-api-complete-spec.md | 34-01 | scope: "native" 분기 명세 |
| WITHDRAW-05 | 37-rest-api-complete-spec.md | 34-01 | HTTP 207 + failed 배열 응답 명세 |
| WITHDRAW-07 | 37-rest-api-complete-spec.md + 27-chain-adapter | 34-01 | SOL 마지막 전송 순서 명세 |
| WITHDRAW-08 | 37-rest-api-complete-spec.md | 34-01 | owner_verified=0 비활성화 정책 |
| SECURITY-01 | 36-killswitch-autostop-evm.md | 34-02 | Owner 없음 복구 24h |
| SECURITY-02 | 36-killswitch-autostop-evm.md | 34-02 | Owner 있음 복구 30min |
| SECURITY-03 | 53-session-renewal-protocol.md | 34-02 | Owner 없음 즉시 확정 |
| SECURITY-04 | 53-session-renewal-protocol.md + 35-notification | 34-02 | [거부하기] 버튼 |
| NOTIF-03 | 35-notification-architecture.md | 34-02 | [거부하기] 버튼 채널별 명세 |

## Kill Switch 복구 대기 시간 설계 상세

### 현재 설계 (36-killswitch-autostop-evm.md §4)

현재 복구는 ownerAuth + masterAuth 이중 인증으로 설계되어 있다. v0.8에서 Owner가 선택적이므로 Owner 없는 에이전트에 대한 복구 경로가 필요하다.

### v0.8 분기 설계 (objectives §6)

| 시나리오 | 인증 | 대기 시간 | 근거 |
|---------|------|----------|------|
| Owner 있음 | ownerAuth + masterAuth | 30분 | Owner 서명이 이중 인증 역할 |
| Owner 없음 | masterAuth만 | 24시간 | 이중 인증 부재를 시간으로 보상 |

### 구현 고려사항

1. **대기 시간 구현 패턴:**
   - 복구 요청 시 `recovery_eligible_at = now + waitSeconds`를 system_state에 기록
   - RECOVERING 상태에서 두 번째 recover 요청 시 `now >= recovery_eligible_at` 확인
   - 대기 미경과 시 `RECOVERY_WAIT_REQUIRED` 에러 + 남은 대기 시간 반환

2. **에이전트별 vs 시스템별 판단:**
   - Kill Switch는 시스템 전체 동작이므로 에이전트별 분기는 부적절
   - "시스템에 Owner 등록된 에이전트가 하나라도 있는가"로 판단
   - 이 경우 Owner 등록 에이전트와 미등록 에이전트가 공존할 수 있음
   - 하나라도 Owner가 있으면 ownerAuth를 요구하고 30분 대기 적용

3. **RecoverRequest 스키마 변경:**
   - 현재: masterPassword(필수) + ownerAuth 헤더(필수)
   - v0.8: masterPassword(필수) + ownerAuth 헤더(Owner 있을 때만 필수)
   - authRouter 분기: Owner 유무에 따라 ownerAuth 미들웨어 적용 여부 결정

4. **system_state 키 추가:**
   - `recovery_eligible_at`: 복구 가능 시각 (Unix epoch 초)
   - `recovery_wait_seconds`: 적용된 대기 시간 (1800 또는 86400)

## 세션 갱신 Owner 분기 설계 상세

### 현재 설계 (53-session-renewal-protocol.md)

현재 세션 갱신은 Owner 유무 분기 없이 동일하게 동작한다. SESSION_RENEWED 알림에 거부 윈도우 안내가 포함되지만, [거부하기] 버튼은 없다.

### v0.8 분기 설계 (objectives §7)

| 시나리오 | 갱신 | 알림 | 거부 윈도우 |
|---------|------|------|-----------|
| Owner 없음 (NONE) | 즉시 확정 | "세션 갱신됨 (3/30)" | 없음 |
| Owner 유예 (GRACE) | 즉시 확정 | "세션 갱신됨 (3/30)" | 없음 |
| Owner 잠금 (LOCKED) | 갱신 후 알림 | "세션 갱신됨 (3/30)" + [거부하기] | 활성 (기본 1시간) |

### [거부하기] 버튼 설계

**거부 메커니즘:** 기존 DELETE /v1/sessions/:id 재활용 (53-session-renewal-protocol.md §6.1 확정)

**채널별 [거부하기] 버튼 구현:**
- **Telegram:** InlineKeyboardButton url 기반 (33-02에서 확정된 패턴과 동일)
  - URL: `http://127.0.0.1:3100/v1/dashboard/sessions/{sessionId}/reject?nonce={nonce}`
  - 클릭 시 대시보드에서 masterAuth(implicit)로 DELETE /v1/sessions/:id 실행
- **Discord:** Embed markdown 링크 `[거부하기](URL)` (Webhook Button 미지원)
- **ntfy.sh:** Actions view 타입 `view, 거부하기, {rejectUrl}`

**URL 보안:**
- localhost(127.0.0.1:3100)로 외부 노출 없음
- nonce 1회용 토큰으로 URL 재사용 방지
- masterAuth(implicit)이므로 데몬 접근 = 인증 완료

## Open Questions

1. **Kill Switch 상태에서 withdraw 허용 여부**
   - v0.8 objectives §5.5에서 "구현 시 결정"으로 이연됨
   - 방안 A: killSwitchGuard 허용 목록에 withdraw 추가 (4 -> 5개)
   - 방안 B: CLI/데몬 내부에서 직접 실행 (API 우회)
   - Recommendation: 설계 문서에 양쪽 방안을 명시하고 "구현 시 결정" 유지. Phase 35(DX)에서 CLI withdraw 명령 설계 시 함께 결정.

2. **Kill Switch 복구 대기 시간의 config.toml 설정 가능 여부**
   - objectives §6에서는 24h/30min을 고정 값으로 제시
   - config.toml에 `[security].kill_switch_recovery_wait_owner = 1800` / `kill_switch_recovery_wait_no_owner = 86400` 추가 여부
   - Recommendation: 기본값은 고정하되, config.toml로 재정의 가능하게 설계 (운영 유연성)

3. **세션 갱신 [거부하기] 버튼의 거부 윈도우 경과 후 처리**
   - 거부 윈도우(기본 1시간)는 안내 문구에 불과 (53-session-renewal-protocol.md §4.5 확정)
   - Owner는 언제든 DELETE로 세션 폐기 가능
   - Question: 거부 윈도우 경과 후에도 [거부하기] URL이 유효한가?
   - Recommendation: URL은 세션이 유효한 한 계속 동작. 거부 윈도우는 알림 문구에만 영향.

## Sources

### Primary (HIGH confidence)
- `.planning/deliverables/27-chain-adapter-interface.md` - sweepAll 시그니처, SolanaAdapter 구현 지침 (Phase 31 확정)
- `.planning/deliverables/25-sqlite-schema.md` - SweepResult 타입, agents DDL (Phase 31 확정)
- `.planning/deliverables/34-owner-wallet-connection.md` - Owner 생명주기, H-02 방어 (Phase 32 확정)
- `.planning/deliverables/36-killswitch-autostop-evm.md` - Kill Switch 3-state, 복구 절차 (v0.7 확정)
- `.planning/deliverables/37-rest-api-complete-spec.md` - REST API 설계 원칙, 36 엔드포인트 (v0.7 확정)
- `.planning/deliverables/52-auth-model-redesign.md` - ownerAuth 미들웨어 v0.8 (Phase 32 확정)
- `.planning/deliverables/53-session-renewal-protocol.md` - 세션 갱신 프로토콜, Owner 사후 거부 (v0.5 확정)
- `.planning/deliverables/35-notification-architecture.md` - 알림 이벤트, 채널별 템플릿 (Phase 33 확정)
- `objectives/v0.8-optional-owner-progressive-security.md` - v0.8 전체 설계 방향

### Secondary (MEDIUM confidence)
- `.planning/phases/31-데이터-모델-타입-기반-설계/31-02-SUMMARY.md` - Phase 31 결정 사항
- `.planning/phases/32-owner-생명주기-설계/32-02-SUMMARY.md` - Phase 32 결정 사항
- `.planning/phases/33-정책-다운그레이드-알림-설계/33-02-SUMMARY.md` - Phase 33 알림 버튼 패턴
- `.planning/STATE.md` - 현재 프로젝트 상태 + 누적 결정 사항

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 모든 기술 스택이 v0.2-v0.7에서 확정됨
- Architecture: HIGH - 모든 패턴이 기존 설계 문서와 objectives에서 정의됨
- Pitfalls: HIGH - 선행 phase에서 보안 공격 방어 4건이 설계 완료됨

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (설계 문서 기반이므로 30일 유효)
