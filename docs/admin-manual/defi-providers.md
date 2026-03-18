---
title: "DeFi Provider Configuration"
description: "WAIaaS DeFi Provider 활성화, API 키 등록, CONTRACT_WHITELIST 설정 가이드"
keywords: ["defi", "provider", "jupiter", "0x", "lifi", "lido", "aave", "actions", "waiaas"]
date: "2026-03-18"
section: "docs"
category: "Admin Manual"
---

# WAIaaS DeFi Provider Configuration

> 이 문서는 Operator(관리자)를 위한 문서입니다. AI 에이전트 접근은 sessionAuth로 제한됩니다.

DeFi Provider 활성화, API 키 등록, CONTRACT_WHITELIST 정책 설정, provider-trust bypass 구성을 위한 관리자 가이드입니다.

## Provider 활성화 방법

Admin UI > Trading > Providers 페이지 또는 Admin Settings API로 프로바이더를 활성화/비활성화합니다.

### Admin Settings API로 활성화

```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"settings": [{"key": "actions.jupiter_swap_enabled", "value": "true"}]}'
```

---

## Provider 설정 요약 테이블

| Provider | 설정 키 | API 키 필요 | 체인 | 기본 활성 |
|----------|---------|-------------|------|-----------|
| Jupiter Swap | `actions.jupiter_swap_enabled` | No | Solana | Yes |
| 0x Swap | `actions.zerox_swap_enabled` | Yes (`actions.zerox_api_key`) | EVM | Yes |
| LI.FI Bridge | `actions.lifi_enabled` | No (선택적: `actions.lifi_api_key`) | EVM + Solana | Yes |
| Lido Staking | `actions.lido_staking_enabled` | No | EVM | Yes |
| Jito Staking | `actions.jito_staking_enabled` | No | Solana | Yes |
| Aave V3 Lending | `actions.aave_lending_enabled` | No | EVM | Yes |
| Kamino Lending | `actions.kamino_lending_enabled` | No | Solana | Yes |
| Pendle Yield | `actions.pendle_yield_enabled` | No | EVM | Yes |
| Drift Perp | `actions.drift_perp_enabled` | No | Solana | Yes |
| DCent Swap | `actions.dcent_swap_enabled` | No | EVM + Solana | Yes |
| Hyperliquid | `actions.hyperliquid_perp_enabled` | No | EVM (L1) | Yes |
| Across Bridge | `actions.across_bridge_enabled` | No | EVM | Yes |
| Polymarket | `actions.polymarket_order_enabled` | No | EVM (Polygon) | Yes |

---

## API 키 등록

API 키가 필요한 프로바이더는 Admin Settings에서 키를 등록합니다.

### 0x API 키

```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"settings": [{"key": "actions.zerox_api_key", "value": "your-0x-api-key"}]}'
```

### LI.FI API 키 (선택적)

```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"settings": [{"key": "actions.lifi_api_key", "value": "your-lifi-api-key"}]}'
```

---

## CONTRACT_WHITELIST 정책 설정

DeFi 프로바이더의 컨트랙트를 사용하려면 CONTRACT_WHITELIST 정책에 해당 컨트랙트 주소를 등록해야 합니다. 또는 provider-trust bypass를 사용할 수 있습니다.

### 수동 컨트랙트 등록 예시

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{
    "walletId": "<uuid>",
    "type": "CONTRACT_WHITELIST",
    "rules": {
      "contracts": [
        {"address": "0xE592427A0AEce92De3Edee1F18E0157C05861564", "name": "Uniswap V3 Router"}
      ]
    }
  }'
```

---

## Provider-Trust Bypass

`provider_trust` 설정을 활성화하면 등록된 프로바이더가 사용하는 컨트랙트는 CONTRACT_WHITELIST 검사를 건너뜁니다. DeFi 프로바이더가 동적으로 결정하는 컨트랙트 주소(예: DEX 라우터)에 유용합니다.

```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"settings": [{"key": "actions.provider_trust", "value": "true"}]}'
```

**주의:** provider-trust를 활성화하면 프로바이더가 결정한 모든 컨트랙트 주소가 허용됩니다. 프로바이더 코드를 신뢰할 수 있을 때만 사용하세요.

---

## 액션 티어 오버라이드

각 프로바이더 액션의 기본 보안 티어를 Admin Settings에서 오버라이드할 수 있습니다.

```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"settings": [{"key": "actions.jupiter_swap_swap_tier", "value": "APPROVAL"}]}'
```

패턴: `actions.{provider}_{action}_tier` = "INSTANT" | "NOTIFY" | "DELAY" | "APPROVAL"
