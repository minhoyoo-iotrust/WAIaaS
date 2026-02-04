# 데이터베이스 및 캐싱 전략 (TECH-03)

**작성일:** 2026-02-04
**버전:** 1.0
**상태:** 승인됨

---

## 1. 개요

### 1.1 문서 목적

이 문서는 WAIaaS(Wallet-as-a-Service for AI Agents) 프로젝트의 데이터베이스 및 캐싱 아키텍처를 정의합니다. Phase 3 시스템 아키텍처 설계와 Phase 4 구현의 기반이 됩니다.

### 1.2 WAIaaS 데이터 특성

WAIaaS는 다음과 같은 데이터 특성을 갖습니다:

| 특성 | 설명 | 영향 |
|------|------|------|
| **금융 데이터** | 지갑 잔액, 거래 기록 | ACID 준수 필수, 데이터 무결성 최우선 |
| **관계형 구조** | Owner-Agent-Wallet-Policy-Transaction 계층 | 정규화된 스키마, 외래 키 제약 |
| **정책 데이터** | 거래 한도, 화이트리스트 | 유연한 스키마 (JSON), 빈번한 읽기 |
| **실시간 상태** | 지갑 잔액, Rate limit | 저지연 조회 필요, 캐싱 필수 |
| **감사 추적** | 모든 거래 기록 | 불변성, 시계열 쿼리 |

### 1.3 핵심 요구사항

1. **데이터 무결성**: 금융 거래의 원자성 보장
2. **저지연 조회**: 잔액/정책 조회 < 50ms (캐시 히트)
3. **확장성**: 일일 100만+ 거래 처리 가능한 구조
4. **복구 가능성**: Point-in-Time Recovery 지원

---

## 2. 데이터베이스 전략

### 2.1 선택: PostgreSQL 15+

WAIaaS의 메인 데이터베이스로 **PostgreSQL 15+**를 선택합니다.

### 2.2 선택 근거

#### 2.2.1 금융 데이터의 ACID 준수

```
ACID = Atomicity + Consistency + Isolation + Durability
```

- **Atomicity**: 거래 생성과 잔액 업데이트가 하나의 트랜잭션으로 처리
- **Consistency**: 외래 키 제약으로 고아 레코드 방지
- **Isolation**: 동시 거래 처리 시 데이터 정합성 유지
- **Durability**: WAL(Write-Ahead Logging)로 장애 복구

PostgreSQL은 금융 서비스에서 검증된 ACID 완전 준수 데이터베이스입니다.

#### 2.2.2 관계형 데이터 모델링

WAIaaS의 핵심 엔티티는 명확한 관계를 갖습니다:

```
Owner (1) ----< Agent (N) ----< Wallet (N) ----< Transaction (N)
                                    |
                               WalletPolicy (1)
```

- Owner가 여러 Agent를 소유
- Agent가 여러 Wallet에 접근 (권한 기반)
- Wallet은 하나의 Policy와 여러 Transaction을 가짐

이러한 관계형 데이터는 PostgreSQL의 JOIN, 외래 키, 제약 조건으로 효과적으로 모델링됩니다.

#### 2.2.3 JSON 컬럼 지원

정책 데이터의 유연성을 위해 PostgreSQL의 `jsonb` 타입을 활용합니다:

```sql
-- 유연한 정책 메타데이터
CREATE TABLE wallet_policy (
    id UUID PRIMARY KEY,
    wallet_id UUID REFERENCES wallet(id),
    daily_limit DECIMAL(20, 9),
    -- 유연한 추가 설정은 JSON으로
    metadata JSONB DEFAULT '{}',
    -- JSON 필드에 인덱스 가능
    CONSTRAINT valid_metadata CHECK (jsonb_typeof(metadata) = 'object')
);

-- JSON 내부 필드 인덱싱
CREATE INDEX idx_policy_metadata_type
ON wallet_policy USING GIN ((metadata -> 'allowed_programs'));
```

이를 통해 스키마 변경 없이 새로운 정책 속성을 추가할 수 있습니다.

#### 2.2.4 Prisma와의 최적 호환성

Prisma ORM은 PostgreSQL을 1급(first-class) 지원합니다:

- 완전한 타입 추론
- 네이티브 PostgreSQL 타입 지원 (UUID, Decimal, JSON)
- 고급 쿼리 기능 (전문 검색, 배열 필터링)
- 최적화된 마이그레이션 도구

### 2.3 대안 비교

| 데이터베이스 | 장점 | 단점 | 적합도 |
|-------------|------|------|--------|
| **PostgreSQL** | ACID 완전 준수, 관계형 모델링, JSON 지원, Prisma 최적화 | 수평 확장 제한적 | **선택됨** |
| MongoDB | 스키마 유연성, 수평 확장 용이 | ACID 제한적 (multi-document), 관계 쿼리 비효율 | 부적합 |
| CockroachDB | 분산 SQL, PostgreSQL 호환 | 운영 복잡성, 비용, 지연 시간 | 과도함 |
| MySQL | 널리 사용, 성숙함 | JSON 기능 열등, Prisma 최적화 낮음 | 차선책 |

**결론**: 금융 데이터의 무결성과 관계형 모델이 중요하므로 PostgreSQL이 최적.

### 2.4 PostgreSQL 구성

#### 2.4.1 개발 환경

```yaml
# docker-compose.dev.yml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: wai_dev
      POSTGRES_PASSWORD: dev_password
      POSTGRES_DB: wai_development
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

#### 2.4.2 프로덕션 환경

- **AWS RDS PostgreSQL** 또는 **Amazon Aurora PostgreSQL** 권장
- 인스턴스: `db.r6g.large` (시작점, 트래픽에 따라 조정)
- 멀티 AZ 배포로 고가용성 확보
- 암호화: 저장 시 암호화 활성화 (KMS)
- 파라미터 그룹: `shared_buffers`, `work_mem` 최적화

---

## 3. ORM 전략

### 3.1 선택: Prisma 6.x

데이터베이스 접근 레이어로 **Prisma ORM 6.x**를 선택합니다.

### 3.2 선택 근거

#### 3.2.1 타입 안전 쿼리

Prisma는 스키마에서 TypeScript 타입을 자동 생성합니다:

```typescript
// Prisma가 생성한 타입으로 완전한 타입 안전성
const wallet = await prisma.wallet.findUnique({
  where: { id: walletId },
  include: {
    policy: true,
    transactions: {
      orderBy: { createdAt: 'desc' },
      take: 10
    }
  }
});

// wallet.policy가 WalletPolicy | null 타입으로 추론됨
// wallet.transactions가 Transaction[] 타입으로 추론됨
```

#### 3.2.2 마이그레이션 관리

Prisma Migrate는 스키마 변경을 안전하게 관리합니다:

- 선언적 스키마 정의 (`schema.prisma`)
- 자동 마이그레이션 SQL 생성
- 마이그레이션 히스토리 추적
- 롤백 지원

#### 3.2.3 PostgreSQL 최적화

Prisma는 PostgreSQL 네이티브 기능을 완전히 지원합니다:

- `@db.Decimal(20, 9)` - 정밀한 금융 계산
- `@db.Uuid` - 네이티브 UUID 타입
- `Json` 필드 타입 - JSONB 매핑
- 배열 타입 - `String[]`, `Int[]`
- Full-text 검색 지원

### 3.3 스키마 설계 방향

01-RESEARCH.md의 예시 스키마를 기반으로 핵심 엔티티를 정의합니다:

```prisma
// packages/database/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// === 핵심 엔티티 ===

model Owner {
  id        String   @id @default(uuid()) @db.Uuid
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  agents  Agent[]
  wallets Wallet[]

  @@map("owners")
}

model Agent {
  id          String   @id @default(uuid()) @db.Uuid
  ownerId     String   @db.Uuid
  name        String
  description String?
  apiKeyHash  String   @unique  // 에이전트 인증용
  status      AgentStatus @default(ACTIVE)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  owner   Owner    @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  wallets Wallet[]

  @@index([ownerId])
  @@index([status])
  @@map("agents")
}

model Wallet {
  id              String   @id @default(uuid()) @db.Uuid
  address         String   @unique  // Solana 공개 주소
  ownerId         String   @db.Uuid
  agentId         String?  @db.Uuid
  turnkeyWalletId String   @unique  // Turnkey 내부 ID
  label           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  owner        Owner          @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  agent        Agent?         @relation(fields: [agentId], references: [id], onDelete: SetNull)
  policy       WalletPolicy?
  transactions Transaction[]

  @@index([ownerId])
  @@index([agentId])
  @@index([address])
  @@map("wallets")
}

model WalletPolicy {
  id               String   @id @default(uuid()) @db.Uuid
  walletId         String   @unique @db.Uuid
  dailyLimit       Decimal  @db.Decimal(20, 9)  // SOL 단위
  perTxLimit       Decimal  @db.Decimal(20, 9)  // 건당 한도
  allowedAssets    String[] // SPL 토큰 민트 주소 (빈 배열 = SOL만)
  allowedAddresses String[] // 화이트리스트 수신 주소
  requiresApproval Boolean  @default(false)  // human-in-the-loop
  metadata         Json     @default("{}")  // 확장 가능한 정책 설정
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  wallet Wallet @relation(fields: [walletId], references: [id], onDelete: Cascade)

  @@map("wallet_policies")
}

model Transaction {
  id          String    @id @default(uuid()) @db.Uuid
  walletId    String    @db.Uuid
  signature   String    @unique  // Solana TX 서명
  type        TxType
  amount      Decimal?  @db.Decimal(20, 9)  // SOL/토큰 수량
  asset       String?   // 민트 주소 (null = SOL)
  destination String?   // 수신 주소
  status      TxStatus  @default(PENDING)
  errorMsg    String?
  metadata    Json      @default("{}")  // 추가 TX 정보
  createdAt   DateTime  @default(now())
  confirmedAt DateTime?

  wallet Wallet @relation(fields: [walletId], references: [id], onDelete: Cascade)

  @@index([walletId, createdAt])
  @@index([signature])
  @@index([status])
  @@map("transactions")
}

// === Enums ===

enum AgentStatus {
  ACTIVE
  SUSPENDED
  REVOKED
}

enum TxType {
  TRANSFER      // SOL/토큰 전송
  SWAP          // DEX 스왑
  STAKE         // 스테이킹
  CONTRACT_CALL // 일반 프로그램 호출
}

enum TxStatus {
  PENDING    // 서명 완료, 전송 전
  SUBMITTED  // 네트워크 전송됨
  CONFIRMED  // 확정됨
  FAILED     // 실패
}
```

### 3.4 마이그레이션 전략

#### 3.4.1 개발 환경

```bash
# 스키마 변경 후 즉시 DB 동기화 (마이그레이션 파일 없음)
pnpm prisma db push

# Prisma Client 재생성
pnpm prisma generate
```

- 빠른 이터레이션
- 마이그레이션 히스토리 없음
- 데이터 손실 가능 (개발 DB이므로 무관)

#### 3.4.2 스테이징/프로덕션 환경

```bash
# 1. 마이그레이션 파일 생성 (개발 환경에서)
pnpm prisma migrate dev --name add_agent_status

# 2. 마이그레이션 적용 (CI/CD 파이프라인에서)
pnpm prisma migrate deploy
```

- 모든 스키마 변경이 버전 관리됨
- 마이그레이션 히스토리로 롤백 가능
- `prisma migrate resolve`로 드리프트 해결

#### 3.4.3 마이그레이션 베스트 프랙티스

1. **작은 단위로 마이그레이션**: 하나의 기능 변경 = 하나의 마이그레이션
2. **하위 호환성 유지**: nullable 컬럼 추가 → 데이터 마이그레이션 → NOT NULL 추가
3. **마이그레이션 테스트**: 스테이징에서 프로덕션 데이터 복사본으로 테스트
4. **롤백 계획**: 각 마이그레이션의 롤백 SQL 준비

---

## 4. 캐싱 전략

### 4.1 선택: Redis (ioredis 클라이언트)

애플리케이션 캐싱 레이어로 **Redis**를 선택하고, **ioredis** 클라이언트를 사용합니다.

### 4.2 선택 근거

- **성능**: 메모리 기반으로 < 1ms 지연
- **다양한 데이터 구조**: String, Hash, Set, Sorted Set, List
- **TTL 지원**: 자동 만료로 캐시 관리 간소화
- **Pub/Sub**: 캐시 무효화 브로드캐스트
- **클러스터링**: 수평 확장 가능

**ioredis 선택 이유**:
- 100% TypeScript 네이티브
- 클러스터/센티넬 지원
- 파이프라이닝으로 배치 연산 최적화
- 자동 재연결 및 재시도 전략

### 4.3 캐싱 대상

| 데이터 | TTL | 캐시 키 패턴 | 이유 |
|--------|-----|--------------|------|
| 지갑 잔액 | 10초 | `balance:{address}` | 빈번한 조회, 블록체인 동기화 지연 허용 |
| 정책 정보 | 5분 | `policy:{walletId}` | 거래마다 검증 필요, 변경 빈도 낮음 |
| Rate limit 카운터 | 1분 | `ratelimit:{apiKey}:{minute}` | 실시간 카운팅 필요 |
| 세션/토큰 | 15분-7일 | `session:{token}` | 빠른 인증 검증 |
| Agent 메타데이터 | 10분 | `agent:{agentId}` | API 요청마다 조회 |

### 4.4 캐시 무효화 전략

#### 4.4.1 Write-Through (즉시 무효화)

정책 변경처럼 일관성이 중요한 데이터:

```typescript
// 정책 변경 시 캐시 즉시 무효화
async function updatePolicy(walletId: string, newPolicy: PolicyUpdate) {
  // 1. DB 업데이트
  const policy = await prisma.walletPolicy.update({
    where: { walletId },
    data: newPolicy
  });

  // 2. 캐시 즉시 삭제
  await redis.del(`policy:${walletId}`);

  // 3. 선택적: 새 값으로 캐시 세팅 (Write-Through)
  await redis.setex(
    `policy:${walletId}`,
    300, // 5분 TTL
    JSON.stringify(policy)
  );

  return policy;
}
```

#### 4.4.2 TTL 기반 (자연 만료)

잔액처럼 빈번히 변하고 약간의 불일치가 허용되는 데이터:

```typescript
// 지갑 잔액 조회 (TTL 기반 캐싱)
async function getWalletBalance(address: string): Promise<bigint> {
  const cacheKey = `balance:${address}`;

  // 1. 캐시 확인
  const cached = await redis.get(cacheKey);
  if (cached) {
    return BigInt(cached);
  }

  // 2. 캐시 미스 - RPC 조회
  const balance = await solanaRpc.getBalance(address).send();

  // 3. 캐시 저장 (10초 TTL)
  await redis.setex(cacheKey, 10, balance.value.toString());

  return balance.value;
}
```

#### 4.4.3 Pub/Sub 기반 (분산 무효화)

다중 서버 환경에서 캐시 일관성 유지:

```typescript
// 발행자: 정책 변경 시 이벤트 발행
async function publishPolicyChange(walletId: string) {
  await redis.publish('cache:invalidate', JSON.stringify({
    type: 'policy',
    key: `policy:${walletId}`
  }));
}

// 구독자: 모든 API 서버에서 구독
const subscriber = redis.duplicate();
subscriber.subscribe('cache:invalidate');
subscriber.on('message', async (channel, message) => {
  const { key } = JSON.parse(message);
  await redis.del(key);
});
```

### 4.5 Redis 구성

#### 4.5.1 개발 환경

```yaml
# docker-compose.dev.yml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
```

```typescript
// 개발 환경 Redis 클라이언트
import Redis from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 100, 3000),
});
```

#### 4.5.2 프로덕션 환경

- **AWS ElastiCache for Redis** (클러스터 모드) 권장
- 노드 타입: `cache.r6g.large` (시작점)
- 멀티 AZ 복제로 고가용성
- 전송 중 암호화 (TLS)

```typescript
// 프로덕션 환경 Redis 클러스터
import Redis from 'ioredis';

const redis = new Redis.Cluster([
  { host: 'redis-cluster-1.xxx.cache.amazonaws.com', port: 6379 },
  { host: 'redis-cluster-2.xxx.cache.amazonaws.com', port: 6379 },
], {
  redisOptions: {
    tls: {},
    password: process.env.REDIS_PASSWORD,
  },
  scaleReads: 'slave', // 읽기를 복제본으로 분산
});
```

### 4.6 캐시 레이어 구현 패턴

```typescript
// packages/shared/cache/index.ts
import Redis from 'ioredis';

export class CacheService {
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetcher();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}
```

---

## 5. 데이터 모델 개요

### 5.1 엔티티 관계도 (ERD)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              WAIaaS ERD                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────┐         ┌──────────┐         ┌──────────────┐            │
│  │  Owner   │ 1     N │  Agent   │ N     N │   Wallet     │            │
│  │──────────│─────────│──────────│─────────│──────────────│            │
│  │ id (PK)  │         │ id (PK)  │         │ id (PK)      │            │
│  │ email    │         │ ownerId  │◄────────│ ownerId      │            │
│  │ name     │         │ name     │         │ agentId      │            │
│  │ created  │         │ apiKey   │         │ address      │            │
│  └──────────┘         │ status   │         │ turnkeyId    │            │
│                       └──────────┘         └──────┬───────┘            │
│                                                   │                     │
│                                                   │ 1                   │
│                                                   │                     │
│                                             ┌─────┴──────┐              │
│                                             │            │              │
│                                             ▼            ▼              │
│                                    ┌──────────────┐ ┌──────────────┐   │
│                                    │WalletPolicy  │ │ Transaction  │   │
│                                    │──────────────│ │──────────────│   │
│                                    │ id (PK)      │ │ id (PK)      │   │
│                                    │ walletId (FK)│ │ walletId (FK)│   │
│                                    │ dailyLimit   │ │ signature    │   │
│                                    │ perTxLimit   │ │ type         │   │
│                                    │ allowedAssets│ │ amount       │   │
│                                    │ metadata     │ │ status       │   │
│                                    └──────────────┘ └──────────────┘   │
│                                                                         │
│  관계:                                                                  │
│  - Owner 1:N Agent (한 소유자가 여러 에이전트 소유)                     │
│  - Owner 1:N Wallet (한 소유자가 여러 지갑 소유)                        │
│  - Agent N:N Wallet (에이전트가 여러 지갑에 접근 가능)                   │
│  - Wallet 1:1 WalletPolicy (각 지갑은 하나의 정책)                      │
│  - Wallet 1:N Transaction (각 지갑은 여러 거래)                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 핵심 테이블 설명

#### Owner (소유자)

에이전트와 지갑의 실제 소유자 (사람/조직).

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | 기본 키 |
| email | VARCHAR | 유니크, 로그인 식별자 |
| name | VARCHAR | 표시 이름 (선택) |
| createdAt | TIMESTAMP | 생성 시각 |
| updatedAt | TIMESTAMP | 수정 시각 |

#### Agent (에이전트)

AI 에이전트 인스턴스. API 키로 인증하여 지갑 작업 수행.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | 기본 키 |
| ownerId | UUID | 소유자 FK |
| name | VARCHAR | 에이전트 이름 |
| apiKeyHash | VARCHAR | 해시된 API 키 (유니크) |
| status | ENUM | ACTIVE, SUSPENDED, REVOKED |
| createdAt | TIMESTAMP | 생성 시각 |

#### Wallet (지갑)

Solana 지갑. Turnkey에서 관리되는 키 쌍에 대응.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | 기본 키 |
| address | VARCHAR | Solana 공개 주소 (유니크) |
| ownerId | UUID | 소유자 FK |
| agentId | UUID | 에이전트 FK (nullable) |
| turnkeyWalletId | VARCHAR | Turnkey 내부 지갑 ID |
| label | VARCHAR | 지갑 라벨 (선택) |

#### WalletPolicy (지갑 정책)

지갑별 거래 제한 정책.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | 기본 키 |
| walletId | UUID | 지갑 FK (유니크, 1:1) |
| dailyLimit | DECIMAL(20,9) | 일일 한도 (SOL) |
| perTxLimit | DECIMAL(20,9) | 건당 한도 (SOL) |
| allowedAssets | TEXT[] | 허용된 SPL 토큰 민트 주소 |
| allowedAddresses | TEXT[] | 화이트리스트 수신 주소 |
| requiresApproval | BOOLEAN | human-in-the-loop 필요 여부 |
| metadata | JSONB | 확장 가능한 정책 설정 |

#### Transaction (거래)

모든 블록체인 거래 기록.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | 기본 키 |
| walletId | UUID | 지갑 FK |
| signature | VARCHAR | Solana TX 서명 (유니크) |
| type | ENUM | TRANSFER, SWAP, STAKE, CONTRACT_CALL |
| amount | DECIMAL(20,9) | 전송 금액 |
| asset | VARCHAR | 민트 주소 (null = SOL) |
| destination | VARCHAR | 수신 주소 |
| status | ENUM | PENDING, SUBMITTED, CONFIRMED, FAILED |

---

## 6. 백업 및 복구 방향

### 6.1 PostgreSQL 백업 전략

#### 6.1.1 자동 백업 (AWS RDS)

- **자동 백업 활성화**: 7-35일 보존 기간
- **백업 윈도우**: 트래픽 최소 시간대 (예: 04:00-05:00 UTC)
- **Point-in-Time Recovery (PITR)**: 최대 5분 내 복구 가능

#### 6.1.2 수동 스냅샷

- **릴리스 전**: 주요 배포 전 수동 스냅샷 생성
- **주간 아카이브**: 장기 보존용 스냅샷 (S3로 내보내기)

#### 6.1.3 복구 절차

```bash
# 1. RDS 콘솔에서 특정 시점으로 새 인스턴스 복원
# 2. 새 인스턴스 확인 후 DNS 전환
# 3. 구 인스턴스 삭제
```

### 6.2 Redis 백업 전략

#### 6.2.1 RDB 스냅샷 (권장)

- **ElastiCache 자동 백업**: 일일 스냅샷
- **보존 기간**: 7일
- **백업 윈도우**: 낮은 트래픽 시간대

#### 6.2.2 AOF (Append-Only File)

- 더 정밀한 복구 필요 시 활성화
- 디스크 I/O 증가 트레이드오프
- 기본적으로 RDB만 사용 (캐시 데이터는 재구축 가능)

### 6.3 복구 시간 목표 (RTO/RPO)

| 구성 요소 | RTO | RPO | 전략 |
|-----------|-----|-----|------|
| PostgreSQL | < 1시간 | < 5분 | PITR, 멀티 AZ |
| Redis | < 15분 | < 1일 | 재시작 후 캐시 재구축 |

---

## 7. 모니터링 및 경고

### 7.1 PostgreSQL 모니터링

- **AWS CloudWatch 지표**: CPU, 메모리, 연결 수, IOPS
- **Performance Insights**: 느린 쿼리 분석
- **경고 임계값**:
  - CPU > 80% (5분 지속)
  - 연결 수 > 90% max_connections
  - 디스크 사용량 > 80%

### 7.2 Redis 모니터링

- **ElastiCache 지표**: 메모리 사용량, 캐시 히트율, 연결 수
- **경고 임계값**:
  - 메모리 사용량 > 75%
  - 캐시 히트율 < 90%
  - 연결 수 급증

---

## 8. 결론

WAIaaS의 데이터베이스 및 캐싱 전략은 다음과 같이 확정됩니다:

| 구성 요소 | 선택 | 핵심 이유 |
|-----------|------|-----------|
| 메인 DB | PostgreSQL 15+ | ACID 준수, 관계형 모델, JSON 지원 |
| ORM | Prisma 6.x | 타입 안전성, 마이그레이션 관리 |
| 캐시 | Redis + ioredis | 저지연, 다양한 자료구조, 클러스터링 |
| 인프라 | AWS RDS + ElastiCache | 관리형 서비스, 고가용성 |

이 전략은 금융 데이터의 무결성을 보장하면서도 AI 에이전트의 실시간 요구사항을 충족합니다.

---

**다음 단계:**
- Phase 3: 시스템 아키텍처 설계에서 데이터 레이어 통합
- Phase 4: Prisma 스키마 구현 및 마이그레이션 초기화
