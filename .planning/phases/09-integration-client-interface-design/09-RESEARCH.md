# Phase 9: Integration & Client Interface Design - Research

**Researched:** 2026-02-05
**Domain:** REST API Spec, SDK Interface, MCP Server, Tauri Desktop, Telegram Bot, Docker Deployment
**Confidence:** HIGH

## Summary

Phase 9는 WAIaaS v0.2의 마지막 설계 Phase로, Phase 6-8에서 완성된 Core Architecture + Session/Transaction Protocol + Security Layers 위에 외부 통합 인터페이스(REST API 전체 스펙, SDK, MCP Server)와 사용자 클라이언트(Tauri Desktop, Telegram Bot, Docker)의 상세 설계를 생산한다.

v0.1에서 Cloud 기반으로 설계했던 21-openapi-spec.md, 22-sdk-interface.md, 23-mcp-integration.md를 Self-Hosted 아키텍처로 완전히 재설계해야 한다. 핵심 변경점은: (1) API Key/OAuth 2.1 인증 -> JWT 세션 토큰 + SIWS/SIWE Owner 서명, (2) Cloud 엔드포인트 -> localhost:3100 전용, (3) Webhook -> 로컬 알림 채널, (4) 관리 UI가 웹 대시보드 -> Tauri Desktop + Telegram Bot으로 변경된 점이다.

기술 스택은 이미 Phase 6-8에서 확정되어 있으므로, Phase 9 연구는 "이미 결정된 기술을 어떻게 통합 설계 문서로 표현할 것인가"에 초점을 맞춘다. OpenAPIHono의 Zod SSoT 파이프라인, MCP SDK의 tool/resource 패턴, Tauri 2의 sidecar + system tray 아키텍처, Telegram Bot API의 inline keyboard 패턴이 핵심 설계 도구이다.

**Primary recommendation:** Phase 6-8에서 정의한 13개 API 엔드포인트 + Phase 8 Owner API 8개 엔드포인트를 완전한 OpenAPI 3.0 스펙으로 통합하고, 이 스펙을 SDK/MCP의 단일 소스로 활용하라.

---

## Standard Stack

Phase 6-8에서 확정된 스택을 그대로 사용한다. Phase 9에서 새로 추가되는 라이브러리만 명시한다.

### Core (이미 확정됨 -- Phase 6-8)

| Library | Version | Purpose | Phase |
|---------|---------|---------|-------|
| `hono` + `@hono/zod-openapi` | 4.x | API 프레임워크 + OpenAPI 자동 생성 | Phase 6 |
| `zod` | 3.25+ | 스키마 SSoT (타입 + 검증 + OpenAPI) | Phase 6 |
| `jose` | 6.x | JWT HS256 세션 토큰 | Phase 7 |
| `@reown/appkit` | latest | WalletConnect v2 (Tauri Desktop) | Phase 8 |
| `@walletconnect/sign-client` | latest | WalletConnect v2 (CLI) | Phase 8 |

### Phase 9 신규 (SDK/MCP/Desktop/Bot/Docker)

| Library | Version | Purpose | Plan |
|---------|---------|---------|------|
| `@modelcontextprotocol/sdk` | 1.x (v2 Q1 2026 예정) | MCP Server 구현 | 09-02 |
| `@hono/mcp` 또는 `@modelcontextprotocol/hono` | latest | MCP + Hono 통합 미들웨어 | 09-02 |
| `openapi-typescript` | latest | OpenAPI -> TypeScript 타입 자동 생성 | 09-02 |
| `httpx` | 0.27+ | Python SDK async HTTP 클라이언트 | 09-02 |
| `@tauri-apps/api` | 2.x | Tauri Frontend API | 09-03 |
| `@tauri-apps/plugin-shell` | 2.x | Sidecar 프로세스 관리 | 09-03 |
| `@tauri-apps/plugin-updater` | 2.x | 자동 업데이트 | 09-03 |
| `@tauri-apps/plugin-notification` | 2.x | OS 네이티브 알림 | 09-03 |
| `qrcode-terminal` | latest | CLI QR 코드 표시 | Phase 8에서 확정 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@modelcontextprotocol/sdk` v1.x | v2.x (Q1 2026) | v2 아직 미출시, v1.x가 안정적이고 v2 호환 마이그레이션 경로 제공 |
| `openapi-typescript` | `@hey-api/openapi-ts` | hey-api는 full SDK codegen 제공하나, WAIaaS는 수동 설계 래퍼 패턴 (v0.1 결정) |
| Native `fetch` for Telegram | `telegraf` / `grammY` | v0.2 설계 원칙: native fetch 전용, 외부 Bot 프레임워크 불필요 (Phase 8 NOTI-ARCH 결정) |
| `@hono/mcp` | 직접 stdio 전용 | WAIaaS MCP는 localhost stdio 모드가 주력, Hono 통합은 향후 remote MCP 확장에 대비 |

**Installation (Phase 9 신규):**
```bash
# MCP Server 패키지 (@waiaas/mcp)
pnpm add @modelcontextprotocol/sdk zod

# SDK 패키지 (@waiaas/sdk) -- 의존성은 설계 문서에서 정의
# Python SDK -- httpx, pydantic

# Tauri Desktop (packages/desktop)
# Tauri 2.x 플러그인은 Cargo.toml + package.json 양쪽에 추가
pnpm add @tauri-apps/plugin-shell @tauri-apps/plugin-updater @tauri-apps/plugin-notification @tauri-apps/plugin-process
```

---

## Architecture Patterns

### v0.2 전체 엔드포인트 맵 (Phase 6-8에서 이미 설계된 것 + Phase 9 추가)

Phase 9의 핵심 작업은 분산된 엔드포인트를 하나의 완전한 OpenAPI 3.0 스펙으로 통합하는 것이다.

**Phase 6-7에서 정의된 엔드포인트 (CORE-06 섹션 6.1 + TX-PIPE):**

| # | Method | Path | Auth | 정의 문서 |
|---|--------|------|------|----------|
| 1 | GET | `/health` | None | CORE-06 |
| 2 | GET | `/doc` | None | CORE-06 |
| 3 | GET | `/v1/wallet/balance` | Session | TX-PIPE |
| 4 | GET | `/v1/wallet/address` | Session | TX-PIPE |
| 5 | POST | `/v1/sessions` | Owner | SESS-PROTO |
| 6 | GET | `/v1/sessions` | Owner | SESS-PROTO |
| 7 | DELETE | `/v1/sessions/:id` | Owner | SESS-PROTO |
| 8 | POST | `/v1/transactions/send` | Session | TX-PIPE |
| 9 | GET | `/v1/transactions` | Session | TX-PIPE |
| 10 | GET | `/v1/transactions/pending` | Session | TX-PIPE |
| 11 | GET | `/v1/nonce` | None | SESS-PROTO |

**Phase 8에서 정의된 Owner API (OWNR-CONN + KILL-AUTO-EVM):**

| # | Method | Path | Auth | 정의 문서 |
|---|--------|------|------|----------|
| 12 | POST | `/v1/owner/connect` | None (localhost) | OWNR-CONN |
| 13 | DELETE | `/v1/owner/disconnect` | Owner | OWNR-CONN |
| 14 | POST | `/v1/owner/approve/:txId` | Owner | OWNR-CONN |
| 15 | POST | `/v1/owner/reject/:txId` | Owner | OWNR-CONN |
| 16 | POST | `/v1/owner/kill-switch` | Owner | KILL-AUTO-EVM |
| 17 | POST | `/v1/owner/recover` | Owner+Master | KILL-AUTO-EVM |
| 18 | GET | `/v1/owner/pending-approvals` | Owner | OWNR-CONN |
| 19 | PUT | `/v1/owner/policies/:policyId` | Owner | OWNR-CONN |
| 20 | POST | `/v1/owner/policies` | Owner | OWNR-CONN |
| 21 | GET | `/v1/owner/status` | Owner | OWNR-CONN |
| 22 | POST | `/v1/admin/kill-switch` | MasterPwd | KILL-AUTO-EVM |
| 23 | POST | `/v1/admin/shutdown` | MasterPwd | CORE-05 |

**Phase 9에서 추가해야 할 엔드포인트:**

| # | Method | Path | Auth | 용도 |
|---|--------|------|------|------|
| 24 | GET | `/v1/owner/sessions` | Owner | 세션 목록 (Owner 관점) |
| 25 | DELETE | `/v1/owner/sessions/:id` | Owner | 세션 폐기 (Owner 직접) |
| 26 | GET | `/v1/owner/agents` | Owner | 에이전트 목록 |
| 27 | GET | `/v1/owner/agents/:id` | Owner | 에이전트 상세 |
| 28 | GET | `/v1/owner/settings` | Owner | 시스템 설정 조회 |
| 29 | PUT | `/v1/owner/settings` | Owner | 시스템 설정 변경 |
| 30 | GET | `/v1/owner/dashboard` | Owner | 대시보드 요약 (잔액, 거래, 세션) |

### Pattern 1: Zod SSoT -> OpenAPI -> SDK -> MCP 파이프라인

**What:** Zod 스키마 하나에서 TypeScript 타입, 런타임 검증, OpenAPI 3.0, SDK 타입, MCP 도구 스키마가 모두 파생
**When to use:** 모든 API 엔드포인트에 적용
**Confidence:** HIGH (CORE-06에서 이미 확정된 패턴)

```
Zod Schema (packages/core/src/schemas/)
  |
  +-- z.infer<typeof>           --> TypeScript Type
  +-- .openapi() metadata       --> OpenAPI 3.0 JSON (/doc)
  +-- createRoute() + handler   --> Runtime validation (Hono middleware)
  +-- openapi-typescript         --> SDK type generation
  +-- MCP tool inputSchema      --> MCP tool Zod reuse
```

### Pattern 2: MCP Server -- Zod 스키마 직접 재사용

**What:** MCP SDK가 Zod를 peer dependency로 사용하므로, @waiaas/core의 Zod 스키마를 MCP tool inputSchema에 직접 재사용
**When to use:** MCP Server tool 정의 시
**Confidence:** HIGH (MCP SDK가 Zod peer dependency 확인)

```typescript
// packages/mcp/src/tools/send-token.ts
import { TransferRequestSchema } from '@waiaas/core/schemas/transaction.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

server.registerTool('send_token', {
  title: 'Send Token',
  description: 'Send SOL from agent wallet.',
  inputSchema: {
    to: TransferRequestSchema.shape.to,         // Zod 스키마 재사용
    amount: TransferRequestSchema.shape.amount,
  },
}, async ({ to, amount }) => {
  // localhost:3100 API 호출
  const res = await fetch('http://127.0.0.1:3100/v1/transactions/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to, amount }),
  })
  const data = await res.json()
  return { content: [{ type: 'text', text: JSON.stringify(data) }] }
})
```

### Pattern 3: Tauri Desktop -- Sidecar + IPC 아키텍처

**What:** WAIaaS 데몬을 Tauri sidecar로 번들링, Tauri IPC + localhost HTTP 하이브리드 통신
**When to use:** Tauri Desktop 앱 아키텍처
**Confidence:** MEDIUM (Tauri sidecar 문서 확인, 실제 WAIaaS 데몬 번들링은 구현 시 검증 필요)

```
┌──────────────────────────────────────────────────────┐
│ Tauri Desktop App                                     │
│                                                       │
│  ┌──────────────────┐    ┌──────────────────────────┐│
│  │ Rust Backend      │    │ WebView (React/Solid)    ││
│  │ - Sidecar 관리    │    │ - Dashboard UI           ││
│  │ - System Tray     │◄──►│ - 승인/거부 인터페이스   ││
│  │ - OS Notification │IPC │ - 세션 관리              ││
│  │ - Auto Updater    │    │ - 설정 화면              ││
│  └────────┬─────────┘    └──────────┬───────────────┘│
│           │                          │                │
│           │ Process Mgmt             │ HTTP localhost  │
│           ▼                          ▼                │
│  ┌──────────────────────────────────────────────────┐│
│  │ WAIaaS Daemon (Sidecar Binary)                    ││
│  │ - Hono HTTP Server (127.0.0.1:3100)              ││
│  │ - SQLite + Keystore + Adapters                   ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

**핵심 결정 포인트:**
- **통신 방식:** Tauri IPC (Rust invoke) vs HTTP localhost 직접 호출
- **권장:** 하이브리드 -- 데몬 라이프사이클(start/stop/status)은 Tauri IPC(Rust에서 sidecar 관리), API 호출(잔액/거래/세션)은 HTTP localhost(SDK 재사용)
- **Tauri WebView Origin:** `tauri://localhost` -> CORS 허용 목록에 추가 필요 (CORE-06 섹션 3.4에서 이미 Phase 9 과제로 지정)

### Pattern 4: Telegram Bot -- Polling + Inline Keyboard

**What:** Telegram Bot API를 native fetch로 직접 호출, Long Polling으로 업데이트 수신, Inline Keyboard로 거래 승인/거부
**When to use:** Telegram Bot 인터랙티브 설계
**Confidence:** HIGH (Phase 8 NOTI-ARCH에서 native fetch 전용 결정 확정)

```
┌──────────────────┐         ┌──────────────────┐
│ WAIaaS Daemon     │         │ Telegram API      │
│                   │         │ api.telegram.org   │
│ TelegramBot       │────────►│                   │
│ - Long Polling    │◄────────│ getUpdates        │
│ - sendMessage     │         │ answerCallbackQ   │
│ - editMessageText │         │                   │
│                   │         │                   │
│ Inline Keyboard:  │         │ Owner Mobile      │
│ [Approve] [Reject]│         │ Telegram App      │
└──────────────────┘         └──────────────────┘
```

### Pattern 5: Docker -- Named Volume + Multi-stage Build

**What:** Docker 이미지로 WAIaaS 데몬 배포, named volume으로 ~/.waiaas/ 데이터 영속화
**When to use:** Docker 배포 스펙
**Confidence:** HIGH (표준 Node.js Docker 패턴)

```yaml
# docker-compose.yml 구조
services:
  waiaas:
    build: .
    ports:
      - "127.0.0.1:3100:3100"  # localhost만 바인딩
    volumes:
      - waiaas-data:/home/node/.waiaas  # SQLite + Keystore + config
    environment:
      - WAIAAS_MASTER_PASSWORD_FILE=/run/secrets/master_password
    secrets:
      - master_password

volumes:
  waiaas-data:

secrets:
  master_password:
    file: ./master_password.txt
```

### Anti-Patterns to Avoid

- **MCP에 모든 REST API를 Tool로 노출:** v0.1 결정 유지 -- Tools 10개 이내, 관리 작업은 REST만
- **SDK에서 HTTP 세부사항 노출:** URL 조합, 헤더 설정, 상태 코드를 SDK 사용자에게 노출하지 않음
- **Tauri에서 데몬을 Rust로 재구현:** 데몬은 Node.js 바이너리로 sidecar 번들링, Rust는 Tauri 쉘만 담당
- **Docker에서 0.0.0.0 바인딩:** Docker 내부에서도 127.0.0.1만 바인딩, ports 매핑으로 호스트 연결
- **Telegram Bot에 프레임워크 도입:** native fetch 전용 (NOTI-ARCH 결정). telegraf/grammY 사용하지 않음

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpenAPI 스펙 수동 작성 | YAML 수동 편집 | `@hono/zod-openapi` 자동 생성 | Zod SSoT 위반. drift 발생. CORE-06에서 이미 결정 |
| TypeScript SDK 타입 수동 동기화 | 수동 interface 복사 | `openapi-typescript` + `@waiaas/core` Zod 타입 직접 import | 스펙-SDK 타입 drift 방지 |
| MCP 프로토콜 핸들링 | stdio/JSON-RPC 수동 구현 | `@modelcontextprotocol/sdk` McpServer | 프로토콜 준수, transport 자동 처리 |
| Telegram Bot 프레임워크 | 커스텀 Webhook 서버 | native fetch + Telegram Bot API 직접 호출 | Self-Hosted에 외부 Webhook 수신 불필요, Long Polling이 적합 |
| Tauri 자동 업데이트 | 커스텀 업데이트 시스템 | `@tauri-apps/plugin-updater` + CrabNebula Cloud | 서명 검증, delta 업데이트, 크로스 플랫폼 지원 |
| Docker secrets 관리 | 환경변수로 직접 전달 | Docker Secrets + `_FILE` 환경변수 패턴 | master password가 환경변수로 노출되면 `docker inspect`에 출력 |
| Python SDK async HTTP | `requests` (동기) | `httpx` AsyncClient | async/await 지원, connection pooling, HTTP/2 |

**Key insight:** Phase 9는 설계 문서 Phase이므로, "구현하지 마라"는 것이 아니라 "설계 문서에서 이 라이브러리/패턴을 사용하도록 지시하라"는 의미이다. 설계 문서가 잘못된 구현 방향을 지시하면 v0.3 구현에서 재작업이 발생한다.

---

## Common Pitfalls

### Pitfall 1: v0.1 Cloud 설계를 그대로 복사하는 실수

**What goes wrong:** v0.1의 21-openapi-spec.md를 참조하여 Cloud 전용 개념(API Key, OAuth 2.1, Webhook, cloud server URL 등)을 Self-Hosted 스펙에 그대로 가져옴
**Why it happens:** v0.1 문서가 상세하게 잘 작성되어 있어서 "이걸 약간만 수정하면 되겠다"고 판단
**How to avoid:** Phase 9 설계는 Phase 6-8 deliverables를 primary source로 사용. v0.1은 "엔드포인트 커버리지 참조"로만 사용. 인증 모델, 서버 URL, 보안 스키마는 반드시 v0.2 기준으로 재작성
**Warning signs:** `wai_live_` API Key, `https://api.waiass.io`, OAuth scopes, Webhook endpoint가 설계에 등장하면 v0.1 잔재

### Pitfall 2: MCP Tool 과다 등록

**What goes wrong:** 모든 REST API를 MCP Tool로 노출하여 LLM 컨텍스트 윈도우 소비 + 도구 선택 정확도 저하
**Why it happens:** "더 많은 Tool = 더 강력한 에이전트"라는 오해
**How to avoid:** v0.1 결정 유지 -- MCP Tools 10개 이내. 에이전트 핵심 동작만 (send_token, get_balance, get_address, list_transactions, get_transaction). 관리 작업(세션/정책/킬스위치)은 REST API + Tauri/Telegram
**Warning signs:** MCP Tool이 15개 이상, 에이전트에 Owner 관리 권한이 노출

### Pitfall 3: Tauri WebView에서 브라우저 익스텐션 전제

**What goes wrong:** Phantom/MetaMask 브라우저 익스텐션 기반 지갑 연결을 Tauri에서 구현하려 함
**Why it happens:** 일반 웹 앱 경험에서의 관성
**How to avoid:** Phase 8 OWNR-CONN에서 이미 결정 -- Tauri WebView는 Chrome Extension API 미지원, WalletConnect v2 QR이 유일한 경로. @reown/appkit 사용
**Warning signs:** `window.solana`, `window.ethereum` 참조가 Tauri 설계에 등장

### Pitfall 4: SDK에서 localhost 가정을 하드코딩

**What goes wrong:** SDK의 baseUrl을 `http://127.0.0.1:3100`으로 하드코딩하여 Docker/SSH 터널 등 다양한 배포 시나리오 대응 불가
**Why it happens:** Self-Hosted = 항상 localhost라는 단순화
**How to avoid:** SDK 생성자에 `baseUrl` 파라미터를 필수로 받되, 기본값은 `http://127.0.0.1:3100`. Docker 포트 매핑, SSH 터널링 시나리오를 고려
**Warning signs:** SDK 초기화 코드에 baseUrl 파라미터가 없음

### Pitfall 5: Telegram Bot Callback Data에 민감 정보 포함

**What goes wrong:** Inline keyboard callback_data에 트랜잭션 ID, 금액 등 민감 정보를 직접 인코딩
**Why it happens:** callback_data에 바로 컨텍스트를 넣으면 편리해 보임
**How to avoid:** callback_data에는 짧은 참조 ID만 넣고 (예: `approve:abc123`), 실제 데이터는 daemon DB에서 조회. callback_data 최대 64바이트 제한도 있음. 클라이언트가 임의 데이터를 보낼 수 있으므로 항상 서버 측 검증 필수
**Warning signs:** callback_data에 JSON 또는 긴 문자열이 포함

### Pitfall 6: Docker에서 SQLite WAL 모드 + bind mount 충돌

**What goes wrong:** Docker bind mount에서 SQLite WAL 모드가 정상 동작하지 않음 (특히 macOS Docker Desktop의 VirtioFS)
**Why it happens:** SQLite WAL은 shared memory (`-shm`, `-wal` 파일)에 의존하는데, 일부 파일 시스템/네트워크 마운트에서 `mmap()` 지원 불완전
**How to avoid:** Docker에서는 반드시 named volume 사용 (bind mount 아님). `docker-compose.yml`에 named volume으로 `waiaas-data` 정의
**Warning signs:** Docker Compose에 `volumes: [./data:/home/node/.waiaas]` (bind mount) 사용

### Pitfall 7: MCP SDK v2 API에 맞춰 설계

**What goes wrong:** MCP SDK v2 (Q1 2026 예정)의 새 API를 사용하여 설계했는데, 아직 출시 안 됨
**Why it happens:** v2 예고에 맞춰 미리 설계
**How to avoid:** v1.x API로 설계 (`McpServer`, `.tool()`, `.resource()`, `StdioServerTransport`). v2 마이그레이션 경로는 부록으로 기록. SDK v1.x가 v2 출시 후 6개월간 유지보수 보장
**Warning signs:** SDK import 경로나 API가 공식 v1.x 문서와 불일치

---

## Code Examples

### Example 1: OpenAPIHono 라우트 정의 (Zod SSoT)

이미 CORE-06에서 확정된 패턴. Phase 9에서는 이 패턴으로 전체 엔드포인트를 정의한다.

```typescript
// packages/core/src/schemas/wallet.schema.ts
import { z } from '@hono/zod-openapi'

export const BalanceResponseSchema = z.object({
  agentId: z.string().openapi({ description: '에이전트 ID', example: 'agt_01HV8...' }),
  sol: z.string().openapi({ description: 'SOL 잔액 (lamports)', example: '1000000000' }),
  chain: z.string().openapi({ description: '체인', example: 'solana' }),
}).openapi('BalanceResponse')

// packages/daemon/src/server/routes/wallet.ts
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'

const getBalanceRoute = createRoute({
  method: 'get',
  path: '/v1/wallet/balance',
  tags: ['Wallet'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: '잔액 조회 성공',
      content: { 'application/json': { schema: BalanceResponseSchema } },
    },
    401: {
      description: '인증 실패',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

app.openapi(getBalanceRoute, async (c) => {
  const agentId = c.get('agentId')
  const balance = await adapter.getBalance(agentId)
  return c.json(balance, 200)
})
```

### Example 2: MCP Server Tool 정의 (McpServer + Zod)

```typescript
// packages/mcp/src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({
  name: 'waiaas-wallet',
  version: '0.2.0',
})

// Tool: send_token
server.registerTool('send_token', {
  title: 'Send Token',
  description: 'Send SOL from the agent wallet to a destination address.',
  inputSchema: {
    to: z.string().describe('Destination wallet address (Solana base58)'),
    amount: z.string().describe('Amount in lamports (1 SOL = 1_000_000_000)'),
    memo: z.string().optional().describe('Optional transaction memo'),
  },
}, async ({ to, amount, memo }) => {
  const res = await fetch(`${BASE_URL}/v1/transactions/send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SESSION_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to, amount, memo }),
  })
  const data = await res.json()
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
  }
})

// Resource: wallet balance
server.registerResource('wallet-balance', 'waiaas://wallet/balance', {
  title: 'Wallet Balance',
  description: 'Current SOL balance of the agent wallet.',
  mimeType: 'application/json',
}, async (uri) => {
  const res = await fetch(`${BASE_URL}/v1/wallet/balance`, {
    headers: { 'Authorization': `Bearer ${SESSION_TOKEN}` },
  })
  const data = await res.json()
  return { contents: [{ uri: uri.href, text: JSON.stringify(data) }] }
})

// Transport: stdio (Claude Desktop용)
const transport = new StdioServerTransport()
await server.connect(transport)
```

### Example 3: TypeScript SDK 클라이언트 패턴

```typescript
// packages/sdk/src/client.ts
import type { BalanceResponse, TransferRequest, TransactionResponse } from '@waiaas/core'

export class WAIaaSClient {
  private readonly baseUrl: string
  private sessionToken: string | null = null

  constructor(options: WAIaaSClientOptions) {
    this.baseUrl = options.baseUrl ?? 'http://127.0.0.1:3100'
  }

  /** 세션 토큰 설정 */
  setSessionToken(token: string): void {
    this.sessionToken = token
  }

  /** 잔액 조회 */
  async getBalance(): Promise<BalanceResponse> {
    return this.get('/v1/wallet/balance')
  }

  /** 토큰 전송 */
  async sendToken(request: TransferRequest): Promise<TransactionResponse> {
    return this.post('/v1/transactions/send', request)
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: this.buildHeaders(),
    })
    return this.handleResponse<T>(res)
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { ...this.buildHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return this.handleResponse<T>(res)
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}
    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`
    }
    return headers
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const error = await res.json()
      throw new WAIaaSError(error.code, error.message, res.status)
    }
    return res.json() as Promise<T>
  }
}
```

### Example 4: Telegram Inline Keyboard 거래 승인

```typescript
// packages/daemon/src/infrastructure/notifications/telegram-bot.ts
const TELEGRAM_API = `https://api.telegram.org/bot${botToken}`

/** 거래 승인 요청 메시지 + Inline Keyboard 전송 */
async function sendApprovalRequest(chatId: string, tx: Transaction): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: [
        '*Transaction Approval Required*',
        '',
        `Amount: \`${formatSol(tx.amount)} SOL\``,
        `To: \`${tx.toAddress}\``,
        `Agent: \`${tx.agentId}\``,
        `Tier: APPROVAL`,
        '',
        `_Expires in 1 hour_`,
      ].join('\n'),
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [[
          { text: 'Approve', callback_data: `approve:${tx.id}` },
          { text: 'Reject', callback_data: `reject:${tx.id}` },
        ]],
      },
    }),
  })
}

/** Callback Query 처리 */
async function handleCallbackQuery(query: CallbackQuery): Promise<void> {
  const [action, txId] = query.data.split(':')

  // 1. 항상 answerCallbackQuery 호출 (진행 표시줄 제거)
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: query.id }),
  })

  // 2. Daemon API 호출 (Owner 서명 필요 -- Telegram에서는 간접 승인)
  // 주의: Telegram 승인은 SIWS/SIWE 서명이 불가능하므로,
  // 별도 인증 메커니즘이 필요 (masterPassword 또는 설정된 chatId 검증)

  // 3. 메시지 편집으로 결과 표시
  await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      text: `Transaction ${txId}: ${action === 'approve' ? 'APPROVED' : 'REJECTED'}`,
    }),
  })
}
```

### Example 5: Docker Compose 스펙

```yaml
# docker-compose.yml
version: '3.8'

services:
  waiaas:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    container_name: waiaas-daemon
    restart: unless-stopped
    ports:
      - "127.0.0.1:3100:3100"
    volumes:
      - waiaas-data:/home/node/.waiaas
    environment:
      - NODE_ENV=production
      - WAIAAS_DAEMON_PORT=3100
      - WAIAAS_MASTER_PASSWORD_FILE=/run/secrets/master_password
      - WAIAAS_WALLETCONNECT_PROJECT_ID=${WALLETCONNECT_PROJECT_ID}
    secrets:
      - master_password
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:3100/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

volumes:
  waiaas-data:
    driver: local

secrets:
  master_password:
    file: ./secrets/master_password.txt
```

```dockerfile
# Dockerfile (multi-stage)
FROM node:22-alpine AS builder
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/ ./packages/
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @waiaas/daemon build

FROM node:22-alpine AS production
RUN addgroup -g 1001 -S waiaas && adduser -S waiaas -u 1001 -G waiaas
WORKDIR /app
COPY --from=builder --chown=waiaas:waiaas /app/packages/daemon/dist ./dist
COPY --from=builder --chown=waiaas:waiaas /app/node_modules ./node_modules
USER waiaas
EXPOSE 3100
CMD ["node", "dist/index.js"]
```

---

## State of the Art

### v0.1 -> v0.2 변경 매핑

| 영역 | v0.1 (Cloud) | v0.2 (Self-Hosted) | Impact |
|------|-------------|-------------------|--------|
| 인증 | API Key (`wai_live_xxx`) + OAuth 2.1 | JWT Session (`wai_sess_xxx`) + SIWS/SIWE Owner | SDK 생성자, MCP 토큰 전달 완전 재설계 |
| 서버 URL | `https://api.waiass.io/api/v1` | `http://127.0.0.1:3100` | 기본 baseUrl 변경, HTTPS 미사용 |
| 보안 스키마 | Bearer API Key + OAuth scopes | Bearer Session Token + Owner Signature | OpenAPI securitySchemes 재정의 |
| 거래 파이프라인 | 8단계 (Enclave + Squads) | 6단계 (로컬 키스토어) | 모든 거래 API 스키마 변경 |
| 정책 엔진 | AWS-side | 로컬 DatabasePolicyEngine | 4-tier 보안 분류 추가 |
| 알림 | SQS/SNS Webhook | Telegram/Discord/ntfy.sh | Webhook 엔드포인트 제거, 로컬 채널 |
| 관리 UI | 웹 대시보드 (SaaS) | Tauri Desktop + Telegram Bot | 신규 클라이언트 아키텍처 |
| 에이전트 모델 | 멀티 에이전트 | 단일 에이전트 (v0.2) | SDK 메서드 간소화 |
| MCP 연결 | Cloud SSE/stdio | Localhost stdio/Streamable HTTP | MCP 토큰 전달 메커니즘 변경 |

### MCP SDK 버전 상황

| Version | Status | 설계 방향 |
|---------|--------|----------|
| v1.x | 현재 안정 (production recommended) | **이 버전으로 설계** |
| v2.x | Q1 2026 예정 | 마이그레이션 노트를 부록에 기록 |

v1.x -> v2.x 주요 변경 예상: `server.tool()` -> `server.registerTool()` (이미 v1.x에서 지원), Zod v3 -> v4 호환 (v1.x에서 zod v3.25+ 지원).

### Tauri 2.x 현황

| 기능 | 상태 | 비고 |
|------|------|------|
| System Tray (`tray-icon`) | Stable | v1의 `system-tray`에서 이름 변경 |
| Sidecar | Stable | `@tauri-apps/plugin-shell` 사용 |
| Auto Updater | Stable | `@tauri-apps/plugin-updater` |
| OS Notification | Stable | `@tauri-apps/plugin-notification` |
| WKWebView (macOS) | Stable | Extension API 미지원 (OWNR-CONN 확인) |

---

## Open Questions

### 1. Telegram Bot에서의 거래 승인 인증 방식

**What we know:** Telegram Inline Keyboard callback_data로 approve/reject 의사 전달 가능. 그러나 OWNR-CONN에서 정의한 ownerAuth는 SIWS/SIWE per-request 서명을 요구함. Telegram에서는 지갑 서명이 불가능.

**What's unclear:** Telegram 승인이 ownerAuth를 우회할 수 있는가? 아니면 별도의 인증 레벨(예: chatId + 봇 토큰 기반 낮은 수준 인증)이 필요한가?

**Recommendation:** Telegram 승인은 "DELAY 티어 거래의 지연 시간 중 취소(reject)"에만 허용하고, "APPROVAL 티어 거래의 최종 승인(approve)"은 Tauri Desktop/CLI의 SIWS/SIWE 서명을 요구하는 2-tier 설계를 권장. Telegram approve는 "Owner 의사 표현" 수준으로, 최종 서명은 별도 경로. 또는 master password 기반 간접 인증 방안 검토.

### 2. MCP Server의 세션 토큰 전달 메커니즘

**What we know:** v0.1에서는 MCP 환경변수(`WAIASS_API_KEY`)로 API Key 전달. v0.2에서는 JWT 세션 토큰 사용. 세션 토큰은 만료 시간이 있음(기본 24h).

**What's unclear:** MCP Server(stdio 모드)가 만료된 세션 토큰을 어떻게 갱신하는가? AI 에이전트 프레임워크가 MCP 환경변수를 동적으로 업데이트할 수 있는가?

**Recommendation:** 두 가지 방안: (A) MCP 환경변수에 만료 시간이 긴 "MCP 전용 세션"을 발급 (maxExpiry: 7d, MCP 전용 constraints), (B) MCP Server가 Owner로부터 세션 토큰을 재발급받는 refresh 메커니즘 내장. 방안 A가 더 단순하고 Claude Desktop 호환.

### 3. Tauri Desktop에서 데몬 sidecar 빌드 방식

**What we know:** Tauri sidecar는 바이너리를 `externalBin`에 지정. Node.js 앱은 `pkg` 등으로 컴파일.

**What's unclear:** `@waiaas/daemon` (Hono + SQLite + sodium-native) 같은 복잡한 Node.js 앱이 `pkg`로 깔끔하게 빌드되는가? sodium-native의 native addon이 cross-compile에 문제를 일으킬 수 있는가?

**Recommendation:** 이 문서는 설계 Phase이므로, sidecar 빌드 방식을 "pkg 또는 sea (Node.js Single Executable Application)"로 지정하되, native addon(sodium-native, better-sqlite3) 호환성은 v0.3 구현에서 검증하도록 명시적으로 "구현 시 검증 필요" 태그.

---

## Sources

### Primary (HIGH confidence)
- Phase 6 deliverables: CORE-01 (24), CORE-06 (29) -- 모노레포 구조, API 프레임워크
- Phase 7 deliverables: SESS-PROTO (30), TX-PIPE (32) -- 세션/거래 프로토콜, API 엔드포인트 Zod 스펙
- Phase 8 deliverables: OWNR-CONN (34), NOTI-ARCH (35), KILL-AUTO-EVM (36) -- Owner API, 알림, Kill Switch
- v0.1 deliverables: 21-openapi-spec.md, 22-sdk-interface.md, 23-mcp-integration.md -- Cloud 설계 참조

### Secondary (MEDIUM confidence)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) -- v1.x API, McpServer, transports
- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) -- v2 Q1 2026 예정 확인
- [Hono Zod OpenAPI](https://hono.dev/examples/zod-openapi) -- OpenAPIHono 사용 패턴
- [@hono/mcp](https://www.npmjs.com/package/@hono/mcp) -- Hono MCP 미들웨어
- [Tauri 2 Architecture](https://v2.tauri.app/concept/architecture/) -- 프로세스 모델, IPC
- [Tauri 2 Sidecar](https://v2.tauri.app/develop/sidecar/) -- 외부 바이너리 번들링
- [Tauri 2 System Tray](https://v2.tauri.app/learn/system-tray/) -- tray-icon 기능
- [Tauri 2 Updater](https://v2.tauri.app/plugin/updater/) -- 자동 업데이트 플러그인
- [Telegram Bot API](https://core.telegram.org/bots/api) -- InlineKeyboardMarkup, CallbackQuery
- [Azure SDK TypeScript Guidelines](https://azure.github.io/azure-sdk/typescript_design.html) -- Options Bag 패턴
- [openapi-typescript](https://openapi-ts.dev/) -- OpenAPI -> TypeScript 타입 생성
- [Docker Compose Volumes](https://docs.docker.com/get-started/workshop/05_persisting_data/) -- Named volume 패턴

### Tertiary (LOW confidence)
- [MCP Streamable HTTP Auth](https://auth0.com/blog/mcp-streamable-http/) -- Streamable HTTP 인증 패턴
- [CrabNebula Auto Updates](https://docs.crabnebula.dev/cloud/guides/auto-updates-tauri/) -- Tauri 업데이트 서버
- [tauri-sidecar-manager](https://github.com/radical-data/tauri-sidecar-manager) -- 사이드카 라이프사이클 관리 플러그인

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Phase 6-8에서 모두 확정됨, 신규 라이브러리도 공식 문서 확인
- Architecture: HIGH -- v0.1 설계 + Phase 6-8 deliverables에서 대부분의 패턴이 이미 정의됨
- Pitfalls: HIGH -- v0.1 -> v0.2 전환에서 발생하는 실수 패턴이 명확함
- MCP 세부 사항: MEDIUM -- SDK v1.x API는 확인했으나, v2 타임라인은 추정
- Tauri sidecar 빌드: MEDIUM -- Tauri sidecar 문서는 확인, native addon 호환성은 구현 시 검증 필요
- Telegram 승인 인증: LOW -- ownerAuth와의 통합 방식이 아직 미결정

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (30일 -- 안정적 기술 스택, MCP SDK v2 출시 시 재검토)
