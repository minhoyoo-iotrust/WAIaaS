# Phase 258 Context Handoff

## Completed
- **258-01 PARTIAL**: GasCondition Zod schema, notification events, i18n messages
  - Committed: `23d2471f` on `milestone/v28.5`
  - Files: transaction.schema.ts, notification.ts, signing-protocol.ts, en.ts, ko.ts, index.ts (core)

## Remaining for 258-01
- **Pipeline Stage 3.5 gas condition check** in `packages/daemon/src/pipeline/stages.ts`
  - Insert between `stage3Policy()` and `stage4Wait()` in `pipeline.ts`
  - Logic: if `request.gasCondition` present AND `gas_condition.enabled` setting is true:
    - Check max_pending_count (DB query for GAS_WAITING count)
    - Set status='GAS_WAITING', store gasCondition+chain+network+timeout in bridgeMetadata
    - Emit TX_GAS_WAITING notification
    - Throw PIPELINE_HALTED
  - If gasCondition absent: proceed normally (backward compat)
  - Policy violation already throws before this point (line 450 POLICY_DENIED)
- **Tests**: enums.test.ts needs update for new notification events

## Remaining for 258-02
- **GasConditionTracker** (IAsyncStatusTracker) in `packages/daemon/src/pipeline/gas-condition-tracker.ts`
  - name='gas-condition', timeoutTransition='CANCELLED'
  - checkStatus: parse gasCondition from metadata, query RPC for gas price, compare
  - EVM: JSON-RPC eth_gasPrice + eth_maxPriorityFeePerGas (use raw fetch, no adapter dependency)
  - Solana: JSON-RPC getRecentPrioritizationFees (use raw fetch)
  - RPC URL from metadata (stored at GAS_WAITING entry time)
  - Timeout check via metadata.gasConditionCreatedAt + timeout
- **AsyncPollingService modification**:
  - Add `resumePipeline?(txId: string, walletId: string): void` to AsyncPollingCallbacks
  - In processResult COMPLETED case: detect gas-condition (need to pass tx.status through)
  - For gas-condition COMPLETED: emit TX_GAS_CONDITION_MET, call resumePipeline, DON'T release reservation
- **Settings**: 5 keys in SETTING_DEFINITIONS + 'gas_condition' category
  - gas_condition.enabled (true), poll_interval_sec (30), default_timeout_sec (3600), max_timeout_sec (86400), max_pending_count (100)
- **Daemon lifecycle**:
  - Register GasConditionTracker in Step 4f-4 (after staking trackers)
  - Add `executeFromStage4(txId, walletId)` method (similar to executeFromStage5)
  - Wire resumePipeline callback to executeFromStage4

## Remaining for Phase 259 (Plan + Execute)
- Plan 259-01: REST API gasCondition field + Admin Settings 5 keys + Admin UI Gas Condition section
- Plan 259-02: MCP + SDK + ActionProvider gasCondition integration + Skill file update
- Key files: packages/daemon/src/api/routes/*.ts, packages/admin/src/pages/system.tsx, packages/mcp/, packages/sdk/, skills/transactions.skill.md

## Architecture Key Points
- GAS_WAITING status already exists in TRANSACTION_STATUSES enum (v23 migration)
- AsyncPollingService already queries for status='GAS_WAITING' and maps to 'gas-condition' tracker
- idx_transactions_gas_waiting partial index already exists in DB
- Pipeline context has settingsService available (ctx.settingsService)
- Pipeline halting pattern: throw WAIaaSError('PIPELINE_HALTED') (same as DELAY/APPROVAL)
- executeFromStage5 pattern in daemon.ts (line ~1390) is the template for executeFromStage4
