# 마일스톤 m07: 구현 장애 요소 해소

## 목표

v0.1~v0.4 설계 문서 전수 분석에서 도출된 구현 장애 요소를 해소한다. 원래 29건이 식별되었으나, v0.5(인증 모델 재설계)와 v0.6(블록체인 기능 확장)에서 4건이 선행 해소되어 **25건(CRITICAL 7 + HIGH 10 + MEDIUM 8)**이 남아 있다. 코드 작성 전에 "설계대로 구현하면 동작하지 않는 부분"을 제거하여, 구현 첫날부터 차단 없이 진행할 수 있는 상태를 만든다.

## 배경

### 이전 마일스톤과의 관계

| 마일스톤 | 해결한 문제 | 남은 문제 |
|----------|-----------|----------|
| v0.1 (Research & Design) | "무엇을 만들 것인가" | 설계 부재 |
| v0.2 (Self-Hosted Design) | "어떻게 만들 것인가" | 문서 간 불일치 |
| v0.3 (설계 일관성 확보) | 용어/Enum/경로 통일 (37건) | 기술적 실현 가능성 미검증 |
| v0.4 (테스트 전략) | "어떻게 검증할 것인가" | 구현 시 기술적 장애물 |
| v0.5 (인증 재설계 + DX) | 3-tier 인증 분리, 세션 갱신 | 인증 외 구현 장애물 |
| v0.6 (블록체인 확장 설계) | SPL/ERC-20, 컨트랙트, DeFi 추상화 | 인프라/보안 구현 장애물 |
| **v0.7 (본 마일스톤)** | **"코드로 옮길 때 부딪히는 기술적 문제 25건"** | — |

### 문제의 성격

v0.3에서 해소한 37건은 **문서 간 용어/값/경로 불일치**였다. 본 마일스톤의 25건은 성격이 다르다:

| 구분 | v0.3 비일관성 | v0.7 구현 장애 |
|------|-------------|-------------|
| 예시 | TransactionStatus 값 불일치 | Solana blockhash 만료 경쟁 조건 |
| 발견 방법 | 문서 간 교차 대조 | 구현 시뮬레이션 + 기술 분석 |
| 해결 방법 | SSoT 대응표 작성 | 설계 보완 + 의사결정 + 스펙 추가 |
| 미해결 시 영향 | 구현자 혼란 | 런타임 장애, 빌드 실패, 보안 취약점 |

### v0.5/v0.6에서 선행 해소된 항목 (4건)

| 원래 ID | 등급 | 내용 | 해소 마일스톤 | 해소 위치 |
|---------|------|------|:---:|----------|
| D-1 (C-6) | CRITICAL | MCP 6 tools 완전 스펙 | v0.6 | 38-sdk-mcp §5 (16 tools 완전 스펙 정의) |
| D-7 (H-11) | HIGH | POST /v1/sessions 인증 방식 확정 | v0.5 | 52-auth-model-redesign §4.2 (masterAuth implicit) |
| D-8 (M-1) | MEDIUM | /v1/nonce 경로 통일 잔존 | v0.6 | 37-rest-api (전체 /v1/nonce 통일 확인) |
| D-11 (M-10) | MEDIUM | Approval 만료 시 Owner 알림 | v0.5 | 35-notification-architecture (TX_APPROVAL_EXPIRED 추가) |

### 잔여 장애 요소 분포

| 등급 | 건수 | 성격 |
|------|------|------|
| CRITICAL | 7 | 구현 차단 또는 런타임 장애 |
| HIGH | 10 | 보안 취약점 또는 통합 실패 |
| MEDIUM | 8 | 추가 조사 필요 또는 향후 확장 시 문제 |
| **합계** | **25** | |

---

## 핵심 원칙

### 1. 설계 문서를 직접 수정한다
- 새 문서를 만들지 않고, 기존 설계 문서(24~64번)의 해당 섹션을 보완한다
- 보완 내용에 `[v0.7 보완]` 태그를 붙여 추적 가능하게 한다
- v0.3의 SSoT 대응표(45-enum)와 충돌하지 않도록 주의한다

### 2. 의사결정이 필요한 곳은 결정한다
- "고려 필요", "향후 결정" 같은 미결 사항을 허용하지 않는다
- 모든 장애 요소에 대해 구체적인 해결책을 확정한다
- 두 가지 이상 방법이 있으면 하나를 선택하고 근거를 기록한다

### 3. 구현자가 추가 질문 없이 코딩할 수 있어야 한다
- 해결책은 코드 수준의 구체성을 갖춘다 (의사코드, 인터페이스 시그니처, 설정값 등)
- "어떻게"뿐 아니라 "왜 이 방법인지"도 기록한다

### 4. 과도한 설계 변경을 피한다
- v0.2 아키텍처의 골격(6단계 파이프라인, 8-state 머신, 3계층 보안)은 유지한다
- 최소한의 변경으로 장애 요소를 해소한다
- v0.5(인증 재설계)와 v0.6(블록체인 확장)에서 이미 해소된 대규모 변경은 본 마일스톤 범위 외

---

## Phase A: 체인 어댑터 & 트랜잭션 안정성

블록체인 트랜잭션의 런타임 장애를 유발하는 경쟁 조건과 인터페이스 갭을 해소한다.

### A-1. Solana blockhash 만료 경쟁 조건 [CRITICAL C-1]

**문제:** `buildTransaction()`에서 가져온 blockhash와 `simulateTransaction(replaceRecentBlockhash=true)`에서 사용하는 blockhash가 불일치. sign/submit 시점에 원래 blockhash가 만료될 수 있음.

**관련 문서:** `27-chain-adapter-interface`, `31-solana-adapter-detail`, `32-transaction-pipeline-api`

**해결:**
- `signTransaction()` 직전에 blockhash 잔여 수명을 확인하는 **blockhash freshness guard** 추가
- 잔여 수명 < 20초이면 blockhash를 갱신하고 `expiresAt`를 재계산
- `UnsignedTransaction`에 `refreshBlockhash(): Promise<void>` 메서드 추가 (Solana 전용, EVM은 no-op)
- 타이밍 기준:

```
buildTransaction()     t=0s   blockhash=X, expiresAt=t+50s
simulateTransaction()  t=2s   replaceRecentBlockhash=true (시뮬 전용, 원본 미변경)
[freshness guard]      t=Ns   if (expiresAt - now < 20s) → refreshBlockhash()
signTransaction()      t=Ns   blockhash=X or X' (갱신됐으면 X')
submitTransaction()    t=N+1s blockhash 유효 보장 (최소 20초 잔여)
```

**수정 대상:** `31-solana-adapter-detail` §5~6, `32-transaction-pipeline-api` Stage 5

### A-2. EVM nonce 관리 인터페이스 [CRITICAL C-2]

**문제:** `IChainAdapter`에 nonce 조회/리셋 메서드가 없음. `UnsignedTransaction.metadata`에 nonce를 `Record<string, unknown>`으로 저장하여 타입 안전성 없음.

**관련 문서:** `27-chain-adapter-interface` §2.2

**v0.6 컨텍스트:** v0.6에서 IChainAdapter가 13→17개 메서드로 확장됨 (getAssets, buildContractCall, buildApprove, buildBatch 추가). nonce 관련 메서드는 v0.6 범위 외.

**해결:**
- `IChainAdapter`에 2개 메서드 추가 (17→19개):

```typescript
interface IChainAdapter {
  // 기존 17개 (v0.6 확장 포함) + 2개
  getCurrentNonce(address: string): Promise<number>     // EVM 전용, Solana는 -1 반환
  resetNonceTracker(address: string): Promise<void>     // 로컬 nonce 캐시 초기화
}
```

- `UnsignedTransaction.metadata`에서 nonce를 명시적 optional 필드로 승격:

```typescript
interface UnsignedTransaction {
  // 기존 필드...
  nonce?: number    // EVM 전용. buildTransaction()이 자동 설정.
  // metadata는 기타 체인별 메타데이터용으로 유지
}
```

- EvmAdapterStub에도 동일 메서드 추가 (throw CHAIN_NOT_SUPPORTED)
- `28-daemon-lifecycle-cli`의 `resetNonceTracker()` 참조를 인터페이스와 일치시킴

**수정 대상:** `27-chain-adapter-interface` §2, `36-killswitch-autostop-evm.md`

### A-3. Keystore nonce 충돌 확률 계산 오류 [CRITICAL C-8]

**문제:** `26-keystore-spec` §3.3의 Birthday Problem 계산이 부정확. "2^32회 암호화 시 충돌 확률 ≈ 2^-32"로 기술했으나, 실제 AES-256-GCM 12바이트 nonce(96비트) 공간에서의 충돌 확률은 이보다 높음.

**관련 문서:** `26-keystore-spec` §3.3

**해결:**
- 정확한 계산으로 교체:
  - 96비트 nonce 공간(N=2^96)에서 n회 암호화 시 충돌 확률: P ≈ 1 - e^(-n^2 / 2N)
  - n=2^32 (약 40억회): P ≈ 1 - e^(-2^64 / 2^97) ≈ 1 - e^(-2^-33) ≈ 2^-33 ≈ 0.000000000116
  - **결론: 실질적 충돌 위험은 무시 가능하나, 계산 과정을 정확하게 기술**
- WAIaaS 키스토어의 실제 사용 패턴 분석 추가:
  - 에이전트 키 1~100개, 키당 암호화 횟수 ~수천회 (키 로테이션 시)
  - n < 10^6 수준에서 충돌 확률은 사실상 0
- §3.3의 수학적 근거를 정정하되, "실질적 위험: 무시 가능" 결론은 유지

**수정 대상:** `26-keystore-spec` §3.3

### A-4. Priority fee 캐시 TTL 근거 [MEDIUM M-5]

**문제:** `31-solana-adapter-detail` §4.4에서 priority fee 캐시 TTL을 30초로 설정했으나, `getRecentPrioritizationFees`가 150 슬롯(~60초) 통계를 반환하므로 근거가 불충분.

**관련 문서:** `31-solana-adapter-detail` §4.4, §11.2

**해결:**
- 30초 TTL 유지. 근거를 명시적으로 추가:
  - 60초 통계 윈도우의 절반 주기로 갱신 = Nyquist 기준 충족
  - 네트워크 혼잡도 급변 시 최대 30초 지연은 수수료 과소 추정 위험이 있으나, `simulateTransaction()`의 CU 검증이 안전망 역할
  - TTL을 15초로 줄이면 RPC 호출 2배 증가, 비용 대비 효과 미미
- 혼잡도 급변 시 fee bump 전략 추가: 제출 실패 시 priority fee를 1.5배로 재시도 (최대 1회)

**수정 대상:** `31-solana-adapter-detail` §4.4, §11.2

---

## Phase B: 데몬 프로세스 & 보안 기반

데몬 생명주기와 보안 메커니즘의 구현 차단 요소를 해소한다.

### B-1. JWT Secret 로테이션 메커니즘 [CRITICAL C-4]

**문제:** JWT Secret 변경 시 모든 세션이 즉시 무효화되지만, 전환 절차가 정의되지 않음. 프로덕션에서 모든 AI 에이전트가 동시 인증 실패.

**관련 문서:** `30-session-token-protocol` §2.7.5

**해결:**
- **Dual-key 전환 윈도우 (5분)** 도입:

```typescript
interface JwtSecretConfig {
  current: string          // 새 토큰 발급에 사용
  previous?: string        // 검증에만 사용, 5분 후 자동 폐기
  rotatedAt?: number       // 로테이션 시각 (Unix epoch)
}
```

- 검증 순서: current로 먼저 검증 → 실패 시 previous 존재하고 rotatedAt + 5분 이내이면 previous로 재검증
- 운영자 절차:
  1. `waiaas secret rotate` CLI 명령 또는 `POST /v1/admin/rotate-secret` (masterAuth)
  2. current → previous로 이동, 신규 secret 생성 → current에 저장
  3. 5분 후 previous 자동 삭제
  4. audit_log에 `SECRET_ROTATED` 이벤트 기록
- 자동 로테이션은 지원하지 않음 (운영자 명시적 실행만 허용)
- config.toml의 `security.jwt_secret`은 초기값으로만 사용. 이후 DB에서 관리

**수정 대상:** `30-session-token-protocol` §2.7, `28-daemon-lifecycle-cli`, `37-rest-api-complete-spec`

### B-2. PID 파일 원자적 잠금 [CRITICAL C-5]

**문제:** `isProcessRunning(pid)` 확인과 `unlinkSync(pidPath)` 사이 경쟁 조건. 다중 데몬 인스턴스 → SQLite WAL 잠금 충돌.

**관련 문서:** `28-daemon-lifecycle-cli` §2.2 Step 1

**해결:**
- PID 파일 대신 **flock 기반 잠금** 사용:

```typescript
import { openSync, writeSync, closeSync } from 'node:fs'
import { flockSync } from 'fs-ext' // 또는 proper-lockfile npm

const lockPath = path.join(dataDir, 'daemon.lock')
const fd = openSync(lockPath, 'w')
try {
  flockSync(fd, 'exnb')  // exclusive, non-blocking
} catch {
  // EWOULDBLOCK → 다른 데몬이 실행 중
  throw new DaemonError('ALREADY_RUNNING', ...)
}
writeSync(fd, String(process.pid))
// fd를 열어둔 채로 유지 (프로세스 종료 시 자동 해제)
```

- `fs-ext` 또는 `proper-lockfile` 중 택 1 (크로스 플랫폼 고려)
- Windows: Named Mutex 또는 HTTP 포트 바인딩으로 fallback (기존 `28-daemon-lifecycle-cli`의 Windows 방식과 일치)
- PID 파일은 보조 정보로 유지 (status 명령용), 잠금 판단에는 사용하지 않음

**수정 대상:** `28-daemon-lifecycle-cli` §2.2 Step 1

### B-3. Rate Limiter / Auth 순서 수정 [HIGH H-1]

**문제:** rateLimiter(#7) → authRouter(#8) 순서로, 인증 전에 IP 기반 rate limit만 적용. 공격자가 토큰 없이 전체 rate limit을 소진하면 정상 사용자도 차단.

**관련 문서:** `29-api-framework-design` §2.1, `52-auth-model-redesign` §7.5

**v0.5 컨텍스트:** v0.5에서 sessionAuth/ownerAuth/masterAuth가 `authRouter` 단일 미들웨어(#8)로 통합됨. 기존 개별 auth 미들웨어(#8) 참조를 authRouter로 업데이트.

**해결:**
- **2단계 Rate Limiter** 도입:
  - Stage 1 (미들웨어 #3.5, shutdownGuard 직후): IP 기반 글로벌 rate limit — 1000 req/min (DoS 방어용, 느슨한 제한)
  - Stage 2 (미들웨어 #9, authRouter 직후): 세션/에이전트 기반 세분화 rate limit — 기존 3-level 유지 (global 100/session 300/tx 10 req/min)
- v0.5 확정 미들웨어 순서 기준으로 변경:

```
#1 requestId → #2 requestLogger → #3 shutdownGuard → #3.5 globalRateLimit(IP, 1000/min)
→ #4 secureHeaders → #5 hostValidation → #6 cors → #7 killSwitchGuard
→ #8 authRouter → #9 sessionRateLimit(session, 300/min; tx, 10/min)
```

- globalRateLimit은 모든 요청에, sessionRateLimit은 인증된 요청에만 적용
- v0.5의 authRouter(masterAuth/ownerAuth/sessionAuth 통합 디스패처)와 자연스럽게 결합

**수정 대상:** `29-api-framework-design` §2.1, `37-rest-api-complete-spec` §4.1

### B-4. killSwitchGuard 미들웨어 위치/동작 명확화 [HIGH H-2]

**문제:** killSwitchGuard가 인증 전에 실행되어, 허용 엔드포인트(/health, /recover) 판단이 인증 없이 이루어짐. 보안 의미가 불명확.

**관련 문서:** `37-rest-api-complete-spec` §4.1, `36-killswitch-autostop-evm.md` §2.1

**v0.5 컨텍스트:** v0.5에서 authRouter(#8)가 통합 인증 디스패처로 확정. killSwitchGuard는 #7 위치 유지.

**해결:**
- killSwitchGuard는 **authRouter 전**(#7)에 위치하는 것이 맞음. 근거:
  - Kill Switch ACTIVATED 시 시스템이 잠긴 상태 — 인증 자체가 불필요한 요청(health, recover)만 허용
  - authRouter(#8) 후에 배치하면 잠긴 상태에서도 인증 검증 오버헤드 발생
- 허용 엔드포인트 목록을 명시적으로 확정:

```typescript
const KILL_SWITCH_ALLOWED_PATHS = [
  'GET /v1/health',              // 헬스체크 (무인증)
  'GET /v1/admin/status',        // 상태 확인 (masterAuth)
  'POST /v1/admin/recover',      // 복구 (ownerAuth + masterAuth)
  'GET /v1/admin/kill-switch',   // Kill Switch 상태 조회 (masterAuth)
]
```

- 허용 목록에 없는 요청 시 응답:

```json
{
  "error": "SYSTEM_LOCKED",
  "message": "System is in kill switch mode",
  "hint": "Use POST /v1/admin/recover to restore normal operation"
}
```

- HTTP status: 503 Service Unavailable (retry 가능성 암시)

**수정 대상:** `36-killswitch-autostop-evm.md` §2.1, `37-rest-api-complete-spec` §4.1~4.2

### B-5. Master Password 보안 모델 통일 [HIGH H-5]

**문제:** Keystore는 Argon2id(적절), Kill Switch CLI 인증은 `SHA-256(password)` 단순 해시(부적절). 동일 시스템 내 보안 수준 불일치.

**관련 문서:** `34-owner-wallet-connection` §8.3, `26-keystore-spec`

**해결:**
- Kill Switch CLI 인증도 Argon2id 사용으로 통일:
  - `X-Master-Password` 헤더 → 서버에서 Argon2id 검증 (keystore 잠금 해제와 동일 로직)
  - 평문 전송이지만 localhost 전용이므로 TLS 불필요 (호스트 검증 미들웨어가 보장)
- SHA-256 해시 전송 방식 폐기
- `X-Master-Password-Hash` 헤더명 → `X-Master-Password`로 통일 (평문, localhost only)
- 서버 측에서 저장된 Argon2id 해시와 대조

**수정 대상:** `34-owner-wallet-connection` §8.3, `37-rest-api-complete-spec` §3.3

### B-6. 단일 데몬 인스턴스 강제 [HIGH H-10]

**문제:** 인메모리 LRU nonce 캐시가 단일 프로세스 가정. 다중 데몬 실행 시 nonce replay attack 가능. CLI에서 포트 충돌 외에 다중 인스턴스 방지 장치 없음.

**관련 문서:** `30-session-token-protocol` §4.2~4.3

**해결:**
- B-2의 flock 기반 잠금으로 다중 인스턴스 자체를 방지 (1차 방어)
- nonce를 **SQLite에 저장**하는 옵션 추가 (2차 방어, 선택적):
  - 기본: 인메모리 LRU (성능 우선, 단일 인스턴스 보장 전제)
  - `config.toml` 옵션: `security.nonce_storage = "memory" | "sqlite"`
  - SQLite 저장 시 `nonces` 테이블 (nonce TEXT PK, created_at INTEGER, expires_at INTEGER)
  - 만료 nonce 정리: 데몬 시작 시 + 1시간 주기
- 다중 인스턴스 시도 시 에러 메시지에 nonce replay 위험 경고 포함

**수정 대상:** `30-session-token-protocol` §4.2, `24-monorepo-data-directory` (config.toml)

---

## Phase C: 의존성 & 빌드 환경

모노레포 첫 빌드부터 차단하는 의존성 문제를 해소한다.

### C-1. SIWE + viem 모노레포 의존성 해소 [CRITICAL C-3]

**문제:** SIWE v3.x → ethers v6 peer dep 필수. EVM adapter → viem 사용. 동일 모노레포에서 ethers v6 + viem 공존 시 번들 사이즈 증가 및 의존성 충돌 가능.

**관련 문서:** `30-session-token-protocol` §3.3.3~3.3.4

**v0.5 컨텍스트:** v0.5에서 ownerAuth 적용 범위가 거래 승인과 Kill Switch 복구 2곳으로 축소되었으나, SIWE 검증 자체는 여전히 필요하므로 의존성 해소의 기술적 필요성은 유효.

**해결:**
- **viem 네이티브 SIWE 검증 채택** (ethers 의존성 제거):

```typescript
// ethers 없이 viem만으로 SIWE 검증
import { verifyMessage } from 'viem'
import { parseSiweMessage } from 'viem/siwe'  // viem v2.x 내장

async function verifySiweSignature(message: string, signature: string): Promise<string> {
  const parsed = parseSiweMessage(message)
  const valid = await verifyMessage({
    address: parsed.address,
    message,
    signature,
  })
  if (!valid) throw new Error('INVALID_SIWE_SIGNATURE')
  return parsed.address
}
```

- viem v2.x는 SIWE 파싱/검증을 내장 (`viem/siwe`)하므로 별도 `siwe` npm 패키지 불필요
- SIWS (Solana)는 기존대로 `@solana/kit`의 Ed25519 서명 검증 유지
- 의존성 정리:
  - 제거: `siwe`, `ethers` — 모노레포 전체에서 불필요
  - 유지: `viem` (EVM adapter + SIWE 검증 공용)
  - 유지: `@solana/kit` (Solana adapter + SIWS 검증 공용)

**수정 대상:** `30-session-token-protocol` §3.3.3~3.3.4

### C-2. Sidecar 크로스 컴파일 전략 [MEDIUM M-7]

**문제:** Tauri sidecar로 Node.js SEA 바이너리를 배포하지만, native addon(`sodium-native`, `better-sqlite3`)의 크로스 컴파일 전략이 부재. ARM64 Windows/Linux도 미포함.

**관련 문서:** `39-tauri-desktop-architecture` §4.1

**해결:**
- **prebuildify 기반 네이티브 바이너리 번들** 전략:
  - `sodium-native`, `better-sqlite3` 모두 prebuild 바이너리 제공 (CI에서 다운로드)
  - `node-gyp` 직접 컴파일은 fallback으로만 유지
- 대상 플랫폼 확정 (6개):

| 타겟 | Tauri 지원 | native addon | 우선순위 |
|------|:----------:|:------------:|:--------:|
| aarch64-apple-darwin | O | prebuild | P0 |
| x86_64-apple-darwin | O | prebuild | P0 |
| x86_64-pc-windows-msvc | O | prebuild | P1 |
| x86_64-unknown-linux-gnu | O | prebuild | P1 |
| aarch64-unknown-linux-gnu | O | prebuild | P2 |
| aarch64-pc-windows-msvc | - | 미제공 | 제외 |

- ARM64 Windows는 native addon prebuild 미제공으로 제외 (향후 추가)
- CI에서 GitHub Actions matrix로 6개 타겟 빌드 검증

**수정 대상:** `39-tauri-desktop-architecture` §4.1

---

## Phase D: API & 통합 프로토콜 완성

API 스펙, SDK, 플랫폼 통합의 모호성을 해소한다.

> **참고:** 원래 D-1(MCP 스펙, C-6), D-7(세션 인증, H-11), D-8(/v1/nonce, M-1), D-11(Approval 알림, M-10)은 v0.5/v0.6에서 해소되어 본 Phase에서 제거됨. 상세 내용은 "v0.5/v0.6에서 선행 해소된 항목" 참조.

### D-1. Tauri 종료 타임아웃 정합 [CRITICAL C-7]

**문제:** Tauri: 5초 대기 → SIGTERM. 데몬: graceful shutdown 최대 30초. 5초 만에 강제 종료 시 DB 손상 위험.

**관련 문서:** `39-tauri-desktop-architecture` §4.2, `28-daemon-lifecycle-cli`

**해결:**
- Tauri의 sidecar 종료 타임아웃을 **35초**로 변경 (데몬 30초 + 5초 마진):

```
POST /v1/admin/shutdown → 35초 대기 → SIGTERM → 5초 대기 → SIGKILL
```

- 데몬은 shutdown 요청 수신 후 progress를 로그로 출력 (Tauri가 sidecar stdout 모니터링)
- Tauri 앱 종료 시 사용자에게 "데몬 종료 중..." 상태 표시 (트레이 아이콘 Yellow)
- 비정상 종료 감지: 다음 시작 시 SQLite integrity check 실행

```typescript
// 데몬 시작 시 비정상 종료 감지
const integrityResult = db.pragma('integrity_check')
if (integrityResult !== 'ok') {
  logger.warn('Database integrity check failed, running recovery...')
  db.pragma('wal_checkpoint(TRUNCATE)')
}
```

**수정 대상:** `39-tauri-desktop-architecture` §4.2, `28-daemon-lifecycle-cli` §2.2

### D-2. Tauri CORS Origin 검증 [HIGH H-3]

**문제:** daemon이 `127.0.0.1:3100`에 바인딩, CORS 허용에 `tauri://localhost` 포함. Tauri WebView가 정확히 어떤 Origin 헤더를 보내는지 미검증.

**관련 문서:** `29-api-framework-design` §2.3, `39-tauri-desktop-architecture` §3.4

**해결:**
- Tauri 2.x WebView의 Origin 동작을 확정:
  - macOS/Linux: `tauri://localhost` (포트 없음)
  - Windows: `https://tauri.localhost` (Tauri 2.x Windows 특성)
- CORS 허용 목록 확장:

```typescript
const corsOrigins = [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
  'tauri://localhost',          // macOS, Linux
  'https://tauri.localhost',    // Windows
]
```

- 구현 시 실제 Tauri WebView에서 보내는 Origin을 로깅하여 확인하는 디버그 코드 포함 (개발 모드 전용)

**수정 대상:** `29-api-framework-design` §2.3, `39-tauri-desktop-architecture` §3.4

### D-3. Owner disconnect cascade 정의 [HIGH H-4]

**문제:** `DELETE /v1/owner/disconnect` 상세 스펙 없음. disconnect 시 대기 중 APPROVAL 트랜잭션, 활성 세션, 정책 등 연쇄 동작 미정의.

**관련 문서:** `34-owner-wallet-connection` §6~7, `52-auth-model-redesign` §2

**v0.5 컨텍스트:** v0.5에서 Owner 주소가 시스템 전역이 아닌 에이전트별 속성(`agents.owner_address`)으로 변경됨. disconnect cascade는 **해당 Owner 주소를 가진 에이전트들**에 대해 적용.

**해결:**
- `DELETE /v1/owner/disconnect` 엔드포인트 스펙 확정:

```
DELETE /v1/owner/disconnect
Auth: masterAuth
Body: { address: string, chain: string }
```

- Cascade 동작 (해당 address가 owner_address인 모든 에이전트에 적용):

| 순서 | 동작 | 근거 |
|------|------|------|
| 1 | 해당 Owner의 에이전트들의 APPROVAL 대기 트랜잭션 → EXPIRED 처리 | 승인자 부재 |
| 2 | 해당 Owner의 에이전트들의 DELAY 대기 트랜잭션 → 유지 (타이머 계속) | DELAY는 Owner 개입 불필요 |
| 3 | wallet_connections에서 해당 주소의 WalletConnect 세션 정리 | push 서명 비활성화 |
| 4 | agents.owner_address는 유지 | 주소는 에이전트 속성, 변경은 `PUT /v1/agents/:id/owner` |
| 5 | audit_log에 OWNER_DISCONNECTED 이벤트 기록 | 감사 추적 |

- 새 Owner 등록: 즉시 가능 (cooldown 없음). `PUT /v1/agents/:id/owner` (masterAuth + 기존 ownerAuth 조건부, v0.5 §5 Owner 주소 변경 정책 참조)

**수정 대상:** `34-owner-wallet-connection` §6~7, `37-rest-api-complete-spec` §8

### D-4. Transaction Status 응답값 명확화 [HIGH H-6]

**문제:** 티어별 HTTP 응답에서 status 값이 미명시.

**관련 문서:** `37-rest-api-complete-spec` §7, `32-transaction-pipeline-api` §3, `45-enum-unified-mapping`

**v0.6 컨텍스트:** v0.6에서 TransactionType이 5개(TRANSFER, CONTRACT_CALL, APPROVE, BATCH, ACTION)로 확장됨. 아래 응답 규칙은 **모든 TransactionType에 동일하게 적용**.

**해결:**
- 티어별 HTTP 응답 status 값 확정:

| 티어 | HTTP Status | 응답 body의 status | 설명 |
|------|------------|-------------------|------|
| INSTANT (성공) | 200 | `CONFIRMED` | 동기 완료 |
| INSTANT (타임아웃) | 200 | `SUBMITTED` | 30초 내 미확정, 클라이언트 폴링 필요 |
| DELAY | 202 | `QUEUED` | 대기열 진입, 쿨다운 후 자동 실행 |
| APPROVAL | 202 | `QUEUED` | 대기열 진입, Owner 승인 대기 |

- INSTANT 티어의 내부 상태 전이 (`PENDING → QUEUED → EXECUTING → SUBMITTED → CONFIRMED`)는 API 응답에 노출하지 않음. 최종 상태만 반환.
- `GET /v1/transactions/:id`에서는 실시간 내부 상태 반환 (8-state 전체)
- v0.6 확장 타입(CONTRACT_CALL, APPROVE, BATCH, ACTION)도 동일 파이프라인을 경유하므로 동일 응답 규칙 적용. 타입별 차이는 응답의 `type` 필드로 구분.

**수정 대상:** `37-rest-api-complete-spec` §7, `32-transaction-pipeline-api` §3.7

### D-5. Setup Wizard vs CLI init 순서 확정 [HIGH H-7]

**문제:** Tauri Setup Wizard와 `waiaas init` CLI가 모두 keystore 생성을 시도할 수 있음. 동시 실행 시 경쟁 조건.

**관련 문서:** `39-tauri-desktop-architecture` §4.2, `28-daemon-lifecycle-cli`

**해결:**
- **Tauri는 항상 CLI를 통해 초기화** (직접 초기화 금지):

```
Tauri Setup Wizard
  └→ sidecar: waiaas init --json [args...]
      └→ stdout: { "success": true, "dataDir": "~/.waiaas/", ... }
```

- Tauri Setup Wizard의 각 단계가 CLI 서브커맨드를 호출:
  - Step 1 (마스터 패스워드): `waiaas init --master-password <stdin>`
  - Step 2 (체인 선택): config.toml 직접 편집 (Tauri IPC → fs)
  - Step 3 (에이전트 생성): `waiaas agent create --name ... --chain ... --owner ...`
  - Step 4~5: 데몬 시작 + 세션 발급
- `waiaas init`에 **idempotent 보장** 추가: `~/.waiaas/` 이미 존재하면 skip (에러 아님)
- flock (B-2)이 CLI 동시 실행도 방지

**수정 대상:** `39-tauri-desktop-architecture` §4.2, `28-daemon-lifecycle-cli`

### D-6. Python SDK snake_case 매핑 규칙 [MEDIUM M-2]

**문제:** Python SDK의 camelCase → snake_case 변환 규칙, Pydantic 모델 매핑 방법이 미상세.

**관련 문서:** `38-sdk-mcp-interface` §4

**v0.6 컨텍스트:** v0.6에서 Python SDK 메서드가 9개로 확장되고 38-sdk-mcp-interface가 갱신됨. 기본적인 메서드 정의는 완료되었으나, Pydantic ConfigDict 패턴과 변환 규칙의 SSoT가 필요.

**해결:**
- 변환 규칙 확정:

| TypeScript (API) | Python SDK | 규칙 |
|-----------------|-----------|------|
| `agentId` | `agent_id` | camelCase → snake_case |
| `maxAmountPerTx` | `max_amount_per_tx` | 약어도 분리 |
| `txId` | `tx_id` | 2글자 약어도 분리 |
| `usdValue` | `usd_value` | 대문자 약어도 분리 |

- Pydantic v2 `model_config` 사용:

```python
class AgentResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    agent_id: str
    name: str
    chain: str
    status: AgentStatus
```

- `alias_generator=to_camel`로 직렬화 시 camelCase, `populate_by_name=True`로 snake_case 입력도 허용
- Enum은 `45-enum-unified-mapping.md`의 값을 그대로 사용 (대문자 스네이크: `PENDING`, `CONFIRMED` 등)

**수정 대상:** `38-sdk-mcp-interface` §4

### D-7. Zod refinement 규칙 SDK 노출 [MEDIUM M-8]

**문제:** 서버의 Zod refinement(regex, min/max)를 SDK에서 사전 검증할 방법이 없어, 클라이언트가 400 에러를 런타임에서야 발견.

**관련 문서:** `38-sdk-mcp-interface` §2.2, §3.4

**해결:**
- `@waiaas/core` 패키지에서 Zod 스키마를 **export**하여 SDK가 직접 참조:

```typescript
// @waiaas/core/src/schemas/transaction.ts
export const TransferRequestSchema = z.object({
  to: z.string().min(1),
  amount: z.string().regex(/^\d+$/),
  memo: z.string().max(256).optional(),
})

// @waiaas/sdk에서
import { TransferRequestSchema } from '@waiaas/core'
// SDK 메서드 내부에서 사전 검증
TransferRequestSchema.parse(request) // 서버 전송 전 검증
```

- Python SDK: OpenAPI 스키마에서 format/pattern을 읽어 Pydantic `field_validator`로 수동 매핑 (자동 생성 아님)
- SDK 문서에 "클라이언트 사전 검증 가능" 여부를 메서드별로 명시

**수정 대상:** `38-sdk-mcp-interface` §2.2, §3

---

## Phase E: 스키마 & 설정 확정

데이터베이스 스키마와 설정 파일의 미결정 사항을 확정한다.

### E-1. 환경변수 중첩 매핑 규칙 [HIGH H-8]

**문제:** `WAIAAS_{SECTION}_{KEY}` 패턴이 `[rpc.solana.ws]` 같은 중첩 섹션에 적용되는 규칙이 미정의.

**관련 문서:** `24-monorepo-data-directory` §3.2

**해결:**
- 중첩은 **언더스코어 구분자**로 평탄화:

```
[rpc]
solana_mainnet = "https://..."     → WAIAAS_RPC_SOLANA_MAINNET
solana_devnet  = "https://..."     → WAIAAS_RPC_SOLANA_DEVNET

[security]
jwt_secret = "..."                 → WAIAAS_SECURITY_JWT_SECRET
auto_stop_enabled = true           → WAIAAS_SECURITY_AUTO_STOP_ENABLED
```

- 중첩 섹션(`[rpc.solana]`)은 config.toml에서 **사용하지 않음**. 평탄화된 키만 허용:

```toml
# 금지: [rpc.solana]
#        mainnet = "https://..."

# 허용:
[rpc]
solana_mainnet = "https://..."
solana_devnet = "https://..."
```

- 매핑 규칙: `WAIAAS_` + SECTION(대문자) + `_` + KEY(대문자, 점→언더스코어)
- config.toml Zod 스키마에 중첩 섹션 사용 시 에러 메시지 추가

**수정 대상:** `24-monorepo-data-directory` §3.2, §3.5

### E-2. SQLite timestamp 정밀도 확정 [HIGH H-9]

**문제:** §1.3 "모든 타임스탬프는 초 단위" vs §2.5 "audit_log는 밀리초 고려". 결정 미완료.

**관련 문서:** `25-sqlite-schema` §1.3, §2.5

**해결:**
- **전체 테이블 초 단위 통일** 확정:
  - audit_log 포함 모든 타임스탬프는 Unix epoch 초 단위 (INTEGER)
  - 근거: 동시 감사 이벤트 구분은 UUID v7의 시간 정렬성으로 충분 (ms 정밀도 내장)
  - audit_log에서 동일 초 내 이벤트 순서는 `id` (UUID v7) 정렬로 보장
- §2.5의 "밀리초 고려" 주석 삭제, 결정 사항으로 교체:

```
모든 타임스탬프: Unix epoch 초 단위 (INTEGER).
동일 초 내 순서는 UUID v7의 시간 정밀도(ms)로 자연 보장.
```

**수정 대상:** `25-sqlite-schema` §1.3, §2.5

### E-3. agents 테이블 CHECK 제약조건 [MEDIUM M-9]

**문제:** `chain`, `network` 컬럼에 CHECK 제약조건이 없어 `'solanna'` 같은 오타가 DB에 저장될 수 있음. v0.6에서 transactions.type과 policies.type에는 CHECK가 추가되었으나, agents 테이블은 누락.

**관련 문서:** `25-sqlite-schema` §2.1

**해결:**
- `45-enum-unified-mapping.md`의 ChainType, NetworkType 값으로 CHECK 제약조건 추가:

```sql
chain   TEXT NOT NULL CHECK (chain IN ('solana', 'ethereum'))
network TEXT NOT NULL CHECK (network IN ('mainnet', 'devnet', 'testnet'))
```

- Drizzle ORM에서:

```typescript
chain: text('chain').notNull().$type<'solana' | 'ethereum'>(),
network: text('network').notNull().$type<'mainnet' | 'devnet' | 'testnet'>(),
```

- SQLite CHECK와 TypeScript 타입을 이중으로 강제

**수정 대상:** `25-sqlite-schema` §2.1, `45-enum-unified-mapping`

### E-4. Docker 볼륨 UID 정합성 [MEDIUM M-3]

**문제:** Docker 컨테이너 내 `waiaas:1001` 사용자의 홈 디렉토리와 named volume 마운트 경로 불일치 가능.

**관련 문서:** `40-telegram-bot-docker` §8~9

**해결:**
- Dockerfile에 명시적 홈 디렉토리 설정:

```dockerfile
RUN groupadd -g 1001 waiaas && \
    useradd -u 1001 -g waiaas -m -d /home/waiaas -s /bin/sh waiaas

ENV WAIAAS_DATA_DIR=/home/waiaas/.waiaas
VOLUME /home/waiaas/.waiaas
USER waiaas
WORKDIR /home/waiaas
```

- docker-compose에 UID 강제:

```yaml
services:
  waiaas:
    user: "1001:1001"
    volumes:
      - waiaas-data:/home/waiaas/.waiaas
```

- 데몬 시작 시 데이터 디렉토리 소유권 확인 로직 추가: `stat(dataDir).uid !== process.getuid()` 시 경고 로그

**수정 대상:** `40-telegram-bot-docker` §8~9

### E-5. amount TEXT 성능 제약 문서화 [MEDIUM M-4]

**문제:** `amount`를 TEXT로 저장하여 금액 범위 검색 시 O(n) 테이블 스캔. 향후 기능(일별 한도, 이상 탐지)에서 성능 저하.

**관련 문서:** `25-sqlite-schema` §2.3

**해결:**
- TEXT 유지 (변경 없음). 근거를 보강하여 문서화:
  - JavaScript의 number 정밀도(2^53) < Solana lamport 최대값(u64). TEXT가 안전
  - 금액 기반 검색이 필요한 경우의 대안 명시:
    1. `amount_lamports INTEGER` 보조 컬럼 추가 (인덱스 가능, 검색 전용)
    2. 또는 application 레벨에서 메모리 캐시 집계
  - 현재 설계에서 금액 범위 검색이 필요한 유일한 기능: AutoStopEngine의 `threshold_proximity` 규칙 → 이것은 최근 N건만 조회하므로 성능 영향 미미
- `amount_lamports` 보조 컬럼은 "구현 시 성능 프로파일링 후 결정"으로 유보

**수정 대상:** `25-sqlite-schema` §2.3

### E-6. 알림 채널 삭제 트랜잭션 경계 [MEDIUM M-6]

**문제:** 두 개의 동시 DELETE 요청이 모두 `activeCount >= min_channels` 검증을 통과하여 0개 채널이 될 수 있음.

**관련 문서:** `35-notification-architecture` §9.3

**해결:**
- 채널 삭제/비활성화 시 **BEGIN IMMEDIATE** 트랜잭션 사용 (TOCTOU 방지, `33-time-lock`의 reserved_amount 패턴과 동일):

```typescript
db.transaction(() => {
  const activeCount = db.select({ count: count() })
    .from(notificationChannels)
    .where(eq(notificationChannels.active, true))
    .get()!.count

  if (activeCount <= MIN_CHANNELS) {
    throw new WAIaaSError('MIN_CHANNELS_REQUIRED',
      `At least ${MIN_CHANNELS} active channels required`)
  }

  db.update(notificationChannels)
    .set({ active: false })
    .where(eq(notificationChannels.id, channelId))
    .run()
})() // immediate transaction
```

- 물리 삭제(DELETE)는 지원하지 않음. 비활성화(active=false)만 허용. 감사 로그 보존.

**수정 대상:** `35-notification-architecture` §9.3

---

## 영향받는 설계 문서

| 문서 | Phase | 변경 규모 | 변경 내용 |
|------|:-----:|:--------:|----------|
| `24-monorepo-data-directory` | B, E | 중 | config.toml 환경변수 매핑 규칙, nonce_storage 옵션 |
| `25-sqlite-schema` | E | 소 | timestamp 정밀도 확정, CHECK 제약조건, amount TEXT 근거 보강 |
| `26-keystore-spec` | A | 소 | nonce 충돌 확률 계산 정정 |
| `27-chain-adapter-interface` | A | 중 | getCurrentNonce, resetNonceTracker 추가 (17→19개), UnsignedTransaction.nonce |
| `28-daemon-lifecycle-cli` | B, D | 중 | flock 잠금, JWT rotate CLI, Setup Wizard 연동, 비정상 종료 복구 |
| `29-api-framework-design` | B | 중 | 2단계 Rate Limiter, authRouter 기준 미들웨어 순서 변경, CORS Origin 추가 |
| `30-session-token-protocol` | B, C | 중 | JWT dual-key 로테이션, SIWE viem 전환, nonce 저장 옵션 |
| `31-solana-adapter-detail` | A | 소 | blockhash freshness guard, priority fee TTL 근거 |
| `32-transaction-pipeline-api` | A, D | 소 | blockhash 갱신 스펙, 5개 TransactionType 대응 status 응답값 확정 |
| `33-time-lock-approval-mechanism` | — | — | 변경 없음 (패턴 참조만) |
| `34-owner-wallet-connection` | B, D | 중 | Master Password 통일, 에이전트별 Owner disconnect cascade |
| `35-notification-architecture` | E | 소 | 채널 삭제 트랜잭션 |
| `36-killswitch-autostop-evm.md` | A, B | 소 | EVM nonce 메서드, killSwitchGuard 허용 목록 |
| `37-rest-api-complete-spec` | B, D | 중 | Rate Limiter, killSwitchGuard, 5타입 status 응답값, disconnect |
| `38-sdk-mcp-interface` | D | 소 | Zod export, Python snake_case 매핑 규칙 SSoT |
| `39-tauri-desktop-architecture` | C, D | 중 | 종료 타임아웃 35초, CORS Windows Origin, Setup Wizard CLI 위임, 크로스 컴파일 |
| `40-telegram-bot-docker` | E | 소 | Docker UID 명시, 볼륨 경로 확정 |
| `45-enum-unified-mapping` | E | 소 | ChainType/NetworkType CHECK 값 |

---

## 산출물

| ID | 산출물 | 설명 |
|----|--------|------|
| FIX-A | 체인 어댑터 보완 | blockhash guard, EVM nonce 인터페이스 (17→19), keystore math 정정, fee TTL 근거 |
| FIX-B | 데몬 보안 보완 | JWT rotation, flock 잠금, 2단계 Rate Limiter (authRouter 기준), killSwitch 허용 목록, 패스워드 통일, 단일 인스턴스 |
| FIX-C | 의존성 해소 | SIWE viem 전환, sidecar 크로스 컴파일 전략 |
| FIX-D | API 통합 완성 | Tauri 타임아웃/CORS, 에이전트별 disconnect cascade, 5타입 status 응답, init 순서, Python 매핑, Zod export |
| FIX-E | 스키마 설정 확정 | 환경변수 매핑, timestamp 정밀도, CHECK 제약조건, Docker UID, amount 근거, 채널 삭제 |

---

## 성공 기준

### CRITICAL 해소 (7/7)
- [ ] Solana blockhash freshness guard가 `31-solana-adapter-detail`에 스펙으로 추가됨
- [ ] IChainAdapter에 getCurrentNonce, resetNonceTracker가 추가되어 19개 메서드로 확장되고 UnsignedTransaction.nonce가 명시적 필드로 승격됨
- [ ] SIWE 검증이 viem/siwe로 전환되어 ethers 의존성이 제거됨
- [ ] JWT Secret dual-key rotation 메커니즘이 5분 전환 윈도우로 정의됨
- [ ] 데몬 인스턴스 잠금이 flock 기반으로 전환됨
- [ ] Tauri sidecar 종료 타임아웃이 35초로 변경되고 비정상 종료 복구 로직이 추가됨
- [ ] Keystore nonce 충돌 확률 계산이 정정됨

### HIGH 해소 (10/10)
- [ ] Rate Limiter가 2단계(globalRateLimit + sessionRateLimit)로 분리되고 authRouter 기준으로 배치됨
- [ ] killSwitchGuard 허용 엔드포인트 목록이 4개로 확정되고 authRouter 전(#7)에 위치 확정됨
- [ ] Tauri CORS Origin에 Windows용 `https://tauri.localhost`가 추가됨
- [ ] Owner disconnect cascade가 에이전트별 owner_address 기준으로 5단계 정의됨
- [ ] Master Password 인증이 Argon2id로 통일됨
- [ ] 5개 TransactionType 전체에 대한 티어별 HTTP 응답값이 확정됨
- [ ] Setup Wizard가 CLI를 통해 초기화하는 구조로 확정됨
- [ ] 환경변수 중첩 매핑 규칙이 평탄화 방식으로 확정됨
- [ ] SQLite 타임스탬프가 전체 초 단위로 확정됨
- [ ] 단일 데몬 인스턴스가 flock + 선택적 SQLite nonce로 보장됨

### MEDIUM 해소 (8/8)
- [ ] Python SDK snake_case 변환 규칙과 Pydantic ConfigDict 패턴이 SSoT로 정의됨
- [ ] Docker 볼륨 UID 1001이 Dockerfile에 명시됨
- [ ] amount TEXT 성능 제약과 대안이 문서화됨
- [ ] Priority fee 30초 TTL 근거가 추가됨
- [ ] 알림 채널 삭제가 BEGIN IMMEDIATE 트랜잭션으로 보호됨
- [ ] Sidecar 크로스 컴파일 대상 6개 플랫폼이 확정됨
- [ ] Zod 스키마가 @waiaas/core에서 export되어 SDK 사전 검증이 가능함
- [ ] agents 테이블에 chain/network CHECK 제약조건이 추가됨

### 통합 검증
- [ ] 25건 전체에 대해 설계 문서가 수정되고 `[v0.7 보완]` 태그로 추적 가능
- [ ] 수정된 문서가 v0.3 SSoT(45-enum-unified-mapping)와 충돌하지 않음
- [ ] 수정된 문서가 v0.5(52-auth-model-redesign) 및 v0.6(56~64) 설계와 정합
- [ ] 모든 해결책이 코드 수준의 구체성을 갖춤 (의사코드 또는 인터페이스 시그니처 포함)

---

## 마일스톤 범위 외 (Out of Scope)

- 실제 코드 구현 (설계 보완 마일스톤)
- v0.5에서 이미 해소된 인증 재설계 (완료)
- v0.6에서 이미 해소된 블록체인 확장 설계 (완료)
- 성능 최적화 (프로파일링은 구현 후)
- 새로운 기능 추가

---

## 선행 마일스톤과의 관계

```
v0.2 (설계, 17개 문서)              v0.7 (구현 장애 해소)
──────────────────                  ─────────────────────
IChainAdapter 13 methods       →   v0.6에서 17로 확장 → v0.7에서 +2 nonce = 19
3계층 보안 설계                →   Rate Limiter 2단계, killSwitch 허용 목록
JWT 세션 프로토콜              →   dual-key rotation, nonce 저장 옵션
Keystore AES-256-GCM          →   nonce 수학 정정
데몬 생명주기                  →   flock 잠금, 비정상 종료 복구

v0.3 (일관성, 5개 대응표)           v0.7 (구현 장애 해소)
─────────────────────               ─────────────────────
9→12개 Enum SSoT              →   CHECK 제약조건 강화
config.toml SSoT              →   환경변수 매핑 규칙 추가

v0.4 (테스트 전략)                  v0.7 (구현 장애 해소)
──────────────                      ─────────────────────
보안 시나리오 25+12개          →   경쟁 조건/TOCTOU 시나리오 구체화

v0.5 (인증 재설계, COMPLETE)        v0.7 (구현 장애 해소)
────────────────────                ─────────────────────
authRouter 통합 디스패처       →   Rate Limiter authRouter 기준 재배치
에이전트별 owner_address       →   disconnect cascade 에이전트별 적용
POST /v1/sessions masterAuth   →   ✓ 해소됨 (v0.7에서 제거)
TX_APPROVAL_EXPIRED 알림       →   ✓ 해소됨 (v0.7에서 제거)

v0.6 (블록체인 확장, COMPLETE)      v0.7 (구현 장애 해소)
──────────────────────              ─────────────────────
IChainAdapter 17 methods       →   +2 nonce methods = 19
5개 TransactionType            →   타입별 HTTP 응답값 확정
MCP 16 tools 완전 스펙         →   ✓ 해소됨 (v0.7에서 제거)
/v1/nonce 통일                 →   ✓ 해소됨 (v0.7에서 제거)
36 endpoints                   →   Rate Limiter/killSwitch 보완
```

---

*작성: 2026-02-06*
*갱신: 2026-02-08 — v0.5/v0.6 완료 반영, 29건→25건 재조정*
*기반 분석: v0.1~v0.6 설계 문서 64건 전수 분석*
*상태: 확정*
