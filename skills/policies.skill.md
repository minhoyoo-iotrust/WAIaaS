---
name: "WAIaaS Policies"
description: "Policy queries: view applied spending limits, whitelists, time restrictions, and access controls"
category: "api"
tags: [wallet, blockchain, policies, security, waiass]
version: "2.6.0-rc"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS Policy Queries

> AI agents must NEVER request the master password. Use only your session token.

> 정책 CRUD(생성/수정/삭제)는 관리자 전용입니다. docs/admin-manual/policy-management.md 를 참조하세요.

Policy reference for AI agents. Agents can query applied policies via GET endpoints with sessionAuth, but cannot create, modify, or delete policies.

## Base URL

```
http://localhost:3100
```

## Permissions

### Agent (sessionAuth)
- **GET /v1/policies** -- Query policies applied to own wallet (filtered by session wallet)

---

## 1. Query Policies

### GET /v1/policies -- List Applied Policies (sessionAuth)

Returns policies applied to the session's wallet + global policies.

```bash
curl -s 'http://localhost:3100/v1/policies' \
  -H 'Authorization: Bearer <token>'
```

**Response (200):** Array of policy objects, ordered by priority descending.

```json
[
  {
    "id": "<policy-uuid>",
    "walletId": "<wallet-uuid>",
    "type": "SPENDING_LIMIT",
    "rules": {"instant_max": "100000000", "notify_max": "500000000", "delay_max": "1000000000"},
    "priority": 0,
    "enabled": true,
    "network": null,
    "createdAt": 1707000000,
    "updatedAt": 1707000000
  }
]
```

---

## 2. Policy Types Reference (16 Types)

Each policy type has a specific `rules` schema. This is a read-only reference for agents to understand which policies apply to them.

### a. SPENDING_LIMIT

Maximum spend per tier. Amounts are digit strings in the chain's smallest unit.

- `instant_max`: Max for INSTANT tier (immediate execution)
- `notify_max`: Max for NOTIFY tier (execute + notify)
- `delay_max`: Max for DELAY tier (cooldown wait)
- `instant_max_usd` / `notify_max_usd` / `delay_max_usd`: USD-based thresholds (oracle)
- `daily_limit_usd` / `monthly_limit_usd`: Cumulative rolling window limits
- `token_limits`: Per-token limits in human-readable units, keyed by CAIP-19

Tier assignment: Amount <= instant_max -> INSTANT, <= notify_max -> NOTIFY, <= delay_max -> DELAY, > delay_max -> APPROVAL.

### b. WHITELIST

Allowed recipient addresses. Transfers to unlisted addresses are blocked.

### c. TIME_RESTRICTION

Allowed time windows. Transactions outside the window are blocked.

### d. RATE_LIMIT

Maximum transactions per period (hourly, daily, weekly, monthly).

### e. ALLOWED_TOKENS

Token whitelist for TOKEN_TRANSFER. **Default deny**: unlisted tokens are blocked.

### f. CONTRACT_WHITELIST

Contract whitelist for CONTRACT_CALL. **Default deny**: unlisted contracts are blocked.

### g. METHOD_WHITELIST

Allowed contract function selectors per contract address.

### h. APPROVED_SPENDERS

Allowed spenders for APPROVE transactions. **Default deny**: unlisted spenders are blocked.

### i. APPROVE_AMOUNT_LIMIT

Maximum approval amount and unlimited approval blocking.

### j. APPROVE_TIER_OVERRIDE

Force a specific tier for all APPROVE transactions.

### k. ALLOWED_NETWORKS

Restrict which networks a wallet can use. Permissive by default.

### l. X402_ALLOWED_DOMAINS

Allowed domains for x402 payments. **Default deny**.

### m. ERC8128_ALLOWED_DOMAINS

Allowed domains for ERC-8128 HTTP signing. **Default deny**.

### n. REPUTATION_THRESHOLD

ERC-8004 reputation-based tier escalation.

### o. VENUE_WHITELIST

Allowed external venues for off-chain actions. **Default deny** when enabled.

### p. ACTION_CATEGORY_LIMIT

Per-category USD spending limits for off-chain actions.

---

## 3. Policy Evaluation Flow

When a transaction is submitted, the policy engine evaluates all applicable policies:

1. **Collect policies** -- wallet + global, sorted by priority
2. **Default deny checks** -- ALLOWED_TOKENS, CONTRACT_WHITELIST, APPROVED_SPENDERS
3. **Tier assignment** -- SPENDING_LIMIT, REPUTATION_THRESHOLD, APPROVE_TIER_OVERRIDE
4. **Constraint checks** -- WHITELIST, TIME_RESTRICTION, RATE_LIMIT, etc.
5. **Tier execution** -- INSTANT (immediate), NOTIFY (immediate + notify), DELAY (cooldown), APPROVAL (owner approval)

---

## 4. Error Reference

| Error Code | HTTP | Description |
|------------|------|-------------|
| `POLICY_VIOLATION` | 403 | Transaction violates one or more active policies. |
| `POLICY_NOT_FOUND` | 404 | Policy ID does not exist. |

---

## 5. Related Skill Files

- **transactions.skill.md** -- Transaction types and lifecycle
- **external-actions.skill.md** -- Off-chain action framework (VENUE_WHITELIST, ACTION_CATEGORY_LIMIT)
- **erc8004.skill.md** -- ERC-8004 reputation (REPUTATION_THRESHOLD)
