# 에이전트 인증 모델 설계 (API-02)

**문서 ID:** API-02
**작성일:** 2026-02-05
**상태:** 완료
**참조:** ARCH-01 (Dual Key 아키텍처), ARCH-03 (트랜잭션 플로우), 05-RESEARCH.md Pattern 2, REL-03 (에이전트 생명주기)

---

## 1. 개요: 인증 계층 구조

### 1.1 3-Layer 인증 모델

WAIaaS API는 AI 에이전트의 비인터랙티브(non-interactive) 특성을 고려한 3계층 인증 모델을 채택한다. AI 에이전트는 브라우저 기반 로그인이나 리다이렉트 플로우를 수행할 수 없으므로, API Key를 Primary 인증 수단으로 사용하고, OAuth 2.1은 서드파티 위임 접근에만 활용한다.

```mermaid
graph TB
    subgraph "3-Layer Authentication Model"
        direction TB

        subgraph L1["Layer 1: API Key Authentication (Primary)"]
            L1A[에이전트 직접 접근]
            L1B[서비스 간 통신]
            L1C["Header: Authorization: Bearer wai_live_xxx"]
        end

        subgraph L2["Layer 2: OAuth 2.1 Client Credentials (Secondary)"]
            L2A[서드파티 프레임워크 위임]
            L2B[마이크로서비스 인증]
            L2C["Grant: client_credentials + PKCE"]
        end

        subgraph L3["Layer 3: MCP Authorization (AI Agent Framework)"]
            L3A[Claude / GPT 등 LLM 프레임워크]
            L3B[PRM 자동 발견]
            L3C["OAuth 2.1 기반 + API Key 어댑터"]
        end

        L1 --> API[WAIaaS API Server]
        L2 --> API
        L3 --> API
    end

    API --> RBAC[RBAC 검사]
    RBAC --> ABAC[ABAC 정책 검사]
    ABAC --> RESULT{허용 / 거부}
```

### 1.2 계층별 사용 시나리오

| 사용자 | 상황 | 인증 방식 | 이유 |
|--------|------|----------|------|
| AI 에이전트 (직접) | 트랜잭션 실행, 잔액 조회 | **API Key** (Layer 1) | 비인터랙티브, 즉시 접근, 브라우저 불필요 |
| 소유자 서버 | 에이전트 관리, 정책 변경 | **API Key** (Layer 1) | 서버-서버 통신, 높은 권한 스코프 |
| 서드파티 프레임워크 | LangChain, CrewAI 연동 | **OAuth 2.1** (Layer 2) | 위임 접근, 스코프 제한, 토큰 만료 관리 |
| MCP 호환 AI | Claude Desktop, GPT 등 | **MCP Authorization** (Layer 3) | MCP 프로토콜 표준, PRM 자동 발견 |
| 대시보드 UI | 소유자 웹 대시보드 | **OAuth 2.1** (Layer 2) | 브라우저 기반 (Authorization Code + PKCE) |
| 감사자 | 읽기 전용 접근 | **API Key** (Layer 1) | 제한된 스코프의 전용 키 |

### 1.3 핵심 원칙

| 원칙 | 설명 |
|------|------|
| **API Key Primary** | AI 에이전트는 비인터랙티브이므로 API Key가 주요 인증 수단 |
| **브라우저 리다이렉트 불가** | 에이전트 접근 경로에 로그인 페이지, 리다이렉트 URI 사용 금지 |
| **Fail-safe 기본 거부** | 인증 실패 시 모든 요청 거부, 허용 목록 방식 |
| **SHA-256 해싱 저장** | API Key 원본은 생성 시 한 번만 반환, 서버에는 해시만 저장 |
| **스코프 최소 권한** | 필요한 최소한의 스코프만 부여 |

### 1.4 Phase 3 Dual Key 아키텍처와의 관계

API Key 인증은 Phase 3에서 확정된 Dual Key Architecture (ARCH-01) 위에 레이어링된다.

```
┌─────────────────────────────────────────────────────────────┐
│                    인증 레이어 관계                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [API 접근 계층]                                             │
│  ┌──────────────────────────────────────────────────┐       │
│  │ API Key / OAuth Token / MCP Authorization         │       │
│  │ → "누가 API를 호출하는가" (Authentication)        │       │
│  └──────────────────────┬───────────────────────────┘       │
│                          │                                   │
│  [키 관리 계층]          ▼                                   │
│  ┌──────────────────────────────────────────────────┐       │
│  │ Owner Key (AWS KMS)    │  Agent Key (Enclave)     │       │
│  │ → API Key 생성/관리    │  → API Key로 접근        │       │
│  │ → 정책 변경 서명       │  → Spending Limit 범위   │       │
│  └──────────────────────┬───────────────────────────┘       │
│                          │                                   │
│  [온체인 계층]           ▼                                   │
│  ┌──────────────────────────────────────────────────┐       │
│  │ Squads 2-of-2 Multisig + Spending Limit           │       │
│  │ → 최종 온체인 정책 강제                            │       │
│  └──────────────────────────────────────────────────┘       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

- **소유자(Owner Key)**: API Key를 생성하고, 높은 권한 스코프(admin:all, policies:write)를 부여
- **에이전트(Agent Key)**: 소유자가 생성한 API Key를 사용하여 API 호출. 제한된 스코프(transactions:execute, wallets:read)만 보유

---

## 2. API Key Authentication 상세 설계

### 2.1 API Key 구조

#### 접두사 체계

| 접두사 | 환경 | 용도 | 예시 |
|--------|------|------|------|
| `wai_live_` | Production (Mainnet) | 실제 트랜잭션 실행 | `wai_live_k8Jd9fGh2mNp4qRs...` |
| `wai_test_` | Development (Devnet) | 테스트 환경 개발 | `wai_test_x3Yb7cEf1iKl5oTu...` |

#### 키 구성

- **접두사**: `wai_live_` 또는 `wai_test_` (9자)
- **랜덤 부분**: 32바이트 암호학적 랜덤 (Base62 인코딩 = 약 43자)
- **전체 길이**: 약 52자
- **키 ID**: `key_` + 12자 랜덤 (예: `key_abc123def456`)

#### 사용 방법

```
Authorization: Bearer wai_live_k8Jd9fGh2mNp4qRsTvWxYz1a2B3c4D5e6F7g8H9i0J
```

### 2.2 ApiKey TypeScript 인터페이스

```typescript
// Source: 05-RESEARCH.md Pattern 2 기반
interface ApiKey {
  id: string;                    // key_xxxx (고유 ID, 외부 노출용)
  prefix: string;                // wai_live_ | wai_test_
  hashedKey: string;             // SHA-256 해시 (원본 저장 금지)
  ownerId: string;               // 소유자 ID (Owner Key 소유자)
  projectId: string;             // 프로젝트 범위 (멀티 프로젝트 지원)
  scopes: ApiScope[];            // 허용 스코프 목록
  ipWhitelist: string[];         // 허용 IP 대역 (CIDR 표기)
  expiresAt: Date | null;        // 만료 시점 (null = 무기한)
  lastUsedAt: Date | null;       // 마지막 사용 시점
  createdAt: Date;               // 생성 시점
  rotatedFromId: string | null;  // 로테이션 원본 키 ID
  isActive: boolean;             // 활성 상태
  name: string;                  // 키 별칭 (사용자 식별용)
  metadata: Record<string, string>; // 추가 메타데이터
}
```

### 2.3 ApiScope 타입 정의

```typescript
// 스코프 체계 - OAuth 2.1과 공유
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

**스코프 계층:**

```
admin:all (전체 관리자)
├── agents:read / agents:write / agents:delete
├── transactions:read / transactions:execute
├── wallets:read / wallets:fund
├── policies:read / policies:write
└── dashboard:read
```

`admin:all`은 모든 하위 스코프를 암시적으로 포함한다.

### 2.4 키 생명주기

```mermaid
stateDiagram-v2
    [*] --> Created: POST /api/v1/auth/keys

    Created --> Active: 즉시 활성화

    Active --> InUse: API 요청에 사용
    InUse --> Active: 요청 처리 완료

    Active --> Rotating: 로테이션 시작
    Rotating --> GracePeriod: 새 키 생성, 기존 키 유예
    GracePeriod --> Revoked: 유예 기간 만료 (기본 24시간)

    Active --> Revoked: 즉시 폐기 (DELETE /api/v1/auth/keys/:keyId)
    Active --> Expired: 만료 시점 도달

    Revoked --> [*]
    Expired --> [*]

    note right of Created
        원본 키는 이 시점에만 반환
        SHA-256 해시로 서버 저장
    end note

    note right of GracePeriod
        기존 키와 새 키 모두 유효
        기본 24시간, 최대 72시간
    end note
```

#### 키 생성 플로우

1. 소유자가 `POST /api/v1/auth/keys` 호출 (요구 스코프: `admin:all` 또는 Owner 역할)
2. 서버가 32바이트 암호학적 랜덤 생성 (`crypto.randomBytes(32)`)
3. 접두사 추가: `wai_live_` + Base62(랜덤) = 전체 키
4. SHA-256 해시 계산: `sha256(fullKey)` -> `hashedKey`로 DB 저장
5. 원본 키를 응답으로 **한 번만** 반환 (이후 조회 불가 - Stripe 패턴)
6. `lastUsedAt: null`, `isActive: true`로 초기화

#### 키 로테이션 플로우

1. 기존 키 ID로 로테이션 요청
2. 새 키 생성 (기존 키의 scopes, ipWhitelist 상속)
3. 새 키의 `rotatedFromId`에 기존 키 ID 기록
4. 기존 키는 유예 기간(Grace Period) 진입 (기본 24시간)
5. 유예 기간 동안 기존 키와 새 키 모두 유효
6. 유예 기간 만료 후 기존 키 자동 폐기

#### 키 저장 방식

```typescript
// 키 생성 시 저장 로직
import { createHash, randomBytes } from 'crypto';

function generateApiKey(prefix: 'wai_live_' | 'wai_test_'): {
  fullKey: string;     // 사용자에게 반환 (1회만)
  hashedKey: string;   // DB에 저장
} {
  const randomPart = randomBytes(32).toString('base64url'); // 43자
  const fullKey = `${prefix}${randomPart}`;

  // SHA-256 해싱 - 원본은 절대 저장하지 않음
  const hashedKey = createHash('sha256')
    .update(fullKey)
    .digest('hex');

  return { fullKey, hashedKey };
}
```

**보안 원칙:**
- 원본 키는 생성 시 한 번만 반환, 서버에 저장하지 않음
- DB에는 SHA-256 해시만 저장
- API 요청 시 전달된 키를 해싱하여 DB 해시와 비교
- 키 유출 시 원본 복원 불가

### 2.5 IP 화이트리스트

```typescript
interface IpWhitelistConfig {
  // CIDR 표기법 지원
  cidrs: string[];  // 예: ["203.0.113.0/24", "198.51.100.42/32"]

  // 빈 배열 = 모든 IP 허용 (주의 경고 표시)
  // 프로덕션 환경에서는 IP 화이트리스트 설정 강력 권장
}
```

**검증 규칙:**
- CIDR 형식 유효성 검사 (IPv4: `/0` ~ `/32`, IPv6: `/0` ~ `/128`)
- 최대 20개 CIDR 항목
- `0.0.0.0/0` 또는 `::/0`은 경고 로그 기록 (전체 허용과 동일)
- IP 화이트리스트 미설정 시 프로덕션 환경에서 경고 이벤트 발생

### 2.6 Rate Limiting 연동

API Key별 Rate Limiting은 권한 및 정책 모델(API-03, 19-permission-policy-model.md)에서 상세 설계한다. 인증 레이어에서는 API Key를 식별자로 Rate Limit 카운터를 관리한다.

```typescript
// Rate Limit 식별 키 구조
type RateLimitKey = `ratelimit:${string}`; // ratelimit:key_abc123def456
```

---

## 3. OAuth 2.1 Client Credentials 설계

### 3.1 사용 시나리오

| 시나리오 | Grant Type | 설명 |
|---------|-----------|------|
| 서드파티 프레임워크 연동 | Client Credentials | LangChain, CrewAI 등이 WAIaaS API에 위임 접근 |
| 마이크로서비스 간 통신 | Client Credentials | 내부 서비스 간 인증 |
| 소유자 대시보드 UI | Authorization Code + PKCE | 브라우저 기반 소유자 접근 (에이전트 경로 아님) |

> **주의:** AI 에이전트의 직접 API 접근에는 OAuth 2.1이 아닌 API Key를 사용한다. OAuth 2.1은 서드파티 위임 접근 시에만 사용.

### 3.2 OAuth 2.1 핵심 요구사항

| 요구사항 | OAuth 2.1 정책 | WAIaaS 적용 |
|---------|---------------|-------------|
| PKCE 필수 | 모든 Grant에 PKCE 적용 | S256 code challenge method 필수 |
| Implicit Grant 폐지 | 토큰이 URL에 노출되는 보안 문제 | 지원하지 않음 |
| Refresh Token Rotation | 재사용 시 전체 무효화 | 사용 시 새 refresh_token 발급 |
| Client 인증 | client_secret_post 또는 private_key_jwt | client_secret_post 기본 |

### 3.3 Client Credentials Grant 플로우

```mermaid
sequenceDiagram
    participant C as Third-Party Client
    participant AS as WAIaaS Auth Server
    participant API as WAIaaS API Server
    participant DB as Token Store (Redis)

    Note over C: 사전 등록된 client_id/client_secret 보유

    C->>AS: POST /oauth/token
    Note right of C: grant_type=client_credentials<br/>client_id=clt_xxx<br/>client_secret=sec_xxx<br/>scope=transactions:execute wallets:read<br/>code_verifier=xxx (PKCE)

    AS->>AS: 1. client_id/secret 검증
    AS->>AS: 2. PKCE code_verifier 검증
    AS->>AS: 3. 요청 스코프 vs 허용 스코프 비교
    AS->>DB: 4. 토큰 메타데이터 저장

    AS-->>C: 200 OK
    Note left of AS: access_token (JWT, 15분)<br/>refresh_token (opaque, 7일)<br/>token_type=Bearer<br/>expires_in=900<br/>scope=transactions:execute wallets:read

    C->>API: GET /api/v1/agents/:id/balance
    Note right of C: Authorization: Bearer eyJhbG...

    API->>API: 1. JWT 서명 검증
    API->>API: 2. 만료 시간 확인
    API->>API: 3. 스코프 권한 확인
    API-->>C: 200 OK (Balance data)

    Note over C: access_token 만료 시

    C->>AS: POST /oauth/token
    Note right of C: grant_type=refresh_token<br/>refresh_token=rt_xxx<br/>client_id=clt_xxx

    AS->>DB: 기존 refresh_token 무효화
    AS->>DB: 새 토큰 쌍 저장
    AS-->>C: 200 OK (새 access_token + 새 refresh_token)
```

### 3.4 Dynamic Client Registration (DCR)

에이전트 생성 시 자동으로 OAuth Client를 등록할 수 있다.

```typescript
// POST /oauth/register 요청
interface DynamicClientRegistrationRequest {
  client_name: string;              // 에이전트 별칭
  grant_types: ['client_credentials'];
  scope: string;                    // 요청 스코프 (공백 구분)
  token_endpoint_auth_method: 'client_secret_post';
  agent_id?: string;                // WAIaaS 에이전트 ID (연동 시)
}

// POST /oauth/register 응답
interface DynamicClientRegistrationResponse {
  client_id: string;                // clt_xxx (고유 클라이언트 ID)
  client_secret: string;            // sec_xxx (1회만 반환)
  client_name: string;
  grant_types: string[];
  scope: string;
  token_endpoint_auth_method: string;
  client_id_issued_at: number;      // Unix timestamp
  client_secret_expires_at: number; // 0 = 무기한
}
```

**에이전트 생성 시 자동 등록 옵션:**
- 에이전트 생성 API(`POST /api/v1/agents`)에 `registerOAuthClient: true` 옵션
- 에이전트 ID와 OAuth Client가 자동 연동
- 에이전트 SUSPENDED/TERMINATED 시 해당 OAuth Client도 비활성화

### 3.5 JWT 토큰 구조

```typescript
// Access Token (JWT) Claims
interface AccessTokenClaims {
  // 표준 클레임
  iss: string;          // "https://api.waiass.io" (발급자)
  sub: string;          // client_id 또는 owner_id (주체)
  aud: string;          // "https://api.waiass.io/api/v1" (수신자)
  exp: number;          // 만료 시간 (발급 + 15분)
  iat: number;          // 발급 시간
  jti: string;          // 토큰 고유 ID (재사용 방지)

  // WAIaaS 커스텀 클레임
  scope: string;        // "transactions:execute wallets:read" (공백 구분)
  agent_id?: string;    // 연동된 에이전트 ID
  owner_id: string;     // 소유자 ID
  project_id: string;   // 프로젝트 ID
}
```

**토큰 수명:**

| 토큰 | 수명 | 갱신 방식 |
|------|------|----------|
| Access Token (JWT) | 15분 | refresh_token으로 갱신 |
| Refresh Token (Opaque) | 7일 | Rotation: 사용 시 새 토큰 발급, 기존 무효화 |

**스코프 일관성:** OAuth 2.1의 scope는 API Key의 `ApiScope`와 동일한 체계를 공유한다. OAuth Client에 부여된 scope는 연동된 API Key의 scopes를 초과할 수 없다.

---

## 4. MCP Authorization 설계

### 4.1 MCP 스펙 요구사항

MCP(Model Context Protocol)는 AI 에이전트 프레임워크(Claude, GPT 등)가 외부 도구에 접근하는 표준 프로토콜이다. MCP 스펙은 OAuth 2.1 기반 인증을 요구하며, Protected Resource Metadata(PRM)를 통한 자동 발견을 지원한다.

### 4.2 Protected Resource Metadata (PRM) 엔드포인트

```
GET /.well-known/oauth-protected-resource
```

**응답:**

```json
{
  "resource": "https://api.waiass.io",
  "authorization_servers": [
    "https://api.waiass.io"
  ],
  "scopes_supported": [
    "agents:read",
    "agents:write",
    "transactions:read",
    "transactions:execute",
    "wallets:read",
    "wallets:fund",
    "policies:read",
    "policies:write",
    "dashboard:read"
  ],
  "bearer_methods_supported": [
    "header"
  ],
  "resource_documentation": "https://docs.waiass.io/api/authentication"
}
```

### 4.3 OAuth Authorization Server Metadata

```
GET /.well-known/oauth-authorization-server
```

**응답:**

```json
{
  "issuer": "https://api.waiass.io",
  "token_endpoint": "https://api.waiass.io/oauth/token",
  "registration_endpoint": "https://api.waiass.io/oauth/register",
  "scopes_supported": [
    "agents:read",
    "agents:write",
    "agents:delete",
    "transactions:read",
    "transactions:execute",
    "wallets:read",
    "wallets:fund",
    "policies:read",
    "policies:write",
    "dashboard:read",
    "admin:all"
  ],
  "response_types_supported": ["token"],
  "grant_types_supported": [
    "client_credentials",
    "refresh_token"
  ],
  "token_endpoint_auth_methods_supported": [
    "client_secret_post"
  ],
  "code_challenge_methods_supported": ["S256"],
  "service_documentation": "https://docs.waiass.io"
}
```

### 4.4 MCP + API Key 어댑터

MCP 클라이언트(AI 에이전트 프레임워크)가 WAIaaS의 API Key를 직접 사용할 수 있는 어댑터 레이어를 제공한다. 이는 05-RESEARCH.md Open Question 2에 대한 해결책이다.

```typescript
// MCP 인증 어댑터 - API Key를 Bearer Token으로 취급
interface McpAuthAdapter {
  // 방식 1: API Key 직접 전달
  // MCP 클라이언트가 Authorization: Bearer wai_live_xxx로 직접 접근
  // 서버가 접두사(wai_live_/wai_test_)로 API Key vs JWT 구분

  // 방식 2: OAuth 2.1 표준 플로우
  // MCP 클라이언트가 PRM 발견 -> OAuth Token 획득 -> API 호출

  // 판별 로직
  resolveAuthMethod(authHeader: string): 'api_key' | 'oauth_jwt';
}

// 판별 로직 상세
function resolveAuthMethod(bearerToken: string): 'api_key' | 'oauth_jwt' {
  if (bearerToken.startsWith('wai_live_') || bearerToken.startsWith('wai_test_')) {
    return 'api_key';
  }
  // JWT 형식 (xxx.yyy.zzz) 확인
  if (bearerToken.split('.').length === 3) {
    return 'oauth_jwt';
  }
  throw new AuthenticationError('INVALID_TOKEN_FORMAT');
}
```

### 4.5 MCP 인증 플로우

```mermaid
sequenceDiagram
    participant MCP as MCP Client (AI Framework)
    participant PRM as PRM Endpoint
    participant AS as WAIaaS Auth Server
    participant API as WAIaaS MCP Server

    Note over MCP: MCP 서버 연결 시작

    MCP->>PRM: GET /.well-known/oauth-protected-resource
    PRM-->>MCP: resource, authorization_servers, scopes_supported

    MCP->>AS: GET /.well-known/oauth-authorization-server
    AS-->>MCP: token_endpoint, registration_endpoint, grant_types

    alt OAuth 2.1 표준 플로우
        MCP->>AS: POST /oauth/register (Dynamic Client Registration)
        AS-->>MCP: client_id, client_secret

        MCP->>AS: POST /oauth/token (client_credentials + PKCE)
        AS-->>MCP: access_token (JWT, 15분)

        MCP->>API: MCP Tool 호출 (Authorization: Bearer eyJhbG...)
    else API Key 직접 전달
        Note over MCP: 사전 발급된 API Key 사용
        MCP->>API: MCP Tool 호출 (Authorization: Bearer wai_live_xxx)
    end

    API->>API: 인증 검증 (JWT 또는 API Key)
    API->>API: RBAC + ABAC 정책 검사
    API-->>MCP: Tool 실행 결과
```

### 4.6 MCP Authorization과 API Key의 관계

| 구분 | MCP OAuth 플로우 | MCP API Key 직접 전달 |
|------|-----------------|---------------------|
| 설정 복잡도 | 높음 (PRM 발견 -> DCR -> 토큰) | 낮음 (키 1개로 즉시 접근) |
| 보안 수준 | 높음 (토큰 자동 만료, 갱신) | 중간 (키 유출 시 수동 폐기 필요) |
| 권장 대상 | 프로덕션 MCP 클라이언트 | 개발/테스트 환경 |
| 스코프 관리 | OAuth scope로 세밀 제어 | API Key scopes로 제어 |

---

## 5. 보안 고려사항

### 5.1 키 유출 시 대응 절차

```
1. 유출 감지
   ├── 모니터링: 비정상 IP 접근, 비정상 시간대, 비정상 요청 패턴
   ├── 사용자 신고: 대시보드 또는 API로 유출 신고
   └── 자동 탐지: 동일 키 다중 지역 동시 사용

2. 즉시 대응 (자동)
   ├── 해당 API Key 즉시 비활성화 (DELETE /api/v1/auth/keys/:keyId)
   ├── 연동된 OAuth Client 비활성화
   ├── 관련 에이전트 SUSPENDED 전환 (REL-03 상태 모델)
   └── 소유자에게 즉시 알림 (Webhook: emergency.triggered)

3. 복구 절차 (소유자 수동)
   ├── 소유자가 새 API Key 생성
   ├── 에이전트 상태 확인 후 ACTIVE 재전환
   └── 감사 로그 검토 (유출 기간 동안의 모든 요청)
```

### 5.2 비정상 사용 탐지

| 탐지 규칙 | 임계값 | 대응 |
|----------|--------|------|
| 동일 키 다중 IP 접근 | 5분 내 3개 이상 다른 IP | 경고 + 소유자 알림 |
| 비정상 시간대 접근 | 정책 운영시간 외 요청 | ABAC 정책으로 거부 |
| 인증 실패 연속 | 10분 내 10회 실패 | 해당 IP 15분 차단 |
| 비정상 스코프 요청 | 키 스코프 외 반복 요청 | 경고 로그 + 소유자 알림 |
| 비정상 요청량 | Rate Limit 5배 초과 시도 | 해당 키 1시간 차단 |

### 5.3 전송 보안

| 항목 | 정책 |
|------|------|
| **TLS** | HTTPS 필수, HTTP 요청 거부 (301 리다이렉트 아님, 거부) |
| **최소 버전** | TLS 1.2 이상, TLS 1.3 권장 |
| **인증서** | 유효한 공인 인증서 필수 (자체 서명 거부) |
| **HSTS** | `Strict-Transport-Security: max-age=31536000; includeSubDomains` |

### 5.4 CORS 정책

| 환경 | CORS 정책 | 이유 |
|------|----------|------|
| API 서버 | 기본 비활성 (서비스 간 통신) | 에이전트/서버는 브라우저가 아님 |
| 대시보드 UI 전용 | `Access-Control-Allow-Origin: https://dashboard.waiass.io` | 소유자 대시보드만 허용 |
| 개발 환경 | `localhost:*` 허용 | 개발 편의 |

### 5.5 감사 로그

모든 인증 이벤트는 감사 로그에 기록한다.

```typescript
interface AuthAuditLog {
  id: string;                     // 로그 고유 ID
  timestamp: Date;                // ISO 8601
  eventType: AuthEventType;       // 이벤트 유형
  keyId: string | null;           // 사용된 API Key ID
  clientId: string | null;        // OAuth Client ID
  ownerId: string;                // 소유자 ID
  sourceIp: string;               // 요청 IP
  userAgent: string;              // User-Agent 헤더
  endpoint: string;               // 요청 엔드포인트
  method: string;                 // HTTP 메서드
  statusCode: number;             // 응답 상태 코드
  success: boolean;               // 인증 성공 여부
  failureReason: string | null;   // 실패 사유
  requestId: string;              // 요청 추적 ID
}

type AuthEventType =
  | 'api_key.created'
  | 'api_key.used'
  | 'api_key.rotated'
  | 'api_key.revoked'
  | 'api_key.expired'
  | 'api_key.failed'
  | 'oauth.token_issued'
  | 'oauth.token_refreshed'
  | 'oauth.token_revoked'
  | 'oauth.client_registered'
  | 'oauth.auth_failed'
  | 'mcp.auth_success'
  | 'mcp.auth_failed';
```

---

## 6. 인증 관련 API 엔드포인트 요약

### 6.1 API Key 관리

#### POST /api/v1/auth/keys - API Key 생성

```typescript
// 요청
interface CreateApiKeyRequest {
  name: string;                    // 키 별칭
  scopes: ApiScope[];              // 허용 스코프
  ipWhitelist?: string[];          // IP 화이트리스트 (CIDR)
  expiresAt?: string;              // 만료 시점 (ISO 8601, null = 무기한)
  metadata?: Record<string, string>; // 추가 메타데이터
}

// 응답 (201 Created)
interface CreateApiKeyResponse {
  id: string;                      // key_xxx
  key: string;                     // wai_live_xxx (이 시점에만 반환!)
  prefix: string;                  // wai_live_ | wai_test_
  name: string;
  scopes: ApiScope[];
  ipWhitelist: string[];
  expiresAt: string | null;
  createdAt: string;
}
```

**필요 스코프:** `admin:all` (소유자만 API Key 생성 가능)

#### GET /api/v1/auth/keys - API Key 목록 조회

```typescript
// 응답 (200 OK)
interface ListApiKeysResponse {
  keys: Array<{
    id: string;
    prefix: string;                // 접두사만 (보안)
    name: string;
    scopes: ApiScope[];
    ipWhitelist: string[];
    expiresAt: string | null;
    lastUsedAt: string | null;
    createdAt: string;
    isActive: boolean;
  }>;
  total: number;
}
```

**주의:** `hashedKey`와 원본 키는 목록에 포함되지 않음.

**필요 스코프:** `admin:all`

#### DELETE /api/v1/auth/keys/:keyId - API Key 폐기

```typescript
// 응답 (204 No Content)
// 키 즉시 비활성화, 해당 키로 진행 중인 요청은 완료 허용
```

**필요 스코프:** `admin:all`

### 6.2 OAuth 2.1 엔드포인트

#### POST /oauth/token - 토큰 발급

```typescript
// 요청 (application/x-www-form-urlencoded)
interface TokenRequest {
  grant_type: 'client_credentials' | 'refresh_token';
  client_id: string;
  client_secret: string;
  scope?: string;                  // 공백 구분 스코프
  code_verifier?: string;          // PKCE (client_credentials 시)
  refresh_token?: string;          // grant_type=refresh_token 시
}

// 응답 (200 OK)
interface TokenResponse {
  access_token: string;            // JWT
  token_type: 'Bearer';
  expires_in: 900;                 // 15분 (초)
  refresh_token: string;           // opaque token
  scope: string;                   // 부여된 스코프
}
```

#### POST /oauth/register - Dynamic Client Registration

요청/응답은 섹션 3.4의 DCR 인터페이스 참조.

### 6.3 MCP 메타데이터 엔드포인트

#### GET /.well-known/oauth-protected-resource

Protected Resource Metadata 반환. 섹션 4.2 참조.

#### GET /.well-known/oauth-authorization-server

OAuth Authorization Server Metadata 반환. 섹션 4.3 참조.

### 6.4 엔드포인트 요약 테이블

| 엔드포인트 | 메서드 | 인증 | 용도 |
|-----------|--------|------|------|
| `/api/v1/auth/keys` | POST | API Key (admin:all) | API Key 생성 |
| `/api/v1/auth/keys` | GET | API Key (admin:all) | API Key 목록 조회 |
| `/api/v1/auth/keys/:keyId` | DELETE | API Key (admin:all) | API Key 폐기 |
| `/oauth/token` | POST | Client Credentials | OAuth 토큰 발급/갱신 |
| `/oauth/register` | POST | API Key (admin:all) | Dynamic Client Registration |
| `/.well-known/oauth-protected-resource` | GET | 없음 (공개) | MCP PRM 메타데이터 |
| `/.well-known/oauth-authorization-server` | GET | 없음 (공개) | OAuth 서버 메타데이터 |

---

## 부록: 인증 검증 미들웨어 설계 참고

```typescript
// Fastify 인증 미들웨어 (구현 시 참고)
async function authenticateRequest(
  request: FastifyRequest
): Promise<AuthContext> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('AUTH_MISSING_TOKEN');
  }

  const token = authHeader.slice(7); // "Bearer " 제거
  const authMethod = resolveAuthMethod(token);

  if (authMethod === 'api_key') {
    // API Key 검증
    const hashedKey = sha256(token);
    const apiKey = await findApiKeyByHash(hashedKey);

    if (!apiKey || !apiKey.isActive) throw new AuthenticationError('AUTH_KEY_INVALID');
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) throw new AuthenticationError('AUTH_KEY_EXPIRED');
    if (apiKey.ipWhitelist.length > 0 && !isIpAllowed(request.ip, apiKey.ipWhitelist)) {
      throw new AuthenticationError('AUTH_IP_DENIED');
    }

    // lastUsedAt 업데이트 (비동기, 요청 차단 안 함)
    updateLastUsedAt(apiKey.id);

    return { method: 'api_key', keyId: apiKey.id, ownerId: apiKey.ownerId, scopes: apiKey.scopes };
  }

  if (authMethod === 'oauth_jwt') {
    // JWT 검증
    const claims = await verifyJwt(token);
    return { method: 'oauth', clientId: claims.sub, ownerId: claims.owner_id, scopes: claims.scope.split(' ') };
  }

  throw new AuthenticationError('AUTH_INVALID_METHOD');
}
```
