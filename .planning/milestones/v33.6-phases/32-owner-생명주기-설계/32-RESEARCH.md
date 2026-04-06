# Phase 32: Owner 생명주기 설계 - Research

**Researched:** 2026-02-09
**Domain:** Owner 등록/변경/해제 생명주기 상태 머신 + ownerAuth 미들웨어 통합 + 보안 공격 방어
**Confidence:** HIGH

## Summary

Phase 32는 Owner 주소의 등록/변경/해제 전체 생명주기를 설계하는 페이즈이다. Phase 31에서 확정된 데이터 모델(agents.owner_address nullable, owner_verified, OwnerState 타입, resolveOwnerState(), markOwnerVerified())을 기반으로, OwnerLifecycleService의 상태 전이 규칙, 유예(GRACE)/잠금(LOCKED) 2단계별 인증 요건, ownerAuth 미들웨어와의 자동 잠금 전이 통합, 그리고 보안 다운그레이드 공격 방어 메커니즘을 설계한다.

이 페이즈의 산출물은 설계 문서 수정(34-owner-wallet-connection.md, 52-auth-model-redesign.md 등)이며, 코드 구현은 포함하지 않는다. 핵심 과제는 (1) 6가지 상태 전이의 인증/인가 정책을 명확히 정의하고, (2) GRACE->LOCKED 자동 전이를 ownerAuth 미들웨어에 통합하며, (3) C-01(Grace-to-Locked 레이스 컨디션)과 C-02(보안 다운그레이드 공격) 두 가지 Critical 함정에 대한 방어를 설계하는 것이다.

**Primary recommendation:** v0.8-ARCHITECTURE.md 섹션 5의 OwnerLifecycleService 클래스 설계와 상태 전이 조건표를 34-owner-wallet-connection.md에 공식 반영하고, ownerAuth 미들웨어 Step 8 이후에 markOwnerVerified() 자동 호출을 추가하여 GRACE->LOCKED 전이를 암묵적으로 처리하라.

## Standard Stack

본 페이즈는 설계 문서 수정이 산출물이므로, "standard stack"은 설계 대상인 기존 기술 스택을 의미한다.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | 0.45.x | agents 테이블 쿼리 (owner_address, owner_verified 갱신) | 프로젝트 확정 (CORE-02) |
| `better-sqlite3` | 12.6.x | BEGIN IMMEDIATE 트랜잭션 (markOwnerVerified 원자화) | 프로젝트 확정 (CORE-02) |
| `zod` | 3.x | OwnerState, OwnerSignaturePayload 타입 검증 | Zod SSoT 원칙 (프로젝트 확정) |
| `hono` | 4.x | API 라우팅 + ownerAuth 미들웨어 체인 | 프로젝트 확정 (CORE-06) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@solana/kit` | 3.x | SIWS 서명 검증 (verifySIWS) | ownerAuth Solana 검증 |
| `viem` | 2.x | SIWE 서명 검증 (verifySIWE) | ownerAuth EVM 검증 |
| `jose` | 5.x | JWT 세션 토큰 (간접 -- sessionAuth와의 미들웨어 공존) | 미들웨어 체인 순서 |

## Architecture Patterns

### Phase 31 출력물 (Phase 32의 입력 기반)

Phase 32의 모든 설계는 Phase 31에서 확정된 다음 기반 위에 구축된다:

1. **agents 테이블 v0.8 DDL**: `owner_address TEXT` (nullable), `owner_verified INTEGER NOT NULL DEFAULT 0`, `check_owner_verified` CHECK 제약
2. **OwnerState 타입**: `z.enum(['NONE', 'GRACE', 'LOCKED'])` -- Zod SSoT
3. **resolveOwnerState()**: 순수 함수, `AgentOwnerInfo -> OwnerState` 파생 (DB 비저장)
4. **markOwnerVerified()**: BEGIN IMMEDIATE + `WHERE owner_verified = 0` 원자화 패턴
5. **PolicyDecision 확장**: `downgraded?: boolean`, `originalTier?: 'APPROVAL'` (optional, 하위 호환)

### Pattern 1: 3-State 상태 머신 (NONE / GRACE / LOCKED)

**What:** Owner 생명주기를 3가지 상태와 6가지 전이로 모델링한다. 상태는 DB에 저장하지 않고 `resolveOwnerState()` 순수 함수로 런타임 산출한다.
**Source:** v0.8-ARCHITECTURE.md 섹션 5.1-5.2

**상태 다이어그램:**
```
                 ┌─────────────────────────────────┐
                 │         (없음) NONE              │
                 │  owner_address = NULL            │
                 │  owner_verified = 0              │
                 │  보안: Base (DELAY까지)           │
                 └──────────────┬──────────────────┘
                                │
                   set-owner 또는 agent create --owner
                   인증: masterAuth
                                │
                                v
                 ┌─────────────────────────────────┐
                 │        (유예) GRACE              │
                 │  owner_address = <addr>          │
                 │  owner_verified = 0              │
                 │  보안: Enhanced (APPROVAL 해금)   │
                 │  변경/해제 인증: masterAuth만     │
                 └──────────┬───────────┬──────────┘
                            │           │
              ownerAuth 첫 사용         │
              (approve 또는 recover)    │
                            │    remove-owner (masterAuth)
                            v           v
                 ┌──────────────────┐  (없음) NONE 으로 복귀
                 │   (잠금) LOCKED   │
                 │  owner_address = <addr>
                 │  owner_verified = 1
                 │  보안: Enhanced   │
                 │  변경: ownerAuth + masterAuth
                 │  해제: 불가       │
                 └──────────────────┘
```

**상태 전이 조건표 (6가지):**

| # | 전이 | 트리거 | 인증 | DB 변경 | 부작용 |
|---|------|--------|------|---------|--------|
| 1 | NONE -> GRACE | set-owner 또는 agent create --owner | masterAuth | owner_address = <addr> | audit_log: OWNER_REGISTERED |
| 2 | GRACE -> NONE | remove-owner | masterAuth | owner_address = NULL | audit_log: OWNER_REMOVED |
| 3 | GRACE -> LOCKED | ownerAuth 첫 사용 (자동) | ownerAuth | owner_verified = 1 (BEGIN IMMEDIATE) | audit_log: OWNER_VERIFIED |
| 4 | GRACE -> GRACE (주소변경) | set-owner <new-addr> | masterAuth | owner_address = <new-addr> | audit_log: OWNER_ADDRESS_CHANGED |
| 5 | LOCKED -> LOCKED (주소변경) | set-owner <new-addr> | ownerAuth(기존) + masterAuth | owner_address = <new-addr> | audit_log: OWNER_ADDRESS_CHANGED |
| 6 | LOCKED -> NONE | **불가** | - | - | 보안 다운그레이드 방지 |

### Pattern 2: OwnerLifecycleService 클래스 설계

**What:** Owner 등록/변경/해제 비즈니스 로직을 캡슐화하는 도메인 서비스이다.
**Source:** v0.8-ARCHITECTURE.md 섹션 5.3

```typescript
// packages/daemon/src/domain/owner-lifecycle.ts

class OwnerLifecycleService {
  constructor(
    private db: DrizzleInstance,
    private auditLog: AuditLogService,
  ) {}

  /**
   * Owner 주소 등록/변경
   * NONE/GRACE: masterAuth만
   * LOCKED: ownerAuth(기존 주소) + masterAuth
   */
  async setOwner(agentId: string, newAddress: string, auth: AuthContext): Promise<void> {
    const agent = await this.getAgent(agentId)
    const state = resolveOwnerState(agent)

    switch (state) {
      case 'NONE':
      case 'GRACE':
        // masterAuth만 필요 (미들웨어에서 이미 검증)
        await this.updateOwnerAddress(agentId, newAddress)
        break
      case 'LOCKED':
        // ownerAuth(기존 주소) 필수
        if (!auth.ownerVerified) {
          throw new ForbiddenError('OWNER_AUTH_REQUIRED',
            '잠금 구간에서는 기존 Owner 서명이 필요합니다')
        }
        await this.updateOwnerAddress(agentId, newAddress)
        // 주소 변경 시 owner_verified를 리셋하지 않음
        // (기존 Owner가 서명으로 승인했으므로 새 주소도 신뢰)
        break
    }

    await this.auditLog.record('OWNER_ADDRESS_CHANGED', agentId, {
      newAddress, previousState: state
    })
  }

  /**
   * Owner 해제 (유예 구간에서만 가능)
   */
  async removeOwner(agentId: string): Promise<void> {
    const agent = await this.getAgent(agentId)
    const state = resolveOwnerState(agent)

    if (state === 'LOCKED') {
      throw new ForbiddenError('OWNER_LOCKED',
        '잠금 구간에서는 Owner를 해제할 수 없습니다')
    }
    if (state === 'NONE') {
      throw new NotFoundError('NO_OWNER', '등록된 Owner가 없습니다')
    }

    await this.clearOwnerAddress(agentId)
    await this.auditLog.record('OWNER_REMOVED', agentId)
  }
}
```

**핵심 설계 결정:**
- `setOwner()`에서 NONE->GRACE와 GRACE->GRACE(주소변경)를 동일 코드 경로로 처리 (둘 다 masterAuth만)
- LOCKED 상태에서 주소 변경 시 `owner_verified`를 0으로 리셋하지 않음 -- 기존 Owner가 서명으로 승인했으므로 새 주소도 잠금 상태 유지
- `removeOwner()`에서 LOCKED 상태는 무조건 거부 -- 보안 다운그레이드 방지

### Pattern 3: ownerAuth 미들웨어 통합 (자동 GRACE -> LOCKED 전이)

**What:** ownerAuth 미들웨어(현재 2곳: approve, recover)에서 서명 검증 성공 시 자동으로 `markOwnerVerified()`를 호출하여 GRACE -> LOCKED 전이를 암묵적으로 처리한다.
**Source:** v0.8-ARCHITECTURE.md 섹션 5.4, 34-owner-wallet-connection.md 섹션 5

**ownerAuth 미들웨어 8단계 체인:**

| 단계 | 내용 | v0.8 변경 |
|------|------|----------|
| 1 | Authorization 헤더 파싱 + payload 디코딩 | 변경 없음 |
| 2 | timestamp 유효성 (5분 이내) | 변경 없음 |
| 3 | nonce 일회성 (LRU 캐시 확인 + 삭제) | 변경 없음 |
| 4 | SIWS/SIWE 서명 암호학적 검증 | 변경 없음 |
| 5 | 서명자 == agents.owner_address 대조 | 변경 없음 (v0.5에서 이미 에이전트별) |
| 6 | action == 라우트 기대 action | 변경 없음 |
| 7 | 컨텍스트 설정 (ownerAddress, ownerChain) | 변경 없음 |
| 8 | next() 호출 | 변경 없음 |
| **8.5** | **[v0.8 추가] markOwnerVerified() 자동 호출** | **신규** |

**v0.8 추가 로직 (Step 8.5):**

```typescript
// ownerAuth 미들웨어 내부
async function ownerAuth(c: Context, next: Next): Promise<void> {
  // ... Step 1-8 기존 검증 로직 ...

  // [v0.8 추가] Step 8.5: ownerAuth 첫 사용 시 자동 잠금 전환
  const agent = c.get('agent')
  if (agent && !agent.ownerVerified) {
    // BEGIN IMMEDIATE로 원자적 전이 (Phase 31 markOwnerVerified 패턴)
    await ownerLifecycleService.markOwnerVerified(agent.id)
  }

  await next()
}
```

**삽입 지점 선택 근거:**
- Step 8(next() 호출) 전에 markOwnerVerified()를 실행하면, 핸들러가 실행되기 전에 이미 LOCKED 상태가 된다
- 핸들러 실행 후(Step 8 이후)에 호출하면 핸들러가 GRACE 상태로 실행될 수 있다
- 보수적 접근: **핸들러 실행 전에 LOCKED로 전환하는 것이 안전** -- ownerAuth를 사용하는 순간 잠금 상태여야 일관성 보장

### Pattern 4: set-owner/remove-owner API 설계

**What:** Owner 등록/변경/해제를 REST API와 CLI 명령어로 노출한다.
**Source:** v0.8-ARCHITECTURE.md 섹션 10, v0.8 objectives 섹션 4

**REST API:**

| 동작 | HTTP Method | 경로 | 인증 | 비고 |
|------|:-----------:|------|------|------|
| 에이전트 생성 (Owner 선택적) | POST | `/v1/agents` | masterAuth (implicit) | body.owner = optional |
| Owner 등록/변경 | PATCH | `/v1/agents/:id` | masterAuth (implicit) 또는 ownerAuth + masterAuth | LOCKED 시 ownerAuth 필요 |
| Owner 해제 | DELETE | (remove-owner CLI -> PATCH) | masterAuth (implicit) | GRACE에서만 가능 |

**CLI 명령어:**

| 명령어 | 동작 | 인증 |
|--------|------|------|
| `agent create --owner <addr>` | NONE -> GRACE (생성 시 등록) | masterAuth |
| `agent set-owner <agent> <addr>` | NONE -> GRACE 또는 GRACE/LOCKED 주소변경 | masterAuth 또는 ownerAuth+masterAuth |
| `agent remove-owner <agent>` | GRACE -> NONE | masterAuth |

### Pattern 5: authRouter 미들웨어 디스패처

**What:** Hono 라우터에서 엔드포인트별 인증 유형을 라우팅하는 패턴이다. v0.8에서 set-owner(PATCH /v1/agents/:id)의 인증이 Owner 상태에 따라 동적 분기해야 하므로, 인증 미들웨어 디스패처 설계가 중요하다.
**Source:** 52-auth-model-redesign.md 섹션 4-5

**현재 authRouter 인증 그룹 (v0.5):**

| 그룹 | 미들웨어 | 엔드포인트 수 |
|------|----------|:------------:|
| PUBLIC_PATHS | 없음 | 3 |
| SESSION_AUTH | sessionAuth | 6 |
| MASTER_IMPLICIT | implicitMasterAuth | 16 |
| MASTER_EXPLICIT | explicitMasterAuth | 3 |
| OWNER_AUTH | ownerAuth | 1 (approve) |
| DUAL_AUTH | ownerAuth + explicitMasterAuth | 1 (recover) |

**v0.8 추가 고려사항:**
- PATCH /v1/agents/:id에서 Owner 변경 시 LOCKED 상태면 ownerAuth 필요
- 이는 미들웨어 레벨에서 정적으로 결정할 수 없음 -- 런타임에 agent의 ownerState를 조회해야 함
- **해결 방안:** OwnerLifecycleService.setOwner() 내부에서 상태 기반 인증 검증. 미들웨어는 masterAuth(implicit)로 고정하고, 비즈니스 로직에서 LOCKED 상태일 때 auth.ownerVerified 검증

### Anti-Patterns to Avoid

- **owner_verified 리셋 (주소 변경 시):** LOCKED 상태에서 주소를 변경할 때 owner_verified를 0으로 리셋하면, 새 Owner가 GRACE 상태로 전환되어 masterAuth만으로 재변경이 가능해진다. 기존 Owner가 서명으로 승인한 변경이므로 LOCKED 유지가 올바르다.
- **OwnerState를 DB 컬럼으로 저장:** Phase 31에서 이미 결정됨 -- resolveOwnerState() 순수 함수로 런타임 산출하여 SSoT 유지.
- **LOCKED 상태에서 Owner 해제 허용:** 보안 다운그레이드 방지가 핵심 원칙. LOCKED에서 해제하면 APPROVAL 티어가 DELAY로 다운그레이드되고, Kill Switch 복구가 24시간으로 증가한다.
- **인증 분기를 미들웨어에서 처리:** PATCH /v1/agents/:id의 인증은 agent의 OwnerState에 의존하므로 미들웨어 레벨에서 정적으로 결정할 수 없다. 비즈니스 로직(OwnerLifecycleService) 내부에서 처리해야 한다.
- **ownerAuth 검증 후 비동기 markOwnerVerified:** 검증과 전이를 다른 이벤트 루프 틱에서 실행하면 레이스 컨디션 윈도우가 열린다. 동일 요청 처리 내에서 동기적으로 전이해야 한다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 상태 전이 직렬화 | 수동 잠금 플래그, 메모리 뮤텍스 | `better-sqlite3 .immediate()` | SQLite 네이티브 RESERVED 잠금 활용. Node.js는 싱글 스레드지만 동시 요청의 DB 접근이 인터리빙될 수 있음 |
| OwnerState 파생 | DB 컬럼 저장 + 동기화 | `resolveOwnerState()` 런타임 산출 | 파생 상태를 저장하면 동기화 오류. Phase 31 확정 결정 |
| 주소 형식 검증 | 수동 정규식 | Zod + 체인별 검증 함수 (Base58 길이 확인, EIP-55 체크섬) | 체인별 주소 형식이 다르고, 검증 규칙이 복잡 |
| 감사 이벤트 기록 | 인라인 INSERT 쿼리 | AuditLogService.record() | 프로젝트 전반에서 일관된 감사 로그 패턴 |
| SIWS/SIWE 메시지 구성 | 수동 문자열 조합 | 표준 라이브러리 (SIWS: @solana/kit, SIWE: viem/siwe) | 메시지 포맷이 EIP-4361/CAIP-122 표준 |

**Key insight:** Phase 32의 모든 변경은 기존 패턴의 확장이다. OwnerLifecycleService는 신규 컴포넌트이지만, 내부에서 사용하는 모든 기술(Drizzle 쿼리, BEGIN IMMEDIATE, Zod 검증, AuditLog)은 프로젝트에서 이미 확립된 패턴이다.

## Common Pitfalls

### Pitfall 1: Grace-to-Locked 전이 레이스 컨디션 (C-01)

**Severity:** CRITICAL
**What goes wrong:** 유예 구간에서 잠금 구간으로 전이하는 순간에 레이스 컨디션이 존재한다. 공격자가 masterAuth를 탈취하고 set-owner로 자신의 주소를 등록한 뒤, ownerAuth를 수행하면 원래 사용자는 변경 불가 상태에 빠진다.
**Why it happens:**
- ownerAuth 검증(Step 1-8)과 markOwnerVerified()(Step 8.5) 사이, 그리고 set-owner 요청의 ownerState 확인 사이에 갭이 존재
- Node.js 이벤트 루프에서 두 HTTP 요청이 동시에 처리될 때, SQLite 읽기와 쓰기 시점의 인터리빙
**How to avoid:**
1. markOwnerVerified()를 BEGIN IMMEDIATE 트랜잭션으로 원자화 (Phase 31에서 이미 설계)
2. set-owner API에서도 BEGIN IMMEDIATE 내에서 ownerState를 재확인
3. GRACE->LOCKED 전이 후 5분 쿨다운 (Argent 36h 대기의 최소 적용)
4. 전이 시 OWNER_VERIFIED 감사 로그 즉시 기록
**Warning signs:** ownerAuth 미들웨어에서 markOwnerVerified()가 별도 비동기 작업으로 분리되어 있다면 위험.

### Pitfall 2: 보안 다운그레이드 공격 (C-02)

**Severity:** CRITICAL
**What goes wrong:** 유예 구간에서 masterAuth만으로 Owner를 제거하면, APPROVAL 티어가 DELAY로 다운그레이드되고, Kill Switch 복구가 24시간으로 변경된다. masterAuth 유출 시 공격자가 이를 악용할 수 있다.
**Why it happens:**
- 유예 구간의 존재 의의("오타 교정")와 보안 보장 사이의 근본적 긴장
- Owner 등록 후 ownerAuth를 즉시 사용하지 않을 합리적 기대
- Owner 등록 시 서명 검증을 하지 않는 설계 결정
**How to avoid:**
1. remove-owner 실행 시 전 채널 알림 ("보안 수준이 저하됩니다")
2. remove-owner에 확인 지연 (CLI에서 명시적 확인 프롬프트)
3. audit_log에 SECURITY_LEVEL_DOWNGRADE 이벤트 기록
4. Kill Switch ACTIVATED 상태에서 Owner 변경/제거 금지 (killSwitchGuard와 일관)
**Warning signs:** remove-owner 명령에 추가 확인 메커니즘이 없거나, Owner 제거 시 알림이 없으면 위험.

### Pitfall 3: LOCKED 상태에서 주소 변경 시 owner_verified 리셋 오류

**What goes wrong:** LOCKED 상태에서 Owner 주소를 변경할 때 owner_verified를 0으로 리셋하면, 새 Owner가 GRACE 상태로 전환되어 masterAuth만으로 다시 변경/해제가 가능해진다.
**Why it happens:** "새 주소이므로 검증되지 않았다"는 직관적 판단이 보안적으로 틀림.
**How to avoid:** LOCKED 상태에서 주소 변경 시 owner_verified = 1을 유지한다. 기존 Owner가 서명으로 변경을 승인했으므로, 새 주소에 대한 신뢰가 이미 확보된 것이다.
**Warning signs:** setOwner() 내부에서 주소 변경 시 owner_verified를 갱신하는 코드가 있으면 재검토 필요.

### Pitfall 4: PATCH /v1/agents/:id의 인증 분기 복잡성

**What goes wrong:** 동일 엔드포인트(PATCH /v1/agents/:id)에서 Owner 변경 외에 다른 필드(name 등) 변경도 처리해야 하는데, 인증 요건이 변경 대상 필드에 따라 달라질 수 있다.
**Why it happens:** REST API의 PATCH 시맨틱에서 "어떤 필드를 변경하느냐"에 따라 인증 레벨이 분기되는 것은 비직관적이다.
**How to avoid:**
1. Owner 관련 변경은 별도 엔드포인트(`PATCH /v1/agents/:id/owner`)로 분리하는 방안 검토
2. 또는 OwnerLifecycleService 내부에서 필드별 인증 검증을 수행하고, PATCH 엔드포인트 자체는 masterAuth(implicit)로 유지
3. v0.8-ARCHITECTURE.md의 기존 설계(PATCH /v1/agents/:id에 owner 변경 포함)를 따르되, 비즈니스 로직에서 분기
**Warning signs:** 미들웨어에서 요청 바디를 파싱하여 인증 레벨을 결정하는 코드가 있다면 설계 재검토 필요.

### Pitfall 5: Kill Switch ACTIVATED 상태에서의 Owner 변경 허용

**What goes wrong:** Kill Switch가 발동된 상태에서 Owner를 변경/제거하면, 복구 요건이 동적으로 변경된다 (H-03).
**Why it happens:** Kill Switch 상태와 Owner 생명주기가 독립적으로 동작.
**How to avoid:** killSwitchGuard가 이미 4개 경로만 허용하는 구조이므로, set-owner/remove-owner는 자동으로 차단된다. 이 동작을 설계 문서에 명시적으로 문서화해야 한다.
**Warning signs:** Kill Switch 상태에서 set-owner/remove-owner API가 동작하는 테스트 케이스가 있다면 보안 위험.

## Code Examples

### OwnerLifecycleService 전체 구조

```typescript
// packages/daemon/src/domain/owner-lifecycle.ts
// Source: v0.8-ARCHITECTURE.md 섹션 5.3

import { eq } from 'drizzle-orm'
import type { DrizzleInstance } from '../infrastructure/database/types'
import { agents } from '../infrastructure/database/schema'
import { resolveOwnerState } from './owner-presence'
import type { AuditLogService } from './audit-log'
import type { AuthContext } from '../middleware/auth-types'

class OwnerLifecycleService {
  constructor(
    private db: DrizzleInstance,
    private sqlite: Database,  // better-sqlite3 (BEGIN IMMEDIATE용)
    private auditLog: AuditLogService,
  ) {}

  async setOwner(agentId: string, newAddress: string, auth: AuthContext): Promise<void> {
    const agent = await this.getAgent(agentId)
    const state = resolveOwnerState(agent)

    switch (state) {
      case 'NONE':
      case 'GRACE':
        // masterAuth만 필요 (미들웨어에서 이미 검증)
        break
      case 'LOCKED':
        // ownerAuth(기존 주소) 필수
        if (!auth.ownerVerified) {
          throw new ForbiddenError('OWNER_AUTH_REQUIRED',
            '잠금 구간에서는 기존 Owner 서명이 필요합니다')
        }
        break
    }

    await this.db.update(agents)
      .set({
        ownerAddress: newAddress,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId))

    const eventType = state === 'NONE' ? 'OWNER_REGISTERED' : 'OWNER_ADDRESS_CHANGED'
    await this.auditLog.record(eventType, agentId, {
      newAddress,
      previousState: state,
    })
  }

  async removeOwner(agentId: string): Promise<void> {
    const agent = await this.getAgent(agentId)
    const state = resolveOwnerState(agent)

    if (state === 'LOCKED') {
      throw new ForbiddenError('OWNER_LOCKED',
        '잠금 구간에서는 Owner를 해제할 수 없습니다')
    }
    if (state === 'NONE') {
      throw new NotFoundError('NO_OWNER', '등록된 Owner가 없습니다')
    }

    await this.db.update(agents)
      .set({
        ownerAddress: null,
        ownerVerified: false,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId))

    await this.auditLog.record('OWNER_REMOVED', agentId)
  }

  /**
   * ownerAuth 미들웨어에서 자동 호출 (GRACE -> LOCKED)
   * BEGIN IMMEDIATE로 원자화 (Phase 31 설계)
   */
  markOwnerVerified(agentId: string): boolean {
    return this.sqlite.transaction(() => {
      const result = this.sqlite.prepare(
        `UPDATE agents
         SET owner_verified = 1, updated_at = ?
         WHERE id = ? AND owner_verified = 0`
      ).run(Math.floor(Date.now() / 1000), agentId)

      if (result.changes > 0) {
        // 전이 발생 시 감사 로그
        this.sqlite.prepare(
          `INSERT INTO audit_log (id, event_type, agent_id, created_at)
           VALUES (?, 'OWNER_VERIFIED', ?, ?)`
        ).run(generateUUIDv7(), agentId, Math.floor(Date.now() / 1000))
      }

      return result.changes > 0
    }).immediate()
  }
}
```

### ownerAuth 미들웨어 v0.8 확장

```typescript
// 34-owner-wallet-connection.md 섹션 5 기반 + v0.8 확장
// Source: v0.8-ARCHITECTURE.md 섹션 5.4

async function ownerAuthMiddleware(c: Context, next: Next): Promise<void> {
  // ═══ Step 1: Authorization 헤더 파싱 ═══
  const payload = parseOwnerSignaturePayload(c)

  // ═══ Step 2: timestamp 유효성 (5분 이내) ═══
  validateTimestamp(payload.timestamp)

  // ═══ Step 3: nonce 일회성 ═══
  validateNonce(payload.nonce)

  // ═══ Step 4: SIWS/SIWE 서명 검증 ═══
  await verifySignature(payload)

  // ═══ Step 5: 서명자 == agents.owner_address ═══
  const agentId = resolveAgentIdFromContext(c)
  const agent = await getAgent(agentId)
  if (!agent || agent.ownerAddress !== payload.address) {
    throw new WaiaasError('OWNER_MISMATCH', 403)
  }

  // ═══ Step 6: action == 라우트 기대 action ═══
  validateAction(payload.action, c.req.path)

  // ═══ Step 7: 컨텍스트 설정 ═══
  c.set('authType', 'owner')
  c.set('ownerAddress', payload.address)
  c.set('agent', agent)
  c.set('ownerVerified', true)  // ownerAuth가 검증됨을 표시

  // ═══ [v0.8] Step 8.5: 자동 잠금 전환 ═══
  if (!agent.ownerVerified) {
    ownerLifecycleService.markOwnerVerified(agent.id)
    // 감사 로그는 markOwnerVerified 내부에서 기록됨
  }

  // ═══ Step 8: next() ═══
  await next()
}
```

### 주소 형식 검증 (Zod)

```typescript
// packages/core/src/schemas/owner.schema.ts
import { z } from 'zod'

// Solana 주소: Base58 인코딩 32바이트 (보통 32-44자)
const solanaAddressSchema = z.string()
  .min(32).max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid Solana address (Base58)')

// EVM 주소: 0x + 40 hex 문자 (EIP-55 체크섬은 별도 검증)
const evmAddressSchema = z.string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid EVM address')

export function validateOwnerAddress(chain: 'solana' | 'ethereum', address: string): void {
  if (chain === 'solana') {
    solanaAddressSchema.parse(address)
  } else {
    evmAddressSchema.parse(address)
  }
}
```

### 감사 로그 이벤트 타입 (v0.8 추가)

```typescript
// v0.8에서 추가되는 감사 이벤트 (v0.8-ARCHITECTURE.md 섹션 12.1)
type OwnerAuditEvent =
  | 'OWNER_REGISTERED'          // set-owner 실행 (NONE -> GRACE)
  | 'OWNER_ADDRESS_CHANGED'     // Owner 주소 변경 (GRACE/LOCKED 내)
  | 'OWNER_REMOVED'             // remove-owner 실행 (GRACE -> NONE)
  | 'OWNER_VERIFIED'            // ownerAuth 첫 사용 (GRACE -> LOCKED)

// 기존 13개 이벤트 + v0.8 4개 = 17개
```

### 에러 코드 (v0.8 추가)

```typescript
// v0.8-ARCHITECTURE.md 섹션 12.2
type OwnerErrorCode =
  | 'OWNER_AUTH_REQUIRED'   // 403: 잠금 구간에서 ownerAuth 없이 변경 시도
  | 'OWNER_LOCKED'          // 403: 잠금 구간에서 Owner 해제 시도
  | 'NO_OWNER'              // 404: Owner 미등록 에이전트에서 Owner 관련 작업 시도
```

## State of the Art

| Old Approach (v0.5-v0.7) | Current Approach (v0.8) | When Changed | Impact |
|--------------------------|------------------------|--------------|--------|
| owner_address NOT NULL | owner_address nullable | v0.8 Phase 31 | Owner 없이 에이전트 생성 가능 |
| ownerAuth 2곳 고정 (approve, recover) | ownerAuth 2곳 유지 + 자동 markOwnerVerified | v0.8 Phase 32 | GRACE->LOCKED 자동 전이 |
| Owner 변경: 항상 ownerAuth 필요 | GRACE: masterAuth만, LOCKED: ownerAuth+masterAuth | v0.8 Phase 32 | 유예 구간 유연성 |
| Owner 해제: 항상 가능 | LOCKED에서 불가 | v0.8 Phase 32 | 보안 다운그레이드 방지 |
| 34-owner-wallet-connection: 연결 프로토콜 중심 | + Owner 생명주기 상태 머신 | v0.8 Phase 32 | 34 문서 역할 확장 |

## Open Questions

Phase 32 범위 내에서 해결되지 않지만 인지해야 하는 사항:

1. **PATCH /v1/agents/:id vs 별도 엔드포인트 결정**
   - What we know: v0.8-ARCHITECTURE.md는 PATCH /v1/agents/:id에 owner 변경을 포함하는 설계이다. CLI에서는 set-owner/remove-owner가 별도 명령어.
   - What's unclear: REST API에서 Owner 변경을 PATCH /v1/agents/:id의 body 필드로 처리할지, 별도 엔드포인트(예: POST /v1/agents/:id/owner)로 분리할지.
   - Recommendation: v0.8-ARCHITECTURE.md 설계를 따르되, 인증 분기의 복잡성을 OwnerLifecycleService 내부에서 처리. PATCH 시맨틱을 유지하면 기존 API 구조와 일관.

2. **유예 구간 시간 제한 도입 여부 (PITFALLS C-02 Prevention 1)**
   - What we know: PITFALLS.md에서 "유예 구간 시간 제한 (1시간)"을 제안했다. v0.8 objectives에서는 이를 포함하지 않았다.
   - What's unclear: 유예 구간에 시간 제한을 도입하면 owner_registered_at 타임스탬프가 필요하고, M-03(owner_verified boolean 부족) 문제가 발생한다.
   - Recommendation: v0.8 scope에서는 유예 구간 시간 제한을 도입하지 않는다. 대신 remove-owner 시 알림 + CLI 경고로 방어. 시간 제한은 v0.9+에서 검토.

3. **LOCKED 주소 변경 시 기존 APPROVAL 대기 거래 처리**
   - What we know: LOCKED 상태에서 Owner 주소를 변경하면, 기존 APPROVAL 대기 중인 거래의 ownerAuth 검증 주소가 변경된다.
   - What's unclear: 변경 전 주소로 서명된 대기 중 approve 요청이 유효한지, 새 주소로 재서명이 필요한지.
   - Recommendation: 주소 변경 시 기존 APPROVAL 대기 거래를 CANCELLED 상태로 전환하는 것이 안전. Phase 34에서 상세 설계.

4. **ownerAuth action enum 확장 필요 여부**
   - What we know: 현재 ownerAuth action은 `approve_tx`와 `recover` 2개이다. LOCKED 상태에서 set-owner에 ownerAuth가 필요하면 새 action이 필요할 수 있다.
   - What's unclear: OwnerSignaturePayload.action에 `change_owner` 같은 새 action을 추가해야 하는지, 아니면 비즈니스 로직에서만 처리하는지.
   - Recommendation: LOCKED 상태 set-owner에는 ownerAuth가 필요하므로, OwnerSignaturePayload.action에 `change_owner`를 추가해야 한다. 이는 ownerAuth 미들웨어 Step 6(action 검증)과 ROUTE_ACTION_MAP에 영향을 미친다.

5. **set-owner CLI에서 LOCKED 상태 감지 시 서명 워크플로우**
   - What we know: CLI 수동 서명은 4단계 플로우(nonce -> 메시지 구성 -> 오프라인 서명 -> API 호출)이다. set-owner는 현재 masterAuth(implicit)로 동작하는데, LOCKED 상태에서는 ownerAuth가 필요하다.
   - What's unclear: CLI가 먼저 agent의 OwnerState를 조회하여 LOCKED인 경우 서명 플로우를 시작해야 하는지, 아니면 서버가 403 반환 시 재시도하는 방식인지.
   - Recommendation: CLI가 먼저 `GET /v1/agents/:id`로 상태를 확인하고, LOCKED이면 서명 플로우를 안내하는 것이 UX상 바람직.

## Sources

### Primary (HIGH confidence)
- v0.8-ARCHITECTURE.md 섹션 5 (Owner 생명주기 상태 머신, OwnerLifecycleService 클래스, ownerAuth 통합) -- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/research/v0.8-ARCHITECTURE.md`
- v0.8 objectives 섹션 4 (등록/변경/해제 정책, 유예/잠금 생명주기) -- `/Users/minho.yoo/dev/wallet/WAIaaS/objectives/v0.8-optional-owner-progressive-security.md`
- 52-auth-model-redesign.md (3-tier 인증, ownerAuth 8단계, 31 엔드포인트 인증 맵) -- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/52-auth-model-redesign.md`
- 34-owner-wallet-connection.md (ownerAuth 미들웨어 8단계, OwnerSignaturePayload, SIWS/SIWE 검증) -- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/34-owner-wallet-connection.md`
- Phase 31 outputs (31-01-PLAN, 31-02-PLAN, 31-VERIFICATION) -- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/phases/31-데이터-모델-타입-기반-설계/`
- PITFALLS.md (C-01, C-02, H-03 위협 분석) -- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/research/PITFALLS.md`

### Secondary (MEDIUM confidence)
- v0.8-ARCHITECTURE.md 섹션 10-12 (REST API 변경, CLI 명령어, 감사 로그, 에러 코드) -- 같은 파일
- REQUIREMENTS.md (OWNER-02 ~ OWNER-06 요구사항) -- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/REQUIREMENTS.md`
- ROADMAP.md (Phase 32 성공 기준 5개, 의존 관계) -- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/ROADMAP.md`
- 37-rest-api-complete-spec.md (37 엔드포인트, 인증 체계) -- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/37-rest-api-complete-spec.md`
- 54-cli-flow-redesign.md (agent create --owner 인터페이스, CLI 구조) -- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/54-cli-flow-redesign.md`

### Tertiary (LOW confidence)
- (없음 -- 모든 정보가 프로젝트 내부 문서에서 직접 확인됨)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 모든 기술이 프로젝트에서 확정됨 (Drizzle, better-sqlite3, Zod, Hono)
- Architecture: HIGH -- v0.8-ARCHITECTURE.md에서 OwnerLifecycleService, 상태 전이 조건, ownerAuth 통합이 상세 분석됨
- Pitfalls: HIGH -- PITFALLS.md에서 C-01, C-02 두 가지 Critical 위협이 이미 분석되었고, 방어 전략이 제시됨

**Research date:** 2026-02-09
**Valid until:** 2026-03-11 (안정적 설계 문서 기반, 외부 의존성 없음)
