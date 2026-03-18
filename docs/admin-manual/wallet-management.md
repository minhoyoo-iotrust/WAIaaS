---
title: "Wallet Management"
description: "WAIaaS 지갑 CRUD, 세션 관리, Owner 설정, 토큰 레지스트리, MCP 토큰, 네트워크 관리"
keywords: ["wallet", "session", "owner", "token", "mcp", "network", "waiaas"]
date: "2026-03-18"
section: "docs"
category: "Admin Manual"
---

# WAIaaS Wallet Management

> 이 문서는 Operator(관리자)를 위한 문서입니다. AI 에이전트 접근은 sessionAuth로 제한됩니다.

지갑 생성/수정/삭제, 세션 관리, Owner 설정, 토큰 레지스트리, MCP 토큰 프로비저닝, WalletConnect 페어링, Smart Account Provider 설정을 위한 관리자 레퍼런스입니다.

## Base URL

```
http://localhost:3100
```

---

## 1. 지갑 CRUD

### POST /v1/wallets -- 지갑 생성 (masterAuth)

```bash
curl -s -X POST http://localhost:3100/v1/wallets \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"name": "trading-wallet", "chain": "solana"}'
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | 지갑 이름 |
| `chain` | string | Yes | 블록체인: "solana" 또는 "ethereum" |
| `accountType` | string | No | "eoa" (기본) 또는 "smart" |

### GET /v1/wallets -- 지갑 목록 (masterAuth)

```bash
curl -s http://localhost:3100/v1/wallets \
  -H 'X-Master-Password: <password>'
```

### GET /v1/wallets/:id -- 지갑 상세 (masterAuth)

```bash
curl -s http://localhost:3100/v1/wallets/<wallet-uuid> \
  -H 'X-Master-Password: <password>'
```

### PUT /v1/wallets/:id -- 지갑 수정 (masterAuth)

```bash
curl -s -X PUT http://localhost:3100/v1/wallets/<wallet-uuid> \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"name": "renamed-wallet"}'
```

### DELETE /v1/wallets/:id -- 지갑 삭제 (masterAuth)

```bash
curl -s -X DELETE http://localhost:3100/v1/wallets/<wallet-uuid> \
  -H 'X-Master-Password: <password>'
```

---

## 2. Owner 설정

### PUT /v1/wallets/:id/owner -- Owner 주소 설정 (masterAuth)

```bash
curl -s -X PUT http://localhost:3100/v1/wallets/<wallet-uuid>/owner \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"ownerAddress": "0x1234...", "approvalMethod": "walletconnect"}'
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ownerAddress` | string | Yes | Owner의 블록체인 주소 |
| `approvalMethod` | string | No | 승인 방법: "walletconnect", "push_relay", "telegram", "admin_ui", "auto" |

Owner 3-State 모델: NONE(미설정) -> GRACE(유예 기간) -> LOCKED(잠금).

---

## 3. 토큰 레지스트리

### POST /v1/tokens -- 커스텀 토큰 등록 (masterAuth)

```bash
curl -s -X POST http://localhost:3100/v1/tokens \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{
    "address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "symbol": "USDC",
    "decimals": 6,
    "chain": "solana"
  }'
```

### DELETE /v1/tokens/:address -- 토큰 삭제 (masterAuth)

```bash
curl -s -X DELETE http://localhost:3100/v1/tokens/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
  -H 'X-Master-Password: <password>'
```

---

## 4. MCP 토큰 관리

### POST /v1/mcp-tokens -- MCP 토큰 생성 (masterAuth)

```bash
curl -s -X POST http://localhost:3100/v1/mcp-tokens \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"sessionId": "<session-uuid>"}'
```

### DELETE /v1/mcp-tokens/:id -- MCP 토큰 삭제 (masterAuth)

```bash
curl -s -X DELETE http://localhost:3100/v1/mcp-tokens/<token-id> \
  -H 'X-Master-Password: <password>'
```

---

## 5. 네트워크 관리

지갑의 활성 네트워크를 관리합니다. Admin UI > Wallets > RPC Endpoints 탭에서도 설정 가능합니다.

---

## 6. WalletConnect 페어링 관리

WalletConnect를 통한 Owner 승인 페어링을 관리합니다. Admin UI > Wallets > WalletConnect 탭에서 QR 코드를 생성하고 페어링할 수 있습니다.

---

## 7. Smart Account Provider 설정

### PUT /v1/wallets/:id/provider -- Provider 설정 (masterAuth)

```bash
curl -s -X PUT http://localhost:3100/v1/wallets/<wallet-uuid>/provider \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"provider": "pimlico", "config": {"apiKey": "your-pimlico-key"}}'
```

Smart Account(ERC-4337)의 UserOp 번들러 프로바이더를 설정합니다. 지원 프로바이더: pimlico, alchemy, custom.

---

## 8. 관리자용 NFT 조회

### GET /v1/wallets/:id/nfts -- NFT 목록 (masterAuth)

```bash
curl -s 'http://localhost:3100/v1/wallets/<wallet-uuid>/nfts?network=ethereum-mainnet' \
  -H 'X-Master-Password: <password>'
```

특정 지갑의 NFT 보유 현황을 조회합니다. 네트워크별로 필터링 가능합니다.
