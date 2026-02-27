# Requirements: WAIaaS v29.4 — Solana Lending (Kamino)

**Defined:** 2026-02-28
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for milestone v29.4. Each maps to roadmap phases.

### Kamino Provider (KPROV)

- [ ] **KPROV-01**: KaminoLendingProvider implements ILendingProvider + IPositionProvider interfaces
- [ ] **KPROV-02**: User can supply assets to Kamino market via kamino_supply action
- [ ] **KPROV-03**: User can borrow assets from Kamino market via kamino_borrow action
- [ ] **KPROV-04**: User can repay borrowed assets via kamino_repay action (supports "max")
- [ ] **KPROV-05**: User can withdraw supplied assets via kamino_withdraw action (supports "max")
- [ ] **KPROV-06**: SDK wrapper abstracts @kamino-finance/klend-sdk instruction building
- [ ] **KPROV-07**: Actions resolve to Solana ContractCallRequest with correct Kamino instructions
- [ ] **KPROV-08**: Borrow/withdraw actions simulate HF impact and block self-liquidation risk
- [ ] **KPROV-09**: Kamino lending positions (SUPPLY/BORROW) queryable from obligation account
- [ ] **KPROV-10**: Health factor calculated from Kamino obligation collateral/debt data
- [ ] **KPROV-11**: Market data (APY, LTV, available liquidity) queryable per reserve

### Integration (KINT)

- [ ] **KINT-01**: Provider registered in registerBuiltInProviders with actions.kamino_enabled Admin Setting
- [ ] **KINT-02**: MCP auto-exposes 4 Kamino action tools via mcpExpose: true metadata
- [ ] **KINT-03**: Existing get-defi-positions/get-health-factor MCP tools return Kamino data
- [ ] **KINT-04**: TS/Python SDK executeAction supports Kamino actions
- [ ] **KINT-05**: PositionTracker syncs Kamino positions into defi_positions table (LENDING, 5min)
- [ ] **KINT-06**: HealthFactorMonitor evaluates Kamino health with adaptive polling
- [ ] **KINT-07**: LendingPolicyEvaluator applies max_ltv_pct to Kamino borrow actions
- [ ] **KINT-08**: Admin Settings 3 keys (kamino.enabled, kamino.market, kamino.hf_threshold) runtime configurable
- [ ] **KINT-09**: Admin UI DeFi dashboard shows combined Aave + Kamino positions
- [ ] **KINT-10**: actions.skill.md updated with Kamino Lending documentation

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
| KPROV-01 | TBD | Pending |
| KPROV-02 | TBD | Pending |
| KPROV-03 | TBD | Pending |
| KPROV-04 | TBD | Pending |
| KPROV-05 | TBD | Pending |
| KPROV-06 | TBD | Pending |
| KPROV-07 | TBD | Pending |
| KPROV-08 | TBD | Pending |
| KPROV-09 | TBD | Pending |
| KPROV-10 | TBD | Pending |
| KPROV-11 | TBD | Pending |
| KINT-01 | TBD | Pending |
| KINT-02 | TBD | Pending |
| KINT-03 | TBD | Pending |
| KINT-04 | TBD | Pending |
| KINT-05 | TBD | Pending |
| KINT-06 | TBD | Pending |
| KINT-07 | TBD | Pending |
| KINT-08 | TBD | Pending |
| KINT-09 | TBD | Pending |
| KINT-10 | TBD | Pending |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 0
- Unmapped: 21

---
*Requirements defined: 2026-02-28*
*Last updated: 2026-02-28 after initial definition*
