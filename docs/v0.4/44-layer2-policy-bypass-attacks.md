# Layer 2: 정책 엔진 우회 공격 시나리오 (SEC-02)

**문서 ID:** SEC-02
**작성일:** 2026-02-06
**상태:** 완료
**참조:** LOCK-MECH (33-time-lock-approval-mechanism.md), TX-PIPE (32-transaction-pipeline-api.md), MOCK (42-mock-boundaries-interfaces-contracts.md)
**요구사항:** SEC-02 (Layer 2 정책 우회 공격 시나리오)

---

## 1. 문서 개요

### 1.1 목적

WAIaaS 3계층 보안의 **Layer 2(정책 엔진 + Time-Lock + Approval)**를 대상으로 한 공격 시나리오를 테스트 케이스 수준으로 정의한다. 구현 시 Security 테스트를 바로 작성할 수 있도록 Given-When-Then 형식에 Mock 설정을 명시한다.

### 1.2 위협 모델

**공격자:** 악의적 AI 에이전트 -- 유효한 세션 토큰을 보유하며, Layer 1(세션 인증)을 통과한 상태에서 Layer 2의 정책 평가를 우회하여 허용 범위를 초과하는 거래를 실행하려 시도한다.

**공격 목표:**
- SPENDING_LIMIT 티어 분류를 조작하여 대액 거래를 INSTANT으로 처리
- TOCTOU 취약점을 이용하여 누적 한도를 초과하는 동시 거래 실행
- WHITELIST/TIME_RESTRICTION/RATE_LIMIT 정책을 우회하여 제한된 거래 수행
- DELAY 쿨다운/APPROVAL 타임아웃의 시간 기반 방어를 무력화

### 1.3 참조 설계 문서

| 문서 | 참조 내용 |
|------|----------|
| 33-time-lock-approval-mechanism.md | DatabasePolicyEngine 6단계 알고리즘, 4-tier 상태 머신, TOCTOU 방어 패턴 |
| 32-transaction-pipeline-api.md | 6-stage 파이프라인, 8-state 머신, Stage 3 (Policy Check) |
| 42-mock-boundaries-interfaces-contracts.md | FakeClock, MockChainAdapter, MockPolicyEngine, MockDb 스펙 |

---

## 2. 공격 시나리오 9건

### SEC-02-01: TOCTOU -- 동시 거래로 한도 초과

**우선순위:** Critical
**공격자:** 악의적 AI 에이전트 (2개 세션 동시 사용)
**테스트 레벨:** Integration (실제 SQLite + BEGIN IMMEDIATE 필수)
**공격 대상:** `evaluateAndReserve()` -- BEGIN IMMEDIATE + reserved_amount 패턴

#### 공격 단계

1. 에이전트가 maxTotalAmount = 10 SOL 세션 제약 내에서 8 SOL을 이미 사용
2. 2개의 세션에서 동시에 각 3 SOL 전송 요청 (합계 14 SOL > 한도 10 SOL)
3. 정책 평가 시 reserved_amount가 반영되지 않으면 두 요청 모두 통과 가능

#### 기대 방어

- SQLite `BEGIN IMMEDIATE` 트랜잭션이 두 요청을 직렬화
- 첫 번째 요청이 reserved_amount = 3 SOL을 기록
- 두 번째 요청이 평가 시 effectiveAmount = 8 + 3 = 11 SOL > 10 SOL로 거부

#### Given-When-Then

```
Given:
  - 실제 SQLite DB (tmpdir에 생성, WAL 모드)
  - MockChainAdapter (블록체인 응답 mock)
  - 세션 constraints: { maxTotalAmount: "10000000000" }  // 10 SOL
  - 현재 usageStats: { totalTx: 5, totalAmount: "8000000000" }  // 8 SOL 사용

When:
  - Promise.allSettled로 2개 동시 전송 요청:
    - 요청 A: { amount: "3000000000", to: "addr-A", chain: "solana" }  // 3 SOL
    - 요청 B: { amount: "3000000000", to: "addr-B", chain: "solana" }  // 3 SOL

Then:
  - 정확히 1개 요청 fulfilled (status: CONFIRMED 또는 QUEUED)
  - 정확히 1개 요청 rejected (에러 코드: POLICY_LIMIT_EXCEEDED)
  - DB의 reserved_amount: 성공 요청만 기록되어 있음
```

**Phase 14 Mock 참조:** MockChainAdapter (canned response), 실제 SQLite (Integration 레벨이므로 Mock 불가). TOCTOU 테스트는 Unit 레벨에서 불가 -- 단일 스레드에서 실제 동시성을 재현할 수 없으므로 Integration 레벨에서 실제 SQLite BEGIN IMMEDIATE를 사용해야 한다 (Research Pitfall 3).

**주의:** Jest `--maxWorkers=75%` 설정에서 워커 간 동시 DB 접근이 아닌, 단일 테스트 내 `Promise.allSettled`로 이벤트 루프 레벨의 동시성을 활용한다.

---

### SEC-02-02: 금액 티어 경계값 조작

**우선순위:** High
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit
**공격 대상:** `evaluateSpendingLimit()` -- BigInt 경계 비교

#### 공격 단계

1. INSTANT 한도가 1 SOL (1_000_000_000 lamports)임을 파악
2. 정확히 경계값에서 거래를 시도하여 의도하지 않은 티어로 분류시키려 시도
3. BigInt 비교가 아닌 Number 비교를 유도하여 정밀도 오류 발생을 시도

#### 기대 방어

- 모든 금액 비교가 BigInt로 수행되어 경계값이 정확하게 분류됨
- `amount <= BigInt(config.instant_max)` 비교에서 경계값 포함 여부가 설계 의도대로 동작

#### Given-When-Then

```
Given:
  - FakeClock (시간 고정)
  - MockDb: policies 테이블에 SPENDING_LIMIT 정책 설정
    - instant_max: "1000000000"   // 1 SOL
    - notify_max: "10000000000"   // 10 SOL
    - delay_max: "50000000000"    // 50 SOL

When (Case A - 경계값 정확히):
  - 전송 요청: { amount: "1000000000", chain: "solana" }  // 정확히 1 SOL

Then (Case A):
  - PolicyDecision: { allowed: true, tier: "INSTANT" }
  - 경계값 포함 (<= 비교)

When (Case B - 경계값 +1 lamport):
  - 전송 요청: { amount: "1000000001", chain: "solana" }  // 1 SOL + 1 lamport

Then (Case B):
  - PolicyDecision: { allowed: true, tier: "NOTIFY" }
  - INSTANT 한도 초과로 다음 티어 전환

When (Case C - 경계값 -1 lamport):
  - 전송 요청: { amount: "999999999", chain: "solana" }  // 1 SOL - 1 lamport

Then (Case C):
  - PolicyDecision: { allowed: true, tier: "INSTANT" }
```

**Phase 14 Mock 참조:** FakeClock (DI), MockDb (policies 테이블 직접 설정). BigInt 문자열로 금액을 전달하여 Number 정밀도 문제를 원천 차단.

---

### SEC-02-03: WHITELIST 우회 -- 주소 대소문자

**우선순위:** High
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit
**공격 대상:** `evaluateWhitelist()` -- 주소 정규화 비교

#### 공격 단계

1. WHITELIST에 EVM 체크섬 주소가 등록됨 (예: `0xAbCdEf1234567890AbCdEf1234567890AbCdEf12`)
2. 동일 주소의 소문자 변환 버전으로 전송 요청 (`0xabcdef1234567890abcdef1234567890abcdef12`)
3. 대소문자 구분 비교 시 화이트리스트를 우회할 수 있음

#### 기대 방어

- EVM 주소는 `toLowerCase()` 정규화 후 비교
- Solana 주소는 Base58이므로 대소문자 구분 그대로 비교 (Base58에서 대소문자는 다른 값)

#### Given-When-Then

```
Given:
  - MockDb: policies 테이블에 WHITELIST 정책 설정
    - allowed_addresses: ["0xAbCdEf1234567890AbCdEf1234567890AbCdEf12"]
  - chain: "evm"

When (Case A - 소문자 변환 주소):
  - 전송 요청: { to: "0xabcdef1234567890abcdef1234567890abcdef12", chain: "evm" }

Then (Case A):
  - PolicyDecision: { allowed: true, tier: "INSTANT" }
  - 대소문자 정규화로 정상 허용 (설계 문서의 toLowerCase 비교)

When (Case B - 등록되지 않은 주소):
  - 전송 요청: { to: "0x1111111111111111111111111111111111111111", chain: "evm" }

Then (Case B):
  - PolicyDecision: { allowed: false, reason: "수신 주소 ... 화이트리스트에 없습니다" }

When (Case C - Solana Base58 대소문자):
  - WHITELIST: ["7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"]
  - 전송 요청: { to: "7xkxtg2cw87d97txjsdpbd5jbkhetqa83tzrujogasu", chain: "solana" }

Then (Case C):
  - PolicyDecision: { allowed: false }
  - Solana Base58은 대소문자 구분이므로 다른 주소로 판정
```

**Phase 14 Mock 참조:** MockDb (policies 테이블). Unit 레벨에서 주소 정규화 로직만 검증.

---

### SEC-02-04: TIME_RESTRICTION 우회

**우선순위:** High
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit
**공격 대상:** `evaluateTimeRestriction()` -- 시간대 경계 검사

#### 공격 단계

1. TIME_RESTRICTION 정책으로 09:00~18:00만 거래 허용
2. 허용 시간대 경계(17:59:59)에서 거래를 시작하여 검사를 통과
3. 1초 후(18:00:00)에는 거부되는지 확인

#### 기대 방어

- IClock.now()로 현재 시각을 판단하여, 경계 시각에서 정확한 허용/거부 결정
- FakeClock으로 시간 제어 가능하여 경계값 테스트 가능

#### Given-When-Then

```
Given:
  - FakeClock: 2026-01-15T17:59:59Z (UTC 17시 59분 59초)
  - MockDb: policies 테이블에 TIME_RESTRICTION 정책 설정
    - allowed_hours: { start: 9, end: 18 }
    - timezone: "UTC"
    - allowed_days: [0, 1, 2, 3, 4, 5, 6]  // 모든 요일

When (Case A - 경계 내):
  - FakeClock = 17:59:59 UTC
  - 전송 요청: { amount: "100000000", chain: "solana" }

Then (Case A):
  - PolicyDecision: { allowed: true }
  - 17시는 허용 범위 내 (start <= currentHour < end, 즉 9 <= 17 < 18)

When (Case B - 경계 직후):
  - FakeClock.advance(1000)  // 18:00:00 UTC로 이동
  - 전송 요청: { amount: "100000000", chain: "solana" }

Then (Case B):
  - PolicyDecision: { allowed: false, reason: "현재 시각(18시)이 허용 시간대(9~18시)에 포함되지 않습니다" }
  - 18시는 범위 밖 (currentHour < end 조건 미충족)
```

**Phase 14 Mock 참조:** FakeClock (DI) -- `advance(ms)` 메서드로 밀리초 단위 시간 조작. FakeClock과 Jest useFakeTimers는 별개: FakeClock은 IClock.now() 반환값 제어, Jest useFakeTimers는 setTimeout/setInterval 콜백 제어 (Research Pitfall 2).

**주의:** evaluateTimeRestriction()은 내부적으로 `new Date()`가 아닌 `clock.now()`를 사용해야 테스트 가능. IClock 인터페이스 주입이 전제 조건.

---

### SEC-02-05: RATE_LIMIT 우회 -- 시간 윈도우 경계

**우선순위:** High
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit
**공격 대상:** `evaluateRateLimit()` -- 시간 윈도우 기반 거래 횟수 제한

#### 공격 단계

1. RATE_LIMIT 정책: max_tx_per_hour = 10
2. 1시간 윈도우 내에서 9건 거래를 완료 (한도 -1)
3. 윈도우 경계 시점에서 집중적으로 추가 거래를 시도

#### 기대 방어

- 시간 윈도우는 슬라이딩 윈도우 (현재 시각 - 3600초)
- max_tx_per_hour에 도달하면 즉시 DENY
- 윈도우 경계에서 이전 거래가 만료되어 카운트가 줄어들면 다시 허용

#### Given-When-Then

```
Given:
  - FakeClock: 2026-01-15T10:00:00Z
  - MockDb:
    - RATE_LIMIT 정책: { max_tx_per_hour: 10, max_tx_per_day: 0 }
    - transactions 테이블: 09:05:00Z ~ 09:50:00Z에 9건 CONFIRMED 거래 존재

When (Case A - 한도 내 마지막 요청):
  - FakeClock = 10:00:00Z (9건 모두 1시간 윈도우 내)
  - 10번째 전송 요청

Then (Case A):
  - PolicyDecision: { allowed: true }
  - 9건 < max_tx_per_hour(10) 이므로 통과

When (Case B - 한도 초과):
  - 10번째 요청 성공 후 즉시 11번째 전송 요청

Then (Case B):
  - PolicyDecision: { allowed: false, reason: "시간당 거래 한도(10회)를 초과했습니다" }

When (Case C - 윈도우 경계 이후):
  - FakeClock.advance(3600_000)  // 11:00:00Z로 이동
  - (09:05:00Z 거래가 1시간 윈도우에서 빠져나감)
  - 전송 요청

Then (Case C):
  - PolicyDecision: { allowed: true }
  - 09:05:00Z 거래가 윈도우 밖이므로 카운트 감소
```

**Phase 14 Mock 참조:** FakeClock (DI), MockDb (transactions 테이블에 테스트 데이터 삽입). evaluateRateLimit()의 `Date.now()` 대신 `clock.now()` 사용 필요.

---

### SEC-02-06: DELAY 쿨다운 조기 실행 시도

**우선순위:** High
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit
**공격 대상:** `DelayQueueWorker` -- 쿨다운 타이머 기반 자동 실행

#### 공격 단계

1. DELAY 티어로 분류된 거래 (쿨다운 15분 = 900초)
2. 쿨다운 완료 1초 전에 실행 시도
3. 정확히 쿨다운 완료 시점에서 실행 허용 확인

#### 기대 방어

- DelayQueueWorker가 `expiresAt` 필드를 확인하여 쿨다운 미완료 시 실행 차단
- FakeClock으로 시간을 정밀 제어하여 경계값 검증

#### Given-When-Then

```
Given:
  - FakeClock: 2026-01-15T10:00:00Z (쿨다운 시작 시점)
  - MockDb: transactions 테이블에 DELAY 거래 1건
    - status: "QUEUED"
    - tier: "DELAY"
    - metadata: { expiresAt: 1736942400 + 900, delaySeconds: 900 }
      (= 2026-01-15T10:15:00Z)
  - MockChainAdapter (실행 성공 반환)

When (Case A - 쿨다운 완료 1초 전):
  - FakeClock = 10:14:59Z (쿨다운 시작 + 899초)
  - DelayQueueWorker.poll() 실행

Then (Case A):
  - 거래 실행되지 않음 (status 여전히 QUEUED)
  - expiresAt > now()이므로 스킵

When (Case B - 쿨다운 정확히 완료):
  - FakeClock.advance(1000)  // 10:15:00Z
  - DelayQueueWorker.poll() 실행

Then (Case B):
  - 거래 자동 실행됨 (status: EXECUTING -> SUBMITTED -> CONFIRMED)
  - expiresAt <= now()이므로 실행 허용
```

**Phase 14 Mock 참조:** FakeClock (DI) -- DelayQueueWorker가 IClock 주입받아 `clock.now()`로 현재 시각 판단. MockChainAdapter -- 블록체인 제출 성공 반환.

---

### SEC-02-07: APPROVAL 타임아웃 후 승인 시도

**우선순위:** High
**공격자:** 악의적 AI 에이전트 (또는 지연된 Owner)
**테스트 레벨:** Unit
**공격 대상:** `ApprovalTimeoutWorker` + Owner 승인 API

#### 공격 단계

1. APPROVAL 티어로 분류된 거래 (타임아웃 1시간 = 3600초)
2. 타임아웃 만료 후(+1초) Owner가 승인을 시도
3. 만료된 거래에 대한 승인이 거부되는지 확인

#### 기대 방어

- ApprovalTimeoutWorker가 expiresAt 경과 시 거래를 EXPIRED로 전이
- 이미 EXPIRED된 거래에 대한 승인 요청은 TX_APPROVAL_TIMEOUT 에러 반환

#### Given-When-Then

```
Given:
  - FakeClock: 2026-01-15T10:00:00Z (승인 요청 시점)
  - FakeOwnerSigner (유효한 Owner 키쌍)
  - MockDb: transactions 테이블에 APPROVAL 거래 1건
    - status: "QUEUED"
    - tier: "APPROVAL"
    - metadata: { expiresAt: 1736942400 + 3600, approvalTimeoutSeconds: 3600 }
      (= 2026-01-15T11:00:00Z)

When (Case A - 타임아웃 직전):
  - FakeClock = 10:59:59Z (요청 + 3599초)
  - Owner 승인 요청: POST /v1/owner/approve { transactionId: "tx-001" }

Then (Case A):
  - 승인 성공: 거래 status QUEUED -> EXECUTING -> SUBMITTED -> CONFIRMED

When (Case B - 타임아웃 직후):
  - FakeClock = 11:00:01Z (요청 + 3601초)
  - ApprovalTimeoutWorker.poll() 실행 -> 거래 status: EXPIRED
  - Owner 승인 요청: POST /v1/owner/approve { transactionId: "tx-001" }

Then (Case B):
  - 승인 거부: TX_APPROVAL_TIMEOUT
  - 거래 status: EXPIRED (변경 불가)
  - ALLOWED_TRANSITIONS 맵에서 EXPIRED -> EXECUTING 전이 불허
```

**Phase 14 Mock 참조:** FakeClock (DI), FakeOwnerSigner (DI) -- 유효한 서명 생성으로 ownerAuth 통과. MockDb -- transactions 상태 추적.

---

### SEC-02-08: 정책 에이전트별 오버라이드 우회

**우선순위:** Medium
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit
**공격 대상:** `resolveOverrides()` -- 에이전트별 정책이 글로벌 정책을 오버라이드하는 로직

#### 공격 단계

1. 글로벌 SPENDING_LIMIT: instant_max = 10 SOL
2. 에이전트별 SPENDING_LIMIT: instant_max = 5 SOL (더 엄격)
3. 에이전트가 7 SOL 전송 시도 -- 글로벌 정책 기준으로는 INSTANT이지만 에이전트별 정책으로는 NOTIFY

#### 기대 방어

- `resolveOverrides()`에서 에이전트별 정책이 같은 type의 글로벌 정책을 완전히 대체
- 에이전트별 instant_max = 5 SOL이 적용되어 7 SOL은 NOTIFY 티어로 분류

#### Given-When-Then

```
Given:
  - MockDb: policies 테이블에 2건의 SPENDING_LIMIT 정책
    - 글로벌 (walletId = null): { instant_max: "10000000000" }  // 10 SOL
    - 지갑별 (walletId = "wallet-001"): { instant_max: "5000000000" }  // 5 SOL
  - 요청 지갑: "wallet-001"

When:
  - 전송 요청: { amount: "7000000000", chain: "solana" }  // 7 SOL

Then:
  - PolicyDecision: { allowed: true, tier: "NOTIFY" }
  - 지갑별 정책(5 SOL)이 글로벌 정책(10 SOL)을 오버라이드
  - 7 SOL > instant_max(5 SOL) 이므로 NOTIFY 티어

When (Case B - 글로벌만 있는 에이전트):
  - 요청 지갑: "wallet-002" (지갑별 정책 없음)
  - 전송 요청: { amount: "7000000000", chain: "solana" }  // 7 SOL

Then (Case B):
  - PolicyDecision: { allowed: true, tier: "INSTANT" }
  - 글로벌 정책(10 SOL)만 적용됨
  - 7 SOL <= instant_max(10 SOL) 이므로 INSTANT 티어
```

**Phase 14 Mock 참조:** MockDb (policies 테이블에 글로벌 + 지갑별 정책 동시 설정). Unit 레벨에서 resolveOverrides() 로직만 검증.

---

### SEC-02-09: 정책 미설정 시 기본 동작

**우선순위:** Medium
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit
**공격 대상:** `DatabasePolicyEngine.evaluate()` -- 정책 0건 시 기본 동작

#### 공격 단계

1. policies 테이블이 비어있는 상태 (관리자가 정책 설정을 누락)
2. 임의 금액(예: 100 SOL)의 거래를 요청
3. 정책 미설정 시 기본값이 ALLOW INSTANT인지 확인

#### 기대 방어

- 설계 문서(LOCK-MECH 섹션 3.2)에 따라 정책 0건이면 `{ allowed: true, tier: 'INSTANT' }` 반환
- Phase 7 DefaultPolicyEngine과의 호환성 유지 (passthrough)

#### Given-When-Then

```
Given:
  - MockDb: policies 테이블 비어있음 (0건)
  - 요청 지갑: "wallet-001"

When:
  - 전송 요청: { amount: "100000000000", chain: "solana" }  // 100 SOL

Then:
  - PolicyDecision: { allowed: true, tier: "INSTANT" }
  - 정책 미설정 = Phase 7 DefaultPolicyEngine 호환 동작
  - 경고 로그 출력 여부 확인 (선택적 -- 구현 시 결정)
```

**Phase 14 Mock 참조:** MockDb (policies 테이블 빈 상태). Unit 레벨에서 기본 동작 검증.

**보안 고려사항:** `waiaas init` 실행 시 기본 정책이 자동 생성되므로 정상 운영에서는 이 상태가 발생하지 않아야 한다. 다만 정책이 모두 disabled이거나 삭제된 엣지 케이스를 대비한 방어적 설계 검증이 목적이다.

---

## 3. TOCTOU 방어 메커니즘 검증 상세

### 3.1 BEGIN IMMEDIATE + reserved_amount 패턴 도식

```
┌──────────────────────────────────────────────────────────────┐
│ SQLite BEGIN IMMEDIATE 트랜잭션 (직렬화 보장)               │
│                                                              │
│  Step 1: 기존 reserved_amount 합계 읽기                      │
│  ┌────────────────────────────────────────────┐              │
│  │ SELECT COALESCE(SUM(CAST(reserved_amount   │              │
│  │   AS INTEGER)), 0) as total                │              │
│  │ FROM transactions                          │              │
│  │ WHERE wallet_id = ?                         │              │
│  │   AND reserved_amount IS NOT NULL          │              │
│  │   AND status IN ('PENDING','QUEUED',       │              │
│  │       'EXECUTING','SUBMITTED')             │              │
│  └────────────────────────────────────────────┘              │
│                                                              │
│  Step 2: effectiveAmount = usageStats.totalAmount + reserved │
│                                                              │
│  Step 3: 정책 엔진 평가 (동기적, 같은 트랜잭션 내)          │
│  ┌────────────────────────────────────────────┐              │
│  │ evaluateSync(sqlite, walletId, request,     │              │
│  │   effectiveAmount)                         │              │
│  └────────────────────────────────────────────┘              │
│                                                              │
│  Step 4: 통과 시 reserved_amount 기록                        │
│  ┌────────────────────────────────────────────┐              │
│  │ UPDATE transactions                        │              │
│  │ SET reserved_amount = ?                    │              │
│  │ WHERE id = ?                               │              │
│  └────────────────────────────────────────────┘              │
│                                                              │
│  COMMIT (implicit)                                           │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 동시 요청 시 직렬화

```
시간축 ──────────────────────────────────────────────────────>

요청 A:  [BEGIN IMMEDIATE]──[읽기+평가+기록]──[COMMIT]
요청 B:                 [대기 (SQLITE_BUSY)]──[BEGIN]──[읽기(A 반영)]──[평가]──[거부]

요청 B는 A의 COMMIT 이후에야 BEGIN을 획득할 수 있으며,
이 시점에서 A의 reserved_amount가 이미 반영되어 있으므로
effectiveAmount가 정확하게 계산된다.
```

### 3.3 reserved_amount 생명주기

| 시점 | reserved_amount | 상태 |
|------|----------------|------|
| Stage 3 정책 평가 통과 | `request.amount` 기록 | PENDING/QUEUED |
| Stage 6 CONFIRMED | NULL (confirmReserved에서 클리어) | usageStats에 반영 |
| FAILED/CANCELLED | NULL (rollbackReserved에서 클리어) | 예약량 해제 |

---

## 4. 정책 평가 순서 검증

### 4.1 DENY 우선 평가 순서

DatabasePolicyEngine의 6단계 알고리즘에서 DENY가 발생하면 이후 단계로 진행하지 않는다:

```
WHITELIST (DENY?) -> TIME_RESTRICTION (DENY?) -> RATE_LIMIT (DENY?) -> SPENDING_LIMIT (티어 분류)
```

### 4.2 순서 검증 시나리오

```
Given:
  - WHITELIST: 특정 주소만 허용
  - TIME_RESTRICTION: 09:00~18:00만 허용
  - RATE_LIMIT: max_tx_per_hour = 10
  - SPENDING_LIMIT: instant_max = 1 SOL

When:
  - 허용 시간대 외 + 화이트리스트에 없는 주소로 전송 요청

Then:
  - WHITELIST에서 먼저 DENY 반환 (Step 2에서 즉시 종료)
  - TIME_RESTRICTION까지 진행하지 않음
  - 반환된 policyId가 WHITELIST 정책의 ID와 일치
```

**검증 포인트:** DENY 사유(reason)와 policyId가 가장 먼저 거부한 정책의 것이어야 한다.

---

## 5. 시나리오 우선순위 요약

| 시나리오 | ID | 우선순위 | 테스트 레벨 | 핵심 Mock | 공격 벡터 |
|---------|-----|---------|-----------|----------|----------|
| TOCTOU 동시 거래 한도 초과 | SEC-02-01 | Critical | Integration | 실제 SQLite, MockChainAdapter | reserved_amount 경합 |
| 금액 티어 경계값 조작 | SEC-02-02 | High | Unit | FakeClock, MockDb | BigInt 경계 비교 |
| WHITELIST 대소문자 우회 | SEC-02-03 | High | Unit | MockDb | 주소 정규화 |
| TIME_RESTRICTION 우회 | SEC-02-04 | High | Unit | FakeClock, MockDb | 시간대 경계 |
| RATE_LIMIT 시간 윈도우 경계 | SEC-02-05 | High | Unit | FakeClock, MockDb | 슬라이딩 윈도우 |
| DELAY 쿨다운 조기 실행 | SEC-02-06 | High | Unit | FakeClock, MockChainAdapter | 쿨다운 타이머 |
| APPROVAL 타임아웃 후 승인 | SEC-02-07 | High | Unit | FakeClock, FakeOwnerSigner | 만료 거래 승인 |
| 에이전트별 오버라이드 우회 | SEC-02-08 | Medium | Unit | MockDb | resolveOverrides 로직 |
| 정책 미설정 기본 동작 | SEC-02-09 | Medium | Unit | MockDb | 기본값 동작 |

**구현 우선순위 권장:** Critical(SEC-02-01) -> High(SEC-02-02 ~ 07) -> Medium(SEC-02-08 ~ 09)

---

## 6. 참고: 에러 코드 매핑

시나리오에서 사용하는 에러 코드는 45-enum-unified-mapping.md의 SSoT 정의를 따른다:

| 에러 코드 | HTTP | 발생 시나리오 |
|----------|------|-------------|
| POLICY_LIMIT_EXCEEDED | 403 | SEC-02-01 (TOCTOU 한도 초과) |
| POLICY_VIOLATION | 403 | SEC-02-03 (WHITELIST 거부), SEC-02-04 (시간 제한), SEC-02-05 (횟수 제한) |
| TX_APPROVAL_TIMEOUT | 408 | SEC-02-07 (승인 타임아웃) |
| INVALID_TIER | 500 | 내부 오류 (정상 동작에서 발생하면 안 됨) |
