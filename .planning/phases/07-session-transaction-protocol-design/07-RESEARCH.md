# Phase 7: Session & Transaction Protocol Design - Research

**Researched:** 2026-02-05
**Domain:** JWT 세션 인증, SIWS/SIWE 서명 검증, 트랜잭션 처리 파이프라인, @solana/kit 3.x
**Confidence:** HIGH

## Summary

Phase 7은 에이전트 세션 인증 프로토콜(JWT 토큰 구조, SIWS/SIWE 승인 플로우, 세션 제약 모델)과 거래 처리 파이프라인(6단계), Solana 어댑터 상세를 설계한다. Phase 6에서 확정된 기반(sessions/transactions 테이블, IChainAdapter 4단계 tx, sessionAuth 미들웨어 stub, OpenAPIHono + Zod SSoT 패턴)을 직접 활용한다.

핵심 기술 스택은 **jose v6.x** (JWT 서명/검증), **@web3auth/sign-in-with-solana** + **siwe v3.x** (SIWS/SIWE 서명 검증), **@solana/kit** (구 @solana/web3.js 2.x, pipe 기반 함수형 트랜잭션 빌드)이다. Self-Hosted 단일 서버 환경에서 JWT의 stateless 이점은 제한적이므로, 짧은 만료(1-24시간) + DB 기반 폐기 확인의 **하이브리드 패턴**을 사용한다. sessions 테이블의 token_hash로 모든 요청 시 DB lookup을 수행하되, JWT claims 검증(서명/만료)을 먼저 수행하여 DB 부하를 줄인다.

**Primary recommendation:** jose HS256 대칭키로 JWT 서명 + sessions 테이블 token_hash 기반 폐기 확인의 2단계 검증. 세션 생성 시 Owner의 SIWS/SIWE 서명으로 인가. 거래 파이프라인은 Receive → Validate → Policy → Classify → Execute(build/simulate/sign/submit) → Confirm 6단계.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `jose` | 6.1.x | JWT 서명/검증 (SignJWT, jwtVerify) | 의존성 제로, ESM/CJS 지원, 모든 JS 런타임 호환, HS256/EdDSA/ES256 전부 지원. panva/jose는 JWT 라이브러리의 사실상 표준 |
| `@web3auth/sign-in-with-solana` | latest | SIWS 메시지 생성/파싱/검증 | EIP-4361 호환 SIWS 구현. Payload/SIWS 클래스 제공. nacl.sign.detached.verify로 Ed25519 서명 검증 |
| `siwe` | 3.0.x | SIWE 메시지 생성/파싱/검증 (EIP-4361) | Spruce Systems 공식 구현. SiweMessage 클래스, generateNonce 제공. 115K+ 주간 다운로드. ethers v5/v6 peer dependency |
| `@solana/kit` | latest | Solana 트랜잭션 빌드/서명/제출 | @solana/web3.js 2.x 리브랜딩. pipe 기반 함수형 API. Anza 공식 SDK |
| `@solana-program/system` | latest | SOL 전송 instruction 생성 | getTransferSolInstruction() 제공. @solana/kit과 함께 사용 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tweetnacl` / `@noble/ed25519` | latest | Ed25519 서명 검증 (SIWS 백엔드) | SIWS 서버 사이드 서명 검증 시. nacl.sign.detached.verify() |
| `bs58` | latest | Base58 인코딩/디코딩 | Solana 주소/서명 변환 |
| `ethers` | 6.x | SIWE 서명 검증 peer dependency | siwe 패키지가 ethers를 peer dependency로 요구 |
| `uuid` (v7) | latest | UUID v7 생성 | 세션/트랜잭션 ID 생성 (시간 순 정렬) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `jose` HS256 | `jose` EdDSA (Ed25519) | EdDSA가 더 현대적이고 양자 저항 논의 있으나, Self-Hosted 단일 서버에서 대칭키 HS256이 더 단순하고 빠름. 키 분산 필요 없음 |
| `@web3auth/sign-in-with-solana` | `@solana/wallet-standard-util` verifySignIn | wallet-standard은 프론트엔드 Wallet Adapter 통합에 최적화. 백엔드 서버사이드 검증은 @web3auth가 더 직관적 |
| `siwe` + `ethers` | 직접 EIP-191/EIP-712 검증 | siwe가 nonce 관리, 메시지 파싱, 도메인 바인딩을 표준화. 직접 구현은 EIP-4361 메시지 포맷 준수 누락 위험 |
| `tweetnacl` | `sodium-native` crypto_sign_verify | sodium-native는 이미 키스토어에서 사용 중이나, SIWS 검증은 guarded memory 불필요. tweetnacl이 더 경량 |

**Installation:**

```bash
pnpm add jose @web3auth/sign-in-with-solana siwe @solana/kit @solana-program/system bs58 tweetnacl
# ethers는 siwe의 peer dependency로 이미 설치되어야 함
pnpm add ethers
```

---

## Architecture Patterns

### Recommended Module Structure

Phase 7이 담당하는 코드 영역 (packages/daemon 내부):

```
packages/daemon/src/
├── server/
│   ├── middleware/
│   │   └── session-auth.ts     # sessionAuth 미들웨어 (jose jwtVerify + DB lookup)
│   └── routes/
│       ├── session.ts          # POST/GET/DELETE /v1/sessions
│       ├── transaction.ts      # POST /v1/transactions/send, GET /v1/transactions
│       └── wallet.ts           # GET /v1/wallet/balance, /v1/wallet/address
├── services/
│   ├── session-service.ts      # 세션 CRUD + JWT 발급/검증 + SIWS/SIWE 검증
│   ├── transaction-service.ts  # 6단계 파이프라인 오케스트레이션
│   └── agent-service.ts        # 에이전트 조회/상태 관리
└── domain/
    ├── session-constraints.ts  # 세션 제약 모델 (Zod 스키마 + 검증 로직)
    └── transaction-pipeline.ts # 파이프라인 상태 머신

packages/core/src/schemas/
├── session.ts                  # SessionCreate, SessionResponse Zod 스키마
├── transaction.ts              # TransferRequest, TransactionResponse Zod 스키마
├── wallet.ts                   # BalanceResponse, AddressResponse Zod 스키마
└── agent.ts                    # AgentCreate, AgentResponse Zod 스키마

packages/adapters/solana/src/
└── adapter.ts                  # SolanaAdapter 상세 구현 (@solana/kit pipe API)
```

### Pattern 1: JWT 하이브리드 인증 (HS256 + DB 폐기 확인)

**What:** JWT 서명 검증(stateless, 빠른 거부) + sessions 테이블 DB lookup(폐기/제약 확인)의 2단계.
**When to use:** Self-Hosted 단일 서버에서 JWT의 즉시 폐기 불가 문제를 해결할 때.
**Why:** 순수 stateless JWT는 폐기 불가. 순수 stateful은 DB 부하. 하이브리드는 잘못된 토큰을 DB까지 가지 않고 거부 가능.

```typescript
// Source: jose v6 official docs + WAIaaS custom pattern

import { SignJWT, jwtVerify } from 'jose'
import { createHash } from 'node:crypto'

// === 토큰 발급 (session-service.ts) ===
const JWT_SECRET = new TextEncoder().encode(config.security.jwt_secret)
// jwt_secret: 32바이트 이상, crypto.randomBytes(32).toString('hex')로 생성
// config.toml [security] 섹션에 저장, 환경변수 WAIAAS_SECURITY_JWT_SECRET 오버라이드

async function issueSessionToken(sessionId: string, agentId: string, constraints: SessionConstraints, expiresInSeconds: number): Promise<string> {
  const jwt = await new SignJWT({
    sid: sessionId,        // 세션 ID (UUID v7)
    aid: agentId,          // 에이전트 ID (UUID v7)
    // 제약 조건은 JWT에 포함하지 않음 -- DB에서 조회 (변경 가능성)
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .setJti(sessionId)       // JWT ID = 세션 ID (jti로 폐기 추적)
    .setIssuer('waiaas')
    .sign(JWT_SECRET)

  return `wai_sess_${jwt}`   // prefix + JWT
}

// === 토큰 검증 (session-auth middleware) ===
async function validateSessionToken(rawToken: string, db: DrizzleInstance) {
  // 1. prefix 확인 + JWT 추출
  if (!rawToken.startsWith('wai_sess_')) return null
  const jwt = rawToken.slice('wai_sess_'.length)

  // 2. JWT 서명 + 만료 검증 (빠른 거부, DB 불필요)
  let payload
  try {
    const result = await jwtVerify(jwt, JWT_SECRET, {
      issuer: 'waiaas',
      algorithms: ['HS256'],
    })
    payload = result.payload
  } catch {
    return null  // 서명 불일치, 만료 등 -> 즉시 거부
  }

  // 3. DB에서 세션 조회 (폐기 확인 + 제약 확인)
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  const session = await db.select().from(sessions)
    .where(and(
      eq(sessions.tokenHash, tokenHash),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, new Date()),
    ))
    .get()

  if (!session) return null

  return {
    id: session.id,
    agentId: payload.aid as string,
    constraints: JSON.parse(session.constraints ?? '{}'),
    usageStats: JSON.parse(session.usageStats ?? '{}'),
  }
}
```

### Pattern 2: SIWS/SIWE Owner 서명으로 세션 생성

**What:** 세션 생성 시 Owner가 SIWS(Solana)/SIWE(Ethereum) 메시지에 서명하여 인가.
**When to use:** POST /v1/sessions 엔드포인트에서 Owner 인증.
**Why:** API Key 대신 지갑 서명 기반 인증. Owner의 지갑 소유권 증명.

```typescript
// Source: @web3auth/sign-in-with-solana + siwe official docs

// === Solana (SIWS) 검증 ===
import { SIWS, Payload as SIWSPayload } from '@web3auth/sign-in-with-solana'
import nacl from 'tweetnacl'
import bs58 from 'bs58'

async function verifySIWS(message: string, signature: string, publicKey: string): Promise<boolean> {
  const messageBytes = new TextEncoder().encode(message)
  const signatureBytes = bs58.decode(signature)
  const publicKeyBytes = bs58.decode(publicKey)

  return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)
}

// === Ethereum (SIWE) 검증 ===
import { SiweMessage, generateNonce } from 'siwe'

async function verifySIWE(message: string, signature: string): Promise<{ address: string }> {
  const siweMessage = new SiweMessage(message)
  const { data: fields } = await siweMessage.verify({ signature })
  return { address: fields.address }
}

// === nonce 관리 ===
// 1. 서버에서 crypto.randomBytes(16).toString('hex')로 nonce 생성
// 2. SQLite에 nonce + 만료시각 저장 (or 인메모리 LRU)
// 3. 검증 시 nonce 일치 확인 + 사용 후 삭제 (replay 방지)
```

### Pattern 3: 트랜잭션 6단계 파이프라인

**What:** Receive → Session Validate → Policy Check → Tier Classify → Execute(build/simulate/sign/submit) → Confirm
**When to use:** POST /v1/transactions/send 요청 처리.
**Why:** v0.1의 8단계(Cloud+Enclave+Squads)를 v0.2 Self-Hosted 환경에 맞게 간소화. IChainAdapter 4단계(build/simulate/sign/submit)를 Execute 단계 내부에 포함.

```typescript
// 6단계 파이프라인 상태 전이

// Stage 1: RECEIVE -- 요청 접수 + Zod 검증
//   transactions 테이블 INSERT (status=PENDING)
//   audit_log INSERT (TX_REQUESTED)

// Stage 2: SESSION VALIDATE -- 세션 제약 확인
//   - 세션 만료 확인 (JWT exp)
//   - 단건 한도 확인 (constraints.maxAmountPerTx)
//   - 누적 한도 확인 (usageStats.totalAmount + request.amount <= constraints.maxTotalAmount)
//   - 허용 작업 확인 (constraints.allowedOperations includes request.type)
//   실패 시: status=CANCELLED, error='SESSION_LIMIT_EXCEEDED'

// Stage 3: POLICY CHECK -- 정책 엔진 평가 (Phase 8에서 상세화)
//   - policies 테이블에서 에이전트별 + 글로벌 정책 로드
//   - SPENDING_LIMIT, ALLOWED_ADDRESSES, TIME_RESTRICTION 평가
//   실패 시: status=CANCELLED, error='POLICY_VIOLATION'

// Stage 4: TIER CLASSIFY -- 보안 티어 분류 (Phase 8에서 상세화)
//   - INSTANT: 정책 범위 내 소액 -> 즉시 실행
//   - NOTIFY: 중액 -> 실행 + Owner 알림
//   - DELAY: 고액 -> 시간 지연 후 실행 (Phase 8)
//   - APPROVAL: 초고액/비정상 -> Owner 승인 필요 (Phase 8)
//   transactions 테이블 UPDATE (tier=결과)

// Stage 5: EXECUTE -- IChainAdapter 4단계 실행
//   5a. adapter.buildTransaction(request) -> UnsignedTransaction
//       transactions UPDATE (status=QUEUED)
//   5b. adapter.simulateTransaction(tx) -> SimulationResult
//       실패 시: status=FAILED, error='SIMULATION_FAILED'
//   5c. keyStore.sign(agentId) -> privateKey
//       adapter.signTransaction(tx, privateKey) -> signedTx
//       sodium_memzero(privateKey)
//       transactions UPDATE (status=EXECUTING)
//   5d. adapter.submitTransaction(signedTx) -> SubmitResult
//       transactions UPDATE (status=SUBMITTED, txHash=result.txHash)
//       audit_log INSERT (TX_SUBMITTED)

// Stage 6: CONFIRM -- 온체인 확정 대기
//   adapter.waitForConfirmation(txHash, 60000)
//   transactions UPDATE (status=CONFIRMED, executedAt=now)
//   usageStats 업데이트 (totalTx++, totalAmount+=amount)
//   audit_log INSERT (TX_CONFIRMED)
```

### Pattern 4: @solana/kit pipe 기반 트랜잭션 빌드

**What:** @solana/kit의 함수형 pipe API로 Solana 트랜잭션 빌드.
**When to use:** SolanaAdapter.buildTransaction() 내부 구현.

```typescript
// Source: QuickNode @solana/kit guide + anza-xyz/kit GitHub

import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
  getSignatureFromTransaction,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  sendAndConfirmTransactionFactory,
  lamports,
} from '@solana/kit'
import { getTransferSolInstruction } from '@solana-program/system'

// buildTransaction 내부 구현
async function buildSolTransfer(from: Address, to: Address, amount: bigint, rpc: SolanaRpc) {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayer(from, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    tx => appendTransactionMessageInstruction(
      getTransferSolInstruction({
        source: from,
        destination: to,
        amount: lamports(amount),
      }),
      tx,
    ),
  )

  return {
    chain: 'solana' as const,
    serialized: transactionMessage, // 컴파일 후 직렬화
    estimatedFee: BigInt(5000),     // base fee, priority fee 별도 조회
    expiresAt: new Date(Date.now() + 60_000), // ~60초
    metadata: {
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      version: 0,
    },
  }
}
```

### Anti-Patterns to Avoid

- **JWT에 민감 정보 포함:** JWT payload에 제약 조건(한도 금액 등)을 넣으면 변경 시 토큰 재발급 필요. 제약은 DB에만 저장하고 JWT에는 세션/에이전트 ID만 포함
- **JWT 만료만으로 폐기 처리:** Self-Hosted에서는 즉시 폐기가 필요. JWT exp만 의존하면 탈취된 토큰이 만료까지 유효. 반드시 DB lookup(revokedAt 확인) 병행
- **nonce를 클라이언트에서 생성:** SIWS/SIWE nonce는 반드시 서버에서 생성하여 replay attack 방지. 클라이언트 생성 nonce는 공격자가 재사용 가능
- **트랜잭션 파이프라인에서 동기 실행만:** Solana blockhash ~60초 만료로 빠른 실행 필요하나, 서명 작업은 sodium guarded memory 접근이므로 동시 실행 제한. 파이프라인 내부에서 단계별 타임아웃 설정 필수
- **SIWS/SIWE 검증 없이 세션 발급:** Owner 서명 검증을 건너뛰면 누구나 세션 생성 가능. SIWS/SIWE 서명 + nonce 검증은 세션 발급의 필수 전제 조건

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT 서명/검증 | 자체 HMAC-SHA256 구현 | `jose` SignJWT + jwtVerify | 알고리즘 선택 오류(none algorithm attack), claims 검증 누락(exp, iss, aud), 타이밍 공격 방어 등 jose가 처리 |
| SIWS 메시지 파싱 | 정규식으로 SIWS 메시지 파싱 | `@web3auth/sign-in-with-solana` SIWS 클래스 | EIP-4361 메시지 포맷 준수, 도메인 바인딩 검증, expirationTime/notBefore 처리 |
| SIWE 메시지 파싱 + 검증 | 직접 EIP-191 recoverAddress 구현 | `siwe` SiweMessage.verify() | EIP-1271 스마트 컨트랙트 지갑 검증, EIP-55 체크섬, nonce 관리 |
| Solana Ed25519 서명 검증 | 직접 Ed25519 구현 | `tweetnacl` nacl.sign.detached.verify | 타이밍 사이드채널 공격 방어, 잘 검증된 구현 |
| nonce 생성 | Math.random() 기반 nonce | `crypto.randomBytes(16)` 또는 `siwe.generateNonce()` | 암호학적으로 안전한 랜덤 필수. Math.random은 예측 가능 |
| Solana 트랜잭션 직렬화 | 수동 바이트 조립 | `@solana/kit` pipe + compileTransactionMessage | 버전 0 트랜잭션 메시지, address lookup table, compute budget 등 복잡한 직렬화 처리 |

**Key insight:** 세션 인증의 핵심 복잡성은 "토큰 자체"가 아니라 "토큰 수명주기 관리"(발급-검증-제약확인-폐기-만료정리)에 있다. jose는 토큰 서명/검증만 담당하고, 수명주기 관리는 sessions 테이블 + session-service에서 구현해야 한다.

---

## Common Pitfalls

### Pitfall 1: JWT Secret 관리 실수

**What goes wrong:** jwt_secret이 코드에 하드코딩되거나, 너무 짧거나, 데몬 재시작마다 재생성되면 기존 세션이 모두 무효화됨.
**Why it happens:** HS256 대칭키는 생성/관리가 쉬워 보이지만, 비밀 키 수명주기 관리가 필수.
**How to avoid:**
- `waiaas init` 시 `crypto.randomBytes(32).toString('hex')`로 생성하여 config.toml에 저장
- 환경변수 `WAIAAS_SECURITY_JWT_SECRET`으로 오버라이드 가능
- 키 변경 시 모든 기존 세션 자동 무효화 (의도된 동작으로 문서화)
**Warning signs:** 데몬 재시작 후 모든 에이전트가 401 에러를 받으면 jwt_secret 재생성 의심.

### Pitfall 2: token_hash 인덱스 없이 매 요청 풀스캔

**What goes wrong:** sessions 테이블에 idx_sessions_token_hash 인덱스 없으면 매 API 요청마다 풀스캔.
**Why it happens:** CORE-02에서 이미 인덱스를 정의했지만, 구현 시 누락 가능.
**How to avoid:** CORE-02 스키마의 idx_sessions_token_hash 인덱스가 반드시 적용되어야 함. 예상 성능: 인덱스 적용 시 < 1ms.
**Warning signs:** API 응답 시간이 세션 수에 비례하여 증가하면 인덱스 누락 의심.

### Pitfall 3: Solana blockhash 만료로 인한 트랜잭션 실패

**What goes wrong:** buildTransaction() 후 정책 검증/승인 대기 중 ~60초가 지나면 blockhash가 만료되어 signTransaction()이나 submitTransaction()이 실패.
**Why it happens:** Solana의 blockhash는 ~150 슬롯(~60초) 수명. 정책 검증이 느리거나 DELAY/APPROVAL 티어면 만료됨.
**How to avoid:**
- INSTANT 티어: 빌드부터 제출까지 한 흐름에서 실행 (timeout 30초)
- DELAY/APPROVAL 티어: 정책 승인 후 buildTransaction()을 재실행 (새 blockhash)
- UnsignedTransaction.expiresAt를 활용하여 만료 전 재빌드 판단
**Warning signs:** SOLANA_BLOCKHASH_EXPIRED 에러가 빈번하면 파이프라인 타이밍 조정 필요.

### Pitfall 4: 세션 제약의 race condition

**What goes wrong:** 동일 세션으로 동시에 여러 거래 요청이 들어오면 누적 한도(totalAmount)가 정확하게 업데이트되지 않아 한도 초과 허용.
**Why it happens:** usageStats가 JSON TEXT 컬럼이므로 Read-Modify-Write 패턴에서 동시성 문제 발생.
**How to avoid:**
- SQLite WAL 모드에서 쓰기는 단일 스레드이므로 동시 쓰기 충돌은 없음
- 그러나 Node.js의 비동기 특성상 Read와 Write 사이에 다른 요청이 끼어들 수 있음
- 해결: `BEGIN IMMEDIATE` 트랜잭션 내에서 usageStats 읽기 + 검증 + 갱신을 원자적으로 수행
- better-sqlite3의 `transaction()` 메서드 사용 (동기식이므로 자연스럽게 직렬화)
**Warning signs:** 누적 한도를 초과하는 거래가 간헐적으로 승인되면 race condition 의심.

### Pitfall 5: SIWS/SIWE nonce 재사용 허용

**What goes wrong:** 서버가 nonce를 검증하지 않거나, 사용 후 삭제하지 않으면 replay attack 가능.
**Why it happens:** nonce 관리를 "클라이언트가 유니크한 값을 보내면 된다"로 오해.
**How to avoid:**
- 서버에서 nonce 생성 -> 클라이언트에 전달 -> 서명된 메시지에 포함 -> 서버에서 검증 + 삭제
- nonce에 TTL 설정 (예: 5분). 만료된 nonce는 거부
- nonce를 SQLite에 저장하거나 LRU 캐시에 저장 (단일 서버이므로 인메모리도 가능)
**Warning signs:** 동일한 SIWS/SIWE 서명 메시지로 여러 세션이 생성되면 nonce 재사용 허용 의심.

### Pitfall 6: ethers peer dependency 충돌

**What goes wrong:** siwe v3.x는 ethers v5 또는 v6을 peer dependency로 요구. 프로젝트에 ethers 버전이 없거나 충돌하면 런타임 에러.
**Why it happens:** siwe가 ethers의 verifyMessage/getAddress를 내부적으로 사용.
**How to avoid:**
- pnpm workspace에서 ethers v6을 명시적으로 설치
- EVM 어댑터(viem)와 SIWE 검증(ethers)의 라이브러리 충돌 없음 (각각 독립)
- siwe의 `@spruceid/siwe-parser`는 ethers 없이 메시지 파싱만 가능 (검증은 불가)
**Warning signs:** `Cannot find module 'ethers'` 런타임 에러.

---

## Code Examples

### 세션 생성 전체 플로우 (POST /v1/sessions)

```typescript
// Source: WAIaaS Phase 7 design pattern (jose + SIWS/SIWE)

// 1. 클라이언트가 nonce 요청 (별도 엔드포인트 또는 세션 생성 요청 내)
// 서버: crypto.randomBytes(16).toString('hex') -> nonce
// nonce를 임시 저장 (TTL 5분)

// 2. 클라이언트가 Owner 지갑으로 SIWS/SIWE 메시지 서명
// SIWS 메시지 예:
// "localhost:3100 wants you to sign in with your Solana account:
//  <owner_public_key>
//  URI: http://localhost:3100
//  Version: 1
//  Chain ID: 1
//  Nonce: <server_generated_nonce>
//  Issued At: 2026-02-05T10:00:00.000Z
//  Expiration Time: 2026-02-05T10:05:00.000Z"

// 3. POST /v1/sessions 요청
const sessionCreateBody = {
  agentId: 'agent-uuid-v7',
  chain: 'solana',            // 또는 'ethereum'
  ownerAddress: 'base58_owner_public_key',
  signature: 'base58_encoded_signature',
  message: 'SIWS formatted message',
  constraints: {
    maxAmountPerTx: '1000000000',    // 1 SOL (lamports)
    maxTotalAmount: '10000000000',   // 10 SOL
    allowedOperations: ['TRANSFER'],
    expiresIn: 86400,                // 24시간 (초)
  },
}

// 4. 서버 처리 (session-service.ts)
async function createSession(body: SessionCreateInput, db: DrizzleInstance) {
  // 4a. nonce 검증 + 삭제
  const isValidNonce = await verifyAndConsumeNonce(body.message, db)
  if (!isValidNonce) throw new AuthError('INVALID_NONCE', 'Nonce가 유효하지 않습니다.')

  // 4b. Owner 서명 검증 (체인별 분기)
  if (body.chain === 'solana') {
    const valid = await verifySIWS(body.message, body.signature, body.ownerAddress)
    if (!valid) throw new AuthError('OWNER_SIGNATURE_INVALID', 'SIWS 서명 검증 실패')
  } else {
    const { address } = await verifySIWE(body.message, body.signature)
    if (address.toLowerCase() !== body.ownerAddress.toLowerCase())
      throw new AuthError('OWNER_SIGNATURE_INVALID', 'SIWE 서명 검증 실패')
  }

  // 4c. 에이전트 소유권 확인
  const agent = await db.select().from(agents)
    .where(and(eq(agents.id, body.agentId), eq(agents.ownerAddress, body.ownerAddress)))
    .get()
  if (!agent) throw new NotFoundError('agent', body.agentId)
  if (agent.status !== 'ACTIVE') throw new WaiaasError('AGENT_SUSPENDED', '에이전트가 활성 상태가 아닙니다.', 409)

  // 4d. 세션 생성 + JWT 발급
  const sessionId = generateUUIDv7()
  const expiresIn = body.constraints.expiresIn ?? 86400  // 기본 24시간
  const token = await issueSessionToken(sessionId, body.agentId, body.constraints, expiresIn)
  const tokenHash = createHash('sha256').update(token).digest('hex')

  await db.insert(sessions).values({
    id: sessionId,
    agentId: body.agentId,
    tokenHash,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    constraints: JSON.stringify(body.constraints),
    usageStats: JSON.stringify({ totalTx: 0, totalAmount: '0' }),
    createdAt: new Date(),
  })

  // 4e. 감사 로그
  await insertAuditLog(db, {
    eventType: 'SESSION_ISSUED',
    actor: `owner:${body.ownerAddress}`,
    agentId: body.agentId,
    sessionId,
    severity: 'info',
  })

  // 4f. 토큰 반환 (원본은 이 응답에서만 노출)
  return {
    sessionId,
    token,       // wai_sess_{jwt} -- 한 번만 반환, 이후 조회 불가
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    constraints: body.constraints,
  }
}
```

### 세션 제약 모델 (constraints JSON 구조)

```typescript
// Source: WAIaaS Phase 7 design (Claude's discretion)

import { z } from '@hono/zod-openapi'

// === 세션 제약 Zod 스키마 ===
export const SessionConstraintsSchema = z.object({
  // 단건 한도 (최소 단위: lamports/wei, TEXT로 전달)
  maxAmountPerTx: z.string().optional().openapi({
    description: '단건 최대 전송 금액 (최소 단위, 문자열)',
    example: '1000000000',
  }),

  // 누적 한도 (세션 수명 동안)
  maxTotalAmount: z.string().optional().openapi({
    description: '세션 전체 기간 누적 최대 전송 금액',
    example: '10000000000',
  }),

  // 최대 거래 횟수
  maxTransactions: z.number().int().positive().optional().openapi({
    description: '세션 전체 기간 최대 거래 횟수',
    example: 100,
  }),

  // 허용 작업 목록
  allowedOperations: z.array(
    z.enum(['TRANSFER', 'TOKEN_TRANSFER', 'PROGRAM_CALL', 'BALANCE_CHECK'])
  ).optional().openapi({
    description: '허용된 작업 유형 목록 (미설정 시 모두 허용)',
    example: ['TRANSFER', 'BALANCE_CHECK'],
  }),

  // 허용 수신 주소 목록
  allowedDestinations: z.array(z.string()).optional().openapi({
    description: '전송 허용 주소 화이트리스트 (미설정 시 모두 허용)',
  }),

  // 세션 만료 시간 (초)
  expiresIn: z.number().int().positive().max(604800).optional().default(86400).openapi({
    description: '세션 만료 시간 (초, 최대 7일)',
    example: 86400,
  }),
}).openapi('SessionConstraints')

// === 사용 통계 (usage_stats JSON) ===
export const SessionUsageStatsSchema = z.object({
  totalTx: z.number().int().openapi({
    description: '누적 거래 횟수',
    example: 5,
  }),
  totalAmount: z.string().openapi({
    description: '누적 전송 금액 (최소 단위)',
    example: '2500000000',
  }),
  lastTxAt: z.string().datetime().optional().openapi({
    description: '마지막 거래 시각 (ISO 8601)',
  }),
}).openapi('SessionUsageStats')

// === 세션 제약 검증 함수 ===
function validateSessionConstraints(
  request: TransferRequest,
  constraints: SessionConstraints,
  usageStats: SessionUsageStats,
): { allowed: boolean; reason?: string } {
  // 단건 한도
  if (constraints.maxAmountPerTx) {
    if (BigInt(request.amount) > BigInt(constraints.maxAmountPerTx)) {
      return { allowed: false, reason: `단건 한도 초과: ${request.amount} > ${constraints.maxAmountPerTx}` }
    }
  }

  // 누적 한도
  if (constraints.maxTotalAmount) {
    const newTotal = BigInt(usageStats.totalAmount) + BigInt(request.amount)
    if (newTotal > BigInt(constraints.maxTotalAmount)) {
      return { allowed: false, reason: `누적 한도 초과: ${newTotal} > ${constraints.maxTotalAmount}` }
    }
  }

  // 거래 횟수 한도
  if (constraints.maxTransactions) {
    if (usageStats.totalTx >= constraints.maxTransactions) {
      return { allowed: false, reason: `거래 횟수 한도 초과: ${usageStats.totalTx} >= ${constraints.maxTransactions}` }
    }
  }

  // 허용 작업
  if (constraints.allowedOperations && !constraints.allowedOperations.includes(request.type)) {
    return { allowed: false, reason: `허용되지 않은 작업: ${request.type}` }
  }

  // 허용 주소
  if (constraints.allowedDestinations && !constraints.allowedDestinations.includes(request.to)) {
    return { allowed: false, reason: `허용되지 않은 주소: ${request.to}` }
  }

  return { allowed: true }
}
```

---

## State of the Art

| Old Approach (v0.1) | Current Approach (v0.2) | When Changed | Impact |
|---------------------|------------------------|--------------|--------|
| API Key (wai_live_xxx) 영구 토큰 | JWT 세션 토큰 (wai_sess_xxx) 단기 만료 | v0.2 전환 | 토큰 탈취 시 피해 기간 제한 (영구 -> 최대 7일) |
| AWS KMS 기반 서명 | 로컬 sodium guarded memory 서명 | v0.2 전환 | 외부 의존성 제거, 네트워크 레이턴시 제거 |
| Squads 온체인 정책 | SQLite 로컬 정책 엔진 | v0.2 전환 | Solana 전용 -> 체인 무관 |
| @solana/web3.js 1.x (Connection) | @solana/kit (createSolanaRpc, pipe) | 2024 리브랜딩 | 함수형 API, tree-shakeable, zero-dep |
| Cloud 8단계 tx flow | Self-Hosted 6단계 tx pipeline | v0.2 전환 | Enclave/Squads 2단계 제거, 로컬 정책으로 대체 |
| OAuth 2.1 + RBAC/ABAC | SIWS/SIWE Owner 서명 + 세션 제약 | v0.2 전환 | 지갑 소유권 증명 기반 인가. OAuth 인프라 불필요 |

**Deprecated/outdated:**
- `@solana/web3.js` 1.x: `@solana/kit`으로 리브랜딩. 1.x Connection API는 deprecated
- `jsonwebtoken` npm: jose가 더 현대적이고 ESM 지원. jsonwebtoken은 CJS 전용, 의존성 多
- Cloud-First 인증 모델 (v0.1 18-authentication-model.md): Self-Hosted에서 API Key 영구 토큰, OAuth 서버, RBAC/ABAC 엔진은 과도한 복잡성

---

## Open Questions

### 1. JWT Secret 초기 생성 및 저장 위치

- **What we know:** config.toml [security] 섹션 또는 환경변수로 jwt_secret 관리. `waiaas init`에서 생성.
- **What's unclear:** 키스토어 마스터 패스워드와 jwt_secret의 관계. jwt_secret도 키스토어 내부에 암호화 저장할지, config.toml 평문 저장할지.
- **Recommendation:** config.toml에 평문 저장 (파일 권한 600으로 보호). jwt_secret은 암호학적 비밀이지만, 키스토어의 개인키만큼 치명적이지 않음. 키스토어 잠금 해제 없이도 세션 검증이 가능해야 하므로 분리 저장이 합리적.

### 2. Owner 인증(SIWS/SIWE)과 세션 인증의 경계

- **What we know:** CORE-06에서 `/v1/sessions`는 Owner 인증, `/v1/wallet/*`와 `/v1/transactions/*`는 Session 인증으로 정의됨.
- **What's unclear:** Phase 7에서 ownerAuth 미들웨어를 어디까지 구현하는지. Phase 8에서 `/v1/owner/*` 라우트에 사용하는 ownerAuth와 Phase 7의 세션 생성 시 Owner 검증의 관계.
- **Recommendation:** Phase 7에서 SIWS/SIWE 서명 검증 로직을 owner-verifier 유틸리티로 구현하고, POST /v1/sessions 핸들러에서 직접 호출. Phase 8의 ownerAuth 라우트 레벨 미들웨어는 이 유틸리티를 재사용. 미들웨어 자체는 Phase 8에서 등록.

### 3. 만료 세션 정리 워커의 상세 구현

- **What we know:** CORE-05에서 BackgroundWorkers의 세션 만료 정리 워커가 1분 주기로 설계됨.
- **What's unclear:** 정리 대상 범위(expired만? revoked도?), 정리 방법(DELETE? 상태 변경?), 관련 audit_log 기록 여부.
- **Recommendation:** expired + revoked 세션 모두 DELETE. 세션은 transactions의 session_id가 SET NULL이므로 안전. SESSION_EXPIRED 감사 로그 기록.

### 4. @solana/kit 버전 문제

- **What we know:** Phase 6에서 "@solana/kit 3.x"로 명시했으나, 실제 @solana/kit은 @solana/web3.js 2.x의 리브랜딩이며 "3.x"라는 메이저 버전은 확인되지 않음.
- **What's unclear:** Phase 6 CONTEXT/RESEARCH에서 "3.x"로 언급한 것이 2.x -> kit 리브랜딩의 의미인지, 별도 3.0 릴리스를 기대한 것인지.
- **Recommendation:** @solana/kit latest (현재 리브랜딩된 버전)를 사용하되, 문서에서는 "@solana/kit (구 @solana/web3.js 2.x)"로 명시. 버전 번호보다 기능(pipe API, createSolanaRpc 등)에 초점.

---

## Sources

### Primary (HIGH confidence)

- [jose GitHub (panva/jose)](https://github.com/panva/jose) - v6.1.3 확인, SignJWT/jwtVerify API, HS256/EdDSA 알고리즘, ESM/CJS 지원
- [jose SignJWT docs](https://github.com/panva/jose/blob/main/docs/jwt/sign/classes/SignJWT.md) - setExpirationTime, setIssuedAt, setJti, sign 메서드 확인
- [@solana/kit GitHub (anza-xyz/kit)](https://github.com/anza-xyz/kit) - pipe 패턴, createSolanaRpc, 모듈러 아키텍처 확인
- [QuickNode @solana/kit Transfer SOL Guide](https://www.quicknode.com/guides/solana-development/tooling/web3-2/transfer-sol) - pipe, createTransactionMessage, signTransactionMessageWithSigners, sendAndConfirmTransactionFactory 실제 코드 패턴
- [SIWE GitHub (spruceid/siwe)](https://github.com/spruceid/siwe) - v3.0.0, SiweMessage, generateNonce, verify 메서드

### Secondary (MEDIUM confidence)

- [SIWS Web3Auth](https://siws.web3auth.io/) - SIWS 메시지 포맷, nonce 관리, 프론트엔드/백엔드 구현 가이드
- [Phantom SIWS](https://phantom.com/learn/developers/sign-in-with-solana) - Wallet Standard signIn 메서드, SIWS 명세
- [JWT Best Practices 2025](https://jwt.app/blog/jwt-best-practices/) - EdDSA/ES256 추천, 토큰 수명 5-15분, jti 기반 revocation
- [SuperTokens JWT Sessions](https://supertokens.com/blog/are-you-using-jwts-for-user-sessions-in-the-correct-way) - Short-lived JWT + refresh token 하이브리드 패턴
- [Stytch JWTs for Sessions](https://stytch.com/blog/introducing-jwts-for-session-management/) - JWT + DB 하이브리드 세션 관리 패턴

### Tertiary (LOW confidence)

- [Digital Wallet System Design (Medium)](https://dilipkumar.medium.com/digital-wallet-system-design-63a4e18edad6) - Event sourcing wallet 패턴 (WAIaaS에 직접 적용은 제한적)
- [SIWS Medium Article](https://medium.com/@KishiTheMechanic/implementing-sign-in-with-solana-siws-ce35dadeda31) - SIWS 구현 예시 (비공식)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - jose, siwe, @solana/kit 모두 공식 GitHub 확인. 버전/API 검증됨
- Architecture: HIGH - Phase 6 CORE-02/04/06 기반 구조에 JWT 하이브리드 패턴 적용. WAIaaS 고유 설계이나 근거 명확
- Pitfalls: HIGH - JWT 폐기, nonce replay, blockhash 만료 등 공식 문서 + 실무 가이드에서 반복 언급되는 문제
- SIWS/SIWE: MEDIUM - @web3auth/sign-in-with-solana는 "formal security audit 미완료" 명시. siwe는 115K+ 주간 다운로드로 안정적

**Research date:** 2026-02-05
**Valid until:** 2026-03-07 (30일 -- jose, siwe, @solana/kit 모두 안정 단계)
