---
title: "Daemon Operations"
description: "WAIaaS 데몬 운영: Health, Kill Switch, Shutdown, Settings, JWT, API Key, Backup, Webhook, Stats, AutoStop"
keywords: ["daemon", "admin", "kill-switch", "settings", "backup", "webhook", "stats", "autostop", "waiaas"]
date: "2026-03-18"
section: "docs"
category: "Admin Manual"
---

# WAIaaS Daemon Operations

> 이 문서는 Operator(관리자)를 위한 문서입니다. AI 에이전트 접근은 sessionAuth로 제한됩니다.

데몬의 운영, 모니터링, 보안 관리를 위한 Admin API 레퍼런스입니다. 모든 엔드포인트는 `X-Master-Password` 헤더가 필요합니다 (kill-switch 조회 제외).

## Base URL

```
http://localhost:3100
```

## Admin UI 네비게이션 구조

Admin UI 사이드바는 5개 섹션 그룹으로 구성됩니다:

- **Dashboard** (최상위)
- **Wallets**: Wallets (4탭: Wallets/Tokens/RPC Endpoints/WalletConnect), Transactions, Sessions
- **Trading**: Providers, Hyperliquid, Polymarket
- **Security**: Policies, Protection, Agent Identity, Credentials
- **Channels**: Notifications, Wallet Apps
- **System**: Settings, Status

---

## 1. Health / Status

### GET /health -- Health Check (인증 불필요)

```bash
curl -s http://localhost:3100/health
```

응답:
```json
{"status": "ok", "version": "3.0.0-rc", "uptime": 12345}
```

### GET /v1/admin/stats -- 데몬 통계 (masterAuth)

```bash
curl -s http://localhost:3100/v1/admin/stats \
  -H 'X-Master-Password: <password>'
```

지갑 수, 세션 수, 트랜잭션 통계, 정책 수 등을 반환합니다.

### GET /v1/admin/oracle-status -- Oracle 상태 (masterAuth)

```bash
curl -s http://localhost:3100/v1/admin/oracle-status \
  -H 'X-Master-Password: <password>'
```

가격 오라클의 현재 상태와 마지막 업데이트 시간을 반환합니다.

---

## 2. Kill Switch

### GET /v1/admin/kill-switch -- Kill Switch 상태 조회 (인증 불필요)

```bash
curl -s http://localhost:3100/v1/admin/kill-switch
```

응답:
```json
{"active": false}
```

### POST /v1/admin/kill-switch -- Kill Switch 토글 (masterAuth)

```bash
curl -s -X POST http://localhost:3100/v1/admin/kill-switch \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"active": true}'
```

Kill Switch가 활성화되면 모든 트랜잭션이 즉시 차단됩니다. 읽기 전용 작업(잔액 조회 등)은 허용됩니다.

---

## 3. Shutdown

### POST /v1/admin/shutdown -- 데몬 종료 (masterAuth)

```bash
curl -s -X POST http://localhost:3100/v1/admin/shutdown \
  -H 'X-Master-Password: <password>'
```

데몬을 graceful하게 종료합니다. 진행 중인 트랜잭션이 완료된 후 종료됩니다.

---

## 4. 세션 관리

### POST /v1/sessions -- 세션 생성 (masterAuth)

```bash
curl -s -X POST http://localhost:3100/v1/sessions \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{
    "walletIds": ["<wallet-uuid>"],
    "ttl": 86400,
    "maxRenewals": 10
  }'
```

### GET /v1/sessions -- 세션 목록 (masterAuth)

```bash
curl -s 'http://localhost:3100/v1/sessions?limit=20&offset=0' \
  -H 'X-Master-Password: <password>'
```

### DELETE /v1/sessions/:id -- 세션 삭제 (masterAuth)

```bash
curl -s -X DELETE http://localhost:3100/v1/sessions/<session-uuid> \
  -H 'X-Master-Password: <password>'
```

### POST /v1/sessions/:id/wallets -- 세션에 지갑 추가

```bash
curl -s -X POST http://localhost:3100/v1/sessions/<session-uuid>/wallets \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"walletId": "<wallet-uuid>"}'
```

### DELETE /v1/sessions/:id/wallets/:walletId -- 세션에서 지갑 제거

```bash
curl -s -X DELETE http://localhost:3100/v1/sessions/<session-uuid>/wallets/<wallet-uuid> \
  -H 'X-Master-Password: <password>'
```

---

## 5. Agent Self-Discovery

### POST /admin/agent-prompt -- 에이전트 프롬프트 생성 (masterAuth)

```bash
curl -s -X POST http://localhost:3100/admin/agent-prompt \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"sessionToken": "<token>"}'
```

에이전트에게 제공할 자기 발견(self-discovery) 프롬프트를 생성합니다.

---

## 6. JWT 시크릿 갱신

### POST /v1/admin/jwt/rotate -- JWT 시크릿 회전 (masterAuth)

```bash
curl -s -X POST http://localhost:3100/v1/admin/jwt/rotate \
  -H 'X-Master-Password: <password>'
```

JWT 서명 시크릿을 새로 생성합니다. 기존 세션 토큰은 즉시 무효화됩니다.

---

## 7. Settings CRUD

### GET /v1/admin/settings -- 전체 설정 조회 (masterAuth)

```bash
curl -s http://localhost:3100/v1/admin/settings \
  -H 'X-Master-Password: <password>'
```

### PUT /v1/admin/settings -- 설정 업데이트 (masterAuth)

```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"settings": [{"key": "rpc.solana_rpc_url", "value": "https://api.mainnet-beta.solana.com"}]}'
```

런타임에 설정을 변경합니다. 변경 즉시 적용됩니다 (hot-reload).

---

## 8. API Key 관리

### GET /v1/admin/api-keys -- API Key 목록 (masterAuth)

```bash
curl -s http://localhost:3100/v1/admin/api-keys \
  -H 'X-Master-Password: <password>'
```

### POST /v1/admin/api-keys -- API Key 생성 (masterAuth)

```bash
curl -s -X POST http://localhost:3100/v1/admin/api-keys \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"name": "production-key"}'
```

### DELETE /v1/admin/api-keys/:id -- API Key 삭제 (masterAuth)

```bash
curl -s -X DELETE http://localhost:3100/v1/admin/api-keys/<key-id> \
  -H 'X-Master-Password: <password>'
```

---

## 9. Notification 설정

Admin UI > Channels > Notifications에서 알림 채널을 설정합니다. Push Relay, Telegram 등의 채널을 구성할 수 있습니다.

설정 키 예시:
- `notification.enabled` -- 알림 활성화 여부
- `notification.default_channel` -- 기본 알림 채널

---

## 10. Audit Logs

### GET /v1/admin/audit-logs -- 감사 로그 조회 (masterAuth)

```bash
curl -s 'http://localhost:3100/v1/admin/audit-logs?limit=50&offset=0' \
  -H 'X-Master-Password: <password>'
```

모든 관리 작업의 감사 로그를 조회합니다. 필터 파라미터: `action`, `from`, `to`, `limit`, `offset`.

---

## 11. Backup / Restore

### POST /v1/admin/backup -- 백업 생성 (masterAuth)

```bash
curl -s -X POST http://localhost:3100/v1/admin/backup \
  -H 'X-Master-Password: <password>' \
  --output backup.enc
```

암호화된 데이터베이스 백업을 생성합니다.

### POST /v1/admin/restore -- 백업 복원 (masterAuth)

```bash
curl -s -X POST http://localhost:3100/v1/admin/restore \
  -H 'X-Master-Password: <password>' \
  -F 'file=@backup.enc'
```

암호화된 백업에서 데이터를 복원합니다.

---

## 12. Webhook 관리

### GET /v1/admin/webhooks -- Webhook 목록 (masterAuth)

```bash
curl -s http://localhost:3100/v1/admin/webhooks \
  -H 'X-Master-Password: <password>'
```

### POST /v1/admin/webhooks -- Webhook 생성 (masterAuth)

```bash
curl -s -X POST http://localhost:3100/v1/admin/webhooks \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{
    "url": "https://example.com/webhook",
    "events": ["tx.confirmed", "tx.failed"],
    "secret": "webhook-secret"
  }'
```

### PUT /v1/admin/webhooks/:id -- Webhook 수정 (masterAuth)

```bash
curl -s -X PUT http://localhost:3100/v1/admin/webhooks/<webhook-id> \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"url": "https://example.com/webhook-v2", "enabled": true}'
```

### DELETE /v1/admin/webhooks/:id -- Webhook 삭제 (masterAuth)

```bash
curl -s -X DELETE http://localhost:3100/v1/admin/webhooks/<webhook-id> \
  -H 'X-Master-Password: <password>'
```

---

## 13. AutoStop

### GET /v1/admin/autostop -- AutoStop 설정 조회 (masterAuth)

```bash
curl -s http://localhost:3100/v1/admin/autostop \
  -H 'X-Master-Password: <password>'
```

### PUT /v1/admin/autostop -- AutoStop 설정 변경 (masterAuth)

```bash
curl -s -X PUT http://localhost:3100/v1/admin/autostop \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"enabled": true, "idleMinutes": 30}'
```

데몬이 지정된 유휴 시간 후 자동으로 종료되도록 설정합니다.
