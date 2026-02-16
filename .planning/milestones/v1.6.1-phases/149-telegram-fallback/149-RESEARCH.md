# Phase 149: Telegram Fallback - Research

**Researched:** 2026-02-16
**Domain:** WC 실패 감지 + Telegram fallback + 단일 승인 소스 + 채널 전환 알림
**Confidence:** HIGH

## Summary

Phase 149는 WalletConnect 채널이 불가능할 때 Telegram Bot으로 자동 전환하며, 어떤 경우에도 하나의 채널에서만 승인이 처리되도록 보장하는 기능이다. 3개 요구사항(FALL-01, FALL-02, FALL-03)을 커버한다.

현재 코드베이스 분석 결과: (1) `WcSigningBridge.requestSignature()`는 WC 세션이 없으면 조용히 반환(silently return)하고, WC 타임아웃/네트워크 에러 시에도 approval을 reject하지 않으며 `console.warn`만 남긴다. (2) `ApprovalWorkflow.approve()`/`.reject()`는 `BEGIN IMMEDIATE` + `approved_at IS NULL AND rejected_at IS NULL` 조건으로 원자적이므로, 두 채널이 동시에 approve()를 호출해도 하나만 성공한다 (APPROVAL_NOT_FOUND). (3) `TX_APPROVAL_REQUIRED` 알림은 Stage 3에서 `notificationService.notify()`로 발송되며, 이 알림이 Telegram 채널에 도달하면 TelegramBotService `/pending`으로 확인 후 `/approve {txId}`로 승인 가능하다. (4) Telegram 봇의 `handleApprove`는 `approval_channel`을 'telegram'으로 업데이트하지 않고 기본값('rest_api')으로 남긴다.

핵심 설계 결정: WC 요청의 fire-and-forget 특성을 유지하면서, WC가 실패(no session / timeout / error)하면 Telegram에 전용 승인 알림을 전송한다. `approval_channel` 컬럼을 WC 요청 전에 'walletconnect'로, fallback 시 'telegram'으로 업데이트하여 단일 소스 감사 추적을 제공한다. ApprovalWorkflow의 CAS 기반 원자적 approve/reject가 이미 이중 승인을 방지하므로, 추가적인 잠금 메커니즘은 불필요하다.

**Primary recommendation:** WcSigningBridge를 확장하여 WC 실패 감지 후 Telegram 전용 승인 알림을 보내는 `ApprovalChannelRouter` 서비스를 구현한다. 기존 fire-and-forget 패턴을 유지하되, WC가 실패하면 NotificationService를 통해 Telegram에 `TX_APPROVAL_REQUIRED` 알림을 재전송하고, approval_channel을 'telegram'으로 업데이트한다. 새로운 EventBus 이벤트 `approval:channel-switched`를 추가하여 채널 전환을 추적한다.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @waiaas/core EventBus | - | 채널 전환 이벤트 발행 | 기존 이벤트 시스템 활용 |
| NotificationService | - | Telegram으로 승인 알림 전송 | 기존 알림 인프라 활용 |
| ApprovalWorkflow | - | CAS 기반 원자적 approve/reject | 이중 승인 방지 이미 보장 |
| WcSigningBridge | - | WC 서명 요청 + 실패 감지 | Phase 148에서 구현된 핵심 서비스 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-sqlite3 | - | approval_channel 업데이트 | 채널 전환 시 DB 갱신 |
| TelegramBotService | - | /approve /reject 명령 처리 | fallback 채널로 승인 수신 |

### Alternatives Considered
없음. 기존 스택 100% 재사용.

**Installation:**
```bash
# 새로운 패키지 설치 없음
```

## Architecture Patterns

### 현재 승인 채널 흐름 (Phase 148 완료 상태)

```
Stage 3: Policy → tier = APPROVAL
  │ TX_APPROVAL_REQUIRED 알림 (4채널 전체: Telegram/Discord/ntfy/Slack)
  │
Stage 4: Wait → APPROVAL 분기
  ├── approvalWorkflow.requestApproval(txId)  ← pending_approvals 생성, QUEUED
  ├── wcSigningBridge.requestSignature(walletId, txId, chain)  ← fire-and-forget
  │   ├── WC session 있음 → approval_channel = 'walletconnect' → WC 서명 요청
  │   │   ├── Owner 승인 → verifySIWE/Ed25519 → approvalWorkflow.approve()
  │   │   ├── Owner 거부(4001/5000) → approvalWorkflow.reject()
  │   │   └── 타임아웃(8000)/에러 → console.warn (아무 처리 없음)  ← 문제점
  │   └── WC session 없음 → return (아무 처리 없음)  ← 문제점
  └── throw PIPELINE_HALTED
```

### 문제점 분석

1. **WC 세션 없을 때**: `requestSignature()`가 조용히 반환된다. TX_APPROVAL_REQUIRED 알림은 Stage 3에서 이미 발송되었으므로 Telegram에서 `/approve`로 승인 가능하지만, 이것이 명시적 fallback인지 우연인지 구분할 수 없다. `approval_channel`이 기본값 'rest_api'로 남는다.

2. **WC 타임아웃/에러 시**: `handleSignatureError()`가 console.warn만 남긴다. Owner는 WC에서 실패했다는 사실을 모르고, Telegram에서 직접 `/pending` → `/approve`를 수동으로 해야 한다. 전환 알림이 없다.

3. **Telegram 봇의 approval_channel 미갱신**: `handleApprove()`/`handleReject()`가 `approval_channel`을 'telegram'으로 업데이트하지 않는다.

4. **동시 승인 가능성**: TX_APPROVAL_REQUIRED가 Stage 3에서 4채널 전체에 브로드캐스트되므로, WC + Telegram 양쪽에서 동시에 승인 시도 가능. CAS가 하나만 통과시키지만, UX 상 혼란.

### 제안 아키텍처: ApprovalChannelRouter

```
Stage 3: Policy → tier = APPROVAL
  │ TX_APPROVAL_REQUIRED 알림 (4채널 전체)  ← 현행 유지 (일반 알림)
  │
Stage 4: Wait → APPROVAL 분기
  ├── approvalWorkflow.requestApproval(txId)
  ├── [NEW] approvalChannelRouter.routeApproval(walletId, txId, chain)  ← fire-and-forget
  │   ├── WC session 있음:
  │   │   ├── approval_channel = 'walletconnect'
  │   │   ├── WC 서명 요청 전송
  │   │   │   ├── 성공 → approve (기존 WcSigningBridge 로직)
  │   │   │   ├── 거부 → reject (기존 로직)
  │   │   │   └── 타임아웃/에러 → [NEW] fallbackToTelegram(txId)
  │   │   │       ├── approval_channel = 'telegram'
  │   │   │       ├── EventBus: 'approval:channel-switched'
  │   │   │       └── NotificationService: Telegram에 승인 필요 재알림
  │   │   └── (Owner가 WC에서 응답 안 함 → approval-expired 워커가 처리)
  │   └── WC session 없음:
  │       ├── approval_channel = 'telegram'  (봇이 구성된 경우)
  │       ├── EventBus: 'approval:channel-switched'  (WC → Telegram)
  │       └── (TX_APPROVAL_REQUIRED 알림은 Stage 3에서 이미 전송됨)
  └── throw PIPELINE_HALTED
```

### 구현 방식 결정: WcSigningBridge 확장 vs 별도 서비스

**선택: WcSigningBridge를 확장하여 fallback 로직을 통합한다.**

이유:
1. `requestSignature()`에서 이미 WC 실패를 감지하고 있으므로, fallback 로직의 자연스러운 위치다.
2. 별도 `ApprovalChannelRouter` 서비스를 만들면 DI 체인이 복잡해진다.
3. WcSigningBridge에 `notificationService`, `eventBus`를 주입하면 된다.

```typescript
// WcSigningBridge deps 확장
export interface WcSigningBridgeDeps {
  wcSessionService: WcSessionService;
  approvalWorkflow: ApprovalWorkflow;
  sqlite: Database;
  // [NEW] Phase 149
  notificationService?: NotificationService;
  eventBus?: EventBus;
  telegramBotEnabled?: boolean; // TelegramBotService가 구성되어 있는지
}
```

### Pattern 1: WC 없을 때 즉시 Telegram fallback

**What:** WC 세션이 없으면 approval_channel을 'telegram'으로 설정하고 EventBus 이벤트를 발행한다.
**When to use:** `requestSignature()`에서 signClient/topic/sessionInfo가 null인 경우.
**Example:**
```typescript
async requestSignature(walletId: string, txId: string, chain: string): Promise<void> {
  try {
    const signClient = this.wcSessionService.getSignClient();
    if (!signClient) {
      this.fallbackToTelegram(walletId, txId, 'wc_not_initialized');
      return;
    }

    const topic = this.wcSessionService.getSessionTopic(walletId);
    if (!topic) {
      this.fallbackToTelegram(walletId, txId, 'no_wc_session');
      return;
    }
    // ... WC 서명 요청 진행 ...
  } catch (error: any) {
    this.handleSignatureError(walletId, txId, error);
  }
}
```

### Pattern 2: WC 타임아웃/에러 시 Telegram fallback

**What:** WC 요청이 타임아웃(8000) 또는 네트워크 에러로 실패하면 Telegram으로 fallback한다. 사용자 명시적 거부(4001/5000)는 reject 처리하므로 fallback 대상이 아니다.
**When to use:** `handleSignatureError()`에서 사용자 거부가 아닌 에러 발생 시.
**Example:**
```typescript
private handleSignatureError(walletId: string, txId: string, error: any): void {
  const errorCode = error?.code;

  if (typeof errorCode === 'number' && WC_USER_REJECTED.includes(errorCode)) {
    // 사용자 명시적 거부 → reject (기존 로직)
    try {
      this.approvalWorkflow.reject(txId);
      this.updateApprovalChannel(txId, 'walletconnect');
    } catch (err) {
      console.warn(`[WcSigningBridge] reject failed for ${txId}:`, err);
    }
    return;
  }

  // 타임아웃, 네트워크 에러, 기타 → Telegram fallback
  // (approval이 아직 pending인 경우에만)
  if (this.isApprovalStillPending(txId)) {
    this.fallbackToTelegram(walletId, txId, 'wc_error', error?.message);
  }
}
```

### Pattern 3: Telegram fallback 실행

**What:** approval_channel 업데이트 + EventBus 이벤트 + Telegram 전용 승인 알림.
**When to use:** WC가 사용 불가하거나 실패했을 때.
**Example:**
```typescript
private fallbackToTelegram(
  walletId: string,
  txId: string,
  reason: string,
  errorDetail?: string,
): void {
  // 1. approval_channel 업데이트 (pending인 경우에만)
  this.sqlite
    .prepare(
      `UPDATE pending_approvals SET approval_channel = 'telegram'
       WHERE tx_id = ? AND approved_at IS NULL AND rejected_at IS NULL`,
    )
    .run(txId);

  // 2. EventBus 이벤트 발행
  this.eventBus?.emit('approval:channel-switched', {
    walletId,
    txId,
    fromChannel: 'walletconnect',
    toChannel: 'telegram',
    reason,
    timestamp: Math.floor(Date.now() / 1000),
  });

  // 3. 채널 전환 알림 (NotificationService 경유)
  void this.notificationService?.notify('APPROVAL_CHANNEL_SWITCHED', walletId, {
    from_channel: 'walletconnect',
    to_channel: 'telegram',
    reason,
  }, { txId });

  console.log(`[WcSigningBridge] Fallback to Telegram for ${txId}: ${reason}`);
}
```

### Pattern 4: Telegram 봇 approval_channel 갱신

**What:** TelegramBotService의 handleApprove/handleReject에서 approval_channel을 'telegram'으로 업데이트한다.
**When to use:** Telegram 봇으로 승인/거절 시.
**Example:**
```typescript
// TelegramBotService.handleApprove() 수정
private async handleApprove(chatId: number, txId?: string): Promise<void> {
  // ... 기존 검증 로직 ...

  // Approve: update pending_approvals and transactions
  this.sqlite
    .prepare(
      `UPDATE pending_approvals
       SET approved_at = unixepoch(), approval_channel = 'telegram'
       WHERE tx_id = ? AND approved_at IS NULL AND rejected_at IS NULL`,
    )
    .run(txId);

  this.sqlite
    .prepare(
      "UPDATE transactions SET status = 'EXECUTING' WHERE id = ? AND status = 'QUEUED'",
    )
    .run(txId);

  // ... 감사 로그 + 응답 ...
}
```

### Pattern 5: 이중 승인 방지 (이미 해결됨)

**What:** `ApprovalWorkflow.approve()`의 `BEGIN IMMEDIATE` + `approved_at IS NULL AND rejected_at IS NULL` 조건이 CAS 기반으로 이중 승인을 방지한다.
**Why safe:** WC와 Telegram이 동시에 approve()를 호출해도 하나만 성공한다. 두 번째 호출은 `APPROVAL_NOT_FOUND` 에러가 발생한다.
**단, 주의:** Telegram의 `handleApprove`는 ApprovalWorkflow를 사용하지 않고 직접 SQL로 업데이트한다. 따라서 WC(ApprovalWorkflow 경유) + Telegram(직접 SQL) 간 경쟁 조건이 존재할 수 있다.

```
현재 Telegram handleApprove:
  sqlite.prepare('UPDATE pending_approvals SET approved_at = ...')  ← 직접 SQL
  sqlite.prepare('UPDATE transactions SET status = EXECUTING ...')  ← 직접 SQL

WcSigningBridge:
  approvalWorkflow.approve(txId, sig)  ← BEGIN IMMEDIATE 트랜잭션

문제: 두 경로의 원자성 레벨이 다르다.
해결: Telegram handleApprove도 ApprovalWorkflow.approve()를 사용하도록 수정.
    단, Telegram은 ownerSignature가 없으므로 'telegram-admin' 같은 마커를 전달.
```

### Recommended Project Structure

```
packages/daemon/src/
├── services/
│   └── wc-signing-bridge.ts          # [MODIFY] fallback 로직 추가, deps 확장
├── infrastructure/telegram/
│   └── telegram-bot-service.ts       # [MODIFY] approval_channel 갱신
├── workflow/
│   └── approval-workflow.ts          # 변경 없음 (CAS 이미 안전)
├── pipeline/
│   └── stages.ts                     # 변경 최소 (WcSigningBridge deps에 추가 서비스 전달)
├── lifecycle/
│   └── daemon.ts                     # [MODIFY] WcSigningBridge DI에 notificationService, eventBus 추가
packages/core/src/
├── events/
│   └── event-types.ts                # [MODIFY] 'approval:channel-switched' 이벤트 추가
├── enums/
│   └── notification.ts               # [MODIFY] APPROVAL_CHANNEL_SWITCHED 이벤트 타입 추가 (선택)
```

### Anti-Patterns to Avoid

- **WC 요청과 Telegram 알림을 동시에 보내기:** WC 세션이 있을 때는 WC만 시도하고, 실패 시에만 Telegram으로 전환해야 한다. 양쪽에서 동시에 대기하면 UX 혼란.
- **별도 fallback 타이머를 추가하기:** WC `signClient.request()`는 expiry 파라미터로 자체 타임아웃을 가지므로, 별도 fallback 타이머를 만들 필요 없다. WC Promise가 reject되면 그때 fallback.
- **ApprovalWorkflow를 수정하여 채널 로직을 넣기:** ApprovalWorkflow는 채널에 무관한 범용 서비스. 채널 로직은 WcSigningBridge(호출자)에서 처리.
- **TX_APPROVAL_REQUIRED 알림을 Stage 3에서 제거하기:** 이 알림은 Owner에게 "승인이 필요하다"는 일반 정보 알림이다. WC가 있든 없든 알려야 한다. Telegram-specific 승인 프롬프트는 별도 이벤트로 처리.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 이중 승인 방지 | 별도 mutex/lock | ApprovalWorkflow CAS (BEGIN IMMEDIATE) | 이미 원자적으로 안전 |
| 채널 전환 감사 | 커스텀 로깅 | EventBus + audit_log | 기존 이벤트/감사 인프라 활용 |
| Telegram 알림 전송 | 직접 Telegram API 호출 | NotificationService.notify() | 기존 4채널 알림 + rate limiting + fallback |
| WC 타임아웃 감지 | 별도 타이머 | WC SDK의 expiry + error code 8000 | signClient.request()가 자체 관리 |
| pending 상태 확인 | 별도 상태 머신 | `approved_at IS NULL AND rejected_at IS NULL` SQL 조건 | 이미 기존 패턴으로 동작 |

**Key insight:** Phase 149의 핵심은 기존 WcSigningBridge의 에러 핸들링 분기에 Telegram fallback 로직을 추가하는 것이다. 새로운 서비스를 만들 필요가 없으며, WcSigningBridge의 `handleSignatureError()`와 guard clause에 fallback 호출을 추가하면 된다.

## Common Pitfalls

### Pitfall 1: Telegram handleApprove와 ApprovalWorkflow의 원자성 레벨 차이
**What goes wrong:** Telegram 봇의 `handleApprove`는 직접 SQL(`UPDATE pending_approvals SET approved_at = ...`)을 사용하고, WcSigningBridge는 `ApprovalWorkflow.approve()`(`BEGIN IMMEDIATE` 트랜잭션)를 사용한다. 두 경로가 동시에 실행되면 하나가 성공하고 다른 하나는 stale data를 업데이트할 수 있다.
**Why it happens:** TelegramBotService는 v1.6(Phase 143)에서 ApprovalWorkflow와 독립적으로 구현되었다.
**How to avoid:** TelegramBotService의 handleApprove/handleReject를 ApprovalWorkflow.approve()/reject()를 호출하도록 리팩토링한다. ownerSignature 없이 호출 시 'telegram-admin' 마커를 전달한다.
**Warning signs:** Telegram으로 승인했지만 transaction이 EXECUTING으로 전환되지 않는 경우, 또는 WC 승인과 Telegram 승인이 동시에 성공하는 경우.

### Pitfall 2: 너무 빠른 fallback (WC 요청 발송 즉시 Telegram 알림)
**What goes wrong:** WC 서명 요청 후 Owner가 MetaMask를 여는 중(10~30초)인데, 동시에 Telegram에서도 승인 알림이 와서 혼란.
**Why it happens:** WC의 fire-and-forget 특성 상, 요청 발송과 응답 대기가 비동기.
**How to avoid:** WC 세션이 있을 때는 WC가 먼저 시도되고, WC가 실패(타임아웃/에러) 한 후에만 Telegram fallback을 트리거한다. Stage 3의 TX_APPROVAL_REQUIRED 알림은 일반 정보 알림이므로 양쪽 모두에 전송되지만, Telegram-specific "지금 승인하세요" 프롬프트는 fallback 시에만 전송.
**Warning signs:** WC 요청 발송 직후 Telegram에서 승인 버튼이 표시되는 경우.

### Pitfall 3: approval_channel 업데이트 시 이미 처리된 approval
**What goes wrong:** approval_channel을 'telegram'으로 업데이트하려고 하는데, 그 사이에 WC 또는 REST에서 이미 approve/reject가 처리된 경우.
**Why it happens:** fire-and-forget 패턴의 비동기 특성.
**How to avoid:** `WHERE approved_at IS NULL AND rejected_at IS NULL` 조건을 항상 포함하여 이미 처리된 approval은 건드리지 않는다. 현재 WcSigningBridge 코드에서 이미 이 패턴을 사용 중.
**Warning signs:** 없음 (이미 안전한 패턴).

### Pitfall 4: EventBus 이벤트 타입 미등록으로 인한 타입 에러
**What goes wrong:** `approval:channel-switched` 이벤트를 WaiaasEventMap에 추가하지 않으면 TypeScript 컴파일 에러.
**Why it happens:** EventBus가 strict typing (WaiaasEventMap)을 사용한다.
**How to avoid:** `packages/core/src/events/event-types.ts`에 새 이벤트 타입을 추가하고, 해당 인터페이스를 정의한다.
**Warning signs:** `emit('approval:channel-switched', ...)` 호출 시 TypeScript 에러.

### Pitfall 5: NotificationService에 APPROVAL_CHANNEL_SWITCHED 이벤트 미등록
**What goes wrong:** 새 알림 이벤트를 NotificationEventType enum에 추가하지 않으면 알림 전송이 실패하거나 타입 에러.
**Why it happens:** NotificationEventType은 Zod enum으로 정의되어 있다.
**How to avoid:** `packages/core/src/enums/notification.ts`에 'APPROVAL_CHANNEL_SWITCHED'를 추가하고, i18n 메시지 템플릿(en.ts, ko.ts)에 해당 이벤트의 title/body를 추가한다.
**Warning signs:** 런타임에 `Invalid enum value` Zod 에러, 또는 알림 메시지가 비어 있음.

## Code Examples

### 1. WcSigningBridge 확장 -- fallback 메서드 추가

```typescript
// Source: packages/daemon/src/services/wc-signing-bridge.ts (기존 코드 분석)

// deps 확장
export interface WcSigningBridgeDeps {
  wcSessionService: WcSessionService;
  approvalWorkflow: ApprovalWorkflow;
  sqlite: Database;
  // [NEW] Phase 149
  notificationService?: NotificationService;
  eventBus?: EventBus;
}

// fallback 메서드
private fallbackToTelegram(
  walletId: string,
  txId: string,
  reason: string,
): void {
  // approval이 아직 pending인지 확인
  const pending = this.sqlite
    .prepare(
      `SELECT 1 FROM pending_approvals
       WHERE tx_id = ? AND approved_at IS NULL AND rejected_at IS NULL`,
    )
    .get(txId);

  if (!pending) return; // 이미 처리됨

  // approval_channel 업데이트
  this.sqlite
    .prepare(
      `UPDATE pending_approvals SET approval_channel = 'telegram'
       WHERE tx_id = ? AND approved_at IS NULL AND rejected_at IS NULL`,
    )
    .run(txId);

  // EventBus 이벤트
  this.eventBus?.emit('approval:channel-switched', {
    walletId,
    txId,
    fromChannel: 'walletconnect',
    toChannel: 'telegram',
    reason,
    timestamp: Math.floor(Date.now() / 1000),
  });

  // 채널 전환 알림
  void this.notificationService?.notify(
    'APPROVAL_CHANNEL_SWITCHED',
    walletId,
    { from_channel: 'walletconnect', to_channel: 'telegram', reason },
    { txId },
  );
}
```

### 2. handleSignatureError 수정 -- fallback 트리거

```typescript
// Source: 현재 WcSigningBridge.handleSignatureError() 분석

private handleSignatureError(walletId: string, txId: string, error: any): void {
  const errorCode = error?.code;

  if (typeof errorCode === 'number' && WC_USER_REJECTED.includes(errorCode)) {
    // 사용자 명시적 거부 → reject (기존 로직 유지)
    try {
      this.approvalWorkflow.reject(txId);
      this.sqlite
        .prepare(
          `UPDATE pending_approvals SET approval_channel = 'walletconnect'
           WHERE tx_id = ? AND rejected_at IS NOT NULL`,
        )
        .run(txId);
    } catch (err) {
      console.warn(`[WcSigningBridge] reject failed for ${txId}:`, err);
    }
    return;
  }

  // [NEW Phase 149] 타임아웃/네트워크 에러 → Telegram fallback
  if (errorCode === WC_REQUEST_EXPIRED) {
    console.warn(`[WcSigningBridge] WC request expired for ${txId}, falling back to Telegram`);
  } else {
    console.warn(`[WcSigningBridge] WC error for ${txId}:`, error?.message ?? error);
  }

  this.fallbackToTelegram(walletId, txId, errorCode === WC_REQUEST_EXPIRED ? 'wc_timeout' : 'wc_error');
}
```

### 3. requestSignature 수정 -- WC 없을 때 fallback

```typescript
// Source: 현재 WcSigningBridge.requestSignature() 분석

async requestSignature(walletId: string, txId: string, chain: string): Promise<void> {
  try {
    const signClient = this.wcSessionService.getSignClient();
    if (!signClient) {
      // [NEW Phase 149] WC 미초기화 → Telegram fallback
      this.fallbackToTelegram(walletId, txId, 'wc_not_initialized');
      return;
    }

    const topic = this.wcSessionService.getSessionTopic(walletId);
    if (!topic) {
      // [NEW Phase 149] WC 세션 없음 → Telegram fallback
      this.fallbackToTelegram(walletId, txId, 'no_wc_session');
      return;
    }

    const sessionInfo = this.wcSessionService.getSessionInfo(walletId);
    if (!sessionInfo) {
      this.fallbackToTelegram(walletId, txId, 'no_session_info');
      return;
    }

    // ... 기존 WC 서명 요청 로직 (변경 없음) ...
  } catch (error: any) {
    // [MODIFIED] walletId 전달
    this.handleSignatureError(walletId, txId, error);
  }
}
```

### 4. EventBus 이벤트 타입 추가

```typescript
// Source: packages/core/src/events/event-types.ts

export interface ApprovalChannelSwitchedEvent {
  walletId: string;
  txId: string;
  fromChannel: string;
  toChannel: string;
  reason: string;
  timestamp: number;
}

export interface WaiaasEventMap {
  'transaction:completed': TransactionCompletedEvent;
  'transaction:failed': TransactionFailedEvent;
  'wallet:activity': WalletActivityEvent;
  'kill-switch:state-changed': KillSwitchStateChangedEvent;
  // [NEW] Phase 149
  'approval:channel-switched': ApprovalChannelSwitchedEvent;
}
```

### 5. Telegram 봇 approval_channel 갱신

```typescript
// Source: TelegramBotService.handleApprove() 수정

// BEFORE:
this.sqlite
  .prepare(
    'UPDATE pending_approvals SET approved_at = unixepoch() WHERE tx_id = ? AND approved_at IS NULL AND rejected_at IS NULL',
  )
  .run(txId);

// AFTER:
this.sqlite
  .prepare(
    `UPDATE pending_approvals SET approved_at = unixepoch(), approval_channel = 'telegram'
     WHERE tx_id = ? AND approved_at IS NULL AND rejected_at IS NULL`,
  )
  .run(txId);

// handleReject도 동일하게 수정:
this.sqlite
  .prepare(
    `UPDATE pending_approvals SET rejected_at = unixepoch(), approval_channel = 'telegram'
     WHERE tx_id = ? AND approved_at IS NULL AND rejected_at IS NULL`,
  )
  .run(txId);
```

### 6. i18n 메시지 템플릿 추가

```typescript
// Source: packages/core/src/i18n/en.ts
APPROVAL_CHANNEL_SWITCHED: {
  title: 'Approval Channel Switched',
  body: 'Approval for transaction {txId} switched from {from_channel} to {to_channel}. Reason: {reason}',
},

// Source: packages/core/src/i18n/ko.ts
APPROVAL_CHANNEL_SWITCHED: {
  title: '승인 채널 전환',
  body: '거래 {txId}의 승인 채널이 {from_channel}에서 {to_channel}로 전환되었습니다. 사유: {reason}',
},
```

### 7. Daemon lifecycle DI 수정

```typescript
// Source: packages/daemon/src/lifecycle/daemon.ts

// Step 4c-7: WcSigningBridge 초기화 수정
try {
  if (this.wcSessionService && this.approvalWorkflow && this.sqlite) {
    const { WcSigningBridge } = await import('../services/wc-signing-bridge.js');
    this.wcSigningBridge = new WcSigningBridge({
      wcSessionService: this.wcSessionService,
      approvalWorkflow: this.approvalWorkflow,
      sqlite: this.sqlite,
      // [NEW Phase 149]
      notificationService: this.notificationService ?? undefined,
      eventBus: this.eventBus,
    });
    console.log('Step 4c-7: WcSigningBridge initialized (with Telegram fallback)');
  }
} catch (err) {
  console.warn('Step 4c-7 (fail-soft): WcSigningBridge init warning:', err);
  this.wcSigningBridge = null;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WC 실패 시 무시 (console.warn) | WC 실패 시 Telegram fallback | Phase 149 | Owner가 항상 승인 채널을 보장받음 |
| Telegram approval_channel 미기록 | approval_channel = 'telegram' 기록 | Phase 149 | 감사 추적 완전성 |
| 단일 알림 (TX_APPROVAL_REQUIRED) | 채널 전환 알림 추가 | Phase 149 | 운영자가 전환 이유를 인지 |
| EventBus 4개 이벤트 | 5개 이벤트 (+ approval:channel-switched) | Phase 149 | 채널 전환 모니터링 가능 |

## Critical Codebase Observations

### 1. WcSigningBridge.handleSignatureError()에 walletId 누락
현재 `handleSignatureError(txId, error)` 시그니처에 `walletId`가 없다. fallback 시 walletId가 필요하므로 시그니처를 `handleSignatureError(walletId, txId, error)`로 확장해야 한다.

### 2. TX_APPROVAL_REQUIRED 알림은 Stage 3에서 모든 채널에 전송
현재 TX_APPROVAL_REQUIRED 알림은 NotificationService의 priority fallback 패턴으로 전송된다 (channels 순서대로 시도, 첫 성공 시 중단). 이는 Telegram이 첫 번째 채널이면 Telegram에만, 아니면 다른 채널에 전송된다. 이 알림은 "승인이 필요하다"는 일반 정보이므로 채널 전환과는 독립적이다.

### 3. TelegramBotService는 ApprovalWorkflow를 주입받지 않음
현재 TelegramBotService는 직접 SQL로 approve/reject를 처리한다. 이중 승인 방지를 강화하려면 ApprovalWorkflow를 주입받아 사용하는 것이 이상적이지만, 이번 Phase에서는 SQL에 `approval_channel = 'telegram'`을 추가하는 최소 변경으로 충분하다. ApprovalWorkflow 통합은 향후 리팩토링으로 연기할 수 있다.

### 4. WcSigningBridge는 WC 세션 없이도 호출됨
Stage 4에서 `ctx.wcSigningBridge`가 존재하면 항상 `requestSignature()`를 호출한다. WC 세션 유무와 무관하게. 이미 guard clause로 세션 없으면 return하는 구조이므로, fallback 로직을 이 guard clause에 추가하면 된다.

### 5. Telegram 봇이 설정되지 않은 경우
WcSigningBridge에서 Telegram fallback을 트리거하더라도, TelegramBotService가 구성되지 않으면 NotificationService 경유 알림만 전송된다 (Discord/ntfy/Slack 등). 이 경우 Owner는 REST API로 직접 승인해야 한다. fallback 알림의 목적은 "WC가 실패했으니 다른 방법을 써라"를 알려주는 것이므로, Telegram 봇 유무와 무관하게 유효하다.

### 6. approval_channel 값 규칙
현재 코드에서 사용되는 approval_channel 값:
- `'rest_api'` (기본값, schema.ts에 `.default('rest_api')`)
- `'walletconnect'` (WcSigningBridge에서 설정)
- `'telegram'` (Phase 149에서 추가)

이 값들은 enum으로 정의되어 있지 않고 문자열 리터럴로 사용된다.

## Open Questions

1. **APPROVAL_CHANNEL_SWITCHED를 별도 알림 이벤트로 추가할 것인가?**
   - What we know: 기존 NotificationEventType은 Zod enum으로 24개 이벤트가 정의되어 있다. 새 이벤트를 추가하려면 enum, i18n, 알림 템플릿 모두 수정해야 한다.
   - What's unclear: 채널 전환 알림을 별도 이벤트로 만들지, 기존 TX_APPROVAL_REQUIRED를 재전송할지.
   - Recommendation: 별도 `APPROVAL_CHANNEL_SWITCHED` 이벤트를 추가한다. 기존 TX_APPROVAL_REQUIRED를 재사용하면 "새 승인 필요" vs "채널 전환" 구분이 불가능하다.

2. **TelegramBotService를 ApprovalWorkflow로 통합할 것인가?**
   - What we know: 현재 Telegram 봇은 직접 SQL로 approve/reject한다. ApprovalWorkflow와의 원자성 레벨 차이가 존재한다.
   - What's unclear: 이번 Phase에서 리팩토링할지, 향후로 연기할지.
   - Recommendation: 이번 Phase에서는 최소 변경 (approval_channel 갱신 SQL 추가)으로 진행한다. ApprovalWorkflow 통합은 별도 이슈로 관리한다. CAS 기반 이중 승인 방지가 이미 동작하므로 긴급하지 않다.

3. **fallback 시 Telegram에 전용 승인 프롬프트를 추가로 보낼 것인가?**
   - What we know: Stage 3에서 TX_APPROVAL_REQUIRED 알림이 이미 전송되어 Telegram admin이 `/pending`으로 확인 가능하다.
   - What's unclear: fallback 시 추가로 "WC 실패, Telegram으로 승인해주세요"라는 전용 메시지를 보낼 필요가 있는지.
   - Recommendation: APPROVAL_CHANNEL_SWITCHED 알림을 보내면 충분하다. Telegram admin이 이를 보고 `/pending` → `/approve`를 실행할 수 있다. 별도 프롬프트는 불필요 (알림 스팸 방지).

## Sources

### Primary (HIGH confidence)
- `packages/daemon/src/services/wc-signing-bridge.ts` -- WcSigningBridge 전체 코드 (384줄)
- `packages/daemon/src/workflow/approval-workflow.ts` -- ApprovalWorkflow 전체 코드 (297줄)
- `packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts` -- TelegramBotService 전체 코드 (747줄)
- `packages/daemon/src/pipeline/stages.ts` -- Stage 3-4 APPROVAL 분기 (line 495-563)
- `packages/core/src/events/event-types.ts` -- WaiaasEventMap (4 이벤트)
- `packages/core/src/events/event-bus.ts` -- EventBus emit/on (typed, error-isolated)
- `packages/core/src/enums/notification.ts` -- NotificationEventType (24개)
- `packages/daemon/src/notifications/notification-service.ts` -- NotificationService (priority fallback)
- `packages/daemon/src/infrastructure/database/schema.ts` -- pending_approvals.approval_channel
- `packages/daemon/src/lifecycle/daemon.ts` -- WcSigningBridge DI wiring (line 520-533)
- `packages/daemon/src/__tests__/wc-signing-bridge.test.ts` -- 기존 테스트 패턴 (699줄)
- `.planning/phases/148-wc-signing/148-RESEARCH.md` -- Phase 148 리서치

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` -- H-03: Telegram Fallback 전환 조건 모호성 분석
- `.planning/research/ARCHITECTURE.md` -- Flow 3: Telegram Fallback, Flow 4: WC 거절/타임아웃
- `.planning/research/FEATURES.md` -- 채널 우선순위, fallback 타임아웃 설정
- `.planning/REQUIREMENTS.md` -- FALL-01, FALL-02, FALL-03 정의

### Tertiary (LOW confidence)
없음. 모든 findings이 코드베이스 직접 분석에 기반.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 기존 스택 100% 재사용, 새 라이브러리 없음
- Architecture: HIGH -- 기존 코드 직접 분석, 모든 통합 지점 확인, 패턴 재사용
- Pitfalls: HIGH -- Phase 148 리서치와 PITFALLS.md의 H-03 분석을 코드로 검증
- 이중 승인 방지: HIGH -- ApprovalWorkflow CAS 패턴 직접 확인, Telegram 직접 SQL 경로와의 차이 식별

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (안정적 도메인, 기존 코드 기반)
