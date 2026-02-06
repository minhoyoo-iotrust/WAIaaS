# 경계값 테스트 케이스 및 E2E 연쇄 공격 체인

**문서 ID:** SEC-05
**작성일:** 2026-02-06
**상태:** 완료
**참조:** LOCK-MECH (33-time-lock-approval-mechanism.md), SESS-PROTO (30-session-token-protocol.md), KILL-AUTO-EVM (36-killswitch-autostop-evm.md), CHAIN-SOL (31-solana-adapter-detail.md)
**Phase 14 참조:** 42-mock-boundaries-interfaces-contracts.md (FakeClock, MockChainAdapter, MockPolicyEngine, MockKeyStore, MockDb)
**Phase 15 참조:** SEC-01 (43-layer1), SEC-02 (44-layer2), SEC-03 (45-layer3), SEC-04 (46-keystore-external)
**요구사항:** SEC-05 (경계값 테스트 케이스 + E2E 연쇄 공격 체인)

---

## 1. 문서 개요

### 1.1 목적

WAIaaS 3계층 보안의 모든 금액/시간/동시성 경계값을 체계적으로 정리하고, Layer 1-2-3을 관통하는 E2E 연쇄 공격 체인을 정의한다. SEC-01~04에서 개별 계층/컴포넌트의 공격 시나리오를 다루었다면, SEC-05는 **계층 간 상호작용**과 **정확한 경계 지점**에서의 동작을 검증한다.

### 1.2 구성

| Part | 내용 | 목적 |
|------|------|------|
| **Part 1** | 금액/시간/동시성 경계값 테스트 | 경계에서의 off-by-one 에러 방지 |
| **Part 2** | E2E 연쇄 공격 체인 5건 | Layer 1-2-3 통합 방어 검증 |

### 1.3 금액 단위 참고

| 체인 | 최소 단위 | 1 SOL/ETH = |
|------|----------|------------|
| Solana | lamport | 1,000,000,000 lamports (10^9) |
| EVM | wei | 1,000,000,000,000,000,000 wei (10^18) |

본 문서의 모든 금액은 **lamport 단위 BigInt 문자열**로 표기한다.

### 1.4 설계 문서 기본값 vs CONTEXT.md 값

| 경계 | 설계 문서 기본값 (33-time-lock) | CONTEXT.md 값 |
|------|-------------------------------|---------------|
| INSTANT/NOTIFY | 1 SOL | 0.1 SOL |
| NOTIFY/DELAY | 10 SOL | 1 SOL |
| DELAY/APPROVAL | 50 SOL | 10 SOL |

**설계 문서 SSoT:** `waiaas init`으로 생성되는 기본 정책의 금액 기준은 33-time-lock-approval-mechanism.md의 1/10/50 SOL이다. CONTEXT.md의 0.1/1/10 SOL은 "더 보수적인 커스텀 정책" 예시로, 경계값 테스트에서 양쪽 설정을 모두 검증한다.

---

## 2. Part 1: 경계값 테스트 케이스

### 2.1 금액 경계 테스트 -- 기본 정책 (1/10/50 SOL)

설계 문서(33-time-lock) 기본 정책 기준 4-tier SPENDING_LIMIT 경계값:

| 경계 | -1 lamport | 정확히 | +1 lamport | 기대 티어 변화 |
|------|-----------|--------|-----------|--------------|
| INSTANT/NOTIFY (1 SOL) | `"999999999"` | `"1000000000"` | `"1000000001"` | INSTANT -> INSTANT -> NOTIFY |
| NOTIFY/DELAY (10 SOL) | `"9999999999"` | `"10000000000"` | `"10000000001"` | NOTIFY -> NOTIFY -> DELAY |
| DELAY/APPROVAL (50 SOL) | `"49999999999"` | `"50000000000"` | `"50000000001"` | DELAY -> DELAY -> APPROVAL |

**비교 연산자 기준:** `amount <= BigInt(instant_max)` -- "이하"이므로 정확히 경계값은 낮은 티어에 포함.

#### Given-When-Then (기본 정책 금액 경계)

```
Given:
  - MockPolicyEngine 또는 DatabasePolicyEngine (Unit/Integration)
  - SPENDING_LIMIT 정책:
    - instant_max: "1000000000"    // 1 SOL
    - notify_max:  "10000000000"   // 10 SOL
    - delay_max:   "50000000000"   // 50 SOL
  - MockChainAdapter (canned response)

When (INSTANT/NOTIFY 경계 -1):
  - evaluate(agentId, { amount: "999999999", to: addr, chain: "solana" })

Then: tier = "INSTANT"  // 1 SOL 미만

When (INSTANT/NOTIFY 경계 정확히):
  - evaluate(agentId, { amount: "1000000000", to: addr, chain: "solana" })

Then: tier = "INSTANT"  // 정확히 1 SOL = instant_max 이하

When (INSTANT/NOTIFY 경계 +1):
  - evaluate(agentId, { amount: "1000000001", to: addr, chain: "solana" })

Then: tier = "NOTIFY"  // 1 SOL 초과, 10 SOL 이하

When (NOTIFY/DELAY 경계 정확히):
  - evaluate(agentId, { amount: "10000000000", to: addr, chain: "solana" })

Then: tier = "NOTIFY"  // 정확히 10 SOL = notify_max 이하

When (NOTIFY/DELAY 경계 +1):
  - evaluate(agentId, { amount: "10000000001", to: addr, chain: "solana" })

Then: tier = "DELAY"   // 10 SOL 초과, 50 SOL 이하

When (DELAY/APPROVAL 경계 정확히):
  - evaluate(agentId, { amount: "50000000000", to: addr, chain: "solana" })

Then: tier = "DELAY"   // 정확히 50 SOL = delay_max 이하

When (DELAY/APPROVAL 경계 +1):
  - evaluate(agentId, { amount: "50000000001", to: addr, chain: "solana" })

Then: tier = "APPROVAL"  // 50 SOL 초과
```

**Phase 14 Mock 참조:** MockPolicyEngine (Unit) 또는 실제 DatabasePolicyEngine + MockDb (Integration)

---

### 2.2 금액 경계 테스트 -- 커스텀 정책 (0.1/1/10 SOL)

보수적 커스텀 정책(CONTEXT.md 예시) 경계값:

| 경계 | -1 lamport | 정확히 | +1 lamport | 기대 티어 변화 |
|------|-----------|--------|-----------|--------------|
| INSTANT/NOTIFY (0.1 SOL) | `"99999999"` | `"100000000"` | `"100000001"` | INSTANT -> INSTANT -> NOTIFY |
| NOTIFY/DELAY (1 SOL) | `"999999999"` | `"1000000000"` | `"1000000001"` | NOTIFY -> NOTIFY -> DELAY |
| DELAY/APPROVAL (10 SOL) | `"9999999999"` | `"10000000000"` | `"10000000001"` | DELAY -> DELAY -> APPROVAL |

#### Given-When-Then (커스텀 정책 금액 경계)

```
Given:
  - DatabasePolicyEngine (또는 MockPolicyEngine)
  - SPENDING_LIMIT 커스텀 정책:
    - instant_max: "100000000"     // 0.1 SOL
    - notify_max:  "1000000000"    // 1 SOL
    - delay_max:   "10000000000"   // 10 SOL
  - MockChainAdapter

When (INSTANT/NOTIFY 경계 -1):
  - evaluate(agentId, { amount: "99999999", to: addr, chain: "solana" })

Then: tier = "INSTANT"

When (INSTANT/NOTIFY 경계 정확히):
  - evaluate(agentId, { amount: "100000000", to: addr, chain: "solana" })

Then: tier = "INSTANT"  // 정확히 0.1 SOL = instant_max 이하

When (INSTANT/NOTIFY 경계 +1):
  - evaluate(agentId, { amount: "100000001", to: addr, chain: "solana" })

Then: tier = "NOTIFY"

When (DELAY/APPROVAL 경계 +1):
  - evaluate(agentId, { amount: "10000000001", to: addr, chain: "solana" })

Then: tier = "APPROVAL"
```

**참고:** 커스텀 정책 테스트는 설정 변경에 따른 동적 분류 동작을 확인한다. 기본 정책과 동일한 BigInt 비교 로직이 다른 임계값에서도 정확히 동작하는지 검증한다.

---

### 2.3 시간 경계 테스트

모든 시간 경계는 **FakeClock(DI)**으로 정밀 제어한다.

| 경계 | 기준값 | -1초 | 정확히 | +1초 | 방어 지점 |
|------|--------|------|--------|------|----------|
| JWT exp | 세션 만료 시각 | 유효 | 유효 | 만료 거부 | sessionAuth Stage 1 |
| DELAY 쿨다운 | 15분 (900초) | 실행 차단 | 실행 허용 | 실행 허용 | DelayQueueWorker |
| APPROVAL 타임아웃 | 1시간 (3600초) | 승인 가능 | 만료 | 만료 | ApprovalTimeoutWorker |
| 세션 최대 수명 | 7일 (604800초) | 발급 성공 | 발급 성공 | 발급 거부 | Zod expiresIn max |
| 세션 최소 수명 | 5분 (300초) | 발급 거부 | 발급 성공 | 발급 성공 | Zod expiresIn min |
| Blockhash 만료 | 50초 | 유효 | 경계 (경고) | 만료 | waitForConfirmation |
| Nonce TTL | 5분 (300초) | 유효 | 만료 | 만료 | verifyAndConsumeNonce |
| ownerAuth timestamp | 5분 (300초) | 유효 | 만료 | 만료 | ownerAuth Step 2 |

#### SEC-05-T01: JWT 만료 경계

```
Given:
  - FakeClock: baseTime = "2026-02-06T12:00:00Z"
  - JWT 발급 시각: iat = baseTime
  - JWT 만료: exp = baseTime + 24h = "2026-02-07T12:00:00Z"
  - sessionAuth Stage 1: jose.jwtVerify({ currentDate: clock.now() })

When (-1초):
  - FakeClock.setTime("2026-02-07T11:59:59Z")
  - 요청: GET /v1/wallet/balance (해당 JWT 사용)

Then: 200 OK (유효)

When (정확히):
  - FakeClock.setTime("2026-02-07T12:00:00Z")
  - 요청: GET /v1/wallet/balance

Then: 200 OK (유효 -- jose의 exp 비교는 현재 시각 <= exp)

When (+1초):
  - FakeClock.setTime("2026-02-07T12:00:01Z")
  - 요청: GET /v1/wallet/balance

Then: 401 TOKEN_EXPIRED
```

#### SEC-05-T02: DELAY 쿨다운 경계

```
Given:
  - FakeClock: baseTime = "2026-02-06T12:00:00Z"
  - 거래 QUEUED 시각: baseTime
  - DELAY 쿨다운: 900초 (15분, 설계 문서 기본값)
  - DelayQueueWorker가 10초 폴링 간격으로 실행

When (-1초):
  - FakeClock.setTime("2026-02-06T12:14:59Z")  // 899초 경과
  - DelayQueueWorker.poll()

Then: 거래 상태 = QUEUED (아직 실행 안 됨)

When (정확히):
  - FakeClock.setTime("2026-02-06T12:15:00Z")  // 900초 경과
  - DelayQueueWorker.poll()

Then: 거래 상태 = QUEUED -> SIGNING -> SUBMITTED (실행 시작)

When (+1초):
  - FakeClock.setTime("2026-02-06T12:15:01Z")  // 901초 경과
  - DelayQueueWorker.poll()

Then: 거래 실행됨 (정확히와 동일)
```

#### SEC-05-T03: APPROVAL 타임아웃 경계

```
Given:
  - FakeClock: baseTime = "2026-02-06T12:00:00Z"
  - 거래 PENDING_APPROVAL 시각: baseTime
  - APPROVAL 타임아웃: 3600초 (1시간)
  - ApprovalTimeoutWorker가 30초 폴링 간격

When (-1초):
  - FakeClock.setTime("2026-02-06T12:59:59Z")  // 3599초 경과
  - POST /v1/owner/approve/{txId} (Owner 승인)

Then: 거래 상태 = PENDING_APPROVAL -> SIGNING -> SUBMITTED (승인 성공)

When (정확히):
  - FakeClock.setTime("2026-02-06T13:00:00Z")  // 3600초 경과
  - ApprovalTimeoutWorker.poll()

Then: 거래 상태 = PENDING_APPROVAL -> EXPIRED (만료)

When (+1초 후 승인 시도):
  - FakeClock.setTime("2026-02-06T13:00:01Z")
  - POST /v1/owner/approve/{txId}

Then: 에러 409 TX_ALREADY_EXPIRED (이미 만료된 거래는 승인 불가)
```

#### SEC-05-T04: 세션 최대 수명 경계

```
Given:
  - FakeClock: baseTime = "2026-02-06T12:00:00Z"
  - Zod 스키마: expiresIn max = 604800 (7일, 초 단위)
  - POST /v1/sessions (Owner SIWS 서명)

When (7일 정확히):
  - body: { expiresIn: 604800 }  // 7일

Then: 201 Created (세션 발급 성공)

When (7일 + 1초):
  - body: { expiresIn: 604801 }  // 7일 + 1초

Then: 400 VALIDATION_ERROR (Zod max 초과)
```

#### SEC-05-T05: 세션 최소 수명 경계

```
Given:
  - Zod 스키마: expiresIn min = 300 (5분, 초 단위)

When (5분 - 1초):
  - body: { expiresIn: 299 }

Then: 400 VALIDATION_ERROR (Zod min 미달)

When (5분 정확히):
  - body: { expiresIn: 300 }

Then: 201 Created (세션 발급 성공)

When (5분 + 1초):
  - body: { expiresIn: 301 }

Then: 201 Created (세션 발급 성공)
```

#### SEC-05-T06: Blockhash 만료 경계 (Solana)

```
Given:
  - FakeClock
  - MockChainAdapter (SolanaAdapter의 동작 시뮬레이션)
  - 거래 빌드 시점: baseTime
  - expiresAt = baseTime + 50초 (31-solana-adapter 설계값)

When (49초 경과):
  - FakeClock.advance(49s)
  - waitForConfirmation() 폴링

Then: 정상 대기 중 (아직 유효)

When (50초 경과):
  - FakeClock.advance(1s) // 총 50초
  - waitForConfirmation() 폴링

Then: 경고 로그 + 만료 임박 상태

When (50초 초과):
  - FakeClock.advance(1s) // 총 51초
  - waitForConfirmation()

Then: TX_CONFIRMATION_TIMEOUT 에러
     거래 상태: SUBMITTED -> FAILED (확인 타임아웃)
```

#### SEC-05-T07: Nonce TTL 경계

```
Given:
  - FakeClock: baseTime = "2026-02-06T12:00:00Z"
  - nonce = createNonce() (LRU 캐시, TTL 5분)
  - nonce 발급 시각: baseTime

When (4분 59초):
  - FakeClock.setTime("2026-02-06T12:04:59Z")
  - verifyAndConsumeNonce(nonce)

Then: 유효 (nonce 소비 성공)

When (5분 정확히 -- 새 nonce로):
  - nonce2 = createNonce() (발급 시각: baseTime)
  - FakeClock.setTime("2026-02-06T12:05:00Z")
  - verifyAndConsumeNonce(nonce2)

Then: 만료 거부 (INVALID_NONCE -- TTL 초과)

When (5분 + 1초 -- 새 nonce로):
  - nonce3 = createNonce() (발급 시각: baseTime)
  - FakeClock.setTime("2026-02-06T12:05:01Z")
  - verifyAndConsumeNonce(nonce3)

Then: 만료 거부 (INVALID_NONCE)
```

#### SEC-05-T08: ownerAuth timestamp 경계

```
Given:
  - FakeClock: baseTime = "2026-02-06T12:00:00Z"
  - FakeOwnerSigner (고정 시드)
  - Owner 서명의 signedAt = baseTime (초 단위 Unix epoch)
  - ownerAuth Step 2: Math.abs(clock.now() - signedAt) <= 300 (5분)

When (4분 59초):
  - FakeClock.setTime("2026-02-06T12:04:59Z")
  - ownerAuth 검증

Then: 통과 (timestamp 유효)

When (5분 정확히):
  - FakeClock.setTime("2026-02-06T12:05:00Z")
  - ownerAuth 검증

Then: 만료 거부 (INVALID_SIGNATURE -- timestamp expired)

When (5분 + 1초):
  - FakeClock.setTime("2026-02-06T12:05:01Z")
  - ownerAuth 검증

Then: 만료 거부 (INVALID_SIGNATURE)
```

---

### 2.4 TOCTOU 동시성 경계 테스트

TOCTOU 테스트는 **Integration 레벨**에서 실제 SQLite + BEGIN IMMEDIATE로 수행한다 (SEC02-TOCTOU-INTEGRATION 결정).

| 시나리오 | 설정 | 동시 요청 | 기대 결과 |
|---------|------|----------|----------|
| reserved_amount 경합 | maxTotalAmount=10 SOL, 현재 8 SOL | 2개 동시 각 3 SOL | 1개 성공, 1개 POLICY_LIMIT_EXCEEDED |
| 세션 usageStats 경합 | maxTransactions=10, 현재 9 | 2개 동시 요청 | 1개 성공, 1개 SESSION_LIMIT_EXCEEDED |
| BEGIN IMMEDIATE 직렬화 | 임의 동시 트랜잭션 | N개 동시 | 모든 요청 직렬 처리, 데드락 없음 |

#### SEC-05-C01: reserved_amount 동시 경합

```
Given:
  - 실제 SQLite DB (tmpdir, WAL 모드)
  - MockChainAdapter (canned response: 100ms 지연)
  - 세션 constraints: { maxTotalAmount: "10000000000" }  // 10 SOL
  - usageStats: { totalAmount: "8000000000" }  // 8 SOL 사용
  - 남은 한도: 2 SOL

When:
  - Promise.allSettled([
      txService.submit({ amount: "3000000000", to: "addr-A" }),  // 3 SOL
      txService.submit({ amount: "3000000000", to: "addr-B" }),  // 3 SOL
    ])

Then:
  - results.filter(r => r.status === 'fulfilled').length === 1
  - results.filter(r => r.status === 'rejected').length === 1
  - 거부된 요청의 에러 코드: POLICY_LIMIT_EXCEEDED
  - DB reserved_amount: 성공 요청의 3 SOL만 기록
  - 총 사용량: 8 + 3 = 11 SOL (성공분만)
```

**참조:** SEC-02-01 (Layer 2 TOCTOU 상세 시나리오)

#### SEC-05-C02: 세션 usageStats 동시 경합

```
Given:
  - 실제 SQLite DB (tmpdir, WAL 모드)
  - MockChainAdapter (canned response)
  - 세션 constraints: { maxTransactions: 10 }
  - usageStats: { totalTx: 9 }  // 9회 사용 (남은 1회)

When:
  - Promise.allSettled([
      txService.submit({ amount: "100000000", to: "addr-A" }),  // 0.1 SOL
      txService.submit({ amount: "100000000", to: "addr-B" }),  // 0.1 SOL
    ])

Then:
  - 1개 성공, 1개 거부
  - 거부: SESSION_LIMIT_EXCEEDED (거래 횟수 초과)
  - usageStats.totalTx = 10 (성공분만)
```

#### SEC-05-C03: BEGIN IMMEDIATE 직렬화

```
Given:
  - 실제 SQLite DB (tmpdir, WAL 모드)
  - MockChainAdapter (50ms 지연)
  - 5개 동시 거래 요청

When:
  - Promise.allSettled([
      txService.submit({ amount: "100000000" }),  // x5
    ])

Then:
  - 모든 요청이 직렬로 처리됨 (동시 접근 없음)
  - SQLITE_BUSY 에러 없음 (BEGIN IMMEDIATE가 직렬화)
  - 각 요청의 reserved_amount가 순차적으로 누적
  - 최종 DB 상태가 일관적 (합계 = 개별 성공 합계)
```

---

### 2.5 세션 한도 경계 (+/-1 패턴)

세션 제약(SessionConstraints) 각 필드의 경계값 테스트:

#### maxAmountPerTx (단건 한도)

| 값 | 요청 금액 | 기대 결과 |
|----|----------|----------|
| limit - 1 | `BigInt(maxAmountPerTx) - 1n` | 허용 (INSTANT/적절 티어) |
| limit | `BigInt(maxAmountPerTx)` | 허용 |
| limit + 1 | `BigInt(maxAmountPerTx) + 1n` | 거부: SESSION_LIMIT_EXCEEDED |

```
Given:
  - MockDb: constraints = { maxAmountPerTx: "5000000000" }  // 5 SOL
  - 유효한 세션 토큰

When (limit - 1):
  - POST /v1/transactions { amount: "4999999999" }

Then: 허용 (정책 평가 진행)

When (limit):
  - POST /v1/transactions { amount: "5000000000" }

Then: 허용

When (limit + 1):
  - POST /v1/transactions { amount: "5000000001" }

Then: 403 SESSION_LIMIT_EXCEEDED
```

#### maxTotalAmount (누적 한도)

| 상태 | 요청 금액 | 기대 결과 |
|------|----------|----------|
| 남은 한도 - 1 | `remaining - 1n` | 허용 |
| 남은 한도 | `remaining` | 허용 (한도 소진) |
| 남은 한도 + 1 | `remaining + 1n` | 거부: SESSION_LIMIT_EXCEEDED |

```
Given:
  - constraints: { maxTotalAmount: "10000000000" }  // 10 SOL
  - usageStats: { totalAmount: "7000000000" }  // 7 SOL 사용
  - 남은 한도: 3 SOL = "3000000000"

When (남은 한도 - 1):
  - POST /v1/transactions { amount: "2999999999" }

Then: 허용

When (남은 한도 정확히):
  - POST /v1/transactions { amount: "3000000000" }

Then: 허용 (한도 소진, 이후 거래 모두 거부)

When (남은 한도 + 1):
  - POST /v1/transactions { amount: "3000000001" }

Then: 403 SESSION_LIMIT_EXCEEDED
```

#### maxTransactions (거래 횟수)

| 상태 | 횟수 | 기대 결과 |
|------|------|----------|
| max - 1회째 | 9번째 거래 | 허용 |
| max회째 | 10번째 거래 | 허용 (횟수 소진) |
| max + 1회째 | 11번째 거래 | 거부: SESSION_LIMIT_EXCEEDED |

```
Given:
  - constraints: { maxTransactions: 10 }
  - usageStats: { totalTx: 8 }  // 8회 사용

When (max - 1):
  - 9번째 거래 (totalTx = 9)

Then: 허용

When (max):
  - 10번째 거래 (totalTx = 10)

Then: 허용 (횟수 소진)

When (max + 1):
  - 11번째 거래 시도

Then: 403 SESSION_LIMIT_EXCEEDED
```

---

## 3. Part 2: E2E 연쇄 공격 체인

### 3.1 개요

5개의 E2E 연쇄 공격 체인을 "공격자 관점 스토리"로 정의한다. 각 체인은 Layer 1-2-3을 관통하며, 개별 시나리오(SEC-01~04)를 조합하여 전체 방어 체계의 통합 동작을 검증한다.

| 체인 | 이름 | 관통 계층 | 결과 | 참조 시나리오 |
|------|------|----------|------|-------------|
| Chain 1 | 세션 한도 소진 체인 | L1 -> L2 | 차단 (L1) | SEC-01-06 |
| Chain 2 | 정책 우회 + TOCTOU 체인 | L1 -> L2 | 차단 (L2) | SEC-02-01 |
| Chain 3 | 금액 에스컬레이션 -> Kill Switch | L1 -> L2 -> L3 | 차단 (L3) | SEC-01-05, SEC-02-02, SEC-02-06, SEC-03-04 |
| Chain 4 | 세션 탈취 + 복구 체인 | L1 -> L3 -> 복구 | 차단 + 복구 | SEC-01-04, SEC-03-01, SEC-03-03, SEC-03-06 |
| Chain 5 | 시간 기반 우회 + 연속 실패 | L1 -> L2 -> L3 | 차단 (L3) | SEC-01-02, SEC-02-06, SEC-03-04 |

---

### 3.2 Chain 1: 세션 한도 소진 체인

**공격자:** 악의적 AI 에이전트 (합법적 세션 보유)
**관통 계층:** Layer 1 (세션 제약)
**공격 목표:** 누적 거래를 통해 세션 한도를 소진시키고, 한도 직전에 최대한 자금 이동
**참조:** SEC-01-06 (세션 제약 초과 - 누적 한도)

#### 공격자 스토리

```
[Step 1] 정상 세션 획득
  공격자 행동: Owner 서명(SIWS)으로 세션 발급 요청
  시스템 반응: 201 Created, 세션 토큰 발급
  - constraints: { maxTotalAmount: "10000000000", maxTransactions: 100 }

[Step 2] 소액 반복 거래 (탐지 회피)
  공격자 행동: 0.05 SOL x 190회 = 9.5 SOL 전송 (INSTANT 티어)
  시스템 반응: 모든 거래 즉시 실행 (INSTANT 티어, 알림 없음)
  - usageStats: { totalTx: 190, totalAmount: "9500000000" }
  - 남은 한도: 0.5 SOL

[Step 3] 남은 한도 최대 활용
  공격자 행동: 0.5 SOL (정확히 "500000000") 전송
  시스템 반응: 허용 (남은 한도 = 정확히 0)
  - usageStats: { totalTx: 191, totalAmount: "10000000000" }

[Step 4] 한도 초과 시도
  공격자 행동: 0.01 SOL 추가 전송 시도
  시스템 반응: 403 SESSION_LIMIT_EXCEEDED
  - 차단 지점: Layer 1 세션 제약 (totalAmount 소진)
```

#### Given-When-Then

```
Given:
  - MockChainAdapter (모든 거래 성공)
  - 실제 SQLite DB (usageStats 누적 추적)
  - 세션: maxTotalAmount = "10000000000", maxTransactions = 100
  - FakeClock (시간 고정)

When:
  - Step 1: POST /v1/sessions -> 201 Created
  - Step 2: POST /v1/transactions { amount: "50000000" } x 190회 (순차)
  - Step 3: POST /v1/transactions { amount: "500000000" }
  - Step 4: POST /v1/transactions { amount: "10000000" }

Then:
  - Step 1: 세션 토큰 발급 성공
  - Step 2: 190회 모두 200 OK (INSTANT 티어)
  - Step 3: 200 OK (한도 소진)
  - Step 4: 403 SESSION_LIMIT_EXCEEDED
  - 총 유출 금액: 10 SOL (세션 한도 = 최대 피해 범위)
```

**차단점:** Layer 1 -- 세션 제약(maxTotalAmount)이 한도 초과를 방지
**교훈:** 세션 한도가 최대 피해 범위를 결정하므로, Owner가 적절한 한도를 설정하는 것이 핵심

---

### 3.3 Chain 2: 정책 우회 + TOCTOU 체인

**공격자:** 악의적 AI 에이전트 (2개 세션 동시 사용)
**관통 계층:** Layer 1 -> Layer 2 (TOCTOU 공격 시도)
**공격 목표:** 동시 요청으로 reserved_amount 경합을 유발하여 누적 한도 초과
**참조:** SEC-02-01 (TOCTOU 동시 거래 한도 초과)

#### 공격자 스토리

```
[Step 1] 2개 세션 획득
  공격자 행동: 동일 에이전트로 2개 세션 발급
  시스템 반응: 세션 A, B 발급 (세션별 한도 동일)
  - 각 세션: maxTotalAmount = "10000000000" (10 SOL)

[Step 2] 사전 소비
  공격자 행동: 세션 A로 8 SOL 전송 (누적 한도의 80% 소비)
  시스템 반응: 정상 처리 (INSTANT 티어)
  - usageStats: totalAmount = "8000000000"

[Step 3] TOCTOU 공격 -- 동시 요청
  공격자 행동: 세션 A와 세션 B에서 동시에 각 3 SOL 전송 요청
  - 의도: 두 요청이 reserved_amount 반영 전에 동시 평가되어 둘 다 통과
  시스템 반응:
  - BEGIN IMMEDIATE가 두 요청을 직렬화
  - 첫 번째 요청: 8 + 3 = 11 > 10 SOL -> POLICY_LIMIT_EXCEEDED
    (또는 한도 범위 내라면: reserved_amount = 3 기록)
  - 두 번째 요청: 8 + 3(reserved) + 3 = 14 > 10 SOL -> POLICY_LIMIT_EXCEEDED
  - 차단 지점: Layer 2 TOCTOU 방어 (BEGIN IMMEDIATE + reserved_amount)

[Step 4] 실패 확인
  공격자 행동: 거래 상태 조회
  시스템 반응: 양쪽 모두 FAILED 또는 1개만 성공
  - 누적 한도 절대 초과 안 됨
```

#### Given-When-Then

```
Given:
  - 실제 SQLite DB (WAL 모드, tmpdir)
  - MockChainAdapter (100ms 지연)
  - 에이전트 "agent-001": maxTotalAmount = "10000000000"
  - usageStats: totalAmount = "8000000000"
  - 2개 세션 토큰: tokenA, tokenB

When:
  - Promise.allSettled([
      fetch("/v1/transactions", { headers: { Authorization: tokenA }, body: { amount: "3000000000" } }),
      fetch("/v1/transactions", { headers: { Authorization: tokenB }, body: { amount: "3000000000" } }),
    ])

Then:
  - 최대 1개만 성공 (또는 둘 다 실패)
  - DB totalAmount <= "10000000000" (절대 초과 안 됨)
  - reserved_amount가 정확히 반영됨
```

**차단점:** Layer 2 -- BEGIN IMMEDIATE + reserved_amount 직렬화
**교훈:** 동시성 공격은 DB 트랜잭션 레벨에서 방어해야 하며, 애플리케이션 레벨 락만으로는 불충분

---

### 3.4 Chain 3: 금액 에스컬레이션 -> Kill Switch 체인

**공격자:** 악의적 AI 에이전트
**관통 계층:** Layer 1 -> Layer 2 -> Layer 3 (3계층 전체 관통)
**공격 목표:** 소액에서 시작하여 금액을 점진적으로 올리고, 최종적으로 대액 승인을 시도
**참조:** SEC-01-05 (단건 한도), SEC-02-02 (금액 티어 경계), SEC-02-06 (DELAY 쿨다운), SEC-03-04 (AutoStop)

#### 공격자 스토리

```
[Step 1] 소액 거래로 신뢰 구축 (Layer 1 통과)
  공격자 행동: 0.05 SOL x 5회 전송 (INSTANT 티어)
  시스템 반응: 모든 거래 즉시 처리
  - Layer 1: 세션 제약 범위 내 -> 통과
  - Layer 2: SPENDING_LIMIT INSTANT 티어 -> 즉시 실행
  - Layer 3: 정상 패턴 -> 모니터링만

[Step 2] 중액 거래 시도 (Layer 2 DELAY 진입)
  공격자 행동: 15 SOL 전송 요청
  시스템 반응: DELAY 티어 분류
  - Layer 1: 단건 한도 내 -> 통과
  - Layer 2: 15 SOL > 10 SOL (NOTIFY 한도) -> DELAY 티어
  - 거래 상태: QUEUED (15분 쿨다운 대기)
  - Owner에게 알림 전송 (NotificationService)

[Step 3] DELAY 쿨다운 중 대액 거래 시도 (Layer 2 APPROVAL 진입)
  공격자 행동: 55 SOL 전송 요청 (쿨다운 완료 전)
  시스템 반응: APPROVAL 티어 분류
  - Layer 1: 단건 한도 내 -> 통과
  - Layer 2: 55 SOL > 50 SOL (DELAY 한도) -> APPROVAL 티어
  - 거래 상태: PENDING_APPROVAL (Owner 승인 대기)
  - Owner에게 긴급 알림 전송

[Step 4] Owner 미승인 -> APPROVAL 타임아웃 (Layer 2 만료)
  공격자 행동: 대기 (Owner가 승인하지 않음)
  시스템 반응: 1시간 후 ApprovalTimeoutWorker가 거래 만료
  - 거래 상태: PENDING_APPROVAL -> EXPIRED
  - 자금 이동 없음

[Step 5] 연속 실패 누적 -> AutoStop 트리거 (Layer 3 개입)
  공격자 행동: 만료 후 재시도 반복 (3회 연속 실패)
  시스템 반응:
  - AutoStopEngine: CONSECUTIVE_FAILURES 규칙 (threshold=3) 트리거
  - AutoStopDecision: { action: "SUSPEND_AGENT", agentId: "agent-001" }
  - 에이전트 상태: ACTIVE -> SUSPENDED

[Step 6] 정지된 에이전트로 추가 시도
  공격자 행동: 정지된 에이전트의 세션으로 거래 시도
  시스템 반응: 401 AGENT_SUSPENDED (sessionAuth Stage 2에서 에이전트 상태 확인)

[Step 7] (심각한 경우) AutoStop -> Kill Switch 에스컬레이션
  시스템 반응: AutoStop이 위험도 평가 후 Kill Switch 자동 발동 가능
  - Kill Switch ACTIVATED
  - 6단계 캐스케이드 실행 (SEC-03-07 참조)
  - 모든 세션 폐기, 모든 거래 취소, 키스토어 잠금
```

#### Given-When-Then

```
Given:
  - FakeClock (시간 제어)
  - 실제 SQLite DB (정책 + 거래 + 세션 테이블)
  - MockChainAdapter (canned response)
  - MockNotificationChannel (알림 기록 확인)
  - SPENDING_LIMIT: instant_max=1SOL, notify_max=10SOL, delay_max=50SOL
  - AutoStop CONSECUTIVE_FAILURES: threshold=3
  - 세션: maxAmountPerTx=60SOL, maxTotalAmount=100SOL

When:
  - Step 1: POST /v1/transactions { amount: "50000000" } x 5 // 0.05 SOL x 5
  - Step 2: POST /v1/transactions { amount: "15000000000" } // 15 SOL
  - FakeClock.advance(900s) // DELAY 쿨다운 15분
  - Step 3: POST /v1/transactions { amount: "55000000000" } // 55 SOL
  - FakeClock.advance(3600s) // APPROVAL 타임아웃 1시간
  - Step 5: POST /v1/transactions { amount: "55000000000" } x 3 (재시도)

Then:
  - Step 1: 5건 모두 200 OK (INSTANT)
  - Step 2: 202 QUEUED (DELAY 티어)
    -> 15분 후 자동 실행 (Owner 미취소)
  - Step 3: 202 PENDING_APPROVAL (APPROVAL 티어)
    -> 1시간 후 EXPIRED (Owner 미승인)
  - Step 5: 3건 모두 실패 (만료된 금액 패턴 반복)
    -> AutoStop CONSECUTIVE_FAILURES 트리거
    -> 에이전트 SUSPENDED
  - MockNotificationChannel.sentMessages: DELAY 알림 1건 + APPROVAL 알림 1건 + 만료 알림 1건 + AutoStop 알림 1건
```

**차단점:** Layer 2 (APPROVAL 만료) + Layer 3 (AutoStop SUSPEND_AGENT)
**3계층 관통:** Layer 1(세션 통과) -> Layer 2(DELAY->APPROVAL->EXPIRED) -> Layer 3(AutoStop 개입)

---

### 3.5 Chain 4: 세션 탈취 + 복구 체인

**공격자:** 악의적 AI 에이전트 B (Agent A의 토큰 탈취)
**관통 계층:** Layer 1 -> Layer 3 -> 복구 (공격-방어-복구 완전 E2E)
**공격 목표:** 다른 에이전트의 세션 토큰을 획득하여 자금 이동, 차단 후 시스템 복구
**참조:** SEC-01-04 (타 에이전트 탈취), SEC-03-01 (ACTIVATED API 접근), SEC-03-03 (복구 서명 위조), SEC-03-06 (복구 후 세션 재사용)

#### 공격자 스토리

```
[Step 1] Agent A의 세션 토큰 획득
  공격자 행동: Agent B가 같은 머신에서 Agent A의 환경변수/파일에서 세션 토큰 탈취
  시스템 반응: (이 단계는 시스템 외부 -- 토큰 획득은 전제 조건)

[Step 2] 탈취 토큰으로 거래 시도 (Layer 1 검증)
  공격자 행동: Agent B가 Agent A의 토큰으로 거래 요청
  시스템 반응:
  - sessionAuth Stage 1: JWT 서명 유효 -> 통과
  - sessionAuth Stage 2: DB 조회 -> 세션의 agentId = Agent A
  - 거래 실행: Agent A의 지갑에서 자금 이동 (토큰의 agentId로 실행)
  - **취약점:** agentId 검증이 토큰 내부 값에만 의존하면, 토큰 탈취 = 완전한 에이전트 제어

[Step 3] 이상 패턴 감지 -> AutoStop 트리거 (Layer 3)
  시스템 반응:
  - AutoStopEngine: Agent A의 거래 패턴이 갑자기 변경됨 감지
    - 평소와 다른 수신 주소
    - 비정상적 시간대의 거래 (ANOMALY_HOURS 규칙)
    - 또는 연속 거래 빈도 급증 (HOURLY_RATE 규칙)
  - AutoStopDecision: { action: "ACTIVATE_KILL_SWITCH", reason: "anomaly detected" }
  - Kill Switch ACTIVATED (6단계 캐스케이드)

[Step 4] Kill Switch 효과 확인 (Layer 3 방어)
  공격자 행동: 탈취 토큰으로 추가 거래 시도
  시스템 반응:
  - killSwitchGuard 미들웨어: SYSTEM_LOCKED 반환
  - Agent A의 세션 포함 모든 세션 폐기됨
  - 키스토어 잠김 -> 서명 물리적 불가

[Step 5] Owner 복구 (dual-auth)
  Owner 행동:
  - POST /v1/owner/recover
  - Owner SIWS 서명 + 마스터 패스워드 제출
  시스템 반응:
  - ACTIVATED -> RECOVERING -> NORMAL
  - 키스토어 잠금 해제
  - Kill Switch 사유로 정지된 에이전트만 ACTIVE로 복구
  - 이전 모든 세션은 폐기 상태 유지

[Step 6] 탈취 토큰 재사용 불가 확인
  공격자 행동: 이전에 탈취한 Agent A 토큰으로 다시 접근 시도
  시스템 반응:
  - sessionAuth Stage 2: DB 조회 -> 세션 상태 = REVOKED
  - 401 SESSION_REVOKED
  - Agent A는 새 세션 발급 필요 (Owner 재인가)
```

#### Given-When-Then

```
Given:
  - FakeClock
  - 실제 SQLite DB
  - MockChainAdapter
  - MockKeyStore
  - MockNotificationChannel
  - FakeOwnerSigner (복구 서명용)
  - Agent A 세션 토큰: tokenA (정상 발급)
  - Agent B: tokenA를 탈취한 상태 (전제 조건)
  - AutoStop ANOMALY_HOURS 규칙: 활성화

When:
  - Step 2: POST /v1/transactions (tokenA, 비정상 패턴)
  - Step 3: AutoStopEngine.evaluate() -> ACTIVATE_KILL_SWITCH
  - Step 4: POST /v1/transactions (tokenA) -> 401 SYSTEM_LOCKED
  - Step 5: POST /v1/owner/recover { ownerSignature, masterPassword: "correct" }
  - Step 6: POST /v1/transactions (tokenA) -> 401 SESSION_REVOKED

Then:
  - Step 2: 거래 실행됨 (1건 유출 가능 -- 최소 피해)
  - Step 3: Kill Switch ACTIVATED, MockNotificationChannel에 긴급 알림
  - Step 4: 모든 API 차단 (허용 목록 외)
  - Step 5: NORMAL 복귀, 키스토어 해제
  - Step 6: 이전 토큰 영구 무효 (SESSION_REVOKED)
  - 최종 상태: NORMAL, Agent A 새 세션 필요, Agent B 접근 불가
```

**차단점:** Layer 3 -- AutoStop -> Kill Switch -> 전체 캐스케이드
**복구 포함:** dual-auth(Owner SIWS + 마스터 패스워드) -> NORMAL 복귀
**교훈:** 토큰 탈취 시 최소 1건 유출 가능하지만, Layer 3가 신속히 차단하고 복구 절차로 정상 운영 복귀

---

### 3.6 Chain 5: 시간 기반 우회 + 연속 실패 체인

**공격자:** 악의적 AI 에이전트
**관통 계층:** Layer 1 -> Layer 2 -> Layer 3
**공격 목표:** JWT 만료 직전 타이밍을 노리고, DELAY 쿨다운 우회를 시도, 연속 실패로 AutoStop 트리거
**참조:** SEC-01-02 (JWT 만료 우회), SEC-02-06 (DELAY 쿨다운 조기 실행), SEC-03-04 (AutoStop CONSECUTIVE_FAILURES)

#### 공격자 스토리

```
[Step 1] JWT 만료 직전 타이밍 공격 (Layer 1)
  공격자 행동: JWT 만료 1초 전에 거래 요청 전송
  시스템 반응:
  - sessionAuth Stage 1: exp 확인 -> 아직 유효 (만료 1초 전)
  - 거래 처리 시작: INSTANT 티어 -> 즉시 실행
  - 거래 성공 (토큰이 요청 시점에 유효했으므로)

[Step 2] JWT 만료 후 거래 시도 (Layer 1 차단)
  공격자 행동: 만료 후 1초 뒤에 동일 토큰으로 거래 요청
  시스템 반응:
  - sessionAuth Stage 1: exp 확인 -> 만료됨
  - 401 TOKEN_EXPIRED
  - Layer 2에 도달하지 않음

[Step 3] 새 세션으로 DELAY 쿨다운 우회 시도 (Layer 2)
  공격자 행동: Owner 서명으로 새 세션 발급 후, 15 SOL 전송 -> DELAY 큐잉
  - 대기 중에 거래 상태를 직접 CONFIRMED로 변경 시도 (API 없음)
  - 또는 DELAY 완료 전에 동일 금액 재요청 (쿨다운 우회 시도)
  시스템 반응:
  - DELAY 거래가 QUEUED 상태에서 직접 상태 변경 API 없음 (읽기 전용)
  - 동일 금액 재요청: 새 거래로 별도 QUEUED (쿨다운은 각 거래별 독립)
  - reserved_amount에 양쪽 모두 반영 -> 한도 확인

[Step 4] 연속 거부 패턴 (Layer 2 -> Layer 3)
  공격자 행동: 한도 초과 거래를 반복적으로 시도 (3회)
  시스템 반응:
  - 1회: POLICY_LIMIT_EXCEEDED (한도 초과)
  - 2회: POLICY_LIMIT_EXCEEDED
  - 3회: POLICY_LIMIT_EXCEEDED
  - AutoStopEngine: CONSECUTIVE_FAILURES threshold=3 트리거
  - AutoStopDecision: { action: "SUSPEND_AGENT" }
  - 에이전트 SUSPENDED

[Step 5] 정지 후 시도
  공격자 행동: SUSPENDED 에이전트의 세션으로 요청
  시스템 반응: 401 AGENT_SUSPENDED
  - 세션은 여전히 유효하지만 에이전트 상태가 SUSPENDED이므로 Stage 2에서 거부
```

#### Given-When-Then

```
Given:
  - FakeClock: baseTime = "2026-02-06T12:00:00Z"
  - 실제 SQLite DB
  - MockChainAdapter
  - MockNotificationChannel
  - 세션 A: exp = baseTime + 1h, constraints = { maxTotalAmount: "20000000000" }
  - SPENDING_LIMIT: instant_max=1SOL, notify_max=10SOL, delay_max=50SOL
  - AutoStop CONSECUTIVE_FAILURES: threshold=3

When:
  - Step 1:
    - FakeClock.setTime(baseTime + 3599s)  // 만료 1초 전
    - POST /v1/transactions { amount: "500000000" }  // 0.5 SOL
  - Step 2:
    - FakeClock.setTime(baseTime + 3601s)  // 만료 1초 후
    - POST /v1/transactions { amount: "500000000" }
  - Step 3:
    - 새 세션 발급 (Owner SIWS)
    - POST /v1/transactions { amount: "15000000000" }  // 15 SOL
  - Step 4:
    - POST /v1/transactions { amount: "25000000000" } x 3  // 한도 초과 반복

Then:
  - Step 1: 200 OK (만료 전 유효)
  - Step 2: 401 TOKEN_EXPIRED
  - Step 3: 202 QUEUED (DELAY 티어)
  - Step 4: 3건 모두 403 POLICY_LIMIT_EXCEEDED
    -> AutoStop 트리거 -> 에이전트 SUSPENDED
  - Step 5: 401 AGENT_SUSPENDED
  - MockNotificationChannel: DELAY 알림 + AutoStop 알림
```

**차단점:** Layer 1(JWT 만료) + Layer 2(정책 한도) + Layer 3(AutoStop SUSPEND)
**교훈:** 시간 기반 공격(만료 직전 타이밍)은 1건 성공 가능하나, 반복 시도는 Layer 3가 감지하여 에이전트 정지

---

## 4. Phase 15 전체 시나리오 통계 요약

### 4.1 문서별 시나리오 수

| 문서 | 요구사항 | 시나리오 수 | Critical | High | Medium |
|------|---------|-----------|----------|------|--------|
| 43-layer1-session-auth-attacks.md | SEC-01 | 20건 (12 + 8 OA) | 7 | 9 | 4 |
| 44-layer2-policy-bypass-attacks.md | SEC-02 | 9건 | 1 | 6 | 2 |
| 45-layer3-killswitch-recovery-attacks.md | SEC-03 | 8건 | 2 | 4 | 2 |
| 46-keystore-external-security-scenarios.md | SEC-04 | 10건 (6 + 4 EX) | 2 | 6 | 2 |
| 47-boundary-value-chain-scenarios.md | SEC-05 | 경계값 19건 + 체인 5건 | - | - | - |
| **합계** | **SEC-01~05** | **개별 47건 + 경계값 19건 + 체인 5건 = 71건** | **12** | **25** | **10** |

### 4.2 테스트 레벨 분포

| 테스트 레벨 | 시나리오 수 | 주요 대상 |
|------------|-----------|----------|
| **Unit** | 32건 | JWT 검증, 세션 제약, 정책 평가, 키스토어 로직, Kill Switch 상태 |
| **Integration** | 15건 | TOCTOU, 실제 SQLite, Argon2id/sodium-native, Hono 미들웨어 |
| **E2E (Integration)** | 5건 | 연쇄 공격 체인 (Layer 1-2-3 관통) |
| **경계값 (Unit/Integration)** | 19건 | 금액/시간/동시성/세션 한도 |

### 4.3 우선순위 분포 (개별 시나리오 47건 기준)

| 우선순위 | 건수 | 비율 | 구현 순서 |
|---------|------|------|----------|
| **Critical** | 12건 | 25.5% | Phase 1: 구현과 동시에 반드시 작성 |
| **High** | 25건 | 53.2% | Phase 2: 핵심 기능 구현 후 작성 |
| **Medium** | 10건 | 21.3% | Phase 3: 안정화 단계에서 작성 |

### 4.4 Mock 인프라 사용 빈도

| Mock / Fake | 사용 시나리오 수 | 역할 |
|-------------|----------------|------|
| **FakeClock** | 18건 | 시간 경계, JWT 만료, 쿨다운, 타임아웃 |
| **MockChainAdapter** | 15건 | 블록체인 응답 Mock, 지연/실패 시뮬레이션 |
| **FakeOwnerSigner** | 11건 | Owner 서명 검증, 위조 서명 테스트 |
| **MockKeyStore** | 6건 | 키스토어 잠금/해제, 메모리 제로화 |
| **MockNotificationChannel** | 8건 | 알림 전송 기록 확인 |
| **MockDb** | 22건 | 세션/거래/정책 상태 설정 |
| **실제 SQLite** | 8건 | TOCTOU, Integration 레벨 |

### 4.5 3계층 커버리지

| 계층 | 개별 시나리오 | 경계값 | 연쇄 체인 참조 | 커버리지 평가 |
|------|-------------|--------|---------------|-------------|
| **Layer 1** (세션 인증) | 20건 (SEC-01) | 시간 3건, 세션 한도 3건 | Chain 1, 4, 5 | 완전 |
| **Layer 2** (정책 엔진) | 9건 (SEC-02) | 금액 6건, 시간 3건, TOCTOU 3건 | Chain 2, 3, 5 | 완전 |
| **Layer 3** (Kill Switch) | 8건 (SEC-03) | 시간 1건 | Chain 3, 4, 5 | 완전 |
| **키스토어** | 10건 (SEC-04) | - | Chain 4 (키스토어 잠금) | 완전 |
| **계층 간 통합** | - | - | 5건 (Chain 1-5) | 완전 |
