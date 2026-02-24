---
phase: 257-staking-pipeline-integration-fix
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/daemon/src/api/routes/actions.ts
  - packages/daemon/src/__tests__/actions-staking-integration.test.ts
autonomous: true
requirements: [ASYNC-01, ASYNC-02, ASYNC-03, ASYNC-04, SAPI-01, SAPI-02]
gap_closure: true

must_haves:
  truths:
    - "Lido/Jito unstake 완료 후 bridge_status=PENDING + bridge_metadata가 DB에 기록되어 AsyncPollingService가 트랜잭션을 폴링한다"
    - "Action provider 트랜잭션의 metadata 컬럼에 {provider, action}이 기록되어 GET /v1/wallet/staking이 실제 포지션을 반환한다"
  artifacts:
    - path: "packages/daemon/src/api/routes/actions.ts"
      provides: "Post-pipeline bridge_status enrollment + metadata persistence"
      contains: "bridgeStatus"
    - path: "packages/daemon/src/__tests__/actions-staking-integration.test.ts"
      provides: "Integration tests verifying both gaps are closed"
      min_lines: 80
  key_links:
    - from: "packages/daemon/src/api/routes/actions.ts"
      to: "packages/daemon/src/services/async-polling-service.ts"
      via: "bridge_status='PENDING' in DB -> AsyncPollingService.pollAll() picks up"
      pattern: "bridgeStatus.*PENDING"
    - from: "packages/daemon/src/api/routes/actions.ts"
      to: "packages/daemon/src/api/routes/staking.ts"
      via: "metadata JSON with provider key -> LIKE '%providerKey%' query"
      pattern: "metadata.*provider.*action"
---

<objective>
스테이킹 파이프라인의 2가지 통합 갭을 수정하여 unstake 후 AsyncPollingService 자동 폴링과 스테이킹 포지션 조회가 실제 동작하게 한다.

Purpose: v28.4 마일스톤 감사에서 발견된 2가지 통합 갭을 수정. (1) unstake 트랜잭션 확인 후 bridge_status=PENDING 미기록으로 AsyncPollingService가 폴링 대상을 찾지 못하는 문제, (2) action provider 트랜잭션의 metadata 컬럼에 {provider, action}이 미기록되어 GET /v1/wallet/staking의 LIKE 쿼리가 빈 결과를 반환하는 문제.
Output: 수정된 actions.ts + 통합 테스트 파일
</objective>

<execution_context>
@/Users/minho.yoo/.claude/get-shit-done/workflows/execute-plan.md
@/Users/minho.yoo/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/daemon/src/api/routes/actions.ts (GAP-1 + GAP-2 수정 대상)
@packages/daemon/src/pipeline/stages.ts (Stage 1 insert 참조 -- metadata 컬럼 미사용 확인)
@packages/daemon/src/services/async-polling-service.ts (bridge_status='PENDING' 폴링 대상 쿼리 참조)
@packages/daemon/src/api/routes/staking.ts (metadata LIKE '%providerKey%' 쿼리 참조)
@packages/daemon/src/infrastructure/database/schema.ts (bridgeStatus, bridgeMetadata, metadata 컬럼 참조)
@packages/daemon/src/__tests__/api-staking.test.ts (insertStakingTx 패턴 참조)
</context>

<tasks>

<task type="auto">
  <name>Task 1: actions.ts post-pipeline bridge_status + metadata persistence</name>
  <files>packages/daemon/src/api/routes/actions.ts</files>
  <action>
actions.ts의 executeActionRoute 핸들러에서 2가지 수정:

**GAP-2 수정 (metadata persistence):**
Stage 1 (stage1Validate) 호출 직후, 파이프라인 for 루프 내에서 metadata UPDATE를 추가한다. stage1Validate가 ctx.txId를 할당한 직후(line ~357 부근, `pipelineResults.push` 전후):

```typescript
// Persist action provider metadata for staking position queries
await deps.db
  .update(transactions)
  .set({
    metadata: JSON.stringify({ provider, action }),
  })
  .where(eq(transactions.id, ctx.txId));
```

이 UPDATE는 Stage 1의 INSERT 직후에 실행되므로 안전하다. `provider`와 `action`은 이미 executeActionRoute의 상단에서 destructured 되어 있다 (line 212: `const { provider, action } = c.req.valid('param')`).

**GAP-1 수정 (bridge_status enrollment):**
async fire-and-forget 블록(line ~360 `void (async () => {`) 내에서, stage6Confirm 호출 성공 후에 unstake 액션에 대한 bridge_status 업데이트를 추가한다. stage6Confirm(ctx) 호출 직후에:

```typescript
// Enroll staking unstake transactions in async tracking
// Lido unstake -> lido-withdrawal tracker, Jito unstake -> jito-epoch tracker
if (action === 'unstake') {
  const trackerMap: Record<string, string> = {
    'lido_staking': 'lido-withdrawal',
    'jito_staking': 'jito-epoch',
  };
  const trackerName = trackerMap[provider];
  if (trackerName) {
    await deps.db
      .update(transactions)
      .set({
        bridgeStatus: 'PENDING',
        bridgeMetadata: JSON.stringify({
          tracker: trackerName,
          notificationEvent: 'STAKING_UNSTAKE_TIMEOUT',
          enrolledAt: Date.now(),
        }),
      })
      .where(eq(transactions.id, ctx.txId));
  }
}
```

주의사항:
- `bridgeStatus`와 `bridgeMetadata`는 Drizzle schema에 이미 정의되어 있다 (schema.ts line 183-184).
- `transactions` import는 이미 존재한다 (line 30).
- `eq` import도 이미 존재한다 (line 18).
- 스테이킹 프로바이더 이외의 action provider에는 bridge_status를 설정하지 않는다 (trackerMap에 없으면 skip).
- metadata UPDATE는 동기(await), bridge_status UPDATE는 비동기 블록 내에서 await (Stage 6 후).
  </action>
  <verify>
    <automated>cd /Users/minho.yoo/dev/wallet/WAIaaS && pnpm turbo run typecheck --filter=@waiaas/daemon 2>&1 | tail -5</automated>
    <manual>actions.ts에 metadata persist + bridge_status enrollment 코드가 추가되었는지 확인</manual>
  </verify>
  <done>
    - Stage 1 직후 metadata 컬럼에 {provider, action} JSON이 기록됨
    - Stage 6 직후 unstake 액션(lido_staking/jito_staking)에 대해 bridge_status='PENDING' + bridge_metadata={tracker, notificationEvent, enrolledAt}이 기록됨
    - typecheck 통과
  </done>
</task>

<task type="auto">
  <name>Task 2: 통합 테스트 -- bridge_status enrollment + metadata persistence 검증</name>
  <files>packages/daemon/src/__tests__/actions-staking-integration.test.ts</files>
  <action>
새 통합 테스트 파일을 생성하여 actions.ts의 post-pipeline 수정 사항을 검증한다.

테스트 구조: api-staking.test.ts의 기존 테스트 셋업 패턴(createDatabase, pushSchema, createApp, mockConfig, mock keyStore/adapter/adapterPool)을 따른다. 단, action route 테스트이므로 ActionProviderRegistry와 ApiKeyStore 목도 필요하다.

테스트 셋업:
1. In-memory SQLite DB + pushSchema
2. Mock adapter (estimateGas, buildTransaction, signTransaction, submitTransaction, waitForConfirmation 모두 성공 반환)
3. Mock ActionProviderRegistry with a test staking provider that returns ContractCallRequest
4. Mock ApiKeyStore (has() -> false)
5. createApp()으로 Hono app 생성
6. 테스트용 wallet 생성 + session token 발급

테스트 케이스 (최소 3개):

**Test 1: "POST /v1/actions/lido_staking/stake persists metadata with provider and action"**
- POST /v1/actions/lido_staking/stake with { params: { amount: '1.0' } }
- 파이프라인 완료 대기 (setTimeout 100ms 또는 vi.waitFor)
- DB에서 생성된 transaction 조회
- metadata 컬럼이 JSON.parse 가능하고 { provider: 'lido_staking', action: 'stake' }인지 확인
- bridgeStatus는 null (stake는 async tracking 불필요)

**Test 2: "POST /v1/actions/lido_staking/unstake sets bridge_status=PENDING after pipeline"**
- POST /v1/actions/lido_staking/unstake with { params: { amount: '1.0' } }
- 파이프라인 완료 대기
- DB에서 생성된 transaction 조회
- bridgeStatus === 'PENDING' 확인
- bridgeMetadata를 JSON.parse하여 { tracker: 'lido-withdrawal', notificationEvent: 'STAKING_UNSTAKE_TIMEOUT' } 확인
- metadata 컬럼에 { provider: 'lido_staking', action: 'unstake' } 확인

**Test 3: "POST /v1/actions/jito_staking/unstake sets bridge_status=PENDING with jito-epoch tracker"**
- POST /v1/actions/jito_staking/unstake
- bridgeMetadata에 tracker: 'jito-epoch' 확인

**Test 4: "POST /v1/actions/zerox_swap/swap does NOT set bridge_status"**
- 비-스테이킹 provider의 unstake가 아닌 일반 action은 bridgeStatus가 null인지 확인
- metadata에는 {provider, action}이 기록되는지 확인

Mock ActionProviderRegistry 구현:
- getAction(key) -> 해당 provider + action에 대한 mock entry 반환
- executeResolve(key, params, ctx) -> ContractCallRequest 반환 ({ type: 'CONTRACT_CALL', to: '0x...', calldata: '0x...', value: '0' })
- listProviders(), listActions() -> 빈 배열

Mock adapter:
- estimateGas -> 21000n
- buildContractCall -> { rawTransaction: '0x...' }
- signTransaction -> '0xsigned...'
- submitTransaction -> { txHash: '0xtxhash', status: 'submitted' }
- waitForConfirmation -> { status: 'confirmed', blockNumber: 1 }

파이프라인이 비동기(fire-and-forget)이므로, 테스트에서는 DB 폴링으로 CONFIRMED 상태 + bridge_status 확인:
```typescript
// Wait for async pipeline to complete
await vi.waitFor(async () => {
  const tx = conn.sqlite.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);
  expect(tx.status).toBe('CONFIRMED');
}, { timeout: 3000 });
```

IMPORTANT: 각 mock의 반환값은 pipeline stage가 기대하는 정확한 형태여야 한다. stages.ts의 각 단계를 확인하여 mock이 올바른 인터페이스를 구현하는지 보장한다. policyEngine은 무조건 ALLOW를 반환하는 mock을 사용한다.
  </action>
  <verify>
    <automated>cd /Users/minho.yoo/dev/wallet/WAIaaS && pnpm vitest run packages/daemon/src/__tests__/actions-staking-integration.test.ts --reporter=verbose 2>&1 | tail -20</automated>
    <manual>테스트가 모두 통과하고, 각 테스트가 GAP-1과 GAP-2를 직접적으로 검증하는지 확인</manual>
  </verify>
  <done>
    - 최소 3개 테스트가 모두 PASS
    - Test 1: stake 액션 후 metadata에 {provider, action} 존재 확인
    - Test 2: lido unstake 후 bridge_status=PENDING + bridge_metadata에 tracker='lido-withdrawal' 확인
    - Test 3: jito unstake 후 bridge_metadata에 tracker='jito-epoch' 확인
    - (선택) Test 4: 비-스테이킹 action은 bridge_status가 null
  </done>
</task>

</tasks>

<verification>
1. `pnpm turbo run typecheck --filter=@waiaas/daemon` -- 타입 에러 없음
2. `pnpm vitest run packages/daemon/src/__tests__/actions-staking-integration.test.ts` -- 모든 테스트 PASS
3. `pnpm vitest run packages/daemon/src/__tests__/api-staking.test.ts` -- 기존 테스트 회귀 없음
4. `pnpm vitest run packages/daemon/src/__tests__/async-polling-service.test.ts` -- 기존 테스트 회귀 없음
</verification>

<success_criteria>
1. actions.ts에서 action provider pipeline 실행 시 metadata 컬럼에 {provider, action} JSON이 영속화된다
2. actions.ts에서 lido_staking/jito_staking unstake pipeline 완료 후 bridge_status='PENDING' + bridge_metadata가 기록된다
3. 통합 테스트가 두 가지 갭 수정을 직접 검증한다
4. 기존 테스트에 회귀가 없다
</success_criteria>

<output>
After completion, create `.planning/phases/257-staking-pipeline-integration-fix/257-01-SUMMARY.md`
</output>
