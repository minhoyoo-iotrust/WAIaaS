# Security Model

WAIaaS implements defense in depth -- multiple independent security layers protect funds even if one layer is compromised.

## 3-Tier Authentication

WAIaaS separates three levels of authentication, granting each actor only the minimum required privileges.

| Auth Level | Actor | Method | Purpose |
|-----------|-------|--------|---------|
| **masterAuth** | Daemon operator | Master password (Argon2id) | System admin: wallet creation, policies, sessions, settings |
| **ownerAuth** | Fund owner | SIWS/SIWE signature (per-request) | Transaction approval, Kill Switch recovery, fund withdrawal |
| **sessionAuth** | AI agent | JWT Bearer (HS256) | Wallet queries, transaction requests |

### masterAuth

The daemon operator sets a master password during `waiaas init`. All administrative operations (wallet management, policy configuration, session issuance) require this password via the `X-Master-Password` header. The password is stored as an Argon2id hash.

### ownerAuth

The fund owner registers an external wallet address (Solana or EVM). High-value operations require a cryptographic signature from this wallet:

- **SIWS** (Sign In With Solana) for Solana wallets
- **SIWE** (Sign In With Ethereum) for EVM wallets
- **WalletConnect v2** for mobile/hardware wallet pairing with QR code
- **Telegram** as a fallback approval channel

Owner state follows a 3-state progression: NONE → GRACE → LOCKED, unlocking stricter security features as the owner registers and verifies.

### sessionAuth

AI agents receive JWT session tokens (HS256) scoped to a specific wallet. Tokens have configurable TTL, absolute lifetime, and maximum renewal count. Sessions can be revoked instantly by the daemon operator.

## 4-Tier Policy Engine

Transaction amounts (converted to USD via price oracles) automatically determine the security level.

| Tier | Default Threshold | Behavior |
|------|------------------|----------|
| **INSTANT** | <= $10 | Execute immediately |
| **NOTIFY** | <= $100 | Execute + notify owner |
| **DELAY** | <= $500 | Wait 5 minutes, auto-execute (owner can cancel) |
| **APPROVAL** | > $500 | Owner must sign to execute |

Thresholds are fully customizable via config.toml or the Admin UI.

### 12 Policy Types

| Policy Type | Description |
|-------------|-------------|
| AMOUNT_TIER | USD-based tier classification (INSTANT/NOTIFY/DELAY/APPROVAL) |
| DAILY_LIMIT | Maximum number of transactions per day |
| RATE_LIMIT | Transactions per time window |
| ALLOWED_TOKENS | Token allowlist (default-deny) |
| CONTRACT_WHITELIST | Contract address allowlist (default-deny) |
| APPROVED_SPENDERS | Approved spender addresses for approve transactions |
| RECIPIENT_WHITELIST | Allowed recipient addresses |
| TIME_WINDOW | Allowed transaction hours (e.g., business hours only) |
| MAX_GAS | Maximum gas limit per transaction |
| CUMULATIVE_USD_LIMIT | Rolling daily/monthly USD spend caps with 80% warning threshold |
| X402_ALLOWED_DOMAINS | Allowed domains for x402 automatic payments |
| ENVIRONMENT_TYPE | Testnet/mainnet environment restriction |

### USD Price Evaluation

All transactions are evaluated against USD-denominated policy thresholds regardless of token type:

- **CoinGecko** -- Primary price source with caching
- **Pyth Network** -- On-chain oracle for Solana tokens
- **Chainlink** -- On-chain oracle for EVM tokens
- **Forex rates** -- 43 fiat currency conversions via CoinGecko tether rates

Display currency support allows the Admin UI to show values in the operator's preferred fiat currency.

## Kill Switch

3-state emergency halt system for immediate fund protection:

| State | Description | Recovery |
|-------|-------------|----------|
| **ACTIVE** | Normal operation | -- |
| **SUSPENDED** | All transactions blocked, sessions active | masterAuth to resume |
| **LOCKED** | All transactions blocked, sessions frozen | masterAuth + ownerAuth (dual-auth) |

State transitions use Compare-And-Swap (CAS) for ACID guarantees. Activation triggers a 6-step cascade: block new transactions → cancel pending delays → notify all channels → log event → freeze sessions (LOCKED only) → update state.

## AutoStop Engine

4-rule automatic suspension monitors for anomalous patterns:

| Rule | Trigger | Action |
|------|---------|--------|
| Consecutive failures | N consecutive transaction failures | Suspend wallet |
| Unusual hours | Transactions outside configured time window | Suspend wallet |
| Threshold proximity | Transaction approaches tier boundary repeatedly | Suspend wallet |
| Rapid-fire | Too many transactions in short window | Suspend wallet |

Rules are configurable per wallet via Admin Settings.

## Notifications

4-channel alert system for real-time monitoring:

| Channel | Method | Features |
|---------|--------|----------|
| **Telegram** | Bot API (Long Polling) | 10 commands, 2-tier auth, i18n (en/ko), inline approval buttons |
| **Discord** | Webhook | Rich embeds with transaction details |
| **ntfy** | HTTP push | Self-hosted notification relay |
| **Slack** | Incoming Webhook | Channel-based alerts |

Events that trigger notifications: transaction execution, policy tier escalation, Kill Switch activation, AutoStop trigger, session creation/revocation, balance threshold alerts, owner approval requests.

## Audit Log

Every transaction and administrative action is recorded in SQLite with:

- Timestamp, actor, action type, target resource
- Transaction details (amount, recipient, chain, network)
- Policy evaluation results
- Authentication method used
- IP address and request metadata

## Transaction Pipeline

All transactions pass through a 6-stage pipeline with an 8-state machine:

1. **Validate** -- Schema validation, session verification
2. **Enrich** -- USD price lookup, gas estimation
3. **Policy** -- 12-type policy evaluation, tier classification
4. **Delay/Approve** -- Time delay or owner approval (if required)
5. **Sign** -- Keystore signing (sodium-native)
6. **Broadcast** -- Chain submission and confirmation

A sign-only mode is available for transactions that need signing without broadcast.
