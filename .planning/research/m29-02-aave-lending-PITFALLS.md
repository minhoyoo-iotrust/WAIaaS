# Domain Pitfalls: Aave V3 EVM Lending + Lending Framework Integration

**Domain:** DeFi Lending (Aave V3) added to existing ActionProvider-based AI wallet system
**Researched:** 2026-02-26
**Overall confidence:** HIGH (codebase integration pitfalls verified from source; Aave V3 protocol pitfalls verified from official docs + governance proposals)

---

## Critical Pitfalls

Mistakes that cause fund loss, security breaches, or require architecture-level rewrites.

---

### Pitfall C1: ERC-20 Approve Race Condition on Supply/Repay

**What goes wrong:** The Aave V3 `supply()` and `repay()` functions require the Pool contract to have ERC-20 allowance for the token being supplied/repaid. The existing multi-step pattern (Lido uses `[approveRequest, supplyRequest]`) always issues a fresh `approve()` before the action. If the approve amount is set to the exact supply amount and a previous approve was still pending (e.g., from a failed prior attempt), the user may end up with an allowance that is consumed by a front-runner or MEV bot before the actual supply transaction lands.

**Why it happens:** The ERC-20 `approve()` function has a well-documented race condition: changing an allowance from A to B can be exploited if the spender (Pool contract in this case) is not the one front-running, but an attacker watching the mempool. With USDT-like tokens that require setting allowance to 0 before setting a new non-zero value, the problem compounds -- a simple approve-then-supply 2-step sequence can revert if the current allowance is non-zero.

**Consequences:**
- Supply/repay transaction reverts (USDT-like tokens: "approve from non-zero to non-zero")
- In rare MEV scenarios, allowance is consumed without the intended supply executing
- AI agent retries create duplicate approve transactions wasting gas

**Prevention:**
1. **Check current allowance before approving.** In `resolve('supply', ...)`, call `allowance(owner, poolAddress)` on the token contract. Only include the approve step if `currentAllowance < supplyAmount`.
2. **For USDT-like tokens, use approve(0) then approve(amount) two-step pattern.** The resolve should return `[approve(0), approve(amount), supply(amount)]` when the token is known to require zero-first approval (e.g., USDT on Ethereum). Maintain a `ZERO_FIRST_APPROVE_TOKENS` list in the Aave config.
3. **Use `type(uint256).max` approval for trusted pool contracts.** Since the Aave Pool is whitelisted via CONTRACT_WHITELIST, a max approval avoids repeated approve transactions. However, this conflicts with the existing `APPROVE_AMOUNT_LIMIT` policy that blocks unlimited approvals. Resolution: the LendingProvider must check if `blockUnlimited` is true and fall back to exact-amount approval.
4. **Consider `supplyWithPermit()`.** Aave V3 supports EIP-2612 permit-based supply, removing the approve step entirely. However, this requires the underlying token to support EIP-2612 (most major tokens do, but not USDT on Ethereum mainnet).

**Detection:** Monitor for failed supply/repay transactions with reason "ERC20: insufficient allowance" or "SafeERC20: approve from non-zero to non-zero allowance". Track the `approve` step success but `supply` step failure pattern.

**Phase to address:** Aave V3 Provider implementation phase (AaveV3LendingProvider.resolve)

---

### Pitfall C2: Health Factor 18-Decimal Precision Mishandling

**What goes wrong:** Aave V3's `getUserAccountData()` returns `healthFactor` as a `uint256` with 18 decimals (i.e., 1.0 is represented as `1000000000000000000n`). Developers divide by `1e18` using JavaScript floating-point arithmetic (`Number(healthFactor) / 1e18`), losing precision at the boundaries. A health factor of `1.000000000000000001` (just barely safe) could round to exactly `1.0`, and a health factor of `0.999999999999999999` (liquidatable) could also round to `1.0`.

**Why it happens:** JavaScript `Number` has 53 bits of mantissa precision (~15.9 decimal digits). A uint256 with 18 decimal places has up to 59 integer digits + 18 fractional digits, far exceeding Number precision. Naive `Number(bigint) / 1e18` loses the lower digits. The system already uses bigint arithmetic in other places (gas safety margin: `(estimatedGas * 120n) / 100n`), but developers may forget to apply the same discipline to health factor values.

**Consequences:**
- False "safe" classification when health factor is actually below 1.0
- Missed LIQUIDATION_WARNING alerts at boundary values
- Policy evaluator (LendingPolicyEvaluator) incorrectly approves a borrow that pushes HF below threshold

**Prevention:**
1. **Use bigint comparison for threshold checks.** Compare `healthFactorRaw >= threshold * 10n**18n` without converting to Number. For display purposes only, convert to Number.
2. **Define threshold constants in bigint.** `const HF_WARNING_THRESHOLD = 1_200_000_000_000_000_000n;` (1.2 in 18 decimals). Compare directly: `if (healthFactorRaw < HF_WARNING_THRESHOLD)`.
3. **In the HealthFactor API response, return both raw and decimal.** `{ healthFactorRaw: "1150000000000000000", healthFactor: 1.15, ... }`. The raw value is authoritative.
4. **Unit test boundary values explicitly.** Test with HF = `999999999999999999n` (just below 1.0), `1000000000000000000n` (exactly 1.0), `1000000000000000001n` (just above 1.0).

**Detection:** Integration tests that compare bigint-based threshold evaluation against Number-based evaluation. Any divergence is a precision bug.

**Phase to address:** Lending Framework phase (HealthFactor type definition) + Aave Provider phase (getUserAccountData parsing)

---

### Pitfall C3: Position Synchronization Drift After Failed Transactions

**What goes wrong:** The PositionTracker syncs positions every 5 minutes by calling `getPosition()` on each lending provider. Between syncs, if a supply/borrow/repay/withdraw transaction fails after broadcast (Stage 5 failure or revert), the DB still records the position based on what was expected to happen. The AI agent sees a "SUPPLY" position in the DB that does not exist on-chain, or a borrow that was never created.

**Why it happens:** The existing pipeline (6-stage) has clear state transitions: PENDING -> SIGNED -> BROADCAST -> CONFIRMED/FAILED. But the PositionTracker writes positions based on the CONFIRMED callback. If the callback is delayed or the daemon restarts between broadcast and confirmation, the position state can drift. Alternatively, if the PositionTracker's 5-minute sync encounters an RPC error, the position stays at its last known state indefinitely.

**Consequences:**
- Health factor calculated from stale position data (ghost positions inflate collateral, missing positions deflate it)
- LendingPolicyEvaluator approves a borrow based on phantom collateral
- AI agent attempts to repay a debt that was already repaid

**Prevention:**
1. **Never create position records on transaction submit.** Only create/update positions during PositionTracker sync cycles, which query on-chain state. The DB is a cache of on-chain truth, not a ledger.
2. **Mark positions with `lastSyncedAt` timestamp.** If `lastSyncedAt` is older than 2x the sync interval (10 minutes), classify the position as STALE. Never use STALE positions for health factor calculation or policy evaluation.
3. **Force sync after any lending transaction completes.** When Stage 6 confirms a lending-related transaction, trigger an immediate PositionTracker sync for that wallet (out of the normal 5-minute cycle). This collapses the drift window to near zero.
4. **RPC failure resilience.** If the sync RPC call fails, mark all positions for that wallet as STALE (do NOT delete them). Retry on next cycle. After 3 consecutive failures, emit `POSITION_SYNC_FAILED` notification.

**Detection:** Compare `defi_positions.lastSyncedAt` with current time on every health factor query. If older than threshold, log a warning and return health factor with a `stale: true` flag.

**Phase to address:** Lending Framework phase (PositionTracker sync logic) + Aave Provider phase (post-transaction sync trigger)

---

### Pitfall C4: CONTRACT_WHITELIST Not Auto-Configured for Aave Pool Contracts

**What goes wrong:** The system's default-deny CONTRACT_WHITELIST policy blocks all contract calls unless explicitly whitelisted. When a user enables the Aave provider via Admin Settings, supply/borrow/repay/withdraw transactions are silently denied by the policy engine with "contract not whitelisted" -- even though the user explicitly enabled the Aave action provider. The AI agent receives a DENIED response with no clear indication that the Aave Pool contract needs manual whitelisting.

**Why it happens:** The existing provider-trust bypass (`actions.aave_v3_enabled = true` in settings) skips CONTRACT_WHITELIST for trusted action providers (see `database-policy-engine.ts:1044`). However, the approve step uses type `CONTRACT_CALL` to the ERC-20 token contract, NOT to the Aave Pool. The token contract is NOT automatically whitelisted, so the approve step in the `[approve, supply]` sequence is denied.

**Consequences:**
- All Aave supply/repay operations fail at the approve step
- User must manually whitelist every ERC-20 token contract they want to supply -- counter-intuitive DX
- The AI agent cannot self-serve; requires human Admin configuration

**Prevention:**
1. **The approve step in multi-step resolve must carry `actionProvider` metadata.** When `resolve('supply', ...)` returns `[approveRequest, supplyRequest]`, BOTH requests must include `{ actionProvider: 'aave_v3' }` so the provider-trust bypass applies to the approve step too.
2. **Verify this in the ActionProviderRegistry.** After `resolve()` returns, the registry currently validates each ContractCallRequest via schema. It must also inject `actionProvider` into each element of a multi-step array, not just single-element returns.
3. **Document this in the Aave skill file.** `skills/actions.skill.md` must note that enabling Aave V3 automatically trusts both Pool and token approval contracts.
4. **Test the multi-step policy bypass.** E2E test: enable Aave provider, configure SPENDING_LIMIT only (no CONTRACT_WHITELIST for tokens), execute supply. Must succeed.

**Detection:** Integration test that attempts a supply with provider-trust enabled but no explicit CONTRACT_WHITELIST for the ERC-20 token. Should pass. If it fails with "contract not whitelisted", the actionProvider annotation is broken.

**Phase to address:** Aave Provider implementation phase (resolve multi-step annotation) + ActionProviderRegistry fix (if not already propagating actionProvider to array elements)

---

### Pitfall C5: Flash Loan Amplified Liquidation via Lending Interface

**What goes wrong:** An attacker compromises an AI agent session, takes a flash loan, uses it to manipulate a thin liquidity pool's price (e.g., dump a collateral asset), which triggers a health factor drop below 1.0 on the AI agent's Aave position. A third-party liquidator then liquidates the position. The attacker profits from the liquidation bonus. Alternatively, a compromised agent itself borrows max against collateral and immediately transfers the borrowed assets out.

**Why it happens:** The WAIaaS system does not expose a `flashLoan` action (and should not), but the risk is not from the agent calling flashLoan -- it is from external actors manipulating prices that the Aave oracle feeds reference. The system's 5-minute health factor polling interval creates a window where external price manipulation goes undetected. Additionally, the existing spending limit policy evaluates the USD value at borrow time, but the borrow creates an ongoing obligation that can become under-collateralized.

**Consequences:**
- Loss of collateral + liquidation penalty (5-15% depending on asset)
- No recovery possible post-liquidation
- AI agent's wallet drained of collateral with no direct transaction evidence (liquidation is executed by a third party)

**Prevention:**
1. **Conservative LTV defaults.** Set `max_ltv_pct` to 0.6 (60%) by default, not 0.8 (80%). This provides a 20% price drop buffer before liquidation risk.
2. **LIQUIDATION_WARNING at HF 1.5, not 1.2.** The default 1.2 threshold leaves only ~16.7% price drop buffer. HF 1.5 gives ~33% buffer, appropriate for volatile assets.
3. **Dual-threshold alerts.** HF 1.5 = WARNING (informational), HF 1.2 = DANGER (escalate to APPROVAL tier), HF 1.05 = CRITICAL (auto-repay if configured, or emergency Owner notification).
4. **Never expose flash loan primitives.** The AaveV3LendingProvider must only implement supply/borrow/repay/withdraw. The `flashLoan()` and `flashLoanSimple()` Pool functions must NOT be callable through the ActionProvider interface.
5. **Borrow-to-transfer monitoring.** AutoStopService's `UNUSUAL_ACTIVITY` rule should detect the pattern: borrow(X) -> transfer(X) within the same session, as this suggests compromised agent extraction.

**Detection:** Health factor drops from > 2.0 to < 1.2 in a single sync cycle = potential external manipulation. Alert immediately. Track liquidation events on-chain (Aave emits `LiquidationCall` event) and reconcile with position state.

**Phase to address:** Monitoring phase (HealthFactorMonitor thresholds) + Policy phase (LendingPolicyEvaluator defaults) + Provider phase (restrict exposed actions)

---

## Moderate Pitfalls

Mistakes that cause degraded performance, poor DX, or require significant rework.

---

### Pitfall M1: Aave V3 Stable Rate Mode Parameter Confusion

**What goes wrong:** The `borrow()` ABI requires `interestRateMode` parameter (uint256). Developers pass `1` (stable) or forget to pass the parameter entirely, causing the transaction to revert with "STABLE_BORROWING_NOT_ENABLED" on Aave V3.2+.

**Why it happens:** Aave V3 originally supported stable rate (mode=1) and variable rate (mode=2). As of Aave v3.2 (2024 governance vote), stable rate has been fully deprecated across all active networks. The stable rate code was removed in a backwards-compatible way, but the ABI still requires the parameter. All existing Aave documentation and examples still show both options. Training data is stale on this point.

**Consequences:**
- Borrow transactions fail on all Aave V3.2+ deployments
- AI agent receives cryptic revert reason
- User confusion if UI/MCP exposes a "rate mode" option

**Prevention:**
1. **Hardcode `interestRateMode = 2n` (variable) in the AaveV3LendingProvider.** Do not expose this as a user-facing parameter.
2. **Remove rate mode from input schemas.** The `AaveBorrowInputSchema` must NOT include an `interestRateMode` field. The objective doc already notes this correctly.
3. **Add a code comment citing the governance decision.** `// Aave V3.2: stable rate fully deprecated (BGD governance 2024). Always use variable (2).`
4. **For repay(), also hardcode mode=2.** The `repay()` function requires `interestRateMode` to identify which debt token to repay. Since only variable debt exists, always use 2.

**Detection:** Unit test that verifies the encoded calldata for borrow and repay always uses `interestRateMode = 2`.

**Phase to address:** Aave Provider implementation phase (AaveV3LendingProvider.resolve for borrow/repay)

---

### Pitfall M2: aToken Rebase Makes Balance Comparisons Unreliable

**What goes wrong:** After supplying to Aave, the user receives aTokens whose `balanceOf()` increases every block due to interest accrual. The PositionTracker stores the balance at sync time, but by the next sync (5 min later), the actual on-chain balance is slightly higher. Comparisons like "did the position change?" always return true because the balance drifted by accrued interest, causing unnecessary DB writes and false "position changed" events.

**Why it happens:** aTokens use a scaled balance model: `actualBalance = scaledBalance * liquidityIndex`. The `liquidityIndex` increases every time anyone interacts with the reserve. Calling `balanceOf()` returns the current actual balance (principal + accrued interest), which changes with every block. This makes naive equality comparison useless for detecting real position changes (e.g., new supply, withdrawal) vs. normal interest accrual.

**Consequences:**
- Every 5-minute sync cycle triggers unnecessary DB updates for all aToken positions
- SQLite write contention from continuous "phantom" updates (see previous research Pitfall C2 on write contention)
- `POSITION_UPDATED` events flood the notification system with irrelevant interest accrual updates
- Position history becomes useless -- every entry shows a tiny increase

**Prevention:**
1. **Store scaled balance, not actual balance.** Query `scaledBalanceOf(user)` on the aToken contract instead of `balanceOf(user)`. The scaled balance only changes on actual supply/withdraw operations, not from interest accrual. Store `scaledBalance` + `liquidityIndex` in the position metadata.
2. **Use a threshold for "meaningful change" detection.** Define a minimum delta (e.g., 0.1% of position value) below which changes are treated as interest accrual and do NOT trigger DB updates or notifications. `if (abs(newAmount - oldAmount) / oldAmount < 0.001) skip;`
3. **Separate display value from tracked value.** The API response should compute `displayBalance = scaledBalance * currentLiquidityIndex` in real-time. The DB stores the stable `scaledBalance` for change detection.
4. **Debt tokens have the same behavior.** Variable debt token (`variableDebtToken.balanceOf()`) also changes every block. Apply the same scaled balance strategy using `scaledBalanceOf()`.

**Detection:** Monitor the defi_positions table write frequency. If every sync cycle writes to every position, the rebase tracking is not filtered.

**Phase to address:** Lending Framework phase (PositionTracker sync logic) + Aave Provider phase (aToken/debtToken query strategy)

---

### Pitfall M3: Multi-Chain Contract Address Hardcoding Maintenance Burden

**What goes wrong:** Aave V3 is deployed on 10+ EVM chains, each with different contract addresses for Pool, PoolDataProvider, PriceOracle, and individual aToken/debtToken contracts. Hardcoding all addresses in `aave-contracts.ts` creates a large static mapping that must be manually updated when Aave deploys to new chains or when governance updates contract implementations.

**Why it happens:** Each Aave market on each chain has unique contract addresses. Even on the same chain, different markets (e.g., Ethereum main market vs. Ethereum GHO market) have different Pool contracts. The `PoolAddressesProvider` contract exists on each chain to dynamically resolve addresses, but calling it requires an RPC call, and the PoolAddressesProvider address itself must still be known per-chain.

**Consequences:**
- Missing or outdated addresses cause silent failures on specific chains
- Maintenance burden grows linearly with supported chain count
- Address typos are undetectable until runtime (no compile-time verification)

**Prevention:**
1. **Use PoolAddressesProvider for dynamic resolution.** Hardcode only the PoolAddressesProvider address per chain (single address per chain, rarely changes). Call `getPool()`, `getPriceOracle()`, `getPoolDataProvider()` at provider initialization to resolve other addresses. Cache the results.
2. **Known PoolAddressesProvider addresses (from official Aave docs):**
   - Ethereum: `0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e`
   - Polygon: `0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb`
   - Arbitrum: `0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb`
   - Optimism: `0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb`
   - Base: `0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D`
3. **Validate resolved addresses at startup.** After resolving Pool address from PoolAddressesProvider, call `Pool.ADDRESSES_PROVIDER()` and verify it matches. This confirms the address chain is consistent.
4. **Store resolved addresses in Admin Settings cache.** `aave_v3.pool_address.<network>` = resolved address. Eliminates repeated RPC calls. Invalidate on daemon restart.
5. **Fall back gracefully.** If PoolAddressesProvider call fails (chain not supported), disable Aave for that network with a clear log message rather than crashing.

**Detection:** Startup log should print all resolved Aave contract addresses per enabled network. Missing networks are immediately visible.

**Phase to address:** Aave Provider implementation phase (AaveContractHelper initialization)

---

### Pitfall M4: LendingPolicyEvaluator and HealthFactorMonitor Threshold Mismatch

**What goes wrong:** The LendingPolicyEvaluator sets `max_ltv_pct = 0.8` (rejects borrows that would push LTV above 80%), while the HealthFactorMonitor triggers LIQUIDATION_WARNING at `health_factor = 1.2`. These two settings appear independent but are mathematically related via the liquidation threshold. A borrow approved at 80% LTV may have a health factor of exactly 1.03 (since HF = liquidationThreshold / LTV, and WETH liquidation threshold is 0.825). This means the policy approved a borrow that is immediately in DANGER zone.

**Why it happens:** LTV and health factor are inverses scaled by the liquidation threshold: `healthFactor = liquidationThreshold / currentLTV`. Aave's `liquidationThreshold` varies per asset (WETH: 0.825, USDC: 0.80, DAI: 0.80). If the policy evaluator only checks max LTV without factoring in the asset-specific liquidation threshold, it can approve borrows that are immediately dangerous.

**Consequences:**
- Borrow approved by policy, immediately followed by LIQUIDATION_WARNING notification
- Confusing UX: "You approved my borrow but now warn me I'm in danger?"
- If warning thresholds are not aggressive enough, the borrow could be immediately liquidatable

**Prevention:**
1. **Derive policy LTV from monitor thresholds.** `maxAllowedLTV = liquidationThreshold / warningHF`. For WETH (threshold=0.825) and warning at HF 1.5: `maxLTV = 0.825 / 1.5 = 0.55`. This ensures every approved borrow starts above the warning zone.
2. **Make LendingPolicyEvaluator asset-aware.** The evaluator must know each asset's liquidation threshold (from Aave's PoolDataProvider `getReserveConfigurationData()`). Reject borrows where projected HF < warning threshold, not just projected LTV > max LTV.
3. **Single source of truth for thresholds.** Admin Settings should have `aave_v3.health_factor_warning_threshold = 1.5` and derive the max LTV per asset from it, rather than having two independent settings that can desynchronize.
4. **Pre-borrow health factor projection.** Before approving a borrow, compute the projected health factor: `projectedHF = (totalCollateral * liquidationThreshold) / (totalDebt + newBorrowAmount)`. Reject if `projectedHF < warningThreshold`.

**Detection:** Test: set max_ltv_pct = 0.8, supply ETH collateral, borrow to exactly 80% LTV. Assert that health factor is checked and if HF < warning threshold, the borrow is rejected regardless of LTV passing.

**Phase to address:** Lending Framework phase (LendingPolicyEvaluator design) + Monitoring phase (threshold coordination)

---

### Pitfall M5: Isolation Mode and E-Mode Silently Restricting Operations

**What goes wrong:** An AI agent supplies an isolation-mode asset (e.g., a newer token) as collateral on Aave V3. It then tries to borrow a non-stablecoin asset and fails with an opaque revert. Or it supplies a stablecoin, enters E-Mode for higher capital efficiency, then tries to supply a non-correlated asset as collateral and fails. The AI agent retries repeatedly, wasting gas.

**Why it happens:** Aave V3 has two advanced modes that restrict operations:
- **Isolation Mode:** Assets flagged as "isolated" can only be used to borrow specific stablecoins up to a debt ceiling. If an isolated asset is the only collateral, non-stablecoin borrows revert.
- **E-Mode (Efficiency Mode):** Increases LTV/liquidation threshold for correlated asset pairs (e.g., stablecoin-only). Once in E-Mode, borrowing is restricted to the E-Mode category.

**Consequences:**
- Borrow transactions silently revert with generic error
- AI agent wastes gas on repeated failed attempts
- User confusion about why certain borrows fail while others succeed

**Prevention:**
1. **Query asset isolation and E-Mode status before borrow.** Call `getReserveConfigurationData()` to check if the supplied collateral is an isolated asset. Check `getUserEMode()` to see if the wallet is in an E-Mode category.
2. **Return structured errors from resolve().** When a borrow would fail due to isolation/E-Mode constraints, throw a descriptive ChainError: `LENDING_ISOLATION_MODE_RESTRICTION: "Cannot borrow {asset} with isolated collateral. Only stablecoins allowed."` or `LENDING_EMODE_RESTRICTION: "Cannot borrow {asset} in E-Mode category {N}."`.
3. **Expose mode status in getPosition().** The LendingPositionSummary should include `isIsolated: boolean` and `eMode: number | null` so the AI agent can reason about constraints before attempting borrows.
4. **Document in skill file.** `skills/actions.skill.md` must explain isolation mode and E-Mode restrictions so AI agents can avoid invalid requests.

**Detection:** Test: supply an isolated asset, attempt to borrow ETH. Assert a descriptive error (not a raw revert). Test: enter E-Mode for stablecoins, attempt to borrow ETH. Assert descriptive error.

**Phase to address:** Aave Provider implementation phase (pre-borrow validation in resolve)

---

### Pitfall M6: SPENDING_LIMIT Evaluates Supply as "Spending" But Supply Is Not Outflow

**What goes wrong:** The existing SPENDING_LIMIT policy evaluates the USD value of every transaction, including Aave supply. A user with a $10,000 daily spending limit supplies $8,000 USDC to Aave. The policy correctly lets it through (under limit). The user then tries to transfer $3,000 USDC and is denied -- they've "spent" $11,000 today. But the supply is not spending -- the $8,000 is still the user's asset (as aUSDC). The cumulative spending counter inflated by supply/repay amounts that are not actual outflows.

**Why it happens:** Lending actions resolve to `CONTRACT_CALL` requests with a value. The pipeline's Stage 2 (policy) evaluates `CONTRACT_CALL` amount against SPENDING_LIMIT like any other outgoing transaction. Supply and repay move tokens TO a protocol contract, which looks like spending to the policy engine, but the user retains economic ownership via aTokens.

**Consequences:**
- Spending limits exhausted by non-spending lending operations
- Users unable to make actual transfers after large supply/repay operations
- Confusing policy behavior -- "I still own my money, why is my limit used up?"

**Prevention:**
1. **Classify lending actions separately from general spending.** The LendingPolicyEvaluator should intercept supply/repay actions BEFORE they reach SPENDING_LIMIT evaluation. Supply and repay should NOT count toward cumulative spending limits.
2. **Use the `actionProvider` metadata on ContractCallRequest.** When `actionProvider = 'aave_v3'` and action is `supply` or `repay`, skip SPENDING_LIMIT evaluation for cumulative counters. Still apply tier classification (DELAY/APPROVAL) for risk management.
3. **Borrow SHOULD count as spending.** Borrowed funds are available for transfer, so they represent real new spending capacity. `borrow` actions should count toward SPENDING_LIMIT.
4. **Withdraw SHOULD NOT count.** Withdrawing from Aave returns the user's own assets. It should not count as spending either.
5. **Define a clear classification table:**

| Action   | Counts as Spending | Rationale |
|----------|-------------------|-----------|
| supply   | NO                | User retains ownership via aToken |
| borrow   | YES               | Creates new spendable funds + debt |
| repay    | NO                | Reduces debt, not new outflow |
| withdraw | NO                | Returns own assets |

**Detection:** Integration test: supply $10,000, check cumulative spending counter. It should NOT increase. Then borrow $5,000, check -- it SHOULD increase.

**Phase to address:** Lending Framework phase (LendingPolicyEvaluator spending classification) + Policy Engine integration

---

### Pitfall M7: Liquidation Detection Timing Gap (5-Minute Polling)

**What goes wrong:** The HealthFactorMonitor uses the existing BalanceMonitorService pattern (5-minute polling interval). During a flash crash (e.g., ETH drops 20% in 3 minutes), the health factor drops below 1.0 between two poll cycles. The user is liquidated without ever receiving a LIQUIDATION_WARNING notification. The first notification they receive is a stale "safe" status update, followed by discovering their position was liquidated.

**Why it happens:** The existing BalanceMonitorService's 5-minute interval is adequate for LOW_BALANCE alerts (which are informational, not time-critical). Health factor monitoring is fundamentally different -- liquidation is irreversible and happens the instant HF < 1.0 (MEV bots liquidate within seconds). A 5-minute polling gap is an eternity in DeFi.

**Consequences:**
- Liquidation without any prior warning
- No opportunity for automated protective actions (repay, add collateral)
- User trust destruction ("You were supposed to warn me!")

**Prevention:**
1. **Implement the adaptive polling design from Phase 269.** This is already designed:
   - HF > 2.0: 5-minute polling (safe)
   - HF 1.5-2.0: 1-minute polling (warning)
   - HF 1.2-1.5: 15-second polling (danger)
   - HF < 1.2: 5-second polling (critical)
2. **Event-driven price monitoring.** When the existing PriceOracle detects a price change > 5% for any collateral asset, trigger an immediate health factor re-check for all wallets holding that asset as collateral. This bridges the polling gap during flash crashes.
3. **On-chain event monitoring for LiquidationCall.** Subscribe to Aave's `LiquidationCall(collateralAsset, debtAsset, user, ...)` event via the existing IncomingTxMonitorService pattern. If the user's address appears, immediately mark the position as LIQUIDATED and notify.
4. **Pre-compute "price drop to liquidation."** For each position, calculate how much the collateral price must drop to reach HF = 1.0. Display this in the API: `{ priceDropToLiquidation: "18.5%" }`. This gives the AI agent proactive information.

**Detection:** Track the time between the last "safe" poll and the on-chain liquidation event timestamp. If the gap exceeds the adaptive polling interval for the position's last known severity, the polling was too slow.

**Phase to address:** Monitoring phase (HealthFactorMonitor implementation with adaptive polling) -- MUST use Phase 269 design, not the simpler BalanceMonitorService pattern.

---

## Minor Pitfalls

Mistakes that cause inconvenience, minor bugs, or confusing behavior.

---

### Pitfall L1: getUserAccountData Base Currency Is ETH-Denominated (Not USD)

**What goes wrong:** Developers assume `totalCollateralBase` and `totalDebtBase` from `getUserAccountData()` are USD values. On Aave V3 for EVM chains, the base currency is typically ETH (Ethereum mainnet) or the chain's native asset. Values are in base currency units with 8 decimals, not USD with 18 decimals.

**Why it happens:** The variable name `totalCollateralBase` suggests a "base" denomination without specifying the currency. On Ethereum, the base is ETH (with 8 decimals, not 18). On L2s like Arbitrum/Optimism, the base might also be ETH. Developers who see "1500000000000" assume USD (15,000 with 8 decimals = $15,000) when it might be ETH (0.000015 ETH -- meaningless).

**Consequences:**
- Incorrect USD conversion in the health factor API response
- Position values displayed in wrong units
- AI agent makes incorrect borrow/supply decisions based on wrong collateral valuation

**Prevention:**
1. **Use Aave's PriceOracle to get USD conversion.** Call `getAssetPrice(asset)` for each asset individually, which returns the price in the base currency. Then convert to USD using the project's existing IPriceOracle (Pyth/CoinGecko).
2. **Alternatively, use the PoolDataProvider's `getReserveData()` for per-asset values.** This returns per-asset supply/borrow amounts in the asset's native units, which can be directly converted to USD via IPriceOracle.
3. **Document the base currency per chain in the AaveContractHelper config.**

**Detection:** Unit test: mock `getUserAccountData()` with known values, verify USD conversion matches expected output. Cross-check with independently computed per-asset sums.

**Phase to address:** Aave Provider implementation phase (AaveMarketData USD conversion)

---

### Pitfall L2: withdraw(type(uint256).max) Side Effect on Health Factor

**What goes wrong:** Aave V3's `withdraw()` accepts `type(uint256).max` as the amount parameter, meaning "withdraw everything." The AI agent requests "withdraw all USDC" and the provider passes `2^256-1`. If the user has both USDC supply AND USDC-backed borrows, withdrawing all USDC supply drops the health factor dramatically, potentially triggering immediate liquidation.

**Why it happens:** "Withdraw max" is a convenience feature, but Aave allows partial collateral withdrawal only if the remaining collateral keeps HF > 1.0. Aave will revert if the withdrawal would make HF < 1.0 (it checks within the same transaction). However, the revert wastes gas and creates a confusing error for the AI agent.

**Consequences:**
- Wasted gas on reverted transactions
- AI agent retries with the same "max" parameter repeatedly
- If the agent uses a slightly lower amount that keeps HF just above 1.0, the position becomes extremely fragile

**Prevention:**
1. **Pre-validate withdraw amounts.** Before constructing the withdraw calldata, compute the max withdrawable amount: `maxWithdraw = totalSupply - (totalDebt / liquidationThreshold * warningHF)`. This ensures the withdrawal keeps HF above the warning threshold.
2. **Translate "max" to a concrete amount in resolve().** When `amount = "max"`, call `aToken.balanceOf(user)` to get the actual amount, then apply the HF-safe cap. Pass the concrete amount to the calldata, not `uint256.max`.
3. **Add a `maxSafeWithdrawAmount` field to the positions API response.** AI agents can use this to know the safe limit without computing it themselves.

**Detection:** Test: supply $10,000 USDC, borrow $5,000 DAI, attempt withdraw max USDC. Verify that resolve() returns a capped amount, not the full supply amount.

**Phase to address:** Aave Provider implementation phase (withdraw resolve logic)

---

### Pitfall L3: Notification Spam from Health Factor Oscillation

**What goes wrong:** A position has a health factor hovering around the 1.2 warning threshold. Each 5-minute poll cycle, the HF alternates between 1.19 (below threshold, sends LIQUIDATION_WARNING) and 1.21 (above threshold, triggers recovery). The BalanceMonitorService pattern resets the cooldown on recovery, so the next drop triggers another alert. The user receives 12+ LIQUIDATION_WARNING notifications per hour.

**Why it happens:** The existing BalanceMonitorService has a 24-hour cooldown (`shouldNotify()`) that resets when the balance recovers. This works for balance alerts (balance drops are rare events). Health factors oscillate constantly around thresholds due to normal interest accrual and minor price fluctuations. The recovery-reset-alert pattern creates a feedback loop.

**Consequences:**
- Notification fatigue -- user ignores future critical alerts
- Channel rate limiting (Telegram, Discord, ntfy may throttle)
- System resource waste on notification construction and delivery

**Prevention:**
1. **Hysteresis for health factor alerts.** Alert at HF < 1.2 (drop), but only clear the alert when HF > 1.3 (recover + buffer). This prevents oscillation around the exact threshold.
2. **Minimum re-alert interval for lending.** Even after recovery, enforce a 1-hour minimum between LIQUIDATION_WARNING notifications for the same wallet (not 24 hours like balance -- that's too long for health factor).
3. **Severity escalation, not repetition.** First crossing below 1.2 = WARNING. If still below 1.2 after 15 minutes = DANGER. If below 1.05 = CRITICAL (different notification). Only send each severity level once per position per episode.
4. **Use the Phase 269 adaptive polling design, which already specifies severity zones.** The design has SAFE/WARNING/DANGER/CRITICAL zones. Only notify on zone transitions, not on every poll that finds HF below threshold.

**Detection:** Monitor notification counts per wallet per hour. If LIQUIDATION_WARNING > 3/hour for the same wallet, hysteresis is insufficient.

**Phase to address:** Monitoring phase (HealthFactorMonitor notification strategy)

---

### Pitfall L4: DB Migration for defi_positions Conflicts with Existing Schema Version

**What goes wrong:** The defi_positions table migration (designed in Phase 268) uses the next available schema version. If multiple milestones are developed in parallel or out of order, the schema version number can conflict. The existing migration chain test verifies sequential version application -- a gap or duplicate version number causes the test to fail and blocks CI.

**Why it happens:** The project uses a strict sequential migration chain (v1 -> v2 -> ... -> v24 currently). Phase 268 designed the defi_positions table but did not assign a concrete version number. If another milestone ships a migration before m29-02, the version number must be adjusted. The `migration-chain.test.ts` verifies the full chain from v1 to latest.

**Consequences:**
- CI failure from migration chain test
- If forced through, risk of applying migrations out of order in production
- Rollback complexity if version numbering is wrong

**Prevention:**
1. **Assign the schema version number at implementation time, not design time.** Check the current latest version in `schema.ts` before creating the migration file.
2. **Follow the existing pushSchema pattern.** New tables go in the 3-step order: tables -> migrations -> indexes. The migration function is added to `MIGRATIONS` array in order.
3. **Run the migration chain test locally before commit.** `pnpm --filter @waiaas/daemon test -- --grep "migration-chain"`.
4. **Include a CREATE TABLE IF NOT EXISTS guard** in the migration function for safety, but rely on the version check as the primary gate.

**Detection:** CI migration chain test failure. Also: `schema_version` table shows a gap or duplicate.

**Phase to address:** SSoT Enum + DB Migration phase (first phase of m29-02)

---

### Pitfall L5: MCP Tool Name Collision with Future Lending Providers

**What goes wrong:** MCP tools are named `waiaas_aave_supply`, `waiaas_aave_borrow`, etc. When Kamino (m29-04) and Morpho (m29-10) are added later, they need similar tools: `waiaas_kamino_supply`, `waiaas_morpho_supply`. But the AI agent has no way to discover "all supply tools" or "the best supply tool for my asset." Each provider adds 4-5 more tools, cluttering the MCP tool list.

**Why it happens:** The MCP tool auto-generation from ActionProvider uses the pattern `waiaas_{provider}_{action}`. This is correct for unique actions (Jupiter swap, LI.FI bridge) but creates redundancy for lending where multiple providers offer the same 4 actions (supply/borrow/repay/withdraw) across different protocols.

**Consequences:**
- AI agent confusion: "Should I use waiaas_aave_supply or waiaas_morpho_supply for USDC?"
- Tool list grows by 4-5 per lending protocol
- No unified "supply to the best protocol" capability

**Prevention:**
1. **Design the MCP tools now with future providers in mind.** Consider a `waiaas_lending_supply` meta-tool that accepts a `provider` parameter: `{ provider: "aave_v3", asset: "0x...", amount: "100" }`. The meta-tool routes to the correct provider.
2. **Still expose provider-specific tools for direct access.** `waiaas_aave_supply` remains available for AI agents that know exactly which protocol to use.
3. **Add a `waiaas_lending_markets` discovery tool.** Returns available lending markets across all providers with APY comparison. AI agent can then choose the best provider.
4. **Use the `getMarkets()` method on ILendingProvider for discovery.** The meta-tool queries all registered lending providers and presents a unified view.

**Detection:** Count MCP tools after m29-02 vs after m29-04 + m29-10. If the count grows by 4x the number of lending providers, the tool naming is not scaling.

**Phase to address:** MCP/SDK integration phase of m29-02 (tool naming convention)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation | Severity |
|-------------|---------------|------------|----------|
| SSoT Enum + DB Migration | L4: Migration version conflict | Assign version at implementation time, run chain test | Low |
| Lending Framework (ILendingProvider + PositionTracker) | C3: Position sync drift after failed tx | Never create positions on submit; sync from on-chain only. Force sync after tx confirmation | Critical |
| Lending Framework (LendingPolicyEvaluator) | M6: Supply counted as spending | Classify supply/repay as non-spending; only borrow counts | Moderate |
| Lending Framework (LendingPolicyEvaluator) | M4: LTV-HF threshold mismatch | Derive max LTV from HF warning threshold per asset | Moderate |
| Aave Provider (AaveV3LendingProvider) | C1: Approve race condition on supply/repay | Check allowance before approve; handle USDT zero-first pattern | Critical |
| Aave Provider (AaveV3LendingProvider) | M1: Stable rate mode parameter | Hardcode interestRateMode=2 (variable), never expose to user | Moderate |
| Aave Provider (AaveContractHelper) | M3: Multi-chain address hardcoding | Use PoolAddressesProvider for dynamic resolution, hardcode only PAP address | Moderate |
| Aave Provider (AaveV3LendingProvider) | M5: Isolation/E-Mode silent failures | Pre-validate borrow constraints, return descriptive ChainErrors | Moderate |
| Health Factor Monitoring | C2: 18-decimal precision | Use bigint comparison for thresholds, define constants in bigint | Critical |
| Health Factor Monitoring | M7: Liquidation detection timing | Adaptive polling from Phase 269 design (5s-5min), event-driven price triggers | Moderate |
| Health Factor Monitoring | L3: Notification spam from oscillation | Hysteresis: alert at 1.2, clear at 1.3; severity escalation | Low |
| Pipeline Integration | C4: CONTRACT_WHITELIST blocks approve step | Propagate actionProvider to all multi-step array elements | Critical |
| Pipeline Integration | C5: Flash loan amplified liquidation | Conservative LTV defaults (60%), dual-threshold alerts, no flashLoan exposure | Critical |
| MCP/SDK Integration | L5: Tool name collision | Design meta-tools (waiaas_lending_supply) + provider-specific tools | Low |
| Admin UI (Portfolio View) | M2: aToken rebase makes comparisons unreliable | Store scaled balance, use threshold for change detection | Moderate |
| REST API | L1: Base currency not USD | Use per-asset PriceOracle, not getUserAccountData base values | Low |

---

## Integration Pitfalls with Existing System

These are unique to adding lending to the WAIaaS system, not general Aave pitfalls.

### INT-1: EventBus LIQUIDATION_WARNING Must Be Added to All 4 Notification Channels

**What goes wrong:** The new `LIQUIDATION_WARNING` event type is added to `NOTIFICATION_EVENT_TYPES` SSoT but not to `EVENT_CATEGORY_MAP`, `message-templates`, or all 4 channel handlers (Telegram/Discord/ntfy/Slack). Some channels silently drop the notification.

**Prevention:** Follow the existing notification event addition pattern:
1. Add to `NOTIFICATION_EVENT_TYPES` in `packages/core/src/enums/notification.ts`
2. Add to `EVENT_CATEGORY_MAP` in signing-protocol.ts (new `defi_monitoring` category)
3. Add message template in `message-templates.ts` (en + ko i18n)
4. Verify all 4 channels handle the new category (they should via the generic handler, but test)

**Phase to address:** SSoT Enum phase

### INT-2: Kill Switch Must Stop HealthFactorMonitor

**What goes wrong:** Kill Switch transitions to SUSPENDED/LOCKED state, stopping the pipeline and BalanceMonitorService. But the HealthFactorMonitor continues running, sending LIQUIDATION_WARNING notifications for positions that the user can no longer act on (all transactions blocked by Kill Switch).

**Prevention:** Register HealthFactorMonitor in the daemon's Kill Switch cascade (step 4 of the 6-step cascade). When Kill Switch activates, call `healthFactorMonitor.stop()`. When Kill Switch deactivates, call `healthFactorMonitor.start()`.

**Phase to address:** Monitoring phase (daemon lifecycle integration)

### INT-3: Admin Settings `aave_v3.enabled = false` Must Disable Monitoring Too

**What goes wrong:** Admin disables Aave V3 via settings. The AaveV3LendingProvider stops accepting actions, but the HealthFactorMonitor still polls Aave positions, sending alerts for a disabled protocol. Or worse, the PositionTracker still syncs Aave positions, consuming RPC credits.

**Prevention:** When `aave_v3.enabled` changes to `false` via HotReloadOrchestrator:
1. Unregister AaveV3LendingProvider from ActionProviderRegistry
2. Stop PositionTracker sync for Aave positions
3. Keep HealthFactorMonitor running for existing positions (user still has on-chain positions even if provider is disabled) -- but mark as "provider disabled, manual intervention needed" in notifications
4. Alternatively: continue monitoring but stop allowing new actions. This is the safer choice.

**Phase to address:** Monitoring phase + Admin Settings hot-reload integration

---

## Sources

### HIGH confidence (official documentation, codebase analysis)
- [Aave V3 Pool Smart Contract Documentation](https://aave.com/docs/aave-v3/smart-contracts/pool) -- supply/borrow/repay/withdraw/getUserAccountData ABI, parameter specifications
- [Aave V3 PoolAddressesProvider](https://aave.com/docs/aave-v3/smart-contracts/pool-addresses-provider) -- multi-chain address resolution architecture
- [Aave V3 aToken Documentation](https://docs.aave.com/developers/tokens/atoken) -- scaledBalanceOf, liquidity index, rebase behavior
- [BGD Full Deprecation of Stable Rate](https://governance.aave.com/t/bgd-full-deprecation-of-stable-rate/16473) -- v3.2 stable rate removal governance proposal
- [Aave V3 Isolation Mode](https://aave.com/help/supplying/isolation-mode) -- restricted borrowing for isolated assets
- [Aave Health Factor and Liquidations](https://aave.com/help/borrowing/liquidations) -- HF < 1.0 triggers liquidation
- Codebase: `packages/core/src/interfaces/action-provider.types.ts` -- IActionProvider.resolve() -> ContractCallRequest
- Codebase: `packages/daemon/src/pipeline/database-policy-engine.ts` -- 9 policy types, provider-trust bypass, spending limit evaluation
- Codebase: `packages/daemon/src/pipeline/stages.ts` -- actionProvider annotation propagation in multi-step
- Codebase: `packages/actions/src/providers/lido-staking/index.ts` -- multi-step [approve, action] pattern
- Codebase: `packages/daemon/src/services/monitoring/balance-monitor-service.ts` -- polling pattern, cooldown, recovery detection
- Phase 268 design: defi_positions table, IPositionProvider, LendingMetadataSchema
- Phase 269 design: IDeFiMonitor, HealthFactorMonitor adaptive polling, severity zones
- Phase 270 design: ILendingProvider interface, LendingPolicyEvaluator, protocol mappings

### MEDIUM confidence (verified web search + cross-referenced)
- [ERC-20 Approve Race Condition](https://github.com/code-423n4/2022-01-timeswap-findings/issues/168) -- well-documented vulnerability pattern
- [Aave Flash Loan Documentation](https://aave.com/docs/aave-v3/guides/flash-loans) -- flash loan mechanics and griefing protection
- [Aave Addresses Dashboard](https://aave.com/docs/resources/addresses) -- deployed contract addresses across chains
- [Aave V3.2 Liquid E-Modes](https://governance.aave.com/t/bgd-aave-v3-2-liquid-emodes/19037) -- v3.2 upgrade details

### LOW confidence (training data, single source)
- USDT zero-first approval requirement -- known industry pattern but exact behavior may vary by chain
- Specific PoolAddressesProvider addresses for Base -- verified for Ethereum mainnet, cross-chain addresses need runtime verification
