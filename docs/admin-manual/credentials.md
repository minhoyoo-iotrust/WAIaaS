---
title: "Credential Management"
description: "WAIaaS Credential Vault CRUD, 지원 타입, 글로벌 자격 증명 관리"
keywords: ["credentials", "vault", "api-key", "secret", "external-actions", "waiaas"]
date: "2026-03-18"
section: "docs"
category: "Admin Manual"
---

# WAIaaS Credential Management

> 이 문서는 Operator(관리자)를 위한 문서입니다. AI 에이전트 접근은 sessionAuth로 제한됩니다.

오프체인 액션(외부 거래소, API 서비스)에 필요한 자격 증명을 안전하게 저장하고 관리하기 위한 Credential Vault 관리자 레퍼런스입니다. 자격 증명 값은 AES-256-GCM으로 암호화되어 저장되며, API 응답에 값이 노출되지 않습니다.

## Base URL

```
http://localhost:3100
```

---

## 1. Credential 범위

- **Per-wallet**: `/v1/wallets/:id/credentials`에 저장. 해당 지갑의 파이프라인에서만 접근 가능.
- **Global**: `/v1/admin/credentials`에 저장. 모든 지갑에서 접근 가능. 동일 이름의 per-wallet credential이 우선.

---

## 2. Credential CRUD

### POST /v1/wallets/:id/credentials -- Credential 생성 (masterAuth)

```bash
curl -s -X POST http://localhost:3100/v1/wallets/<wallet-id>/credentials \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{
    "name": "polymarket-api-key",
    "type": "api_key",
    "value": "secret-api-key-value",
    "expiresAt": 1735689600
  }'
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Credential 참조 이름 (고유) |
| `type` | string | Yes | 타입: `api_key`, `api_secret`, `rsa_private_key`, `ed25519_private_key` |
| `value` | string | Yes | Credential 값 (암호화 저장) |
| `expiresAt` | number | No | 만료 시간 (Unix timestamp, 초) |

### DELETE /v1/wallets/:id/credentials/:ref -- Credential 삭제 (masterAuth)

```bash
curl -s -X DELETE http://localhost:3100/v1/wallets/<wallet-id>/credentials/polymarket-api-key \
  -H 'X-Master-Password: <password>'
```

### PUT /v1/wallets/:id/credentials/:ref/rotate -- Credential 교체 (masterAuth)

```bash
curl -s -X PUT http://localhost:3100/v1/wallets/<wallet-id>/credentials/polymarket-api-key/rotate \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"value": "new-secret-value"}'
```

---

## 3. 글로벌 Credential 관리

### POST /v1/admin/credentials -- 글로벌 Credential 생성 (masterAuth)

```bash
curl -s -X POST http://localhost:3100/v1/admin/credentials \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{
    "name": "shared-api-key",
    "type": "api_key",
    "value": "shared-secret-value"
  }'
```

### GET /v1/admin/credentials -- 글로벌 Credential 목록 (masterAuth)

```bash
curl -s http://localhost:3100/v1/admin/credentials \
  -H 'X-Master-Password: <password>'
```

### DELETE /v1/admin/credentials/:ref -- 글로벌 Credential 삭제 (masterAuth)

```bash
curl -s -X DELETE http://localhost:3100/v1/admin/credentials/shared-api-key \
  -H 'X-Master-Password: <password>'
```

### PUT /v1/admin/credentials/:ref/rotate -- 글로벌 Credential 교체 (masterAuth)

```bash
curl -s -X PUT http://localhost:3100/v1/admin/credentials/shared-api-key/rotate \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"value": "new-shared-secret"}'
```

---

## 4. 지원 타입

| 타입 | 설명 | 용도 |
|------|------|------|
| `api_key` | API 키 문자열 | CEX API 인증, 서비스 인증 |
| `api_secret` | API 시크릿 문자열 | HMAC 서명용 시크릿 |
| `rsa_private_key` | RSA 개인 키 (PEM) | RSA-PSS 서명 |
| `ed25519_private_key` | Ed25519 개인 키 (32바이트) | Ed25519 서명 |

---

## 5. 관련 정책

오프체인 액션에서 사용하는 credential은 다음 정책과 함께 구성합니다:

- **VENUE_WHITELIST**: 허용된 거래소/프로토콜 제한
- **ACTION_CATEGORY_LIMIT**: 카테고리별 USD 지출 한도

정책 생성은 [Policy Management](./policy-management.md)를 참조하세요.
