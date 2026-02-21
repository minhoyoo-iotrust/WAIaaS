# Requirements: WAIaaS v27.1 Incoming Transaction Monitoring Implementation

**Defined:** 2026-02-21
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for v27.1 milestone. Each maps to roadmap phases.

### Subscription Infrastructure

- [x] **SUB-01**: IChainSubscriber 6-method interface (subscribe/unsubscribe/subscribedAddresses/connect/waitForDisconnect/destroy) defined in @waiaas/core
- [ ] **SUB-02**: SolanaIncomingSubscriber implements logsSubscribe({mentions}) + getTransaction(jsonParsed) for SOL/SPL/Token-2022 incoming detection
- [ ] **SUB-03**: EvmIncomingSubscriber implements getLogs(Transfer event) + getBlock(includeTransactions:true) for ERC-20/native ETH incoming detection
- [ ] **SUB-04**: WebSocket-to-polling automatic fallback with 3-state connection machine (WS_ACTIVE/POLLING_FALLBACK/RECONNECTING)
- [ ] **SUB-05**: Gap recovery via incoming_tx_cursors table -- reconnection after blind spot recovers missed transactions
- [ ] **SUB-06**: SubscriptionMultiplexer shares single WebSocket connection per chain:network combination
- [ ] **SUB-07**: Solana heartbeat ping (60s interval + jitter) prevents 10-minute inactivity timeout disconnection

### Data Storage

- [x] **STO-01**: DB v21 migration adds incoming_transactions table, incoming_tx_cursors table, and wallets.monitor_incoming column
- [ ] **STO-02**: IncomingTxQueue memory queue with BackgroundWorkers 5-second batch flush prevents SQLITE_BUSY under high-frequency events
- [ ] **STO-03**: 2-phase transaction status (DETECTED to CONFIRMED) with background confirmation upgrade worker
- [ ] **STO-04**: tx_hash UNIQUE constraint and Map-based in-memory dedup prevent duplicate transaction records
- [ ] **STO-05**: Retention policy worker auto-deletes records older than incoming_retention_days setting

### Query API

- [ ] **API-01**: GET /v1/wallet/incoming returns paginated incoming transactions with cursor pagination and chain/network/status/token filters
- [ ] **API-02**: GET /v1/wallet/incoming/summary returns period-based incoming totals (daily/weekly/monthly)
- [ ] **API-03**: PATCH /v1/wallet/:id accepts monitorIncoming field for per-wallet monitoring opt-in
- [ ] **API-04**: TypeScript SDK adds listIncomingTransactions() and getIncomingTransactionSummary() methods
- [ ] **API-05**: Python SDK adds list_incoming_transactions() and get_incoming_transaction_summary() methods
- [ ] **API-06**: MCP adds 2 tools (list-incoming-transactions, get-incoming-summary) bringing total to 20+
- [ ] **API-07**: Skills wallet.skill.md updated with incoming transaction section

### Events and Notifications

- [ ] **EVT-01**: EventBus emits 'transaction:incoming' and 'transaction:incoming:suspicious' events via WaiaasEventMap
- [ ] **EVT-02**: NotificationEventType adds TX_INCOMING and TX_INCOMING_SUSPICIOUS (28 to 30 total)
- [ ] **EVT-03**: 3 IIncomingSafetyRule implementations detect dust attacks, unknown tokens, and unusually large amounts
- [ ] **EVT-04**: KillSwitch SUSPENDED/LOCKED state suppresses incoming TX notifications while maintaining DB records
- [ ] **EVT-05**: Per-wallet per-event-type notification cooldown prevents spam during token airdrops and dust attacks
- [ ] **EVT-06**: i18n message templates (en/ko) for TX_INCOMING and TX_INCOMING_SUSPICIOUS notification types

### Configuration

- [ ] **CFG-01**: config.toml [incoming] section with 7 keys (enabled, mode, poll_interval, retention_days, suspicious_dust_usd, suspicious_amount_multiplier, wss_url)
- [ ] **CFG-02**: SettingsService registers 'incoming' category with 7 setting keys supporting hot-reload
- [ ] **CFG-03**: HotReloadOrchestrator handles incoming.* key changes by restarting monitor with new settings
- [ ] **CFG-04**: DaemonLifecycle Step 4c-9 initializes IncomingTxMonitorService with fail-soft pattern and proper shutdown hook
- [ ] **CFG-05**: Environment variable mapping follows WAIAAS_INCOMING_* pattern for all 7 config keys

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Detection

- **DET-01**: EVM internal transaction detection (contract-initiated ETH transfers via CALL opcode)
- **DET-02**: Cross-chain incoming TX correlation (same sender across Solana + EVM)
- **DET-03**: Token price at detection time (snapshot USD value per incoming TX)

### Admin UI

- **ADM-01**: Admin UI incoming transaction monitoring dashboard with real-time feed
- **ADM-02**: Admin UI per-wallet monitoring toggle in wallet detail page
- **ADM-03**: Admin UI suspicious transaction review panel with false-positive marking

## Out of Scope

| Feature | Reason |
|---------|--------|
| EVM internal transactions | High complexity (trace_block RPC), most providers charge extra, low value for typical use case |
| Real-time WebSocket push to clients | SSE/WebSocket API for clients adds complexity; SDK polling + MCP tools sufficient for v1 |
| Multi-daemon incoming TX dedup | Single-instance architecture; multi-instance coordination out of scope |
| Historical backfill on first enable | Gap recovery handles reconnection only; full history import is separate concern |
| Custom safety rule plugin system | 3 built-in rules sufficient; plugin system adds complexity without clear demand |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SUB-01 | Phase 224 | Complete |
| SUB-02 | Phase 225 | Pending |
| SUB-03 | Phase 225 | Pending |
| SUB-04 | Phase 225 | Pending |
| SUB-05 | Phase 226 | Pending |
| SUB-06 | Phase 226 | Pending |
| SUB-07 | Phase 225 | Pending |
| STO-01 | Phase 224 | Complete |
| STO-02 | Phase 226 | Pending |
| STO-03 | Phase 226 | Pending |
| STO-04 | Phase 226 | Pending |
| STO-05 | Phase 226 | Pending |
| API-01 | Phase 228 | Pending |
| API-02 | Phase 228 | Pending |
| API-03 | Phase 228 | Pending |
| API-04 | Phase 228 | Pending |
| API-05 | Phase 228 | Pending |
| API-06 | Phase 228 | Pending |
| API-07 | Phase 228 | Pending |
| EVT-01 | Phase 226 | Pending |
| EVT-02 | Phase 227 | Pending |
| EVT-03 | Phase 226 | Pending |
| EVT-04 | Phase 226 | Pending |
| EVT-05 | Phase 226 | Pending |
| EVT-06 | Phase 227 | Pending |
| CFG-01 | Phase 227 | Pending |
| CFG-02 | Phase 227 | Pending |
| CFG-03 | Phase 227 | Pending |
| CFG-04 | Phase 226 | Pending |
| CFG-05 | Phase 227 | Pending |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-02-21*
*Last updated: 2026-02-21 after roadmap creation*
