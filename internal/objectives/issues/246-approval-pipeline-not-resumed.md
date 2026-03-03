# #246 — APPROVAL 티어 승인 후 파이프라인 미재개

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** FIXED
- **발견일:** 2026-03-03

## 증상

오너 지갑(D'CENT 앱)에서 APPROVAL 티어 트랜잭션을 승인한 후, DB에 승인이 정상 기록됨
(`pending_approvals.approved_at` 설정, `owner_signature` 저장, `approval_channel = 'signing_sdk'`).
하지만 트랜잭션이 `EXECUTING` 상태(tier=APPROVAL)에서 영구 정체되어 on-chain 실행이 일어나지 않음.

```sql
-- 실제 DB 상태
SELECT pa.approved_at, pa.owner_signature, t.status, t.tier
FROM pending_approvals pa JOIN transactions t ON t.id = pa.tx_id;
-- approved_at=1772511146, owner_signature=0x99c3f4..., status=EXECUTING, tier=APPROVAL
```

## 근본 원인

Stage 4에서 APPROVAL 티어는 `PIPELINE_HALTED` 예외를 던져 파이프라인을 중단한다.
승인 시 DB 상태를 `QUEUED → EXECUTING`으로 변경하지만, **파이프라인을 재개하는 호출이 없다.**

비교:
| 티어 | 재개 메커니즘 | 호출 |
|------|-------------|------|
| DELAY | DelayQueue 만료 | `executeFromStage5()` |
| GAS_WAITING | AsyncPollingService → `resumePipeline` 콜백 | `executeFromStage4()` |
| **APPROVAL** | **없음 (버그)** | — |

**영향받는 승인 경로 4개 모두 동일한 누락:**
1. REST API: `POST /transactions/:id/approve` → `approvalWorkflow.approve()`
2. WalletConnect: `wc-signing-bridge.ts` → `approvalWorkflow.approve()`
3. Signing SDK (D'CENT): `sign-response-handler.ts` → `handleApprove()`
4. Telegram Bot: `telegram-bot-service.ts` → 직접 SQL

## 관련 코드

- `packages/daemon/src/pipeline/stages.ts:775-823` — Stage 4 APPROVAL halt
- `packages/daemon/src/workflow/approval-workflow.ts:142-181` — `approve()`: DB 업데이트만, 파이프라인 재개 없음
- `packages/daemon/src/services/signing-sdk/sign-response-handler.ts:264-326` — `handleApprove()`: DB 업데이트만
- `packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts:534-555` — 직접 SQL 업데이트만
- `packages/daemon/src/services/wc-signing-bridge.ts:320,363` — `approvalWorkflow.approve()` 호출만
- `packages/daemon/src/lifecycle/daemon.ts:1775-1848` — `executeFromStage5()` (호출 안 됨)

## 수정 방향

`DELAY` 티어와 동일한 패턴 적용: 승인 성공 후 `executeFromStage5(txId, walletId)` 호출.

1. `ApprovalWorkflow`에 `onApproved?: (txId: string) => void` 콜백 추가 → REST API, WC 경로 커버
2. `SignResponseHandler`에 `onApproved?: (txId: string) => void` 콜백 추가 → Signing SDK 경로 커버
3. `TelegramBotService`에 `onApproved?: (txId: string) => void` 콜백 추가 → Telegram 경로 커버
4. `daemon.ts`에서 세 콜백을 공유 핸들러에 연결:
   ```typescript
   private handleApprovalApproved(txId: string): void {
     const tx = this._db!.select().from(transactions).where(eq(transactions.id, txId)).get();
     if (tx) void this.executeFromStage5(txId, tx.walletId);
   }
   ```

## 테스트 항목

1. **ApprovalWorkflow.approve() 콜백 호출 테스트**: approve 성공 시 onApproved 콜백이 txId와 함께 호출되는지 검증
2. **SignResponseHandler.handleApprove() 콜백 호출 테스트**: handleApprove 성공 시 onApproved 콜백이 txId와 함께 호출되는지 검증
3. **TelegramBotService handleApprove 콜백 호출 테스트**: Telegram /approve 성공 시 onApproved 콜백 호출 검증
4. **파이프라인 재개 E2E 테스트**: APPROVAL 승인 후 Stage 5(build+sign+send) + Stage 6(confirm)까지 진행되는지 검증
5. **onApproved 미설정 시 기존 동작 유지 테스트**: 콜백이 옵셔널이므로 기존 테스트가 깨지지 않는지 확인
6. **reject 시 콜백 미호출 테스트**: reject 경로에서는 onApproved가 호출되지 않는지 검증
