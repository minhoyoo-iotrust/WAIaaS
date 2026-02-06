# Phase 15: 보안 테스트 시나리오 - Research

**Researched:** 2026-02-06
**Domain:** WAIaaS 3계층 보안 모델 공격 시나리오 정의
**Confidence:** HIGH

## Summary

WAIaaS의 3계층 보안 모델(세션 인증 / 정책 엔진+Time-Lock / Kill Switch+AutoStop)의 모든 공격 벡터를 테스트 케이스 수준으로 문서화하는 Phase이다. v0.2에서 설계된 보안 계층들의 설계 문서(30, 32, 33, 34, 35, 36, 26번 deliverables)와 Phase 14의 테스트 인프라(41, 42번 docs)를 완전히 분석하여, 각 계층에서 어떤 공격이 가능하고 어떤 방어가 동작해야 하는지를 정리했다.

핵심 위협 모델은 "악의적 AI 에이전트"로, 유효한 세션 토큰을 보유하면서도 세션 범위를 초과하려는 공격을 가정한다. Given-When-Then 형식에 Phase 14의 Mock 설정(FakeClock, FakeOwnerSigner, MockChainAdapter, MockPolicyEngine)을 Given절에 명시하여 구현 시 바로 테스트 코드로 변환 가능한 수준의 시나리오를 정의해야 한다.

**Primary recommendation:** 5개 문서(SEC-01~SEC-05)로 분리하여, 각 보안 계층별 공격 시나리오 + 경계값 테스트 + 연쇄 공격 체인을 체계적으로 정의한다.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**시나리오 깊이/형식:**
- 테스트 케이스 수준으로 정의: 공격명 / 공격 단계 / 기대 방어 / Given-When-Then 테스트 케이스
- Given절에 Mock 설정을 명시하여 Phase 14의 Mock 경계 매트릭스와 직접 연결
- 각 시나리오에 우선순위 태그(Critical/High/Medium) 부여 -- 구현 순서 결정에 활용
- 테스트 레벨(Unit/Integration/E2E 등) 명시하여 Phase 14 테스트 레벨 매트릭스와 연결

**공격자 모델 & 위협 우선순위:**
- 주요 공격자: 악의적 AI 에이전트 -- WAIaaS의 핵심 위협 모델
  - 유효한 세션 토큰을 보유하지만 세션 범위를 초과하려 시도
  - 다른 에이전트의 세션 탈취 시도 포함
  - 정책 우회, 한도 소진, 타이밍 공격 등 정교한 공격까지 가정
- 외부 위협: Claude 재량 -- WAIaaS 아키텍처(localhost 기반)에 맞는 수준으로 포함
- 우선순위 기준: 자금 손실 가능성
  - Critical = 자금 직접 유출 가능
  - High = 자금 유출 경로 열림 (추가 단계 필요)
  - Medium = 정보 노출 / 가용성 저하

**경계값 테스트 범위:**
- 금액 경계: 4-tier 전체 (0.1/1/10 SOL)에 +/-1 패턴 적용
- 시간 경계: JWT 만료(exp), DELAY 쿨다운(15분), APPROVAL 타임아웃(1시간), 세션 최대 수명(7일), blockhash 만료(50초) -- 각각 -1초/정확히/+1초 패턴
- 동시성(TOCTOU) 경계: reserved_amount 동시 경합, 동시 트랜잭션 한도 초과, BEGIN IMMEDIATE 락 검증

**보안 레벨 간 연쇄 시나리오:**
- End-to-End 공격 체인 형태: Layer 1 돌파 -> Layer 2 우회 시도 -> Layer 3 발동까지 전체 체인
- 성공 + 실패 모두 포함
- 복구 흐름까지 E2E: 공격 -> 방어(Kill Switch) -> RECOVERING -> dual-auth 복구 -> 정상 운영 복귀
- 3-5개 핵심 체인

### Claude's Discretion
- 문서 구성 단위 (계층별 1문서 vs 도메인별 분리 등)
- 외부 위협 시나리오의 구체적 범위와 깊이
- 3-5개 핵심 연쇄 체인의 선택 기준

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

---

## Architecture Patterns

### 문서 구성 추천: 5-문서 분리

**추천 이유:** 요구사항이 SEC-01 ~ SEC-05로 이미 5개 도메인으로 나뉘어 있고, 각 도메인의 시나리오 수가 6~12개로 한 문서에 모두 담으면 700줄 이상이 되어 가독성이 떨어진다. 5개 문서로 분리하면 각각 150~250줄 범위에서 관리 가능하다.

| 문서 | 요구사항 | 시나리오 수 | 내용 |
|------|---------|-----------|------|
| `43-layer1-session-auth-attacks.md` | SEC-01 | 9~12개 | Layer 1 세션 인증 공격 시나리오 |
| `44-layer2-policy-bypass-attacks.md` | SEC-02 | 6~9개 | Layer 2 정책 우회 공격 시나리오 |
| `45-layer3-killswitch-recovery-attacks.md` | SEC-03 | 6~8개 | Layer 3 Kill Switch 및 복구 시나리오 |
| `46-keystore-security-scenarios.md` | SEC-04 | 4~6개 | 키스토어 보안 시나리오 |
| `47-boundary-value-chain-scenarios.md` | SEC-05 + 연쇄 | 경계값 12+ + 체인 3~5개 | 경계값 테스트 + 연쇄 공격 체인 |

**대안:** 3문서로 합치기 (L1+L2, L3+키스토어, 경계값+체인). 그러나 SEC-01만 9개 이상이므로 과밀해진다.

### 시나리오 템플릿 (표준화 형식)

각 시나리오는 다음 형식을 따른다:

```markdown
### SEC-XX-NN: [공격명]

**우선순위:** Critical | High | Medium
**공격자:** 악의적 AI 에이전트 | 외부 공격자 | 내부 접근자
**테스트 레벨:** Unit | Integration | Security
**공격 대상:** [구체적 컴포넌트/메서드]

#### 공격 단계
1. [공격자 행동 1]
2. [공격자 행동 2]
...

#### 기대 방어
- [시스템이 취해야 할 방어 동작]

#### Given-When-Then

```
Given: [Mock 설정 - FakeClock, FakeOwnerSigner 등 Phase 14 참조]
When:  [공격 행위]
Then:  [기대 결과]
```

**Phase 14 Mock 참조:** [사용할 Mock 클래스 및 설정]
```

### 연쇄 공격 체인 선택 기준

3~5개 핵심 체인을 선택하는 기준은:

1. **현실성**: 실제 발생 가능한 공격 순서 (예: 토큰 탈취 -> 한도 소진은 현실적, 키스토어 직접 공격은 localhost 전제에서 비현실적)
2. **커버리지**: 3개 레이어 모두를 한 번 이상 통과하는 체인이 포함되어야 함
3. **방어 검증**: 각 레이어에서 차단되는 케이스와 최종 Kill Switch까지 도달하는 케이스 양쪽 포함
4. **복구 검증**: 최소 1개 체인은 Kill Switch 발동 -> dual-auth 복구 -> 정상 복귀까지 E2E

**추천 5개 체인:**

| # | 체인 | 시작점 | 차단점 | 의미 |
|---|------|--------|--------|------|
| 1 | 세션 한도 소진 체인 | 유효 토큰으로 반복 거래 | Layer 1 (세션 누적 한도) | 가장 흔한 악의적 에이전트 패턴 |
| 2 | 정책 우회 + TOCTOU 체인 | 동시 요청으로 reserved_amount 경합 | Layer 2 (BEGIN IMMEDIATE) | 정교한 공격 -- 동시성 방어 검증 |
| 3 | 금액 에스컬레이션 + Kill Switch 체인 | 소액 -> 중액 -> 대액 시도 | Layer 2(DELAY/APPROVAL) -> Layer 3(AutoStop) | 3계층 전체 관통 시나리오 |
| 4 | 세션 탈취 + 복구 체인 | 타 에이전트 토큰 재사용 | Layer 1(aid 불일치) -> Kill Switch -> 복구 | 완전한 공격-방어-복구 E2E |
| 5 | 시간 기반 우회 + 연속 실패 체인 | JWT exp 경계 + 쿨다운 우회 시도 | Layer 1(만료) -> Layer 2(시간제한) -> Layer 3(AutoStop) | 시간 관련 공격 집중 검증 |

---

## Layer 1: 세션 인증 공격 벡터 분석 (SEC-01)

Phase 14의 Security 테스트 레벨(Unit 환경, 전체 <1min)에서 실행. FakeClock + FakeOwnerSigner를 DI로 주입.

### 공격 벡터 카탈로그 (9개 이상)

**Confidence: HIGH** -- 30-session-token-protocol.md에서 직접 추출

| # | 공격명 | 우선순위 | 공격 대상 | Mock 설정 |
|---|--------|---------|----------|----------|
| 1 | JWT 서명 위조 | Critical | sessionAuth Stage 1 (jwtVerify) | 다른 secret으로 서명한 JWT |
| 2 | JWT 만료 우회 | Critical | sessionAuth Stage 1 (exp claim) | FakeClock: exp + 1초 |
| 3 | 폐기된 세션 사용 | Critical | sessionAuth Stage 2 (revokedAt) | DB에 revokedAt 설정된 세션 |
| 4 | 타 에이전트 세션 탈취 | Critical | sessionAuth Stage 2 (agentId 매칭) | Agent A의 토큰으로 Agent B 리소스 접근 |
| 5 | 세션 제약 초과 -- 단건 한도 | High | validateSessionConstraints (maxAmountPerTx) | constraints: maxAmountPerTx = "1000000000" |
| 6 | 세션 제약 초과 -- 누적 한도 | High | validateSessionConstraints (maxTotalAmount) | usageStats: totalAmount 근접 상태 |
| 7 | 세션 제약 초과 -- 거래 횟수 | High | validateSessionConstraints (maxTransactions) | usageStats: totalTx = max-1 |
| 8 | 세션 제약 초과 -- 허용 작업 | High | validateSessionConstraints (allowedOperations) | constraints: ["BALANCE_CHECK"] 에서 TRANSFER 시도 |
| 9 | 세션 제약 초과 -- 허용 주소 | High | validateSessionConstraints (allowedDestinations) | 화이트리스트에 없는 주소로 전송 시도 |
| 10 | Nonce Replay 공격 | High | verifyAndConsumeNonce | 동일 nonce 재사용 |
| 11 | 토큰 접두사 변조 | Medium | sessionAuth (wai_sess_ 검사) | "Bearer invalid_prefix_..." 헤더 |
| 12 | Authorization 헤더 누락 | Medium | sessionAuth (헤더 체크) | Authorization 헤더 없이 요청 |

**핵심 방어 지점:**
- **Stage 1 (JWT 검증)**: jose jwtVerify가 서명 검증 + 만료 확인을 DB 접근 없이 수행. 위조/만료 토큰을 < 0.5ms에 거부
- **Stage 2 (DB lookup)**: token_hash 기반 조회 + revokedAt IS NULL + expiresAt > now(). 폐기된 세션 즉시 거부
- **세션 제약**: validateSessionConstraints()가 BigInt 비교로 5가지 제약 검증

### sessionAuth 미들웨어 인증 제외 경로

| 경로 | 이유 | 공격 가능성 |
|------|------|-----------|
| `/health` | 모니터링 | 정보 노출(버전 등) -- Medium |
| `/doc` | OpenAPI 스펙 | 엔드포인트 정보 노출 -- Medium |
| `/v1/auth/nonce` | 인증 전 단계 | Nonce flooding -- Medium |
| `POST /v1/sessions` | Owner 서명 인증 | SIWS/SIWE 위조 -- High |

---

## Layer 2: 정책 우회 공격 벡터 분석 (SEC-02)

**Confidence: HIGH** -- 33-time-lock-approval-mechanism.md에서 직접 추출

### 공격 벡터 카탈로그 (6개 이상)

| # | 공격명 | 우선순위 | 공격 대상 | Mock 설정 |
|---|--------|---------|----------|----------|
| 1 | TOCTOU -- 동시 거래로 한도 초과 | Critical | BEGIN IMMEDIATE + reserved_amount | 2개 동시 요청, 각각 한도 50% |
| 2 | 금액 티어 경계값 조작 | High | SPENDING_LIMIT 임계값 | 정확히 instant_max (1 SOL = 1000000000 lamports) |
| 3 | WHITELIST 우회 -- 대소문자 | High | evaluateWhitelist | EVM 주소 대소문자 변환 (0xAbC vs 0xabc) |
| 4 | TIME_RESTRICTION 우회 | High | evaluateTimeRestriction | FakeClock: 허용 시간대 경계(예: 17:59:59 vs 18:00:00) |
| 5 | RATE_LIMIT 우회 -- 시간 윈도우 경계 | High | evaluateRateLimit | 1시간 윈도우 경계에서 집중 거래 |
| 6 | DELAY 쿨다운 조기 실행 시도 | High | DelayQueueWorker | FakeClock: 쿨다운 -1초 시점에서 실행 시도 |
| 7 | APPROVAL 타임아웃 후 승인 시도 | High | ApprovalTimeoutWorker | FakeClock: 타임아웃 + 1초 후 승인 |
| 8 | 정책 에이전트별 오버라이드 우회 | Medium | resolveOverrides | 글로벌 정책과 에이전트별 정책의 우선순위 |
| 9 | 정책 미설정 시 기본 동작 | Medium | DatabasePolicyEngine (정책 0건) | 빈 policies 테이블 |

**핵심 방어 지점:**
- **TOCTOU 방지**: SQLite `BEGIN IMMEDIATE` + `reserved_amount` 컬럼으로 동시 요청 직렬화
- **DENY 우선 평가**: WHITELIST -> TIME_RESTRICTION -> RATE_LIMIT -> SPENDING_LIMIT 순서로 DENY가 먼저
- **BigInt 비교**: 금액 비교에 BigInt 사용으로 정밀도 손실 방지

---

## Layer 3: Kill Switch & AutoStop 공격 벡터 분석 (SEC-03)

**Confidence: HIGH** -- 36-killswitch-autostop-evm.md에서 직접 추출

### 공격 벡터 카탈로그 (6개 이상)

| # | 공격명 | 우선순위 | 공격 대상 | Mock 설정 |
|---|--------|---------|----------|----------|
| 1 | Kill Switch 우회 -- ACTIVATED 상태에서 API 접근 | Critical | killSwitchGuard 미들웨어 | system_state = ACTIVATED |
| 2 | 복구 brute-force -- 마스터 패스워드 | High | RecoveryAttemptTracker | 5회 실패 후 lockout 확인 |
| 3 | 복구 시 Owner 서명 위조 | Critical | ownerAuth + recover | FakeOwnerSigner: 다른 키쌍으로 서명 |
| 4 | AutoStop CONSECUTIVE_FAILURES 우회 | High | evaluateConsecutiveFailures | 연속 3회 FAILED 후 성공 없이 계속 시도 |
| 5 | Kill Switch 이중 발동 | Medium | activate() 중복 호출 | 이미 ACTIVATED 상태에서 재발동 |
| 6 | 복구 후 세션 재사용 | High | 복구 시 세션 상태 | 복구 후 이전 토큰 재사용 시도 |
| 7 | Kill Switch 캐스케이드 부분 실패 | Medium | Step 4-6 (best-effort) | 키스토어 잠금 실패 시뮬레이션 |
| 8 | RECOVERING 상태에서 API 접근 | High | killSwitchGuard | system_state = RECOVERING |

**핵심 방어 지점:**
- **killSwitchGuard**: Rate Limiter 이후, sessionAuth 이전에 위치. ACTIVATED/RECOVERING 시 /v1/owner/recover + /health + /v1/admin/status만 허용
- **6단계 캐스케이드**: Step 1-3은 BEGIN IMMEDIATE 원자적. Step 4-6은 best-effort
- **복구 dual-auth**: Owner 서명 + 마스터 패스워드 동시 요구. 5회 실패 -> 30분 lockout

---

## Keystore 보안 공격 벡터 분석 (SEC-04)

**Confidence: HIGH** -- 26-keystore-spec.md에서 직접 추출

### 공격 벡터 카탈로그 (4개 이상)

| # | 공격명 | 우선순위 | 공격 대상 | Mock 설정 |
|---|--------|---------|----------|----------|
| 1 | 잠금 상태에서 서명 시도 | Critical | ILocalKeyStore.sign() | keyStore.lock() 후 sign() 호출 |
| 2 | authTag 변조 탐지 | Critical | AES-256-GCM 복호화 | 키스토어 JSON의 authTag 1바이트 변경 |
| 3 | 잘못된 마스터 패스워드 | High | Argon2id 키 파생 | 올바르지 않은 패스워드로 unlock 시도 |
| 4 | 키스토어 파일 경로 순회 | High | 파일 시스템 접근 | `../../etc/passwd` 형태의 agentId |
| 5 | 키스토어 sodium_memzero 검증 | High | lock() 후 메모리 상태 | lock() 호출 후 이전 키 참조 불가 확인 |
| 6 | 존재하지 않는 에이전트 키 접근 | Medium | getPublicKey() / sign() | 미등록 agentId |

**핵심 방어 지점:**
- **상태 순서 검증**: unlock -> sign -> lock 순서 강제. lock 상태에서 sign은 KEYSTORE_NOT_UNLOCKED
- **AES-256-GCM authTag**: 128비트 인증 태그로 변조 탐지. 1비트만 변경되어도 복호화 실패
- **Argon2id**: memoryCost=64MiB, timeCost=3, parallelism=4로 브루트포스 내성

---

## 경계값 테스트 패턴 (SEC-05)

**Confidence: HIGH** -- 설계 문서에서 정확한 수치 추출

### 금액 경계 테스트 -- 4-tier SPENDING_LIMIT

기본 SOL 정책 기준값 (LOCK-MECH 섹션 2.3):
- INSTANT: <= 1 SOL (1_000_000_000 lamports)
- NOTIFY: <= 10 SOL (10_000_000_000 lamports)
- DELAY: <= 50 SOL (50_000_000_000 lamports)
- APPROVAL: > 50 SOL

CONTEXT.md에서는 0.1/1/10 SOL로 기술되었으나, 실제 LOCK-MECH 기본 정책은 1/10/50 SOL이다. 테스트에서는 정책 설정값에 따라 동적으로 변경 가능하므로, 테스트 케이스에서는 설정값 기반 +/-1 lamport 패턴을 사용한다.

| 경계 | -1 값 | 정확히 | +1 값 | 기대 티어 변화 |
|------|-------|--------|-------|--------------|
| INSTANT/NOTIFY | 999_999_999 | 1_000_000_000 | 1_000_000_001 | INSTANT -> INSTANT -> NOTIFY |
| NOTIFY/DELAY | 9_999_999_999 | 10_000_000_000 | 10_000_000_001 | NOTIFY -> NOTIFY -> DELAY |
| DELAY/APPROVAL | 49_999_999_999 | 50_000_000_000 | 50_000_000_001 | DELAY -> DELAY -> APPROVAL |

### 시간 경계 테스트

| 경계 | 기준값 | -1초 | 정확히 | +1초 | 방어 지점 |
|------|--------|------|--------|------|----------|
| JWT exp | 세션 만료 시각 | 유효 | 유효(정확히 만료 시각) | 만료 거부 | sessionAuth Stage 1 |
| DELAY 쿨다운 | 15분 (900초) | 실행 차단 | 실행 허용 | 실행 허용 | DelayQueueWorker |
| APPROVAL 타임아웃 | 1시간 (3600초) | 승인 가능 | 만료 | 만료 | ApprovalTimeoutWorker |
| 세션 최대 수명 | 7일 (604800초) | 발급 성공 | 발급 성공 | 발급 거부 | Zod expiresIn max |
| 세션 최소 수명 | 5분 (300초) | 발급 거부 | 발급 성공 | 발급 성공 | Zod expiresIn min |
| Blockhash 만료 | 50초 (SolanaAdapter) | 유효 | 경계 | 만료 | waitForConfirmation |
| Nonce TTL | 5분 (300초) | 유효 | 만료 | 만료 | verifyAndConsumeNonce |
| ownerAuth timestamp | 5분 (300초) | 유효 | 만료 | 만료 | ownerAuth Step 2 |

### TOCTOU 동시성 경계 테스트

| 시나리오 | 설정 | 동시 요청 | 기대 결과 |
|---------|------|----------|----------|
| reserved_amount 경합 | maxTotalAmount = 10 SOL, 현재 8 SOL | 2개 동시 각 3 SOL | 1개 성공, 1개 거부 (총 11 SOL > 10 SOL) |
| 세션 usageStats 경합 | maxTransactions = 10, 현재 9 | 2개 동시 요청 | 1개 성공, 1개 거부 |
| BEGIN IMMEDIATE 직렬화 | 임의 동시 트랜잭션 | N개 동시 | 모든 요청이 직렬 처리됨 확인 |

---

## Phase 14 Mock 인프라 매핑

**Confidence: HIGH** -- 42-mock-boundaries-interfaces-contracts.md에서 직접 추출

보안 테스트에서 사용할 Mock/Fake 구현체 매핑:

| Mock/Fake | 보안 테스트 용도 | 주요 제어 메서드 |
|-----------|----------------|----------------|
| **FakeClock** | JWT 만료 시점 제어, 쿨다운 시간 제어, 타임아웃 제어 | `advance(ms)`, `setTime(date)` |
| **FakeOwnerSigner** | ownerAuth 서명 생성/검증, 위조 서명 생성 | `signMessage(msg)`, `verify(msg, sig)` |
| **MockChainAdapter** | 블록체인 응답 제어 (잔액, 시뮬레이션 결과, 제출 결과) | `setBalance()`, `setSimulationResult()`, `setSubmitResult()` |
| **MockPolicyEngine** | 정책 결정 사전 설정 (ALLOW/DENY, 티어) | `setNextDecision()`, `setDefaultDecision()` |
| **MockNotificationChannel** | 알림 전송 기록 확인, 실패 시뮬레이션 | `sentMessages[]`, `simulateFailure()` |
| **MockKeyStore** | 키스토어 상태 제어 (unlock/lock/sign) | `unlock()`, `lock()`, `sign()` |

### Security 테스트 레벨 설정 (Phase 14 41-doc 참조)

| 항목 | 설정 |
|------|------|
| Jest config | `--maxWorkers=75%` |
| 속도 목표 | 전체 <1min |
| Mock 범위 | Unit과 동일 (모든 외부 의존성 mock) |
| 실행 빈도 | 매 PR |
| 충실도 | HIGH (공격 벡터 특화) |

---

## 외부 위협 시나리오 범위 (Claude's Discretion)

WAIaaS는 localhost(127.0.0.1) 전용이므로, 외부 네트워크 공격은 범위가 제한적이다. 다만 아래 위협은 유의미하다:

### 포함할 외부 위협 (4개)

| # | 위협 | 우선순위 | 근거 |
|---|------|---------|------|
| 1 | Host header 변조 (127.0.0.1 바이패스) | High | hostGuard 미들웨어가 hostname을 127.0.0.1로 강제하지만, X-Forwarded-Host 등으로 우회 시도 가능 |
| 2 | 파일시스템 접근 (키스토어 직접 읽기) | High | localhost 접근 가능한 다른 프로세스가 ~/.waiaas/keystore/ 직접 접근 시도 |
| 3 | config.toml JWT secret 노출 | High | config.toml 읽기로 JWT secret 획득 -> 임의 세션 토큰 생성 |
| 4 | Rate Limit 우회 (글로벌/세션/트랜잭션 3-level) | Medium | 여러 세션으로 글로벌 한도 소진 시도 |

### 제외할 외부 위협

- DDoS (네트워크 레벨) -- localhost 전용이므로 해당 없음
- TLS/MITM -- HTTP localhost이므로 TLS 없음
- DNS hijacking -- hostname이 127.0.0.1 리터럴이므로 해당 없음
- 브라우저 기반 공격 (XSS/CSRF) -- API only, 브라우저 없음 (Tauri는 별도 CORS)

---

## ownerAuth 공격 벡터 (Layer 1 + Layer 3 교차)

**Confidence: HIGH** -- 34-owner-wallet-connection.md에서 직접 추출

ownerAuth는 세션 인증(sessionAuth)과 별개로, Owner 전용 API의 요청별 서명 인증이다. Kill Switch, 거래 승인 등 핵심 관리 기능을 보호한다.

### ownerAuth 8단계 검증에 대한 공격 벡터

| # | 공격 단계 | 공격 내용 | 기대 방어 |
|---|----------|----------|----------|
| 1 | Step 1 (페이로드 파싱) | 잘못된 base64url 페이로드 | 401 INVALID_SIGNATURE |
| 2 | Step 2 (timestamp 유효성) | 5분 초과된 timestamp | 401 EXPIRED_SIGNATURE |
| 3 | Step 3 (nonce 검증) | 재사용된 nonce | 401 INVALID_NONCE |
| 4 | Step 4 (action 일치) | approve_tx action으로 kill_switch 엔드포인트 접근 | 403 ACTION_MISMATCH |
| 5 | Step 5 (서명 검증) | 다른 키쌍으로 서명된 메시지 | 401 INVALID_SIGNATURE |
| 6 | Step 6 (Owner 주소 일치) | 등록되지 않은 Owner 주소 | 401 OWNER_NOT_FOUND |
| 7 | Step 7 (도메인 바인딩) | localhost:3100이 아닌 도메인 | 401 INVALID_DOMAIN |
| 8 | 전체 | Replay 공격 (동일 페이로드 재전송) | nonce 삭제로 2회째 거부 |

---

## Don't Hand-Roll

보안 테스트 시나리오 작성 시 기존 설계 문서의 코드 패턴을 직접 참조해야 하며, 새로 발명하면 안 되는 항목:

| 문제 | 참조 문서 | 이유 |
|------|----------|------|
| JWT 검증 에러 코드 | 30-session-token-protocol.md 섹션 8.5 | AUTH_TOKEN_MISSING, AUTH_TOKEN_INVALID, AUTH_TOKEN_EXPIRED, SESSION_REVOKED 4개 정확히 사용 |
| 트랜잭션 상태 전이 | 32-transaction-pipeline-api.md 섹션 2.3 | ALLOWED_TRANSITIONS 맵에 정의된 전이만 유효 |
| PolicyDecision 티어 값 | 33-time-lock-approval-mechanism.md | INSTANT, NOTIFY, DELAY, APPROVAL 4개 |
| Kill Switch 상태 | 36-killswitch-autostop-evm.md 섹션 2.2 | NORMAL, ACTIVATED, RECOVERING 3개 |
| 보안 이벤트 타입 | 35-notification-architecture.md | 13개 NotificationEventType |
| 에러 코드 | 45-enum-unified-mapping.md | 9개 Enum SSoT |

---

## Common Pitfalls

### Pitfall 1: 경계값에서 BigInt vs Number 혼동
**What goes wrong:** JavaScript Number로 1_000_000_000 lamports를 비교하면 정밀도 문제 없지만, 더 큰 값(EVM wei)에서는 오류 발생
**Prevention:** 모든 금액 경계값 테스트에서 BigInt 문자열("1000000000")을 사용하고, 비교 로직도 BigInt

### Pitfall 2: FakeClock와 Jest Fake Timers 혼동
**What goes wrong:** IClock.now()를 FakeClock으로 제어하면서 동시에 setTimeout/setInterval을 jest.useFakeTimers()로 제어할 때, 둘이 별개임을 잊고 혼동
**Prevention:** FakeClock은 "현재 시각" 제어, jest.useFakeTimers()는 "타이머 콜백" 제어. 명확히 구분하여 Given절에 기술

### Pitfall 3: TOCTOU 테스트에서 실제 동시성 검증 불가
**What goes wrong:** Unit 테스트(단일 스레드)에서 실제 동시 요청을 시뮬레이션할 수 없어 TOCTOU 방어를 검증하지 못함
**Prevention:** TOCTOU 테스트는 Integration 레벨에서 실제 SQLite + BEGIN IMMEDIATE로 검증. Unit에서는 reserved_amount 로직의 단일 실행 경로만 검증

### Pitfall 4: sessionAuth 인증 제외 경로 누락
**What goes wrong:** `/health`, `/doc`, `/v1/auth/nonce`, `POST /v1/sessions`가 인증 제외인데, 새 엔드포인트 추가 시 잊고 포함시킴
**Prevention:** 인증 제외 경로 테스트를 별도 시나리오로 정의하여, 허용 목록에 없는 경로가 인증 없이 접근 불가함을 검증

### Pitfall 5: Kill Switch 캐스케이드의 원자성 범위 혼동
**What goes wrong:** Step 1-3은 원자적(BEGIN IMMEDIATE)이지만 Step 4-6은 best-effort. 전체를 원자적으로 가정하면 테스트 설계 오류
**Prevention:** 캐스케이드 테스트를 두 그룹으로 분리: (1) Step 1-3 원자성 검증, (2) Step 4-6 부분 실패 시 상태 일관성 검증

---

## Code Examples

### Given-When-Then 예시: JWT 만료 우회 시도

```typescript
// SEC-01-02: JWT 만료 우회 시도
describe('SEC-01-02: JWT 만료 후 접근 시도', () => {
  let clock: FakeClock
  let sessionService: SessionService

  beforeEach(() => {
    // Given: FakeClock을 세션 만료 1초 후로 설정
    clock = new FakeClock(new Date('2026-01-01T00:00:00Z'))
    sessionService = new SessionService({ clock, db: mockDb, jwtSecret: TEST_SECRET })
  })

  test('만료된 JWT로 요청하면 AUTH_TOKEN_EXPIRED를 반환해야 한다', async () => {
    // Given: 5분 후 만료되는 세션 토큰 발급
    const token = await sessionService.issue({
      agentId: 'agent-001',
      expiresIn: 300, // 5분
    })

    // When: 5분 + 1초 후 해당 토큰으로 요청
    clock.advance(301 * 1000)

    // Then: AUTH_TOKEN_EXPIRED 에러
    await expect(sessionService.verify(token))
      .rejects.toThrow('AUTH_TOKEN_EXPIRED')
  })
})
```

### Given-When-Then 예시: TOCTOU 동시 거래 공격

```typescript
// SEC-02-01: TOCTOU 동시 거래로 한도 초과 시도
describe('SEC-02-01: reserved_amount TOCTOU 방어', () => {
  // Given: maxTotalAmount = 10 SOL, 현재 사용량 = 8 SOL
  // 테스트 레벨: Integration (실제 SQLite 필요)

  test('동시 2개 요청(각 3 SOL)에서 1개만 성공해야 한다', async () => {
    // Given: SQLite DB에 세션 및 constraints 설정
    const db = await createTestDb()
    await setupSession(db, {
      constraints: { maxTotalAmount: '10000000000' }, // 10 SOL
      usageStats: { totalTx: 5, totalAmount: '8000000000' }, // 8 SOL
    })

    // When: 2개 동시 전송 요청 (각 3 SOL)
    const results = await Promise.allSettled([
      transactionService.send({ amount: '3000000000', to: 'addr1' }),
      transactionService.send({ amount: '3000000000', to: 'addr2' }),
    ])

    // Then: 정확히 1개 성공, 1개 실패 (SESSION_LIMIT_TOTAL)
    const fulfilled = results.filter(r => r.status === 'fulfilled')
    const rejected = results.filter(r => r.status === 'rejected')
    expect(fulfilled.length).toBe(1)
    expect(rejected.length).toBe(1)
  })
})
```

### Given-When-Then 예시: Kill Switch 캐스케이드

```typescript
// SEC-03-01: Kill Switch 발동 후 API 차단
describe('SEC-03-01: Kill Switch ACTIVATED 상태에서 API 차단', () => {
  test('ACTIVATED 상태에서 세션 토큰으로 API 접근 시 SYSTEM_LOCKED 반환', async () => {
    // Given: Kill Switch ACTIVATED 상태
    await killSwitchService.activate('test emergency', 'admin')

    // When: 유효한 세션 토큰으로 지갑 잔액 조회
    const res = await app.request('/v1/wallet/balance', {
      headers: { Authorization: `Bearer ${validToken}` }
    })

    // Then: 401 SYSTEM_LOCKED
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('SYSTEM_LOCKED')
  })

  test('ACTIVATED 상태에서도 /health는 접근 가능해야 한다', async () => {
    // Given: Kill Switch ACTIVATED 상태
    await killSwitchService.activate('test', 'admin')

    // When: /health 요청
    const res = await app.request('/v1/health')

    // Then: 200 OK, status = 'locked'
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.killSwitch.active).toBe(true)
  })
})
```

---

## State of the Art

| 항목 | v0.1 설계 (Cloud) | v0.2 설계 (Self-Hosted) | Phase 15 테스트 관점 |
|------|------------------|----------------------|-------------------|
| 인증 | OAuth 2.1 + API Key | JWT HS256 + SIWS/SIWE | JWT 위조/만료/폐기 시나리오 |
| 정책 | Squads 온체인 멀티시그 | DatabasePolicyEngine 로컬 DB | 4-tier 경계값 + TOCTOU |
| 비상 정지 | 없음 | Kill Switch 3-state + AutoStop | 캐스케이드 + 복구 E2E |
| 키 관리 | AWS KMS + Nitro Enclave | AES-256-GCM + Argon2id + sodium | 잠금/해제/변조 탐지 |

---

## Open Questions

1. **SIWS/SIWE 메시지 포맷 검증 깊이**
   - What we know: SIWS 메시지를 파싱하여 domain, address, nonce를 검증한다
   - What's unclear: 메시지 내 필드 순서 변경, 추가 필드 주입 등의 공격이 @web3auth/sign-in-with-solana 라이브러리에서 어떻게 처리되는지
   - Recommendation: 해당 시나리오를 Medium 우선순위로 포함하되, 라이브러리 내부 검증에 의존한다고 명시

2. **EVM 경계값 테스트**
   - What we know: EvmAdapterStub은 모든 메서드에서 CHAIN_NOT_SUPPORTED를 throw한다
   - What's unclear: EVM 관련 보안 시나리오를 v0.2에서 어디까지 포함할지
   - Recommendation: EvmAdapterStub의 throw 동작만 확인하고, EVM 특화 보안 시나리오는 v0.3으로 미루기

---

## Sources

### Primary (HIGH confidence)
- `.planning/deliverables/30-session-token-protocol.md` -- JWT 구조, sessionAuth 2-stage, nonce 관리, 세션 제약
- `.planning/deliverables/32-transaction-pipeline-api.md` -- 6-stage pipeline, 8-state machine, Stage 2-4 상세
- `.planning/deliverables/33-time-lock-approval-mechanism.md` -- DatabasePolicyEngine, 4-tier, TOCTOU 방지, DELAY/APPROVAL
- `.planning/deliverables/34-owner-wallet-connection.md` -- ownerAuth 8-step, replay nonce, action 매핑
- `.planning/deliverables/35-notification-architecture.md` -- 13 event types, INotificationChannel
- `.planning/deliverables/36-killswitch-autostop-evm.md` -- Kill Switch 3-state, 6-step cascade, AutoStop 5 rules
- `.planning/deliverables/26-keystore-spec.md` -- AES-256-GCM, Argon2id, sodium-native, 파일 포맷
- `.planning/deliverables/45-enum-unified-mapping.md` -- 9 Enum SSoT
- `docs/v0.4/41-test-levels-matrix-coverage.md` -- 6 test levels, Security 레벨 정의
- `docs/v0.4/42-mock-boundaries-interfaces-contracts.md` -- Mock 매트릭스, IClock/IOwnerSigner, Contract Tests

### Secondary (MEDIUM confidence)
- `.planning/deliverables/11-security-threat-model.md` -- v0.1 STRIDE 분석 (Cloud 기준이지만 위협 분류 참조)

## Metadata

**Confidence breakdown:**
- Layer 1 공격 벡터: HIGH -- 30번 문서에서 직접 추출, 코드 패턴 수준
- Layer 2 공격 벡터: HIGH -- 33번 문서에서 직접 추출, DatabasePolicyEngine 알고리즘 완전 분석
- Layer 3 공격 벡터: HIGH -- 36번 문서에서 직접 추출, 6-step 캐스케이드 완전 분석
- 키스토어 보안: HIGH -- 26번 문서에서 직접 추출, 암호화 프로토콜 수준
- 경계값 수치: HIGH -- 각 설계 문서에서 정확한 숫자 추출
- 연쇄 체인 선택: MEDIUM -- 분석 기반 추천이나 최종 선택은 플래너에게 위임

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (설계 문서가 변경되지 않는 한 유효)
