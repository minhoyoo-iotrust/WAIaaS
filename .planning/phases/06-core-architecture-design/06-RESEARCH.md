# Phase 6: Core Architecture Design - Research

**Researched:** 2026-02-05
**Domain:** Self-hosted daemon architecture design -- keystore spec, storage schema, daemon lifecycle, chain abstraction, API framework
**Confidence:** HIGH

## Summary

Phase 6는 DESIGN 마일스톤으로, 코드가 아닌 구현 가능한 수준의 설계 문서를 산출한다. 5개 설계 문서(모노레포 구조/SQLite 스키마, 키스토어 스펙, ChainAdapter 인터페이스, 데몬 라이프사이클, API 프레임워크)를 작성하기 위해 각 기술 도메인의 정확한 API, 포맷, 패턴을 조사했다.

핵심 발견: (1) Ethereum Keystore V3 포맷은 AES-128-CTR + scrypt를 사용하며, v0.2는 이를 AES-256-GCM + Argon2id로 확장한다. GCM이 자체 인증을 제공하므로 별도 MAC 계산이 불필요해지는 것이 주요 차이. (2) Drizzle ORM의 `generate` + 프로그래밍 방식 `migrate()` 전략이 데몬 임베디드 환경에 적합. (3) Hono의 `@hono/zod-openapi`는 `OpenAPIHono` 클래스로 route/schema 정의와 OpenAPI 3.0 자동 생성을 통합. (4) sodium-native 5.0.10은 Node.js 22 호환, N-API 기반 prebuild 제공. (5) @solana/kit 3.x는 함수형 pipe 기반 API로, v0.2 ChainAdapter 설계 시 이 패턴에 맞춰야 한다. (6) viem이 EVM 측에서 ethers.js를 빠르게 대체 중이며, 타입 안전성과 번들 크기에서 우위.

**Primary recommendation:** 설계 문서에 라이브러리 API의 실제 시그니처를 반영하고, 바이트 수준 키스토어 포맷, SQL DDL, TypeScript 인터페이스를 포함하라. "구현자가 이 문서만 보고 코드를 작성할 수 있는 수준"이 기준이다.

## Standard Stack

Phase 6 설계에서 참조할 확정된 기술 스택.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `hono` | 4.11.x | HTTP 프레임워크 | 14KB, 멀티 런타임, TypeScript-first |
| `@hono/node-server` | latest | Node.js 서버 어댑터 | `serve()` with `hostname: '127.0.0.1'` 바인딩 지원 |
| `@hono/zod-openapi` | latest | OpenAPI 자동 생성 | `OpenAPIHono` 클래스로 Zod 스키마 -> OpenAPI 3.0 |
| `drizzle-orm` | 0.45.x | ORM | 7.4KB, SQL 투명, TypeScript 스키마 정의 |
| `better-sqlite3` | 12.6.x | SQLite 드라이버 | 동기식, WAL 모드, 단일 프로세스에 최적 |
| `drizzle-kit` | latest | 마이그레이션 도구 | `generate` + `migrate()` 프로그래밍 방식 |
| `sodium-native` | 5.0.10 | Guarded memory | `sodium_malloc`, `sodium_memzero`, `sodium_mprotect_*` |
| `argon2` | 0.44.0 | KDF (Argon2id) | 네이티브 바인딩, 354K weekly downloads |
| `jose` | latest | JWT | 제로 의존성, RFC 호환, HS256/ES256 |
| `@solana/kit` | 3.0.x | Solana SDK | pipe 기반 함수형 API, bigint 사용 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lru-cache` | 11.x | In-memory 캐시 | 세션 검증, 잔액 캐시, 속도 제한 |
| `smol-toml` | latest | TOML 파서 | 설정 파일 파싱 (Claude 재량 결정: TOML 선택) |
| `viem` | latest | EVM 클라이언트 | EVM ChainAdapter 구현 시 (ethers.js 대신) |
| `pnpm` | 9.x | 패키지 매니저 | 모노레포 workspace |
| `turborepo` | 2.x | 빌드 시스템 | 증분 빌드, 캐시 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| smol-toml (TOML) | JSON5 / YAML | JSON5는 JS 친화적이나 datetime 미지원. YAML은 들여쓰기 오류 위험. TOML이 설정 파일 전용 설계 |
| viem (EVM) | ethers.js v6 | ethers.js가 더 성숙하나, viem이 27KB vs 130KB, 타입 안전성 우수 |
| drizzle-kit generate | drizzle-kit push | push는 개발용, 프로덕션은 generate + migrate() 필수 |

**Installation:**
```bash
# Phase 6에서 설계할 패키지의 의존성 (참고용, 코드 작성 아님)
pnpm add hono @hono/node-server @hono/zod-openapi
pnpm add drizzle-orm better-sqlite3 lru-cache
pnpm add sodium-native argon2 jose
pnpm add @solana/kit @solana-program/system
pnpm add smol-toml
pnpm add -D drizzle-kit @types/better-sqlite3
```

## Architecture Patterns

### Recommended Project Structure (Monorepo)

```
waiaas/
  packages/
    core/               # 도메인 모델, 인터페이스, Zod 스키마
      src/
        domain/         # Wallet, Transaction, Agent, Session, Policy
        interfaces/     # ILocalKeyStore, IBlockchainAdapter, IPolicyEngine
        schemas/        # Zod SSoT 스키마 (-> TypeScript 타입 + OpenAPI)
        errors/         # 도메인 에러 코드 (v0.1 46개 재사용 + 확장)
    daemon/             # Self-hosted 데몬 (primary deliverable)
      src/
        infrastructure/ # keystore, database, cache, notifications
        server/         # Hono app, middleware, routes
        lifecycle/      # DaemonLifecycle, SignalHandler, BackgroundWorkers
    adapters/
      solana/           # SolanaAdapter (@solana/kit 3.x)
      evm/              # EVMAdapter (viem)
    cli/                # waiaas init/start/stop/status
      bin/waiaas        # npm global entry point
    sdk/                # @waiaas/sdk (Phase 9)
    mcp/                # @waiaas/mcp (Phase 9)
  turbo.json
  pnpm-workspace.yaml
  package.json
```

**pnpm-workspace.yaml:**
```yaml
packages:
  - 'packages/*'
  - 'packages/adapters/*'
```

**turbo.json (핵심 task 의존성):**
```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {}
  }
}
```

### Pattern 1: Ethereum Keystore V3 확장 포맷 (WAIaaS v1)

**What:** Ethereum Keystore V3의 JSON 구조를 기반으로 AES-256-GCM + Argon2id로 확장한 키스토어 파일 포맷.

**Ethereum Keystore V3 원본 구조:**
```json
{
  "version": 3,
  "id": "uuid",
  "crypto": {
    "cipher": "aes-128-ctr",
    "cipherparams": { "iv": "hex-128bit" },
    "ciphertext": "hex",
    "kdf": "pbkdf2",
    "kdfparams": {
      "c": 262144, "dklen": 32,
      "prf": "hmac-sha256", "salt": "hex"
    },
    "mac": "keccak256(DK[16..31] ++ ciphertext)"
  }
}
```
Source: [Ethereum Web3 Secret Storage Definition](https://ethereum.org/en/developers/docs/data-structures-and-encoding/web3-secret-storage/)

**WAIaaS v1 확장:**
- `cipher`: `aes-128-ctr` -> `aes-256-gcm` (더 강력, AEAD 내장)
- `kdf`: `pbkdf2` -> `argon2id` (메모리 하드, GPU 공격 내성)
- `mac`: keccak256 별도 계산 -> GCM auth tag가 대체 (AEAD이므로 별도 MAC 불필요)
- 추가 필드: `chain`, `publicKey`, `metadata` (체인 정보, 생성 시각 등)

**Source:** [Ethereum Keystore V3 Spec](https://ethereum.org/en/developers/docs/data-structures-and-encoding/web3-secret-storage/) (HIGH confidence)

### Pattern 2: Drizzle ORM 프로그래밍 방식 마이그레이션

**What:** `drizzle-kit generate`로 SQL 마이그레이션 파일 생성, 데몬 시작 시 `migrate()` 함수로 자동 적용.

**When to use:** 임베디드 SQLite 데몬에서 스키마 버전 관리가 필요할 때.

```typescript
// Source: https://orm.drizzle.team/docs/migrations
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const sqlite = new Database("~/.waiaas/data/waiaas.db");
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('synchronous = NORMAL');

const db = drizzle({ client: sqlite });

// 데몬 시작 시 자동 마이그레이션
await migrate(db, { migrationsFolder: "./drizzle" });
```

**drizzle.config.ts:**
```typescript
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "sqlite",
  schema: "./packages/daemon/src/infrastructure/database/schema.ts",
  out: "./packages/daemon/drizzle",
  dbCredentials: { url: "file:./dev.db" }
});
```

**Source:** [Drizzle Migrations Docs](https://orm.drizzle.team/docs/migrations) (HIGH confidence)

### Pattern 3: Hono + Zod OpenAPI 통합

**What:** `OpenAPIHono` 클래스를 사용하여 route 정의, Zod 스키마 검증, OpenAPI 3.0 스펙 자동 생성을 하나의 흐름으로 통합.

```typescript
// Source: https://hono.dev/examples/zod-openapi
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'

const BalanceResponseSchema = z.object({
  address: z.string().openapi({ example: 'So11111111111111111111111111111112' }),
  balance: z.string().openapi({ example: '1000000000' }),
  chain: z.string().openapi({ example: 'solana' }),
}).openapi('BalanceResponse')

const getBalanceRoute = createRoute({
  method: 'get',
  path: '/v1/wallet/balance',
  request: {
    headers: z.object({
      authorization: z.string().openapi({ example: 'Bearer wai_sess_...' }),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: BalanceResponseSchema } },
      description: 'Wallet balance',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Authentication failed',
    },
  },
})

const app = new OpenAPIHono()

app.openapi(getBalanceRoute, (c) => {
  // c.req.valid('header') -- 타입 안전한 헤더 접근
  return c.json({ address: '...', balance: '...', chain: 'solana' }, 200)
})

// OpenAPI JSON 스펙 엔드포인트
app.doc('/doc', {
  openapi: '3.0.0',
  info: { version: '1.0.0', title: 'WAIaaS API' },
})
```

**Source:** [Hono Zod OpenAPI Docs](https://hono.dev/examples/zod-openapi), [@hono/zod-openapi npm](https://www.npmjs.com/package/@hono/zod-openapi) (HIGH confidence)

### Pattern 4: @hono/node-server localhost 바인딩

**What:** `serve()` 함수의 `hostname` 옵션으로 127.0.0.1 전용 바인딩.

```typescript
// Source: https://deepwiki.com/honojs/node-server/4.1-server-api
import { serve } from '@hono/node-server'

const server = serve({
  fetch: app.fetch,
  port: 3000,
  hostname: '127.0.0.1',  // 필수: localhost만 바인딩
})
```

**serve() API:**
| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `fetch` | `FetchCallback` | 필수 | Hono app의 fetch 핸들러 |
| `port` | `number` | `3000` | 포트 번호 |
| `hostname` | `string` | undefined (0.0.0.0) | 바인딩 주소 |
| `overrideGlobalObjects` | `boolean` | `true` | 글로벌 Request/Response 대체 |
| `createServer` | `Function` | `http.createServer` | 커스텀 서버 팩토리 |
| `serverOptions` | `ServerOptions` | `{}` | 서버 옵션 |

**주의:** `hostname` 미지정 시 Node.js 기본값인 `0.0.0.0`(모든 인터페이스)으로 바인딩됨. WAIaaS는 반드시 `'127.0.0.1'`을 명시해야 한다 (C-04 pitfall).

**Source:** [honojs/node-server DeepWiki](https://deepwiki.com/honojs/node-server/4.1-server-api) (HIGH confidence)

### Pattern 5: sodium-native Guarded Memory Protocol

**What:** 키 자료를 sodium_malloc 버퍼에서만 다루는 메모리 안전 프로토콜.

```typescript
// Source: https://sodium-friends.github.io/docs/docs/memoryprotection
import sodium from 'sodium-native'

// 1. 보호된 버퍼 할당 (mlock + guard pages)
const keyBuffer = sodium.sodium_malloc(32) // 32바이트 = 256비트 키
console.log(keyBuffer.secure) // true

// 2. 접근 잠금 (기본 상태)
sodium.sodium_mprotect_noaccess(keyBuffer)

// 3. 서명 시 일시적으로 읽기/쓰기 허용
sodium.sodium_mprotect_readwrite(keyBuffer)
// ... 복호화된 키를 keyBuffer에 기록 ...
// ... 서명 수행 ...

// 4. 즉시 제로화
sodium.sodium_memzero(keyBuffer)

// 5. 다시 접근 잠금
sodium.sodium_mprotect_noaccess(keyBuffer)
```

**핵심 API:**
| 함수 | 설명 |
|------|------|
| `sodium_malloc(size)` | 보호된 힙 메모리 할당. `buffer.secure === true` |
| `sodium_memzero(buf)` | 데이터를 확실히 제로화 (컴파일러 최적화 방지) |
| `sodium_mprotect_noaccess(buf)` | 접근 불가 설정. 접근 시 프로세스 크래시 |
| `sodium_mprotect_readonly(buf)` | 읽기 전용. 쓰기 시 프로세스 크래시 |
| `sodium_mprotect_readwrite(buf)` | 읽기/쓰기 허용 (일시적으로 사용) |
| `sodium_mlock(buf)` | swap 방지 (sodium_malloc이 자동 호출) |
| `sodium_munlock(buf)` | mlock 해제 + 자동 memzero |

**주의사항:**
- 많은 Buffer 메서드가 sodium_malloc 메모리의 보안 보장을 깨뜨릴 수 있음
- sodium_malloc은 범용 할당자가 아님 (malloc보다 느리고 3-4개 추가 가상 메모리 페이지 필요)
- `sodium-native` v5.0.10은 N-API 기반으로 Node.js 22 호환

**Source:** [sodium-native docs](https://sodium-friends.github.io/docs/docs/memoryprotection), [sodium-native npm](https://www.npmjs.com/package/sodium-native) (HIGH confidence)

### Pattern 6: @solana/kit 3.x 트랜잭션 빌드 패턴

**What:** 함수형 pipe 기반 트랜잭션 구성 및 서명/제출.

```typescript
// Source: https://www.quicknode.com/guides/solana-development/tooling/web3-2/transfer-sol
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  sendAndConfirmTransactionFactory,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
  getSignatureFromTransaction,
  address,
  lamports,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";

// LAMPORTS_PER_SOL은 더 이상 SDK에서 제공되지 않음
const LAMPORTS_PER_SOL = BigInt(1_000_000_000);

// RPC 설정
const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
const rpcSubscriptions = createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com');

// 트랜잭션 빌드 (pipe 패턴)
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

const transactionMessage = pipe(
  createTransactionMessage({ version: 0 }),
  tx => setTransactionMessageFeePayer(signer.address, tx),
  tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  tx => appendTransactionMessageInstruction(
    getTransferSolInstruction({
      amount: lamports(LAMPORTS_PER_SOL / BigInt(2)),
      destination: address('target-address'),
      source: signer,
    }),
    tx
  )
);

// 서명 + 전송
const signedTx = await signTransactionMessageWithSigners(transactionMessage);
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
await sendAndConfirm(signedTx, { commitment: 'confirmed', skipPreflight: true });
const signature = getSignatureFromTransaction(signedTx);
```

**ChainAdapter 설계 시 고려사항:**
- `pipe()` 함수형 패턴을 내부적으로 사용하되, ChainAdapter 인터페이스는 명령형으로 노출
- 모든 금액은 `bigint` (lamports 단위)
- `signTransactionMessageWithSigners`는 instruction에 포함된 signer를 자동 추출
- `sendAndConfirmTransactionFactory`는 RPC + WebSocket 구독 모두 필요
- `LAMPORTS_PER_SOL`이 SDK에서 제거됨 -- 수동 정의 필요

**Source:** [QuickNode Solana Kit Guide](https://www.quicknode.com/guides/solana-development/tooling/web3-2/transfer-sol), [anza-xyz/kit GitHub](https://github.com/anza-xyz/kit) (HIGH confidence)

### Pattern 7: Node.js Graceful Shutdown

**What:** SIGINT/SIGTERM 시그널 처리, in-flight 요청 완료 대기, 리소스 정리.

```typescript
// Source: Node.js process docs + Hono graceful shutdown discussions
const server = serve({
  fetch: app.fetch,
  port: 3000,
  hostname: '127.0.0.1',
})

let isShuttingDown = false

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true
  console.log(`Received ${signal}, starting graceful shutdown...`)

  // 1. 새 연결 수락 중지
  server.close()

  // 2. In-flight 요청 완료 대기 (최대 30초)
  const shutdownTimeout = setTimeout(() => {
    console.error('Forced shutdown after timeout')
    process.exit(1)
  }, 30_000)

  try {
    // 3. 백그라운드 워커 중지
    await stopBackgroundWorkers()

    // 4. Pending 트랜잭션 상태 저장
    await persistPendingState()

    // 5. WAL 체크포인트
    db.pragma('wal_checkpoint(TRUNCATE)')

    // 6. 키스토어 잠금 (키 자료 제로화)
    keyStore.lock() // sodium_memzero 호출

    // 7. SQLite 연결 닫기
    sqlite.close()

    clearTimeout(shutdownTimeout)
    process.exit(0)
  } catch (err) {
    console.error('Shutdown error:', err)
    clearTimeout(shutdownTimeout)
    process.exit(1)
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
```

**플랫폼 주의:**
- Windows에서 `SIGTERM`은 지원되지 않음 (listen은 가능하나 프로세스에 전송 불가)
- Docker PID 1 문제: `--init` 플래그 사용 또는 `tini` 사용 권장
- 서드파티 라이브러리가 자체 signal handler 등록할 수 있음 -- 충돌 주의

**Source:** [Node.js Process Docs](https://nodejs.org/api/process.html), [Hono Graceful Shutdown Discussion #3756](https://github.com/orgs/honojs/discussions/3756) (HIGH confidence)

### Anti-Patterns to Avoid

- **AES-GCM nonce를 파일에 고정 저장:** 매 암호화마다 새 96비트 랜덤 nonce 생성 필수 (C-01)
- **0.0.0.0 바인딩:** `serve()` hostname 미지정 시 기본값이 모든 인터페이스. 반드시 `'127.0.0.1'` 명시 (C-04)
- **Prisma 사용:** Rust 엔진 바이너리 필요, cold start 지연. Drizzle이 임베디드 데몬에 적합
- **비동기 SQLite (node-sqlite3):** mutex thrashing 발생. better-sqlite3 동기식이 단일 프로세스에서 더 빠름
- **ethers.js v6 for EVM:** 130KB 번들. viem (27KB)이 타입 안전성과 모듈성에서 우수
- **Buffer에 키 자료 저장:** GC가 복사를 만들어 이전 위치가 제로화되지 않음. sodium_malloc 전용 사용

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOML 파싱 | 커스텀 파서 | `smol-toml` | TOML 1.0 호환, TypeScript native, 가장 빠른 spec-compliant 파서 |
| JWT 생성/검증 | crypto로 직접 구현 | `jose` | RFC 7515-7519 완전 준수, 제로 의존성, edge case 처리 완비 |
| Argon2id KDF | node:crypto scrypt | `argon2` npm | Argon2id는 scrypt보다 메모리 하드, GPU 공격 내성 우수 |
| 보호된 메모리 | Buffer.alloc + fill(0) | `sodium-native` | GC가 Buffer 복사본을 만들어 fill(0)이 이전 위치 제로화 불가 |
| OpenAPI 스펙 생성 | 수동 YAML 작성 | `@hono/zod-openapi` | Zod 스키마에서 자동 생성, 스키마-코드-스펙 동기화 보장 |
| SQLite 마이그레이션 | 수동 SQL 스크립트 | `drizzle-kit generate` + `migrate()` | 타입 안전한 스키마 정의, 자동 diff, 프로그래밍 방식 적용 |
| LRU 캐시 | Map + setTimeout | `lru-cache` | TTL, maxSize, dispose callback 등 edge case 처리 완비 |
| Solana 트랜잭션 직렬화 | 수동 바이트 조작 | `@solana/kit` pipe API | 타입 안전, signer 자동 추출, blockhash 수명 관리 |

**Key insight:** Phase 6는 설계 문서이므로, 이 라이브러리들의 API를 정확히 참조하여 인터페이스를 정의해야 한다. 설계 시점에 라이브러리 API를 잘못 이해하면 구현 시 설계 문서 수정이 필요해진다.

## Common Pitfalls

### Pitfall 1: AES-256-GCM Nonce 재사용 (C-01)
**What goes wrong:** 동일 key+nonce로 두 개 암호문을 XOR하면 평문 차이 복원 가능. GCM auth key도 복구됨.
**Why it happens:** 재암호화 시 이전 nonce 재사용, 카운터 기반 nonce wrap-around.
**How to avoid:** 매 암호화마다 `crypto.randomBytes(12)` 새 nonce. nonce를 암호문에 prepend: `[12-byte nonce][ciphertext][16-byte tag]`.
**Warning signs:** nonce가 코드/설정에 상수로 존재, 재암호화 후 파일 크기 동일.

### Pitfall 2: Argon2id 약한 파라미터 (C-02)
**What goes wrong:** 공격자가 암호화된 키 파일을 탈취하면 오프라인 브루트포스.
**Why it happens:** 서버 환경 가이드(다수 동시 사용자 = 낮은 메모리)를 단일 사용자 데몬에 적용.
**How to avoid:** 단일 사용자 로컬 데몬은 1-3초 파생 시간 목표. 잠긴 파라미터: m=64MiB, t=3, p=4. 16바이트 CSPRNG salt.
**Warning signs:** 파생이 500ms 미만, 메모리 < 46MiB.

### Pitfall 3: 개인 키 메모리 잔존 (C-03)
**What goes wrong:** GC가 Buffer를 이동시킬 때 이전 위치의 키 자료가 제로화되지 않음. swap/core dump으로 노출.
**Why it happens:** Node.js는 secure memory 미지원 (Issue #30956).
**How to avoid:** sodium-native `sodium_malloc()` 전용 사용. 복호화 -> 서명 -> `sodium_memzero()` 단일 동기 경로.
**Warning signs:** 키가 일반 Buffer/변수에 저장, 명시적 제로화 없음.

### Pitfall 4: Localhost 0.0.0.0 Day (C-04)
**What goes wrong:** 브라우저에서 악성 페이지가 `http://0.0.0.0:3000`으로 요청 전송. PNA가 이를 차단하지 않았음.
**Why it happens:** `serve()` hostname 미지정 시 0.0.0.0 바인딩.
**How to avoid:** `hostname: '127.0.0.1'` 명시. 모든 엔드포인트에 세션 토큰 인증. Host 헤더 검증.
**Warning signs:** Host 헤더 검증 없음, CORS `*`.

### Pitfall 5: SQLite WAL 관리 소홀 (H-02)
**What goes wrong:** WAL 파일이 무한히 성장 (checkpoint starvation). 네트워크 FS에서 silent corruption.
**Why it happens:** 주기적 WAL checkpoint 누락, NFS/SMB에서 SQLite 실행.
**How to avoid:** 5분마다 `PRAGMA wal_checkpoint(TRUNCATE)`. `busy_timeout = 5000`. 로컬 FS만 사용.
**Warning signs:** `.db-wal` 파일이 수십 MB로 성장, SQLITE_BUSY 에러.

### Pitfall 6: Hono Graceful Shutdown 불완전 (Node-specific)
**What goes wrong:** `server.close()` 호출 후에도 프로세스가 종료되지 않음 (keep-alive 연결).
**Why it happens:** Node.js HTTP 서버의 keep-alive 연결이 `server.close()`로 닫히지 않음.
**How to avoid:** 응답에 `Connection: close` 헤더 설정. 소켓 추적 후 `destroySoon()` 호출. 30초 강제 종료 타임아웃.
**Warning signs:** `server.close()` 후 프로세스가 종료되지 않음 (Issue #3104).

## Code Examples

Phase 6 설계 문서에 참조할 검증된 코드 패턴.

### Drizzle ORM SQLite 스키마 정의

```typescript
// Source: https://orm.drizzle.team/docs/get-started-sqlite
import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),           // UUID
  name: text('name').notNull(),
  chain: text('chain').notNull(),        // 'solana' | 'ethereum'
  network: text('network').notNull(),    // 'mainnet-beta' | 'devnet'
  publicKey: text('public_key').notNull(),
  status: text('status', {
    enum: ['CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATING', 'TERMINATED']
  }).notNull().default('CREATING'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  suspendedAt: integer('suspended_at', { mode: 'timestamp' }),
  suspensionReason: text('suspension_reason'),
});

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  eventType: text('event_type').notNull(),
  actor: text('actor').notNull(),        // 'agent:<id>' | 'owner' | 'system'
  details: text('details').notNull(),    // JSON
  severity: text('severity', {
    enum: ['info', 'warning', 'critical']
  }).notNull(),
});
```

### SQLite 초기화 + WAL 모드

```typescript
// Source: https://orm.drizzle.team/docs/get-started-sqlite + SQLite WAL docs
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const sqlite = new Database(path.join(dataDir, 'waiaas.db'));

// 필수 pragma 설정
sqlite.pragma('journal_mode = WAL');      // 동시 읽기 허용
sqlite.pragma('synchronous = NORMAL');    // WAL 모드에서 안전하고 더 빠름
sqlite.pragma('foreign_keys = ON');       // FK 제약 활성화
sqlite.pragma('busy_timeout = 5000');     // 5초 잠금 대기
sqlite.pragma('cache_size = -64000');     // 64MB 캐시
sqlite.pragma('mmap_size = 268435456');   // 256MB 메모리 매핑

const db = drizzle({ client: sqlite });
```

### AES-256-GCM 암호화/복호화

```typescript
// Source: v0.2 research STACK.md + node:crypto docs
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function encrypt(plaintext: Buffer, key: Buffer): {
  iv: Buffer; ciphertext: Buffer; tag: Buffer
} {
  const iv = randomBytes(12);  // 96비트 nonce - 매번 새로 생성!
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag(); // 128비트 인증 태그
  return { iv, ciphertext, tag };
}

function decrypt(
  ciphertext: Buffer, key: Buffer, iv: Buffer, tag: Buffer
): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
```

### Argon2id 키 파생

```typescript
// Source: argon2 npm docs
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

async function deriveKey(password: string): Promise<{
  key: Buffer; salt: Buffer
}> {
  const salt = randomBytes(16); // 16바이트 CSPRNG salt
  const key = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,   // 64 MiB (잠긴 결정)
    timeCost: 3,         // 3회 반복 (잠긴 결정)
    parallelism: 4,      // 4 병렬 (잠긴 결정)
    salt,
    raw: true,           // Buffer 반환 (PHC 문자열 아님)
    hashLength: 32,      // 256비트 키
  });
  return { key: Buffer.from(key), salt };
}
```

### Hono 서버 설정 + localhost 바인딩

```typescript
// Source: Hono Node.js docs + @hono/node-server API
import { serve } from '@hono/node-server'
import { OpenAPIHono } from '@hono/zod-openapi'
import { secureHeaders } from 'hono/secure-headers'
import { cors } from 'hono/cors'

const app = new OpenAPIHono()

// 보안 미들웨어
app.use('*', secureHeaders())
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
}))

// Host 헤더 검증 미들웨어 (C-04 방지)
app.use('*', async (c, next) => {
  const host = c.req.header('host')
  if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    return c.json({ error: 'Invalid host' }, 403)
  }
  await next()
})

// 서버 시작
const server = serve({
  fetch: app.fetch,
  port: 3000,
  hostname: '127.0.0.1',
})
```

## Claude's Discretion Decisions (연구 기반 권장)

### 1. 설정 파일 포맷: TOML 권장

**결정:** TOML (`smol-toml` 라이브러리)

**근거:**
- TOML은 설정 파일 전용으로 설계됨 (JSON/YAML은 데이터 교환용)
- 주석 지원 (JSON 불가, JSON5/YAML 가능)
- 명시적 구문으로 들여쓰기 오류 방지 (YAML의 가장 큰 약점)
- RFC 3339 datetime 기본 지원 (세션 만료 등에 유용)
- `smol-toml`: TypeScript native, TOML 1.0 호환, 가장 빠른 spec-compliant 파서
- Rust 생태계 표준 (Tauri 설정도 TOML) -- 프로젝트 내 일관성

**Tradeoff:** 깊은 중첩 시 verbose해짐. WAIaaS config는 2-3 depth로 TOML 적합.

### 2. 멀티 프로필 지원: 단일 프로필 + 환경 오버라이드

**결정:** v0.2는 단일 프로필. 환경변수(`WAIAAS_DATA_DIR`)로 데이터 디렉토리 변경 가능.

**근거:**
- v0.2 유스케이스는 "하나의 머신에서 하나의 데몬"
- 멀티 프로필(testnet/mainnet 분리)은 데이터 디렉토리 분리로 해결:
  - `WAIAAS_DATA_DIR=~/.waiaas-devnet waiaas start`
- 명시적 프로필 시스템은 설정 복잡도 증가 대비 가치 낮음
- 향후 필요시 `--profile` CLI 옵션 추가 가능

### 3. SQLite 마이그레이션: drizzle-kit generate + 프로그래밍 방식 migrate()

**결정:** `drizzle-kit generate`로 SQL 파일 생성 -> 데몬 시작 시 `migrate()` 자동 적용.

**근거:**
- 마이그레이션 파일이 git에 추적됨 (버전 관리 가능)
- 데몬이 자체적으로 마이그레이션 실행 (외부 도구 불필요)
- `push`는 개발 시 rapid iteration용, 프로덕션에 부적합
- SQLite 제약: "Drop not null" 등 일부 변경은 수동 SQL 필요

### 4. 로그 저장 전략: 하이브리드 (파일 + SQLite)

**결정:**
- **데몬 로그:** 파일 (`~/.waiaas/logs/daemon.log`) -- 표준 stdout/file 로깅
- **감사 로그:** SQLite (`audit_log` 테이블) -- 구조화된 보안 이벤트

**근거:**
- 데몬 로그는 고용량, 디버깅용 -- 파일이 적합 (로그 로테이션 가능)
- 감사 로그는 구조화된 쿼리 필요 (시간 범위, 이벤트 타입, 심각도 필터) -- SQLite 적합
- 감사 로그는 append-only 테이블 (AUTOINCREMENT PK) -- 무결성 보장
- 두 용도를 하나의 저장소에 혼합하면 성능/관리 모두 저하

### 5. 데몬 실행 모드: foreground 기본 + background 지원

**결정:**
- `waiaas start`: foreground 실행 (기본값). Tauri 사이드카 모드에서는 이것이 자연스러움
- `waiaas start --daemon` 또는 `waiaas start -d`: background 실행 (PID 파일 기반)
- `waiaas stop`: PID 파일로 SIGTERM 전송

**근거:**
- Tauri 사이드카는 foreground 프로세스를 관리 (spawn -> kill)
- Docker/systemd 환경도 foreground 프로세스를 기대
- background 모드는 CLI 독립 실행 시 필요
- PID 파일: `~/.waiaas/daemon.pid`

### 6. Graceful Shutdown 전략: 단계적 종료 + 30초 타임아웃

**결정:**
1. 새 연결 수락 중지
2. 응답에 `Connection: close` 헤더 설정
3. In-flight 요청 완료 대기 (최대 30초)
4. 진행 중 서명 작업 완료 (CRITICAL -- 중간에 중단하면 nonce 소비 but tx 미전송)
5. Pending queue 상태 SQLite에 저장
6. WAL checkpoint (TRUNCATE)
7. 키스토어 잠금 (sodium_memzero)
8. SQLite 닫기
9. PID 파일 삭제
10. process.exit(0)

**핵심:** 진행 중 서명 작업은 반드시 완료해야 한다. Solana는 blockhash 수명(~60초)이 있어 서명된 tx가 미전송되면 단순 만료되지만, EVM은 nonce가 소비되어 후속 tx가 막힐 수 있다.

### 7. EVM 라이브러리: viem 권장 (ethers.js v6 대신)

**결정:** viem을 EVM ChainAdapter 내부 구현에 사용.

**근거:**
- 번들 크기: viem 27KB vs ethers.js 130KB
- 타입 안전성: viem은 ABI 스키마 추론으로 컴파일 타임 타입 체크
- 모듈성: Client/Action 패턴이 ChainAdapter 인터페이스와 잘 맞음
- 커뮤니티 트렌드: wagmi 기반 프로젝트에서 표준
- @solana/kit의 함수형 패턴과 유사한 설계 철학

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @solana/web3.js 1.x | @solana/kit 3.x | 2024-2025 | pipe 기반 함수형 API, bigint 사용, LAMPORTS_PER_SOL 제거 |
| ethers.js v5 -> v6 | viem | 2023-2025 | 27KB vs 130KB, ABI 타입 추론, Client/Action 패턴 |
| sodium-friends/sodium-native | holepunchto/sodium-native | 2024 | 저장소 이전, N-API 기반, v5.0.10 |
| Prisma + PostgreSQL | Drizzle + SQLite | v0.2 전환 | Rust 엔진 제거, 임베디드 SQLite, 7.4KB ORM |
| Fastify 5.x | Hono 4.x | v0.2 전환 | 14KB, 멀티 런타임, 빌트인 Zod/OpenAPI |
| scrypt (Eth Keystore V3) | Argon2id | RFC 9106 (2022) | 메모리 하드, GPU/ASIC 공격 내성 우수 |
| AES-128-CTR + MAC | AES-256-GCM | 업계 표준 | AEAD 통합, 별도 MAC 불필요 |

**Deprecated/outdated:**
- `@solana/web3.js` 1.x: 레거시. @solana/kit 3.x로 마이그레이션 필요
- `jsonwebtoken` npm: 알려진 취약점. `jose`로 대체
- Ethereum Keystore V3 원본의 scrypt + AES-128-CTR: Argon2id + AES-256-GCM이 현대 표준
- `sodium-friends/sodium-native`: holepunchto로 이전됨
- Drizzle `push` 전략 (프로덕션): 마이그레이션 파일 없이 스키마 변경은 프로덕션에서 위험

## Open Questions

Phase 6 설계 중 완전히 해결되지 않은 항목.

1. **Argon2id 비동기 처리 전략**
   - What we know: Argon2id는 m=64MiB, t=3에서 ~1-3초 소요. `argon2` npm은 자체 스레드풀 사용 (비동기).
   - What's unclear: sodium-native의 `crypto_pwhash`를 사용할지, `argon2` npm을 사용할지. sodium-native는 동기 API만 제공할 수 있음.
   - Recommendation: `argon2` npm 사용 (비동기). 키스토어 잠금 해제는 데몬 시작 시 한 번만 발생하므로 이벤트 루프 차단이 큰 문제는 아니지만, 비동기가 안전.

2. **키스토어 파일 내 parallelism 파라미터**
   - What we know: 결정에서 `parallelism: 4`로 잠금. 하지만 ARCHITECTURE.md에서는 `parallelism: 1`로 기록.
   - What's unclear: CONTEXT.md의 결정(p=4)이 최종.
   - Recommendation: CONTEXT.md 결정(p=4)을 따른다. 키스토어 파일에 파라미터를 저장하므로 향후 변경 가능.

3. **EVM nonce 관리와 Graceful Shutdown 상호작용**
   - What we know: EVM은 순차 nonce 필요. 서명 후 미전송 tx가 있으면 nonce gap 발생.
   - What's unclear: Graceful shutdown 중 서명 완료 but 미전송 tx의 nonce를 어떻게 처리할지.
   - Recommendation: Phase 6 설계에서 이 시나리오를 명시하고, Phase 7 (트랜잭션 파이프라인)에서 상세 설계.

4. **Hono server.close() 미종료 문제**
   - What we know: @hono/node-server Issue #3104에서 server.close() 후 프로세스 미종료 보고.
   - What's unclear: 최신 버전에서 해결되었는지. keep-alive 소켓 관리가 필요할 수 있음.
   - Recommendation: 설계 문서에 소켓 추적 + 강제 종료 타임아웃 패턴 포함. 구현 시 테스트.

## Sources

### Primary (HIGH confidence)

- [Ethereum Web3 Secret Storage Definition](https://ethereum.org/en/developers/docs/data-structures-and-encoding/web3-secret-storage/) -- Keystore V3 바이트 수준 포맷
- [Drizzle ORM Migrations Docs](https://orm.drizzle.team/docs/migrations) -- generate + migrate() 전략
- [Drizzle ORM SQLite Getting Started](https://orm.drizzle.team/docs/get-started-sqlite-new) -- better-sqlite3 통합
- [Hono Node.js Docs](https://hono.dev/docs/getting-started/nodejs) -- serve() API
- [Hono Zod OpenAPI Example](https://hono.dev/examples/zod-openapi) -- OpenAPIHono, createRoute
- [@hono/node-server API Reference](https://deepwiki.com/honojs/node-server/4.1-server-api) -- serve() 전체 옵션
- [sodium-native Memory Protection Docs](https://sodium-friends.github.io/docs/docs/memoryprotection) -- guarded memory API
- [sodium-native npm](https://www.npmjs.com/package/sodium-native) -- v5.0.10, N-API
- [libsodium Secure Memory Docs](https://libsodium.gitbook.io/doc/memory_management) -- sodium_malloc 내부 동작
- [QuickNode @solana/kit Transfer Guide](https://www.quicknode.com/guides/solana-development/tooling/web3-2/transfer-sol) -- pipe 패턴 코드 예제
- [anza-xyz/kit GitHub](https://github.com/anza-xyz/kit) -- Solana Kit 저장소
- [Node.js Process Docs](https://nodejs.org/api/process.html) -- Signal 처리
- [Turborepo Structuring Docs](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository) -- 모노레포 구조
- [pnpm Workspaces Docs](https://pnpm.io/workspaces) -- workspace 설정
- [argon2 npm](https://www.npmjs.com/package/argon2) -- v0.44.0 API
- [RFC 9106 - Argon2](https://www.rfc-editor.org/rfc/rfc9106.html) -- Argon2 공식 스펙

### Secondary (MEDIUM confidence)

- [Hono Graceful Shutdown Discussion #3756](https://github.com/orgs/honojs/discussions/3756) -- 고급 shutdown 패턴
- [Hono server.close Issue #3104](https://github.com/honojs/hono/issues/3104) -- 미종료 문제
- [smol-toml GitHub](https://github.com/squirrelchat/smol-toml) -- TOML 파서 벤치마크
- [Viem vs Ethers.js Comparison (MetaMask)](https://metamask.io/news/viem-vs-ethers-js-a-detailed-comparison-for-web3-developers/) -- EVM 라이브러리 비교
- [JSON vs YAML vs TOML 2026 (DEV Community)](https://dev.to/jsontoall_tools/json-vs-yaml-vs-toml-which-configuration-format-should-you-use-in-2026-1hlb) -- 설정 포맷 비교
- [Drizzle Push vs Migrate (Oreate)](https://www.oreateai.com/blog/drizzle-push-vs-migrate-navigating-database-management-with-drizzle-kit/c954c74d99e275ff4d3dceb64c18deed) -- 전략 비교
- [Helius @solana/kit Getting Started](https://www.helius.dev/blog/how-to-start-building-with-the-solana-web3-js-2-0-sdk) -- Kit 소개

### Tertiary (LOW confidence)

- holepunchto/sodium-native Alpine 호환성 이슈 (#202) -- Docker Alpine 빌드 시 확인 필요
- TOML 파서 성능 벤치마크 (smol-toml README) -- 자체 벤치마크이므로 교차 검증 필요

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 모든 라이브러리 npm에서 버전 확인, 공식 문서에서 API 검증
- Architecture: HIGH -- Ethereum Keystore V3, SQLite WAL, Hono serve() API 모두 공식 문서에서 확인
- Pitfalls: HIGH -- v0.2 domain research (PITFALLS.md)에서 이미 HIGH 신뢰도로 확인된 항목 재사용
- Claude's Discretion: MEDIUM-HIGH -- 기술 비교는 복수 소스 교차 검증, 최종 선택은 프로젝트 맥락 기반 판단

**Research date:** 2026-02-05
**Valid until:** ~2026-03-05 (30 days -- 안정적인 라이브러리 중심, 급변하는 영역 없음)
