# 443 — APPROVAL 생성 시 정책별 approval_timeout이 전달되지 않음

- **유형:** BUG
- **심각도:** MEDIUM
- **등록일:** 2026-03-24

## 현상

SPENDING_LIMIT 정책에 `approval_timeout: 30`을 설정해도 실제 pending_approvals의 `expires_at`에 반영되지 않는다. 항상 `configTimeout`(데몬 시작 시 캐시된 전역 설정값)이 사용된다.

## 원인

`stage4-wait.ts`에서 `approvalWorkflow.requestApproval()`을 호출할 때 `policyTimeoutSeconds` 옵션을 전달하지 않는다.

```typescript
// stage4-wait.ts:55
ctx.approvalWorkflow.requestApproval(ctx.txId, ctx.eip712Metadata ? {
  approvalType: ctx.eip712Metadata.approvalType,
  typedDataJson: ctx.eip712Metadata.typedDataJson,
} : undefined);
```

`resolveTimeout`의 3단계 우선순위:
1. `policyTimeoutSeconds` → **항상 undefined** (전달되지 않음)
2. `configTimeout` → 생성자에서 캐시된 값 (hot-reload 미반영)
3. 3600 하드코딩 fallback

## 수정 방안

### 1. Stage 4에서 정책 timeout 전달

Stage 4 평가 결과(`ctx.policyResult` 등)에서 SPENDING_LIMIT 정책의 `approval_timeout` 값을 추출하여 `requestApproval`에 `policyTimeoutSeconds`로 전달한다.

```typescript
ctx.approvalWorkflow.requestApproval(ctx.txId, {
  policyTimeoutSeconds: ctx.policyApprovalTimeout, // 정책에서 추출
  approvalType: ctx.eip712Metadata?.approvalType,
  typedDataJson: ctx.eip712Metadata?.typedDataJson,
});
```

### 2. configTimeout hot-reload

`ApprovalWorkflow.configTimeout`이 생성자에서 한 번만 캐시되므로, Admin Settings 변경 시 갱신되지 않는다. getter를 통해 매번 최신 설정값을 읽도록 변경하거나, SettingsService의 변경 이벤트를 구독하여 갱신한다.

## 영향

- 정책별 approval_timeout 커스터마이징이 무시됨
- Admin Settings의 `policy_defaults_approval_timeout` 런타임 변경이 기존 ApprovalWorkflow 인스턴스에 반영되지 않음 (데몬 재시작 필요)

## 테스트 항목

### 단위 테스트
- `requestApproval`에 `policyTimeoutSeconds: 30`을 전달하면 `expires_at`이 `now + 30`으로 설정되는지
- `policyTimeoutSeconds` 없이 호출 시 configTimeout이 사용되는지
- configTimeout hot-reload 후 새 approval이 갱신된 timeout을 사용하는지

### 통합 테스트
- SPENDING_LIMIT 정책에 `approval_timeout: 30` 설정 → 전송 → 30초 후 EXPIRED 확인
