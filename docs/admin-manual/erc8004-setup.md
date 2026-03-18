---
title: "ERC-8004 Trustless Agents Setup"
description: "ERC-8004 Provider 활성화, 레지스트리 주소 설정, REPUTATION_THRESHOLD 정책 생성 가이드"
keywords: ["erc-8004", "trustless-agents", "identity", "reputation", "registry", "waiaas"]
date: "2026-03-18"
section: "docs"
category: "Admin Manual"
---

# ERC-8004 Trustless Agents Setup

> 이 문서는 Operator(관리자)를 위한 문서입니다. AI 에이전트 접근은 sessionAuth로 제한됩니다.

ERC-8004 온체인 에이전트 ID, 평판, 검증 기능을 활성화하고 구성하기 위한 관리자 가이드입니다.

## 1. Provider 활성화

ERC-8004 프로바이더는 v30.11부터 기본 활성화되어 있습니다 (`actions.erc8004_agent_enabled=true`).

비활성화하려면:

```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"settings": [{"key": "actions.erc8004_agent_enabled", "value": "false"}]}'
```

Admin UI에서는 Security > Agent Identity (`#/agent-identity`) 페이지에서 토글할 수 있습니다.

---

## 2. 레지스트리 주소 설정

기본 레지스트리 주소가 제공되지만, 커스텀 레지스트리를 사용하려면 변경할 수 있습니다.

| 설정 키 | 기본값 | 설명 |
|---------|--------|------|
| `actions.erc8004_agent_enabled` | `true` | 마스터 기능 게이트 |
| `actions.erc8004_identity_registry_address` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | Identity Registry |
| `actions.erc8004_reputation_registry_address` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | Reputation Registry |
| `actions.erc8004_validation_registry_address` | (빈 값) | Validation Registry. 빈 값 = 기능 비활성 |
| `actions.erc8004_registration_file_base_url` | (빈 값) | Registration file 호스팅 base URL |
| `actions.erc8004_auto_publish_registration` | `true` | 자동 registration file 생성/서빙 |
| `actions.erc8004_reputation_cache_ttl_sec` | `300` | 평판 캐시 TTL (초) |
| `actions.erc8004_min_reputation_score` | `0` | 글로벌 최소 평판 점수 |
| `actions.erc8004_reputation_rpc_timeout_ms` | `3000` | 평판 조회 RPC 타임아웃 (ms) |

설정 변경 예시:

```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"settings": [
    {"key": "actions.erc8004_registration_file_base_url", "value": "https://agent.example.com"}
  ]}'
```

---

## 3. REPUTATION_THRESHOLD 정책 생성

상대방 에이전트의 온체인 평판 점수를 기반으로 트랜잭션 보안 티어를 에스컬레이션합니다.

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{
    "walletId": "<uuid>",
    "type": "REPUTATION_THRESHOLD",
    "rules": {
      "min_score": 50,
      "below_threshold_tier": "APPROVAL",
      "unrated_tier": "DELAY",
      "check_counterparty": true
    }
  }'
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `min_score` | number | Yes | 최소 허용 평판 점수 (0-100) |
| `below_threshold_tier` | string | No | 점수 미달 시 티어. 기본: APPROVAL |
| `unrated_tier` | string | No | 평판 데이터 없을 시 티어. 기본: APPROVAL |
| `tag1` | string | No | 평판 태그 필터 1 (최대 32자) |
| `tag2` | string | No | 평판 태그 필터 2 (최대 32자) |
| `check_counterparty` | boolean | No | 상대방 평판 검사 여부. 기본: true |

**참고:** 평판 정책은 티어를 에스컬레이션만 할 수 있고, 다운그레이드할 수 없습니다. 이전 정책이 APPROVAL을 할당했다면 평판 정책으로 NOTIFY로 낮출 수 없습니다.

---

## 4. 액션 티어 오버라이드

각 ERC-8004 액션의 기본 보안 티어를 Admin UI > Agent Identity에서 또는 Settings API로 오버라이드할 수 있습니다:

```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"settings": [{"key": "actions.erc8004_agent_register_agent_tier", "value": "APPROVAL"}]}'
```
