# 모노레포 패키지 구조 + 데이터 디렉토리 + TOML 설정 스펙 (CORE-01)

**문서 ID:** CORE-01
**작성일:** 2026-02-05
**v0.5 업데이트:** 2026-02-07
**상태:** 완료
**참조:** ARCH-02, 06-RESEARCH.md, 06-CONTEXT.md, 52-auth-model-redesign.md (v0.5)

---

## 1. 모노레포 패키지 구조

### 1.1 전체 디렉토리 트리

```
waiaas/
├── packages/
│   ├── core/                          # 도메인 모델, 인터페이스, Zod 스키마
│   │   ├── src/
│   │   │   ├── domain/                # 도메인 엔티티
│   │   │   │   ├── agent.ts           # Agent 엔티티 + 타입
│   │   │   │   ├── session.ts         # Session 엔티티 + 타입
│   │   │   │   ├── transaction.ts     # Transaction 엔티티 + 타입
│   │   │   │   └── policy.ts          # Policy 엔티티 + 타입
│   │   │   ├── interfaces/            # 추상화 인터페이스
│   │   │   │   ├── ILocalKeyStore.ts  # 키스토어 인터페이스
│   │   │   │   ├── IBlockchainAdapter.ts  # 체인 추상화
│   │   │   │   ├── IPolicyEngine.ts   # 정책 엔진 인터페이스
│   │   │   │   └── INotificationChannel.ts  # 알림 채널 인터페이스
│   │   │   ├── schemas/               # Zod SSoT 스키마
│   │   │   │   ├── agent.schema.ts    # Agent 요청/응답 스키마
│   │   │   │   ├── session.schema.ts  # Session 스키마
│   │   │   │   ├── transaction.schema.ts  # Transaction 스키마
│   │   │   │   ├── policy.schema.ts   # Policy 스키마
│   │   │   │   └── config.schema.ts   # Config 검증 스키마
│   │   │   ├── errors/                # 도메인 에러 코드
│   │   │   │   ├── error-codes.ts     # v0.1 46개 재사용 + 확장
│   │   │   │   └── base-error.ts      # WAIaaSError 베이스 클래스
│   │   │   └── index.ts               # 패키지 진입점
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── daemon/                        # Self-hosted 데몬 (Primary deliverable)
│   │   ├── src/
│   │   │   ├── infrastructure/        # 인프라 계층
│   │   │   │   ├── database/          # Drizzle ORM + SQLite
│   │   │   │   │   ├── schema.ts      # 전체 테이블 정의
│   │   │   │   │   ├── connection.ts  # DB 연결 + PRAGMA 설정
│   │   │   │   │   └── migrate.ts     # 자동 마이그레이션
│   │   │   │   ├── keystore/          # 암호화 키스토어
│   │   │   │   │   ├── keystore.ts    # KeyStore 클래스
│   │   │   │   │   ├── crypto.ts      # AES-256-GCM + Argon2id
│   │   │   │   │   └── memory.ts      # sodium-native 메모리 관리
│   │   │   │   ├── cache/             # LRU 캐시
│   │   │   │   │   └── session-cache.ts
│   │   │   │   ├── notifications/     # 알림 발송
│   │   │   │   │   ├── telegram.ts
│   │   │   │   │   ├── discord.ts
│   │   │   │   │   └── ntfy.ts
│   │   │   │   └── config/            # TOML 설정 로더
│   │   │   │       └── loader.ts      # 설정 로드 + 환경변수 오버라이드
│   │   │   ├── server/                # Hono HTTP 서버
│   │   │   │   ├── app.ts             # OpenAPIHono 인스턴스
│   │   │   │   ├── middleware/        # 미들웨어
│   │   │   │   │   ├── auth.ts        # 세션 토큰 검증
│   │   │   │   │   ├── host-guard.ts  # Host 헤더 검증
│   │   │   │   │   └── rate-limit.ts  # 속도 제한
│   │   │   │   └── routes/            # API 라우트
│   │   │   │       ├── agents.ts      # /v1/agents
│   │   │   │       ├── sessions.ts    # /v1/sessions
│   │   │   │       ├── transactions.ts # /v1/transactions
│   │   │   │       └── health.ts      # /health
│   │   │   ├── services/              # 비즈니스 로직
│   │   │   │   ├── agent-service.ts
│   │   │   │   ├── session-service.ts
│   │   │   │   ├── transaction-service.ts
│   │   │   │   └── policy-engine.ts
│   │   │   ├── lifecycle/             # 데몬 라이프사이클
│   │   │   │   ├── daemon.ts          # DaemonLifecycle 클래스
│   │   │   │   ├── signal-handler.ts  # SIGINT/SIGTERM 처리
│   │   │   │   └── workers.ts         # 백그라운드 워커 (WAL checkpoint 등)
│   │   │   └── index.ts               # 데몬 진입점
│   │   ├── drizzle/                   # 마이그레이션 파일 (drizzle-kit generate 산출물)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── drizzle.config.ts          # drizzle-kit 설정
│   │
│   ├── adapters/
│   │   ├── solana/                    # SolanaAdapter (@solana/kit 3.x)
│   │   │   ├── src/
│   │   │   │   ├── adapter.ts         # SolanaAdapter 구현
│   │   │   │   ├── transaction-builder.ts  # pipe 기반 트랜잭션 빌드
│   │   │   │   ├── rpc.ts             # RPC 클라이언트 설정
│   │   │   │   └── index.ts
│   │   │   ├── package.json
│   │   │   └── tsconfig.json
│   │   │
│   │   └── evm/                       # EVMAdapter (viem)
│   │       ├── src/
│   │       │   ├── adapter.ts         # EVMAdapter 구현
│   │       │   ├── client.ts          # viem 클라이언트 설정
│   │       │   └── index.ts
│   │       ├── package.json
│   │       └── tsconfig.json
│   │
│   ├── cli/                           # waiaas CLI (npm 글로벌 설치)
│   │   ├── src/
│   │   │   ├── commands/              # CLI 커맨드
│   │   │   │   ├── init.ts            # waiaas init
│   │   │   │   ├── start.ts           # waiaas start [--daemon]
│   │   │   │   ├── stop.ts            # waiaas stop
│   │   │   │   └── status.ts          # waiaas status
│   │   │   ├── utils/                 # CLI 유틸리티
│   │   │   │   ├── data-dir.ts        # 데이터 디렉토리 해석
│   │   │   │   └── password-prompt.ts # 마스터 패스워드 입력
│   │   │   └── index.ts               # CLI 진입점
│   │   ├── bin/
│   │   │   └── waiaas                 # npm global entry point (#!/usr/bin/env node)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── sdk/                           # @waiaas/sdk (Phase 9에서 설계)
│   │   ├── src/
│   │   │   └── index.ts               # placeholder
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── mcp/                           # @waiaas/mcp (Phase 9에서 설계)
│       ├── src/
│       │   └── index.ts               # placeholder
│       ├── package.json
│       └── tsconfig.json
│
├── turbo.json                         # Turborepo 빌드 설정
├── pnpm-workspace.yaml                # pnpm 워크스페이스
├── package.json                       # 루트 패키지
├── tsconfig.base.json                 # 공유 TypeScript 설정
└── .nvmrc                             # Node.js 22 LTS
```

### 1.2 패키지별 역할 정의

| 패키지 | npm name | 역할 | 주요 exports |
|--------|----------|------|-------------|
| `packages/core` | `@waiaas/core` | 도메인 모델, 인터페이스, Zod 스키마, 에러 코드. 모든 패키지가 의존하는 공유 계층 | 타입, 인터페이스, Zod 스키마, 에러 클래스 |
| `packages/daemon` | `@waiaas/daemon` | Self-hosted 데몬. Hono HTTP 서버, SQLite, 키스토어, 라이프사이클 관리 | `startDaemon()`, `DaemonLifecycle` |
| `packages/adapters/solana` | `@waiaas/adapter-solana` | Solana 블록체인 어댑터. @solana/kit 3.x 기반 | `SolanaAdapter` (implements `IBlockchainAdapter`) |
| `packages/adapters/evm` | `@waiaas/adapter-evm` | EVM 블록체인 어댑터. viem 기반 | `EVMAdapter` (implements `IBlockchainAdapter`) |
| `packages/cli` | `@waiaas/cli` (bin: `waiaas`) | CLI 도구. init/start/stop/status 커맨드 | binary entry point |
| `packages/sdk` | `@waiaas/sdk` | 외부 개발자용 SDK (Phase 9) | `WAIaaSClient` |
| `packages/mcp` | `@waiaas/mcp` | MCP 서버 (Phase 9) | `MCPServer` |

### 1.3 패키지 의존 관계

```mermaid
graph TB
    subgraph "packages/"
        Core["@waiaas/core<br/>도메인, 인터페이스, 스키마"]
        Daemon["@waiaas/daemon<br/>HTTP 서버, DB, 키스토어"]
        Solana["@waiaas/adapter-solana<br/>@solana/kit 3.x"]
        EVM["@waiaas/adapter-evm<br/>viem"]
        CLI["@waiaas/cli<br/>init/start/stop/status"]
        SDK["@waiaas/sdk<br/>(Phase 9)"]
        MCP["@waiaas/mcp<br/>(Phase 9)"]
    end

    subgraph "외부 의존성"
        Hono["hono + @hono/node-server"]
        Drizzle["drizzle-orm + better-sqlite3"]
        Sodium["sodium-native"]
        SolanaKit["@solana/kit 3.x"]
        Viem["viem"]
        Jose["jose"]
        SmolToml["smol-toml"]
    end

    Daemon -->|depends| Core
    Solana -->|depends| Core
    EVM -->|depends| Core
    CLI -->|depends| Daemon
    SDK -->|depends| Core
    MCP -->|depends| SDK

    Daemon --> Hono
    Daemon --> Drizzle
    Daemon --> Sodium
    Daemon --> Jose
    Daemon --> SmolToml
    Daemon -.->|runtime plugin| Solana
    Daemon -.->|runtime plugin| EVM
    Solana --> SolanaKit
    EVM --> Viem
```

**빌드 순서 (의존성 그래프에 의해 결정):**

```
Step 1: @waiaas/core              (의존성 없음)
Step 2: @waiaas/adapter-solana    (core에 의존)
         @waiaas/adapter-evm      (core에 의존)  -- 병렬 빌드
Step 3: @waiaas/daemon            (core + adapters에 의존)
Step 4: @waiaas/cli               (daemon에 의존)
         @waiaas/sdk              (core에 의존)   -- 병렬 빌드
Step 5: @waiaas/mcp               (sdk에 의존)
```

### 1.4 Workspace 설정

#### pnpm-workspace.yaml

```yaml
packages:
  - 'packages/*'
  - 'packages/adapters/*'
```

#### turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"],
      "inputs": ["src/**", "tsconfig.json", "package.json"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": [],
      "inputs": ["src/**", "test/**", "*.test.ts"]
    },
    "test:unit": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "test:integration": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "lint": {
      "outputs": [],
      "inputs": ["src/**", ".eslintrc.*"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "clean": {
      "cache": false
    }
  }
}
```

#### 루트 package.json

```json
{
  "name": "waiaas",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "test:unit": "turbo run test:unit",
    "test:integration": "turbo run test:integration",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean",
    "dev": "turbo run dev --filter=@waiaas/daemon",
    "format": "prettier --write \"packages/*/src/**/*.ts\"",
    "prepare": "husky"
  },
  "devDependencies": {
    "turbo": "^2.4.0",
    "typescript": "^5.7.0",
    "prettier": "^3.4.0",
    "husky": "^9.1.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0"
  }
}
```

#### tsconfig.base.json (루트)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

### 1.5 패키지별 package.json

#### @waiaas/core

```json
{
  "name": "@waiaas/core",
  "version": "0.2.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./domain": {
      "types": "./dist/domain/index.d.ts",
      "default": "./dist/domain/index.js"
    },
    "./interfaces": {
      "types": "./dist/interfaces/index.d.ts",
      "default": "./dist/interfaces/index.js"
    },
    "./schemas": {
      "types": "./dist/schemas/index.d.ts",
      "default": "./dist/schemas/index.js"
    },
    "./errors": {
      "types": "./dist/errors/index.d.ts",
      "default": "./dist/errors/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:unit": "vitest run",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

#### @waiaas/daemon

```json
{
  "name": "@waiaas/daemon",
  "version": "0.2.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "test:unit": "vitest run --dir test/unit",
    "test:integration": "vitest run --dir test/integration",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/infrastructure/database/migrate.ts"
  },
  "dependencies": {
    "@waiaas/core": "workspace:*",
    "hono": "^4.11.0",
    "@hono/node-server": "^1.14.0",
    "@hono/zod-openapi": "^0.18.0",
    "drizzle-orm": "^0.45.0",
    "better-sqlite3": "^12.6.0",
    "sodium-native": "^5.0.10",
    "argon2": "^0.44.0",
    "jose": "^6.0.0",
    "lru-cache": "^11.0.0",
    "smol-toml": "^1.3.0",
    "viem": "^2.23.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "drizzle-kit": "^0.30.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

> **[v0.7 보완]** SIWE 검증이 viem/siwe로 전환되어 daemon에 `viem` 직접 의존. `siwe`/`ethers` 패키지 불필요. Native addon prebuild 전략: `sodium-native`(prebuildify), `better-sqlite3`(prebuild-install), `argon2`(node-pre-gyp).

#### @waiaas/adapter-solana

```json
{
  "name": "@waiaas/adapter-solana",
  "version": "0.2.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:unit": "vitest run",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@waiaas/core": "workspace:*",
    "@solana/kit": "^3.0.0",
    "@solana-program/system": "^0.7.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

#### @waiaas/adapter-evm

```json
{
  "name": "@waiaas/adapter-evm",
  "version": "0.2.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:unit": "vitest run",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@waiaas/core": "workspace:*",
    "viem": "^2.23.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

#### @waiaas/cli

```json
{
  "name": "@waiaas/cli",
  "version": "0.2.0",
  "type": "module",
  "bin": {
    "waiaas": "bin/waiaas"
  },
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:unit": "vitest run",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@waiaas/daemon": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Note:** `packages/sdk`와 `packages/mcp`의 package.json은 Phase 9에서 상세 정의. 현재는 placeholder로 name과 version만 설정.

---

## 2. 데이터 디렉토리 레이아웃 (~/.waiaas/)

### 2.1 경로 해석 로직

데이터 디렉토리는 다음 우선순위로 결정된다:

```typescript
function resolveDataDir(): string {
  // 1. 환경변수 최우선
  if (process.env.WAIAAS_DATA_DIR) {
    return process.env.WAIAAS_DATA_DIR;
  }

  // 2. XDG Base Directory 스펙 준수
  if (process.env.XDG_DATA_HOME) {
    return path.join(process.env.XDG_DATA_HOME, 'waiaas');
  }

  // 3. 기본 경로
  return path.join(os.homedir(), '.waiaas');
}
```

**환경변수를 사용한 멀티 프로필 운용:**

```bash
# devnet 전용 데몬
WAIAAS_DATA_DIR=~/.waiaas-devnet waiaas start

# mainnet 전용 데몬
WAIAAS_DATA_DIR=~/.waiaas-mainnet waiaas start
```

### 2.2 전체 디렉토리 트리

```
~/.waiaas/                             # 데이터 루트 (700)
├── config.toml                        # 데몬 설정 파일 (600)
├── .master-password                   # (v0.5 추가) 마스터 패스워드 파일. --quickstart 시 자동 생성 (600)
├── daemon.lock                        # [v0.7 보완] flock 기반 인스턴스 잠금 파일. fd 유지 기반 (644)
├── daemon.pid                         # PID 파일 - 보조 정보 [v0.7: 보조로 격하] (644)
├── data/                              # 데이터 파일 (700)
│   ├── waiaas.db                      # SQLite 메인 데이터베이스 (600)
│   ├── waiaas.db-wal                  # WAL 저널 (자동 생성) (600)
│   └── waiaas.db-shm                  # 공유 메모리 (자동 생성) (600)
├── keystore/                          # 암호화된 키 파일 (700)
│   └── <agent-id>.json                # 에이전트별 키스토어 파일 (600)
├── logs/                              # 로그 디렉토리 (700)
│   └── daemon.log                     # 데몬 로그 (644)
├── backups/                           # 백업 디렉토리 (700)
│   └── waiaas-<timestamp>.db          # DB 백업 파일 (600)
└── drizzle/                           # 마이그레이션 메타데이터 (700)
    └── meta/                          # drizzle-kit 메타 (700)
```

### 2.3 파일/디렉토리 상세 정의

| 경로 | 용도 | 생성 시점 | 권한 | 소유자 |
|------|------|----------|------|--------|
| `~/.waiaas/` | 데이터 루트 디렉토리 | `waiaas init` | `700` (rwx------) | 실행 사용자 |
| `config.toml` | 데몬 설정 (TOML 포맷) | `waiaas init` (기본값 생성) | `600` (rw-------) | 실행 사용자 |
| `.master-password` | (v0.5 추가) 마스터 패스워드 파일. `--quickstart`로 자동 생성되거나 `--password-file`로 참조됨 | `waiaas init --quickstart` | `600` (rw-------) | 실행 사용자 |
| `daemon.lock` | [v0.7 보완] flock 기반 인스턴스 잠금 파일. fd 유지 기반 잠금. 내용물은 PID (보조 정보) | `waiaas start` (Step 1) | `644` (rw-r--r--) | 실행 사용자 |
| `daemon.pid` | 데몬 PID (보조 정보, [v0.7 보완] status 명령 표시용으로 격하) | `waiaas start --daemon` | `644` (rw-r--r--) | 실행 사용자 |
| `data/` | SQLite 데이터베이스 디렉토리 | `waiaas init` | `700` (rwx------) | 실행 사용자 |
| `data/waiaas.db` | SQLite 메인 DB (WAL 모드) | 데몬 첫 시작 시 마이그레이션으로 생성 | `600` (rw-------) | 실행 사용자 |
| `data/waiaas.db-wal` | WAL 저널 파일 | SQLite가 WAL 모드 진입 시 자동 생성 | `600` (rw-------) | 실행 사용자 |
| `data/waiaas.db-shm` | 공유 메모리 파일 | SQLite가 WAL 모드 진입 시 자동 생성 | `600` (rw-------) | 실행 사용자 |
| `keystore/` | 암호화된 에이전트 키 파일 | `waiaas init` | `700` (rwx------) | 실행 사용자 |
| `keystore/<agent-id>.json` | 개별 에이전트 키스토어 (AES-256-GCM + Argon2id 암호화) | 에이전트 생성 시 (`POST /v1/agents`) | `600` (rw-------) | 실행 사용자 |
| `logs/` | 데몬 운영 로그 | `waiaas init` | `700` (rwx------) | 실행 사용자 |
| `logs/daemon.log` | 데몬 stdout/stderr 로그 (로테이션 대상) | 데몬 시작 시 | `644` (rw-r--r--) | 실행 사용자 |
| `backups/` | DB 및 키스토어 백업 | `waiaas init` | `700` (rwx------) | 실행 사용자 |
| `backups/waiaas-<ts>.db` | SQLite 백업 (VACUUM INTO) | 수동 또는 스케줄 백업 시 | `600` (rw-------) | 실행 사용자 |
| `drizzle/` | 마이그레이션 메타데이터 | 데몬 첫 시작 시 | `700` (rwx------) | 실행 사용자 |

### 2.4 디렉토리 초기화 (`waiaas init`)

`waiaas init` 커맨드가 수행하는 작업:

```typescript
async function initDataDir(dataDir: string): Promise<void> {
  // 1. 루트 디렉토리 생성
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });

  // 2. 하위 디렉토리 생성
  const dirs = ['data', 'keystore', 'logs', 'backups', 'drizzle'];
  for (const dir of dirs) {
    await fs.mkdir(path.join(dataDir, dir), { recursive: true, mode: 0o700 });
  }

  // 3. 기본 config.toml 생성 (존재하지 않을 때만)
  const configPath = path.join(dataDir, 'config.toml');
  if (!await fileExists(configPath)) {
    await fs.writeFile(configPath, DEFAULT_CONFIG_TOML, { mode: 0o600 });
  }

  // 4. 권한 검증
  await verifyPermissions(dataDir);
}
```

### 2.5 보안 고려사항

- **파일 권한:** 모든 민감 파일(DB, 키스토어, config)은 `600` (소유자만 읽기/쓰기)
- **디렉토리 권한:** 모든 디렉토리는 `700` (소유자만 접근)
- **umask 검증:** `waiaas init` 시 현재 umask가 `0077` 이상인지 경고
- **심볼릭 링크 방지:** 데이터 디렉토리 내 심볼릭 링크 존재 시 거부
- **네트워크 FS 방지:** SQLite는 로컬 파일시스템에서만 안전하게 동작. NFS/SMB 감지 시 경고
- **daemon.pid 경합:** PID 파일 존재 시 해당 프로세스가 실제 실행 중인지 확인 후 시작

---

## 3. TOML 설정 파일 스펙 (config.toml)

### 3.1 설정 로드 순서

설정은 다음 순서로 적용되며, 후순위가 이전을 오버라이드한다:

```
1. 하드코딩 기본값 (코드 내 DEFAULT_CONFIG)
    ↓ 오버라이드
2. config.toml 파일 (smol-toml로 파싱)
    ↓ 오버라이드
3. 환경변수 (WAIAAS_ 접두어)
```

### 3.2 환경변수 매핑 규칙

TOML 섹션과 키는 다음 규칙으로 환경변수에 매핑된다:

```
WAIAAS_{SECTION}_{KEY} -> [section].key
```

| 환경변수 | TOML 키 | 예시 |
|---------|---------|------|
| `WAIAAS_DAEMON_PORT` | `[daemon].port` | `3001` |
| `WAIAAS_DAEMON_LOG_LEVEL` | `[daemon].log_level` | `debug` |
| `WAIAAS_KEYSTORE_ARGON2_MEMORY` | `[keystore].argon2_memory` | `65536` |
| `WAIAAS_RPC_SOLANA_MAINNET` | `[rpc.solana].mainnet` | `https://custom.rpc.com` |
| `WAIAAS_SECURITY_SESSION_TTL` | `[security].session_ttl` | `86400` |
| `WAIAAS_SECURITY_JWT_SECRET` | `[security].jwt_secret` | `a1b2c3...` (64자 hex) |
| `WAIAAS_SECURITY_NONCE_STORAGE` | `[security].nonce_storage` | `"memory"` |
| `WAIAAS_SECURITY_NONCE_CACHE_MAX` | `[security].nonce_cache_max` | `1000` |
| `WAIAAS_SECURITY_NONCE_CACHE_TTL` | `[security].nonce_cache_ttl` | `300` |
| `WAIAAS_SECURITY_RATE_LIMIT_GLOBAL_IP_RPM` | `[security].rate_limit_global_ip_rpm` | `1000` |
| `WAIAAS_SECURITY_RATE_LIMIT_SESSION_RPM` | `[security].rate_limit_session_rpm` | `300` |
| `WAIAAS_SECURITY_RATE_LIMIT_TX_RPM` | `[security].rate_limit_tx_rpm` | `10` |
| `WAIAAS_SECURITY_AUTO_STOP_CONSECUTIVE_FAILURES_THRESHOLD` | `[security.auto_stop].consecutive_failures_threshold` | `3` |
| `WAIAAS_SECURITY_POLICY_DEFAULTS_DELAY_SECONDS` | `[security.policy_defaults].delay_seconds` | `300` |
| `WAIAAS_SECURITY_POLICY_DEFAULTS_APPROVAL_TIMEOUT` | `[security.policy_defaults].approval_timeout` | `3600` |
| `WAIAAS_SECURITY_KILL_SWITCH_RECOVERY_COOLDOWN` | `[security.kill_switch].recovery_cooldown` | `1800` |
| `WAIAAS_SECURITY_KILL_SWITCH_MAX_RECOVERY_ATTEMPTS` | `[security.kill_switch].max_recovery_attempts` | `3` |
| `WAIAAS_WALLETCONNECT_PROJECT_ID` | `[walletconnect].project_id` | `""` |

**특수 환경변수 (TOML에 없는 항목):**

| 환경변수 | 용도 | 예시 |
|---------|------|------|
| `WAIAAS_DATA_DIR` | 데이터 디렉토리 경로 오버라이드 | `~/.waiaas-devnet` |
| `WAIAAS_DAEMON_HOSTNAME` | 바인딩 주소 오버라이드 (Docker 전용: `0.0.0.0`) | `0.0.0.0` |
| `WAIAAS_MASTER_PASSWORD` | 마스터 패스워드 (비대화형 모드) | `my-secure-password` |
| `WAIAAS_MASTER_PASSWORD_FILE` | 마스터 패스워드 파일 경로 | `/run/secrets/master_pw` |

### 3.3 전체 키-값 구조

#### [daemon] 섹션 -- 데몬 서버 설정

| 키 | 타입 | 기본값 | 유효 범위 | 설명 |
|----|------|--------|----------|------|
| `port` | integer | `3100` | 1024-65535 | HTTP 서버 포트 |
| `hostname` | string | `"127.0.0.1"` | `"127.0.0.1"`, `"0.0.0.0"` (Docker 전용) | 바인딩 주소. 기본 localhost. Docker 컨테이너 환경에서 `0.0.0.0` 허용 (환경변수 `WAIAAS_DAEMON_HOSTNAME` 오버라이드) |
| `log_level` | string | `"info"` | `"trace"`, `"debug"`, `"info"`, `"warn"`, `"error"` | 로그 레벨 |
| `log_file` | string | `"logs/daemon.log"` | 상대 경로 (DATA_DIR 기준) 또는 절대 경로 | 로그 파일 경로 |
| `log_max_size` | string | `"50MB"` | `"1MB"` ~ `"1GB"` | 로그 파일 최대 크기 (로테이션 트리거) |
| `log_max_files` | integer | `5` | 1-100 | 보관할 로그 파일 수 |
| `pid_file` | string | `"daemon.pid"` | 상대 경로 (DATA_DIR 기준) 또는 절대 경로 | PID 파일 경로 |
| `shutdown_timeout` | integer | `30` | 5-300 (초) | Graceful shutdown 타임아웃 |
| `dev_mode` | boolean | `false` | true/false | (v0.5 추가) --dev 모드 영구 설정. true 시 고정 패스워드 'waiaas-dev' 사용. 프로덕션 사용 금지. 54-cli-flow-redesign.md 섹션 7 참조 |

#### [keystore] 섹션 -- 키스토어 암호화 설정

| 키 | 타입 | 기본값 | 유효 범위 | 설명 |
|----|------|--------|----------|------|
| `argon2_memory` | integer | `65536` | 32768-1048576 (KiB) | Argon2id 메모리 비용 (기본: 64 MiB) |
| `argon2_time` | integer | `3` | 1-20 | Argon2id 반복 횟수 |
| `argon2_parallelism` | integer | `4` | 1-16 | Argon2id 병렬 스레드 수 |
| `backup_on_rotate` | boolean | `true` | true/false | 키 로테이션 시 이전 키 백업 여부 |

**Note:** Argon2id 기본 파라미터(m=64MiB, t=3, p=4)는 06-CONTEXT.md에서 확정된 값이다. config.toml로 조정 가능하지만, 기본값 미만으로 설정 시 경고를 출력한다.

#### [rpc] 섹션 -- 체인별 RPC 엔드포인트

| 키 | 타입 | 기본값 | 유효 범위 | 설명 |
|----|------|--------|----------|------|
| `[rpc.solana]` | | | | Solana RPC 설정 |
| `.mainnet` | string | `"https://api.mainnet-beta.solana.com"` | URL | Mainnet Beta RPC |
| `.devnet` | string | `"https://api.devnet.solana.com"` | URL | Devnet RPC |
| `.testnet` | string | `"https://api.testnet.solana.com"` | URL | Testnet RPC |
| `[rpc.solana.ws]` | | | | Solana WebSocket 설정 |
| `.mainnet` | string | `"wss://api.mainnet-beta.solana.com"` | URL | Mainnet WebSocket |
| `.devnet` | string | `"wss://api.devnet.solana.com"` | URL | Devnet WebSocket |
| `[rpc.ethereum]` | | | | Ethereum RPC 설정 |
| `.mainnet` | string | `""` | URL | Mainnet RPC (사용자 설정 필수) |
| `.sepolia` | string | `""` | URL | Sepolia Testnet RPC |

#### [database] 섹션 -- SQLite 설정

| 키 | 타입 | 기본값 | 유효 범위 | 설명 |
|----|------|--------|----------|------|
| `path` | string | `"data/waiaas.db"` | 상대 경로 (DATA_DIR 기준) 또는 절대 경로 | DB 파일 경로 |
| `wal_checkpoint_interval` | integer | `300` | 60-3600 (초) | WAL 체크포인트 주기 |
| `busy_timeout` | integer | `5000` | 1000-30000 (ms) | SQLite busy timeout |
| `cache_size` | integer | `64000` | 2000-512000 (KiB, 음수로 전달) | SQLite 페이지 캐시 크기 |
| `mmap_size` | integer | `268435456` | 0-1073741824 (bytes) | 메모리 매핑 크기 (기본: 256 MiB) |

#### [notifications] 섹션 -- 알림 채널 설정 (Phase 8에서 상세화)

> **채널 최소 요구 규칙:** 활성 채널 수와 정책 엔진 4-tier 동작의 관계는 35-notification-architecture.md 구현 노트 참조.

| 키 | 타입 | 기본값 | 유효 범위 | 설명 |
|----|------|--------|----------|------|
| `enabled` | boolean | `false` | true/false | 알림 시스템 활성화 여부 |
| `[notifications.telegram]` | | | | Telegram 알림 |
| `.bot_token` | string | `""` | 문자열 | Bot API 토큰 |
| `.chat_id` | string | `""` | 문자열 | 대상 채팅 ID |
| `[notifications.discord]` | | | | Discord 알림 |
| `.webhook_url` | string | `""` | URL | Webhook URL |
| `[notifications.ntfy]` | | | | ntfy.sh 알림 |
| `.server` | string | `"https://ntfy.sh"` | URL | ntfy 서버 URL |
| `.topic` | string | `""` | 문자열 | 구독 토픽 |

#### [security] 섹션 -- 보안 설정

| 키 | 타입 | 기본값 | 유효 범위 | 설명 |
|----|------|--------|----------|------|
| `session_ttl` | integer | `86400` | 300-604800 (초) | 세션 토큰 유효 기간 — 24시간. Phase 7 SESS-PROTO에서 24시간 기본으로 확정 |
| `jwt_secret` | string | `""` | 64자 hex (256비트) | [v0.7 보완] **초기값 전용.** `waiaas init` 시 `crypto.randomBytes(32).toString('hex')` 자동 생성하여 config에 기록. 이후 DB system_state에서 관리. `waiaas secret rotate` 시 config.toml은 갱신하지 않음. 30-session-token-protocol.md 섹션 2.7.5 참조 |
| `max_sessions_per_agent` | integer | `5` | 1-50 | 에이전트당 최대 동시 세션 수 |
| `max_pending_tx` | integer | `10` | 1-100 | 최대 대기 트랜잭션 수 |
| `nonce_storage` | string | `"memory"` | `"memory"`, `"sqlite"` | [v0.7 보완] Nonce 저장소 타입. `memory`: 인메모리 LRU (기본, 빠름), `sqlite`: SQLite nonces 테이블 (데몬 재시작 후 nonce 유지). SESS-PROTO 섹션 4.2 INonceStore 참조 |
| `nonce_cache_max` | integer | `1000` | 100-10000 | Nonce LRU 캐시 최대 항목 수 (memory 모드에서만 유효. SESS-PROTO 참조) |
| `nonce_cache_ttl` | integer | `300` | 60-600 (초) | Nonce TTL — 5분 |
| `rate_limit_global_ip_rpm` | integer | `1000` | 100-10000 | [v0.7 보완] IP 기반 전역 RPM (Stage 1 globalRateLimit). localhost에서는 전체 요청 상한. 기존 `rate_limit_global_rpm`(100)에서 이름/값 변경. CORE-06 섹션 7 참조 |
| `rate_limit_session_rpm` | integer | `300` | 10-5000 | 세션당 RPM (인증 후) |
| `rate_limit_tx_rpm` | integer | `10` | 1-100 | 거래 전송 RPM |
| `cors_origins` | array of string | `["http://localhost:3100", "http://127.0.0.1:3100"]` | URL 배열 | 허용 CORS origin |

#### [security.auto_stop] 섹션 -- 자동 정지 규칙 설정

| 키 | 타입 | 기본값 | 유효 범위 | 설명 |
|----|------|--------|----------|------|
| `consecutive_failures_threshold` | integer | `3` | 1-20 | 연속 트랜잭션 실패 시 자동 정지 임계값 (AutoStopEngine CONSECUTIVE_FAILURES 규칙, KILL-AUTO-EVM 참조) |

#### [security.policy_defaults] 섹션 -- 정책 기본값

| 키 | 타입 | 기본값 | 유효 범위 | 설명 |
|----|------|--------|----------|------|
| `delay_seconds` | integer | `300` | 60-3600 (초) | DELAY 티어 기본 쿨다운 — 5분. LOCK-MECH에서 확정 |
| `approval_timeout` | integer | `3600` | 300-86400 (초) | APPROVAL 티어 기본 승인 대기 — 1시간. LOCK-MECH에서 확정 |

#### [security.kill_switch] 섹션 -- Kill Switch 설정

| 키 | 타입 | 기본값 | 유효 범위 | 설명 |
|----|------|--------|----------|------|
| `recovery_cooldown` | integer | `1800` | 600-86400 (초) | 복구 최소 쿨다운 — 30분. KILL-AUTO-EVM에서 확정 |
| `max_recovery_attempts` | integer | `3` | 1-10 | 복구 실패 시 최대 재시도 횟수 |

#### [walletconnect] 섹션 -- WalletConnect v2 설정 (v0.5: 선택적 편의 기능)

> **v0.5 변경:** WalletConnect는 "Owner 지갑 연결의 유일한 경로"에서 "모바일 지갑 push 서명의 편의 기능"으로 역할 변경. 미설정 시에도 CLI 수동 서명으로 ownerAuth가 가능하다.

| 키 | 타입 | 기본값 | 유효 범위 | 설명 |
|----|------|--------|----------|------|
| `project_id` | string | `""` | 문자열 | Reown Cloud에서 발급한 WalletConnect projectId. 선택 사항. 미설정 시 WC 기능 비활성 (CLI 수동 서명은 항상 가능) |

**`waiaas init` 안내 메시지 (v0.5 변경):**

```
WalletConnect projectId가 미설정입니다. 모바일 지갑 push 서명을 사용하려면
https://cloud.reown.com 에서 발급하세요.
CLI 수동 서명은 projectId 없이도 사용 가능합니다.
```

### 3.4 전체 기본 config.toml 예시

```toml
# WAIaaS 데몬 설정 파일
# 경로: ~/.waiaas/config.toml
# 문서: https://github.com/waiaas/waiaas/docs/config.md

# ─────────────────────────────────────────
# 데몬 서버 설정
# ─────────────────────────────────────────
[daemon]
port = 3100                        # HTTP 서버 포트 (1024-65535)
hostname = "127.0.0.1"             # 바인딩 주소 (기본: localhost. Docker 환경: WAIAAS_DAEMON_HOSTNAME=0.0.0.0)
log_level = "info"                 # trace, debug, info, warn, error
log_file = "logs/daemon.log"       # 로그 파일 (DATA_DIR 상대 경로)
log_max_size = "50MB"              # 로그 로테이션 크기
log_max_files = 5                  # 보관할 로그 파일 수
pid_file = "daemon.pid"            # PID 파일 (DATA_DIR 상대 경로)
shutdown_timeout = 30              # Graceful shutdown 타임아웃 (초)
dev_mode = false                   # (v0.5 추가) --dev 모드 영구 설정. true 시 고정 패스워드 'waiaas-dev' 사용

# ─────────────────────────────────────────
# 키스토어 암호화 설정
# Argon2id 파라미터 -- 기본값은 1Password급 보안 수준
# 기본값 미만으로 낮추면 경고가 출력됩니다
# ─────────────────────────────────────────
[keystore]
argon2_memory = 65536              # 메모리 비용 (KiB) -- 64 MiB
argon2_time = 3                    # 반복 횟수
argon2_parallelism = 4             # 병렬 스레드 수
backup_on_rotate = true            # 키 로테이션 시 이전 키 백업

# ─────────────────────────────────────────
# 데이터베이스 설정
# ─────────────────────────────────────────
[database]
path = "data/waiaas.db"            # SQLite 파일 경로 (DATA_DIR 상대 경로)
wal_checkpoint_interval = 300      # WAL 체크포인트 주기 (초) -- 5분
busy_timeout = 5000                # SQLite busy timeout (ms)
cache_size = 64000                 # 페이지 캐시 (KiB) -- 64 MiB
mmap_size = 268435456              # 메모리 매핑 (bytes) -- 256 MiB

# ─────────────────────────────────────────
# RPC 엔드포인트
# 체인별 공용 RPC 기본값 제공. 프로덕션에서는 전용 RPC 사용 권장
# ─────────────────────────────────────────
[rpc.solana]
mainnet = "https://api.mainnet-beta.solana.com"
devnet = "https://api.devnet.solana.com"
testnet = "https://api.testnet.solana.com"

[rpc.solana.ws]
mainnet = "wss://api.mainnet-beta.solana.com"
devnet = "wss://api.devnet.solana.com"

[rpc.ethereum]
mainnet = ""                       # 사용 시 설정 필수 (Alchemy, Infura 등)
sepolia = ""                       # 테스트넷

# ─────────────────────────────────────────
# 알림 설정 (Phase 8에서 상세 설계)
# ─────────────────────────────────────────
[notifications]
enabled = false                    # 알림 시스템 활성화 여부

[notifications.telegram]
bot_token = ""                     # Telegram Bot API 토큰
chat_id = ""                       # 대상 채팅 ID

[notifications.discord]
webhook_url = ""                   # Discord Webhook URL

[notifications.ntfy]
server = "https://ntfy.sh"        # ntfy 서버 URL
topic = ""                         # 구독 토픽

# ─────────────────────────────────────────
# 보안 설정
# Phase 7 SESS-PROTO, Phase 8 LOCK-MECH/KILL-AUTO-EVM에서 확정된 값
# ─────────────────────────────────────────
[security]
session_ttl = 86400                # 세션 유효 기간 (초) -- 24시간 (최소 300, 최대 604800)
jwt_secret = ""                    # [v0.7 보완] 초기값 전용. waiaas init 시 32바이트 랜덤 생성하여 config에 기록. 이후 DB system_state에서 관리. waiaas secret rotate 시 config.toml은 갱신하지 않음
max_sessions_per_agent = 5         # 에이전트당 최대 동시 세션
max_pending_tx = 10                # 최대 대기 트랜잭션 수
nonce_storage = "memory"           # [v0.7 보완] Nonce 저장소: "memory" (기본, LRU) 또는 "sqlite" (재시작 후 유지)
nonce_cache_max = 1000             # Nonce LRU 캐시 최대 항목 수 (memory 모드)
nonce_cache_ttl = 300              # Nonce TTL (초) -- 5분
rate_limit_global_ip_rpm = 1000    # [v0.7 보완] IP 기반 전역 RPM (Stage 1 globalRateLimit). 기존 rate_limit_global_rpm=100에서 이름/값 변경
rate_limit_session_rpm = 300       # 세션당 RPM (인증 후)
rate_limit_tx_rpm = 10             # 거래 전송 RPM
cors_origins = [
  "http://localhost:3100",
  "http://127.0.0.1:3100"
]

[security.auto_stop]
consecutive_failures_threshold = 3 # 연속 실패 임계값 (AutoStopEngine CONSECUTIVE_FAILURES 규칙)

[security.policy_defaults]
delay_seconds = 300                # DELAY 티어 기본 쿨다운 (초) -- 5분. 최소 60
approval_timeout = 3600            # APPROVAL 티어 기본 승인 대기 (초) -- 1시간

[security.kill_switch]
recovery_cooldown = 1800           # 복구 최소 쿨다운 (초) -- 30분
max_recovery_attempts = 3          # 복구 실패 시 최대 재시도 횟수

# ─────────────────────────────────────────
# WalletConnect v2 설정 (선택적 편의 기능)
# 미설정 시에도 CLI 수동 서명으로 ownerAuth 가능
# Reown Cloud에서 무료 projectId 발급: https://cloud.reown.com
# ─────────────────────────────────────────
[walletconnect]
project_id = ""                    # 선택. 미설정 시 WC 기능 비활성 (CLI 수동 서명은 항상 가능)
```

### 3.5 설정 로드 구현 패턴

```typescript
import { parse } from 'smol-toml';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';

// Zod 스키마로 설정 검증
const ConfigSchema = z.object({
  daemon: z.object({
    port: z.number().int().min(1024).max(65535).default(3100),
    hostname: z.union([z.literal('127.0.0.1'), z.literal('0.0.0.0')]).default('127.0.0.1'),
    log_level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
    log_file: z.string().default('logs/daemon.log'),
    log_max_size: z.string().default('50MB'),
    log_max_files: z.number().int().min(1).max(100).default(5),
    pid_file: z.string().default('daemon.pid'),
    shutdown_timeout: z.number().int().min(5).max(300).default(30),
    dev_mode: z.boolean().default(false),  // (v0.5 추가) --dev 모드 영구 설정
  }).default({}),
  keystore: z.object({
    argon2_memory: z.number().int().min(32768).max(1048576).default(65536),
    argon2_time: z.number().int().min(1).max(20).default(3),
    argon2_parallelism: z.number().int().min(1).max(16).default(4),
    backup_on_rotate: z.boolean().default(true),
  }).default({}),
  database: z.object({
    path: z.string().default('data/waiaas.db'),
    wal_checkpoint_interval: z.number().int().min(60).max(3600).default(300),
    busy_timeout: z.number().int().min(1000).max(30000).default(5000),
    cache_size: z.number().int().min(2000).max(512000).default(64000),
    mmap_size: z.number().int().min(0).max(1073741824).default(268435456),
  }).default({}),
  rpc: z.object({
    solana: z.object({
      mainnet: z.string().url().default('https://api.mainnet-beta.solana.com'),
      devnet: z.string().url().default('https://api.devnet.solana.com'),
      testnet: z.string().url().default('https://api.testnet.solana.com'),
      ws: z.object({
        mainnet: z.string().url().default('wss://api.mainnet-beta.solana.com'),
        devnet: z.string().url().default('wss://api.devnet.solana.com'),
      }).default({}),
    }).default({}),
    ethereum: z.object({
      mainnet: z.string().default(''),
      sepolia: z.string().default(''),
    }).default({}),
  }).default({}),
  notifications: z.object({
    enabled: z.boolean().default(false),
    telegram: z.object({
      bot_token: z.string().default(''),
      chat_id: z.string().default(''),
    }).default({}),
    discord: z.object({
      webhook_url: z.string().default(''),
    }).default({}),
    ntfy: z.object({
      server: z.string().url().default('https://ntfy.sh'),
      topic: z.string().default(''),
    }).default({}),
  }).default({}),
  security: z.object({
    session_ttl: z.number().int().min(300).max(604800).default(86400),
    jwt_secret: z.string().min(32, 'JWT secret은 최소 32자 이상').default(''),
    max_sessions_per_agent: z.number().int().min(1).max(50).default(5),
    max_pending_tx: z.number().int().min(1).max(100).default(10),
    nonce_storage: z.enum(['memory', 'sqlite']).default('memory'),  // [v0.7 보완] nonce 저장소 타입
    nonce_cache_max: z.number().int().min(100).max(10000).default(1000),
    nonce_cache_ttl: z.number().int().min(60).max(600).default(300),
    rate_limit_global_ip_rpm: z.number().int().min(100).max(10000).default(1000),  // [v0.7 보완] 이름/값 변경
    rate_limit_session_rpm: z.number().int().min(10).max(5000).default(300),
    rate_limit_tx_rpm: z.number().int().min(1).max(100).default(10),
    cors_origins: z.array(z.string()).default(['http://localhost:3100', 'http://127.0.0.1:3100']),
    auto_stop: z.object({
      consecutive_failures_threshold: z.number().int().min(1).max(20).default(3),
    }).default({}),
    policy_defaults: z.object({
      delay_seconds: z.number().int().min(60).max(3600).default(300),
      approval_timeout: z.number().int().min(300).max(86400).default(3600),
    }).default({}),
    kill_switch: z.object({
      recovery_cooldown: z.number().int().min(600).max(86400).default(1800),
      max_recovery_attempts: z.number().int().min(1).max(10).default(3),
    }).default({}),
  }).default({}),
  // WalletConnect v2 -- 선택적 편의 기능
  // project_id 미설정 시 WC push 서명 비활성. CLI 수동 서명은 항상 가능.
  walletconnect: z.object({
    project_id: z.string().default(''),
  }).default({}),
});

type Config = z.infer<typeof ConfigSchema>;

async function loadConfig(dataDir: string): Promise<Config> {
  // 1. 하드코딩 기본값
  let config: Record<string, unknown> = {};

  // 2. config.toml 파일 로드
  const configPath = path.join(dataDir, 'config.toml');
  try {
    const tomlContent = await readFile(configPath, 'utf-8');
    config = parse(tomlContent);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    // config.toml 없으면 기본값 사용
  }

  // 3. 환경변수 오버라이드
  config = applyEnvOverrides(config);

  // 4. Zod 검증 + 기본값 적용
  return ConfigSchema.parse(config);
}

function applyEnvOverrides(config: Record<string, unknown>): Record<string, unknown> {
  const PREFIX = 'WAIAAS_';
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith(PREFIX) || key === 'WAIAAS_DATA_DIR'
        || key === 'WAIAAS_MASTER_PASSWORD' || key === 'WAIAAS_MASTER_PASSWORD_FILE') {
      continue;  // 특수 환경변수는 config에 반영하지 않음
    }

    // WAIAAS_DAEMON_PORT -> ['daemon', 'port']
    const parts = key.slice(PREFIX.length).toLowerCase().split('_');
    if (parts.length < 2) continue;

    const section = parts[0];
    const field = parts.slice(1).join('_');

    if (!config[section]) config[section] = {};
    (config[section] as Record<string, unknown>)[field] = parseEnvValue(value!);
  }
  return config;
}

function parseEnvValue(value: string): unknown {
  // boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // number
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') return num;

  // JSON array (CORS origins 등)
  if (value.startsWith('[')) {
    try { return JSON.parse(value); } catch { /* fall through */ }
  }

  // string
  return value;
}
```

### 3.6 hostname 보안 정책

`[daemon].hostname`의 기본값은 `"127.0.0.1"`이며, Docker 컨테이너 환경에서만 `"0.0.0.0"` 바인딩을 허용한다. 이는 C-04 (Localhost 0.0.0.0 Day) 피트폴 방지를 위한 설계이다.

```typescript
// hostname은 Zod 스키마에서 z.union으로 제한
hostname: z.union([
  z.literal('127.0.0.1'),
  z.literal('0.0.0.0'),
]).default('127.0.0.1'),
// 환경변수 오버라이드: WAIAAS_DAEMON_HOSTNAME
```

> **Docker 전용 경고**: `0.0.0.0` 바인딩은 Docker 컨테이너 환경에서만 사용해야 한다.
> 컨테이너 내부에서 `0.0.0.0` 바인딩은 컨테이너의 모든 네트워크 인터페이스에서 접근 허용을 의미한다.
> 반드시 Docker 포트 매핑에서 `127.0.0.1:3100:3100` 형식을 사용하여 호스트 측 노출을 localhost로 제한해야 한다.
> `0.0.0.0:3100:3100` (전체 노출) 또는 `3100:3100` (기본 0.0.0.0)은 보안 위험.

외부 네트워크에서 접근이 필요한 경우 리버스 프록시(nginx, Caddy)를 사용해야 한다.

---

## 4. v0.1 대비 변경 사항

| 항목 | v0.1 (ARCH-02) | v0.2 (CORE-01) |
|------|---------------|----------------|
| 패키지 구조 | core, cloud, selfhost, api | core, daemon, adapters/solana, adapters/evm, cli, sdk, mcp |
| 키 관리 | AWS KMS + Nitro Enclave | 로컬 키스토어 (sodium-native + Argon2id) |
| 데이터베이스 | PostgreSQL (RDS/Local) | SQLite (better-sqlite3, WAL 모드) |
| 캐시 | Redis (ElastiCache) | lru-cache (in-memory) |
| HTTP 프레임워크 | Fastify | Hono + @hono/node-server |
| ORM | Prisma | Drizzle ORM |
| 설정 관리 | 환경변수 (.env) | TOML + 환경변수 오버라이드 |
| 배포 | Docker Compose + AWS EC2 | 로컬 데몬 + Tauri 사이드카 |
| 멀티시그 | Squads Protocol | 제거 (로컬 정책 엔진) |
| CLI | 없음 | waiaas init/start/stop/status |

---

## 4b. v0.5 Owner 모델 변경 노트

> **v0.5 업데이트 (2026-02-07):** 인증 모델 재설계에 따른 config.toml 변경사항.

### Owner 개념의 이동

v0.5에서 Owner 개념이 **config.toml(데몬 전역)**에서 **agents 테이블(에이전트별)**로 이동했다:

| 항목 | v0.2 | v0.5 |
|------|------|------|
| Owner 주소 저장 | `owner_wallets` 테이블 (전역 단일 Owner) | `agents.owner_address` 컬럼 (에이전트별) |
| config.toml [owner] 섹션 | 향후 추가 예정이었으나 미구현 | 명시적으로 제거 (불필요) |
| WalletConnect 역할 | Owner 지갑 연결의 유일한 경로 | 모바일 지갑 push 서명의 편의 기능 |
| WC 미설정 시 | Owner 연결 불가 (ownerAuth 차단) | CLI 수동 서명으로 ownerAuth 가능 |

### config.toml 변경 요약

1. **[owner] 섹션 제거:** config.toml에는 `[owner]` 섹션이 원래 존재하지 않았으나, v0.2 설계에서 향후 추가가 검토되었다. v0.5에서 Owner가 에이전트별 속성이 되면서 데몬 전역 설정에 Owner 관련 항목이 불필요해졌다.

2. **[walletconnect] 섹션 선택적 전환:** `project_id`가 "필수"에서 "선택"으로 변경. 미설정 시에도 CLI 수동 서명으로 ownerAuth가 가능하다.

3. **waiaas init 안내 메시지 변경:**
   - v0.2: `"WalletConnect projectId가 설정되지 않았습니다. Owner 지갑 연결을 위해 https://cloud.reown.com 에서 발급하세요."`
   - v0.5: `"WalletConnect projectId가 미설정입니다. 모바일 지갑 push 서명을 사용하려면 https://cloud.reown.com 에서 발급하세요. CLI 수동 서명은 projectId 없이도 사용 가능합니다."`

### 참조 문서

- 52-auth-model-redesign.md -- masterAuth/ownerAuth/sessionAuth 3-tier 인증 아키텍처
- 25-sqlite-schema.md (v0.5 업데이트) -- agents.owner_address NOT NULL, wallet_connections 테이블
- 34-owner-wallet-connection.md -- WalletConnect v2 프로토콜 (세션 관리는 유지, 인증 역할만 제거)
- 54-cli-flow-redesign.md (v0.5) -- CLI 커맨드 재설계 (init/agent create/session create/--quickstart/--dev)

---

## 5. 요구사항 매핑

| 요구사항 | 커버리지 |
|---------|---------|
| CLI-01 (waiaas init) | 섹션 2.4 -- 데이터 디렉토리 초기화 절차 |
| CLI-04 (npm 글로벌 설치) | 섹션 1.5 -- @waiaas/cli의 bin 엔트리 |
| KEYS-01 (키스토어 경로) | 섹션 2.2 -- `keystore/<agent-id>.json` |
| API-01 (localhost 전용) | 섹션 3.6 -- hostname 보안 강제 |
| API-06 (OpenAPI 자동 생성) | 섹션 1.5 -- daemon의 @hono/zod-openapi 의존성 |
| OWNR-02 (config.toml Owner 개념 제거) | 섹션 3.3 [walletconnect] 선택적 전환 + 섹션 4b Owner 모델 변경 노트 |

---

*문서 ID: CORE-01*
*작성일: 2026-02-05*
*v0.5 업데이트: 2026-02-07*
*Phase: 06-core-architecture-design*
*상태: 완료*
