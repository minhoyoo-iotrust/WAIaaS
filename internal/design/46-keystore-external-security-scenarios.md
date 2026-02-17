# 키스토어 보안 및 외부 위협 시나리오

**문서 ID:** SEC-04
**작성일:** 2026-02-06
**상태:** 완료
**참조:** CORE-03 (26-keystore-spec.md), CORE-06 (29-api-framework-design.md), CORE-01 (24-monorepo-data-directory.md), MOCK (42-mock-boundaries-interfaces-contracts.md)
**Phase 14 참조:** 42-mock-boundaries-interfaces-contracts.md (MockKeyStore, memfs, FakeClock)
**요구사항:** SEC-04 (키스토어 보안 + 외부 위협 시나리오)

---

## 1. 문서 개요

### 1.1 목적

WAIaaS 키스토어(AES-256-GCM + Argon2id)의 보안 검증과 localhost 전용 아키텍처에 대한 외부 위협 시나리오를 테스트 케이스 수준으로 정의한다. Layer 1-2-3 공격 시나리오(SEC-01~03)를 보완하여 키스토어 자체의 암호학적 안전성과 데몬 외부 경계의 방어를 검증한다.

### 1.2 위협 모델

| 항목 | 설명 |
|------|------|
| **주요 공격자** | 악의적 AI 에이전트 -- 키스토어 API를 통해 비인가 서명 시도 |
| **보조 공격자** | 로컬 프로세스 -- 같은 머신에서 실행되는 다른 프로세스가 파일시스템/네트워크 접근 |
| **공격 범위** | ILocalKeyStore 인터페이스, 키스토어 파일 무결성, 미들웨어 보안 헤더, Rate Limit |
| **방어 대상** | 키 잠금 상태 검증, AES-256-GCM 인증 태그, Argon2id KDF, 메모리 제로화, Host 헤더, 글로벌 Rate Limit |

### 1.3 테스트 레벨 구분

| 레벨 | 적용 시나리오 | Mock 방식 |
|------|-------------|----------|
| **Unit** | SEC-04-01, 04, 05, 06 | MockKeyStore (tweetnacl 기반), memfs |
| **Integration** | SEC-04-02, 03 | 실제 파일시스템(tmpdir) + sodium-native/argon2 바인딩 |
| **Integration** | SEC-04-EX-01, 03, 04 | Hono test client |
| **Unit** | SEC-04-EX-02 | 파일 권한 로직 검증 |

---

## 2. 키스토어 보안 시나리오 (SEC-04-01 ~ SEC-04-06)

### SEC-04-01: 잠금 상태에서 서명 시도

**우선순위:** Critical
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit
**공격 대상:** ILocalKeyStore.sign() -- 잠금 상태 검증

#### 공격 단계

1. 데몬이 시작되었으나 아직 마스터 패스워드로 키스토어를 잠금 해제하지 않은 상태
2. 또는 keyStore.lock()이 명시적으로 호출된 후(Kill Switch 캐스케이드 Step 4)
3. 에이전트가 유효한 세션 토큰으로 거래 서명을 요청

#### 기대 방어

- ILocalKeyStore.sign()이 내부 isUnlocked 플래그를 확인하여 즉시 거부
- 키 데이터가 메모리에 존재하지 않으므로 물리적으로 서명 불가
- KEYSTORE_NOT_UNLOCKED 에러 반환

#### Given-When-Then

```
Given:
  - MockKeyStore (tweetnacl 기반 Unit Mock)
  - keyStore.lock() 호출 완료 (isUnlocked = false)
  - 등록된 지갑: "wallet-001"
  - 유효한 세션 토큰 보유 (sessionAuth 통과)

When:
  - keyStore.sign("wallet-001", Buffer.from("transfer 1 SOL to addr-X"))

Then:
  - 에러 throw: KEYSTORE_NOT_UNLOCKED
  - 에러 메시지: "Keystore is locked. Unlock with master password first."
  - 서명 데이터 반환 없음 (undefined/null이 아닌 throw)
```

**Phase 14 Mock 참조:** MockKeyStore (42-mock-boundaries-interfaces-contracts.md 섹션 3.3)
- Unit에서는 tweetnacl 기반 MockKeyStore로 잠금/해제 상태 전환 검증
- isUnlocked 플래그와 내부 keyMap이 lock() 후 비워졌는지 확인

---

### SEC-04-02: authTag 변조 탐지

**우선순위:** Critical
**공격자:** 로컬 프로세스 (파일시스템 접근)
**테스트 레벨:** Integration (실제 파일시스템 + sodium-native/argon2 바인딩 필요)
**공격 대상:** 키스토어 파일 무결성 -- AES-256-GCM 인증 태그

#### 공격 단계

1. 공격자가 `~/.waiaas/keystore/<agent-id>.json` 파일에 직접 접근
2. JSON 파일의 `crypto.authTag` 필드를 1바이트 변경 (예: 마지막 hex 문자 `9` -> `a`)
3. 데몬이 변조된 키스토어 파일로 unlock 시도

#### 기대 방어

- AES-256-GCM 복호화 시 authTag 불일치로 `ERR_OSSL_EVP_UNSUPPORTED` 또는 `Unsupported state or unable to authenticate data` 에러 발생
- sodium-native의 `crypto_aead_aes256gcm_decrypt`가 인증 실패 반환
- KEYSTORE_CORRUPTED 에러로 매핑되어 사용자에게 파일 변조 경고

#### Given-When-Then

```
Given:
  - 실제 파일시스템 (os.tmpdir() + 고유 디렉토리)
  - 정상 키스토어 파일 생성: KeyStore.create("wallet-001", "correct-password", "solana")
  - 파일 읽기 -> JSON 파싱 -> crypto.authTag의 마지막 문자 1자 변경
  - 변조된 JSON을 파일에 다시 기록

When:
  - keyStore.unlock("correct-password")
  - keyStore.sign("wallet-001", Buffer.from("test message"))

Then:
  - 에러 throw: KEYSTORE_CORRUPTED
  - 에러 메시지: "Keystore file integrity check failed. File may be tampered."
  - 복호화 결과 반환 없음
  - audit_log에 KEYSTORE_INTEGRITY_FAILURE 이벤트 기록
```

**Phase 14 Mock 참조:** 없음 (Integration -- 실제 sodium-native/argon2 바인딩 필수)
- AES-256-GCM의 AEAD 특성은 실제 암호화 라이브러리를 통해서만 완전 검증 가능
- Unit에서 tweetnacl 기반 MockKeyStore는 authTag 개념이 없으므로 Integration 필수

---

### SEC-04-03: 잘못된 마스터 패스워드

**우선순위:** High
**공격자:** 로컬 프로세스 / 브루트포스
**테스트 레벨:** Integration (실제 Argon2id 파생 필요)
**공격 대상:** 키 파생(Argon2id) -> AES-256-GCM 복호화 실패

#### 공격 단계

1. 공격자가 키스토어 파일은 변조하지 않지만 잘못된 패스워드로 unlock 시도
2. Argon2id로 잘못된 패스워드에서 다른 32바이트 키를 파생
3. 파생된 잘못된 키로 AES-256-GCM 복호화 시도

#### 기대 방어

- Argon2id가 잘못된 패스워드에서 완전히 다른 키를 파생
- AES-256-GCM이 잘못된 키로 복호화 시도 시 authTag 불일치로 인증 실패
- KEYSTORE_WRONG_PASSWORD 에러 반환 (KEYSTORE_CORRUPTED와 구분)

#### Given-When-Then

```
Given:
  - 실제 파일시스템 (os.tmpdir())
  - 정상 키스토어 생성: KeyStore.create("wallet-001", "correct-password-123!", "solana")
  - Argon2id 파라미터: memoryCost=65536, timeCost=3, parallelism=4 (설계 문서 기본값)

When:
  - keyStore.unlock("wrong-password-456!")

Then:
  - 에러 throw: KEYSTORE_WRONG_PASSWORD
  - 에러 메시지: "Invalid master password."
  - 잠금 해제 상태 변화 없음 (isUnlocked 여전히 false)
  - 응답 시간: Argon2id 파생 시간 (~200-500ms) 소요 (타이밍 기반 정보 유출 없음)
```

**Phase 14 Mock 참조:** 없음 (Integration -- 실제 argon2 npm 바인딩 필수)
- Argon2id KDF의 올바른 키 파생은 실제 라이브러리로만 검증 가능
- Unit 레벨에서 MockKeyStore는 패스워드 검증을 단순 문자열 비교로 대체

---

### SEC-04-04: 키스토어 파일 경로 순회

**우선순위:** High
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit
**공격 대상:** 키스토어 파일 경로 생성 로직

#### 공격 단계

1. 지갑 생성 시 walletId에 경로 순회 문자열 삽입: `"../../etc/passwd"`, `"../../../sensitive-file"`
2. 키스토어 파일 경로가 `~/.waiaas/keystore/{walletId}.json`으로 구성되므로, 경로 순회로 디렉토리 탈출 시도
3. 또는 walletId에 null byte, 슬래시, 백슬래시 포함: `"wallet\x00.json"`, `"wallet/../../root"`

#### 기대 방어

- walletId 유효성 검증: UUID v7 형식만 허용 (Zod regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`)
- path.resolve() 결과가 keystoreDir 내부인지 확인 (추가 방어)
- 경로 구성 요소에 `/`, `\`, `..`, null byte 포함 시 즉시 거부

#### Given-When-Then

```
Given:
  - MockKeyStore 또는 실제 KeyStore 경로 생성 함수
  - keystoreDir = "/tmp/test-waiaas/keystore"

When (Case A - 경로 순회):
  - resolveKeystorePath("../../etc/passwd")

Then (Case A):
  - 에러 throw: INVALID_AGENT_ID
  - 에러 메시지: "Invalid agent ID format."
  - 파일시스템 접근 없음 (경로 생성 단계에서 차단)

When (Case B - null byte):
  - resolveKeystorePath("wallet-001\x00.json")

Then (Case B):
  - 에러 throw: INVALID_AGENT_ID
  - null byte 포함된 문자열 거부

When (Case C - UUID v7 형식 검증):
  - resolveKeystorePath("not-a-uuid")

Then (Case C):
  - 에러 throw: INVALID_AGENT_ID
  - UUID v7 형식이 아닌 값 거부

When (Case D - 정상 UUID v7):
  - resolveKeystorePath("019502a8-7b3c-7d4e-8f5a-1234567890ab")

Then (Case D):
  - 반환: "/tmp/test-waiaas/keystore/019502a8-7b3c-7d4e-8f5a-1234567890ab.json"
  - path.resolve() 결과가 keystoreDir 하위 경로임을 확인
```

**Phase 14 Mock 참조:** memfs (Unit 레벨)
- 실제 파일시스템 접근 없이 경로 검증 로직만 테스트
- path.resolve() + startsWith() 방어를 검증

---

### SEC-04-05: sodium_memzero 메모리 클리어 검증

**우선순위:** High
**공격자:** 메모리 덤프 공격 (cold boot, heap inspection)
**테스트 레벨:** Unit
**공격 대상:** ILocalKeyStore.lock() -- 메모리 제로화

#### 공격 단계

1. 키스토어 unlock 후 개인키가 메모리(Buffer)에 로드됨
2. 키를 사용한 후 lock()을 호출하여 메모리 클리어 요청
3. 공격자가 lock() 후에도 이전 Buffer 참조에서 키 데이터를 읽으려 시도

#### 기대 방어

- lock() 호출 시 sodium_memzero (실제) 또는 buffer.fill(0) (Mock)로 키 데이터 제로화
- 이전 Buffer 참조를 통해 접근해도 0으로 채워진 데이터만 확인
- 내부 keyMap이 완전히 비워짐 (Map.clear() 또는 delete)

#### Given-When-Then

```
Given:
  - MockKeyStore (tweetnacl 기반)
  - keyStore.unlock("test-password") 호출 완료 (isUnlocked = true)
  - 지갑 "wallet-001" 등록됨
  - 내부 keyMap에서 "wallet-001"의 Buffer 참조를 저장: secretKeyRef = keyStore._getKeyBuffer("wallet-001")
  - secretKeyRef가 0이 아닌 바이트를 포함하는지 확인 (사전 조건)

When:
  - keyStore.lock()

Then:
  - keyStore.isUnlocked === false
  - secretKeyRef 버퍼의 모든 바이트가 0 (Buffer.alloc(64).equals(secretKeyRef) === true)
  - keyStore._getKeyBuffer("wallet-001") === undefined (keyMap에서 제거됨)
  - keyStore.sign("wallet-001", message) -> KEYSTORE_NOT_UNLOCKED throw
```

**Phase 14 Mock 참조:** MockKeyStore (42-mock-boundaries-interfaces-contracts.md 섹션 3.3)
- MockKeyStore.lock()에서 buffer.fill(0) + Map.clear() 동작을 검증
- **참고:** 실제 sodium_memzero의 컴파일러 최적화 방지 특성은 Unit에서 검증 불가 -- Integration에서 sodium-native 바인딩으로 별도 확인

---

### SEC-04-06: 존재하지 않는 에이전트 키 접근

**우선순위:** Medium
**공격자:** 악의적 AI 에이전트
**테스트 레벨:** Unit
**공격 대상:** ILocalKeyStore.getPublicKey() / sign()

#### 공격 단계

1. 에이전트 "agent-999"가 등록되지 않은 상태에서 해당 에이전트의 공개키 또는 서명을 요청
2. 또는 삭제된 에이전트의 ID로 키 접근 시도

#### 기대 방어

- keyMap에서 walletId 조회 실패 시 WALLET_NOT_FOUND 에러 반환
- null/undefined 반환이 아닌 명시적 에러 throw (silent failure 방지)

#### Given-When-Then

```
Given:
  - MockKeyStore (tweetnacl 기반)
  - keyStore.unlock("test-password") 호출 완료
  - 등록된 지갑: ["wallet-001", "wallet-002"]
  - "agent-999"는 등록되지 않음

When (Case A - getPublicKey):
  - keyStore.getPublicKey("agent-999")

Then (Case A):
  - 에러 throw: WALLET_NOT_FOUND
  - 에러 메시지: "Agent key not found: agent-999"

When (Case B - sign):
  - keyStore.sign("agent-999", Buffer.from("test message"))

Then (Case B):
  - 에러 throw: WALLET_NOT_FOUND
  - 서명 결과 반환 없음

When (Case C - 등록된 에이전트):
  - keyStore.getPublicKey("wallet-001")

Then (Case C):
  - 정상 반환: Base58 인코딩된 32바이트 Ed25519 공개키
  - 에러 없음
```

**Phase 14 Mock 참조:** MockKeyStore (tweetnacl 기반)

---

## 3. 외부 위협 시나리오 (SEC-04-EX-01 ~ SEC-04-EX-04)

### SEC-04-EX-01: Host 헤더 변조

**우선순위:** High
**공격자:** 로컬 프로세스 (DNS rebinding / 프록시)
**테스트 레벨:** Integration (Hono test client)
**공격 대상:** hostGuard 미들웨어 (29-api-framework-design.md)

#### 공격 단계

1. 공격자가 같은 머신에서 프록시를 설정하여 localhost:3100으로 요청 전달
2. 요청의 Host 헤더를 `evil.com`으로 설정하여 DNS rebinding 공격 시도
3. 또는 `localhost:9999`와 같이 포트가 다른 Host 헤더 전송

#### 기대 방어

- hostGuard 미들웨어가 Host 헤더를 검증
- 허용 목록: `127.0.0.1:3100`, `localhost:3100` (IPv6 `::1` 미지원 -- 설계 결정)
- 허용 목록 외 Host 헤더는 즉시 403 반환

#### Given-When-Then

```
Given:
  - Hono 앱 인스턴스 (hostGuard 미들웨어 활성화)
  - 허용 Host: ["127.0.0.1:3100", "localhost:3100"]

When (Case A - 외부 도메인):
  - GET /v1/wallet/balance
  - Headers: { Host: "evil.com" }

Then (Case A):
  - HTTP 403 Forbidden
  - 에러 코드: HOST_NOT_ALLOWED
  - sessionAuth까지 도달하지 않음 (hostGuard가 먼저 차단)

When (Case B - 잘못된 포트):
  - GET /v1/wallet/balance
  - Headers: { Host: "localhost:9999" }

Then (Case B):
  - HTTP 403 Forbidden
  - 에러 코드: HOST_NOT_ALLOWED

When (Case C - 정상 Host):
  - GET /v1/wallet/balance
  - Headers: { Host: "localhost:3100" }

Then (Case C):
  - hostGuard 통과 -> sessionAuth로 진행
  - (Authorization 헤더 없으므로 401 INVALID_TOKEN 반환 예상)

When (Case D - IP 주소):
  - GET /v1/wallet/balance
  - Headers: { Host: "127.0.0.1:3100" }

Then (Case D):
  - hostGuard 통과 -> sessionAuth로 진행
```

**Phase 14 Mock 참조:** Hono test client (app.request() 메서드)
- 미들웨어 체인 동작 확인: hostGuard -> secureHeaders -> ... -> sessionAuth

---

### SEC-04-EX-02: 키스토어 디렉토리 파일 권한 검증

**우선순위:** High
**공격자:** 로컬 프로세스 (같은 머신의 다른 사용자)
**테스트 레벨:** Unit (파일 권한 로직 검증)
**공격 대상:** 키스토어 디렉토리/파일 권한 설정 (26-keystore-spec.md 섹션 1.6)

#### 공격 단계

1. 같은 머신의 다른 사용자(또는 다른 그룹)가 `~/.waiaas/keystore/` 디렉토리에 접근 시도
2. 키스토어 파일(`<agent-id>.json`)을 직접 읽어서 암호문 + 솔트 + 파라미터 추출
3. 오프라인 브루트포스 공격에 필요한 정보를 획득

#### 기대 방어

- 디렉토리 권한: `0700` (rwx------) -- Owner만 접근 가능
- 파일 권한: `0600` (rw-------) -- Owner만 읽기/쓰기
- `waiaas init` 및 키스토어 파일 생성 시 자동으로 권한 설정
- 권한이 잘못된 경우 데몬 시작 시 경고

#### Given-When-Then

```
Given:
  - 키스토어 디렉토리 초기화 함수 (ensureKeystoreDir)
  - 테스트 경로: os.tmpdir() + "/test-waiaas-perms/keystore"

When (Case A - 디렉토리 생성):
  - ensureKeystoreDir("/tmp/test-waiaas-perms/keystore")

Then (Case A):
  - 디렉토리 생성됨
  - fs.statSync(dir).mode & 0o777 === 0o700
  - 다른 사용자 접근 불가 (r/w/x 비트 없음)

When (Case B - 파일 생성):
  - 키스토어 파일 생성: writeKeystoreFile(walletId, encryptedJson)

Then (Case B):
  - fs.statSync(filePath).mode & 0o777 === 0o600
  - 다른 사용자 읽기 불가

When (Case C - 잘못된 권한 감지):
  - fs.chmodSync(dir, 0o755) // 의도적으로 잘못된 권한 설정
  - checkKeystorePermissions(dir)

Then (Case C):
  - 경고 반환: "Keystore directory permissions are too open: 0755. Expected 0700."
  - 또는 자동 수정: fs.chmodSync(dir, 0o700)
```

**Phase 14 Mock 참조:** tmpdir (Integration 레벨) 또는 memfs (Unit에서 권한 로직만 검증)
- 실제 Unix 파일 권한 검증은 tmpdir에서 수행
- Unit에서는 권한 값 계산/비교 로직만 memfs로 검증

---

### SEC-04-EX-03: config.toml JWT Secret 노출 방지

**우선순위:** High
**공격자:** 악의적 AI 에이전트 / 정보 수집
**테스트 레벨:** Unit
**공격 대상:** API 응답에서 config 값 노출 방지

#### 공격 단계

1. 에이전트가 `/v1/admin/status`, `/health`, 또는 에러 응답에서 내부 설정 정보를 수집
2. JWT Secret이 에러 메시지, 스택 트레이스, 또는 상태 응답에 포함되는지 확인
3. JWT Secret 획득 시 임의의 세션 토큰 위조 가능 (SEC-01-01 공격과 연계)

#### 기대 방어

- 모든 공개 엔드포인트 응답에 JWT Secret이 절대 포함되지 않음
- 에러 응답(4xx, 5xx)의 message/details 필드에 내부 설정값 미포함
- `/v1/admin/status` 응답에 민감 정보 마스킹
- 스택 트레이스는 개발 모드에서만 포함 (production에서 제거)

#### Given-When-Then

```
Given:
  - Hono 앱 인스턴스 (production 모드)
  - config.toml에 jwt_secret = "super-secret-hex-string-64chars..."

When (Case A - /health 응답):
  - GET /health

Then (Case A):
  - 응답 body를 JSON.stringify() 후 검색
  - "super-secret" 문자열이 응답 어디에도 포함되지 않음
  - jwt_secret, master_password 등 민감 키워드 미포함

When (Case B - 에러 응답):
  - GET /v1/wallet/balance (Authorization 헤더 없음)

Then (Case B):
  - HTTP 401 응답
  - 에러 body에 jwt_secret 값 미포함
  - stack trace 미포함 (production 모드)

When (Case C - /admin/status 응답):
  - GET /v1/admin/status

Then (Case C):
  - 응답에 security.jwt_secret 필드가 마스킹되거나 미포함
  - 포함된다면 "***" 또는 "[REDACTED]"로 표시

When (Case D - 의도적 에러 유발):
  - 잘못된 JSON body로 POST /v1/transactions
  - Content-Type: application/json, Body: "{ invalid json"

Then (Case D):
  - HTTP 400 에러
  - 에러 메시지에 내부 설정값 미포함
  - Zod 파싱 에러만 포함
```

**Phase 14 Mock 참조:** Hono test client
- 모든 응답을 문자열화하여 민감 문자열 검색 (negative assertion)

---

### SEC-04-EX-04: Rate Limit 우회 -- 다중 세션 글로벌 한도 소진

**우선순위:** Medium
**공격자:** 악의적 AI 에이전트 (다중 세션)
**테스트 레벨:** Integration
**공격 대상:** 3-level Rate Limiter (29-api-framework-design.md)

#### 공격 단계

1. 악의적 에이전트가 3개의 세션 토큰을 발급받음 (각 세션의 Rate Limit = 300 req/min)
2. 각 세션에서 40 req/min씩 총 120 req/min으로 글로벌 한도(100 req/min)를 초과 시도
3. 세션별 한도(300)에는 미달하지만 글로벌 한도(100)를 초과하는 지점을 공격

#### 기대 방어

- 3-level Rate Limiter가 글로벌 한도를 최우선으로 적용
- 글로벌 100 req/min 초과 시 세션별 한도 잔여량과 무관하게 429 반환
- Rate Limit 헤더(`X-RateLimit-Remaining`, `Retry-After`)가 정확하게 반환

#### Given-When-Then

```
Given:
  - Hono 앱 인스턴스 (Rate Limiter 활성화)
  - 글로벌 Rate Limit: 100 req/min
  - 세션별 Rate Limit: 300 req/min
  - 거래 Rate Limit: 10 req/min
  - 3개 유효한 세션 토큰: tokenA, tokenB, tokenC
  - FakeClock (시간 고정)

When:
  - tokenA로 40 req 전송 (GET /v1/wallet/balance)
  - tokenB로 40 req 전송
  - tokenC로 21 req 전송 (총 101 req)

Then:
  - tokenA 40 req: 모두 200 OK (글로벌 누적: 40)
  - tokenB 40 req: 모두 200 OK (글로벌 누적: 80)
  - tokenC 20 req: 200 OK (글로벌 누적: 100)
  - tokenC 21번째 req: HTTP 429 Too Many Requests
  - 응답 헤더: X-RateLimit-Remaining: 0, Retry-After: {초}
  - 이후 tokenA/B/C 모든 요청: 429 (글로벌 한도 소진)
```

**Phase 14 Mock 참조:** FakeClock (시간 고정으로 Rate Limit 윈도우 제어)
- 1분 경과 후 Rate Limit 리셋 검증도 포함 가능

---

## 4. 시나리오 우선순위 요약

### 4.1 키스토어 보안 시나리오 (SEC-04-01 ~ SEC-04-06)

| ID | 공격명 | 우선순위 | 테스트 레벨 | Mock |
|----|--------|---------|-----------|------|
| SEC-04-01 | 잠금 상태에서 서명 시도 | Critical | Unit | MockKeyStore |
| SEC-04-02 | authTag 변조 탐지 | Critical | Integration | 실제 sodium-native |
| SEC-04-03 | 잘못된 마스터 패스워드 | High | Integration | 실제 argon2 |
| SEC-04-04 | 파일 경로 순회 | High | Unit | memfs |
| SEC-04-05 | 메모리 클리어 검증 | High | Unit | MockKeyStore |
| SEC-04-06 | 존재하지 않는 에이전트 키 | Medium | Unit | MockKeyStore |

### 4.2 외부 위협 시나리오 (SEC-04-EX-01 ~ SEC-04-EX-04)

| ID | 공격명 | 우선순위 | 테스트 레벨 | Mock |
|----|--------|---------|-----------|------|
| SEC-04-EX-01 | Host 헤더 변조 | High | Integration | Hono test client |
| SEC-04-EX-02 | 키스토어 디렉토리 권한 | High | Unit | tmpdir/memfs |
| SEC-04-EX-03 | JWT Secret 노출 방지 | High | Unit | Hono test client |
| SEC-04-EX-04 | Rate Limit 글로벌 한도 | Medium | Integration | FakeClock |

### 4.3 전체 분포

| 우선순위 | 건수 | 시나리오 ID |
|---------|------|-----------|
| **Critical** | 2건 | SEC-04-01, SEC-04-02 |
| **High** | 6건 | SEC-04-03, SEC-04-04, SEC-04-05, SEC-04-EX-01, SEC-04-EX-02, SEC-04-EX-03 |
| **Medium** | 2건 | SEC-04-06, SEC-04-EX-04 |
| **합계** | **10건** | |

---

## 5. Phase 14 Mock 인프라 참조 요약

SEC-04 시나리오에서 사용하는 Phase 14 Mock 구현체:

| Mock / Fake | 적용 시나리오 | 역할 |
|-------------|-------------|------|
| **MockKeyStore** | SEC-04-01, 05, 06 | tweetnacl 기반 ILocalKeyStore Mock. 잠금/해제, 키 관리, 메모리 제로화 |
| **memfs** | SEC-04-04, EX-02 | 메모리 기반 파일시스템. 경로 순회/권한 로직 Unit 테스트 |
| **FakeClock** | SEC-04-EX-04 | 시간 고정으로 Rate Limit 윈도우 제어 |
| **Hono test client** | SEC-04-EX-01, EX-03 | app.request() 메서드로 미들웨어 체인 통합 테스트 |
| **실제 sodium-native** | SEC-04-02 | Integration에서 AES-256-GCM AEAD 검증 (Mock 불가) |
| **실제 argon2** | SEC-04-03 | Integration에서 Argon2id KDF 검증 (Mock 불가) |
