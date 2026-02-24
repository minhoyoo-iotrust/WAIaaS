---
phase: 254-lido-evm-staking-provider
verified: 2026-02-24T10:25:00Z
status: gaps_found
score: 4/5 success criteria verified
gaps:
  - truth: "EnvironmentType에 따라 testnet/mainnet 컨트랙트 주소가 자동 전환된다 (LIDO-06)"
    status: partial
    reason: >
      registerBuiltInProviders() factory reads settingsReader.get('environment') but
      'environment' is NOT registered in SETTING_DEFINITIONS (setting-keys.ts).
      The real SettingsService.get() throws WAIaaSError for unknown keys.
      The factory try/catch catches this throw and moves lido_staking to 'skipped'
      instead of 'loaded'. Result: in production with a real SettingsService,
      lido_staking provider fails to register whenever the factory executes.
      Integration tests do NOT catch this because they use a mock SettingsReader
      that returns '' for unknown keys (no throw).
    artifacts:
      - path: "packages/actions/src/index.ts"
        issue: "Line 131: settingsReader.get('environment') will throw WAIaaSError in production"
      - path: "packages/daemon/src/infrastructure/settings/setting-keys.ts"
        issue: "Missing 'environment' key in SETTING_DEFINITIONS"
    missing:
      - "Add { key: 'environment', category: 'daemon', configPath: 'environment', defaultValue: 'mainnet', isCredential: false } to SETTING_DEFINITIONS in setting-keys.ts"
      - "OR wrap the get('environment') call in a try/catch that falls back to 'mainnet' on WAIaaSError"
---

# Phase 254: Lido EVM Staking Provider Verification Report

**Phase Goal**: 에이전트가 ETH를 stETH로 스테이킹하고, stETH를 ETH로 출금 요청할 수 있다
**Verified**: 2026-02-24T10:25:00Z
**Status**: gaps_found
**Re-verification**: No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | executeAction('lido_stake', {amount:'1.0'})을 호출하면 ETH가 Lido submit()으로 전송되어 stETH를 수령한다 | VERIFIED | LidoStakingActionProvider.resolve('stake') returns ContractCallRequest{type:'CONTRACT_CALL', to:stETH, calldata:0xa1903eab..., value:amountWei}. 10 unit tests pass. |
| 2 | executeAction('lido_unstake', {amount:'1.0'})을 호출하면 Withdrawal Queue에 출금 요청이 생성된다 | VERIFIED | resolve('unstake') returns [approve(0x095ea7b3), requestWithdrawals(0xd669a4e2)] 2-element array. 8 integration tests pass. |
| 3 | ETH 잔고가 부족하면 INSUFFICIENT_BALANCE 에러가 반환된다 | VERIFIED | EVM adapter buildContractCall() at packages/adapters/evm/src/adapter.ts:679-685 maps RPC "insufficient funds" to ChainError('INSUFFICIENT_BALANCE', 'evm'). Existing EVM infrastructure handles this. |
| 4 | Admin Settings에서 lido_enabled를 false로 변경하면 lido 액션이 비활성화된다 | VERIFIED | 'actions.lido_staking_enabled' key in SETTING_DEFINITIONS (setting-keys.ts:176). registerBuiltInProviders() skips provider when value != 'true'. Integration test confirms. |
| 5 | 스테이킹 금액이 USD 환산되어 SPENDING_LIMIT 정책 평가를 받고, Lido 컨트랙트가 provider-trust로 자동 허용된다 | VERIFIED | CONTRACT_CALL stage maps value to amount (stages.ts:264). Provider-trust bypass in database-policy-engine.ts:1043-1049 checks actions.lido_staking_enabled and skips CONTRACT_WHITELIST. actionProvider='lido_staking' auto-tagged by executeResolve(). |

**Score**: 4/5 truths verified (SC-4 for lido_enabled toggle is verified; SC-5 provider-trust is verified; LIDO-06 environment switching has a gap that partially undermines SC-4 registration)

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/actions/src/providers/lido-staking/index.ts` | VERIFIED | 177 lines. LidoStakingActionProvider implements IActionProvider. stake/unstake resolve(). parseEthAmount(). |
| `packages/actions/src/providers/lido-staking/config.ts` | VERIFIED | 55 lines. LidoStakingConfig, LIDO_STAKING_DEFAULTS, LIDO_MAINNET_ADDRESSES, LIDO_TESTNET_ADDRESSES, getLidoAddresses(). |
| `packages/actions/src/providers/lido-staking/lido-contract.ts` | VERIFIED | 98 lines. encodeSubmitCalldata(0xa1903eab), encodeRequestWithdrawalsCalldata(0xd669a4e2), encodeApproveCalldata(0x095ea7b3). Manual ABI encoding, no viem dependency. |
| `packages/actions/src/__tests__/lido-staking.test.ts` | VERIFIED | 152 lines. 10 unit tests — all pass. |
| `packages/actions/src/index.ts` | VERIFIED | LidoStakingActionProvider exported. registerBuiltInProviders() has lido_staking factory. |
| `packages/daemon/src/infrastructure/settings/setting-keys.ts` | PARTIAL | 3 lido_staking keys added (enabled, steth_address, withdrawal_queue_address). Missing: 'environment' key needed by factory. |
| `packages/daemon/src/__tests__/lido-staking-integration.test.ts` | VERIFIED | 224 lines. 8 integration tests — all pass. Tests use mock SettingsReader (does not expose production throw bug). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/actions/src/providers/lido-staking/index.ts` | `@waiaas/core IActionProvider` | `implements IActionProvider` | WIRED | Line 68: `export class LidoStakingActionProvider implements IActionProvider` |
| `packages/actions/src/providers/lido-staking/index.ts` | `lido-contract.ts` | `import encodeSubmitCalldata, encodeRequestWithdrawalsCalldata, encodeApproveCalldata` | WIRED | Lines 21-25 import; used in resolveStake() and resolveUnstake() |
| `packages/actions/src/index.ts` | `providers/lido-staking/index.ts` | `import + re-export + registerBuiltInProviders factory` | WIRED | Lines 11, 29: imported and re-exported; factory at lines 127-146 |
| `packages/daemon/src/infrastructure/settings/setting-keys.ts` | `packages/actions/src/index.ts` | `setting keys match factory config reading pattern` | PARTIAL | 3 of 4 needed keys defined. Factory reads 'environment' (undefined key — throws in production). |
| `packages/daemon/src/infrastructure/action/action-provider-registry.ts` | `packages/daemon/src/pipeline/stages.ts` | `actionProvider auto-tag -> provider-trust bypass` | WIRED | auto-tag at registry.ts:206; stages.ts:264 passes actionProvider; policy-engine.ts:1043-1049 uses it for bypass |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LIDO-01 | 254-01 | LidoStakingActionProvider가 stake 액션으로 ETH를 stETH로 스테이킹할 수 있다 | SATISFIED | resolve('stake') returns ContractCallRequest with submit() calldata and ETH value. 10 unit tests pass. |
| LIDO-02 | 254-01 | LidoStakingActionProvider가 unstake 액션으로 stETH를 ETH로 출금 요청할 수 있다 | SATISFIED | resolve('unstake') returns [approve, requestWithdrawals] 2-element array. Unit test and integration test confirm. |
| LIDO-03 | 254-01 | Lido 컨트랙트 ABI 직접 호출로 외부 의존성 없이 submit()/requestWithdrawals() 인코딩한다 | SATISFIED | Manual ABI encoding in lido-contract.ts. Function selectors hardcoded (0xa1903eab, 0xd669a4e2, 0x095ea7b3). No viem import in provider files. |
| LIDO-04 | 254-01 | ETH 잔고 부족 시 INSUFFICIENT_BALANCE 에러를 반환한다 | SATISFIED | EVM adapter (packages/adapters/evm/src/adapter.ts:679-685) handles "insufficient funds" RPC error for contract calls. Note: lido-staking provider itself does not check balance (not its responsibility). |
| LIDO-05 | 254-02 | Admin Settings에서 lido_enabled/steth_address/withdrawal_queue_address 런타임 설정 가능하다 | SATISFIED | 3 keys in SETTING_DEFINITIONS. integration test verifies enabled toggle and address override. |
| LIDO-06 | 254-02 | EnvironmentType에 따라 testnet/mainnet 컨트랙트 주소가 자동 전환된다 | BLOCKED | getLidoAddresses() helper is correct. Factory reads settingsReader.get('environment') but 'environment' is not in SETTING_DEFINITIONS. Real SettingsService.get() throws for unknown keys. Factory try/catch catches throw, provider goes to 'skipped'. Integration test uses mock that does not throw — does not expose this bug. |
| PLCY-01 | 254-02 | 스테이킹 금액이 USD 환산되어 SPENDING_LIMIT 정책 평가를 받는다 | SATISFIED | CONTRACT_CALL pipeline maps value to amount (stages.ts:255-268). SPENDING_LIMIT evaluates amount field. Stake ContractCallRequest.value='2000000000000000000' confirmed in integration test. |
| PLCY-02 | 254-02 | Lido/Jito 컨트랙트가 CONTRACT_WHITELIST 미등록 시 정책 거부된다 | SATISFIED | database-policy-engine.ts:1056-1066 denies CONTRACT_CALL with no CONTRACT_WHITELIST policy (default deny). This applies when provider-trust is NOT active. |
| PLCY-03 | 254-02 | provider-trust 모델로 빌트인 프로바이더 컨트랙트 화이트리스트 자동 등록된다 | SATISFIED | database-policy-engine.ts:1043-1049: when actionProvider is set and actions.{provider}_enabled='true', CONTRACT_WHITELIST is bypassed. Integration test confirms actionProvider='lido_staking' auto-tagging. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/actions/src/index.ts` | 131 | `settingsReader.get('environment')` with unknown key | Blocker | In production, SettingsService.get() throws WAIaaSError for unknown keys. The lido_staking factory will fail and the provider will be silently moved to 'skipped'. LIDO-06 environment switching is dead code in production. |

---

### Human Verification Required

None required — all gaps are verifiable programmatically.

---

### Gaps Summary

**1 gap blocking full goal achievement:**

**LIDO-06 — Environment-based address switching broken in production**

The `registerBuiltInProviders()` factory for `lido_staking` reads `settingsReader.get('environment')` to determine whether to use mainnet or Holesky testnet contract addresses. However, `'environment'` is not registered as a key in `SETTING_DEFINITIONS` (setting-keys.ts). The real `SettingsService.get()` method throws `WAIaaSError('ACTION_VALIDATION_FAILED')` for any key not in `SETTING_DEFINITIONS` (settings-service.ts:61-65). The factory is wrapped in a try/catch that logs a warning and adds the provider to `skipped`. This means:

- When `lido_staking_enabled=true` in production, the `lido_staking` provider will fail to register
- The exception propagates inside the factory before the `?? 'mainnet'` null coalescing can apply
- Integration tests do not expose this because they use a mock `SettingsReader` with `get: (key) => data[key] ?? ''` (returns empty string for unknown keys, does not throw)

**Fix options (either):**
1. Add `{ key: 'environment', category: 'daemon', configPath: 'environment', defaultValue: 'mainnet', isCredential: false }` to `SETTING_DEFINITIONS` in `packages/daemon/src/infrastructure/settings/setting-keys.ts`
2. Wrap the `settingsReader.get('environment')` call in a try/catch that catches `WAIaaSError` and falls back to `'mainnet'`

This gap means SC-1 and SC-2 (stake/unstake) are only achievable in production if the `'environment'` key is added or the factory is fixed.

---

_Verified: 2026-02-24T10:25:00Z_
_Verifier: Claude (gsd-verifier)_
