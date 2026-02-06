# Layer 1: 세션 인증 공격 시나리오

**문서 ID:** SEC-01
**작성일:** 2026-02-06
**상태:** 완료
**참조:** 30-session-token-protocol.md (sessionAuth 2-stage, JWT 구조), 34-owner-wallet-connection.md (ownerAuth 8-step), 45-enum-unified-mapping.md (에러 코드 SSoT), 37-rest-api-complete-spec.md (REST API 에러 도메인)
**Phase 14 참조:** 41-test-levels-matrix-coverage.md (Security 테스트 레벨), 42-mock-boundaries-interfaces-contracts.md (FakeClock, FakeOwnerSigner, MockChainAdapter)
**요구사항:** SEC-01 (Layer 1 세션 인증 공격 시나리오)

---

## 1. 문서 개요

### 1.1 목적

WAIaaS 3계층 보안의 첫 번째 방어선인 **JWT 세션 인증(sessionAuth 2-stage)**이 올바르게 동작하는지를 검증하는 공격 시나리오를 문서화한다. 구현 단계에서 Security 테스트를 바로 작성할 수 있도록, 각 시나리오를 Given-When-Then 테스트 케이스 수준으로 정의한다.

### 1.2 위협 모델 요약

| 항목 | 설명 |
|------|------|
| **주요 공격자** | 악의적 AI 에이전트 -- 유효한 세션 토큰을 보유하지만 세션 범위를 초과하려 시도 |
| **보조 공격자** | 외부 공격자 -- localhost 환경에서 다른 프로세스로 접근 시도 |
| **공격 범위** | sessionAuth 미들웨어 2-stage 검증, 세션 제약(constraints) 검증, nonce 관리, ownerAuth 교차 |
| **방어 대상** | JWT 서명 검증(Stage 1), DB 세션 조회(Stage 2), 세션 제약 5가지, nonce 일회성 |

### 1.3 우선순위 기준

| 우선순위 | 기준 | 예시 |
|---------|------|------|
| **Critical** | 자금 직접 유출 가능 | JWT 위조로 무제한 거래, 폐기 세션 사용으로 자금 이동 |
| **High** | 자금 유출 경로 열림 (추가 단계 필요) | 세션 한도 초과, nonce 재사용 |
| **Medium** | 정보 노출 / 가용성 저하 | 토큰 형식 오류, 헤더 누락 |

### 1.4 에러 코드 참조

REST API SSoT (37-rest-api-complete-spec.md 섹션 10.2~10.3)에서 사용하는 AUTH/SESSION 도메인 에러 코드:

| 에러 코드 | HTTP | 도메인 | 설명 |
|----------|------|--------|------|
| `INVALID_TOKEN` | 401 | AUTH | JWT 서명 검증 실패 또는 형식 오류 |
| `TOKEN_EXPIRED` | 401 | AUTH | JWT 만료 시간 초과 |
| `SESSION_REVOKED` | 401 | AUTH | 세션이 폐기됨 (DB 조회 결과) |
| `INVALID_NONCE` | 401 | AUTH | nonce 무효, 만료, 또는 이미 사용됨 |
| `SESSION_LIMIT_EXCEEDED` | 403 | SESSION | 세션 제약 조건 초과 (한도/횟수/주소) |
| `CONSTRAINT_VIOLATED` | 403 | SESSION | 허용 작업/주소 제약 위반 |
| `SYSTEM_LOCKED` | 401 | AUTH | Kill Switch ACTIVATED 상태에서 요청 거부 |

**참고:** 30-session-token-protocol.md에서 정의한 내부 코드(AUTH_TOKEN_MISSING, AUTH_TOKEN_INVALID 등)는 sessionAuth 미들웨어 구현체 내부 코드이며, 외부 API 응답은 위 REST API SSoT 코드로 매핑된다. 시나리오에서는 양측 코드를 병기하여 구현 시 혼동을 방지한다.

---

## 2. 세션 인증 공격 시나리오 (SEC-01-01 ~ SEC-01-12)

### SEC-01-01: JWT 서명 위조

**우선순위:** Critical
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit | Security
**공격 대상:** sessionAuth Stage 1 -- `jose.jwtVerify()`

#### 공격 단계
1. 공격자가 다른 HS256 secret("attacker-secret-key")으로 유효한 claims 구조의 JWT를 생성한다
2. `wai_sess_` 접두사를 붙여 정상 토큰 형태로 위장한다
3. `Authorization: Bearer wai_sess_{forged_jwt}` 헤더로 보호 엔드포인트에 요청한다

#### 기대 방어
- sessionAuth Stage 1에서 `jose.jwtVerify()`가 HMAC 서명 불일치를 감지하고 즉시 거부한다
- DB 조회(Stage 2)까지 도달하지 않아야 한다
- jose 라이브러리의 constant-time comparison으로 타이밍 사이드 채널 공격을 방지한다

#### Given-When-Then

```
Given:
  - 정상 JWT secret: "correct-secret-32bytes-hex-value"
  - 위조 JWT: jose.SignJWT({ sid: "fake-session-id", aid: "fake-agent-id" })
              .setProtectedHeader({ alg: 'HS256' })
              .setIssuer('waiaas')
              .setExpirationTime('1h')
              .sign(TextEncoder.encode("attacker-different-secret-key"))
  - 위조 토큰: "wai_sess_" + 위조JWT
When:
  - GET /v1/wallet/balance
  - Authorization: Bearer {위조 토큰}
Then:
  - HTTP 401
  - 에러 코드: INVALID_TOKEN (API) / AUTH_TOKEN_INVALID (내부)
  - 응답: { code: "INVALID_TOKEN", message: "...", retryable: false }
```

**Phase 14 Mock 참조:** 없음 (jose 라이브러리 자체 검증, Mock 불필요)

---

### SEC-01-02: JWT 만료 우회

**우선순위:** Critical
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit | Security
**공격 대상:** sessionAuth Stage 1 -- JWT `exp` claim 검증

#### 공격 단계
1. 공격자가 보유한 세션 토큰의 만료 시각(exp)이 도래한다
2. 만료 직후(exp + 1초 시점) 해당 토큰으로 API에 접근 시도한다
3. "만료 시각 정확히 그 순간"에도 테스트하여 경계값 동작을 확인한다

#### 기대 방어
- sessionAuth Stage 1에서 `jose.jwtVerify()`가 `exp` claim과 현재 시각을 비교하여 만료 토큰을 거부한다
- FakeClock으로 시간을 정밀 제어하여 경계값(exp 정확히, exp+1초)을 검증한다

#### Given-When-Then

```
Given:
  - FakeClock = new FakeClock(new Date('2026-01-01T00:00:00Z'))
  - 세션 토큰: expiresIn = 300초 (5분) -> exp = 2026-01-01T00:05:00Z
  - SessionService에 FakeClock DI 주입
When:
  - FakeClock.advance(301 * 1000)  // 만료 시각 + 1초 = 2026-01-01T00:05:01Z
  - GET /v1/wallet/balance
  - Authorization: Bearer {만료된 토큰}
Then:
  - HTTP 401
  - 에러 코드: TOKEN_EXPIRED (API) / AUTH_TOKEN_EXPIRED (내부)
  - 응답: { code: "TOKEN_EXPIRED", message: "...", retryable: false }
```

**Phase 14 Mock 참조:** `FakeClock` -- `advance(ms)`로 만료 시점 정밀 제어

---

### SEC-01-03: 폐기된 세션 사용

**우선순위:** Critical
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Integration | Security
**공격 대상:** sessionAuth Stage 2 -- DB `revokedAt` 필드 확인

#### 공격 단계
1. Owner가 `DELETE /v1/sessions/:id`로 세션을 폐기한다 (revokedAt 설정)
2. 공격자(악의적 에이전트)가 폐기된 세션 토큰을 저장해 두었다가 재사용을 시도한다
3. JWT 자체는 아직 만료되지 않았으므로 Stage 1을 통과한다

#### 기대 방어
- sessionAuth Stage 1(JWT 서명/만료)을 통과하더라도, Stage 2에서 DB의 `revokedAt IS NOT NULL` 조건으로 거부한다
- token_hash 기반 조회로 해당 세션을 찾고, revokedAt이 설정되어 있음을 확인한다

#### Given-When-Then

```
Given:
  - SQLite DB에 sessions 레코드: { id: "session-001", token_hash: SHA256(token), revokedAt: "2026-01-01T01:00:00Z", expiresAt: "2026-01-02T00:00:00Z" }
  - JWT 자체는 유효 (서명 정상, exp 미도래)
  - FakeClock.setTime(new Date('2026-01-01T02:00:00Z'))  // 폐기 후 1시간, 만료 전
When:
  - GET /v1/wallet/balance
  - Authorization: Bearer {폐기된 세션 토큰}
Then:
  - HTTP 401
  - 에러 코드: SESSION_REVOKED
  - 응답: { code: "SESSION_REVOKED", message: "...", retryable: false }
```

**Phase 14 Mock 참조:** `FakeClock` -- 폐기 후/만료 전 시점 설정, SQLite 테스트 DB (tmpdir)

---

### SEC-01-04: 타 에이전트 세션 탈취

**우선순위:** Critical
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Integration | Security
**공격 대상:** sessionAuth Stage 2 -- `agentId` 매칭 검증

#### 공격 단계
1. Agent A가 유효한 세션 토큰을 보유한다 (aid: "agent-A")
2. 공격자(Agent B)가 Agent A의 토큰을 탈취하여 사용한다
3. Agent B가 Agent A 토큰으로 Agent B에 속한 리소스(지갑, 거래)에 접근을 시도한다

#### 기대 방어
- sessionAuth Stage 2에서 JWT claims의 `aid`(agent-A)와 요청 대상 리소스의 agentId를 비교한다
- API 핸들러에서 `c.get('agentId')` != 요청 대상 agentId이면 접근을 거부한다
- 세션 토큰의 aid는 변경 불가 (JWT 서명으로 보호)

#### Given-When-Then

```
Given:
  - Agent A 세션: { sid: "session-A", aid: "agent-A-id" }
  - Agent B 세션: { sid: "session-B", aid: "agent-B-id" }
  - Agent A의 토큰을 Agent B가 보유 (탈취 가정)
  - DB에 Agent A의 지갑 레코드 존재
When:
  - Agent B가 Agent A 토큰으로 Agent B의 거래를 조회 시도:
    GET /v1/transactions?agentId=agent-B-id
    Authorization: Bearer {Agent A 토큰}
Then:
  - HTTP 403 또는 빈 결과
  - agentId 필터가 JWT claims의 aid("agent-A-id")로 강제 적용되어, agent-B-id의 거래는 조회 불가
  - 감사 로그에 AUTH_FAILED 이벤트 기록
```

**Phase 14 Mock 참조:** SQLite 테스트 DB (tmpdir) -- 두 에이전트 세션 레코드 사전 설정

---

### SEC-01-05: 세션 제약 초과 - 단건 한도

**우선순위:** High
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit | Security
**공격 대상:** `validateSessionConstraints()` -- `maxAmountPerTx` BigInt 비교

#### 공격 단계
1. Owner가 세션에 `maxAmountPerTx: "1000000000"` (1 SOL) 제약을 설정한다
2. 악의적 에이전트가 1 SOL + 1 lamport = `"1000000001"` 금액의 전송을 시도한다
3. BigInt 비교로 정확한 경계값 검증을 시도한다

#### 기대 방어
- `validateSessionConstraints()`에서 `BigInt(request.amount) > BigInt(constraints.maxAmountPerTx)` 비교로 거부한다
- 정확히 `"1000000000"`은 허용, `"1000000001"`은 거부

#### Given-When-Then

```
Given:
  - constraints: { maxAmountPerTx: "1000000000" }
  - usageStats: { totalTx: 0, totalAmount: "0" }
When:
  - validateSessionConstraints({
      type: "TRANSFER",
      amount: "1000000001",  // 1 SOL + 1 lamport
      to: "valid-address"
    }, constraints, usageStats)
Then:
  - 결과: { allowed: false, code: "SESSION_LIMIT_EXCEEDED" }
  - HTTP 403
  - 경계값 확인: amount = "1000000000" -> allowed: true
  - 경계값 확인: amount = "999999999" -> allowed: true
```

**Phase 14 Mock 참조:** 없음 (순수 함수 Unit 테스트, BigInt 비교)

---

### SEC-01-06: 세션 제약 초과 - 누적 한도

**우선순위:** High
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit | Security
**공격 대상:** `validateSessionConstraints()` -- `maxTotalAmount` 누적 BigInt 비교

#### 공격 단계
1. Owner가 세션에 `maxTotalAmount: "10000000000"` (10 SOL) 제약을 설정한다
2. 에이전트가 이미 9.5 SOL을 사용한 상태 (`totalAmount: "9500000000"`)
3. 에이전트가 0.6 SOL (`"600000000"`) 추가 전송을 시도한다 (합계 10.1 SOL > 10 SOL)

#### 기대 방어
- `validateSessionConstraints()`에서 `BigInt(usageStats.totalAmount) + BigInt(request.amount) > BigInt(constraints.maxTotalAmount)` 비교로 거부한다
- 누적 계산이 정확히 BigInt로 수행되어야 한다

#### Given-When-Then

```
Given:
  - constraints: { maxTotalAmount: "10000000000" }
  - usageStats: { totalTx: 5, totalAmount: "9500000000" }  // 9.5 SOL 사용 완료
When:
  - validateSessionConstraints({
      type: "TRANSFER",
      amount: "600000000",  // 0.6 SOL (누적 10.1 SOL)
      to: "valid-address"
    }, constraints, usageStats)
Then:
  - 결과: { allowed: false, code: "SESSION_LIMIT_EXCEEDED" }
  - HTTP 403
  - 경계값 확인: amount = "500000000" (누적 정확히 10 SOL) -> allowed: true
  - 경계값 확인: amount = "500000001" (누적 10 SOL + 1 lamport) -> allowed: false
```

**Phase 14 Mock 참조:** 없음 (순수 함수 Unit 테스트, BigInt 비교)

---

### SEC-01-07: 세션 제약 초과 - 거래 횟수

**우선순위:** High
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit | Security
**공격 대상:** `validateSessionConstraints()` -- `maxTransactions` 횟수 비교

#### 공격 단계
1. Owner가 세션에 `maxTransactions: 10` 제약을 설정한다
2. 에이전트가 이미 9건의 거래를 실행한 상태 (`totalTx: 9`)
3. 에이전트가 10번째 거래를 시도한다 (totalTx >= maxTransactions)

#### 기대 방어
- `validateSessionConstraints()`에서 `usageStats.totalTx >= constraints.maxTransactions` 비교로 거부한다
- totalTx가 정확히 maxTransactions에 도달하면 거부 (>= 비교)

#### Given-When-Then

```
Given:
  - constraints: { maxTransactions: 10 }
  - usageStats: { totalTx: 9, totalAmount: "5000000000" }  // 9건 실행 완료
When:
  - validateSessionConstraints({
      type: "TRANSFER",
      amount: "100000000",
      to: "valid-address"
    }, constraints, usageStats)
Then:
  - 결과: { allowed: true }  // 10번째 거래는 허용 (totalTx < maxTransactions)

  ---- 10번째 거래 성공 후 usageStats.totalTx = 10 ----

When (2차):
  - usageStats 갱신: { totalTx: 10, totalAmount: "5100000000" }
  - 11번째 거래 시도
Then (2차):
  - 결과: { allowed: false, code: "SESSION_LIMIT_EXCEEDED" }
  - HTTP 403
  - 경계값: totalTx = 9 -> allowed: true (마지막 1건 허용)
  - 경계값: totalTx = 10 -> allowed: false (한도 도달)
```

**Phase 14 Mock 참조:** 없음 (순수 함수 Unit 테스트)

---

### SEC-01-08: 세션 제약 초과 - 허용 작업

**우선순위:** High
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit | Security
**공격 대상:** `validateSessionConstraints()` -- `allowedOperations` 배열 포함 검사

#### 공격 단계
1. Owner가 세션에 `allowedOperations: ["BALANCE_CHECK"]`만 허용한다 (읽기 전용 세션)
2. 악의적 에이전트가 `TRANSFER` 작업을 시도하여 자금 이동을 시도한다

#### 기대 방어
- `validateSessionConstraints()`에서 `constraints.allowedOperations.includes(request.type)` 검사로 거부한다
- 허용 목록에 없는 모든 작업 유형을 차단한다

#### Given-When-Then

```
Given:
  - constraints: { allowedOperations: ["BALANCE_CHECK"] }
  - usageStats: { totalTx: 0, totalAmount: "0" }
When:
  - validateSessionConstraints({
      type: "TRANSFER",
      amount: "100000000",
      to: "valid-address"
    }, constraints, usageStats)
Then:
  - 결과: { allowed: false, code: "CONSTRAINT_VIOLATED" }
  - HTTP 403
  - 추가 검증: type = "BALANCE_CHECK" -> allowed: true
  - 추가 검증: type = "PROGRAM_CALL" -> allowed: false
  - 추가 검증: type = "TOKEN_TRANSFER" -> allowed: false
```

**Phase 14 Mock 참조:** 없음 (순수 함수 Unit 테스트)

---

### SEC-01-09: 세션 제약 초과 - 허용 주소

**우선순위:** High
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit | Security
**공격 대상:** `validateSessionConstraints()` -- `allowedDestinations` 화이트리스트 검사

#### 공격 단계
1. Owner가 세션에 `allowedDestinations: ["So1anaAddr1...", "So1anaAddr2..."]` 화이트리스트를 설정한다
2. 악의적 에이전트가 화이트리스트에 없는 자신의 주소로 자금 전송을 시도한다

#### 기대 방어
- `validateSessionConstraints()`에서 `constraints.allowedDestinations.includes(request.to)` 검사로 거부한다
- 화이트리스트는 정확한 문자열 일치 (Solana Base58, EVM 0x checksum)

#### Given-When-Then

```
Given:
  - constraints: {
      allowedDestinations: [
        "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
      ]
    }
  - usageStats: { totalTx: 0, totalAmount: "0" }
When:
  - validateSessionConstraints({
      type: "TRANSFER",
      amount: "100000000",
      to: "AttackerAddr111111111111111111111111111111111"
    }, constraints, usageStats)
Then:
  - 결과: { allowed: false, code: "CONSTRAINT_VIOLATED" }
  - HTTP 403
  - 추가 검증: to = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" -> allowed: true
  - 추가 검증: to = "7xkxtg2cw87d97txjsdpbd5jbkhetqa83tzrujosgas" (대소문자 변경) -> allowed: false (Solana Base58는 대소문자 구분)
```

**Phase 14 Mock 참조:** 없음 (순수 함수 Unit 테스트)

---

### SEC-01-10: Nonce Replay 공격

**우선순위:** High
**공격자:** 악의적 AI 에이전트 | 외부 공격자
**테스트 레벨:** Unit | Security
**공격 대상:** `verifyAndConsumeNonce()` -- LRU 캐시 기반 nonce 일회성 검증

#### 공격 단계
1. 공격자가 정상적인 세션 생성 과정에서 사용된 nonce를 관찰한다
2. 동일한 nonce를 재사용하여 새 세션 생성을 시도한다 (replay attack)
3. 또는 nonce TTL(5분) 만료 후 동일 nonce를 시도한다

#### 기대 방어
- `verifyAndConsumeNonce()`가 LRU 캐시에서 nonce를 조회 후 즉시 삭제한다
- 2번째 호출 시 nonce가 이미 삭제되어 `false`를 반환한다
- TTL 만료된 nonce도 LRU 캐시에서 자동 제거되어 `false`를 반환한다
- 보안 원칙: INVALID_NONCE와 NONCE_ALREADY_USED를 외부에 구분하지 않음 (정보 은닉)

#### Given-When-Then

```
Given:
  - nonce = createNonce()  // LRU 캐시에 저장, TTL 5분
  - FakeClock.setTime(new Date('2026-01-01T00:00:00Z'))
When:
  - 1차: verifyAndConsumeNonce(nonce) -> true (정상 소비)
  - 2차: verifyAndConsumeNonce(nonce) -> false (이미 삭제됨)
Then:
  - 2차 시도에서 INVALID_NONCE 에러
  - HTTP 401
  - 에러 코드: INVALID_NONCE

--- TTL 만료 테스트 ---

Given:
  - nonce2 = createNonce()
  - FakeClock.advance(5 * 60 * 1000 + 1000)  // 5분 + 1초 경과
When:
  - verifyAndConsumeNonce(nonce2) -> false (TTL 만료)
Then:
  - INVALID_NONCE 에러
  - 경계값: FakeClock.advance(5 * 60 * 1000 - 1000) -> nonce 유효
  - 경계값: FakeClock.advance(5 * 60 * 1000) -> nonce 만료 (TTL 정확히 도래)
```

**Phase 14 Mock 참조:** `FakeClock` -- nonce TTL 경계값 제어

---

### SEC-01-11: 토큰 접두사 변조

**우선순위:** Medium
**공격자:** 외부 공격자
**테스트 레벨:** Unit | Security
**공격 대상:** sessionAuth 미들웨어 -- `wai_sess_` 접두사 검사

#### 공격 단계
1. 공격자가 유효한 JWT를 획득하되, `wai_sess_` 접두사 없이 전송한다
2. 또는 다른 접두사("wai_live_", "Bearer " 직접 등)를 사용한다
3. 접두사 기반 빠른 필터링을 우회하려 시도한다

#### 기대 방어
- sessionAuth 미들웨어가 `authHeader.startsWith('Bearer wai_sess_')` 검사를 먼저 수행한다
- 접두사 불일치 시 JWT 파싱 없이 즉시 거부하여, 불필요한 연산을 방지한다

#### Given-When-Then

```
Given:
  - 유효한 JWT 문자열 (정상 secret으로 서명, 만료 전)
When:
  - 케이스 1: Authorization: Bearer eyJhbGciOi... (wai_sess_ 접두사 없음)
  - 케이스 2: Authorization: Bearer wai_live_eyJhbGciOi... (잘못된 접두사)
  - 케이스 3: Authorization: wai_sess_eyJhbGciOi... (Bearer 없음)
Then:
  - 모든 케이스: HTTP 401
  - 에러 코드: INVALID_TOKEN (API) / AUTH_TOKEN_MISSING (내부 -- 접두사 기반 필터링 실패)
  - JWT 파싱/검증이 수행되지 않아야 함
```

**Phase 14 Mock 참조:** 없음 (문자열 검사 Unit 테스트)

---

### SEC-01-12: Authorization 헤더 누락

**우선순위:** Medium
**공격자:** 외부 공격자
**테스트 레벨:** Unit | Security
**공격 대상:** sessionAuth 미들웨어 -- Authorization 헤더 존재 확인

#### 공격 단계
1. 공격자가 보호 엔드포인트에 Authorization 헤더 없이 요청한다
2. 또는 빈 Authorization 헤더(`Authorization: ""`)를 전송한다

#### 기대 방어
- sessionAuth 미들웨어가 Authorization 헤더 존재 여부를 먼저 확인한다
- 헤더 없음 또는 빈 헤더 시 즉시 거부한다

#### Given-When-Then

```
Given:
  - 보호 엔드포인트: GET /v1/wallet/balance
When:
  - 케이스 1: Authorization 헤더 없이 요청
  - 케이스 2: Authorization: "" (빈 문자열)
  - 케이스 3: Authorization: Bearer (토큰 값 없음)
Then:
  - 모든 케이스: HTTP 401
  - 에러 코드: INVALID_TOKEN (API) / AUTH_TOKEN_MISSING (내부)
  - 응답: { code: "INVALID_TOKEN", message: "세션 토큰이 필요합니다", retryable: false }
```

**Phase 14 Mock 참조:** 없음 (헤더 검사 Unit 테스트)

---

## 3. ownerAuth 공격 벡터 참조 (SEC-01-OA-01 ~ SEC-01-OA-08)

ownerAuth는 Layer 1(인증 계층)과 Layer 3(Kill Switch/관리 기능) 교차점에 위치한다. ownerAuth 미들웨어의 8단계 검증에 대한 공격 벡터를 요약한다.

> **참고:** Kill Switch 관련 공격 벡터(SEC-01-OA-05 Kill Switch 발동, SEC-01-OA-06 복구 등)는 45-layer3-killswitch-recovery-attacks.md에서 상세화한다.

### ownerAuth 8단계 공격 벡터 요약

| ID | 공격 대상 (검증 단계) | 공격 내용 | 우선순위 | 기대 방어 | 에러 코드 | Phase 14 Mock |
|----|---------------------|----------|---------|----------|----------|--------------|
| SEC-01-OA-01 | Step 1: 페이로드 파싱 | 잘못된 base64url 인코딩 또는 JSON 형식 오류 | Medium | 401 즉시 거부, Zod 파싱 실패 | INVALID_SIGNATURE | -- |
| SEC-01-OA-02 | Step 2: timestamp 유효성 | 5분 초과된 timestamp (`Math.abs(now - signedAt) > 5min`) | High | 401 거부, FakeClock으로 5분+1초 검증 | INVALID_SIGNATURE | FakeClock |
| SEC-01-OA-03 | Step 3: nonce 검증 | 재사용된 nonce (replay attack) | Critical | 401 거부, LRU 캐시에서 삭제 후 2차 시도 실패 | INVALID_NONCE | -- |
| SEC-01-OA-04 | Step 4: SIWS/SIWE 서명 검증 | 다른 키쌍으로 서명된 메시지 (위조 서명) | Critical | 401 거부, Ed25519/secp256k1 서명 검증 실패 | INVALID_SIGNATURE | FakeOwnerSigner (다른 시드) |
| SEC-01-OA-05 | Step 5: Owner 주소 일치 | owner_wallets에 등록되지 않은 주소로 서명 | High | 403 거부, DB 조회 결과 없음 | OWNER_MISMATCH | FakeOwnerSigner |
| SEC-01-OA-06 | Step 6: action 일치 | `approve_tx` action으로 서명하고 `/v1/owner/kill-switch` 엔드포인트 접근 | High | 403 거부, ROUTE_ACTION_MAP 불일치 | INVALID_SIGNATURE | FakeOwnerSigner |
| SEC-01-OA-07 | Step 7: 도메인 바인딩 | SIWS 메시지의 domain이 `localhost:3100`이 아닌 값 | Medium | 401 거부, verifySIWS 내부 도메인 검증 | INVALID_SIGNATURE | FakeOwnerSigner |
| SEC-01-OA-08 | 전체 (Replay) | 동일 ownerSignaturePayload 재전송 | Critical | nonce 소비 후 2차 요청 거부 (Step 3) | INVALID_NONCE | FakeOwnerSigner |

### Given-When-Then 대표 예시 (SEC-01-OA-04: 서명 위조)

```
Given:
  - 정상 Owner: FakeOwnerSigner('solana')  // 고정 시드 0x42*32
  - 위조자: new FakeOwnerSigner('solana') 이지만 내부 시드를 0xFF*32로 변경한 별도 인스턴스
  - nonce = createNonce()
  - SIWS 메시지 = "localhost:3100 wants you to sign in with your Solana account:\n{위조자.address}\n\nWAIaaS Owner Action: approve_tx\n..."
  - signature = 위조자.signMessage(message)  // 위조자 키로 서명
When:
  - POST /v1/owner/approve/{txId}
  - Authorization: Bearer {base64url({ chain: "solana", address: 정상Owner.address, message, signature, nonce, timestamp })}
Then:
  - HTTP 401
  - 에러 코드: INVALID_SIGNATURE
  - 이유: address(정상 Owner)와 signature(위조자 키)가 불일치 -> verifySIWS에서 nacl.sign.detached.verify 실패
```

---

## 4. 인증 제외 경로 검증

sessionAuth 미들웨어는 특정 경로를 인증에서 제외한다. 이 경로들이 올바르게 제외되고, 다른 경로는 반드시 인증을 요구하는지 검증한다.

### 4.1 인증 제외 경로 (접근 허용 확인)

| 경로 | HTTP 메서드 | 인증 없이 접근 가능 여부 | 근거 |
|------|-----------|---------------------|------|
| `/health` | GET | 허용 | 서버 상태 확인 (모니터링, 로드 밸런서) |
| `/doc` | GET | 허용 | OpenAPI 스펙 JSON (개발 도구) |
| `/v1/nonce` | GET | 허용 | nonce 발급 (인증 전 단계). SSoT 경로: 45-enum-unified-mapping.md 섹션 4 |
| `POST /v1/sessions` | POST | 허용 | Owner SIWS/SIWE 서명으로 인증 (세션 토큰이 아직 없음) |

> **경로 참고:** `/v1/auth/nonce`는 30-session-token-protocol.md의 원본 경로이며, 37-rest-api-complete-spec.md(API SSoT)에서 `/v1/nonce`로 단순화되었다. 45-enum-unified-mapping.md 섹션 4에서 SSoT 경로로 확정.

### 4.2 인증 필수 경로 (거부 확인)

| 경로 | HTTP 메서드 | 인증 없이 접근 시 기대 결과 |
|------|-----------|--------------------------|
| `/v1/wallet/balance` | GET | 401 INVALID_TOKEN |
| `/v1/transactions` | POST | 401 INVALID_TOKEN |
| `/v1/transactions/:id` | GET | 401 INVALID_TOKEN |
| `/v1/sessions` | GET | 401 INVALID_TOKEN |
| `/v1/sessions/:id` | DELETE | 401 INVALID_TOKEN |
| `/v1/agents` | GET | 401 INVALID_TOKEN |

### 4.3 Given-When-Then

```
Given:
  - sessionAuth 미들웨어 활성화
  - Authorization 헤더 없음

--- 제외 경로 검증 ---
When: GET /health
Then: HTTP 200 (인증 불필요)

When: GET /doc
Then: HTTP 200 (인증 불필요)

When: GET /v1/nonce
Then: HTTP 200 (인증 불필요)

When: POST /v1/sessions { message, signature, publicKey, agentId, constraints }
Then: HTTP 201 또는 401 (Owner 서명 기반 인증, sessionAuth 미적용)

--- 필수 경로 검증 ---
When: GET /v1/wallet/balance (Authorization 헤더 없음)
Then: HTTP 401, { code: "INVALID_TOKEN" }

When: POST /v1/transactions (Authorization 헤더 없음)
Then: HTTP 401, { code: "INVALID_TOKEN" }

When: GET /v1/sessions (Authorization 헤더 없음)
Then: HTTP 401, { code: "INVALID_TOKEN" }
```

**Phase 14 Mock 참조:** 없음 (미들웨어 라우팅 테스트)

---

## 5. 시나리오 우선순위 요약

### 5.1 세션 인증 시나리오 (SEC-01-01 ~ SEC-01-12)

| 우선순위 | 시나리오 | 개수 |
|---------|---------|------|
| **Critical** | SEC-01-01 (JWT 서명 위조), SEC-01-02 (JWT 만료 우회), SEC-01-03 (폐기 세션 사용), SEC-01-04 (타 에이전트 탈취) | 4건 |
| **High** | SEC-01-05 (단건 한도), SEC-01-06 (누적 한도), SEC-01-07 (거래 횟수), SEC-01-08 (허용 작업), SEC-01-09 (허용 주소), SEC-01-10 (Nonce Replay) | 6건 |
| **Medium** | SEC-01-11 (토큰 접두사 변조), SEC-01-12 (Authorization 헤더 누락) | 2건 |

### 5.2 ownerAuth 공격 벡터 (SEC-01-OA-01 ~ SEC-01-OA-08)

| 우선순위 | 시나리오 | 개수 |
|---------|---------|------|
| **Critical** | OA-03 (nonce replay), OA-04 (서명 위조), OA-08 (전체 replay) | 3건 |
| **High** | OA-02 (timestamp), OA-05 (Owner 주소 불일치), OA-06 (action 불일치) | 3건 |
| **Medium** | OA-01 (페이로드 파싱), OA-07 (도메인 바인딩) | 2건 |

### 5.3 전체 요약

| 구분 | Critical | High | Medium | 합계 |
|------|----------|------|--------|------|
| 세션 인증 (SEC-01) | 4 | 6 | 2 | 12 |
| ownerAuth (SEC-01-OA) | 3 | 3 | 2 | 8 |
| **합계** | **7** | **9** | **4** | **20** |

---

## 6. 참조 문서 관계

```
┌──────────────────────────────────────────────────────────────┐
│  43-layer1-session-auth-attacks.md (이 문서)                   │
│  Layer 1 세션 인증 공격 시나리오 20건 (12 + 8 ownerAuth)        │
└──────┬────────────────┬────────────────────┬─────────────────┘
       │                │                    │
  참조 v           참조 v               참조 v
┌───────────┐  ┌──────────────┐  ┌───────────────────┐
│ 30-SESS   │  │ 34-OWNR-CONN │  │ 45-ENUM-MAP       │
│ PROTO     │  │ ownerAuth    │  │ 에러 코드 SSoT     │
│ JWT 구조   │  │ 8-step       │  │ 9개 Enum          │
└───────────┘  └──────────────┘  └───────────────────┘
       │
  참조 v
┌─────────────────────────────────────────────┐
│ 42-mock-boundaries-interfaces-contracts.md   │
│ FakeClock, FakeOwnerSigner, MockChainAdapter │
│ Given절 Mock 설정 참조                        │
└─────────────────────────────────────────────┘
       │
  참조 v
┌─────────────────────────────────────────┐
│ 41-test-levels-matrix-coverage.md       │
│ Security 테스트 레벨 정의 (Unit 환경)     │
└─────────────────────────────────────────┘
```

---

*문서 ID: SEC-01*
*작성일: 2026-02-06*
*Phase: 15-security-test-scenarios*
*상태: 완료*
