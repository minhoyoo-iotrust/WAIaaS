---
title: "Architecture"
description: "WAIaaS internal architecture: component interactions, 6-stage transaction pipeline, chain adapters, and design decisions."
date: "2026-02-09"
section: "docs"
slug: "architecture"
category: "Technical"
---
# Architecture

WAIaaS is a self-hosted wallet daemon that sits between AI agents and blockchains. This document describes the internal architecture, component interactions, and key design decisions.

## System Overview

```mermaid
graph LR
  subgraph Interfaces
    SDK["TypeScript SDK<br>@waiaas/sdk"]
    MCP["MCP Server<br>@waiaas/mcp"]
    CLI["CLI<br>@waiaas/cli"]
    Admin["Admin UI<br>@waiaas/admin"]
    REST["REST API"]
    Skills["Skill Files<br>@waiaas/skills"]
    WalletSDK["Wallet SDK<br>@waiaas/wallet-sdk"]
    PySdk["Python SDK"]
  end

  subgraph Daemon["Daemon (@waiaas/daemon)"]
    API["API Layer"]
    Services["Service Layer"]
    Pipeline["Transaction Pipeline"]
    Infra["Infrastructure Layer"]
  end

  subgraph Blockchain
    Solana["Solana<br>(SPL / Token-2022)"]
    EVM["EVM Chains<br>(ERC-20)"]
  end

  SDK --> REST
  MCP --> REST
  CLI --> REST
  Admin --> REST
  Skills -.->|teaches agents| REST
  WalletSDK --> API
  PySdk --> REST

  REST --> API
  API --> Services
  Services --> Pipeline
  Pipeline --> Infra
  Infra --> Solana
  Infra --> EVM
```

## Monorepo Packages

The project is organized as a monorepo with 12 npm packages plus a Python SDK:

| Package | Description | Public |
|---------|-------------|--------|
| `@waiaas/core` | Shared types, Zod schemas, enums, and interfaces | Yes |
| `@waiaas/daemon` | Self-hosted wallet daemon (Hono HTTP server) | Yes |
| `@waiaas/adapter-solana` | Solana chain adapter — SPL / Token-2022 | Yes |
| `@waiaas/adapter-evm` | EVM chain adapter — Ethereum / ERC-20 via viem | Yes |
| `@waiaas/actions` | Built-in DeFi Action Providers (Jupiter, 0x, LI.FI, Lido, Jito) | Yes |
| `@waiaas/sdk` | TypeScript client library for the daemon API | Yes |
| `@waiaas/mcp` | Model Context Protocol server for AI agents | Yes |
| `@waiaas/cli` | Command-line interface for daemon management | Yes |
| `@waiaas/admin` | Preact-based Admin Web UI (bundled into daemon) | Yes |
| `@waiaas/wallet-sdk` | Wallet Signing SDK for wallet app integration | Yes |
| `@waiaas/push-relay` | Push Relay Server — bridges daemon to push services (Pushwoosh/FCM) | Yes |
| `@waiaas/skills` | Pre-built `.skill.md` instruction files for AI agents | Yes |
| `waiaas-sdk` (Python) | Python client library for the daemon API | Yes |

## Daemon Internal Architecture

The daemon follows a layered architecture:

```mermaid
graph TB
  subgraph "API Layer"
    MW["Middleware Stack"]
    Routes["Route Handlers"]
  end

  subgraph "Service Layer"
    WalletSvc["WalletService"]
    SessionSvc["SessionService"]
    PolicySvc["PolicyService"]
    NotifSvc["NotificationService"]
    KillSwitch["KillSwitchService"]
    AutoStop["AutoStopEngine"]
    PriceOracle["PriceOracleService"]
    SettingsSvc["SettingsService"]
    ActionReg["ActionProviderRegistry"]
    IncomingMon["IncomingTxMonitorService"]
    SigningSDK["SigningSdkService"]
    BalanceMon["BalanceMonitorService"]
  end

  subgraph "Pipeline Layer"
    TxPipeline["6-Stage Transaction Pipeline"]
    SignOnly["Sign-Only Pipeline"]
    DelayQueue["DelayQueue"]
    ApprovalWF["ApprovalWorkflow"]
  end

  subgraph "Infrastructure Layer"
    DB["SQLite + Drizzle ORM"]
    Keystore["Keystore (sodium-native)"]
    Config["Config (TOML + Admin Settings)"]
    TokenReg["TokenRegistry"]
    ChainAdapters["IChainAdapter<br>(Solana / EVM)"]
    Subscribers["IChainSubscriber<br>(Solana / EVM)"]
  end

  MW --> Routes
  Routes --> WalletSvc & SessionSvc & PolicySvc & ActionReg
  WalletSvc --> TxPipeline
  TxPipeline --> DelayQueue & ApprovalWF
  TxPipeline --> ChainAdapters
  PolicySvc --> PriceOracle
  NotifSvc --> KillSwitch
  IncomingMon --> Subscribers
  SigningSDK --> NotifSvc
  BalanceMon --> ChainAdapters
  ChainAdapters --> DB
  Keystore --> DB
```

### Middleware Stack

Global middleware applied to all routes (in order):

| # | Middleware | Purpose |
|---|-----------|---------|
| 1 | `requestId` | Assigns `X-Request-Id` to every request |
| 2 | `hostGuard` | Blocks non-localhost requests |
| 3 | `killSwitchGuard` | Rejects all traffic when Kill Switch is SUSPENDED/LOCKED |
| 4 | `requestLogger` | Structured request/response logging |
| 5 | `cspMiddleware` | Strict CSP headers for `/admin/*` routes |
| 6 | `errorHandler` | Global error handler converting errors to JSON |

Route-level auth middleware:

| Middleware | Header | Protects |
|-----------|--------|----------|
| `masterAuth` | `X-Master-Password` | Admin operations (wallet/policy/session CRUD) |
| `sessionAuth` | `Authorization: Bearer wai_sess_<JWT>` | Agent operations (transactions, balance, actions) |
| `ownerAuth` | `X-Owner-Signature` + `X-Owner-Message` + `X-Owner-Address` | Owner-only actions (approve/reject transactions) |

## Transaction Pipeline

The core transaction flow is a 6-stage sequential pipeline:

```mermaid
flowchart LR
  S1["Stage 1<br>Validate +<br>DB Insert"]
  S2["Stage 2<br>Auth<br>(Session)"]
  S3["Stage 3<br>Policy<br>Evaluation"]
  S4["Stage 4<br>Wait<br>(Tier Gate)"]
  S5["Stage 5<br>On-Chain<br>Execution"]
  S6["Stage 6<br>Confirmation"]

  S1 --> S2 --> S3 --> S4 --> S5 --> S6

  S4 -->|INSTANT / NOTIFY| S5
  S4 -->|DELAY| DQ["DelayQueue<br>(cooldown)"]
  S4 -->|APPROVAL| AW["ApprovalWorkflow<br>(owner sign-off)"]
  DQ --> S5
  AW --> S5
```

### Stage 5 Detail: On-Chain Execution

Stage 5 has four sub-stages with retry logic:

| Sub-stage | Operation | Retry |
|-----------|-----------|-------|
| 5a | `buildByType()` — builds unsigned transaction | STALE: rebuild with fresh blockhash/nonce (1 retry) |
| 5b | `simulateTransaction()` — dry-run validation | — |
| 5c | `signTransaction()` — decrypt key + sign | — |
| 5d | `submitTransaction()` — broadcast to network | TRANSIENT: exponential backoff 1s/2s/4s (3 retries) |

Errors are classified as `PERMANENT` (immediate fail), `TRANSIENT` (retry with backoff), or `STALE` (rebuild from 5a).

### Transaction State Machine

Transactions progress through 11 possible states:

```mermaid
stateDiagram-v2
  [*] --> PENDING: Stage 1
  PENDING --> CANCELLED: Policy denied
  PENDING --> QUEUED: DELAY tier
  PENDING --> EXECUTING: INSTANT/NOTIFY
  QUEUED --> EXECUTING: Cooldown elapsed
  QUEUED --> EXPIRED: APPROVAL timeout
  EXECUTING --> SUBMITTED: Broadcast success
  EXECUTING --> FAILED: Simulation/chain error
  SUBMITTED --> CONFIRMED: On-chain confirmed
  SUBMITTED --> FAILED: Revert/timeout
  CONFIRMED --> [*]
  FAILED --> [*]
  CANCELLED --> [*]
  EXPIRED --> [*]

  [*] --> SIGNED: Sign-only pipeline
  SIGNED --> [*]
```

### Transaction Types

7 types via `discriminatedUnion` on the `type` field:

| Type | Description |
|------|-------------|
| `TRANSFER` | Native token transfer (SOL, ETH) |
| `TOKEN_TRANSFER` | SPL / ERC-20 token transfer |
| `CONTRACT_CALL` | Smart contract interaction |
| `APPROVE` | Token approval (delegate spending) |
| `BATCH` | Multi-instruction batch (Solana only) |
| `SIGN` | Sign-only external transaction |
| `X402_PAYMENT` | x402 micropayment protocol |

## Chain Adapter Abstraction

All blockchain interactions go through the `IChainAdapter` interface (22 methods):

```mermaid
classDiagram
  class IChainAdapter {
    +chain: ChainType
    +network: NetworkType
    +connect(rpcUrl) Promise~void~
    +disconnect() Promise~void~
    +isConnected() boolean
    +getHealth() Promise~HealthInfo~
    +getBalance(address) Promise~BalanceInfo~
    +buildTransaction(request) Promise~UnsignedTransaction~
    +simulateTransaction(tx) Promise~SimulationResult~
    +signTransaction(tx, privateKey) Promise~Uint8Array~
    +submitTransaction(signedTx) Promise~SubmitResult~
    +waitForConfirmation(txHash) Promise~SubmitResult~
    +getAssets(address) Promise~AssetInfo[]~
    +estimateFee(request) Promise~FeeEstimate~
    +buildTokenTransfer(request) Promise~UnsignedTransaction~
    +getTokenInfo(tokenAddress) Promise~TokenInfo~
    +buildContractCall(request) Promise~UnsignedTransaction~
    +buildApprove(request) Promise~UnsignedTransaction~
    +buildBatch(request) Promise~UnsignedTransaction~
    +getTransactionFee(tx) Promise~bigint~
    +getCurrentNonce(address) Promise~number~
    +sweepAll(from, to, privateKey) Promise~SweepResult~
    +parseTransaction(rawTx) Promise~ParsedTransaction~
    +signExternalTransaction(rawTx, privateKey) Promise~SignedTransaction~
  }

  class SolanaAdapter {
    +chain = "solana"
    SPL / Token-2022
    @solana/kit 6.x
  }

  class EvmAdapter {
    +chain = "evm"
    ERC-20
    viem 2.x
  }

  IChainAdapter <|.. SolanaAdapter
  IChainAdapter <|.. EvmAdapter
```

## Authentication Model

WAIaaS uses a 3-tier authentication model:

```mermaid
graph TB
  subgraph "Tier 1: masterAuth"
    MA["X-Master-Password<br>(Argon2id)"]
    MA_scope["Wallet CRUD, Policy CRUD,<br>Session Management, Admin"]
  end

  subgraph "Tier 2: ownerAuth"
    OA["X-Owner-Signature<br>(Ed25519 / SIWE)"]
    OA_scope["Approve/Reject Transactions,<br>Owner Verification"]
  end

  subgraph "Tier 3: sessionAuth"
    SA["Bearer wai_sess_ JWT<br>(HS256, dual-key rotation)"]
    SA_scope["Balance, Transactions,<br>Actions, Utilities"]
  end

  MA --> MA_scope
  OA --> OA_scope
  SA --> SA_scope
```

| Tier | Who | Credential | Verification | Scope |
|------|-----|-----------|--------------|-------|
| masterAuth | Daemon operator | `X-Master-Password` header | Argon2id hash comparison | Admin: wallet/policy/session CRUD |
| ownerAuth | Fund owner | Wallet signature headers | Ed25519 (Solana) / SIWE (EVM) | Approve/reject, owner verify |
| sessionAuth | AI agent | `Bearer wai_sess_<JWT>` | JWT HS256 + DB session lookup | Transactions, balance, actions |

### Owner 3-State Model

The owner registration follows a 3-state progression:

| State | Description | APPROVAL Tier Behavior |
|-------|-------------|----------------------|
| `NONE` | No owner registered | Downgrades to DELAY |
| `GRACE` | Owner registered, unverified | Downgrades to DELAY |
| `LOCKED` | Owner verified | Full APPROVAL enforcement |

### Approval Methods

5 methods for owner approval of high-value transactions:

`sdk_push_relay` · `sdk_telegram` · `walletconnect` · `telegram_bot` · `rest`

## Policy Engine

The policy engine evaluates every transaction against configured policies before execution.

### 4-Tier USD Classification

Transactions are classified by USD value into policy tiers:

| Tier | Behavior |
|------|----------|
| `INSTANT` | Execute immediately |
| `NOTIFY` | Execute immediately, notify owner |
| `DELAY` | Hold in queue for cooldown period |
| `APPROVAL` | Require explicit owner approval |

### 12 Policy Types

| Policy Type | Description |
|-------------|-------------|
| `SPENDING_LIMIT` | 4-tier USD thresholds + cumulative daily/monthly limits |
| `WHITELIST` | Permitted destination addresses |
| `TIME_RESTRICTION` | Allowed hours and days of week |
| `RATE_LIMIT` | Max requests per time window |
| `ALLOWED_TOKENS` | Permitted token mint/contract addresses |
| `CONTRACT_WHITELIST` | Permitted contract addresses (default-deny) |
| `METHOD_WHITELIST` | Allowed contract method selectors per contract |
| `APPROVED_SPENDERS` | Permitted spender addresses for approvals |
| `APPROVE_AMOUNT_LIMIT` | Max approve amount + blockUnlimited flag |
| `APPROVE_TIER_OVERRIDE` | Force specific tier for approve transactions |
| `ALLOWED_NETWORKS` | Permitted networks for wallet transactions |
| `X402_ALLOWED_DOMAINS` | Permitted domains for x402 micropayments |

## DeFi Action Providers

DeFi operations are implemented as pluggable Action Providers via the `IActionProvider` interface:

```mermaid
graph TB
  Agent["AI Agent"] -->|"action request"| API["REST API / MCP"]
  API --> Registry["ActionProviderRegistry"]
  Registry --> Jupiter["JupiterSwapActionProvider<br>(Solana DEX)"]
  Registry --> ZeroX["ZeroExSwapActionProvider<br>(EVM DEX)"]
  Registry --> LiFi["LiFiActionProvider<br>(Cross-chain Bridge)"]
  Registry --> Lido["LidoStakingActionProvider<br>(EVM Staking)"]
  Registry --> Jito["JitoStakingActionProvider<br>(Solana Staking)"]

  Jupiter & ZeroX & LiFi & Lido & Jito -->|"ContractCallRequest"| Pipeline["Transaction Pipeline"]
```

Each provider implements `IActionProvider`:

```typescript
interface IActionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];
  resolve(actionName, params, context): Promise<ContractCallRequest | ContractCallRequest[]>;
}
```

Providers return `ContractCallRequest` objects — they never sign or submit directly. The result is re-validated by the registry before entering the standard transaction pipeline.

| Provider | Chain | External Service | Description |
|----------|-------|------------------|-------------|
| `JupiterSwapActionProvider` | Solana | Jupiter v6 API | DEX aggregator swap |
| `ZeroExSwapActionProvider` | EVM | 0x Swap API | EVM DEX aggregator swap |
| `LiFiActionProvider` | Cross-chain | LI.FI API | Cross-chain bridge + swap |
| `LidoStakingActionProvider` | EVM | Lido (on-chain) | stETH staking + withdrawal queue |
| `JitoStakingActionProvider` | Solana | Jito (on-chain) | JitoSOL SPL Stake Pool staking |

All providers are toggleable via Admin Settings (`actions.{name}_enabled`).

## Notification System

Notifications are delivered through 3 primary channels plus 1 side channel:

```mermaid
graph LR
  Events["38 Event Types<br>(6 Categories)"] --> Router["NotificationService"]
  Router --> Telegram["Telegram"]
  Router --> Slack["Slack"]
  Router --> Discord["Discord"]

  SigningSDK["SigningSdkService"] --> WalletCh["WalletNotificationChannel<br>(side channel via Push Relay)"]
```

### Event Categories

| Category | Example Events |
|----------|---------------|
| `transaction` | TX_CONFIRMED, TX_FAILED, TX_INCOMING, BRIDGE_COMPLETED |
| `policy` | POLICY_VIOLATION, CUMULATIVE_LIMIT_WARNING |
| `security_alert` | KILL_SWITCH_ACTIVATED, AUTO_STOP_TRIGGERED, TX_INCOMING_SUSPICIOUS |
| `session` | SESSION_CREATED, SESSION_EXPIRED, SESSION_EXPIRING_SOON |
| `owner` | OWNER_SET, OWNER_REMOVED, OWNER_VERIFIED |
| `system` | DAILY_SUMMARY, LOW_BALANCE, UPDATE_AVAILABLE |

**Broadcast events** (sent to ALL channels simultaneously): `KILL_SWITCH_ACTIVATED`, `KILL_SWITCH_RECOVERED`, `AUTO_STOP_TRIGGERED`, `TX_INCOMING_SUSPICIOUS`.

## Incoming Transaction Monitoring

WAIaaS monitors wallets for incoming transactions via chain-specific subscribers:

```mermaid
graph TB
  subgraph "Subscribers"
    SolSub["SolanaIncomingSubscriber<br>(WebSocket)"]
    EvmSub["EvmIncomingSubscriber<br>(Polling / WebSocket)"]
  end

  Monitor["IncomingTxMonitorService"] --> SolSub & EvmSub
  SolSub -->|"IncomingTransaction"| Monitor
  EvmSub -->|"IncomingTransaction"| Monitor
  Monitor --> DB["DB (incoming_transactions)"]
  Monitor --> Notif["NotificationService<br>(TX_INCOMING)"]
  Monitor --> Safety["3 Safety Rules"]

  Safety --> S1["Duplicate Detection"]
  Safety --> S2["Rate Limiting"]
  Safety --> S3["Suspicious TX Alert"]
```

The `IChainSubscriber` interface (6 methods):

| Method | Description |
|--------|-------------|
| `subscribe(walletId, address, network, callback)` | Start monitoring a wallet address |
| `unsubscribe(walletId)` | Stop monitoring |
| `subscribedWallets()` | List actively monitored wallets |
| `connect()` | Establish chain connection |
| `waitForDisconnect()` | Wait for graceful disconnect |
| `destroy()` | Cleanup resources |

## Key Design Decisions

- **Zod SSoT**: Zod schemas are the single source of truth. Derivation: Zod → TypeScript → OpenAPI → Drizzle → DB constraints.
- **Default-deny policy**: Tokens, contracts, and spenders are denied unless explicitly allowed.
- **Gas safety margin**: `(estimatedGas * 120n) / 100n` using bigint arithmetic.
- **Local-only by default**: `hostGuard` middleware ensures the daemon only accepts localhost connections.
- **No third-party custody**: Private keys are encrypted with sodium-native and never leave the machine.

## Related

- [Security Model](/docs/security-model/) - Detailed security architecture and policy engine
- [API Reference](/docs/api-reference/) - Complete REST API documentation
- [Self-Custody for Agents Means Self-Hosting](/blog/self-custody-means-self-hosting/) - Why self-hosted architecture matters
