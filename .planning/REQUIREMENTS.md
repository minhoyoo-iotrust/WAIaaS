# Requirements: WAIaaS v30.6 — ERC-4337 Account Abstraction 지원

**Defined:** 2026-03-04
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for milestone v30.6. Each maps to roadmap phases.

### Smart Account

- [ ] **SA-01**: User can create smart account wallet with `accountType: "smart"` via REST API
- [ ] **SA-02**: Smart account address is predicted via CREATE2 before on-chain deployment
- [ ] **SA-03**: Smart account uses existing EOA key as signer (owner)
- [ ] **SA-04**: Wallet model stores account_type, signer_key, deployed, entry_point fields
- [ ] **SA-05**: DB migration v38 adds smart account columns to wallets table with EOA defaults
- [ ] **SA-06**: Undeployed smart account can receive ETH/token deposits at predicted address
- [ ] **SA-07**: Smart account wallet creation requires smart_account.enabled=true setting

### UserOperation Pipeline

- [ ] **UOP-01**: Pipeline routes to UserOperation path when wallet accountType is "smart"
- [ ] **UOP-02**: Pipeline routes to existing sign+sendTransaction when accountType is "eoa" (no change)
- [ ] **UOP-03**: UserOperation submitted via BundlerClient eth_sendUserOperation
- [ ] **UOP-04**: UserOperation receipt awaited via waitForUserOperationReceipt (120s timeout)
- [ ] **UOP-05**: Gas estimation uses eth_estimateUserOperationGas with 120% safety margin
- [ ] **UOP-06**: BATCH executes atomically as single UserOperation with calls[] array
- [ ] **UOP-07**: Transaction response includes atomic field (true for smart account BATCH)
- [ ] **UOP-08**: First UserOp for undeployed wallet includes initCode for lazy deployment
- [ ] **UOP-09**: Wallet deployed status updates to true after successful first deployment
- [ ] **UOP-10**: UserOperationReverted maps to TRANSACTION_REVERTED error code
- [ ] **UOP-11**: WaitForUserOperationReceiptTimeoutError maps to TRANSACTION_TIMEOUT error
- [ ] **UOP-12**: Policy evaluation applies to smart account transactions before UserOp submission
- [ ] **UOP-13**: ActionProvider resolve() output converts to UserOperation for smart account wallets

### Paymaster

- [ ] **PAY-01**: PaymasterClient sponsors gas when paymaster_url is configured
- [ ] **PAY-02**: Agent pays gas directly when paymaster_url is not configured
- [ ] **PAY-03**: Paymaster rejection returns PAYMASTER_REJECTED error code
- [ ] **PAY-04**: Per-chain Paymaster URL override via smart_account.paymaster_url.{chainId}

### Settings & DB

- [ ] **SET-01**: Admin Settings smart_account.enabled toggle (default: false)
- [ ] **SET-02**: Admin Settings smart_account.bundler_url (required for smart accounts)
- [ ] **SET-03**: Admin Settings smart_account.paymaster_url (optional)
- [ ] **SET-04**: Admin Settings smart_account.paymaster_api_key with AES-256-GCM encrypted storage
- [ ] **SET-05**: Chain-specific URL override via smart_account.{setting}.{chainId} pattern
- [ ] **SET-06**: Admin Settings smart_account.entry_point (default: EntryPoint v0.7 address)

### Interface Extension

- [ ] **INT-01**: CLI `waiaas wallet create` supports `--account-type` option (eoa|smart)
- [ ] **INT-02**: SDK `createWallet()` accepts `accountType` parameter
- [ ] **INT-03**: SDK `Wallet` type includes accountType, signerKey, deployed properties
- [ ] **INT-04**: MCP wallet_list/wallet_get responses include accountType, signerKey, deployed
- [ ] **INT-05**: Admin UI wallet creation form includes accountType selector (EOA/Smart Account)
- [ ] **INT-06**: Admin UI System page includes Smart Account (ERC-4337) settings section
- [ ] **INT-07**: wallet.skill.md updated with smart account creation guide
- [ ] **INT-08**: quickstart.skill.md updated with Smart Account quickstart

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Module System

- **MOD-01**: ERC-7579 Validator module support for custom signature verification
- **MOD-02**: ERC-7579 Executor module support for automated actions
- **MOD-03**: ERC-7579 Hook module support for pre/post execution logic
- **MOD-04**: Session key module for time-limited delegated signing

### Advanced Features

- **ADV-01**: Multi-sig smart account support (multiple signers)
- **ADV-02**: Social recovery module for account recovery
- **ADV-03**: ERC-20 gas payment (pay gas with USDC/DAI)
- **ADV-04**: Bundler failover (multiple Bundler endpoints)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Solana Account Abstraction | EVM 전용 표준 (ERC-4337). Solana는 PDA/CPI로 유사 기능 이미 제공 |
| EntryPoint v0.6 지원 | 레거시. v0.7만 지원하여 범위 한정 |
| ERC-7579 모듈 시스템 | 복잡도 높음. 기본 스마트 어카운트 안정화 후 별도 확장 |
| 커스텀 SmartAccount 구현 | viem 빌트인 Solady SmartAccount 사용. 감사 완료된 구현체 재활용 |
| Self-hosted Bundler | 외부 서비스(Pimlico/Stackup/Alchemy) URL 설정 방식. 자체 Bundler 운영 불필요 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SA-01 | Phase 314 | Pending |
| SA-02 | Phase 314 | Pending |
| SA-03 | Phase 314 | Pending |
| SA-04 | Phase 314 | Pending |
| SA-05 | Phase 314 | Pending |
| SA-06 | Phase 314 | Pending |
| SA-07 | Phase 314 | Pending |
| SET-01 | Phase 314 | Pending |
| SET-02 | Phase 314 | Pending |
| SET-03 | Phase 314 | Pending |
| SET-04 | Phase 314 | Pending |
| SET-05 | Phase 314 | Pending |
| SET-06 | Phase 314 | Pending |
| UOP-01 | Phase 315 | Pending |
| UOP-02 | Phase 315 | Pending |
| UOP-03 | Phase 315 | Pending |
| UOP-04 | Phase 315 | Pending |
| UOP-05 | Phase 315 | Pending |
| UOP-06 | Phase 315 | Pending |
| UOP-07 | Phase 315 | Pending |
| UOP-08 | Phase 315 | Pending |
| UOP-09 | Phase 315 | Pending |
| UOP-10 | Phase 315 | Pending |
| UOP-11 | Phase 315 | Pending |
| UOP-12 | Phase 315 | Pending |
| UOP-13 | Phase 315 | Pending |
| PAY-01 | Phase 315 | Pending |
| PAY-02 | Phase 315 | Pending |
| PAY-03 | Phase 315 | Pending |
| PAY-04 | Phase 315 | Pending |
| INT-01 | Phase 316 | Pending |
| INT-02 | Phase 316 | Pending |
| INT-03 | Phase 316 | Pending |
| INT-04 | Phase 316 | Pending |
| INT-05 | Phase 316 | Pending |
| INT-06 | Phase 316 | Pending |
| INT-07 | Phase 316 | Pending |
| INT-08 | Phase 316 | Pending |

**Coverage:**
- v1 requirements: 36 total
- Mapped to phases: 36
- Unmapped: 0

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-04 after roadmap creation -- traceability populated*
