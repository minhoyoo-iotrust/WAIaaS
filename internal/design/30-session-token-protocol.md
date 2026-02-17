# 세션 토큰 프로토콜 (SESS-PROTO)

**문서 ID:** SESS-PROTO
**작성일:** 2026-02-05
**v0.7 보완:** 2026-02-08
**v0.8 보완:** 2026-02-09
**상태:** v0.8 보완
**참조:** CORE-02 (25-sqlite-schema.md), CORE-06 (29-api-framework-design.md), CORE-01 (24-monorepo-data-directory.md), SESS-RENEW (53-session-renewal-protocol.md, Phase 20 추가), OWNR-CONN (34-owner-wallet-connection.md)
**요구사항:** SESS-01 (세션 토큰 발급), SESS-02 (세션 제약), SESS-03 (사용량 추적), SESS-04 (즉시 폐기), SESS-05 (활성 세션 목록)

---

## 1. 문서 개요

### 1.1 목적

WAIaaS 3계층 보안의 1계층(세션 기반 인증)의 핵심 프로토콜을 정의한다. AI 에이전트가 Owner의 지갑 서명으로 인가받은 세션 토큰을 사용하여 API에 접근하는 전체 흐름을 설계한다.

### 1.2 요구사항 매핑

| 요구사항 | 설명 | 충족 섹션 |
|---------|------|-----------|
| SESS-01 | Owner 서명(SIWS/SIWE)으로 세션 생성 | 섹션 3 (SIWS/SIWE 검증 플로우) |
| SESS-02 | 세션 토큰에 만료/한도/허용 작업 | 섹션 2 (JWT 만료) + 섹션 5 (제약 모델) |
| SESS-03 | 세션별 사용량 추적 | 섹션 6 (사용 통계 모델) |
| SESS-04 | Owner 즉시 폐기 | 섹션 7 (수명주기 - 폐기 단계) |
| SESS-05 | 활성 세션 목록 조회 | 섹션 7 (수명주기 - GET /v1/sessions) |

### 1.3 v0.1 -> v0.2 변경 요약

| 항목 | v0.1 (클라우드) | v0.2 (Self-Hosted) | 근거 |
|------|----------------|-------------------|------|
| 토큰 타입 | API Key (`wai_live_xxx`) 영구 토큰 | JWT 세션 토큰 (`wai_sess_xxx`) 단기 만료 | 토큰 탈취 시 피해 기간 제한 (영구 -> 최대 7일) |
| 인증 방식 | OAuth 2.1 + RBAC/ABAC | SIWS/SIWE Owner 서명 + 세션 제약 | 지갑 소유권 증명 기반 인가. OAuth 인프라 불필요 |
| 토큰 검증 | Stateless JWT (클라우드 스케일) | 하이브리드 JWT + DB lookup | Self-Hosted 단일 서버에서 즉시 폐기 필요 |
| 권한 모델 | 역할/속성 기반 정책 엔진 | 세션 제약 모델 (constraints JSON) | 단순하고 직관적인 세션별 한도 관리 |

---

## 2. JWT 토큰 구조

### 2.1 jose v6.x SignJWT API 기반 설계

WAIaaS 세션 토큰은 `jose` v6.x의 `SignJWT` API로 생성하고, `jwtVerify`로 검증한다. HS256 대칭키 알고리즘을 사용한다.

**HS256 선택 근거:**
- Self-Hosted 단일 서버 환경에서 키 분산이 불필요 -- 대칭키가 더 단순하고 빠름
- 비대칭키(EdDSA/ES256)는 멀티 서비스/마이크로서비스 환경에서 공개키 배포가 필요할 때 유리하나, WAIaaS는 단일 프로세스
- jose 라이브러리가 HS256/EdDSA/ES256 모두 동일한 API로 지원하므로, 향후 전환 용이

### 2.2 JWT Header

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

### 2.3 JWT Claims

| Claim | 유형 | 타입 | 용도 | 예시 |
|-------|------|------|------|------|
| `iss` | Registered | `string` | 발급자 식별 (항상 `'waiaas'`) | `"waiaas"` |
| `exp` | Registered | `number` | 만료 시각 (Unix epoch, 초) | `1770373585` |
| `iat` | Registered | `number` | 발급 시각 (Unix epoch, 초) | `1770287185` |
| `jti` | Registered | `string` | JWT ID = 세션 ID (폐기 추적용) | `"019502a8-..."` (UUID v7) |
| `sid` | Custom | `string` | 세션 ID (UUID v7) | `"019502a8-..."` |
| `aid` | Custom | `string` | 에이전트 ID (UUID v7) | `"01950288-..."` |

**Claims 설계 원칙:**
- **제약 조건(constraints)은 JWT에 포함하지 않음** -- DB에서 조회. 이유: (1) 제약 조건은 Owner가 동적으로 변경할 수 있어야 하고, (2) JWT에 포함하면 토큰 재발급 필요, (3) JWT 크기 절약 (~250-300 bytes 유지)
- `jti`와 `sid`는 동일한 값 (세션 ID). `jti`는 JWT 표준의 토큰 고유 식별자로, `sid`는 WAIaaS 내부 세션 참조용. 중복이지만 표준 호환성과 명시성을 모두 확보

### 2.4 JWT Payload 예시

```json
{
  "iss": "waiaas",
  "iat": 1770287185,
  "exp": 1770373585,
  "jti": "019502a8-7b3c-7d4e-8f5a-1234567890ab",
  "sid": "019502a8-7b3c-7d4e-8f5a-1234567890ab",
  "aid": "01950288-1a2b-3c4d-5e6f-abcdef012345"
}
```

### 2.5 토큰 포맷

WAIaaS 세션 토큰은 `wai_sess_` 접두사 + JWT로 구성된다:

```
wai_sess_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ3YWlhYXMiLCJpYXQiOjE3NzAyODcxODUsImV4cCI6MTc3MDM3MzU4NSwianRpIjoiMDE5NTAyYTgtN2IzYy03ZDRlLThmNWEtMTIzNDU2Nzg5MGFiIiwic2lkIjoiMDE5NTAyYTgtN2IzYy03ZDRlLThmNWEtMTIzNDU2Nzg5MGFiIiwiYWlkIjoiMDE5NTAyODgtMWEyYi0zYzRkLTVlNmYtYWJjZGVmMDEyMzQ1In0.xxxxx
```

**접두사 `wai_sess_`의 역할:**
- 토큰 유형 즉시 식별 (Bearer 토큰 중 WAIaaS 세션 토큰 판별)
- GitHub secret scanning 등 자동 도구에서 WAIaaS 토큰 패턴 감지 가능
- `sessionAuth` 미들웨어에서 빠른 필터링 (접두사 불일치 시 즉시 거부, JWT 파싱 불필요)

### 2.6 토큰 크기 추정

| 구성 요소 | 크기 (bytes) |
|----------|-------------|
| `wai_sess_` 접두사 | 9 |
| JWT Header (base64url) | ~36 |
| JWT Payload (base64url) | ~180 |
| JWT Signature (HS256, base64url) | ~43 |
| 구분자 (`.`) | 2 |
| **합계** | **~270 bytes** |

Authorization 헤더 전체: `Bearer wai_sess_eyJ...` = ~280 bytes. HTTP 헤더 제한(~8KB)에 한참 미달.

### 2.7 JWT Secret 관리

#### 2.7.1 Secret 생성

`waiaas init` 실행 시 암호학적으로 안전한 JWT Secret을 자동 생성한다:

```typescript
import { randomBytes } from 'node:crypto'

// 32바이트 = 256비트 엔트로피 (HS256에 충분)
const jwtSecret = randomBytes(32).toString('hex')
// 결과: 64자 hex 문자열 (예: "a1b2c3d4e5f6...")
```

#### 2.7.2 Secret 저장

config.toml `[security]` 섹션에 저장한다 (CORE-01 참조):

```toml
[security]
jwt_secret = "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
# 파일 권한: 600 (소유자만 읽기/쓰기)
```

#### 2.7.3 환경변수 오버라이드

```
WAIAAS_SECURITY_JWT_SECRET=your_custom_secret_here
```

환경변수가 설정되면 config.toml의 `jwt_secret` 값보다 우선한다. CI/CD나 Docker 환경에서 유용하다.

#### 2.7.4 키스토어 마스터 패스워드와의 분리

| 구분 | JWT Secret | 키스토어 마스터 패스워드 |
|------|-----------|----------------------|
| 용도 | 세션 토큰 서명/검증 | 개인키 암호화/복호화 |
| 저장 위치 | config.toml `[security]` | 사용자 입력 (메모리에만 존재) |
| 데몬 시작 시 | config.toml에서 자동 로드 | 사용자에게 프롬프트로 입력 요청 |
| 분리 근거 | 키스토어 잠금 해제 없이도 세션 검증이 가능해야 함 | 개인키는 최고 수준 보호 필요 |

**분리가 중요한 이유:** 데몬이 시작되면 HTTP 서버가 즉시 요청을 받을 수 있어야 한다. 키스토어 잠금 해제는 마스터 패스워드 입력이 필요한 대화형 프로세스인데, 이것이 완료되기 전에도 세션 토큰 검증(API 요청 인증)은 가능해야 한다. 따라서 JWT Secret은 config.toml에서 자동 로드하고, 키스토어 잠금 해제는 별도 단계로 진행한다.

#### 2.7.5 JWT Secret Dual-Key Rotation [v0.7 보완]

> **v0.7 변경:** JWT Secret 변경 시 "모든 세션 즉시 무효화" 문제(DAEMON-01)를 해소하기 위해 dual-key 전환 윈도우를 도입한다. 기존의 단일 키 즉시 교체 방식에서, current/previous 이중 키 구조로 전환하여 기존 세션이 5분간 유효하게 유지된다.

##### JwtSecretManager 인터페이스

```typescript
// packages/daemon/src/services/jwt-secret-manager.ts

/** JWT Secret dual-key 관리자 [v0.7 보완] */
interface JwtSecretState {
  /** 현재 활성 JWT Secret (서명 + 검증에 사용) */
  current: Uint8Array
  /** 이전 JWT Secret (검증에만 사용, 전환 윈도우 내) */
  previous?: Uint8Array
  /** 로테이션 시각 (epoch ms). previous가 존재할 때만 유효 */
  rotatedAt?: number
}

/** 전환 윈도우: 5분 (고정값, config 불가) */
const TRANSITION_WINDOW_MS = 5 * 60 * 1000  // 300,000ms

class JwtSecretManager {
  private state: JwtSecretState

  constructor(db: DatabaseManager) {
    // system_state 테이블에서 로드
    this.state = this.loadFromSystemState(db)
  }

  /** 서명용: 항상 current 사용 */
  getSigningKey(): Uint8Array {
    return this.state.current
  }

  /** 검증용: current 우선, 실패 시 previous 시도 */
  async verifyToken(jwt: string): Promise<JWTPayload> {
    // 1차: current key로 검증
    try {
      const result = await jwtVerify(jwt, this.state.current, {
        issuer: 'waiaas',
        algorithms: ['HS256'],
      })
      return result.payload
    } catch (currentError) {
      // 2차: previous key가 존재하고 전환 윈도우 내인 경우
      if (this.state.previous && this.state.rotatedAt) {
        const elapsed = Date.now() - this.state.rotatedAt
        if (elapsed <= TRANSITION_WINDOW_MS) {
          try {
            const result = await jwtVerify(jwt, this.state.previous, {
              issuer: 'waiaas',
              algorithms: ['HS256'],
            })
            return result.payload
          } catch {
            // previous로도 실패 -- 원래 에러 전파
          }
        }
      }
      throw currentError
    }
  }
}
```

##### system_state 테이블 키-값 저장

JWT Secret은 더 이상 config.toml에서만 관리되지 않는다. 런타임에는 `system_state` 테이블(키-값 저장소)에서 관리한다:

| system_state 키 | 타입 | 설명 |
|----------------|------|------|
| `jwt_secret_current` | `string` (hex) | 현재 활성 JWT Secret. 64자 hex (32바이트) |
| `jwt_secret_previous` | `string\|null` (hex) | 이전 JWT Secret. 로테이션 후 5분간 유효. null이면 단일 키 모드 |
| `jwt_secret_rotated_at` | `string\|null` (epoch ms) | 마지막 로테이션 시각. previous가 null이면 null |

> **config.toml과의 관계:** config.toml의 `[security].jwt_secret`은 `waiaas init` 시 초기값으로만 사용된다. init 시 랜덤 생성하여 config.toml에 기록하고, 동시에 system_state `jwt_secret_current`에 저장한다. 이후 `waiaas secret rotate` 실행 시 config.toml은 갱신하지 않으며, system_state만 갱신된다.

##### rotateJwtSecret() 함수 스펙

```typescript
// packages/daemon/src/services/jwt-secret-manager.ts

/**
 * JWT Secret 로테이션을 수행한다. [v0.7 보완]
 *
 * BEGIN IMMEDIATE 트랜잭션으로 원자적 실행:
 * 1. 현재 current -> previous로 이동
 * 2. 새 32바이트 랜덤 Secret 생성 -> current에 저장
 * 3. rotatedAt에 현재 시각 기록
 * 4. audit_log에 SECRET_ROTATED 이벤트 기록
 *
 * @returns previousExpiry - previous key 만료 시각 (ISO 8601)
 * @throws 이전 로테이션 후 5분 미경과 시 거부 (연속 로테이션 방지)
 */
async function rotateJwtSecret(
  db: DatabaseManager,
  secretManager: JwtSecretManager,
): Promise<{ previousExpiry: string }> {
  const now = Date.now()

  // 연속 로테이션 방지: 이전 로테이션 후 5분 미경과 시 거부
  const lastRotatedAt = db.getSystemState('jwt_secret_rotated_at')
  if (lastRotatedAt && (now - Number(lastRotatedAt)) < TRANSITION_WINDOW_MS) {
    throw new DaemonError('ROTATION_TOO_RECENT',
      'Previous rotation still in transition window. Wait until previous secret expires.')
  }

  const newSecret = randomBytes(32)
  const newSecretHex = newSecret.toString('hex')
  const previousExpiry = new Date(now + TRANSITION_WINDOW_MS).toISOString()

  // BEGIN IMMEDIATE 트랜잭션으로 원자적 실행
  const rotateTx = db.raw.transaction(() => {
    const currentHex = db.getSystemState('jwt_secret_current')

    // current -> previous
    db.setSystemState('jwt_secret_previous', currentHex)
    // 새 secret -> current
    db.setSystemState('jwt_secret_current', newSecretHex)
    // 로테이션 시각 기록
    db.setSystemState('jwt_secret_rotated_at', String(now))

    // audit_log
    db.insertAuditLog({
      eventType: 'SECRET_ROTATED',
      actor: 'system',
      severity: 'warning',
      details: {
        previousExpiry,
        note: 'JWT Secret rotated. Previous secret valid for 5 minutes.',
      },
    })
  })

  rotateTx.immediate()

  // 인메모리 상태 갱신
  secretManager.reload(db)

  return { previousExpiry }
}
```

##### 데몬 시작 초기화 로직

데몬 시작 시(`waiaas start`) system_state를 확인하여 만료된 previous를 정리한다:

```typescript
// packages/daemon/src/lifecycle/daemon.ts -- startDaemon() 내부

/** 데몬 시작 시 JWT Secret 초기화 [v0.7 보완] */
function initializeJwtSecret(db: DatabaseManager): JwtSecretManager {
  const rotatedAt = db.getSystemState('jwt_secret_rotated_at')

  if (rotatedAt) {
    const elapsed = Date.now() - Number(rotatedAt)
    if (elapsed > TRANSITION_WINDOW_MS) {
      // 전환 윈도우 경과: previous 즉시 삭제
      const clearTx = db.raw.transaction(() => {
        db.setSystemState('jwt_secret_previous', null)
        db.setSystemState('jwt_secret_rotated_at', null)
        db.insertAuditLog({
          eventType: 'PREVIOUS_SECRET_EXPIRED',
          actor: 'system',
          severity: 'info',
          details: { rotatedAt, expiredAfterMs: elapsed },
        })
      })
      clearTx.immediate()
    }
  }

  // system_state에 jwt_secret_current가 없으면 config.toml에서 마이그레이션
  if (!db.getSystemState('jwt_secret_current')) {
    const configSecret = config.security.jwt_secret
    if (!configSecret) {
      throw new DaemonError('JWT_SECRET_MISSING',
        "JWT secret not found. Run 'waiaas init' first.")
    }
    db.setSystemState('jwt_secret_current', configSecret)
  }

  return new JwtSecretManager(db)
}
```

##### 5분 전환 윈도우 설계 근거

| 항목 | 값 | 근거 |
|------|-----|------|
| 전환 윈도우 | 5분 (고정값) | JWT 기본 만료(24h) 대비 충분히 짧아 보안 영향 최소. 에이전트가 갱신(renew)하기에 충분한 시간 |
| config 가능 여부 | 불가 (하드코딩) | 운영 복잡성 방지. 5분은 어떤 시나리오에서든 합리적인 균형점 |
| 자동 로테이션 | 미지원 | 운영자가 명시적으로 실행만 가능 (`waiaas secret rotate` 또는 `POST /v1/admin/rotate-secret`). 자동 로테이션은 예기치 않은 세션 중단 위험 |
| 연속 로테이션 | 5분 이내 거부 | 이전 previous가 아직 유효한 상태에서 새 로테이션을 하면 이전-이전 키로 서명된 토큰이 즉시 무효화됨. 이를 방지 |

**Secret 변경이 필요한 경우:**
- Secret이 유출되었거나 유출이 의심될 때
- 보안 사고 대응으로 모든 세션을 일괄 무효화할 때 (이 경우에도 5분 전환 윈도우 적용)
- 정기적인 키 로테이션 정책 적용 시

> **즉시 무효화가 필요한 경우:** Kill Switch를 사용한다. Kill Switch 6단계 캐스케이드(36-killswitch-autostop-evm.md)가 모든 세션의 revokedAt을 일괄 설정하므로, JWT Secret 유효 여부와 관계없이 Stage 2(DB lookup)에서 즉시 거부된다.

### 2.8 토큰 만료 범위

| 항목 | 값 | 설명 |
|------|-----|------|
| 최소 만료 | 300초 (5분) | 너무 짧은 세션 방지 |
| 최대 만료 | 604,800초 (7일) | 장기 세션으로 인한 보안 위험 제한 |
| 기본 만료 | 86,400초 (24시간) | 미지정 시 적용 |

```typescript
// Zod 스키마에서 만료 범위 검증
expiresIn: z.number()
  .int()
  .min(300, '최소 5분 이상이어야 합니다')
  .max(604800, '최대 7일을 초과할 수 없습니다')
  .optional()
  .default(86400)
```

### 2.9 JWT 발급 코드 패턴

```typescript
// packages/daemon/src/services/session-service.ts
import { SignJWT } from 'jose'

const JWT_SECRET = new TextEncoder().encode(config.security.jwt_secret)

async function issueSessionToken(
  sessionId: string,
  agentId: string,
  expiresInSeconds: number,
): Promise<string> {
  const jwt = await new SignJWT({
    sid: sessionId,
    aid: agentId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .setJti(sessionId)
    .setIssuer('waiaas')
    .sign(JWT_SECRET)

  return `wai_sess_${jwt}`
}
```

---

## 3. SIWS/SIWE Owner 서명 검증 플로우

### 3.1 개요

세션 생성(POST /v1/sessions) 시 Owner가 자신의 지갑으로 메시지에 서명하여 세션 발급을 인가한다. Solana 체인은 SIWS (Sign-In With Solana), Ethereum 체인은 SIWE (Sign-In With Ethereum)을 사용한다. 두 프로토콜 모두 EIP-4361 메시지 포맷을 기반으로 한다.

### 3.2 SIWS (Solana) 검증 플로우

#### 3.2.1 플로우 단계

1. 클라이언트가 `GET /v1/auth/nonce` 요청
2. 서버가 nonce 생성 + 인메모리 LRU 캐시에 저장 (TTL 5분)
3. 클라이언트가 SIWS 메시지 구성 (domain, address, nonce, statement, issuedAt, expirationTime)
4. Owner가 Phantom/Solflare 등으로 메시지 서명 (Ed25519)
5. 클라이언트가 `POST /v1/sessions`에 message + signature + publicKey 전달
6. 서버가 nonce 검증 + 삭제, SIWS 메시지 파싱, `tweetnacl.sign.detached.verify`로 Ed25519 서명 검증
7. 에이전트 소유권 확인 (agents.ownerAddress == publicKey)
8. 세션 생성 + JWT 발급

#### 3.2.2 SIWS 메시지 포맷 (EIP-4361 호환)

```
localhost:3100 wants you to sign in with your Solana account:
7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

Sign in to WAIaaS to create an agent session.

URI: http://localhost:3100
Version: 1
Chain ID: 1
Nonce: a1b2c3d4e5f67890a1b2c3d4e5f67890
Issued At: 2026-02-05T10:26:25.000Z
Expiration Time: 2026-02-05T10:31:25.000Z
```

#### 3.2.3 SIWS 서버 사이드 검증 코드 패턴

```typescript
// packages/daemon/src/services/owner-verifier.ts
import { SIWS, Payload as SIWSPayload } from '@web3auth/sign-in-with-solana'
import nacl from 'tweetnacl'
import bs58 from 'bs58'

interface SIWSVerifyInput {
  message: string       // SIWS 포맷 메시지 원문
  signature: string     // Base58 인코딩된 Ed25519 서명
  publicKey: string     // Base58 인코딩된 Solana 공개키
}

async function verifySIWS(input: SIWSVerifyInput): Promise<{
  valid: boolean
  address?: string
  nonce?: string
}> {
  try {
    // 1. 메시지 -> 바이트 변환
    const messageBytes = new TextEncoder().encode(input.message)

    // 2. 서명/공개키 Base58 -> 바이트 변환
    const signatureBytes = bs58.decode(input.signature)
    const publicKeyBytes = bs58.decode(input.publicKey)

    // 3. Ed25519 서명 검증 (tweetnacl)
    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes,
    )

    if (!isValid) {
      return { valid: false }
    }

    // 4. SIWS 메시지 파싱 (도메인, nonce 등 추출)
    const siws = new SIWS(input.message)
    const payload = siws.payload

    // 5. 도메인 바인딩 검증
    if (payload.domain !== 'localhost:3100') {
      return { valid: false }
    }

    // 6. 메시지 내 주소와 요청의 publicKey 일치 확인
    if (payload.address !== input.publicKey) {
      return { valid: false }
    }

    return {
      valid: true,
      address: payload.address,
      nonce: payload.nonce,
    }
  } catch {
    return { valid: false }
  }
}
```

#### 3.2.4 SIWS 시퀀스 다이어그램

```mermaid
sequenceDiagram
    participant Client as 클라이언트 (SDK/MCP)
    participant Wallet as Owner 지갑 (Phantom)
    participant Server as WAIaaS 데몬
    participant NonceCache as Nonce LRU 캐시
    participant DB as SQLite (sessions)

    Client->>Server: GET /v1/auth/nonce
    Server->>NonceCache: nonce 생성 + 저장 (TTL 5분)
    Server-->>Client: { nonce, expiresAt }

    Client->>Client: SIWS 메시지 구성 (domain, address, nonce, ...)
    Client->>Wallet: 메시지 서명 요청
    Wallet-->>Client: Ed25519 서명 (base58)

    Client->>Server: POST /v1/sessions { message, signature, publicKey, agentId, constraints }

    Note over Server: 1. nonce 검증
    Server->>NonceCache: nonce 조회 + 삭제
    NonceCache-->>Server: 유효/만료/미존재

    alt nonce 무효
        Server-->>Client: 401 { code: "INVALID_NONCE" }
    end

    Note over Server: 2. Ed25519 서명 검증
    Server->>Server: nacl.sign.detached.verify(message, signature, publicKey)

    alt 서명 무효
        Server-->>Client: 401 { code: "OWNER_SIGNATURE_INVALID" }
    end

    Note over Server: 3. 에이전트 소유권 확인
    Server->>DB: SELECT * FROM agents WHERE id = agentId AND owner_address = publicKey
    DB-->>Server: agent 레코드

    alt 에이전트 미존재 또는 소유권 불일치
        Server-->>Client: 404 { code: "AGENT_NOT_FOUND" }
    end

    alt 에이전트 비활성
        Server-->>Client: 409 { code: "AGENT_SUSPENDED" }
    end

    Note over Server: 4. 세션 생성 + JWT 발급
    Server->>Server: SignJWT({ sid, aid }).sign(JWT_SECRET)
    Server->>Server: SHA-256(wai_sess_{jwt}) -> tokenHash
    Server->>DB: INSERT INTO sessions (id, agent_id, token_hash, expires_at, constraints, usage_stats)
    Server->>DB: INSERT INTO audit_log (event_type: 'SESSION_ISSUED')

    Server-->>Client: 201 { sessionId, token: "wai_sess_...", expiresAt, constraints }
    Note over Client: 토큰은 이 응답에서만 노출. 이후 조회 불가.
```

### 3.3 SIWE (Ethereum) 검증 플로우

#### 3.3.1 플로우 단계

1. 클라이언트가 `GET /v1/auth/nonce` 요청 (SIWS와 동일한 엔드포인트)
2. 서버가 nonce 생성 + 저장 (동일한 LRU 캐시)
3. 클라이언트가 SIWE 메시지 구성 (EIP-4361 포맷)
4. Owner가 MetaMask 등으로 `personal_sign` (EIP-191)
5. 클라이언트가 `POST /v1/sessions`에 message + signature + ownerAddress 전달
6. 서버가 nonce 검증 + 삭제, viem/siwe 기반 3단계 검증: parseSiweMessage(파싱) -> validateSiweMessage(필드검증) -> verifyMessage(서명검증) [v0.7 보완]
7. recovered address == 요청의 ownerAddress 확인
8. 에이전트 소유권 확인 + 세션 생성

#### 3.3.2 SIWE 메시지 포맷 (EIP-4361)

```
localhost:3100 wants you to sign in with your Ethereum account:
0x1234567890abcdef1234567890abcdef12345678

Sign in to WAIaaS to create an agent session.

URI: http://localhost:3100
Version: 1
Chain ID: 1
Nonce: a1b2c3d4e5f67890a1b2c3d4e5f67890
Issued At: 2026-02-05T10:26:25.000Z
Expiration Time: 2026-02-05T10:31:25.000Z
```

#### 3.3.3 SIWE 서버 사이드 검증 코드 패턴 [v0.7 보완: viem/siwe 전환]

```typescript
// packages/daemon/src/services/owner-verifier.ts [v0.7 보완]
// Source: viem v2.x 공식 소스 코드 (github.com/wevm/viem)
import { verifyMessage, type Hex } from 'viem'
import { parseSiweMessage, validateSiweMessage } from 'viem/siwe'

interface SIWEVerifyInput {
  message: string       // SIWE 포맷 메시지 원문
  signature: string     // Hex 인코딩된 EIP-191 서명
  ownerAddress: string  // Ethereum 주소 (0x...)
}

/**
 * SIWE 서명 검증 [v0.7 보완: siwe+ethers -> viem/siwe 전환]
 *
 * 기존: import { SiweMessage } from 'siwe' (ethers v6 peer dep 필수)
 * 전환: viem/siwe 내장 함수 사용 (ethers 의존성 완전 제거)
 */
async function verifySIWE(input: SIWEVerifyInput): Promise<{
  valid: boolean
  address?: string
  nonce?: string
}> {
  try {
    // 1. SIWE 메시지 파싱 (viem/siwe -- 순수 함수, 외부 의존성 없음)
    const parsed = parseSiweMessage(input.message)
    if (!parsed.address) return { valid: false }

    // 2. 메시지 필드 검증 (domain 바인딩, 만료 시간 등)
    const isValid = validateSiweMessage({
      message: parsed,
      domain: 'localhost:3100',
    })
    if (!isValid) return { valid: false }

    // 3. EIP-191 서명 검증 (viem verifyMessage -- ecRecover, RPC 불필요)
    const verified = await verifyMessage({
      address: parsed.address,
      message: input.message,
      signature: input.signature as Hex,
    })
    if (!verified) return { valid: false }

    // 4. recovered address == ownerAddress 확인
    if (parsed.address.toLowerCase() !== input.ownerAddress.toLowerCase()) {
      return { valid: false }
    }

    return {
      valid: true,
      address: parsed.address,
      nonce: parsed.nonce,
    }
  } catch {
    return { valid: false }
  }
}
```

**[v0.7 보완] viem/siwe 의존성:**
- viem v2.x에 내장된 `viem/siwe` 모듈 사용. 별도 `siwe`/`ethers` 패키지 불필요.
- `parseSiweMessage`: 순수 regex 파싱 (EIP-4361), RPC 불필요
- `validateSiweMessage`: domain, nonce, expiration 등 필드 유효성 검사
- `verifyMessage`: ecRecover 기반 EIP-191 서명 검증, RPC 불필요 (EOA 전용)
- 스마트 계정(EIP-1271) 지원이 필요하면 `verifySiweMessage`(PublicClient 필요)로 전환

#### 3.3.4 SIWE 시퀀스 다이어그램

```mermaid
sequenceDiagram
    participant Client as 클라이언트 (SDK/MCP)
    participant Wallet as Owner 지갑 (MetaMask)
    participant Server as WAIaaS 데몬
    participant NonceCache as Nonce LRU 캐시
    participant DB as SQLite (sessions)

    Client->>Server: GET /v1/auth/nonce
    Server->>NonceCache: nonce 생성 + 저장 (TTL 5분)
    Server-->>Client: { nonce, expiresAt }

    Client->>Client: SIWE 메시지 구성 (EIP-4361 포맷)
    Client->>Wallet: personal_sign 요청 (EIP-191)
    Wallet-->>Client: 서명 (hex)

    Client->>Server: POST /v1/sessions { message, signature, ownerAddress, agentId, chain: "ethereum", constraints }

    Note over Server: 1. nonce 검증
    Server->>NonceCache: nonce 조회 + 삭제
    NonceCache-->>Server: 유효/만료/미존재

    alt nonce 무효
        Server-->>Client: 401 { code: "INVALID_NONCE" }
    end

    Note over Server: 2. SIWE 서명 검증 [v0.7 보완: viem/siwe 전환]
    Server->>Server: parseSiweMessage + validateSiweMessage + verifyMessage (viem/siwe)
    Server->>Server: recovered address == ownerAddress 확인

    alt 서명 무효 또는 주소 불일치
        Server-->>Client: 401 { code: "OWNER_SIGNATURE_INVALID" }
    end

    Note over Server: 3. 에이전트 소유권 확인
    Server->>DB: SELECT * FROM agents WHERE id = agentId AND owner_address = ownerAddress
    DB-->>Server: agent 레코드

    alt 에이전트 미존재
        Server-->>Client: 404 { code: "AGENT_NOT_FOUND" }
    end

    Note over Server: 4. 세션 생성 + JWT 발급
    Server->>Server: SignJWT({ sid, aid }).sign(JWT_SECRET)
    Server->>Server: SHA-256(wai_sess_{jwt}) -> tokenHash
    Server->>DB: INSERT INTO sessions
    Server->>DB: INSERT INTO audit_log (SESSION_ISSUED)

    Server-->>Client: 201 { sessionId, token: "wai_sess_...", expiresAt, constraints }
```

### 3.4 Owner 인증과 세션 인증의 경계

| 영역 | 인증 방식 | 적용 엔드포인트 | 구현 위치 |
|------|----------|---------------|-----------|
| 세션 생성 | Owner 서명 (SIWS/SIWE) | `POST /v1/sessions` | 요청 본문의 서명 검증 (owner-verifier 유틸리티) |
| API 접근 | 세션 토큰 (JWT) | `/v1/wallet/*`, `/v1/transactions/*` | `sessionAuth` 미들웨어 (Phase 7 본 문서) |
| Owner 전용 | Owner 서명 (SIWS/SIWE) | `/v1/owner/*` | `ownerAuth` 라우트 미들웨어 (Phase 8에서 상세) |

**owner-verifier 유틸리티 재사용:**
- Phase 7: `POST /v1/sessions` 핸들러에서 `verifySIWS()`/`verifySIWE()` 직접 호출
- Phase 8: `ownerAuth` 라우트 레벨 미들웨어가 동일한 `verifySIWS()`/`verifySIWE()` 재사용
- 코드 위치: `packages/daemon/src/services/owner-verifier.ts`

---

## 4. nonce 관리

### 4.1 nonce 생성

서버에서 암호학적으로 안전한 랜덤 nonce를 생성한다:

```typescript
import { randomBytes } from 'node:crypto'

function generateNonce(): string {
  return randomBytes(16).toString('hex')  // 32 hex chars
}
// 예: "a1b2c3d4e5f67890a1b2c3d4e5f67890"
```

**nonce 길이:** 16바이트 = 128비트 엔트로피. 충분한 무작위성으로 예측/충돌 방지.

### 4.2 nonce 저장소

**기본: 인메모리 LRU 캐시 (`lru-cache`), 선택적 SQLite 저장 [v0.7 보완]**

| 저장소 옵션 | 장점 | 단점 | 채택 |
|------------|------|------|------|
| 인메모리 LRU 캐시 | 빠른 접근 (< 0.1ms), DB 부하 없음 | 데몬 재시작 시 소멸 | O (기본값) |
| SQLite `nonces` 테이블 | 데몬 재시작 후 nonce 유지. 단일 인스턴스 보강 | DB 부하 (매 nonce I/O), 테이블 관리 | O (선택적) [v0.7 보완] |
| Redis / 외부 캐시 | 분산 환경 지원 | Self-Hosted에 과도한 의존성 | X |

> **[v0.7 보완] DAEMON-06 해소:** 인메모리 nonce 캐시는 단일 인스턴스에서는 안전하지만, 데몬 재시작 시 진행 중이던 nonce가 소멸되어 인증 플로우가 중단될 수 있다. SQLite 옵션을 추가하여 운영자가 선택할 수 있게 한다. 기본값은 인메모리(memory)로 유지한다.

#### INonceStore 인터페이스 [v0.7 보완]

```typescript
// packages/core/src/interfaces/INonceStore.ts [v0.7 보완]

/** nonce 저장소 추상화 인터페이스 */
interface INonceStore {
  /**
   * nonce를 소비한다 (일회성).
   * 존재하고 만료되지 않았으면 true를 반환하고 즉시 삭제(또는 마킹).
   * 미존재/만료/이미 사용된 경우 false 반환.
   */
  consume(nonce: string, expiresAt: number): boolean

  /** 만료된 nonce를 정리한다 */
  cleanup(): void
}
```

#### MemoryNonceStore (기본값) [v0.7 보완]

인메모리 LRU 캐시 기반 구현. 기존 v0.2 설계를 INonceStore 인터페이스로 래핑.

```typescript
// packages/daemon/src/infrastructure/cache/memory-nonce-store.ts [v0.7 보완]
import { LRUCache } from 'lru-cache'

class MemoryNonceStore implements INonceStore {
  private cache: LRUCache<string, number>  // nonce -> expiresAt

  constructor(max: number = 1000, ttlMs: number = 5 * 60 * 1000) {
    this.cache = new LRUCache<string, number>({
      max,
      ttl: ttlMs,
    })
  }

  /** nonce 등록 */
  register(nonce: string, expiresAt: number): void {
    this.cache.set(nonce, expiresAt)
  }

  /** nonce 소비 (일회성) */
  consume(nonce: string, expiresAt: number): boolean {
    const entry = this.cache.get(nonce)
    if (entry === undefined) return false
    this.cache.delete(nonce)
    return true
  }

  /** 만료 정리 (LRU TTL이 자동 처리하므로 no-op) */
  cleanup(): void {
    this.cache.purgeStale()
  }
}
```

#### SqliteNonceStore (선택적) [v0.7 보완]

SQLite `nonces` 테이블 기반 구현. `INSERT OR IGNORE` + `rowsAffected` 패턴으로 원자적 일회성 소비를 보장한다.

```typescript
// packages/daemon/src/infrastructure/cache/sqlite-nonce-store.ts [v0.7 보완]
import Database from 'better-sqlite3'

class SqliteNonceStore implements INonceStore {
  private insertStmt: Database.Statement
  private consumeStmt: Database.Statement
  private cleanupStmt: Database.Statement

  constructor(private sqlite: Database.Database) {
    this.insertStmt = sqlite.prepare(
      'INSERT OR IGNORE INTO nonces (nonce, created_at, expires_at) VALUES (?, ?, ?)'
    )
    this.consumeStmt = sqlite.prepare(
      'DELETE FROM nonces WHERE nonce = ? AND expires_at > ?'
    )
    this.cleanupStmt = sqlite.prepare(
      'DELETE FROM nonces WHERE expires_at <= ?'
    )
  }

  /** nonce 등록 */
  register(nonce: string, expiresAt: number): void {
    const now = Math.floor(Date.now() / 1000)
    this.insertStmt.run(nonce, now, expiresAt)
  }

  /**
   * nonce 소비 (일회성).
   * DELETE WHERE nonce = ? AND expires_at > now()
   * rowsAffected > 0 이면 유효한 nonce가 존재했고 삭제됨 = 소비 성공.
   * rowsAffected = 0 이면 미존재/만료/이미 사용 = 소비 실패.
   */
  consume(nonce: string, expiresAt: number): boolean {
    const now = Math.floor(Date.now() / 1000)
    const result = this.consumeStmt.run(nonce, now)
    return result.changes > 0
  }

  /** 만료된 nonce 정리 (BackgroundWorker에서 주기적 호출) */
  cleanup(): void {
    const now = Math.floor(Date.now() / 1000)
    this.cleanupStmt.run(now)
  }
}
```

**SqliteNonceStore INSERT OR IGNORE 패턴 설명:**
- `INSERT OR IGNORE`: nonce PK 충돌 시 에러 없이 무시. nonce 중복 등록 방지.
- `DELETE WHERE nonce = ? AND expires_at > ?`: 존재하고 만료되지 않은 nonce를 삭제. `changes > 0`이면 소비 성공.
- 이 패턴은 별도의 SELECT + DELETE 없이 **단일 쿼리로 원자적 일회성 소비**를 구현한다.

#### createNonceStore 팩토리 [v0.7 보완]

```typescript
// packages/daemon/src/infrastructure/cache/nonce-store-factory.ts [v0.7 보완]

function createNonceStore(
  config: { nonce_storage: 'memory' | 'sqlite' },
  sqlite?: Database.Database,
): INonceStore {
  if (config.nonce_storage === 'sqlite') {
    if (!sqlite) throw new DaemonError('SQLITE_REQUIRED', 'SQLite nonce storage requires DB connection')
    return new SqliteNonceStore(sqlite)
  }
  return new MemoryNonceStore(
    config.nonce_cache_max ?? 1000,
    (config.nonce_cache_ttl ?? 300) * 1000,
  )
}
```

**기존 코드와의 호환:**

기존 `createNonce()` 및 `verifyAndConsumeNonce()` 함수는 INonceStore를 사용하도록 리팩터링된다:

```typescript
// packages/daemon/src/infrastructure/cache/nonce-cache.ts
// [v0.7 보완] INonceStore 기반으로 리팩터링

let nonceStore: INonceStore  // DI로 주입

/** nonce 생성 + 저장 */
function createNonce(): { nonce: string; expiresAt: string } {
  const nonce = generateNonce()
  const createdAt = Date.now()
  const expiresAtMs = createdAt + 5 * 60 * 1000
  const expiresAtSec = Math.floor(expiresAtMs / 1000)

  nonceStore.register(nonce, expiresAtSec)

  return { nonce, expiresAt: new Date(expiresAtMs).toISOString() }
}

/** nonce 검증 + 삭제 (일회성) */
function verifyAndConsumeNonce(nonce: string): boolean {
  const now = Math.floor(Date.now() / 1000)
  return nonceStore.consume(nonce, now)
}
```

### 4.3 nonce TTL

| 항목 | 값 | 근거 |
|------|-----|------|
| TTL | 5분 (300초) | SIWS/SIWE 메시지 서명에 충분한 시간. 너무 길면 replay 공격 창 증가 |
| 자동 만료 | `lru-cache` TTL 기능 | 수동 정리 불필요. LRU 캐시가 TTL 초과 항목 자동 제거 |

### 4.4 GET /v1/auth/nonce 엔드포인트

```typescript
// 요청: 없음 (인증 불필요)
// 응답:
{
  "nonce": "a1b2c3d4e5f67890a1b2c3d4e5f67890",
  "expiresAt": "2026-02-05T10:31:25.000Z"
}
```

| 항목 | 값 |
|------|-----|
| Method | `GET` |
| Path | `/v1/auth/nonce` |
| 인증 | 불필요 (공개 엔드포인트) |
| Rate Limit | 전역 100 req/min (CORE-06) |
| 응답 상태 | 200 OK |

### 4.5 nonce 에러 코드

| 에러 코드 | HTTP 상태 | 설명 | retryable |
|----------|----------|------|-----------|
| `INVALID_NONCE` | 401 | nonce가 존재하지 않거나 만료됨 | false |
| `NONCE_ALREADY_USED` | 401 | nonce가 이미 사용되어 삭제됨 (replay 시도) | false |

**참고:** 실제 구현에서는 `INVALID_NONCE`와 `NONCE_ALREADY_USED`를 구분하지 않고 동일하게 `INVALID_NONCE`를 반환한다. 공격자에게 nonce 상태 정보를 노출하지 않기 위함이다. 내부적으로는 로그에 구분하여 기록한다.

---

## 5. 세션 제약 모델 (constraints JSON)

### 5.1 SessionConstraintsSchema (Zod 정의)

세션 생성 시 Owner가 지정하는 제약 조건. CORE-02 sessions 테이블의 `constraints TEXT` 컬럼에 JSON 문자열로 저장된다.

```typescript
// packages/core/src/schemas/session.schema.ts
import { z } from '@hono/zod-openapi'

export const SessionConstraintsSchema = z.object({
  /** 단건 최대 전송 금액 (최소 단위: lamports/wei, TEXT) */
  maxAmountPerTx: z.string().optional().openapi({
    description: '단건 최대 전송 금액 (최소 단위, 문자열)',
    example: '1000000000',
  }),

  /** 세션 전체 기간 누적 최대 전송 금액 */
  maxTotalAmount: z.string().optional().openapi({
    description: '세션 전체 기간 누적 최대 전송 금액',
    example: '10000000000',
  }),

  /** 세션 전체 기간 최대 거래 횟수 */
  maxTransactions: z.number().int().positive().optional().openapi({
    description: '세션 전체 기간 최대 거래 횟수',
    example: 100,
  }),

  /** 허용된 작업 유형 목록 (미설정 시 모두 허용) */
  allowedOperations: z.array(
    z.enum(['TRANSFER', 'TOKEN_TRANSFER', 'PROGRAM_CALL', 'BALANCE_CHECK'])
  ).optional().openapi({
    description: '허용된 작업 유형 목록 (미설정 시 모두 허용)',
    example: ['TRANSFER', 'BALANCE_CHECK'],
  }),

  /** 전송 허용 주소 화이트리스트 (미설정 시 모두 허용) */
  allowedDestinations: z.array(z.string()).optional().openapi({
    description: '전송 허용 주소 화이트리스트 (미설정 시 모두 허용)',
  }),

  /** 세션 만료 시간 (초, 최소 5분, 최대 7일, 기본 24시간) */
  expiresIn: z.number()
    .int()
    .positive()
    .min(300, '최소 5분 이상이어야 합니다')
    .max(604800, '최대 7일을 초과할 수 없습니다')
    .optional()
    .default(86400)
    .openapi({
      description: '세션 만료 시간 (초, 최대 7일)',
      example: 86400,
    }),

  // ── Phase 20 추가: 세션 갱신 프로토콜 필드 ──

  /** (v0.5 변경) 최대 갱신 횟수. 0이면 갱신 불가. 기본 30. */
  maxRenewals: z.number()
    .int()
    .min(0, '0이면 갱신 불가')
    .max(100, '최대 100회를 초과할 수 없습니다')
    .optional()
    .default(30)
    .openapi({
      description: '최대 갱신 횟수. 0이면 갱신 불가.',
      example: 30,
    }),

  /** (v0.5 변경) 갱신 거부 윈도우 (초). 알림에 포함되는 안내 기간. 기본 1시간. */
  renewalRejectWindow: z.number()
    .int()
    .min(300, '최소 5분 이상이어야 합니다')
    .max(86400, '최대 24시간을 초과할 수 없습니다')
    .optional()
    .default(3600)
    .openapi({
      description: '갱신 후 Owner가 확인할 수 있는 권장 시간 윈도우 (초)',
      example: 3600,
    }),
}).openapi('SessionConstraints')

export type SessionConstraints = z.infer<typeof SessionConstraintsSchema>
```

### 5.2 제약 필드 상세

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `maxAmountPerTx` | `string?` | 제한 없음 | 단건 최대 전송 금액 (lamports/wei, TEXT로 BigInt 안전 저장) |
| `maxTotalAmount` | `string?` | 제한 없음 | 세션 전체 기간 누적 최대 전송 금액 |
| `maxTransactions` | `number?` | 제한 없음 | 세션 전체 기간 최대 거래 횟수 |
| `allowedOperations` | `string[]?` | 모두 허용 | 허용된 작업 유형 목록 |
| `allowedDestinations` | `string[]?` | 모두 허용 | 전송 허용 주소 화이트리스트 |
| `expiresIn` | `number` | 86400 (24h) | 세션 만료 시간 (초) |
| `maxRenewals` | `number?` | 30 | (v0.5 변경) 최대 갱신 횟수. 0이면 갱신 불가. 상세: 53-session-renewal-protocol.md |
| `renewalRejectWindow` | `number?` | 3600 (1h) | (v0.5 변경) 갱신 거부 윈도우 (초). 알림 안내용. 상세: 53-session-renewal-protocol.md |

**금액 필드가 `string`인 이유:**
- Solana: lamports (u64, 최대 ~18.4 x 10^18) -- JavaScript `Number.MAX_SAFE_INTEGER` (9 x 10^15) 초과 가능
- Ethereum: wei (uint256, 최대 ~1.15 x 10^77) -- 64비트 정수로 표현 불가
- TEXT로 저장하고 검증 시 `BigInt()` 비교를 사용하여 정밀도 손실 방지

### 5.3 제약 검증 로직

```typescript
// packages/daemon/src/domain/session-constraints.ts
import type { SessionConstraints } from '@waiaas/core/schemas'

interface TransferRequest {
  type: string       // 'TRANSFER' | 'TOKEN_TRANSFER' | ...
  amount: string     // lamports/wei
  to: string         // 수신자 주소
}

interface SessionUsageStats {
  totalTx: number
  totalAmount: string
  lastTxAt?: string
}

interface ConstraintValidationResult {
  allowed: boolean
  reason?: string
  code?: string
}

export function validateSessionConstraints(
  request: TransferRequest,
  constraints: SessionConstraints,
  usageStats: SessionUsageStats,
): ConstraintValidationResult {

  // 1. 단건 한도 확인 (BigInt 비교)
  if (constraints.maxAmountPerTx) {
    if (BigInt(request.amount) > BigInt(constraints.maxAmountPerTx)) {
      return {
        allowed: false,
        reason: `단건 한도 초과: ${request.amount} > ${constraints.maxAmountPerTx}`,
        code: 'SESSION_LIMIT_PER_TX',
      }
    }
  }

  // 2. 누적 한도 확인 (BigInt 비교)
  if (constraints.maxTotalAmount) {
    const newTotal = BigInt(usageStats.totalAmount) + BigInt(request.amount)
    if (newTotal > BigInt(constraints.maxTotalAmount)) {
      return {
        allowed: false,
        reason: `누적 한도 초과: ${newTotal} > ${constraints.maxTotalAmount}`,
        code: 'SESSION_LIMIT_TOTAL',
      }
    }
  }

  // 3. 거래 횟수 한도 확인
  if (constraints.maxTransactions) {
    if (usageStats.totalTx >= constraints.maxTransactions) {
      return {
        allowed: false,
        reason: `거래 횟수 한도 초과: ${usageStats.totalTx} >= ${constraints.maxTransactions}`,
        code: 'SESSION_LIMIT_TX_COUNT',
      }
    }
  }

  // 4. 허용 작업 확인
  if (constraints.allowedOperations) {
    if (!constraints.allowedOperations.includes(request.type as any)) {
      return {
        allowed: false,
        reason: `허용되지 않은 작업: ${request.type}`,
        code: 'SESSION_OPERATION_DENIED',
      }
    }
  }

  // 5. 허용 주소 확인
  if (constraints.allowedDestinations) {
    if (!constraints.allowedDestinations.includes(request.to)) {
      return {
        allowed: false,
        reason: `허용되지 않은 주소: ${request.to}`,
        code: 'SESSION_DESTINATION_DENIED',
      }
    }
  }

  return { allowed: true }
}
```

**설계 원칙:**
- 모든 제약은 **optional** -- 미설정 필드는 "제한 없음"
- 금액 비교는 **BigInt** -- 정밀도 손실 방지
- 검증 결과에 **code** 포함 -- 에러 응답의 `details.code`로 활용

### 5.4 constraints JSON과 CORE-02 sessions 테이블 매핑

CORE-02에서 정의한 `sessions.constraints TEXT` 컬럼에 `SessionConstraintsSchema`를 JSON 문자열로 저장한다:

```typescript
// 저장 시
await db.insert(sessions).values({
  // ...
  constraints: JSON.stringify(validatedConstraints),
})

// 조회 시
const session = await db.select().from(sessions).where(eq(sessions.id, id)).get()
const constraints = SessionConstraintsSchema.parse(
  JSON.parse(session.constraints ?? '{}')
)
```

**constraints JSON 예시 (DB에 저장되는 값):**

```json
{
  "maxAmountPerTx": "1000000000",
  "maxTotalAmount": "10000000000",
  "maxTransactions": 100,
  "allowedOperations": ["TRANSFER", "BALANCE_CHECK"],
  "allowedDestinations": ["So1ana...abc", "So1ana...def"],
  "expiresIn": 86400
}
```

---

## 6. 세션 사용 통계 (usageStats JSON)

### 6.1 SessionUsageStatsSchema (Zod 정의)

세션의 누적 사용 통계. CORE-02 sessions 테이블의 `usage_stats TEXT` 컬럼에 JSON 문자열로 저장된다.

```typescript
// packages/core/src/schemas/session.schema.ts

export const SessionUsageStatsSchema = z.object({
  /** 누적 거래 횟수 */
  totalTx: z.number().int().openapi({
    description: '누적 거래 횟수',
    example: 5,
  }),

  /** 누적 전송 금액 (최소 단위, TEXT = bigint safe) */
  totalAmount: z.string().openapi({
    description: '누적 전송 금액 (최소 단위)',
    example: '2500000000',
  }),

  /** 마지막 거래 시각 (ISO 8601) */
  lastTxAt: z.string().datetime().optional().openapi({
    description: '마지막 거래 시각 (ISO 8601)',
    example: '2026-02-05T10:30:00.000Z',
  }),
}).openapi('SessionUsageStats')

export type SessionUsageStats = z.infer<typeof SessionUsageStatsSchema>
```

### 6.2 usageStats 필드 상세

| 필드 | 타입 | 초기값 | 설명 |
|------|------|--------|------|
| `totalTx` | `number` (int) | `0` | 이 세션으로 실행된 누적 거래 횟수 |
| `totalAmount` | `string` | `"0"` | 이 세션으로 전송된 누적 금액 (lamports/wei) |
| `lastTxAt` | `string?` (ISO 8601) | `undefined` | 마지막 거래 시각 |

**초기값 (세션 생성 시):**

```json
{
  "totalTx": 0,
  "totalAmount": "0"
}
```

### 6.3 usageStats 원자적 갱신 패턴

동일 세션으로 동시에 여러 거래 요청이 들어오면 누적 한도(totalAmount)가 정확하게 갱신되어야 한다. Read-Modify-Write 패턴에서 race condition을 방지하기 위해 `better-sqlite3`의 동기식 `transaction()`을 사용한다.

```typescript
// packages/daemon/src/services/session-service.ts
import Database from 'better-sqlite3'

/**
 * usageStats를 원자적으로 갱신한다.
 *
 * better-sqlite3의 transaction()은 동기식이므로 Node.js의 비동기 이벤트 루프에서
 * 자연스럽게 직렬화된다. BEGIN IMMEDIATE 트랜잭션으로 쓰기 잠금을 선점하여
 * 다른 트랜잭션이 동시에 usageStats를 수정하는 것을 방지한다.
 */
function updateUsageStats(
  sqlite: Database.Database,
  sessionId: string,
  txAmount: string,
): { success: boolean; error?: string } {
  const updateTx = sqlite.transaction(() => {
    // 1. 현재 usageStats 읽기 (쓰기 잠금 내)
    const row = sqlite
      .prepare('SELECT usage_stats, constraints FROM sessions WHERE id = ?')
      .get(sessionId) as { usage_stats: string; constraints: string } | undefined

    if (!row) {
      return { success: false, error: 'SESSION_NOT_FOUND' }
    }

    const usageStats: SessionUsageStats = JSON.parse(row.usage_stats || '{"totalTx":0,"totalAmount":"0"}')
    const constraints: SessionConstraints = JSON.parse(row.constraints || '{}')

    // 2. 제약 검증 (누적 한도 확인)
    if (constraints.maxTotalAmount) {
      const newTotal = BigInt(usageStats.totalAmount) + BigInt(txAmount)
      if (newTotal > BigInt(constraints.maxTotalAmount)) {
        return { success: false, error: 'SESSION_LIMIT_TOTAL' }
      }
    }
    if (constraints.maxTransactions) {
      if (usageStats.totalTx >= constraints.maxTransactions) {
        return { success: false, error: 'SESSION_LIMIT_TX_COUNT' }
      }
    }

    // 3. usageStats 갱신
    const updatedStats: SessionUsageStats = {
      totalTx: usageStats.totalTx + 1,
      totalAmount: (BigInt(usageStats.totalAmount) + BigInt(txAmount)).toString(),
      lastTxAt: new Date().toISOString(),
    }

    // 4. DB 업데이트
    sqlite
      .prepare('UPDATE sessions SET usage_stats = ? WHERE id = ?')
      .run(JSON.stringify(updatedStats), sessionId)

    return { success: true }
  })

  // BEGIN IMMEDIATE: 트랜잭션 시작 시 즉시 쓰기 잠금 획득
  // better-sqlite3의 transaction()은 기본적으로 DEFERRED이므로
  // .immediate() 체이닝으로 IMMEDIATE 모드 사용
  return updateTx.immediate()
}
```

**동시성 보장 메커니즘:**

```
요청 A (amount: 500) ─┐
                       ├──> SQLite 쓰기 큐 (WAL 모드, 단일 Writer)
요청 B (amount: 300) ─┘
                         │
                         v
             ┌─────────────────────┐
             │ BEGIN IMMEDIATE     │
             │ 1. READ usageStats  │  <- 요청 A가 먼저 잠금 획득
             │ 2. VALIDATE         │
             │ 3. UPDATE           │
             │ COMMIT              │
             └─────────────────────┘
                         │
                         v
             ┌─────────────────────┐
             │ BEGIN IMMEDIATE     │
             │ 1. READ usageStats  │  <- 요청 B는 A 완료 후 실행
             │ 2. VALIDATE         │     (요청 A의 갱신된 값 읽음)
             │ 3. UPDATE           │
             │ COMMIT              │
             └─────────────────────┘
```

### 6.4 usageStats JSON과 CORE-02 sessions 테이블 매핑

CORE-02에서 정의한 `sessions.usage_stats TEXT` 컬럼에 `SessionUsageStatsSchema`를 JSON 문자열로 저장한다:

```json
{
  "totalTx": 5,
  "totalAmount": "2500000000",
  "lastTxAt": "2026-02-05T10:30:00.000Z"
}
```

---

## 7. 세션 수명주기 (발급 -> 검증 -> 갱신 -> 폐기 -> 만료)

### 7.1 5단계 수명주기 개요 (v0.5 변경: 4단계 -> 5단계, 갱신 추가)

| 단계 | 트리거 | 주체 | 결과 |
|------|--------|------|------|
| 발급 (Issue) | `POST /v1/sessions` | Owner (SIWS/SIWE 서명) | 세션 생성 + JWT 발급 |
| 검증 (Validate) | 매 API 요청 | `sessionAuth` 미들웨어 | JWT 서명 + DB lookup |
| 갱신 (Renew) | `PUT /v1/sessions/:id/renew` | 에이전트 (sessionAuth) | 새 JWT 발급 + token_hash 교체 (v0.5 Phase 20 추가) |
| 폐기 (Revoke) | `DELETE /v1/sessions/:id` | Owner 또는 시스템 | `revokedAt` 설정 |
| 만료 (Expire) | BackgroundWorker 1분 주기 | 시스템 자동 | 만료/폐기 세션 DELETE |

### 7.2 수명주기 시퀀스 다이어그램

```mermaid
sequenceDiagram
    participant Owner as Owner 지갑
    participant Agent as AI 에이전트
    participant Server as WAIaaS 데몬
    participant DB as SQLite
    participant Worker as BackgroundWorker

    Note over Owner,Worker: ═══ 1단계: 발급 (Issue) ═══

    Owner->>Server: POST /v1/sessions (SIWS/SIWE 서명 + constraints)
    Server->>Server: Owner 서명 검증 (verifySIWS/verifySIWE)
    Server->>Server: JWT 생성 (SignJWT + HS256)
    Server->>Server: SHA-256(wai_sess_{jwt}) -> tokenHash
    Server->>DB: INSERT INTO sessions (tokenHash, constraints, usageStats)
    Server->>DB: INSERT INTO audit_log (SESSION_ISSUED)
    Server-->>Owner: 201 { token: "wai_sess_...", expiresAt }
    Owner->>Agent: 토큰 전달 (한 번만 노출)

    Note over Owner,Worker: ═══ 2단계: 검증 (Validate) ═══

    Agent->>Server: GET /v1/wallet/balance (Authorization: Bearer wai_sess_...)
    Server->>Server: Stage 1: JWT 서명/만료 검증 (jose jwtVerify)
    alt JWT 무효 (서명 불일치, 만료)
        Server-->>Agent: 401 AUTH_TOKEN_INVALID / AUTH_TOKEN_EXPIRED
    end
    Server->>DB: Stage 2: DB lookup (token_hash, revokedAt IS NULL, expiresAt > now())
    alt 세션 폐기됨 또는 만료
        Server-->>Agent: 401 SESSION_REVOKED
    end
    Server->>Server: c.set('sessionId', 'agentId', 'constraints', 'usageStats')
    Server-->>Agent: 200 { balance: ... }

    Note over Owner,Worker: ═══ 3단계: 갱신 (Renew) ═══ (v0.5 Phase 20 추가)

    Agent->>Server: PUT /v1/sessions/:id/renew (Bearer wai_sess_...)
    Server->>Server: sessionAuth 검증 (기존 토큰)
    Server->>Server: 5종 안전 장치 검증 (maxRenewals, 절대 수명, 50% 시점)
    alt 안전 장치 위반
        Server-->>Agent: 403 RENEWAL_LIMIT_REACHED / RENEWAL_TOO_EARLY / ...
    end
    Server->>Server: 새 JWT 발급 (SignJWT + HS256) + 새 token_hash 계산
    Server->>DB: BEGIN IMMEDIATE: token_hash 교체, expires_at 갱신, renewal_count++
    Server->>DB: INSERT INTO audit_log (SESSION_RENEWED)
    Server-->>Agent: 200 { token: "wai_sess_...(새 토큰)", expiresAt, renewalCount }
    Note over Agent: 구 토큰 자동 무효화 (token_hash 교체)
    Note over Agent: 갱신 상세: 53-session-renewal-protocol.md 참조
    Note over Owner,Worker: [v0.8] Owner 유무별 갱신 분기
    Note over Server: NONE/GRACE: 갱신 즉시 확정 (거부자 없음/미검증)
    Note over Server: LOCKED: 갱신 후 [거부하기] 윈도우 활성 (기본 1시간)

    Note over Owner,Worker: ═══ 4단계: 폐기 (Revoke) ═══

    Owner->>Server: DELETE /v1/sessions/:id (masterAuth implicit)
    Server->>DB: UPDATE sessions SET revoked_at = now() WHERE id = :id
    Server->>DB: INSERT INTO audit_log (SESSION_REVOKED)
    Server-->>Owner: 200 { message: "세션이 폐기되었습니다" }

    Note over Agent: 다음 요청 시 401 SESSION_REVOKED

    Note over Owner,Worker: ═══ 5단계: 만료 정리 (Expire) ═══

    loop 매 1분
        Worker->>DB: SELECT id FROM sessions WHERE expires_at < now()
        Worker->>DB: SELECT id FROM sessions WHERE revoked_at IS NOT NULL AND revoked_at < (now - 24h)
        Worker->>DB: DELETE FROM sessions WHERE id IN (만료 + 폐기 24h 경과)
        Worker->>DB: INSERT INTO audit_log (SESSION_EXPIRED / SESSION_CLEANUP)
    end
```

### 7.3 토큰 해싱

세션 토큰의 원본은 DB에 저장하지 않는다. SHA-256 해시만 저장하여 토큰 탈취(DB 유출) 시에도 원본 복원을 방지한다.

```typescript
import { createHash } from 'node:crypto'

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

// 발급 시
const token = `wai_sess_${jwt}`
const tokenHash = hashToken(token)
// sessions.token_hash = tokenHash (원본 미저장)

// 검증 시
const incomingToken = 'wai_sess_eyJ...'
const incomingHash = hashToken(incomingToken)
// SELECT * FROM sessions WHERE token_hash = incomingHash
```

### 7.4 만료 세션 정리 워커 상세

CORE-05에서 정의한 BackgroundWorkers의 세션 정리 워커를 구체화한다.

```typescript
// packages/daemon/src/lifecycle/workers.ts

interface SessionCleanupConfig {
  intervalMs: number       // 정리 주기 (기본: 60000 = 1분)
  revokedRetentionMs: number  // 폐기 세션 보관 기간 (기본: 86400000 = 24시간)
}

function startSessionCleanupWorker(
  db: DrizzleInstance,
  config: SessionCleanupConfig,
): NodeJS.Timeout {
  return setInterval(async () => {
    const now = Math.floor(Date.now() / 1000)  // Unix epoch (초)
    const revokedCutoff = now - Math.floor(config.revokedRetentionMs / 1000)

    // 1. 만료 세션 수집
    const expiredSessions = await db.select({ id: sessions.id })
      .from(sessions)
      .where(lt(sessions.expiresAt, new Date(now * 1000)))
      .all()

    // 2. 폐기 후 24시간 경과 세션 수집
    const revokedSessions = await db.select({ id: sessions.id })
      .from(sessions)
      .where(and(
        isNotNull(sessions.revokedAt),
        lt(sessions.revokedAt, new Date(revokedCutoff * 1000)),
      ))
      .all()

    const toDelete = [...expiredSessions, ...revokedSessions]

    if (toDelete.length === 0) return

    // 3. 삭제 실행
    // transactions.session_id가 SET NULL이므로 안전하게 삭제 가능
    for (const session of toDelete) {
      await db.delete(sessions).where(eq(sessions.id, session.id))
    }

    // 4. 감사 로그 기록
    for (const session of expiredSessions) {
      await insertAuditLog(db, {
        eventType: 'SESSION_EXPIRED',
        actor: 'system',
        sessionId: session.id,
        severity: 'info',
        details: { reason: 'session_expired' },
      })
    }
    for (const session of revokedSessions) {
      await insertAuditLog(db, {
        eventType: 'SESSION_CLEANUP',
        actor: 'system',
        sessionId: session.id,
        severity: 'info',
        details: { reason: 'revoked_session_cleanup' },
      })
    }

    logger.debug(`Session cleanup: deleted ${toDelete.length} sessions`)
  }, config.intervalMs)
}
```

| 정리 대상 | 조건 | 감사 로그 | 근거 |
|----------|------|----------|------|
| 만료 세션 | `expires_at < now()` | `SESSION_EXPIRED` | JWT 만료 시각 도달 |
| 폐기 후 보관 기간 경과 | `revoked_at IS NOT NULL AND revoked_at < (now - 24h)` | `SESSION_CLEANUP` | 폐기 후 24시간 감사 추적 보관 후 삭제 |

**`DELETE` 방식 채택 근거:**
- CORE-02에서 `sessions -> transactions` FK가 `ON DELETE SET NULL`로 설정됨
- 세션 삭제 시 `transactions.session_id`가 NULL로 변경되어 거래 기록은 유지됨
- 감사 로그(`audit_log`)에는 FK가 없으므로 세션 삭제와 무관하게 영구 보존

### 7.5 세션 API 엔드포인트 요약

| Method | Path | 인증 | 설명 | 요구사항 |
|--------|------|------|------|---------|
| `GET` | `/v1/auth/nonce` | 없음 | nonce 생성 | - |
| `POST` | `/v1/sessions` | Owner 서명 (본문) | 세션 생성 | SESS-01 |
| `GET` | `/v1/sessions` | 세션 토큰 | 활성 세션 목록 | SESS-05 |
| `GET` | `/v1/sessions/:id` | 세션 토큰 | 세션 상세 조회 | SESS-05 |
| `PUT` | `/v1/sessions/:id/renew` | sessionAuth | 세션 갱신 (낙관적 갱신, v0.5 Phase 20 추가) | SESS-01 |
| `DELETE` | `/v1/sessions/:id` | 세션 토큰 | 세션 폐기 | SESS-04 |

#### POST /v1/sessions 요청/응답

**요청:**
```json
{
  "agentId": "01950288-1a2b-3c4d-5e6f-abcdef012345",
  "chain": "solana",
  "ownerAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "signature": "base58_encoded_signature",
  "message": "localhost:3100 wants you to sign in with your Solana account:\n7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU\n\n...",
  "constraints": {
    "maxAmountPerTx": "1000000000",
    "maxTotalAmount": "10000000000",
    "maxTransactions": 100,
    "allowedOperations": ["TRANSFER", "BALANCE_CHECK"],
    "expiresIn": 86400
  }
}
```

**응답 (201 Created):**
```json
{
  "sessionId": "019502a8-7b3c-7d4e-8f5a-1234567890ab",
  "token": "wai_sess_eyJhbGciOiJIUzI1NiIs...",
  "expiresAt": "2026-02-06T10:26:25.000Z",
  "constraints": {
    "maxAmountPerTx": "1000000000",
    "maxTotalAmount": "10000000000",
    "maxTransactions": 100,
    "allowedOperations": ["TRANSFER", "BALANCE_CHECK"],
    "expiresIn": 86400
  }
}
```

#### GET /v1/sessions 응답 (SESS-05)

```json
{
  "sessions": [
    {
      "id": "019502a8-7b3c-7d4e-8f5a-1234567890ab",
      "agentId": "01950288-1a2b-3c4d-5e6f-abcdef012345",
      "expiresAt": "2026-02-06T10:26:25.000Z",
      "constraints": { "maxAmountPerTx": "1000000000", "..." : "..." },
      "usageStats": { "totalTx": 5, "totalAmount": "2500000000", "lastTxAt": "..." },
      "createdAt": "2026-02-05T10:26:25.000Z"
    }
  ],
  "total": 1
}
```

**참고:** `token` 필드는 `GET` 응답에 포함되지 않음 (원본 토큰은 생성 시 한 번만 노출).

#### DELETE /v1/sessions/:id 응답 (SESS-04)

```json
{
  "message": "세션이 폐기되었습니다.",
  "sessionId": "019502a8-7b3c-7d4e-8f5a-1234567890ab",
  "revokedAt": "2026-02-05T15:30:00.000Z"
}
```

---

## 8. sessionAuth 미들웨어 상세 설계

### 8.1 CORE-06 sessionAuth stub 완성

CORE-06에서 정의한 `sessionAuth` 미들웨어의 stub을 2단계 검증 로직으로 완성한다.

### 8.2 2단계 검증 아키텍처

```
              요청
               │
               v
    ┌─────────────────────┐
    │  Stage 1: JWT 검증  │  <- DB 불필요, 빠른 거부
    │  - jose jwtVerify   │
    │  - HS256 서명 확인   │
    │  - 만료(exp) 확인    │
    │  - 발급자(iss) 확인  │
    └──────────┬──────────┘
               │ JWT 유효
               v
    ┌─────────────────────┐
    │ Stage 2: DB lookup  │  <- 폐기/만료/제약 확인
    │ - token_hash 조회    │
    │ - revokedAt IS NULL │
    │ - expiresAt > now() │
    │ - constraints 로드   │
    │ - usageStats 로드    │
    └──────────┬──────────┘
               │ 세션 유효
               v
          c.set(컨텍스트)
```

**2단계 분리의 이점:**
- Stage 1에서 잘못된/만료된 토큰을 DB 조회 없이 즉시 거부 -- DB 부하 감소
- Stage 2에서 폐기된 세션을 실시간 확인 -- JWT의 즉시 폐기 불가 문제 해결
- `idx_sessions_token_hash` 인덱스 활용으로 Stage 2 DB lookup < 1ms

### 8.3 sessionAuth 미들웨어 구현 설계

```typescript
// packages/daemon/src/server/middleware/session-auth.ts
import { createMiddleware } from 'hono/factory'
import { jwtVerify } from 'jose'
import { createHash } from 'node:crypto'
import { and, eq, isNull, gt } from 'drizzle-orm'
import { sessions } from '../../infrastructure/database/schema.js'
import type { AppBindings } from '../types.js'

const TOKEN_PREFIX = 'wai_sess_'

export function sessionAuthMiddleware(
  db: DrizzleInstance,
  jwtSecret: Uint8Array,
) {
  // 인증 제외 경로
  const publicPaths = new Set([
    '/health',
    '/doc',
    '/v1/auth/nonce',
  ])

  return createMiddleware<AppBindings>(async (c, next) => {
    // 0. 인증 제외 경로 확인
    const path = c.req.path
    if (publicPaths.has(path)) {
      return next()
    }

    // POST /v1/sessions는 sessionAuth가 아닌 요청 본문의 Owner 서명으로 인증
    if (path === '/v1/sessions' && c.req.method === 'POST') {
      return next()
    }

    // 1. Authorization 헤더에서 토큰 추출
    const authHeader = c.req.header('authorization')
    if (!authHeader || !authHeader.startsWith(`Bearer ${TOKEN_PREFIX}`)) {
      return c.json({
        error: {
          code: 'AUTH_TOKEN_MISSING',
          message: '세션 토큰이 필요합니다. Authorization: Bearer wai_sess_... 형식으로 전달하세요.',
          requestId: c.get('requestId'),
          retryable: false,
        },
      }, 401)
    }

    const rawToken = authHeader.slice(7) // 'Bearer ' 제거
    const jwt = rawToken.slice(TOKEN_PREFIX.length)  // 'wai_sess_' 접두사 제거

    // ═══ Stage 1: JWT 서명/만료 검증 (DB 불필요, 빠른 거부) ═══
    let payload: { sid: string; aid: string }
    try {
      const result = await jwtVerify(jwt, jwtSecret, {
        issuer: 'waiaas',
        algorithms: ['HS256'],
      })
      payload = result.payload as unknown as { sid: string; aid: string }
    } catch (err: unknown) {
      // jose 에러 타입에 따라 코드 분기
      const isExpired = err instanceof Error && err.message.includes('expired')
      return c.json({
        error: {
          code: isExpired ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_TOKEN_INVALID',
          message: isExpired
            ? '세션 토큰이 만료되었습니다.'
            : '유효하지 않은 세션 토큰입니다.',
          requestId: c.get('requestId'),
          retryable: false,
        },
      }, 401)
    }

    // ═══ Stage 2: DB lookup (폐기/만료/제약 확인) ═══
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')

    const session = await db.select().from(sessions)
      .where(and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ))
      .get()

    if (!session) {
      // token_hash 일치하지만 revokedAt 설정됨 -> 폐기된 세션
      const revokedSession = await db.select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.tokenHash, tokenHash))
        .get()

      return c.json({
        error: {
          code: revokedSession ? 'SESSION_REVOKED' : 'AUTH_TOKEN_INVALID',
          message: revokedSession
            ? '폐기된 세션입니다. 새 세션을 생성하세요.'
            : '유효하지 않은 세션 토큰입니다.',
          requestId: c.get('requestId'),
          retryable: false,
        },
      }, 401)
    }

    // ═══ 검증 성공: Hono 컨텍스트에 세션 정보 설정 ═══
    c.set('sessionId', session.id)
    c.set('agentId', payload.aid)
    c.set('constraints', JSON.parse(session.constraints ?? '{}'))
    c.set('usageStats', JSON.parse(session.usageStats ?? '{"totalTx":0,"totalAmount":"0"}'))

    await next()
  })
}
```

### 8.4 Hono 컨텍스트 설정 값

검증 성공 시 미들웨어가 Hono 컨텍스트에 설정하는 값. 후속 라우트 핸들러와 거래 파이프라인에서 참조한다.

| 컨텍스트 키 | 타입 | 설정 단계 | 사용처 |
|------------|------|----------|--------|
| `sessionId` | `string` | sessionAuth Stage 2 | 감사 로그, 세션 참조 |
| `agentId` | `string` | sessionAuth Stage 1 (JWT claims) | 에이전트 조회, 거래 연결 |
| `constraints` | `SessionConstraints` | sessionAuth Stage 2 (DB) | 파이프라인 Stage 2 (Session Validate) |
| `usageStats` | `SessionUsageStats` | sessionAuth Stage 2 (DB) | 파이프라인 Stage 2 (누적 한도 확인) |

**AppBindings 타입 확장 (CORE-06 보완):**

```typescript
// packages/daemon/src/server/types.ts
type AppBindings = {
  Variables: {
    db: DrizzleInstance
    keyStore: ILocalKeyStore
    adapters: AdapterRegistry
    requestId: string
    // Phase 7 추가 -- sessionAuth에서 설정
    sessionId?: string
    agentId?: string
    constraints?: SessionConstraints
    usageStats?: SessionUsageStats
  }
}
```

### 8.5 에러 코드 상세

| 에러 코드 | HTTP 상태 | 발생 단계 | 설명 | retryable |
|----------|----------|----------|------|-----------|
| `AUTH_TOKEN_MISSING` | 401 | Pre-Stage | Authorization 헤더 없음 또는 Bearer wai_sess_ 형식 아님 | false |
| `AUTH_TOKEN_INVALID` | 401 | Stage 1 | JWT 서명 불일치 (잘못된 secret 또는 변조) | false |
| `AUTH_TOKEN_EXPIRED` | 401 | Stage 1 | JWT exp claim 만료 | false |
| `SESSION_REVOKED` | 401 | Stage 2 | DB에서 revokedAt이 설정됨 (폐기된 세션) | false |

### 8.6 인증 제외 경로

다음 경로는 `sessionAuth` 미들웨어를 통과하지 않는다:

| 경로 | 이유 |
|------|------|
| `/health` | 서버 상태 확인 (모니터링, 로드 밸런서) |
| `/doc` | OpenAPI 스펙 JSON (개발 도구) |
| `/v1/auth/nonce` | nonce 요청 (인증 전 단계) |
| `POST /v1/sessions` | Owner 서명으로 인증 (세션 토큰이 아직 없음) |

### 8.7 성능 고려사항

| 측정 항목 | 예상 성능 | 근거 |
|----------|----------|------|
| Stage 1 (JWT 검증) | < 0.5ms | jose HS256은 HMAC 연산 1회 (매우 빠름) |
| Stage 2 (DB lookup) | < 1ms | `idx_sessions_token_hash` 인덱스, 단일 행 조회 |
| 전체 미들웨어 | < 2ms | Stage 1 + Stage 2 합산 |
| 무효 토큰 거부 | < 0.5ms | Stage 1에서 즉시 거부 (DB 미접근) |

---

## 9. 보안 고려사항

### 9.1 JWT Secret 수명주기 관리 [v0.7 보완]

| 단계 | 시점 | 동작 |
|------|------|------|
| 생성 | `waiaas init` | `crypto.randomBytes(32).toString('hex')` -> config.toml + system_state 저장 |
| 로드 | `waiaas start` | system_state에서 읽기 (초회 시 config.toml에서 마이그레이션). JwtSecretManager 초기화 |
| 사용 | 매 요청 | `JwtSecretManager.verifyToken(jwt)` dual-key 검증 (current 우선, 전환 윈도우 내 previous 시도) |
| 변경 | `waiaas secret rotate` / `POST /v1/admin/rotate-secret` | rotateJwtSecret(): current->previous 이동 + 새 secret 생성. 5분 전환 윈도우 |
| 보호 | 항상 | config.toml 파일 권한 600, system_state DB 파일 권한 600, 환경변수 프로세스 스코프 |

### 9.2 토큰 탈취 대응 (Defense in Depth)

토큰이 탈취된 경우를 가정한 다중 방어:

| 방어 계층 | 메커니즘 | 효과 |
|----------|---------|------|
| **짧은 만료** | JWT exp (기본 24시간, 최대 7일) | 탈취 토큰의 유효 기간 제한 |
| **즉시 폐기** | `DELETE /v1/sessions/:id` -> revokedAt | Owner가 의심 시 즉시 무효화 |
| **제약 한도** | constraints (maxAmountPerTx, maxTotalAmount, maxTransactions) | 탈취되어도 피해 금액 제한 |
| **주소 화이트리스트** | allowedDestinations | 탈취되어도 허용 주소에만 전송 가능 |
| **작업 제한** | allowedOperations | BALANCE_CHECK만 허용하면 자산 이동 불가 |
| **감사 로그** | audit_log (SESSION_ISSUED, TX_REQUESTED 등) | 비정상 활동 추적 |
| **Kill Switch** | Phase 8에서 설계 | 모든 세션 일괄 폐기 + 에이전트 정지 |

### 9.3 타이밍 공격 방지

`jose` 라이브러리는 HMAC 비교 시 constant-time comparison을 내장하고 있다. 서명 검증 시 타이밍 사이드 채널 공격에 대한 별도 대응이 불필요하다.

```
jose 내부: crypto.timingSafeEqual(computed_signature, received_signature)
```

토큰 해시 비교(token_hash)는 SQLite의 `WHERE token_hash = ?` 쿼리로 수행되며, B-tree 인덱스 조회이므로 타이밍 공격에 취약하지 않다 (조회 시간이 해시 값이 아닌 인덱스 구조에 의존).

### 9.4 Phase 8과의 연계점

| Phase 7 (본 문서) | Phase 8 (Security Layers) | 연계 방식 |
|-------------------|--------------------------|----------|
| `sessionAuth` 미들웨어 | `ownerAuth` 라우트 미들웨어 | 동일한 owner-verifier 유틸리티 재사용 |
| `constraints` 모델 | 정책 엔진 (policies 테이블) | 세션 제약은 파이프라인 Stage 2, 정책은 Stage 3 |
| `revokedAt` 폐기 | Kill Switch 일괄 폐기 | Kill Switch가 모든 세션의 revokedAt을 일괄 설정 |
| 세션 정리 워커 | 승인 대기 만료 워커 | 동일한 BackgroundWorkers 프레임워크에서 관리 |
| 감사 로그 (SESSION_*) | 감사 로그 (KILL_SWITCH_*, POLICY_*) | 동일한 audit_log 테이블, 동일한 insertAuditLog 유틸리티 |

---

---

### v0.8 보완 (2026-02-09)

> **[v0.8] 세션 토큰과 Owner 상태의 관계:** 세션 토큰 자체(JWT 구조, 발급, 검증, 폐기)는 Owner 유무와 무관하게 동일하게 동작한다. JWT claims에 Owner 관련 정보는 포함되지 않으며, 세션 제약(constraints) 모델도 Owner 상태에 의존하지 않는다. Owner 유무에 따라 달라지는 것은 **세션 갱신(Renew) 후속 동작**뿐이다:
>
> - **Owner 미등록(NONE) / 유예(GRACE):** 갱신 즉시 확정. 거부 윈도우 없음. (53-session-renewal-protocol.md 참조)
> - **Owner 잠금(LOCKED):** 갱신 후 [거부하기] 윈도우 활성 (기본 1시간). Owner가 의심스러운 갱신을 거부 가능. (34-02 설계, 53-session-renewal-protocol.md §6.6.1 참조)
>
> 이 분기는 세션 토큰 프로토콜 자체가 아닌 53-session-renewal-protocol.md에서 상세 정의한다. 본 문서의 섹션 7.1 "갱신(Renew)" 단계에서 Owner 분기 참조를 추가한다.

*문서 ID: SESS-PROTO*
*작성일: 2026-02-05, v0.7 보완: 2026-02-08, v0.8 보완: 2026-02-09*
*Phase: 07-session-transaction-protocol-design, v0.7 보완: 27-daemon-security-foundation*
*상태: v0.8 보완*
