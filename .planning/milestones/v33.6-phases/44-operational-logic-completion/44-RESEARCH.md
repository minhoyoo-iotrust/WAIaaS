# Phase 44: 운영 로직 완결 - Research

**Researched:** 2026-02-09
**Domain:** 데몬 라이프사이클, 배치 트랜잭션 DB 저장, 가격 오라클 충돌 해결
**Confidence:** HIGH

## Summary

Phase 44는 v0.10 마일스톤의 Phase D(운영 로직 완결)에 해당하며, HIGH 등급 미비점 3건(H2, H6, H7)을 해소한다. 대상은 4개 설계 문서(28-daemon, 60-batch-tx, 25-sqlite, 61-price-oracle)이며, 모든 변경은 기존 설계 문서의 특정 섹션에 내용을 추가/보완하는 작업이다. 새로운 인터페이스나 테이블을 추가하지 않고, 기존 구조 내에서 누락된 타임아웃 정의, DB 저장 전략, 가격 충돌 해결 로직을 명시한다.

3개 요구사항(OPER-01, OPER-02, OPER-03)은 각각 독립적인 설계 문서를 대상으로 하지만, OPER-02는 60-batch-tx와 25-sqlite 두 문서를 동시에 수정해야 한다는 교차 의존이 있다. Phase 41에서 25-sqlite의 rules 컬럼 SSoT 정리가 이미 완료되었으므로, OPER-02의 parent_id/batch_index 컬럼 추가와 충돌 없이 진행 가능하다.

**Primary recommendation:** 3개 요구사항을 각각 독립 plan으로 분리하여 실행한다. OPER-01(데몬 타임아웃), OPER-02(배치 DB 저장), OPER-03(오라클 충돌) 순서로 진행하되, OPER-02와 OPER-03은 병렬 실행 가능하다.

## Standard Stack

이 Phase는 설계 문서 보완 작업이므로 새로운 라이브러리 추가는 없다. 기존 설계 문서에서 참조하는 스택만 확인한다.

### Core (기존 설계에서 참조되는 스택)

| Library | Version | Purpose | 관련 요구사항 |
|---------|---------|---------|-------------|
| `better-sqlite3` | 12.6.x | SQLite WAL 모드 DB | OPER-01 (데몬 시작 DB 초기화), OPER-02 (parent_id/batch_index) |
| `drizzle-orm` | 0.45.x | TypeScript 스키마 정의 | OPER-02 (transactions 테이블 컬럼 추가) |
| `hono` | 4.x | HTTP API 서버 | OPER-01 (데몬 시작 서버 바인딩 타임아웃) |
| `sodium-native` | latest | 키스토어 암호화 | OPER-01 (키스토어 해제 타임아웃) |
| 가격 오라클 3종 | - | CoinGecko/Pyth/Chainlink | OPER-03 (다중 소스 충돌 해결) |

### Installation

추가 설치 없음. 모든 의존성은 기존 설계 문서에서 확정되어 있다.

## Architecture Patterns

### Pattern 1: 데몬 시작 타임아웃 테이블 (OPER-01)

**What:** 28-daemon §2의 7단계(문서에서는 6단계로 묶어 표현) 시작 절차 각각에 타임아웃과 fail-fast/soft 정책을 테이블로 정의한다.

**현재 상태 분석:**

28-daemon-lifecycle-cli.md §2에 이미 7단계 시작 시퀀스가 상세 의사코드와 함께 정의되어 있다:

| Step | 작업 | 현재 상태 |
|------|------|----------|
| 1 | 환경 검증 (config.toml, flock) | 의사코드 있음, 타임아웃 미정의 |
| 2 | DB 초기화 (better-sqlite3, migrate) | 의사코드 있음, 타임아웃 미정의 |
| 3 | 키스토어 잠금 해제 (Argon2id) | 의사코드 있음, "~1-3초" 시간 추정만 있음 |
| 4 | 어댑터 초기화 (RPC connect) | 의사코드 있음, fail-soft 기술됨, 체인당 타임아웃 미정의 |
| 5 | HTTP 서버 시작 (Hono serve) | 의사코드 있음, 포트 충돌 에러만 기술 |
| 6 | 백그라운드 워커 시작 | 의사코드 있음, fail-fast 아님이라고 기술 |
| 7 | PID/Ready | 의사코드 있음 |

**v0.10에서 확정된 타임아웃 값 (objectives 문서):**

| 단계 | 타임아웃 | 실패 정책 | 에러 코드 |
|------|---------|----------|----------|
| Step 1 (flock + config) | 5초 | fail-fast | DAEMON_ALREADY_RUNNING / CONFIG_LOAD_ERROR |
| Step 2 (SQLite + migration) | 30초 | fail-fast | DB_MIGRATION_TIMEOUT |
| Step 3 (Keystore Argon2id) | 30초 | fail-fast | KEYSTORE_UNLOCK_TIMEOUT |
| Step 4 (Adapter RPC) | 10초/체인 | fail-soft | 경고 로그 + 체인 비활성화 |
| Step 5 (HTTP serve) | 5초 | fail-fast | PORT_BIND_ERROR |
| 전체 상한 | 90초 | 강제 종료 | DAEMON_STARTUP_TIMEOUT |

**주의:** v0.10 objectives에서는 Step 1을 "daemon.lock (flock)" + "config.toml 로드"로 분리하여 각 5초를 부여하고, Step 6(워커)과 Step 7(PID/Ready)은 타임아웃 대상에서 제외했다. 28-daemon 문서의 7단계와 v0.10의 6단계 간 매핑을 명확히 해야 한다.

**추가 필요 사항:**
- 전체 90초 상한을 구현하기 위한 `AbortController` 또는 `setTimeout` 기반 전체 타임아웃 래퍼
- Step 6(워커)과 Step 7(PID)이 타임아웃 대상에서 제외되는 이유 문서화 (워커는 비동기 시작, PID는 파일 I/O로 즉시 완료)

**Confidence:** HIGH - v0.10 objectives에 구체적 값이 확정되어 있으므로 그대로 반영하면 된다.

### Pattern 2: 부모-자식 2계층 DB 저장 (OPER-02)

**What:** transactions 테이블에 parent_id + batch_index 컬럼을 추가하고, 60-batch-tx §4에 2계층 저장 전략을 정의한다.

**현재 상태 분석:**

60-batch-tx §6에 현재 "단일 레코드" 저장 전략이 정의되어 있다:
- 배치는 transactions 테이블에 1건(type='BATCH')으로 기록
- 개별 instruction 상세는 `metadata` JSON 컬럼에 저장

v0.10에서 이를 **부모-자식 2계층**으로 변경:
- 부모 레코드: type='BATCH', 전체 상태 관리
- 자식 레코드: 개별 instruction별 N건, parent_id로 부모 참조, batch_index로 순서 보장

**25-sqlite transactions 테이블 현재 스키마:**

```sql
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  chain TEXT NOT NULL,
  tx_hash TEXT,
  type TEXT NOT NULL CHECK (type IN ('TRANSFER','TOKEN_TRANSFER','CONTRACT_CALL','APPROVE','BATCH')),
  amount TEXT,
  to_address TEXT,
  token_mint TEXT,
  contract_address TEXT,
  method_signature TEXT,
  spender_address TEXT,
  approved_amount TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','QUEUED','EXECUTING','SUBMITTED','CONFIRMED','FAILED','CANCELLED','EXPIRED')),
  tier TEXT CHECK (tier IN ('INSTANT','NOTIFY','DELAY','APPROVAL') OR tier IS NULL),
  queued_at INTEGER,
  executed_at INTEGER,
  created_at INTEGER NOT NULL,
  error TEXT,
  metadata TEXT
);
```

**추가할 컬럼:**

```sql
parent_id TEXT REFERENCES transactions(id),   -- 부모 배치 TX (NULL = 단독 TX)
batch_index INTEGER,                           -- 배치 내 순서 (0-based, NULL = 단독 TX)
```

**PARTIAL_FAILURE 상태 추가:**

현재 status CHECK 제약에 'PARTIAL_FAILURE'가 없다. v0.10에서 EVM 부분 실패 시 부모 상태로 사용.

```sql
-- status CHECK 변경: PARTIAL_FAILURE 추가
CHECK (status IN ('PENDING','QUEUED','EXECUTING','SUBMITTED','CONFIRMED',
                  'FAILED','CANCELLED','EXPIRED','PARTIAL_FAILURE'))
```

**핵심 결정 사항:**
1. parent_id는 자기 참조 FK (transactions -> transactions)
2. batch_index는 0부터 시작, instruction 순서와 일치
3. 자식 레코드의 tx_hash는 Solana 원자적 배치에서 부모와 동일 (공유)
4. PARTIAL_FAILURE는 부모에만 적용 (자식은 CONFIRMED 또는 FAILED)
5. 인덱스 추가: `idx_transactions_parent_id ON transactions(parent_id)` (배치 자식 조회용)

**60-batch-tx §6 기존 "단일 레코드" 전략과의 관계:**
- 기존 §6의 단일 레코드 전략을 2계층으로 교체
- metadata JSON의 batch_instructions는 자식 레코드로 정규화되므로, metadata에는 batch_size, total_native_amount, ata_created, compute_units_consumed 등 요약 정보만 유지
- 기존 §6.3 감사 컬럼 채우기 규칙은 부모 레코드에 적용 (기존과 동일)

**Confidence:** HIGH - v0.10 objectives에 구체적 스키마와 상태 전이가 확정되어 있다.

### Pattern 3: 다중 소스 충돌 해결 + Stale 스킵 (OPER-03)

**What:** 61-price-oracle §3.6에 10% 괴리 시 보수적 선택 로직을 구체화하고, stale(>30분) 가격 시 USD 평가 스킵 정책을 추가한다.

**현재 상태 분석:**

61-price-oracle에는 이미 상당한 기반이 있다:

1. **OracleChain §3.6:** 다중 소스 순차 시도 패턴 구현체 코드가 있으나, crossValidatePrice()는 §7.1.1에 "비동기 백그라운드 검증"으로만 언급되어 있고 OracleChain.getPrice() 내부에서 실제로 교차 검증을 수행하는 플로우가 없다.

2. **crossValidatePrice() §7.1.1:** 10% 불일치 시 경고 로그 + 감사 로그 기록 코드가 있으나, "높은 가격 채택" 로직이 반환값에 반영되지 않는다 (현재는 감지만 하고 Primary 가격을 그대로 반환).

3. **Stale 처리 §5.2~5.4:**
   - stale 가격(>5분, <30분) 시 `isStale=true`로 반환 + INSTANT->NOTIFY 보수적 상향 (§5.3) -- 이미 정의됨
   - >30분(staleMaxAge 초과) 시 PriceNotAvailableError -> Phase 22-23 과도기 fallback (§5.4) -- 이미 정의됨
   - 그러나 v0.10에서 요구하는 ">30분 시 USD 평가 스킵 -> 네이티브 금액 전용 평가" 정책이 §3.6에 명시적으로 연결되어 있지 않다

**v0.10에서 확정된 충돌 해결 로직:**

```
OracleChain 가격 조회:
  1. Primary(CoinGecko) 조회
  2. Primary 성공 + TTL 내 -> Primary 가격 반환
  3. Primary 실패 또는 stale -> Fallback(Pyth/Chainlink) 조회
  4. 양쪽 모두 성공 시 교차 검증:
     deviation = |primary - fallback| / primary
     if deviation > 0.10 (10%):
       -> 보수적 선택: 높은 가격 채택
       -> PRICE_DEVIATION_WARNING 감사 로그
       -> SYSTEM_WARNING 알림 이벤트
     else:
       -> Primary 가격 채택
```

**v0.10에서 확정된 stale 정책 동작:**

| 가격 상태 | 나이 | 정책 평가 동작 |
|-----------|------|---------------|
| FRESH | < 5분 | 정상 USD 평가 |
| AGING | 5분~30분 | 정상 USD 평가 + PRICE_STALE 경고 로그 |
| STALE | > 30분 | USD 평가 **스킵** -> 네이티브 금액만으로 티어 결정 + PRICE_UNAVAILABLE 감사 로그 |
| UNAVAILABLE | 오라클 전체 실패 | USD 평가 스킵 -> 네이티브 금액만으로 티어 결정 + 알림 |

**핵심 변경 사항:**
1. OracleChain.getPrice() 내부에서 Primary 성공 후 교차 검증을 동기적으로 수행하고, 불일치 시 `Math.max(primaryPrice, fallbackPrice)` 채택
2. 61-price-oracle §3.6에 교차 검증 플로우를 OracleChain 코드에 인라인으로 추가
3. §5에 "STALE(>30분) = USD 평가 스킵" 정책을 resolveEffectiveAmountUsd()와 연결하는 명시적 조건 추가

**Confidence:** HIGH - v0.10 objectives에 구체적 로직이 확정되어 있고, 기존 61-price-oracle에 기반 코드가 이미 존재한다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 데몬 시작 타임아웃 | 직접 타이머 관리 | `AbortSignal.timeout(ms)` + `Promise.race` | Node.js 22 네이티브, cleanup 자동 |
| 전체 90초 상한 | 별도 워치독 프로세스 | `AbortController` + `setTimeout(90000)` | 단일 프로세스 내 관리 충분 |
| SQLite 마이그레이션 | 수동 ALTER TABLE | `drizzle-kit` | 스키마 변경 추적 + 롤백 지원 |
| 가격 비교 로직 | 복잡한 통계 기반 비교 | 단순 퍼센트 편차 계산 | VWAP 등 과도한 복잡성 불필요 (설계 결정) |

**Key insight:** 이 Phase의 모든 작업은 기존 설계 문서 텍스트 보완이다. 코드를 작성하는 것이 아니라 구현자가 참고할 설계 명세를 완결하는 것이므로, "구현 패턴"보다 "명세 작성 정확성"이 핵심이다.

## Common Pitfalls

### Pitfall 1: 28-daemon 7단계 vs v0.10 6단계 매핑 불일치

**What goes wrong:** v0.10 objectives에서는 6단계로 기술하지만, 28-daemon 문서는 7단계(Step 1~7)로 구성되어 있다. v0.10의 Step 1이 28-daemon의 "환경 검증"(flock + config.toml) 전체를 포함하고, v0.10의 Step 2~4가 28-daemon의 Step 2~4에 대응하며, v0.10의 Step 5가 28-daemon의 Step 4(어댑터), v0.10의 Step 6이 28-daemon의 Step 5(HTTP)에 대응한다.

**Why it happens:** v0.10 objectives는 간결한 요약이고 28-daemon은 상세 설계이므로 단계 번호가 다르다.

**How to avoid:** 28-daemon §2에 타임아웃 테이블을 추가할 때, 28-daemon의 기존 Step 1~7 번호 체계를 유지하고 v0.10의 6단계 매핑을 주석으로 명시한다. 기존 문서 구조를 변경하지 않는다.

**Warning signs:** Step 번호가 v0.10과 28-daemon 사이에서 혼재되어 쓰이는 경우.

### Pitfall 2: PARTIAL_FAILURE 상태의 적용 범위 혼동

**What goes wrong:** PARTIAL_FAILURE를 Solana 원자적 배치에도 적용하려 할 수 있다. Solana는 원자적이므로 부분 실패가 불가능하다.

**Why it happens:** v0.10에서 EVM 순차 배치에 대한 PARTIAL_FAILURE를 정의했는데, 현재 설계에서는 EVM 배치가 미지원(BATCH_NOT_SUPPORTED)이므로 PARTIAL_FAILURE가 당장 사용되지 않는다.

**How to avoid:** 60-batch-tx §4에 PARTIAL_FAILURE가 EVM 순차 배치 전용이라는 점을 명시하고, 현재 Solana-only 배치에서는 CONFIRMED 또는 FAILED만 발생한다고 기술한다. PARTIAL_FAILURE는 향후 EVM 배치 지원 시를 위한 예비 상태로 문서화한다.

**Warning signs:** Solana 배치의 상태 전이 다이어그램에 PARTIAL_FAILURE가 포함되어 있는 경우.

### Pitfall 3: stale 가격 판단 기준의 이중 정의

**What goes wrong:** 기존 61-price-oracle §5.3에서는 TTL 만료(5분) 후 isStale=true로 INSTANT->NOTIFY 보수적 상향을 적용하고, v0.10에서는 >30분 시 USD 평가 자체를 스킵한다. 이 두 로직이 조합되는 방식이 불명확하면 구현자가 혼란을 겪는다.

**Why it happens:** 5분~30분 구간("AGING")과 30분 초과 구간("STALE")의 처리가 다른 메커니즘이다. AGING은 가격을 사용하되 보수적으로 상향, STALE은 가격 자체를 버리고 네이티브 전용 평가.

**How to avoid:** §3.6에 가격 나이별 3단계 처리를 단일 테이블로 명확히 정의:
- FRESH(<5분): 정상 USD 평가
- AGING(5분~30분): USD 평가 + isStale=true + adjustTierForStalePrice()
- STALE(>30분): USD 평가 스킵, 네이티브 전용 (PriceNotAvailableError -> applyFallbackStrategy)

**Warning signs:** "stale"이라는 단어가 5분과 30분 모두에 사용되어 구분이 불명확한 경우.

### Pitfall 4: 자기 참조 FK의 삭제 정책 미고려

**What goes wrong:** `parent_id TEXT REFERENCES transactions(id)` 추가 시 ON DELETE 정책을 지정하지 않으면, 부모 레코드 삭제 시 자식이 고아 레코드가 되거나 FK 위반이 발생한다.

**Why it happens:** 기존 transactions 테이블의 FK(agent_id RESTRICT, session_id SET NULL)와 다른 요구사항을 가진다.

**How to avoid:** parent_id의 ON DELETE 정책을 명시적으로 정의한다. 부모 배치가 삭제되면 자식도 함께 삭제되어야 하므로 `ON DELETE CASCADE`가 적절하다. 또는 거래 기록 보존 원칙(agents RESTRICT)에 따라 부모 삭제를 금지하고 `ON DELETE RESTRICT`를 사용할 수도 있다. v0.10 objectives는 이를 명시하지 않으므로, 기존 설계 원칙(거래 기록 보존)에 따라 판단해야 한다.

**Recommendation:** `ON DELETE CASCADE` -- 부모 배치와 자식 instruction은 논리적 단위이므로 함께 관리. 다만 거래 기록 보존 원칙상 삭제 자체가 드물므로 실질적 영향은 제한적.

## Code Examples

### Example 1: 데몬 시작 타임아웃 테이블 (OPER-01 추가 대상)

```markdown
<!-- 28-daemon §2에 추가할 타임아웃 테이블 -->

### 2.x 시작 단계별 타임아웃 + fail-fast/soft 정책

| Step | 작업 | 타임아웃 | 실패 정책 | 에러 코드 | 비고 |
|------|------|---------|----------|----------|------|
| 1 | 환경 검증 (flock + config.toml + Zod) | **5초** | fail-fast | DAEMON_ALREADY_RUNNING / CONFIG_LOAD_ERROR | flock 획득 + TOML 파싱 + Zod 검증 포함 |
| 2 | DB 초기화 (better-sqlite3 + PRAGMA + migrate) | **30초** | fail-fast | DB_MIGRATION_TIMEOUT | 대규모 마이그레이션 시 시간 소요 가능 |
| 3 | 키스토어 잠금 해제 (Argon2id + AES-GCM) | **30초** | fail-fast | KEYSTORE_UNLOCK_TIMEOUT | Argon2id ~1-3초 + 다수 에이전트 키 복호화 |
| 4 | 어댑터 초기화 (RPC connect + healthCheck) | **10초/체인** | **fail-soft** | 경고 로그 | 해당 체인 비활성화, 데몬은 계속 시작 |
| 5 | HTTP 서버 시작 (Hono serve 127.0.0.1) | **5초** | fail-fast | PORT_BIND_ERROR | 포트 충돌(EADDRINUSE) 포함 |
| 6 | 백그라운드 워커 시작 | 타임아웃 없음 | fail-soft | - | 비동기 시작, 개별 실패 시 다음 주기 재시도 |
| 7 | PID 파일 기록 + Ready 메시지 | 타임아웃 없음 | fail-fast | - | 파일 I/O 즉시 완료 |

**전체 시작 시간 상한: 90초.** 전 단계 합계가 90초를 초과하면 강제 종료한다.

> Step 4만 fail-soft이고, Step 6-7은 타임아웃 대상 외이다. 나머지(1,2,3,5)는 모두 fail-fast.
```

### Example 2: 부모-자식 2계층 DB 컬럼 (OPER-02 추가 대상)

```typescript
// 25-sqlite-schema.md transactions 테이블에 추가할 컬럼 (Drizzle ORM)

// ── 배치 관련 (v0.10 추가) ──
parentId: text('parent_id')
  .references(() => transactions.id, { onDelete: 'cascade' }),  // 부모 배치 TX (NULL = 단독 TX)
batchIndex: integer('batch_index'),                              // 배치 내 순서 (0-based, NULL = 단독 TX)
```

```sql
-- DDL 변경
ALTER TABLE transactions ADD COLUMN parent_id TEXT REFERENCES transactions(id) ON DELETE CASCADE;
ALTER TABLE transactions ADD COLUMN batch_index INTEGER;
CREATE INDEX idx_transactions_parent_id ON transactions(parent_id) WHERE parent_id IS NOT NULL;

-- status CHECK 변경: PARTIAL_FAILURE 추가
-- 주의: SQLite는 ALTER TABLE으로 CHECK 변경 불가. 마이그레이션에서 테이블 재생성 필요.
```

### Example 3: 보수적 가격 채택 의사코드 (OPER-03 추가 대상)

```typescript
// 61-price-oracle §3.6 OracleChain.getPrice() 교차 검증 확장

async getPrice(token: TokenRef): Promise<PriceInfo> {
  let lastError: Error | undefined
  let primaryPrice: PriceInfo | undefined

  for (let i = 0; i < this.oracles.length; i++) {
    try {
      const price = await this.oracles[i].getPrice(token)

      if (i === 0) {
        // Primary 성공: 교차 검증 시도
        primaryPrice = price
        if (this.oracles.length > 1) {
          try {
            const fallbackPrice = await this.oracles[1].getPrice(token)
            const deviation = Math.abs(
              (price.usdPrice - fallbackPrice.usdPrice) / price.usdPrice
            ) * 100

            if (deviation > 10) {
              // 10% 초과 괴리: 높은 가격 채택 (보수적)
              const conservativePrice = price.usdPrice >= fallbackPrice.usdPrice
                ? price : fallbackPrice
              // 감사 로그 + 알림
              await this.logPriceDeviation(token, price, fallbackPrice, deviation)
              return conservativePrice
            }
          } catch {
            // 교차 검증 실패: Primary 신뢰
          }
        }
        return price
      }

      return price  // Fallback 성공
    } catch (error) {
      lastError = error as Error
      continue
    }
  }

  // 모든 소스 실패: stale 캐시
  const cacheKey = `${token.chain}:${token.address}`
  const stale = this.sharedCache.getStale(cacheKey)
  if (stale) {
    return { ...stale.price, source: 'cache', isStale: true }
  }

  throw new PriceNotAvailableError(token, lastError)
}
```

## State of the Art

이 Phase는 설계 문서 보완이므로 기술 진화와 무관하다. 기존 설계 결정을 유지한다.

| 기존 설계 | 변경 여부 | 이유 |
|-----------|----------|------|
| AbortSignal.timeout() for Node.js 타임아웃 | 유지 | Node.js 22 네이티브 |
| SQLite self-referencing FK | 유지 | Drizzle ORM 지원 |
| CoinGecko Demo API 30 calls/min | 유지 | 무료 티어 충분 |
| PriceCache 5분 TTL + 30분 stale | 유지 | v0.10에서 재확인 |

## Open Questions

### 1. parent_id ON DELETE 정책

- **What we know:** v0.10 objectives에서 `parent_id TEXT REFERENCES transactions(id)` 추가를 명시했으나 ON DELETE 정책은 미지정
- **What's unclear:** CASCADE vs RESTRICT 어느 것이 거래 기록 보존 원칙에 부합하는지
- **Recommendation:** CASCADE 사용. 부모-자식은 논리적 단위이므로 함께 관리. 거래 기록 보존은 agents RESTRICT에서 보장(에이전트 삭제 시 거래 보존). 부모 배치 삭제가 발생하는 시나리오 자체가 드뭄

### 2. PARTIAL_FAILURE 상태의 현실적 사용 시점

- **What we know:** 현재 EVM 배치는 BATCH_NOT_SUPPORTED로 미지원. PARTIAL_FAILURE는 EVM 순차 배치 전용
- **What's unclear:** v0.10에서 PARTIAL_FAILURE를 status CHECK에 추가하면, 현재 미사용 상태인 enum 값이 DB에 존재하게 됨
- **Recommendation:** 추가한다. 미래 호환성을 위해 status CHECK에 PARTIAL_FAILURE를 포함하되, 현재 Solana-only 배치에서는 사용하지 않음을 주석으로 명시. 마이그레이션 비용이 아닌 설계 문서 수정이므로 부담 없음

### 3. 교차 검증의 동기/비동기 전환

- **What we know:** 기존 §7.1.1은 "비동기 백그라운드 검증"으로 기술. v0.10은 "양쪽 모두 성공 시 교차 검증"으로 동기적 흐름 암시
- **What's unclear:** 교차 검증을 동기적으로 수행하면 Fallback API 호출 시간이 추가되어 latency 증가
- **Recommendation:** v0.10 objectives를 따라 **동기적** 교차 검증을 OracleChain.getPrice()에 인라인. 이유: 보수적 가격 채택을 반환값에 반영하려면 동기적이어야 한다. Fallback 호출 타임아웃(5초)은 이미 설정되어 있어 최악의 경우 추가 5초

## Sources

### Primary (HIGH confidence)

- `.planning/deliverables/28-daemon-lifecycle-cli.md` - 7단계 시작 시퀀스 전체 의사코드 확인
- `docs/60-batch-transaction-spec.md` - §6 현재 단일 레코드 저장 전략 확인
- `.planning/deliverables/25-sqlite-schema.md` - transactions 테이블 현재 스키마 + 컬럼 상세 확인
- `docs/61-price-oracle-spec.md` - §3.6 OracleChain, §5 stale 처리, §7.1.1 교차 검증 확인
- `objectives/v0.10-pre-implementation-design-completion.md` - Phase D 확정 내용 (D-1, D-2, D-3)
- `.planning/phases/41-policy-engine-completion/41-01-SUMMARY.md` - Phase 41의 25-sqlite 수정 완료 확인 (PLCY-01: rules SSoT)

### Secondary (MEDIUM confidence)

- `objectives/v1.0-implementation-planning.md` - 구현 로드맵 맥락 확인

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 새 라이브러리 없음, 기존 설계 확인만
- Architecture: HIGH - v0.10 objectives에 구체적 설계 내용이 확정되어 있음
- Pitfalls: HIGH - 기존 문서 분석으로 교차점과 혼동 가능성을 식별함

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (설계 문서 보완이므로 30일)
