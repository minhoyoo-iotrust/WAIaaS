# Phase 223: 알림 명세 보완 + 문서 정합성 - Research

**Researched:** 2026-02-21
**Domain:** 설계 문서 Medium/Low 보완 4건 (doc 76 -- incoming transaction monitoring)
**Confidence:** HIGH

## Summary

Phase 223은 v27.0 마일스톤 감사에서 발견된 Medium 2건(NOTIFY-1, getDecimals) + Low 2건(doc 31 PATCH, skills/) 총 4건의 설계 보완을 수행하는 작업이다. Phase 222에서 Critical/High 불일치 5건이 해결된 후, 나머지 설계 갭을 수정하여 구현 마일스톤 진입 준비를 완료한다.

핵심 문제는 네 가지로 귀결된다: (1) INCOMING_TX_SUSPICIOUS 이벤트가 `priority: high`로 발송되어야 하지만, NotificationService.notify()에서 priority를 전달하는 메커니즘이 명세되지 않음 (NOTIFY-1), (2) DustAttackRule과 LargeAmountRule에서 `getDecimals(tx)` 함수를 호출하지만 이 함수가 어디에도 정의되지 않음, (3) §8.6 기존 설계 문서 영향 분석에 `PATCH /v1/wallet/:id`에 monitorIncoming 필드 추가 변경이 doc 31 (API 설계) 영향으로 누락됨, (4) skills/ 파일(wallet.skill.md, transactions.skill.md) 업데이트 요구사항이 언급되지 않음.

**Primary recommendation:** 4건의 보완을 2개 Plan으로 분리한다. Plan 223-01은 알림 priority 라우팅과 getDecimals() 헬퍼를 명세하고, Plan 223-02는 §8.6 doc 31 PATCH 영향 분석 추가와 skills/ 업데이트 요구사항을 명시한다.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EVT-02 | INCOMING_TX_SUSPICIOUS 이벤트 스키마가 의심 사유(dust/unknownToken/largeAmount)를 포함하여 정의됨 | NOTIFY-1 보완: 이벤트 스키마는 정의됨(§6.3), priority:high 라우팅 메커니즘만 미명세. 아래 "Architecture Patterns > NOTIFY-1 해결 전략" 참조 |
| EVT-05 | 의심 입금 감지 규칙 인터페이스(IIncomingSafetyRule)가 dust attack, 미등록 토큰, 대량 입금 3개 규칙을 포함 | getDecimals() 보완: 3규칙은 정의됨(§6.6), DustAttackRule/LargeAmountRule에서 호출하는 getDecimals() 미정의. 아래 "Architecture Patterns > getDecimals 해결 전략" 참조 |
| VER-01 | 기존 설계 문서(25/27/28/29/31/35/37/38/75) 영향 분석이 변경 범위와 함께 문서화됨 | §8.6에 9개 문서 영향 분석이 있으나 doc 31에 PATCH /v1/wallet/:id monitorIncoming 변경이 누락. skills/ 업데이트 요구사항도 미언급. 아래 "Architecture Patterns > doc 31 / skills 해결 전략" 참조 |
</phase_requirements>

## Standard Stack

이 Phase는 코드 구현이 아닌 설계 문서(Markdown) 수정이므로, 라이브러리/패키지 설치는 불필요하다.

### Core
| 도구 | 용도 | 비고 |
|------|------|------|
| 텍스트 편집기 | doc 76 Markdown 수정 | 2,320줄 단일 파일 |

### 참조 대상 코드베이스 패턴
| 패턴 | 위치 | 참조 이유 |
|------|------|----------|
| NotificationService.notify() 시그니처 | `packages/daemon/src/notifications/notification-service.ts` L91-96 | priority 전달 방법 설계 시 기존 시그니처 참조 |
| NtfyChannel.mapPriority() | `packages/daemon/src/notifications/channels/ntfy.ts` L39-44 | 기존 이벤트별 priority 매핑 패턴 참조 |
| WalletNotificationChannel.notify() | `packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts` L78-79 | category 기반 priority 결정 패턴 참조 |
| NATIVE_DECIMALS 맵 | `packages/daemon/src/pipeline/resolve-effective-amount-usd.ts` L53-55 | 체인별 네이티브 토큰 decimals 참조 |
| token_registry 스키마 | `packages/daemon/src/infrastructure/database/schema.ts` L330-347 | 토큰 decimals 조회 패턴 참조 |
| NotificationPayload | `packages/core/src/interfaces/INotificationChannel.ts` L7-18 | 기존 페이로드 구조 참조 |
| EVENT_CATEGORY_MAP | `packages/core/src/schemas/signing-protocol.ts` L185-214 | 이벤트→카테고리 매핑 참조 |
| skills/ 파일 | `skills/wallet.skill.md`, `skills/transactions.skill.md` | 현재 skill 파일 구조 참조 |

## Architecture Patterns

### NOTIFY-1 해결 전략: SUSPICIOUS priority:high 라우팅 메커니즘

**문제 위치:**
- §6.3 (L1579): "알림 우선순위: `high` (즉시 알림)" -- 코멘트만 존재
- §6.4 (L1602): NotificationService.notify() 호출에서 priority를 전달하는 파라미터가 없음
- §6.4 (L1643): NOTIFICATION_CATEGORIES의 incoming 카테고리에서 `SUSPICIOUS는 개별 high` 코멘트만 존재

**현행 priority 처리 방식 분석 (코드 기반):**

1. **NotificationService.notify() 시그니처** (`notification-service.ts` L91-96):
   ```typescript
   async notify(
     eventType: NotificationEventType,
     walletId: string,
     vars?: Record<string, string>,
     details?: Record<string, unknown>,
   ): Promise<void>
   ```
   -- priority 파라미터 없음. eventType만 전달.

2. **NtfyChannel.mapPriority()** (`ntfy.ts` L39-44):
   ```typescript
   private mapPriority(eventType: string): number {
     if (eventType.includes('KILL_SWITCH') || eventType.includes('AUTO_STOP')) return 5;
     if (eventType.includes('SUSPENDED') || eventType.includes('FAILED') || eventType.includes('VIOLATION')) return 4;
     if (eventType.includes('APPROVAL') || eventType.includes('EXPIR')) return 3;
     return 2;
   }
   ```
   -- eventType 문자열 기반 패턴 매칭. `INCOMING_TX_SUSPICIOUS`는 어떤 패턴에도 매칭되지 않아 priority 2(low) 반환.

3. **WalletNotificationChannel** (`wallet-notification-channel.ts` L78-79):
   ```typescript
   const priority = category === 'security_alert' ? 5 : 3;
   ```
   -- 카테고리 기반 분기. 'incoming' 카테고리는 priority 3 반환. SUSPICIOUS도 마찬가지.

**해결 옵션 분석:**

| 옵션 | 변경 범위 | 장점 | 단점 |
|------|----------|------|------|
| A: NtfyChannel.mapPriority()에 SUSPICIOUS 패턴 추가 | §6.4 명세 보완 | 기존 패턴 유지, 인터페이스 변경 없음 | ntfy 채널만 해당, 다른 채널은 priority 무관 |
| B: NotificationPayload에 priority 필드 추가 | §6.4 + INotificationChannel 수정 | 범용적 | 기존 인터페이스 breaking change |
| C: BROADCAST_EVENTS에 SUSPICIOUS 추가 | §6.4 명세 보완 | 모든 채널에 동시 발송 | broadcast는 priority가 아닌 delivery 방식 |
| D: 채널별 priority 매핑에 SUSPICIOUS 규칙 추가 + WalletNotificationChannel category 분기 추가 | §6.4 명세 보완 | 가장 완전한 해결 | 두 곳 모두 명세 필요 |

**추천: 옵션 D** -- 채널별 priority 매핑 확장.
- 근거: 기존 코드에서 priority는 채널 구현 내부에서 eventType/category 기반으로 결정. 이 패턴을 유지하면서 SUSPICIOUS 이벤트를 높은 priority로 매핑.
- NtfyChannel: `mapPriority()`에 `SUSPICIOUS` 패턴 매칭 추가 → priority 4 (high)
- WalletNotificationChannel: category 기반 분기에 `INCOMING_TX_SUSPICIOUS` eventType 특별 처리 추가 → priority 4
- NotificationService 인터페이스 변경 없음 (backward compatible)
- §6.4에서 이 메커니즘을 명확히 명세

**변경 대상 섹션:**
1. §6.3 (L1579): "알림 우선순위" 설명을 구체적 메커니즘으로 교체
2. §6.4 (L1581-1646): 채널별 priority 매핑 규칙 추가, NOTIFICATION_CATEGORIES 코멘트를 구체적 명세로 교체

### getDecimals() 해결 전략: 헬퍼 함수 정의

**문제 위치:**
- §6.6 (L1687): `getDecimals(tx)` -- DustAttackRule에서 호출
- §6.6 (L1716): `getDecimals(tx)` -- LargeAmountRule에서 호출
- 이 함수는 doc 76 어디에도 정의되지 않음

**현행 decimals 처리 방식 분석 (코드 기반):**

1. **네이티브 토큰**: `resolve-effective-amount-usd.ts` L53-55에 `NATIVE_DECIMALS` 맵 정의:
   ```typescript
   const NATIVE_DECIMALS: Record<string, number> = {
     solana: 9,
     ethereum: 18,
   };
   ```

2. **토큰**: `token_registry` 테이블의 `decimals` 컬럼 (EVM ERC-20).
   Solana SPL 토큰은 온체인에서 decimals 조회 필요 (ATA mint info).

3. **IncomingTransaction 타입** (§1.2):
   ```typescript
   interface IncomingTransaction {
     tokenAddress: string | null;  // null = 네이티브
     chain: ChainType;             // 'solana' | 'ethereum'
     // decimals 필드 없음
   }
   ```
   -- decimals가 IncomingTransaction 타입에 없으므로 외부에서 해결 필요.

**해결 옵션 분석:**

| 옵션 | 변경 범위 | 장점 | 단점 |
|------|----------|------|------|
| A: IncomingTransaction 타입에 decimals 필드 추가 | §1.2, §2.1 DDL, §2.6 INSERT, §2.7 마이그레이션 | getDecimals() 불필요 (직접 접근) | 타입/DDL/INSERT/마이그레이션 4곳 변경 -- Phase 222에서 is_suspicious 추가 때와 동일 규모 |
| B: SafetyRuleContext에 decimals 필드 추가 | §6.5 SafetyRuleContext | 타입 변경 최소, 컨텍스트가 이미 외부 데이터 전달용 | getDecimals() 구현은 여전히 필요 (caller가 해결) |
| C: getDecimals() standalone 헬퍼 함수 정의 | §6.6 앞에 추가 | 명시적 | 네이티브/토큰 분기 로직 필요 |

**추천: 옵션 B + C 조합** -- SafetyRuleContext에 decimals 추가하고, getDecimals() 헬퍼를 정의하여 호출자(IncomingTxMonitorService)가 context 구성 시 사용.
- 근거: SafetyRuleContext는 이미 `usdPrice`, `isRegisteredToken`, `avgIncomingUsd` 등 외부 데이터를 전달하는 역할. decimals도 동일한 패턴.
- getDecimals()는 IncomingTransaction의 chain + tokenAddress를 기반으로 decimals를 결정:
  - `tokenAddress === null` → NATIVE_DECIMALS[chain] (solana: 9, ethereum: 18)
  - `tokenAddress !== null` → token_registry에서 조회 (또는 SafetyRuleContext.decimals 직접 사용)
- DustAttackRule/LargeAmountRule의 `getDecimals(tx)` 호출을 `ctx.decimals`로 교체하면 더 깔끔

**실제 추천 (최종):** SafetyRuleContext에 `decimals: number` 필드를 추가하고, DustAttackRule/LargeAmountRule 코드에서 `getDecimals(tx)`를 `ctx.decimals`로 교체. `getDecimals()` standalone 헬퍼도 IncomingTxMonitorService의 context 구성 코드에서 사용하도록 정의.

**변경 대상 섹션:**
1. §6.5 (L1664-1674): SafetyRuleContext에 `decimals: number` 필드 추가
2. §6.6 (L1687, L1716): `getDecimals(tx)` → `ctx.decimals` 교체
3. §6.5 아래 또는 §6.6 위에 getDecimals() 헬퍼 정의 추가:
   ```typescript
   function getDecimals(tx: IncomingTransaction): number {
     if (tx.tokenAddress === null) {
       return tx.chain === 'solana' ? 9 : 18; // NATIVE_DECIMALS
     }
     // token_registry에서 조회 (구현 시 DB 의존)
     // 이 함수는 IncomingTxMonitorService에서 SafetyRuleContext.decimals 구성 시 호출
   }
   ```

### doc 31 PATCH 영향 분석 해결 전략

**문제 위치:**
- §8.6 (L2186-2203): 9개 문서 영향 분석 테이블에 doc 31이 포함되어 있으나, 변경 내용이 "GET /v1/wallet/incoming, GET /v1/wallet/incoming/summary" 엔드포인트 추가만 기재
- §7.3 (L1858-1873): PATCH /v1/wallet/:id에 monitorIncoming 필드 추가가 명세되어 있으나, §8.6에 반영되지 않음

**현재 코드에서 wallet 업데이트 방식:**
- `PUT /v1/wallets/:id` -- 이름 변경 (wallets.ts L434)
- `PUT /v1/wallets/:id/owner` -- Owner 설정 (wallets.ts L594)
- `PUT /v1/wallets/:id/default-network` -- 기본 네트워크 변경 (wallets.ts L753)
- PATCH 메서드는 현재 존재하지 않음 -- §7.3에서 새로 정의

**해결 방안:**
§8.6 doc 31 행의 "변경 내용" 열에 `PATCH /v1/wallet/:id monitorIncoming 필드 추가`를 추가한다.

**변경 대상 섹션:**
1. §8.6 (L2194): doc 31 행의 변경 내용에 PATCH 정보 추가

### skills/ 업데이트 요구사항 해결 전략

**문제 위치:**
- CLAUDE.md 규칙: "REST API, SDK, or MCP interfaces change → skills/ files must be updated accordingly"
- doc 76에서 추가되는 API: GET /v1/wallet/incoming, GET /v1/wallet/incoming/summary, PATCH /v1/wallet/:id
- doc 76에서 추가되는 MCP 도구: list_incoming_transactions, get_incoming_summary
- doc 76에서 추가되는 SDK 메서드: listIncomingTransactions, getIncomingTransactionSummary
- 이 변경에 따른 skills/ 업데이트 요구사항이 설계 문서에 언급되지 않음

**현행 skills/ 파일 분석:**

1. **wallet.skill.md** -- 지갑 CRUD, 자산 조회, 세션 관리, 토큰 레지스트리, MCP 토큰, Owner 관리
   - 영향: PATCH /v1/wallet/:id monitorIncoming → 지갑 관리 섹션에 추가 필요
   - wallet.skill.md의 기존 MCP 도구 참조 (get_balance, get_assets 등) → list_incoming_transactions 추가

2. **transactions.skill.md** -- 5-type TX, 라이프사이클, sign-only, encode-calldata
   - 영향: 수신 트랜잭션은 기존 5-type 아웃고잉 TX와 별개 도메인
   - 새 스킬 파일 생성 vs 기존 파일 확장 결정 필요

**추천:** wallet.skill.md에 수신 모니터링 관련 API/MCP/SDK 추가. transactions.skill.md는 아웃고잉 TX 전용으로 유지하고, 수신 TX 조회(GET /v1/wallet/incoming*)는 wallet.skill.md의 "Wallet Query (Session-Scoped)" 섹션에 배치. 수신 TX가 아웃고잉 TX의 라이프사이클/정책 패턴과 완전히 다르므로 분리 유지.

다만, 이 Phase에서는 skills/ 파일을 **직접 수정하지 않고**, 구현 마일스톤(m27-01)에서 수정해야 할 범위만 명세한다. 설계 마일스톤에서 아직 구현되지 않은 API의 skill 파일을 업데이트하면 사용자에게 혼동을 줄 수 있다.

**변경 대상 섹션:**
1. §8.6 아래 또는 §8.8 뒤에 "skills/ 업데이트 요구사항" 소섹션 추가

## Don't Hand-Roll

| 문제 | 하지 말 것 | 대신 할 것 | 이유 |
|------|-----------|-----------|------|
| priority 라우팅 | NotificationPayload 인터페이스에 priority 필드 추가 | 채널별 mapPriority/category 분기 패턴 확장 | 기존 패턴 유지, 인터페이스 breaking change 방지 |
| decimals 해결 | IncomingTransaction 타입에 decimals 필드 추가 | SafetyRuleContext에 decimals 추가 + getDecimals() 헬퍼 | DDL/INSERT/마이그레이션 4곳 변경 회피, 기존 context 패턴 일관 |
| skills/ 파일 수정 | 설계 마일스톤에서 skill 파일 직접 수정 | 구현 마일스톤에서 수정할 범위만 명세 | 구현되지 않은 API의 skill 파일을 업데이트하면 혼동 유발 |

**Key insight:** 이 Phase는 설계 문서의 "빈 구멍"을 채우되, 기존 인터페이스와 타입 구조를 변경하지 않는 방향으로 해결하는 것이 핵심이다. 새로운 필드나 메서드를 최소화하고 기존 패턴을 정확히 따른다.

## Common Pitfalls

### Pitfall 1: NotificationPayload 인터페이스 변경
**What goes wrong:** SUSPICIOUS priority를 전달하기 위해 NotificationPayload에 priority 필드를 추가하면, 기존 INotificationChannel.send(payload) 구현체(4개 채널) 모두 수정 필요
**Why it happens:** "priority를 전달해야 하니까 payload에 추가" 직관
**How to avoid:** 기존 채널 구현이 이미 eventType 기반 priority 결정을 하고 있음을 확인. eventType 매핑에 SUSPICIOUS 규칙만 추가하면 됨
**Warning signs:** INotificationChannel 인터페이스나 NotificationPayload 타입을 수정하려는 시도

### Pitfall 2: getDecimals()를 IncomingTransaction 타입 변경으로 해결
**What goes wrong:** IncomingTransaction에 decimals 필드를 추가하면 §2.1 DDL, §2.6 INSERT, §2.7 마이그레이션, §1.2 타입 4곳 모두 수정 필요 (Phase 222의 is_suspicious 추가와 동일 규모)
**Why it happens:** "타입에 필요한 데이터가 없으니 추가" 직관
**How to avoid:** SafetyRuleContext가 이미 외부 데이터(usdPrice, isRegisteredToken 등) 전달 역할을 하고 있음을 확인. decimals도 동일한 패턴으로 context에 추가
**Warning signs:** IncomingTransaction 타입이나 incoming_transactions DDL을 수정하려는 시도

### Pitfall 3: skills/ 파일 직접 수정
**What goes wrong:** 아직 구현되지 않은 API 엔드포인트를 skill 파일에 추가하면 MCP 도구가 실제로 존재하지 않아 에이전트가 호출 시 실패
**Why it happens:** CLAUDE.md 규칙("API 변경 시 skills/ 업데이트")을 설계 시점에도 적용
**How to avoid:** 설계 문서에 "구현 마일스톤에서 skills/ 업데이트 필요" 범위만 명세. 실제 수정은 m27-01에서
**Warning signs:** skills/wallet.skill.md나 skills/transactions.skill.md를 직접 편집하려는 시도

### Pitfall 4: §8.6 doc 31 행에 PATCH만 추가하고 영향 분석 미기재
**What goes wrong:** 변경 내용에 "PATCH" 한 줄만 추가하고, 이 변경이 기존 API 설계 원칙(PUT vs PATCH, 인증 방식)과 어떻게 일관되는지 미분석
**Why it happens:** 단순 목록 추가로 처리
**How to avoid:** PATCH 엔드포인트의 인증(masterAuth), 요청 스키마(WalletUpdateSchema 확장), 동적 효과(syncSubscriptions 호출)를 함께 기재
**Warning signs:** 영향 분석이 1줄 미만

## Code Examples

이 Phase는 설계 문서 수정이므로 코드 예시는 "수정 후 설계 문서에 포함될 코드"를 보여준다.

### NOTIFY-1: 채널별 priority 매핑 규칙 명세 (§6.4)

**NtfyChannel 확장:**
```typescript
/** Map event type to ntfy priority (1-5, where 5=max). */
private mapPriority(eventType: string): number {
  if (eventType.includes('KILL_SWITCH') || eventType.includes('AUTO_STOP')) return 5; // urgent
  if (eventType.includes('SUSPICIOUS') || eventType.includes('SUSPENDED')
    || eventType.includes('FAILED') || eventType.includes('VIOLATION')) return 4; // high
  if (eventType.includes('APPROVAL') || eventType.includes('EXPIR')) return 3; // default
  if (eventType.includes('INCOMING_TX_DETECTED')) return 3; // normal incoming
  return 2; // low for informational
}
```

**WalletNotificationChannel 확장:**
```typescript
// Determine priority
const isHighPriority = category === 'security_alert'
  || eventType === 'INCOMING_TX_SUSPICIOUS';
const priority = isHighPriority ? 5 : 3;
```

### getDecimals: SafetyRuleContext 확장 + 헬퍼 정의 (§6.5-§6.6)

**SafetyRuleContext 확장:**
```typescript
export interface SafetyRuleContext {
  dustThresholdUsd: number;
  amountMultiplier: number;
  isRegisteredToken: boolean;
  usdPrice: number | null;
  avgIncomingUsd: number | null;
  /** 토큰 소수점 자릿수 (네이티브: SOL=9, ETH=18 / 토큰: token_registry 조회) */
  decimals: number;
}
```

**getDecimals() 헬퍼:**
```typescript
// packages/daemon/src/services/incoming/utils.ts

const NATIVE_DECIMALS: Record<string, number> = { solana: 9, ethereum: 18 };

/**
 * IncomingTransaction의 chain + tokenAddress로 decimals를 결정.
 * 네이티브 토큰: 체인별 상수 (SOL=9, ETH=18).
 * 토큰: token_registry 테이블에서 조회 (조회 실패 시 fallback 18).
 */
export function getDecimals(
  chain: string,
  tokenAddress: string | null,
  tokenRegistryLookup?: (address: string) => number | null,
): number {
  if (tokenAddress === null) return NATIVE_DECIMALS[chain] ?? 18;
  return tokenRegistryLookup?.(tokenAddress) ?? 18; // fallback: 18 (EVM 기본)
}
```

**DustAttackRule 수정:**
```typescript
check(tx: IncomingTransaction, ctx: SafetyRuleContext): boolean {
  if (ctx.usdPrice === null) return false;
  const amountUsd = Number(tx.amount) * ctx.usdPrice / Math.pow(10, ctx.decimals);
  return amountUsd < ctx.dustThresholdUsd;
}
```

### doc 31 PATCH 영향 분석 (§8.6)

```markdown
| 문서 | 영향 범위 | 변경 내용 |
|------|----------|-----------|
| doc 31 (API 설계) | 엔드포인트 추가 + 기존 변경 | GET /v1/wallet/incoming, GET /v1/wallet/incoming/summary (신규), PATCH /v1/wallet/:id monitorIncoming 필드 추가 (기존 확장) |
```

### skills/ 업데이트 요구사항 명세

```markdown
### 8.11 skills/ 파일 업데이트 요구사항

구현 마일스톤(m27-01)에서 다음 skill 파일을 업데이트한다:

| skill 파일 | 변경 내용 |
|------------|-----------|
| wallet.skill.md | § "Wallet Query" 섹션에 GET /v1/wallet/incoming, GET /v1/wallet/incoming/summary 추가. PATCH /v1/wallet/:id monitorIncoming 필드 추가. MCP 도구 list_incoming_transactions, get_incoming_summary 추가. SDK 메서드 listIncomingTransactions, getIncomingTransactionSummary 추가. 알림 카테고리 테이블에 'incoming' 추가 (INCOMING_TX_DETECTED, INCOMING_TX_SUSPICIOUS 이벤트) |
| transactions.skill.md | 변경 없음 — 수신 TX는 아웃고잉 TX 5-type과 별개 도메인이므로 wallet.skill.md에 배치 |

**규칙 참조:** CLAUDE.md "Interface Sync" 섹션 — REST API/SDK/MCP 변경 시 skills/ 동기화 필수.
**시점:** 구현 마일스톤에서 API가 실제 구현된 후 동기화. 설계 시점에서는 범위만 명세.
```

## 수정 대상 섹션 매트릭스

| 섹션 | 줄 범위 | NOTIFY-1 | getDecimals | doc 31 | skills/ |
|------|---------|----------|-------------|--------|---------|
| §6.3 알림 우선순위 | L1566-1579 | **수정** | | | |
| §6.4 채널 연동 | L1581-1646 | **수정** | | | |
| §6.5 SafetyRuleContext | L1648-1674 | | **수정** | | |
| §6.6 감지 규칙 3종 | L1677-1722 | | **수정** | | |
| §8.6 영향 분석 | L2186-2203 | | | **수정** | |
| §8.11 신규 (skills/) | 없음 (추가) | | | | **추가** |

**총 수정 섹션: 5개 수정 + 1개 추가**

## Plan 분리 전략

### 223-01: SUSPICIOUS priority 라우팅 + getDecimals() 헬퍼 명세 (NOTIFY-1, getDecimals)
- §6.3 "알림 우선순위" 설명을 구체적 메커니즘으로 교체
- §6.4 채널별 priority 매핑 규칙 추가 (NtfyChannel.mapPriority + WalletNotificationChannel)
- §6.4 NOTIFICATION_CATEGORIES incoming 카테고리 코멘트를 구체적 명세로 교체
- §6.5 SafetyRuleContext에 `decimals: number` 필드 추가
- §6.6 DustAttackRule/LargeAmountRule의 `getDecimals(tx)` → `ctx.decimals` 교체
- §6.5-§6.6 사이에 getDecimals() 헬퍼 함수 정의 추가

### 223-02: doc 31 PATCH 영향 분석 + skills/ 업데이트 요구사항 (doc 31, skills/)
- §8.6 doc 31 행에 PATCH /v1/wallet/:id monitorIncoming 변경 추가
- §8.6 뒤 또는 §8.10 앞에 §8.11 "skills/ 파일 업데이트 요구사항" 섹션 추가
- 구현 마일스톤에서 업데이트할 skill 파일과 변경 내용 명세

## Open Questions

1. **WalletNotificationChannel의 SUSPICIOUS priority를 4가 아닌 5로 올릴 것인가?**
   - What we know: 현재 WalletNotificationChannel은 security_alert만 priority 5. NtfyChannel은 KILL_SWITCH/AUTO_STOP만 5.
   - What's unclear: SUSPICIOUS 입금이 "urgent"(5)인지 "high"(4)인지
   - Recommendation: **priority 4 (high)**. urgent(5)는 자금 동결/시스템 중단 수준이고, SUSPICIOUS 입금은 주의 필요하지만 즉시 대응 필수는 아님. NtfyChannel에서 4, WalletNotificationChannel에서도 4 (또는 eventType 특별 처리로 5 미만).

2. **getDecimals() 토큰 조회 실패 시 fallback 값은?**
   - What we know: EVM 기본 18, Solana SPL은 가변 (6, 9 등)
   - What's unclear: token_registry에 없는 토큰의 decimals fallback
   - Recommendation: **fallback 18** (EVM 가장 흔한 값). Solana SPL은 token_registry에 없으면 unknownToken 규칙에 걸리므로 decimals 불필요. EVM 미등록 토큰도 마찬가지. 결국 두 규칙이 동시에 적용되므로 fallback 부정확해도 실질적 영향 없음.

## Sources

### Primary (HIGH confidence)
- `docs/design/76-incoming-transaction-monitoring.md` -- §6.3-§6.6 (알림/규칙), §8.6 (영향 분석) 교차 분석
- `.planning/v27.0-MILESTONE-AUDIT.md` -- NOTIFY-1, getDecimals, doc 31, skills/ 4건 정의
- `.planning/REQUIREMENTS.md` -- EVT-02, EVT-05, VER-01 요구사항 + gap closure 항목
- `.planning/ROADMAP.md` -- Phase 223 목표/의존/성공 기준

### Secondary (HIGH confidence)
- `packages/daemon/src/notifications/notification-service.ts` -- NotificationService.notify() 시그니처 (L91-96), BROADCAST_EVENTS (L18-22)
- `packages/daemon/src/notifications/channels/ntfy.ts` -- NtfyChannel.mapPriority() (L39-44)
- `packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts` -- priority 결정 (L78-79)
- `packages/core/src/interfaces/INotificationChannel.ts` -- NotificationPayload 구조
- `packages/core/src/schemas/signing-protocol.ts` -- EVENT_CATEGORY_MAP (L185-214)
- `packages/daemon/src/pipeline/resolve-effective-amount-usd.ts` -- NATIVE_DECIMALS 맵 (L53-55)
- `packages/daemon/src/infrastructure/database/schema.ts` -- token_registry.decimals 컬럼
- `packages/core/src/enums/notification.ts` -- NOTIFICATION_EVENT_TYPES 28개 (INCOMING 미포함)
- `skills/wallet.skill.md` -- 현재 skill 파일 구조 (§1-14)
- `skills/transactions.skill.md` -- 현재 skill 파일 구조 (§1-12)

### Phase Summaries (HIGH confidence)
- `.planning/phases/219-notification-events-safety/219-SUMMARY.md` -- EVT-01~05 + priority 코멘트
- `.planning/phases/221-config-integration-verify/221-SUMMARY.md` -- VER-01 영향 분석
- `.planning/phases/222-design-critical-fix/222-VERIFICATION.md` -- GAP-1~4 해결 확인

## Metadata

**Confidence breakdown:**
- NOTIFY-1 해결 전략: HIGH -- 기존 코드에서 priority 결정 패턴이 명확히 확인됨 (NtfyChannel.mapPriority, WalletNotificationChannel L78-79)
- getDecimals 해결 전략: HIGH -- SafetyRuleContext 패턴이 이미 확립되어 있고, NATIVE_DECIMALS 맵이 코드에 존재
- doc 31 PATCH: HIGH -- §7.3에 PATCH 명세가 이미 존재하며 §8.6 테이블에 한 줄 추가만 필요
- skills/ 업데이트: HIGH -- CLAUDE.md 규칙과 현재 skill 파일 구조가 명확

**Research date:** 2026-02-21
**Valid until:** 해당 없음 (내부 설계 문서 수정이므로 시한 없음)
