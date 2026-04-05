# Phase 43: 동시성 + 실행 로직 완결 - Research

**Researched:** 2026-02-09
**Domain:** 트랜잭션 파이프라인 실행 로직, SQLite 동시성 제어, 상태 머신 ACID 패턴
**Confidence:** HIGH

## Summary

Phase 43은 세 개의 기존 설계 문서(32-pipeline, 53-session-renewal, 36-killswitch)에서 구현자가 **추측 없이** 코드를 작성할 수 있도록 누락된 동시성/실행 로직을 채우는 작업이다. 새로운 아키텍처나 라이브러리를 도입하지 않으며, 이미 확정된 기술 스택(better-sqlite3, jose, IChainAdapter)과 패턴(BEGIN IMMEDIATE, ChainError category 3-분류) 위에서 **의사코드 수준의 완전한 로직**을 문서에 추가한다.

세 요구사항의 공통 주제는 **SQLite 단일 프로세스 환경에서의 동시성 안전성 확보**이다. CONC-01은 Stage 5의 build->simulate->sign->submit 4단계를 ChainError category 기반 에러 분기와 티어별 타임아웃으로 완전히 기술한다. CONC-02는 세션 갱신의 기존 `WHERE id = :id` 패턴을 `WHERE id = :id AND token_hash = :currentTokenHash` 낙관적 잠금으로 강화하고, 변경 행이 0이면 RENEWAL_CONFLICT(409)를 반환하는 명시적 패턴을 추가한다. CONC-03은 Kill Switch의 세 상태 전이 모두에 `WHERE value = :expectedState` CAS(Compare-And-Swap) 조건을 추가하여 동시 발동/복구 레이스를 방지한다.

**Primary recommendation:** 세 요구사항 모두 기존 설계 문서의 특정 섹션에 의사코드를 추가/수정하는 작업이므로, 각 설계 문서별로 1개씩 총 3개 plan으로 분리하여 독립적으로 실행한다.

## Standard Stack

### Core

이 Phase는 새로운 라이브러리를 추가하지 않는다. 기존 스택을 그대로 사용한다.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | 11.x | SQLite 동기 드라이버, BEGIN IMMEDIATE 트랜잭션 | 프로젝트 전체 DB 접근 레이어. `.immediate()` 호출이 핵심 동시성 원시 도구 |
| drizzle-orm | 0.36.x | ORM + 쿼리 빌더 | Zod SSoT -> Drizzle 스키마 파이프라인의 일부 |
| jose | 5.x | JWT 생성/검증 (HS256) | 세션 토큰 발급, 갱신 시 새 JWT 생성 |
| viem | 2.x | EVM adapter 기반 | IChainAdapter EVM 구현 |
| @solana/kit | 3.x | Solana adapter 기반 | IChainAdapter Solana 구현 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sodium-native | 4.x | 개인키 메모리 보호 (guarded memory, memzero) | Stage 5c 서명 후 키 제거 |
| node:crypto | built-in | SHA-256 해시 (token_hash 계산) | 세션 갱신 시 새 token_hash 생성 |

### Alternatives Considered

해당 없음. 이 Phase는 기존 확정된 스택 위에서 로직만 추가한다.

## Architecture Patterns

### Pattern 1: Stage 5 완전 실행 루프 (CONC-01)

**What:** build -> simulate -> sign -> submit 4단계를 외부 retry 루프로 감싸고, ChainError category에 따라 분기하는 패턴. 티어별 타임아웃을 AbortController로 제어한다.

**When to use:** 모든 트랜잭션의 Stage 5 실행 시.

**핵심 구조:**
```
executeStage5(txId, request, tier):
  timeout = tier in [INSTANT, NOTIFY] ? 30_000 : 60_000
  controller = new AbortController()
  timer = setTimeout(() => controller.abort(), timeout)

  retryCount = 0
  try:
    RETRY_LOOP:
    while true:
      unsignedTx = build(request)          // 5a
      simResult = simulate(unsignedTx)     // 5b
      signedTx = sign(unsignedTx)          // 5c
      submitResult = submit(signedTx)      // 5d
      return submitResult

    catch (err):
      if err instanceof ChainError:
        switch err.category:
          case 'PERMANENT': throw (즉시 FAILED)
          case 'TRANSIENT':
            if retryCount < 3:
              await backoff(retryCount)     // 1s, 2s, 4s
              retryCount++
              continue from FAILED STAGE
            throw
          case 'STALE':
            if retryCount < 1:
              retryCount++
              goto RETRY_LOOP (Stage 5a)    // 재빌드
            throw
  finally:
    clearTimeout(timer)
```

**Confidence:** HIGH -- ChainError category 분류(Phase 42-01 완료)와 기존 Stage 5 의사코드(32-pipeline 섹션 3)에서 직접 파생. 27-chain-adapter SS4.5 복구 전략 테이블이 SSoT.

### Pattern 2: 낙관적 잠금 (Optimistic Locking) with token_hash (CONC-02)

**What:** UPDATE의 WHERE 절에 현재 token_hash를 포함하여, 동시 갱신 시 첫 번째만 성공하고 두 번째는 `changes === 0`으로 감지되어 RENEWAL_CONFLICT(409)를 반환하는 패턴.

**When to use:** 세션 갱신(PUT /v1/sessions/:id/renew) 시.

**현재 상태 (53-session-renewal SS5.5):**
```sql
UPDATE sessions SET
  token_hash = ?,
  expires_at = ?,
  renewal_count = ?,
  last_renewed_at = ?
WHERE id = ?
```

**개선 후 (CONC-02):**
```sql
UPDATE sessions SET
  token_hash = :newTokenHash,
  expires_at = :newExpiresAt,
  renewal_count = renewal_count + 1,
  last_renewed_at = :now
WHERE id = :id AND token_hash = :currentTokenHash
```

`changes === 0`이면 다른 요청이 먼저 갱신한 것이므로:
```typescript
if (result.changes === 0) {
  return {
    success: false,
    error: {
      code: 'RENEWAL_CONFLICT',
      message: '다른 요청이 먼저 세션을 갱신했습니다. 새 토큰으로 재시도하세요.',
      status: 409,
    },
  }
}
```

**Confidence:** HIGH -- better-sqlite3의 `.immediate()` + `result.changes` 패턴은 프로젝트 전체에서 확립됨 (34-owner-wallet-connection의 `markOwnerVerified()` 선례).

### Pattern 3: CAS (Compare-And-Swap) 상태 전이 (CONC-03)

**What:** system_state 테이블의 kill_switch_status를 변경할 때, 반드시 `WHERE value = :expectedState` 조건을 포함하여 동시 상태 전이를 원자적으로 방지하는 패턴.

**When to use:** Kill Switch의 모든 상태 전이 (NORMAL->ACTIVATED, ACTIVATED->RECOVERING, RECOVERING->NORMAL, RECOVERING->ACTIVATED).

**현재 상태 (36-killswitch SS3.1):**
상태 전이 시퀀스 다이어그램과 코드에 `UPDATE system_state SET value = 'ACTIVATED'` 형태의 단순 UPDATE만 기술. WHERE 조건에 `key = 'kill_switch_status'`만 있고 현재 상태 검증이 없음.

**개선 후 (CONC-03):**
```sql
-- NORMAL -> ACTIVATED
UPDATE system_state
SET value = '"ACTIVATED"', updated_at = :now
WHERE key = 'kill_switch_status' AND value = '"NORMAL"'
-- changes === 0 이면 이미 ACTIVATED (409 KILL_SWITCH_ALREADY_ACTIVE)

-- ACTIVATED -> RECOVERING
UPDATE system_state
SET value = '"RECOVERING"', updated_at = :now
WHERE key = 'kill_switch_status' AND value = '"ACTIVATED"'
-- changes === 0 이면 이미 RECOVERING (409 RECOVERY_ALREADY_STARTED)

-- RECOVERING -> NORMAL
UPDATE system_state
SET value = '"NORMAL"', updated_at = :now
WHERE key = 'kill_switch_status' AND value = '"RECOVERING"'
-- changes === 0 이면 상태가 변경됨 (잘못된 복구 시도)

-- RECOVERING -> ACTIVATED (복구 실패 롤백)
UPDATE system_state
SET value = '"ACTIVATED"', updated_at = :now
WHERE key = 'kill_switch_status' AND value = '"RECOVERING"'
```

**Confidence:** HIGH -- 동일 패턴이 34-owner-wallet-connection의 markOwnerVerified()에서 `WHERE owner_verified = 0`으로 이미 사용 중. SQLite BEGIN IMMEDIATE + CAS는 단일 프로세스에서 완전 안전.

### Anti-Patterns to Avoid

- **SELECT 후 UPDATE 레이스:** `SELECT status FROM system_state` -> 확인 -> `UPDATE SET status` 패턴은 SELECT와 UPDATE 사이에 다른 요청이 끼어들 수 있음. 반드시 `UPDATE ... WHERE value = :expected` 후 `changes` 확인으로 원자적 CAS 수행.
- **TRANSIENT 에러 무한 재시도:** max retry 없이 TRANSIENT 에러를 재시도하면 무한 루프. 반드시 max 3회 + 전체 타임아웃으로 이중 제한.
- **Stage 5 부분 상태 불일치:** simulate 성공 후 sign에서 실패하면 DB 상태가 EXECUTING인데 실제로는 실행되지 않은 상태. 각 단계 실패 시 DB 상태를 정확히 롤백해야 함.
- **STALE 에러 시 동일 단계 재시도:** STALE은 "데이터가 오래됨"이므로 동일 빌드 결과를 재제출하면 같은 에러 반복. 반드시 Stage 5a(buildTransaction)부터 재실행해야 함.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite 동시성 제어 | 커스텀 mutex/lock | better-sqlite3 `.immediate()` + `changes` 확인 | SQLite BEGIN IMMEDIATE가 프로세스 레벨 직렬화를 보장 |
| 지수 백오프 | 커스텀 sleep 로직 | 단순 `await setTimeout(1000 * 2^retryCount)` | 3회 제한이므로 라이브러리 불필요. 1s, 2s, 4s 고정 |
| 타임아웃 제어 | 커스텀 타이머 | `AbortController` + `setTimeout` | Node.js 표준 패턴, IChainAdapter 메서드에 signal 전달 |
| JWT 생성 | 커스텀 토큰 | jose `SignJWT` | 기존 세션 토큰 생성과 동일 패턴 |

**Key insight:** 이 Phase의 모든 동시성 문제는 SQLite의 단일 프로세스 직렬화 특성으로 해결된다. 분산 락이나 Redis 같은 외부 도구가 불필요한 것이 Self-Hosted 아키텍처의 핵심 장점이다.

## Common Pitfalls

### Pitfall 1: Stage 5 타임아웃과 blockhash 수명 불일치
**What goes wrong:** INSTANT 티어에 60초 타임아웃을 설정하면 Solana blockhash(~60초 수명)가 만료된 후에도 재시도를 계속하여 무의미한 에러 반복.
**Why it happens:** blockhash는 약 60초 수명이므로, 타임아웃이 이를 초과하면 STALE 재빌드가 반복됨.
**How to avoid:** INSTANT/NOTIFY=30초 (blockhash 수명의 절반), DELAY/APPROVAL=60초 (승인 후 새 blockhash로 빌드하므로 여유). 이 값은 32-pipeline SS3 Stage 5에 이미 30초로 명시되어 있으나, 티어별 분기가 미정의.
**Warning signs:** STALE 재시도 후 동일 STALE 에러 재발생.

### Pitfall 2: 세션 갱신 RENEWAL_CONFLICT 후 클라이언트 처리
**What goes wrong:** RENEWAL_CONFLICT(409)를 받은 에이전트가 구 토큰으로 다시 갱신을 시도하면 401(AUTH_TOKEN_INVALID) 발생.
**Why it happens:** 첫 번째 갱신이 token_hash를 교체했으므로 구 토큰은 이미 무효.
**How to avoid:** 409 응답에 `retryable: false`를 명시하고, 클라이언트는 새 API 요청(인증 포함)으로 현재 세션 상태를 확인해야 함. 실제로 동일 에이전트의 단일 프로세스에서는 동시 갱신이 거의 발생하지 않음 -- 이 패턴은 방어적 설계.
**Warning signs:** 409 후 즉시 401 에러 로그 연속 발생.

### Pitfall 3: Kill Switch CAS 실패 시 에러 메시지 혼동
**What goes wrong:** `changes === 0`을 "시스템 오류"로 처리하면 사용자에게 잘못된 메시지 전달.
**Why it happens:** CAS 실패는 "이미 다른 요청이 상태를 변경함"을 의미하지 "오류"가 아님.
**How to avoid:** 전이별 적절한 409 에러 코드 매핑: NORMAL->ACTIVATED 실패 = KILL_SWITCH_ALREADY_ACTIVE, ACTIVATED->RECOVERING 실패 = RECOVERY_ALREADY_STARTED, 등.
**Warning signs:** 동시 Kill Switch 발동 시 500 에러 반환.

### Pitfall 4: TRANSIENT 재시도 시 실패한 단계 vs Stage 5a 혼동
**What goes wrong:** TRANSIENT 에러(RPC_ERROR 등)를 STALE처럼 Stage 5a부터 재실행하면 불필요한 비용 발생.
**Why it happens:** TRANSIENT은 "동일 요청 재시도"이므로 실패한 정확한 단계에서 재시도해야 함. 예: simulate에서 RPC_ERROR 발생 시 simulate만 재시도.
**How to avoid:** 에러 발생 단계를 추적하고, TRANSIENT은 해당 단계에서 재시도, STALE은 Stage 5a로 복귀. EVM_GAS_TOO_LOW는 TRANSIENT이지만 gas limit 상향이 필요하므로 Stage 5a 재빌드 필요 (특수 케이스).
**Warning signs:** TRANSIENT 에러 시 블록체인 RPC 호출 횟수가 예상보다 많음.

### Pitfall 5: Kill Switch 캐스케이드와 CAS 패턴의 범위 혼동
**What goes wrong:** 6단계 캐스케이드(Step 1-6) 전체를 CAS로 감싸려 하면 구현이 복잡해짐.
**Why it happens:** CAS는 system_state의 kill_switch_status 전이에만 적용하면 됨. Step 1-3(세션 폐기, 거래 취소, 에이전트 정지)는 이미 BEGIN IMMEDIATE 트랜잭션 내에서 원자적.
**How to avoid:** CAS는 `kill_switch_status` UPDATE에만 적용. BEGIN IMMEDIATE 트랜잭션의 첫 문장으로 CAS UPDATE를 실행하고, changes === 0이면 즉시 롤백.
**Warning signs:** 캐스케이드 시작 후 상태 전이에 실패하여 부분 실행.

## Code Examples

### CONC-01: Stage 5 완전 의사코드 핵심 구조

```typescript
// Source: 32-pipeline Stage 5 + 27-chain-adapter SS4.5 복구 전략 테이블
// 이 패턴이 32-pipeline §5에 추가될 완전한 Stage 5 실행 루프

interface Stage5Options {
  txId: string
  request: TransactionRequest  // 5-type discriminatedUnion
  tier: 'INSTANT' | 'NOTIFY' | 'DELAY' | 'APPROVAL'
  adapter: IChainAdapter
  keyStore: ILocalKeyStore
  agentId: string
  db: DrizzleInstance
  sqlite: Database.Database
}

async function executeStage5(opts: Stage5Options): Promise<SubmitResult> {
  const { txId, request, tier, adapter, keyStore, agentId, db, sqlite } = opts

  // 티어별 타임아웃
  const timeoutMs = (tier === 'INSTANT' || tier === 'NOTIFY') ? 30_000 : 60_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let retryCount = 0
  let lastError: ChainError | undefined

  try {
    // 외부 재시도 루프 (STALE은 여기로 복귀)
    buildLoop:
    while (!controller.signal.aborted) {
      try {
        // 5a: build
        const unsignedTx = await buildByType(adapter, request, agentId)

        // 5b: simulate
        const simResult = await adapter.simulateTransaction(unsignedTx)
        if (!simResult.success) {
          throw new ChainError({
            code: 'SIMULATION_FAILED',
            chain: request.chain,
            message: simResult.error ?? '시뮬레이션 실패',
            category: 'TRANSIENT',  // SS4.5 분류
          })
        }

        // 상태 전이: QUEUED -> EXECUTING
        transitionTo(sqlite, txId, 'QUEUED', 'EXECUTING')

        // 5c: sign (guarded memory)
        const privateKey = await keyStore.getPrivateKey(agentId)
        let signedTx: SignedTransaction
        try {
          signedTx = await adapter.signTransaction(unsignedTx, privateKey)
        } finally {
          sodium_memzero(privateKey)
        }

        // 5d: submit
        const submitResult = await adapter.submitTransaction(signedTx)

        // 상태 전이: EXECUTING -> SUBMITTED
        transitionTo(sqlite, txId, 'EXECUTING', 'SUBMITTED', { txHash: submitResult.txHash })

        return submitResult

      } catch (err) {
        if (!(err instanceof ChainError)) throw err
        lastError = err

        switch (err.category) {
          case 'PERMANENT':
            // 즉시 실패, 재시도 없음
            throw err

          case 'TRANSIENT':
            if (retryCount >= 3) throw err
            // 지수 백오프: 1s, 2s, 4s
            await sleep(1000 * Math.pow(2, retryCount))
            retryCount++
            // 실패한 단계에서 재시도 (EVM_GAS_TOO_LOW는 Stage 5a 재빌드)
            if (err.code === 'EVM_GAS_TOO_LOW') continue buildLoop
            continue  // 같은 단계 재시도 (내부 로직으로 분기)

          case 'STALE':
            if (retryCount >= 1) throw err
            retryCount++
            // Stage 5a로 복귀 (새 blockhash/nonce로 재빌드)
            continue buildLoop
        }
      }
    }

    // 타임아웃
    throw new WaiaasError('STAGE5_TIMEOUT', `Stage 5 타임아웃 (${timeoutMs}ms)`, 408)

  } finally {
    clearTimeout(timer)
  }
}
```

### CONC-02: 낙관적 잠금 세션 갱신 패턴

```typescript
// Source: 53-session-renewal SS5.5 기존 코드를 낙관적 잠금으로 강화
// WHERE 절에 token_hash 추가, changes 확인으로 RENEWAL_CONFLICT 감지

const updateTx = sqlite.transaction(() => {
  const result = sqlite.prepare(`
    UPDATE sessions SET
      token_hash = :newTokenHash,
      expires_at = :newExpiresAt,
      renewal_count = renewal_count + 1,
      last_renewed_at = :now
    WHERE id = :id AND token_hash = :currentTokenHash
  `).run({
    newTokenHash,
    newExpiresAt,
    now,
    id: sessionId,
    currentTokenHash: session.token_hash,  // 조회 시점의 token_hash
  })

  if (result.changes === 0) {
    // 다른 요청이 먼저 token_hash를 교체함
    throw new RenewalConflictError()
  }

  // 감사 로그 (동일 트랜잭션 내)
  sqlite.prepare(`
    INSERT INTO audit_log (id, event_type, actor, session_id, severity, details, timestamp)
    VALUES (?, 'SESSION_RENEWED', 'session', ?, 'info', ?, ?)
  `).run(generateUuidV7(), sessionId, JSON.stringify({ renewalCount: newRenewalCount }), now)
})

try {
  updateTx.immediate()
} catch (err) {
  if (err instanceof RenewalConflictError) {
    return {
      success: false,
      error: {
        code: 'RENEWAL_CONFLICT',
        message: '다른 요청이 먼저 세션을 갱신했습니다. 새 토큰으로 재시도하세요.',
        status: 409,
      },
    }
  }
  throw err
}
```

### CONC-03: Kill Switch CAS 상태 전이 패턴

```typescript
// Source: 36-killswitch SS3.1 캐스케이드 + 34-owner-wallet markOwnerVerified CAS 선례

// activate(): NORMAL -> ACTIVATED
const activateTx = sqlite.transaction(() => {
  const result = sqlite.prepare(`
    UPDATE system_state
    SET value = ?, updated_at = ?
    WHERE key = 'kill_switch_status' AND value = ?
  `).run('"ACTIVATED"', nowEpoch, '"NORMAL"')

  if (result.changes === 0) {
    throw new KillSwitchAlreadyActiveError()
  }

  // Step 1-3: 세션 폐기, 거래 취소, 에이전트 정지 (동일 트랜잭션 내)
  // ... 기존 캐스케이드 로직 ...
})

activateTx.immediate()  // BEGIN IMMEDIATE로 직렬화

// recover Step 1: ACTIVATED -> RECOVERING
const recoverStep1Tx = sqlite.transaction(() => {
  const result = sqlite.prepare(`
    UPDATE system_state
    SET value = ?, updated_at = ?
    WHERE key = 'kill_switch_status' AND value = ?
  `).run('"RECOVERING"', nowEpoch, '"ACTIVATED"')

  if (result.changes === 0) {
    // 현재 상태 조회하여 적절한 에러 반환
    const current = sqlite.prepare(
      'SELECT value FROM system_state WHERE key = ?'
    ).get('kill_switch_status')
    if (current?.value === '"NORMAL"') throw new KillSwitchNotActiveError()
    if (current?.value === '"RECOVERING"') throw new RecoveryAlreadyStartedError()
    throw new InvalidStateError()
  }
})

recoverStep1Tx.immediate()

// recover Step 2: RECOVERING -> NORMAL
const recoverStep2Tx = sqlite.transaction(() => {
  const result = sqlite.prepare(`
    UPDATE system_state
    SET value = ?, updated_at = ?
    WHERE key = 'kill_switch_status' AND value = ?
  `).run('"NORMAL"', nowEpoch, '"RECOVERING"')

  if (result.changes === 0) {
    throw new InvalidRecoveryStateError()
  }

  // 에이전트 재활성화 + kill_switch 관련 키 초기화 (동일 트랜잭션 내)
  // ...
})

recoverStep2Tx.immediate()
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stage 5: 4단계 순차 호출 (에러 분기 미정의) | Stage 5: 카테고리 기반 에러 분기 + 재시도 루프 | Phase 42 (2026-02-09) | ChainError category가 SSoT로 확정됨 |
| 세션 갱신: `WHERE id = ?` (자연 직렬화 의존) | `WHERE id = ? AND token_hash = ?` (명시적 낙관적 잠금) | Phase 43 (예정) | 동시 갱신 감지를 명시적 코드로 보장 |
| Kill Switch: 상태 확인 후 UPDATE (암시적 직렬화 의존) | `WHERE value = :expected` CAS (원자적) | Phase 43 (예정) | SELECT-then-UPDATE 레이스 제거 |

**현재 상태의 핵심:**
- 53-session-renewal SS5.4에서 "BEGIN IMMEDIATE가 자연스럽게 직렬화"한다고 기술하지만, 이는 WRITE 충돌 방지일 뿐 READ-WRITE 불일치를 방지하지 못함. SELECT로 token_hash를 읽은 후 UPDATE하기 전에 다른 요청이 끼어들 수 있음. 낙관적 잠금(WHERE token_hash = :current)이 이를 해결.
- 36-killswitch에서 시퀀스 다이어그램은 `상태 전이: NORMAL -> ACTIVATED`라고 기술하지만, 실제 SQL에 WHERE value = 'NORMAL' 조건이 없음. CAS 패턴 추가가 필요.

## Key Gaps in Existing Documents

### Gap 1: 32-pipeline §5 Stage 5 불완전성

**현재 상태:** Stage 5a-5d가 개별 단계로 기술되어 있으나, 다음이 누락:
1. 에러 발생 시 category 기반 분기 (PERMANENT/TRANSIENT/STALE)
2. 재시도 루프 구조 (어디서 재시작하는지)
3. 티어별 타임아웃 분기 (현재 "30초" 단일 값만 명시)
4. EVM_GAS_TOO_LOW 특수 처리 (TRANSIENT이지만 재빌드 필요)
5. SOLANA_BLOCKHASH_STALE 경량 복구 (refreshBlockhash vs 전체 재빌드)

**필요한 추가:** 완전한 executeStage5() 의사코드 + 에러 분기 플로우차트 + 타임아웃 테이블

### Gap 2: 53-session-renewal §5 낙관적 잠금 미적용

**현재 상태:** SS5.5 코드에 `WHERE id = ?`만 있음. SS5.4에서 BEGIN IMMEDIATE 직렬화를 설명하지만, 이는 "같은 시점에 두 트랜잭션이 쓰기를 시도할 때 하나가 SQLITE_BUSY"를 방지하는 것이지, "두 요청이 같은 세션 데이터를 읽은 후 순차적으로 UPDATE"하는 것을 방지하지 못함. 실제로 better-sqlite3의 `.immediate()`는 RESERVED lock을 획득하므로 동기 환경에서는 문제가 적으나, 명시적 낙관적 잠금이 설계 의도를 코드로 표현하고 RENEWAL_CONFLICT 에러 코드를 정의하는 데 필요.

**필요한 추가:** WHERE token_hash = :current 조건 + changes === 0 확인 + RENEWAL_CONFLICT 에러 정의

### Gap 3: 36-killswitch §3.1 CAS 미적용

**현재 상태:** 상태 전이가 "NORMAL -> ACTIVATED"로 서술되지만, SQL 수준에서 `WHERE value = '"NORMAL"'` 조건이 없음. `activate()` 함수 시작 부분에서 별도 SELECT로 상태를 확인하는 패턴도 가능하지만, CAS가 더 안전하고 코드가 간결함.

**필요한 추가:** 4개 전이(NORMAL->ACTIVATED, ACTIVATED->RECOVERING, RECOVERING->NORMAL, RECOVERING->ACTIVATED) 모두에 WHERE value = :expected + changes 확인

## Open Questions

1. **TRANSIENT 재시도의 정확한 "실패한 단계" 추적**
   - What we know: TRANSIENT은 "실패한 단계에서 재시도"가 원칙. simulate에서 실패하면 simulate만 재시도.
   - What's unclear: sign 단계에서 TRANSIENT 에러가 발생하는 케이스가 있는가? (현재 SS4.5에 sign 단계 TRANSIENT 에러 없음 -- sign은 로컬 연산이므로 TRANSIENT 불가능)
   - Recommendation: 의사코드에서 TRANSIENT 재시도 단계를 simulate와 submit으로 한정. build와 sign은 TRANSIENT이 발생하지 않는 것으로 가정. 이는 SS4.5 테이블과 일치.

2. **AbortController signal의 IChainAdapter 전달**
   - What we know: 타임아웃 시 AbortController.abort()로 취소해야 함.
   - What's unclear: 현재 IChainAdapter 메서드 시그니처에 `signal?: AbortSignal` 파라미터가 없음.
   - Recommendation: Stage 5 의사코드에서 AbortSignal 전달 패턴을 제시하되, IChainAdapter 메서드 시그니처 변경은 이 Phase 스코프 밖. 대신 각 단계 시작 전 `controller.signal.aborted` 체크로 구현.

3. **DELAY/APPROVAL 티어의 Stage 5 재진입 시 상태 관리**
   - What we know: DELAY/APPROVAL은 승인 후 Stage 5a부터 재실행 (새 blockhash 필요, 32-pipeline 736행).
   - What's unclear: 재진입 시 DB 상태가 QUEUED인지, 재진입 전 상태 검증이 필요한지.
   - Recommendation: 재진입은 Phase 8(정책 엔진)에서 상세화된 영역이므로, CONC-01 의사코드에서는 "DELAY/APPROVAL 재진입 시 동일 executeStage5() 호출, 단 tier 파라미터로 60초 타임아웃 적용"으로 기술하고 재진입 트리거 자체는 Phase 8에 위임.

## Sources

### Primary (HIGH confidence)
- `.planning/deliverables/32-transaction-pipeline-api.md` -- Stage 5 현재 의사코드 (lines 579-739), Stage 6 (lines 743-778), 상태 머신 (lines 76-131), 티어 분류 (lines 500-576)
- `.planning/deliverables/53-session-renewal-protocol.md` -- 토큰 회전 메커니즘 SS5 (lines 516-697), 동시 갱신 방어 SS5.4 (lines 568-583), 갱신 서비스 코드 SS5.5 (lines 585-695)
- `.planning/deliverables/36-killswitch-autostop-evm.md` -- 캐스케이드 프로토콜 SS3 (lines 249-489), 복구 절차 SS4 (lines 493-798), 상태 머신 SS2 (lines 82-159)
- `.planning/deliverables/27-chain-adapter-interface.md` -- ChainError category SS4.4-4.5 (lines 1235-1370), 복구 전략 테이블 (lines 1346-1360)

### Secondary (MEDIUM confidence)
- `.planning/phases/42-error-handling-completion/42-01-SUMMARY.md` -- Phase 42 산출물 확인 (ChainError category 분류 완료)
- `.planning/deliverables/34-owner-wallet-connection.md` -- markOwnerVerified() CAS 패턴 선례 (lines 1888-1930)
- `.planning/deliverables/31-solana-adapter-detail.md` -- refreshBlockhash() 경량 복구 (lines 1547-1655)

### Tertiary (LOW confidence)
없음 -- 이 Phase는 외부 리서치가 불필요하며 프로젝트 내부 설계 문서만으로 완전히 해결 가능.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 새 라이브러리 추가 없음, 기존 스택 재사용
- Architecture: HIGH -- 모든 패턴이 프로젝트 내 선례 기반 (CAS, BEGIN IMMEDIATE, ChainError category)
- Pitfalls: HIGH -- SQLite 동시성 특성은 프로젝트 전체에서 검증됨

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (프로젝트 내부 문서 기반이므로 30일)
