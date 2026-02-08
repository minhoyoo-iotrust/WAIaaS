# Phase 30: 스키마 설정 확정 - Research

**Researched:** 2026-02-08
**Domain:** SQLite schema finalization, TOML config env-var mapping, Docker UID, notification channel concurrency
**Confidence:** HIGH

## Summary

Phase 30은 v0.7 구현 장애 요소 해소의 마지막 페이즈로, Phase E(스키마 & 설정 확정)의 6건(E-1~E-6)을 설계 문서에 직접 반영한다. 이 페이즈의 핵심은 **기존 설계 문서의 미결정 사항을 확정하고 보완**하는 것이지, 새로운 아키텍처를 도입하는 것이 아니다.

조사 결과, 6건의 요구사항 모두 해결 방향이 v0.7 objectives 문서(E-1~E-6)에 이미 구체적으로 정의되어 있다. 이 리서치는 해당 해결 방향의 기술적 타당성을 검증하고, 기존 문서 간 충돌 지점을 식별하며, 수정 시 유의사항을 정리한다.

**Primary recommendation:** v0.7 objectives의 E-1~E-6 해결 방향을 그대로 따르되, config.toml 중첩 섹션 평탄화(E-1)와 agents.network CHECK 값(E-3)에서 기존 문서와의 충돌을 신중히 처리해야 한다.

## Standard Stack

이 페이즈는 라이브러리 도입이 아닌 **설계 문서 수정** 작업이므로 새로운 스택은 없다. 기존 스택 참조:

### Core (기존 스택 -- 변경 없음)
| Library | Version | Purpose | Relevance to Phase 30 |
|---------|---------|---------|----------------------|
| `drizzle-orm` | 0.45.x | SQLite ORM, CHECK 제약 정의 | agents CHECK, timestamp mode |
| `better-sqlite3` | 12.6.x | SQLite 드라이버 | BEGIN IMMEDIATE 트랜잭션 |
| `smol-toml` | ^1.3.0 | TOML 파싱 | config.toml 평탄화 |
| `zod` | ^3.24.0 | 스키마 검증 | config 검증, 중첩 금지 에러 메시지 |

## Architecture Patterns

### 패턴 1: config.toml 환경변수 평탄화 (E-1)

**현재 상태:** 24-monorepo-data-directory.md에 중첩 TOML 섹션(`[rpc.solana]`, `[security.auto_stop]`, `[notifications.telegram]` 등)이 존재하며, 환경변수 매핑 테이블에서도 `[rpc.solana].mainnet` -> `WAIAAS_RPC_SOLANA_MAINNET`으로 참조.

**E-1 해결 방향:** 중첩 섹션을 금지하고 평탄화된 키만 사용.

```toml
# 금지: [rpc.solana]
#        mainnet = "https://..."

# 허용:
[rpc]
solana_mainnet = "https://..."
solana_devnet = "https://..."
solana_ws_mainnet = "wss://..."
```

**문서 충돌 식별 (CRITICAL):**

현재 24-monorepo-data-directory.md에서 수정이 필요한 중첩 섹션:

| 현재 (중첩) | 평탄화 후 | 영향 |
|------------|----------|------|
| `[rpc.solana].mainnet` | `[rpc].solana_mainnet` | 섹션 3.2, 3.3, 3.4, 3.5(Zod) 전부 수정 |
| `[rpc.solana].devnet` | `[rpc].solana_devnet` | 동일 |
| `[rpc.solana].testnet` | `[rpc].solana_testnet` | 동일 |
| `[rpc.solana.ws].mainnet` | `[rpc].solana_ws_mainnet` | 2단계 중첩 해소 |
| `[rpc.solana.ws].devnet` | `[rpc].solana_ws_devnet` | 동일 |
| `[rpc.ethereum].mainnet` | `[rpc].ethereum_mainnet` | 동일 |
| `[rpc.ethereum].sepolia` | `[rpc].ethereum_sepolia` | 동일 |
| `[notifications.telegram].bot_token` | `[notifications].telegram_bot_token` | 섹션 3.3, 3.4 수정 |
| `[notifications.telegram].chat_id` | `[notifications].telegram_chat_id` | 동일 |
| `[notifications.discord].webhook_url` | `[notifications].discord_webhook_url` | 동일 |
| `[notifications.ntfy].server` | `[notifications].ntfy_server` | 동일 |
| `[notifications.ntfy].topic` | `[notifications].ntfy_topic` | 동일 |
| `[security.auto_stop].consecutive_failures_threshold` | `[security].auto_stop_consecutive_failures_threshold` | 환경변수명 매우 길어짐 |
| `[security.policy_defaults].delay_seconds` | `[security].policy_defaults_delay_seconds` | 동일 |
| `[security.policy_defaults].approval_timeout` | `[security].policy_defaults_approval_timeout` | 동일 |
| `[security.kill_switch].recovery_cooldown` | `[security].kill_switch_recovery_cooldown` | 동일 |
| `[security.kill_switch].max_recovery_attempts` | `[security].kill_switch_max_recovery_attempts` | 동일 |

**Zod 스키마 변경:**

현재 ConfigSchema는 중첩 z.object()를 사용하고 있다:
```typescript
// 현재 (중첩)
rpc: z.object({
  solana: z.object({
    mainnet: z.string().url().default('...'),
    ws: z.object({ ... }),
  }),
})

// 변경 후 (평탄화)
rpc: z.object({
  solana_mainnet: z.string().url().default('...'),
  solana_devnet: z.string().url().default('...'),
  solana_ws_mainnet: z.string().url().default('...'),
  ethereum_mainnet: z.string().default(''),
  ethereum_sepolia: z.string().default(''),
})
```

**applyEnvOverrides 함수 단순화:**

평탄화 후 `WAIAAS_{SECTION}_{KEY}` 매핑이 단순해진다:
- `WAIAAS_RPC_SOLANA_MAINNET` -> section=`rpc`, key=`solana_mainnet`
- 현재 구현의 `parts.slice(1).join('_')` 로직이 정확히 동작

**중첩 금지 Zod 에러 메시지:**

TOML에서 `[rpc.solana]`를 사용하면 smol-toml이 nested object로 파싱한다. Zod 검증 시 `rpc.solana`라는 키가 object이면 에러를 발생시킬 수 있다. 구체적으로, Zod의 `.strict()` 모드를 사용하면 미인식 키에 대해 자동 에러가 발생하지만, 런타임에서 사용자에게 친절한 에러 메시지를 제공하려면 `.superRefine()`이나 `.preprocess()` 단계에서 검증하는 것이 낫다.

```typescript
// 예시: 중첩 섹션 감지
function detectNestedSections(config: Record<string, unknown>): string[] {
  const violations: string[] = []
  for (const [section, value] of Object.entries(config)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const [key, subValue] of Object.entries(value as Record<string, unknown>)) {
        if (typeof subValue === 'object' && subValue !== null && !Array.isArray(subValue)) {
          violations.push(`[${section}.${key}]`)
        }
      }
    }
  }
  return violations
}
```

**Confidence:** HIGH -- E-1의 해결 방향이 명확하고, smol-toml은 TOML 1.0 스펙 완전 준수하므로 중첩/평탄화 모두 파싱 가능.

### 패턴 2: SQLite 타임스탬프 통일 (E-2)

**현재 상태:** 25-sqlite-schema.md 섹션 1.3에 "모든 타임스탬프는 초 단위"로 명시되어 있으나, 같은 문서 섹션 2.5에 "audit_log의 timestamp만 밀리초 정밀도 필요하면 `{ mode: 'timestamp_ms' }` 사용 고려"라는 미결정 주석이 존재.

**E-2 해결 방향:** 전체 초 단위 확정, 밀리초 고려 주석 삭제.

**근거:**
- 동일 초 내 감사 이벤트 순서는 `id` (UUID v7의 내장 ms 정밀도)로 자연 보장
- UUID v7은 타임스탬프 48비트(ms 정밀도)를 포함하므로, id 컬럼 정렬이 곧 ms 수준 시간 정렬
- audit_log는 AUTOINCREMENT PK를 사용하므로, id 단조 증가도 순서 보장

**수정 범위:**
- 25-sqlite-schema.md 섹션 1.3: "밀리초 필요 시" 주석 삭제 -> 확정 문구로 교체
- 25-sqlite-schema.md 섹션 2.5: audit_log.timestamp 설명에서 밀리초 고려 문구 제거

**Confidence:** HIGH -- 이미 모든 테이블이 `{ mode: 'timestamp' }` (초)로 정의되어 있으며, 밀리초 사용 테이블은 없다.

### 패턴 3: agents 테이블 chain/network CHECK (E-3)

**현재 상태:** agents 테이블에 chain/network CHECK 없음. status에만 CHECK 존재.

**E-3 해결 방향:**
```sql
chain   TEXT NOT NULL CHECK (chain IN ('solana', 'ethereum'))
network TEXT NOT NULL CHECK (network IN ('mainnet', 'devnet', 'testnet'))
```

**문서 충돌 식별 (IMPORTANT):**

E-3에서 제안하는 network 값이 기존 문서와 다르다:

| 위치 | 현재 값 | E-3 제안 |
|------|---------|---------|
| 25-sqlite-schema.md 컬럼 설명 | `mainnet-beta`, `devnet`, `mainnet`, `sepolia` | `mainnet`, `devnet`, `testnet` |
| 37-rest-api-complete-spec.md 예시 | `mainnet-beta` (Solana) | 미언급 |
| 26-keystore-spec.md | `mainnet-beta`, `devnet`, `mainnet`, `sepolia` | 미언급 |
| 24-monorepo-data-directory.md RPC | `mainnet`, `devnet`, `testnet` (키), `sepolia` (EVM 키) | 미언급 |

**분석:**

1. **Solana 네트워크 공식명:** `mainnet-beta`, `devnet`, `testnet` -- Solana는 공식적으로 `mainnet-beta`를 사용
2. **Ethereum 네트워크명:** `mainnet`, `sepolia` -- Ethereum은 `mainnet`과 테스트넷 이름을 사용
3. **E-3 제안의 문제:** `mainnet`, `devnet`, `testnet`로 단순화하면:
   - Solana의 `mainnet-beta`가 `mainnet`으로 변경됨 (기존 문서 37, 26, 25 전부 수정 필요)
   - Ethereum의 `sepolia`가 `testnet`으로 변경됨 (특정 테스트넷 정보 손실)
4. **RPC 키와의 정합성:** config.toml 평탄화 후 `[rpc].solana_mainnet`, `[rpc].ethereum_sepolia` 같은 키가 되므로, DB의 network 값과 config 키 사이에 매핑 로직이 필요

**권장 접근:**

E-3 원문의 `'mainnet' | 'devnet' | 'testnet'`은 현재 문서 체계와 충돌이 크다. 하이픈이 포함된 `mainnet-beta`는 환경변수에서도 문제없고(WAIAAS_RPC_SOLANA_MAINNET은 키 이름이지 네트워크 값이 아님), CHECK 제약에도 문제없다. 따라서:

**옵션 A (E-3 원문 따르기):** `'mainnet' | 'devnet' | 'testnet'`으로 단순화. 다수의 기존 문서(25, 26, 37) 수정 필요.

**옵션 B (현행 유지 + CHECK 추가):** chain별 network 값을 그대로 유지하면서 CHECK만 추가:
```sql
chain   TEXT NOT NULL CHECK (chain IN ('solana', 'ethereum'))
network TEXT NOT NULL CHECK (network IN ('mainnet-beta', 'devnet', 'testnet', 'mainnet', 'sepolia'))
```

**추천: 옵션 A** -- E-3의 의도는 네트워크명을 추상화하여 체인 무관하게 통일하는 것이다. `mainnet-beta`는 Solana 특유의 명칭이고, 앱 레벨에서 `mainnet`으로 추상화하는 것이 일관적이다. 실제 Solana RPC URL(`api.mainnet-beta.solana.com`)과 DB network 값(`mainnet`)은 별개의 관심사이며, AdapterRegistry에서 매핑하면 된다.

**Drizzle ORM에서 CHECK 추가:**

```typescript
import { check, sql } from 'drizzle-orm';

export const agents = sqliteTable('agents', {
  // ... columns
  chain: text('chain').notNull(),
  network: text('network').notNull(),
}, (table) => [
  check('agents_chain_check', sql`${table.chain} IN ('solana', 'ethereum')`),
  check('agents_network_check', sql`${table.network} IN ('mainnet', 'devnet', 'testnet')`),
  // ... existing indexes
]);
```

Drizzle ORM 0.45.x에서 `check()` 함수는 테이블 레벨 CHECK 제약으로 지원된다. `$type<>()` 메서드는 TypeScript 타입만 변경하고 SQL에는 영향 없으므로, 실제 DB CHECK는 `check()` 함수로 별도 정의해야 한다.

**마이그레이션 주의:** agents 테이블에 CHECK 제약을 추가하려면 **테이블 재생성**이 필요하다(SQLite ALTER TABLE은 CHECK 추가를 지원하지 않음). 25-sqlite-schema.md 섹션 4.6의 재생성 패턴을 따라야 한다.

**Confidence:** MEDIUM -- network 값 통일 방향에 대한 기존 문서 간 충돌이 있어 결정이 필요.

### 패턴 4: Docker UID 1001 정합성 (E-4)

**현재 상태:** 40-telegram-bot-docker.md의 Dockerfile에 `adduser -S waiaas -u 1001`이 이미 존재하지만, 홈 디렉토리 설정과 데이터 디렉토리 소유권 확인 로직이 미정의.

**E-4 해결 방향:**
```dockerfile
RUN groupadd -g 1001 waiaas && \
    useradd -u 1001 -g waiaas -d /home/waiaas -m waiaas

# 데이터 디렉토리 명시적 생성 + 소유권
ENV WAIAAS_DATA_DIR=/home/waiaas/.waiaas
RUN mkdir -p $WAIAAS_DATA_DIR && chown -R waiaas:waiaas $WAIAAS_DATA_DIR
```

**주의:** 현재 Dockerfile은 Alpine(`addgroup -g 1001 -S waiaas && adduser -S waiaas -u 1001 -G waiaas`)을 사용한다. E-4의 예시는 Debian/Ubuntu 스타일(`groupadd`/`useradd`)이므로 Alpine 문법으로 조정 필요:
```dockerfile
RUN addgroup -g 1001 -S waiaas && \
    adduser -S waiaas -u 1001 -G waiaas -h /home/waiaas
```

**소유권 확인 로직 (데몬 시작 시):**
```typescript
const stat = fs.statSync(dataDir)
if (stat.uid !== process.getuid()) {
  logger.warn(`데이터 디렉토리 소유자(${stat.uid})와 실행 사용자(${process.getuid()})가 다릅니다`)
}
```

**docker-compose에서 user 지정:**
```yaml
services:
  waiaas:
    user: "1001:1001"
    volumes:
      - waiaas-data:/home/waiaas/.waiaas
```

**Confidence:** HIGH -- 표준 Docker 패턴이며 기존 설계와 충돌 없음.

### 패턴 5: amount TEXT 근거 문서화 (E-5)

**현재 상태:** 25-sqlite-schema.md 섹션 2.3에 "amount를 TEXT로 저장하는 이유"가 간략히 기술되어 있지만, 보조 컬럼 대안과 성능 영향 분석이 부족.

**E-5 해결 방향:** TEXT 유지 근거 보강, amount_lamports 유보.

**핵심 근거:**
1. JavaScript `number` 정밀도: `Number.MAX_SAFE_INTEGER` = 2^53 - 1 = 9,007,199,254,740,991
2. Solana lamport u64 최대: 18,446,744,073,709,551,615 (> 2^53)
3. EVM wei uint256: 2^256 - 1 (>> 2^53)
4. SQLite INTEGER: 최대 64비트 (9.2 x 10^18) -- lamport는 커버하지만 wei는 불가
5. TEXT로 저장하면 체인 무관하게 안전, BigInt 문자열 그대로 저장

**보조 컬럼 옵션:**
- `amount_lamports INTEGER`: Solana 전용 보조 컬럼으로 인덱스 가능, 금액 범위 검색 최적화
- 유보 이유: 현재 금액 범위 검색이 필요한 기능은 AutoStopEngine의 `threshold_proximity` 뿐이며, 이것은 최근 N건만 조회하므로 성능 영향 미미

**Confidence:** HIGH -- JavaScript 정밀도 한계는 사실이며, 현재 설계에서 TEXT 유지가 합리적.

### 패턴 6: 알림 채널 삭제 BEGIN IMMEDIATE (E-6)

**현재 상태:** 35-notification-architecture.md 섹션 9.3에 채널 삭제/비활성화 시 `min_channels` 검증 코드가 있지만, 동시성 보호가 없어 TOCTOU 취약점 존재.

**E-6 해결 방향:** BEGIN IMMEDIATE 트랜잭션으로 원자적 보호.

```typescript
// better-sqlite3의 .transaction()은 기본 BEGIN DEFERRED
// BEGIN IMMEDIATE를 위해 raw SQL 사용
db.exec('BEGIN IMMEDIATE');
try {
  const activeCount = db.prepare(
    'SELECT COUNT(*) as cnt FROM notification_channels WHERE enabled = 1 AND id != ?'
  ).get(channelId) as { cnt: number };

  if (activeCount.cnt < minChannels) {
    db.exec('ROLLBACK');
    throw new WaiaasError('MIN_CHANNELS_REQUIRED', '...', 400);
  }

  // 비활성화 (물리 삭제 금지 -- E-6 결정)
  db.prepare(
    'UPDATE notification_channels SET enabled = 0, updated_at = ? WHERE id = ?'
  ).run(now, channelId);

  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
}
```

**E-6의 추가 결정:** 물리 삭제(DELETE)를 금지하고, 비활성화(enabled=false)만 허용. 이는 감사 로그 보존과 notification_log FK 무결성을 위한 것이다.

**33-time-lock-approval-mechanism.md의 reserved_amount 패턴과 동일:** BEGIN IMMEDIATE로 쓰기 잠금을 즉시 획득하여 동시 요청을 직렬화.

**Confidence:** HIGH -- BEGIN IMMEDIATE는 SQLite WAL 모드에서 TOCTOU 방지의 표준 패턴이며, 이미 33-time-lock에서 동일 패턴 사용 중.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOML 파싱 | 커스텀 파서 | `smol-toml` | TOML 1.0/1.1 완전 준수, 엣지 케이스 처리 |
| 환경변수 매핑 | 복잡한 중첩 매핑 | 평탄화 + 단순 split | 중첩 제거로 매핑 로직 대폭 단순화 |
| DB CHECK 추가 | ALTER TABLE 시도 | 테이블 재생성 패턴 | SQLite는 ALTER TABLE CHECK ADD를 지원하지 않음 |
| 동시성 보호 | 앱 레벨 뮤텍스 | BEGIN IMMEDIATE | SQLite 네이티브 쓰기 잠금, 데드락 위험 없음 |

## Common Pitfalls

### Pitfall 1: config.toml 평탄화 시 기존 Zod 스키마 구조 깨짐
**What goes wrong:** 중첩 z.object()를 평탄화된 z.object()로 변경할 때, 기존 코드에서 `config.rpc.solana.mainnet` 패턴으로 접근하던 모든 참조가 깨진다.
**Why it happens:** Zod 스키마 구조 변경은 타입 추론에 직접 영향을 미친다.
**How to avoid:** config.toml의 구조 변경은 Zod 스키마, loadConfig(), applyEnvOverrides(), 그리고 이를 참조하는 모든 설계 문서를 함께 수정해야 한다. 특히 35-notification-architecture.md 섹션 12.4의 `[notifications].min_channels` 등 다른 문서에서 config 구조를 참조하는 부분도 확인 필요.
**Warning signs:** 타입 에러, 설정 로드 실패

### Pitfall 2: network 값 통일 시 기존 문서 누락
**What goes wrong:** agents.network CHECK에 `'mainnet'`을 사용하면서, 37-rest-api-complete-spec.md의 예시에서 `'mainnet-beta'`를 그대로 두면 불일치.
**Why it happens:** 37-rest-api, 26-keystore, 31-solana-adapter 등 다수 문서에서 `mainnet-beta`를 직접 참조.
**How to avoid:** `mainnet` 통일 시 영향받는 모든 문서를 식별하고 동시에 수정. v0.7 태그로 추적.
**Warning signs:** REST API 예시와 DB 스키마 불일치

### Pitfall 3: agents 테이블 CHECK 추가는 테이블 재생성 필요
**What goes wrong:** `ALTER TABLE agents ADD CHECK (chain IN (...))` 실행 시 SQLite 에러.
**Why it happens:** SQLite는 ALTER TABLE에서 CHECK 제약 추가를 지원하지 않는다. 컬럼 추가만 가능.
**How to avoid:** 25-sqlite-schema.md 섹션 4.6의 테이블 재생성 패턴(CREATE new -> INSERT SELECT -> DROP old -> RENAME)을 마이그레이션에 명시.
**Warning signs:** 마이그레이션 실패

### Pitfall 4: 채널 삭제 시 물리 DELETE vs 비활성화 혼동
**What goes wrong:** E-6에서 "물리 삭제 지원하지 않음"으로 결정했지만, 35-notification-architecture.md 섹션 9.1에 `DELETE /v1/owner/notification-channels/:id` API가 존재.
**Why it happens:** API 경로명이 DELETE이지만 실제 동작은 비활성화(soft delete).
**How to avoid:** API 경로는 유지하되, 구현이 물리 삭제가 아닌 enabled=false 처리임을 명시. 또는 PUT으로 변경을 문서화.
**Warning signs:** 감사 로그 유실, notification_log FK 깨짐

### Pitfall 5: 환경변수명이 너무 길어짐
**What goes wrong:** 평탄화 후 `WAIAAS_SECURITY_AUTO_STOP_CONSECUTIVE_FAILURES_THRESHOLD` 같은 환경변수명이 매우 길어진다.
**Why it happens:** 중첩 섹션이 언더스코어 구분으로 펼쳐지면서 단계가 모두 환경변수명에 포함.
**How to avoid:** 이것은 의도된 tradeoff이다. 환경변수명 길이보다 매핑 규칙의 단순성과 일관성이 더 중요. Docker/CI 환경에서 환경변수명 길이 제한은 일반적으로 없다.

## Code Examples

### config.toml 평탄화 전후 비교

**Before (중첩):**
```toml
[rpc.solana]
mainnet = "https://api.mainnet-beta.solana.com"
devnet = "https://api.devnet.solana.com"

[rpc.solana.ws]
mainnet = "wss://api.mainnet-beta.solana.com"

[notifications.telegram]
bot_token = ""
chat_id = ""
```

**After (평탄화):**
```toml
[rpc]
solana_mainnet = "https://api.mainnet-beta.solana.com"
solana_devnet = "https://api.devnet.solana.com"
solana_testnet = "https://api.testnet.solana.com"
solana_ws_mainnet = "wss://api.mainnet-beta.solana.com"
solana_ws_devnet = "wss://api.devnet.solana.com"
ethereum_mainnet = ""
ethereum_sepolia = ""

[notifications]
enabled = false
telegram_bot_token = ""
telegram_chat_id = ""
discord_webhook_url = ""
ntfy_server = "https://ntfy.sh"
ntfy_topic = ""
```

### agents CHECK DDL

```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN ('solana', 'ethereum')),
  network TEXT NOT NULL CHECK (network IN ('mainnet', 'devnet', 'testnet')),
  public_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATING'
    CHECK (status IN ('CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATING', 'TERMINATED')),
  owner_address TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  suspended_at INTEGER,
  suspension_reason TEXT
);
```

### 채널 비활성화 BEGIN IMMEDIATE 패턴

```typescript
function disableNotificationChannel(
  sqlite: Database,
  channelId: string,
  minChannels: number,
): void {
  // BEGIN IMMEDIATE: 쓰기 잠금 즉시 획득 (TOCTOU 방지)
  const disableTx = sqlite.transaction(() => {
    const row = sqlite.prepare(
      'SELECT COUNT(*) as cnt FROM notification_channels WHERE enabled = 1 AND id != ?'
    ).get(channelId) as { cnt: number };

    if (row.cnt < minChannels) {
      throw new WaiaasError(
        'MIN_CHANNELS_REQUIRED',
        `최소 ${minChannels}개의 활성 알림 채널이 필요합니다.`,
        400,
      );
    }

    sqlite.prepare(
      'UPDATE notification_channels SET enabled = 0, updated_at = ? WHERE id = ?'
    ).run(Math.floor(Date.now() / 1000), channelId);
  });

  // better-sqlite3의 .transaction()은 기본 BEGIN DEFERRED
  // BEGIN IMMEDIATE를 위해서는 exclusive 옵션 또는 raw SQL 필요
  // NOTE: better-sqlite3 v12.x에서 .transaction()은 실제로 BEGIN을 사용
  // IMMEDIATE가 필요하면 raw exec 사용:
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    // ... transaction body ...
    sqlite.exec('COMMIT');
  } catch (err) {
    sqlite.exec('ROLLBACK');
    throw err;
  }
}
```

**NOTE:** better-sqlite3의 `.transaction()` 헬퍼는 `BEGIN` (DEFERRED)를 사용한다. `BEGIN IMMEDIATE`가 필요하면 raw SQL로 직접 제어해야 한다. 33-time-lock-approval-mechanism.md에서 동일한 이유로 raw SQL 패턴을 사용한다.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 중첩 TOML 섹션 + 복잡한 env 매핑 | 평탄화 TOML + 단순 env 매핑 | Phase 30 (E-1) | config 구조 단순화, 환경변수 매핑 1:1 대응 |
| audit_log 밀리초 고려 | 전체 초 단위 + UUID v7 ms 활용 | Phase 30 (E-2) | 타임스탬프 정책 통일 |
| agents chain/network 자유 텍스트 | CHECK 제약으로 유효값 강제 | Phase 30 (E-3) | 오타 방지, 데이터 무결성 |
| Docker UID 암묵적 | UID 1001 명시 + 소유권 확인 | Phase 30 (E-4) | named volume 권한 문제 방지 |
| amount TEXT 근거 간략 | 성능 분석 + 대안 옵션 문서화 | Phase 30 (E-5) | 구현자 판단 자료 제공 |
| 채널 삭제 동시성 미보호 | BEGIN IMMEDIATE 원자적 보호 | Phase 30 (E-6) | TOCTOU 방지 |

## Plan-Specific Findings

### 30-01: 환경변수 매핑 규칙 + SQLite timestamp 통일

**수정 대상 문서:**

| 문서 | 수정 섹션 | 수정 내용 |
|------|----------|----------|
| 24-monorepo-data-directory.md | 3.2 환경변수 매핑 | 중첩 섹션 제거, 평탄화 규칙 확정 |
| 24-monorepo-data-directory.md | 3.3 전체 키-값 구조 | [rpc.solana] -> [rpc] 내 solana_* 키, [notifications.*] -> [notifications] 내 평탄 키, [security.*] 하위 평탄화 |
| 24-monorepo-data-directory.md | 3.4 기본 config.toml | 전체 예시 재작성 |
| 24-monorepo-data-directory.md | 3.5 설정 로드 구현 | ConfigSchema Zod 구조 변경, applyEnvOverrides 단순화, 중첩 감지 에러 추가 |
| 25-sqlite-schema.md | 1.3 타임스탬프 전략 | "밀리초 필요 시" 주석 삭제, UUID v7 활용 확정 문구 |
| 25-sqlite-schema.md | 2.5 audit_log | timestamp 컬럼 설명에서 밀리초 고려 제거 |

### 30-02: agents CHECK + Docker UID + amount TEXT + 채널 삭제

**수정 대상 문서:**

| 문서 | 수정 섹션 | 수정 내용 |
|------|----------|----------|
| 25-sqlite-schema.md | 2.1 agents | chain/network CHECK 추가 (Drizzle + DDL) |
| 25-sqlite-schema.md | 2.3 transactions | amount TEXT 유지 근거 보강 |
| 45-enum-unified-mapping.md | 신규 섹션 | ChainType 2값, NetworkType 3값 추가 |
| 40-telegram-bot-docker.md | 8.2 Dockerfile | UID 1001 홈 디렉토리, WAIAAS_DATA_DIR 환경변수, chown |
| 40-telegram-bot-docker.md | 9.1 docker-compose | user: "1001:1001", volumes 경로 |
| 35-notification-architecture.md | 9.3 채널 삭제 | BEGIN IMMEDIATE 트랜잭션, 물리 삭제 금지 결정 |
| 25-sqlite-schema.md | 4.x 마이그레이션 | agents CHECK 추가를 위한 테이블 재생성 마이그레이션 가이드 |

**추가 영향 문서 (network 값 통일 시):**

| 문서 | 수정 내용 |
|------|----------|
| 37-rest-api-complete-spec.md | `mainnet-beta` -> `mainnet` 예시 변경 |
| 26-keystore-spec.md | network 값 변경 |
| 31-solana-adapter-detail.md | network 매핑 주석 |
| 29-api-framework-design.md | network 예시 변경 |

## Open Questions

1. **network 값 통일 범위 결정**
   - What we know: E-3에서 `'mainnet' | 'devnet' | 'testnet'`으로 제안했지만, 기존 다수 문서에서 `mainnet-beta`, `sepolia` 사용
   - What's unclear: Ethereum `sepolia`가 `testnet`으로 바뀌면 다른 EVM 테스트넷(goerli 등) 추가 시 구분 불가. `testnet`은 범용적이지만 특정 테스트넷 식별이 불가능
   - Recommendation: E-3 원문을 따르되, CHECK 값에 `'sepolia'`를 추가 포함하는 방안도 고려. 최종 결정은 plan 수립 시 확정. `'mainnet' | 'devnet' | 'testnet' | 'sepolia'` 4값이 현실적 절충안일 수 있음

2. **config.toml [notifications] 구조 35-notification-architecture.md 정합성**
   - What we know: 35-notification-architecture.md 섹션 12.4에서 `[notifications].min_channels` 등을 정의했고, 이는 24-monorepo-data-directory.md와 일부 다름
   - What's unclear: 35-notification의 확장 키(min_channels, health_check_interval, log_retention_days, dedup_ttl)가 24-monorepo에 아직 반영되지 않음
   - Recommendation: 30-01에서 config.toml 전면 수정 시 35-notification의 확장 키도 함께 반영. 단, 이들은 E-1 범위 외이므로 수정 규모 판단 필요

3. **DELETE API 경로 유지 vs 변경**
   - What we know: E-6에서 물리 삭제 금지 결정
   - What's unclear: `DELETE /v1/owner/notification-channels/:id` 경로를 soft-delete로 유지할지, `PUT /v1/owner/notification-channels/:id` (enabled=false)로 변경할지
   - Recommendation: DELETE 경로 유지 + 실제 동작은 soft-delete. REST 관행상 리소스 제거 의미로 DELETE 사용은 일반적이며, soft-delete 구현은 내부 세부사항.

## Sources

### Primary (HIGH confidence)
- v0.7 objectives: `objectives/v0.7-implementation-blockers-resolution.md` -- E-1~E-6 해결 방향의 원문
- 24-monorepo-data-directory.md -- config.toml 전체 스펙 (현재 중첩 구조)
- 25-sqlite-schema.md -- SQLite 스키마 전체 정의 (9개 테이블)
- 45-enum-unified-mapping.md -- Enum SSoT (12개 Enum)
- 35-notification-architecture.md -- 알림 채널 삭제/비활성화 로직
- 40-telegram-bot-docker.md -- Docker 스펙 (UID 1001)

### Secondary (MEDIUM confidence)
- [Drizzle ORM Indexes & Constraints](https://orm.drizzle.team/docs/indexes-constraints) -- CHECK 제약 문법
- [smol-toml GitHub](https://github.com/squirrelchat/smol-toml) -- TOML 파서 스펙 준수 확인

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 기존 스택 유지, 변경 없음
- Architecture: HIGH - E-1~E-6 해결 방향이 objectives에 구체적으로 정의됨
- Pitfalls: HIGH - 기존 문서 간 충돌 지점을 구체적으로 식별함

**Research date:** 2026-02-08
**Valid until:** 60 days (안정적인 설계 문서 수정 작업)
