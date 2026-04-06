# Phase 5: API 및 통합 설계 - Research

**Researched:** 2026-02-05
**Domain:** API 설계 / OpenAPI 스펙 / 인증 모델 / 정책 모델 / 에러 규격 / SDK 설계 / MCP 통합
**Confidence:** HIGH

## Summary

본 리서치는 Phase 3(시스템 아키텍처)과 Phase 4(소유자-에이전트 관계 모델)에서 확정된 기술 결정을 기반으로, 외부 개발자와 AI 에이전트 프레임워크가 사용할 API 및 통합 인터페이스를 설계하기 위해 필요한 패턴, 표준, 도구를 조사하였다. 이 Phase는 **설계 문서 작성** 단계로, 코드 구현이 아닌 OpenAPI 스펙, 인증 모델, 권한/정책 모델, 에러 코드, SDK 인터페이스, MCP 통합 스펙 문서를 산출한다.

핵심 발견사항: (1) Fastify 5.x의 공식 플러그인 @fastify/swagger v9.x + @fastify/swagger-ui v5.x로 OpenAPI 3.0 스펙을 자동 생성할 수 있으며, Zod v4 + fastify-type-provider-zod를 통해 TypeScript 타입, 런타임 검증, OpenAPI 스키마를 단일 소스에서 관리 가능. (2) 인증 모델은 AI 에이전트의 프로그래밍적 접근 특성상 API Key(즉시 접근) + OAuth 2.1(위임 접근)의 이중 모델이 적합하며, MCP 프로토콜이 OAuth 2.1 + PKCE를 표준으로 채택. (3) 에러 응답은 RFC 9457(Problem Details for HTTP APIs) 표준 + Stripe 스타일 계층적 에러 코드(HTTP 상태 -> 에러 타입 -> 에러 코드)가 핀테크 업계 표준. (4) MCP(Model Context Protocol)는 2026년 현재 AI 에이전트-도구 연동의 사실상 표준(de facto standard)으로, Google/Microsoft/OpenAI 모두 채택. TypeScript SDK(@modelcontextprotocol/sdk)가 공식 제공되며, Tools/Resources/Prompts 3개 프리미티브로 에이전트 기능을 노출. (5) SDK 설계는 Azure SDK Guidelines의 Options Bag 패턴, PagedAsyncIterableIterator 페이지네이션, 일관된 동사 접두사(create/get/list/delete/update)가 표준.

**Primary recommendation:** Zod 스키마를 단일 소스(Single Source of Truth)로 사용하여 TypeScript 타입 + OpenAPI 3.0 스펙 + 런타임 검증을 동시 생성하고, RFC 9457 기반 에러 응답 + Stripe 스타일 계층적 에러 코드로 표준화하며, MCP Tools로 핵심 지갑 기능을 에이전트에 노출하라.

## Standard Stack

Phase 5는 설계 문서 작성 단계이므로, 여기서의 "스택"은 설계에 사용할 도구/표준 + 설계 문서에서 참조할 구현 라이브러리를 의미한다.

### Core (설계 참조 라이브러리)

| 라이브러리 | 버전 | 용도 | 선택 이유 |
|-----------|------|------|----------|
| @fastify/swagger | 9.x | OpenAPI 3.0 스펙 자동 생성 | Fastify 5.x 공식 플러그인, 동적/정적 모드 지원 |
| @fastify/swagger-ui | 5.x | Swagger UI 서빙 | @fastify/swagger 공식 동반 플러그인 |
| fastify-type-provider-zod | latest | Zod → JSON Schema → OpenAPI 변환 | Zod v4 지원, OpenAPI 3.0/3.1 타겟팅 가능 |
| zod | v4 | 스키마 정의, 런타임 검증 | TypeScript 타입 + JSON Schema + OpenAPI 단일 소스 |
| @modelcontextprotocol/sdk | latest | MCP 서버 구현 | 공식 TypeScript SDK, Tools/Resources/Prompts 지원 |
| @fastify/rate-limit | latest | API Rate Limiting | Fastify 공식 플러그인 |
| @fastify/auth | latest | 인증 데코레이터 | Fastify 공식 인증 플러그인 |

### Supporting (설계 참조)

| 라이브러리/표준 | 용도 | 사용 시점 |
|---------------|------|----------|
| RFC 9457 (Problem Details) | 에러 응답 표준 포맷 | 에러 코드 규격 설계 시 |
| OAuth 2.1 (IETF Draft) | 위임 인증 프레임워크 | 인증 모델 설계 시 |
| oasdiff | OpenAPI 스펙 breaking change 감지 | API 거버넌스 설계 시 |
| Fern / Speakeasy | OpenAPI → 다중 언어 SDK 생성 | SDK 인터페이스 설계 시 참고 |

### Alternatives Considered

| 대신 | 대안 | 트레이드오프 |
|------|------|-------------|
| Zod | TypeBox (@sinclair/typebox) | TypeBox는 JSON Schema 네이티브지만 생태계 크기에서 Zod가 우세. MCP SDK도 Zod v4를 peer dependency로 요구 |
| fastify-type-provider-zod | fastify-zod-openapi | fastify-zod-openapi는 OpenAPI 3.1 네이티브이나 채택률이 낮음. 3.0 호환성 우선이면 fastify-type-provider-zod |
| 커스텀 인증 | Stytch / Auth0 | 에이전트 서비스 특성상 API Key + OAuth 2.1 직접 구현이 더 적합 (외부 의존성 최소화 원칙) |

**설치 (구현 시 참고):**
```bash
pnpm add @fastify/swagger @fastify/swagger-ui fastify-type-provider-zod zod @modelcontextprotocol/sdk @fastify/rate-limit @fastify/auth
```

## Architecture Patterns

### Recommended API Document Structure

Phase 5의 산출물인 설계 문서의 구조.

```
docs/
├── api/
│   ├── API-01-openapi-spec.yaml          # OpenAPI 3.0 전체 스펙
│   ├── API-02-authentication-model.md     # 인증 모델 설계
│   ├── API-03-permission-policy-model.md  # 권한/정책 모델 설계
│   ├── API-04-error-codes.md              # 에러 코드 및 처리 규격
│   ├── API-05-sdk-interface.md            # SDK 인터페이스 설계
│   └── API-06-mcp-integration.md          # MCP 통합 스펙
└── schemas/
    └── *.ts                               # Zod 스키마 정의 (타입 + 검증 + OpenAPI 소스)
```

### Pattern 1: Schema-First with Zod as Single Source of Truth

**What:** Zod 스키마 하나에서 TypeScript 타입, 런타임 검증, OpenAPI 스키마를 모두 생성하는 패턴.
**When to use:** API 스펙 설계 시 모든 요청/응답 스키마 정의에 적용.
**Why:** 타입과 문서가 자동 동기화되어 drift 방지.

**Example:**
```typescript
// Source: fastify-type-provider-zod + @fastify/swagger 통합
import { z } from 'zod';

// 1. Zod 스키마 정의 (Single Source of Truth)
export const CreateAgentRequest = z.object({
  nickname: z.string().max(50).describe('에이전트 별칭'),
  budgetConfig: z.object({
    dailyLimit: z.string().describe('일일 한도 (lamports)'),
    weeklyLimit: z.string().describe('주간 한도 (lamports)'),
    monthlyLimit: z.string().describe('월간 한도 (lamports)'),
    perTransactionLimit: z.string().describe('건당 한도 (lamports)'),
  }),
  allowedDestinations: z.array(z.string()).default([]).describe('허용 목적지 주소 목록'),
  replenishmentMode: z.enum(['auto', 'manual']).default('manual'),
  tags: z.array(z.string()).max(10).default([]),
});

// 2. TypeScript 타입 자동 추론
export type CreateAgentRequestType = z.infer<typeof CreateAgentRequest>;

// 3. Fastify 라우트에서 자동으로 OpenAPI 스키마 생성
// (fastify-type-provider-zod의 jsonSchemaTransform이 처리)
```

### Pattern 2: Dual Authentication Model (API Key + OAuth 2.1)

**What:** 에이전트의 직접 API 접근은 API Key, 서드파티 위임 접근은 OAuth 2.1을 사용하는 이중 인증 모델.
**When to use:** 모든 API 엔드포인트 접근 시.
**Why:** AI 에이전트는 비인터랙티브(non-interactive)하여 OAuth 브라우저 플로우가 부적합. API Key로 즉시 접근을 제공하되, 서드파티 프레임워크 연동 시 OAuth 2.1 지원.

**인증 계층:**
```
┌─────────────────────────────────────────────────────────┐
│                     인증 모델 구조                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. API Key Authentication (Primary - 에이전트 직접 접근)  │
│  ─────────────────────────────────────────                │
│  - 프로젝트 범위 스코핑 (per-project API key)             │
│  - 접두사 식별: wai_live_*, wai_test_*                    │
│  - IP 화이트리스트 지원                                   │
│  - 만료 정책 + 자동 로테이션                              │
│  - Header: Authorization: Bearer wai_live_xxx             │
│                                                          │
│  2. OAuth 2.1 (Secondary - 서드파티 위임 접근)            │
│  ─────────────────────────────────────────                │
│  - Client Credentials Grant (서비스-서비스)               │
│  - PKCE 필수 (OAuth 2.1 요구사항)                         │
│  - Dynamic Client Registration (에이전트별 고유 client_id) │
│  - 스코프 기반 권한 제어                                  │
│  - Short-lived access token + refresh token               │
│                                                          │
│  3. MCP Authorization (MCP 프레임워크 전용)               │
│  ─────────────────────────────────────────                │
│  - OAuth 2.1 기반 (MCP 스펙 요구사항)                     │
│  - Protected Resource Metadata (PRM) 노출                 │
│  - 에이전트 프레임워크가 자동 발견                        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**API Key 설계 원칙:**
```typescript
// Source: OpenAI / Stripe API Key 패턴 참고
interface ApiKey {
  id: string;                    // key_xxxx (고유 ID)
  prefix: string;                // wai_live_ | wai_test_
  hashedKey: string;             // SHA-256 해시 (원본 저장 금지)
  ownerId: string;               // 소유자 ID
  projectId: string;             // 프로젝트 범위
  scopes: ApiScope[];            // 허용 스코프 목록
  ipWhitelist: string[];         // 허용 IP 대역
  expiresAt: Date | null;        // 만료 시점 (null = 무기한)
  lastUsedAt: Date | null;       // 마지막 사용
  createdAt: Date;
}

// 스코프 체계
type ApiScope =
  | 'agents:read'           // 에이전트 정보 조회
  | 'agents:write'          // 에이전트 생성/수정
  | 'agents:delete'         // 에이전트 삭제
  | 'transactions:read'     // 트랜잭션 조회
  | 'transactions:execute'  // 트랜잭션 실행
  | 'wallets:read'          // 지갑 정보 조회
  | 'wallets:fund'          // 자금 충전/회수
  | 'policies:read'         // 정책 조회
  | 'policies:write'        // 정책 변경
  | 'dashboard:read'        // 대시보드 조회
  | 'admin:all';            // 전체 관리자 권한
```

### Pattern 3: Hierarchical Error Response (RFC 9457 + Stripe Style)

**What:** RFC 9457 Problem Details 기반 + Stripe 스타일 계층적 에러 코드의 결합.
**When to use:** 모든 API 에러 응답에 적용.
**Why:** RFC 9457은 업계 표준(IETF), Stripe 패턴은 핀테크 최고 관행으로 검증됨.

**에러 응답 구조:**
```typescript
// Source: RFC 9457 + Stripe Error Pattern
interface WalletApiError {
  // RFC 9457 표준 필드
  type: string;           // 에러 타입 URI (예: "https://api.waiass.io/errors/policy-violation")
  title: string;          // 짧은 설명 (예: "Policy Violation")
  status: number;         // HTTP 상태 코드 (예: 403)
  detail: string;         // 상세 설명 (예: "Transaction amount 5 SOL exceeds daily limit of 2 SOL")
  instance: string;       // 요청 인스턴스 URI (예: "/api/v1/transactions/tx_abc123")

  // 확장 필드 (Stripe 스타일)
  code: string;           // 도메인 에러 코드 (예: "POLICY_DAILY_LIMIT_EXCEEDED")
  param?: string;         // 문제의 파라미터 (예: "amount")
  requestId: string;      // 요청 추적 ID (예: "req_xxx")
  docUrl: string;         // 문서화 링크
  retryable: boolean;     // 재시도 가능 여부
  escalation?: string;    // 에스컬레이션 수준 (LOW/MEDIUM/HIGH/CRITICAL)
}
```

**에러 코드 계층 (4-Layer):**
```
Layer 1: HTTP Status Code (400, 401, 403, 404, 409, 422, 429, 500, 502, 503)
  └── Layer 2: Error Type (policy_error, auth_error, validation_error, transaction_error, system_error)
       └── Layer 3: Error Code (POLICY_DAILY_LIMIT_EXCEEDED, AUTH_KEY_EXPIRED, ...)
            └── Layer 4: Detail (human-readable context-specific message)
```

### Pattern 4: Policy-Based Permission Model (RBAC + ABAC Hybrid)

**What:** 역할 기반(RBAC) + 속성 기반(ABAC) 하이브리드 권한 모델.
**When to use:** API 접근 제어 + 에이전트 정책 관리에 적용.
**Why:** RBAC만으로는 금액/시간/주소 기반 세밀한 제어 불가. Phase 4에서 확정된 4가지 정책(금액 한도, 화이트리스트, 시간 제어, 에스컬레이션)이 ABAC 속성과 자연스럽게 매핑.

**권한 모델 구조:**
```typescript
// RBAC: API 접근 역할
type ApiRole = 'owner' | 'agent' | 'viewer' | 'auditor';

// ABAC: 에이전트 정책 속성 (Phase 4 확정 사항 기반)
interface AgentPolicy {
  // 금액 한도 (REL-01 확정)
  limits: {
    perTransaction: bigint;
    daily: bigint;
    weekly: bigint;
    monthly: bigint;
  };

  // 화이트리스트 (Phase 4 확정)
  whitelist: {
    allowedDestinations: string[];    // 허용 주소
    allowedPrograms: string[];        // 허용 프로그램
    allowedTokenMints: string[];      // 허용 토큰
  };

  // 시간 제어
  timeControl: {
    operatingHoursUtc: { start: number; end: number } | null;
    blackoutDates: string[];          // 거래 금지일
  };

  // 에스컬레이션 (ARCH-03 확정)
  escalation: {
    thresholds: {
      low: bigint;      // 알림만
      medium: bigint;   // 소유자 승인 필요
      high: bigint;     // 지갑 동결
      critical: bigint; // 키 해제
    };
  };
}
```

### Pattern 5: MCP Server Integration

**What:** WAIaaS API를 MCP Tools/Resources로 래핑하여 AI 에이전트 프레임워크에 노출하는 패턴.
**When to use:** AI 에이전트가 WAIaaS 기능에 접근해야 할 때.
**Why:** MCP는 2026년 AI 에이전트-도구 연동의 사실상 표준. Google, Microsoft, OpenAI 모두 채택. OpenAI Assistants API는 2026년 중반 sunset 예정이며 MCP로 전환.

**MCP 서버 구조:**
```typescript
// Source: @modelcontextprotocol/sdk 공식 문서
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'waiass-wallet',
  version: '1.0.0',
});

// Tool: 트랜잭션 실행
server.tool(
  'execute_transaction',
  'Execute a transaction from the agent wallet',
  {
    to: z.string().describe('Destination wallet address'),
    amount: z.string().describe('Amount in lamports'),
    mint: z.string().optional().describe('Token mint address (SOL if omitted)'),
  },
  async ({ to, amount, mint }) => {
    // WAIaaS REST API 호출
    const result = await walletApi.executeTransaction({ to, amount, mint });
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    };
  }
);

// Resource: 에이전트 지갑 잔액
server.resource(
  'wallet://balance',
  'Current wallet balance and spending limits',
  async () => ({
    contents: [{
      uri: 'wallet://balance',
      mimeType: 'application/json',
      text: JSON.stringify(await walletApi.getBalance()),
    }],
  })
);
```

**MCP Tool 매핑 (WAIaaS API -> MCP Tools):**

| WAIaaS API 엔드포인트 | MCP Tool 이름 | 유형 | 설명 |
|---------------------|-------------|------|------|
| POST /api/v1/transactions | execute_transaction | Tool | 트랜잭션 실행 |
| GET /api/v1/agents/{id}/balance | get_balance | Tool | 잔액 조회 |
| GET /api/v1/agents/{id}/transactions | list_transactions | Tool | 거래 내역 조회 |
| GET /api/v1/agents/{id}/policy | get_policy | Resource | 현재 정책 조회 |
| GET /api/v1/owner/dashboard | get_dashboard | Resource | 소유자 대시보드 |
| POST /api/v1/agents/{id}/suspend | suspend_agent | Tool | 에이전트 정지 (Owner 전용) |

### Pattern 6: API Versioning Strategy

**What:** URL 경로 기반 버전 관리 (/api/v1/) + 헤더 기반 마이너 버전.
**When to use:** 모든 API 엔드포인트에 적용.
**Why:** Stripe, Coinbase 등 핀테크 API 표준 패턴. AI 에이전트/봇은 장기간 무인 운영되므로 하위호환성이 필수.

```
URL 패턴:  /api/v1/agents
            /api/v1/transactions
            /api/v1/owner/dashboard

버전 정책:
- Major: URL 경로 변경 (/v1 -> /v2), 하위 호환 불가 변경 시
- Minor: 새 필드 추가, 새 엔드포인트 추가 (하위 호환 유지)
- Deprecation: 최소 6개월 전 고지, deprecated: true 마킹
- sunset 헤더: Sunset: Sat, 01 Jan 2028 00:00:00 GMT
```

### Anti-Patterns to Avoid

- **OpenAPI 스펙과 구현 분리:** OpenAPI를 수동으로 YAML 작성하면 구현과 drift 발생. Zod 스키마에서 자동 생성하여 동기화.
- **인증 없이 에이전트 접근:** AI 에이전트도 반드시 인증 필요. "내부 서비스"라도 API Key 필수.
- **에러 응답 비표준화:** 에러마다 다른 포맷 사용. RFC 9457로 모든 에러를 표준화.
- **MCP 없이 REST만 제공:** 2026년 AI 에이전트 생태계에서 MCP 미지원은 통합 마찰 증가. REST + MCP 이중 제공.
- **SDK에 HTTP 구현 세부사항 노출:** SDK 사용자에게 URL, 헤더, 페이지네이션 토큰을 직접 다루게 하면 안 됨. 추상화 필수.
- **에러 메시지에 내부 정보 노출:** 스택 트레이스, DB 쿼리, 서버 경로를 에러에 포함 금지. 핀테크 보안 필수.

## Don't Hand-Roll

| 문제 | 직접 구현 시도 | 사용할 기존 솔루션 | 이유 |
|------|--------------|------------------|------|
| OpenAPI 스펙 작성 | YAML 수동 작성 | @fastify/swagger + Zod 자동 생성 | 구현과 스펙 동기화 보장 |
| JSON Schema 변환 | Zod → JSON Schema 커스텀 변환기 | fastify-type-provider-zod의 jsonSchemaTransform | 검증된 라이브러리, 엣지 케이스 처리 |
| API Key 해싱 | 커스텀 해시 함수 | bcrypt 또는 SHA-256 + salt | 크립토 구현은 반드시 검증된 라이브러리 |
| Rate Limiting | 커스텀 미들웨어 | @fastify/rate-limit | 분산 환경 지원, Redis 연동 |
| MCP 서버 프로토콜 | JSON-RPC 2.0 직접 구현 | @modelcontextprotocol/sdk | 프로토콜 복잡도, 전송 계층 추상화 |
| SDK 생성 | TypeScript/Python SDK 수동 작성 | OpenAPI 스펙 기반 인터페이스 설계 | 스펙에서 타입 자동 추론, 일관성 보장 |
| OAuth 2.1 PKCE | PKCE 검증 로직 직접 구현 | oidc-provider 또는 검증된 라이브러리 | 보안 취약점 위험, RFC 준수 필수 |
| 에러 코드 문서 사이트 | 커스텀 문서 사이트 | 에러 코드 레지스트리 + docUrl 링크 | Stripe 패턴: 에러 코드별 문서 URL 자동 생성 |

**Key insight:** Phase 5는 설계 문서 단계이므로 "직접 구현하지 마라"는 "설계 문서에서 커스텀 솔루션을 제안하지 마라"로 해석한다. 검증된 표준과 라이브러리를 기반으로 설계하라.

## Common Pitfalls

### Pitfall 1: OpenAPI 스펙과 실제 구현의 Drift

**What goes wrong:** OpenAPI YAML을 수동 관리하면 시간이 지남에 따라 실제 구현과 불일치 발생.
**Why it happens:** 코드 변경 시 스펙 업데이트를 잊거나, 스펙만 업데이트하고 코드를 변경하지 않음.
**How to avoid:** Zod 스키마를 Single Source of Truth로 사용하여 @fastify/swagger가 자동 생성. CI/CD에 oasdiff 등 도구로 스펙 변경 감지 추가.
**Warning signs:** "OpenAPI 스펙은 나중에 업데이트하겠다"는 표현이 등장하면 위험.

### Pitfall 2: AI 에이전트 인증의 특수성 무시

**What goes wrong:** 사람 사용자 기준 OAuth 플로우(브라우저 리다이렉트)를 에이전트에게 적용하면, 에이전트가 인증을 완료할 수 없음.
**Why it happens:** 기존 인증 패턴이 사람 사용자를 가정하기 때문.
**How to avoid:** 에이전트 전용 인증 경로 설계: API Key(즉시 접근) + Client Credentials Grant(서비스-서비스). 브라우저 기반 Authorization Code Grant는 소유자 대시보드에만 사용.
**Warning signs:** 인증 설계에 "로그인 페이지" 또는 "리다이렉트 URI"가 에이전트 접근 경로에 등장.

### Pitfall 3: 에러 코드의 일관성 부재

**What goes wrong:** 엔드포인트마다 다른 에러 포맷, 다른 코드 체계를 사용하여 SDK/에이전트가 에러를 일관되게 처리 불가.
**Why it happens:** 각 엔드포인트를 개별적으로 설계하면서 전체 에러 체계를 사전에 정의하지 않음.
**How to avoid:** Phase 5에서 전체 에러 코드 레지스트리를 먼저 정의하고, 모든 엔드포인트가 이 레지스트리를 참조하도록 설계.
**Warning signs:** 에러 코드 문서 없이 엔드포인트별로 개별 에러 정의 시작.

### Pitfall 4: MCP Tool 과다 노출

**What goes wrong:** 모든 REST API 엔드포인트를 MCP Tool로 노출하면 LLM 컨텍스트 윈도우를 과도하게 소비하고, 에이전트의 도구 선택 정확도가 떨어짐.
**Why it happens:** "더 많은 Tool = 더 많은 기능"이라는 오해.
**How to avoid:** 핵심 에이전트 동작(트랜잭션 실행, 잔액 조회, 정책 확인)만 MCP Tool로 노출. 관리 작업(에이전트 생성/삭제, 정책 변경)은 REST API로만 제공. MCP Tools는 10개 이내로 제한.
**Warning signs:** MCP Tool 목록이 20개 이상이면 재검토 필요.

### Pitfall 5: SDK에 HTTP 세부사항 노출

**What goes wrong:** SDK 사용자가 URL 구성, 헤더 설정, 페이지네이션 토큰 관리를 직접 해야 함.
**Why it happens:** SDK를 단순 HTTP 래퍼로 설계.
**How to avoid:** Azure SDK Guidelines의 패턴 적용: 옵션 백(Options Bag), PagedAsyncIterableIterator, 자동 재시도, 에러 타입 계층.
**Warning signs:** SDK 예제 코드에 `fetch()` 호출이나 URL 문자열 조합이 보이면 추상화 부족.

### Pitfall 6: 정책 모델의 API 노출 불완전

**What goes wrong:** Phase 4에서 설계한 4가지 정책(금액/화이트리스트/시간/에스컬레이션)이 API에 완전히 반영되지 않아, 소유자가 정책을 관리할 수 없음.
**Why it happens:** API 엔드포인트 설계 시 Phase 4 설계 문서를 참조하지 않음.
**How to avoid:** Phase 4의 BudgetConfig, ReplenishmentConfig, EmergencyRecoveryConfig 인터페이스를 API 요청/응답 스키마에 1:1 매핑.
**Warning signs:** 에이전트 생성 API에 budgetConfig가 없거나, 정책 변경 API가 부재.

### Pitfall 7: Webhook 설계 누락

**What goes wrong:** 트랜잭션은 비동기적으로 온체인 확정되는데, 동기 응답만 제공하면 클라이언트가 폴링해야 함.
**Why it happens:** 동기 REST 응답에만 집중.
**How to avoid:** Phase 3의 ARCH-03에서 확정된 "동기 + Webhook" 패턴을 API 스펙에 반영. Webhook 엔드포인트 등록, 이벤트 타입, 서명 검증, 재시도 정책(3회, exponential backoff)을 설계.
**Warning signs:** 트랜잭션 API 응답에 webhookUrl 필드가 없고, Webhook 관련 엔드포인트가 없음.

## Code Examples

설계 문서에 포함될 핵심 패턴 예시.

### OpenAPI 3.0 스펙 구조 (Fastify + Zod 자동 생성 기반)

```yaml
# Source: @fastify/swagger 자동 생성 출력 예시
openapi: 3.0.3
info:
  title: WAIaaS - Wallet as a Service for AI Agents
  description: AI 에이전트를 위한 자율적 온체인 지갑 서비스 API
  version: 1.0.0
  contact:
    name: WAIaaS Team
  license:
    name: MIT

servers:
  - url: https://api.waiass.io/api/v1
    description: Production
  - url: https://api-testnet.waiass.io/api/v1
    description: Testnet (Devnet)

tags:
  - name: Agents
    description: 에이전트 생명주기 관리
  - name: Transactions
    description: 트랜잭션 실행 및 조회
  - name: Policies
    description: 정책 및 한도 관리
  - name: Owner
    description: 소유자 대시보드 및 관리
  - name: Webhooks
    description: 웹훅 구독 관리

security:
  - ApiKeyAuth: []
  - OAuth2: []

components:
  securitySchemes:
    ApiKeyAuth:
      type: http
      scheme: bearer
      description: 'API Key: Authorization: Bearer wai_live_xxx'
    OAuth2:
      type: oauth2
      flows:
        clientCredentials:
          tokenUrl: /oauth/token
          scopes:
            agents:read: 에이전트 정보 조회
            agents:write: 에이전트 생성/수정
            transactions:execute: 트랜잭션 실행
            transactions:read: 트랜잭션 조회
            wallets:read: 지갑 정보 조회
            wallets:fund: 자금 충전/회수
            policies:read: 정책 조회
            policies:write: 정책 변경
            dashboard:read: 대시보드 조회
```

### API 엔드포인트 목록 (Phase 3-4 설계 기반)

```typescript
// Source: Phase 4 REL-01~REL-05 설계 문서 + Phase 3 ARCH-03

// === 에이전트 관리 (Agents) ===
// POST   /api/v1/agents                     - 에이전트 생성
// GET    /api/v1/agents                     - 에이전트 목록 조회
// GET    /api/v1/agents/:agentId            - 에이전트 상세 조회
// PATCH  /api/v1/agents/:agentId            - 에이전트 정보 수정
// DELETE /api/v1/agents/:agentId            - 에이전트 삭제 (TERMINATED 전환)
// POST   /api/v1/agents/:agentId/suspend    - 에이전트 정지
// POST   /api/v1/agents/:agentId/resume     - 에이전트 재활성화
// POST   /api/v1/agents/:agentId/rotate-key - 에이전트 키 로테이션

// === 트랜잭션 (Transactions) ===
// POST   /api/v1/transactions               - 트랜잭션 실행 요청
// GET    /api/v1/transactions/:txId         - 트랜잭션 상태 조회
// GET    /api/v1/agents/:agentId/transactions - 에이전트 거래 내역

// === 자금 관리 (Funding) ===
// POST   /api/v1/agents/:agentId/fund       - 에이전트 자금 충전
// POST   /api/v1/agents/:agentId/withdraw   - 에이전트 자금 회수
// GET    /api/v1/agents/:agentId/balance    - 에이전트 잔액 조회
// POST   /api/v1/owner/agents/transfer      - 에이전트 간 자금 이동

// === 정책 관리 (Policies) ===
// GET    /api/v1/agents/:agentId/policy     - 에이전트 정책 조회
// PUT    /api/v1/agents/:agentId/policy     - 에이전트 정책 변경
// GET    /api/v1/agents/:agentId/policy/usage - 정책 사용량 조회

// === 소유자 대시보드 (Owner) ===
// GET    /api/v1/owner/dashboard            - 통합 대시보드 (Phase 4 확정)
// GET    /api/v1/owner/agents               - 소유자의 모든 에이전트 요약
// PUT    /api/v1/owner/global-budget        - 전체 합산 예산 한도 설정

// === 비상 (Emergency) ===
// POST   /api/v1/agents/:agentId/emergency/suspend - 비상 정지
// POST   /api/v1/agents/:agentId/emergency/recover - 비상 회수 요청
// POST   /api/v1/owner/emergency/suspend-all       - 전체 에이전트 비상 정지

// === Webhook 관리 ===
// POST   /api/v1/webhooks                   - 웹훅 엔드포인트 등록
// GET    /api/v1/webhooks                   - 웹훅 목록 조회
// DELETE /api/v1/webhooks/:webhookId        - 웹훅 삭제
// POST   /api/v1/webhooks/:webhookId/test   - 웹훅 테스트 전송

// === 인증 (Auth) ===
// POST   /api/v1/auth/keys                 - API Key 생성
// GET    /api/v1/auth/keys                 - API Key 목록 조회
// DELETE /api/v1/auth/keys/:keyId          - API Key 폐기
// POST   /oauth/token                       - OAuth 2.1 토큰 발급
// POST   /oauth/register                    - Dynamic Client Registration
```

### RFC 9457 에러 응답 예시

```json
// 정책 위반 에러
{
  "type": "https://api.waiass.io/errors/policy-violation",
  "title": "Policy Violation",
  "status": 403,
  "detail": "Transaction amount 5000000000 lamports exceeds daily limit of 2000000000 lamports. Remaining daily budget: 500000000 lamports.",
  "instance": "/api/v1/transactions",
  "code": "POLICY_DAILY_LIMIT_EXCEEDED",
  "param": "amount",
  "requestId": "req_01HV8PQXYZ",
  "docUrl": "https://docs.waiass.io/errors/POLICY_DAILY_LIMIT_EXCEEDED",
  "retryable": false,
  "escalation": "LOW"
}

// 인증 실패 에러
{
  "type": "https://api.waiass.io/errors/authentication-failed",
  "title": "Authentication Failed",
  "status": 401,
  "detail": "API key has expired. Please generate a new key.",
  "instance": "/api/v1/agents",
  "code": "AUTH_KEY_EXPIRED",
  "requestId": "req_01HV8PQABC",
  "docUrl": "https://docs.waiass.io/errors/AUTH_KEY_EXPIRED",
  "retryable": false
}

// 에이전트 상태 에러
{
  "type": "https://api.waiass.io/errors/agent-state-conflict",
  "title": "Agent State Conflict",
  "status": 409,
  "detail": "Agent agt_xyz is currently SUSPENDED. Resume the agent before executing transactions.",
  "instance": "/api/v1/transactions",
  "code": "AGENT_SUSPENDED",
  "requestId": "req_01HV8PQDEF",
  "docUrl": "https://docs.waiass.io/errors/AGENT_SUSPENDED",
  "retryable": false
}
```

### SDK 인터페이스 설계 (TypeScript)

```typescript
// Source: Azure SDK Guidelines + Stripe SDK 패턴

// === Client 생성 ===
class WaiassClient {
  constructor(apiKey: string, options?: WaiassClientOptions);

  // Sub-clients
  readonly agents: AgentsClient;
  readonly transactions: TransactionsClient;
  readonly owner: OwnerClient;
  readonly webhooks: WebhooksClient;
}

interface WaiassClientOptions {
  baseUrl?: string;           // 기본: https://api.waiass.io/api/v1
  network?: 'mainnet' | 'devnet' | 'testnet';
  timeoutInMs?: number;       // 기본: 30000
  retryOptions?: RetryOptions;
  logger?: Logger;
}

// === Agents Client ===
interface AgentsClient {
  createAgent(options: CreateAgentOptions): Promise<Agent>;
  getAgent(agentId: string): Promise<Agent>;
  listAgents(options?: ListAgentsOptions): PagedAsyncIterableIterator<Agent>;
  updateAgent(agentId: string, options: UpdateAgentOptions): Promise<Agent>;
  deleteAgent(agentId: string): Promise<void>;
  suspendAgent(agentId: string, options?: SuspendAgentOptions): Promise<Agent>;
  resumeAgent(agentId: string): Promise<Agent>;
  rotateKey(agentId: string): Promise<KeyRotationResult>;
  getBalance(agentId: string): Promise<Balance>;
  getPolicy(agentId: string): Promise<AgentPolicy>;
  updatePolicy(agentId: string, policy: UpdatePolicyOptions): Promise<AgentPolicy>;
}

// === Transactions Client ===
interface TransactionsClient {
  executeTransaction(options: ExecuteTransactionOptions): Promise<TransactionResult>;
  getTransaction(txId: string): Promise<Transaction>;
  listTransactions(agentId: string, options?: ListTransactionsOptions): PagedAsyncIterableIterator<Transaction>;
}

// === Owner Client ===
interface OwnerClient {
  getDashboard(): Promise<OwnerDashboard>;
  getGlobalBudget(): Promise<GlobalBudgetLimit>;
  updateGlobalBudget(options: UpdateGlobalBudgetOptions): Promise<GlobalBudgetLimit>;
  transferFunds(options: TransferFundsOptions): Promise<TransferResult>;
  emergencySuspendAll(): Promise<BatchOperationResult>;
}

// === PagedAsyncIterableIterator (Azure SDK 패턴) ===
interface PagedAsyncIterableIterator<T> extends AsyncIterableIterator<T> {
  byPage(settings?: PageSettings): AsyncIterableIterator<T[]>;
}

interface PageSettings {
  continuationToken?: string;
  maxPageSize?: number;
}
```

### SDK 인터페이스 설계 (Python)

```python
# Source: Stripe Python SDK + Azure SDK 패턴

from typing import Optional, AsyncIterator, List
from dataclasses import dataclass

class WaiassClient:
    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = "https://api.waiass.io/api/v1",
        network: str = "mainnet",  # mainnet | devnet | testnet
        timeout: float = 30.0,
    ) -> None: ...

    @property
    def agents(self) -> AgentsClient: ...

    @property
    def transactions(self) -> TransactionsClient: ...

    @property
    def owner(self) -> OwnerClient: ...


class AgentsClient:
    async def create(self, *, nickname: str, budget_config: BudgetConfig, **kwargs) -> Agent: ...
    async def get(self, agent_id: str) -> Agent: ...
    def list(self, **kwargs) -> AsyncPaginator[Agent]: ...
    async def update(self, agent_id: str, **kwargs) -> Agent: ...
    async def delete(self, agent_id: str) -> None: ...
    async def suspend(self, agent_id: str, *, reason: Optional[str] = None) -> Agent: ...
    async def resume(self, agent_id: str) -> Agent: ...
    async def get_balance(self, agent_id: str) -> Balance: ...
    async def get_policy(self, agent_id: str) -> AgentPolicy: ...
    async def update_policy(self, agent_id: str, **kwargs) -> AgentPolicy: ...


class TransactionsClient:
    async def execute(self, *, to: str, amount: str, mint: Optional[str] = None, **kwargs) -> TransactionResult: ...
    async def get(self, tx_id: str) -> Transaction: ...
    def list(self, agent_id: str, **kwargs) -> AsyncPaginator[Transaction]: ...


# AsyncPaginator for auto-pagination
class AsyncPaginator[T]:
    def __aiter__(self) -> AsyncIterator[T]: ...
    async def __anext__(self) -> T: ...
    def pages(self) -> AsyncIterator[List[T]]: ...
```

### Webhook 이벤트 설계

```typescript
// Source: Stripe Webhook + Phase 3 ARCH-03 트랜잭션 상태

// Webhook 이벤트 타입
type WebhookEventType =
  // 트랜잭션 이벤트
  | 'transaction.submitted'       // 온체인 제출됨
  | 'transaction.confirmed'       // 블록 확정
  | 'transaction.failed'          // 실패
  | 'transaction.rejected'        // 정책 거부
  // 에이전트 이벤트
  | 'agent.created'               // 에이전트 생성 완료
  | 'agent.suspended'             // 에이전트 정지
  | 'agent.resumed'               // 에이전트 재활성화
  | 'agent.terminated'            // 에이전트 폐기 완료
  | 'agent.key_rotated'           // 키 로테이션 완료
  // 정책 이벤트
  | 'policy.violation'            // 정책 위반 감지
  | 'policy.escalation'           // 에스컬레이션 트리거
  // 자금 이벤트
  | 'funding.deposit_confirmed'   // 충전 확정
  | 'funding.withdrawal_confirmed'// 회수 확정
  | 'funding.low_balance'         // 잔액 부족 알림
  // 비상 이벤트
  | 'emergency.triggered'         // 비상 트리거 발동
  | 'emergency.recovery_complete';// 비상 회수 완료

// Webhook 페이로드
interface WebhookEvent {
  id: string;                     // evt_xxx
  type: WebhookEventType;
  createdAt: string;              // ISO 8601
  data: Record<string, unknown>;  // 이벤트별 데이터
  agentId?: string;               // 관련 에이전트 ID
  requestId?: string;             // 원본 요청 ID
}

// Webhook 전달 정책
// - HMAC-SHA256 서명 (X-WAIaaS-Signature 헤더)
// - 재시도: 최대 3회, exponential backoff (1초, 5초, 25초)
// - 타임아웃: 5초 내 2xx 응답 필요
```

## State of the Art

| 이전 접근 | 현재 접근 | 변경 시점 | Phase 5 영향 |
|----------|----------|----------|-------------|
| 수동 OpenAPI YAML 작성 | Code-First 자동 생성 (Zod/TypeBox → OpenAPI) | 2024-2025 | Zod 스키마가 OpenAPI 스펙 + 타입 + 검증의 SSoT |
| OAuth 2.0 다양한 Grant 혼합 | OAuth 2.1 (PKCE 필수, Implicit 폐지) | 2025 IETF Draft | 모든 OAuth 플로우에 PKCE 필수 적용 |
| 커스텀 에러 포맷 | RFC 9457 Problem Details | 2023 RFC 발행 | 표준 에러 응답 포맷으로 채택 |
| OpenAI Function Calling / Assistants API | MCP (Model Context Protocol) | 2024-11 Anthropic 발표, 2025 범용 채택 | MCP가 에이전트-도구 연동 표준. OpenAI Assistants API 2026 중반 sunset |
| REST API만 제공 | REST + MCP Tools 이중 제공 | 2025-2026 | AI 에이전트 프레임워크 연동 시 MCP 필수 |
| 정적 API Key만 | API Key + OAuth 2.1 + DCR | 2025-2026 | Dynamic Client Registration으로 에이전트별 고유 인증 |
| Swagger 2.0 | OpenAPI 3.0.3 / 3.1.0 | 2021+ | @fastify/swagger v9.x가 3.0.3 기본, 3.1.0 지원 |

**Deprecated/outdated:**
- **OAuth 2.0 Implicit Grant:** OAuth 2.1에서 공식 폐지. 토큰이 브라우저 URL에 노출되는 보안 문제.
- **RFC 7807:** RFC 9457로 업데이트됨. 하위 호환되지만 새 프로젝트는 9457 참조.
- **OpenAI Assistants API:** 2026년 중반 sunset 예정. MCP로 전환 권장.
- **Swagger 2.0 (OpenAPI 2.0):** @fastify/swagger가 지원하지만, 새 프로젝트는 3.0+ 사용.

## Open Questions

### 1. Fastify + Zod + OpenAPI 3.0의 $ref 처리

- **What we know:** fastify-type-provider-zod가 Zod 스키마를 JSON Schema로 변환하고 @fastify/swagger가 OpenAPI 문서를 생성함. Zod v4의 글로벌 레지스트리로 $ref 참조 지원.
- **What's unclear:** 복잡한 중첩 스키마(예: AgentPolicy 내 BudgetConfig 내 OnChainSpendingLimit)에서 $ref 해결이 OpenAPI 3.0에서 올바르게 작동하는지 실제 테스트 필요.
- **Recommendation:** 설계 단계에서는 스키마 구조를 정의하되, 구현 시 Devnet 환경에서 자동 생성된 OpenAPI 스펙 검증 필요.
- **Confidence:** MEDIUM

### 2. MCP 인증과 WAIaaS 인증의 통합

- **What we know:** MCP 스펙은 OAuth 2.1 기반 인증을 요구하며, Protected Resource Metadata (PRM) 노출을 권장. WAIaaS는 API Key + OAuth 2.1 이중 모델.
- **What's unclear:** MCP 클라이언트(AI 에이전트 프레임워크)가 WAIaaS의 API Key를 직접 사용할 수 있는지, 아니면 반드시 OAuth 2.1 플로우를 거쳐야 하는지.
- **Recommendation:** MCP 서버에서 API Key를 OAuth Bearer Token으로 취급하는 어댑터 레이어 설계. MCP 클라이언트가 표준 OAuth 플로우 또는 API Key 직접 전달 모두 지원.
- **Confidence:** MEDIUM

### 3. SDK 자동 생성 vs 수동 작성

- **What we know:** Fern, Speakeasy 등 SDK 생성기가 OpenAPI 스펙에서 TypeScript/Python SDK를 자동 생성 가능. 그러나 지갑 서비스의 도메인 특성(BigInt 처리, 키 관리, 정책 모델)이 자동 생성에 적합한지 불확실.
- **What's unclear:** 자동 생성 SDK가 WAIaaS의 복잡한 도메인 모델(AgentPolicy, BudgetConfig, EmergencyRecoveryConfig)을 올바르게 타이핑하는지.
- **Recommendation:** Phase 5에서는 SDK 인터페이스를 수동 설계하되, OpenAPI 스펙과의 일관성을 보장. 구현 시 SDK 생성기를 평가하여 선택.
- **Confidence:** LOW - SDK 생성기의 실제 출력 품질은 테스트 필요

### 4. Webhook 서명 검증 방식

- **What we know:** Stripe는 HMAC-SHA256로 Webhook 서명 검증. Coinbase는 유사 패턴.
- **What's unclear:** WAIaaS가 다수의 Webhook 엔드포인트를 관리해야 할 때(멀티 에이전트 환경), 서명 키 관리의 구체적 방식.
- **Recommendation:** Webhook 엔드포인트당 고유 서명 키(signing secret) 발급. 소유자가 대시보드에서 키 확인 및 로테이션 가능하도록 설계.
- **Confidence:** HIGH - 업계 표준 패턴

### 5. Rate Limiting 전략의 세분화

- **What we know:** API Key별 rate limit이 기본. Stripe는 25 read/sec, 100 read/sec 등 계층적 rate limit.
- **What's unclear:** 에이전트별, 소유자별, 엔드포인트별 rate limit을 어떤 조합으로 적용할지.
- **Recommendation:** 3-Layer rate limiting: (1) IP 기반 글로벌 한도, (2) API Key별 한도 (소유자 등급에 따라), (3) 에이전트별 트랜잭션 빈도 한도 (정책 시간 제어와 연동). 설계 문서에서 각 레이어의 기본값과 커스터마이징 범위 정의.
- **Confidence:** MEDIUM

## Sources

### Primary (HIGH confidence)

- [MCP 공식 사양 (2025-11-25/2025-06-18)](https://modelcontextprotocol.io/specification/2025-11-25) - 프로토콜 구조, Tools/Resources/Prompts 정의
- [MCP Tools 사양](https://modelcontextprotocol.io/docs/concepts/tools) - Tool 정의 스키마, inputSchema, outputSchema, 호출 형식
- [MCP Resources 사양](https://modelcontextprotocol.io/docs/concepts/resources) - Resource 정의, URI 스킴, 구독
- [@modelcontextprotocol/sdk GitHub](https://github.com/modelcontextprotocol/typescript-sdk) - 공식 TypeScript SDK
- [Stripe API Errors](https://docs.stripe.com/api/errors) - 에러 응답 구조, 타입, 코드
- [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) - Problem Details for HTTP APIs
- [Azure TypeScript SDK Guidelines](https://azure.github.io/azure-sdk/typescript_design.html) - SDK 설계 패턴, Options Bag, 페이지네이션
- [@fastify/swagger GitHub](https://github.com/fastify/fastify-swagger) - OpenAPI 자동 생성, 동적/정적 모드
- [fastify-type-provider-zod GitHub](https://github.com/turkerdev/fastify-type-provider-zod) - Zod → OpenAPI 통합

### Secondary (MEDIUM confidence)

- [MCP + OAuth 2.1 (Aembit)](https://aembit.io/blog/mcp-oauth-2-1-pkce-and-the-future-of-ai-authorization/) - MCP 인증, PKCE, 에이전트 인증 패턴
- [OAuth 2.1 IETF Draft](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/) - OAuth 2.1 사양 현황
- [MCP Auth & Authorization (CSA)](https://cloudsecurityalliance.org/blog/2025/05/28/mcp-oauth-2-1-pkce-and-the-future-of-ai-authorization) - MCP 보안 모델
- [Swagger + RFC 9457 가이드](https://swagger.io/blog/problem-details-rfc9457-doing-api-errors-well/) - RFC 9457 실무 적용
- [Stripe Error Codes](https://docs.stripe.com/error-codes) - 계층적 에러 코드 레지스트리
- [API Governance Best Practices 2026 (Treblle)](https://treblle.com/blog/api-governance-best-practices) - API 거버넌스, deprecation 정책
- [Modern API Design Best Practices 2026 (Xano)](https://www.xano.com/blog/modern-api-design-best-practices/) - AI 에이전트 준비, REST 성숙도
- [OpenAI Authentication 2025](https://www.datastudios.org/post/openai-authentication-in-2025-api-keys-service-accounts-and-secure-token-flows-for-developers-and) - 프로젝트 스코핑, 서비스 계정 패턴

### Tertiary (LOW confidence)

- [Fern SDK Generator](https://buildwithfern.com/post/generate-typescript-sdk) - 다중 언어 SDK 생성기 (평가 필요)
- [FastMCP Framework](https://github.com/punkpeye/fastmcp) - MCP 서버 고수준 프레임워크 (공식 SDK 대안)
- [Dynamic Client Registration](https://www.scalekit.com/blog/dynamic-client-registration-oauth2) - DCR 패턴 (구현 시 검증 필요)

## Metadata

**Confidence breakdown:**
- OpenAPI/Fastify 스택: HIGH - 공식 플러그인, npm 레지스트리, GitHub 소스 확인
- 인증 모델 (API Key + OAuth 2.1): HIGH - 업계 표준, MCP 스펙, IETF Draft 확인
- 에러 코드 (RFC 9457 + Stripe): HIGH - IETF RFC, Stripe 공식 문서 확인
- MCP 통합: HIGH - 공식 사양, 공식 SDK, 다수 기업 채택 확인
- SDK 인터페이스 설계: MEDIUM - Azure Guidelines 확인되었으나, WAIaaS 도메인 특화 패턴은 자체 설계 필요
- 정책/권한 모델: MEDIUM - RBAC+ABAC 하이브리드는 표준이나, Phase 4 정책의 API 매핑은 프로젝트 고유
- Rate Limiting: MEDIUM - 기본 패턴은 표준이나, 에이전트 특화 세분화는 자체 설계 필요

**Research date:** 2026-02-05
**Valid until:** 2026-03-07 (30일 - MCP 생태계가 빠르게 진화 중이므로 MCP 관련은 2주 후 재확인 권장)
