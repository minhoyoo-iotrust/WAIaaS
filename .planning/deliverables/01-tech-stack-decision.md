# 권장 기술 스택 최종 확정 문서 (TECH-01)

**작성일:** 2026-02-04
**버전:** 1.0
**상태:** 확정

---

## 1. 개요

### 1.1 문서 목적

본 문서는 WAIaaS(Wallet-as-a-Service for AI Agents) 프로젝트의 권장 기술 스택을 최종 확정한다. 이 문서의 결정 사항은 Phase 2(핵심 인프라)부터 Phase 5(MCP 통합)까지 모든 구현 단계의 기술적 기반이 된다.

### 1.2 결정 범위

본 문서에서 확정하는 기술 영역:
- 프로그래밍 언어 및 런타임
- 백엔드 프레임워크
- 데이터베이스 및 ORM
- 모노레포 도구 (패키지 매니저, 빌드 시스템)
- 키 관리 프로바이더
- 클라우드 인프라
- 테스트 프레임워크
- 코드 품질 도구

### 1.3 결정 원칙

기술 선택 시 적용한 원칙:
1. **Solana 생태계 호환성**: Solana SDK 및 에이전트 프레임워크와의 원활한 통합
2. **타입 안전성**: 금융 서비스에 적합한 컴파일 타임 에러 검출
3. **성능**: 저지연 API 응답 및 높은 처리량
4. **개발자 경험**: 풍부한 문서, 활발한 커뮤니티, 디버깅 용이성
5. **보안**: 검증된 라이브러리 사용, 자체 암호화 구현 금지

---

## 2. 권장 기술 스택

### 2.1 언어/런타임

| 구분 | 선택 기술 | 버전 | 비고 |
|------|----------|------|------|
| 언어 | TypeScript | 5.x | ES2023 타겟 |
| 런타임 | Node.js | 22 LTS | 2024-10 출시, 2027-04까지 LTS |
| 패키지 형식 | ESM | - | CommonJS 레거시 지원 최소화 |

**TypeScript 설정 (tsconfig.json):**
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist"
  }
}
```

### 2.2 백엔드 프레임워크

| 구분 | 선택 기술 | 버전 |
|------|----------|------|
| HTTP 서버 | Fastify | 5.x |
| CORS | @fastify/cors | latest |
| 보안 헤더 | @fastify/helmet | latest |
| 속도 제한 | @fastify/rate-limit | latest |
| 스키마 검증 | zod | 3.x |
| JWT 처리 | jose | latest |

### 2.3 데이터베이스

| 구분 | 선택 기술 | 버전 | 용도 |
|------|----------|------|------|
| 주 데이터베이스 | PostgreSQL | 16.x | 지갑, 거래, 정책 데이터 |
| ORM | Prisma | 6.x | 타입 안전 쿼리, 마이그레이션 |
| 캐시/세션 | Redis | 7.x | 임시 데이터, 속도 제한 상태 |
| Redis 클라이언트 | ioredis | 5.x | 100% TypeScript, 클러스터 지원 |

### 2.4 모노레포 도구

| 구분 | 선택 기술 | 버전 |
|------|----------|------|
| 패키지 매니저 | pnpm | 9.x |
| 빌드 시스템 | Turborepo | 2.x |
| 번들러 | esbuild | latest (Turborepo 내장) |

### 2.5 키 관리

| 구분 | 선택 기술 | 버전 |
|------|----------|------|
| 키 관리 프로바이더 | Turnkey | SDK latest |
| 서버 SDK | @turnkey/sdk-server | latest |
| Solana 통합 | @turnkey/solana | latest |

### 2.6 클라우드 인프라

| 구분 | 선택 기술 | 비고 |
|------|----------|------|
| 클라우드 프로바이더 | AWS | Turnkey 동일 인프라 |
| 컨테이너 오케스트레이션 | ECS Fargate 또는 EKS | 서버리스 우선 |
| 데이터베이스 호스팅 | Amazon RDS (PostgreSQL) | Multi-AZ 권장 |
| 캐시 호스팅 | Amazon ElastiCache (Redis) | 클러스터 모드 |

### 2.7 테스트 프레임워크

| 구분 | 선택 기술 | 버전 |
|------|----------|------|
| 테스트 러너 | Vitest | latest |
| 통합 테스트 | Vitest + Supertest | latest |
| E2E 테스트 (선택) | Playwright | latest |

### 2.8 코드 품질

| 구분 | 선택 기술 | 버전 |
|------|----------|------|
| 린터 | ESLint | 9.x (Flat Config) |
| 포매터 | Prettier | 3.x |
| Git 훅 | Husky + lint-staged | latest |
| 커밋 규칙 | Conventional Commits | - |

---

## 3. 선택 근거

### 3.1 TypeScript (언어)

**비교 대상:** JavaScript, Rust, Go, Python

**선택 이유:**
1. **Solana 생태계 호환**: @solana/kit, solana-agent-kit, Vercel AI SDK 모두 TypeScript 우선 지원
2. **타입 안전성**: 금융 로직에서 런타임 에러 방지 (null 체크, 타입 추론)
3. **풀스택 일관성**: 프론트엔드(대시보드) 개발 시 동일 언어 사용 가능
4. **개발 생산성**: IDE 자동완성, 리팩토링 지원, 풍부한 타입 정의

**트레이드오프 인정:**
- Rust 대비 런타임 성능은 낮음 (CPU 집약적 작업에서)
- 단, 본 프로젝트는 I/O 바운드 작업이 대부분이므로 Node.js 비동기 모델이 적합

### 3.2 Fastify (백엔드 프레임워크)

**비교 대상:** Express, NestJS, Hono, Elysia

| 프레임워크 | 요청/초 | 지연시간 | JSON 스키마 | TypeScript |
|-----------|--------|---------|------------|-----------|
| Fastify | ~77,000 | 12.3ms | 내장 | 완벽 |
| Express | ~14,000 | 62.5ms | 미지원 | 수동 설정 |
| NestJS | ~25,000 | 35ms | 데코레이터 | 완벽 |
| Hono | ~90,000 | 10ms | 없음 | 완벽 |

**선택 이유:**
1. **성능**: Express 대비 2.7배 높은 처리량, 5배 낮은 지연시간
2. **JSON 스키마 검증 내장**: API 입력 검증을 플러그인 없이 처리
3. **플러그인 아키텍처**: 캡슐화된 컨텍스트로 의존성 주입 용이
4. **성숙한 생태계**: 보안(@fastify/helmet), CORS, 속도 제한 공식 플러그인

**트레이드오프 인정:**
- NestJS 대비 구조화된 아키텍처 강제 없음 (자유도 높음 = 일관성 관리 필요)
- Hono 대비 약간 낮은 성능 (단, Hono는 생태계가 아직 미성숙)

### 3.3 PostgreSQL + Prisma (데이터베이스)

**비교 대상 (DB):** MySQL, MongoDB, CockroachDB
**비교 대상 (ORM):** TypeORM, Drizzle, Kysely

**선택 이유:**
1. **ACID 준수 필수**: 금융 거래 데이터는 원자성/일관성 보장 필수
2. **JSON 컬럼 지원**: 정책(policy) 같은 반구조화 데이터 저장 가능
3. **Prisma 타입 추론**: 스키마에서 TypeScript 타입 자동 생성
4. **마이그레이션 관리**: `prisma migrate`로 스키마 버전 관리

**트레이드오프 인정:**
- MongoDB 대비 스키마 유연성 낮음 (하지만 금융 데이터에 스키마 강제는 장점)
- Drizzle 대비 SQL 직접 제어 낮음 (하지만 대부분의 쿼리에 충분)

### 3.4 pnpm + Turborepo (모노레포)

**비교 대상:** npm workspaces, yarn workspaces, Nx, Lerna

**선택 이유:**
1. **디스크 효율성**: pnpm의 하드 링크로 중복 패키지 저장 방지 (50-70% 절약)
2. **빌드 캐싱**: Turborepo 원격 캐싱으로 CI 빌드 시간 90% 단축 가능
3. **태스크 병렬화**: 의존 그래프 기반 최적화된 빌드 순서
4. **단순성**: Nx 대비 설정이 간단하고 학습 곡선 낮음

**트레이드오프 인정:**
- Nx 대비 고급 기능(영향 분석, 분산 캐싱) 부족 (단, 현재 규모에 불필요)
- pnpm 엄격한 의존성 관리로 일부 패키지 호환성 이슈 가능

### 3.5 Turnkey (키 관리)

**비교 대상:** Crossmint Agent Wallets, Privy, Magic, 자체 HSM

**선택 이유:**
1. **TEE 기반 보안**: AWS Nitro Enclaves에서 프라이빗 키 격리
2. **Solana Policy Engine**: 거래 정책을 Turnkey 레벨에서 강제 가능
3. **50-100ms 서명 지연**: 실시간 거래에 적합한 성능
4. **성숙한 문서/예제**: Solana 통합 가이드, SDK 예제 풍부

**트레이드오프 인정:**
- Crossmint 대비 완전 비수탁(Dual-Key Smart Wallet)은 아님
- 단, Turnkey도 사용자가 복구 키 보관 가능 (반수탁 모델)
- Phase 2에서 두 프로바이더 PoC 비교 후 필요시 재평가

### 3.6 AWS (클라우드 인프라)

**비교 대상:** GCP, Azure, Cloudflare

**선택 이유:**
1. **Turnkey 동일 인프라**: Turnkey가 AWS Nitro Enclaves 사용, 지연시간 최소화
2. **서비스 완성도**: RDS, ElastiCache, ECS/EKS 모두 프로덕션 검증됨
3. **한국 리전**: ap-northeast-2 (서울) 리전 가용

**트레이드오프 인정:**
- GCP 대비 Kubernetes(EKS) 관리 복잡 (하지만 ECS Fargate로 시작하면 무관)
- 벤더 락인 우려 (하지만 컨테이너 기반 배포로 이식성 확보)

---

## 4. 모노레포 구조

### 4.1 디렉토리 구조

```
WAIaaS/
├── apps/
│   ├── api/                    # Fastify REST API 서버
│   │   ├── src/
│   │   │   ├── routes/         # API 라우트 (지갑, 거래, 정책)
│   │   │   ├── services/       # 비즈니스 로직
│   │   │   ├── middleware/     # 인증, 검증
│   │   │   └── plugins/        # Fastify 플러그인
│   │   ├── test/
│   │   └── package.json
│   └── mcp-server/             # MCP 프로토콜 서버 (Phase 5)
│       └── package.json
├── packages/
│   ├── core/                   # 공유 도메인 로직
│   │   ├── wallet/             # 지갑 생성, 관리
│   │   ├── transaction/        # 거래 처리
│   │   └── policy/             # 정책 검증
│   ├── solana/                 # Solana 블록체인 어댑터
│   │   ├── rpc/                # RPC 클라이언트 래퍼
│   │   ├── transaction/        # TX 구성, 시뮬레이션
│   │   └── token/              # SPL 토큰 유틸리티
│   ├── key-management/         # Turnkey 통합
│   │   ├── signer/             # 서명 로직
│   │   └── policy/             # 서명 정책
│   ├── database/               # Prisma 스키마 및 클라이언트
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── client/             # 생성된 클라이언트 래퍼
│   └── shared/                 # 공유 유틸리티
│       ├── types/              # TypeScript 타입 정의
│       ├── errors/             # 에러 클래스
│       └── config/             # 환경 설정
├── turbo.json                  # Turborepo 설정
├── pnpm-workspace.yaml         # pnpm 워크스페이스
├── tsconfig.json               # 루트 TypeScript 설정
├── .eslintrc.js                # ESLint 설정
└── .prettierrc                 # Prettier 설정
```

### 4.2 패키지 의존 관계

```
apps/api
  └── packages/core
        ├── packages/solana
        ├── packages/key-management
        └── packages/database
              └── packages/shared

apps/mcp-server
  └── packages/core
        └── (동일 의존성)
```

### 4.3 pnpm-workspace.yaml

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 4.4 turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "inputs": ["src/**/*.ts", "test/**/*.ts"]
    },
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    },
    "db:generate": {
      "cache": false
    },
    "db:push": {
      "cache": false
    }
  }
}
```

---

## 5. 개발 환경 설정

### 5.1 사전 요구사항

- Node.js 22 LTS
- pnpm 9.x (`npm install -g pnpm`)
- Docker Desktop (PostgreSQL, Redis 로컬 실행용)
- Git

### 5.2 초기 설정 명령어

```bash
# 1. 저장소 클론
git clone <repository-url>
cd WAIaaS

# 2. pnpm 설치 (없는 경우)
npm install -g pnpm

# 3. 의존성 설치
pnpm install

# 4. 환경 변수 설정
cp .env.example .env.local

# 5. 로컬 데이터베이스 실행
docker-compose up -d postgres redis

# 6. Prisma 클라이언트 생성
pnpm --filter @waiaas/database db:generate

# 7. 데이터베이스 마이그레이션
pnpm --filter @waiaas/database db:push

# 8. 개발 서버 실행
pnpm dev
```

### 5.3 환경 변수 템플릿 (.env.example)

```bash
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/waiaas?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# Turnkey (Phase 2에서 발급)
TURNKEY_API_PUBLIC_KEY=""
TURNKEY_API_PRIVATE_KEY=""
TURNKEY_ORG_ID=""

# Solana RPC (Phase 2에서 설정)
HELIUS_API_KEY=""
SOLANA_NETWORK="devnet"

# API
API_PORT=3000
ALLOWED_ORIGINS="http://localhost:3001"

# JWT
JWT_SECRET="development-secret-change-in-production"
JWT_EXPIRES_IN="24h"
```

### 5.4 Docker Compose (로컬 개발)

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: waiaas
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

---

## 6. 핵심 의존성 요약

### 6.1 프로덕션 의존성

```bash
# 런타임 필수
pnpm add fastify @fastify/cors @fastify/rate-limit @fastify/helmet
pnpm add @solana/kit @solana/web3.js
pnpm add @turnkey/sdk-server @turnkey/solana
pnpm add @prisma/client ioredis zod jose

# AI 에이전트 통합
pnpm add solana-agent-kit
pnpm add @solana-agent-kit/plugin-token
pnpm add @solana-agent-kit/plugin-defi

# AI SDK
pnpm add ai @langchain/core
```

### 6.2 개발 의존성

```bash
pnpm add -D typescript @types/node
pnpm add -D prisma
pnpm add -D turbo vitest
pnpm add -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
pnpm add -D prettier
pnpm add -D husky lint-staged
```

---

## 7. 다음 단계

본 문서의 기술 스택을 기반으로:

1. **Phase 1 완료**: Solana 개발 환경 문서(TECH-02) 작성
2. **Phase 2 시작**: 모노레포 초기화, Prisma 스키마 설계, Turnkey 계정 설정
3. **Phase 3**: 지갑 생성 API, 거래 처리 로직 구현
4. **Phase 4**: 정책 엔진, human-in-the-loop 구현
5. **Phase 5**: MCP 서버 통합

---

## 부록: 버전 참조

| 기술 | 현재 버전 | 확인일 | 유효 기간 |
|------|----------|--------|----------|
| @solana/kit | 3.0.x | 2026-02-04 | 2026-03-04 |
| Fastify | 5.x | 2026-02-04 | 2026-06-04 |
| Prisma | 6.x | 2026-02-04 | 2026-06-04 |
| Turborepo | 2.x | 2026-02-04 | 2026-06-04 |
| Turnkey SDK | latest | 2026-02-04 | 2026-03-04 |
| Node.js | 22 LTS | 2026-02-04 | 2027-04-01 |
| TypeScript | 5.x | 2026-02-04 | 2026-12-04 |

*Solana 생태계(@solana/kit, Turnkey)는 빠른 변화로 30일마다 검토 권장*
