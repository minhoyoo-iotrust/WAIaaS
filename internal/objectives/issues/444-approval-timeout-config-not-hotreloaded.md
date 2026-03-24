# 444 — ApprovalWorkflow의 configTimeout이 hot-reload 되지 않음

- **유형:** BUG
- **심각도:** LOW
- **등록일:** 2026-03-24

## 현상

Admin Settings API(`PUT /v1/admin/settings`)로 `security.policy_defaults_approval_timeout`을 변경해도, 이미 생성된 `ApprovalWorkflow` 인스턴스의 `configTimeout`에 반영되지 않는다. 데몬을 재시작해야 변경된 값이 적용된다.

## 원인

`ApprovalWorkflow` 생성자에서 `this.configTimeout = deps.config.policy_defaults_approval_timeout`으로 한 번만 캐시한다. Admin Settings의 hot-reload 메커니즘이 이 인스턴스의 캐시된 값을 갱신하지 않는다.

```typescript
// approval-workflow.ts:87-89
constructor(deps: ApprovalWorkflowDeps) {
  this.sqlite = deps.sqlite;
  this.configTimeout = deps.config.policy_defaults_approval_timeout; // 한 번만 읽음
}
```

## 수정 방안

`configTimeout`을 직접 캐시하는 대신, config 객체 참조를 유지하고 매번 읽도록 변경:

```typescript
private readonly config: { policy_defaults_approval_timeout: number };

constructor(deps: ApprovalWorkflowDeps) {
  this.sqlite = deps.sqlite;
  this.config = deps.config; // 참조 유지
}

private get configTimeout(): number {
  return this.config.policy_defaults_approval_timeout;
}
```

또는 SettingsService의 변경 콜백을 구독하여 `configTimeout`을 갱신하는 방법도 가능.

## 영향

- Admin Settings에서 `policy_defaults_approval_timeout` 변경 후 데몬 재시작 없이는 적용되지 않음
- 다른 Admin Settings 항목들은 hot-reload가 되므로 사용자 혼란 유발

## 선행 이슈

- #443 (정책별 timeout 전달 누락)이 수정되면 이 이슈의 영향은 감소함 (정책 timeout > config timeout 우선순위이므로)

## 테스트 항목

### 단위 테스트
- Admin Settings에서 `policy_defaults_approval_timeout`을 변경한 후 새 approval 생성 시 변경된 값이 사용되는지
- config 객체 참조를 통한 hot-reload가 동작하는지
