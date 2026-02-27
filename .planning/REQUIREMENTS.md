# Requirements: WAIaaS v29.4 — Solana Lending (Kamino)

**Defined:** 2026-02-28
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for milestone v29.4. Each maps to roadmap phases.

### Kamino Provider (KPROV)

- [x] **KPROV-01**: KaminoLendingProvider implements ILendingProvider + IPositionProvider interfaces
- [x] **KPROV-02**: User can supply assets to Kamino market via kamino_supply action
- [x] **KPROV-03**: User can borrow assets from Kamino market via kamino_borrow action
- [x] **KPROV-04**: User can repay borrowed assets via kamino_repay action (supports "max")
- [x] **KPROV-05**: User can withdraw supplied assets via kamino_withdraw action (supports "max")
- [x] **KPROV-06**: SDK wrapper abstracts @kamino-finance/klend-sdk instruction building
- [x] **KPROV-07**: Actions resolve to Solana ContractCallRequest with correct Kamino instructions
- [x] **KPROV-08**: Borrow/withdraw actions simulate HF impact and block self-liquidation risk
- [x] **KPROV-09**: Kamino lending positions (SUPPLY/BORROW) queryable from obligation account
- [x] **KPROV-10**: Health factor calculated from Kamino obligation collateral/debt data
- [x] **KPROV-11**: Market data (APY, LTV, available liquidity) queryable per reserve

### Integration (KINT)

- [x] **KINT-01**: Provider registered in registerBuiltInProviders with actions.kamino_enabled Admin Setting
- [x] **KINT-02**: MCP auto-exposes 4 Kamino action tools via mcpExpose: true metadata
- [x] **KINT-03**: Existing get-defi-positions/get-health-factor MCP tools return Kamino data
- [x] **KINT-04**: TS/Python SDK executeAction supports Kamino actions
- [x] **KINT-05**: PositionTracker syncs Kamino positions into defi_positions table (LENDING, 5min)
- [x] **KINT-06**: HealthFactorMonitor evaluates Kamino health with adaptive polling
- [x] **KINT-07**: LendingPolicyEvaluator applies max_ltv_pct to Kamino borrow actions
- [x] **KINT-08**: Admin Settings 3 keys (kamino.enabled, kamino.market, kamino.hf_threshold) runtime configurable
- [x] **KINT-09**: Admin UI DeFi dashboard shows combined Aave + Kamino positions
- [x] **KINT-10**: actions.skill.md updated with Kamino Lending documentation

## v2 Requirements

### Kamino Advanced

- **KADV-01**: Kamino leverage strategies (multiply/one-click leverage)
- **KADV-02**: Kamino liquidity vault (automated yield management)
- **KADV-03**: Multi-market comparison dashboard in Admin UI

## Out of Scope

| Feature | Reason |
|---------|--------|
| Kamino leverage strategies | 복잡도 높음, 기본 lending 안정화 후 추가 |
| Kamino liquidity vaults | 별도 Yield 프레임워크(m29-00 DEFI-10) 범위 |
| Kamino governance/staking | DeFi lending 범위 밖 |
| Direct Solana program CPI | SDK 래퍼로 추상화, 직접 CPI 불필요 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| KPROV-01 | Phase 283 | Complete |
| KPROV-02 | Phase 283 | Complete |
| KPROV-03 | Phase 283 | Complete |
| KPROV-04 | Phase 283 | Complete |
| KPROV-05 | Phase 283 | Complete |
| KPROV-06 | Phase 283 | Complete |
| KPROV-07 | Phase 283 | Complete |
| KPROV-08 | Phase 283 | Complete |
| KPROV-09 | Phase 283 | Complete |
| KPROV-10 | Phase 283 | Complete |
| KPROV-11 | Phase 283 | Complete |
| KINT-01 | Phase 284 | Complete |
| KINT-02 | Phase 284 | Complete |
| KINT-03 | Phase 284 | Complete |
| KINT-04 | Phase 284 | Complete |
| KINT-05 | Phase 284 | Complete |
| KINT-06 | Phase 284 | Complete |
| KINT-07 | Phase 284 | Complete |
| KINT-08 | Phase 284 | Complete |
| KINT-09 | Phase 284 | Complete |
| KINT-10 | Phase 284 | Complete |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-02-28*
*Last updated: 2026-02-28 after milestone audit -- all 21 requirements complete*
