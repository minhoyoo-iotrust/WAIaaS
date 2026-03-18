---
title: "Policy Management"
description: "WAIaaS 정책 CRUD 및 16개 정책 타입 전체 레퍼런스"
keywords: ["policy", "spending-limit", "whitelist", "rate-limit", "contract", "token", "waiaas"]
date: "2026-03-18"
section: "docs"
category: "Admin Manual"
---

# WAIaaS Policy Management

> 이 문서는 Operator(관리자)를 위한 문서입니다. AI 에이전트 접근은 sessionAuth로 제한됩니다.

정책 생성/수정/삭제 및 16개 정책 타입 전체 레퍼런스입니다. 정책은 지갑 운영에 대한 보안 규칙을 정의합니다.

## Base URL

```
http://localhost:3100
```

---

## 1. 정책 CRUD 엔드포인트

### POST /v1/policies -- 정책 생성 (masterAuth)

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{
    "walletId": "<wallet-uuid>",
    "type": "SPENDING_LIMIT",
    "rules": {"instant_max": "100000000", "notify_max": "500000000", "delay_max": "1000000000"},
    "priority": 0,
    "enabled": true
  }'
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `walletId` | UUID | No | 대상 지갑. 생략 시 글로벌 정책. |
| `type` | string | Yes | 16개 정책 타입 중 하나. |
| `rules` | object | Yes | 타입별 규칙 객체. |
| `priority` | integer | No | 높을수록 우선. 기본값: 0. |
| `enabled` | boolean | No | 활성 여부. 기본값: true. |
| `network` | string | No | 네트워크 범위 (예: `"ethereum-mainnet"` 또는 CAIP-2 `"eip155:1"`). |

### PUT /v1/policies/:id -- 정책 수정 (masterAuth)

```bash
curl -s -X PUT http://localhost:3100/v1/policies/<policy-uuid> \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"rules": {"instant_max": "200000000"}, "enabled": true}'
```

### DELETE /v1/policies/:id -- 정책 삭제 (masterAuth)

```bash
curl -s -X DELETE http://localhost:3100/v1/policies/<policy-uuid> \
  -H 'X-Master-Password: <password>'
```

---

## 2. 정책 타입 (16 Types)

### a. SPENDING_LIMIT

트랜잭션 금액에 따른 보안 티어 할당. 금액은 체인의 최소 단위(lamports, wei)의 digit string.

```json
{
  "instant_max": "100000000",
  "notify_max": "500000000",
  "delay_max": "1000000000",
  "delay_seconds": 300,
  "instant_max_usd": 10,
  "notify_max_usd": 100,
  "delay_max_usd": 1000,
  "daily_limit_usd": 500,
  "monthly_limit_usd": 5000,
  "token_limits": {
    "native:solana": {"instant_max": "1", "notify_max": "10", "delay_max": "50"}
  }
}
```

티어 할당: Amount <= instant_max -> INSTANT, <= notify_max -> NOTIFY, <= delay_max -> DELAY, > delay_max -> APPROVAL.

### b. WHITELIST

허용된 수신 주소 목록. 목록에 없는 주소로의 전송은 차단됩니다.

```json
{"allowed_addresses": ["<address1>", "<address2>"]}
```

### c. TIME_RESTRICTION

허용된 시간 창. 시간 외 트랜잭션은 차단됩니다.

```json
{"allowedHours": {"start": 9, "end": 17}, "timezone": "UTC"}
```

### d. RATE_LIMIT

기간당 최대 트랜잭션 수.

```json
{"maxTransactions": 10, "period": "hourly"}
```

### e. ALLOWED_TOKENS

TOKEN_TRANSFER 허용 토큰. **Default deny**: 목록에 없는 토큰은 차단.

```json
{"tokens": [{"address": "<mint>", "symbol": "USDC", "chain": "solana"}]}
```

### f. CONTRACT_WHITELIST

CONTRACT_CALL 허용 컨트랙트. **Default deny**: 목록에 없는 컨트랙트는 차단.

```json
{"contracts": [{"address": "<contract>", "name": "Uniswap V3 Router"}]}
```

### g. METHOD_WHITELIST

허용된 컨트랙트 함수 셀렉터.

```json
{"methods": [{"contractAddress": "<addr>", "selectors": ["0xa9059cbb"]}]}
```

### h. APPROVED_SPENDERS

APPROVE 허용 spender. **Default deny**: 목록에 없는 spender는 차단.

```json
{"spenders": [{"address": "<spender>", "name": "Uniswap Router", "maxAmount": "1000000000"}]}
```

### i. APPROVE_AMOUNT_LIMIT

최대 승인 금액 및 무제한 승인 차단.

```json
{"maxAmount": "1000000000", "blockUnlimited": true}
```

### j. APPROVE_TIER_OVERRIDE

APPROVE 트랜잭션의 보안 티어 강제 지정.

```json
{"tier": "APPROVAL"}
```

### k. ALLOWED_NETWORKS

허용 네트워크 목록. 목록에 없는 네트워크로의 트랜잭션은 차단.

```json
{"networks": [{"network": "ethereum-sepolia"}, {"network": "polygon-amoy"}]}
```

### l. X402_ALLOWED_DOMAINS

x402 자동 결제 허용 도메인. **Default deny**.

```json
{"domains": ["api.example.com", "*.openai.com"]}
```

### m. ERC8128_ALLOWED_DOMAINS

ERC-8128 HTTP 서명 허용 도메인. **Default deny**.

```json
{"domains": ["api.example.com", "*.service.io"]}
```

### n. REPUTATION_THRESHOLD

ERC-8004 온체인 평판 점수 기반 티어 에스컬레이션.

```json
{
  "min_score": 50,
  "below_threshold_tier": "APPROVAL",
  "unrated_tier": "APPROVAL",
  "check_counterparty": true
}
```

### o. VENUE_WHITELIST

오프체인 venue(거래소, 프로토콜) 허용 목록. **Default deny** (활성화 시).

```json
{"venues": ["polymarket", "hyperliquid", "0x"]}
```

활성화: Admin Settings에서 `venue_whitelist_enabled=true` 설정.

### p. ACTION_CATEGORY_LIMIT

오프체인 액션 카테고리별 USD 지출 한도.

```json
{
  "category": "defi_trading",
  "per_action": 1000,
  "daily": 5000,
  "monthly": 50000,
  "tier_on_exceed": "auto"
}
```

---

## 3. 정책 평가 흐름

트랜잭션 제출 시 정책 엔진이 모든 적용 가능한 정책을 평가합니다:

1. **정책 수집** -- 지갑 + 글로벌 정책, 우선순위 정렬. 네트워크 범위 필터링.
2. **Default deny 검사** -- ALLOWED_TOKENS, CONTRACT_WHITELIST, APPROVED_SPENDERS.
3. **티어 할당** -- SPENDING_LIMIT, REPUTATION_THRESHOLD, APPROVE_TIER_OVERRIDE.
4. **제약 조건 검사** -- WHITELIST, TIME_RESTRICTION, RATE_LIMIT, METHOD_WHITELIST, APPROVE_AMOUNT_LIMIT, ALLOWED_NETWORKS.
5. **티어 실행** -- INSTANT(즉시), NOTIFY(즉시+알림), DELAY(대기), APPROVAL(승인 필요).

### Default Deny 정책 타입

| 정책 타입 | 적용 대상 | 효과 |
|-----------|-----------|------|
| ALLOWED_TOKENS | TOKEN_TRANSFER | 목록에 없는 토큰 차단 |
| CONTRACT_WHITELIST | CONTRACT_CALL | 목록에 없는 컨트랙트 차단 |
| APPROVED_SPENDERS | APPROVE | 목록에 없는 spender 차단 |

---

## 4. 정책 우선순위 규칙

정책 우선순위 오버라이드 순서: wallet+network > wallet+null > global+network > global+null.

높은 `priority` 값이 더 중요합니다. 동일 priority일 때 더 구체적인 범위(wallet+network)가 우선합니다.
