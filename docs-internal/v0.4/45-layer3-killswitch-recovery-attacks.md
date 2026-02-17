# Layer 3: Kill Switch & AutoStop 공격 및 복구 시나리오 (SEC-03)

**문서 ID:** SEC-03
**작성일:** 2026-02-06
**상태:** 완료
**참조:** KILL-AUTO-EVM (36-killswitch-autostop-evm.md), OWNR-CONN (34-owner-wallet-connection.md), NOTI-ARCH (35-notification-architecture.md), MOCK (42-mock-boundaries-interfaces-contracts.md)
**요구사항:** SEC-03 (Layer 3 Kill Switch & AutoStop 공격 시나리오)

---

## 1. 문서 개요

### 1.1 목적

WAIaaS 3계층 보안의 **Layer 3(모니터링 + Kill Switch + AutoStop)**를 대상으로 한 공격 시나리오를 테스트 케이스 수준으로 정의한다. Kill Switch의 우회 시도, 복구 절차의 brute-force, AutoStop 규칙의 회피를 포함하며, 공격-방어-복구까지의 완전한 E2E 흐름을 검증한다.

### 1.2 위협 모델

**공격자 유형:**

| 공격자 | 공격 목표 | 시나리오 |
|--------|----------|---------|
| 악의적 AI 에이전트 | Kill Switch 상태에서 거래 실행 시도 | SEC-03-01, SEC-03-04, SEC-03-08 |
| 외부 접근자 (localhost 접근 가능) | 복구 brute-force, 서명 위조 | SEC-03-02, SEC-03-03 |
| 시스템 자체 (엣지 케이스) | 이중 발동, 캐스케이드 부분 실패, 세션 재사용 | SEC-03-05, SEC-03-06, SEC-03-07 |

**공격 목표:**
- ACTIVATED/RECOVERING 상태에서 killSwitchGuard를 우회하여 API 접근
- 복구 인증(dual-auth: Owner 서명 + 마스터 패스워드)을 brute-force 또는 위조로 돌파
- AutoStop 규칙의 탐지 임계값을 회피하여 에이전트 정지 없이 이상 행동 지속
- Kill Switch 캐스케이드의 부분 실패를 이용하여 불완전한 상태 유도

### 1.3 참조 설계 문서

| 문서 | 참조 내용 |
|------|----------|
| 36-killswitch-autostop-evm.md | Kill Switch 3-state 머신, 6단계 캐스케이드, AutoStop 5규칙, 복구 절차 |
| 34-owner-wallet-connection.md | ownerAuth 8단계 검증, Owner 서명 위조 방어 |
| 35-notification-architecture.md | INotificationChannel, 긴급 알림 전송 |
| 42-mock-boundaries-interfaces-contracts.md | FakeOwnerSigner, MockKeyStore, MockNotificationChannel, FakeClock |

---

## 2. 공격 시나리오 8건

### SEC-03-01: Kill Switch 우회 -- ACTIVATED 상태에서 API 접근

**우선순위:** Critical
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit (Security)
**공격 대상:** `killSwitchGuard` 미들웨어

#### 공격 단계

1. Kill Switch가 발동되어 system_state = ACTIVATED
2. 에이전트가 발동 전에 획득한 유효 세션 토큰으로 API 접근 시도
3. killSwitchGuard가 sessionAuth보다 먼저 실행되므로, 토큰 유효성과 무관하게 차단되어야 함

#### 기대 방어

- killSwitchGuard가 미들웨어 체인에서 sessionAuth 이전에 위치
- ACTIVATED 상태에서는 허용 목록 외 모든 요청에 401 SYSTEM_LOCKED 반환
- 허용 목록: `/v1/owner/recover` (POST), `/v1/health` (GET), `/v1/admin/status` (GET)

#### Given-When-Then

```
Given:
  - MockDb: system_state 테이블
    - kill_switch_status = "ACTIVATED"
    - kill_switch_activated_at = "2026-01-15T10:00:00Z"
    - kill_switch_reason = "test emergency"
  - 유효한 세션 토큰 (Kill Switch 발동 전에 발급됨)

When (Case A - 일반 API 접근):
  - GET /v1/wallet/balance
  - Headers: { Authorization: "Bearer <valid-session-token>" }

Then (Case A):
  - HTTP 401
  - 에러 코드: SYSTEM_LOCKED
  - 에러 메시지: "Kill Switch is activated. System is locked."
  - 응답에 activatedAt, reason 포함

When (Case B - /health 접근):
  - GET /v1/health (인증 헤더 없음)

Then (Case B):
  - HTTP 200 OK
  - 응답: { status: "locked", killSwitch: { active: true, activatedAt: "...", reason: "..." } }

When (Case C - /v1/owner/recover 접근):
  - POST /v1/owner/recover (ownerAuth 필요)

Then (Case C):
  - killSwitchGuard 통과 (허용 목록)
  - 이후 ownerAuth 미들웨어에서 인증 검증 진행

When (Case D - /v1/admin/status 접근):
  - GET /v1/admin/status

Then (Case D):
  - HTTP 200 OK (상태 정보 반환)
```

**Phase 14 Mock 참조:** MockDb (system_state 테이블 직접 설정). killSwitchGuard 미들웨어를 단독으로 테스트하거나 Hono app 전체에서 테스트.

---

### SEC-03-02: 복구 brute-force -- 마스터 패스워드

**우선순위:** High
**공격자:** 외부 접근자 (localhost 접근 가능)
**테스트 레벨:** Unit (Security)
**공격 대상:** `KillSwitchService.recover()` -- RecoveryAttemptTracker

#### 공격 단계

1. Kill Switch가 ACTIVATED 상태
2. 공격자가 유효한 Owner 서명을 보유 (또는 위조)
3. 마스터 패스워드를 반복적으로 시도하여 brute-force

#### 기대 방어

- 5회 연속 실패 시 30분 lockout (429 TOO_MANY_ATTEMPTS)
- lockout 기간 중 추가 시도 차단
- lockout 만료 후 재시도 가능

#### Given-When-Then

```
Given:
  - MockDb: system_state
    - kill_switch_status = "ACTIVATED"
    - recovery_failed_attempts = 0
    - recovery_lockout_until = null
  - FakeOwnerSigner (유효한 Owner 키쌍으로 서명 생성)
  - FakeClock: 2026-01-15T10:00:00Z

When (Case A - 5회 잘못된 패스워드):
  - 1~5회: POST /v1/owner/recover { masterPassword: "wrong-pass-N" }
    - 각 요청에 유효한 ownerAuth 서명 포함

Then (Case A):
  - 1~4회: HTTP 401 INVALID_MASTER_PASSWORD
    - recovery_failed_attempts 증가: 1, 2, 3, 4
  - 5회: HTTP 429 TOO_MANY_ATTEMPTS
    - recovery_failed_attempts = 5
    - recovery_lockout_until = "2026-01-15T10:30:00Z" (+30분)

When (Case B - lockout 기간 중 재시도):
  - FakeClock = 10:15:00Z (lockout 기간 내)
  - POST /v1/owner/recover { masterPassword: "correct-password" }

Then (Case B):
  - HTTP 429 TOO_MANY_ATTEMPTS
  - 올바른 패스워드여도 lockout 기간 중에는 거부

When (Case C - lockout 만료 후):
  - FakeClock.advance(30 * 60 * 1000)  // 10:30:00Z (lockout 만료)
  - POST /v1/owner/recover { masterPassword: "correct-password" }

Then (Case C):
  - HTTP 200 (복구 성공)
  - recovery_failed_attempts 초기화 = 0
  - kill_switch_status = "NORMAL"
```

**Phase 14 Mock 참조:** FakeOwnerSigner (유효 서명 생성), FakeClock (lockout 타이머 제어), MockDb (system_state + RecoveryAttemptTracker 상태 추적).

---

### SEC-03-03: 복구 시 Owner 서명 위조

**우선순위:** Critical
**공격자:** 외부 접근자 (다른 키쌍 보유)
**테스트 레벨:** Unit (Security)
**공격 대상:** `ownerAuth` 미들웨어 -- Owner 서명 검증 (recover action)

#### 공격 단계

1. Kill Switch가 ACTIVATED 상태
2. 공격자가 등록된 Owner와 다른 키쌍으로 복구 요청 서명
3. ownerAuth 8단계 검증에서 Step 5(서명 검증) 또는 Step 6(Owner 주소 일치)에서 차단

#### 기대 방어

- ownerAuth Step 5: SIWS/SIWE 서명 검증 실패 -> INVALID_SIGNATURE
- ownerAuth Step 6: 서명자 주소가 등록된 Owner 주소와 불일치 -> OWNER_NOT_FOUND

#### Given-When-Then

```
Given:
  - MockDb:
    - kill_switch_status = "ACTIVATED"
    - 등록된 Owner 주소: "owner-pubkey-AAAA"
  - FakeOwnerSigner: 다른 키쌍으로 초기화 (공격자 키)
    - 공격자 공개키: "attacker-pubkey-BBBB"

When:
  - POST /v1/owner/recover { masterPassword: "correct-password" }
  - Authorization: 공격자 키쌍으로 서명된 ownerSignaturePayload
    - action: "recover"
    - timestamp: 현재 시각
    - nonce: 유효한 nonce

Then:
  - HTTP 401 INVALID_SIGNATURE
  - ownerAuth Step 5에서 서명 검증 자체는 통과할 수 있으나
  - ownerAuth Step 6에서 서명자 주소("attacker-pubkey-BBBB")가
    등록된 Owner 주소("owner-pubkey-AAAA")와 불일치 -> OWNER_NOT_FOUND
  - kill_switch_status 변경 없음 (여전히 ACTIVATED)
```

**Phase 14 Mock 참조:** FakeOwnerSigner 두 인스턴스 필요:
1. `ownerSigner` -- 정상 Owner 키쌍 (DB에 등록된 주소)
2. `attackerSigner` -- 공격자 키쌍 (다른 주소) -- 이 키쌍으로 서명 생성

---

### SEC-03-04: AutoStop CONSECUTIVE_FAILURES 우회

**우선순위:** High
**공격자:** 악의적 AI 에이전트 (연속 실패 유발)
**테스트 레벨:** Unit (Security)
**공격 대상:** `AutoStopEngine.evaluateConsecutiveFailures()` -- 연속 실패 카운터

#### 공격 단계

1. CONSECUTIVE_FAILURES 규칙: threshold = 3
2. 에이전트가 3회 연속 거래 실패 (FAILED)
3. 4번째 거래 시도 시 AutoStop이 에이전트를 정지시키는지 확인

#### 기대 방어

- 연속 3회 FAILED 후 AutoStopEngine이 SUSPEND_AGENT 결정 반환
- AgentService가 에이전트를 SUSPENDED 상태로 전이
- 이후 추가 거래 요청은 에이전트 정지 상태로 차단

#### Given-When-Then

```
Given:
  - FakeClock: 2026-01-15T10:00:00Z
  - MockChainAdapter: submitTransaction() 호출 시 에러 반환 설정
    - setSubmitResult(null)  // 제출 실패
  - MockDb:
    - auto_stop_rules: CONSECUTIVE_FAILURES { threshold: 3 }
    - transactions: 지갑 "wallet-001"의 최근 거래 0건

When (1~3번째 거래 -- 연속 실패):
  - 거래 1: POST /v1/transactions/send -> FAILED (MockChainAdapter 실패)
  - 거래 2: POST /v1/transactions/send -> FAILED
  - 거래 3: POST /v1/transactions/send -> FAILED
  - 각 거래 실패 후 AutoStopEngine.evaluate({type: 'TX_FAILED', walletId: 'wallet-001'})

Then (3번째 실패 후):
  - AutoStopDecision: { action: "SUSPEND_AGENT", ruleType: "CONSECUTIVE_FAILURES" }
  - 에이전트 status: ACTIVE -> SUSPENDED
  - suspension_reason: "auto_stop: CONSECUTIVE_FAILURES - 3 consecutive failures"

When (4번째 거래 시도):
  - POST /v1/transactions/send (walletId: "wallet-001")

Then (4번째):
  - HTTP 403 WALLET_SUSPENDED
  - 지갑이 SUSPENDED 상태이므로 새 거래 차단
```

**Phase 14 Mock 참조:** FakeClock (DI), MockChainAdapter (`setSubmitResult(null)` 또는 예외 throw로 실패 시뮬레이션), MockDb (transactions 테이블에 FAILED 상태 기록).

**주의:** AutoStopEngine은 파이프라인 외부에서 비동기로 실행된다. 테스트에서는 SecurityEvent를 직접 전달하여 evaluate()의 반환값을 검증한다.

---

### SEC-03-05: Kill Switch 이중 발동

**우선순위:** Medium
**공격자:** 시스템 엣지 케이스
**테스트 레벨:** Unit
**공격 대상:** `KillSwitchService.activate()` -- 상태 전이 검증

#### 공격 단계

1. Kill Switch가 이미 ACTIVATED 상태
2. AutoStopEngine이 추가 이상을 감지하여 다시 activate() 호출
3. 이중 발동이 무시되거나 명확한 에러를 반환하는지 확인

#### 기대 방어

- 이미 ACTIVATED 상태에서 activate() 호출 시 409 KILL_SWITCH_ALREADY_ACTIVE
- 상태가 변경되지 않고, 캐스케이드가 재실행되지 않음
- 이중 발동 시도가 audit_log에 기록됨

#### Given-When-Then

```
Given:
  - MockDb: system_state
    - kill_switch_status = "ACTIVATED"
    - kill_switch_activated_at = "2026-01-15T10:00:00Z"
    - kill_switch_reason = "initial emergency"
    - kill_switch_actor = "owner"

When:
  - KillSwitchService.activate("second trigger", "auto_stop")

Then:
  - 에러: KILL_SWITCH_ALREADY_ACTIVE (409)
  - kill_switch_status: 여전히 "ACTIVATED"
  - kill_switch_reason: 여전히 "initial emergency" (변경 없음)
  - kill_switch_actor: 여전히 "owner" (변경 없음)
  - 캐스케이드 Step 1-6 실행되지 않음
```

**Phase 14 Mock 참조:** MockDb (system_state 직접 설정). 단순 상태 전이 로직 검증.

---

### SEC-03-06: 복구 후 세션 재사용

**우선순위:** High
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit (Security)
**공격 대상:** 세션 폐기 후 복구 시 이전 세션 토큰 재사용

#### 공격 단계

1. 에이전트가 유효한 세션 토큰을 보유
2. Kill Switch 발동 -> 캐스케이드 Step 1에서 모든 세션 폐기 (revokedAt 설정)
3. Owner가 dual-auth로 복구 -> system_state = NORMAL
4. 에이전트가 발동 전의 세션 토큰으로 API 접근 시도

#### 기대 방어

- Kill Switch 복구가 세션을 복원하지 않음 (설계 문서 섹션 4.3)
- 이전 세션의 revokedAt은 유지됨
- sessionAuth Stage 2에서 revokedAt 확인 -> SESSION_REVOKED

#### Given-When-Then

```
Given:
  - FakeOwnerSigner (유효한 Owner 키쌍)
  - MockDb:
    - sessions: wallet-001의 세션 1건 (발급 완료, revokedAt = null)
    - system_state: kill_switch_status = "NORMAL"
  - 유효한 세션 토큰: token-before-kill

When (Phase 1 - Kill Switch 발동):
  - KillSwitchService.activate("emergency", "owner")
  - 캐스케이드 Step 1: 모든 세션 revokedAt = now()

Then (Phase 1):
  - sessions.revokedAt != null
  - kill_switch_status = "ACTIVATED"

When (Phase 2 - 복구):
  - POST /v1/owner/recover { masterPassword: "correct" }
  - 유효한 Owner 서명 포함

Then (Phase 2):
  - kill_switch_status = "NORMAL" (복구 성공)
  - 에이전트 status: SUSPENDED -> ACTIVE (KILL_SWITCH 사유인 것만)

When (Phase 3 - 이전 토큰으로 접근):
  - GET /v1/wallet/balance
  - Headers: { Authorization: "Bearer <token-before-kill>" }

Then (Phase 3):
  - HTTP 401 SESSION_REVOKED
  - killSwitchGuard 통과 (NORMAL 상태)
  - sessionAuth Stage 2에서 revokedAt 확인 -> 폐기된 세션
  - 에이전트는 POST /v1/sessions로 새 세션을 발급받아야 함
```

**Phase 14 Mock 참조:** FakeOwnerSigner (복구 서명 생성), MockDb (세션 + system_state + agents 전체 추적). 이 시나리오는 Kill Switch 발동 -> 복구 -> 재접근까지의 E2E 흐름을 검증하므로 여러 컴포넌트의 상호작용이 필요하다.

---

### SEC-03-07: Kill Switch 캐스케이드 부분 실패

**우선순위:** Medium
**공격자:** 시스템 엣지 케이스 (인프라 장애)
**테스트 레벨:** Unit
**공격 대상:** 6단계 캐스케이드의 Step 4-6 best-effort 구간

#### 공격 단계

1. Kill Switch 발동 시 캐스케이드 실행
2. Step 1-3 (세션 폐기, 거래 취소, 에이전트 정지) 성공
3. Step 4 (키스토어 잠금)에서 실패 발생
4. Step 5 (알림), Step 6 (감사 기록)은 계속 진행되는지 확인

#### 기대 방어

- Step 1-3은 단일 SQLite BEGIN IMMEDIATE 트랜잭션으로 원자적 -- 하나라도 실패하면 전체 롤백
- Step 4-6은 순차 실행이되 best-effort -- 개별 실패가 다음 단계를 블로킹하지 않음
- Step 4 실패 시에도 system_state는 ACTIVATED 유지 (Step 1-3에서 이미 전이 완료)
- 알림 전송 시도됨 (Step 5), 에러 로그 기록됨 (Step 4 실패 + Step 6 성공)

#### Given-When-Then

```
Given:
  - MockKeyStore: lock() 호출 시 에러 발생 설정
    - MockKeyStore.simulateLockFailure(new Error("sodium_memzero failed"))
  - MockNotificationChannel: 정상 동작 (전송 성공)
  - MockDb:
    - sessions: 활성 세션 3건
    - transactions: PENDING/QUEUED 거래 2건
    - agents: ACTIVE 에이전트 2건

When:
  - KillSwitchService.activate("test", "admin")

Then:
  - Step 1-3 성공 (원자적 트랜잭션):
    - sessions: 3건 모두 revokedAt 설정
    - transactions: 2건 모두 status = CANCELLED, error = KILL_SWITCH
    - agents: 2건 모두 status = SUSPENDED
    - system_state: kill_switch_status = "ACTIVATED"
  - Step 4 실패:
    - MockKeyStore.lock() 에러 발생
    - 키스토어는 잠기지 않음 (메모리에 키 잔존 가능)
    - 에러 로그: "CRITICAL: KeyStore lock failed during Kill Switch cascade"
  - Step 5 진행 (best-effort):
    - MockNotificationChannel.sentMessages 에 KILL_SWITCH_ACTIVATED 알림 포함
    - 알림 본문에 키스토어 잠금 실패 정보 포함
  - Step 6 진행 (best-effort):
    - audit_log에 KILL_SWITCH_ACTIVATED 이벤트 기록
    - details에 "keystoreLockFailed: true" 포함
  - 최종 반환:
    - KillSwitchResult: { activated: true, sessionsRevoked: 3, transactionsCancelled: 2, walletsSuspended: 2 }
    - 캐스케이드 부분 실패이지만 Kill Switch 자체는 성공
```

**Phase 14 Mock 참조:** MockKeyStore (`simulateLockFailure(error)` 메서드로 실패 주입), MockNotificationChannel (`sentMessages[]` 배열로 전송 기록 확인). 캐스케이드 원자성 범위를 정확히 검증하는 핵심 시나리오.

**핵심 포인트:** Step 1-3 원자적(BEGIN IMMEDIATE) vs Step 4-6 best-effort의 경계를 명확히 구분. Step 1-3 중 하나라도 실패하면 전체 롤백되어 NORMAL 상태를 유지해야 하며, Step 4-6 실패는 ACTIVATED 상태에 영향을 주지 않는다.

---

### SEC-03-08: RECOVERING 상태에서 API 접근

**우선순위:** High
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit (Security)
**공격 대상:** `killSwitchGuard` 미들웨어 -- RECOVERING 상태 처리

#### 공격 단계

1. Kill Switch 복구 진행 중 (system_state = RECOVERING)
2. 에이전트가 복구 중인 틈을 타서 API 접근 시도
3. RECOVERING 상태에서도 ACTIVATED와 동일하게 차단되는지 확인

#### 기대 방어

- killSwitchGuard에서 RECOVERING 상태도 ACTIVATED와 동일하게 처리
- 허용 목록: `/v1/owner/recover` (POST), `/v1/health` (GET), `/v1/admin/status` (GET)
- 나머지 모든 요청에 401 SYSTEM_LOCKED 반환

#### Given-When-Then

```
Given:
  - MockDb: system_state
    - kill_switch_status = "RECOVERING"
    - kill_switch_activated_at = "2026-01-15T10:00:00Z"
    - kill_switch_reason = "emergency"
  - 유효한 세션 토큰

When (Case A - 일반 API 접근):
  - GET /v1/wallet/balance
  - Headers: { Authorization: "Bearer <valid-token>" }

Then (Case A):
  - HTTP 401 SYSTEM_LOCKED
  - RECOVERING 상태에서도 일반 API 차단

When (Case B - /v1/owner/recover 접근):
  - POST /v1/owner/recover (ownerAuth + masterPassword)

Then (Case B):
  - killSwitchGuard 통과 (허용 목록)
  - 복구 프로세스 계속 진행

When (Case C - /health 접근):
  - GET /v1/health

Then (Case C):
  - HTTP 200 OK
  - 응답: { status: "locked", killSwitch: { active: true } }

When (Case D - /v1/admin/status 접근):
  - GET /v1/admin/status

Then (Case D):
  - HTTP 200 OK (관리 상태 정보 반환)

When (Case E - 허용 목록 외 Owner API):
  - POST /v1/owner/kill-switch (이미 ACTIVATED/RECOVERING 상태에서 중복 발동)

Then (Case E):
  - HTTP 401 SYSTEM_LOCKED
  - /v1/owner/kill-switch는 허용 목록에 없으므로 차단
```

**Phase 14 Mock 참조:** MockDb (system_state 직접 설정). SEC-03-01과 유사하나 RECOVERING 상태를 명시적으로 검증하는 점이 다르다.

---

## 3. AutoStop 5가지 규칙 검증 요약

AutoStopEngine의 5가지 규칙 타입별 테스트 방향:

| # | 규칙 타입 | 임계값 (기본) | 기본 동작 | 검증 포인트 | 시나리오 |
|---|----------|-------------|----------|-----------|---------|
| 1 | CONSECUTIVE_FAILURES | 3회 연속 | SUSPEND_AGENT | 연속 실패 카운터 리셋 조건 (성공 시), 경계값 (2회 vs 3회) | SEC-03-04 |
| 2 | TIME_RESTRICTION | 허용 시간대 외 | WARN / SUSPEND_AGENT | 시간대 경계, 자정 교차 범위 | Layer 2 SEC-02-04와 연계 |
| 3 | DAILY_LIMIT_THRESHOLD | 80% WARN, 100% STOP | WARN -> SUSPEND_AGENT | 일일 누적 금액 비율 계산, BigInt 정확도 | 경계값 테스트에서 커버 |
| 4 | HOURLY_RATE | 50 tx/hour | SUSPEND_AGENT | 슬라이딩 윈도우, 경계값 (50 vs 51) | Layer 2 SEC-02-05와 유사 |
| 5 | ANOMALY_PATTERN | 동일 주소 10회/h WARN, 20회/h STOP | WARN -> SUSPEND_AGENT | 동일 주소 반복 전송 패턴 탐지 | 연쇄 시나리오에서 커버 |

**테스트 전략:** SEC-03-04에서 CONSECUTIVE_FAILURES를 상세 검증하고, 나머지 4가지 규칙은 Layer 2 정책 테스트와 유사한 패턴으로 경계값 문서(SEC-05)에서 통합 커버한다.

**AutoStop evaluate() 공통 패턴:**

```
Given:
  - FakeClock (시간 제어)
  - MockDb (transactions + auto_stop_rules 설정)

When:
  - SecurityEvent 전달: { type, walletId, timestamp, details }

Then:
  - AutoStopDecision: { action, ruleId, ruleType, reason }
  - action이 NONE이 아니면 해당 조치 실행 검증
```

---

## 4. Kill Switch 3-state 전이 검증

### 4.1 유효한 상태 전이

```
NORMAL ──activate()──> ACTIVATED ──recover()──> RECOVERING ──(복구 완료)──> NORMAL
                                  ──(복구 실패)──> ACTIVATED
```

### 4.2 잘못된 상태 전이 거부

| 현재 상태 | 시도 | 기대 결과 | 에러 코드 |
|----------|------|----------|----------|
| NORMAL | recover() | 거부 | KILL_SWITCH_NOT_ACTIVE (409) |
| ACTIVATED | activate() | 거부 | KILL_SWITCH_ALREADY_ACTIVE (409) |
| RECOVERING | activate() | 거부 | KILL_SWITCH_ALREADY_ACTIVE (409) |
| RECOVERING | recover() (추가 시도) | 거부 | 이미 복구 진행 중 |

### 4.3 전이 검증 Given-When-Then

```
Given:
  - MockDb: system_state
  - kill_switch_status = "NORMAL"

When:
  - POST /v1/owner/recover { masterPassword: "correct" }

Then:
  - HTTP 409 KILL_SWITCH_NOT_ACTIVE
  - NORMAL 상태에서는 복구 불가
```

```
Given:
  - MockDb: system_state
  - kill_switch_status = "RECOVERING"

When:
  - KillSwitchService.activate("second emergency", "auto_stop")

Then:
  - 에러: KILL_SWITCH_ALREADY_ACTIVE (409)
  - RECOVERING 중에 재발동 불가 (ACTIVATED와 동일 취급)
```

---

## 5. 복구 E2E 흐름

### 5.1 전체 복구 시퀀스

```
[정상 운영]                    [Kill Switch 발동]                    [복구]
NORMAL                         ACTIVATED                             RECOVERING -> NORMAL
 │                              │                                     │
 │  위험 감지                   │  캐스케이드 6단계 실행              │  dual-auth 검증
 │  (Owner/AutoStop/CLI)        │  1. 세션 전체 폐기                  │  1. Owner SIWS 서명 검증
 │                              │  2. 대기 거래 취소                  │  2. 마스터 패스워드 검증
 │                              │  3. 에이전트 전체 정지              │  3. 키스토어 잠금 해제
 │                              │  4. 키스토어 잠금                   │  4. 에이전트 재활성화
 │                              │  5. 긴급 알림 전송                  │     (KILL_SWITCH 사유만)
 │                              │  6. 감사 기록                       │  5. system_state -> NORMAL
 │                              │                                     │  6. 복구 알림 + 감사 기록
 │                              │  API 차단 (허용 목록 외)            │
 │                              │                                     │  [새 세션 필요]
 │                              │                                     │  에이전트는 POST /v1/sessions로
 │                              │                                     │  새 세션 발급 필요
```

### 5.2 E2E 복구 Given-When-Then

```
Given:
  - FakeOwnerSigner (유효한 Owner 키쌍)
  - FakeClock: 2026-01-15T10:00:00Z
  - MockChainAdapter, MockNotificationChannel, MockKeyStore
  - MockDb: 정상 운영 상태
    - sessions: 활성 3건
    - transactions: QUEUED 2건
    - agents: ACTIVE 2건
    - system_state: kill_switch_status = "NORMAL"

Phase 1 -- Kill Switch 발동:
When:
  - KillSwitchService.activate("emergency detected", "owner")

Then:
  - kill_switch_status = "ACTIVATED"
  - sessionsRevoked = 3, txCancelled = 2, walletsSuspended = 2
  - MockKeyStore.lock() 호출됨
  - MockNotificationChannel: KILL_SWITCH_ACTIVATED 알림 전송

Phase 2 -- 복구 시도 (성공):
When:
  - FakeClock.advance(30 * 60 * 1000)  // 30분 쿨다운 대기 (선택적)
  - POST /v1/owner/recover
    - masterPassword: "correct-master-password"
    - ownerAuth: FakeOwnerSigner로 서명 (action='recover')

Then:
  - kill_switch_status: "ACTIVATED" -> "RECOVERING" -> "NORMAL"
  - MockKeyStore.unlock() 호출됨 (마스터 패스워드로 복호화)
  - agents: KILL_SWITCH 사유로 SUSPENDED된 2건 -> ACTIVE 복원
  - MockNotificationChannel: KILL_SWITCH_RECOVERED 알림 전송

Phase 3 -- 정상 운영 복귀 확인:
When:
  - 새 세션 발급: POST /v1/sessions (Owner 서명으로 에이전트 세션 생성)
  - 새 세션 토큰으로: GET /v1/wallet/balance

Then:
  - 세션 발급 성공 (에이전트 ACTIVE 상태)
  - API 접근 성공 (NORMAL 상태, killSwitchGuard 통과)
  - 이전 토큰으로 접근 시 SESSION_REVOKED (폐기된 세션은 복원 안됨)
```

---

## 6. 시나리오 우선순위 요약

| 시나리오 | ID | 우선순위 | 테스트 레벨 | 핵심 Mock | 공격 벡터 |
|---------|-----|---------|-----------|----------|----------|
| ACTIVATED 상태 API 접근 | SEC-03-01 | Critical | Unit | MockDb | killSwitchGuard 우회 |
| 복구 brute-force 마스터 패스워드 | SEC-03-02 | High | Unit | FakeOwnerSigner, FakeClock, MockDb | RecoveryAttemptTracker |
| 복구 시 Owner 서명 위조 | SEC-03-03 | Critical | Unit | FakeOwnerSigner (다른 키쌍) | ownerAuth 서명 검증 |
| AutoStop CONSECUTIVE_FAILURES | SEC-03-04 | High | Unit | FakeClock, MockChainAdapter | 연속 실패 카운터 |
| Kill Switch 이중 발동 | SEC-03-05 | Medium | Unit | MockDb | 상태 전이 중복 |
| 복구 후 세션 재사용 | SEC-03-06 | High | Unit | FakeOwnerSigner, MockDb | 세션 폐기 영속성 |
| 캐스케이드 부분 실패 | SEC-03-07 | Medium | Unit | MockKeyStore, MockNotificationChannel | Step 1-3 vs 4-6 원자성 |
| RECOVERING 상태 API 접근 | SEC-03-08 | High | Unit | MockDb | killSwitchGuard RECOVERING |

**구현 우선순위 권장:** Critical(SEC-03-01, SEC-03-03) -> High(SEC-03-02, SEC-03-04, SEC-03-06, SEC-03-08) -> Medium(SEC-03-05, SEC-03-07)

---

## 7. 참고: 에러 코드 매핑

시나리오에서 사용하는 에러 코드는 45-enum-unified-mapping.md의 SSoT 정의를 따른다:

| 에러 코드 | HTTP | 발생 시나리오 |
|----------|------|-------------|
| SYSTEM_LOCKED | 401 | SEC-03-01, SEC-03-08 (Kill Switch 활성 상태) |
| INVALID_MASTER_PASSWORD | 401 | SEC-03-02 (복구 brute-force) |
| TOO_MANY_ATTEMPTS | 429 | SEC-03-02 (5회 실패 lockout) |
| INVALID_SIGNATURE | 401 | SEC-03-03 (Owner 서명 위조) |
| OWNER_NOT_FOUND | 401 | SEC-03-03 (등록되지 않은 Owner 주소) |
| KILL_SWITCH_ALREADY_ACTIVE | 409 | SEC-03-05 (이중 발동) |
| KILL_SWITCH_NOT_ACTIVE | 409 | 상태 전이 검증 (NORMAL에서 복구 시도) |
| SESSION_REVOKED | 401 | SEC-03-06 (복구 후 이전 세션 토큰) |
| WALLET_SUSPENDED | 403 | SEC-03-04 (AutoStop 후 지갑 차단) |

---

## 8. killSwitchGuard 미들웨어 위치

미들웨어 체인에서의 위치를 다시 확인한다:

```
ID -> 로깅 -> 종료검사 -> 보안헤더 -> Host -> CORS -> Rate -> killSwitchGuard -> sessionAuth/ownerAuth
```

- **Rate Limiter 이후:** Rate Limit 자체는 ACTIVATED 상태에서도 동작 (DDoS 방지)
- **sessionAuth 이전:** ACTIVATED 상태에서 불필요한 세션 DB 조회를 방지
- **ownerAuth 이전:** 허용 목록 경로(/v1/owner/recover)에서만 ownerAuth가 실행됨
