# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-21)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 228 - REST API + SDK + MCP

## Current Position

Phase: 228 (5 of 6 in v27.1) (REST API + SDK + MCP)
Plan: 3 of 3 in current phase
Status: Executing
Last activity: 2026-02-22 -- Completed 228-03 (MCP Tools + Skill Docs)

Progress: [##############__] 87% (14/16 plans)

## Performance Metrics

**Cumulative:** 51 milestones, 223 phases, 478 plans, 1,301 reqs, 4,396+ tests, ~145,704 LOC TS

**v27.1 Scope:** 6 phases, 16 plans, 30 requirements

## Accumulated Context

### Decisions

Recent from v27.0 design:
- IChainSubscriber는 IChainAdapter와 완전 분리 (stateless vs stateful)
- 큐 레벨 Map 기반 중복 제거는 필수 (설계 문서 "optional" 표기는 오류)
- EVM은 폴링 우선, Solana는 WebSocket 우선 (비대칭 전략)

From 224-01:
- IncomingTransaction: interface (chain-subscriber.types.ts) + Zod schema (incoming-transaction.schema.ts) 이중 정의 -- interface는 코드 계약, Zod는 검증/OpenAPI SSoT
- IncomingTransactionDto alias로 schemas/index.ts에서 이름 충돌 방지

From 224-02:
- v21 migration은 CREATE TABLE IF NOT EXISTS 사용 (pushSchema DDL 실행 순서와 호환)
- New table migrations use IF NOT EXISTS pattern (기존 v4, v5, v15, v16과 일관)

From 225-01:
- getTransaction requires explicit encoding: 'jsonParsed' in @solana/kit 6.0.1 TypeScript types
- generateId injected via constructor (DI) -- crypto.randomUUID() default, UUID v7 from Phase 226
- address() mocked as passthrough in subscriber tests for synthetic test addresses

From 225-02:
- EVM polling-first strategy: connect() no-op, waitForDisconnect() never-resolving Promise (D-06)
- 10-block cap per poll cycle (MAX_BLOCK_RANGE = 10n) prevents RPC provider limits
- Per-wallet error isolation in pollAll() -- console.warn on failure, continue other wallets

From 225-03:
- Duck-typed subscriber parameter (connect/waitForDisconnect) avoids circular dependency with IChainSubscriber
- 100ms floor clamp on calculateDelay prevents zero/negative delays from rounding

From 226-01:
- Plan's INSERT SQL had to_address and decimals columns that don't exist in DB v21 -- corrected to actual 13 columns
- generateId() called during flush() for UUID v7 time ordering at insertion time

From 226-02:
- IChainSubscriber.subscribe() takes 4 params (walletId, address, network, onTransaction) -- plan's pseudo-code had 3 params
- reconnectLoop starts after initial waitForDisconnect resolves -- avoids double-connect on addWallet
- State change guard checks entry identity before updating -- prevents stale updates after removeWallet

From 226-03:
- Confirmation worker uses block number cache per chain:network to avoid redundant RPC calls within a single cycle
- Cursor table uses wallet_id as PK with last_signature (Solana) / last_block_number (EVM) dual fields
- Retention worker uses raw SQL DELETE for efficiency (not Drizzle ORM)

From 226-04:
- SubscriberFactory type broadened to IChainSubscriber | Promise<IChainSubscriber> for async dynamic import support
- Safety rules use null-safe defaults: when price data is unavailable, rules return false (not suspicious)
- Duck-typed incomingTxMonitorService in HotReloadDeps to avoid circular imports
- 7 incoming.* setting keys registered for SettingsService/Admin UI

From 227-01:
- No `mode` config key: setting-keys.ts uses cooldown_minutes; subscriber auto-detects WS vs polling
- Config section + KNOWN_SECTIONS + setting-keys.ts triple SSoT consistency verified by cross-tests

From 227-02:
- TX_INCOMING_SUSPICIOUS categorized as security_alert in EVENT_CATEGORY_MAP (broadcast to all channels)
- TX_INCOMING categorized as transaction (standard priority-based delivery)
- EVENT_CATEGORY_MAP must be updated when NOTIFICATION_EVENT_TYPES grows (Record<NotificationEventType, ...> enforces parity)

From 228-01:
- Composite cursor uses base64url JSON {d: detectedAt, i: id} for keyset pagination
- Summary endpoint fetches all rows and aggregates in JS BigInt (no SQL SUM)
- Duck-typed incomingTxMonitorService in CreateAppDeps (consistent with 226-04 pattern)
- PriceInfo.usdPrice field for USD conversion (not .price)

From 228-02:
- Follow existing SDK patterns exactly: URLSearchParams for TS, params dict for Python
- Python models use dict literal model_config for consistency with existing models (not ConfigDict)

From 228-03:
- MCP tool param names match REST API query params exactly (token, from_address, wallet_id)
- Tool count updated from 21 to 23 in server.ts; skill file tool count updated from 18 to 23

### Blockers/Concerns

- @solana/kit logsNotifications reconnection 동작 미검증 (Phase 226에서 경험적 확인 필요)

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 228-03-PLAN.md (MCP Tools + Skill Docs)
Resume file: None
