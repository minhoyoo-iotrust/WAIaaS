---
title: "ERC-8128 Signed HTTP Requests Setup"
description: "ERC-8128 기능 활성화, ERC8128_ALLOWED_DOMAINS 정책 생성, 프리셋/TTL/rate limit 설정 가이드"
keywords: ["erc-8128", "signed-http", "rfc9421", "eip191", "domain", "waiaas"]
date: "2026-03-18"
section: "docs"
category: "Admin Manual"
---

# ERC-8128 Signed HTTP Requests Setup

> 이 문서는 Operator(관리자)를 위한 문서입니다. AI 에이전트 접근은 sessionAuth로 제한됩니다.

ERC-8128 (RFC 9421 HTTP Message Signatures + EIP-191 Ethereum signing) 기능을 활성화하고 구성하기 위한 관리자 가이드입니다.

## 1. 기능 활성화

ERC-8128은 기본적으로 비활성화되어 있습니다. Admin Settings에서 활성화합니다:

```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"settings": [{"key": "erc8128.enabled", "value": "true"}]}'
```

---

## 2. ERC8128_ALLOWED_DOMAINS 정책 생성

ERC-8128 서명은 **default deny**입니다. 서명할 대상 도메인을 허용 목록에 추가해야 합니다:

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{
    "walletId": "<wallet-uuid>",
    "type": "ERC8128_ALLOWED_DOMAINS",
    "rules": {
      "domains": ["api.example.com", "*.premium-apis.com"]
    },
    "priority": 0,
    "enabled": true
  }'
```

와일드카드 패턴 지원: `*.example.com`은 example.com의 모든 서브도메인에 매치됩니다.

---

## 3. 추가 설정

| 설정 키 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `erc8128.enabled` | boolean | `false` | ERC-8128 마스터 기능 게이트 |
| `erc8128.default_preset` | string | `"standard"` | 기본 Covered Components 프리셋 |
| `erc8128.default_ttl_seconds` | number | `300` | 기본 서명 TTL (초) |
| `erc8128.include_nonce` | boolean | `true` | UUID v4 nonce 포함 여부 |
| `erc8128.algorithm` | string | `"eip191"` | 서명 알고리즘 |
| `erc8128.rate_limit_per_minute` | number | `60` | 도메인별 분당 서명 제한 |

설정 변경 예시:

```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"settings": [
    {"key": "erc8128.default_preset", "value": "strict"},
    {"key": "erc8128.default_ttl_seconds", "value": "600"},
    {"key": "erc8128.rate_limit_per_minute", "value": "120"}
  ]}'
```

---

## 4. Covered Components 프리셋

| 프리셋 | 포함 컴포넌트 | 용도 |
|--------|-------------|------|
| `minimal` | `@method`, `@target-uri` | 경량, 메서드 + URL만 |
| `standard` | `@method`, `@target-uri`, `@authority`, `content-digest` | 권장 기본값 |
| `strict` | `@method`, `@target-uri`, `@authority`, `content-type`, `content-digest`, `content-length` | 최대 보안 |

---

## 5. 사전 요구 사항

ERC-8128을 사용하려면:

1. **ERC-8128 기능 활성화** (위 참조)
2. **ERC8128_ALLOWED_DOMAINS 정책 생성** (위 참조)
3. **EVM 지갑** -- ERC-8128은 EIP-191 서명을 사용하므로 Ethereum 호환 지갑이 필요합니다. Solana 지갑은 지원되지 않습니다.
