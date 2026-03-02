# 마일스톤 m30-10: ERC-8128 Signed HTTP Requests 지원

- **Status:** PLANNED
- **Milestone:** v30.5

## 목표

ERC-8128 (Signed HTTP Requests with Ethereum) 표준을 WAIaaS에 통합하여, WAIaaS 관리 지갑이 외부 API 호출 시 RFC 9421 기반 HTTP 메시지 서명으로 인증할 수 있는 상태. x402(결제) + ERC-8004(신원) + ERC-8128(API 인증)으로 에이전트 웹 인증 3종 세트를 완성한다.

---

## 배경

### ERC-8128 개요

ERC-8128은 2026년 1월 jacopo-eth가 제안한 이더리움 표준(Draft)으로, RFC 9421 (HTTP Message Signatures)에 이더리움 서명 체계를 결합하여 HTTP 요청 자체를 지갑 키로 서명·검증하는 메커니즘을 정의한다.

**핵심 구성 요소:**

| 구성 요소 | 역할 | 기반 표준 |
|---|---|---|
| **Signature-Input 헤더** | 서명 대상 컴포넌트 + 파라미터 선언 | RFC 9421 Structured Fields |
| **Signature 헤더** | 실제 secp256k1 서명 값 | EIP-191 (EOA) / ERC-1271 (SCA) |
| **Content-Digest 헤더** | 요청 본문 해시 (무결성) | RFC 9530 |
| **keyid** | 서명자 식별 (`erc8128:<chainId>:<address>`) | CAIP-10 기반 |

**기존 인증 방식 대비:**

| 특성 | API 키 / JWT | ERC-8128 |
|---|---|---|
| 비밀 관리 | 서버가 발급·저장·회전 | 불필요 (지갑 키 = 자격증명) |
| 재사용 공격 | 토큰 탈취 시 재사용 가능 | 요청별 바인딩, 리플레이 불가 |
| 상태 관리 | 세션/토큰 상태 유지 필요 | 완전 무상태 |
| 신원 확인 | 서버 의존 | 온체인 주소로 독립 검증 |

### WAIaaS와의 정합성

ERC-8128은 "지갑 키 = 인증 수단"이라는 WAIaaS 철학과 정확히 일치하며, 기존 x402·ERC-8004과 함께 에이전트의 외부 상호작용 세 축을 완성한다.

| 프로토콜 | 에이전트 용도 | 데몬 역할 | 파이프라인 경로 |
|---|---|---|---|
| **x402** (v1.5.1 구현 완료) | HTTP 결제 | EIP-712 결제 서명 | X402_PAYMENT |
| **ERC-8004** (m30-08 설계 완료) | 온체인 신원·평판 | 레지스트리 컨트랙트 호출 | CONTRACT_CALL |
| **ERC-8128** (본 마일스톤) | 외부 API 인증 | RFC 9421 HTTP 요청 서명 | SIGN |

**매핑:**

| ERC-8128 개념 | WAIaaS 대응 | 매핑 |
|---|---|---|
| 서명 클라이언트 (Signer) | WAIaaS 데몬 | 에이전트 대신 지갑 키로 HTTP 요청 서명 |
| keyid (`erc8128:<chainId>:<address>`) | 지갑 주소 | 자동 생성 (지갑 네트워크 + 주소) |
| 서명 검증자 (Verifier) | 외부 API 서버 | `ecrecover` 또는 ERC-1271 검증 |
| Covered Components | 에이전트가 지정 | 서명 대상 HTTP 컴포넌트 선택 |
| Nonce / TTL | 데몬이 자동 관리 | 리플레이 방지 |

### 기술적 기반

WAIaaS는 ERC-8128 통합에 필요한 인프라를 갖추고 있다:

- **SIGN 파이프라인**: 임의 데이터 서명 경로 (v1.4.7 구현 완료)
- **sodium-native**: 암호화 기반 인프라
- **viem 2.x**: `signMessage()` (EIP-191), `signTypedData()` (EIP-712)
- **6-stage pipeline**: 정책 평가 → 서명 → 결과 반환 (SIGN은 Stage 5에서 제출 없이 서명만 반환)
- **정책 엔진**: x402의 `X402_ALLOWED_DOMAINS` 패턴을 그대로 재사용 가능
- **connect-info**: capabilities에 `erc8128Support: true` 추가로 에이전트에 능력 노출

### ERC-8128 + ERC-8004 시너지

두 표준이 결합되면 레이어드 인가가 가능해진다:

```
ERC-8128 → "이 HTTP 요청은 이 주소에서 보냄" (인증)
ERC-8004 → "이 주소는 이런 에이전트이며 이런 평판을 가짐" (인가)

외부 API 서버:
  1. ERC-8128 서명 검증 → 주소 확인
  2. ERC-8004 Identity Registry 조회 → 에이전트 정보 확인
  3. ERC-8004 Reputation Registry 조회 → 평판 기반 접근 제어
```

---

## 범위

### 포함

1. **HTTP 메시지 서명 엔진** → SIG-01
2. **REST API / MCP / SDK 확장** → SIG-02
3. **정책 타입: ERC8128_ALLOWED_DOMAINS** → SIG-03
4. **서명 검증 유틸리티 (선택적 서버 측)** → SIG-04
5. **Admin UI 설정** → SIG-05
6. **Skill 파일 생성/업데이트** → SIG-06
7. **NotificationEventType 확장** → SIG-07

### 제외

- ERC-8128을 WAIaaS 자체 API 인증에 적용 (기존 masterAuth/sessionAuth 대체 아님)
- Smart Contract Account (ERC-1271) 서명 — EOA (EIP-191) 서명만 지원 (SCA 지원은 후속)
- 서명 프록시 모드 (데몬이 외부 API를 직접 호출하는 프록시) — 서명만 반환, 호출은 에이전트가 수행
- Solana 체인 대응 (ERC-8128은 이더리움 표준)

---

## 선행 조건

- SIGN 파이프라인 안정화 (v1.4.7 구현 완료)
- x402 구현 완료 (v1.5.1 — 도메인 정책 패턴 참조)
- ERC-8128 EIP 상태가 Draft 이상 유지

## 리서치 필수 사항

> **이 마일스톤은 구현 전 리서치 페이즈가 필수이다.** ERC-8128은 Draft 상태이며, 스펙이 확정되지 않았다.

1. **ERC-8128 EIP 상태 검증** — Draft/Review/Final 중 어느 상태인지, 스펙 변경 이력 확인
2. **RFC 9421 HTTP Message Signatures 상세** — Structured Fields 인코딩, Signature-Input 문법, Covered Components 규칙
3. **RFC 9530 Content-Digest** — 요청 본문 다이제스트 생성 규칙
4. **keyid 형식 확정** — `erc8128:<chainId>:<address>` vs `eip155:<chainId>:<address>` vs 하이브리드, 최종 채택 형식 확인
5. **Nonce 전략 확정** — mandatory nonce vs optional TTL, 수평 확장 환경 대응 방안
6. **서명 알고리즘** — secp256k1 + EIP-191 외 추가 알고리즘 요구 여부 (P-256 등)
7. **참조 구현 존재 여부** — npm 라이브러리, SDK, 테스트 벡터 파악
8. **생태계 현황** — ERC-8128을 지원하는 API 서비스 존재 여부

리서치 결과에 따라 본 문서의 서명 플로우, 헤더 형식, 정책 설계가 수정될 수 있다.

---

## 설계 대상

### 1. SIG-01: HTTP 메시지 서명 엔진

RFC 9421 기반으로 HTTP 요청에 대한 서명을 생성하는 핵심 모듈.

> **요구사항:** ENG-01, ENG-02, ENG-03, ENG-04, ENG-05

#### 1.1 ENG-01: 디렉토리 구조

```
packages/core/src/erc8128/
  index.ts                    # 공개 API (signHttpRequest, buildSignatureInput)
  http-message-signer.ts      # RFC 9421 서명 생성기
  signature-input-builder.ts  # Signature-Input 헤더 빌더
  content-digest.ts           # RFC 9530 Content-Digest 생성
  keyid.ts                    # keyid 형식 생성/파싱
  types.ts                    # Zod 스키마 + TypeScript 타입
  constants.ts                # 알고리즘 식별자, 기본 Covered Components
```

**설계 결정 — 패키지 위치:**
ERC-8128 서명 엔진은 `@waiaas/core`에 배치한다. 이유: (1) 온체인 컨트랙트 호출이 없으므로 `@waiaas/actions`에 부적합, (2) SDK에서도 서명 검증 유틸리티를 사용할 수 있어야 함, (3) x402 서명 로직도 core에 존재.

#### 1.2 ENG-02: 서명 플로우

```
에이전트가 서명 요청:
  {
    method: 'POST',
    url: 'https://api.example.com/v1/data',
    headers: { 'Content-Type': 'application/json' },
    body: '{"query": "..."}',
    coveredComponents: ['@method', '@target-uri', 'content-digest', 'content-type'],
    walletId: 'wallet-uuid',
    network: 'ethereum-mainnet',
  }

데몬 처리:
  1. Content-Digest 생성 (SHA-256 of body)
     → Content-Digest: sha-256=:base64hash:
  2. Signature-Input 구성 (RFC 9421 Structured Fields)
     → Signature-Input: sig1=("@method" "@target-uri" "content-digest" "content-type");
        created=1709251200;keyid="erc8128:1:0xAbC...";alg="eip191-secp256k1";nonce="uuid-v4"
  3. Signature Base 구성 (RFC 9421 §2.5)
     → "@method": POST
        "@target-uri": https://api.example.com/v1/data
        "content-digest": sha-256=:base64hash:
        "content-type": application/json
        "@signature-params": ("@method" "@target-uri" "content-digest" "content-type");...
  4. EIP-191 서명 (signMessage)
     → signature = wallet.signMessage(signatureBase)
  5. Signature 헤더 생성
     → Signature: sig1=:base64signature:

반환값:
  {
    headers: {
      'Content-Digest': 'sha-256=:base64hash:',
      'Signature-Input': 'sig1=(...)',
      'Signature': 'sig1=:base64sig:',
    },
    keyid: 'erc8128:1:0xAbC...',
    expiresAt: 1709251500,
  }
```

#### 1.3 ENG-03: Covered Components 기본값

에이전트가 `coveredComponents`를 지정하지 않으면 보안 기본값을 적용한다.

| 보안 수준 | Covered Components | 용도 |
|----------|-------------------|------|
| **minimal** | `@method`, `@target-uri` | GET 요청, 본문 없음 |
| **standard** (기본) | `@method`, `@target-uri`, `content-digest`, `content-type` | POST/PUT 요청 |
| **strict** | `@method`, `@target-uri`, `@authority`, `content-digest`, `content-type`, `@request-target` | 고보안 요청 |

```typescript
const CoveredComponentsPresetSchema = z.enum(['minimal', 'standard', 'strict']);

const DEFAULT_COVERED_COMPONENTS: Record<string, string[]> = {
  minimal: ['@method', '@target-uri'],
  standard: ['@method', '@target-uri', 'content-digest', 'content-type'],
  strict: ['@method', '@target-uri', '@authority', 'content-digest', 'content-type', '@request-target'],
};
```

#### 1.4 ENG-04: Nonce / TTL 전략

리플레이 방지를 위한 nonce 자동 생성 + TTL 설정.

```typescript
const SignatureParamsSchema = z.object({
  // 자동 생성 (UUID v4)
  nonce: z.string().uuid().optional(),
  // 서명 생성 시각 (자동 설정, Unix 초)
  created: z.number().int().optional(),
  // 서명 만료 시각 (created + ttlSec, 기본 300초)
  expires: z.number().int().optional(),
  // TTL (초, 기본 300)
  ttlSec: z.number().int().min(10).max(3600).default(300),
});
```

**설계 결정 — Nonce 방식:**
현재 ERC-8128 스펙에서 nonce 필수/선택 여부가 미확정이다. WAIaaS는 **기본 nonce 생성 + 선택적 비활성화**를 채택한다. nonce를 사용하지 않는 환경(수평 확장 서버)에서는 TTL만으로 리플레이를 제한할 수 있도록 `nonce: false` 옵션을 지원한다.

#### 1.5 ENG-05: 알고리즘 식별자

```typescript
// ERC-8128 알고리즘 레지스트리
const ERC8128_ALGORITHMS = {
  'eip191-secp256k1': {
    sign: (message: string, privateKey: Hex) => signMessage({ message }),
    verify: (message: string, signature: Hex) => recoverAddress({ message, signature }),
    description: 'EIP-191 personal_sign with secp256k1 (EOA)',
  },
  // 향후 확장 (P-256 등은 리서치 결과에 따라 추가)
} as const;

const DEFAULT_ALGORITHM = 'eip191-secp256k1';
```

---

### 2. SIG-02: REST API / MCP / SDK 확장

#### 2.1 API-01: 신규 REST API 엔드포인트

**서명 생성 (핵심):**

| Method | Path | Auth | 설명 |
|--------|------|------|------|
| POST | `/v1/erc8128/sign` | sessionAuth | HTTP 요청에 대한 ERC-8128 서명 생성 |

**서명 검증 (유틸리티, 선택적):**

| Method | Path | Auth | 설명 |
|--------|------|------|------|
| POST | `/v1/erc8128/verify` | sessionAuth | ERC-8128 서명 검증 (디버깅/테스트용) |

**요청 스키마:**

```typescript
const SignHttpRequestSchema = z.object({
  // HTTP 요청 정보
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  url: z.string().url(),
  headers: z.record(z.string()).optional().default({}),
  body: z.string().optional(),

  // 서명 옵션
  walletId: z.string().uuid(),
  network: z.string().min(1),
  coveredComponents: z.array(z.string()).optional(),
  preset: CoveredComponentsPresetSchema.optional().default('standard'),
  ttlSec: z.number().int().min(10).max(3600).optional().default(300),
  nonce: z.union([z.string(), z.literal(false)]).optional(),
});
```

**응답 스키마:**

```typescript
const SignHttpResponseSchema = z.object({
  // 에이전트가 원본 요청에 추가할 헤더
  headers: z.object({
    'Signature-Input': z.string(),
    'Signature': z.string(),
    'Content-Digest': z.string().optional(),
  }),
  // 메타데이터
  keyid: z.string(),
  algorithm: z.string(),
  created: z.number(),
  expires: z.number(),
  coveredComponents: z.array(z.string()),
});
```

**에러 응답:**

| 상태 코드 | 에러 코드 | 설명 |
|----------|----------|------|
| 400 | `INVALID_COVERED_COMPONENTS` | 지원하지 않는 Covered Component 지정 |
| 400 | `BODY_REQUIRED_FOR_DIGEST` | content-digest가 covered에 포함되었으나 body 누락 |
| 403 | `ERC8128_DOMAIN_NOT_ALLOWED` | 대상 도메인이 정책에 의해 차단됨 |
| 422 | `UNSUPPORTED_ALGORITHM` | 지원하지 않는 서명 알고리즘 |
| 422 | `EVM_WALLET_REQUIRED` | 지정된 지갑이 EVM이 아님 (Solana 불가) |

#### 2.2 API-02: 요청·응답 시퀀스

```
AI 에이전트                    WAIaaS 데몬                    외부 API 서버
    |                              |                              |
    |-- POST /v1/erc8128/sign ---->|                              |
    |   { method, url, headers,    |                              |
    |     body, walletId, network }|                              |
    |                              |                              |
    |                   1. 정책 검사                               |
    |                      ERC8128_ALLOWED_DOMAINS                 |
    |                   2. Content-Digest 생성                     |
    |                   3. Signature-Input 구성                    |
    |                   4. Signature Base 구성                     |
    |                   5. signMessage(signatureBase)              |
    |                   6. 응답 헤더 조립                          |
    |                              |                              |
    |<-- { headers, keyid, ... } --|                              |
    |                              |                              |
    |-- 원본 HTTP 요청 + 서명 헤더 --------------------------->|
    |   POST https://api.example.com/v1/data                      |
    |   Signature-Input: sig1=(...)                                |
    |   Signature: sig1=:base64:                                   |
    |   Content-Digest: sha-256=:...:                              |
    |                              |                              |
    |                              |    서명 검증 (ecrecover)      |
    |                              |    keyid → 온체인 주소 확인   |
    |                              |    ERC-8004 평판 조회 (선택)  |
    |                              |                              |
    |<---------------------------------------- 200 OK ------------|
```

**설계 결정 — 서명만 반환, 프록시 안 함:**
데몬이 외부 API를 직접 호출하는 프록시 모드는 제공하지 않는다. 이유: (1) 데몬에 외부 네트워크 요청 경로를 열면 보안 공격면 증가, (2) 에이전트가 다양한 HTTP 클라이언트를 사용할 수 있어야 함, (3) x402도 서명만 반환하는 패턴. 에이전트는 서명 헤더를 받아 직접 외부 API를 호출한다.

#### 2.3 API-03: MCP Tool

| MCP Tool 이름 | 설명 | 매핑 |
|---|---|---|
| `erc8128_sign_request` | HTTP 요청에 ERC-8128 서명 헤더 생성 | POST /v1/erc8128/sign |
| `erc8128_verify_signature` | ERC-8128 서명 검증 (디버깅용) | POST /v1/erc8128/verify |

#### 2.4 API-04: TypeScript SDK 확장

```typescript
// packages/sdk/src/client.ts에 추가할 메서드

async signHttpRequest(params: SignHttpRequestInput): Promise<SignHttpResponse>;
async verifyHttpSignature(params: VerifyHttpSignatureInput): Promise<VerifyResult>;
```

**SDK 헬퍼 — fetch 래퍼:**

SDK에서 편의 메서드를 제공하여 서명 + 요청을 한 번에 수행할 수 있도록 한다.

```typescript
// packages/sdk/src/erc8128.ts — 편의 헬퍼

/**
 * ERC-8128 서명을 자동으로 추가하여 외부 API를 호출한다.
 * 내부적으로 signHttpRequest → fetch를 순차 호출.
 */
async function fetchWithErc8128(
  client: WAIaaSClient,
  walletId: string,
  network: string,
  url: string,
  init?: RequestInit & { preset?: 'minimal' | 'standard' | 'strict' },
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const body = init?.body ? String(init.body) : undefined;
  const headers = Object.fromEntries(new Headers(init?.headers).entries());

  // 1. 서명 요청
  const sig = await client.signHttpRequest({
    method, url, headers, body,
    walletId, network,
    preset: init?.preset ?? 'standard',
  });

  // 2. 서명 헤더 병합 + 원본 요청 전송
  return fetch(url, {
    ...init,
    headers: { ...headers, ...sig.headers },
  });
}
```

---

### 3. SIG-03: 정책 타입 — ERC8128_ALLOWED_DOMAINS

x402의 X402_ALLOWED_DOMAINS 패턴을 재사용한다.

> **요구사항:** POL-01, POL-02, POL-03

#### 3.1 POL-01: 정책 스키마

기존 PolicyType 배열에 추가:

```typescript
export const POLICY_TYPES = [
  // ... 기존 12개 (또는 ERC-8004 포함 시 13개) ...
  'ERC8128_ALLOWED_DOMAINS',   // 신규 추가
] as const;
```

**규칙 스키마:**

```typescript
const Erc8128AllowedDomainsRulesSchema = z.object({
  // 서명 허용 도메인 목록
  allowed_domains: z.array(z.string().min(1)).min(1),

  // default-deny: true = 목록에 없는 도메인 차단 (기본)
  // default-deny: false = 모든 도메인 허용 (allowed_domains 무시)
  default_deny: z.boolean().default(true),

  // 도메인별 최대 서명 빈도 (분당, 0=무제한)
  rate_limit_per_minute: z.number().int().min(0).max(1000).default(0),

  // 와일드카드 도메인 지원 (*.example.com)
  // allowed_domains에 "*." 프리픽스 시 서브도메인 전체 허용
});
```

#### 3.2 POL-02: Stage 3 정책 평가 위치

```
Stage 3 Policy 평가 순서:
  1. ALLOWED_NETWORKS
  2. CONTRACT_WHITELIST
  3. METHOD_WHITELIST
  4. ALLOWED_TOKENS
  5. APPROVED_SPENDERS
  6. REPUTATION_THRESHOLD     (ERC-8004, m30-08)
  7. SPENDING_LIMIT
  8. RATE_LIMIT
  9. TIME_RESTRICTION
  10. APPROVE_TIER_OVERRIDE
  11. X402_ALLOWED_DOMAINS
  12. ERC8128_ALLOWED_DOMAINS  ★ SIGN 타입에만 적용
```

**설계 결정 — SIGN 파이프라인에서만 적용:**
ERC8128_ALLOWED_DOMAINS는 `type: 'SIGN'` 트랜잭션에만 적용된다. SIGN 요청의 metadata에 `erc8128: true`와 `targetDomain`이 포함된 경우에만 정책을 평가한다. 다른 트랜잭션 타입에는 영향 없음.

#### 3.3 POL-03: default-deny 동작

x402와 동일하게 **default-deny** 정책을 적용한다.

| ERC8128_ALLOWED_DOMAINS 설정 | default_deny | 동작 |
|---|---|---|
| 미설정 | — | 모든 ERC-8128 서명 요청 차단 |
| 설정 + `default_deny: true` | true | allowed_domains에 포함된 도메인만 허용 |
| 설정 + `default_deny: false` | false | 모든 도메인 허용 (로깅만) |

**와일드카드 매칭:**

```typescript
// 도메인 매칭 로직
function isDomainAllowed(targetDomain: string, allowedDomains: string[]): boolean {
  return allowedDomains.some(pattern => {
    if (pattern.startsWith('*.')) {
      // *.example.com → api.example.com, sub.api.example.com 허용
      const suffix = pattern.slice(1); // .example.com
      return targetDomain.endsWith(suffix) || targetDomain === pattern.slice(2);
    }
    return targetDomain === pattern;
  });
}
```

---

### 4. SIG-04: 서명 검증 유틸리티

데몬이 외부에서 받은 ERC-8128 서명을 검증하는 유틸리티. 디버깅·테스트 용도이며, WAIaaS 자체 API 인증에는 사용하지 않는다.

> **요구사항:** VER-01, VER-02

#### 4.1 VER-01: 검증 함수

```typescript
// packages/core/src/erc8128/verifier.ts

interface VerifyResult {
  valid: boolean;
  recoveredAddress: string | null;
  keyid: string;
  error?: string;
}

async function verifyHttpSignature(
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  },
): Promise<VerifyResult> {
  // 1. Signature-Input 파싱 → covered components + params 추출
  // 2. Signature Base 재구성 (RFC 9421 §2.5)
  // 3. Content-Digest 검증 (body 해시 일치 여부)
  // 4. keyid에서 chainId + address 추출
  // 5. ecrecover(signatureBase, signature) → recovered address
  // 6. recovered address === keyid address 확인
}
```

#### 4.2 VER-02: REST API 검증 엔드포인트

```typescript
const VerifyHttpSignatureSchema = z.object({
  method: z.string(),
  url: z.string().url(),
  headers: z.record(z.string()),
  body: z.string().optional(),
});

// POST /v1/erc8128/verify
// 응답: { valid: boolean, recoveredAddress: string | null, keyid: string, error?: string }
```

---

### 5. SIG-05: Admin UI 설정

#### 5.1 UI-01: System 페이지 ERC-8128 섹션

기존 System > API Keys 패턴에 따라 ERC-8128 설정 섹션을 추가한다.

```
System 페이지
└── ERC-8128 Signed HTTP Requests 섹션
    ├── 활성화 토글 (erc8128.enabled)
    ├── 기본 서명 프리셋 (minimal / standard / strict)
    ├── 기본 TTL (초)
    └── Nonce 활성화 토글
```

#### 5.2 UI-02: Policies 페이지 ERC8128_ALLOWED_DOMAINS 폼

기존 X402_ALLOWED_DOMAINS 폼과 동일한 패턴:

```
ERC8128_ALLOWED_DOMAINS 정책 폼
├── default_deny: 체크박스 (기본 true)
├── allowed_domains: 도메인 목록 입력 (태그 형식)
│   예: api.example.com, *.openai.com, *.anthropic.com
├── rate_limit_per_minute: 숫자 입력 (0=무제한)
└── 한 줄 설명: "ERC-8128 서명을 허용할 외부 API 도메인을 지정합니다"
```

#### 5.3 UI-03: Admin Settings 키

| 설정 키 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `erc8128.enabled` | boolean | `false` | ERC-8128 서명 기능 활성화 |
| `erc8128.default_preset` | string | `standard` | 기본 Covered Components 프리셋 |
| `erc8128.default_ttl_sec` | number | `300` | 기본 서명 TTL (초) |
| `erc8128.nonce_enabled` | boolean | `true` | Nonce 자동 생성 활성화 |
| `erc8128.algorithm` | string | `eip191-secp256k1` | 서명 알고리즘 |

---

### 6. SIG-06: Skill 파일 업데이트

CLAUDE.md 규칙: API/MCP 변경 시 skill 파일 동기화 필수.

> **요구사항:** SKILL-01, SKILL-02

#### 6.1 SKILL-01: 기존 skill 파일 업데이트

- **`skills/wallet.skill.md`** — ERC-8128 서명 기능 추가 (sign_http_request)
- **`skills/policies.skill.md`** — ERC8128_ALLOWED_DOMAINS 정책 타입 추가
- **`skills/admin.skill.md`** — ERC-8128 설정 키 5개 + Admin UI 섹션 추가

#### 6.2 SKILL-02: 사용 예시 추가

에이전트가 ERC-8128을 실제로 사용하는 시나리오를 skill 파일에 포함:

```
## ERC-8128 사용 예시

1. 외부 AI 에이전트 API에 인증된 요청 보내기:
   - erc8128_sign_request로 서명 헤더 생성
   - 원본 요청에 헤더 추가하여 전송

2. ERC-8004 등록된 에이전트 간 인증 통신:
   - 상대 에이전트의 등록 파일에서 endpoint 확인
   - ERC-8128 서명으로 인증하여 API 호출
   - 상대방은 ERC-8004 Identity Registry로 호출자 신원 확인
```

---

### 7. SIG-07: NotificationEventType 확장

> **요구사항:** NOTIF-01

#### 7.1 NOTIF-01: 신규 이벤트 타입

| 이벤트 | 설명 | 카테고리 | 기본 우선순위 |
|--------|------|---------|-------------|
| `ERC8128_SIGNATURE_CREATED` | ERC-8128 서명 생성 완료 | info | low |
| `ERC8128_DOMAIN_BLOCKED` | 정책에 의해 서명 요청 차단 | security | high |

**설계 결정 — 최소 이벤트만 추가:**
ERC-8128은 금전 리스크가 없는 인증 서명이므로 알림 이벤트를 최소화한다. 서명 생성은 `low` 우선순위, 도메인 차단만 `high` 우선순위.

---

## 핵심 설계 결정 요약

| # | 결정 | 선택 | 근거 |
|---|------|------|------|
| D1 | 패키지 위치 | `@waiaas/core` | 온체인 호출 없음, SDK에서도 검증 유틸리티 필요 |
| D2 | 서명 방식 | EIP-191 (personal_sign) | EOA 지원, ERC-8128 기본 알고리즘 |
| D3 | 프록시 모드 | 미제공 (서명만 반환) | 보안 공격면 최소화, x402 패턴 일관성 |
| D4 | Covered Components | 3단계 프리셋 (minimal/standard/strict) | 에이전트 편의성 + 보안 유연성 |
| D5 | Nonce 전략 | 기본 활성 + 선택적 비활성화 | 최대 보안 기본값, 수평 확장 환경 대응 |
| D6 | 정책 타입 | ERC8128_ALLOWED_DOMAINS (X402 패턴 재사용) | 기존 도메인 정책 인프라 재사용 |
| D7 | default-deny | 미설정 시 전체 차단 | WAIaaS 보안 원칙 일관성 |
| D8 | SCA (ERC-1271) | 미지원 (EOA만) | ERC-8128 스펙 미확정, 후속 마일스톤으로 분리 |
| D9 | 검증 유틸리티 | 디버깅·테스트 전용 제공 | WAIaaS 자체 API 인증 변경 없음 |
| D10 | DB 스키마 변경 | 없음 | ERC-8128은 무상태 서명, 로컬 저장 불필요 |
| D11 | 리서치 필수 | ERC-8128 Draft 상태 검증 | 스펙 미확정, keyid/nonce 형식 변경 가능 |
| D12 | 파이프라인 경로 | SIGN 타입 재사용 | 새 타입 불필요, metadata로 ERC-8128 여부 구분 |

---

## 산출물 → 구현 마일스톤 매핑

| 설계 섹션 | 산출물 | 구현 대상 |
|----------|--------|----------|
| SIG-01 | HTTP 메시지 서명 엔진 | packages/core/src/erc8128/ |
| SIG-02 | REST API / MCP / SDK 엔드포인트 | daemon routes, MCP server, SDK |
| SIG-03 | ERC8128_ALLOWED_DOMAINS 정책 | policy engine |
| SIG-04 | 서명 검증 유틸리티 | packages/core/src/erc8128/verifier.ts |
| SIG-05 | Admin UI 설정 | packages/admin/ |
| SIG-06 | Skill 파일 업데이트 | skills/ |
| SIG-07 | NotificationEventType 확장 | @waiaas/core enums |

---

## 테스트 전략

### 테스트 시나리오 매트릭스

| # | 시나리오 | 모듈 | 레벨 | 자동화 |
|---|---------|------|------|--------|
| S1 | Signature-Input 빌더가 RFC 9421 형식을 준수하는지 | 서명 엔진 | L0 | O |
| S2 | Content-Digest가 SHA-256 해시와 일치하는지 | 서명 엔진 | L0 | O |
| S3 | Signature Base 구성이 RFC 9421 §2.5를 준수하는지 | 서명 엔진 | L0 | O |
| S4 | EIP-191 서명 + ecrecover 왕복 검증 | 서명 엔진 | L0 | O |
| S5 | keyid 생성/파싱 (`erc8128:<chainId>:<address>`) | 서명 엔진 | L0 | O |
| S6 | Covered Components 프리셋별 올바른 컴포넌트 선택 | 서명 엔진 | L0 | O |
| S7 | Nonce 자동 생성 + nonce:false 시 미포함 | 서명 엔진 | L0 | O |
| S8 | TTL 만료 후 검증 실패 | 서명 엔진 | L0 | O |
| S9 | POST /v1/erc8128/sign 정상 응답 | API | L1 | O |
| S10 | POST /v1/erc8128/sign 비-EVM 지갑 거부 | API | L1 | O |
| S11 | POST /v1/erc8128/verify 서명 검증 성공/실패 | API | L1 | O |
| S12 | ERC8128_ALLOWED_DOMAINS 미설정 시 차단 (default-deny) | 정책 | L0 | O |
| S13 | ERC8128_ALLOWED_DOMAINS 허용 도메인 통과 | 정책 | L0 | O |
| S14 | 와일드카드 도메인 매칭 (*.example.com) | 정책 | L0 | O |
| S15 | default_deny: false 시 모든 도메인 허용 | 정책 | L0 | O |
| S16 | MCP erc8128_sign_request 도구 호출 | MCP | L1 | O |
| S17 | SDK signHttpRequest() 호출 + 헤더 반환 | SDK | L1 | O |
| S18 | SDK fetchWithErc8128() 편의 헬퍼 E2E | SDK | L1 | O |
| S19 | Admin UI ERC-8128 설정 렌더링 | UI | L1 | O |
| S20 | erc8128.enabled=false 시 API 엔드포인트 비활성 | 설정 | L1 | O |

### 테스트 레벨 분류

| 레벨 | 설명 | 대상 | 예상 수 |
|------|------|------|---------|
| L0 | 단위 테스트 (mocked deps) | 서명 엔진, 정책 평가, keyid 파싱 | ~30 |
| L1 | 통합 테스트 (in-process) | API 라우트, MCP, SDK, Admin UI | ~15 |
| L2 | E2E (실제 외부 API) | ERC-8128 지원 서버 대상 (수동) | ~3 |

**커버리지 목표:** L0+L1 ≥ 45 테스트, 신규 코드 statement coverage ≥ 80%

---

## 영향받는 설계 문서

| 문서 | 영향 |
|------|------|
| doc 33 (보안 모델) | ERC8128_ALLOWED_DOMAINS 정책 타입 추가 |
| doc 35 (정책 엔진) | PolicyType 배열 확장 |
| doc 37 (API 설계) | /v1/erc8128/ 신규 라우트 |
| doc 67 (Admin UI) | System 페이지 ERC-8128 섹션 추가 |
| skills/*.skill.md | wallet/policies/admin 스킬 업데이트 |
| @waiaas/core enums | NotificationEventType 2개 추가 |

---

## 성공 기준

1. 에이전트가 `POST /v1/erc8128/sign`으로 외부 API 요청에 대한 ERC-8128 서명 헤더를 받을 수 있음
2. 반환된 `Signature-Input` + `Signature` + `Content-Digest` 헤더가 RFC 9421 형식을 준수함
3. `ecrecover`로 서명에서 복원한 주소가 지갑 주소와 일치함
4. ERC8128_ALLOWED_DOMAINS 정책이 미허용 도메인에 대한 서명 요청을 차단함
5. SDK `fetchWithErc8128()` 헬퍼로 서명 + 외부 API 호출이 한 번에 동작함
6. MCP `erc8128_sign_request` 도구가 AI 에이전트에서 호출 가능함
7. Admin UI에서 ERC-8128 설정을 활성화/비활성화할 수 있음
8. 20개 테스트 시나리오 (S1~S20) 중 L0+L1 ≥ 45 테스트 PASS

---

## 참고 자료

- [ERC-8128: Signed HTTP Requests with Ethereum (EIP)](https://eip.tools/eip/8128)
- [ERC-8128 Discussion — Ethereum Magicians](https://ethereum-magicians.org/t/erc-8128-signed-http-requests-with-ethereum/27515)
- [RFC 9421: HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421)
- [RFC 9530: Digest Fields](https://www.rfc-editor.org/rfc/rfc9530)
- [A Review of ERC-8128 — Four Pillars](https://4pillars.io/en/comments/a-review-of-erc-8128)
- [ERC-8128 Reference — erc8128.slice.so](http://erc8128.slice.so)
