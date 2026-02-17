# OpenAPI 3.0 REST API 스펙 설계 (API-01)

**문서 ID:** API-01
**작성일:** 2026-02-05
**상태:** 완료
**참조:** API-02 (18-authentication-model.md), API-03 (19-permission-policy-model.md), API-04 (20-error-codes.md), ARCH-03 (10-transaction-flow.md), REL-01~REL-05 (Phase 4 전체)

---

## 1. 개요: API 설계 원칙

### 1.1 Zod as Single Source of Truth

WAIaaS API는 **Zod 스키마를 단일 소스(Single Source of Truth)**로 사용하여 TypeScript 타입, 런타임 검증, OpenAPI 3.0 스키마를 동시에 생성한다. 이를 통해 스펙-코드 간 drift를 원천적으로 방지한다.

```
Zod Schema (SSoT)
  ├── TypeScript Type   (z.infer<typeof Schema>)
  ├── Runtime Validation (fastify-type-provider-zod)
  └── OpenAPI Schema    (@fastify/swagger 자동 생성)
```

**구현 전략:**
- `fastify-type-provider-zod`의 `jsonSchemaTransform`이 Zod 스키마를 JSON Schema로 변환
- `@fastify/swagger`가 JSON Schema를 OpenAPI 3.0 스펙으로 집계
- `@fastify/swagger-ui`가 Swagger UI를 `/docs` 경로에 서빙
- CI/CD에서 `oasdiff`로 스펙 변경 감지 및 breaking change 경고

### 1.2 API 버전 관리

| 전략 | 방식 | 설명 |
|------|------|------|
| **Major 버전** | URL 경로 | `/api/v1/` -> `/api/v2/` |
| **Minor 버전** | 헤더 | `X-API-Version: 2026-02-01` (날짜 기반) |
| **Deprecation** | Sunset 헤더 | `Sunset: Sat, 01 Jan 2028 00:00:00 GMT` |
| **하위 호환** | 기본 원칙 | 새 optional 필드, 새 엔드포인트는 minor 버전 |

### 1.3 일관된 응답 구조

**성공 응답:**
- 단일 리소스: HTTP 200 (조회/수정) 또는 201 (생성) + 리소스 JSON
- 비동기 작업: HTTP 202 Accepted + 작업 상태 JSON
- 삭제: HTTP 204 No Content

**에러 응답:**
- 모든 에러: RFC 9457 WalletApiError 구조
- Content-Type: `application/problem+json`

**공통 헤더:**
- `X-Request-Id`: 모든 응답에 포함, 요청 추적용
- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`: Rate Limit 정보

### 1.4 페이지네이션

**커서 기반 페이지네이션:**
- 쿼리 파라미터: `cursor` (opaque string) + `limit` (기본 20, 최대 100)
- 응답: `items[]`, `cursor` (다음 페이지), `hasMore` (boolean), `total` (전체 개수, optional)
- `Link` 헤더: `<https://api.waiass.io/api/v1/agents?cursor=xxx&limit=20>; rel="next"`

**이유:** offset 기반은 대량 데이터에서 성능 저하. 커서 기반은 일관된 성능과 실시간 데이터 변경에 안전.

### 1.5 필터링 및 정렬

| 파라미터 | 타입 | 설명 | 예시 |
|----------|------|------|------|
| `status` | string | 상태 필터 | `?status=ACTIVE` |
| `createdAfter` | ISO 8601 | 생성일 이후 | `?createdAfter=2026-01-01T00:00:00Z` |
| `createdBefore` | ISO 8601 | 생성일 이전 | `?createdBefore=2026-02-01T00:00:00Z` |
| `sortBy` | string | 정렬 기준 | `?sortBy=createdAt` |
| `sortOrder` | asc/desc | 정렬 방향 | `?sortOrder=desc` |

### 1.6 요청 ID 추적

모든 API 요청에 고유 `X-Request-Id` 헤더가 자동 생성된다. 클라이언트가 직접 제공할 수도 있다 (멱등성 키 역할).

- 에러 응답의 `requestId` 필드와 동일
- 로그, Webhook 이벤트, 트랜잭션 기록에 전파
- 형식: `req_` + 26자 ULID (예: `req_01HV8PQXYZ9ABC2DEF3GHI4JKL`)

---

## 2. OpenAPI 3.0 스펙 메타데이터

### 2.1 스펙 기본 정보 (YAML)

```yaml
openapi: 3.0.3
info:
  title: WAIaaS - Wallet as a Service for AI Agents
  description: |
    AI 에이전트를 위한 자율적 온체인 지갑 서비스 API.
    에이전트가 Solana 블록체인에서 안전하게 트랜잭션을 실행하고,
    소유자가 정책 기반으로 자금 통제권을 유지할 수 있는 REST API를 제공한다.
  version: 1.0.0
  contact:
    name: WAIaaS Team
    url: https://docs.waiass.io
    email: support@waiass.io
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT

servers:
  - url: https://api.waiass.io/api/v1
    description: Production (Mainnet)
  - url: https://api-testnet.waiass.io/api/v1
    description: Testnet (Devnet)

tags:
  - name: Agents
    description: 에이전트 생명주기 관리 (생성, 수정, 정지, 재활성화, 삭제, 키 로테이션)
  - name: Transactions
    description: 트랜잭션 실행 및 조회 (비동기 202 + Webhook 패턴)
  - name: Funding
    description: 에이전트 자금 충전, 회수, 잔액 조회, 에이전트 간 이동
  - name: Policies
    description: 에이전트 정책 조회, 변경, 사용량 모니터링
  - name: Owner
    description: 소유자 통합 대시보드, 에이전트 요약, 글로벌 예산 관리
  - name: Emergency
    description: 비상 정지, 비상 회수, 전체 에이전트 비상 정지
  - name: Webhooks
    description: 웹훅 엔드포인트 등록, 관리, 테스트 전송
  - name: Auth
    description: API Key 생성/관리, OAuth 2.1 토큰 발급
```

### 2.2 보안 스키마 (securitySchemes)

API-02 (18-authentication-model.md) 기반의 보안 정의.

```yaml
security:
  - ApiKeyAuth: []
  - OAuth2: []

components:
  securitySchemes:
    ApiKeyAuth:
      type: http
      scheme: bearer
      description: |
        API Key 인증. Authorization: Bearer wai_live_xxx 또는 wai_test_xxx.
        - wai_live_*: Production (Mainnet) 환경용
        - wai_test_*: Development (Devnet) 환경용
        SHA-256 해싱 저장. 생성 시 한 번만 원본 반환.
    OAuth2:
      type: oauth2
      flows:
        clientCredentials:
          tokenUrl: /oauth/token
          scopes:
            agents:read: 에이전트 정보 조회
            agents:write: 에이전트 생성/수정
            agents:delete: 에이전트 삭제
            transactions:read: 트랜잭션 조회
            transactions:execute: 트랜잭션 실행
            wallets:read: 지갑 정보 조회
            wallets:fund: 자금 충전/회수
            policies:read: 정책 조회
            policies:write: 정책 변경
            dashboard:read: 대시보드 조회
            admin:all: 전체 관리자 권한
```

---

## 3. 공통 스키마 정의 (components/schemas)

### 3.1 페이지네이션 응답 스키마

**Zod 스키마:**

```typescript
import { z } from 'zod';

export const PaginatedResponse = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema).describe('리소스 목록'),
    cursor: z.string().nullable().describe('다음 페이지 커서 (null이면 마지막 페이지)'),
    hasMore: z.boolean().describe('다음 페이지 존재 여부'),
    total: z.number().int().optional().describe('전체 리소스 수 (optional)'),
  });
```

**OpenAPI YAML:**

```yaml
PaginatedResponse:
  type: object
  properties:
    items:
      type: array
      description: 리소스 목록
    cursor:
      type: string
      nullable: true
      description: 다음 페이지 커서 (null이면 마지막 페이지)
    hasMore:
      type: boolean
      description: 다음 페이지 존재 여부
    total:
      type: integer
      description: 전체 리소스 수 (optional)
  required: [items, hasMore]
```

### 3.2 에러 응답 스키마 (WalletApiError)

API-04 (20-error-codes.md) 기반. RFC 9457 + Stripe 확장.

**Zod 스키마:**

```typescript
export const WalletApiErrorSchema = z.object({
  // RFC 9457 표준 필드
  type: z.string().url().describe('에러 타입 URI'),
  title: z.string().describe('짧은 에러 제목'),
  status: z.number().int().describe('HTTP 상태 코드'),
  detail: z.string().describe('상세 에러 설명'),
  instance: z.string().describe('요청 인스턴스 URI'),
  // Stripe 스타일 확장 필드
  code: z.string().describe('도메인 에러 코드 (SCREAMING_SNAKE_CASE)'),
  param: z.string().optional().describe('문제의 파라미터명'),
  requestId: z.string().describe('요청 추적 ID'),
  docUrl: z.string().url().describe('에러 문서 URL'),
  retryable: z.boolean().describe('재시도 가능 여부'),
  escalation: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional()
    .describe('에스컬레이션 수준'),
});
```

**OpenAPI YAML:**

```yaml
WalletApiError:
  type: object
  description: RFC 9457 Problem Details + Stripe 확장 에러 응답
  properties:
    type:
      type: string
      format: uri
      example: "https://api.waiass.io/errors/policy-violation"
    title:
      type: string
      example: "Policy Violation"
    status:
      type: integer
      example: 403
    detail:
      type: string
      example: "Transaction amount 5 SOL exceeds daily limit of 2 SOL"
    instance:
      type: string
      example: "/api/v1/transactions"
    code:
      type: string
      example: "POLICY_DAILY_LIMIT_EXCEEDED"
    param:
      type: string
      example: "amount"
    requestId:
      type: string
      example: "req_01HV8PQXYZ"
    docUrl:
      type: string
      format: uri
      example: "https://docs.waiass.io/errors/POLICY_DAILY_LIMIT_EXCEEDED"
    retryable:
      type: boolean
      example: false
    escalation:
      type: string
      enum: [LOW, MEDIUM, HIGH, CRITICAL]
      example: "LOW"
  required: [type, title, status, detail, instance, code, requestId, docUrl, retryable]
```

### 3.3 도메인 스키마

#### 3.3.1 Agent

REL-03 (15-agent-lifecycle-management.md) 기반 5단계 상태 모델.

**Zod 스키마:**

```typescript
export const AgentStatus = z.enum([
  'CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATING', 'TERMINATED'
]);

export const AgentSchema = z.object({
  id: z.string().describe('에이전트 ID (agt_xxx)'),
  nickname: z.string().max(50).describe('에이전트 별칭'),
  status: AgentStatus.describe('에이전트 상태 (5단계 상태 모델)'),
  ownerId: z.string().describe('소유자 ID'),
  multisigAddress: z.string().describe('Squads 멀티시그 주소 (Base58)'),
  vaultAddress: z.string().describe('Vault PDA 주소 (Base58)'),
  agentPublicKey: z.string().describe('에이전트 공개키 (Base58)'),
  tags: z.array(z.string()).max(10).default([]).describe('태그 목록'),
  createdAt: z.string().datetime().describe('생성일시 (ISO 8601)'),
  updatedAt: z.string().datetime().describe('수정일시 (ISO 8601)'),
});

export type Agent = z.infer<typeof AgentSchema>;
```

**OpenAPI YAML:**

```yaml
Agent:
  type: object
  properties:
    id:
      type: string
      example: "agt_01HV8PQ"
    nickname:
      type: string
      maxLength: 50
      example: "trading-bot-alpha"
    status:
      type: string
      enum: [CREATING, ACTIVE, SUSPENDED, TERMINATING, TERMINATED]
      example: "ACTIVE"
    ownerId:
      type: string
      example: "own_01HV8PQ"
    multisigAddress:
      type: string
      example: "Sq5d...7xKp"
    vaultAddress:
      type: string
      example: "VLt3...9mNq"
    agentPublicKey:
      type: string
      example: "AgKy...2bRf"
    tags:
      type: array
      items:
        type: string
      maxItems: 10
      example: ["trading", "defi"]
    createdAt:
      type: string
      format: date-time
    updatedAt:
      type: string
      format: date-time
  required: [id, nickname, status, ownerId, multisigAddress, vaultAddress, agentPublicKey, createdAt, updatedAt]
```

#### 3.3.2 AgentPolicy

API-03 (19-permission-policy-model.md) 기반 4가지 정책 속성.

**Zod 스키마:**

```typescript
export const AgentPolicySchema = z.object({
  limits: z.object({
    perTransaction: z.string().describe('건당 한도 (lamports)'),
    daily: z.string().describe('일일 한도 (lamports)'),
    weekly: z.string().describe('주간 한도 (lamports)'),
    monthly: z.string().describe('월간 한도 (lamports)'),
  }).describe('금액 한도 (REL-01 BudgetConfig 기반)'),
  whitelist: z.object({
    allowedDestinations: z.array(z.string()).default([])
      .describe('허용 목적지 주소 (빈 배열 = 전체 허용)'),
    allowedPrograms: z.array(z.string()).default([])
      .describe('허용 프로그램 ID (빈 배열 = 전체 허용)'),
    allowedTokenMints: z.array(z.string()).default([])
      .describe('허용 토큰 민트 (빈 배열 = 전체 허용)'),
  }).describe('화이트리스트'),
  timeControl: z.object({
    operatingHoursUtc: z.object({
      start: z.number().int().min(0).max(23),
      end: z.number().int().min(0).max(23),
    }).nullable().describe('운영 시간 UTC (null = 24/7)'),
    blackoutDates: z.array(z.string()).default([])
      .describe('거래 금지일 (ISO 8601 날짜)'),
  }).describe('시간 제어'),
  escalation: z.object({
    thresholds: z.object({
      low: z.string().describe('알림만 (lamports)'),
      medium: z.string().describe('소유자 승인 필요 (lamports)'),
      high: z.string().describe('지갑 동결 (lamports)'),
      critical: z.string().describe('키 해제 (lamports)'),
    }),
  }).describe('에스컬레이션 (ARCH-03 4-tier)'),
});

export type AgentPolicy = z.infer<typeof AgentPolicySchema>;
```

#### 3.3.3 BudgetConfig

REL-01 (13-fund-deposit-process.md) 기반 예산 설정.

```typescript
export const BudgetConfigSchema = z.object({
  dailyLimit: z.string().describe('일일 한도 (lamports)'),
  weeklyLimit: z.string().describe('주간 한도 (lamports)'),
  monthlyLimit: z.string().describe('월간 한도 (lamports)'),
  perTransactionLimit: z.string().describe('건당 한도 (lamports)'),
});

export type BudgetConfig = z.infer<typeof BudgetConfigSchema>;
```

#### 3.3.4 Transaction

ARCH-03 (10-transaction-flow.md) 기반 트랜잭션 상태.

**Zod 스키마:**

```typescript
export const TransactionStatus = z.enum([
  'PENDING',      // 정책 검증 중
  'APPROVED',     // 정책 통과, 서명 대기
  'SUBMITTED',    // 온체인 제출됨
  'CONFIRMED',    // 블록 확정 (finalized)
  'FAILED',       // 실패
  'REJECTED',     // 정책 거부
  'EXPIRED',      // blockhash 만료
]);

export const TransactionSchema = z.object({
  id: z.string().describe('트랜잭션 ID (tx_xxx)'),
  agentId: z.string().describe('에이전트 ID'),
  type: z.enum(['TRANSFER', 'TOKEN_TRANSFER']).describe('트랜잭션 유형'),
  to: z.string().describe('목적지 주소 (Base58)'),
  amount: z.string().describe('금액 (lamports)'),
  mint: z.string().nullable().describe('SPL 토큰 민트 주소 (null = SOL)'),
  memo: z.string().nullable().optional().describe('메모'),
  status: TransactionStatus.describe('트랜잭션 상태'),
  txSignature: z.string().nullable().describe('온체인 트랜잭션 서명 (null = 미제출)'),
  escalationLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).nullable()
    .describe('에스컬레이션 수준'),
  policyChecks: z.object({
    serverPolicy: z.boolean().describe('서버 정책 검증 통과'),
    enclavePolicy: z.boolean().nullable().describe('Enclave 정책 검증 통과'),
    onChainPolicy: z.boolean().nullable().describe('Squads 온체인 정책 통과'),
  }).optional().describe('3중 정책 검증 결과 (ARCH-03)'),
  createdAt: z.string().datetime().describe('생성일시'),
  confirmedAt: z.string().datetime().nullable().describe('확정일시'),
});

export type Transaction = z.infer<typeof TransactionSchema>;
```

#### 3.3.5 Balance

```typescript
export const TokenBalanceSchema = z.object({
  mint: z.string().describe('SPL 토큰 민트 주소'),
  symbol: z.string().optional().describe('토큰 심볼'),
  amount: z.string().describe('잔액 (원시 단위)'),
  decimals: z.number().int().describe('소수점 자릿수'),
  uiAmount: z.string().describe('사람 가독 잔액'),
});

export const BalanceSchema = z.object({
  sol: z.string().describe('SOL 잔액 (lamports)'),
  solUiAmount: z.string().describe('SOL 잔액 (SOL 단위)'),
  tokens: z.array(TokenBalanceSchema).describe('SPL 토큰 잔액 목록'),
  lastUpdatedAt: z.string().datetime().describe('마지막 업데이트 시각'),
});

export type Balance = z.infer<typeof BalanceSchema>;
```

#### 3.3.6 WebhookEvent

05-RESEARCH.md Webhook 이벤트 설계 기반.

```typescript
export const WebhookEventTypeSchema = z.enum([
  // 트랜잭션 이벤트
  'transaction.submitted',
  'transaction.confirmed',
  'transaction.failed',
  'transaction.rejected',
  // 에이전트 이벤트
  'agent.created',
  'agent.suspended',
  'agent.resumed',
  'agent.terminated',
  'agent.key_rotated',
  // 정책 이벤트
  'policy.violation',
  'policy.escalation',
  // 자금 이벤트
  'funding.deposit_confirmed',
  'funding.withdrawal_confirmed',
  'funding.low_balance',
  // 비상 이벤트
  'emergency.triggered',
  'emergency.recovery_complete',
]);

export const WebhookEventSchema = z.object({
  id: z.string().describe('이벤트 ID (evt_xxx)'),
  type: WebhookEventTypeSchema.describe('이벤트 타입'),
  createdAt: z.string().datetime().describe('이벤트 발생 시각'),
  data: z.record(z.unknown()).describe('이벤트별 데이터'),
  agentId: z.string().optional().describe('관련 에이전트 ID'),
  requestId: z.string().optional().describe('원본 요청 ID'),
});

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;
```

#### 3.3.7 PolicyUsage

```typescript
export const PolicyUsageSchema = z.object({
  daily: z.object({
    used: z.string().describe('금일 사용량 (lamports)'),
    limit: z.string().describe('일일 한도 (lamports)'),
    remaining: z.string().describe('남은 한도 (lamports)'),
    resetAt: z.string().datetime().describe('리셋 시각'),
  }),
  weekly: z.object({
    used: z.string().describe('금주 사용량 (lamports)'),
    limit: z.string().describe('주간 한도 (lamports)'),
    remaining: z.string().describe('남은 한도 (lamports)'),
    resetAt: z.string().datetime().describe('리셋 시각'),
  }),
  monthly: z.object({
    used: z.string().describe('금월 사용량 (lamports)'),
    limit: z.string().describe('월간 한도 (lamports)'),
    remaining: z.string().describe('남은 한도 (lamports)'),
    resetAt: z.string().datetime().describe('리셋 시각'),
  }),
  transactionCount: z.object({
    today: z.number().int().describe('금일 트랜잭션 수'),
    thisWeek: z.number().int().describe('금주 트랜잭션 수'),
    thisMonth: z.number().int().describe('금월 트랜잭션 수'),
  }),
});

export type PolicyUsage = z.infer<typeof PolicyUsageSchema>;
```

---

## 4. 에이전트 관리 API (Agents)

REL-03 (15-agent-lifecycle-management.md) 기반. 에이전트 5단계 상태 모델(CREATING->ACTIVE->SUSPENDED->TERMINATING->TERMINATED)의 CRUD 및 상태 전환.

### 4.1 POST /api/v1/agents -- 에이전트 생성

| 항목 | 값 |
|------|---|
| **메서드** | POST |
| **경로** | `/api/v1/agents` |
| **설명** | 새 에이전트를 생성한다. Squads 멀티시그 생성, Vault PDA 파생, Agent Key 생성(Enclave)을 비동기로 수행하며, 초기 상태는 CREATING. |
| **태그** | Agents |
| **스코프** | `agents:write` |
| **허용 역할** | owner |

**요청 본문 (Zod):**

```typescript
export const CreateAgentRequest = z.object({
  nickname: z.string().min(1).max(50).describe('에이전트 별칭'),
  budgetConfig: BudgetConfigSchema.describe('예산 설정'),
  allowedDestinations: z.array(z.string()).default([])
    .describe('허용 목적지 주소 (빈 배열 = 전체 허용)'),
  replenishmentMode: z.enum(['auto', 'manual']).default('manual')
    .describe('자금 보충 모드 (REL-01)'),
  tags: z.array(z.string()).max(10).default([]).describe('태그 목록'),
});
```

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 201 Created | 에이전트 생성 시작 | `Agent` (status: CREATING) |
| 400 | 검증 에러 | `WalletApiError` |
| 401 | 인증 실패 | `WalletApiError` |
| 403 | 스코프 부족 | `WalletApiError` |

**에러 코드:** `VALIDATION_REQUIRED_FIELD`, `VALIDATION_INVALID_FORMAT`, `VALIDATION_OUT_OF_RANGE`, `AUTH_KEY_INVALID`, `AUTH_KEY_EXPIRED`, `AUTH_SCOPE_INSUFFICIENT`

**OpenAPI YAML:**

```yaml
/agents:
  post:
    tags: [Agents]
    summary: 에이전트 생성
    description: 새 에이전트를 생성한다. 초기 상태는 CREATING이며, 멀티시그/키 생성 완료 후 agent.created 웹훅이 전달된다.
    operationId: createAgent
    security:
      - ApiKeyAuth: []
      - OAuth2: [agents:write]
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/CreateAgentRequest'
    responses:
      '201':
        description: 에이전트 생성 시작
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Agent'
      '400':
        description: 검증 에러
        content:
          application/problem+json:
            schema:
              $ref: '#/components/schemas/WalletApiError'
      '401':
        description: 인증 실패
        content:
          application/problem+json:
            schema:
              $ref: '#/components/schemas/WalletApiError'
```

### 4.2 GET /api/v1/agents -- 에이전트 목록

| 항목 | 값 |
|------|---|
| **메서드** | GET |
| **경로** | `/api/v1/agents` |
| **설명** | 소유자의 에이전트 목록을 조회한다. 커서 기반 페이지네이션 및 상태 필터링 지원. |
| **태그** | Agents |
| **스코프** | `agents:read` |
| **허용 역할** | owner, viewer, auditor |

**쿼리 파라미터:**

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `status` | string | N | 상태 필터 (CREATING, ACTIVE, SUSPENDED, TERMINATING, TERMINATED) |
| `cursor` | string | N | 페이지네이션 커서 |
| `limit` | integer | N | 페이지 크기 (기본 20, 최대 100) |
| `sortBy` | string | N | 정렬 기준 (createdAt, nickname, status) |
| `sortOrder` | string | N | 정렬 방향 (asc, desc. 기본 desc) |

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 에이전트 목록 | `PaginatedResponse<Agent>` |
| 401 | 인증 실패 | `WalletApiError` |

### 4.3 GET /api/v1/agents/:agentId -- 에이전트 상세

| 항목 | 값 |
|------|---|
| **메서드** | GET |
| **경로** | `/api/v1/agents/{agentId}` |
| **설명** | 에이전트 상세 정보를 조회한다. 정책(AgentPolicy)과 잔액(Balance)이 함께 반환된다. |
| **태그** | Agents |
| **스코프** | `agents:read` |
| **허용 역할** | owner, viewer, auditor |

**응답 스키마 (확장):**

```typescript
export const AgentDetailResponse = AgentSchema.extend({
  policy: AgentPolicySchema.describe('현재 적용 중인 정책'),
  balance: BalanceSchema.describe('현재 잔액'),
  policyUsage: PolicyUsageSchema.describe('정책 사용량'),
});
```

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 에이전트 상세 | `AgentDetailResponse` |
| 404 | 에이전트 없음 | `WalletApiError` (code: `AGENT_NOT_FOUND`) |

### 4.4 PATCH /api/v1/agents/:agentId -- 에이전트 수정

| 항목 | 값 |
|------|---|
| **메서드** | PATCH |
| **경로** | `/api/v1/agents/{agentId}` |
| **설명** | 에이전트의 메타데이터(nickname, tags)를 수정한다. 정책 변경은 별도 PUT /policy API 사용. |
| **태그** | Agents |
| **스코프** | `agents:write` |
| **허용 역할** | owner |

**요청 본문:**

```typescript
export const UpdateAgentRequest = z.object({
  nickname: z.string().min(1).max(50).optional().describe('에이전트 별칭'),
  tags: z.array(z.string()).max(10).optional().describe('태그 목록'),
});
```

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 수정된 에이전트 | `Agent` |
| 404 | 에이전트 없음 | `WalletApiError` (code: `AGENT_NOT_FOUND`) |
| 409 | 상태 충돌 | `WalletApiError` (code: `AGENT_TERMINATED`) |

### 4.5 DELETE /api/v1/agents/:agentId -- 에이전트 삭제 (TERMINATED)

| 항목 | 값 |
|------|---|
| **메서드** | DELETE |
| **경로** | `/api/v1/agents/{agentId}` |
| **설명** | 에이전트를 폐기한다 (TERMINATING -> TERMINATED). REL-03 5절 폐기 9단계 프로세스 실행. Vault 잔액 회수, Squads 멤버 제거, Agent Key 파기를 포함. |
| **태그** | Agents |
| **스코프** | `agents:delete` |
| **허용 역할** | owner |

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 202 Accepted | 폐기 프로세스 시작 | `Agent` (status: TERMINATING) |
| 404 | 에이전트 없음 | `WalletApiError` (code: `AGENT_NOT_FOUND`) |
| 409 | 상태 충돌 | `WalletApiError` (code: `AGENT_TERMINATED`, `AGENT_TERMINATING`) |

### 4.6 POST /api/v1/agents/:agentId/suspend -- 에이전트 정지

| 항목 | 값 |
|------|---|
| **메서드** | POST |
| **경로** | `/api/v1/agents/{agentId}/suspend` |
| **설명** | 에이전트를 정지한다 (ACTIVE -> SUSPENDED). Squads SpendingLimit 비활성화 (defense-in-depth, REL-03). |
| **태그** | Agents |
| **스코프** | `agents:write` |
| **허용 역할** | owner |

**요청 본문:**

```typescript
export const SuspendAgentRequest = z.object({
  reason: z.string().max(200).optional().describe('정지 사유'),
});
```

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 정지된 에이전트 | `Agent` (status: SUSPENDED) |
| 404 | 에이전트 없음 | `WalletApiError` (code: `AGENT_NOT_FOUND`) |
| 409 | 이미 정지 상태 | `WalletApiError` (code: `AGENT_SUSPENDED`) |

### 4.7 POST /api/v1/agents/:agentId/resume -- 에이전트 재활성화

| 항목 | 값 |
|------|---|
| **메서드** | POST |
| **경로** | `/api/v1/agents/{agentId}/resume` |
| **설명** | 정지된 에이전트를 재활성화한다 (SUSPENDED -> ACTIVE). 소유자 수동 조작만 허용 (REL-03). |
| **태그** | Agents |
| **스코프** | `agents:write` |
| **허용 역할** | owner |

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 재활성화된 에이전트 | `Agent` (status: ACTIVE) |
| 404 | 에이전트 없음 | `WalletApiError` (code: `AGENT_NOT_FOUND`) |
| 409 | SUSPENDED가 아님 | `WalletApiError` (code: `AGENT_TERMINATED`) |

### 4.8 POST /api/v1/agents/:agentId/rotate-key -- 키 로테이션

| 항목 | 값 |
|------|---|
| **메서드** | POST |
| **경로** | `/api/v1/agents/{agentId}/rotate-key` |
| **설명** | 에이전트 키를 로테이션한다. REL-03 6절 Drain-then-Rotate 패턴 (AddMember -> RemoveMember 순서). 로테이션 중 트랜잭션 차단. |
| **태그** | Agents |
| **스코프** | `agents:write` |
| **허용 역할** | owner |

**응답:**

```typescript
export const KeyRotationResultSchema = z.object({
  agentId: z.string(),
  status: z.enum(['IN_PROGRESS', 'COMPLETED']),
  newPublicKey: z.string().nullable().describe('새 공개키 (완료 시)'),
  startedAt: z.string().datetime(),
  estimatedCompletionAt: z.string().datetime().optional(),
});
```

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 202 Accepted | 키 로테이션 시작 | `KeyRotationResult` |
| 409 | 이미 로테이션 중 | `WalletApiError` (code: `AGENT_KEY_ROTATION_IN_PROGRESS`) |

---

## 5. 트랜잭션 API (Transactions)

ARCH-03 (10-transaction-flow.md) 기반. **"동기 응답(202) + Webhook 알림" 비동기 패턴.** 트랜잭션은 8단계 파이프라인을 거치며 (요청 수신 -> 서버 정책 -> 시뮬레이션 -> Enclave 정책+서명 -> 온체인 제출 -> 확정 대기 -> Webhook 알림 -> 로깅), 정책 검증에서 3중 레이어(서버 -> Enclave -> Squads 온체인)를 통과해야 한다.

### 5.1 POST /api/v1/transactions -- 트랜잭션 실행

| 항목 | 값 |
|------|---|
| **메서드** | POST |
| **경로** | `/api/v1/transactions` |
| **설명** | 트랜잭션 실행을 요청한다. **비동기 처리** - 202 반환 후 3중 정책 검증 및 온체인 서명/제출을 수행하며, 최종 결과는 Webhook으로 전달한다 (ARCH-03). |
| **태그** | Transactions |
| **스코프** | `transactions:execute` |
| **허용 역할** | owner, agent |

**요청 본문:**

```typescript
export const ExecuteTransactionRequest = z.object({
  agentId: z.string().describe('실행 에이전트 ID'),
  to: z.string().describe('목적지 주소 (Base58)'),
  amount: z.string().describe('금액 (lamports)'),
  mint: z.string().nullable().default(null)
    .describe('SPL 토큰 민트 (null = SOL 전송)'),
  memo: z.string().max(200).optional().describe('메모 (optional)'),
  idempotencyKey: z.string().optional()
    .describe('멱등성 키 (중복 제출 방지)'),
});
```

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 202 Accepted | 트랜잭션 접수 | `Transaction` (status: PENDING) |
| 400 | 검증 에러 | `WalletApiError` (code: `VALIDATION_*`) |
| 403 | 정책 위반 | `WalletApiError` (code: `POLICY_*`) |
| 409 | 상태 충돌 | `WalletApiError` (code: `AGENT_SUSPENDED`, `AGENT_CREATING`, `AGENT_KEY_ROTATION_IN_PROGRESS`, `TRANSACTION_ALREADY_SUBMITTED`) |
| 422 | 시뮬레이션 실패 | `WalletApiError` (code: `TRANSACTION_SIMULATION_FAILED`, `TRANSACTION_INSUFFICIENT_BALANCE`) |

**에러 코드 전체 목록:** `VALIDATION_REQUIRED_FIELD`, `VALIDATION_INVALID_FORMAT`, `POLICY_PER_TX_LIMIT_EXCEEDED`, `POLICY_DAILY_LIMIT_EXCEEDED`, `POLICY_WEEKLY_LIMIT_EXCEEDED`, `POLICY_MONTHLY_LIMIT_EXCEEDED`, `POLICY_DESTINATION_NOT_ALLOWED`, `POLICY_PROGRAM_NOT_ALLOWED`, `POLICY_TOKEN_NOT_ALLOWED`, `POLICY_OUTSIDE_OPERATING_HOURS`, `POLICY_BLACKOUT_DATE`, `POLICY_GLOBAL_BUDGET_EXCEEDED`, `AGENT_SUSPENDED`, `AGENT_CREATING`, `AGENT_KEY_ROTATION_IN_PROGRESS`, `TRANSACTION_ALREADY_SUBMITTED`, `TRANSACTION_SIMULATION_FAILED`, `TRANSACTION_INSUFFICIENT_BALANCE`

**비동기 흐름:**

```
Client                     WAIaaS Server                  Solana
  |-- POST /transactions -->|                               |
  |<-- 202 Accepted (PENDING)|                              |
  |                          |-- 서버 정책 검증 ------------>|
  |                          |-- Enclave 정책+서명 --------->|
  |                          |-- 온체인 제출 --------------->|
  |                          |                    <-- 블록 확정|
  |<-- Webhook: transaction.confirmed ------------|          |
```

### 5.2 GET /api/v1/transactions/:txId -- 트랜잭션 상태

| 항목 | 값 |
|------|---|
| **메서드** | GET |
| **경로** | `/api/v1/transactions/{txId}` |
| **설명** | 트랜잭션 상태를 조회한다. Webhook을 받기 전 폴링용으로도 사용 가능. |
| **태그** | Transactions |
| **스코프** | `transactions:read` |
| **허용 역할** | owner, agent, viewer, auditor |

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 트랜잭션 상세 | `Transaction` |
| 404 | 트랜잭션 없음 | `WalletApiError` (code: `TRANSACTION_NOT_FOUND`) |

### 5.3 GET /api/v1/agents/:agentId/transactions -- 에이전트 거래 내역

| 항목 | 값 |
|------|---|
| **메서드** | GET |
| **경로** | `/api/v1/agents/{agentId}/transactions` |
| **설명** | 특정 에이전트의 거래 내역을 조회한다. 커서 기반 페이지네이션 및 필터링 지원. |
| **태그** | Transactions |
| **스코프** | `transactions:read` |
| **허용 역할** | owner, agent, viewer, auditor |

**쿼리 파라미터:**

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `status` | string | N | 상태 필터 (PENDING, APPROVED, SUBMITTED, CONFIRMED, FAILED, REJECTED, EXPIRED) |
| `type` | string | N | 유형 필터 (TRANSFER, TOKEN_TRANSFER) |
| `createdAfter` | ISO 8601 | N | 생성일 이후 |
| `createdBefore` | ISO 8601 | N | 생성일 이전 |
| `cursor` | string | N | 페이지네이션 커서 |
| `limit` | integer | N | 페이지 크기 (기본 20, 최대 100) |

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 거래 내역 | `PaginatedResponse<Transaction>` |
| 404 | 에이전트 없음 | `WalletApiError` (code: `AGENT_NOT_FOUND`) |

---

## 6. 자금 관리 API (Funding)

REL-01 (13-fund-deposit-process.md) 및 REL-02 (14-fund-withdrawal-process.md) 기반. Budget Pool 모델에서 소유자가 Vault에 예치하고 에이전트가 Spending Limit 범위 내에서 사용.

### 6.1 POST /api/v1/agents/:agentId/fund -- 자금 충전

| 항목 | 값 |
|------|---|
| **메서드** | POST |
| **경로** | `/api/v1/agents/{agentId}/fund` |
| **설명** | 에이전트 Vault에 자금을 충전한다. 소유자 지갑에서 Vault PDA로 SOL/SPL 토큰을 전송. Owner Key (KMS) 서명 필요 (REL-01). |
| **태그** | Funding |
| **스코프** | `wallets:fund` |
| **허용 역할** | owner |

**요청 본문:**

```typescript
export const FundAgentRequest = z.object({
  amount: z.string().describe('충전 금액 (lamports 또는 토큰 원시 단위)'),
  mint: z.string().nullable().default(null)
    .describe('SPL 토큰 민트 (null = SOL)'),
});
```

**응답:**

```typescript
export const FundingResultSchema = z.object({
  id: z.string().describe('충전 기록 ID (fund_xxx)'),
  agentId: z.string(),
  amount: z.string(),
  mint: z.string().nullable(),
  status: z.enum(['PENDING', 'CONFIRMED', 'FAILED']),
  txSignature: z.string().nullable().describe('온체인 트랜잭션 서명'),
  createdAt: z.string().datetime(),
});
```

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 202 Accepted | 충전 요청 접수 | `FundingResult` |
| 404 | 에이전트 없음 | `WalletApiError` (code: `AGENT_NOT_FOUND`) |
| 422 | 잔액 부족 | `WalletApiError` (code: `FUNDING_INSUFFICIENT_OWNER_BALANCE`) |
| 400 | 주소 불일치 | `WalletApiError` (code: `FUNDING_VAULT_ADDRESS_MISMATCH`) |

### 6.2 POST /api/v1/agents/:agentId/withdraw -- 자금 회수

| 항목 | 값 |
|------|---|
| **메서드** | POST |
| **경로** | `/api/v1/agents/{agentId}/withdraw` |
| **설명** | 에이전트 Vault에서 자금을 회수한다. 수동 회수 방법 A(Owner Spending Limit) 사용 (REL-02). amount 미지정 시 전액 회수. |
| **태그** | Funding |
| **스코프** | `wallets:fund` |
| **허용 역할** | owner |

**요청 본문:**

```typescript
export const WithdrawRequest = z.object({
  amount: z.string().nullable().default(null)
    .describe('회수 금액 (null = 전액 회수)'),
  mint: z.string().nullable().default(null)
    .describe('SPL 토큰 민트 (null = SOL)'),
  destinationPubkey: z.string().optional()
    .describe('회수 목적지 (기본 = 소유자 지갑)'),
});
```

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 202 Accepted | 회수 요청 접수 | `FundingResult` |
| 404 | 에이전트 없음 | `WalletApiError` (code: `AGENT_NOT_FOUND`) |
| 409 | 회수 진행 중 | `WalletApiError` (code: `FUNDING_WITHDRAWAL_IN_PROGRESS`) |
| 422 | 잔액 초과 | `WalletApiError` (code: `FUNDING_WITHDRAWAL_EXCEEDS_BALANCE`) |

### 6.3 GET /api/v1/agents/:agentId/balance -- 잔액 조회

| 항목 | 값 |
|------|---|
| **메서드** | GET |
| **경로** | `/api/v1/agents/{agentId}/balance` |
| **설명** | 에이전트 Vault의 SOL 및 SPL 토큰 잔액을 조회한다. |
| **태그** | Funding |
| **스코프** | `wallets:read` |
| **허용 역할** | owner, agent, viewer, auditor |

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 잔액 정보 | `Balance` |
| 404 | 에이전트 없음 | `WalletApiError` (code: `AGENT_NOT_FOUND`) |

### 6.4 POST /api/v1/owner/agents/transfer -- 에이전트 간 자금 이동

| 항목 | 값 |
|------|---|
| **메서드** | POST |
| **경로** | `/api/v1/owner/agents/transfer` |
| **설명** | 소유자가 한 에이전트에서 다른 에이전트로 자금을 이동한다. Owner SpendingLimit 방식 사용, 합산 예산에 미포함 (내부 이동) (REL-05). |
| **태그** | Funding |
| **스코프** | `wallets:fund` |
| **허용 역할** | owner |

**요청 본문:**

```typescript
export const TransferBetweenAgentsRequest = z.object({
  fromAgentId: z.string().describe('출발 에이전트 ID'),
  toAgentId: z.string().describe('도착 에이전트 ID'),
  amount: z.string().describe('이동 금액 (lamports)'),
  mint: z.string().nullable().default(null)
    .describe('SPL 토큰 민트 (null = SOL)'),
});
```

**응답:**

```typescript
export const TransferResultSchema = z.object({
  id: z.string().describe('이동 기록 ID (xfer_xxx)'),
  fromAgentId: z.string(),
  toAgentId: z.string(),
  amount: z.string(),
  mint: z.string().nullable(),
  status: z.enum(['PENDING', 'CONFIRMED', 'FAILED']),
  withdrawTxSignature: z.string().nullable(),
  depositTxSignature: z.string().nullable(),
  createdAt: z.string().datetime(),
});
```

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 202 Accepted | 이동 요청 접수 | `TransferResult` |
| 404 | 에이전트 없음 | `WalletApiError` (code: `AGENT_NOT_FOUND`) |
| 422 | 잔액 부족 | `WalletApiError` (code: `FUNDING_WITHDRAWAL_EXCEEDS_BALANCE`) |

---

## 7. 정책 관리 API (Policies)

API-03 (19-permission-policy-model.md) 기반. 4가지 정책(금액 한도, 화이트리스트, 시간 제어, 에스컬레이션) 조회, 변경, 사용량 모니터링.

### 7.1 GET /api/v1/agents/:agentId/policy -- 정책 조회

| 항목 | 값 |
|------|---|
| **메서드** | GET |
| **경로** | `/api/v1/agents/{agentId}/policy` |
| **설명** | 에이전트에 적용 중인 정책을 조회한다. |
| **태그** | Policies |
| **스코프** | `policies:read` |
| **허용 역할** | owner, agent, viewer, auditor |

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 현재 정책 | `AgentPolicy` |
| 404 | 에이전트 없음 | `WalletApiError` (code: `AGENT_NOT_FOUND`) |

### 7.2 PUT /api/v1/agents/:agentId/policy -- 정책 변경

| 항목 | 값 |
|------|---|
| **메서드** | PUT |
| **경로** | `/api/v1/agents/{agentId}/policy` |
| **설명** | 에이전트 정책을 변경한다. 서버 정책 >= 온체인 한도 (defense-in-depth, API-03). 온체인 Spending Limit도 동기화한다. |
| **태그** | Policies |
| **스코프** | `policies:write` |
| **허용 역할** | owner |

**요청 본문:**

```typescript
export const UpdatePolicyRequest = z.object({
  limits: z.object({
    perTransaction: z.string().optional(),
    daily: z.string().optional(),
    weekly: z.string().optional(),
    monthly: z.string().optional(),
  }).optional().describe('금액 한도 (부분 업데이트 가능)'),
  whitelist: z.object({
    allowedDestinations: z.array(z.string()).optional(),
    allowedPrograms: z.array(z.string()).optional(),
    allowedTokenMints: z.array(z.string()).optional(),
  }).optional().describe('화이트리스트 (부분 업데이트 가능)'),
  timeControl: z.object({
    operatingHoursUtc: z.object({
      start: z.number().int().min(0).max(23),
      end: z.number().int().min(0).max(23),
    }).nullable().optional(),
    blackoutDates: z.array(z.string()).optional(),
  }).optional().describe('시간 제어'),
  escalation: z.object({
    thresholds: z.object({
      low: z.string().optional(),
      medium: z.string().optional(),
      high: z.string().optional(),
      critical: z.string().optional(),
    }).optional(),
  }).optional().describe('에스컬레이션'),
  template: z.enum(['conservative', 'standard', 'permissive']).optional()
    .describe('정책 템플릿 프리셋 적용 (API-03)'),
});
```

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 변경된 정책 | `AgentPolicy` |
| 400 | 검증 에러 | `WalletApiError` (code: `VALIDATION_*`) |
| 404 | 에이전트 없음 | `WalletApiError` (code: `AGENT_NOT_FOUND`) |

### 7.3 GET /api/v1/agents/:agentId/policy/usage -- 사용량 조회

| 항목 | 값 |
|------|---|
| **메서드** | GET |
| **경로** | `/api/v1/agents/{agentId}/policy/usage` |
| **설명** | 에이전트의 일일/주간/월간 사용량과 남은 한도를 조회한다. Redis 기반 실시간 추적 (REL-01). |
| **태그** | Policies |
| **스코프** | `policies:read` |
| **허용 역할** | owner, agent, viewer, auditor |

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 사용량 정보 | `PolicyUsage` |
| 404 | 에이전트 없음 | `WalletApiError` (code: `AGENT_NOT_FOUND`) |

---

## 8. 소유자 대시보드 API (Owner)

REL-05 (17-multi-agent-management.md) 기반 Hub-and-Spoke 모델의 통합 관리 인터페이스.

### 8.1 GET /api/v1/owner/dashboard -- 통합 대시보드

| 항목 | 값 |
|------|---|
| **메서드** | GET |
| **경로** | `/api/v1/owner/dashboard` |
| **설명** | 소유자의 통합 대시보드를 조회한다. 모든 에이전트 요약, 전체 잔액, 일일 사용량, 비상 상태를 포함 (REL-05 OwnerDashboard 인터페이스). |
| **태그** | Owner |
| **스코프** | `dashboard:read` |
| **허용 역할** | owner, viewer, auditor |

**응답 스키마:**

```typescript
export const OwnerDashboardSchema = z.object({
  totalAgents: z.number().int().describe('전체 에이전트 수'),
  activeAgents: z.number().int().describe('활성 에이전트 수'),
  suspendedAgents: z.number().int().describe('정지된 에이전트 수'),
  totalBalance: z.object({
    sol: z.string().describe('전체 SOL 잔액 (lamports)'),
    solUiAmount: z.string().describe('전체 SOL 잔액 (SOL 단위)'),
  }),
  dailyUsage: z.object({
    totalUsed: z.string().describe('금일 전체 사용량 (lamports)'),
    globalLimit: z.string().describe('글로벌 일일 한도 (lamports)'),
    remaining: z.string().describe('남은 글로벌 한도 (lamports)'),
  }),
  agentsSummary: z.array(z.object({
    id: z.string(),
    nickname: z.string(),
    status: AgentStatus,
    balance: z.string().describe('SOL 잔액 (lamports)'),
    dailyUsed: z.string().describe('금일 사용량 (lamports)'),
    dailyLimit: z.string().describe('일일 한도 (lamports)'),
  })).describe('에이전트별 요약'),
  recentAlerts: z.array(z.object({
    type: z.string(),
    message: z.string(),
    agentId: z.string().optional(),
    createdAt: z.string().datetime(),
  })).describe('최근 알림'),
  lastUpdatedAt: z.string().datetime(),
});
```

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 대시보드 데이터 | `OwnerDashboard` |

### 8.2 GET /api/v1/owner/agents -- 소유자의 모든 에이전트 요약

| 항목 | 값 |
|------|---|
| **메서드** | GET |
| **경로** | `/api/v1/owner/agents` |
| **설명** | 소유자의 모든 에이전트를 상태, 잔액, 사용량과 함께 요약 조회한다. |
| **태그** | Owner |
| **스코프** | `agents:read` |
| **허용 역할** | owner, viewer, auditor |

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 에이전트 요약 목록 | `PaginatedResponse<AgentSummary>` |

### 8.3 PUT /api/v1/owner/global-budget -- 전체 합산 예산 설정

| 항목 | 값 |
|------|---|
| **메서드** | PUT |
| **경로** | `/api/v1/owner/global-budget` |
| **설명** | 전체 에이전트 합산 예산 한도를 설정한다. Redis 서버 레벨 합산 추적 (REL-05 GlobalBudgetLimit). |
| **태그** | Owner |
| **스코프** | `policies:write` |
| **허용 역할** | owner |

**요청 본문:**

```typescript
export const UpdateGlobalBudgetRequest = z.object({
  dailyLimit: z.string().describe('글로벌 일일 한도 (lamports)'),
  weeklyLimit: z.string().optional().describe('글로벌 주간 한도 (lamports)'),
  monthlyLimit: z.string().optional().describe('글로벌 월간 한도 (lamports)'),
});
```

**응답:**

```typescript
export const GlobalBudgetSchema = z.object({
  dailyLimit: z.string(),
  weeklyLimit: z.string().nullable(),
  monthlyLimit: z.string().nullable(),
  currentDailyUsage: z.string(),
  updatedAt: z.string().datetime(),
});
```

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 업데이트된 글로벌 예산 | `GlobalBudget` |
| 400 | 검증 에러 | `WalletApiError` (code: `VALIDATION_*`) |

---

## 9. 비상 API (Emergency)

REL-04 (16-emergency-recovery.md) 기반. 4가지 비상 트리거 (manual, circuit_breaker, anomaly_detection, inactivity_timeout).

**핵심 원칙:** 시스템은 자동 SUSPENDED까지만, 자금 이동은 소유자 수동 판단 (REL-04).

### 9.1 POST /api/v1/agents/:agentId/emergency/suspend -- 비상 정지

| 항목 | 값 |
|------|---|
| **메서드** | POST |
| **경로** | `/api/v1/agents/{agentId}/emergency/suspend` |
| **설명** | 에이전트를 비상 정지한다. 즉시 SUSPENDED 전환 + Squads SpendingLimit 비활성화. 대기 트랜잭션 3단계 처리 (REL-04). |
| **태그** | Emergency |
| **스코프** | `agents:write` |
| **허용 역할** | owner |

**요청 본문:**

```typescript
export const EmergencySuspendRequest = z.object({
  reason: z.string().max(500).describe('비상 정지 사유'),
  trigger: z.enum(['manual', 'circuit_breaker', 'anomaly_detection'])
    .default('manual').describe('비상 트리거 유형 (REL-04)'),
});
```

**응답:**

```typescript
export const EmergencySuspendResultSchema = z.object({
  agentId: z.string(),
  status: z.literal('SUSPENDED'),
  trigger: z.string(),
  reason: z.string(),
  pendingTransactions: z.object({
    rejected: z.number().int().describe('거부된 대기 tx 수 (서명 전)'),
    awaitingExpiry: z.number().int().describe('만료 대기 tx 수 (서명 완료 미제출)'),
    monitoring: z.number().int().describe('모니터링 중 tx 수 (이미 제출)'),
  }),
  suspendedAt: z.string().datetime(),
});
```

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 비상 정지 완료 | `EmergencySuspendResult` |
| 404 | 에이전트 없음 | `WalletApiError` (code: `AGENT_NOT_FOUND`) |
| 409 | 이미 정지 | `WalletApiError` (code: `EMERGENCY_ALREADY_SUSPENDED`) |

### 9.2 POST /api/v1/agents/:agentId/emergency/recover -- 비상 회수

| 항목 | 값 |
|------|---|
| **메서드** | POST |
| **경로** | `/api/v1/agents/{agentId}/emergency/recover` |
| **설명** | 비상 자금 회수를 요청한다. Vault 전액을 recoveryDestination으로 회수. 에이전트는 SUSPENDED 상태여야 함 (REL-04). |
| **태그** | Emergency |
| **스코프** | `wallets:fund` |
| **허용 역할** | owner |

**요청 본문:**

```typescript
export const EmergencyRecoverRequest = z.object({
  destinationPubkey: z.string().optional()
    .describe('회수 목적지 (기본 = 사전 등록된 recoveryDestination, REL-04)'),
});
```

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 202 Accepted | 비상 회수 시작 | `FundingResult` |
| 404 | 에이전트 없음 | `WalletApiError` (code: `AGENT_NOT_FOUND`) |
| 409 | 이미 회수 중 | `WalletApiError` (code: `EMERGENCY_RECOVERY_IN_PROGRESS`) |
| 503 | Circuit Breaker | `WalletApiError` (code: `EMERGENCY_CIRCUIT_BREAKER_ACTIVE`) |

### 9.3 POST /api/v1/owner/emergency/suspend-all -- 전체 에이전트 비상 정지

| 항목 | 값 |
|------|---|
| **메서드** | POST |
| **경로** | `/api/v1/owner/emergency/suspend-all` |
| **설명** | 소유자의 모든 활성 에이전트를 일괄 비상 정지한다. REL-05 Hub-and-Spoke 모델의 최상위 비상 조치. |
| **태그** | Emergency |
| **스코프** | `admin:all` |
| **허용 역할** | owner |

**요청 본문:**

```typescript
export const EmergencySuspendAllRequest = z.object({
  reason: z.string().max(500).describe('비상 정지 사유'),
});
```

**응답:**

```typescript
export const BatchOperationResultSchema = z.object({
  totalAgents: z.number().int().describe('대상 에이전트 수'),
  suspended: z.number().int().describe('정지된 에이전트 수'),
  alreadySuspended: z.number().int().describe('이미 정지 상태'),
  failed: z.number().int().describe('정지 실패 수'),
  results: z.array(z.object({
    agentId: z.string(),
    status: z.enum(['SUSPENDED', 'ALREADY_SUSPENDED', 'FAILED']),
    error: z.string().optional(),
  })),
  completedAt: z.string().datetime(),
});
```

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 일괄 정지 결과 | `BatchOperationResult` |

---

## 10. Webhook 관리 API

### 10.1 POST /api/v1/webhooks -- 웹훅 등록

| 항목 | 값 |
|------|---|
| **메서드** | POST |
| **경로** | `/api/v1/webhooks` |
| **설명** | 웹훅 엔드포인트를 등록한다. 서명 키(signing secret)는 자동 생성되며 응답에서 한 번만 반환된다. |
| **태그** | Webhooks |
| **스코프** | `admin:all` |
| **허용 역할** | owner |

**요청 본문:**

```typescript
export const CreateWebhookRequest = z.object({
  url: z.string().url().describe('웹훅 수신 URL (HTTPS 필수)'),
  events: z.array(WebhookEventTypeSchema).min(1)
    .describe('구독할 이벤트 타입 목록'),
  description: z.string().max(200).optional().describe('웹훅 설명'),
});
```

**응답:**

```typescript
export const WebhookSchema = z.object({
  id: z.string().describe('웹훅 ID (whk_xxx)'),
  url: z.string().url(),
  events: z.array(WebhookEventTypeSchema),
  description: z.string().nullable(),
  signingSecret: z.string().describe('HMAC-SHA256 서명 키 (생성 시 한 번만 반환)'),
  active: z.boolean().default(true),
  createdAt: z.string().datetime(),
});
```

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 201 Created | 웹훅 생성 | `Webhook` (signingSecret 포함) |
| 400 | URL 검증 실패 | `WalletApiError` (code: `WEBHOOK_URL_UNREACHABLE`) |

### 10.2 GET /api/v1/webhooks -- 웹훅 목록

| 항목 | 값 |
|------|---|
| **메서드** | GET |
| **경로** | `/api/v1/webhooks` |
| **설명** | 등록된 웹훅 목록을 조회한다. signingSecret은 마스킹되어 반환. |
| **태그** | Webhooks |
| **스코프** | `admin:all` |
| **허용 역할** | owner |

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 웹훅 목록 | `PaginatedResponse<Webhook>` (signingSecret 마스킹) |

### 10.3 DELETE /api/v1/webhooks/:webhookId -- 웹훅 삭제

| 항목 | 값 |
|------|---|
| **메서드** | DELETE |
| **경로** | `/api/v1/webhooks/{webhookId}` |
| **설명** | 웹훅 구독을 삭제한다. |
| **태그** | Webhooks |
| **스코프** | `admin:all` |
| **허용 역할** | owner |

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 204 No Content | 삭제 완료 | - |
| 404 | 웹훅 없음 | `WalletApiError` (code: `WEBHOOK_NOT_FOUND`) |

### 10.4 POST /api/v1/webhooks/:webhookId/test -- 테스트 이벤트 전송

| 항목 | 값 |
|------|---|
| **메서드** | POST |
| **경로** | `/api/v1/webhooks/{webhookId}/test` |
| **설명** | 테스트 웹훅 이벤트를 전송하여 수신 설정을 검증한다. |
| **태그** | Webhooks |
| **스코프** | `admin:all` |
| **허용 역할** | owner |

**응답:**

```typescript
export const WebhookTestResultSchema = z.object({
  webhookId: z.string(),
  url: z.string(),
  statusCode: z.number().int().describe('수신 측 응답 HTTP 상태 코드'),
  responseTimeMs: z.number().describe('응답 시간 (ms)'),
  success: z.boolean(),
  error: z.string().optional(),
  testedAt: z.string().datetime(),
});
```

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 테스트 결과 | `WebhookTestResult` |
| 404 | 웹훅 없음 | `WalletApiError` (code: `WEBHOOK_NOT_FOUND`) |

---

## 11. Webhook 이벤트 스펙

### 11.1 이벤트 타입 전체 목록

05-RESEARCH.md의 WebhookEventType 기반.

| 카테고리 | 이벤트 타입 | 설명 | 에스컬레이션 |
|----------|------------|------|-------------|
| **트랜잭션** | `transaction.submitted` | 온체인 제출됨 | - |
| | `transaction.confirmed` | 블록 확정 (finalized) | - |
| | `transaction.failed` | 실패 (서명/제출/만료) | MEDIUM |
| | `transaction.rejected` | 정책 거부 | LOW |
| **에이전트** | `agent.created` | 에이전트 생성 완료 (ACTIVE) | - |
| | `agent.suspended` | 에이전트 정지 | MEDIUM |
| | `agent.resumed` | 에이전트 재활성화 | - |
| | `agent.terminated` | 에이전트 폐기 완료 | - |
| | `agent.key_rotated` | 키 로테이션 완료 | - |
| **정책** | `policy.violation` | 정책 위반 감지 | LOW~HIGH |
| | `policy.escalation` | 에스컬레이션 트리거 | MEDIUM~CRITICAL |
| **자금** | `funding.deposit_confirmed` | 충전 확정 | - |
| | `funding.withdrawal_confirmed` | 회수 확정 | - |
| | `funding.low_balance` | 잔액 부족 알림 | LOW |
| **비상** | `emergency.triggered` | 비상 트리거 발동 | HIGH~CRITICAL |
| | `emergency.recovery_complete` | 비상 회수 완료 | CRITICAL |

### 11.2 WebhookEvent 페이로드 구조

모든 Webhook 이벤트는 다음 구조를 따른다:

```json
{
  "id": "evt_01HV8PQXYZ",
  "type": "transaction.confirmed",
  "createdAt": "2026-02-05T12:34:56Z",
  "data": {
    "transactionId": "tx_01HV8PQ",
    "agentId": "agt_01HV8PQ",
    "to": "Dest...Address",
    "amount": "1000000000",
    "txSignature": "5VERv8N..."
  },
  "agentId": "agt_01HV8PQ",
  "requestId": "req_01HV8PQ"
}
```

### 11.3 HMAC-SHA256 서명 검증

WAIaaS는 Webhook 페이로드에 HMAC-SHA256 서명을 포함하여 수신 측이 이벤트 무결성과 출처를 검증할 수 있도록 한다.

**서명 헤더:**

| 헤더 | 값 | 설명 |
|------|---|------|
| `X-WAIaaS-Signature` | `t=1707134096,v1=5257a869...` | 타임스탬프 + HMAC 서명 |
| `X-WAIaaS-Webhook-Id` | `evt_01HV8PQ` | 이벤트 ID |

**서명 생성 알고리즘:**

```
1. timestamp = 현재 Unix 타임스탬프 (초 단위)
2. payload = JSON.stringify(event)
3. signaturePayload = `${timestamp}.${payload}`
4. signature = HMAC-SHA256(signingSecret, signaturePayload)
5. header = `t=${timestamp},v1=${signature}`
```

**서명 검증 코드 예시 (TypeScript):**

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

interface VerifyWebhookOptions {
  payload: string;           // 원본 요청 본문 (string)
  signature: string;         // X-WAIaaS-Signature 헤더
  signingSecret: string;     // 웹훅 생성 시 받은 서명 키
  tolerance?: number;        // 타임스탬프 허용 오차 (초, 기본 300)
}

function verifyWebhook(options: VerifyWebhookOptions): boolean {
  const { payload, signature, signingSecret, tolerance = 300 } = options;

  // 1. 서명 헤더 파싱
  const parts = signature.split(',');
  const timestamp = parts.find(p => p.startsWith('t='))?.slice(2);
  const sig = parts.find(p => p.startsWith('v1='))?.slice(3);

  if (!timestamp || !sig) return false;

  // 2. 타임스탬프 검증 (리플레이 공격 방지)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > tolerance) return false;

  // 3. HMAC-SHA256 서명 비교 (timing-safe)
  const expected = createHmac('sha256', signingSecret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  return timingSafeEqual(
    Buffer.from(sig, 'hex'),
    Buffer.from(expected, 'hex')
  );
}
```

### 11.4 재시도 정책

| 항목 | 값 |
|------|---|
| **최대 재시도** | 3회 |
| **백오프 패턴** | exponential: 1초, 5초, 25초 |
| **타임아웃** | 5초 (수신 측이 5초 내 2xx 응답 필요) |
| **실패 판정** | 5xx 응답, 타임아웃, 연결 거부 |
| **DLQ** | 3회 실패 시 Dead Letter Queue에 보관 (72시간) |
| **에스컬레이션 우선순위** | CRITICAL 이벤트 즉시 전달, HIGH 우선 큐 (API-04) |

### 11.5 이벤트별 data 필드 스키마

| 이벤트 | data 필드 |
|--------|----------|
| `transaction.confirmed` | `{ transactionId, agentId, to, amount, mint, txSignature, confirmedAt }` |
| `transaction.failed` | `{ transactionId, agentId, errorCode, errorDetail }` |
| `transaction.rejected` | `{ transactionId, agentId, policyCode, detail }` |
| `agent.created` | `{ agentId, nickname, multisigAddress, vaultAddress }` |
| `agent.suspended` | `{ agentId, reason, trigger, suspendedBy }` |
| `policy.violation` | `{ agentId, policyCode, transactionId, detail }` |
| `policy.escalation` | `{ agentId, level, transactionId, amount, threshold }` |
| `funding.deposit_confirmed` | `{ agentId, amount, mint, txSignature }` |
| `funding.low_balance` | `{ agentId, currentBalance, threshold }` |
| `emergency.triggered` | `{ agentId, trigger, reason, pendingTransactions }` |
| `emergency.recovery_complete` | `{ agentId, recoveredAmount, destinationPubkey, txSignature }` |

---

## 12. 인증 API (Auth)

API-02 (18-authentication-model.md) 기반.

### 12.1 POST /api/v1/auth/keys -- API Key 생성

| 항목 | 값 |
|------|---|
| **메서드** | POST |
| **경로** | `/api/v1/auth/keys` |
| **설명** | 새 API Key를 생성한다. 접두사 wai_live_ 또는 wai_test_. 원본 키는 이 응답에서만 반환되며, 서버에는 SHA-256 해시만 저장 (API-02). |
| **태그** | Auth |
| **스코프** | `admin:all` |
| **허용 역할** | owner |

**요청 본문:**

```typescript
export const CreateApiKeyRequest = z.object({
  name: z.string().min(1).max(100).describe('키 이름 (식별용)'),
  scopes: z.array(z.enum([
    'agents:read', 'agents:write', 'agents:delete',
    'transactions:read', 'transactions:execute',
    'wallets:read', 'wallets:fund',
    'policies:read', 'policies:write',
    'dashboard:read', 'admin:all',
  ])).min(1).describe('부여할 스코프 목록'),
  expiresIn: z.string().optional()
    .describe('만료 기간 (ISO 8601 duration, 예: P90D = 90일)'),
  ipWhitelist: z.array(z.string()).default([])
    .describe('허용 IP 대역 (빈 배열 = 모든 IP)'),
});
```

**응답:**

```typescript
export const ApiKeyResponseSchema = z.object({
  id: z.string().describe('키 ID (key_xxx)'),
  name: z.string(),
  key: z.string().describe('API Key 원본 (wai_live_xxx) - 이 응답에서만 반환'),
  prefix: z.string().describe('접두사 (wai_live_ 또는 wai_test_)'),
  scopes: z.array(z.string()),
  expiresAt: z.string().datetime().nullable(),
  ipWhitelist: z.array(z.string()),
  createdAt: z.string().datetime(),
});
```

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 201 Created | API Key 생성 | `ApiKeyResponse` (key 필드 포함) |
| 400 | 검증 에러 | `WalletApiError` (code: `VALIDATION_*`) |

### 12.2 GET /api/v1/auth/keys -- API Key 목록

| 항목 | 값 |
|------|---|
| **메서드** | GET |
| **경로** | `/api/v1/auth/keys` |
| **설명** | 생성된 API Key 목록을 조회한다. 키 원본은 반환되지 않으며, 접두사와 마지막 4자만 표시. |
| **태그** | Auth |
| **스코프** | `admin:all` |
| **허용 역할** | owner |

**응답:**

```typescript
export const ApiKeyListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  hint: z.string().describe('키 힌트 (wai_live_...a1b2)'),
  scopes: z.array(z.string()),
  expiresAt: z.string().datetime().nullable(),
  lastUsedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
```

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | API Key 목록 | `PaginatedResponse<ApiKeyListItem>` |

### 12.3 DELETE /api/v1/auth/keys/:keyId -- API Key 폐기

| 항목 | 값 |
|------|---|
| **메서드** | DELETE |
| **경로** | `/api/v1/auth/keys/{keyId}` |
| **설명** | API Key를 폐기한다. 즉시 무효화되며, 해당 키로의 모든 요청이 AUTH_KEY_REVOKED 에러를 반환. |
| **태그** | Auth |
| **스코프** | `admin:all` |
| **허용 역할** | owner |

**응답:**

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 204 No Content | 폐기 완료 | - |
| 404 | 키 없음 | `WalletApiError` |

### 12.4 POST /oauth/token -- OAuth 2.1 토큰 발급

| 항목 | 값 |
|------|---|
| **메서드** | POST |
| **경로** | `/oauth/token` |
| **설명** | OAuth 2.1 Client Credentials Grant로 access token을 발급한다. PKCE 필수 (API-02). |
| **태그** | Auth |
| **인증** | Client ID + Client Secret (Basic Auth) |

**요청 본문 (form-urlencoded):**

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `grant_type` | string | Y | `client_credentials` |
| `scope` | string | N | 요청 스코프 (공백 구분) |
| `code_verifier` | string | Y (PKCE) | PKCE 코드 검증자 |

**응답:**

```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "agents:read transactions:execute"
}
```

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 200 OK | 토큰 발급 | OAuth 2.1 Token Response |
| 401 | 클라이언트 인증 실패 | `WalletApiError` (code: `AUTH_TOKEN_INVALID`) |

### 12.5 POST /oauth/register -- Dynamic Client Registration

| 항목 | 값 |
|------|---|
| **메서드** | POST |
| **경로** | `/oauth/register` |
| **설명** | 에이전트별 고유 OAuth 2.1 클라이언트를 동적으로 등록한다 (API-02 DCR). |
| **태그** | Auth |
| **인증** | Initial Access Token (소유자 발급) |

**요청 본문:**

```json
{
  "client_name": "trading-bot-alpha",
  "grant_types": ["client_credentials"],
  "scope": "transactions:execute wallets:read",
  "token_endpoint_auth_method": "client_secret_basic"
}
```

**응답:**

```json
{
  "client_id": "agt_01HV8PQ_client",
  "client_secret": "cs_xxx...",
  "client_name": "trading-bot-alpha",
  "grant_types": ["client_credentials"],
  "scope": "transactions:execute wallets:read"
}
```

| HTTP | 설명 | 스키마 |
|------|------|--------|
| 201 Created | 클라이언트 등록 | DCR Response |

---

## 13. API 버전 관리 및 거버넌스

### 13.1 버전 정책

| 유형 | 조건 | 방식 |
|------|------|------|
| **Major** | 하위 호환 불가 변경 | URL 경로 변경 (`/api/v1/` -> `/api/v2/`) |
| **Minor** | 하위 호환 유지 변경 | 새 optional 필드, 새 엔드포인트 추가 |
| **Patch** | 버그 수정 | 별도 버전 변경 없음 |

### 13.2 Breaking Change 정의

**Breaking (Major 버전 변경 필요):**
- 기존 필드 삭제 또는 이름 변경
- 필드 타입 변경 (예: string -> number)
- 새 필수 파라미터 추가
- 에러 코드 제거 또는 변경
- 응답 구조 변경
- 엔드포인트 URL 변경

**Non-breaking (Minor 버전 유지):**
- 새 optional 요청 필드 추가
- 새 응답 필드 추가
- 새 에러 코드 추가
- 새 엔드포인트 추가
- 새 Webhook 이벤트 타입 추가
- 새 enum 값 추가

### 13.3 Deprecation 정책

| 항목 | 규칙 |
|------|------|
| **고지 기간** | 최소 6개월 전 고지 |
| **Sunset 헤더** | `Sunset: Sat, 01 Jan 2028 00:00:00 GMT` |
| **deprecated 마킹** | OpenAPI 스펙에 `deprecated: true` |
| **고지 수단** | Changelog, API 응답 헤더, 이메일, 대시보드 알림 |
| **병행 운영** | 구 버전과 신 버전을 deprecation 기간 동안 병행 운영 |

**Sunset 헤더 예시:**

```
HTTP/1.1 200 OK
Sunset: Sat, 01 Jan 2028 00:00:00 GMT
Deprecation: true
Link: <https://api.waiass.io/api/v2/agents>; rel="successor-version"
```

### 13.4 API 거버넌스 도구

| 도구 | 용도 |
|------|------|
| `oasdiff` | OpenAPI 스펙 diff 분석, breaking change 자동 감지 |
| `@fastify/swagger` | Zod 스키마에서 OpenAPI 3.0 스펙 자동 생성 |
| CI/CD 파이프라인 | PR마다 oasdiff 실행, breaking change 시 경고/차단 |

---

## 14. 엔드포인트 전체 목록 요약

API-03 (19-permission-policy-model.md) 섹션 2.3의 엔드포인트별 스코프 매핑과 일관.

| # | 메서드 | 경로 | 태그 | 스코프 | 허용 역할 |
|---|--------|------|------|--------|----------|
| 1 | POST | `/api/v1/agents` | Agents | `agents:write` | owner |
| 2 | GET | `/api/v1/agents` | Agents | `agents:read` | owner, viewer, auditor |
| 3 | GET | `/api/v1/agents/{agentId}` | Agents | `agents:read` | owner, viewer, auditor |
| 4 | PATCH | `/api/v1/agents/{agentId}` | Agents | `agents:write` | owner |
| 5 | DELETE | `/api/v1/agents/{agentId}` | Agents | `agents:delete` | owner |
| 6 | POST | `/api/v1/agents/{agentId}/suspend` | Agents | `agents:write` | owner |
| 7 | POST | `/api/v1/agents/{agentId}/resume` | Agents | `agents:write` | owner |
| 8 | POST | `/api/v1/agents/{agentId}/rotate-key` | Agents | `agents:write` | owner |
| 9 | POST | `/api/v1/transactions` | Transactions | `transactions:execute` | owner, agent |
| 10 | GET | `/api/v1/transactions/{txId}` | Transactions | `transactions:read` | owner, agent, viewer, auditor |
| 11 | GET | `/api/v1/agents/{agentId}/transactions` | Transactions | `transactions:read` | owner, agent, viewer, auditor |
| 12 | POST | `/api/v1/agents/{agentId}/fund` | Funding | `wallets:fund` | owner |
| 13 | POST | `/api/v1/agents/{agentId}/withdraw` | Funding | `wallets:fund` | owner |
| 14 | GET | `/api/v1/agents/{agentId}/balance` | Funding | `wallets:read` | owner, agent, viewer, auditor |
| 15 | POST | `/api/v1/owner/agents/transfer` | Funding | `wallets:fund` | owner |
| 16 | GET | `/api/v1/agents/{agentId}/policy` | Policies | `policies:read` | owner, agent, viewer, auditor |
| 17 | PUT | `/api/v1/agents/{agentId}/policy` | Policies | `policies:write` | owner |
| 18 | GET | `/api/v1/agents/{agentId}/policy/usage` | Policies | `policies:read` | owner, agent, viewer, auditor |
| 19 | GET | `/api/v1/owner/dashboard` | Owner | `dashboard:read` | owner, viewer, auditor |
| 20 | GET | `/api/v1/owner/agents` | Owner | `agents:read` | owner, viewer, auditor |
| 21 | PUT | `/api/v1/owner/global-budget` | Owner | `policies:write` | owner |
| 22 | POST | `/api/v1/agents/{agentId}/emergency/suspend` | Emergency | `agents:write` | owner |
| 23 | POST | `/api/v1/agents/{agentId}/emergency/recover` | Emergency | `wallets:fund` | owner |
| 24 | POST | `/api/v1/owner/emergency/suspend-all` | Emergency | `admin:all` | owner |
| 25 | POST | `/api/v1/webhooks` | Webhooks | `admin:all` | owner |
| 26 | GET | `/api/v1/webhooks` | Webhooks | `admin:all` | owner |
| 27 | DELETE | `/api/v1/webhooks/{webhookId}` | Webhooks | `admin:all` | owner |
| 28 | POST | `/api/v1/webhooks/{webhookId}/test` | Webhooks | `admin:all` | owner |
| 29 | POST | `/api/v1/auth/keys` | Auth | `admin:all` | owner |
| 30 | GET | `/api/v1/auth/keys` | Auth | `admin:all` | owner |
| 31 | DELETE | `/api/v1/auth/keys/{keyId}` | Auth | `admin:all` | owner |
| 32 | POST | `/oauth/token` | Auth | - (Client Credentials) | - |
| 33 | POST | `/oauth/register` | Auth | - (Initial Access Token) | - |

**총 33개 엔드포인트, 8개 도메인 태그.**

---

## 15. Zod 스키마 기반 자동 생성 전략

### 15.1 Zod -> OpenAPI 변환 파이프라인

```
┌────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  Zod Schema        │────>│ fastify-type-provider │────>│ @fastify/swagger│
│  (SSoT)            │     │ -zod                  │     │ (OpenAPI 3.0)   │
│                    │     │ jsonSchemaTransform    │     │                 │
│  - Request Body    │     │                       │     │  openapi.json   │
│  - Query Params    │     │  Zod -> JSON Schema   │     │  openapi.yaml   │
│  - Response Body   │     │                       │     │                 │
│  - Path Params     │     │                       │     │                 │
└────────────────────┘     └──────────────────────┘     └─────────────────┘
        │                                                        │
        ▼                                                        ▼
┌────────────────────┐                                 ┌─────────────────┐
│ TypeScript Types   │                                 │ @fastify/swagger│
│ z.infer<T>         │                                 │ -ui             │
│                    │                                 │ /docs 경로 서빙 │
└────────────────────┘                                 └─────────────────┘
```

### 15.2 Fastify 라우트 등록 예시

```typescript
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CreateAgentRequest, AgentSchema } from './schemas';

export async function agentRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post('/api/v1/agents', {
    schema: {
      tags: ['Agents'],
      summary: '에이전트 생성',
      security: [{ ApiKeyAuth: [] }],
      body: CreateAgentRequest,
      response: {
        201: AgentSchema,
        400: WalletApiErrorSchema,
        401: WalletApiErrorSchema,
      },
    },
    handler: async (request, reply) => {
      // request.body는 CreateAgentRequest 타입으로 자동 추론
      // Zod 런타임 검증이 자동으로 수행됨
      const agent = await agentService.create(request.body);
      return reply.status(201).send(agent);
    },
  });
}
```

### 15.3 스펙-코드 동기화 보장

1. **개발 시:** Zod 스키마 변경 -> TypeScript 타입 자동 갱신 -> OpenAPI 스펙 자동 갱신
2. **CI/CD:** `oasdiff` 실행 -> breaking change 감지 -> PR 경고/차단
3. **배포 후:** `/docs` 경로에서 최신 Swagger UI 자동 반영

---

## 16. Rate Limiting 정책

API-03 (19-permission-policy-model.md) 기반 3-Layer Rate Limiting.

| Layer | 대상 | 한도 | 설명 |
|-------|------|------|------|
| **Layer 1: IP** | IP 주소 | 1,000 req/min | DDoS 1차 방어, 모든 요청 대상 |
| **Layer 2: API Key** | API Key별 | 100-500 req/min | 소유자 등급별 차등 한도 |
| **Layer 3: Agent** | 에이전트별 트랜잭션 | 10 tx/min | 정책 시간 제어와 연동 |

**Rate Limit 응답 헤더:**

```
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 487
X-RateLimit-Reset: 1707134160
Retry-After: 30
```

**Rate Limit 초과 시:** HTTP 429 + `WalletApiError` (code: `SYSTEM_RATE_LIMITED`, retryable: true)

---

*이 문서는 WAIaaS 프로젝트의 전체 REST API를 OpenAPI 3.0 형식으로 정의하며, Phase 3-4 설계(에이전트 관리, 트랜잭션, 자금, 정책, 비상, 멀티 에이전트)를 API 엔드포인트로 변환하고, Plan 05-01(인증/권한)과 Plan 05-02(에러 코드)의 보안/에러 체계를 통합한다. SDK(API-05)와 MCP(API-06) 인터페이스 설계의 기반 문서로 사용된다.*
